"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../providers/AuthProvider";
import {
  DEFAULT_PAYMENT_METHODS,
  fetchPaymentMethods,
  type PaymentMethodRecord,
} from "@/lib/api/paymentMethods";
import { getApiBase } from "@/lib/api/base";

type PaymentMethodSlug = string;

type SaleReturnItem = {
  sale_item_id: number;
  quantity: number;
};

type SaleReturn = {
  id: number;
  document_number?: string;
  created_at?: string;
  items: SaleReturnItem[];
};

type SaleItem = {
  id: number;
  product_name?: string;
  name?: string;
  quantity: number;
  total?: number;
  unit_price?: number;
  unit_price_original?: number;
  discount?: number;
  line_discount_value?: number;
};

type Sale = {
  id: number;
  sale_number?: number;
  document_number?: string;
  created_at: string;
  total?: number;
  paid_amount?: number;
  cart_discount_value?: number | null;
  cart_discount_percent?: number | null;
  customer_name?: string | null;
  payment_method?: string | null;
  refunded_total?: number | null;
  refunded_balance?: number | null;
  refund_count?: number | null;
  items: SaleItem[];
  returns?: SaleReturn[];
};

function getSaleNetBalance(entry: {
  total?: number;
  refunded_total?: number | null;
  refunded_balance?: number | null;
}): number {
  if (entry.refunded_balance != null) {
    return Math.max(0, entry.refunded_balance);
  }
  const base = entry.total ?? 0;
  const refunded = entry.refunded_total ?? 0;
  return Math.max(0, base - refunded);
}

function normalizeDocument(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function formatMoney(value: number | undefined | null): string {
  if (value == null || Number.isNaN(value)) return "0";
  return value.toLocaleString("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function computeLineBreakdown(item: SaleItem) {
  const quantity = item.quantity ?? 1;
  const unitOriginal =
    item.unit_price_original ??
    item.unit_price ??
    null;
  const netFromApi =
    item.total != null ? item.total : null;
  const discountFromApi =
    item.line_discount_value ??
    item.discount ??
    null;

  let unitGross = unitOriginal ?? 0;
  if (unitGross === 0 && netFromApi != null && quantity > 0) {
    unitGross = netFromApi / quantity;
  }
  if (
    unitGross === 0 &&
    discountFromApi != null &&
    netFromApi != null &&
    quantity > 0
  ) {
    unitGross = (netFromApi + discountFromApi) / quantity;
  }

  const subtotal = unitGross * quantity;
  const discount =
    discountFromApi != null
      ? discountFromApi
      : netFromApi != null
      ? Math.max(0, subtotal - netFromApi)
      : 0;
  const total =
    netFromApi != null ? netFromApi : Math.max(0, subtotal - discount);

  return {
    subtotal,
    total,
    unitNet: quantity > 0 ? total / quantity : 0,
  };
}

export default function DevolucionesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSaleId = searchParams.get("saleId");
  const backTarget = searchParams.get("back");
  const resolvedBackPath = backTarget
    ? decodeURIComponent(backTarget)
    : "/pos";
  const resolvedBackLabel = backTarget ? "Volver" : "Volver al POS";
  const encodedBackTarget = backTarget
    ? encodeURIComponent(backTarget)
    : null;
  const currentDevolucionesPath = encodedBackTarget
    ? `/pos/devoluciones?back=${encodedBackTarget}`
    : "/pos/devoluciones";

  const [sale, setSale] = useState<Sale | null>(null);
  const [saleError, setSaleError] = useState<string | null>(null);
  const [scanValue, setScanValue] = useState("");
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const scanInputRef = useRef<HTMLInputElement | null>(null);

  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState("");

  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethodSlug>("cash");
  const [paymentAmount, setPaymentAmount] = useState("0");
  const [paymentTouched, setPaymentTouched] = useState(false);
  const [paymentCatalog, setPaymentCatalog] = useState<PaymentMethodRecord[]>(
    DEFAULT_PAYMENT_METHODS
  );
  const apiBase = useMemo(() => getApiBase(), []);
  const SALES_API = useMemo(() => `${apiBase}/pos/sales`, [apiBase]);
  const RETURNS_API = useMemo(() => `${apiBase}/pos/returns`, [apiBase]);
  const activePaymentMethods = useMemo(
    () =>
      [...paymentCatalog]
        .filter((m) => m.is_active)
        .sort(
          (a, b) =>
            a.order_index - b.order_index || a.name.localeCompare(b.name)
        ),
    [paymentCatalog]
  );

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(
    null
  );

  const { token } = useAuth();
  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : null),
    [token]
  );

  useEffect(() => {
    let active = true;
    async function loadMethods() {
      if (!token) return;
      try {
        const data = await fetchPaymentMethods(token);
        if (!active) return;
        if (data.length) {
          setPaymentCatalog(data);
        }
      } catch (err) {
        console.warn("No se pudieron cargar los métodos de pago", err);
      }
    }
    void loadMethods();
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!activePaymentMethods.length) return;
    const exists = activePaymentMethods.some(
      (m) => m.slug === paymentMethod
    );
    if (!exists) {
      setPaymentMethod(activePaymentMethods[0].slug);
    }
  }, [activePaymentMethods, paymentMethod]);


  const alreadyReturnedMap = useMemo(() => {
    const map = new Map<number, number>();
    if (!sale?.returns) return map;
    for (const ret of sale.returns) {
      if (!ret.items) continue;
      for (const item of ret.items) {
        map.set(
          item.sale_item_id,
          (map.get(item.sale_item_id) ?? 0) + item.quantity
        );
      }
    }
    return map;
  }, [sale]);

  const lineData = useMemo(() => {
    if (!sale) return [];
    return sale.items.map((item) => {
      const breakdown = computeLineBreakdown(item);
      return {
        item,
        subtotal: breakdown.subtotal,
        total: breakdown.total,
        unitNet: breakdown.unitNet,
      };
    });
  }, [sale]);

  const saleNetAfterLine = useMemo(() => {
    return lineData.reduce((sum, line) => sum + line.total, 0);
  }, [lineData]);

  const selectedNet = useMemo(() => {
    if (!sale) return 0;
    return lineData.reduce((sum, line) => {
      const id = line.item.id;
      if (!id) return sum;
      const qty =
        Number(
          (quantities[id] ?? "0").replace(/[^\d.]/g, "")
        ) || 0;
      if (!qty) return sum;
      const returned = alreadyReturnedMap.get(id) ?? 0;
      const available = Math.max(
        0,
        (line.item.quantity ?? 0) - returned
      );
      const finalQty = Math.min(qty, available);
      return sum + line.unitNet * finalQty;
    }, 0);
  }, [sale, lineData, quantities, alreadyReturnedMap]);

  const cartDiscountValue = sale?.cart_discount_value ?? 0;
  const estimatedCartShare =
    saleNetAfterLine > 0
      ? (selectedNet / saleNetAfterLine) * cartDiscountValue
      : 0;
  const refundEstimate = Math.max(0, selectedNet - estimatedCartShare);

  const fetchSaleById = useCallback(
    async (id: string) => {
      if (!authHeaders) throw new Error("Sesión expirada.");
      const res = await fetch(`${SALES_API}/${id}`, {
        headers: authHeaders,
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Venta no encontrada.");
      }
      return (await res.json()) as Sale;
    },
    [authHeaders, SALES_API]
  );

  const findSaleByIdentifier = useCallback(async (identifier: string) => {
    const value = identifier.trim();
    if (!value) return null;

    const digitsOnly = value.replace(/[^\d]/g, "");
    const normalizedDoc = normalizeDocument(value);

    if (normalizedDoc.startsWith("DV")) {
      throw new Error(
        "Ese código corresponde a una devolución, selecciona un ticket de venta."
      );
    }

    if (!authHeaders) throw new Error("Sesión expirada.");
    const res = await fetch(`${SALES_API}?skip=0&limit=400`, {
      headers: authHeaders,
      credentials: "include",
    });
    if (!res.ok) {
      throw new Error("No se pudieron consultar las ventas.");
    }
    const list: Sale[] = await res.json();

    const saleFromList =
      list.find((s) => {
        const saleDocNormalized = normalizeDocument(s.document_number ?? "");
        if (saleDocNormalized && normalizedDoc && saleDocNormalized === normalizedDoc) {
          return true;
        }
        if (digitsOnly && `${s.sale_number ?? ""}` === digitsOnly) {
          return true;
        }
        return false;
      }) ?? null;

    if (saleFromList) {
      return saleFromList;
    }

    if (digitsOnly) {
      try {
        const saleById = await fetchSaleById(digitsOnly);
        return saleById;
      } catch (err) {
        console.warn("No se encontró la venta por ID directo", err);
      }
    }

    return null;
  }, [SALES_API, authHeaders, fetchSaleById]);

  const resetFormState = useCallback(() => {
    setQuantities({});
    setNotes("");
    setPaymentAmount("0");
    setPaymentTouched(false);
    setSuccessMessage(null);
    setSubmitError(null);
  }, []);

  const clearSelection = useCallback(() => {
    setSale(null);
    resetFormState();
  }, [resetFormState]);

  const applyLoadedSale = useCallback(
    (loadedSale: Sale) => {
      if (getSaleNetBalance(loadedSale) <= 0) {
        setSaleError(
          "Esta venta ya fue devuelta por completo y no tiene saldo disponible."
        );
        return false;
      }
      setSaleError(null);
      resetFormState();
      setSale(loadedSale);
      return true;
    },
    [resetFormState]
  );

  const handleLoadSale = useCallback(
    async (identifier: string, fallbackSale?: Sale) => {
      if (!authHeaders) {
        setSaleError("Sesión expirada, inicia sesión nuevamente.");
        return;
      }
      const value = identifier.trim();
      if (!value) return;

      setSaleError(null);

      try {
        const loadedSale = await fetchSaleById(value);
        applyLoadedSale(loadedSale);
      } catch (err) {
        console.error(err);
        if (fallbackSale) {
          console.warn("Usando datos locales para la venta", fallbackSale.id);
          applyLoadedSale(fallbackSale);
        } else {
          setSaleError(
            err instanceof Error ? err.message : "Error al cargar la venta."
          );
        }
      }
    },
    [applyLoadedSale, authHeaders, fetchSaleById]
  );

  const handleScanSubmit = useCallback(
    async (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const value = scanValue.trim();
      if (!value) {
        setScanError("Ingresa un número de venta o documento.");
        return;
      }

      setScanLoading(true);
      setScanError(null);

      try {
        const foundSale = await findSaleByIdentifier(value);
        if (!foundSale?.id) {
          setScanError("No encontramos un ticket con ese dato.");
          return;
        }
        if (getSaleNetBalance(foundSale) <= 0) {
          setScanError("Ese ticket ya fue devuelto por completo.");
          return;
        }
        await handleLoadSale(
          foundSale.id.toString(),
          foundSale
        );
        setScanValue("");
      } catch (err) {
        console.error(err);
        setScanError(
          err instanceof Error
            ? err.message
            : "No se pudo localizar la venta."
        );
      } finally {
        setScanLoading(false);
      }
    },
    [scanValue, findSaleByIdentifier, handleLoadSale]
  );

  useEffect(() => {
    if (!authHeaders) {
      setSaleError("Debes iniciar sesión para cargar una venta.");
      return;
    }
    if (initialSaleId) {
      void handleLoadSale(initialSaleId);
    } else {
      clearSelection();
      setSaleError(
        "Selecciona una venta desde el historial para registrar la devolución."
      );
    }
  }, [initialSaleId, handleLoadSale, clearSelection, authHeaders]);

  useEffect(() => {
    if (scanLoading) return;
    if (scanInputRef.current) {
      scanInputRef.current.focus();
      scanInputRef.current.select();
    }
  }, [scanLoading]);

  useEffect(() => {
    if (!paymentTouched) {
      setPaymentAmount(
        refundEstimate > 0
          ? Math.round(refundEstimate).toString()
          : "0"
      );
    }
  }, [refundEstimate, paymentTouched]);


  const handleQuantityChange = (id: number, value: string) => {
    if (!sale) return;
    const numericValue = value.replace(/[^\d.]/g, "");
    setQuantities((prev) => ({ ...prev, [id]: numericValue }));
  };

  const getReturnedQty = (itemId: number) => {
    return alreadyReturnedMap.get(itemId) ?? 0;
  };

  const getAvailableQty = (item: SaleItem) => {
    const returned = getReturnedQty(item.id);
    return Math.max(0, (item.quantity ?? 0) - returned);
  };

  const selectedItemsCount = useMemo(() => {
    if (!sale) return 0;
    return sale.items.reduce((count, item) => {
      const qty =
        Number(
          (quantities[item.id] ?? "0").replace(/[^\d.]/g, "")
        ) || 0;
      return qty > 0 ? count + 1 : count;
    }, 0);
  }, [sale, quantities]);

  const canSubmit =
    !!sale &&
    selectedItemsCount > 0 &&
    !submitting &&
    Number(paymentAmount) > 0;

  const handleSubmit = async () => {
    if (!sale) return;
    setSubmitting(true);
    setSubmitError(null);
    setSuccessMessage(null);

    try {
      const itemsPayload = sale.items
        .map((item) => {
          if (!item.id) return null;
          const qty =
            Number(
              (quantities[item.id] ?? "0").replace(/[^\d.]/g, "")
            ) || 0;
          if (!qty) return null;
          return {
            sale_item_id: item.id,
            quantity: qty,
            reason: notes || undefined,
          };
        })
        .filter(Boolean);

      if (!itemsPayload.length) {
        setSubmitError("Selecciona al menos un producto a devolver.");
        setSubmitting(false);
        return;
      }

      const payload = {
        sale_id: sale.id,
        items: itemsPayload,
        payments: [
          {
            method: paymentMethod,
            amount: Number(paymentAmount),
          },
        ],
        notes: notes || undefined,
      };

      if (!authHeaders) throw new Error("Sesión expirada.");
      const res = await fetch(RETURNS_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const detail =
          data && data.detail
            ? Array.isArray(data.detail)
              ? data.detail
                  .map((d: { msg?: string } | string) =>
                    typeof d === "string" ? d : d.msg ?? ""
                  )
                  .filter(Boolean)
                  .join(", ")
              : String(data.detail)
            : `Error ${res.status}`;
        throw new Error(detail);
      }

      const createdReturn = await res.json();
      setSuccessMessage(
        `Devolución registrada correctamente (doc. ${createdReturn.document_number ?? createdReturn.id}).`
      );
      setQuantities({});
      setNotes("");
      setPaymentTouched(false);
      setPaymentAmount("0");
      try {
        const updatedSale = await fetchSaleById(sale.id.toString());
        if (getSaleNetBalance(updatedSale) <= 0) {
          clearSelection();
        } else {
          setSale(updatedSale);
        }
      } catch (err) {
        console.warn("No se pudo recargar la venta tras la devolución", err);
        clearSelection();
      }
    } catch (err) {
      console.error(err);
      setSubmitError(
        err instanceof Error ? err.message : "Error al registrar la devolución."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      <header className="h-14 flex items-center justify-between bg-slate-900 border-b border-slate-800 px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(resolvedBackPath)}
            className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 rounded flex items-center gap-1"
          >
            ← {resolvedBackLabel}
          </button>
          <h1 className="text-lg font-semibold">Registrar devolución</h1>
        </div>
        <div className="text-xs text-slate-400">
          POS 1 · KENSAR ELECTRONIC
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-4">
            <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
              <h2 className="text-sm font-semibold text-slate-100">
                ¿Cómo registrar una devolución?
              </h2>
              <p className="text-sm text-slate-400">
                Usa el historial de ventas para seleccionar el ticket. Al pulsar el botón
                “Devolución” llegarás a esta página con la venta lista para procesar.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const params = new URLSearchParams();
                    params.set("returnTo", "/pos/devoluciones");
                    params.set("back", currentDevolucionesPath);
                    params.set("origin", resolvedBackPath);
                    router.push(`/pos/historial?${params.toString()}`);
                  }}
                  className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-sm"
                >
                  Abrir historial
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const params = new URLSearchParams();
                    params.set("back", currentDevolucionesPath);
                    router.push(`/pos/documentos?${params.toString()}`);
                  }}
                  className="px-4 py-2 rounded border border-slate-600 text-sm text-slate-200 hover:bg-slate-800"
                >
                  Ver documentos
                </button>
              </div>
              <div className="space-y-2 pt-1">
                <p className="text-xs text-slate-400">
                  ¿Tienes el ticket a la mano? Escanéalo (o escribe su número/documento) para cargarlo al instante.
                </p>
                <form
                  onSubmit={(event) => void handleScanSubmit(event)}
                  className="flex flex-col sm:flex-row gap-2"
                >
                  <input
                    type="text"
                    value={scanValue}
                    onChange={(e) => setScanValue(e.target.value)}
                    placeholder="Ej: V-000021 o 24"
                    className="flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    ref={scanInputRef}
                  />
                  <button
                    type="submit"
                    disabled={scanLoading}
                    className="px-4 py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {scanLoading ? "Buscando..." : "Cargar ticket"}
                  </button>
                </form>
                {scanError && (
                  <p className="text-xs text-red-400">{scanError}</p>
                )}
              </div>
              {saleError && (
                <p className="text-xs text-red-400">{saleError}</p>
              )}
            </section>
            <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300 space-y-2">
              <h3 className="text-sm font-semibold text-slate-100">
                Venta actual
              </h3>
              {sale ? (
                <>
                  <p>
                    Has seleccionado la venta{" "}
                    <span className="font-mono text-slate-50">
                      #{sale.sale_number ?? sale.id}
                    </span>
                    .
                  </p>
                  <p>
                    Si necesitas trabajar con otra venta, vuelve al historial,
                    elige el ticket y regresa.
                  </p>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-[11px] text-slate-400 hover:text-slate-200 underline"
                  >
                    Limpiar selección
                  </button>
                </>
              ) : (
                <p>
                  No hay ninguna venta cargada. Abre el historial y selecciona un
                  ticket para comenzar la devolución.
                </p>
              )}
            </section>
          </div>

          <div className="space-y-4">
            {!sale && (
              <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 p-6 text-center text-sm text-slate-400">
                Selecciona una venta para configurar la devolución.
              </div>
            )}

            {sale && (
              <>
            <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2">
              <div className="flex flex-col sm:flex-row sm:justify-between text-xs">
                <div className="space-y-1">
                  <div>
                    <span className="text-slate-400">Venta:</span>{" "}
                    <span className="font-mono text-slate-100">
                      #{sale.sale_number ?? sale.id}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Documento:</span>{" "}
                    <span className="text-slate-100">
                      {sale.document_number ?? "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Fecha:</span>{" "}
                    <span className="text-slate-100">
                      {new Date(sale.created_at).toLocaleString("es-CO")}
                    </span>
                  </div>
                </div>
                <div className="space-y-1 mt-3 sm:mt-0">
                  <div>
                    <span className="text-slate-400">Pagado:</span>{" "}
                    <span className="text-slate-100 font-semibold">
                      {formatMoney(sale.paid_amount ?? sale.total)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Descuento carrito:</span>{" "}
                    <span className="text-slate-100">
                      {sale.cart_discount_value
                        ? `-${formatMoney(sale.cart_discount_value)}`
                        : "0"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Saldo disponible:</span>{" "}
                    <span className="text-emerald-300 font-semibold">
                      {formatMoney(getSaleNetBalance(sale))}
                    </span>
                  </div>
                </div>
                <div className="text-right mt-3 sm:mt-0">
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-[11px] text-slate-400 hover:text-slate-200 underline"
                  >
                    Quitar selección
                  </button>
                </div>
              </div>

              {sale.returns && sale.returns.length > 0 && (
                <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] text-amber-200">
                  Esta venta ya tiene {sale.returns.length} devolución(es) registradas. El sistema limitará las cantidades disponibles automáticamente.
                </div>
              )}
            </section>

            <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <h3 className="text-sm font-semibold mb-3">
                Selecciona productos a devolver
              </h3>
              <div className="rounded border border-slate-800 overflow-hidden text-xs">
                <div className="grid grid-cols-[1fr_70px_80px_80px_100px] bg-slate-950 px-3 py-2 text-[11px] text-slate-400">
                  <span>Producto</span>
                  <span className="text-right">Vend.</span>
                  <span className="text-right">Devuelto</span>
                  <span className="text-right">Disponible</span>
                  <span className="text-right">Devolver</span>
                </div>
                <div>
                  {sale.items.map((item) => {
                    const available = getAvailableQty(item);
                    return (
                      <div
                        key={item.id}
                        className="grid grid-cols-[1fr_70px_80px_80px_100px] px-3 py-2 border-t border-slate-800/50 text-xs"
                      >
                        <span className="text-slate-100 truncate">
                          {item.product_name ?? item.name ?? "Producto"}
                        </span>
                        <span className="text-right text-slate-200">
                          {item.quantity}
                        </span>
                        <span className="text-right text-slate-400">
                          {getReturnedQty(item.id)}
                        </span>
                        <span className="text-right text-emerald-300">
                          {available}
                        </span>
                        <input
                          type="number"
                          min="0"
                          max={available}
                          value={quantities[item.id] ?? ""}
                          onChange={(e) =>
                            handleQuantityChange(item.id, e.target.value)
                          }
                          className="w-24 text-right rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-50 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                          disabled={available === 0}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
              <h3 className="text-sm font-semibold">
                Resumen y reembolso
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="rounded border border-slate-800/60 p-3">
                  <div className="text-slate-400">Subtotal seleccionado</div>
                  <div className="text-lg font-semibold text-slate-50">
                    {formatMoney(Math.round(selectedNet))}
                  </div>
                </div>
                <div className="rounded border border-slate-800/60 p-3">
                  <div className="text-slate-400">
                    Prorrateo descuento carrito
                  </div>
                  <div className="text-lg font-semibold text-slate-50">
                    {estimatedCartShare > 0
                      ? `-${formatMoney(Math.round(estimatedCartShare))}`
                      : "0"}
                  </div>
                </div>
                <div className="rounded border border-slate-800/60 p-3">
                  <div className="text-slate-400">Total estimado a devolver</div>
                  <div className="text-lg font-semibold text-emerald-400">
                    {formatMoney(Math.round(refundEstimate))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="space-y-2">
                  <label className="text-slate-400 block text-xs">
                    Motivo / notas (opcional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-50 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    placeholder="Ej: Producto defectuoso"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-slate-400 block text-xs">
                    Método de reembolso
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-50 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      {activePaymentMethods.length === 0 && (
                        <option value="cash">Efectivo</option>
                      )}
                      {activePaymentMethods.map((method) => (
                        <option key={method.id} value={method.slug}>
                          {method.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={paymentAmount}
                      min={0}
                      onChange={(e) => {
                        setPaymentTouched(true);
                        setPaymentAmount(e.target.value);
                      }}
                      className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-right text-slate-50 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {submitError && (
                <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/40 rounded px-3 py-2">
                  {submitError}
                </div>
              )}

              {successMessage && (
                <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/40 rounded px-3 py-2">
                  {successMessage}
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={clearSelection}
                  className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 text-sm"
                >
                  Limpiar
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="px-4 py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? "Registrando..." : "Registrar devolución"}
                </button>
              </div>
            </section>
          </>
        )}
          </div>
        </div>
      </div>
    </main>
  );
}

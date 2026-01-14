"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../providers/AuthProvider";
import { renderReturnTicket } from "@/lib/printing/saleTicket";
import { fetchPosSettings, PosSettingsPayload } from "@/lib/api/settings";
import {
  DEFAULT_PAYMENT_METHODS,
  fetchPaymentMethods,
  type PaymentMethodRecord,
} from "@/lib/api/paymentMethods";
import { getApiBase } from "@/lib/api/base";
import {
  ensureStoredPosMode,
  fetchPosStationPrinterConfig,
  getPosStationAccess,
  getWebPosStation,
  subscribeToPosStationChanges,
  type PosAccessMode,
  type PosStationAccess,
  type PosStationPrinterConfig,
} from "@/lib/api/posStations";
import { formatBogotaDate } from "@/lib/time/bogota";

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

type ReturnItemDetail = {
  product_name: string;
  product_sku?: string | null;
  quantity: number;
  unit_price_net: number;
  total_refund: number;
};

type ReturnPaymentDetail = {
  method: string;
  amount: number;
};

type SaleReturnDetail = {
  id: number;
  document_number?: string;
  original_document_number?: string | null;
  created_at?: string;
  total_refund: number;
  created_by?: string | null;
  pos_name?: string | null;
  seller_name?: string | null;
  notes?: string | null;
  items: ReturnItemDetail[];
  payments: ReturnPaymentDetail[];
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
  pos_name?: string | null;
  vendor_name?: string | null;
  is_separated?: boolean;
  initial_payment_amount?: number | null;
  balance?: number | null;
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
  const [returnSuccess, setReturnSuccess] = useState<SaleReturnDetail | null>(
    null
  );
  const [posSettings, setPosSettings] = useState<PosSettingsPayload | null>(
    null
  );
  const [stationInfo, setStationInfo] = useState<PosStationAccess | null>(null);
  const [posMode, setPosMode] = useState<PosAccessMode | null>(null);
  const [printerConfig, setPrinterConfig] = useState<PosStationPrinterConfig>({
    mode: "qz-tray",
    printerName: "",
    width: "80mm",
    autoOpenDrawer: false,
    showDrawerButton: true,
  });

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
    let active = true;
    async function loadSettings() {
      if (!token) return;
      try {
        const settings = await fetchPosSettings(token);
        if (!active) return;
        setPosSettings(settings);
      } catch (err) {
        console.warn("No se pudieron cargar ajustes del POS", err);
      }
    }
    void loadSettings();
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mode = ensureStoredPosMode();
    setPosMode(mode);
  }, []);

  useEffect(() => {
    if (!posMode) return;
    if (posMode === "web") {
      setStationInfo(getWebPosStation());
      return;
    }
    const syncStation = () => {
      setStationInfo(getPosStationAccess());
    };
    syncStation();
    const unsubscribe = subscribeToPosStationChanges(syncStation);
    return () => {
      unsubscribe();
    };
  }, [posMode]);

  const isStationMode = posMode === "station";
  const activeStationId = isStationMode ? stationInfo?.id ?? null : null;
  const printerStorageKey = useMemo(
    () => `kensar_pos_printer_${activeStationId ?? "pos-web"}`,
    [activeStationId]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const fallbackKey = "kensar_pos_printer_pos-web";
      const raw = window.localStorage.getItem(printerStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        setPrinterConfig((prev) => ({ ...prev, ...parsed }));
        return;
      }
      if (printerStorageKey !== fallbackKey) {
        const fallbackRaw = window.localStorage.getItem(fallbackKey);
        if (fallbackRaw) {
          const parsed = JSON.parse(fallbackRaw);
          setPrinterConfig((prev) => ({ ...prev, ...parsed }));
          window.localStorage.setItem(printerStorageKey, fallbackRaw);
        }
      }
    } catch (err) {
      console.warn("No se pudo cargar la configuración de impresora", err);
    }
  }, [printerStorageKey]);

  useEffect(() => {
    if (!token) return;
    if (!isStationMode || !activeStationId) return;
    let cancelled = false;
    const loadRemote = async () => {
      try {
        const remote = await fetchPosStationPrinterConfig(
          apiBase,
          token,
          activeStationId
        );
        if (!remote || cancelled) return;
        setPrinterConfig((prev) => {
          const next = { ...prev, ...remote };
          if (typeof window !== "undefined") {
            try {
              window.localStorage.setItem(
                printerStorageKey,
                JSON.stringify(next)
              );
            } catch (err) {
              console.warn(
                "No se pudo guardar la configuración de impresora",
                err
              );
            }
          }
          return next;
        });
      } catch (err) {
        console.warn("No se pudo cargar la impresora guardada", err);
      }
    };
    loadRemote();
    return () => {
      cancelled = true;
    };
  }, [token, apiBase, activeStationId, isStationMode, printerStorageKey]);

  type QzPromiseResolver<T> = (value: T | PromiseLike<T>) => void;
  type QzPromiseReject = (reason?: unknown) => void;
  type QzType = {
    websocket: { isActive: () => boolean; connect: () => Promise<void> };
    printers: { find: () => Promise<string[]> };
    configs: { create: (printer: string, options?: Record<string, unknown>) => unknown };
    print: (config: unknown, data: unknown) => Promise<void>;
    security?: {
      setCertificatePromise: (
        promise: (resolve: QzPromiseResolver<string>, reject: QzPromiseReject) => void
      ) => void;
      setSignaturePromise: (
        promise: (
          toSign: string
        ) => (resolve: QzPromiseResolver<string>, reject: QzPromiseReject) => void
      ) => void;
    };
  };
  const [qzClient, setQzClient] = useState<QzType | null>(() => {
    if (typeof window !== "undefined") {
      const w = window as unknown as { qz?: QzType };
      return w.qz ?? null;
    }
    return null;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const setIfPresent = () => {
      if (cancelled) return;
      const w = window as unknown as { qz?: QzType };
      if (w.qz) setQzClient(w.qz);
    };
    const w = window as unknown as { qz?: QzType };
    if (w.qz) {
      setIfPresent();
      return () => {
        cancelled = true;
      };
    }
    const existing = document.querySelector(
      'script[data-qz-tray]'
    ) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");
    if (!existing) {
      script.src = "https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.js";
      script.async = true;
      script.dataset.qzTray = "1";
      script.onerror = () =>
        console.warn("No se pudo cargar el script de QZ Tray desde la CDN.");
      document.head.appendChild(script);
    }
    script.addEventListener("load", setIfPresent);
    return () => {
      cancelled = true;
      script.removeEventListener("load", setIfPresent);
    };
  }, []);
  const qzSecurityConfiguredRef = useRef(false);
  const configureQzSecurity = useCallback(() => {
    if (!qzClient?.security) return true;
    if (!token) return false;
    if (qzSecurityConfiguredRef.current) return true;
    const authHeaders = {
      Authorization: `Bearer ${token}`,
    };
    qzClient.security.setCertificatePromise(
      (resolve: QzPromiseResolver<string>, reject: QzPromiseReject) => {
        fetch(`${apiBase}/pos/qz/cert`, { credentials: "include" })
          .then(async (res) => {
            if (!res.ok) {
              throw new Error(
                `No se pudo obtener el certificado (Error ${res.status}).`
              );
            }
            return res.text();
          })
          .then(resolve)
          .catch(reject);
      }
    );
    qzClient.security.setSignaturePromise(
      (toSign: string) =>
        (resolve: QzPromiseResolver<string>, reject: QzPromiseReject) => {
          fetch(`${apiBase}/pos/qz/sign`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...authHeaders,
            },
            credentials: "include",
            body: JSON.stringify({ data: toSign }),
          })
            .then(async (res) => {
              if (!res.ok) {
                const detail = await res.json().catch(() => null);
                throw new Error(
                  detail?.detail ??
                    `No se pudo firmar el reto (Error ${res.status}).`
                );
              }
              const data = (await res.json()) as { signature?: string };
              if (!data?.signature) {
                throw new Error("La API no devolvió la firma.");
              }
              return data.signature;
            })
            .then(resolve)
            .catch(reject);
        }
    );
    qzSecurityConfiguredRef.current = true;
    return true;
  }, [apiBase, qzClient, token]);
  useEffect(() => {
    configureQzSecurity();
  }, [configureQzSecurity]);

  useEffect(() => {
    if (!activePaymentMethods.length) return;
    const exists = activePaymentMethods.some(
      (m) => m.slug === paymentMethod
    );
    if (!exists) {
      setPaymentMethod(activePaymentMethods[0].slug);
    }
  }, [activePaymentMethods, paymentMethod]);

  const paymentLabels = useMemo(() => {
    return new Map(paymentCatalog.map((method) => [method.slug, method.name]));
  }, [paymentCatalog]);

  const resolvePaymentLabel = useCallback(
    (method: string) => paymentLabels.get(method) ?? method,
    [paymentLabels]
  );

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
  const paidTotal = useMemo(() => {
    if (!sale) return 0;
    if (sale.is_separated) {
      if (sale.total != null && sale.balance != null) {
        return Math.max(0, sale.total - sale.balance);
      }
      return Math.max(0, sale.initial_payment_amount ?? sale.paid_amount ?? 0);
    }
    return Math.max(0, sale.paid_amount ?? sale.total ?? 0);
  }, [sale]);
  const paidRemaining = useMemo(() => {
    if (!sale) return 0;
    const refunded = sale.refunded_total ?? 0;
    return Math.max(0, paidTotal - refunded);
  }, [paidTotal, sale]);
  const cappedRefund = useMemo(() => {
    if (!sale?.is_separated) return refundEstimate;
    return Math.min(refundEstimate, paidRemaining);
  }, [refundEstimate, paidRemaining, sale]);

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
        cappedRefund > 0
          ? Math.round(cappedRefund).toString()
          : "0"
      );
    }
  }, [cappedRefund, paymentTouched]);

  useEffect(() => {
    if (!sale?.is_separated) return;
    if (!paymentTouched) return;
    const numericValue = Number(paymentAmount);
    if (Number.isNaN(numericValue)) return;
    if (paidRemaining > 0 && numericValue > paidRemaining) {
      setPaymentAmount(Math.round(paidRemaining).toString());
    }
  }, [paidRemaining, paymentAmount, paymentTouched, sale]);


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
    Number(paymentAmount) > 0 &&
    (!sale.is_separated || paidRemaining > 0);

  const handleSubmit = async () => {
    if (!sale) return;
    setSubmitting(true);
    setSubmitError(null);

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

      const paymentValue = sale.is_separated
        ? Math.min(Number(paymentAmount), cappedRefund)
        : Number(paymentAmount);
      const payload = {
        sale_id: sale.id,
        items: itemsPayload,
        payments: [
          {
            method: paymentMethod,
            amount: paymentValue,
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

      const createdReturn = (await res.json()) as SaleReturnDetail;
      setReturnSuccess({
        id: createdReturn.id,
        document_number: createdReturn.document_number,
        original_document_number: sale.document_number ?? null,
        created_at: createdReturn.created_at,
        total_refund: createdReturn.total_refund ?? refundEstimate,
        created_by: createdReturn.created_by ?? sale.vendor_name ?? null,
        pos_name: sale.pos_name ?? null,
        seller_name: sale.vendor_name ?? createdReturn.created_by ?? null,
        notes: createdReturn.notes ?? notes ?? null,
        items: createdReturn.items ?? [],
        payments: createdReturn.payments ?? [],
      });
      setQuantities({});
      setNotes("");
      setPaymentTouched(false);
      setPaymentAmount("0");
      try {
        const updatedSale = await fetchSaleById(sale.id.toString());
        setSale(updatedSale);
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

  const handlePrintReturnTicket = useCallback(async () => {
    if (!returnSuccess) return;
    const items = returnSuccess.items.map((item) => ({
      name: item.product_name,
      quantity: item.quantity,
      unitPrice: item.unit_price_net,
      total: item.total_refund,
      sku: item.product_sku ?? undefined,
    }));
    const payments = (returnSuccess.payments ?? []).map((payment) => ({
      label: resolvePaymentLabel(payment.method),
      amount: payment.amount,
    }));
    const html = renderReturnTicket({
      settings: posSettings,
      documentNumber:
        returnSuccess.document_number ??
        `DV-${returnSuccess.id.toString().padStart(6, "0")}`,
      originalDocumentNumber: returnSuccess.original_document_number,
      createdAt: returnSuccess.created_at,
      posName: returnSuccess.pos_name ?? undefined,
      sellerName:
        returnSuccess.seller_name ??
        returnSuccess.created_by ??
        undefined,
      items,
      payments,
      totalRefund: returnSuccess.total_refund,
      notes: returnSuccess.notes,
    });

    const printTicketWithQz = async () => {
      if (printerConfig.mode !== "qz-tray") return false;
      if (!printerConfig.printerName.trim()) return false;
      if (!qzClient) return false;
      try {
        configureQzSecurity();
        if (!qzClient.websocket.isActive()) {
          await qzClient.websocket.connect();
        }
        const sizeWidth = printerConfig.width === "58mm" ? 58 : 80;
        const cfg = qzClient.configs.create(printerConfig.printerName, {
          altPrinting: true,
          units: "mm",
          size: { width: sizeWidth },
          margins: { top: 0, right: 0, bottom: 0, left: 0 },
        });
        await qzClient.print(cfg, [
          { type: "html", format: "plain", data: html },
        ]);
        return true;
      } catch (err) {
        console.error("No se pudo imprimir devolución con QZ Tray", err);
        return false;
      }
    };

    const printedWithQz = await printTicketWithQz();
    if (printedWithQz) return;

    const win = window.open("", "_blank", "width=380,height=640");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    const triggerPrint = () => {
      try {
        win.focus();
        win.print();
      } catch (err) {
        console.error("No se pudo imprimir el ticket de devolución", err);
      } finally {
        win.close();
      }
    };
    if (win.document.readyState === "complete") {
      triggerPrint();
    } else {
      win.onload = triggerPrint;
    }
  }, [
    configureQzSecurity,
    posSettings,
    printerConfig.mode,
    printerConfig.printerName,
    printerConfig.width,
    qzClient,
    resolvePaymentLabel,
    returnSuccess,
  ]);

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

      <div className="flex-1 overflow-hidden p-5">
        <div className="grid h-full grid-rows-[1fr_auto] gap-4">
          <div className="grid min-h-0 gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
            <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-widest text-slate-400">
                    Paso 1
                  </p>
                  <h2 className="text-lg font-semibold text-slate-100">
                    Selecciona la venta
                  </h2>
                </div>
                {sale && (
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-xs text-slate-300 hover:text-slate-100 underline"
                  >
                    Cambiar venta
                  </button>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const params = new URLSearchParams();
                    params.set("returnTo", "/pos/devoluciones");
                    params.set("back", currentDevolucionesPath);
                    params.set("origin", resolvedBackPath);
                    router.push(`/pos/historial?${params.toString()}`);
                  }}
                  className="flex-1 h-12 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-semibold"
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
                  className="flex-1 h-12 rounded-lg border border-slate-600 text-sm text-slate-200 hover:bg-slate-800"
                >
                  Ver documentos
                </button>
              </div>

              <form
                onSubmit={(event) => void handleScanSubmit(event)}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={scanValue}
                  onChange={(e) => setScanValue(e.target.value)}
                  placeholder="Escanea o escribe: V-000021"
                  className="flex-1 h-12 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  ref={scanInputRef}
                />
                <button
                  type="submit"
                  disabled={scanLoading}
                  className="h-12 px-5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {scanLoading ? "Buscando..." : "Cargar"}
                </button>
              </form>
              {(scanError || saleError) && (
                <p className="text-xs text-red-400">{scanError ?? saleError}</p>
              )}

              <div className="rounded-xl border border-slate-800/60 bg-slate-950/30 p-4 text-sm text-slate-200 space-y-2">
                <div className="text-xs uppercase tracking-wide text-slate-400">
                  Venta seleccionada
                </div>
                {sale ? (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Venta</span>
                      <span className="font-mono text-slate-100">
                        #{sale.sale_number ?? sale.id}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Documento</span>
                      <span className="text-slate-100">
                        {sale.document_number ?? "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Fecha</span>
                      <span className="text-slate-100">
                        {formatBogotaDate(sale.created_at, {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Pagado</span>
                      <span className="text-slate-100 font-semibold">
                        {formatMoney(sale.paid_amount ?? sale.total)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Saldo disponible</span>
                      <span className="text-emerald-300 font-semibold">
                        {formatMoney(getSaleNetBalance(sale))}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-400 text-sm">
                    Selecciona un ticket para comenzar la devolución.
                  </p>
                )}
              </div>
              {sale?.returns?.length ? (
                <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  Esta venta ya tiene {sale.returns.length} devolución(es). El sistema
                  ajustará cantidades automáticamente.
                </div>
              ) : null}
            </section>

            {!sale ? (
              <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-6 text-center text-sm text-slate-400 flex items-center justify-center">
                Selecciona una venta para configurar la devolución.
              </div>
            ) : (
              <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 flex flex-col gap-4 min-h-0">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-slate-400">
                      Paso 2
                    </p>
                    <h3 className="text-base font-semibold text-slate-100">
                      Selecciona productos a devolver
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-xs text-slate-300 hover:text-slate-100 underline"
                  >
                    Quitar selección
                  </button>
                </div>

                <div className="rounded-xl border border-slate-800/70 bg-slate-950/30 flex-1 min-h-0">
                  <div className="grid grid-cols-[minmax(0,3fr)_120px_120px_160px_260px] gap-x-6 px-6 py-4 text-[13px] text-slate-400 uppercase tracking-wide">
                    <span>Producto</span>
                    <span className="text-center">Vend.</span>
                    <span className="text-center">Devuelto</span>
                    <span className="text-center">Disponible</span>
                    <span className="text-right">Devolver</span>
                  </div>
                  <div className="h-full max-h-[420px] overflow-auto">
                    {sale.items.map((item) => {
                      const available = getAvailableQty(item);
                      const currentQty = Number(
                        (quantities[item.id] ?? "0").replace(/[^\d.]/g, "")
                      ) || 0;
                      const nextQty = Math.min(available, currentQty + 1);
                      const prevQty = Math.max(0, currentQty - 1);
                      return (
                        <div
                          key={item.id}
                          className="grid grid-cols-[minmax(0,3fr)_120px_120px_160px_260px] gap-x-6 items-center px-6 py-5 border-t border-slate-800/50 text-lg"
                        >
                          <span className="text-slate-100 truncate font-semibold">
                            {item.product_name ?? item.name ?? "Producto"}
                          </span>
                          <span className="text-center text-slate-200 font-semibold">
                            {item.quantity}
                          </span>
                          <span className="text-center text-slate-300 font-semibold">
                            {getReturnedQty(item.id)}
                          </span>
                          <span className="text-center text-emerald-300 font-semibold">
                            {available}
                          </span>
                          {available <= 1 ? (
                            <button
                              type="button"
                              onClick={() =>
                                handleQuantityChange(
                                  item.id,
                                  currentQty === 1 ? "0" : "1"
                                )
                              }
                              disabled={available === 0}
                              className={`h-12 justify-self-end rounded-xl border px-6 text-base font-semibold ${
                                currentQty === 1
                                  ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                                  : "border-slate-700 bg-slate-950 text-slate-200"
                              } disabled:opacity-50`}
                            >
                              {currentQty === 1 ? "✓ Devolver" : "Devolver"}
                            </button>
                          ) : (
                            <div className="h-12 justify-self-end grid grid-cols-[52px_1fr_52px] items-center rounded-xl border border-slate-700 bg-slate-950 text-slate-100">
                              <button
                                type="button"
                                onClick={() =>
                                  handleQuantityChange(
                                    item.id,
                                    prevQty.toString()
                                  )
                                }
                                className="h-full text-2xl font-semibold hover:bg-slate-800"
                              >
                                −
                              </button>
                              <div className="text-center text-xl font-semibold">
                                {currentQty}
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  handleQuantityChange(
                                    item.id,
                                    nextQty.toString()
                                  )
                                }
                                className="h-full text-2xl font-semibold hover:bg-slate-800"
                              >
                                +
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}
          </div>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-slate-400">
                  Paso 3
                </p>
                <h3 className="text-base font-semibold text-slate-100">
                  Resumen y reembolso
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className="rounded-xl border border-slate-800/70 bg-slate-950/30 p-3">
                <div className="text-slate-400 text-xs">Subtotal seleccionado</div>
                <div className="text-lg font-semibold text-slate-50">
                  {formatMoney(Math.round(selectedNet))}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800/70 bg-slate-950/30 p-3">
                <div className="text-slate-400 text-xs">
                  Prorrateo descuento carrito
                </div>
                <div className="text-lg font-semibold text-slate-50">
                  {estimatedCartShare > 0
                    ? `-${formatMoney(Math.round(estimatedCartShare))}`
                    : "0"}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800/70 bg-slate-950/30 p-3">
                <div className="text-slate-400 text-xs">Total a devolver</div>
                <div className="text-lg font-semibold text-emerald-400">
                  {formatMoney(
                    Math.round(sale?.is_separated ? cappedRefund : refundEstimate)
                  )}
                </div>
              </div>
            </div>

            {sale?.is_separated && (
              <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                Reembolso disponible por abonos:{" "}
                <span className="font-semibold">
                  {formatMoney(Math.round(paidRemaining))}
                </span>
                {refundEstimate > paidRemaining && paidRemaining > 0 && (
                  <>. El reembolso se ajustará a lo pagado y el saldo pendiente se anulará.</>
                )}
                {paidRemaining <= 0 && <>. Esta venta no tiene abonos para reembolsar.</>}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_1fr] gap-3 text-sm">
              <div className="space-y-2">
                <label className="text-slate-400 block text-xs">
                  Motivo / notas (opcional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Ej: Producto defectuoso"
                />
              </div>
              <div className="space-y-2">
                <label className="text-slate-400 block text-xs">
                  Método de reembolso
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
              </div>
              <div className="space-y-2">
                <label className="text-slate-400 block text-xs">Monto</label>
                <input
                  type="number"
                  value={paymentAmount}
                  min={0}
                  onChange={(e) => {
                    setPaymentTouched(true);
                    setPaymentAmount(e.target.value);
                  }}
                  className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-right text-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {submitError && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/40 rounded px-3 py-2">
                {submitError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={clearSelection}
                className="h-12 px-5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-sm font-semibold"
              >
                Limpiar
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="h-12 px-6 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Registrando..." : "Registrar devolución"}
              </button>
            </div>
          </section>
        </div>
      </div>
      {returnSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4 py-6">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-900 p-8 shadow-2xl">
            <div className="text-lg text-emerald-300 font-semibold mb-4">
              Devolución registrada correctamente
            </div>
            <div className="grid gap-2 text-base text-slate-300 sm:grid-cols-2">
              <div>
                Documento:{" "}
                <span className="text-slate-100 font-mono text-lg">
                  {returnSuccess.document_number ??
                    `DV-${returnSuccess.id.toString().padStart(6, "0")}`}
                </span>
              </div>
              {returnSuccess.original_document_number && (
                <div>
                  Venta original:{" "}
                  <span className="text-slate-100 text-lg">
                    {returnSuccess.original_document_number}
                  </span>
                </div>
              )}
              <div className="sm:col-span-2">
                Total devuelto:{" "}
                <span className="text-emerald-200 font-semibold text-lg">
                  -{formatMoney(Math.round(returnSuccess.total_refund))}
                </span>
              </div>
            </div>
            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={handlePrintReturnTicket}
                className="px-6 py-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-base font-semibold"
              >
                Imprimir ticket de devolución
              </button>
              <button
                type="button"
                onClick={() => {
                  setReturnSuccess(null);
                  clearSelection();
                }}
                className="px-6 py-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-base font-semibold"
              >
                Registrar nueva devolución
              </button>
              <button
                type="button"
                onClick={() => {
                  setReturnSuccess(null);
                  router.push(resolvedBackPath);
                }}
                className="px-6 py-4 rounded-xl border border-slate-600 text-slate-200 text-base font-semibold hover:bg-slate-800"
              >
                Volver al POS
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

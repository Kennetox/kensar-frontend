"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/providers/AuthProvider";
import { POS_DISPLAY_NAME } from "@/app/pos/poscontext";
import { usePaymentMethodsCatalog } from "@/app/hooks/usePaymentMethodsCatalog";
import {
  fetchSeparatedOrders,
  registerSeparatedOrderPayment,
  type SeparatedOrder,
} from "@/lib/api/separatedOrders";
import { getApiBase } from "@/lib/api/base";
import {
  renderSaleTicket,
  buildSaleTicketCustomer,
} from "@/lib/printing/saleTicket";
import { fetchPosSettings, type PosSettingsPayload } from "@/lib/api/settings";
import {
  getPosStationAccess,
  formatPosDisplayName,
  type PosStationAccess,
  ensureStoredPosMode,
  getWebPosStation,
  subscribeToPosStationChanges,
  type PosAccessMode,
} from "@/lib/api/posStations";

const BLOCKED_PAYMENT_SLUGS = new Set(["separado", "credito"]);

const moneyFormatter = new Intl.NumberFormat("es-CO", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short",
});
const dateOnlyFormatter = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
});

const STATUS_LABELS: Record<string, string> = {
  reservado: "Reservado",
  pagado: "Pagado",
  cancelado: "Cancelado",
};

type SaleDetailItem = {
  product_name?: string | null;
  name?: string | null;
  quantity: number;
  unit_price?: number;
  total?: number;
  line_discount_value?: number;
};

type SaleDetail = {
  id: number;
  sale_number?: number | null;
  document_number?: string | null;
  total?: number;
  cart_discount_value?: number | null;
  cart_discount_percent?: number | null;
  notes?: string | null;
  items: SaleDetailItem[];
  payments?: { method: string; amount: number }[];
};

function formatMoney(value: number | null | undefined): string {
  if (!value) return "0";
  return moneyFormatter.format(value);
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return dateFormatter.format(date);
}

function formatDateOnly(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return dateOnlyFormatter.format(date);
}

export default function AbonosPage() {
  const { token, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const ticketParam = searchParams.get("ticket");
  const paymentCatalog = usePaymentMethodsCatalog();
  const allowedPaymentMethods = useMemo(
    () =>
      paymentCatalog
        .filter((method) => method.is_active)
        .filter((method) => !BLOCKED_PAYMENT_SLUGS.has(method.slug)),
    [paymentCatalog]
  );
  const paymentLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    paymentCatalog.forEach((method) => {
      map.set(method.slug.toLowerCase(), method.name);
    });
    return map;
  }, [paymentCatalog]);
  const getMethodLabel = useCallback(
    (slug?: string | null) => {
      if (!slug) return "—";
      return paymentLabelMap.get(slug.toLowerCase()) ?? slug;
    },
    [paymentLabelMap]
  );

  const [scanValue, setScanValue] = useState("");
  const [result, setResult] = useState<SeparatedOrder | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [saleDetail, setSaleDetail] = useState<SaleDetail | null>(null);

  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [posSettings, setPosSettings] = useState<PosSettingsPayload | null>(null);
  const [canPrintTicket, setCanPrintTicket] = useState(false);
  const [stationInfo, setStationInfo] = useState<PosStationAccess | null>(null);
  const [posMode, setPosMode] = useState<PosAccessMode | null>(null);
  const resolvedPosName = useMemo(
    () => formatPosDisplayName(stationInfo, POS_DISPLAY_NAME),
    [stationInfo]
  );

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
  const activeStationId = stationInfo?.id ?? null;

  useEffect(() => {
    setSelectedMethod((prev) => {
      if (!prev) return null;
      const stillValid = allowedPaymentMethods.some(
        (method) => method.slug === prev
      );
      return stillValid ? prev : null;
    });
  }, [allowedPaymentMethods]);

  useEffect(() => {
    if (!result) {
      setAmount("");
      setReference("");
      setNote("");
      setCanPrintTicket(false);
      return;
    }
    const remaining = Math.max(result.balance, 0);
    setAmount(remaining ? String(Math.round(remaining)) : "");
    setSubmitSuccess(null);
    setSubmitError(null);
  }, [result]);

  useEffect(() => {
    if (!token) {
      setPosSettings(null);
      return;
    }
    let active = true;
    async function loadSettings() {
      try {
        const data = await fetchPosSettings(token);
        if (!active) return;
        setPosSettings(data);
      } catch (err) {
        console.warn("No se pudo cargar la configuración del POS", err);
      }
    }
    void loadSettings();
    return () => {
      active = false;
    };
  }, [token]);

  const fetchSaleDetailById = useCallback(
    async (saleId: number) => {
      if (!token) throw new Error("Sesión expirada.");
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/pos/sales/${saleId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("No se pudo cargar la venta asociada.");
      }
      const data = (await res.json()) as SaleDetail;
      data.items = data.items ?? [];
      return data;
    },
    [token]
  );

  useEffect(() => {
    const saleId = result?.sale_id ?? null;
    if (!token || saleId == null) {
      setSaleDetail(null);
      return;
    }
    const ensuredSaleId: number = saleId;
    let active = true;
    async function load() {
      try {
        const detail = await fetchSaleDetailById(ensuredSaleId);
        if (active) {
          setSaleDetail(detail);
        }
      } catch (err) {
        console.error("No pudimos cargar la venta asociada al separado", err);
        if (active) setSaleDetail(null);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [token, result?.sale_id, fetchSaleDetailById]);

  const lookupSeparated = useCallback(
    async (rawValue: string) => {
      const trimmed = rawValue.trim();
      if (!trimmed) return;
      if (!token) {
        setLookupError("Inicia sesión para consultar separadas.");
        return;
      }
      setCanPrintTicket(false);
      setSearching(true);
      setLookupError(null);
      setResult(null);
      setSaleDetail(null);
      try {
        const numericCandidate = trimmed.replace(/[^\d]/g, "");
        const params: Parameters<typeof fetchSeparatedOrders>[0] = {
          limit: 5,
        };
        if (numericCandidate) {
          params.saleNumber = Number(numericCandidate);
        }
        if (trimmed && /\D/.test(trimmed)) {
          params.barcode = trimmed;
        } else if (!numericCandidate) {
          params.barcode = trimmed;
        }
        const orders = await fetchSeparatedOrders(params, token);
        if (!orders.length) {
          setLookupError("No se encontró un separado con ese código.");
          return;
        }
        setResult(orders[0]);
        setCanPrintTicket(false);
      } catch (err) {
        console.error("No pudimos cargar el separado", err);
        setLookupError(
          err instanceof Error
            ? err.message
            : "No pudimos cargar el separado. Intenta nuevamente."
        );
      } finally {
        setSearching(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (ticketParam && ticketParam !== scanValue) {
      setScanValue(ticketParam);
      void lookupSeparated(ticketParam);
    }
  }, [ticketParam, lookupSeparated, scanValue]);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!scanValue.trim()) return;
    await lookupSeparated(scanValue);
  }

  async function handleRegisterPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!result || !token) return;
    if (!selectedMethod) {
      setSubmitError("Por favor elige un método de pago antes de registrar el abono.");
      return;
    }
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setSubmitError("Ingresa un monto válido");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);
    try {
      const payload: {
        method: string;
        amount: number;
        reference?: string;
        note?: string;
        station_id?: string;
      } = {
        method: selectedMethod,
        amount: Math.round(value),
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
      };
      if (activeStationId) {
        payload.station_id = activeStationId;
      }
      const updated = await registerSeparatedOrderPayment(
        result.id,
        payload,
        token
      );
      setResult(updated);
      setCanPrintTicket(true);
      setSelectedMethod(null);
      try {
        if (updated.sale_id) {
          const detail = await fetchSaleDetailById(updated.sale_id);
          setSaleDetail(detail);
        }
      } catch (err) {
        console.warn("No pudimos actualizar la venta vinculada", err);
      }
      setSubmitSuccess("Abono registrado correctamente.");
      setReference("");
      setNote("");
    } catch (err) {
      console.error("No pudimos registrar el abono", err);
      setSubmitError(
        err instanceof Error
          ? err.message
          : "No pudimos registrar el abono. Intenta nuevamente."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const paidPercent = useMemo(() => {
    if (!result || !result.total_amount) return 0;
    const paid = Math.max(
      0,
      result.total_amount - Math.max(result.balance, 0)
    );
    return Math.round((paid / result.total_amount) * 100);
  }, [result]);

  const balancePercent = useMemo(() => {
    if (!result || !result.total_amount) return 0;
    return Math.min(
      100,
      Math.max(0, Math.round((result.balance / result.total_amount) * 100))
    );
  }, [result]);

  const dueDateLabel = useMemo(() => {
    if (!result) return "Sin definir";
    if (result.due_date) return formatDateOnly(result.due_date);
    const created = result.created_at ? new Date(result.created_at) : null;
    if (created && !Number.isNaN(created.getTime())) {
      created.setMonth(created.getMonth() + 3);
      return formatDateOnly(created.toISOString());
    }
    return "Sin definir";
  }, [result]);

  const registrationDisabled =
    !result ||
    result.status === "cancelado" ||
    !selectedMethod ||
    submitting ||
    Number(amount) <= 0;

  function formatAmountInput(value: string): string {
    if (!value) return "";
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return "";
    return numberValue.toLocaleString("es-CO");
  }

  function handleAmountChange(rawValue: string) {
    const normalized = rawValue.replace(/[^\d]/g, "");
    setAmount(normalized);
  }

  function openTicketWindow(html: string) {
    const win = window.open("", "_blank", "width=420,height=640");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    const trigger = () => {
      try {
        win.focus();
        win.print();
      } catch (err) {
        console.error("No se pudo imprimir el ticket", err);
      } finally {
        win.close();
      }
    };
    if (win.document.readyState === "complete") {
      trigger();
    } else {
      win.onload = trigger;
    }
  }

  function buildTicketHtml(order: SeparatedOrder): string | null {
    if (!saleDetail) return null;
    const computedItems = (saleDetail.items ?? []).map((item) => {
      const quantity = item.quantity || 1;
      const unitNet =
        item.unit_price != null
          ? item.unit_price
          : item.total != null
          ? item.total / quantity
          : 0;
      const lineDiscount = item.line_discount_value ?? 0;
      const total =
        item.total != null ? item.total : Math.max(0, unitNet * quantity - lineDiscount);
      return {
        name: item.product_name ?? item.name ?? "Producto",
        quantity,
        unitPrice: unitNet,
        total,
      };
    });
    const subtotal = computedItems.reduce(
      (sum, entry) => sum + entry.unitPrice * entry.quantity,
      0
    );
    const lineDiscountTotal = computedItems.reduce(
      (sum, entry) => sum + Math.max(0, entry.unitPrice * entry.quantity - entry.total),
      0
    );
    const cartLabel =
      saleDetail.cart_discount_value && saleDetail.cart_discount_value > 0
        ? "Descuento carrito (valor)"
        : saleDetail.cart_discount_percent && saleDetail.cart_discount_percent > 0
        ? "Descuento carrito (%)"
        : "Descuento carrito";
    const cartValueDisplay =
      saleDetail.cart_discount_value && saleDetail.cart_discount_value > 0
        ? `-${formatMoney(saleDetail.cart_discount_value)}`
        : saleDetail.cart_discount_percent && saleDetail.cart_discount_percent > 0
        ? `-${saleDetail.cart_discount_percent}%`
        : "0";
    const totalPaid = Math.max(
      0,
      order.total_amount - Math.max(order.balance ?? 0, 0)
    );
    const paymentsSummary = [
      {
        label: "Pagado a la fecha",
        amount: totalPaid,
      },
    ];
    const initialMethodLabel = getMethodLabel(
      saleDetail?.payments?.[0]?.method ?? result?.payments?.[0]?.method ?? ""
    );
    const separatedPayments = [
      {
        label: "Abono inicial",
        amount: order.initial_payment,
        paidAt: order.created_at,
        method: initialMethodLabel,
      },
      ...order.payments.map((payment, idx) => ({
        label: `Abono ${idx + 2}`,
        amount: payment.amount,
        paidAt: payment.paid_at,
        method: getMethodLabel(payment.method),
      })),
    ];
    return renderSaleTicket({
      documentNumber:
        order.sale_document_number ??
        `V-${String(order.sale_number ?? order.sale_id).padStart(6, "0")}`,
      saleNumber: order.sale_number ?? order.sale_id,
      date: new Date(),
      subtotal,
      lineDiscountTotal,
      cartDiscountLabel: cartLabel,
      cartDiscountValueDisplay: cartValueDisplay,
      total: order.total_amount,
      items: computedItems,
      payments: paymentsSummary,
      changeAmount: order.balance > 0 ? -Math.max(order.balance ?? 0, 0) : 0,
      notes: saleDetail.notes ?? order.notes,
      posName: resolvedPosName,
      vendorName: user?.name ?? undefined,
      customer: buildSaleTicketCustomer({
        name: order.customer_name,
        phone: order.customer_phone,
        email: order.customer_email,
      }),
      separatedInfo: {
        dueDate: order.due_date,
        balance: Math.max(order.balance ?? 0, 0),
        payments: separatedPayments,
      },
      settings: posSettings,
    });
  }

  function handlePrintTicket() {
    if (!result) return;
    if (!saleDetail) {
      window.alert(
        "Aún estamos cargando la información de la venta. Intenta imprimir nuevamente en unos segundos."
      );
      return;
    }
    const html = buildTicketHtml(result);
    if (!html) {
      window.alert("No se pudo preparar el ticket para impresión.");
      return;
    }
    openTicketWindow(html);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wide">
            POS · módulo en desarrollo
          </p>
          <h1 className="text-2xl font-semibold">Abono de separados</h1>
        </div>
        <Link
          href="/pos"
          className="px-4 py-2 rounded-full border border-slate-700 text-sm hover:bg-slate-900"
        >
          ← Volver al POS
        </Link>
      </header>

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-1 space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
              <h2 className="text-lg font-semibold">Escanea o ingresa ticket</h2>
              <p className="text-sm text-slate-400">
                Usa el código de barras del ticket para buscar el separado y
                registrar un abono.
              </p>
              <form onSubmit={handleLookup} className="space-y-3">
                <label className="block text-xs text-slate-400">Código</label>
                <input
                  value={scanValue}
                  onChange={(e) => setScanValue(e.target.value)}
                  placeholder="Ej: KSR-0001"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  autoFocus
                />
                <button
                  type="submit"
                  className="w-full rounded-lg bg-emerald-500 py-2 font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                  disabled={searching}
                >
                  {searching ? "Buscando…" : "Buscar separado"}
                </button>
              </form>
              <button
                type="button"
                onClick={() => router.push("/pos/abonos/lista")}
                className="w-full rounded-lg border border-slate-700/70 px-3 py-2 text-sm text-slate-100 hover:bg-slate-900"
              >
                Ver lista de separados activos
              </button>
              {lookupError && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                  {lookupError}
                </p>
              )}
              {!result && (
                <p className="text-xs text-slate-500">
                  Escanea el código impreso en el ticket y mostrará
                  automáticamente el detalle de la separada, su saldo y los
                  abonos registrados.
                </p>
              )}
            </div>
          </section>

          <section className="lg:col-span-2 space-y-5">
            {result ? (
              <>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                  <div className="grid gap-5 lg:grid-cols-[1.2fr,1fr]">
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm text-slate-400">Ticket</p>
                          <p className="text-xl font-semibold">
                            {result.barcode ?? result.sale_document_number}
                          </p>
                          <p className="text-xs text-slate-500">
                            Venta #{result.sale_number ?? result.sale_id}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-slate-400">Estado</p>
                          <p className="text-base font-semibold capitalize">
                            {STATUS_LABELS[result.status] ?? result.status}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handlePrintTicket}
                          disabled={!saleDetail || !canPrintTicket}
                          className="px-4 py-2 text-sm rounded-full border border-slate-700 text-slate-100 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Imprimir ticket
                        </button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-slate-400">Cliente</p>
                          <p className="font-semibold">
                            {result.customer_name ?? "Sin asignar"}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-400">Fecha límite</p>
                          <p className="font-semibold">{dueDateLabel}</p>
                        </div>
                        <div>
                          <p className="text-slate-400">Total</p>
                          <p className="font-semibold">
                            {formatMoney(result.total_amount)}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-400">Saldo pendiente</p>
                          <p className="font-semibold text-emerald-400">
                            {formatMoney(result.balance)}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                        <div className="rounded-xl border border-slate-800 px-4 py-3">
                          <p className="text-xs uppercase text-slate-400 tracking-wide">
                            Pago inicial
                          </p>
                          <p className="text-lg font-semibold">
                            {formatMoney(result.initial_payment)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-800 px-4 py-3">
                          <p className="text-xs uppercase text-slate-400 tracking-wide">
                            Pagado a la fecha
                          </p>
                          <p className="text-lg font-semibold text-emerald-400">
                            {formatMoney(
                              result.total_amount - Math.max(result.balance, 0)
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="pt-2">
                        <div className="flex justify-between text-xs text-slate-400 mb-1">
                          <span>Progreso del pago</span>
                          <span>Saldo {balancePercent}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-800">
                          <div
                            className="h-2 rounded-full bg-emerald-500"
                            style={{ width: `${paidPercent}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-800/40 bg-slate-950/20 p-3 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-200">
                          Productos reservados
                        </h3>
                        <span className="text-[11px] text-slate-500">
                          {saleDetail?.items?.length ?? 0} líneas
                        </span>
                      </div>
                      <div className="max-h-40 overflow-auto divide-y divide-slate-800/50">
                        {saleDetail?.items && saleDetail.items.length > 0 ? (
                          saleDetail.items.map((item, index) => {
                            const quantity = item.quantity || 1;
                            const unit = item.unit_price ?? item.total ?? 0;
                            const total = item.total ?? unit * quantity;
                            const hasDiscount =
                              (item.line_discount_value ?? 0) > 0;
                            return (
                              <div
                                key={`${item.product_name ?? item.name ?? "item"}-${index}`}
                                className="py-2 flex flex-col gap-1"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <p className="font-semibold text-slate-100 truncate">
                                    {item.product_name ?? item.name ?? "Producto"}
                                  </p>
                                  <span className="text-[11px] text-slate-500">
                                    {quantity} x {formatMoney(unit)}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-[11px] text-slate-400">
                                  {hasDiscount ? (
                                    <span>Desc -{formatMoney(item.line_discount_value)}</span>
                                  ) : (
                                    <span>&nbsp;</span>
                                  )}
                                  <span className="text-sm font-semibold text-slate-50">
                                    {formatMoney(total)}
                                  </span>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <p className="text-[11px] text-slate-500">
                            Aún no se cargan los artículos de esta venta.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Historial de abonos</h3>
                    <span className="text-xs text-slate-400">
                      {result.payments.length} movimientos
                    </span>
                  </div>
                  {result.payments.length ? (
                    <div className="divide-y divide-slate-800 rounded-xl border border-slate-800">
                      {result.payments.map((payment) => (
                        <div
                          key={payment.id}
                          className="flex items-center justify-between px-4 py-3 text-sm"
                        >
                          <div>
                            <p className="font-semibold">
                              {getMethodLabel(payment.method)}
                            </p>
                            <p className="text-xs text-slate-400">
                              {formatDateTime(payment.paid_at)}
                            </p>
                            {payment.reference && (
                              <p className="text-xs text-slate-500">
                                Ref: {payment.reference}
                              </p>
                            )}
                          </div>
                          <span className="font-semibold text-emerald-400">
                            {formatMoney(payment.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">
                      Aún no se registran abonos adicionales. Solo figura el
                      pago inicial.
                    </p>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">
                        Registrar nuevo abono
                      </h3>
                      <p className="text-xs text-slate-400">
                        Aceptamos cualquier método salvo Separado o Crédito.
                      </p>
                    </div>
                    {result.balance <= 0 && result.status !== "pagado" && (
                      <span className="text-xs text-amber-300">
                        Este separado debe marcarse como pagado en el backend.
                      </span>
                    )}
                  </div>
                  {result.status === "cancelado" ? (
                    <p className="text-sm text-red-300">
                      Este separado está cancelado, no admite más abonos.
                    </p>
                  ) : (
                    <form className="space-y-4" onSubmit={handleRegisterPayment}>
                      <div className="space-y-2">
                        <p className="text-sm text-slate-400">
                          Selecciona método de pago
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {allowedPaymentMethods.map((method) => {
                            const isSelected = method.slug === selectedMethod;
                            return (
                              <button
                                type="button"
                                key={method.slug}
                                onClick={() => setSelectedMethod(method.slug)}
                                className={`px-3 py-1.5 rounded-full border text-xs transition ${
                                  isSelected
                                    ? "border-emerald-400 bg-emerald-500/10 text-emerald-300"
                                    : "border-slate-700 text-slate-300 hover:border-slate-500"
                                }`}
                              >
                                {method.name}
                              </button>
                            );
                          })}
                        </div>
                        {!selectedMethod && (
                          <p className="text-xs text-amber-300">
                            Debes elegir un método de pago antes de registrar el abono.
                          </p>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className="text-sm text-slate-400 space-y-1">
                          <span>Monto del abono</span>
                          <input
                            value={formatAmountInput(amount)}
                            onChange={(e) => handleAmountChange(e.target.value)}
                            inputMode="numeric"
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-base font-semibold text-slate-100 outline-none focus:border-emerald-500"
                            placeholder="Ej: 20.000"
                          />
                        </label>
                        <label className="text-sm text-slate-400 space-y-1">
                          <span>Referencia (opcional)</span>
                          <input
                            value={reference}
                            onChange={(e) => setReference(e.target.value)}
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-base text-slate-100 outline-none focus:border-emerald-500"
                            placeholder="Transacción, comprobante, etc."
                          />
                        </label>
                      </div>
                      <label className="text-sm text-slate-400 space-y-1 block">
                        <span>Nota (opcional)</span>
                        <textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          rows={3}
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500 resize-none"
                          placeholder="Aclaraciones para el ticket del abono."
                        />
                      </label>
                      <div className="text-xs text-slate-500">
                        Registra cada abono justo después de recibir el pago. El
                        saldo y la lista de movimientos se actualizan al
                        instante.
                      </div>
                      {submitError && (
                        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                          {submitError}
                        </p>
                      )}
                      {submitSuccess && (
                        <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
                          {submitSuccess}
                        </p>
                      )}
                      <button
                        type="submit"
                        disabled={registrationDisabled}
                        className="w-full rounded-lg bg-emerald-500 py-2 font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {submitting ? "Registrando…" : "Registrar abono"}
                      </button>
                    </form>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-10 text-center text-sm text-slate-400">
                Escanea o ingresa un código para visualizar el detalle del
                separado. Aquí verás el historial de abonos y podrás registrar
                pagos adicionales con los métodos permitidos.
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/app/providers/AuthProvider";
import {
  fetchSeparatedOrders,
  assignSeparatedOrderCustomer,
  resolveSeparatedOrder,
  type SeparatedOrder,
  type SeparatedOrderPayment,
  type SeparatedOrderResolutionPayload,
} from "@/lib/api/separatedOrders";
import { fetchPosCustomers, type PosCustomerRead } from "@/lib/api/inventory";
import { hasCustomerAdditionalInformation } from "@/lib/customers/validation";
import {
  buildBogotaDateFromKey,
  formatBogotaDate,
  getBogotaDateKey,
} from "@/lib/time/bogota";

type FilterId =
  | "follow_up"
  | "active"
  | "overdue"
  | "due_soon"
  | "paid"
  | "cancelled"
  | "all";

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: "follow_up", label: "Requieren seguimiento" },
  { id: "active", label: "Activos" },
  { id: "overdue", label: "Vencidos" },
  { id: "due_soon", label: "Por vencer" },
  { id: "paid", label: "Pagados" },
  { id: "cancelled", label: "Cancelados" },
  { id: "all", label: "Todos" },
];

const STATUS_LABELS: Record<string, string> = {
  reservado: "Activo",
  pagado: "Pagado",
  conciliado: "Pagado · conciliado",
  cancelado: "Cancelado",
  incobrable: "Cerrado · incobrable",
  anulado: "Anulado",
};

const moneyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const DAY_MS = 24 * 60 * 60 * 1000;

function formatMoney(value?: number | null) {
  return moneyFormatter.format(Number(value || 0));
}

function formatDate(value?: string | null, includeTime = false) {
  if (!value) return "Sin definir";
  return (
    formatBogotaDate(
      value,
      includeTime
        ? { dateStyle: "medium", timeStyle: "short" }
        : { dateStyle: "medium" }
    ) || "Sin definir"
  );
}

function dueDayDistance(order: SeparatedOrder, todayKey: string) {
  if (!order.due_date) return null;
  const dueKey = getBogotaDateKey(order.due_date);
  const dueDate = buildBogotaDateFromKey(dueKey);
  const today = buildBogotaDateFromKey(todayKey);
  return Math.round((dueDate.getTime() - today.getTime()) / DAY_MS);
}

function isOpenSeparated(order: SeparatedOrder) {
  return order.status === "reservado" && Number(order.balance || 0) > 0.01;
}

function followUpLabel(order: SeparatedOrder, todayKey: string) {
  if (!isOpenSeparated(order)) return null;
  const distance = dueDayDistance(order, todayKey);
  if (distance == null) return null;
  if (distance < 0) {
    const days = Math.abs(distance);
    return `Vencido hace ${days} día${days === 1 ? "" : "s"}`;
  }
  if (distance === 0) return "Vence hoy";
  if (distance <= 3) return `Vence en ${distance} días`;
  return null;
}

function paymentIsActive(payment: SeparatedOrderPayment) {
  return payment.status !== "voided";
}

function paymentMethodLabel(value?: string | null) {
  if (!value) return "Sin método";
  const labels: Record<string, string> = {
    cash: "Efectivo",
    efectivo: "Efectivo",
    card: "Tarjeta",
    tarjeta: "Tarjeta",
    transfer: "Transferencia",
    transferencia: "Transferencia",
    nequi: "Nequi",
    daviplata: "Daviplata",
  };
  return labels[value.toLowerCase()] ?? value;
}

function productSummary(order: SeparatedOrder) {
  const items = order.items ?? [];
  if (items.length === 0) return "Sin productos registrados";
  return items
    .map((item) => {
      const quantity = Number(item.quantity || 0);
      const quantityLabel = quantity === 1 ? "" : ` × ${quantity.toLocaleString("es-CO")}`;
      return `${item.product_name || "Producto"}${quantityLabel}`;
    })
    .join(" • ");
}

function statusClasses(status: string) {
  if (status === "pagado" || status === "conciliado") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (["cancelado", "incobrable", "anulado"].includes(status)) return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-sky-200 bg-sky-50 text-sky-700";
}

export default function SeparatedOrdersManagementPage() {
  const { token } = useAuth();
  const searchParams = useSearchParams();
  const requestedFilter = searchParams.get("filter") as FilterId | null;
  const initialFilter = FILTERS.some((filter) => filter.id === requestedFilter)
    ? (requestedFilter as FilterId)
    : "active";
  const [filter, setFilter] = useState<FilterId>(initialFilter);
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState<SeparatedOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<SeparatedOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const todayKey = getBogotaDateKey();

  const loadOrders = useCallback(
    async (silent = false) => {
      if (!token) return;
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        const records = await fetchSeparatedOrders({ limit: 500 }, token, {
          cache: "no-store",
        });
        setOrders(records);
        setSelectedOrder((current) =>
          current ? records.find((order) => order.id === current.id) ?? null : null
        );
        setError("");
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No fue posible cargar los separados."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token]
  );

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    setFilter(initialFilter);
  }, [initialFilter]);

  useEffect(() => {
    if (!selectedOrder) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedOrder(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedOrder]);

  const summary = useMemo(() => {
    let active = 0;
    let overdue = 0;
    let dueSoon = 0;
    let pendingBalance = 0;
    orders.forEach((order) => {
      if (!isOpenSeparated(order)) return;
      const distance = dueDayDistance(order, todayKey);
      if (distance == null) {
        active += 1;
        pendingBalance += Number(order.balance || 0);
        return;
      }
      if (distance < 0) overdue += 1;
      else {
        active += 1;
        pendingBalance += Number(order.balance || 0);
        if (distance <= 3) dueSoon += 1;
      }
    });
    return { active, overdue, dueSoon, pendingBalance };
  }, [orders, todayKey]);

  const filteredOrders = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return orders.filter((order) => {
      const distance = dueDayDistance(order, todayKey);
      const matchesFilter =
        filter === "all" ||
        (filter === "active" &&
          isOpenSeparated(order) &&
          (distance == null || distance >= 0)) ||
        (filter === "paid" && ["pagado", "conciliado"].includes(order.status)) ||
        (filter === "cancelled" && ["cancelado", "incobrable", "anulado"].includes(order.status)) ||
        (filter === "overdue" && isOpenSeparated(order) && distance != null && distance < 0) ||
        (filter === "due_soon" &&
          isOpenSeparated(order) &&
          distance != null &&
          distance >= 0 &&
          distance <= 3) ||
        (filter === "follow_up" &&
          isOpenSeparated(order) &&
          distance != null &&
          distance <= 3);
      if (!matchesFilter) return false;
      if (!normalizedSearch) return true;
      return [
        order.sale_document_number,
        order.barcode,
        order.customer_name,
        order.customer_phone,
        order.customer_email,
        order.sale_number != null ? String(order.sale_number) : null,
        ...(order.items ?? []).map((item) => item.product_name),
      ].some((value) => value?.toLowerCase().includes(normalizedSearch));
    });
  }, [filter, orders, search, todayKey]);

  return (
    <main className="flex h-full min-h-0 flex-col px-4 py-4 md:px-6">
      <div className="mx-auto flex min-h-0 w-full max-w-[96rem] flex-1 flex-col gap-3">
        <header className="flex shrink-0 flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold ui-text">Gestión de separados</h1>
            <p className="mt-1 text-sm ui-text-muted">
              Consulta saldos, vencimientos e historial de pagos desde un solo lugar.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dashboard/documents"
              className="inline-flex cursor-pointer items-center rounded-lg border ui-border px-4 py-2 text-xs font-semibold ui-text transition hover:bg-slate-100"
            >
              Volver a documentos
            </Link>
            <button
              type="button"
              onClick={() => void loadOrders(true)}
              disabled={refreshing}
              className="cursor-pointer rounded-lg border border-emerald-400/70 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {refreshing ? "Actualizando…" : "Actualizar"}
            </button>
          </div>
        </header>

        <section className="grid shrink-0 grid-cols-2 gap-2 lg:grid-cols-4">
          <SummaryCard label="Separados activos" value={String(summary.active)} />
          <SummaryCard label="Vencidos" value={String(summary.overdue)} tone="danger" />
          <SummaryCard label="Por vencer (3 días)" value={String(summary.dueSoon)} tone="warning" />
          <SummaryCard label="Saldo pendiente activo" value={formatMoney(summary.pendingBalance)} tone="money" />
        </section>

        <section className="dashboard-card shrink-0 rounded-2xl border ui-border p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <label className="flex min-w-0 flex-1 flex-col gap-1.5 lg:max-w-xl">
              <span className="text-xs font-semibold ui-text-muted">Buscar separado</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cliente, teléfono, correo, ticket o código"
                className="h-10 rounded-lg border ui-border bg-white px-3 text-sm ui-text outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setFilter(option.id)}
                  className={`relative cursor-pointer rounded-full border px-3 py-2 text-xs font-semibold transition ${
                    filter === option.id
                      ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                      : "ui-border bg-white ui-text-muted hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  {option.label}
                  {option.id === "follow_up" && summary.overdue + summary.dueSoon > 0 && (
                    <>
                      <span
                        aria-hidden="true"
                        className="force-light-text absolute -right-1.5 -top-2 flex h-5 w-5 animate-bounce items-center justify-center rounded-full border-2 border-white bg-rose-600 text-[11px] font-black leading-none text-white shadow-md"
                      >
                        !
                      </span>
                      <span className="sr-only">
                        Hay {summary.overdue + summary.dueSoon} separados que requieren seguimiento
                      </span>
                    </>
                  )}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="dashboard-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border ui-border shadow-sm">
          <div className="flex shrink-0 items-center justify-between border-b ui-border px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold ui-text">Separados registrados</h2>
              <p className="text-xs ui-text-muted">
                {filteredOrders.length} resultado{filteredOrders.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex h-64 items-center justify-center text-sm ui-text-muted">
              Cargando separados…
            </div>
          ) : error ? (
            <div className="m-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              <p>{error}</p>
              <button
                type="button"
                onClick={() => void loadOrders()}
                className="mt-3 cursor-pointer font-semibold underline"
              >
                Reintentar
              </button>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center px-6 text-center">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-xl text-emerald-700">
                ✓
              </div>
              <p className="font-semibold ui-text">No hay separados en esta vista</p>
              <p className="mt-1 text-sm ui-text-muted">
                Prueba otro filtro o cambia el término de búsqueda.
              </p>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[1120px] table-fixed border-collapse text-left text-[13px]">
                <colgroup>
                  <col className="w-[10%]" />
                  <col className="w-[13%]" />
                  <col className="w-[20%]" />
                  <col className="w-[13%]" />
                  <col className="w-[9%]" />
                  <col className="w-[9%]" />
                  <col className="w-[9%]" />
                  <col className="w-[8%]" />
                  <col className="w-[9%]" />
                </colgroup>
                <thead className="dashboard-table-head sticky top-0 z-10 text-[11px] uppercase tracking-wide ui-text-muted shadow-[0_1px_0_rgba(148,163,184,0.55)]">
                  <tr>
                    <th className="px-3 py-3 font-semibold">Documento</th>
                    <th className="px-3 py-3 font-semibold">Cliente</th>
                    <th className="px-3 py-3 font-semibold">Productos</th>
                    <th className="px-3 py-3 font-semibold">Fecha límite</th>
                    <th className="px-3 py-3 text-right font-semibold">Total</th>
                    <th className="px-3 py-3 text-right font-semibold">Pagado</th>
                    <th className="px-3 py-3 text-right font-semibold">Saldo</th>
                    <th className="px-3 py-3 font-semibold">Estado</th>
                    <th className="px-3 py-3 text-right font-semibold">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order, index) => {
                    const paid = Number(order.recorded_paid_total || 0);
                    const distance = dueDayDistance(order, todayKey);
                    const overdue = isOpenSeparated(order) && distance != null && distance < 0;
                    const followUp = followUpLabel(order, todayKey);
                    const products = productSummary(order);
                    return (
                      <tr
                        key={order.id}
                        onDoubleClick={() => setSelectedOrder(order)}
                        className={`border-t last:border-b ui-border ${
                          index % 2 === 0 ? "dashboard-row-zebra" : "dashboard-row-zebra-alt"
                        }`}
                      >
                        <td className="px-3 py-3">
                          <p className="truncate font-semibold ui-text" title={order.sale_document_number}>{order.sale_document_number}</p>
                          <p className="mt-0.5 text-xs ui-text-muted">
                            Creado {formatDate(order.created_at)}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <p className="truncate font-medium ui-text" title={order.customer_name || "Cliente sin nombre"}>{order.customer_name || "Cliente sin nombre"}</p>
                          <p className="mt-0.5 truncate text-xs ui-text-muted">{order.customer_phone || "Sin teléfono"}</p>
                        </td>
                        <td className="px-3 py-3">
                          <p
                            className="overflow-hidden text-sm font-medium leading-5 ui-text [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]"
                            title={products}
                          >
                            {products}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <p className="ui-text">{formatDate(order.due_date)}</p>
                          {followUp && (
                            <p className={`mt-1 text-xs font-semibold ${
                              dueDayDistance(order, todayKey)! < 0 ? "text-rose-600" : "text-amber-600"
                            }`}>
                              {followUp}
                            </p>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-medium ui-text">
                          {formatMoney(order.total_amount)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-semibold text-emerald-700">
                          {formatMoney(paid)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-semibold text-rose-700">
                          {formatMoney(order.balance)}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${overdue ? "border-rose-200 bg-rose-50 text-rose-700" : statusClasses(order.status)}`}>
                            {overdue ? "Vencido" : STATUS_LABELS[order.status] ?? order.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedOrder(order)}
                            className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-emerald-400 hover:text-emerald-700"
                          >
                            Ver detalle
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {selectedOrder && (
        <SeparatedOrderDetail
          order={selectedOrder}
          todayKey={todayKey}
          token={token}
          onClose={() => setSelectedOrder(null)}
          onUpdated={(updated) => {
            setOrders((current) => current.map((order) => order.id === updated.id ? updated : order));
            setSelectedOrder(updated);
          }}
        />
      )}
    </main>
  );
}

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "danger" | "warning" | "money";
}) {
  const valueClass =
    tone === "danger"
      ? "text-rose-700"
      : tone === "warning"
      ? "text-amber-700"
      : tone === "money"
      ? "text-emerald-700"
      : "ui-text";
  return (
    <article className="dashboard-card flex min-h-14 items-center justify-between gap-3 rounded-xl border ui-border px-3.5 py-2.5 shadow-sm">
      <p className="text-[11px] font-semibold ui-text-muted">{label}</p>
      <p className={`shrink-0 text-lg font-bold ${valueClass}`}>{value}</p>
    </article>
  );
}

type ResolutionMode = "reconcile" | "reschedule" | "cancel" | "refund_pending";
const RESOLUTION_CONTROL_CLASS = "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

function resolutionTypeLabel(value?: string | null) {
  const labels: Record<string, string> = {
    external_reconciliation: "Pago conciliado externamente",
    rescheduled: "Vencimiento reprogramado",
    cancel_refunded: "Cancelación con devolución total",
    cancel_partial_refund: "Cancelación con devolución parcial",
    cancel_no_refund: "Cancelación sin devolución",
  };
  return value ? labels[value] ?? value : "Sin resolución";
}

function resolutionActionLabel(value: string) {
  const labels: Record<string, string> = {
    reconcile: "Conciliación externa",
    reschedule: "Fecha reprogramada",
    cancel: "Separado cancelado",
    refund_pending: "Devolución pendiente pagada",
    pos_return: "Devolución total desde POS",
    pos_partial_return: "Devolución parcial desde POS",
    overdue_payment_acknowledged: "Abono vencido autorizado",
    customer_assigned: "Cliente asignado al separado",
  };
  return labels[value] ?? "Resolución administrativa";
}

function SeparatedResolutionModal({
  order,
  mode,
  token,
  onClose,
  onResolved,
}: {
  order: SeparatedOrder;
  mode: ResolutionMode;
  token?: string | null;
  onClose: () => void;
  onResolved: (order: SeparatedOrder) => void;
}) {
  const [action, setAction] = useState<ResolutionMode>(mode);
  const [amount, setAmount] = useState(
    String(Math.round(mode === "refund_pending" ? Number(order.pending_refund_amount || 0) : Number(order.balance || 0)))
  );
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [cancellationOutcome, setCancellationOutcome] = useState<"cancelled" | "uncollectible" | "voided_error">("cancelled");
  const [refundAmount, setRefundAmount] = useState("0");
  const [refundMethod, setRefundMethod] = useState("cash");
  const [remainderDisposition, setRemainderDisposition] = useState<"retained" | "credit" | "pending_refund">("retained");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);

  const availablePaid = Number(order.net_paid_total || 0);
  const numericRefund = Math.max(0, Math.min(Number(refundAmount || 0), availablePaid));
  const remainingPaid = Math.max(0, availablePaid - numericRefund);

  const selectAction = (next: ResolutionMode) => {
    setAction(next);
    setError("");
    if (next === "reconcile") setAmount(String(Math.round(Number(order.balance || 0))));
    if (next === "refund_pending") setAmount(String(Math.round(Number(order.pending_refund_amount || 0))));
  };

  const submit = async () => {
    const payload: SeparatedOrderResolutionPayload = { action };
    if (action === "reconcile") {
      payload.amount = Number(amount);
      payload.reference = reference.trim();
      payload.reason = reason.trim() || "Pago registrado en otro documento";
      payload.notes = notes.trim() || undefined;
    } else if (action === "reschedule") {
      payload.due_date = dueDate ? `${dueDate}T23:59:59-05:00` : undefined;
      payload.reason = reason.trim() || "Vencimiento reprogramado";
      payload.notes = notes.trim() || undefined;
    } else if (action === "cancel") {
      payload.cancellation_outcome = cancellationOutcome;
      payload.reason = reason.trim();
      payload.reference = reference.trim() || undefined;
      payload.notes = notes.trim() || undefined;
      payload.refund_amount = numericRefund;
      payload.refund_method = numericRefund > 0 ? refundMethod : undefined;
      payload.remainder_disposition = remainderDisposition;
    } else {
      payload.amount = Number(amount);
      payload.refund_method = refundMethod;
      payload.reason = reason.trim() || "Pago de devolución pendiente";
      payload.notes = notes.trim() || undefined;
    }

    setSubmitting(true);
    setError("");
    try {
      const updated = await resolveSeparatedOrder(order.id, payload, token);
      onResolved(updated);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No fue posible resolver el separado.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10030] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm md:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="resolve-separated-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <section className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-indigo-600">Resolución administrativa</p>
            <h2 id="resolve-separated-title" className="mt-1 text-xl font-bold text-slate-950">
              Resolver {order.sale_document_number}
            </h2>
            <p className="mt-1 text-sm text-slate-500">Cada acción quedará registrada sin crear ingresos ficticios.</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-100"
              aria-expanded={guideOpen}
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full border border-indigo-400 text-[10px] font-black">?</span>
              Guía rápida
            </button>
            <button type="button" onClick={onClose} disabled={submitting} className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-slate-200 text-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50" aria-label="Cerrar resolución">×</button>
          </div>
        </header>

        <div className="min-h-0 overflow-y-auto bg-slate-50/70 p-5">
          {mode !== "refund_pending" && (
            <div className="grid gap-2 sm:grid-cols-3">
              {([
                ["reconcile", "Conciliar pago"],
                ["reschedule", "Reprogramar"],
                ["cancel", "Cancelar"],
              ] as Array<[ResolutionMode, string]>).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => selectAction(value)}
                  className={`cursor-pointer rounded-xl border px-3 py-3 text-sm font-semibold transition ${action === value ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            {action === "reconcile" && (
              <div className="space-y-4">
                <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-sm text-indigo-900">
                  El valor conciliado reduce el saldo operativo, pero no suma caja ni ventas nuevamente.
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Valor conciliado">
                    <input type="number" min="1" max={order.balance} value={amount} onChange={(event) => setAmount(event.target.value)} className={RESOLUTION_CONTROL_CLASS} />
                  </FormField>
                  <FormField label="Documento donde quedó pagado">
                    <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Ej. V-007642 o comprobante" className={RESOLUTION_CONTROL_CLASS} />
                  </FormField>
                </div>
              </div>
            )}

            {action === "reschedule" && (
              <div className="space-y-4">
                <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-900">
                  El separado seguirá activo y volverá a alertar según la nueva fecha.
                </div>
                <FormField label="Nueva fecha límite">
                  <input type="date" min={getBogotaDateKey()} value={dueDate} onChange={(event) => setDueDate(event.target.value)} className={RESOLUTION_CONTROL_CLASS} />
                </FormField>
              </div>
            )}

            {action === "cancel" && (
              <div className="space-y-4">
                <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
                  <MiniValue label="Abonado disponible" value={formatMoney(availablePaid)} />
                  <MiniValue label="A devolver" value={formatMoney(numericRefund)} tone="negative" />
                  <MiniValue label="Resto del abono" value={formatMoney(remainingPaid)} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Resultado de la cancelación">
                    <select value={cancellationOutcome} onChange={(event) => setCancellationOutcome(event.target.value as typeof cancellationOutcome)} className={RESOLUTION_CONTROL_CLASS}>
                      <option value="cancelled">Cliente desistió / no aplica</option>
                      <option value="uncollectible">Cerrado como incobrable</option>
                      <option value="voided_error">Duplicado o error de registro</option>
                    </select>
                  </FormField>
                  <FormField label="Valor que se devolverá ahora">
                    <input type="number" min="0" max={availablePaid} value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} className={RESOLUTION_CONTROL_CLASS} />
                  </FormField>
                  {numericRefund > 0 && (
                    <FormField label="Método de devolución">
                      <PaymentMethodSelect value={refundMethod} onChange={setRefundMethod} />
                    </FormField>
                  )}
                  {remainingPaid > 0.01 && (
                    <FormField label="Destino del dinero no devuelto">
                      <select value={remainderDisposition} onChange={(event) => setRemainderDisposition(event.target.value as typeof remainderDisposition)} className={RESOLUTION_CONTROL_CLASS}>
                        <option value="retained">Abono retenido</option>
                        <option value="credit">Saldo a favor registrado</option>
                        <option value="pending_refund">Devolución pendiente</option>
                      </select>
                    </FormField>
                  )}
                </div>
                <div className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-900">
                  Se cerrará el saldo pendiente y se liberará el inventario reservado. Solo el valor indicado como devolución generará salida financiera.
                </div>
              </div>
            )}

            {action === "refund_pending" && (
              <div className="space-y-4">
                <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-900">
                  Pendiente por devolver: <strong>{formatMoney(order.pending_refund_amount)}</strong>. Esta acción sí registrará una salida financiera.
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Valor a devolver">
                    <input type="number" min="1" max={order.pending_refund_amount} value={amount} onChange={(event) => setAmount(event.target.value)} className={RESOLUTION_CONTROL_CLASS} />
                  </FormField>
                  <FormField label="Método de devolución">
                    <PaymentMethodSelect value={refundMethod} onChange={setRefundMethod} />
                  </FormField>
                </div>
              </div>
            )}

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {(action === "cancel" || action === "reschedule" || action === "refund_pending") && (
                <FormField label={action === "cancel" ? "Motivo obligatorio" : "Motivo"}>
                  <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Describe por qué se realiza" className={RESOLUTION_CONTROL_CLASS} />
                </FormField>
              )}
              {action === "cancel" && (
                <FormField label="Referencia opcional">
                  <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Documento o soporte" className={RESOLUTION_CONTROL_CLASS} />
                </FormField>
              )}
              <div className={action === "reconcile" ? "sm:col-span-2" : "sm:col-span-2"}>
                <FormField label="Observaciones">
                  <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="Información adicional para auditoría" className={`${RESOLUTION_CONTROL_CLASS} h-auto resize-none py-2`} />
                </FormField>
              </div>
            </div>
          </div>

          {error && <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4">
          <button type="button" onClick={onClose} disabled={submitting} className="cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">Volver</button>
          <button type="button" onClick={() => void submit()} disabled={submitting} className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${action === "cancel" ? "bg-rose-600 hover:bg-rose-700" : action === "reschedule" ? "bg-amber-500 hover:bg-amber-600" : "bg-indigo-600 hover:bg-indigo-700"}`}>
            {submitting ? "Procesando…" : action === "reconcile" ? "Confirmar conciliación" : action === "reschedule" ? "Reprogramar" : action === "cancel" ? "Confirmar cancelación" : "Registrar devolución"}
          </button>
        </footer>
      </section>
      {guideOpen && <SeparatedResolutionGuide onClose={() => setGuideOpen(false)} />}
    </div>
  );
}

function SeparatedResolutionGuide({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[10040] flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm md:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="separated-resolution-guide-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 md:px-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-indigo-600">Guía rápida</p>
            <h2 id="separated-resolution-guide-title" className="mt-1 text-xl font-bold text-slate-950">
              ¿Cómo resolver un separado?
            </h2>
            <p className="mt-1 text-sm text-slate-500">Elige según lo que ocurrió realmente, no según el resultado que quieras ocultar.</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-slate-200 text-xl text-slate-500 hover:bg-slate-100" aria-label="Cerrar guía">×</button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 p-4 md:p-6">
          <div className="grid gap-3 md:grid-cols-3">
            <GuideActionCard
              number="1"
              title="Conciliar pago"
              useWhen="El cliente ya pagó, pero el dinero quedó registrado en otra venta, factura o comprobante."
              effect="Reduce el saldo del separado sin volver a sumar ventas ni caja. Puede ser parcial o total y exige una referencia."
              example="Ejemplo: se cobró como venta normal por error."
              tone="indigo"
            />
            <GuideActionCard
              number="2"
              title="Reprogramar"
              useWhen="El acuerdo sigue vigente y el cliente necesita una nueva fecha para completar el pago."
              effect="Solo cambia la fecha límite. El separado permanece activo, conserva su saldo y volverá a generar alertas."
              example="Ejemplo: el cliente pidió una semana adicional."
              tone="amber"
            />
            <GuideActionCard
              number="3"
              title="Cancelar"
              useWhen="El separado dejó de aplicar, no se cobrará o fue creado por equivocación."
              effect="Cierra el saldo, retira las alertas y libera el inventario. Debes indicar qué sucede con el dinero abonado."
              example="Ejemplo: el cliente desistió de la compra."
              tone="rose"
            />
          </div>

          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-950">Si eliges Cancelar</h3>
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Resultado del caso</p>
                <dl className="mt-2 space-y-2 text-sm">
                  <GuideDefinition term="Cliente desistió / no aplica" description="El acuerdo existió, pero ya no continuará." />
                  <GuideDefinition term="Incobrable" description="La deuda era válida, pero se decidió que ya no se recuperará." />
                  <GuideDefinition term="Duplicado o error" description="El separado no debió existir o quedó repetido." />
                </dl>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dinero abonado</p>
                <dl className="mt-2 space-y-2 text-sm">
                  <GuideDefinition term="Devolver ahora" description="Registra una salida real de dinero por el valor indicado." />
                  <GuideDefinition term="Abono retenido" description="El negocio conserva el dinero según el acuerdo aplicable." />
                  <GuideDefinition term="Saldo a favor" description="El dinero queda reconocido para usarlo en otra compra." />
                  <GuideDefinition term="Devolución pendiente" description="El negocio todavía debe entregar ese dinero; luego se registra cuando se pague." />
                </dl>
              </div>
            </div>
          </section>

          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-bold">Cuando aparezca “Registrar devolución pendiente”</p>
            <p className="mt-1">Úsalo únicamente cuando entregues al cliente un dinero que antes quedó marcado como pendiente. Esta acción sí registra la salida financiera real.</p>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
              <p className="font-bold">Regla práctica</p>
              <p className="mt-1">Pagado en otro lugar → <strong>Conciliar</strong>. Pagará después → <strong>Reprogramar</strong>. Ya no aplica → <strong>Cancelar</strong>.</p>
              <p className="mt-2 text-xs text-emerald-800">Si no tienes claro qué ocurrió o qué pasará con el abono, revisa el soporte antes de confirmar.</p>
            </div>
            <button type="button" onClick={onClose} className="force-light-text cursor-pointer rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700">
              Entendido
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function GuideActionCard({
  number,
  title,
  useWhen,
  effect,
  example,
  tone,
}: {
  number: string;
  title: string;
  useWhen: string;
  effect: string;
  example: string;
  tone: "indigo" | "amber" | "rose";
}) {
  const toneClasses = {
    indigo: "border-indigo-200 bg-indigo-50 text-indigo-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
  }[tone];
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-black ${toneClasses}`}>{number}</span>
        <h3 className="font-bold text-slate-950">{title}</h3>
      </div>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Úsalo cuando</p>
      <p className="mt-1 text-sm leading-5 text-slate-700">{useWhen}</p>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Qué ocurre</p>
      <p className="mt-1 text-sm leading-5 text-slate-700">{effect}</p>
      <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs italic text-slate-600">{example}</p>
    </article>
  );
}

function GuideDefinition({ term, description }: { term: string; description: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <dt className="font-semibold text-slate-900">{term}</dt>
      <dd className="mt-0.5 text-xs leading-5 text-slate-600">{description}</dd>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function PaymentMethodSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className={RESOLUTION_CONTROL_CLASS}>
      <option value="cash">Efectivo</option>
      <option value="card">Tarjeta</option>
      <option value="transfer">Transferencia</option>
      <option value="qr">QR</option>
      <option value="nequi">Nequi</option>
      <option value="daviplata">Daviplata</option>
    </select>
  );
}

function MiniValue({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "negative" }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 font-bold ${tone === "negative" ? "text-rose-700" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}

function SeparatedOrderDetail({
  order,
  todayKey,
  token,
  onClose,
  onUpdated,
}: {
  order: SeparatedOrder;
  todayKey: string;
  token?: string | null;
  onClose: () => void;
  onUpdated: (order: SeparatedOrder) => void;
}) {
  const paid = Number(order.recorded_paid_total || 0);
  const reconciled = Number(order.reconciled_amount || 0);
  const followUp = followUpLabel(order, todayKey);
  const overdue = isOpenSeparated(order) && (dueDayDistance(order, todayKey) ?? 0) < 0;
  const initialPayments = order.initial_payments ?? [];
  const laterPayments = order.payments ?? [];
  const selectionCode = order.barcode || order.sale_document_number || String(order.sale_number || order.id);
  const [resolutionMode, setResolutionMode] = useState<ResolutionMode | null>(null);
  const [customerAssignmentOpen, setCustomerAssignmentOpen] = useState(false);

  return (
    <div
      className="fixed inset-0 z-[10010] flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-[2px] md:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="separated-detail-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 md:px-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-emerald-600">
              Detalle del separado
            </p>
            <h2 id="separated-detail-title" className="mt-1 text-xl font-bold text-slate-950">
              {order.sale_document_number}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${overdue ? "border-rose-200 bg-rose-50 text-rose-700" : statusClasses(order.status)}`}>
                {overdue ? "Vencido" : STATUS_LABELS[order.status] ?? order.status}
              </span>
              {followUp && (
                <span className={`text-xs font-semibold ${dueDayDistance(order, todayKey)! < 0 ? "text-rose-600" : "text-amber-600"}`}>
                  {followUp}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={`/dashboard/documents?fromSeparated=1&type=venta&term=${encodeURIComponent(order.sale_document_number)}`}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M7 3h7l4 4v14H7z" strokeLinejoin="round" />
                <path d="M14 3v5h5M10 12h5M10 16h5" strokeLinecap="round" />
              </svg>
              Ver en documentos
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-slate-200 text-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              aria-label="Cerrar detalle"
            >
              ×
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 p-4 md:p-5">
          <section className="grid grid-cols-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-4">
            <FinancialValue label="Valor total" value={formatMoney(order.total_amount)} />
            <FinancialValue label="Pagado aquí" value={formatMoney(paid)} tone="positive" divided />
            <FinancialValue label="Conciliado externo" value={formatMoney(reconciled)} tone="info" divided />
            <FinancialValue label="Saldo pendiente" value={formatMoney(order.balance)} tone="negative" divided />
          </section>

          <div className="mt-4 grid items-start gap-4 lg:grid-cols-[0.82fr_1.18fr]">
            <div className="space-y-4">
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-950">Información general</h3>
                <div className="mt-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Cliente</p>
                    <button
                      type="button"
                      onClick={() => setCustomerAssignmentOpen(true)}
                      className="cursor-pointer rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-emerald-400 hover:text-emerald-700"
                    >
                      {order.customer_id ? "Cambiar cliente" : "Asignar cliente"}
                    </button>
                  </div>
                  <p className="mt-1 font-semibold text-slate-900">{order.customer_name || "Cliente sin nombre"}</p>
                  <div className="mt-1 grid gap-x-4 gap-y-0.5 text-sm text-slate-600 sm:grid-cols-2">
                    <p>{order.customer_phone || "Sin teléfono registrado"}</p>
                    <p>{order.customer_email || "Sin correo registrado"}</p>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <dt className="text-xs text-slate-500">Fecha de creación</dt>
                    <dd className="mt-1 font-medium text-slate-900">{formatDate(order.created_at, true)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Fecha límite</dt>
                    <dd className="mt-1 font-medium text-slate-900">{formatDate(order.due_date)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Código del separado</dt>
                    <dd className="mt-1 font-medium text-slate-900">{selectionCode}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Última actualización</dt>
                    <dd className="mt-1 font-medium text-slate-900">{formatDate(order.updated_at, true)}</dd>
                  </div>
                </dl>
              </section>

              {order.notes && (
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-950">Notas</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-slate-600">{order.notes}</p>
                </section>
              )}

              {order.resolution_type && (
                <section className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-950">Resolución administrativa</h3>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <dt className="text-xs text-slate-500">Tipo</dt>
                      <dd className="mt-1 font-medium text-slate-900">{resolutionTypeLabel(order.resolution_type)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Fecha</dt>
                      <dd className="mt-1 font-medium text-slate-900">{formatDate(order.resolved_at ?? order.updated_at, true)}</dd>
                    </div>
                    {order.resolution_reason && (
                      <div className="col-span-2">
                        <dt className="text-xs text-slate-500">Motivo</dt>
                        <dd className="mt-1 font-medium text-slate-900">{order.resolution_reason}</dd>
                      </div>
                    )}
                    {order.resolution_reference && (
                      <div className="col-span-2">
                        <dt className="text-xs text-slate-500">Referencia</dt>
                        <dd className="mt-1 font-medium text-slate-900">{order.resolution_reference}</dd>
                      </div>
                    )}
                  </dl>
                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-indigo-100 pt-3">
                    {Number(order.refunded_total || 0) > 0 && <MiniValue label="Devuelto" value={formatMoney(order.refunded_total)} tone="negative" />}
                    {Number(order.retained_amount || 0) > 0 && <MiniValue label="Abono retenido" value={formatMoney(order.retained_amount)} />}
                    {Number(order.credit_amount || 0) > 0 && <MiniValue label="Saldo a favor" value={formatMoney(order.credit_amount)} />}
                    {Number(order.pending_refund_amount || 0) > 0 && <MiniValue label="Devolución pendiente" value={formatMoney(order.pending_refund_amount)} tone="negative" />}
                    {Number(order.waived_amount || 0) > 0 && <MiniValue label="Saldo cerrado sin cobro" value={formatMoney(order.waived_amount)} />}
                  </div>
                </section>
              )}
            </div>

            <div className="space-y-4">
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-950">Productos separados</h3>
                  <span className="text-xs text-slate-500">
                    {(order.items ?? []).length} línea{(order.items ?? []).length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="mt-2 divide-y divide-slate-100">
                  {(order.items ?? []).map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-4 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">{item.product_name}</p>
                        {item.product_sku && <p className="mt-0.5 text-xs text-slate-500">SKU {item.product_sku}</p>}
                      </div>
                      <span className="shrink-0 font-semibold text-slate-700">
                        {Number(item.quantity).toLocaleString("es-CO")} unidad{Number(item.quantity) === 1 ? "" : "es"}
                      </span>
                    </div>
                  ))}
                  {(order.items ?? []).length === 0 && (
                    <p className="py-4 text-center text-sm text-slate-500">Sin productos registrados.</p>
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-950">Historial de pagos</h3>
                  <span className="text-xs text-slate-500">
                    {initialPayments.length + laterPayments.length} movimiento{initialPayments.length + laterPayments.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="mt-2 divide-y divide-slate-100">
                  {initialPayments.map((payment, index) => (
                    <PaymentRow
                      key={`initial-${payment.id ?? index}`}
                      label={initialPayments.length > 1 ? `Abono inicial ${index + 1}` : "Abono inicial"}
                      method={payment.method}
                      amount={payment.amount}
                      date={payment.paid_at ?? order.created_at}
                      reference={payment.reference}
                    />
                  ))}
                  {laterPayments.map((payment, index) => (
                    <PaymentRow
                      key={`payment-${payment.id}`}
                      label={`Abono ${initialPayments.length + index + 1}`}
                      method={payment.method}
                      amount={payment.amount}
                      date={payment.paid_at}
                      reference={payment.reference}
                      voided={!paymentIsActive(payment)}
                    />
                  ))}
                  {initialPayments.length === 0 && laterPayments.length === 0 && (
                    <p className="py-5 text-center text-sm text-slate-500">No hay pagos registrados.</p>
                  )}
                </div>
              </section>

              {(order.resolution_history ?? []).length > 0 && (
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-950">Historial administrativo</h3>
                    <span className="text-xs text-slate-500">{(order.resolution_history ?? []).length} evento{(order.resolution_history ?? []).length === 1 ? "" : "s"}</span>
                  </div>
                  <div className="mt-2 divide-y divide-slate-100">
                    {[...(order.resolution_history ?? [])].reverse().map((event, index) => {
                      const action = String(event.action ?? "resolution");
                      const amountValue = Number(event.amount ?? event.refund_amount ?? 0);
                      return (
                        <div key={`${String(event.created_at ?? "event")}-${index}`} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900">{resolutionActionLabel(action)}</p>
                            <p className="mt-0.5 truncate text-xs text-slate-500">
                              {formatDate(typeof event.created_at === "string" ? event.created_at : null, true)}
                              {event.reference ? ` · Ref. ${String(event.reference)}` : ""}
                            </p>
                          </div>
                          {amountValue > 0 && <p className="shrink-0 font-bold text-slate-900">{formatMoney(amountValue)}</p>}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4 md:px-6">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            Cerrar
          </button>
          {isOpenSeparated(order) && (
            <button
              type="button"
              onClick={() => setResolutionMode("reconcile")}
              className="cursor-pointer rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
            >
              Resolver separado
            </button>
          )}
          {isOpenSeparated(order) && (
            <Link
              href={`/pos/abonos?ticket=${encodeURIComponent(selectionCode)}&origin=separated-management`}
              className="cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Registrar abono
            </Link>
          )}
          {Number(order.pending_refund_amount || 0) > 0.01 && (
            <button
              type="button"
              onClick={() => setResolutionMode("refund_pending")}
              className="cursor-pointer rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600"
            >
              Pagar devolución pendiente
            </button>
          )}
        </footer>
      </aside>

      {resolutionMode && (
        <SeparatedResolutionModal
          order={order}
          mode={resolutionMode}
          token={token}
          onClose={() => setResolutionMode(null)}
          onResolved={(updated) => {
            onUpdated(updated);
            setResolutionMode(null);
          }}
        />
      )}
      {customerAssignmentOpen && (
        <SeparatedCustomerAssignmentModal
          order={order}
          token={token}
          onClose={() => setCustomerAssignmentOpen(false)}
          onAssigned={(updated) => {
            onUpdated(updated);
            setCustomerAssignmentOpen(false);
          }}
        />
      )}
    </div>
  );
}

function SeparatedCustomerAssignmentModal({
  order,
  token,
  onClose,
  onAssigned,
}: {
  order: SeparatedOrder;
  token?: string | null;
  onClose: () => void;
  onAssigned: (order: SeparatedOrder) => void;
}) {
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<PosCustomerRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const loadCustomers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const records = await fetchPosCustomers(token, {
        search: query.trim() || undefined,
        limit: 50,
      });
      setCustomers(records);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No fue posible cargar los clientes.");
    } finally {
      setLoading(false);
    }
  }, [query, token]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadCustomers(), 250);
    return () => window.clearTimeout(timeoutId);
  }, [loadCustomers]);

  const assignCustomer = async (customer: PosCustomerRead) => {
    if (!token || savingId) return;
    setSavingId(customer.id);
    try {
      const updated = await assignSeparatedOrderCustomer(order.id, customer.id, token);
      onAssigned(updated);
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : "No fue posible asignar el cliente.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[10030] flex items-center justify-center bg-slate-950/65 p-4" role="dialog" aria-modal="true" aria-labelledby="assign-separated-customer-title">
      <section className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-600">Cliente del separado</p>
            <h2 id="assign-separated-customer-title" className="mt-1 text-xl font-bold text-slate-950">Asignar cliente a {order.sale_document_number}</h2>
            <p className="mt-1 text-sm text-slate-600">La asignación también actualizará el documento original y quedará auditada.</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-slate-200 text-xl text-slate-500 hover:bg-slate-100" aria-label="Cerrar">×</button>
        </header>
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex gap-2">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, teléfono, correo o documento" className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-400" autoFocus />
            <button type="button" onClick={() => void loadCustomers()} className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:border-emerald-400">Actualizar</button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
            <span>Solo pueden asignarse clientes con al menos un dato adicional.</span>
            <Link href="/dashboard/customers" target="_blank" className="font-semibold text-emerald-700 hover:underline">Crear o completar cliente ↗</Link>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">Cargando clientes…</p>
          ) : customers.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No encontramos clientes con esta búsqueda.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {customers.map((customer) => {
                const complete = hasCustomerAdditionalInformation(customer);
                return (
                  <div key={customer.id} className="flex items-center justify-between gap-4 px-2 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{customer.name}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {[customer.phone, customer.email, customer.tax_id, customer.address].filter(Boolean).join(" · ") || "Sin datos adicionales"}
                      </p>
                    </div>
                    <button type="button" disabled={!complete || savingId !== null} onClick={() => void assignCustomer(customer)} className="cursor-pointer rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">
                      {savingId === customer.id ? "Asignando…" : complete ? "Asignar" : "Completar primero"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {error && <p className="m-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        </div>
      </section>
    </div>
  );
}

function FinancialValue({
  label,
  value,
  tone = "default",
  divided = false,
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative" | "info";
  divided?: boolean;
}) {
  return (
    <div className={`px-4 py-3.5 md:px-5 ${divided ? "border-l border-slate-200" : ""}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-base font-bold md:text-lg ${tone === "positive" ? "text-emerald-700" : tone === "negative" ? "text-rose-700" : tone === "info" ? "text-indigo-700" : "text-slate-950"}`}>
        {value}
      </p>
    </div>
  );
}

function PaymentRow({
  label,
  method,
  amount,
  date,
  reference,
  voided = false,
}: {
  label: string;
  method?: string | null;
  amount: number;
  date?: string | null;
  reference?: string | null;
  voided?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 py-2.5 ${voided ? "opacity-50" : ""}`}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">
          {label}{voided ? " · Anulado" : ""}
        </p>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {paymentMethodLabel(method)} · {formatDate(date, true)}
          {reference ? ` · Ref. ${reference}` : ""}
        </p>
      </div>
      <p className="shrink-0 text-sm font-bold text-slate-900">{formatMoney(amount)}</p>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/providers/AuthProvider";
import {
  fetchSeparatedOrders,
  type SeparatedOrder,
} from "@/lib/api/separatedOrders";
import { getApiBase } from "@/lib/api/base";

const moneyFormatter = new Intl.NumberFormat("es-CO", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
});

const STATUS_FILTERS = [
  { id: "reservado", label: "Activos" },
  { id: "pagado", label: "Pagados" },
  { id: "cancelado", label: "Cancelados" },
  { id: "todos", label: "Todos" },
] as const;

const TIME_FILTERS = [
  { id: "year", label: "Este año" },
  { id: "month", label: "Este mes" },
  { id: "week", label: "Esta semana" },
  { id: "all", label: "Todos" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["id"];
type TimeFilter = (typeof TIME_FILTERS)[number]["id"];

type SaleDetail = {
  items?: Array<{
    product_name?: string | null;
    name?: string | null;
    quantity?: number | null;
  }>;
};

function formatMoney(value?: number | null) {
  if (!value) return "$0";
  return `$${moneyFormatter.format(value)}`;
}

function formatDate(value?: string | null) {
  if (!value) return "Sin definir";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return dateFormatter.format(date);
}

function buildSelectionCode(order: SeparatedOrder) {
  return (
    order.barcode ??
    order.sale_document_number ??
    (order.sale_number ? String(order.sale_number) : `SEP-${order.id}`)
  );
}

export default function ListaAbonosPage() {
  const { token } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<StatusFilter>("reservado");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [orders, setOrders] = useState<SeparatedOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saleSummaries, setSaleSummaries] = useState<Record<number, string>>({});

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 350);
    return () => window.clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const params: Parameters<typeof fetchSeparatedOrders>[0] = {
          limit: 200,
        };
        if (status !== "todos") {
          params.status = status;
        }
        const normalizedSearch = debouncedSearch.trim();
        if (normalizedSearch) {
          if (/^\d+$/.test(normalizedSearch)) {
            params.saleNumber = Number(normalizedSearch);
          } else if (/^[a-z0-9-]+$/i.test(normalizedSearch) && !/\s/.test(normalizedSearch)) {
            params.barcode = normalizedSearch;
          }
        }
        // Para términos textuales parciales usamos filtrado en cliente más adelante.
        const data = await fetchSeparatedOrders(params, token);
        if (!active) return;
        setOrders(data);
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof Error
            ? err.message
            : "No pudimos cargar los separados."
        );
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [token, status, debouncedSearch]);

  const timeFilteredOrders = useMemo(() => {
    if (!orders.length) return orders;
    if (timeFilter === "all") return orders;
    const now = new Date();
    let start: Date;
    if (timeFilter === "year") {
      start = new Date(now.getFullYear(), 0, 1);
    } else if (timeFilter === "month") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1; // lunes como inicio
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
      start.setDate(now.getDate() - diff);
    }
    return orders.filter((order) => {
      const created = new Date(order.created_at);
      if (Number.isNaN(created.getTime())) return true;
      return created >= start;
    });
  }, [orders, timeFilter]);

  const filteredOrders = useMemo(() => {
    const base = timeFilteredOrders;
    const term = debouncedSearch.trim().toLowerCase();
    if (!term) return base;
    return base.filter((order) => {
      const code = buildSelectionCode(order).toLowerCase();
      const customer = (order.customer_name ?? "").toLowerCase();
      const summaryKey = order.sale_id ? saleSummaries[order.sale_id] : undefined;
      const summary = summaryKey ? summaryKey.toLowerCase() : "";
      const summaryMatch = summaryKey === undefined ? true : summary.includes(term);
      return (
        code.includes(term) ||
        customer.includes(term) ||
        summaryMatch
      );
    });
  }, [timeFilteredOrders, debouncedSearch, saleSummaries]);

  useEffect(() => {
    if (!token) return;
    const missingIds = timeFilteredOrders
      .map((order) => order.sale_id)
      .filter((id): id is number => Boolean(id) && !(id in saleSummaries));
    if (!missingIds.length) return;
    let cancelled = false;
    async function loadSummaries() {
      const entries: Record<number, string> = {};
      for (const saleId of missingIds) {
        try {
          const summary = await fetchSaleItemsSummary(saleId, token);
          entries[saleId] = summary;
        } catch (err) {
          console.warn("No pudimos cargar los productos del separado", err);
          entries[saleId] = "";
        }
      }
      if (!cancelled) {
        setSaleSummaries((prev) => ({ ...prev, ...entries }));
      }
    }
    void loadSummaries();
    return () => {
      cancelled = true;
    };
  }, [timeFilteredOrders, saleSummaries, token]);

  const emptyStateMessage = useMemo(() => {
    if (!token) return "Inicia sesión para consultar la lista de separados.";
    if (loading) return "Cargando separados…";
    if (error) return error;
    return "No encontramos separados con los filtros actuales.";
  }, [token, loading, error]);

  const handleSelect = (order: SeparatedOrder) => {
    const code = buildSelectionCode(order);
    router.push(`/pos/abonos?ticket=${encodeURIComponent(code)}`);
  };

  const getSummaryLabel = (saleId?: number | null) => {
    if (!saleId) return "Ticket sin venta asociada";
    const summary = saleSummaries[saleId];
    if (summary === undefined) return "Cargando productos…";
    if (!summary) return "Productos no disponibles";
    return summary;
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wide">
            POS · módulo en desarrollo
          </p>
          <h1 className="text-2xl font-semibold">Seleccionar separado</h1>
          <p className="text-sm text-slate-400">
            Busca en el listado si el cliente no trae su ticket físico.
          </p>
        </div>
        <Link
          href="/pos/abonos"
          className="px-4 py-2 rounded-full border border-slate-700 text-sm hover:bg-slate-900"
        >
          ← Volver a abonos
        </Link>
      </header>

      <div className="flex-1 overflow-auto px-6 py-6 space-y-5">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {TIME_FILTERS.map((filter) => {
                const active = timeFilter === filter.id;
                return (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setTimeFilter(filter.id)}
                    className={`px-4 py-2 rounded-full text-xs font-semibold border transition ${
                      active
                        ? "border-sky-400 text-sky-200 bg-sky-500/10"
                        : "border-slate-700 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex-1 flex flex-col gap-2">
                <label className="text-xs uppercase tracking-wide text-slate-400">
                  Buscar por cliente, ticket o producto
                </label>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nombre del cliente, producto, # de ticket o código"
                  className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm outline-none focus:border-emerald-400"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                {STATUS_FILTERS.map((item) => {
                  const active = status === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setStatus(item.id)}
                      className={`px-4 py-2 rounded-full text-xs font-semibold border transition ${
                        active
                          ? "border-emerald-400 text-emerald-200 bg-emerald-500/10"
                          : "border-slate-700 text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          {filteredOrders.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-10">
              {emptyStateMessage}
            </p>
          ) : (
            <div className="space-y-3">
              {filteredOrders.map((order) => {
                const code = buildSelectionCode(order);
                const paid = Math.max(
                  0,
                  order.total_amount - Math.max(order.balance, 0)
                );
                return (
                  <div
                    key={order.id}
                    className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 flex flex-col gap-3 md:flex-row md:items-center md:gap-6"
                  >
                    <div className="min-w-[220px] space-y-1">
                      <p className="text-xs uppercase tracking-wide text-slate-400">
                        Ticket / Cliente
                      </p>
                      <p className="text-lg font-semibold">{code}</p>
                      <p className="text-sm text-slate-400">
                        {order.customer_name ?? "Cliente sin nombre"}
                      </p>
                      <p className="text-xs text-slate-500">
                        Creado el {formatDate(order.created_at)} · Vence {formatDate(order.due_date)}
                      </p>
                    </div>
                    <div className="flex-1 text-xs text-slate-400">
                      <p className="uppercase tracking-wide text-[10px] text-slate-500">
                        Productos incluidos
                      </p>
                      <p className="text-sm text-slate-200 break-words">
                        {getSummaryLabel(order.sale_id)}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm md:flex md:items-center md:gap-6">
                      <div>
                        <p className="text-slate-400">Total</p>
                        <p className="font-semibold">{formatMoney(order.total_amount)}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Pagado</p>
                        <p className="font-semibold text-emerald-400">{formatMoney(paid)}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Saldo</p>
                        <p className="font-semibold text-rose-400">{formatMoney(order.balance)}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Estado</p>
                        <p className="font-semibold capitalize">{order.status}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelect(order)}
                      className="px-4 py-2 rounded-full bg-emerald-500 text-slate-950 text-sm font-semibold hover:bg-emerald-400"
                    >
                      Seleccionar
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

async function fetchSaleItemsSummary(saleId: number, token: string | null) {
  if (!token) {
    throw new Error("Sesión expirada.");
  }
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/pos/sales/${saleId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`Error ${res.status}`);
  }
  const data = (await res.json()) as SaleDetail;
  const items = data.items ?? [];
  if (!items.length) return "Sin productos registrados";
  return items
    .map((item) => {
      const name = item.product_name ?? item.name ?? "Producto";
      const qty = item.quantity ?? 1;
      return `${name} x${qty}`;
    })
    .join(" • ");
}

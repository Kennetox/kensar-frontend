"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../providers/AuthProvider";
import { getApiBase } from "@/lib/api/base";
import {
  fetchSeparatedOrders,
  type SeparatedOrder,
} from "@/lib/api/separatedOrders";
import { usePaymentMethodLabelResolver } from "@/app/hooks/usePaymentMethodLabelResolver";
import {
  buildBogotaDateFromKey,
  formatBogotaDate,
  getBogotaDateKey,
  getBogotaDateParts,
  parseDateInput,
} from "@/lib/time/bogota";


/* ================= TIPOS ================= */

type PaymentMethodSummary = {
  method: string;
  total: number;
  tickets: number;
};

type SeparatedOverview = {
  tickets: number;
  reservedTotal: number;
  pendingTotal: number;
  paymentsTotal: number;
};

type SalesTrendPoint = {
  date: string; // ISO
  total: number;
  tickets: number;
};

type MonthlySalesApiItem = {
  month?: number | string;
  total?: number;
  tickets?: number;
  date?: string;
};

type DashboardSummary = {
  today_sales_total: number;
  today_tickets: number;
  today_avg_ticket: number;
  month_sales_total: number;
  month_tickets: number;
  month_avg_ticket: number;
  payment_methods: PaymentMethodSummary[];
  last_7_days: SalesTrendPoint[];
  trend_days?: SalesTrendPoint[];
};

type RecentSaleItem = {
  id: number;
  product_name?: string;
  name?: string;
  quantity: number;
};

type RecentSale = {
  id: number;
  sale_number?: number;
  number?: number;
  created_at: string;
  status?: string;
  total: number;
  payment_method: string;
  items?: RecentSaleItem[];
  refund_count?: number;
  refunded_total?: number | null;
  refunded_balance?: number | null;
  paid_amount?: number | null;
  payments?: RecentSalePayment[];
  is_separated?: boolean;
  initial_payment_method?: string | null;
  initial_payment_amount?: number | null;
  balance?: number | null;
};

type RecentSalePayment = {
  id?: number;
  method: string;
  amount: number;
};

/* =============== HELPERS =============== */

function formatMoney(value: number): string {
  return value.toLocaleString("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function isCashMethod(method?: string | null): boolean {
  const normalized = (method ?? "").toLowerCase();
  return (
    normalized === "cash" ||
    normalized === "efectivo" ||
    normalized.includes("cash") ||
    normalized.includes("efectivo")
  );
}

const PAYMENT_RANGE_LABEL: Record<"day" | "week" | "month", string> = {
  day: "Hoy",
  week: "Esta semana",
  month: "Este mes",
};

function normalizeMonthIndex(
  value?: number | string,
  fallbackDate?: string
): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = Math.floor(value) - 1;
    if (normalized >= 0 && normalized < 12) return normalized;
  }

  if (typeof value === "string") {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      const normalized = Math.floor(numeric) - 1;
      if (normalized >= 0 && normalized < 12) return normalized;
    }
    const parsed = parseDateInput(value);
    if (parsed) {
      const { month } = getBogotaDateParts(parsed);
      const monthIndex = Number(month) - 1;
      if (monthIndex >= 0 && monthIndex < 12) return monthIndex;
    }
  }

  if (fallbackDate) {
    const parsed = parseDateInput(fallbackDate);
    if (parsed) {
      const { month } = getBogotaDateParts(parsed);
      const monthIndex = Number(month) - 1;
      if (monthIndex >= 0 && monthIndex < 12) return monthIndex;
    }
  }

  return null;
}

/* =============== COMPONENTE =============== */

export default function DashboardHomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const posPreview = searchParams.get("posPreview") === "1";
  const { token } = useAuth();
  const { getPaymentLabel } = usePaymentMethodLabelResolver();
  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : null),
    [token]
  );
  const currentYear = useMemo(() => {
    const { year } = getBogotaDateParts();
    return Number(year);
  }, []);
  const [weekOffset, setWeekOffset] = useState(0);
  const [yearOffset, setYearOffset] = useState(0);
  const selectedYear = currentYear + yearOffset;
  // Resumen principal
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Últimas ventas
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [recentMode, setRecentMode] = useState<"recent" | "top">("recent");
  const [paymentRange, setPaymentRange] = useState<"day" | "week" | "month">(
    "day"
  );
  const [trendMode, setTrendMode] = useState<"week" | "year">("week");
  const [yearTrend, setYearTrend] = useState<SalesTrendPoint[]>([]);
  const [yearTrendLoading, setYearTrendLoading] = useState(false);
  const [yearTrendError, setYearTrendError] = useState<string | null>(null);
  const [separatedOrders, setSeparatedOrders] = useState<SeparatedOrder[]>([]);
  const [separatedLoading, setSeparatedLoading] = useState(false);
  const [separatedError, setSeparatedError] = useState<string | null>(null);

  /* --------- Loaders reutilizables --------- */

  const loadSummary = useCallback(async () => {
    if (!authHeaders) return;
    try {
      setLoading(true);
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/dashboard/summary`, {
        headers: authHeaders,
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`Error ${res.status}`);
      }
      const json: DashboardSummary = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "Error al cargar el dashboard"
      );
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  const loadRecentSales = useCallback(async () => {
    if (!authHeaders) return;
    try {
      setRecentLoading(true);
      setRecentError(null);

      const apiBase = getApiBase();
      const res = await fetch(
        `${apiBase}/pos/sales?skip=0&limit=50`,
        {
          headers: authHeaders,
          credentials: "include",
        }
      );

      if (!res.ok) {
        throw new Error(`Error ${res.status}`);
      }

      const sales: RecentSale[] = await res.json();
      setRecentSales(sales);
    } catch (err) {
      console.error(err);
      setRecentError(
        err instanceof Error
          ? err.message
          : "Error al cargar últimas ventas"
      );
    } finally {
      setRecentLoading(false);
    }
  }, [authHeaders]);

  const loadYearlySales = useCallback(async () => {
    if (!authHeaders) return;
    try {
      setYearTrendLoading(true);
      setYearTrendError(null);
      const apiBase = getApiBase();
      const res = await fetch(
        `${apiBase}/dashboard/monthly-sales?year=${selectedYear}`,
        {
          headers: authHeaders,
          credentials: "include",
        }
      );
      if (!res.ok) {
        throw new Error(`Error ${res.status}`);
      }
      const json: MonthlySalesApiItem[] = await res.json();
      const map = new Map<number, { total: number; tickets: number }>();
      json.forEach((item) => {
        const monthIndex = normalizeMonthIndex(item.month, item.date);
        if (monthIndex == null) return;
        const existing = map.get(monthIndex) ?? {
          total: 0,
          tickets: 0,
        };
        existing.total += item.total ?? 0;
        existing.tickets += item.tickets ?? 0;
        map.set(monthIndex, existing);
      });
      const normalized: SalesTrendPoint[] = Array.from(
        { length: 12 },
        (_, index) => {
          const current = map.get(index);
          const month = String(index + 1).padStart(2, "0");
          const date = buildBogotaDateFromKey(`${selectedYear}-${month}-01`);
          return {
            date: date.toISOString(),
            total: current?.total ?? 0,
            tickets: current?.tickets ?? 0,
          };
        }
      );
      setYearTrend(normalized);
    } catch (err) {
      console.error(err);
      setYearTrendError(
        err instanceof Error
          ? err.message
          : "Error al cargar ventas mensuales"
      );
    } finally {
      setYearTrendLoading(false);
    }
  }, [authHeaders, selectedYear]);

  const loadSeparatedOrders = useCallback(async () => {
    if (!token) return;
    try {
      setSeparatedLoading(true);
      setSeparatedError(null);
      const records = await fetchSeparatedOrders(
        { limit: 500 },
        token
      );
      setSeparatedOrders(records);
    } catch (err) {
      console.error(err);
      setSeparatedError(
        err instanceof Error
          ? err.message
          : "Error al cargar los separados"
      );
    } finally {
      setSeparatedLoading(false);
    }
  }, [token]);

  // Cargar al entrar
  useEffect(() => {
    if (!authHeaders) return;
    void loadSummary();
    void loadRecentSales();
    void loadYearlySales();
    void loadSeparatedOrders();
  }, [
    authHeaders,
    loadSummary,
    loadRecentSales,
    loadYearlySales,
    loadSeparatedOrders,
  ]);

  /* --------- Datos derivados --------- */

  // Semana actual (lunes a domingo) con totales por día
  const todayDateKey = useMemo(() => getBogotaDateKey(), []);
  const todayStart = useMemo(
    () => buildBogotaDateFromKey(todayDateKey),
    [todayDateKey]
  );
  const weekStart = useMemo(() => {
    const jsDay = todayStart.getUTCDay();
    const diffToMonday = (jsDay + 6) % 7;
    const monday = new Date(todayStart);
    monday.setUTCDate(todayStart.getUTCDate() - diffToMonday + weekOffset * 7);
    return monday;
  }, [todayStart, weekOffset]);
  const currentWeekStart = useMemo(() => {
    const jsDay = todayStart.getUTCDay();
    const diffToMonday = (jsDay + 6) % 7;
    const monday = new Date(todayStart);
    monday.setUTCDate(todayStart.getUTCDate() - diffToMonday);
    return monday;
  }, [todayStart]);
  const adjustTotalForDate = useCallback(
    (baseTotal: number) => Math.max(0, baseTotal),
    []
  );
  const adjustTotalForMonth = useCallback(
    (baseTotal: number) => Math.max(0, baseTotal),
    []
  );
  const trendDayMap = useMemo(() => {
    const map = new Map<string, { total: number; tickets: number }>();
    if (!data) return map;
    const trendDays = data.trend_days?.length
      ? data.trend_days
      : data.last_7_days ?? [];
    trendDays.forEach((p) => {
      const key = getBogotaDateKey(p.date);
      if (!key) return;
      const existing = map.get(key);
      if (existing) {
        existing.total += p.total;
        existing.tickets += p.tickets;
      } else {
        map.set(key, { total: p.total, tickets: p.tickets });
      }
    });
    return map;
  }, [data]);
  const weekPoints = useMemo(() => {
    if (!trendDayMap.size) return [];
    const result: SalesTrendPoint[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setUTCDate(weekStart.getUTCDate() + i);
      const key = getBogotaDateKey(d);
      const fromMap = trendDayMap.get(key);
      const baseTotal = fromMap?.total ?? 0;
      const adjustedTotal = adjustTotalForDate(baseTotal);
      result.push({
        date: d.toISOString(),
        total: adjustedTotal,
        tickets: fromMap?.tickets ?? 0,
      });
    }

    return result;
  }, [adjustTotalForDate, trendDayMap, weekStart]);
  const currentWeekPoints = useMemo(() => {
    if (!trendDayMap.size) return [];
    const result: SalesTrendPoint[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(currentWeekStart);
      d.setUTCDate(currentWeekStart.getUTCDate() + i);
      const key = getBogotaDateKey(d);
      const fromMap = trendDayMap.get(key);
      const baseTotal = fromMap?.total ?? 0;
      const adjustedTotal = adjustTotalForDate(baseTotal);
      result.push({
        date: d.toISOString(),
        total: adjustedTotal,
        tickets: fromMap?.tickets ?? 0,
      });
    }
    return result;
  }, [adjustTotalForDate, currentWeekStart, trendDayMap]);

  const adjustedYearTrend = useMemo(
    () =>
      yearTrend.map((point) => {
        const key = getBogotaDateKey(point.date);
        if (!key) {
          return point;
        }
      return {
        ...point,
        total: adjustTotalForMonth(point.total ?? 0),
      };
      }),
    [yearTrend, adjustTotalForMonth]
  );

  const adjustedTodaySales = useMemo(() => {
    if (!data) return 0;
    return adjustTotalForDate(data.today_sales_total ?? 0);
  }, [data, adjustTotalForDate]);
  const adjustedMonthSales = useMemo(() => {
    if (!data) return 0;
    return adjustTotalForMonth(data.month_sales_total ?? 0);
  }, [data, adjustTotalForMonth]);
  const adjustedTodayAvgTicket = useMemo(() => {
    if (!data) return 0;
    const tickets = data.today_tickets ?? 0;
    if (tickets <= 0) return 0;
    return adjustedTodaySales / tickets;
  }, [data, adjustedTodaySales]);
  const adjustedMonthAvgTicket = useMemo(() => {
    if (!data) return 0;
    const tickets = data.month_tickets ?? 0;
    if (tickets <= 0) return 0;
    return adjustedMonthSales / tickets;
  }, [data, adjustedMonthSales]);
  const adjustedWeekSales = useMemo(
    () => currentWeekPoints.reduce((sum, point) => sum + point.total, 0),
    [currentWeekPoints]
  );

  const chartPoints = trendMode === "week" ? weekPoints : adjustedYearTrend;

  const chartHasSales = useMemo(
    () => chartPoints.some((p) => p.total > 0),
    [chartPoints]
  );

  const maxTrendValue = useMemo(() => {
    if (!chartPoints.length) return 0;
    if (!chartHasSales) return 1;
    return Math.max(...chartPoints.map((d) => d.total));
  }, [chartPoints, chartHasSales]);

  const refreshing =
    loading || recentLoading || yearTrendLoading || separatedLoading;

  const weekRangeLabel = useMemo(() => {
    if (!weekPoints.length) return null;
    const first = weekPoints[0]?.date;
    const last = weekPoints[weekPoints.length - 1]?.date;
    const formatPart = (value: string) =>
      formatBogotaDate(value, { day: "2-digit", month: "short" });
    return `${formatPart(first)} - ${formatPart(last)}`;
  }, [weekPoints]);

  const showSummarySkeleton = loading && !data;
  const chartTitle =
    trendMode === "week"
      ? "Movimientos últimos 7 días"
      : "Movimientos por mes";
  const chartSubtitle =
    trendMode === "week"
      ? "Total diario (valor de venta)."
      : "Total mensual del año actual.";
  const chartRangeLabel =
    trendMode === "week"
      ? weekRangeLabel
        ? `Semana ${weekRangeLabel}`
        : null
      : `Año ${selectedYear}`;
  const chartLoading = trendMode === "week" ? loading : yearTrendLoading;
  const chartEmptyMessage =
    trendMode === "week"
      ? "Aún no hay suficientes datos de ventas."
      : "Aún no hay ventas registradas para este año.";

  const todayLabel = useMemo(() => {
    return formatBogotaDate(new Date(), {
      weekday: "long",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, []);

  // Filas “planas” para la tabla de últimas ventas
  const recentRows = useMemo(() => {
    if (!recentSales.length) return [];

    const todayKey = todayDateKey;

    const normalized = recentSales.map((sale) => {
      const isVoided = sale.status === "voided";
      const refundAmount = isVoided ? 0 : sale.refunded_total ?? 0;
      const netTotal =
        sale.refunded_balance != null
          ? Math.max(0, sale.refunded_balance)
          : Math.max(0, sale.total - refundAmount);
      const safeNetTotal = isVoided ? 0 : netTotal;
      const dateObj = parseDateInput(sale.created_at) ?? new Date();
      const firstItem =
        sale.items && sale.items.length > 0 ? sale.items[0] : undefined;
      const detail = firstItem
        ? `${firstItem.product_name ?? firstItem.name ?? "Producto"} x${
            firstItem.quantity ?? 1
          }`
        : "—";
      return {
        sale,
        detail,
        refundAmount,
        netTotal: safeNetTotal,
        dateObj,
        dateKey: getBogotaDateKey(dateObj),
      };
    });

    let list = normalized;
    if (recentMode === "recent") {
      list = normalized
        .filter((entry) => entry.dateKey === todayKey)
        .sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
    } else {
      list = normalized
        .filter((entry) => entry.dateKey === todayKey)
        .sort((a, b) => b.netTotal - a.netTotal);
    }

    return list.slice(0, 10);
  }, [recentSales, recentMode, todayDateKey]);

  const paymentMethodCalc = useMemo(() => {
    if (paymentRange === "month") {
      return {
        entries: data?.payment_methods ?? [],
        separated: null as SeparatedOverview | null,
      };
    }

    const dayStart = buildBogotaDateFromKey(todayDateKey);
    const end = new Date(dayStart);
    end.setUTCDate(dayStart.getUTCDate() + 1);
    end.setUTCMilliseconds(-1);
    const start = paymentRange === "week" ? weekStart : dayStart;

    const map = new Map<
      string,
      {
        method: string;
        total: number;
        tickets: number;
        saleIds: Set<number>;
      }
    >();

    const addEntry = (
      method: string,
      amount: number,
      saleId: number,
      countTicket = true
    ) => {
      if (!method || amount <= 0) return;
      const key = method.toLowerCase();
      let entry = map.get(key);
      if (!entry) {
        entry = {
          method,
          total: 0,
          tickets: 0,
          saleIds: new Set<number>(),
        };
        map.set(key, entry);
      }
      entry.total += amount;
      if (countTicket && !entry.saleIds.has(saleId)) {
        entry.saleIds.add(saleId);
        entry.tickets += 1;
      }
    };

    const isWithinRange = (date: Date) =>
      date.getTime() >= start.getTime() && date.getTime() <= end.getTime();

    const separatedSummary: SeparatedOverview = {
      tickets: 0,
      reservedTotal: 0,
      pendingTotal: 0,
      paymentsTotal: 0,
    };

    const initialPaymentMap = new Map<
      number,
      { method: string; amount: number }
    >();
    recentSales.forEach((sale) => {
      if (!sale.is_separated) return;
      const amount = sale.initial_payment_amount ?? 0;
      if (amount <= 0) return;
      const method = sale.initial_payment_method ?? sale.payment_method ?? "separado";
      initialPaymentMap.set(sale.id, { method, amount });
    });

    separatedOrders.forEach((order) => {
      const orderDate = parseDateInput(order.created_at);
      const orderInRange = orderDate ? isWithinRange(orderDate) : false;
      if (orderInRange) {
        separatedSummary.tickets += 1;
        separatedSummary.reservedTotal += order.total_amount ?? 0;
        separatedSummary.pendingTotal += Math.max(order.balance ?? 0, 0);
        const initial = initialPaymentMap.get(order.sale_id);
        if (initial && initial.amount > 0) {
          addEntry(initial.method, initial.amount, order.sale_id, true);
          separatedSummary.paymentsTotal += initial.amount;
        }
      }

      if (order.payments?.length) {
        order.payments.forEach((payment) => {
          if (payment.status === "voided") return;
          const paidAt = payment.paid_at
            ? parseDateInput(payment.paid_at)
            : null;
          if (
            paidAt &&
            isWithinRange(paidAt) &&
            (payment.amount ?? 0) > 0
          ) {
            const amount = Math.max(payment.amount ?? 0, 0);
            addEntry(payment.method, amount, order.sale_id, false);
            separatedSummary.paymentsTotal += amount;
          }
        });
      }
    });

    recentSales.forEach((sale) => {
      if (sale.is_separated) return;
      if (sale.status === "voided") return;
      const saleDate = parseDateInput(sale.created_at);
      if (!saleDate) return;
      const saleInRange = isWithinRange(saleDate);

      const baseTotal = sale.total ?? 0;
      const netAmount =
        sale.refunded_balance != null
          ? Math.max(0, sale.refunded_balance)
          : Math.max(0, baseTotal - Math.max(0, sale.refunded_total ?? 0));

      if (!saleInRange || netAmount <= 0) return;

      if (sale.payments && sale.payments.length > 0) {
        const sumPayments = sale.payments.reduce(
          (sum, p) => sum + Math.max(p.amount ?? 0, 0),
          0
        );
        const paidAmount = sale.paid_amount ?? sumPayments;
        const changeAmount = Math.max(0, paidAmount - netAmount);
        let changeRemaining = changeAmount;

        sale.payments.forEach((p) => {
          let paymentAmount = Math.max(p.amount ?? 0, 0);
          if (changeRemaining > 0 && isCashMethod(p.method)) {
            const applied = Math.min(changeRemaining, paymentAmount);
            paymentAmount = Math.max(0, paymentAmount - applied);
            changeRemaining -= applied;
          }
          addEntry(p.method, paymentAmount, sale.id, true);
        });
      } else {
        addEntry(sale.payment_method, netAmount, sale.id, true);
      }
    });

    const entries = Array.from(map.values())
      .map((entry) => ({
        method: entry.method,
        total: entry.total,
        tickets: entry.tickets,
      }))
      .sort((a, b) => b.total - a.total);

    return {
      entries,
      separated:
        separatedSummary.tickets > 0 ||
        separatedSummary.paymentsTotal > 0 ||
        separatedSummary.pendingTotal > 0
          ? separatedSummary
          : null,
    };
  }, [
    paymentRange,
    recentSales,
    data,
    separatedOrders,
    todayDateKey,
    weekStart,
  ]);

  const paymentMethodData = paymentMethodCalc.entries;
  const separatedOverview = paymentMethodCalc.separated;

  const paymentMethodTotal = useMemo(() => {
    if (paymentRange === "month") {
      return adjustedMonthSales;
    }
    return paymentMethodData.reduce((sum, entry) => sum + entry.total, 0);
  }, [paymentRange, adjustedMonthSales, paymentMethodData]);

  /* ================= RENDER ================= */

  return (
    <main className="flex-1 px-6 py-6">
      <div className="w-full max-w-7xl mx-auto space-y-6">
        {/* Título + botón Refrescar */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-semibold text-slate-50">
                Panel general
              </h1>
              <span className="text-xs uppercase tracking-wide text-slate-400">
                {todayLabel}
              </span>
            </div>
            <p className="text-sm text-slate-400">
              Resumen de ventas y actividad reciente del POS de Metrik,
              la suite de Kensar Electronic.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs">
            {refreshing ? (
              <span className="text-slate-400">
                Actualizando…
              </span>
            ) : error ? (
              <span className="text-red-400">
                Error: {error}
              </span>
            ) : (
              <span className="text-slate-400">
                Datos actualizados en tiempo real desde el POS.
              </span>
            )}

            <button
              type="button"
              onClick={() => {
                void loadSummary();
                void loadRecentSales();
                void loadYearlySales();
                void loadSeparatedOrders();
              }}
              disabled={refreshing}
              className="px-3 py-1.5 rounded-md border border-emerald-400/70 text-emerald-300 text-xs hover:bg-emerald-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Refrescar
            </button>
          </div>
        </header>

        {/* KPIs principales */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Ventas hoy */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-4">
            <div className="text-xs font-medium text-slate-400">
              Ventas de hoy (movimientos)
            </div>
            {showSummarySkeleton ? (
              <div className="mt-2 h-7 w-28 rounded bg-slate-800/70 animate-pulse" />
            ) : (
              <div className="mt-2 text-2xl font-semibold text-emerald-400">
                {formatMoney(adjustedTodaySales)}
              </div>
            )}
            <div className="mt-1 text-[11px] text-slate-400">
              Ticket promedio:{" "}
              {showSummarySkeleton ? (
                <span className="ml-1 inline-flex h-4 w-16 rounded bg-slate-800/70 animate-pulse" />
              ) : (
                <span className="font-semibold text-slate-200">
                  {formatMoney(adjustedTodayAvgTicket)}
                </span>
              )}
            </div>
          </div>

          {/* Tickets hoy */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-4">
            <div className="text-xs font-medium text-slate-400">
              Tickets de hoy
            </div>
            {showSummarySkeleton ? (
              <div className="mt-2 h-7 w-16 rounded bg-slate-800/70 animate-pulse" />
            ) : (
              <div className="mt-2 text-2xl font-semibold text-slate-100">
                {data?.today_tickets ?? 0}
              </div>
            )}
            <div className="mt-1 text-[11px] text-slate-400">
              Ventas registradas en el POS.
            </div>
          </div>

          {/* Ventas mes actual */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-4">
            <div className="text-xs font-medium text-slate-400">
              Ventas mes actual (movimientos)
            </div>
            {showSummarySkeleton ? (
              <div className="mt-2 h-7 w-28 rounded bg-slate-800/70 animate-pulse" />
            ) : (
              <div className="mt-2 text-2xl font-semibold text-sky-400">
                {formatMoney(adjustedMonthSales)}
              </div>
            )}
            <div className="mt-1 text-[11px] text-slate-400">
              Tickets:{" "}
              {showSummarySkeleton ? (
                <span className="ml-1 inline-flex h-4 w-12 rounded bg-slate-800/70 animate-pulse" />
              ) : (
                <span className="font-semibold text-slate-200">
                  {data?.month_tickets ?? 0}
                </span>
              )}
            </div>
          </div>

          {/* Ventas semana actual */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-4">
            <div className="text-xs font-medium text-slate-400">
              Ventas semana actual (movimientos)
            </div>
            {showSummarySkeleton ? (
              <div className="mt-2 h-7 w-28 rounded bg-slate-800/70 animate-pulse" />
            ) : (
              <div className="mt-2 text-2xl font-semibold text-emerald-300">
                {formatMoney(adjustedWeekSales)}
              </div>
            )}
            <div className="mt-1 text-[11px] text-slate-400">
              Lunes a domingo.
            </div>
          </div>

          {/* Ticket promedio mes */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-4">
            <div className="text-xs font-medium text-slate-400">
              Ticket promedio (mes)
            </div>
            {showSummarySkeleton ? (
              <div className="mt-2 h-7 w-24 rounded bg-slate-800/70 animate-pulse" />
            ) : (
              <div className="mt-2 text-2xl font-semibold text-slate-100">
                {formatMoney(adjustedMonthAvgTicket)}
              </div>
            )}
            <div className="mt-1 text-[11px] text-slate-400">
              Promedio por venta en el mes.
            </div>
          </div>
        </section>

        {/* Sección inferior: gráfica + métodos de pago */}
        <section className="grid gap-4 mt-6 lg:grid-cols-[2fr,1fr] md:grid-cols-2">
          {/* Gráfico últimos 7 días */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-5 py-4 min-h-[260px]">
            <div className="flex items-center justify-between mb-3 gap-3">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                  <h2>{chartTitle}</h2>
                  {chartRangeLabel && (
                    <span className="text-[11px] font-normal text-slate-400 uppercase tracking-wide">
                      {chartRangeLabel}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  {chartSubtitle}
                </p>
                {trendMode === "year" && yearTrendError && (
                  <p className="text-[11px] text-red-400">
                    Error: {yearTrendError}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                {([
                  { id: "week", label: "Semana" },
                  { id: "year", label: "Meses" },
                ] as const).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setTrendMode(option.id)}
                    className={`px-2.5 py-1 rounded-full border text-xs transition ${
                      trendMode === option.id
                        ? "bg-emerald-500/20 border-emerald-400/60 text-emerald-200"
                        : "border-slate-700 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {trendMode === "week" ? (
                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    aria-label="Semana anterior"
                    onClick={() => setWeekOffset(-1)}
                    disabled={weekOffset === -1}
                    className={`h-8 w-8 rounded-full border text-sm transition ${
                      weekOffset === -1
                        ? "bg-emerald-500/20 border-emerald-400/60 text-emerald-200"
                        : "border-slate-700 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <svg
                      viewBox="0 0 20 20"
                      className="mx-auto h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        d="M12.5 4.5 7 10l5.5 5.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    aria-label="Semana actual"
                    onClick={() => setWeekOffset(0)}
                    disabled={weekOffset === 0}
                    className={`h-8 w-8 rounded-full border text-sm transition ${
                      weekOffset === 0
                        ? "bg-emerald-500/20 border-emerald-400/60 text-emerald-200"
                        : "border-slate-700 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <svg
                      viewBox="0 0 20 20"
                      className="mx-auto h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        d="M7.5 4.5 13 10l-5.5 5.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    aria-label="Año anterior"
                    onClick={() => setYearOffset((prev) => prev - 1)}
                    className="h-8 w-8 rounded-full border border-slate-700 text-slate-400 text-sm transition hover:text-slate-200"
                  >
                    <svg
                      viewBox="0 0 20 20"
                      className="mx-auto h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        d="M12.5 4.5 7 10l5.5 5.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    aria-label="Año actual"
                    onClick={() => setYearOffset(0)}
                    disabled={yearOffset === 0}
                    className={`h-8 w-8 rounded-full border text-sm transition ${
                      yearOffset === 0
                        ? "bg-emerald-500/20 border-emerald-400/60 text-emerald-200"
                        : "border-slate-700 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <svg
                      viewBox="0 0 20 20"
                      className="mx-auto h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        d="M7.5 4.5 13 10l-5.5 5.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {chartLoading ? (
              <div className="space-y-4">
                <div className="h-4 w-28 rounded bg-slate-800/70 animate-pulse" />
                <div className="h-44 rounded-3xl bg-slate-900/70 animate-pulse" />
              </div>
            ) : !chartPoints.length ? (
              <div className="h-32 flex items-center justify-center text-xs text-slate-500">
                {chartEmptyMessage}
              </div>
            ) : (
              <div className="h-48 flex items-end gap-3">
                {chartPoints.map((point) => {
                  const isWeekMode = trendMode === "week";
                  const pointKey = getBogotaDateKey(point.date);
                  const isCurrentDay =
                    isWeekMode && pointKey === todayDateKey;
                  const primaryLabel = isWeekMode
                    ? formatBogotaDate(point.date, { weekday: "short" })
                    : formatBogotaDate(point.date, { month: "short" });
                  const secondaryLabel = isWeekMode
                    ? formatBogotaDate(point.date, {
                        day: "2-digit",
                        month: "short",
                      })
                    : formatBogotaDate(point.date, { year: "numeric" });

                  const rawHeight =
                    chartHasSales && maxTrendValue > 0
                      ? (point.total / maxTrendValue) * 100
                      : 0;

                  const heightPercent =
                    point.total === 0
                      ? 6
                      : Math.max(18, rawHeight);

                  return (
                    <div
                      key={`${trendMode}-${point.date}`}
                      className="flex-1 flex flex-col items-center justify-end gap-1"
                    >
                      <div
                        className={`text-[11px] ${
                          isCurrentDay
                            ? "text-emerald-300 font-semibold"
                            : "text-slate-300"
                        }`}
                      >
                        {formatMoney(point.total)}
                      </div>

                      <div
                        className={`w-6 sm:w-8 h-32 rounded-full overflow-hidden flex items-end ${
                          isCurrentDay
                            ? "bg-slate-800/80 ring-2 ring-emerald-400/70 ring-offset-2 ring-offset-slate-900"
                            : "bg-slate-800"
                        }`}
                      >
                        <div
                          className={`w-full rounded-full transition-all ${
                            isCurrentDay ? "bg-emerald-300" : "bg-emerald-500"
                          }`}
                          style={{ height: `${heightPercent}%` }}
                        />
                      </div>

                      <div
                        className={`text-[11px] mt-1 flex flex-col items-center leading-tight ${
                          isCurrentDay
                            ? "text-emerald-200 font-medium"
                            : "text-slate-400"
                        }`}
                      >
                        <span className="capitalize">
                          {primaryLabel}
                        </span>
                        <span
                          className={`text-[10px] ${
                            isCurrentDay
                              ? "text-emerald-300/80"
                              : "text-slate-500"
                          }`}
                        >
                          {secondaryLabel}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Métodos de pago */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-5 py-4 h-[260px] flex flex-col">
            <div className="flex items-center justify-between gap-3 mb-1">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">
                  Movimientos por método ({PAYMENT_RANGE_LABEL[paymentRange]})
                </h2>
                <p className="text-xs text-slate-400">
                  Distribución de los movimientos por método de pago.
                </p>
                {paymentRange !== "month" && separatedError && (
                  <p className="text-[11px] text-amber-300 mt-1">
                    {separatedError}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 text-[11px]">
                {([
                  { id: "day", label: "Hoy" },
                  { id: "week", label: "Semana" },
                  { id: "month", label: "Mes" },
                ] as const).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPaymentRange(opt.id)}
                    className={`px-2.5 py-1 rounded-full border text-xs transition ${
                      paymentRange === opt.id
                        ? "bg-emerald-500/20 border-emerald-400/60 text-emerald-200"
                        : "border-slate-700 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {!paymentMethodData.length ? (
              <div className="flex-1 flex items-center justify-center text-xs text-slate-500">
                Aún no hay ventas registradas en este periodo.
              </div>
            ) : (
              <div className="mt-1 flex-1 min-h-0">
                {/* 👇 Scroll interno, la tarjeta NO crece */}
                <div className="space-y-2 text-xs max-h-full overflow-y-auto pr-1">
                  {paymentMethodData.map((pm) => (
                    <div key={pm.method} className="space-y-1">
                      <div className="flex justify-between">
                        <span className="font-medium text-slate-100">
                          {getPaymentLabel(pm.method)}
                        </span>
                        <span className="text-slate-300">
                          {formatMoney(pm.total)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>{pm.tickets} tickets</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-sky-500"
                          style={{
                            width: `${
                              paymentMethodTotal > 0
                                ? Math.min(
                                    100,
                                    (pm.total / paymentMethodTotal) * 100
                                  )
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  {paymentRange !== "month" && separatedOverview && (
                    <div className="mt-3 rounded-lg border border-dashed border-slate-700 p-3 space-y-1">
                      <div className="flex justify-between text-[11px] text-slate-100 font-semibold">
                        <span>Ventas por separado</span>
                        <span>{separatedOverview.tickets} tickets</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>Abonos cobrados en el período</span>
                        <span className="text-slate-100">
                          {formatMoney(separatedOverview.paymentsTotal)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>Total reservado</span>
                        <span className="text-slate-100">
                          {formatMoney(separatedOverview.reservedTotal)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>Saldo pendiente</span>
                        <span
                          className={`font-semibold ${
                            separatedOverview.pendingTotal === 0
                              ? "text-emerald-300"
                              : "text-rose-300"
                          }`}
                        >
                          {formatMoney(separatedOverview.pendingTotal)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Últimas ventas */}
        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 px-5 py-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-100">
                  Últimas ventas
                </h2>
                <div className="flex rounded-full border border-slate-700 text-[11px] overflow-hidden">
                  {[
                    { id: "recent", label: "Recientes" },
                    { id: "top", label: "Top día" },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() =>
                        setRecentMode(mode.id as "recent" | "top")
                      }
                      className={`px-2 py-0.5 ${
                        recentMode === mode.id
                          ? "bg-emerald-500 text-slate-900"
                          : "text-slate-300"
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Últimos tickets registrados en el POS.
              </p>
              {recentError && (
                <p className="text-[11px] text-red-400 mt-1">
                  Error: {recentError}
                </p>
              )}
            </div>

            <button
              type="button"
              className="text-emerald-400 hover:text-emerald-300 text-xs"
              onClick={() =>
                router.push(
                  posPreview
                    ? "/dashboard/sales?posPreview=1"
                    : "/dashboard/sales"
                )
              }
            >
              Ver historial completo
            </button>
          </div>

          {!recentRows.length ? (
            <p className="text-xs text-slate-500 mt-2">
              Aún no hay ventas registradas.
            </p>
          ) : (
            <div className="mt-2 text-xs">
              {/* Encabezados */}
              <div className="grid grid-cols-[80px_160px_1fr_120px_120px] text-[11px] text-slate-400 mb-1 px-1 gap-2">
                <span>Nº venta</span>
                <span>Fecha / hora</span>
                <span>Detalle</span>
                <span className="text-right">Total</span>
                <span className="text-right">Método</span>
              </div>

              {/* Contenedor con altura fija + scroll interno */}
              <div className="rounded-xl border border-slate-800/60 overflow-hidden">
                <div className="max-h-64 overflow-y-auto">
                  {recentRows.map(({ sale, detail, refundAmount, netTotal }, rowIndex) => {
                    const zebra =
                      rowIndex % 2 === 0
                        ? "bg-slate-950"
                        : "bg-slate-900/60";

                    const baseRow =
                      "grid grid-cols-[80px_160px_1fr_120px_120px] text-xs px-3 py-2 transition-colors gap-2";

                    const saleNumber =
                      sale.sale_number ?? sale.number ?? sale.id;
                    const isVoided = sale.status === "voided";
                    const hasRefund = refundAmount > 0 && !isVoided;
                    const paidRaw = sale.paid_amount ?? sale.total;
                    const paidBase = sale.is_separated
                      ? paidRaw
                      : Math.min(paidRaw, sale.total);
                    const netPaid = isVoided
                      ? 0
                      : Math.max(0, paidBase - refundAmount);

                    return (
                      <div
                        key={`${sale.id}-${rowIndex}`}
                        className={`${baseRow} ${zebra} hover:bg-slate-800/80`}
                      >
                        {/* Nº venta */}
                        <div className="font-mono text-slate-200">
                          #{saleNumber}
                        </div>

                        {/* Fecha / hora */}
                        <div className="text-slate-300">
                          {formatBogotaDate(sale.created_at, {
                            day: "2-digit",
                            month: "2-digit",
                            year: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true,
                          })}
                        </div>

                        {/* Detalle del producto */}
                        <div className="flex flex-col">
                          <span className="truncate text-slate-100 flex items-center gap-2">
                            {detail}
                            {isVoided && (
                              <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border border-rose-500/50 text-rose-300 bg-rose-500/10">
                                Anulada
                              </span>
                            )}
                            {hasRefund && (
                              <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border ${netTotal <= 0 ? "border-rose-500/50 text-rose-300 bg-rose-500/10" : "border-amber-400/50 text-amber-200 bg-amber-500/10"}`}>
                                {netTotal <= 0 ? "Devuelta" : "Dev. parcial"}
                              </span>
                            )}
                          </span>
                        </div>

                        {/* Total: SIEMPRE visible */}
                        <div className="text-right font-semibold text-slate-100">
                          {formatMoney(netTotal)}
                          {hasRefund && (
                            <span className="block text-[10px] text-rose-300">
                              -{formatMoney(refundAmount)}
                            </span>
                          )}
                        </div>

                        {/* Método: SIEMPRE visible */}
                        <div className="text-right text-slate-200">
                          <div>
                            {sale.is_separated
                              ? "Separado"
                              : getPaymentLabel(sale.payment_method)}
                          </div>
                          {hasRefund && (
                            <div className="text-[10px] text-rose-300">
                              Pagado neto: {formatMoney(netPaid)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

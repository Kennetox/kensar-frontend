"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../providers/AuthProvider";
import {
  defaultRolePermissions,
  fetchRolePermissions,
  type PosUserRecord,
  type RolePermissionModule,
} from "@/lib/api/settings";
import { getApiBase } from "@/lib/api/base";
import { exportReportPdf } from "@/lib/api/reports";
import { getBogotaDateKey } from "@/lib/time/bogota";

export {
  REPORT_PRESETS,
  buildDocumentHtml,
  buildReportResult,
} from "./detailed/page";
export type {
  CompanyInfo,
  FilterMeta,
  ReportChange,
  ReportSale,
} from "./detailed/page";

type DashboardRole = PosUserRecord["role"];

type DashboardMonthlySalesPoint = {
  month: number;
  total: number;
  tickets: number;
};

type DashboardDailySalesPoint = {
  date: string;
  total: number;
  tickets: number;
};

type QuickTopRow = {
  name: string;
  units: number;
  total: number;
};

type QuickInsightsResponse = {
  year: number;
  month: number;
  min_year: number;
  max_year: number;
  top_products: QuickTopRow[];
  top_groups: QuickTopRow[];
};

type PaymentMethodSummary = {
  method: string;
  total: number;
  tickets: number;
};

const MONTHS = [
  { key: "01", label: "Ene" },
  { key: "02", label: "Feb" },
  { key: "03", label: "Mar" },
  { key: "04", label: "Abr" },
  { key: "05", label: "May" },
  { key: "06", label: "Jun" },
  { key: "07", label: "Jul" },
  { key: "08", label: "Ago" },
  { key: "09", label: "Sep" },
  { key: "10", label: "Oct" },
  { key: "11", label: "Nov" },
  { key: "12", label: "Dic" },
];
const WEEKDAY_SHORT = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];

function capitalize(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatMonthTitle(monthKey: string) {
  const [year, month] = monthKey.split("-");
  const monthLabel =
    new Intl.DateTimeFormat("es-CO", {
      month: "long",
      timeZone: "America/Bogota",
    }).format(new Date(`${monthKey}-01T12:00:00-05:00`)) ?? month;
  return `${capitalize(monthLabel)} ${year}`;
}

function shiftMonthKey(monthKey: string, offset: number) {
  const [yearRaw, monthRaw] = monthKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (Number.isNaN(year) || Number.isNaN(month)) return monthKey;
  const next = new Date(Date.UTC(year, month - 1 + offset, 1, 12, 0, 0));
  const nextYear = next.getUTCFullYear();
  const nextMonth = String(next.getUTCMonth() + 1).padStart(2, "0");
  return `${nextYear}-${nextMonth}`;
}

function getMonthDayCount(monthKey: string) {
  const [yearRaw, monthRaw] = monthKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return 31;
  return new Date(year, month, 0).getDate();
}

function isDashboardRole(role?: string | null): role is DashboardRole {
  return (
    role === "Administrador" ||
    role === "Supervisor" ||
    role === "Vendedor" ||
    role === "Auditor"
  );
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function formatMoney(value: number | undefined | null) {
  if (value == null || Number.isNaN(value)) return "$0";
  return `$${value.toLocaleString("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatCompactMoney(value: number | undefined | null) {
  if (value == null || Number.isNaN(value)) return "$0";
  if (Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toLocaleString("es-CO", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `$${(value / 1_000).toLocaleString("es-CO", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}k`;
  }
  return formatMoney(value);
}

function formatCount(value: number | undefined | null) {
  if (value == null || Number.isNaN(value)) return "0";
  return value.toLocaleString("es-CO");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatPercentChange(current: number, previous: number) {
  if (!Number.isFinite(previous) || previous <= 0) return null;
  const change = ((current - previous) / previous) * 100;
  const sign = change > 0 ? "+" : "";
  return `${sign}${change.toLocaleString("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })}%`;
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        d={
          direction === "left"
            ? "M11.5 4.5 6 10l5.5 5.5"
            : "M8.5 4.5 14 10l-5.5 5.5"
        }
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NavigationButton({
  direction,
  onClick,
  disabled,
  label,
}: {
  direction: "left" | "right";
  onClick: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition hover:text-emerald-700 disabled:cursor-not-allowed disabled:text-slate-300"
    >
      <ChevronIcon direction={direction} />
    </button>
  );
}

export default function ReportsPage() {
  const { token, user } = useAuth();
  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : null),
    [token]
  );
  const [roleModules, setRoleModules] = useState<RolePermissionModule[]>(
    defaultRolePermissions
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const todayKey = getBogotaDateKey();
  const todayYear = todayKey.slice(0, 4);
  const todayMonthKey = todayKey.slice(0, 7);
  const [selectedYear, setSelectedYear] = useState(todayYear);
  const [selectedMonthKey, setSelectedMonthKey] = useState(todayMonthKey);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const dailyDetailRef = useRef<HTMLDivElement | null>(null);
  const annualAverageCardRef = useRef<HTMLButtonElement | null>(null);
  const [showAnnualDailyAverage, setShowAnnualDailyAverage] = useState(false);
  const [annualTransitionActive, setAnnualTransitionActive] = useState(true);
  const [monthlyTransitionActive, setMonthlyTransitionActive] = useState(true);
  const [monthlySeries, setMonthlySeries] = useState<DashboardMonthlySalesPoint[]>([]);
  const [previousYearSeries, setPreviousYearSeries] = useState<DashboardMonthlySalesPoint[]>([]);
  const [dailySeries, setDailySeries] = useState<DashboardDailySalesPoint[]>([]);
  const [previousMonthDailySeries, setPreviousMonthDailySeries] = useState<DashboardDailySalesPoint[]>([]);
  const [topProducts, setTopProducts] = useState<QuickTopRow[]>([]);
  const [topGroups, setTopGroups] = useState<QuickTopRow[]>([]);
  const [minYear, setMinYear] = useState(todayYear);
  const [maxYear, setMaxYear] = useState(todayYear);
  const [dayMethodMap, setDayMethodMap] = useState<Record<string, PaymentMethodSummary[]>>({});
  const [quickPdfLoading, setQuickPdfLoading] = useState(false);
  const [quickPdfError, setQuickPdfError] = useState<string | null>(null);

  const canLoadRolePermissions = useMemo(() => {
    if (!isDashboardRole(user?.role)) return false;
    const settingsModule = defaultRolePermissions.find(
      (row) => row.id === "settings"
    );
    const settingsAction = settingsModule?.actions.find(
      (entry) => entry.id === "settings.view"
    );
    if (!settingsAction) return false;
    return Boolean(settingsAction.roles[user.role]);
  }, [user?.role]);

  const canSeeModuleAction = useCallback(
    (moduleId: string, actionId: string) => {
      if (!isDashboardRole(user?.role)) return false;
      const permissionModule = roleModules.find((row) => row.id === moduleId);
      if (!permissionModule) return false;
      const action = permissionModule.actions.find(
        (entry) => entry.id === actionId
      );
      if (!action) return Boolean(permissionModule.roles[user.role]);
      return Boolean(action.roles[user.role]);
    },
    [roleModules, user?.role]
  );

  const canViewReportDataset =
    canSeeModuleAction("reports", "reports.view") ||
    canSeeModuleAction("sales_history", "sales_history.view") ||
    canSeeModuleAction("pos", "pos.sales");

  useEffect(() => {
    if (!token) return;
    if (!canLoadRolePermissions) {
      setRoleModules(defaultRolePermissions);
      return;
    }
    let cancelled = false;
    fetchRolePermissions(token)
      .then((modules) => {
        if (!cancelled) setRoleModules(modules);
      })
      .catch((err) => {
        console.error("No pudimos cargar permisos de reportes.", err);
        if (!cancelled) setRoleModules(defaultRolePermissions);
      });
    return () => {
      cancelled = true;
    };
  }, [canLoadRolePermissions, token]);

  useEffect(() => {
    if (!canViewReportDataset) {
      setTopProducts([]);
      setTopGroups([]);
      setLoading(false);
      setError(null);
      return;
    }
    if (!authHeaders) return;
    const requestHeaders: HeadersInit = authHeaders;
    let cancelled = false;

    async function loadQuickInsights() {
      try {
        setLoading(true);
        setError(null);
        const apiBase = getApiBase();
        const month = Number(selectedMonthKey.slice(5, 7));
        const year = Number(selectedMonthKey.slice(0, 4));
        const params = new URLSearchParams({
          year: String(year),
          month: String(month),
        });
        const res = await fetch(`${apiBase}/reports/quick/insights?${params.toString()}`, {
          headers: requestHeaders,
          credentials: "include",
        });
        if (!res.ok) throw new Error(`Error ${res.status}`);
        const json = (await res.json()) as QuickInsightsResponse;
        if (!cancelled) {
          setTopProducts(Array.isArray(json.top_products) ? json.top_products : []);
          setTopGroups(Array.isArray(json.top_groups) ? json.top_groups : []);
          setMinYear(String(json.min_year || Number(todayYear)));
          setMaxYear(String(json.max_year || Number(todayYear)));
          setDayMethodMap({});
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "No pudimos cargar las ventas del año."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadQuickInsights();
    return () => {
      cancelled = true;
    };
  }, [authHeaders, canViewReportDataset, selectedMonthKey, todayYear]);

  useEffect(() => {
    if (!canViewReportDataset) {
      setMonthlySeries([]);
      setPreviousYearSeries([]);
      return;
    }
    if (!authHeaders) return;
    const requestHeaders: HeadersInit = authHeaders;
    let cancelled = false;

    async function loadMonthlySeries() {
      try {
        const apiBase = getApiBase();
        const currentYear = Number(selectedYear);
        const [currentRes, previousRes] = await Promise.all([
          fetch(`${apiBase}/dashboard/monthly-sales?year=${currentYear}`, {
            headers: requestHeaders,
            credentials: "include",
          }),
          fetch(`${apiBase}/dashboard/monthly-sales?year=${currentYear - 1}`, {
            headers: requestHeaders,
            credentials: "include",
          }),
        ]);
        if (!currentRes.ok) throw new Error(`Error ${currentRes.status}`);
        const currentJson = (await currentRes.json()) as DashboardMonthlySalesPoint[];
        const previousJson = previousRes.ok
          ? ((await previousRes.json()) as DashboardMonthlySalesPoint[])
          : [];
        if (!cancelled) {
          setMonthlySeries(Array.isArray(currentJson) ? currentJson : []);
          setPreviousYearSeries(Array.isArray(previousJson) ? previousJson : []);
        }
      } catch (err) {
        console.error("No pudimos cargar serie mensual dashboard.", err);
        if (!cancelled) {
          setMonthlySeries([]);
          setPreviousYearSeries([]);
        }
      }
    }

    void loadMonthlySeries();
    return () => {
      cancelled = true;
    };
  }, [authHeaders, canViewReportDataset, selectedYear]);

  useEffect(() => {
    if (!canViewReportDataset) {
      setDailySeries([]);
      setPreviousMonthDailySeries([]);
      return;
    }
    if (!authHeaders) return;
    const requestHeaders: HeadersInit = authHeaders;
    let cancelled = false;

    async function loadDailySeries() {
      try {
        const monthDays = getMonthDayCount(selectedMonthKey);
        const fromDate = `${selectedMonthKey}-01`;
        const toDate = `${selectedMonthKey}-${String(monthDays).padStart(2, "0")}`;
        const previousMonthKey = shiftMonthKey(selectedMonthKey, -1);
        const previousMonthDays = getMonthDayCount(previousMonthKey);
        const prevFromDate = `${previousMonthKey}-01`;
        const prevToDate = `${previousMonthKey}-${String(previousMonthDays).padStart(2, "0")}`;
        const apiBase = getApiBase();
        const [currentRes, previousRes] = await Promise.all([
          fetch(
            `${apiBase}/dashboard/daily-sales?${new URLSearchParams({
              date_from: fromDate,
              date_to: toDate,
            }).toString()}`,
            {
              headers: requestHeaders,
              credentials: "include",
            }
          ),
          fetch(
            `${apiBase}/dashboard/daily-sales?${new URLSearchParams({
              date_from: prevFromDate,
              date_to: prevToDate,
            }).toString()}`,
            {
              headers: requestHeaders,
              credentials: "include",
            }
          ),
        ]);
        if (!currentRes.ok) throw new Error(`Error ${currentRes.status}`);
        const currentJson = (await currentRes.json()) as DashboardDailySalesPoint[];
        const previousJson = previousRes.ok
          ? ((await previousRes.json()) as DashboardDailySalesPoint[])
          : [];
        if (!cancelled) {
          setDailySeries(Array.isArray(currentJson) ? currentJson : []);
          setPreviousMonthDailySeries(Array.isArray(previousJson) ? previousJson : []);
        }
      } catch (err) {
        console.error("No pudimos cargar serie diaria dashboard.", err);
        if (!cancelled) {
          setDailySeries([]);
          setPreviousMonthDailySeries([]);
        }
      }
    }

    void loadDailySeries();
    return () => {
      cancelled = true;
    };
  }, [authHeaders, canViewReportDataset, selectedMonthKey]);

  const minMonthKey = `${selectedYear}-01`;
  const maxMonthKey =
    selectedYear === todayYear ? todayMonthKey : `${selectedYear}-12`;

  useEffect(() => {
    if (Number(selectedYear) < Number(minYear)) {
      setSelectedYear(minYear);
      return;
    }
    if (Number(selectedYear) > Number(maxYear)) {
      setSelectedYear(maxYear);
    }
  }, [maxYear, minYear, selectedYear]);

  useEffect(() => {
    setSelectedMonthKey((current) => {
      const monthPart = current.slice(5, 7);
      const next = `${selectedYear}-${monthPart}`;
      return next === current ? current : next;
    });
  }, [selectedYear]);

  useEffect(() => {
    if (selectedMonthKey < minMonthKey) {
      setSelectedMonthKey(minMonthKey);
      return;
    }
    if (selectedMonthKey > maxMonthKey) {
      setSelectedMonthKey(maxMonthKey);
    }
  }, [maxMonthKey, minMonthKey, selectedMonthKey]);

  useEffect(() => {
    setSelectedDay(null);
  }, [selectedMonthKey]);

  const selectedDayKey = useMemo(() => {
    if (selectedDay == null) return null;
    return `${selectedMonthKey}-${String(selectedDay).padStart(2, "0")}`;
  }, [selectedDay, selectedMonthKey]);

  useEffect(() => {
    if (selectedDay == null) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (dailyDetailRef.current?.contains(target)) return;
      setSelectedDay(null);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [selectedDay]);

  useEffect(() => {
    if (!canViewReportDataset) return;
    if (!authHeaders) return;
    if (!selectedDayKey) return;
    const dayKey = selectedDayKey;
    if (dayMethodMap[dayKey]) return;
    const requestHeaders: HeadersInit = authHeaders;
    let cancelled = false;

    async function loadDayMethods() {
      try {
        const apiBase = getApiBase();
        const params = new URLSearchParams({
          range: "day",
          start_date: dayKey,
        });
        const res = await fetch(`${apiBase}/dashboard/payment-methods?${params.toString()}`, {
          headers: requestHeaders,
          credentials: "include",
        });
        if (!res.ok) throw new Error(`Error ${res.status}`);
        const json = (await res.json()) as { methods?: PaymentMethodSummary[] };
        if (!cancelled) {
          setDayMethodMap((prev) => ({
            ...prev,
            [dayKey]: Array.isArray(json.methods) ? json.methods : [],
          }));
        }
      } catch (err) {
        console.error("No pudimos cargar métodos por día.", err);
        if (!cancelled) {
          setDayMethodMap((prev) => ({
            ...prev,
            [dayKey]: [],
          }));
        }
      }
    }

    void loadDayMethods();
    return () => {
      cancelled = true;
    };
  }, [authHeaders, canViewReportDataset, dayMethodMap, selectedDayKey]);

  useEffect(() => {
    if (!showAnnualDailyAverage) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (annualAverageCardRef.current?.contains(target)) return;
      setShowAnnualDailyAverage(false);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [showAnnualDailyAverage]);

  useEffect(() => {
    setAnnualTransitionActive(false);
    const timeoutId = window.setTimeout(() => {
      setAnnualTransitionActive(true);
    }, 20);
    return () => window.clearTimeout(timeoutId);
  }, [selectedYear]);

  useEffect(() => {
    setMonthlyTransitionActive(false);
    const timeoutId = window.setTimeout(() => {
      setMonthlyTransitionActive(true);
    }, 20);
    return () => window.clearTimeout(timeoutId);
  }, [selectedMonthKey, selectedDay]);

  const currentMonthLabel = formatMonthTitle(selectedMonthKey);
  const selectedMonthNumber = Number(selectedMonthKey.slice(5, 7));
  const currentDayKey = Number(todayKey.slice(8, 10));
  const isViewingCurrentMonth = selectedMonthKey === todayMonthKey;
  const currentMonthDays = new Date(
    Number(selectedMonthKey.slice(0, 4)),
    selectedMonthNumber,
    0
  ).getDate();
  const monthlyData = useMemo(() => {
    const totals = new Map<string, { total: number; tickets: number }>();
    MONTHS.forEach((month) =>
      totals.set(month.key, { total: 0, tickets: 0 })
    );
    monthlySeries.forEach((item) => {
      const monthKey = String(item.month).padStart(2, "0");
      totals.set(monthKey, {
        total: toNumber(item.total),
        tickets: Math.max(0, Math.trunc(toNumber(item.tickets))),
      });
    });
    return MONTHS.map((month) => ({
      ...month,
      total: totals.get(month.key)?.total ?? 0,
      tickets: totals.get(month.key)?.tickets ?? 0,
    }));
  }, [monthlySeries]);

  const maxValue = useMemo(
    () => Math.max(1, ...monthlyData.map((item) => item.total)),
    [monthlyData]
  );
  const totalYearSales = useMemo(
    () => monthlyData.reduce((sum, item) => sum + item.total, 0),
    [monthlyData]
  );
  const averageMonthDivisor = useMemo(() => {
    if (selectedYear === todayYear) {
      return Math.max(1, Number(todayMonthKey.slice(5, 7)));
    }
    return 12;
  }, [selectedYear, todayMonthKey, todayYear]);
  const averageMonthSales = useMemo(
    () => totalYearSales / averageMonthDivisor,
    [averageMonthDivisor, totalYearSales]
  );
  const averageYearDayDivisor = useMemo(() => {
    const selectedYearNumber = Number(selectedYear);
    if (!Number.isFinite(selectedYearNumber)) return 365;

    if (selectedYear === todayYear) {
      const todayInBogota = new Date(`${todayKey}T12:00:00-05:00`);
      if (Number.isNaN(todayInBogota.getTime())) return 1;
      const startOfYear = new Date(selectedYearNumber, 0, 1);
      const diffMs = todayInBogota.getTime() - startOfYear.getTime();
      return Math.max(1, Math.floor(diffMs / 86400000) + 1);
    }

    const isLeapYear =
      (selectedYearNumber % 4 === 0 && selectedYearNumber % 100 !== 0) ||
      selectedYearNumber % 400 === 0;
    return isLeapYear ? 366 : 365;
  }, [selectedYear, todayKey, todayYear]);
  const averageYearDaySales = useMemo(
    () => totalYearSales / averageYearDayDivisor,
    [averageYearDayDivisor, totalYearSales]
  );
  const previousYearSales = useMemo(() => {
    return previousYearSeries.reduce(
      (sum, point) => sum + toNumber(point.total),
      0
    );
  }, [previousYearSeries]);
  const yearSalesChange = useMemo(
    () => formatPercentChange(totalYearSales, previousYearSales),
    [previousYearSales, totalYearSales]
  );
  const totalYearTickets = useMemo(
    () => monthlyData.reduce((sum, item) => sum + item.tickets, 0),
    [monthlyData]
  );
  const bestMonth = useMemo(() => {
    return [...monthlyData].sort((a, b) => b.total - a.total)[0] ?? null;
  }, [monthlyData]);
  const chartTicks = useMemo(() => [1, 0.66, 0.33, 0], []);
  const annualChart = useMemo(() => {
    const width = 980;
    const height = 164;
    const topPadding = 30;
    const chartHeight = 104;
    const baselineY = topPadding + chartHeight;
    const leftPadding = 16;
    const innerWidth = width - leftPadding * 2;
    const slotWidth = innerWidth / 12;
    const barWidth = Math.max(26, slotWidth - 14);

    return {
      width,
      height,
      topPadding,
      chartHeight,
      baselineY,
      leftPadding,
      slotWidth,
      barWidth,
    };
  }, []);
  const dailyData = useMemo(() => {
    const totals = new Map<number, { total: number; tickets: number }>();
    for (let day = 1; day <= currentMonthDays; day += 1) {
      totals.set(day, { total: 0, tickets: 0 });
    }
    dailySeries.forEach((point) => {
      const key = getBogotaDateKey(point.date);
      if (!key || !key.startsWith(selectedMonthKey)) return;
      const day = Number(key.slice(8, 10));
      if (!Number.isFinite(day) || day < 1 || day > currentMonthDays) return;
      totals.set(day, {
        total: toNumber(point.total),
        tickets: Math.max(0, Math.trunc(toNumber(point.tickets))),
      });
    });
    return Array.from({ length: currentMonthDays }, (_, index) => {
      const day = index + 1;
      return {
        day,
        label: String(day).padStart(2, "0"),
        weekday:
          WEEKDAY_SHORT[
            new Date(
              Number(selectedMonthKey.slice(0, 4)),
              selectedMonthNumber - 1,
              day
            ).getDay()
          ],
        total: totals.get(day)?.total ?? 0,
        tickets: totals.get(day)?.tickets ?? 0,
      };
    });
  }, [currentMonthDays, dailySeries, selectedMonthKey, selectedMonthNumber]);
  const maxDailyValue = useMemo(
    () => Math.max(1, ...dailyData.map((item) => item.total)),
    [dailyData]
  );
  const totalMonthSales = useMemo(
    () => dailyData.reduce((sum, item) => sum + item.total, 0),
    [dailyData]
  );
  const averageDayDivisor = useMemo(() => {
    if (selectedMonthKey === todayMonthKey) {
      return Math.max(1, currentDayKey);
    }
    return currentMonthDays;
  }, [currentDayKey, currentMonthDays, selectedMonthKey, todayMonthKey]);
  const averageDaySales = useMemo(
    () => totalMonthSales / averageDayDivisor,
    [averageDayDivisor, totalMonthSales]
  );
  const previousMonthSales = useMemo(() => {
    const isCurrentMonthComparison = selectedMonthKey === todayMonthKey;
    const cutoffDay = isCurrentMonthComparison ? currentDayKey : null;
    return previousMonthDailySeries.reduce((sum, point) => {
      const key = getBogotaDateKey(point.date);
      if (!key) return sum;
      const day = Number(key.slice(8, 10));
      if (cutoffDay != null && day > cutoffDay) return sum;
      return sum + toNumber(point.total);
    }, 0);
  }, [currentDayKey, previousMonthDailySeries, selectedMonthKey, todayMonthKey]);
  const monthSalesChange = useMemo(
    () => formatPercentChange(totalMonthSales, previousMonthSales),
    [previousMonthSales, totalMonthSales]
  );
  const totalMonthTickets = useMemo(
    () => dailyData.reduce((sum, item) => sum + item.tickets, 0),
    [dailyData]
  );
  const bestDay = useMemo(() => {
    return [...dailyData].sort((a, b) => b.total - a.total)[0] ?? null;
  }, [dailyData]);
  const activeDay = useMemo(() => {
    if (selectedDay == null) return bestDay;
    return dailyData.find((day) => day.day === selectedDay) ?? bestDay;
  }, [bestDay, dailyData, selectedDay]);
  const selectedDayMethods = useMemo(
    () => (selectedDayKey ? dayMethodMap[selectedDayKey] ?? [] : []),
    [dayMethodMap, selectedDayKey]
  );
  const selectedDayTotal = useMemo(() => activeDay?.total ?? 0, [activeDay]);
  const selectedDayTickets = useMemo(() => activeDay?.tickets ?? 0, [activeDay]);
  const selectedDayLabel = useMemo(() => {
    if (selectedDay == null) return null;
    const day = dailyData.find((entry) => entry.day === selectedDay);
    if (!day) return null;
    return `${day.label} ${day.weekday}`;
  }, [dailyData, selectedDay]);
  const dailyChart = useMemo(() => {
    const width = Math.max(980, dailyData.length * 34);
    const height = 174;
    const topPadding = 30;
    const chartHeight = 102;
    const baselineY = topPadding + chartHeight;
    const leftPadding = 8;
    const innerWidth = width - leftPadding * 2;
    const slotWidth = innerWidth / Math.max(dailyData.length, 1);
    const barWidth = Math.max(10, slotWidth - 4);

    return {
      width,
      height,
      topPadding,
      baselineY,
      chartHeight,
      leftPadding,
      slotWidth,
      barWidth,
    };
  }, [dailyData.length]);

  const handleDownloadQuickPdf = useCallback(async () => {
    try {
      setQuickPdfLoading(true);
      setQuickPdfError(null);

      const annualBars = monthlyData
        .map((month, index) => {
          const hasSales = month.total > 0;
          const barHeight = hasSales
            ? Math.max(24, (month.total / maxValue) * annualChart.chartHeight)
            : 6;
          const x =
            annualChart.leftPadding +
            index * annualChart.slotWidth +
            (annualChart.slotWidth - annualChart.barWidth) / 2;
          const y = annualChart.baselineY - barHeight;
          const labelX = x + annualChart.barWidth / 2;
          return `
            <g>
              <text x="${labelX}" y="${Math.max(
                14,
                y - 20
              )}" text-anchor="middle" font-size="11" font-weight="700" fill="#475569">${escapeHtml(
                formatCompactMoney(month.total)
              )}</text>
              <text x="${labelX}" y="${Math.max(
                25,
                y - 6
              )}" text-anchor="middle" font-size="11" font-weight="700" fill="#334155">${escapeHtml(
                String(month.tickets)
              )}</text>
              <rect x="${x}" y="${y}" width="${annualChart.barWidth}" height="${barHeight}" fill="#334155" />
              <text x="${labelX}" y="${
                annualChart.baselineY + 16
              }" text-anchor="middle" font-size="14" font-weight="700" fill="#334155">${escapeHtml(
                month.label
              )}</text>
            </g>
          `;
        })
        .join("");

      const annualGrid = chartTicks
        .map((tick) => {
          const y = annualChart.topPadding + (1 - tick) * annualChart.chartHeight;
          return `<line x1="0" y1="${y}" x2="${annualChart.width}" y2="${y}" stroke="#cbd5e1" stroke-dasharray="4 4" />`;
        })
        .join("");

      const annualAverageLine =
        averageMonthSales > 0
          ? `<line x1="0" y1="${
              annualChart.baselineY -
              (averageMonthSales / maxValue) * annualChart.chartHeight
            }" x2="${annualChart.width}" y2="${
              annualChart.baselineY -
              (averageMonthSales / maxValue) * annualChart.chartHeight
            }" stroke="#10b981" stroke-opacity="0.45" stroke-dasharray="6 6" />`
          : "";

      const dailyBars = dailyData
        .map((day, index) => {
          const hasSales = day.total > 0;
          const barHeight = hasSales
            ? Math.max(22, (day.total / maxDailyValue) * dailyChart.chartHeight)
            : 3;
          const x =
            dailyChart.leftPadding +
            index * dailyChart.slotWidth +
            (dailyChart.slotWidth - dailyChart.barWidth) / 2;
          const y = dailyChart.baselineY - barHeight;
          const labelX = x + dailyChart.barWidth / 2;
          return `
            <g>
              <text x="${labelX}" y="${Math.max(
                14,
                y - 20
              )}" text-anchor="middle" font-size="9" font-weight="700" fill="#475569">${escapeHtml(
                formatCompactMoney(day.total)
              )}</text>
              <text x="${labelX}" y="${Math.max(
                24,
                y - 7
              )}" text-anchor="middle" font-size="9" font-weight="700" fill="#334155">${escapeHtml(
                String(day.tickets)
              )}</text>
              <rect x="${x}" y="${y}" width="${dailyChart.barWidth}" height="${barHeight}" fill="#334155" />
              <text x="${labelX}" y="${
                dailyChart.baselineY + 14
              }" text-anchor="middle" font-size="11" font-weight="700" fill="#334155">${escapeHtml(
                day.label
              )}</text>
              <text x="${labelX}" y="${
                dailyChart.baselineY + 26
              }" text-anchor="middle" font-size="9" font-weight="600" fill="#64748b">${escapeHtml(
                day.weekday
              )}</text>
            </g>
          `;
        })
        .join("");

      const dailyGrid = chartTicks
        .map((tick) => {
          const y = dailyChart.topPadding + (1 - tick) * dailyChart.chartHeight;
          return `<line x1="0" y1="${y}" x2="${dailyChart.width}" y2="${y}" stroke="#cbd5e1" stroke-dasharray="4 4" />`;
        })
        .join("");

      const dailyAverageLine =
        averageDaySales > 0
          ? `<line x1="0" y1="${
              dailyChart.baselineY -
              (averageDaySales / maxDailyValue) * dailyChart.chartHeight
            }" x2="${dailyChart.width}" y2="${
              dailyChart.baselineY -
              (averageDaySales / maxDailyValue) * dailyChart.chartHeight
            }" stroke="#10b981" stroke-opacity="0.45" stroke-dasharray="6 6" />`
          : "";

      const topProductsHtml = topProducts
        .map(
          (product) => `
          <div class="row">
            <div>
              <div class="title">${escapeHtml(product.name)}</div>
              <div class="meta">${escapeHtml(formatCount(product.units))} unidades</div>
            </div>
            <div class="value">${escapeHtml(formatMoney(product.total))}</div>
          </div>
        `
        )
        .join("");

      const topGroupsHtml = topGroups
        .map(
          (group) => `
          <div class="row">
            <div>
              <div class="title">${escapeHtml(group.name)}</div>
              <div class="meta">${escapeHtml(formatCount(group.units))} unidades</div>
            </div>
            <div class="value">${escapeHtml(formatMoney(group.total))}</div>
          </div>
        `
        )
        .join("");

      const generatedAt = new Intl.DateTimeFormat("es-CO", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date());

      const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    body { font-family: Inter, Arial, sans-serif; color: #0f172a; margin: 0; }
    .section { border: 1px solid #e2e8f0; border-radius: 16px; padding: 12px; margin-top: 10px; }
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .kpi { border: 1px solid #e2e8f0; border-radius: 12px; padding: 8px; background: #f8fafc; }
    .kpi .label { font-size: 10px; text-transform: uppercase; color: #64748b; }
    .kpi .value { font-size: 18px; font-weight: 700; margin-top: 4px; }
    .kpi .meta { font-size: 11px; color: #64748b; margin-top: 4px; }
    .title { font-size: 24px; font-weight: 700; margin: 0; }
    .subtitle { font-size: 12px; color: #64748b; margin-top: 3px; }
    .chart-wrap { border: 1px solid #e2e8f0; border-radius: 16px; background: #f8fafc; padding: 8px; margin-top: 8px; }
    .split { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .row { display: flex; justify-content: space-between; gap: 8px; align-items: center; border: 1px solid #e2e8f0; border-radius: 10px; padding: 8px; margin-top: 6px; background: #f8fafc; }
    .row .title { font-size: 14px; font-weight: 600; margin: 0; }
    .row .meta { font-size: 11px; color: #64748b; }
    .row .value { font-size: 14px; font-weight: 700; white-space: nowrap; }
  </style>
</head>
<body>
  <h1 class="title">Reporte rápido mensual/anual</h1>
  <div class="subtitle">Generado: ${escapeHtml(generatedAt)}</div>
  <div class="subtitle">Año: ${escapeHtml(selectedYear)} · Mes: ${escapeHtml(currentMonthLabel)}</div>

  <div class="section">
    <div style="font-weight:700; margin-bottom:6px;">Resumen anual (${escapeHtml(selectedYear)})</div>
    <div class="kpis">
      <div class="kpi"><div class="label">Venta total</div><div class="value">${escapeHtml(
        formatMoney(totalYearSales)
      )}</div><div class="meta">${escapeHtml(
        yearSalesChange ? `${yearSalesChange} vs año anterior` : "Sin base comparativa"
      )}</div></div>
      <div class="kpi"><div class="label">Mes líder</div><div class="value">${escapeHtml(
        bestMonth?.label ?? "—"
      )}</div><div class="meta">${escapeHtml(
        bestMonth ? formatMoney(bestMonth.total) : "$0"
      )}</div></div>
      <div class="kpi"><div class="label">Tickets del año</div><div class="value">${escapeHtml(
        formatCount(totalYearTickets)
      )}</div></div>
      <div class="kpi"><div class="label">Promedio mensual</div><div class="value">${escapeHtml(
        formatMoney(averageMonthSales)
      )}</div></div>
    </div>
    <div class="chart-wrap">
      <svg viewBox="0 0 ${annualChart.width} ${annualChart.height}" width="100%">
        ${annualGrid}
        ${annualAverageLine}
        ${annualBars}
      </svg>
    </div>
  </div>

  <div class="section">
    <div style="font-weight:700; margin-bottom:6px;">Resumen mensual (${escapeHtml(
      currentMonthLabel
    )})</div>
    <div class="kpis">
      <div class="kpi"><div class="label">Venta del mes</div><div class="value">${escapeHtml(
        formatMoney(totalMonthSales)
      )}</div><div class="meta">${escapeHtml(
        monthSalesChange ? `${monthSalesChange} vs mes anterior` : "Sin base comparativa"
      )}</div></div>
      <div class="kpi"><div class="label">Día líder</div><div class="value">${escapeHtml(
        activeDay ? `${activeDay.label} ${activeDay.weekday}` : "—"
      )}</div><div class="meta">${escapeHtml(
        activeDay ? formatMoney(activeDay.total) : "$0"
      )}</div></div>
      <div class="kpi"><div class="label">Tickets del mes</div><div class="value">${escapeHtml(
        formatCount(totalMonthTickets)
      )}</div></div>
      <div class="kpi"><div class="label">Promedio diario</div><div class="value">${escapeHtml(
        formatMoney(averageDaySales)
      )}</div></div>
    </div>
    <div class="chart-wrap">
      <svg viewBox="0 0 ${dailyChart.width} ${dailyChart.height}" width="100%">
        ${dailyGrid}
        ${dailyAverageLine}
        ${dailyBars}
      </svg>
    </div>
  </div>

  <div class="section">
    <div class="split">
      <div>
        <div style="font-size:11px; text-transform:uppercase; color:#10b981; font-weight:700;">Top productos</div>
        ${topProductsHtml || '<div class="meta">Sin datos.</div>'}
      </div>
      <div>
        <div style="font-size:11px; text-transform:uppercase; color:#10b981; font-weight:700;">Top grupos</div>
        ${topGroupsHtml || '<div class="meta">Sin datos.</div>'}
      </div>
    </div>
  </div>
</body>
</html>`;

      const blob = await exportReportPdf(
        {
          title: `Reporte rapido ${selectedYear}-${selectedMonthKey.slice(5, 7)}`,
          document_html: html,
          preset_id: "quick-summary",
        },
        token
      );

      const fileName = `reporte_rapido_${selectedYear}_${selectedMonthKey.slice(5, 7)}.pdf`;
      const picker = (
        window as Window & {
          showSaveFilePicker?: (options?: {
            suggestedName?: string;
            types?: {
              description?: string;
              accept?: Record<string, string[]>;
            }[];
          }) => Promise<{
            createWritable: () => Promise<{
              write: (data: Blob) => Promise<void>;
              close: () => Promise<void>;
            }>;
          }>;
        }
      ).showSaveFilePicker;

      if (picker) {
        try {
          const handle = await picker({
            suggestedName: fileName,
            types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
          throw err;
        }
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setQuickPdfError(
        err instanceof Error ? err.message : "No se pudo exportar el resumen en PDF."
      );
    } finally {
      setQuickPdfLoading(false);
    }
  }, [
    activeDay,
    annualChart,
    averageDaySales,
    averageMonthSales,
    bestMonth,
    chartTicks,
    currentMonthLabel,
    dailyChart,
    dailyData,
    maxDailyValue,
    maxValue,
    monthSalesChange,
    monthlyData,
    selectedMonthKey,
    selectedYear,
    token,
    topGroups,
    topProducts,
    totalMonthSales,
    totalMonthTickets,
    totalYearSales,
    totalYearTickets,
    yearSalesChange,
  ]);

  return (
    <main className="report-page-shell flex-1 px-6 py-4 text-slate-900">
      <div className="mx-auto w-full max-w-7xl space-y-4">
        <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="report-page-kicker text-xs font-semibold uppercase tracking-[0.18em] text-emerald-500">
              Reportes
            </p>
            <h1 className="report-page-title mt-1 font-bold leading-tight text-slate-900">
              Ventas mensuales del año actual
            </h1>
            <p className="report-page-subtitle mt-1 max-w-2xl text-sm text-slate-500">
              Empezamos por una sola lectura clara: la evolución mes a mes del
              año {selectedYear}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dashboard/reports/detailed"
              className="inline-flex rounded-full border border-emerald-400/70 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
            >
              Ir a reportes detallados
            </Link>
            <button
              type="button"
              onClick={() => void handleDownloadQuickPdf()}
              disabled={quickPdfLoading}
              className="inline-flex rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {quickPdfLoading ? "Generando PDF..." : "Descargar resumen PDF"}
            </button>
          </div>
        </header>
        {quickPdfError ? (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-sm">
            {quickPdfError}
          </section>
        ) : null}

        {!canViewReportDataset ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
            Este rol no tiene acceso al dataset operativo para mostrar la gráfica.
          </section>
        ) : error ? (
          <section className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 shadow-sm">
            Error al cargar datos: {error}
          </section>
        ) : loading ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="animate-pulse space-y-5">
              <div className="h-6 w-64 rounded bg-slate-200" />
              <div className="h-[360px] rounded-2xl bg-slate-100" />
            </div>
          </section>
        ) : (
          <>
            <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="report-view-kicker text-xs font-semibold uppercase tracking-[0.22em] text-emerald-500">
                    Vista anual
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <NavigationButton
                      direction="left"
                      onClick={() =>
                        setSelectedYear((current) => String(Number(current) - 1))
                      }
                      disabled={selectedYear <= minYear}
                      label="Ver año anterior"
                    />
                    <h2 className="report-view-title font-semibold leading-tight text-slate-900">
                      {selectedYear}
                    </h2>
                    <NavigationButton
                      direction="right"
                      onClick={() =>
                        setSelectedYear((current) => String(Number(current) + 1))
                      }
                      disabled={selectedYear >= maxYear}
                      label="Ver año siguiente"
                    />
                  </div>
                  <p className="report-view-subtitle mt-1 text-sm text-slate-500">
                    Datos agrupados por mes para leer tendencia y estacionalidad.
                  </p>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="report-chart-kpi rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1.5">
                    <p className="report-chart-kpi-label text-[11px] uppercase tracking-wide text-slate-500">
                      Venta total
                    </p>
                    <p className="report-chart-kpi-value mt-1 text-[20px] font-bold leading-none tracking-tight text-slate-900">
                      {formatMoney(totalYearSales)}
                    </p>
                    <p className="report-chart-kpi-meta mt-1 text-[13px] leading-snug text-slate-500">
                      {yearSalesChange
                        ? `${yearSalesChange} vs año anterior`
                        : "Sin base comparativa"}
                    </p>
                  </div>
                  <div className="report-chart-kpi rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1.5">
                    <p className="report-chart-kpi-label text-[11px] uppercase tracking-wide text-slate-500">
                      Mes líder
                    </p>
                    <p className="report-chart-kpi-value mt-1 text-[20px] font-bold leading-none tracking-tight text-slate-900">
                      {bestMonth?.label ?? "—"}
                    </p>
                    <p className="report-chart-kpi-meta text-[13px] text-emerald-600">
                      {bestMonth ? formatMoney(bestMonth.total) : "$0"}
                    </p>
                  </div>
                  <div className="report-chart-kpi rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1.5">
                    <p className="report-chart-kpi-label text-[11px] uppercase tracking-wide text-slate-500">
                      Tickets del año
                    </p>
                    <p className="report-chart-kpi-value mt-1 text-[20px] font-bold leading-none tracking-tight text-slate-900">
                      {formatCount(totalYearTickets)}
                    </p>
                  </div>
                  <button
                    type="button"
                    ref={annualAverageCardRef}
                    onClick={() => setShowAnnualDailyAverage((current) => !current)}
                    className="report-chart-kpi rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-left transition hover:border-emerald-200 hover:bg-emerald-50/40"
                  >
                    <p className="report-chart-kpi-label text-[11px] uppercase tracking-wide text-slate-500">
                      {showAnnualDailyAverage ? "Promedio diario" : "Promedio mensual"}
                    </p>
                    <p className="report-chart-kpi-value mt-1 text-[20px] font-bold leading-none tracking-tight text-slate-900">
                      {formatMoney(
                        showAnnualDailyAverage ? averageYearDaySales : averageMonthSales
                      )}
                    </p>
                    <p className="report-chart-kpi-meta mt-1 text-[13px] leading-snug text-slate-500">
                      {showAnnualDailyAverage
                        ? selectedYear === todayYear
                          ? "Hasta hoy"
                          : "Año completo"
                        : selectedYear === todayYear
                          ? "Meses transcurridos"
                          : "Año completo"}
                    </p>
                  </button>
                </div>
              </div>

              <div
                className={`transition-all duration-200 ease-out ${
                  annualTransitionActive
                    ? "translate-y-0 opacity-100"
                    : "translate-y-1 opacity-0"
                }`}
              >
                <div className="overflow-x-auto">
                  <div className="w-full rounded-[28px] border border-slate-200 bg-slate-50 px-5 py-3">
                  <svg
                    viewBox={`0 0 ${annualChart.width} ${annualChart.height}`}
                    className="block w-full"
                    role="img"
                    aria-label={`Evolución mensual ${selectedYear}`}
                  >
                    {chartTicks.map((tick) => {
                      const y =
                        annualChart.topPadding +
                        (1 - tick) * annualChart.chartHeight;
                      return (
                        <line
                          key={`annual-line-${tick}`}
                          x1={0}
                          y1={y}
                          x2={annualChart.width}
                          y2={y}
                          stroke="#cbd5e1"
                          strokeDasharray="4 4"
                        />
                      );
                    })}

                    {averageMonthSales > 0 ? (
                      <line
                        x1={0}
                        y1={
                          annualChart.baselineY -
                          (averageMonthSales / maxValue) * annualChart.chartHeight
                        }
                        x2={annualChart.width}
                        y2={
                          annualChart.baselineY -
                          (averageMonthSales / maxValue) * annualChart.chartHeight
                        }
                        stroke="#10b981"
                        strokeOpacity="0.45"
                        strokeDasharray="6 6"
                      />
                    ) : null}

                    {monthlyData.map((month, index) => {
                      const isCurrentMonth =
                        selectedYear === todayYear && month.key === todayMonthKey.slice(5, 7);
                      const hasSales = month.total > 0;
                      const barHeight = hasSales
                        ? Math.max(
                            24,
                            (month.total / maxValue) * annualChart.chartHeight
                          )
                        : 6;
                      const x =
                        annualChart.leftPadding +
                        index * annualChart.slotWidth +
                        (annualChart.slotWidth - annualChart.barWidth) / 2;
                      const y = annualChart.baselineY - barHeight;
                      const labelX = x + annualChart.barWidth / 2;

                      return (
                        <g
                          key={month.key}
                          role="button"
                          tabIndex={0}
                          className="cursor-pointer"
                          aria-label={`Ver detalle de ${month.label} ${selectedYear}`}
                          onClick={() =>
                            setSelectedMonthKey(`${selectedYear}-${month.key}`)
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedMonthKey(`${selectedYear}-${month.key}`);
                            }
                          }}
                        >
                          <title>{`Tickets del mes: ${month.tickets}\nTotal del mes: ${formatMoney(
                            month.total
                          )}`}</title>
                          <text
                            x={labelX}
                            y={Math.max(14, y - 20)}
                            textAnchor="middle"
                            fontSize="11"
                            fontWeight="700"
                            fill="#475569"
                          >
                            {formatCompactMoney(month.total)}
                          </text>
                          <text
                            x={labelX}
                            y={Math.max(25, y - 6)}
                            textAnchor="middle"
                            fontSize="11"
                            fontWeight="700"
                            fill="#334155"
                          >
                            {month.tickets}
                          </text>
                          <rect
                            x={x}
                            y={y}
                            width={annualChart.barWidth}
                            height={barHeight}
                            fill={
                              isCurrentMonth
                                ? "#10b981"
                                : hasSales
                                ? "#334155"
                                : "#cbd5e1"
                            }
                          />
                          <text
                            x={labelX}
                            y={annualChart.baselineY + 16}
                            textAnchor="middle"
                            fontSize="14"
                            fontWeight="700"
                            fill="#334155"
                          >
                            {month.label}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="report-view-kicker text-xs font-semibold uppercase tracking-[0.22em] text-emerald-500">
                    Vista mensual
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <NavigationButton
                      direction="left"
                      onClick={() =>
                        setSelectedMonthKey((current) => shiftMonthKey(current, -1))
                      }
                      disabled={selectedMonthKey <= minMonthKey}
                      label="Ver mes anterior"
                    />
                    <h2 className="report-view-title font-semibold leading-tight text-slate-900">
                      {currentMonthLabel}
                    </h2>
                    <NavigationButton
                      direction="right"
                      onClick={() =>
                        setSelectedMonthKey((current) => shiftMonthKey(current, 1))
                      }
                      disabled={selectedMonthKey >= maxMonthKey}
                      label="Ver mes siguiente"
                    />
                  </div>
                  <p className="report-view-subtitle mt-1 text-sm text-slate-500">
                    Comportamiento día a día del mes seleccionado.
                  </p>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <div className="report-chart-kpi min-h-[80px] w-[220px] max-w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1.5 max-sm:w-full">
                    <p className="report-chart-kpi-label text-[11px] uppercase tracking-wide text-slate-500">
                      Venta del mes
                    </p>
                    <p className="report-chart-kpi-value mt-1 text-[18px] font-bold leading-none tracking-tight text-slate-900">
                      {formatMoney(totalMonthSales)}
                    </p>
                    <p className="report-chart-kpi-meta mt-1 text-[13px] leading-snug text-slate-500">
                      {monthSalesChange
                        ? `${monthSalesChange} ${
                            selectedMonthKey === todayMonthKey
                              ? "vs corte mes anterior"
                              : "vs mes anterior"
                          }`
                        : "Sin base comparativa"}
                    </p>
                  </div>
                  <div className="report-chart-kpi min-h-[80px] w-[240px] max-w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1.5 max-sm:w-full">
                    <p className="report-chart-kpi-label text-[11px] uppercase tracking-wide text-slate-500">
                      {selectedDay == null ? "Día líder" : "Día seleccionado"}
                    </p>
                    <p className="report-chart-kpi-value mt-1 text-[18px] font-bold leading-none tracking-tight text-slate-900">
                      {activeDay ? `${activeDay.label} ${activeDay.weekday}` : "—"}
                    </p>
                    <p className="report-chart-kpi-meta text-[13px] text-emerald-600">
                      {activeDay ? formatMoney(activeDay.total) : "$0"}
                    </p>
                  </div>
                  <div className="report-chart-kpi min-h-[80px] w-[200px] max-w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1.5 max-sm:w-full">
                    <p className="report-chart-kpi-label text-[11px] uppercase tracking-wide text-slate-500">
                      Tickets del mes
                    </p>
                    <p className="report-chart-kpi-value mt-1 text-[18px] font-bold leading-none tracking-tight text-slate-900">
                      {formatCount(totalMonthTickets)}
                    </p>
                  </div>
                  <div className="report-chart-kpi min-h-[80px] w-[200px] max-w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1.5 max-sm:w-full">
                    <p className="report-chart-kpi-label text-[11px] uppercase tracking-wide text-slate-500">
                      Promedio diario
                    </p>
                    <p className="report-chart-kpi-value mt-1 text-[18px] font-bold leading-none tracking-tight text-slate-900">
                      {formatMoney(averageDaySales)}
                    </p>
                  </div>
                </div>
              </div>

              <div
                className={`relative h-[235px] overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50 transition-all duration-200 ease-out ${
                  monthlyTransitionActive
                    ? "translate-y-0 opacity-100"
                    : "translate-y-1 opacity-0"
                }`}
              >
                <div className="h-full overflow-x-auto px-5 py-2">
                  <div className="min-w-[1180px]">
                    <svg
                      viewBox={`0 0 ${dailyChart.width} ${dailyChart.height}`}
                      className="block min-w-[1180px]"
                      role="img"
                      aria-label={`Evolución diaria ${selectedMonthKey}`}
                    >
                    {chartTicks.map((tick) => {
                      const y =
                        dailyChart.topPadding +
                        (1 - tick) * dailyChart.chartHeight;
                        return (
                          <line
                            key={`day-line-${tick}`}
                            x1={0}
                            y1={y}
                            x2={dailyChart.width}
                            y2={y}
                            stroke="#cbd5e1"
                            strokeDasharray="4 4"
                        />
                      );
                    })}

                    {averageDaySales > 0 ? (
                      <line
                        x1={0}
                        y1={
                          dailyChart.baselineY -
                          (averageDaySales / maxDailyValue) * dailyChart.chartHeight
                        }
                        x2={dailyChart.width}
                        y2={
                          dailyChart.baselineY -
                          (averageDaySales / maxDailyValue) * dailyChart.chartHeight
                        }
                        stroke="#10b981"
                        strokeOpacity="0.45"
                        strokeDasharray="6 6"
                      />
                    ) : null}

                    {dailyData.map((day, index) => {
                        const isCurrentDay =
                          isViewingCurrentMonth && day.day === currentDayKey;
                        const hasSales = day.total > 0;
                        const barHeight = hasSales
                          ? Math.max(
                              22,
                              (day.total / maxDailyValue) *
                                dailyChart.chartHeight
                            )
                          : 3;
                        const x =
                          dailyChart.leftPadding +
                          index * dailyChart.slotWidth +
                          (dailyChart.slotWidth - dailyChart.barWidth) / 2;
                        const y = dailyChart.baselineY - barHeight;
                        const labelX = x + dailyChart.barWidth / 2;

                        return (
                          <g
                            key={day.day}
                            role="button"
                            tabIndex={0}
                            className="cursor-pointer"
                            aria-label={`Ver resumen del día ${day.label} ${day.weekday}`}
                            onClick={() => setSelectedDay(day.day)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setSelectedDay(day.day);
                              }
                            }}
                          >
                            <title>{`Tickets del día: ${day.tickets}\nTotal del día: ${formatMoney(
                              day.total
                            )}`}</title>
                            <text
                              x={labelX}
                              y={Math.max(14, y - 20)}
                              textAnchor="middle"
                              fontSize="9"
                              fontWeight="700"
                              fill="#475569"
                            >
                              {formatCompactMoney(day.total)}
                            </text>
                            <text
                              x={labelX}
                              y={Math.max(24, y - 7)}
                              textAnchor="middle"
                              fontSize="9"
                              fontWeight="700"
                              fill="#334155"
                            >
                              {day.tickets}
                            </text>
                            <rect
                              x={x}
                              y={y}
                              width={dailyChart.barWidth}
                              height={barHeight}
                              fill={
                                isCurrentDay
                                  ? "#10b981"
                                  : hasSales
                                  ? "#334155"
                                  : "#cbd5e1"
                              }
                            />
                            <text
                              x={labelX}
                              y={dailyChart.baselineY + 14}
                              textAnchor="middle"
                              fontSize="11"
                              fontWeight="700"
                              fill="#334155"
                            >
                              {day.label}
                            </text>
                            <text
                              x={labelX}
                              y={dailyChart.baselineY + 26}
                              textAnchor="middle"
                              fontSize="9"
                              fontWeight="600"
                              fill="#64748b"
                            >
                              {day.weekday}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                </div>

                {selectedDay != null ? (
                  <div
                    className={`absolute inset-0 z-10 overflow-hidden bg-slate-50 px-3 py-2 transition-all duration-200 ease-out ${
                      selectedDay != null
                        ? "translate-y-0 opacity-100"
                        : "pointer-events-none translate-y-2 opacity-0"
                    }`}
                    onClick={() => setSelectedDay(null)}
                  >
                    <div
                      className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden"
                      ref={dailyDetailRef}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="flex flex-none flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-500">
                            Detalle del día
                          </p>
                          <h3 className="mt-0.5 text-[1.05rem] font-semibold text-slate-900">
                            {selectedDayLabel
                              ? `${selectedDayLabel} · ${currentMonthLabel}`
                              : currentMonthLabel}
                          </h3>
                          <p className="mt-0.5 text-[13px] text-slate-500">
                            Haz click fuera o usa volver para regresar al gráfico.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedDay(null)}
                        className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700"
                        >
                          Volver al gráfico
                        </button>
                      </div>

                      <div className="mt-2 grid min-h-0 flex-1 gap-2 overflow-hidden lg:grid-cols-2">
                        <div className="grid content-start gap-2 overflow-y-auto pr-1">
                          <div className="min-h-[78px] rounded-2xl border border-slate-200 bg-white px-3 py-1.5">
                            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                              Venta del día
                            </p>
                            <p className="mt-1 text-[1.15rem] font-bold leading-none text-slate-900">
                              {formatMoney(selectedDayTotal)}
                            </p>
                          </div>
                          <div>
                            <div className="min-h-[78px] rounded-2xl border border-slate-200 bg-white px-3 py-1.5">
                              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                                Tickets
                              </p>
                              <p className="mt-1 text-[1.15rem] font-bold leading-none text-slate-900">
                                {formatCount(selectedDayTickets)}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white px-3 py-2">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                            Métodos de pago
                          </p>
                          <div className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                            {selectedDayMethods.length ? (
                              selectedDayMethods.map((entry) => (
                                <div key={entry.method}>
                                  <div className="flex items-center justify-between gap-4">
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-semibold text-slate-900">
                                        {entry.method}
                                        <span className="ml-2 text-[11px] font-medium text-slate-500">
                                          {formatCount(entry.tickets)} tickets
                                        </span>
                                      </p>
                                    </div>
                                    <p className="shrink-0 text-sm font-semibold text-slate-900">
                                      {formatMoney(entry.total)}
                                    </p>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="py-2 text-sm text-slate-500">
                                No hay métodos de pago disponibles para este día.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-500">
                      Top productos
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-900">
                      Productos del mes
                    </h3>
                  </div>

                  <div className="space-y-2">
                    {topProducts.length ? (
                      topProducts.map((product, index) => (
                        <div
                          key={`${product.name}-${index}`}
                          className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {product.name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {formatCount(product.units)} unidades
                            </p>
                          </div>
                          <p className="shrink-0 text-sm font-semibold text-slate-900">
                            {formatMoney(product.total)}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                        No hay productos disponibles para este mes.
                      </div>
                    )}
                  </div>
                </section>

                <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-500">
                      Top grupos
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-900">
                      Grupos del mes
                    </h3>
                  </div>

                  <div className="space-y-2">
                    {topGroups.length ? (
                      topGroups.map((group, index) => (
                        <div
                          key={`${group.name}-${index}`}
                          className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {group.name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {formatCount(group.units)} unidades
                            </p>
                          </div>
                          <p className="shrink-0 text-sm font-semibold text-slate-900">
                            {formatMoney(group.total)}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                        No hay grupos disponibles para este mes.
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

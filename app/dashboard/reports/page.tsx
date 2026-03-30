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
import { getBogotaDateKey, parseDateInput } from "@/lib/time/bogota";

const REPORTS_CACHE_KEY = "kensar_reports_dataset";
const REPORTS_CACHE_TTL_MS = 5 * 60 * 1000;

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

type ReportSaleItem = {
  product_id?: number;
  product_name?: string;
  name?: string;
  product_sku?: string | null;
  product_group?: string | null;
  product_category?: string | null;
  quantity: number;
  unit_price?: number;
};

type ReportSaleReturnItem = {
  product_id?: number | null;
  product_name?: string | null;
  product_sku?: string | null;
  quantity?: number;
};

type ReportSaleReturn = {
  status?: string | null;
  voided_at?: string | null;
  items?: ReportSaleReturnItem[];
};

type ReportChangeReturnItem = {
  product_id: number;
  product_name?: string | null;
  product_sku?: string | null;
  quantity: number;
  unit_price_net?: number | null;
};

type ReportChangeNewItem = {
  product_id: number;
  product_name?: string | null;
  product_sku?: string | null;
  quantity: number;
  unit_price: number;
};

type ReportChange = {
  sale_id: number;
  status: string;
  voided_at?: string | null;
  items_returned: ReportChangeReturnItem[];
  items_new: ReportChangeNewItem[];
};

type ReportSale = {
  id: number;
  created_at: string;
  status?: string | null;
  total?: number;
  paid_amount?: number;
  payment_method?: string | null;
  payments?: Array<{ method?: string | null; amount?: number | null }>;
  cart_discount_value?: number | null;
  items?: ReportSaleItem[];
  returns?: ReportSaleReturn[];
};

type ReportDocumentAdjustment = {
  id: number;
  doc_id: number;
  total_delta?: number | null;
  created_at?: string;
};

type EnrichedSale = {
  id: number;
  dateKey: string;
  total: number;
  cart_discount_value: number | null;
  returns: ReportSaleReturn[];
  paymentMethod: string | null;
  payments: Array<{ method?: string | null; amount?: number | null }>;
  items: ReportSaleItem[];
};

type ProductCatalogRow = {
  id: number | string;
  sku?: string | null;
  name?: string | null;
  group_name?: string | null;
};

type ProductGroupLookup = {
  byId: Map<string, string>;
  bySku: Map<string, string>;
  byName: Map<string, string>;
};

type ReportsCachePayload = {
  savedAt: number;
  sales: EnrichedSale[];
  changes: ReportChange[];
  productGroupLookup: {
    byId: Array<[string, string]>;
    bySku: Array<[string, string]>;
    byName: Array<[string, string]>;
  };
};

const REPORT_PAGE_SIZE = 500;
const ADJUSTMENTS_CHUNK_SIZE = 200;
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

function formatPercentChange(current: number, previous: number) {
  if (!Number.isFinite(previous) || previous <= 0) return null;
  const change = ((current - previous) / previous) * 100;
  const sign = change > 0 ? "+" : "";
  return `${sign}${change.toLocaleString("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })}%`;
}

function formatMethodLabel(method: string | null | undefined) {
  if (!method) return "Sin método";
  const normalized = method.trim().toLowerCase();
  const methodLabels: Record<string, string> = {
    cash: "Efectivo",
    efectivo: "Efectivo",
    card: "Tarjeta",
    tarjeta: "Tarjeta",
    "credit card": "Tarjeta crédito",
    "tarjeta credito": "Tarjeta crédito",
    "tarjeta crédito": "Tarjeta crédito",
    "debit card": "Tarjeta débito",
    "tarjeta debito": "Tarjeta débito",
    "tarjeta débito": "Tarjeta débito",
    transfer: "Transferencia",
    transferencia: "Transferencia",
    qr: "QR",
    nequi: "Nequi",
    daviplata: "Daviplata",
  };
  return methodLabels[normalized] ?? capitalize(normalized);
}

function normalizeLookupValue(value: string | number | null | undefined) {
  if (value == null) return "";
  return String(value).trim().toLowerCase();
}

function resolveItemGroupName(
  item: ReportSaleItem,
  productGroupLookup: ProductGroupLookup
) {
  const byId =
    productGroupLookup.byId.get(normalizeLookupValue(item.product_id)) ?? "";
  if (byId) return byId;

  const bySku =
    productGroupLookup.bySku.get(normalizeLookupValue(item.product_sku)) ?? "";
  if (bySku) return bySku;

  const itemName = item.product_name?.trim() || item.name?.trim() || "";
  const byName = productGroupLookup.byName.get(normalizeLookupValue(itemName)) ?? "";
  if (byName) return byName;

  const groupName = item.product_group?.trim() || "";
  const subGroupName = item.product_category?.trim() || "";
  if (groupName && subGroupName && subGroupName !== groupName) {
    return `${groupName} / ${subGroupName}`;
  }
  return groupName || subGroupName || "";
}

function aggregatePaymentMethods(sales: EnrichedSale[]) {
  const methodMap = new Map<string, { total: number; tickets: number }>();

  const combineSale = (method: string, amount: number) => {
    const key = method || "Sin método";
    const current = methodMap.get(key) ?? { total: 0, tickets: 0 };
    current.total += amount;
    current.tickets += 1;
    methodMap.set(key, current);
  };

  sales.forEach((sale) => {
    const payments = sale.payments;
    if (Array.isArray(payments) && payments.length > 1) {
      const sumPayments = payments.reduce(
        (sum, payment) => sum + toNumber(payment.amount),
        0
      );
      payments.forEach((payment) => {
        const rawAmount = toNumber(payment.amount);
        const value =
          sumPayments > 0
            ? (rawAmount / sumPayments) * sale.total
            : sale.total / payments.length;
        combineSale(
          formatMethodLabel(payment.method ?? sale.paymentMethod),
          value
        );
      });
      return;
    }

    combineSale(
      formatMethodLabel(sale.paymentMethod ?? payments?.[0]?.method),
      sale.total
    );
  });

  const grandTotal = Array.from(methodMap.values()).reduce(
    (sum, entry) => sum + entry.total,
    0
  );

  return Array.from(methodMap.entries())
    .map(([method, entry]) => ({
      method,
      total: entry.total,
      tickets: entry.tickets,
      percentage: grandTotal > 0 ? (entry.total / grandTotal) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

const buildItemKey = (item: {
  product_id?: number | null;
  product_name?: string | null;
  product_sku?: string | null;
}) => {
  if (item.product_id != null) return `id:${item.product_id}`;
  const name = item.product_name ?? "";
  const sku = item.product_sku ?? "";
  return `name:${name}|sku:${sku}`;
};

function applyChangesToSaleItems(
  sale: EnrichedSale,
  changes: ReportChange[] | undefined
): ReportSaleItem[] {
  const sourceItems = sale.items ?? [];
  if (!sourceItems.length || !changes?.length) return sourceItems;

  const itemsMap = new Map<string, ReportSaleItem>();
  sourceItems.forEach((item) => {
    const key = buildItemKey(item);
    const quantity = Number(item.quantity ?? 0);
    if (quantity <= 0) return;
    itemsMap.set(key, { ...item });
  });

  changes.forEach((change) => {
    if (change.status !== "confirmed" || change.voided_at) return;

    change.items_returned?.forEach((item) => {
      const key = buildItemKey(item);
      const existing = itemsMap.get(key);
      const quantity = Number(item.quantity ?? 0);
      if (existing) {
        const nextQty = Number(existing.quantity ?? 0) - quantity;
        if (nextQty > 0) {
          existing.quantity = nextQty;
          itemsMap.set(key, existing);
        } else {
          itemsMap.delete(key);
        }
        return;
      }
      const fallbackKey = buildItemKey({
        product_name: item.product_name ?? undefined,
        product_sku: item.product_sku ?? undefined,
      });
      const fallback = itemsMap.get(fallbackKey);
      if (fallback) {
        const nextQty = Number(fallback.quantity ?? 0) - quantity;
        if (nextQty > 0) {
          fallback.quantity = nextQty;
          itemsMap.set(fallbackKey, fallback);
        } else {
          itemsMap.delete(fallbackKey);
        }
      }
    });

    change.items_new?.forEach((item) => {
      const key = buildItemKey(item);
      const existing = itemsMap.get(key);
      const quantity = Number(item.quantity ?? 0);
      if (existing) {
        existing.quantity = Number(existing.quantity ?? 0) + quantity;
        if (existing.unit_price == null) existing.unit_price = item.unit_price;
        if (!existing.product_name) existing.product_name = item.product_name ?? undefined;
        if (!existing.product_sku) existing.product_sku = item.product_sku ?? undefined;
        itemsMap.set(key, existing);
        return;
      }
      itemsMap.set(key, {
        product_id: item.product_id,
        product_name: item.product_name ?? undefined,
        product_sku: item.product_sku ?? undefined,
        quantity,
        unit_price: item.unit_price,
      });
    });
  });

  return Array.from(itemsMap.values()).filter(
    (item) => Number(item.quantity ?? 0) > 0
  );
}

function applyReturnsToSaleItems(sale: EnrichedSale, items: ReportSaleItem[]) {
  if (!items.length) return items;
  const returns = sale.returns ?? [];
  if (!returns.length) return items;

  const itemsMap = new Map<string, ReportSaleItem>();
  items.forEach((item) => {
    const key = buildItemKey(item);
    const quantity = Number(item.quantity ?? 0);
    if (quantity <= 0) return;
    itemsMap.set(key, { ...item });
  });

  returns.forEach((ret) => {
    if (ret.status && ret.status !== "confirmed") return;
    if (ret.voided_at) return;
    ret.items?.forEach((returnedItem) => {
      const key = buildItemKey(returnedItem);
      const existing = itemsMap.get(key);
      const quantity = Number(returnedItem.quantity ?? 0);
      if (quantity <= 0) return;
      if (existing) {
        const nextQty = Number(existing.quantity ?? 0) - quantity;
        if (nextQty > 0) {
          existing.quantity = nextQty;
          itemsMap.set(key, existing);
        } else {
          itemsMap.delete(key);
        }
        return;
      }
      const fallbackKey = buildItemKey({
        product_name: returnedItem.product_name ?? undefined,
        product_sku: returnedItem.product_sku ?? undefined,
      });
      const fallback = itemsMap.get(fallbackKey);
      if (fallback) {
        const nextQty = Number(fallback.quantity ?? 0) - quantity;
        if (nextQty > 0) {
          fallback.quantity = nextQty;
          itemsMap.set(fallbackKey, fallback);
        } else {
          itemsMap.delete(fallbackKey);
        }
      }
    });
  });

  return Array.from(itemsMap.values()).filter(
    (item) => Number(item.quantity ?? 0) > 0
  );
}

function applyCartDiscountToItems(
  sale: EnrichedSale,
  items: ReportSaleItem[]
): ReportSaleItem[] {
  const cartDiscount = Math.max(0, Number(sale.cart_discount_value ?? 0));
  if (cartDiscount <= 0 || items.length === 0) return items;

  const totals = items.map((item) => {
    const quantity = Math.max(0, Number(item.quantity ?? 0));
    const unitPrice = Math.max(0, Number(item.unit_price ?? 0));
    return { quantity, lineTotal: unitPrice * quantity };
  });
  const subtotal = totals.reduce((sum, entry) => sum + entry.lineTotal, 0);
  if (subtotal <= 0) return items;

  let remainingDiscount = Math.min(cartDiscount, subtotal);
  return items.map((item, index) => {
    const { quantity, lineTotal } = totals[index];
    if (quantity <= 0 || lineTotal <= 0) return item;
    const rawShare =
      index === items.length - 1
        ? remainingDiscount
        : (lineTotal / subtotal) * cartDiscount;
    const discountShare = Math.max(0, Math.min(rawShare, remainingDiscount));
    remainingDiscount -= discountShare;
    const netLineTotal = Math.max(0, lineTotal - discountShare);
    const unitPriceNet = netLineTotal / quantity;
    return {
      ...item,
      unit_price: unitPriceNet,
    };
  });
}

function buildNetSaleItems(
  sale: EnrichedSale,
  changes: ReportChange[] | undefined
): ReportSaleItem[] {
  const changedItems = applyChangesToSaleItems(sale, changes);
  const netItems = applyReturnsToSaleItems(sale, changedItems);
  return applyCartDiscountToItems(sale, netItems);
}

function aggregateTopProducts(
  sales: EnrichedSale[],
  changesBySaleId: Map<number, ReportChange[]>
) {
  const productMap = new Map<string, { name: string; units: number; total: number }>();

  sales.forEach((sale) => {
    buildNetSaleItems(sale, changesBySaleId.get(sale.id)).forEach((item) => {
      const name =
        item.product_name?.trim() || item.name?.trim() || "Producto sin nombre";
      const quantity = Math.max(0, toNumber(item.quantity));
      const total = Math.max(0, toNumber(item.unit_price) * quantity);
      if (quantity <= 0 && total <= 0) return;
      const key = `${item.product_id ?? name}-${name}`;
      const current = productMap.get(key) ?? { name, units: 0, total: 0 };
      current.units += quantity;
      current.total += total;
      productMap.set(key, current);
    });
  });

  return Array.from(productMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
}

function aggregateTopGroups(
  sales: EnrichedSale[],
  changesBySaleId: Map<number, ReportChange[]>,
  productGroupLookup: ProductGroupLookup
) {
  const groupMap = new Map<string, { name: string; units: number; total: number }>();

  sales.forEach((sale) => {
    buildNetSaleItems(sale, changesBySaleId.get(sale.id)).forEach((item) => {
      const name = resolveItemGroupName(item, productGroupLookup) || "Sin grupo";
      const quantity = Math.max(0, toNumber(item.quantity));
      const total = Math.max(0, toNumber(item.unit_price) * quantity);
      if (quantity <= 0 && total <= 0) return;
      const current = groupMap.get(name) ?? { name, units: 0, total: 0 };
      current.units += quantity;
      current.total += total;
      groupMap.set(name, current);
    });
  });

  return Array.from(groupMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
}

function buildAdjustedSales(
  sales: ReportSale[],
  adjustments: ReportDocumentAdjustment[]
): EnrichedSale[] {
  const adjustmentsMap = new Map<number, number>();
  adjustments.forEach((entry) => {
    adjustmentsMap.set(
      entry.doc_id,
      (adjustmentsMap.get(entry.doc_id) ?? 0) + toNumber(entry.total_delta)
    );
  });

  return sales
    .map((sale) => {
      const date = parseDateInput(sale.created_at);
      const dateKey = getBogotaDateKey(sale.created_at);
      if (!date || !dateKey) return null;
      const baseTotal = toNumber(sale.total ?? sale.paid_amount);
      const adjustedTotal =
        sale.status === "voided"
          ? 0
          : Math.max(0, baseTotal + (adjustmentsMap.get(sale.id) ?? 0));
      return {
        id: sale.id,
        dateKey,
        total: adjustedTotal,
        cart_discount_value: sale.cart_discount_value ?? null,
        returns: Array.isArray(sale.returns) ? sale.returns : [],
        paymentMethod: sale.payment_method ?? null,
        payments: Array.isArray(sale.payments) ? sale.payments : [],
        items: Array.isArray(sale.items) ? sale.items : [],
      };
    })
    .filter((sale): sale is EnrichedSale => sale !== null);
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
  const [sales, setSales] = useState<EnrichedSale[]>([]);
  const [changes, setChanges] = useState<ReportChange[]>([]);
  const [productGroupLookup, setProductGroupLookup] = useState<ProductGroupLookup>({
    byId: new Map(),
    bySku: new Map(),
    byName: new Map(),
  });
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

  const readReportsCache = useCallback(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.sessionStorage.getItem(REPORTS_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as ReportsCachePayload;
      if (!parsed?.savedAt || Date.now() - parsed.savedAt > REPORTS_CACHE_TTL_MS) {
        return null;
      }
      return parsed;
    } catch (err) {
      console.warn("No se pudo leer caché de reportes", err);
      return null;
    }
  }, []);

  const writeReportsCache = useCallback((payload: ReportsCachePayload) => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(REPORTS_CACHE_KEY, JSON.stringify(payload));
    } catch (err) {
      console.warn("No se pudo guardar caché de reportes", err);
    }
  }, []);

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
      setSales([]);
      setChanges([]);
      setProductGroupLookup({ byId: new Map(), bySku: new Map(), byName: new Map() });
      setLoading(false);
      setError(null);
      return;
    }
    if (!authHeaders) return;
    const requestHeaders: HeadersInit = authHeaders;
    let cancelled = false;

    async function loadSales() {
      try {
        setLoading(true);
        setError(null);
        const cached = readReportsCache();
        if (cached) {
          if (!cancelled) {
            setSales(cached.sales);
            setChanges(cached.changes);
            setProductGroupLookup({
              byId: new Map(cached.productGroupLookup.byId),
              bySku: new Map(cached.productGroupLookup.bySku),
              byName: new Map(cached.productGroupLookup.byName),
            });
          }
          return;
        }
        const apiBase = getApiBase();

        const fetchAllPages = async <T,>(path: string): Promise<T[]> => {
          const rows: T[] = [];
          let skip = 0;
          for (;;) {
            const res = await fetch(
              `${apiBase}${path}?skip=${skip}&limit=${REPORT_PAGE_SIZE}`,
              {
                headers: requestHeaders,
                credentials: "include",
              }
            );
            if (!res.ok) throw new Error(`Error ${res.status}`);
            const page: T[] = await res.json();
            rows.push(...page);
            if (page.length < REPORT_PAGE_SIZE) break;
            skip += page.length;
          }
          return rows;
        };

        const rawSales = await fetchAllPages<ReportSale>("/pos/sales");
        const rawChanges = await fetchAllPages<ReportChange>("/pos/changes");
        const rawProducts = await fetchAllPages<ProductCatalogRow>("/products/");
        const adjustments: ReportDocumentAdjustment[] = [];

        if (rawSales.length > 0) {
          const ids = rawSales.map((sale) => sale.id);
          for (let index = 0; index < ids.length; index += ADJUSTMENTS_CHUNK_SIZE) {
            const chunk = ids.slice(index, index + ADJUSTMENTS_CHUNK_SIZE);
            const res = await fetch(
              `${apiBase}/pos/documents/adjustments?doc_type=sale&doc_ids=${chunk.join(",")}`,
              {
                headers: requestHeaders,
                credentials: "include",
              }
            );
            if (!res.ok) continue;
            const batch: ReportDocumentAdjustment[] = await res.json();
            adjustments.push(...batch);
          }
        }

        if (!cancelled) {
          const adjustedSales = buildAdjustedSales(rawSales, adjustments);
          setSales(adjustedSales);
          setChanges(rawChanges);
          const byId = new Map<string, string>();
          const bySku = new Map<string, string>();
          const byName = new Map<string, string>();

          rawProducts.forEach((product) => {
            const groupName =
              typeof product.group_name === "string"
                ? product.group_name.trim()
                : "";
            if (!groupName) return;

            const idKey = normalizeLookupValue(product.id);
            if (idKey) byId.set(idKey, groupName);

            const skuKey = normalizeLookupValue(product.sku);
            if (skuKey) bySku.set(skuKey, groupName);

            const nameKey = normalizeLookupValue(product.name);
            if (nameKey) byName.set(nameKey, groupName);
          });

          setProductGroupLookup({ byId, bySku, byName });
          writeReportsCache({
            savedAt: Date.now(),
            sales: adjustedSales,
            changes: rawChanges,
            productGroupLookup: {
              byId: Array.from(byId.entries()),
              bySku: Array.from(bySku.entries()),
              byName: Array.from(byName.entries()),
            },
          });
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

    void loadSales();
    return () => {
      cancelled = true;
    };
  }, [authHeaders, canViewReportDataset, readReportsCache, writeReportsCache]);

  const availableYears = useMemo(() => {
    const years = new Set<string>([todayYear]);
    sales.forEach((sale) => years.add(sale.dateKey.slice(0, 4)));
    return Array.from(years).sort((a, b) => Number(a) - Number(b));
  }, [sales, todayYear]);
  const minYear = availableYears[0] ?? todayYear;
  const maxYear = availableYears[availableYears.length - 1] ?? todayYear;

  const availableMonthKeys = useMemo(() => {
    const months = new Set<string>([todayMonthKey]);
    sales.forEach((sale) => months.add(sale.dateKey.slice(0, 7)));
    return Array.from(months).sort();
  }, [sales, todayMonthKey]);
  const minMonthKey = availableMonthKeys[0] ?? todayMonthKey;
  const maxMonthKey = availableMonthKeys[availableMonthKeys.length - 1] ?? todayMonthKey;

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
    sales.forEach((sale) => {
      if (!sale.dateKey.startsWith(`${selectedYear}-`)) return;
      const monthKey = sale.dateKey.slice(5, 7);
      const current = totals.get(monthKey) ?? { total: 0, tickets: 0 };
      current.total += sale.total;
      if (sale.total > 0) current.tickets += 1;
      totals.set(monthKey, current);
    });
    return MONTHS.map((month) => ({
      ...month,
      total: totals.get(month.key)?.total ?? 0,
      tickets: totals.get(month.key)?.tickets ?? 0,
    }));
  }, [sales, selectedYear]);

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
      const todayInBogota = parseDateInput(`${todayKey}T12:00:00-05:00`);
      if (!todayInBogota) return 1;
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
    const previousYear = String(Number(selectedYear) - 1);
    return sales.reduce((sum, sale) => {
      if (!sale.dateKey.startsWith(`${previousYear}-`)) return sum;
      return sum + sale.total;
    }, 0);
  }, [sales, selectedYear]);
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
    sales.forEach((sale) => {
      if (!sale.dateKey.startsWith(selectedMonthKey)) return;
      const day = Number(sale.dateKey.slice(8, 10));
      const current = totals.get(day) ?? { total: 0, tickets: 0 };
      current.total += sale.total;
      if (sale.total > 0) current.tickets += 1;
      totals.set(day, current);
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
  }, [currentMonthDays, sales, selectedMonthKey, selectedMonthNumber]);
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
    const previousMonthKey = shiftMonthKey(selectedMonthKey, -1);
    const isCurrentMonthComparison = selectedMonthKey === todayMonthKey;
    const cutoffDay = isCurrentMonthComparison
      ? Math.min(currentDayKey, getMonthDayCount(previousMonthKey))
      : null;
    return sales.reduce((sum, sale) => {
      if (!sale.dateKey.startsWith(previousMonthKey)) return sum;
      if (cutoffDay != null && Number(sale.dateKey.slice(8, 10)) > cutoffDay) {
        return sum;
      }
      return sum + sale.total;
    }, 0);
  }, [currentDayKey, sales, selectedMonthKey, todayMonthKey]);
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
  const selectedDaySales = useMemo(() => {
    if (selectedDay == null) return [];
    const dayKey = `${selectedMonthKey}-${String(selectedDay).padStart(2, "0")}`;
    return sales.filter((sale) => sale.dateKey === dayKey);
  }, [sales, selectedDay, selectedMonthKey]);
  const selectedDayMethods = useMemo(
    () => aggregatePaymentMethods(selectedDaySales),
    [selectedDaySales]
  );
  const selectedDayTotal = useMemo(
    () => selectedDaySales.reduce((sum, sale) => sum + sale.total, 0),
    [selectedDaySales]
  );
  const selectedDayLabel = useMemo(() => {
    if (selectedDay == null) return null;
    const day = dailyData.find((entry) => entry.day === selectedDay);
    if (!day) return null;
    return `${day.label} ${day.weekday}`;
  }, [dailyData, selectedDay]);
  const selectedMonthSales = useMemo(
    () => sales.filter((sale) => sale.dateKey.startsWith(selectedMonthKey)),
    [sales, selectedMonthKey]
  );
  const changesBySaleId = useMemo(() => {
    const map = new Map<number, ReportChange[]>();
    changes.forEach((change) => {
      const list = map.get(change.sale_id) ?? [];
      list.push(change);
      map.set(change.sale_id, list);
    });
    return map;
  }, [changes]);
  const topProducts = useMemo(
    () => aggregateTopProducts(selectedMonthSales, changesBySaleId),
    [changesBySaleId, selectedMonthSales]
  );
  const topGroups = useMemo(
    () => aggregateTopGroups(selectedMonthSales, changesBySaleId, productGroupLookup),
    [changesBySaleId, productGroupLookup, selectedMonthSales]
  );
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

  return (
    <main className="flex-1 px-6 py-4 text-slate-900">
      <div className="mx-auto w-full max-w-7xl space-y-4">
        <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-500">
              Reportes
            </p>
            <h1 className="mt-1 text-[1.6rem] font-bold leading-tight text-slate-900">
              Ventas mensuales del año actual
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Empezamos por una sola lectura clara: la evolución mes a mes del
              año {selectedYear}.
            </p>
          </div>
          <Link
            href="/dashboard/reports/detailed"
            className="inline-flex rounded-full border border-emerald-400/70 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
          >
            Ir a reportes detallados
          </Link>
        </header>

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
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-500">
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
                    <h2 className="text-[1.45rem] font-semibold leading-tight text-slate-900">
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
                  <p className="mt-1 text-sm text-slate-500">
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
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-500">
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
                    <h2 className="text-[1.45rem] font-semibold leading-tight text-slate-900">
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
                  <p className="mt-1 text-sm text-slate-500">
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
                                {formatCount(selectedDaySales.length)}
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

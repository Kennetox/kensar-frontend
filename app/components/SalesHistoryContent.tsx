"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../providers/AuthProvider";
import { getApiBase } from "@/lib/api/base";
import {
  fetchPosSettings,
  fetchPosStations,
  PosSettingsPayload,
  PosStationRecord,
} from "@/lib/api/settings";
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
import {
  renderReturnTicket,
  renderChangeTicket,
  renderSaleTicket,
  buildSaleTicketCustomer,
} from "@/lib/printing/saleTicket";
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

type SaleItem = {
  id?: number;
  product_name?: string;
  name?: string;
  quantity: number;
  total?: number;
  unit_price?: number;
  unit_price_original?: number;
  discount?: number;
  line_discount_value?: number;
};

type Payment = {
  id?: number;
  method: string;
  amount: number;
};

type DocumentAdjustmentRecord = {
  id: number;
  doc_id: number;
  adjustment_type: "payment" | "discount" | "note";
  reason?: string | null;
  payload?: Record<string, unknown> | null;
  total_delta: number;
  created_at: string;
};

type RefundPayment = {
  method: string;
  amount: number;
};

type SaleReturnSummary = {
  id: number;
  document_number?: string;
  created_at?: string;
  total?: number;
};

type SaleChangeSummary = {
  id: number;
  document_number?: string;
  created_at?: string;
  extra_payment?: number;
  refund_due?: number;
  total_new?: number;
  total_credit?: number;
  items_returned?: ChangeReturnItemDetail[];
  items_new?: ChangeNewItemDetail[];
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
  created_at?: string;
  total_refund: number;
  notes?: string | null;
  created_by?: string | null;
  items: ReturnItemDetail[];
  payments: ReturnPaymentDetail[];
};

type ChangeReturnItemDetail = {
  id?: number;
  product_name: string;
  product_sku?: string | null;
  quantity: number;
  unit_price_net: number;
  total_credit: number;
};

type ChangeNewItemDetail = {
  id?: number;
  product_name: string;
  product_sku?: string | null;
  quantity: number;
  unit_price: number;
  total: number;
};

type ChangePaymentDetail = {
  method: string;
  amount: number;
};

type SaleChangeDetail = {
  id: number;
  document_number?: string;
  created_at?: string;
  total_credit: number;
  total_new: number;
  extra_payment: number;
  refund_due: number;
  notes?: string | null;
  created_by?: string | null;
  items_returned: ChangeReturnItemDetail[];
  items_new: ChangeNewItemDetail[];
  payments: ChangePaymentDetail[];
};

type Sale = {
  id: number;
  sale_number?: number;
  document_number?: string;
  created_at: string;
  closure_id?: number | null;
  status?: string;
  pos_name?: string | null;
  vendor_name?: string | null;
  total?: number;
  paid_amount?: number;
  change?: number;
  payment_method: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  customer_tax_id?: string | null;
  customer_address?: string | null;
  notes?: string | null;
  items?: SaleItem[];
  payments?: Payment[];
  cart_discount_value?: number | null;
  cart_discount_percent?: number | null;
  refund_count?: number | null;
  refunded_total?: number | null;
  refunded_balance?: number | null;
  returns?: SaleReturnSummary[];
  changes?: SaleChangeSummary[];
  refunded_payments?: RefundPayment[];
  is_separated?: boolean;
  initial_payment_method?: string | null;
  initial_payment_amount?: number | null;
  balance?: number | null;
  surcharge_amount?: number | null;
  surcharge_label?: string | null;
};

type SeparatedOrderSummary = SeparatedOrder;

function getSeparatedOrderPaidTotal(
  order?: SeparatedOrderSummary | null
): number {
  if (!order) return 0;
  const extraPayments = order.payments?.reduce(
    (sum, payment) => sum + (payment.amount ?? 0),
    0
  );
  return (order.initial_payment ?? 0) + (extraPayments ?? 0);
}

function formatMoney(value: number | undefined | null): string {
  if (value == null || Number.isNaN(value)) return "0";
  return value.toLocaleString("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatDateTime(value: string): string {
  const formatted = formatBogotaDate(value, {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return formatted || value;
}

function formatDateInputValue(date: Date): string {
  return getBogotaDateKey(date) ?? "";
}

function formatShortDate(value: string): string {
  return formatBogotaDate(value, { day: "2-digit", month: "short" }) || "";
}

function getAdjustedPaymentsFromAdjustments(
  adjustments: DocumentAdjustmentRecord[]
) {
  const withPayments = adjustments
    .filter((entry) => entry.payload && typeof entry.payload === "object")
    .map((entry) => {
      const payload = entry.payload as Record<string, unknown>;
      const paymentsRaw = payload.payments;
      return Array.isArray(paymentsRaw)
        ? { entry, paymentsRaw }
        : null;
    })
    .filter(
      (
        candidate
      ): candidate is { entry: DocumentAdjustmentRecord; paymentsRaw: unknown[] } =>
        !!candidate
    );
  if (!withPayments.length) return null;
  const latest = withPayments.reduce((current, next) => {
    const currentTime = new Date(current.entry.created_at).getTime();
    const nextTime = new Date(next.entry.created_at).getTime();
    if (!Number.isNaN(nextTime) && nextTime > currentTime) return next;
    return current;
  });
  const paymentsRaw = latest.paymentsRaw;
  const payments = paymentsRaw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const method = typeof record.method === "string" ? record.method : "";
      const amountValue =
        typeof record.amount === "number" || typeof record.amount === "string"
          ? record.amount
          : 0;
      const amount = Number(amountValue) || 0;
      if (!method) return null;
      return { method, amount };
    })
    .filter((entry): entry is { method: string; amount: number } => !!entry);
  return payments.length ? payments : null;
}

type QuickRange = "today" | "yesterday" | "thisWeek" | "thisMonth";

function getQuickRangeDates(range: QuickRange) {
  const todayKey = getBogotaDateKey();
  const todayStart = buildBogotaDateFromKey(todayKey);
  const dayMs = 24 * 60 * 60 * 1000;

  switch (range) {
    case "yesterday": {
      const formatted = getBogotaDateKey(
        new Date(todayStart.getTime() - dayMs)
      );
      return { from: formatted, to: formatted };
    }
    case "thisWeek": {
      const jsDay = todayStart.getUTCDay();
      const diffToMonday = (jsDay + 6) % 7;
      const startOfWeek = new Date(todayStart);
      startOfWeek.setUTCDate(todayStart.getUTCDate() - diffToMonday);
      return {
        from: getBogotaDateKey(startOfWeek),
        to: todayKey,
      };
    }
    case "thisMonth": {
      const { year, month } = getBogotaDateParts();
      const startOfMonth = buildBogotaDateFromKey(`${year}-${month}-01`);
      return {
        from: getBogotaDateKey(startOfMonth),
        to: todayKey,
      };
    }
    case "today":
    default: {
      return { from: todayKey, to: todayKey };
    }
  }
}

function sumSaleItemsTotal(items?: SaleItem[]): number {
  if (!items) return 0;
  return items.reduce((sum, item) => {
    const quantity = item.quantity ?? 1;
    const unitPrice = item.unit_price ?? 0;
    const lineTotal =
      item.total != null ? item.total : Math.max(0, quantity * unitPrice);
    return sum + lineTotal;
  }, 0);
}

function resolveSeparatedBaseTotal(
  sale?: Sale | null,
  fallbackTotal?: number | null,
  order?: SeparatedOrderSummary | null
): number | null {
  if (!sale || !sale.is_separated) return null;
  if (order?.total_amount && order.total_amount > 0) {
    return order.total_amount;
  }
  if (fallbackTotal != null && fallbackTotal > 0) {
    return fallbackTotal;
  }
  if (
    order &&
    order.initial_payment != null &&
    order.balance != null
  ) {
    return order.initial_payment + Math.max(order.balance, 0);
  }
  if (
    sale.initial_payment_amount != null &&
    (order?.balance ?? sale.balance) != null
  ) {
    return (
      sale.initial_payment_amount +
      Math.max(order?.balance ?? sale.balance ?? 0, 0)
    );
  }
  return sale.total ?? null;
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
    quantity,
    total,
    discount,
    subtotal,
    unitGross,
  };
}

function computeSaleSummary(sale: Sale | null) {
  if (!sale) {
    return {
      subtotal: 0,
      lineDiscount: 0,
      cartDiscount: 0,
      total: 0,
      paid: 0,
      cartDiscountPercent: 0,
      originalTotal: 0,
      originalPaid: 0,
      refundAmount: 0,
      surcharge: 0,
      surchargeLabel: null,
    };
  }
  if (sale.status === "voided") {
    return {
      subtotal: 0,
      lineDiscount: 0,
      cartDiscount: 0,
      total: 0,
      paid: 0,
      cartDiscountPercent: 0,
      originalTotal: 0,
      originalPaid: 0,
      refundAmount: 0,
      surcharge: 0,
      surchargeLabel: sale.surcharge_label ?? null,
    };
  }

  const items = sale.items ?? [];
  const lineData = items.map(computeLineBreakdown);

  const subtotalAccumulator = lineData.reduce(
    (sum, line) => sum + line.subtotal,
    0
  );
  const lineDiscountAccumulator = lineData.reduce(
    (sum, line) => sum + line.discount,
    0
  );
  const totalFromLines = lineData.reduce(
    (sum, line) => sum + line.total,
    0
  );

  const subtotal =
    subtotalAccumulator > 0 ? subtotalAccumulator : totalFromLines;

  const afterLineDiscount = subtotal - lineDiscountAccumulator;

  let cartDiscountValue =
    sale.cart_discount_value != null
      ? sale.cart_discount_value
      : 0;

  if (
    cartDiscountValue === 0 &&
    sale.cart_discount_percent &&
    afterLineDiscount > 0
  ) {
    cartDiscountValue =
      (afterLineDiscount * sale.cart_discount_percent) / 100;
  }

  if (
    cartDiscountValue === 0 &&
    sale.total != null &&
    sale.total <= afterLineDiscount
  ) {
    cartDiscountValue = Math.max(
      0,
      afterLineDiscount - sale.total
    );
  }

  const originalTotal =
    sale.total != null
      ? sale.total
      : Math.max(0, afterLineDiscount - cartDiscountValue);

  const refundedPaymentsTotal = sale.refunded_payments?.reduce(
    (sum, payment) => sum + (payment.amount ?? 0),
    0
  );
  const refundAmount = Math.max(
    0,
    refundedPaymentsTotal ?? sale.refunded_total ?? 0
  );

  const total =
    sale.refunded_balance != null
      ? Math.max(0, sale.refunded_balance)
      : Math.max(0, originalTotal - refundAmount);

  let originalPaid =
    sale.paid_amount != null ? sale.paid_amount : originalTotal;
  if (!sale.is_separated) {
    originalPaid = Math.min(originalPaid, originalTotal);
  }
  if (sale.is_separated) {
    if (sale.total != null && sale.balance != null) {
      originalPaid = Math.max(0, sale.total - sale.balance);
    } else if (sale.initial_payment_amount != null) {
      originalPaid = sale.initial_payment_amount;
    }
  }
  const paid = Math.max(0, originalPaid - refundAmount);
  const surchargeAmount = Math.max(0, sale.surcharge_amount ?? 0);

  return {
    subtotal,
    lineDiscount: Math.max(0, lineDiscountAccumulator),
    cartDiscount: Math.max(0, cartDiscountValue),
    total,
    paid,
    cartDiscountPercent: sale.cart_discount_percent ?? 0,
    originalTotal,
    originalPaid,
    refundAmount,
    surcharge: surchargeAmount,
    surchargeLabel: sale.surcharge_label ?? null,
  };
}

type SalesHistoryContentProps = {
  backPath: string;
  backLabel?: string;
  returnPath?: string;
  returnBackPath?: string;
  autoReturnOnSelect?: boolean;
  variant?: "dashboard" | "pos";
};

export default function SalesHistoryContent({
  backPath,
  backLabel,
  returnPath,
  returnBackPath,
  autoReturnOnSelect = false,
  variant = "dashboard",
}: SalesHistoryContentProps) {
  const router = useRouter();
  const apiBase = useMemo(() => getApiBase(), []);
  const shouldUseQz = backPath === "/pos";
  const isPosTheme = variant === "pos";
  const resolvedBackLabel =
    backLabel ?? (backPath === "/pos" ? "Volver al POS" : "Volver");

  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const saleRowRefs = useRef(new Map<number, HTMLDivElement>());

  const PAGE_SIZE = 100;
  const today = formatDateInputValue(new Date());
  const [filterFrom, setFilterFrom] = useState(today);
  const [filterTo, setFilterTo] = useState(today);
  const [filterTerm, setFilterTerm] = useState("");
  const [filterClient, setFilterClient] = useState("");
  const [filterPayment, setFilterPayment] = useState("");
  const [filterPos, setFilterPos] = useState("");
  const [posStations, setPosStations] = useState<PosStationRecord[]>([]);
  const [activeQuickRange, setActiveQuickRange] =
    useState<QuickRange | null>("today");
  const [currentPage, setCurrentPage] = useState(1);
  type SeparatedPaymentInfo = {
    paid_at: string;
    amount: number;
    method?: string | null;
  };
  const [separatedPaymentsMap, setSeparatedPaymentsMap] =
    useState<Record<number, SeparatedPaymentInfo[]>>({});
  const [salesAdjustments, setSalesAdjustments] = useState<
    Record<number, DocumentAdjustmentRecord[]>
  >({});
  const [emailSending, setEmailSending] = useState(false);
  const [emailFeedback, setEmailFeedback] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailRecipient, setEmailRecipient] = useState("");
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [showSaleDetails, setShowSaleDetails] = useState(false);
  const [returnPrintError, setReturnPrintError] = useState<string | null>(null);
  const [returnPrintLoading, setReturnPrintLoading] = useState(false);
  const [changePrintError, setChangePrintError] = useState<string | null>(null);
  const [changePrintLoading, setChangePrintLoading] = useState(false);
  const { token } = useAuth();
  const [posSettings, setPosSettings] =
    useState<PosSettingsPayload | null>(null);
  const [stationInfo, setStationInfo] = useState<PosStationAccess | null>(null);
  const [posMode, setPosMode] = useState<PosAccessMode | null>(null);
  const [printerConfig, setPrinterConfig] = useState<PosStationPrinterConfig>({
    mode: "qz-tray",
    printerName: "",
    width: "80mm",
    autoOpenDrawer: false,
    showDrawerButton: true,
  });
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
  const [selectedSeparatedOrder, setSelectedSeparatedOrder] =
    useState<SeparatedOrderSummary | null>(null);
  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : null),
    [token]
  );
  const { catalog, getPaymentLabel } =
    usePaymentMethodLabelResolver();
  const mapPaymentMethod = useCallback(
    (method?: string | null) => getPaymentLabel(method, "—"),
    [getPaymentLabel]
  );
  const isCashMethod = useCallback((method?: string | null) => {
    const normalized = (method ?? "").toLowerCase();
    return (
      normalized === "cash" ||
      normalized === "efectivo" ||
      normalized.includes("cash") ||
      normalized.includes("efectivo")
    );
  }, []);
  const activeStationId = useMemo(() => {
    if (!shouldUseQz) return null;
    return posMode === "station" ? stationInfo?.id ?? null : null;
  }, [posMode, stationInfo, shouldUseQz]);
  const printerStorageKey = useMemo(() => {
    const base = activeStationId ?? "pos-web";
    return `kensar_pos_printer_${base}`;
  }, [activeStationId]);
  const paymentOptions = useMemo(
    () =>
      [...catalog]
        .filter((method) => method.is_active)
        .sort((a, b) => a.order_index - b.order_index),
    [catalog]
  );
  const filterFromKey = useMemo(() => (filterFrom ? filterFrom : null), [
    filterFrom,
  ]);

  useEffect(() => {
    if (!shouldUseQz) return;
    if (typeof window === "undefined") return;
    const mode = ensureStoredPosMode();
    setPosMode(mode);
  }, [shouldUseQz]);

  useEffect(() => {
    if (!shouldUseQz) return;
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
  }, [posMode, shouldUseQz]);

  useEffect(() => {
    if (!shouldUseQz) return;
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
  }, [printerStorageKey, shouldUseQz]);
  useEffect(() => {
    if (!shouldUseQz) return;
    if (!token) return;
    if (!activeStationId) return;
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
  }, [shouldUseQz, token, activeStationId, apiBase, printerStorageKey]);

  useEffect(() => {
    if (!shouldUseQz) return;
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
    const existing = document.querySelector('script[data-qz-tray]') as HTMLScriptElement | null;
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
  }, [shouldUseQz]);

  const qzSecurityConfiguredRef = React.useRef(false);
  const configureQzSecurity = useCallback(() => {
    if (!shouldUseQz) return false;
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
  }, [apiBase, qzClient, shouldUseQz, token]);

  useEffect(() => {
    configureQzSecurity();
  }, [configureQzSecurity]);
  const filterToKey = useMemo(() => (filterTo ? filterTo : null), [
    filterTo,
  ]);
  const isWithinFilterRange = useCallback(
    (value?: string | null) => {
      if (!value) return false;
      const dateKey = getBogotaDateKey(value);
      if (!dateKey) return false;
      if (filterFromKey && dateKey < filterFromKey) return false;
      if (filterToKey && dateKey > filterToKey) return false;
      return true;
    },
    [filterFromKey, filterToKey]
  );
  const fetchSeparatedOrderForSale = useCallback(
    async (sale: Sale): Promise<SeparatedOrderSummary | null> => {
      if (!token || !sale.is_separated) return null;
      const params: Parameters<typeof fetchSeparatedOrders>[0] = {
        limit: 5,
      };
      if (sale.document_number) {
        params.barcode = sale.document_number;
      }
      if (sale.sale_number != null) {
        params.saleNumber = sale.sale_number;
      }
      const records = await fetchSeparatedOrders(params, token);
      return records.find((order) => order.sale_id === sale.id) ?? null;
    },
    [token]
  );

  useEffect(() => {
    if (!token || !selectedSale || !selectedSale.is_separated) {
      setSelectedSeparatedOrder(null);
      return;
    }
    const currentSale = selectedSale;
    let active = true;
    async function loadSeparated() {
      try {
        const order = await fetchSeparatedOrderForSale(currentSale);
        if (!active) return;
        setSelectedSeparatedOrder(order);
      } catch (err) {
        console.warn("No pudimos cargar la información del separado", err);
        if (!active) return;
        setSelectedSeparatedOrder(null);
      }
    }
    void loadSeparated();
    return () => {
      active = false;
    };
  }, [selectedSale, token, fetchSeparatedOrderForSale]);

  async function loadSales() {
    try {
      if (!authHeaders) throw new Error("Sin credenciales");
      setLoading(true);
      setError(null);

      const apiBase = getApiBase();
      const res = await fetch(
        `${apiBase}/pos/sales?skip=0&limit=200`,
        {
          headers: authHeaders,
          credentials: "include",
        }
      );

      if (!res.ok) {
        throw new Error(`Error ${res.status}`);
      }

      const json: Sale[] = await res.json();
      const ordered = [...json].sort((a, b) => {
        const aTime = parseDateInput(a.created_at)?.getTime() ?? 0;
        const bTime = parseDateInput(b.created_at)?.getTime() ?? 0;
        return bTime - aTime;
      });
      setSeparatedPaymentsMap({});
      setSales(ordered);
      if (ordered.length > 0) {
        const ids = ordered.map((sale) => sale.id);
        const adjustmentsRes = await fetch(
          `${apiBase}/pos/documents/adjustments?doc_type=sale&doc_ids=${ids.join(",")}`,
          {
            headers: authHeaders,
            credentials: "include",
          }
        );
        if (adjustmentsRes.ok) {
          const adjustments = (await adjustmentsRes.json()) as DocumentAdjustmentRecord[];
          const map: Record<number, DocumentAdjustmentRecord[]> = {};
          adjustments.forEach((adjustment) => {
            const list = map[adjustment.doc_id] ?? [];
            list.push(adjustment);
            map[adjustment.doc_id] = list;
          });
          setSalesAdjustments(map);
        } else {
          setSalesAdjustments({});
        }
      } else {
        setSalesAdjustments({});
      }

      if (!selectedSale && ordered.length > 0) {
        setSelectedSale(ordered[0]);
      }
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "Error al cargar el historial de ventas"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authHeaders) return;
    void loadSales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authHeaders]);

  const handleRefresh = () => {
    if (!authHeaders) return;
    void loadSales();
  };

  const handleReturnForSale = useCallback(
    (sale: Sale) => {
      if (!returnPath) return;
      const params = new URLSearchParams();
      params.set("saleId", sale.id.toString());
      if (returnBackPath) {
        params.set("back", returnBackPath);
      }
      const target = `${returnPath}?${params.toString()}`;
      router.push(target);
    },
    [returnPath, returnBackPath, router]
  );

  const handleReturn = () => {
    if (!returnPath || !selectedSale) return;
    handleReturnForSale(selectedSale);
  };

  const filteredSales = useMemo(() => {
    const term = filterTerm.trim().toLowerCase();
    const clientTerm = filterClient.trim().toLowerCase();
    const payment = filterPayment.trim().toLowerCase();
    const posFilter = filterPos.trim().toLowerCase();

    return sales.filter((sale) => {
      const createdInRange = isWithinFilterRange(sale.created_at);
      let hasMatchingAbono = false;
      if (!createdInRange && sale.is_separated) {
        const paymentEntries = separatedPaymentsMap[sale.id] ?? [];
        hasMatchingAbono = paymentEntries.some((payment) =>
          isWithinFilterRange(payment.paid_at)
        );
      }
      if (!createdInRange && !hasMatchingAbono) {
        return false;
      }

      if (term) {
        const saleNumberText = `${sale.sale_number ?? ""}`.toLowerCase();
        const docText = (sale.document_number ?? "").toLowerCase();
        const detailText = (sale.items ?? [])
          .map((item) => (item.product_name ?? item.name ?? "").toLowerCase())
          .join(" ");
        if (
          !saleNumberText.includes(term) &&
          !docText.includes(term) &&
          !detailText.includes(term)
        ) {
          return false;
        }
      }

      if (clientTerm) {
        if (!(sale.customer_name ?? "").toLowerCase().includes(clientTerm)) {
          return false;
        }
      }

      if (payment) {
        const adjustments = salesAdjustments[sale.id] ?? [];
        const adjustedPayments = getAdjustedPaymentsFromAdjustments(adjustments);
        const saleMethod = adjustedPayments?.length
          ? (adjustedPayments[0].method ?? "").toLowerCase()
          : (sale.payment_method ?? "").toLowerCase();
        const multiMatch = adjustedPayments?.length
          ? adjustedPayments.some(
              (p) => (p.method ?? "").toLowerCase() === payment
            )
          : (sale.payments ?? []).some(
              (p) => (p.method ?? "").toLowerCase() === payment
            ) || false;
        const separatedMatch =
          payment === "separado" && !!sale.is_separated;
        if (saleMethod !== payment && !multiMatch && !separatedMatch) {
          return false;
        }
      }

      if (posFilter) {
        const salePos = (sale.pos_name ?? "").toLowerCase();
        if (!salePos.includes(posFilter)) {
          return false;
        }
      }

      return true;
    });
  }, [
    sales,
    filterTerm,
    filterClient,
    filterPayment,
    filterPos,
    separatedPaymentsMap,
    salesAdjustments,
    isWithinFilterRange,
  ]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!filteredSales.length) return;

      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;

      e.preventDefault();

      const currentIndex = selectedSale
        ? filteredSales.findIndex((s) => s.id === selectedSale.id)
        : -1;

      if (e.key === "ArrowDown") {
        const nextIndex =
          currentIndex < 0
            ? 0
            : Math.min(filteredSales.length - 1, currentIndex + 1);
        const nextSale = filteredSales[nextIndex];
        if (nextSale) {
          const nextPage =
            Math.floor(nextIndex / PAGE_SIZE) + 1;
          if (nextPage !== currentPage) {
            setCurrentPage(nextPage);
          }
          setSelectedSale(nextSale);
        }
      }

      if (e.key === "ArrowUp") {
        const prevIndex =
          currentIndex < 0 ? 0 : Math.max(0, currentIndex - 1);
        const prevSale = filteredSales[prevIndex];
        if (prevSale) {
          const prevPage =
            Math.floor(prevIndex / PAGE_SIZE) + 1;
          if (prevPage !== currentPage) {
            setCurrentPage(prevPage);
          }
          setSelectedSale(prevSale);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredSales, selectedSale, currentPage]);

  useEffect(() => {
    let active = true;
    async function loadSettings() {
      if (!token) return;
      try {
        const data = await fetchPosSettings(token);
        if (!active) return;
        setPosSettings(data);
      } catch (err) {
        console.warn("No se pudieron cargar los ajustes del POS", err);
      }
    }
    void loadSettings();
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    let active = true;
    async function loadStations() {
      if (!token) return;
      try {
        const stations = await fetchPosStations(token);
        if (!active) return;
        setPosStations(stations);
      } catch (err) {
        console.warn("No se pudieron cargar estaciones POS", err);
      }
    }
    void loadStations();
    return () => {
      active = false;
    };
  }, [token]);

  const posOptions = useMemo(() => {
    const names = new Set<string>();
    names.add("POS Web");
    for (const station of posStations) {
      if (station.is_active) {
        names.add(station.label);
      }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [posStations]);

  const selectedSaleItemsTotal = useMemo(
    () => (selectedSale ? sumSaleItemsTotal(selectedSale.items) : null),
    [selectedSale]
  );
  const selectedSaleSeparatedTotal = useMemo(
    () =>
      resolveSeparatedBaseTotal(
        selectedSale,
        selectedSaleItemsTotal,
        selectedSeparatedOrder
      ),
    [selectedSale, selectedSaleItemsTotal, selectedSeparatedOrder]
  );
  const normalizedSelectedSale = useMemo(() => {
    if (!selectedSale || !selectedSaleSeparatedTotal) return selectedSale;
    if (!selectedSale.is_separated) return selectedSale;
    const shouldResetCartDiscount =
      selectedSale.total != null &&
      selectedSaleSeparatedTotal >
        (selectedSale.total ?? 0) + 0.5;
    return {
      ...selectedSale,
      total: selectedSaleSeparatedTotal,
      ...(shouldResetCartDiscount
        ? {
            cart_discount_value: 0,
            cart_discount_percent: 0,
          }
        : {}),
    };
  }, [selectedSale, selectedSaleSeparatedTotal]);

  const selectedAdjustments = useMemo(
    () => (selectedSale ? salesAdjustments[selectedSale.id] ?? [] : []),
    [selectedSale, salesAdjustments]
  );
  const totalAdjustmentsDelta = useMemo(
    () =>
      selectedAdjustments.reduce(
        (sum, adjustment) => sum + (adjustment.total_delta ?? 0),
        0
      ),
    [selectedAdjustments]
  );
  const discountAdjustmentsTotal = useMemo(
    () =>
      selectedAdjustments.reduce((sum, adjustment) => {
        if (adjustment.adjustment_type !== "discount") return sum;
        return sum + (adjustment.total_delta ?? 0);
      }, 0),
    [selectedAdjustments]
  );
  const discountAdjustmentAmount = Math.max(0, -discountAdjustmentsTotal);
  const adjustedPaymentsFromAdjustments = useMemo(
    () => getAdjustedPaymentsFromAdjustments(selectedAdjustments),
    [selectedAdjustments]
  );
  const adjustmentNotes = useMemo(() => {
    if (!selectedAdjustments.length) return "";
    const notes = selectedAdjustments
      .map((adjustment) => {
        const payloadNote =
          adjustment.payload && typeof adjustment.payload === "object"
            ? (adjustment.payload as Record<string, unknown>).note
            : null;
        const noteText =
          typeof payloadNote === "string"
            ? payloadNote
            : adjustment.adjustment_type === "note"
            ? adjustment.reason ?? ""
            : "";
        return noteText ? `Ajuste: ${noteText}` : "";
      })
      .filter(Boolean);
    return notes.join("\n");
  }, [selectedAdjustments]);
  const combinedSaleNotes = useMemo(() => {
    const base = selectedSale?.notes?.trim();
    if (base && adjustmentNotes) return `${base}\n${adjustmentNotes}`;
    return base || adjustmentNotes || "";
  }, [adjustmentNotes, selectedSale]);
  const adjustedPaymentsTotal = useMemo(
    () =>
      adjustedPaymentsFromAdjustments
        ? adjustedPaymentsFromAdjustments.reduce(
            (sum, entry) => sum + (entry.amount ?? 0),
            0
          )
        : null,
    [adjustedPaymentsFromAdjustments]
  );

  const selectedSaleSummary = computeSaleSummary(normalizedSelectedSale);
  const detailSubtotal = selectedSaleSummary.subtotal;
  const detailLineDiscount = selectedSaleSummary.lineDiscount;
  const detailCartDiscount =
    selectedSale?.is_separated &&
    selectedSaleSeparatedTotal != null &&
    selectedSale.total != null &&
    selectedSaleSeparatedTotal >
      (selectedSale.total ?? 0) + 0.5
      ? 0
      : selectedSaleSummary.cartDiscount + discountAdjustmentAmount;
  const detailTotalDiscount =
    detailLineDiscount + detailCartDiscount;
  const originalTotal = selectedSaleSummary.originalTotal ?? 0;
  const detailTotal =
    (selectedSaleSeparatedTotal ?? selectedSaleSummary.total) +
    totalAdjustmentsDelta;
  const refundAmount = selectedSaleSummary.refundAmount ?? 0;
  const originalPaid = selectedSaleSummary.originalPaid ?? detailTotal;
  const rawPaidAmount =
    adjustedPaymentsTotal ??
    selectedSale?.paid_amount ??
    selectedSaleSummary.paid;
  const selectedSeparatedPaidTotal = selectedSale?.is_separated
    ? getSeparatedOrderPaidTotal(selectedSeparatedOrder)
    : null;
  const inferredChange =
    !selectedSale?.is_separated && rawPaidAmount > detailTotal
      ? rawPaidAmount - detailTotal
      : 0;
  const saleChangeAmount = Math.max(
    0,
    selectedSale?.change ?? inferredChange
  );
  const detailPaid = selectedSale?.is_separated
    ? Math.max(
        0,
        (selectedSeparatedPaidTotal ?? rawPaidAmount) -
          refundAmount -
          saleChangeAmount
      )
    : Math.max(0, rawPaidAmount - saleChangeAmount);
  const detailCartDiscountLabel =
    detailCartDiscount > 0
      ? discountAdjustmentAmount > 0
        ? `-${formatMoney(detailCartDiscount)}`
        : `-${formatMoney(detailCartDiscount)}${
            selectedSaleSummary.cartDiscountPercent
              ? ` (${selectedSaleSummary.cartDiscountPercent}%)`
              : ""
          }`
      : "0";
  const selectedItemDisplayRows = useMemo(() => {
    const items = selectedSale?.items ?? [];
    if (items.length === 0) return [];
    const breakdowns = items.map((item) => computeLineBreakdown(item));
    const lineTotalsSum = breakdowns.reduce(
      (sum, line) => sum + (line.total ?? 0),
      0
    );
    const cartDiscount = detailCartDiscount;
    let remainingDiscount = cartDiscount;
    return items.map((item, idx) => {
      const line = breakdowns[idx];
      let cartShare = 0;
      if (cartDiscount > 0 && lineTotalsSum > 0) {
        if (idx === breakdowns.length - 1) {
          cartShare = remainingDiscount;
        } else {
          cartShare = (cartDiscount * (line.total ?? 0)) / lineTotalsSum;
          remainingDiscount -= cartShare;
        }
      }
      const lineTotalNet = Math.max(0, (line.total ?? 0) - cartShare);
      const discountTotal = (line.discount ?? 0) + cartShare;
      const unitNet = line.quantity > 0 ? lineTotalNet / line.quantity : 0;
      return { item, line, lineTotalNet, discountTotal, unitNet };
    });
  }, [detailCartDiscount, selectedSale?.items]);
  const adjustedPayments = useMemo(() => {
    const basePayments = adjustedPaymentsFromAdjustments
      ? adjustedPaymentsFromAdjustments.map((payment, index) => ({
          id: `adjusted-${index}`,
          method: payment.method,
          amount: payment.amount,
        }))
      : selectedSale?.payments ?? [];
    if (!basePayments.length) return [];
    const payments = basePayments.map((payment) => ({
      ...payment,
      displayAmount: payment.amount ?? 0,
    }));
    if (saleChangeAmount <= 0) return payments;
    const cashIndex = payments.findIndex((payment) =>
      isCashMethod(payment.method)
    );
    if (cashIndex === -1) return payments;
    const cashAmount = payments[cashIndex].displayAmount ?? 0;
    const changeApplied = Math.min(saleChangeAmount, cashAmount);
    payments[cashIndex].displayAmount = Math.max(0, cashAmount - changeApplied);
    return payments;
  }, [
    adjustedPaymentsFromAdjustments,
    isCashMethod,
    saleChangeAmount,
    selectedSale?.payments,
  ]);
  const detailSurchargeAmount = Math.max(
    0,
    selectedSale?.surcharge_amount ??
      selectedSaleSummary.surcharge ??
      0
  );
  const detailSurchargeLabel =
    detailSurchargeAmount > 0
      ? selectedSale?.surcharge_label ??
        selectedSaleSummary.surchargeLabel ??
        "Incremento"
      : null;
  const detailSurchargeDisplay =
    detailSurchargeAmount > 0
      ? formatMoney(detailSurchargeAmount)
      : null;
  const separatedPaymentEntries = useMemo(() => {
    if (!selectedSeparatedOrder) return [];
    const entries: {
      label: string;
      method?: string | null;
      amount: number;
      paidAt?: string | null;
    }[] = [];
    const initialMethodSlug =
      selectedSale?.initial_payment_method ??
      selectedSale?.payments?.[0]?.method ??
      selectedSale?.payment_method;
    entries.push({
      label: "Abono inicial",
      method: initialMethodSlug,
      amount: selectedSeparatedOrder.initial_payment,
      paidAt: selectedSeparatedOrder.created_at,
    });
    entries.push(
      ...selectedSeparatedOrder.payments.map((payment, idx) => ({
        label: `Abono ${idx + 2}`,
        method: payment.method,
        amount: payment.amount,
        paidAt: payment.paid_at,
      }))
    );
    return entries;
  }, [selectedSeparatedOrder, selectedSale]);
  const separatedBalance = useMemo(() => {
    if (!selectedSeparatedOrder) return null;
    return Math.max(selectedSeparatedOrder.balance ?? 0, 0);
  }, [selectedSeparatedOrder]);
  const separatedDueDateLabel = useMemo(() => {
    if (!selectedSeparatedOrder?.due_date) return "—";
    return formatDateTime(selectedSeparatedOrder.due_date);
  }, [selectedSeparatedOrder]);
  const hasRefunds = refundAmount > 0;

  const hasMultiplePayments = adjustedPayments.length > 1;
  const isSeparatedDetail = !!selectedSale?.is_separated;
  const singleMethodBaseLabel =
    adjustedPayments.length === 1
      ? mapPaymentMethod(adjustedPayments[0].method)
      : selectedSale
      ? mapPaymentMethod(selectedSale.payment_method)
      : "—";
  const singleMethodAmount = selectedSale?.is_separated
    ? selectedSale?.initial_payment_amount ??
      selectedSeparatedOrder?.initial_payment ??
      0
    : adjustedPayments.length === 1
    ? (adjustedPayments[0] as typeof adjustedPayments[number] & { displayAmount?: number })
        .displayAmount ?? adjustedPayments[0].amount
    : Math.min(detailPaid ?? 0, detailTotal);
  const separatedInitialMethodLabel = mapPaymentMethod(
    selectedSale?.initial_payment_method ??
      selectedSale?.payments?.[0]?.method ??
      selectedSale?.payment_method
  );
  const canTriggerReturn =
    !!returnPath &&
    !!selectedSale &&
    selectedSaleSummary.total > 0;
  const canPrintTicket = !!selectedSale;
  const canPrintReturn =
    !!selectedSale?.returns && selectedSale.returns.length > 0;
  const canPrintChange =
    !!selectedSale?.changes && selectedSale.changes.length > 0;
  const trimmedRecipient = emailRecipient.trim();
  const canEmailTicket =
    !!selectedSale &&
    (!showEmailForm || trimmedRecipient.length > 0) &&
    !emailSending;
  const separatedTicketInfo = useMemo(() => {
    if (!selectedSeparatedOrder) return undefined;
    const initialMethodSlug =
      selectedSale?.initial_payment_method ??
      selectedSale?.payments?.[0]?.method ??
      selectedSale?.payment_method;
    const payments = [
      {
        label: "Abono inicial",
        amount: selectedSeparatedOrder.initial_payment,
        paidAt: selectedSeparatedOrder.created_at,
        method: mapPaymentMethod(initialMethodSlug),
      },
      ...selectedSeparatedOrder.payments.map((payment, idx) => ({
        label: `Abono ${idx + 2}`,
        amount: payment.amount,
        paidAt: payment.paid_at,
        method: mapPaymentMethod(payment.method),
      })),
    ];
    return {
      dueDate: selectedSeparatedOrder.due_date,
      balance: Math.max(selectedSeparatedOrder.balance ?? 0, 0),
      payments,
    };
  }, [selectedSeparatedOrder, selectedSale, mapPaymentMethod]);

  useEffect(() => {
    if (!selectedSale) {
      setEmailRecipient("");
      setEmailFeedback(null);
      setEmailError(null);
      setShowEmailForm(false);
      setReturnPrintError(null);
      return;
    }
    setEmailRecipient(selectedSale.customer_email ?? "");
    setEmailFeedback(null);
    setEmailError(null);
    setShowEmailForm(false);
    setReturnPrintError(null);
  }, [selectedSale]);

  const handlePrintTicket = useCallback(async () => {
    if (!selectedSale) return;

    const breakdown = (selectedSale.items ?? []).map((item) =>
      computeLineBreakdown(item)
    );
    const lineTotalsSum = breakdown.reduce(
      (sum, line) => sum + (line?.total ?? 0),
      0
    );
    const cartDiscountValue =
      selectedSaleSummary.cartDiscount + discountAdjustmentAmount;
    let remainingCartDiscount = cartDiscountValue;
    const ticketItems = (selectedSale.items ?? []).map((item, index) => {
      const data = breakdown[index];
      let cartShare = 0;
      if (cartDiscountValue > 0 && lineTotalsSum > 0) {
        if (index === breakdown.length - 1) {
          cartShare = remainingCartDiscount;
        } else {
          cartShare = (cartDiscountValue * (data?.total ?? 0)) / lineTotalsSum;
          remainingCartDiscount -= cartShare;
        }
      }
      return {
        name: item.product_name ?? item.name ?? "Producto",
        quantity: data?.quantity ?? item.quantity ?? 1,
        unitPrice: data?.unitGross ?? item.unit_price ?? 0,
        total: Math.max(0, (data?.total ?? item.total ?? 0) - cartShare),
      };
    });

    const lineDiscountTotal = breakdown.reduce(
      (sum, line) => sum + (line?.discount ?? 0),
      0
    );
    const subtotal = breakdown.reduce(
      (sum, line) => sum + (line?.subtotal ?? 0),
      0
    );
    const ticketSeparatedTotal = resolveSeparatedBaseTotal(
      selectedSale,
      sumSaleItemsTotal(selectedSale.items),
      selectedSeparatedOrder
    );
    const baseTotal =
      ticketSeparatedTotal ??
      (selectedSaleSummary.total > 0
        ? selectedSaleSummary.total
        : selectedSale.total ?? subtotal);
    const total = baseTotal + totalAdjustmentsDelta;

    const cartDiscountLabel =
      cartDiscountValue > 0
        ? discountAdjustmentAmount > 0 &&
          selectedSaleSummary.cartDiscount > 0
          ? "Descuento carrito + ajuste"
          : discountAdjustmentAmount > 0
          ? "Descuento ajuste"
          : "Descuento carrito"
        : selectedSaleSummary.cartDiscountPercent > 0
        ? "Descuento carrito (%)"
        : "Descuento carrito";
    const cartDiscountValueDisplay =
      cartDiscountValue > 0
        ? `-${formatMoney(cartDiscountValue)}`
        : selectedSaleSummary.cartDiscountPercent > 0
        ? `-${selectedSaleSummary.cartDiscountPercent}%`
        : "0";

    const basePayments =
      selectedSale.payments && selectedSale.payments.length
        ? selectedSale.payments.map((p) => ({
            label: mapPaymentMethod(p.method),
            amount: p.amount,
          }))
        : [
            {
              label: mapPaymentMethod(selectedSale.payment_method),
              amount:
                selectedSale.initial_payment_amount ??
                selectedSale.paid_amount ??
                selectedSaleSummary.paid ??
                total,
            },
          ];
    const payments = adjustedPaymentsFromAdjustments
      ? adjustedPaymentsFromAdjustments.map((p) => ({
          label: mapPaymentMethod(p.method),
          amount: p.amount,
        }))
      : basePayments;
    const paymentsTotal = payments.reduce(
      (sum, entry) => sum + (entry.amount ?? 0),
      0
    );

    const changeAmount = selectedSale.is_separated ? 0 : paymentsTotal - total;
    const ticketSurchargeAmount =
      selectedSale.surcharge_amount ??
      selectedSaleSummary.surcharge ??
      0;
    const hasTicketSurcharge = ticketSurchargeAmount > 0;
    const ticketSurchargeLabel = hasTicketSurcharge
      ? selectedSale.surcharge_label ??
        selectedSaleSummary.surchargeLabel ??
        "Incremento"
      : undefined;
    const ticketSurchargeDisplay = hasTicketSurcharge
      ? formatMoney(ticketSurchargeAmount)
      : undefined;

    const html = renderSaleTicket({
      documentNumber:
        selectedSale.document_number ??
        `V-${selectedSale.id.toString().padStart(6, "0")}`,
      saleNumber: selectedSale.sale_number ?? selectedSale.id,
      date: new Date(selectedSale.created_at),
      subtotal: subtotal || total,
      lineDiscountTotal,
      cartDiscountLabel,
      cartDiscountValueDisplay,
      surchargeLabel: ticketSurchargeLabel,
      surchargeValueDisplay: ticketSurchargeDisplay,
      surchargeAmount: hasTicketSurcharge
        ? ticketSurchargeAmount
        : undefined,
      total,
      items: ticketItems,
      payments,
      changeAmount,
      notes: combinedSaleNotes || selectedSale.notes,
      posName: selectedSale.pos_name ?? undefined,
      vendorName: selectedSale.vendor_name ?? undefined,
      settings: posSettings,
      customer: buildSaleTicketCustomer({
        name: selectedSale.customer_name ?? undefined,
        phone: selectedSale.customer_phone ?? undefined,
        email: selectedSale.customer_email ?? undefined,
        taxId: selectedSale.customer_tax_id ?? undefined,
        address: selectedSale.customer_address ?? undefined,
      }),
      separatedInfo: separatedTicketInfo,
    });

    const printTicketWithQz = async () => {
      if (!shouldUseQz) return false;
      if (printerConfig.mode !== "qz-tray") return false;
      if (!printerConfig.printerName.trim()) return false;
      if (!qzClient) return false;
      try {
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
        console.error("No se pudo imprimir con QZ Tray", err);
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
        console.error("No se pudo imprimir el ticket", err);
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
    qzClient,
    printerConfig.mode,
    printerConfig.printerName,
    printerConfig.width,
    adjustedPaymentsFromAdjustments,
    combinedSaleNotes,
    selectedSale,
    selectedSaleSummary,
    selectedSeparatedOrder,
    separatedTicketInfo,
    posSettings,
    mapPaymentMethod,
    shouldUseQz,
    totalAdjustmentsDelta,
    discountAdjustmentAmount,
  ]);

  const getLatestReturn = (returns?: SaleReturnSummary[]) => {
    if (!returns || returns.length === 0) return null;
    return returns.reduce((latest, current) => {
      const latestTime = latest.created_at
        ? new Date(latest.created_at).getTime()
        : 0;
      const currentTime = current.created_at
        ? new Date(current.created_at).getTime()
        : 0;
      if (currentTime === latestTime) {
        return current.id > latest.id ? current : latest;
      }
      return currentTime > latestTime ? current : latest;
    });
  };

  const getLatestChange = (changes?: SaleChangeSummary[]) => {
    if (!changes || changes.length === 0) return null;
    return changes.reduce((latest, current) => {
      const latestTime = latest.created_at
        ? new Date(latest.created_at).getTime()
        : 0;
      const currentTime = current.created_at
        ? new Date(current.created_at).getTime()
        : 0;
      if (currentTime === latestTime) {
        return current.id > latest.id ? current : latest;
      }
      return currentTime > latestTime ? current : latest;
    });
  };

  const latestSelectedChange = useMemo(
    () => getLatestChange(selectedSale?.changes),
    [selectedSale?.changes]
  );

  const handlePrintReturnTicket = useCallback(async () => {
    if (!selectedSale?.returns?.length) return;
    const latestReturn = getLatestReturn(selectedSale.returns);
    if (!latestReturn) return;
    if (!token) {
      setReturnPrintError("Tu sesión expiró. Vuelve a iniciar sesión.");
      return;
    }
    setReturnPrintLoading(true);
    setReturnPrintError(null);
    try {
      const res = await fetch(`${apiBase}/pos/returns/${latestReturn.id}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(
          `No se pudo cargar la devolución (Error ${res.status}).`
        );
      }
      const detail = (await res.json()) as SaleReturnDetail;
      const items = (detail.items ?? []).map((item) => ({
        name: item.product_name,
        quantity: item.quantity,
        unitPrice: item.unit_price_net,
        total: item.total_refund,
        sku: item.product_sku ?? undefined,
      }));
      const payments = (detail.payments ?? []).map((payment) => ({
        label: mapPaymentMethod(payment.method),
        amount: payment.amount,
      }));
      const html = renderReturnTicket({
        settings: posSettings,
        documentNumber:
          detail.document_number ??
          `DV-${detail.id.toString().padStart(6, "0")}`,
        originalDocumentNumber: selectedSale.document_number,
        createdAt: detail.created_at,
        posName: selectedSale.pos_name ?? undefined,
        sellerName:
          selectedSale.vendor_name ??
          detail.created_by ??
          undefined,
        items,
        payments,
        totalRefund: detail.total_refund ?? 0,
        notes: detail.notes,
      });

      const printTicketWithQz = async () => {
        if (!shouldUseQz) return false;
        if (printerConfig.mode !== "qz-tray") return false;
        if (!printerConfig.printerName.trim()) return false;
        if (!qzClient) return false;
        try {
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
          console.error("No se pudo imprimir la devolución", err);
        } finally {
          win.close();
        }
      };
      if (win.document.readyState === "complete") {
        triggerPrint();
      } else {
        win.onload = triggerPrint;
      }
    } catch (err) {
      console.error(err);
      setReturnPrintError(
        err instanceof Error
          ? err.message
          : "No se pudo imprimir la devolución."
      );
    } finally {
      setReturnPrintLoading(false);
    }
  }, [
    apiBase,
    mapPaymentMethod,
    posSettings,
    printerConfig.mode,
    printerConfig.printerName,
    printerConfig.width,
    qzClient,
    selectedSale,
    shouldUseQz,
    token,
  ]);

  const handlePrintChangeTicket = useCallback(async () => {
    if (!selectedSale?.changes?.length) return;
    const latestChange = getLatestChange(selectedSale.changes);
    if (!latestChange) return;
    if (!token) {
      setChangePrintError("Tu sesión expiró. Vuelve a iniciar sesión.");
      return;
    }
    setChangePrintLoading(true);
    setChangePrintError(null);
    try {
      const res = await fetch(`${apiBase}/pos/changes/${latestChange.id}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(
          `No se pudo cargar el cambio (Error ${res.status}).`
        );
      }
      const detail = (await res.json()) as SaleChangeDetail;
      const returnedItems = (detail.items_returned ?? []).map((item) => ({
        name: item.product_name,
        quantity: item.quantity,
        unitPrice: item.unit_price_net,
        total: item.total_credit,
        sku: item.product_sku ?? undefined,
      }));
      const newItems = (detail.items_new ?? []).map((item) => ({
        name: item.product_name,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        total: item.total,
        sku: item.product_sku ?? undefined,
      }));
      const payments = (detail.payments ?? []).map((payment) => ({
        label: mapPaymentMethod(payment.method),
        amount: payment.amount,
      }));
      const html = renderChangeTicket({
        settings: posSettings,
        documentNumber:
          detail.document_number ??
          `CB-${detail.id.toString().padStart(6, "0")}`,
        originalDocumentNumber: selectedSale.document_number,
        createdAt: detail.created_at,
        posName: selectedSale.pos_name ?? undefined,
        sellerName:
          selectedSale.vendor_name ??
          detail.created_by ??
          undefined,
        itemsReturned: returnedItems,
        itemsNew: newItems,
        payments,
        totalCredit: detail.total_credit ?? 0,
        totalNew: detail.total_new ?? 0,
        extraPayment: detail.extra_payment ?? 0,
        refundDue: detail.refund_due ?? 0,
        notes: detail.notes,
      });

      const printTicketWithQz = async () => {
        if (!shouldUseQz) return false;
        if (printerConfig.mode !== "qz-tray") return false;
        if (!printerConfig.printerName.trim()) return false;
        if (!qzClient) return false;
        try {
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
          console.error("No se pudo imprimir cambio con QZ Tray", err);
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
          console.error("No se pudo imprimir el cambio", err);
        } finally {
          win.close();
        }
      };
      if (win.document.readyState === "complete") {
        triggerPrint();
      } else {
        win.onload = triggerPrint;
      }
    } catch (err) {
      console.error(err);
      setChangePrintError(
        err instanceof Error
          ? err.message
          : "No se pudo imprimir el cambio."
      );
    } finally {
      setChangePrintLoading(false);
    }
  }, [
    apiBase,
    mapPaymentMethod,
    posSettings,
    printerConfig.mode,
    printerConfig.printerName,
    printerConfig.width,
    qzClient,
    selectedSale,
    shouldUseQz,
    token,
  ]);

  const handleEmailTicket = async () => {
    if (!selectedSale) return;
    if (!token) {
      setEmailError("Tu sesión expiró. Vuelve a iniciar sesión.");
      setEmailFeedback(null);
      return;
    }
    if (!showEmailForm) {
      setShowEmailForm(true);
      return;
    }
    const recipient = emailRecipient.trim();
    if (recipient.length === 0) {
      setEmailError("Ingresa un correo para enviar el ticket.");
      setEmailFeedback(null);
      return;
    }
    setEmailSending(true);
    setEmailError(null);
    setEmailFeedback(null);
    try {
      const apiBase = getApiBase();
      const res = await fetch(
        `${apiBase}/pos/sales/${selectedSale.id}/email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
          body: JSON.stringify({
            attach_pdf: true,
            recipients: [recipient],
          }),
        }
      );
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(
          detail?.detail ??
            `No se pudo enviar el ticket por email (Error ${res.status}).`
        );
      }
      setEmailFeedback(`Ticket enviado a ${recipient}.`);
    } catch (err) {
      console.error(err);
      setEmailError(
        err instanceof Error
          ? err.message
          : "No se pudo enviar el ticket por email."
      );
    } finally {
      setEmailSending(false);
    }
  };

  const handleClearFilters = () => {
    const { from, to } = getQuickRangeDates("today");
    setFilterFrom(from);
    setFilterTo(to);
    setFilterTerm("");
    setFilterClient("");
    setFilterPayment("");
    setFilterPos("");
    setActiveQuickRange("today");
  };

  const handleQuickRangeSelect = (range: QuickRange) => {
    const { from, to } = getQuickRangeDates(range);
    setFilterFrom(from);
    setFilterTo(to);
    setActiveQuickRange(range);
  };

  const handleManualFromChange = (value: string) => {
    setActiveQuickRange(null);
    setFilterFrom(value);
  };

  const handleManualToChange = (value: string) => {
    setActiveQuickRange(null);
    setFilterTo(value);
  };

  useEffect(() => {
    if (!filteredSales.length) {
      setSelectedSale(null);
      return;
    }
    if (!selectedSale || !filteredSales.some((sale) => sale.id === selectedSale.id)) {
      setSelectedSale(filteredSales[0]);
    }
  }, [filteredSales, selectedSale]);

  useEffect(() => {
    if (!selectedSale) return;
    const row = saleRowRefs.current.get(selectedSale.id);
    if (!row) return;
    row.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedSale]);

  const quickRangeOptions: { label: string; value: QuickRange }[] = [
    { label: "Hoy", value: "today" },
    { label: "Ayer", value: "yesterday" },
    { label: "Esta semana", value: "thisWeek" },
    { label: "Este mes", value: "thisMonth" },
  ];

  useEffect(() => {
    setCurrentPage(1);
  }, [filterFrom, filterTo, filterTerm, filterClient, filterPayment, sales]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredSales.length / PAGE_SIZE)),
    [filteredSales.length]
  );

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const paginatedSales = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredSales.slice(start, start + PAGE_SIZE);
  }, [filteredSales, currentPage]);

  const todayKey = getBogotaDateKey();
  const isTodayRange = Boolean(
    todayKey && filterFrom === todayKey && filterTo === todayKey
  );
  const abonoRangeLabel = isTodayRange ? "Abonos hoy" : "Abonos del rango";

  useEffect(() => {
    if (!token) return;
    const pendingSales = sales.filter(
      (sale) => sale.is_separated && !separatedPaymentsMap[sale.id]
    );
    if (!pendingSales.length) return;
    let cancelled = false;
    async function loadSeparatedPayments() {
      const entries = await Promise.all(
        pendingSales.map(async (sale) => {
          try {
            const order = await fetchSeparatedOrderForSale(sale);
            if (!order) {
              return { saleId: sale.id, payments: [] as SeparatedPaymentInfo[] };
            }
            const payments =
              order.payments
                ?.filter((payment) => payment.status !== "voided")
                .map((payment) => ({
                  paid_at:
                    payment.paid_at ??
                    (payment as { created_at?: string }).created_at ??
                    "",
                  amount: Number(payment.amount ?? 0),
                  method: payment.method ?? null,
                }))
                .filter((payment) => payment.paid_at) ?? [];
            return { saleId: sale.id, payments };
          } catch (err) {
            console.warn("No pudimos cargar abonos del separado", err);
            return { saleId: sale.id, payments: [] as SeparatedPaymentInfo[] };
          }
        })
      );
      if (cancelled) return;
      setSeparatedPaymentsMap((prev) => {
        const next = { ...prev };
        for (const entry of entries) {
          next[entry.saleId] = entry.payments;
        }
        return next;
      });
    }
    void loadSeparatedPayments();
    return () => {
      cancelled = true;
    };
  }, [sales, token, separatedPaymentsMap, fetchSeparatedOrderForSale]);

  const handlePreviousPage = () => {
    if (currentPage === 1) return;
    const newPage = currentPage - 1;
    setCurrentPage(newPage);
    const startIndex = (newPage - 1) * PAGE_SIZE;
    const newSelection = filteredSales[startIndex];
    if (newSelection) {
      setSelectedSale(newSelection);
    }
  };

  const handleNextPage = () => {
    if (currentPage >= totalPages) return;
    const newPage = currentPage + 1;
    setCurrentPage(newPage);
    const startIndex = (newPage - 1) * PAGE_SIZE;
    const newSelection = filteredSales[startIndex];
    if (newSelection) {
      setSelectedSale(newSelection);
    }
  };

  return (
    <main className="flex-1 px-6 pt-5 pb-6 text-[0.9rem]">
      <div className="w-full max-w-[1400px] mx-auto space-y-3">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push(backPath)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg border transition-colors text-base ${
                isPosTheme
                  ? "text-slate-300 border-slate-700 hover:text-white hover:bg-slate-800"
                  : "text-slate-700 border-slate-300 bg-white shadow-sm hover:bg-slate-50"
              }`}
            >
              <span className="text-xl">←</span>
              {resolvedBackLabel}
            </button>

            <div>
              <h1 className="text-2xl md:text-3xl font-semibold text-slate-50">
                Historial de ventas
              </h1>
              <p className="text-base text-slate-400">
                Listado de las ventas registradas desde el POS de Metrik.
              </p>
              {error && (
                <p className="text-sm text-red-400 mt-1">
                  Error: {error}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 text-sm">
            {returnPath && (
              <button
                type="button"
                onClick={handleReturn}
                disabled={!canTriggerReturn}
                className={`px-4 py-2 rounded-md border disabled:opacity-50 disabled:cursor-not-allowed transition ${
                  isPosTheme
                    ? "border-sky-400/60 text-sky-200 hover:bg-sky-500/10"
                    : "border-sky-400 text-sky-700 bg-sky-50 shadow-sm hover:bg-sky-100"
                }`}
              >
                Devolución
              </button>
            )}
            {loading && (
              <span className="text-slate-400">Cargando…</span>
            )}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              className={`px-5 py-2.5 rounded-lg border text-base disabled:opacity-50 disabled:cursor-not-allowed ${
                isPosTheme
                  ? "border-emerald-400/70 text-emerald-300 hover:bg-emerald-500/10"
                  : "border-emerald-500 text-emerald-700 font-semibold bg-emerald-50 shadow-[0_1px_0_rgba(16,185,129,0.25)] hover:bg-emerald-100"
              }`}
            >
              Refrescar
            </button>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-slate-200 text-sm">
              Filtros avanzados
            </h3>
            <button
              type="button"
              onClick={handleClearFilters}
              className={`px-3 py-1.5 rounded-lg border text-sm ${
                isPosTheme
                  ? "border-slate-700 text-slate-200 hover:bg-slate-800"
                  : "border-slate-300 text-slate-700 bg-white shadow-sm hover:bg-slate-50"
              }`}
            >
              Limpiar
            </button>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            {quickRangeOptions.map((option) => {
              const isActive = activeQuickRange === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleQuickRangeSelect(option.value)}
                  className={`px-3 py-1.5 rounded-full border transition ${
                    isActive
                      ? isPosTheme
                        ? "border-emerald-400 text-emerald-300 bg-emerald-500/10"
                        : "border-emerald-500 text-emerald-700 bg-emerald-50"
                      : isPosTheme
                      ? "border-slate-700 text-slate-400 hover:text-slate-100 hover:border-slate-500"
                      : "border-slate-300 text-slate-500 hover:text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <div className="grid gap-2 md:grid-cols-6">
            <label className="flex flex-col gap-1">
              <span className="text-slate-400 text-xs">Desde</span>
              <input
                type="date"
                value={filterFrom}
                onChange={(e) => handleManualFromChange(e.target.value)}
                onFocus={(e) => e.target.showPicker?.()}
                className="rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-50 focus:ring-1 focus:ring-emerald-500"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-slate-400 text-xs">Hasta</span>
              <input
                type="date"
                value={filterTo}
                onChange={(e) => handleManualToChange(e.target.value)}
                onFocus={(e) => e.target.showPicker?.()}
                className="rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-50 focus:ring-1 focus:ring-emerald-500"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-slate-400 text-xs">Doc. / Venta / Producto</span>
              <input
                type="text"
                value={filterTerm}
                onChange={(e) => setFilterTerm(e.target.value)}
                placeholder="V-00019, Cabina..."
                className="rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-50 focus:ring-1 focus:ring-emerald-500"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-slate-400 text-xs">Cliente</span>
              <input
                type="text"
                value={filterClient}
                onChange={(e) => setFilterClient(e.target.value)}
                placeholder="Nombre del cliente"
                className="rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-50 focus:ring-1 focus:ring-emerald-500"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-slate-400 text-xs">POS</span>
              <select
                value={filterPos}
                onChange={(e) => setFilterPos(e.target.value)}
                className="rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-50 focus:ring-1 focus:ring-emerald-500"
              >
                <option value="">Todos</option>
                {posOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-slate-400 text-xs">Método de pago</span>
              <select
                value={filterPayment}
                onChange={(e) => setFilterPayment(e.target.value)}
                className="rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-50 focus:ring-1 focus:ring-emerald-500"
              >
                <option value="">Todos</option>
                {paymentOptions.map((method) => (
                  <option key={method.id} value={method.slug}>
                    {method.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                Ventas registradas
              </h2>
              <p className="text-sm text-slate-400">
                Cada venta puede tener varios productos, todos listados aquí.
              </p>
            </div>
            <div className="text-sm text-slate-400">
              Resultados: {loading ? "..." : filteredSales.length}
            </div>
          </div>

          {sales.length === 0 && !loading ? (
            <p className="text-sm text-slate-500 mt-3">
              Aún no hay ventas registradas.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-[90px_190px_1fr_120px_120px_220px] text-sm text-slate-400 mb-1 px-2">
                <span>Nº venta</span>
                <span>Fecha / hora</span>
                <span>Detalle</span>
                <span className="text-right">Total</span>
                <span className="text-right">Pagado</span>
                <span className="text-right">Método / Cliente</span>
              </div>

              <div className="mt-1 rounded-xl border border-slate-800/60 overflow-hidden">
                <div className="max-h-[240px] min-h-[160px] overflow-y-auto">
                  {paginatedSales.map((sale, saleIndex) => {
                    const baseGrid = isPosTheme
                      ? "grid grid-cols-[90px_190px_1fr_120px_120px_220px] text-[1.05rem] px-3 py-2.5 cursor-pointer hover:bg-slate-800/70"
                      : "grid grid-cols-[90px_190px_1fr_120px_120px_220px] text-[1.05rem] px-3 py-2.5 cursor-pointer hover:bg-[var(--row-hover)]";
                    const zebra =
                      saleIndex % 2 === 0
                        ? isPosTheme
                          ? "bg-slate-900/60"
                          : "bg-[var(--surface)]"
                        : isPosTheme
                        ? "bg-slate-900/40"
                        : "bg-[var(--surface-2)]";

                    const isSelected = selectedSale?.id === sale.id;
                    const selectedClasses = isSelected
                      ? "bg-white/8 border-y border-emerald-300/60 border-l-4 border-emerald-300 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.35)]"
                      : "";

                    const items: SaleItem[] =
                      sale.items && sale.items.length > 0
                        ? sale.items
                        : [
                            {
                              name: `Ticket #${sale.id}`,
                              quantity: 1,
                            },
                          ];
                    const latestChange = getLatestChange(sale.changes);
                    const displayItems: SaleItem[] =
                      latestChange?.items_new?.length
                        ? latestChange.items_new.map((item, index) => ({
                            id: item.id ?? index,
                            product_name: item.product_name,
                            quantity: item.quantity,
                            unit_price: item.unit_price,
                            total: item.total,
                          }))
                        : items;
                    const rowItemsTotal = sumSaleItemsTotal(items);
                    const rowSeparatedTotal = resolveSeparatedBaseTotal(
                      sale,
                      rowItemsTotal
                    );
                    const shouldResetCartDiscount =
                      rowSeparatedTotal != null &&
                      sale.total != null &&
                      rowSeparatedTotal >
                        (sale.total ?? 0) + 0.5;
                    const saleForSummary =
                      rowSeparatedTotal != null
                        ? {
                            ...sale,
                            total: rowSeparatedTotal,
                            ...(shouldResetCartDiscount
                              ? {
                                  cart_discount_value: 0,
                                  cart_discount_percent: 0,
                                }
                              : {}),
                          }
                        : sale;
                    const saleSummary = computeSaleSummary(saleForSummary);
                    const refundAmount = saleSummary.refundAmount ?? 0;
                    const isVoided = sale.status === "voided";
                    const hasRefund = refundAmount > 0 && !isVoided;
                    const hasChange = !!latestChange;
                    const rowIsSeparated = !!sale.is_separated;
                    const saleAdjustments = salesAdjustments[sale.id] ?? [];
                    const adjustmentsDelta = saleAdjustments.reduce(
                      (sum, adjustment) => sum + (adjustment.total_delta ?? 0),
                      0
                    );
                    const adjustedPaymentsForRow =
                      getAdjustedPaymentsFromAdjustments(saleAdjustments);
                    const hasAdjustment =
                      Math.abs(adjustmentsDelta) > 0.01 ||
                      (adjustedPaymentsForRow?.length ?? 0) > 0 ||
                      saleAdjustments.some(
                        (adjustment) => adjustment.adjustment_type === "note"
                      );
                    const netTotal =
                      (rowSeparatedTotal ?? saleSummary.total) +
                      adjustmentsDelta;
                    const rowBalance = Math.max(sale.balance ?? 0, 0);
                    const separatedPaidFromBalance =
                      rowSeparatedTotal != null
                        ? Math.max(
                            0,
                            (rowSeparatedTotal ?? 0) - rowBalance
                          )
                        : saleSummary.paid;
                    const adjustedRowPaidTotal = adjustedPaymentsForRow
                      ? adjustedPaymentsForRow.reduce(
                          (sum, entry) => sum + (entry.amount ?? 0),
                          0
                        )
                      : null;
                    const netPaid = rowIsSeparated
                      ? separatedPaidFromBalance
                      : adjustedRowPaidTotal ?? saleSummary.paid;
                    const hasMixedPayments =
                      (adjustedPaymentsForRow?.length ?? sale.payments?.length ?? 0) > 1;
                    const refundClasses =
                      hasRefund && !isSelected
                        ? "border border-rose-500/40 bg-rose-500/5"
                        : "";
                    return displayItems.map((item, itemIndex) => {
                      const showMain = itemIndex === 0;
                      const initialMethodLabelForRow =
                        !rowIsSeparated && hasMixedPayments
                          ? "Mixto"
                          : adjustedPaymentsForRow?.length === 1
                          ? mapPaymentMethod(adjustedPaymentsForRow[0].method)
                          : mapPaymentMethod(
                              sale.initial_payment_method ??
                                sale.payments?.[0]?.method ??
                                sale.payment_method
                            );
                      const abonoPayments =
                        (separatedPaymentsMap[sale.id] ?? []).filter((payment) =>
                          isWithinFilterRange(payment.paid_at)
                        );
                      const abonoCount = abonoPayments.length;
                      const abonoTotal = abonoPayments.reduce(
                        (sum, payment) => sum + (payment.amount ?? 0),
                        0
                      );
                      const hasAbonoHighlight = showMain && abonoCount > 0;
                      const abonoLabel =
                        abonoCount === 1
                          ? `Abono ${formatShortDate(abonoPayments[0].paid_at)}`
                          : `Abonos (${abonoCount})`;

                      return (
                        <div
                          key={`${sale.id}-${itemIndex}`}
                          className={`${baseGrid} ${zebra} ${selectedClasses} ${refundClasses} transition-colors`}
                          ref={(el) => {
                            if (showMain && el) {
                              saleRowRefs.current.set(sale.id, el);
                            }
                          }}
                          onClick={() => {
                            setSelectedSale(sale);
                            if (autoReturnOnSelect && returnPath) {
                              handleReturnForSale(sale);
                            }
                          }}
                        >
                          <div className="font-mono text-slate-200">
                            {showMain
                              ? `#${sale.sale_number ?? sale.id}`
                              : ""}
                          </div>

                          <div className="text-slate-300">
                            {showMain
                              ? formatDateTime(sale.created_at)
                              : ""}
                          </div>

                          <div className="text-slate-100 truncate flex items-center gap-2">
                            {(item.product_name ?? item.name ?? "Producto") +
                              " x" +
                              (item.quantity ?? 1)}
                            {showMain && hasAdjustment && (
                              <span className="text-sm uppercase tracking-wide px-2 py-0.5 rounded-full border border-sky-400/50 text-sky-200 bg-sky-500/10">
                                Ajustado
                              </span>
                            )}
                            {showMain && isVoided && (
                              <span className="text-sm uppercase tracking-wide px-2 py-0.5 rounded-full border border-rose-500/50 text-rose-300 bg-rose-500/10">
                                Anulada
                              </span>
                            )}
                            {showMain && hasRefund && (
                              <span className={`text-sm uppercase tracking-wide px-2 py-0.5 rounded-full border ${netTotal <= 0 ? "border-rose-500/50 text-rose-300 bg-rose-500/10" : "border-amber-400/50 text-amber-200 bg-amber-500/10"}`}>
                                {netTotal <= 0 ? "Devuelta" : "Devolución parcial"}
                              </span>
                            )}
                            {showMain && hasChange && (
                              <span className="text-sm uppercase tracking-wide px-2 py-0.5 rounded-full border border-sky-400/50 text-sky-200 bg-sky-500/10">
                                Cambio
                              </span>
                            )}
                          </div>

                          <div className="text-right font-semibold text-slate-100">
                            {showMain ? formatMoney(netTotal) : ""}
                            {showMain && hasRefund && (
                              <span className="block text-sm text-rose-300">
                                -{formatMoney(refundAmount)}
                              </span>
                            )}
                          </div>

                          <div className="text-right text-slate-200">
                            {showMain ? formatMoney(netPaid) : ""}
                            {showMain && rowIsSeparated && abonoTotal > 0 && (
                              <span className="block text-sm text-emerald-300">
                                {abonoRangeLabel}: {formatMoney(abonoTotal)}
                              </span>
                            )}
                          </div>

                          <div className="text-right text-slate-200 flex flex-col items-end">
                            {showMain && (
                              <>
                                <span className="uppercase">
                                  {rowIsSeparated
                                    ? "SEPARADO"
                                    : initialMethodLabelForRow}
                                </span>
                                {rowIsSeparated && (
                                  <span className="text-sm text-slate-500">
                                    Inicial: {initialMethodLabelForRow}
                                  </span>
                                )}
                                {hasAbonoHighlight && (
                                  <span className="text-sm uppercase tracking-wide px-2 py-0.5 rounded-full border border-emerald-400/50 text-emerald-200 bg-emerald-500/10">
                                    {abonoLabel}
                                  </span>
                                )}
                                {sale.customer_name && (
                                  <span className="text-base text-slate-400 truncate max-w-[160px]">
                                    {sale.customer_name}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })}
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between text-base text-slate-500">
                <span>
                  Página{" "}
                  {filteredSales.length > 0
                    ? `${currentPage} de ${totalPages}`
                    : "0 de 0"}
                </span>
                <div className="flex gap-2">
                  <button
                    className={`px-4 py-2 rounded-md border disabled:opacity-40 disabled:cursor-not-allowed ${
                      isPosTheme
                        ? "bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800"
                        : "bg-white border-slate-300 text-slate-700 shadow-sm hover:bg-slate-50"
                    }`}
                    onClick={handlePreviousPage}
                    disabled={currentPage === 1}
                  >
                    Anterior
                  </button>
                  <button
                    className={`px-4 py-2 rounded-md border disabled:opacity-40 disabled:cursor-not-allowed ${
                      isPosTheme
                        ? "bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800"
                        : "bg-white border-slate-300 text-slate-700 shadow-sm hover:bg-slate-50"
                    }`}
                    onClick={handleNextPage}
                    disabled={currentPage >= totalPages}
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 px-5 py-5">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold text-slate-100">
                  Detalle de la venta seleccionada
                </h2>
                <button
                  type="button"
                  onClick={() => setShowSaleDetails((prev) => !prev)}
                  disabled={!selectedSale}
                  aria-expanded={showSaleDetails}
                  className={`text-base px-4 py-1.5 rounded-full border transition-colors ${
                    selectedSale
                      ? isPosTheme
                        ? "border-blue-500 text-blue-100 hover:bg-blue-500/10"
                        : "border-blue-500 text-blue-700 bg-blue-50 hover:bg-blue-100"
                      : isPosTheme
                      ? "border-slate-700 text-slate-200"
                      : "border-slate-300 text-slate-600 bg-white"
                  } disabled:opacity-40`}
                >
                  {showSaleDetails ? "Mostrar menos" : "Mostrar más"}
                </button>
              </div>
              <p className="text-base text-slate-400">
                Selecciona una venta en la tabla superior (o usa las
                flechas ↑ / ↓) para ver la información completa.
              </p>
            </div>
            <div className="flex flex-col items-end gap-2 w-full md:w-auto">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
                <button
                  type="button"
                  onClick={handlePrintTicket}
                  disabled={!canPrintTicket}
                  className={`px-4 py-2.5 rounded-md border text-base font-semibold disabled:opacity-50 ${
                    isPosTheme
                      ? "border-slate-700 text-slate-100 hover:bg-slate-800"
                      : "border-slate-300 text-slate-700 bg-white shadow-sm hover:bg-slate-50"
                  }`}
                >
                  Imprimir ticket
                </button>
                {canPrintReturn && (
                  <button
                    type="button"
                    onClick={handlePrintReturnTicket}
                    disabled={returnPrintLoading}
                    className={`px-4 py-2.5 rounded-md border text-base font-semibold disabled:opacity-50 ${
                      isPosTheme
                        ? "border-slate-700 text-slate-100 hover:bg-slate-800"
                        : "border-slate-300 text-slate-700 bg-white shadow-sm hover:bg-slate-50"
                    }`}
                  >
                    {returnPrintLoading ? "Imprimiendo..." : "Imprimir devolución"}
                  </button>
                )}
                {canPrintChange && (
                  <button
                    type="button"
                    onClick={handlePrintChangeTicket}
                    disabled={changePrintLoading}
                    className={`px-4 py-2.5 rounded-md border text-base font-semibold disabled:opacity-50 ${
                      isPosTheme
                        ? "border-slate-700 text-slate-100 hover:bg-slate-800"
                        : "border-slate-300 text-slate-700 bg-white shadow-sm hover:bg-slate-50"
                    }`}
                  >
                    {changePrintLoading ? "Imprimiendo..." : "Imprimir cambio"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleEmailTicket}
                  disabled={!canEmailTicket}
                  className={`px-4 py-2.5 rounded-md border text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed ${
                    isPosTheme
                      ? "border-slate-700 text-slate-100 hover:bg-slate-800"
                      : "border-slate-300 text-slate-700 bg-white shadow-sm hover:bg-slate-50"
                  }`}
                >
                  {!showEmailForm
                    ? "Enviar por email"
                    : emailSending
                    ? "Enviando…"
                    : "Enviar ticket"}
                </button>
              </div>
              {showEmailForm && (
                <div className="flex flex-col gap-1 w-full sm:w-80">
                  <label className="flex flex-col text-base text-slate-400">
                    <span className="mb-1">Enviar ticket a</span>
                    <input
                      type="email"
                      value={emailRecipient}
                      onChange={(e) => setEmailRecipient(e.target.value)}
                      placeholder="cliente@email.com"
                      className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-base text-slate-100 placeholder:text-slate-500 focus:ring-1 focus:ring-emerald-500"
                      disabled={!selectedSale}
                    />
                  </label>
                  {emailFeedback && (
                    <p className="text-base text-emerald-300">
                      {emailFeedback}
                    </p>
                  )}
                  {emailError && (
                    <p className="text-base text-rose-300">
                      {emailError}
                    </p>
                  )}
                </div>
              )}
              {returnPrintError && (
                <p className="text-base text-rose-300">
                  {returnPrintError}
                </p>
              )}
              {changePrintError && (
                <p className="text-base text-rose-300">
                  {changePrintError}
                </p>
              )}
            </div>
          </div>

          {!selectedSale ? (
            <div className="h-24 flex items-center justify-center text-base text-slate-500">
              No hay ninguna venta seleccionada.
            </div>
          ) : (
            <div className="space-y-4">
              {showSaleDetails && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1 text-base">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Nº venta</span>
                    <span className="font-mono text-slate-100">
                      #{selectedSale.sale_number ?? selectedSale.id}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-400">Documento</span>
                    <span className="text-slate-100">
                      {selectedSale.document_number || "V000000"}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-400">Cliente</span>
                    <span className="text-slate-100">
                      {selectedSale.customer_name || "—"}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-400">Fecha / hora</span>
                    <span className="text-slate-100">
                      {formatDateTime(selectedSale.created_at)}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-400">POS</span>
                    <span className="text-slate-100">
                      {selectedSale.pos_name || "—"}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-400">Vendedor</span>
                    <span className="text-slate-100">
                      {selectedSale.vendor_name || "—"}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-400">Devoluciones</span>
                    <span className="text-slate-100">
                      {selectedSale.refund_count ?? 0}
                    </span>
                  </div>

                  {hasRefunds && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Total devuelto</span>
                      <span className="text-rose-300">
                        -{formatMoney(refundAmount)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <span className="text-slate-400">Saldo neto</span>
                    <span className="text-emerald-300">
                      {formatMoney(detailTotal)}
                    </span>
                  </div>

                  {combinedSaleNotes && (
                    <div className="mt-2">
                      <span className="text-slate-400 block mb-1">
                        Notas
                      </span>
                      <p className="text-slate-100 text-base">
                        {combinedSaleNotes}
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-2 text-base">
                  <div>
                    <span className="text-slate-400 block mb-1">
                      Métodos de pago
                    </span>

                    {hasMultiplePayments ? (
                      <div className="space-y-1">
                        <div className="text-slate-300">
                          Mixto (pagos múltiples)
                        </div>
                        {adjustedPayments.map((p) => (
                          <div
                            key={p.id ?? `${p.method}-${p.amount}`}
                            className="flex justify-between"
                          >
                            <span className="text-slate-300">
                              {mapPaymentMethod(p.method)}
                            </span>
                            <span className="text-slate-100">
                              {formatMoney(
                                (p as typeof p & { displayAmount?: number })
                                  .displayAmount ?? p.amount
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between">
                          <span className="text-slate-300">
                            {isSeparatedDetail
                              ? "Separado"
                              : singleMethodBaseLabel}
                          </span>
                          <span className="text-slate-100">
                            {formatMoney(
                              isSeparatedDetail
                                ? selectedSale?.initial_payment_amount ??
                                  selectedSeparatedOrder?.initial_payment ??
                                  0
                                : singleMethodAmount
                            )}
                          </span>
                        </div>
                        {isSeparatedDetail && (
                          <div className="text-base text-slate-500">
                            Abono inicial registrado como{" "}
                            {separatedInitialMethodLabel}.
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {selectedSeparatedOrder && (
                    <div className="mt-3 space-y-2">
                      <span className="text-slate-400 block mb-1">
                        Abonos registrados
                      </span>
                      <div className="flex justify-between text-base">
                        <span className="text-slate-300">
                          Saldo pendiente
                        </span>
                        <span
                          className={`font-semibold ${
                            (separatedBalance ?? 0) === 0
                              ? "text-emerald-300"
                              : "text-rose-300"
                          }`}
                        >
                          {formatMoney(separatedBalance ?? 0)}
                        </span>
                      </div>
                      <div className="text-base text-slate-500">
                        Fecha límite: {separatedDueDateLabel}
                      </div>
                      <div className="space-y-2">
                        {separatedPaymentEntries.map((entry) => (
                          <div
                            key={`${entry.label}-${entry.paidAt ?? entry.amount}`}
                            className="flex items-center justify-between text-base"
                          >
                            <div>
                              <div className="text-slate-300 font-semibold">
                                {entry.label}
                              </div>
                              <div className="text-base text-slate-500">
                                {mapPaymentMethod(entry.method)} ·{" "}
                                {entry.paidAt
                                  ? formatDateTime(entry.paidAt)
                                  : "Sin fecha"}
                              </div>
                            </div>
                            <span className="text-slate-100">
                              {formatMoney(entry.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedSale.refunded_payments &&
                    selectedSale.refunded_payments.length > 0 && (
                      <div className="mt-3">
                        <span className="text-slate-400 block mb-1">
                          Reembolsos registrados
                        </span>
                        <div className="space-y-1">
                          {selectedSale.refunded_payments.map((p) => (
                            <div
                              key={`${p.method}-${p.amount}`}
                              className="flex justify-between text-rose-300 text-base"
                            >
                              <span>
                                {mapPaymentMethod(p.method)}
                              </span>
                              <span>
                                -{formatMoney(p.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  <hr className="border-slate-800" />

                  <div className="flex justify-between">
                    <span className="text-slate-400">
                      Subtotal productos
                    </span>
                    <span className="text-slate-100">
                      {formatMoney(detailSubtotal)}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-400">
                      Descuento artículos
                    </span>
                    <span className="text-slate-100">
                      {detailLineDiscount > 0
                        ? `-${formatMoney(detailLineDiscount)}`
                        : "0"}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-400">
                      Descuento carrito
                    </span>
                    <span className="text-slate-100">
                      {detailCartDiscountLabel}
                    </span>
                  </div>

                  {detailSurchargeAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">
                        {detailSurchargeLabel}
                      </span>
                      <span className="text-slate-100">
                        +{detailSurchargeDisplay}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <span className="text-slate-400">Descuento total</span>
                    <span className="text-slate-100">
                      {detailTotalDiscount > 0
                        ? `-${formatMoney(detailTotalDiscount)}`
                        : "0"}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-400">Total original</span>
                    <span className="text-slate-100">
                      {formatMoney(originalTotal)}
                    </span>
                  </div>

                  {hasRefunds && (
                    <div className="flex justify-between text-rose-300">
                      <span>Devuelto</span>
                      <span>-{formatMoney(refundAmount)}</span>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <span className="text-slate-400">
                      Total cobrado (neto)
                    </span>
                    <span className="text-slate-100">
                      {formatMoney(detailTotal)}
                    </span>
                  </div>

                  {hasRefunds && (
                    <div className="flex justify-between text-base text-slate-500">
                      <span>Pagado original</span>
                      <span>{formatMoney(originalPaid)}</span>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <span className="text-slate-400">Pagado (neto)</span>
                    <span className="text-slate-100">
                      {formatMoney(detailPaid)}
                    </span>
                  </div>
                </div>
                </div>
              )}

              <div className={showSaleDetails ? "mt-3" : "mt-0"}>
                <h3 className="text-base font-semibold text-slate-200 mb-2">
                  Productos de la venta
                </h3>

                {!selectedSale.items || selectedSale.items.length === 0 ? (
                  <p className="text-base text-slate-500">
                    No hay productos asociados a esta venta.
                  </p>
                ) : (
                  <div className="rounded-xl border border-slate-800/60 overflow-hidden text-lg">
                    <div
                      className={`grid grid-cols-[1fr_80px_110px_120px_120px] px-3 py-2 text-lg ${
                        isPosTheme
                          ? "bg-slate-950 text-slate-400"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      <span>Producto</span>
                      <span className="text-right">Cant.</span>
                      <span className="text-right">P. unitario</span>
                      <span className="text-right">Descuento</span>
                      <span className="text-right">Total línea</span>
                    </div>

                    <div>
                      {selectedItemDisplayRows.map((row, rowIndex) => {
                        const zebra =
                          rowIndex % 2 === 0
                            ? isPosTheme
                              ? "bg-slate-900/60"
                              : "bg-white"
                            : isPosTheme
                            ? "bg-slate-900/40"
                            : "bg-slate-50";
                        return (
                          <div
                            key={
                              row.item.id ??
                              row.item.name ??
                              Math.random()
                            }
                            className={`grid grid-cols-[1fr_80px_110px_120px_120px] px-3 py-2 text-lg ${zebra} border-t border-slate-800/40`}
                          >
                            <span className="text-slate-100 truncate">
                              {row.item.product_name ??
                                row.item.name ??
                                "Producto"}
                            </span>

                            <span className="text-right text-slate-200">
                              {row.line.quantity}
                            </span>

                            <span className="text-right text-slate-200">
                              {row.unitNet > 0
                                ? formatMoney(row.unitNet)
                                : "—"}
                            </span>

                            <span className="text-right text-slate-200">
                              {row.discountTotal > 0
                                ? `-${formatMoney(row.discountTotal)}`
                                : "0"}
                            </span>

                            <span className="text-right text-slate-200">
                              {formatMoney(row.lineTotalNet)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {latestSelectedChange?.items_new?.length ? (
                <div className="mt-4">
                  <h3 className="text-base font-semibold text-slate-200 mb-2">
                    Productos del cambio
                  </h3>
                  <div className="rounded-xl border border-slate-800/60 overflow-hidden text-base">
                    <div
                      className={`grid grid-cols-[1fr_80px_110px_120px] px-3 py-2 text-base ${
                        isPosTheme
                          ? "bg-slate-950 text-slate-400"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      <span>Producto</span>
                      <span className="text-right">Cant.</span>
                      <span className="text-right">P. unitario</span>
                      <span className="text-right">Total línea</span>
                    </div>
                    <div>
                      {latestSelectedChange.items_new.map((item, rowIndex) => {
                        const zebra =
                          rowIndex % 2 === 0
                            ? isPosTheme
                              ? "bg-slate-900/60"
                              : "bg-white"
                            : isPosTheme
                            ? "bg-slate-900/40"
                            : "bg-slate-50";
                        return (
                          <div
                          key={`change-new-${item.id}`}
                          className={`grid grid-cols-[1fr_80px_110px_120px] px-3 py-2 text-base ${zebra} border-t border-slate-800/40`}
                        >
                          <span className="text-slate-100 truncate">
                            {item.product_name}
                          </span>
                          <span className="text-right text-slate-200">
                            {item.quantity}
                          </span>
                          <span className="text-right text-slate-200">
                            {formatMoney(item.unit_price)}
                          </span>
                          <span className="text-right text-slate-200">
                            {formatMoney(item.total)}
                          </span>
                        </div>
                      )})}
                    </div>
                  </div>
                </div>
              ) : null}

              {latestSelectedChange?.items_returned?.length ? (
                <div className="mt-4">
                  <h3 className="text-base font-semibold text-slate-200 mb-2">
                    Productos devueltos en el cambio
                  </h3>
                  <div className="rounded-xl border border-slate-800/60 overflow-hidden text-base">
                    <div
                      className={`grid grid-cols-[1fr_80px_110px_120px] px-3 py-2 text-base ${
                        isPosTheme
                          ? "bg-slate-950 text-slate-400"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      <span>Producto</span>
                      <span className="text-right">Cant.</span>
                      <span className="text-right">P. unitario</span>
                      <span className="text-right">Total línea</span>
                    </div>
                    <div>
                      {latestSelectedChange.items_returned.map((item, rowIndex) => {
                        const zebra =
                          rowIndex % 2 === 0
                            ? isPosTheme
                              ? "bg-slate-900/60"
                              : "bg-white"
                            : isPosTheme
                            ? "bg-slate-900/40"
                            : "bg-slate-50";
                        return (
                          <div
                          key={`change-return-${item.product_name}-${rowIndex}`}
                          className={`grid grid-cols-[1fr_80px_110px_120px] px-3 py-2 text-base ${zebra} border-t border-slate-800/40`}
                        >
                          <span className="text-slate-100 truncate">
                            {item.product_name}
                          </span>
                          <span className="text-right text-slate-200">
                            {item.quantity}
                          </span>
                          <span className="text-right text-slate-200">
                            {formatMoney(item.unit_price_net)}
                          </span>
                          <span className="text-right text-slate-200">
                            {formatMoney(item.total_credit)}
                          </span>
                        </div>
                      )})}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

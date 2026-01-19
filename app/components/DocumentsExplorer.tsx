"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../providers/AuthProvider";
import { getApiBase } from "@/lib/api/base";
import {
  fetchPosSettings,
  PosSettingsPayload,
} from "@/lib/api/settings";
import {
  renderSaleTicket,
  renderSaleInvoice,
  renderClosureTicket,
  renderChangeTicket,
  buildSaleTicketCustomer,
} from "@/lib/printing/saleTicket";
import { usePaymentMethodLabelResolver } from "@/app/hooks/usePaymentMethodLabelResolver";
import {
  fetchSeparatedOrders,
  type SeparatedOrder,
  type SeparatedOrderPayment,
} from "@/lib/api/separatedOrders";

const DOCUMENTS_STATE_KEY = "kensar_documents_state";

type SaleItem = {
  id?: number;
  product_name?: string;
  name?: string;
  quantity: number;
  unit_price?: number;
  total?: number;
  unit_price_original?: number;
  line_discount_value?: number;
};

 type Payment = {
  id?: number;
  method: string;
  amount: number;
 };

type SaleRecord = {
  id: number;
  sale_number?: number;
  document_number?: string;
  created_at: string;
 payment_method?: string;
 customer_name?: string | null;
 customer_phone?: string | null;
 customer_email?: string | null;
 customer_tax_id?: string | null;
 customer_address?: string | null;
 pos_name?: string | null;
 vendor_name?: string | null;
  status?: string;
  voided_at?: string | null;
  void_reason?: string | null;
  adjustment_reference?: string | null;
  closure_id?: number | null;
  total?: number;
 paid_amount?: number;
 cart_discount_value?: number | null;
 cart_discount_percent?: number | null;
 items?: SaleItem[];
  payments?: Payment[];
  refunded_total?: number | null;
  refunded_balance?: number | null;
  notes?: string | null;
  is_separated?: boolean;
  initial_payment_method?: string | null;
  initial_payment_amount?: number | null;
  balance?: number | null;
  surcharge_amount?: number | null;
  surcharge_label?: string | null;
};

 type ReturnPayment = {
  method: string;
  amount: number;
 };

type ReturnRecord = {
  id: number;
  document_number?: string;
  created_at?: string;
  sale_document_number?: string;
  sale_number?: number;
  sale_id?: number;
  customer_name?: string | null;
  pos_name?: string | null;
  vendor_name?: string | null;
  status?: string;
  voided_at?: string | null;
  void_reason?: string | null;
  adjustment_reference?: string | null;
  closure_id?: number | null;
  total_refund?: number;
  notes?: string | null;
  items?: { sale_item_id: number; quantity: number; product_name?: string; name?: string }[];
  payments?: ReturnPayment[];
};

type ChangeRecord = {
  id: number;
  document_number?: string;
  created_at?: string;
  sale_id?: number;
  pos_name?: string | null;
  seller_name?: string | null;
  status?: string;
  voided_at?: string | null;
  void_reason?: string | null;
  adjustment_reference?: string | null;
  closure_id?: number | null;
  total_credit?: number;
  total_new?: number;
  extra_payment?: number;
  refund_due?: number;
  notes?: string | null;
  items_returned?: {
    sale_item_id: number;
    quantity: number;
    product_name?: string;
    product_sku?: string | null;
    unit_price_net?: number;
    total_credit?: number;
  }[];
  items_new?: {
    product_id: number;
    quantity: number;
    product_name?: string;
    product_sku?: string | null;
    unit_price?: number;
    total?: number;
  }[];
  payments?: ReturnPayment[];
};

type AbonoRecord = {
  id: number;
  order_id: number;
  sale_id: number;
  sale_document_number: string;
  customer_name?: string | null;
  method: string;
  amount: number;
  paid_at: string;
  status?: string | null;
  closure_id?: number | null;
  note?: string | null;
};

type ClosureRecord = {
  id: number;
  consecutive?: string | null;
  pos_name?: string | null;
  pos_identifier?: string | null;
  opened_at?: string | null;
  closed_at?: string | null;
  total_amount: number;
  total_cash: number;
  total_card: number;
  total_qr: number;
  total_nequi: number;
  total_daviplata: number;
  total_credit: number;
  total_refunds: number;
  net_amount: number;
  change_extra_total?: number | null;
  change_refund_total?: number | null;
  change_count?: number | null;
  counted_cash: number;
  difference: number;
  notes?: string | null;
  closed_by_user_name: string;
  separated_summary?: {
    tickets: number;
    payments_total: number;
    reserved_total: number;
    pending_total: number;
  } | null;
};

type DocumentRow = {
  id: string;
  type: "venta" | "devolucion" | "cambio" | "cierre" | "abono";
  recordId: number;
  saleId?: number;
  createdAt: string;
  documentNumber: string;
  reference: string;
  detail: string;
  total: number;
  paymentMethod?: string;
  isSeparated?: boolean;
  initialPaymentMethod?: string | null;
  initialPaymentAmount?: number | null;
  customer?: string;
  pos?: string;
  vendor?: string;
  refundAmount?: number;
  isAnnulation?: boolean;
  status?: string;
  closureId?: number | null;
  data: SaleRecord | ReturnRecord | ChangeRecord | ClosureRecord | AbonoRecord;
};

type SummaryCard = {
  label: string;
  value: string;
  hint?: string;
  highlight?: "positive" | "warning" | "danger";
};

function formatMoney(value: number | string | undefined | null): string {
  if (value == null) return "0";
  const numeric =
    typeof value === "string" ? parseMoneyString(value) : value;
  if (!Number.isFinite(numeric)) return "0";
  const formatted = numeric.toLocaleString("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  if (/^0+$/.test(formatted)) return "0";
  return formatted;
}

function parseMoneyString(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;

  const thousandMatch = trimmed.match(/^(-?\d{1,3})\.0{4}$/);
  if (thousandMatch) {
    const base = Number(thousandMatch[1]);
    return Number.isFinite(base) ? base * 1000 : 0;
  }

  const hasComma = trimmed.includes(",");
  const hasDot = trimmed.includes(".");
  let normalized = trimmed;

  if (hasComma && hasDot) {
    normalized = trimmed.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    normalized = trimmed.replace(",", ".");
  } else if (hasDot) {
    const parts = trimmed.split(".");
    if (
      parts.length === 2 &&
      /^[0]+$/.test(parts[1]) &&
      parts[0].length <= 2
    ) {
      normalized = `${parts[0]}000`;
    }
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toExportNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = value.replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  return parseMoneyString(value);
}

 function formatDateTime(value: string | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("es-CO", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
 }

function computeSaleTotals(sale: SaleRecord) {
  if (sale.status === "voided") {
    return {
      refundAmount: 0,
      netTotal: 0,
      paid: 0,
      surchargeAmount: 0,
      surchargeLabel: sale.surcharge_label ?? null,
    };
  }
  const totalBase = sale.total ?? 0;
  const refundAmount = Math.max(0, sale.refunded_total ?? 0);
  const netTotal = sale.refunded_balance != null
    ? Math.max(0, sale.refunded_balance)
    : Math.max(0, totalBase - refundAmount);
  const paidAmountRaw = sale.paid_amount ?? totalBase;
  const cappedPaid = sale.is_separated ? paidAmountRaw : Math.min(paidAmountRaw, totalBase);
  const paid = Math.max(0, cappedPaid - refundAmount);
  const surchargeAmount = Math.max(0, sale.surcharge_amount ?? 0);
  return {
    refundAmount,
    netTotal,
    paid,
    surchargeAmount,
    surchargeLabel: sale.surcharge_label ?? null,
  };
}

type SaleLineBreakdown = {
  key: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  total: number;
  discount: number;
};

function buildSaleLineBreakdown(sale: SaleRecord) {
  const items = sale.items ?? [];
  const lines: SaleLineBreakdown[] = items.map((item, index) => {
    const quantity = Number(item.quantity ?? 1) || 1;
    const explicitTotal =
      typeof item.total === "number" ? item.total : undefined;
    const unitPrice =
      typeof item.unit_price === "number" && item.unit_price >= 0
        ? item.unit_price
        : explicitTotal != null && quantity > 0
        ? explicitTotal / quantity
        : 0;
    const subtotal = unitPrice * quantity;
    const total =
      explicitTotal != null
        ? explicitTotal
        : Math.max(0, subtotal - (item.line_discount_value ?? 0));
    const discount = Math.max(0, subtotal - total);
    return {
      key: `${item.id ?? index}-${item.product_name ?? item.name ?? "producto"}`,
      name: item.product_name ?? item.name ?? "Producto",
      quantity,
      unitPrice,
      subtotal,
      total,
      discount,
    };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.subtotal, 0);
  const lineDiscountTotal = lines.reduce(
    (sum, line) => sum + line.discount,
    0
  );
  return { lines, subtotal, lineDiscountTotal };
}

function printClosureTicket(closure: ClosureRecord, settings?: PosSettingsPayload | null) {
  if (typeof window === "undefined") return;
  const now = closure.closed_at ? new Date(closure.closed_at) : new Date();
  const methodRows = [
    { label: "Efectivo", value: closure.total_cash },
    { label: "Tarjeta", value: closure.total_card },
    { label: "Transferencias / QR", value: closure.total_qr },
    { label: "Nequi", value: closure.total_nequi },
    { label: "Daviplata", value: closure.total_daviplata },
    { label: "Crédito / separado", value: closure.total_credit },
  ].filter((m) => m.value > 0);
  const separatedSummary = closure.separated_summary
    ? {
        tickets: closure.separated_summary.tickets ?? 0,
        paymentsTotal: closure.separated_summary.payments_total ?? 0,
        reservedTotal: closure.separated_summary.reserved_total ?? 0,
        pendingTotal: closure.separated_summary.pending_total ?? 0,
      }
    : undefined;
  const html = renderClosureTicket({
    documentNumber: closure.consecutive ?? `CL-${closure.id.toString().padStart(5, "0")}`,
    closedAt: now,
    posName: closure.pos_name ?? null,
    responsible: closure.closed_by_user_name,
    totals: {
      registered: closure.total_amount,
      refunds: closure.total_refunds,
      net: closure.net_amount,
      expectedCash: closure.total_cash,
      countedCash: closure.counted_cash,
      difference: closure.difference,
      changeExtra: closure.change_extra_total ?? 0,
      changeRefund: closure.change_refund_total ?? 0,
      changeCount: closure.change_count ?? 0,
    },
    methods: methodRows.map((m) => ({ label: m.label, amount: m.value })),
    separatedSummary,
    notes: closure.notes ?? null,
    settings,
  });
  const win = window.open("", "_blank", "width=420,height=640");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  const triggerPrint = () => {
    try {
      win.focus();
      win.print();
    } catch (err) {
      console.error("No se pudo imprimir el reporte Z", err);
    } finally {
      if (!win.closed) {
        win.close();
      }
    }
  };
  if (win.document.readyState === "complete") {
    triggerPrint();
  } else {
    win.onload = triggerPrint;
  }
}

type DocumentsExplorerProps = {
  backPath?: string;
  backLabel?: string;
  hideManageCustomers?: boolean;
};

export default function DocumentsExplorer({
  backPath,
  backLabel = "Volver",
  hideManageCustomers = false,
}: DocumentsExplorerProps = {}) {
  const router = useRouter();
  const { token, logout, user } = useAuth();
  const [posSettings, setPosSettings] =
    useState<PosSettingsPayload | null>(null);
  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : null),
    [token]
  );
  const { getPaymentLabel } = usePaymentMethodLabelResolver();
  const mapPaymentMethod = useCallback(
    (method?: string | null) => {
      if (!method) return "—";
      if (method.toLowerCase() === "cierre") {
        return "Cierre de caja";
      }
      return getPaymentLabel(method, "—");
    },
    [getPaymentLabel]
  );
  const today = new Date().toISOString().slice(0, 10);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [changes, setChanges] = useState<ChangeRecord[]>([]);
  const [closures, setClosures] = useState<ClosureRecord[]>([]);
  const [separatedOrders, setSeparatedOrders] = useState<SeparatedOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedDoc, setSelectedDoc] = useState<DocumentRow | null>(null);
  const [detailExpanded, setDetailExpanded] = useState(false);
  const [selectedSeparatedOrder, setSelectedSeparatedOrder] =
    useState<SeparatedOrder | null>(null);

  const [filterType, setFilterType] = useState("all");
  const [filterFrom, setFilterFrom] = useState(today);
  const [filterTo, setFilterTo] = useState(today);
  const [filterTerm, setFilterTerm] = useState("");
  const [filterPayment, setFilterPayment] = useState("");
  const [filterCustomer, setFilterCustomer] = useState("");
  const [filterPos, setFilterPos] = useState("");
  const [filterVendor, setFilterVendor] = useState("");
  const [filtersReady, setFiltersReady] = useState(false);
  const [persistedSelectedId, setPersistedSelectedId] = useState<string | null>(
    null
  );
  const [voidTarget, setVoidTarget] = useState<DocumentRow | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);

  const formatDateInput = (date: Date) =>
    date.toISOString().slice(0, 10);

  const applyQuickRange = (range: string) => {
    const now = new Date();
    let start = new Date(now);
    let end = new Date(now);

    switch (range) {
      case "today":
        break;
      case "yesterday":
        start.setDate(now.getDate() - 1);
        end = new Date(start);
        break;
      case "last7":
        start.setDate(now.getDate() - 6);
        break;
      case "week":
        {
          const day = now.getDay();
          const diffToMonday = (day + 6) % 7;
          start.setDate(now.getDate() - diffToMonday);
        }
        break;
      case "month":
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "year":
        start = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        break;
    }

    setFilterFrom(formatDateInput(start));
    setFilterTo(formatDateInput(end));
  };

  async function loadDocuments() {
    try {
      setLoading(true);
      setError(null);
      if (!authHeaders) throw new Error("Sin sesión activa");
      const apiBase = getApiBase();
      const [salesRes, returnsRes, changesRes, closuresRes, separatedOrdersRes] = await Promise.all([
        fetch(`${apiBase}/pos/sales?skip=0&limit=200`, {
          headers: authHeaders,
          credentials: "include",
        }),
        fetch(`${apiBase}/pos/returns?skip=0&limit=200`, {
          headers: authHeaders,
          credentials: "include",
        }),
        fetch(`${apiBase}/pos/changes?skip=0&limit=200`, {
          headers: authHeaders,
          credentials: "include",
        }),
        fetch(`${apiBase}/pos/closures?skip=0&limit=200`, {
          headers: authHeaders,
          credentials: "include",
        }),
        fetchSeparatedOrders({ limit: 200 }, token),
      ]);

      const handleUnauthorized = (res: Response) => {
        if (res.status === 401) {
          logout();
          throw new Error(
            "Tu sesión expiró o no tienes permisos. Vuelve a iniciar sesión."
          );
        }
      };

      handleUnauthorized(salesRes);
      handleUnauthorized(returnsRes);
      handleUnauthorized(changesRes);
      handleUnauthorized(closuresRes);

      if (!salesRes.ok) throw new Error("Error al cargar ventas");
      if (!returnsRes.ok) throw new Error("Error al cargar devoluciones");
      if (!changesRes.ok) throw new Error("Error al cargar cambios");
      if (!closuresRes.ok) throw new Error("Error al cargar cierres");
      const salesData: SaleRecord[] = await salesRes.json();
      const returnsData: ReturnRecord[] = await returnsRes.json();
      const changesData: ChangeRecord[] = await changesRes.json();
      const closuresData: ClosureRecord[] = await closuresRes.json();
      const separatedOrdersData = separatedOrdersRes as SeparatedOrder[];
      setSales(salesData);
      setReturns(returnsData);
      setChanges(changesData);
      setClosures(closuresData);
      setSeparatedOrders(separatedOrdersData);
      const docsList = mappedDocuments(
        salesData,
        returnsData,
        changesData,
        closuresData,
        separatedOrdersData
      );
      setSelectedDoc((prev) => {
        if (prev) {
          const prevMatch = docsList.find((doc) => doc.id === prev.id);
          if (prevMatch) return prevMatch;
        }
        if (persistedSelectedId) {
          const savedMatch = docsList.find(
            (doc) => doc.id === persistedSelectedId
          );
          if (savedMatch) {
            setPersistedSelectedId(null);
            return savedMatch;
          }
        }
        return docsList[0] ?? null;
      });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Error al cargar documentos");
    } finally {
      setLoading(false);
    }
  }

  function openVoidModal(doc: DocumentRow) {
    setVoidTarget(doc);
    setVoidReason("");
    setVoidError(null);
  }

  function closeVoidModal() {
    setVoidTarget(null);
    setVoidReason("");
    setVoidError(null);
  }

  async function submitVoid() {
    if (!voidTarget || !authHeaders) return;
    setVoiding(true);
    setVoidError(null);
    const apiBase = getApiBase();
    try {
      if (voidTarget.type === "cierre") {
        throw new Error("Los cierres no se pueden anular.");
      }
      if (voidTarget.type === "abono") {
        throw new Error("Los abonos se ajustan desde la pantalla de separados.");
      }
      let endpoint = "";
      switch (voidTarget.type) {
        case "venta":
          endpoint = `${apiBase}/pos/sales/${voidTarget.recordId}/void`;
          break;
        case "devolucion":
          endpoint = `${apiBase}/pos/returns/${voidTarget.recordId}/void`;
          break;
        case "cambio":
          endpoint = `${apiBase}/pos/changes/${voidTarget.recordId}/void`;
          break;
        default:
          throw new Error("Tipo de documento no soportado.");
      }
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        credentials: "include",
        body: JSON.stringify({ reason: voidReason || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const message =
          (data && (data.detail as string)) ||
          `Error al anular (código ${res.status})`;
        throw new Error(message);
      }
      closeVoidModal();
      await loadDocuments();
    } catch (err) {
      setVoidError(err instanceof Error ? err.message : "Error al anular");
    } finally {
      setVoiding(false);
    }
  }

  useEffect(() => {
    if (!authHeaders) return;
    void loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authHeaders]);

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
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(DOCUMENTS_STATE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as {
          filterType?: string;
          filterFrom?: string;
          filterTo?: string;
          filterTerm?: string;
          filterPayment?: string;
          filterCustomer?: string;
          filterPos?: string;
          filterVendor?: string;
          selectedDocId?: string | null;
        };
        if (saved.filterType) setFilterType(saved.filterType);
        if (saved.filterFrom) setFilterFrom(saved.filterFrom);
        if (saved.filterTo) setFilterTo(saved.filterTo);
        if (typeof saved.filterTerm === "string")
          setFilterTerm(saved.filterTerm);
        if (typeof saved.filterPayment === "string")
          setFilterPayment(saved.filterPayment);
        if (typeof saved.filterCustomer === "string")
          setFilterCustomer(saved.filterCustomer);
        if (typeof saved.filterPos === "string") setFilterPos(saved.filterPos);
        if (typeof saved.filterVendor === "string")
          setFilterVendor(saved.filterVendor);
        if (typeof saved.selectedDocId === "string")
          setPersistedSelectedId(saved.selectedDocId);
      }
    } catch (err) {
      console.warn("No se pudo restaurar el estado de documentos", err);
    } finally {
      setFiltersReady(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !filtersReady) return;
    const payload = {
      filterType,
      filterFrom,
      filterTo,
      filterTerm,
      filterPayment,
      filterCustomer,
      filterPos,
      filterVendor,
      selectedDocId: selectedDoc?.id ?? null,
    };
    try {
      window.localStorage.setItem(
        DOCUMENTS_STATE_KEY,
        JSON.stringify(payload)
      );
    } catch (err) {
      console.warn("No se pudo guardar el estado de documentos", err);
    }
  }, [
    filterType,
    filterFrom,
    filterTo,
    filterTerm,
    filterPayment,
    filterCustomer,
    filterPos,
    filterVendor,
    selectedDoc?.id,
    filtersReady,
  ]);

  function mappedDocuments(
    salesList: SaleRecord[],
    returnsList: ReturnRecord[],
    changesList: ChangeRecord[],
    closuresList: ClosureRecord[],
    separatedOrdersList: SeparatedOrder[]
  ): DocumentRow[] {
    const salesById = new Map<number, SaleRecord>();
    salesList.forEach((sale) => {
      salesById.set(sale.id, sale);
    });
    const saleDocs: DocumentRow[] = salesList.map((sale) => {
      const { netTotal, refundAmount } = computeSaleTotals(sale);
      const firstItem = sale.items && sale.items.length ? sale.items[0] : undefined;
      const detail = firstItem
        ? `${firstItem.product_name ?? firstItem.name ?? "Producto"} x${firstItem.quantity ?? 1}`
        : "Venta sin detalle";
      const isSeparated = !!sale.is_separated;
      const initialMethod =
        sale.initial_payment_method ??
        sale.payments?.[0]?.method ??
        sale.payment_method;

      return {
        id: `sale-${sale.id}`,
        type: "venta",
        recordId: sale.id,
        saleId: sale.id,
        createdAt: sale.created_at,
        documentNumber: sale.document_number ?? `V-${sale.id.toString().padStart(5, "0")}`,
        reference: `Ticket #${sale.sale_number ?? sale.id}`,
        detail,
        total: toNumber(netTotal),
        refundAmount: toNumber(refundAmount),
        paymentMethod: sale.payment_method ?? sale.payments?.[0]?.method,
        isSeparated,
        initialPaymentMethod: initialMethod,
        initialPaymentAmount: sale.initial_payment_amount ?? sale.payments?.[0]?.amount,
        customer: sale.customer_name ?? undefined,
        pos: sale.pos_name ?? undefined,
        vendor: sale.vendor_name ?? undefined,
        status: sale.status,
        closureId: sale.closure_id ?? null,
        data: sale,
      };
    });

    const returnDocs: DocumentRow[] = returnsList.map((ret) => {
      const isAnnulation = ret.status === "confirmed" && !!ret.adjustment_reference;
      const paymentsTotal =
        ret.payments?.reduce((sum, p) => sum + toNumber(p.amount), 0) ??
        ret.total_refund ??
        0;
      const firstItem = ret.items && ret.items.length ? ret.items[0] : undefined;
      const detail = firstItem
        ? `${firstItem.product_name ?? firstItem.name ?? "Producto"} x${firstItem.quantity ?? 1}`
        : isAnnulation
        ? "Anulación registrada"
        : "Devolución registrada";

      return {
        id: `return-${ret.id}`,
        type: "devolucion",
        recordId: ret.id,
        createdAt: ret.created_at ?? "",
        documentNumber:
          ret.document_number ?? `R-${ret.id.toString().padStart(5, "0")}`,
        reference: ret.sale_document_number
          ? `Ref. ${ret.sale_document_number}`
          : ret.sale_number
          ? `Venta #${ret.sale_number}`
          : "Devolución",
        detail,
        total: isAnnulation ? 0 : -Math.abs(toNumber(paymentsTotal)),
        paymentMethod: isAnnulation
          ? undefined
          : ret.payments && ret.payments[0]
          ? ret.payments[0].method
          : undefined,
        customer: ret.customer_name ?? undefined,
        pos: ret.pos_name ?? undefined,
        vendor: ret.vendor_name ?? undefined,
        refundAmount: undefined,
        status: ret.status,
        closureId: ret.closure_id ?? null,
        isAnnulation,
        data: ret,
      };
    });

    const changeDocs: DocumentRow[] = changesList.map((change) => {
      const firstItem =
        change.items_new && change.items_new.length ? change.items_new[0] : undefined;
      const detail = firstItem
        ? `${firstItem.product_name ?? "Producto"} x${firstItem.quantity ?? 1}`
        : "Cambio registrado";
      const net =
        toNumber(change.extra_payment) - toNumber(change.refund_due);
      return {
        id: `change-${change.id}`,
        type: "cambio",
        recordId: change.id,
        createdAt: change.created_at ?? "",
        documentNumber: change.document_number ?? `CB-${change.id.toString().padStart(5, "0")}`,
        reference: change.sale_id ? `Venta #${change.sale_id}` : "Cambio",
        detail,
        total: toNumber(net),
        paymentMethod:
          change.payments && change.payments[0]
            ? change.payments[0].method
            : undefined,
        pos: change.pos_name ?? undefined,
        vendor: change.seller_name ?? undefined,
        status: change.status,
        closureId: change.closure_id ?? null,
        data: change,
      };
    });

    const closureDocs: DocumentRow[] = closuresList.map((closure) => {
      const detail = `Cierre de caja ${closure.pos_name ?? "POS"}`;
      return {
        id: `closure-${closure.id}`,
        type: "cierre",
        recordId: closure.id,
        createdAt: closure.closed_at ?? closure.opened_at ?? new Date().toISOString(),
        documentNumber: closure.consecutive ?? `CL-${closure.id.toString().padStart(5, "0")}`,
        reference: `Reporte Z - ${closure.pos_name ?? "POS"}`,
        detail,
        total: toNumber(closure.net_amount ?? closure.total_amount),
        paymentMethod: "cierre",
        customer: undefined,
        pos: closure.pos_name ?? undefined,
        vendor: closure.closed_by_user_name,
        status: undefined,
        closureId: null,
        data: closure,
      };
    });

    const abonoDocs: DocumentRow[] = [];
    separatedOrdersList.forEach((order) => {
      const sale = salesById.get(order.sale_id);
      order.payments?.forEach((payment: SeparatedOrderPayment) => {
        if (payment?.status === "voided") return;
        const amount = toNumber(payment.amount ?? 0);
        const record: AbonoRecord = {
          id: payment.id,
          order_id: order.id,
          sale_id: order.sale_id,
          sale_document_number: order.sale_document_number,
          customer_name: order.customer_name ?? null,
          method: payment.method,
          amount,
          paid_at: payment.paid_at,
          status: payment.status ?? null,
          closure_id: payment.closure_id ?? null,
          note: payment.note ?? null,
        };
        abonoDocs.push({
          id: `abono-${payment.id}`,
          type: "abono",
          recordId: payment.id,
          saleId: order.sale_id,
          createdAt: payment.paid_at,
          documentNumber: `AB-${payment.id.toString().padStart(6, "0")}`,
          reference: order.sale_document_number
            ? `Separado ${order.sale_document_number}`
            : `Separado #${order.id}`,
          detail: order.sale_document_number
            ? `Abono ${order.sale_document_number}`
            : "Abono a separado",
          total: amount,
          paymentMethod: payment.method,
          customer: order.customer_name ?? undefined,
          pos: sale?.pos_name ?? undefined,
          vendor: sale?.vendor_name ?? undefined,
          status: payment.status ?? undefined,
          closureId: payment.closure_id ?? null,
          data: record,
        });
      });
    });

    return [
      ...saleDocs,
      ...returnDocs,
      ...changeDocs,
      ...abonoDocs,
      ...closureDocs,
    ].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  const documents = useMemo(
    () => mappedDocuments(sales, returns, changes, closures, separatedOrders),
    [sales, returns, changes, closures, separatedOrders]
  );

  const isAdmin = user?.role === "Administrador";
  const getStatusLabel = (status?: string) => {
    if (!status || status === "active" || status === "confirmed") return null;
    if (status === "voided") return "Anulado";
    if (status === "adjusted") return "Ajustado";
    if (status === "adjustment") return "Ajuste";
    return status;
  };

  const filterOptions = useMemo(() => {
    const posSet = new Set<string>();
    const vendorSet = new Set<string>();
    const customerSet = new Set<string>();
    const paymentSet = new Set<string>();

    documents.forEach((doc) => {
      if (doc.pos?.trim()) posSet.add(doc.pos.trim());
      if (doc.vendor?.trim()) vendorSet.add(doc.vendor.trim());
      if (doc.customer?.trim()) customerSet.add(doc.customer.trim());

      if (doc.isSeparated) {
        paymentSet.add("Separado");
      } else {
        const methodLabel = mapPaymentMethod(doc.paymentMethod);
        if (methodLabel && methodLabel !== "—") {
          paymentSet.add(methodLabel);
        }
      }
    });

    const sortOptions = (values: Set<string>) =>
      Array.from(values).sort((a, b) => a.localeCompare(b, "es"));

    return {
      pos: sortOptions(posSet),
      vendors: sortOptions(vendorSet),
      customers: sortOptions(customerSet),
      payments: sortOptions(paymentSet),
    };
  }, [documents, mapPaymentMethod]);

  const filteredDocuments = useMemo(() => {
    const fromDate = filterFrom ? new Date(filterFrom) : null;
    if (fromDate) fromDate.setHours(0, 0, 0, 0);
    const toDate = filterTo ? new Date(filterTo) : null;
    if (toDate) toDate.setHours(23, 59, 59, 999);
    const term = filterTerm.trim().toLowerCase();

    return documents.filter((doc) => {
      const dateObj = new Date(doc.createdAt);
      if (fromDate && dateObj < fromDate) return false;
      if (toDate && dateObj > toDate) return false;
      if (filterType !== "all" && doc.type !== filterType) return false;
      const docIsSeparated = !!doc.isSeparated;
      const paymentLabel = docIsSeparated
        ? "separado"
        : mapPaymentMethod(doc.paymentMethod).toLowerCase();
      if (
        term &&
        !doc.documentNumber.toLowerCase().includes(term) &&
        !doc.reference.toLowerCase().includes(term) &&
        !doc.detail.toLowerCase().includes(term)
      ) {
        return false;
      }
      if (
        filterPayment &&
        !paymentLabel.includes(filterPayment.toLowerCase())
      ) {
        return false;
      }
      if (
        filterCustomer &&
        !(doc.customer ?? "")
          .toLowerCase()
          .includes(filterCustomer.toLowerCase())
      ) {
        return false;
      }
      if (
        filterPos &&
        !(doc.pos ?? "")
          .toLowerCase()
          .includes(filterPos.toLowerCase())
      ) {
        return false;
      }
      if (
        filterVendor &&
        !(doc.vendor ?? "")
          .toLowerCase()
          .includes(filterVendor.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [
    documents,
    filterType,
    filterFrom,
    filterTo,
    filterTerm,
    filterPayment,
    filterCustomer,
    filterPos,
    filterVendor,
    mapPaymentMethod,
  ]);

useEffect(() => {
  if (filteredDocuments.length === 0) {
    if (selectedDoc) {
      setSelectedDoc(null);
    }
    return;
  }
  if (!selectedDoc) {
    setSelectedDoc(filteredDocuments[0]);
    return;
  }
  const exists = filteredDocuments.some((doc) => doc.id === selectedDoc.id);
  if (!exists) {
    setSelectedDoc(filteredDocuments[0]);
  }
}, [filteredDocuments, selectedDoc]);

useEffect(() => {
  setDetailExpanded(false);
}, [selectedDoc?.id]);

const selectedDetails = selectedDoc?.data;
  const selectedDocStatusLabel = getStatusLabel(selectedDoc?.status);
  const selectedDocIsVoided = selectedDoc?.status === "voided";

  const handleExportXlsx = useCallback(async () => {
    if (!authHeaders) return;
    const rows = filteredDocuments.map((doc) => {
      const isAnnulation =
        doc.type === "devolucion" && doc.isAnnulation;
      const typeLabel =
        doc.type === "venta"
          ? doc.status === "voided"
            ? "Anulacion"
            : "Venta"
          : doc.type === "devolucion"
          ? isAnnulation
            ? "Anulacion"
            : "Devolucion"
          : doc.type === "cambio"
          ? "Cambio"
          : doc.type === "abono"
          ? "Abono"
          : "Cierre";
      const statusLabel = getStatusLabel(doc.status) ?? "";
      const methodLabel = doc.isSeparated
        ? "SEPARADO"
        : mapPaymentMethod(doc.initialPaymentMethod ?? doc.paymentMethod);
      return {
        document_number: doc.documentNumber,
        doc_type: typeLabel,
        detail: doc.detail,
        total: toExportNumber(doc.total),
        method: methodLabel,
        customer: doc.customer ?? "",
        pos: doc.pos ?? "",
        vendor: doc.vendor ?? "",
        reference: doc.reference ?? "",
        status: statusLabel,
        created_at: formatDateTime(doc.createdAt),
      };
    });

    const apiBase = getApiBase();
    const res = await fetch(`${apiBase}/dashboard/documents/export/xlsx`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      credentials: "include",
      body: JSON.stringify({ items: rows }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(detail || `Error ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `documentos_${today}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [authHeaders, filteredDocuments, mapPaymentMethod]);
const selectedDocCanShowVoidButton =
  !!selectedDoc &&
  isAdmin &&
  selectedDoc.type !== "cierre" &&
  selectedDoc.type !== "abono" &&
  !selectedDocIsVoided;
const selectedDocCanVoid =
  !!selectedDoc &&
  isAdmin &&
  selectedDoc.type !== "cierre" &&
  selectedDoc.type !== "abono" &&
  !selectedDocIsVoided &&
  (selectedDoc.type === "venta" || selectedDoc.closureId == null);
const selectedDocActionLabel =
  selectedDoc?.type === "venta" && selectedDoc?.closureId ? "Ajustar" : "Anular";
const selectedSaleDocument =
  selectedDoc?.type === "venta"
    ? (selectedDoc.data as SaleRecord)
    : null;
const hasSelectedSaleDocument = !!selectedSaleDocument;
const selectedSaleDocumentId = selectedSaleDocument?.id ?? null;
const selectedSaleDocumentNumber =
  selectedSaleDocument?.document_number ?? null;
const selectedSaleDocumentSaleNumber =
  selectedSaleDocument?.sale_number ?? null;
const selectedSaleLines = useMemo(
  () =>
    selectedSaleDocument
      ? buildSaleLineBreakdown(selectedSaleDocument)
      : null,
  [selectedSaleDocument]
);
const selectedSaleTotals = useMemo(
  () =>
    selectedSaleDocument
      ? computeSaleTotals(selectedSaleDocument)
      : null,
  [selectedSaleDocument]
);
const selectedSaleSurchargeAmount =
  selectedSaleDocument?.surcharge_amount ??
  selectedSaleTotals?.surchargeAmount ??
  0;
const selectedSaleSurchargeLabel =
  selectedSaleSurchargeAmount > 0
    ? selectedSaleDocument?.surcharge_label ??
      selectedSaleTotals?.surchargeLabel ??
      "Incremento"
    : null;
const selectedSalePayments = useMemo(() => {
  if (!selectedSaleDocument) return [];
  if (selectedSaleDocument.payments && selectedSaleDocument.payments.length > 0) {
    return selectedSaleDocument.payments.map((payment, index) => ({
      key: `${payment.id ?? payment.method ?? index}`,
      method: payment.method,
      amount: payment.amount ?? 0,
    }));
  }
  if (selectedSaleDocument.payment_method) {
    return [
      {
        key: "default",
        method: selectedSaleDocument.payment_method,
        amount:
          selectedSaleDocument.paid_amount ??
          selectedSaleTotals?.paid ??
          selectedSaleTotals?.netTotal ??
          selectedDoc?.total ??
          0,
      },
    ];
  }
  return [];
}, [selectedSaleDocument, selectedSaleTotals, selectedDoc?.total]);

  const selectedSalePaymentsTotal = selectedSalePayments.reduce(
    (sum, entry) => sum + (Number(entry.amount) || 0),
    0
  );
  const selectedSalePendingAmount = useMemo(() => {
    if (selectedSeparatedOrder) {
      return Math.max(0, selectedSeparatedOrder.balance ?? 0);
    }
    if (selectedSaleTotals && selectedSaleTotals.netTotal > 0) {
      return Math.max(0, selectedSaleTotals.netTotal - selectedSalePaymentsTotal);
    }
    return 0;
  }, [selectedSeparatedOrder, selectedSaleTotals, selectedSalePaymentsTotal]);
  const selectedDocIsSeparated =
    !!(selectedDoc?.isSeparated ?? selectedSaleDocument?.is_separated);
  const selectedSaleInitialMethod =
    selectedDoc?.initialPaymentMethod ??
    selectedSaleDocument?.initial_payment_method ??
    selectedSaleDocument?.payments?.[0]?.method ??
    selectedSaleDocument?.payment_method ??
    selectedDoc?.paymentMethod;
  const selectedSaleInitialAmount =
    selectedDoc?.initialPaymentAmount ??
    selectedSaleDocument?.initial_payment_amount ??
    null;
  const normalizedInitialMethod = selectedSaleInitialMethod
    ? selectedSaleInitialMethod.toLowerCase()
    : null;
  const selectedDocInitialMethodLabel = mapPaymentMethod(
    selectedSaleInitialMethod
  );
  const selectedSeparatedDueDateLabel = useMemo(() => {
    if (!selectedSeparatedOrder?.due_date) return null;
    return formatDateTime(selectedSeparatedOrder.due_date);
  }, [selectedSeparatedOrder]);
  const separatedPaymentEntries = useMemo(() => {
    if (!selectedSeparatedOrder) return [];
    const entries: {
      label: string;
      amount: number;
      methodLabel: string;
      paidAt?: string | null;
    }[] = [];
    entries.push({
      label: "Abono inicial",
      amount: selectedSeparatedOrder.initial_payment ?? 0,
      methodLabel: selectedDocInitialMethodLabel,
      paidAt:
        selectedSaleDocument?.created_at ??
        selectedSeparatedOrder.created_at ??
        null,
    });
    selectedSeparatedOrder.payments.forEach((payment, idx) => {
      entries.push({
        label: `Abono ${idx + 2}`,
        amount: payment.amount ?? 0,
        methodLabel: mapPaymentMethod(payment.method),
        paidAt: payment.paid_at,
      });
    });
    return entries;
  }, [
    selectedSeparatedOrder,
    selectedDocInitialMethodLabel,
    selectedSaleDocument?.created_at,
    mapPaymentMethod,
  ]);
useEffect(() => {
  if (!token || !hasSelectedSaleDocument || !selectedDocIsSeparated) {
    setSelectedSeparatedOrder(null);
    return;
  }
  let active = true;
  const loadSeparatedOrder = async () => {
    try {
      const params: Parameters<typeof fetchSeparatedOrders>[0] = {
        limit: 5,
      };
      if (selectedSaleDocumentNumber) {
        params.barcode = selectedSaleDocumentNumber;
      }
      if (selectedSaleDocumentSaleNumber != null) {
        params.saleNumber = selectedSaleDocumentSaleNumber;
      }
      const records = await fetchSeparatedOrders(params, token);
      if (!active) return;
      const match =
        records.find((order) => order.sale_id === selectedSaleDocumentId) ??
        null;
      setSelectedSeparatedOrder(match);
    } catch (err) {
      console.warn("No se pudo cargar el separado del documento", err);
      if (active) {
        setSelectedSeparatedOrder(null);
      }
    }
  };
  loadSeparatedOrder();
  return () => {
    active = false;
  };
}, [
  token,
  hasSelectedSaleDocument,
  selectedSaleDocumentId,
  selectedSaleDocumentNumber,
  selectedSaleDocumentSaleNumber,
  selectedDocIsSeparated,
]);

const selectedDocMethodLabel = selectedDocIsSeparated
    ? "SEPARADO"
    : selectedDocInitialMethodLabel;
  const selectedReturnRecord =
    selectedDoc?.type === "devolucion"
      ? (selectedDoc.data as ReturnRecord)
      : null;
  const selectedReturnPayments = selectedReturnRecord?.payments ?? [];
  const selectedSaleCartDiscountValue =
    selectedSaleDocument?.cart_discount_value ?? 0;
  const selectedSaleCartDiscountPercent =
    selectedSaleDocument?.cart_discount_percent ?? 0;
  const documentsGridClass = detailExpanded
    ? "grid gap-4 lg:grid-cols-[minmax(260px,0.9fr)_minmax(360px,1.35fr)]"
    : "grid gap-4 lg:grid-cols-[1.45fr_1fr]";
  const saleSummaryCards: SummaryCard[] = useMemo(() => {
    if (!selectedDoc || selectedDoc.type !== "venta") return [];
    const cards: SummaryCard[] = [];
    const saleNetTotal =
      selectedSaleTotals?.netTotal ??
      selectedDoc.total ??
      selectedSaleDocument?.total ??
      0;
    if (saleNetTotal > 0) {
      cards.push({
        label: "Total venta",
        value: formatMoney(saleNetTotal),
      });
    }
    cards.push({
      label: "Pagado",
      value: formatMoney(selectedSalePaymentsTotal),
      hint:
        selectedSalePayments.length > 1
          ? "Suma de todos los pagos"
          : undefined,
      highlight: "positive",
    });
    if (selectedSalePendingAmount > 0) {
      cards.push({
        label: "Saldo pendiente",
        value: formatMoney(selectedSalePendingAmount),
        highlight: "warning",
      });
    }
    if (
      selectedSaleTotals &&
      selectedSaleTotals.refundAmount > 0
    ) {
      cards.push({
        label: "Devoluciones",
        value: `-${formatMoney(selectedSaleTotals.refundAmount)}`,
        highlight: "danger",
      });
    }
    if (selectedSaleSurchargeAmount > 0) {
      cards.push({
        label: selectedSaleSurchargeLabel ?? "Incremento",
        value: `+${formatMoney(selectedSaleSurchargeAmount)}`,
        highlight: "warning",
      });
    }
    if (selectedSaleCartDiscountValue > 0) {
      cards.push({
        label: "Descuento carrito",
        value: `-${formatMoney(selectedSaleCartDiscountValue)}`,
        highlight: "danger",
      });
    } else if (selectedSaleCartDiscountPercent > 0) {
      cards.push({
        label: "Descuento carrito",
        value: `-${selectedSaleCartDiscountPercent}%`,
        highlight: "danger",
      });
    }
    if (
      selectedSaleLines &&
      selectedSaleLines.lineDiscountTotal > 0
    ) {
      cards.push({
        label: "Descuentos por línea",
        value: `-${formatMoney(selectedSaleLines.lineDiscountTotal)}`,
        highlight: "danger",
      });
    }
    return cards;
  }, [
    selectedDoc,
    selectedSaleTotals,
    selectedSaleDocument?.total,
    selectedSalePaymentsTotal,
    selectedSalePayments,
    selectedSalePendingAmount,
    selectedSaleSurchargeAmount,
    selectedSaleSurchargeLabel,
    selectedSaleCartDiscountValue,
    selectedSaleCartDiscountPercent,
    selectedSaleLines,
  ]);

  const canPrintSelectedTicket = !!selectedSaleDocument;
  const buildSelectedSaleDocumentPayload = () => {
    if (!selectedSaleDocument) return null;

    const formatCurrency = (value: number) =>
      `$ ${value.toLocaleString("es-CO", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })}`;

    const lineBreakdown = buildSaleLineBreakdown(selectedSaleDocument);
    const ticketItems = lineBreakdown.lines.map((line) => ({
      name: line.name,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      total: line.total,
    }));
    const subtotal = lineBreakdown.subtotal;
    const lineDiscountTotal = lineBreakdown.lineDiscountTotal;

    const totals = computeSaleTotals(selectedSaleDocument);
    const total = totals.netTotal;
    const ticketSurchargeAmount =
      selectedSaleDocument.surcharge_amount ??
      totals.surchargeAmount ??
      0;
    const hasTicketSurcharge = ticketSurchargeAmount > 0;
    const ticketSurchargeLabel = hasTicketSurcharge
      ? selectedSaleDocument.surcharge_label ??
        totals.surchargeLabel ??
        "Incremento"
      : undefined;
    const ticketSurchargeDisplay = hasTicketSurcharge
      ? formatCurrency(ticketSurchargeAmount)
      : undefined;

    const cartDiscountValue = selectedSaleDocument.cart_discount_value ?? 0;
    const cartDiscountLabel =
      cartDiscountValue > 0
        ? "Descuento carrito (valor)"
        : selectedSaleDocument.cart_discount_percent &&
          selectedSaleDocument.cart_discount_percent > 0
        ? "Descuento carrito (%)"
        : "Descuento carrito";
    const cartDiscountValueDisplay =
      cartDiscountValue > 0
        ? `-${formatCurrency(cartDiscountValue)}`
        : selectedSaleDocument.cart_discount_percent &&
          selectedSaleDocument.cart_discount_percent > 0
        ? `-${selectedSaleDocument.cart_discount_percent}%`
        : "0";

    const payments =
      selectedSaleDocument.payments && selectedSaleDocument.payments.length
        ? selectedSaleDocument.payments.map((p) => ({
            label: mapPaymentMethod(p.method),
            amount: p.amount,
          }))
        : [
            {
              label: mapPaymentMethod(
                selectedSaleDocument.payment_method
              ),
              amount:
                selectedSaleDocument.paid_amount ??
                totals.paid ??
                total,
            },
          ];

    const changeAmount = selectedDocIsSeparated
      ? 0
      : selectedSaleDocument.paid_amount != null
      ? selectedSaleDocument.paid_amount - total
      : 0;

    const separatedTicketInfo =
      selectedDocIsSeparated && selectedSeparatedOrder
        ? {
            dueDate: selectedSeparatedOrder.due_date ?? null,
            balance: Math.max(selectedSalePendingAmount, 0),
            payments: separatedPaymentEntries.map((entry) => ({
              label: entry.label,
              amount: entry.amount,
              paidAt: entry.paidAt ?? undefined,
              method: entry.methodLabel,
            })),
          }
        : undefined;

    return {
      documentNumber:
        selectedSaleDocument.document_number ??
        `V-${selectedSaleDocument.id.toString().padStart(5, "0")}`,
      saleNumber: selectedSaleDocument.sale_number ?? selectedSaleDocument.id,
      date: new Date(selectedSaleDocument.created_at),
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
      notes: selectedSaleDocument.notes,
      posName: selectedSaleDocument.pos_name ?? undefined,
      vendorName: selectedSaleDocument.vendor_name ?? undefined,
      settings: posSettings,
      customer: buildSaleTicketCustomer({
        name: selectedSaleDocument.customer_name ?? undefined,
        phone: selectedSaleDocument.customer_phone ?? undefined,
        email: selectedSaleDocument.customer_email ?? undefined,
        taxId: selectedSaleDocument.customer_tax_id ?? undefined,
        address: selectedSaleDocument.customer_address ?? undefined,
      }),
      separatedInfo: separatedTicketInfo,
    };
  };

  const openSaleDocumentWindow = (
    html: string,
    size: { width: number; height: number }
  ) => {
    const win = window.open(
      "",
      "_blank",
      `width=${size.width},height=${size.height}`
    );
    if (!win) return;
    win.document.write(html);
    win.document.close();

    const triggerPrint = () => {
      try {
        win.focus();
        win.print();
      } catch (err) {
        console.error("No se pudo imprimir el documento", err);
      } finally {
        win.close();
      }
    };

    if (win.document.readyState === "complete") {
      triggerPrint();
    } else {
      win.onload = triggerPrint;
    }
  };

  const handlePrintSelectedTicket = () => {
    const payload = buildSelectedSaleDocumentPayload();
    if (!payload) return;
    const html = renderSaleTicket(payload);
    openSaleDocumentWindow(html, { width: 380, height: 640 });
  };

  const handlePrintSelectedInvoice = () => {
    const payload = buildSelectedSaleDocumentPayload();
    if (!payload) return;
    const html = renderSaleInvoice(payload);
    openSaleDocumentWindow(html, { width: 960, height: 900 });
  };

  const handlePrintSelectedChange = () => {
    if (selectedDoc?.type !== "cambio") return;
    const change = selectedDoc.data as ChangeRecord;
    const returnedItems =
      change.items_returned?.map((item) => ({
        name: item.product_name ?? "Producto",
        quantity: item.quantity,
        unitPrice: item.unit_price_net ?? 0,
        total: item.total_credit ?? 0,
        sku: item.product_sku ?? undefined,
      })) ?? [];
    const newItems =
      change.items_new?.map((item) => ({
        name: item.product_name ?? "Producto",
        quantity: item.quantity,
        unitPrice: item.unit_price ?? 0,
        total: item.total ?? 0,
        sku: item.product_sku ?? undefined,
      })) ?? [];
    const payments =
      change.payments?.map((payment) => ({
        label: mapPaymentMethod(payment.method),
        amount: payment.amount,
      })) ?? [];
    const html = renderChangeTicket({
      settings: posSettings,
      documentNumber:
        change.document_number ?? `CB-${change.id.toString().padStart(5, "0")}`,
      originalDocumentNumber: undefined,
      createdAt: change.created_at ?? undefined,
      posName: change.pos_name ?? undefined,
      sellerName: change.seller_name ?? undefined,
      itemsReturned: returnedItems,
      itemsNew: newItems,
      payments,
      totalCredit: change.total_credit ?? 0,
      totalNew: change.total_new ?? 0,
      extraPayment: change.extra_payment ?? 0,
      refundDue: change.refund_due ?? 0,
      notes: change.notes,
    });
    openSaleDocumentWindow(html, { width: 380, height: 640 });
  };
  const selectedClosure =
    selectedDoc?.type === "cierre" ? (selectedDetails as ClosureRecord) : null;
  const closureMethodSummaries = useMemo(
    () =>
      selectedClosure
        ? [
            { label: "Efectivo", value: selectedClosure.total_cash },
            { label: "Tarjeta Datáfono", value: selectedClosure.total_card },
            { label: "Transferencias / QR", value: selectedClosure.total_qr },
            { label: "Nequi", value: selectedClosure.total_nequi },
            { label: "Daviplata", value: selectedClosure.total_daviplata },
            { label: "Crédito / separado", value: selectedClosure.total_credit },
          ]
        : [],
    [selectedClosure]
  );
  const closureHasMethodTotals = closureMethodSummaries.some(
    (method) => method.value > 0
  );

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          {backPath && (
            <button
              type="button"
              onClick={() => router.push(backPath)}
              className="flex items-center gap-2 text-slate-300 hover:text-white
                         px-3 py-1.5 rounded-md border border-slate-700
                         hover:bg-slate-800 transition-colors text-xs"
            >
              <span className="text-lg">←</span>
              {backLabel}
            </button>
          )}
          <div>
            <h1 className="text-2xl font-semibold text-slate-50">Documentos</h1>
            <p className="text-sm text-slate-400">
              Historial completo de ventas, devoluciones y otros movimientos documentados.
            </p>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        </div>
        {!hideManageCustomers && (
          <Link
            href="/dashboard/customers"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-slate-700 text-xs text-slate-100 hover:bg-slate-800"
          >
            Gestionar clientes
          </Link>
        )}
      </header>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-4 text-xs">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-slate-200">Filtros avanzados</h2>
          <button
            type="button"
            onClick={() => {
              setFilterType("all");
              setFilterFrom(today);
              setFilterTo(today);
              setFilterTerm("");
              setFilterPayment("");
              setFilterCustomer("");
              setFilterPos("");
              setFilterVendor("");
            }}
            className="text-[11px] text-slate-400 hover:text-slate-200 underline"
          >
            Limpiar filtros
          </button>
        </div>
        <div className="grid md:grid-cols-6 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-slate-400">Tipo</span>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-50"
            >
              <option value="all">Todos</option>
              <option value="venta">Ventas</option>
              <option value="devolucion">Devoluciones</option>
              <option value="cambio">Cambios</option>
              <option value="abono">Abonos</option>
              <option value="cierre">Cierres de caja</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-400">Desde</span>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              onFocus={(e) => e.target.showPicker?.()}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-50"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-400">Hasta</span>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              onFocus={(e) => e.target.showPicker?.()}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-50"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-400">Documento / detalle</span>
            <input
              type="text"
              value={filterTerm}
              onChange={(e) => setFilterTerm(e.target.value)}
              placeholder="V-00021, devolución..."
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-50"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-400">Método de pago</span>
            <select
              value={filterPayment}
              onChange={(e) => setFilterPayment(e.target.value)}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-50"
            >
              <option value="">Todos</option>
              {filterOptions.payments.length === 0 ? (
                <option value="" disabled>
                  Sin datos
                </option>
              ) : (
                filterOptions.payments.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-400">Cliente</span>
            <input
              type="text"
              value={filterCustomer}
              onChange={(e) => setFilterCustomer(e.target.value)}
              placeholder="Nombre del cliente"
              list="documents-customer-options"
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-50"
            />
            <datalist id="documents-customer-options">
              {filterOptions.customers.map((customer) => (
                <option key={customer} value={customer} />
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-400">POS</span>
            <select
              value={filterPos}
              onChange={(e) => setFilterPos(e.target.value)}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-50"
            >
              <option value="">Todos</option>
              {filterOptions.pos.length === 0 ? (
                <option value="" disabled>
                  Sin datos
                </option>
              ) : (
                filterOptions.pos.map((posName) => (
                  <option key={posName} value={posName}>
                    {posName}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-400">Vendedor</span>
            <select
              value={filterVendor}
              onChange={(e) => setFilterVendor(e.target.value)}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-50"
            >
              <option value="">Todos</option>
              {filterOptions.vendors.length === 0 ? (
                <option value="" disabled>
                  Sin datos
                </option>
              ) : (
                filterOptions.vendors.map((vendor) => (
                  <option key={vendor} value={vendor}>
                    {vendor}
                  </option>
                ))
              )}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          {[
            { id: "today", label: "Hoy" },
            { id: "yesterday", label: "Ayer" },
            { id: "last7", label: "Últimos 7 días" },
            { id: "week", label: "Esta semana" },
            { id: "month", label: "Este mes" },
            { id: "year", label: "Este año" },
          ].map((btn) => (
            <button
              key={btn.id}
              type="button"
              onClick={() => applyQuickRange(btn.id)}
              className="px-3 py-1 rounded-full border border-slate-700 text-slate-300 hover:border-emerald-400/60 hover:text-emerald-200 transition"
            >
              {btn.label}
            </button>
          ))}
        </div>
      </section>

      <div className={documentsGridClass}>
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 flex flex-col min-h-[370px]">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-100">
                  Documentos registrados
                </h3>
                <span className="text-[11px] text-slate-500">
                  Resultados: {filteredDocuments.length}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Selecciona un documento para ver el detalle completo.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleExportXlsx()}
                disabled={loading || filteredDocuments.length === 0}
                className="px-3 py-1 rounded-md border border-slate-700 text-slate-200 text-[11px] hover:bg-slate-800 disabled:opacity-40"
              >
                Exportar Excel
              </button>
              <button
                type="button"
                onClick={() => void loadDocuments()}
                disabled={loading}
                className="px-3 py-1 rounded-md border border-emerald-400/60 text-emerald-200 text-[11px] hover:bg-emerald-500/10"
              >
                {loading ? "Cargando..." : "Refrescar"}
              </button>
            </div>
          </div>

          <div className="mt-2 rounded-xl border border-slate-800/60 overflow-hidden flex flex-col">
            <div className="overflow-hidden">
              <table className="w-full text-xs table-fixed">
                <colgroup>
                  <col style={{ width: "180px" }} />
                  <col style={{ width: "120px" }} />
                  <col style={{ width: "auto" }} />
                  <col style={{ width: "120px" }} />
                  <col style={{ width: "200px" }} />
                </colgroup>
                <thead className="bg-slate-950 text-[11px] text-slate-400">
                  <tr>
                    <th className="text-left px-3 py-2 font-normal">Documento</th>
                    <th className="text-left px-3 py-2 font-normal">Tipo</th>
                    <th className="text-left px-3 py-2 font-normal">Detalle</th>
                    <th className="text-right px-3 py-2 font-normal">Total</th>
                    <th className="text-right px-3 py-2 font-normal">Método / Cliente</th>
                  </tr>
                </thead>
              </table>
            </div>
            <div className="max-h-[480px] overflow-y-auto">
              <table className="w-full text-xs table-fixed">
                <colgroup>
                  <col style={{ width: "180px" }} />
                  <col style={{ width: "120px" }} />
                  <col style={{ width: "auto" }} />
                  <col style={{ width: "120px" }} />
                  <col style={{ width: "200px" }} />
                </colgroup>
                <tbody>
                  {loading &&
                    Array.from({ length: 6 }).map((_, idx) => (
                      <tr key={`documents-skeleton-${idx}`} className="border-t border-slate-800/30">
                        <td className="px-3 py-4">
                          <div className="h-3 w-32 rounded bg-slate-800/60 animate-pulse" />
                          <div className="mt-2 h-2.5 w-24 rounded bg-slate-900/70 animate-pulse" />
                        </td>
                        <td className="px-3 py-4">
                          <div className="h-3 w-20 rounded bg-slate-800/60 animate-pulse" />
                        </td>
                        <td className="px-3 py-4">
                          <div className="h-3 w-full rounded bg-slate-800/50 animate-pulse" />
                          <div className="mt-2 h-2 w-3/4 rounded bg-slate-900/70 animate-pulse" />
                        </td>
                        <td className="px-3 py-4 text-right">
                          <div className="ml-auto h-3 w-20 rounded bg-slate-800/60 animate-pulse" />
                        </td>
                        <td className="px-3 py-4 text-right">
                          <div className="ml-auto h-3 w-32 rounded bg-slate-800/60 animate-pulse" />
                          <div className="mt-2 ml-auto h-2 w-24 rounded bg-slate-900/70 animate-pulse" />
                        </td>
                      </tr>
                    ))}
                  {!loading && filteredDocuments.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-[11px] text-slate-500">
                        No se encontraron documentos con los filtros actuales.
                      </td>
                    </tr>
                  )}
                  {!loading && filteredDocuments.map((doc) => {
                    const isSelected = selectedDoc?.id === doc.id;
                    const isAnnulation =
                      doc.type === "devolucion" && doc.isAnnulation;
                    const typeBadge =
                      doc.type === "venta"
                        ? doc.status === "voided"
                          ? "Anulación"
                          : "Venta"
                        : doc.type === "devolucion"
                        ? isAnnulation
                          ? "Anulación"
                          : "Devolución"
                        : doc.type === "cambio"
                        ? "Cambio"
                        : doc.type === "abono"
                        ? "Abono"
                        : "Cierre";
                    const statusLabel = getStatusLabel(doc.status);
                    const docIsSeparated = !!doc.isSeparated;
                    const docInitialMethodLabel = mapPaymentMethod(
                      doc.initialPaymentMethod ?? doc.paymentMethod
                    );
                    const docMethodLabel = docIsSeparated
                      ? "SEPARADO"
                      : docInitialMethodLabel;
                    return (
                      <tr
                        key={doc.id}
                        onClick={() => setSelectedDoc(doc)}
                        className={`cursor-pointer border-t border-slate-800/40 transition ${
                          isSelected ? "bg-slate-800/60" : "hover:bg-slate-800/40"
                        }`}
                      >
                        <td className="px-3 py-2 align-top">
                          <div className="flex flex-col text-slate-200 text-[11px] leading-tight">
                            <span className="font-mono text-sm">{doc.documentNumber}</span>
                            <span className="text-[10px] text-slate-500">
                              {formatDateTime(doc.createdAt)}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <span
                            className={`px-2 py-0.5 rounded-full border text-[11px] ${
                              doc.type === "venta"
                                ? doc.status === "voided"
                                  ? "border-rose-500/40 text-rose-200"
                                  : "border-emerald-400/40 text-emerald-200"
                                : doc.type === "devolucion"
                                ? isAnnulation
                                  ? "border-rose-500/40 text-rose-200"
                                  : "border-rose-400/40 text-rose-300"
                                : doc.type === "abono"
                                ? "border-cyan-400/40 text-cyan-200"
                                : "border-sky-400/40 text-sky-200"
                            }`}
                          >
                            {typeBadge}
                          </span>
                          {statusLabel && (
                            <span
                              className={`ml-2 px-2 py-0.5 rounded-full border text-[10px] uppercase ${
                                doc.status === "voided"
                                  ? "border-rose-500/40 text-rose-200"
                                  : "border-amber-400/40 text-amber-100"
                              }`}
                            >
                              {statusLabel}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-sm align-top">
                          <span className="block truncate">{doc.detail}</span>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-100 tabular-nums align-top">
                          {toNumber(doc.total) === 0
                            ? "0"
                            : formatMoney(toNumber(doc.total))}
                          {doc.refundAmount != null &&
                            toNumber(doc.refundAmount) > 0 && (
                            <span className="block text-[10px] text-rose-300">
                              -{formatMoney(toNumber(doc.refundAmount))}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-200 align-top">
                          <span className="uppercase">{docMethodLabel}</span>
                          {docIsSeparated && (
                            <span className="block text-[10px] text-slate-500">
                              Inicial: {docInitialMethodLabel}
                            </span>
                          )}
                          {doc.customer && (
                            <span className="block text-[10px] text-slate-500 truncate">
                              {doc.customer}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 flex flex-col">
          {!selectedDoc ? (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-500">
              Selecciona un documento en la tabla para ver los detalles.
            </div>
          ) : (
            <div className="space-y-6 text-xs flex-1 overflow-y-auto">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                    Documento
                  </div>
                  <div className="flex items-center flex-wrap gap-2">
                    <div className="text-xl font-semibold text-slate-50">
                      {selectedDoc.documentNumber}
                    </div>
                    {selectedDoc.type === "venta" && selectedDocIsSeparated && (
                      <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-100">
                        Venta con separado
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {formatDateTime(selectedDoc.createdAt)}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {selectedDocCanShowVoidButton && (
                    <button
                      type="button"
                      onClick={() => openVoidModal(selectedDoc)}
                      disabled={!selectedDocCanVoid}
                      title={
                        !selectedDocCanVoid
                          ? "Solo se puede anular antes del cierre"
                          : undefined
                      }
                      className="px-3 py-1.5 rounded-md border border-rose-500/40 text-rose-200 hover:bg-rose-500/10 disabled:opacity-50"
                    >
                      {selectedDocActionLabel}
                    </button>
                  )}
                  {selectedDoc.type === "venta" && (
                    <>
                      <button
                        type="button"
                        onClick={handlePrintSelectedTicket}
                        disabled={!canPrintSelectedTicket}
                        className="px-3 py-1.5 rounded-md border border-slate-700 text-slate-100 hover:bg-slate-800 disabled:opacity-50"
                      >
                        Imprimir ticket
                      </button>
                      <button
                        type="button"
                        onClick={handlePrintSelectedInvoice}
                        disabled={!canPrintSelectedTicket}
                        className="px-3 py-1.5 rounded-md border border-slate-700 text-slate-100 hover:bg-slate-800 disabled:opacity-50"
                      >
                        Imprimir factura
                      </button>
                    </>
                  )}
                  {selectedDoc.type === "cambio" && (
                    <button
                      type="button"
                      onClick={handlePrintSelectedChange}
                      className="px-3 py-1.5 rounded-md border border-slate-700 text-slate-100 hover:bg-slate-800"
                    >
                      Imprimir cambio
                    </button>
                  )}
                  {selectedDoc.type === "cierre" && selectedClosure && (
                    <button
                      type="button"
                      onClick={() => printClosureTicket(selectedClosure, posSettings)}
                      className="px-3 py-1.5 rounded-md border border-slate-700 text-slate-100 hover:bg-slate-800"
                    >
                      Imprimir cierre
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDetailExpanded((prev) => !prev)}
                    className="px-3 py-1.5 rounded-md border border-slate-700 text-slate-100 hover:bg-slate-800"
                  >
                    {detailExpanded ? "Mostrar menos" : "Mostrar más"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-slate-400">Tipo</span>
                  <span className="text-right text-slate-100">
                    {selectedDoc.type === "venta"
                      ? "Venta"
                      : selectedDoc.type === "devolucion"
                      ? selectedDoc.isAnnulation
                        ? "Anulación"
                        : "Devolución"
                      : selectedDoc.type === "cambio"
                      ? "Cambio"
                      : selectedDoc.type === "abono"
                      ? "Abono"
                      : "Cierre de caja"}
                  </span>
                </div>
                {selectedDocStatusLabel && (
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-400">Estado</span>
                    <span
                      className={`text-right font-semibold ${
                        selectedDoc.status === "voided"
                          ? "text-rose-200"
                          : "text-amber-100"
                      }`}
                    >
                      {selectedDocStatusLabel}
                    </span>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <span className="text-slate-400">Referencia</span>
                  <span className="text-right text-slate-100">
                    {selectedDoc.reference}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-400">Total</span>
                  <span className="text-right text-slate-100">
                    {formatMoney(toNumber(selectedDoc.total))}
                  </span>
                </div>
                {selectedDoc.type === "venta" && selectedSaleSurchargeAmount > 0 && (
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-400">
                      {selectedSaleSurchargeLabel ?? "Incremento"}
                    </span>
                    <span className="text-right text-slate-100">
                      +{formatMoney(selectedSaleSurchargeAmount)}
                    </span>
                  </div>
                )}
                {selectedDoc.type === "venta" &&
                  selectedSaleDocument?.sale_number && (
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-400">N° venta</span>
                      <span className="text-right text-slate-100">
                        #{selectedSaleDocument.sale_number}
                      </span>
                    </div>
                  )}
                {selectedDoc.type === "devolucion" &&
                  !selectedDoc.isAnnulation &&
                  selectedReturnRecord?.sale_document_number && (
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-400">Documento origen</span>
                      <span className="text-right text-slate-100">
                        {selectedReturnRecord.sale_document_number}
                      </span>
                    </div>
                  )}
                {selectedDoc.type === "venta" ? (
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-400">Método de pago</span>
                    <span className="text-right text-slate-100">
                      {selectedDocMethodLabel}
                      {selectedDocIsSeparated && (
                        <span className="block text-[11px] text-slate-500">
                          Abono inicial: {selectedDocInitialMethodLabel}
                        </span>
                      )}
                    </span>
                  </div>
                ) : (
                  selectedDoc.paymentMethod && (
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-400">Método</span>
                      <span className="text-right text-slate-100">
                        {mapPaymentMethod(selectedDoc.paymentMethod)}
                      </span>
                    </div>
                  )
                )}
                {selectedDoc.customer && (
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-400">Cliente</span>
                    <span className="text-right text-slate-100">
                      {selectedDoc.customer}
                    </span>
                  </div>
                )}
                {selectedDoc.pos && (
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-400">POS</span>
                    <span className="text-right text-slate-100">
                      {selectedDoc.pos}
                    </span>
                  </div>
                )}
                {selectedDoc.vendor && (
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-400">Vendedor</span>
                    <span className="text-right text-slate-100">
                      {selectedDoc.vendor}
                    </span>
                  </div>
                )}
                {selectedDoc.type === "cierre" && selectedClosure?.closed_by_user_name && (
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-400">Responsable</span>
                    <span className="text-right text-slate-100">
                      {selectedClosure.closed_by_user_name}
                    </span>
                  </div>
                )}
                {selectedDoc.type === "cierre" &&
                  selectedClosure?.opened_at &&
                  selectedClosure?.closed_at && (
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-400">Periodo de movimientos</span>
                      <span className="text-right text-slate-100">
                        {formatDateTime(selectedClosure.opened_at)} →{" "}
                        {formatDateTime(selectedClosure.closed_at)}
                      </span>
                    </div>
                  )}
                {selectedDoc.type === "cierre" && selectedClosure?.opened_at && (
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-400">Inicio del periodo</span>
                    <span className="text-right text-slate-100">
                      {formatDateTime(selectedClosure.opened_at)}
                    </span>
                  </div>
                )}
                {selectedDoc.type === "cierre" && selectedClosure?.closed_at && (
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-400">Cierre registrado</span>
                    <span className="text-right text-slate-100">
                      {formatDateTime(selectedClosure.closed_at)}
                    </span>
                  </div>
                )}
                {selectedDoc.type === "cierre" && selectedClosure && (
                  <>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-400">Total registrado</span>
                      <span className="text-right text-slate-100">
                        {formatMoney(selectedClosure.total_amount)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-400">Devoluciones</span>
                      <span className="text-right text-rose-300">
                        -{formatMoney(selectedClosure.total_refunds)}
                      </span>
                    </div>
                    {(selectedClosure.change_extra_total || selectedClosure.change_refund_total) && (
                      <>
                        <div className="flex justify-between gap-3">
                          <span className="text-slate-400">Cambios (excedente)</span>
                          <span className="text-right text-emerald-200">
                            {formatMoney(selectedClosure.change_extra_total ?? 0)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-slate-400">Cambios (reembolsos)</span>
                          <span className="text-right text-rose-300">
                            -{formatMoney(selectedClosure.change_refund_total ?? 0)}
                          </span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-400">Neto del día</span>
                      <span className="text-right text-slate-100">
                        {formatMoney(selectedClosure.net_amount)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-400">Efectivo esperado</span>
                      <span className="text-right text-slate-100">
                        {formatMoney(selectedClosure.total_cash)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-400">Efectivo contado</span>
                      <span className="text-right text-slate-100">
                        {formatMoney(selectedClosure.counted_cash)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-400">Diferencia</span>
                      <span
                        className={`text-right ${
                          selectedClosure.difference !== 0
                            ? "text-amber-200"
                            : "text-slate-100"
                        }`}
                      >
                        {formatMoney(selectedClosure.difference)}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {selectedDoc.detail && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">
                    Descripción
                  </div>
                  <p className="text-slate-100 text-sm">
                    {selectedDoc.detail}
                  </p>
                </div>
              )}

              {selectedDoc.type === "venta" &&
                typeof (selectedDetails as SaleRecord)?.notes === "string" &&
                (selectedDetails as SaleRecord)?.notes?.trim() && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">
                      Notas
                    </div>
                    <p className="text-slate-100 text-sm whitespace-pre-line">
                      {(selectedDetails as SaleRecord).notes}
                    </p>
                  </div>
                )}

              {selectedDoc.type === "venta" &&
                !detailExpanded &&
                Array.isArray((selectedDetails as SaleRecord)?.items) && (
                  <div>
                    <div className="text-slate-400 mb-1">Productos</div>
                    <div className="rounded border border-slate-800/60 overflow-hidden">
                      <div className="grid grid-cols-[1fr_60px] bg-slate-950 px-3 py-2 text-[11px] text-slate-400">
                        <span>Producto</span>
                        <span className="text-right">Cant.</span>
                      </div>
                      <div>
                        {(selectedDetails as SaleRecord).items?.map((item) => (
                          <div
                            key={item.id ?? item.name ?? Math.random()}
                            className="grid grid-cols-[1fr_60px] px-3 py-2 border-t border-slate-800/40"
                          >
                            <span className="text-slate-100 truncate">
                              {item.product_name ?? item.name ?? "Producto"}
                            </span>
                            <span className="text-right text-slate-200">
                              {item.quantity}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

              {detailExpanded &&
                selectedDoc.type === "venta" &&
                saleSummaryCards.length > 0 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">
                      Resumen financiero
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {saleSummaryCards.map((card) => {
                        const toneClass =
                          card.highlight === "positive"
                            ? "text-emerald-200"
                            : card.highlight === "warning"
                            ? "text-amber-200"
                            : card.highlight === "danger"
                            ? "text-rose-300"
                            : "text-slate-100";
                        return (
                          <div
                            key={`${card.label}-${card.value}`}
                            className="rounded-2xl border border-slate-800/60 bg-slate-950/30 p-3"
                          >
                            <div className="text-[10px] uppercase tracking-wide text-slate-500">
                              {card.label}
                            </div>
                            <div className={`text-lg font-semibold ${toneClass}`}>
                              {card.value}
                            </div>
                            {card.hint && (
                              <div className="text-[10px] text-slate-500">
                                {card.hint}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              {detailExpanded &&
                selectedDoc.type === "venta" &&
                selectedSeparatedOrder && (
                  <div className="rounded-2xl border border-slate-800/60 bg-slate-950/30 p-3 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">
                          Abonos registrados
                        </div>
                        {selectedSeparatedDueDateLabel && (
                          <div className="text-[11px] text-slate-500">
                            Fecha límite: {selectedSeparatedDueDateLabel}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">
                          Saldo pendiente
                        </div>
                        <div
                          className={`text-lg font-semibold ${
                            selectedSalePendingAmount === 0
                              ? "text-emerald-300"
                              : "text-rose-300"
                          }`}
                        >
                          {formatMoney(selectedSalePendingAmount)}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {separatedPaymentEntries.map((entry) => (
                        <div
                          key={`${entry.label}-${entry.amount}-${entry.paidAt ?? "na"}`}
                          className="flex items-center justify-between border border-slate-800/50 rounded-xl px-3 py-2"
                        >
                          <div>
                            <div className="text-slate-100 font-semibold">
                              {entry.label}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {entry.methodLabel}
                              {entry.paidAt && (
                                <>
                                  {" "}
                                  · {formatDateTime(entry.paidAt)}
                                </>
                              )}
                            </div>
                          </div>
                          <span className="text-slate-100 font-mono">
                            {formatMoney(entry.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {detailExpanded &&
                selectedDoc.type === "venta" &&
                selectedSalePayments.length > 0 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">
                      Pagos registrados
                    </div>
                    <div className="rounded-2xl border border-slate-800/60 overflow-hidden">
                      <div className="grid grid-cols-[1fr_110px] bg-slate-950 px-3 py-2 text-[11px] text-slate-400 uppercase tracking-wide">
                        <span>Método</span>
                        <span className="text-right">Monto</span>
                      </div>
                      {selectedSalePayments.map((payment) => {
                        const methodLabel = mapPaymentMethod(payment.method);
                        const isInitialPayment =
                          selectedDocIsSeparated &&
                          normalizedInitialMethod &&
                          payment.method?.toLowerCase() === normalizedInitialMethod &&
                          selectedSaleInitialAmount != null &&
                          Math.abs(payment.amount - selectedSaleInitialAmount) < 1;
                        return (
                          <div
                            key={payment.key}
                            className="grid grid-cols-[1fr_110px] px-3 py-2 border-t border-slate-800/40"
                          >
                            <div>
                              <span className="text-slate-100">{methodLabel}</span>
                              {isInitialPayment && (
                                <span className="block text-[10px] text-amber-200">
                                  Abono inicial
                                </span>
                              )}
                            </div>
                            <span className="text-right text-slate-100 font-mono">
                              {formatMoney(payment.amount)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {selectedDocIsSeparated && selectedSalePendingAmount > 0 && (
                      <p className="mt-1 text-[11px] text-slate-500">
                        Saldo pendiente por cobrar: {formatMoney(selectedSalePendingAmount)}.
                        Registra los abonos desde la pantalla de separados.
                      </p>
                    )}
                  </div>
                )}

              {selectedDoc.type === "devolucion" &&
                !selectedDoc.isAnnulation &&
                typeof (selectedDetails as ReturnRecord)?.notes === "string" &&
                (selectedDetails as ReturnRecord)?.notes?.trim() && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">
                      Notas
                    </div>
                    <p className="text-slate-100 text-sm whitespace-pre-line">
                      {(selectedDetails as ReturnRecord).notes}
                    </p>
                  </div>
                )}

              {selectedDoc.type === "cambio" &&
                typeof (selectedDetails as ChangeRecord)?.notes === "string" &&
                (selectedDetails as ChangeRecord)?.notes?.trim() && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">
                      Notas
                    </div>
                    <p className="text-slate-100 text-sm whitespace-pre-line">
                      {(selectedDetails as ChangeRecord).notes}
                    </p>
                  </div>
                )}

              {detailExpanded &&
                selectedDoc.type === "devolucion" &&
                !selectedDoc.isAnnulation &&
                selectedReturnPayments.length > 0 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">
                      Métodos de devolución
                    </div>
                    <div className="rounded-2xl border border-slate-800/60 overflow-hidden">
                      <div className="grid grid-cols-[1fr_110px] bg-slate-950 px-3 py-2 text-[11px] text-slate-400 uppercase tracking-wide">
                        <span>Método</span>
                        <span className="text-right">Monto</span>
                      </div>
                      {selectedReturnPayments.map((payment, index) => (
                        <div
                          key={`${payment.method}-${index}`}
                          className="grid grid-cols-[1fr_110px] px-3 py-2 border-t border-slate-800/40"
                        >
                          <span className="text-slate-100">
                            {mapPaymentMethod(payment.method)}
                          </span>
                          <span className="text-right text-slate-100 font-mono">
                            {formatMoney(payment.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {detailExpanded &&
                selectedDoc.type === "venta" &&
                selectedSaleLines &&
                selectedSaleLines.lines.length > 0 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">
                      Productos vendidos
                    </div>
                    <div className="rounded-2xl border border-slate-800/60 overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-left text-[12px]">
                          <thead className="bg-slate-950 text-[11px] text-slate-400 uppercase tracking-wide">
                            <tr>
                              <th className="px-3 py-2 font-normal">Producto</th>
                              <th className="px-3 py-2 font-normal text-right">Cant.</th>
                              <th className="px-3 py-2 font-normal text-right">P. unitario</th>
                              <th className="px-3 py-2 font-normal text-right">Desc.</th>
                              <th className="px-3 py-2 font-normal text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedSaleLines.lines.map((line) => (
                              <tr
                                key={line.key}
                                className="border-t border-slate-800/40 text-slate-100"
                              >
                                <td className="px-3 py-2">{line.name}</td>
                                <td className="px-3 py-2 text-right text-slate-200">
                                  {line.quantity}
                                </td>
                                <td className="px-3 py-2 text-right text-slate-200">
                                  {formatMoney(line.unitPrice)}
                                </td>
                                <td className="px-3 py-2 text-right text-slate-200">
                                  {line.discount > 0
                                    ? `-${formatMoney(line.discount)}`
                                    : "0"}
                                </td>
                                <td className="px-3 py-2 text-right font-mono">
                                  {formatMoney(line.total)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

              {detailExpanded &&
                selectedDoc.type === "devolucion" &&
                !selectedDoc.isAnnulation &&
                Array.isArray((selectedDetails as ReturnRecord)?.items) && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">
                      Ítems devueltos
                    </div>
                    <div className="rounded-2xl border border-slate-800/60 overflow-hidden">
                      <div className="grid grid-cols-[1fr_80px] bg-slate-950 px-3 py-2 text-[11px] text-slate-400 uppercase tracking-wide">
                        <span>Producto</span>
                        <span className="text-right">Cantidad</span>
                      </div>
                      <div>
                        {(selectedDetails as ReturnRecord).items?.map((item) => (
                          <div
                            key={`${item.sale_item_id}-${item.product_name ?? item.name ?? ""}`}
                            className="grid grid-cols-[1fr_80px] px-3 py-2 border-t border-slate-800/40"
                          >
                            <span className="text-slate-100 truncate">
                              {item.product_name ?? item.name ?? "Producto"}
                            </span>
                            <span className="text-right text-slate-200">
                              {item.quantity}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

              {selectedDoc.type === "cambio" && (
                <div className="space-y-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">
                      Productos devueltos
                    </div>
                    <div className="rounded-2xl border border-slate-800/60 overflow-hidden">
                      <div className="grid grid-cols-[1fr_80px] bg-slate-950 px-3 py-2 text-[11px] text-slate-400 uppercase tracking-wide">
                        <span>Producto</span>
                        <span className="text-right">Cantidad</span>
                      </div>
                      <div>
                        {(selectedDetails as ChangeRecord).items_returned?.map((item) => (
                          <div
                            key={`${item.sale_item_id}-${item.product_name ?? ""}`}
                            className="grid grid-cols-[1fr_80px] px-3 py-2 border-t border-slate-800/40"
                          >
                            <span className="text-slate-100 truncate">
                              {item.product_name ?? "Producto"}
                            </span>
                            <span className="text-right text-slate-200">
                              {item.quantity}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">
                      Productos nuevos
                    </div>
                    <div className="rounded-2xl border border-slate-800/60 overflow-hidden">
                      <div className="grid grid-cols-[1fr_80px] bg-slate-950 px-3 py-2 text-[11px] text-slate-400 uppercase tracking-wide">
                        <span>Producto</span>
                        <span className="text-right">Cantidad</span>
                      </div>
                      <div>
                        {(selectedDetails as ChangeRecord).items_new?.map((item) => (
                          <div
                            key={`${item.product_id}-${item.product_name ?? ""}`}
                            className="grid grid-cols-[1fr_80px] px-3 py-2 border-t border-slate-800/40"
                          >
                            <span className="text-slate-100 truncate">
                              {item.product_name ?? "Producto"}
                            </span>
                            <span className="text-right text-slate-200">
                              {item.quantity}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {detailExpanded && selectedDoc.type === "cierre" && selectedClosure && (
                <div className="space-y-4">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      { label: "Total registrado", value: formatMoney(selectedClosure.total_amount) },
                      { label: "Devoluciones", value: `-${formatMoney(selectedClosure.total_refunds)}`, tone: "danger" as const },
                      ...(selectedClosure.change_extra_total || selectedClosure.change_refund_total
                        ? [
                            {
                              label: "Cambios (excedente)",
                              value: formatMoney(selectedClosure.change_extra_total ?? 0),
                              tone: "positive" as const,
                            },
                            {
                              label: "Cambios (reembolsos)",
                              value: `-${formatMoney(selectedClosure.change_refund_total ?? 0)}`,
                              tone: "danger" as const,
                            },
                          ]
                        : []),
                      { label: "Neto del día", value: formatMoney(selectedClosure.net_amount) },
                      { label: "Efectivo esperado", value: formatMoney(selectedClosure.total_cash) },
                      { label: "Efectivo contado", value: formatMoney(selectedClosure.counted_cash) },
                      {
                        label: "Diferencia",
                        value: formatMoney(selectedClosure.difference),
                        tone: selectedClosure.difference !== 0 ? ("warning" as const) : undefined,
                      },
                    ].map((card) => (
                      <div
                        key={card.label}
                        className="rounded-2xl border border-slate-800/60 bg-slate-950/30 p-3"
                      >
                        <div className="text-[10px] uppercase tracking-wide text-slate-500">
                          {card.label}
                        </div>
                        <div
                          className={`text-lg font-semibold ${
                            card.tone === "danger"
                              ? "text-rose-300"
                              : card.tone === "warning"
                              ? "text-amber-200"
                              : "text-slate-100"
                          }`}
                        >
                          {card.value}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">
                      Detalle por método
                    </div>
                    <div className="rounded-2xl border border-slate-800/60 overflow-hidden">
                      <div className="grid grid-cols-[1fr_110px] bg-slate-950 px-3 py-2 text-[11px] text-slate-400 uppercase tracking-wide">
                        <span>Método</span>
                        <span className="text-right">Total</span>
                      </div>
                      {closureMethodSummaries
                        .filter((method) => method.value > 0)
                        .map((method) => (
                          <div
                            key={method.label}
                            className="grid grid-cols-[1fr_110px] px-3 py-2 border-t border-slate-800/40"
                          >
                            <span className="text-slate-100">{method.label}</span>
                            <span className="text-right text-slate-200 font-mono">
                              {formatMoney(method.value)}
                            </span>
                          </div>
                        ))}
                      {!closureHasMethodTotals && (
                        <div className="px-3 py-2 text-[11px] text-slate-500">
                          No hubo pagos en métodos estándar durante este cierre.
                        </div>
                      )}
                    </div>
                  </div>

                  {selectedClosure.separated_summary && (
                    <div className="rounded-2xl border border-slate-800/60 bg-slate-950/30 p-3">
                      <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">
                        Resumen de separados
                      </div>
                      <div className="grid gap-2 text-sm sm:grid-cols-2">
                        <div className="flex flex-col">
                          <span className="text-[11px] text-slate-500 uppercase">
                            Tickets activos
                          </span>
                          <span className="text-slate-100">
                            {selectedClosure.separated_summary.tickets ?? 0}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[11px] text-slate-500 uppercase">
                            Pagos recibidos
                          </span>
                          <span className="text-slate-100">
                            {formatMoney(selectedClosure.separated_summary.payments_total ?? 0)}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[11px] text-slate-500 uppercase">
                            Reservado
                          </span>
                          <span className="text-slate-100">
                            {formatMoney(selectedClosure.separated_summary.reserved_total ?? 0)}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[11px] text-slate-500 uppercase">
                            Pendiente
                          </span>
                          <span className="text-slate-100">
                            {formatMoney(selectedClosure.separated_summary.pending_total ?? 0)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedClosure.notes && selectedClosure.notes.trim() && (
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">
                        Notas del cierre
                      </div>
                      <p className="text-slate-100 text-sm whitespace-pre-line">
                        {selectedClosure.notes}
                      </p>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => printClosureTicket(selectedClosure, posSettings)}
                    className="w-full rounded-md border border-emerald-400/60 text-emerald-100 py-2 text-sm hover:bg-emerald-400/10"
                  >
                    Imprimir reporte Z
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
      {voidTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-xl">
            <div className="text-sm font-semibold text-slate-100">
              {selectedDocActionLabel} documento {voidTarget.documentNumber}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Esta acción genera un ajuste y no elimina el registro.
            </p>
            <label className="mt-3 block text-xs text-slate-300">
              Motivo (opcional)
            </label>
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:border-rose-400 outline-none"
            />
            {voidError && (
              <div className="mt-2 text-xs text-rose-300">{voidError}</div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeVoidModal}
                className="px-3 py-1.5 rounded-md border border-slate-700 text-slate-200 hover:bg-slate-800 text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submitVoid}
                disabled={voiding}
                className="px-3 py-1.5 rounded-md border border-rose-500/40 text-rose-100 hover:bg-rose-500/10 text-xs disabled:opacity-50"
              >
                {voiding ? "Procesando..." : selectedDocActionLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

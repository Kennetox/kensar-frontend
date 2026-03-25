"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/providers/AuthProvider";
import {
  createInvestmentPayout,
  exportInvestmentPayouts,
  exportInvestmentSalesLines,
  fetchInvestmentCuts,
  fetchInvestmentLedger,
  fetchInvestmentParticipants,
  fetchInvestmentPayouts,
  fetchInvestmentProducts,
  fetchInvestmentRecentActivity,
  fetchInvestmentSalesLines,
  fetchInvestmentSummary,
  previewInvestmentCut,
  reconcileInvestmentCut,
  removeInvestmentProduct,
  replaceInvestmentParticipants,
  type InvestmentRecentActivity,
  type InvestmentSaleLinePage,
  type InvestmentCut,
  type InvestmentLedger,
  type InvestmentParticipant,
  type InvestmentPayout,
  type InvestmentProduct,
  type InvestmentSummary,
} from "@/lib/api/investment";

function formatMoney(value: number): string {
  return value.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });
}

function toLocalInputDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function getCurrentFortnightStart(value: Date): Date {
  const day = value.getDate();
  return new Date(
    value.getFullYear(),
    value.getMonth(),
    day <= 15 ? 1 : 16,
    0,
    0,
    0,
    0
  );
}

function getFortnightBoundaryEnd(periodStart: Date): Date {
  if (periodStart.getDate() <= 1) {
    return new Date(
      periodStart.getFullYear(),
      periodStart.getMonth(),
      16,
      0,
      0,
      0,
      0
    );
  }
  return new Date(
    periodStart.getFullYear(),
    periodStart.getMonth() + 1,
    1,
    0,
    0,
    0,
    0
  );
}

function createDraftId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parsePercentInput(value: string): number {
  const normalized = value.replace(",", ".").trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatThousandsInput(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function parseThousandsInput(value: string): number {
  const digits = value.replace(/\D/g, "");
  if (!digits) return 0;
  return Number(digits);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const PARTICIPANT_COLORS = [
  "#10b981",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
  "#64748b",
];

function DonutChart({
  rows,
  valueKey,
  title,
}: {
  rows: Array<{ id: number; name: string; profit: number; capital: number; color: string }>;
  valueKey: "profit" | "capital";
  title: string;
}) {
  const chartRows = rows
    .map((row) => ({
      ...row,
      value: Math.max(0, Number(row[valueKey] ?? 0)),
    }))
    .filter((row) => row.value > 0);

  const total = chartRows.reduce((acc, row) => acc + row.value, 0);
  const normalizedRows =
    total > 0
      ? chartRows.map((row) => ({ ...row, pct: (row.value / total) * 100 }))
      : [];

  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const segments = normalizedRows.reduce<{
    offset: number;
    rows: Array<{ id: number; color: string; dasharray: string; dashoffset: number }>;
  }>(
    (acc, row) => {
      const dash = (row.pct / 100) * circumference;
      const gap = Math.max(circumference - dash, 0);
      return {
        offset: acc.offset + dash,
        rows: [
          ...acc.rows,
          {
            id: row.id,
            color: row.color,
            dasharray: `${dash} ${gap}`,
            dashoffset: -acc.offset,
          },
        ],
      };
    },
    { offset: 0, rows: [] }
  ).rows;

  return (
    <div
      className="relative h-32 w-32 shrink-0 rounded-full bg-gradient-to-br from-slate-50 to-white p-1 shadow-sm"
      title={title}
    >
      <svg viewBox="0 0 42 42" className="h-full w-full -rotate-90">
        <circle cx="21" cy="21" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="8.5" />
        {segments.map((segment) => (
          <circle
            key={`${valueKey}-${segment.id}`}
            cx="21"
            cy="21"
            r={radius}
            fill="none"
            stroke={segment.color}
            strokeWidth="8.5"
            strokeDasharray={segment.dasharray}
            strokeDashoffset={segment.dashoffset}
            strokeLinecap="round"
          />
        ))}
      </svg>
      <div className="pointer-events-none absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-slate-100 bg-white text-slate-700 shadow-inner">
        <span className="text-[10px] leading-none text-slate-500">Total</span>
        <span className="text-sm font-semibold leading-none">100%</span>
      </div>
    </div>
  );
}

export default function InvestmentPage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<
    "resumen" | "productos" | "cortes" | "pagos" | "participantes" | "registros"
  >("resumen");
  const [summary, setSummary] = useState<InvestmentSummary | null>(null);
  const [recentActivity, setRecentActivity] = useState<InvestmentRecentActivity | null>(null);
  const [salesLinesPage, setSalesLinesPage] = useState<InvestmentSaleLinePage | null>(null);
  const [products, setProducts] = useState<InvestmentProduct[]>([]);
  const [participants, setParticipants] = useState<InvestmentParticipant[]>([]);
  const [createParticipantDraft, setCreateParticipantDraft] = useState<
    Array<{
      draft_id: string;
      user_id?: number | null;
      display_name: string;
      profit_share_percent: string;
      capital_share_percent: string;
      is_active: boolean;
    }>
  >([]);
  const [editingParticipantDraft, setEditingParticipantDraft] = useState<{
    id: number;
    user_id?: number | null;
    display_name: string;
    profit_share_percent: string;
    capital_share_percent: string;
    is_active: boolean;
  } | null>(null);
  const [cuts, setCuts] = useState<InvestmentCut[]>([]);
  const [payouts, setPayouts] = useState<InvestmentPayout[]>([]);
  const [ledger, setLedger] = useState<InvestmentLedger | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showCreateParticipantForm, setShowCreateParticipantForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingParticipants, setSavingParticipants] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [creatingPayout, setCreatingPayout] = useState(false);
  const [reconcilingCutId, setReconcilingCutId] = useState<number | null>(null);
  const [previewCut, setPreviewCut] = useState<InvestmentCut | null>(null);
  const now = new Date();
  const currentFortnightStart = getCurrentFortnightStart(now);
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
  const [periodStart, setPeriodStart] = useState(toLocalInputDate(currentFortnightStart));
  const [periodEnd, setPeriodEnd] = useState(toLocalInputDate(now));
  const [payoutRecipient, setPayoutRecipient] = useState<"" | "ken_sar" | "papa">("");
  const [payoutFormEnabled, setPayoutFormEnabled] = useState(false);
  const [showKenSarDetail, setShowKenSarDetail] = useState(false);
  const [showKenSarPayoutDetail, setShowKenSarPayoutDetail] = useState<Record<string, boolean>>({});
  const [payoutParticipantId, setPayoutParticipantId] = useState<number | "">("");
  const [payoutCutId, setPayoutCutId] = useState<number | "">("");
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutMethod, setPayoutMethod] = useState("");
  const [payoutReference, setPayoutReference] = useState("");
  const [payoutNotes, setPayoutNotes] = useState("");
  const [recordsPeriodStart, setRecordsPeriodStart] = useState(toLocalInputDate(startMonth));
  const [recordsPeriodEnd, setRecordsPeriodEnd] = useState(toLocalInputDate(now));
  const [recordsSearch, setRecordsSearch] = useState("");
  const [recordsSkip, setRecordsSkip] = useState(0);
  const [recordsExportOpen, setRecordsExportOpen] = useState(false);
  const [payoutsExportOpen, setPayoutsExportOpen] = useState(false);
  const [exportingRecords, setExportingRecords] = useState<null | "pdf" | "xlsx">(null);
  const [exportingPayouts, setExportingPayouts] = useState<null | "pdf" | "xlsx">(null);
  const [removingProductId, setRemovingProductId] = useState<number | null>(null);
  const recordsLimit = 50;

  function mapParticipantToPayload(row: InvestmentParticipant) {
    return {
      user_id: row.user_id,
      display_name: row.display_name.trim(),
      profit_share_percent: Number(row.profit_share_percent ?? row.share_percent ?? 0),
      capital_share_percent: Number(row.capital_share_percent ?? 0),
      is_active: row.is_active,
    };
  }

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        setSuccess(null);
        const [
          summaryData,
          recentActivityData,
          salesLinesData,
          productRows,
          participantRows,
          cutRows,
          payoutRows,
          ledgerRows,
        ] = await Promise.all([
          fetchInvestmentSummary(token),
          fetchInvestmentRecentActivity(token),
          fetchInvestmentSalesLines(token, {
            period_start: recordsPeriodStart,
            period_end: recordsPeriodEnd,
            search: recordsSearch.trim() || undefined,
            skip: recordsSkip,
            limit: recordsLimit,
          }),
          fetchInvestmentProducts(token, { limit: 500 }),
          fetchInvestmentParticipants(token),
          fetchInvestmentCuts(token),
          fetchInvestmentPayouts(token),
          fetchInvestmentLedger(token),
        ]);
        if (cancelled) return;
        setSummary(summaryData);
        setRecentActivity(recentActivityData);
        setSalesLinesPage(salesLinesData);
        setProducts(productRows);
        setParticipants(participantRows);
        setCuts(cutRows);
        setPayouts(payoutRows);
        setLedger(ledgerRows);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "No se pudo cargar inversión.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [recordsPeriodEnd, recordsPeriodStart, recordsSearch, recordsSkip, recordsLimit, token]);

  const filteredProducts = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return products;
    return products.filter((item) => {
      return (
        item.product_name.toLowerCase().includes(term) ||
        (item.sku || "").toLowerCase().includes(term) ||
        (item.group_name || "").toLowerCase().includes(term)
      );
    });
  }, [products, search]);
  const filteredProductsStockCostTotal = useMemo(
    () =>
      filteredProducts.reduce(
        (acc, item) => acc + Number(item.qty_on_hand || 0) * Number(item.cost || 0),
        0
      ),
    [filteredProducts]
  );
  const filteredProductsStockSaleTotal = useMemo(
    () =>
      filteredProducts.reduce(
        (acc, item) => acc + Number(item.qty_on_hand || 0) * Number(item.price || 0),
        0
      ),
    [filteredProducts]
  );

  const activeParticipants = useMemo(
    () => participants.filter((item) => item.is_active),
    [participants]
  );
  const activeParticipantsSummary = useMemo(() => {
    const rows = activeParticipants.map((item, index) => ({
      id: item.id,
      name: item.display_name,
      profit: Number(item.profit_share_percent ?? item.share_percent ?? 0),
      capital: Number(item.capital_share_percent ?? 0),
      color: PARTICIPANT_COLORS[index % PARTICIPANT_COLORS.length],
    }));
    const profitTotal = rows.reduce((acc, item) => acc + item.profit, 0);
    const capitalTotal = rows.reduce((acc, item) => acc + item.capital, 0);
    return { rows, profitTotal, capitalTotal };
  }, [activeParticipants]);

  const papaParticipantId = useMemo(() => {
    const papa = activeParticipants.find((item) => {
      const name = item.display_name.toLowerCase();
      return name.includes("papa") || name.includes("papá");
    });
    return papa?.id ?? null;
  }, [activeParticipants]);

  const estimatedDueTotal = useMemo(
    () => (previewCut ? previewCut.allocations.reduce((acc, row) => acc + (row.amount_due || 0), 0) : 0),
    [previewCut]
  );
  const ledgerDueTotal = Number(ledger?.due_total ?? 0);
  const ledgerPaidTotal = Number(ledger?.paid_total ?? 0);
  const ledgerBalanceTotal = Number(ledger?.balance_total ?? 0);
  const hasCuts = cuts.length > 0;
  const effectiveDueTotal = hasCuts ? ledgerDueTotal : Math.max(estimatedDueTotal, ledgerDueTotal);
  const effectiveBalanceTotal = hasCuts
    ? ledgerBalanceTotal
    : Math.max(effectiveDueTotal - ledgerPaidTotal, 0);

  const participantFinancialRows = useMemo(() => {
    const ledgerRows = ledger?.rows ?? [];
    if (hasCuts || !previewCut) return ledgerRows;
    const ledgerMap = new Map(ledgerRows.map((row) => [row.participant_id, row]));
    return previewCut.allocations.map((allocation) => {
      const ledgerRow = ledgerMap.get(allocation.participant_id);
      const dueTotal = Number(allocation.amount_due || 0);
      const paidTotal = Number(ledgerRow?.paid_total || 0);
      return {
        participant_id: allocation.participant_id,
        participant_name: allocation.participant_name,
        due_total: dueTotal,
        paid_total: paidTotal,
        balance: Math.max(dueTotal - paidTotal, 0),
      };
    });
  }, [hasCuts, ledger?.rows, previewCut]);

  const currentPeriodStartDate = useMemo(() => new Date(periodStart), [periodStart]);
  const currentPeriodBoundaryEnd = useMemo(
    () => getFortnightBoundaryEnd(currentPeriodStartDate),
    [currentPeriodStartDate]
  );
  const currentPeriodDisplayEnd = useMemo(
    () => new Date(currentPeriodBoundaryEnd.getTime() - 1000),
    [currentPeriodBoundaryEnd]
  );
  const nowDate = useMemo(() => new Date(periodEnd), [periodEnd]);
  const remainingMs = Math.max(currentPeriodBoundaryEnd.getTime() - nowDate.getTime(), 0);
  const daysRemaining = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));

  const currentCutKenSarDue = useMemo(() => {
    if (!previewCut) return 0;
    return previewCut.allocations
      .filter((row) => (papaParticipantId ? row.participant_id !== papaParticipantId : true))
      .reduce((acc, row) => acc + Number(row.amount_due || 0), 0);
  }, [papaParticipantId, previewCut]);
  const currentCutDueByParticipant = useMemo(() => {
    const totals: Record<number, number> = {};
    for (const allocation of previewCut?.allocations ?? []) {
      totals[allocation.participant_id] =
        (totals[allocation.participant_id] || 0) + Number(allocation.amount_due || 0);
    }
    return totals;
  }, [previewCut]);

  const payoutsByCut = useMemo(() => {
    return payouts.reduce<Record<number, number>>((acc, payout) => {
      if (!payout.cut_id) return acc;
      acc[payout.cut_id] = (acc[payout.cut_id] || 0) + Number(payout.amount || 0);
      return acc;
    }, {});
  }, [payouts]);

  const closedCutsRows = useMemo(() => {
    return cuts.map((cut) => {
      const dueTotal = cut.allocations.reduce((acc, row) => acc + Number(row.amount_due || 0), 0);
      const paidTotal = payoutsByCut[cut.id] || 0;
      const pendingTotal = Math.max(dueTotal - paidTotal, 0);
      return {
        id: cut.id,
        period_start: cut.period_start,
        period_end: cut.period_end,
        created_at: cut.created_at,
        gross_sales: cut.gross_sales,
        profit_base: cut.profit_base,
        due_total: dueTotal,
        paid_total: paidTotal,
        pending_total: pendingTotal,
      };
    });
  }, [cuts, payoutsByCut]);
  const closedCutsCount = cuts.length;
  const closedCutsWithPendingCount = useMemo(
    () => closedCutsRows.filter((row) => row.pending_total > 0.009).length,
    [closedCutsRows]
  );

  const payoutsByCutParticipant = useMemo(() => {
    return payouts.reduce<Record<string, number>>((acc, payout) => {
      if (!payout.cut_id) return acc;
      const key = `${payout.cut_id}:${payout.participant_id}`;
      acc[key] = (acc[key] || 0) + Number(payout.amount || 0);
      return acc;
    }, {});
  }, [payouts]);

  const participantPendingRows = useMemo(() => {
    return (ledger?.rows ?? [])
      .map((row) => ({
        participant_id: row.participant_id,
        participant_name: row.participant_name,
        due_total: Number(row.due_total || 0),
        paid_total: Number(row.paid_total || 0),
        balance: Math.max(Number(row.balance || 0), 0),
      }))
      .filter((row) => row.balance > 0.009)
      .sort((a, b) => b.balance - a.balance);
  }, [ledger?.rows]);
  const recipientTableParticipantRows = useMemo(() => {
    return activeParticipants.map((participant) => {
      const ledgerRow = (ledger?.rows ?? []).find((row) => row.participant_id === participant.id);
      const dueTotal =
        Number(ledgerRow?.due_total || 0) + Number(currentCutDueByParticipant[participant.id] || 0);
      const paidTotal = Number(ledgerRow?.paid_total || 0);
      return {
        participant_id: participant.id,
        participant_name: participant.display_name,
        due_total: dueTotal,
        paid_total: paidTotal,
        balance: Math.max(dueTotal - paidTotal, 0),
      };
    });
  }, [activeParticipants, currentCutDueByParticipant, ledger?.rows]);

  const kenSarParticipantIds = useMemo(() => {
    return activeParticipants
      .filter((participant) => (papaParticipantId ? participant.id !== papaParticipantId : true))
      .map((participant) => participant.id);
  }, [activeParticipants, papaParticipantId]);

  const kenSarPending = useMemo(() => {
    return participantPendingRows
      .filter((row) => kenSarParticipantIds.includes(row.participant_id))
      .reduce((acc, row) => acc + row.balance, 0);
  }, [kenSarParticipantIds, participantPendingRows]);
  const totalPendingClosed = useMemo(
    () => participantPendingRows.reduce((acc, row) => acc + row.balance, 0),
    [participantPendingRows]
  );

  const paidCurrentFortnightKenSar = useMemo(() => {
    return payouts
      .filter((payout) => {
        const paidAt = new Date(payout.paid_at);
        return (
          paidAt >= currentPeriodStartDate &&
          paidAt < currentPeriodBoundaryEnd &&
          kenSarParticipantIds.includes(payout.participant_id)
        );
      })
      .reduce((acc, payout) => acc + Number(payout.amount || 0), 0);
  }, [currentPeriodBoundaryEnd, currentPeriodStartDate, kenSarParticipantIds, payouts]);
  const currentCutKenSarPending = useMemo(
    () => Math.max(currentCutKenSarDue - paidCurrentFortnightKenSar, 0),
    [currentCutKenSarDue, paidCurrentFortnightKenSar]
  );
  const paidCurrentFortnightByParticipant = useMemo(() => {
    const totals: Record<number, number> = {};
    for (const payout of payouts) {
      const paidAt = new Date(payout.paid_at);
      if (!(paidAt >= currentPeriodStartDate && paidAt < currentPeriodBoundaryEnd)) continue;
      totals[payout.participant_id] = (totals[payout.participant_id] || 0) + Number(payout.amount || 0);
    }
    return totals;
  }, [currentPeriodBoundaryEnd, currentPeriodStartDate, payouts]);
  const currentCutPendingByParticipant = useMemo(() => {
    const map: Record<number, number> = {};
    for (const allocation of previewCut?.allocations ?? []) {
      const due = Number(allocation.amount_due || 0);
      const paid = Number(paidCurrentFortnightByParticipant[allocation.participant_id] || 0);
      map[allocation.participant_id] = Math.max(due - paid, 0);
    }
    return map;
  }, [paidCurrentFortnightByParticipant, previewCut?.allocations]);
  const paidCurrentFortnightTotal = useMemo(() => {
    return payouts
      .filter((payout) => {
        const paidAt = new Date(payout.paid_at);
        return paidAt >= currentPeriodStartDate && paidAt < currentPeriodBoundaryEnd;
      })
      .reduce((acc, payout) => acc + Number(payout.amount || 0), 0);
  }, [currentPeriodBoundaryEnd, currentPeriodStartDate, payouts]);
  const currentCutTotalDue = useMemo(
    () => previewCut?.allocations.reduce((acc, row) => acc + Number(row.amount_due || 0), 0) ?? 0,
    [previewCut]
  );
  const currentCutGlobalPending = useMemo(
    () => Math.max(currentCutTotalDue - paidCurrentFortnightTotal, 0),
    [currentCutTotalDue, paidCurrentFortnightTotal]
  );
  const kenSarGlobalPending = useMemo(
    () => Math.max(kenSarPending + currentCutKenSarPending, 0),
    [kenSarPending, currentCutKenSarPending]
  );
  const globalPending = useMemo(
    () => Math.max(totalPendingClosed + currentCutGlobalPending, 0),
    [totalPendingClosed, currentCutGlobalPending]
  );

  const recipientPendingRows = useMemo(() => {
    const rows: Array<{
      key: "ken_sar" | "papa";
      label: string;
      due_total: number;
      paid_total: number;
      balance: number;
    }> = [];
    if (kenSarParticipantIds.length) {
      const due = recipientTableParticipantRows
        .filter((row) => kenSarParticipantIds.includes(row.participant_id))
        .reduce((acc, row) => acc + row.due_total, 0);
      const paid = recipientTableParticipantRows
        .filter((row) => kenSarParticipantIds.includes(row.participant_id))
        .reduce((acc, row) => acc + row.paid_total, 0);
      rows.push({
        key: "ken_sar",
        label: "Ken+Sar (cuenta conjunta)",
        due_total: due,
        paid_total: paid,
        balance: Math.max(due - paid, 0),
      });
    }
    if (papaParticipantId) {
      const papaRow = recipientTableParticipantRows.find((row) => row.participant_id === papaParticipantId);
      rows.push({
        key: "papa",
        label: "Papá",
        due_total: Number(papaRow?.due_total || 0),
        paid_total: Number(papaRow?.paid_total || 0),
        balance: Number(papaRow?.balance || 0),
      });
    }
    return rows;
  }, [kenSarParticipantIds, papaParticipantId, recipientTableParticipantRows]);

  const kenSarDetailRows = useMemo(() => {
    const fromTableRows = recipientTableParticipantRows
      .filter((row) => kenSarParticipantIds.includes(row.participant_id))
      .sort((a, b) => a.participant_name.localeCompare(b.participant_name));
    if (fromTableRows.length > 0) {
      return fromTableRows;
    }
    return [];
  }, [kenSarParticipantIds, recipientTableParticipantRows]);

  const cutParticipantPendingMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const cut of cuts) {
      for (const allocation of cut.allocations) {
        const key = `${cut.id}:${allocation.participant_id}`;
        const due = Number(allocation.amount_due || 0);
        const paid = Number(payoutsByCutParticipant[key] || 0);
        map[key] = Math.max(due - paid, 0);
      }
    }
    return map;
  }, [cuts, payoutsByCutParticipant]);

  const selectedCut = useMemo(
    () => (payoutCutId === "" ? null : cuts.find((cut) => cut.id === payoutCutId) || null),
    [cuts, payoutCutId]
  );

  const selectedParticipantLedger = useMemo(
    () =>
      payoutParticipantId === ""
        ? null
        : (ledger?.rows ?? []).find((row) => row.participant_id === payoutParticipantId) || null,
    [ledger?.rows, payoutParticipantId]
  );

  const selectedCutParticipantPending = useMemo(() => {
    if (payoutParticipantId === "" || payoutCutId === "") return null;
    return Number(cutParticipantPendingMap[`${payoutCutId}:${payoutParticipantId}`] || 0);
  }, [cutParticipantPendingMap, payoutCutId, payoutParticipantId]);
  const payoutGroupedRows = useMemo(() => {
    const order: string[] = [];
    const groups = new Map<
      string,
      {
        key: string;
        recipientKey: "ken_sar" | "papa";
        recipientLabel: string;
        paidAt: string;
        cutId: number | null;
        method: string;
        reference: string;
        totalAmount: number;
        details: Array<{ id: number; participant_name: string; amount: number }>;
      }
    >();
    for (const item of payouts) {
      const isKenSar = papaParticipantId ? item.participant_id !== papaParticipantId : true;
      const recipientKey: "ken_sar" | "papa" = isKenSar ? "ken_sar" : "papa";
      const recipientLabel = isKenSar ? "Ken+Sar (cuenta conjunta)" : "Papá";
      const paidAtBucketDate = new Date(item.paid_at);
      paidAtBucketDate.setMilliseconds(0);
      const paidAtBucket = paidAtBucketDate.toISOString();
      const groupKey = [
        recipientKey,
        paidAtBucket,
        item.cut_id ?? "none",
        item.method ?? "",
        item.reference ?? "",
        item.notes ?? "",
      ].join("|");
      if (!groups.has(groupKey)) {
        order.push(groupKey);
        groups.set(groupKey, {
          key: groupKey,
          recipientKey,
          recipientLabel,
          paidAt: item.paid_at,
          cutId: item.cut_id ?? null,
          method: item.method || "—",
          reference: item.reference || "—",
          totalAmount: 0,
          details: [],
        });
      }
      const group = groups.get(groupKey)!;
      group.totalAmount += Number(item.amount || 0);
      if (isKenSar) {
        group.details.push({
          id: item.id,
          participant_name: item.participant_name,
          amount: Number(item.amount || 0),
        });
      }
    }
    return order.map((key) => {
      const group = groups.get(key)!;
      return {
        ...group,
        details: group.details.sort((a, b) => a.participant_name.localeCompare(b.participant_name)),
      };
    });
  }, [papaParticipantId, payouts]);

  const salesSplit = useMemo(() => {
    const activeRows = activeParticipantsSummary.rows.map((row) => ({
      ...row,
      isPapa: papaParticipantId === row.id,
    }));
    const totalProfitShare = activeRows.reduce((acc, row) => acc + Math.max(row.profit, 0), 0);
    const totalCapitalShare = activeRows.reduce((acc, row) => acc + Math.max(row.capital, 0), 0);
    const papaProfitShare = activeRows
      .filter((row) => row.isPapa)
      .reduce((acc, row) => acc + Math.max(row.profit, 0), 0);
    const papaRatio = totalProfitShare > 0 ? papaProfitShare / totalProfitShare : 0;
    const oursRatio = Math.max(0, 1 - papaRatio);
    const nonPapaRows = activeRows.filter((row) => !row.isPapa);
    return {
      participants: activeRows,
      nonPapaRows,
      totalProfitShare,
      totalCapitalShare,
      papaRatio,
      oursRatio,
      papaPercentLabel: papaRatio * 100,
      oursPercentLabel: oursRatio * 100,
    };
  }, [activeParticipantsSummary.rows, papaParticipantId]);

  const splitSaleLine = useCallback(
    (line: { net_total: number; line_cost_total?: number }) => {
      const lineCostTotal = Number(line.line_cost_total ?? 0);
      const profit = Number(line.net_total ?? 0) - lineCostTotal;
      const papaAmount = profit * salesSplit.papaRatio;
      const participantBreakdown = salesSplit.nonPapaRows.map((row) => {
          const participantProfitShare = Math.max(row.profit, 0);
          const participantCapitalShare = Math.max(row.capital, 0);
          const profitAmount =
            salesSplit.totalProfitShare > 0
              ? (profit * participantProfitShare) / salesSplit.totalProfitShare
              : 0;
          const capitalAmount =
            salesSplit.totalCapitalShare > 0
              ? (lineCostTotal * participantCapitalShare) / salesSplit.totalCapitalShare
              : 0;
          return {
            id: row.id,
            name: row.name,
            amount: profitAmount + capitalAmount,
          };
        });
      const oursAmount = participantBreakdown.reduce((acc, row) => acc + row.amount, 0);
      return { papaAmount, oursAmount, lineCostTotal, participantBreakdown };
    },
    [salesSplit]
  );

  async function persistParticipants(
    payload: Array<{
      user_id?: number | null;
      display_name: string;
      profit_share_percent: number;
      capital_share_percent: number;
      is_active: boolean;
    }>
  ) {
    if (!token) return;
    try {
      setSavingParticipants(true);
      setError(null);
      setSuccess(null);
      const cleaned = payload.filter((item) => item.display_name.length > 0);
      if (!cleaned.length) {
        setError("Agrega al menos un participante con nombre antes de guardar.");
        return;
      }
      const updated = await replaceInvestmentParticipants(token, cleaned);
      setParticipants(updated);
      const [ledgerRows, cutRows] = await Promise.all([
        fetchInvestmentLedger(token),
        fetchInvestmentCuts(token),
      ]);
      setLedger(ledgerRows);
      setCuts(cutRows);
      const active = cleaned.filter((item) => item.is_active);
      const utilSum = active.reduce((acc, item) => acc + item.profit_share_percent, 0);
      const capSum = active.reduce((acc, item) => acc + item.capital_share_percent, 0);
      setSuccess(
        `Participantes guardados. Suma utilidad: ${utilSum.toFixed(2)}% | suma capital: ${capSum.toFixed(2)}%.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron guardar participantes.");
    } finally {
      setSavingParticipants(false);
    }
  }

  async function handleSaveCreatedParticipants() {
    const newRows = createParticipantDraft
      .map((item) => ({
        user_id: item.user_id,
        display_name: item.display_name.trim(),
        profit_share_percent: parsePercentInput(item.profit_share_percent),
        capital_share_percent: parsePercentInput(item.capital_share_percent),
        is_active: item.is_active,
      }))
      .filter((item) => item.display_name.length > 0);
    if (!newRows.length) {
      setError("Completa al menos un participante nuevo para guardar.");
      return;
    }
    const existingRows = participants.map((participant) => mapParticipantToPayload(participant));
    await persistParticipants([...existingRows, ...newRows]);
    setCreateParticipantDraft([]);
    setShowCreateParticipantForm(false);
  }

  function startEditingParticipant(participant: InvestmentParticipant) {
    setEditingParticipantDraft({
      id: participant.id,
      user_id: participant.user_id,
      display_name: participant.display_name,
      profit_share_percent: String(participant.profit_share_percent ?? participant.share_percent ?? 0),
      capital_share_percent: String(participant.capital_share_percent ?? 0),
      is_active: participant.is_active,
    });
  }

  async function handleSaveEditedParticipant() {
    if (!editingParticipantDraft) return;
    const name = editingParticipantDraft.display_name.trim();
    if (!name) {
      setError("El nombre del participante no puede estar vacío.");
      return;
    }
    const payload = participants.map((participant) => {
      if (participant.id !== editingParticipantDraft.id) {
        return mapParticipantToPayload(participant);
      }
      return {
        user_id: editingParticipantDraft.user_id,
        display_name: name,
        profit_share_percent: parsePercentInput(editingParticipantDraft.profit_share_percent),
        capital_share_percent: parsePercentInput(editingParticipantDraft.capital_share_percent),
        is_active: editingParticipantDraft.is_active,
      };
    });
    await persistParticipants(payload);
    setEditingParticipantDraft(null);
  }

  async function handleRefreshCurrentCut() {
    if (!token) return;
    const nowValue = new Date();
    const startValue = getCurrentFortnightStart(nowValue);
    const startInput = toLocalInputDate(startValue);
    const endInput = toLocalInputDate(nowValue);
    setPeriodStart(startInput);
    setPeriodEnd(endInput);
    try {
      setPreviewLoading(true);
      setError(null);
      const preview = await previewInvestmentCut(token, {
        period_start: startInput,
        period_end: endInput,
      });
      setPreviewCut(preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo refrescar el corte actual.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleReconcileCut(cutId: number) {
    if (!token) return;
    try {
      setError(null);
      setSuccess(null);
      setReconcilingCutId(cutId);
      await reconcileInvestmentCut(token, cutId);
      const [cutRows, ledgerRows] = await Promise.all([
        fetchInvestmentCuts(token),
        fetchInvestmentLedger(token),
      ]);
      setCuts(cutRows);
      setLedger(ledgerRows);
      setSuccess("Corte conciliado correctamente.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo conciliar el corte.");
    } finally {
      setReconcilingCutId(null);
    }
  }

  async function handleCreatePayout() {
    if (!token) return;
    try {
      const amount = parseThousandsInput(payoutAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        setError("Ingresa un monto válido mayor a 0.");
        return;
      }
      if (payoutRecipient === "") {
        setError("Selecciona un destinatario.");
        return;
      }

      setCreatingPayout(true);
      setError(null);

      if (payoutRecipient === "ken_sar") {
        const ids = kenSarParticipantIds;
        if (!ids.length) {
          setError("No hay participantes en la cuenta conjunta Ken+Sar.");
          return;
        }
        const pendingByParticipant = ids.map((id) => {
          const pending =
            payoutCutId !== ""
              ? Number(cutParticipantPendingMap[`${payoutCutId}:${id}`] || 0)
              : Number(currentCutPendingByParticipant[id] || 0);
          return { id, pending: Math.max(pending, 0) };
        });
        const totalPending = pendingByParticipant.reduce((acc, row) => acc + row.pending, 0);
        if (totalPending <= 0.009) {
          setError("No hay saldo pendiente para Ken+Sar.");
          return;
        }
        if (amount > totalPending + 0.009) {
          setError(
            `El monto (${formatMoney(amount)}) supera el pendiente de Ken+Sar (${formatMoney(totalPending)}).`
          );
          return;
        }
        let remaining = amount;
        for (let index = 0; index < pendingByParticipant.length; index += 1) {
          const row = pendingByParticipant[index];
          if (row.pending <= 0.009) continue;
          const suggested =
            index === pendingByParticipant.length - 1
              ? remaining
              : Number(((amount * row.pending) / totalPending).toFixed(2));
          const allocation = Math.min(suggested, row.pending, remaining);
          if (allocation <= 0.009) continue;
          remaining -= allocation;
          await createInvestmentPayout(token, {
            participant_id: row.id,
            cut_id: payoutCutId === "" ? undefined : payoutCutId,
            amount: allocation,
            method: payoutMethod.trim() || undefined,
            reference: payoutReference.trim() || undefined,
            notes:
              (payoutNotes.trim() ? `${payoutNotes.trim()} | ` : "") +
              "Transferencia recibida en cuenta conjunta Ken+Sar",
          });
        }
      } else {
        if (payoutParticipantId === "") {
          setError("No se pudo resolver el participante para el destinatario seleccionado.");
          return;
        }
        const pending =
          payoutCutId !== ""
            ? Number(cutParticipantPendingMap[`${payoutCutId}:${payoutParticipantId}`] || 0)
            : Number(currentCutPendingByParticipant[payoutParticipantId] || 0);
        if (pending > 0 && amount > pending + 0.009) {
          setError(
            `El monto (${formatMoney(amount)}) supera el saldo pendiente (${formatMoney(pending)}).`
          );
          return;
        }
        await createInvestmentPayout(token, {
          participant_id: payoutParticipantId,
          cut_id: payoutCutId === "" ? undefined : payoutCutId,
          amount,
          method: payoutMethod.trim() || undefined,
          reference: payoutReference.trim() || undefined,
          notes: payoutNotes.trim() || undefined,
        });
      }

      const [payoutRows, ledgerRows, cutRows] = await Promise.all([
        fetchInvestmentPayouts(token),
        fetchInvestmentLedger(token),
        fetchInvestmentCuts(token),
      ]);
      setPayouts(payoutRows);
      setLedger(ledgerRows);
      setCuts(cutRows);
      clearPayoutForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar el pago.");
    } finally {
      setCreatingPayout(false);
    }
  }

  function clearPayoutForm() {
    setPayoutAmount("");
    setPayoutMethod("");
    setPayoutReference("");
    setPayoutNotes("");
    setPayoutCutId("");
    setPayoutRecipient("");
    setPayoutParticipantId("");
    setPayoutFormEnabled(false);
  }

  function setSuggestedPaymentForRecipient(recipient: "ken_sar" | "papa", participantId?: number) {
    setPayoutFormEnabled(true);
    setPayoutRecipient(recipient);
    const targetParticipantId =
      recipient === "papa" ? participantId ?? papaParticipantId ?? undefined : undefined;
    if (targetParticipantId) setPayoutParticipantId(targetParticipantId);
    else setPayoutParticipantId("");
    let suggestedCut: number | "" = "";
    for (const cut of cuts) {
      let pending = 0;
      if (recipient === "ken_sar") {
        pending = kenSarParticipantIds.reduce(
          (acc, id) => acc + Number(cutParticipantPendingMap[`${cut.id}:${id}`] || 0),
          0
        );
      } else if (targetParticipantId) {
        pending = Number(cutParticipantPendingMap[`${cut.id}:${targetParticipantId}`] || 0);
      }
      if (pending > 0.009) {
        suggestedCut = cut.id;
        break;
      }
    }
    setPayoutCutId(suggestedCut);
    setPayoutAmount("");
  }

  async function loadSalesLines(currentToken: string, nextSkip: number) {
    const page = await fetchInvestmentSalesLines(currentToken, {
      period_start: recordsPeriodStart,
      period_end: recordsPeriodEnd,
      search: recordsSearch.trim() || undefined,
      skip: nextSkip,
      limit: recordsLimit,
    });
    setSalesLinesPage(page);
    setRecordsSkip(nextSkip);
  }

  async function handleSearchSalesLines() {
    if (!token) return;
    try {
      setError(null);
      await loadSalesLines(token, 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los registros.");
    }
  }

  async function handleExportRecords(format: "pdf" | "xlsx") {
    if (!token) return;
    try {
      setError(null);
      setExportingRecords(format);
      const blob = await exportInvestmentSalesLines(token, format, {
        period_start: recordsPeriodStart,
        period_end: recordsPeriodEnd,
        search: recordsSearch.trim() || undefined,
      });
      const suffix = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `investment_registros_${suffix}.${format}`);
      setRecordsExportOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo exportar registros.");
    } finally {
      setExportingRecords(null);
    }
  }

  async function handleExportPayouts(format: "pdf" | "xlsx") {
    if (!token) return;
    try {
      setError(null);
      setExportingPayouts(format);
      const blob = await exportInvestmentPayouts(token, format, {
        period_start: recordsPeriodStart,
        period_end: recordsPeriodEnd,
      });
      const suffix = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `investment_transferencias_${suffix}.${format}`);
      setPayoutsExportOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo exportar transferencias.");
    } finally {
      setExportingPayouts(null);
    }
  }

  async function handleRemoveInvestmentProduct(productId: number, productName: string) {
    if (!token) return;
    const confirmed = window.confirm(
      `¿Quitar "${productName}" de productos de inversión?`
    );
    if (!confirmed) return;
    try {
      setError(null);
      setSuccess(null);
      setRemovingProductId(productId);
      await removeInvestmentProduct(token, productId);
      const [productRows, summaryData, recentActivityData, salesLinesData] = await Promise.all([
        fetchInvestmentProducts(token, { limit: 500 }),
        fetchInvestmentSummary(token),
        fetchInvestmentRecentActivity(token),
        fetchInvestmentSalesLines(token, {
          period_start: recordsPeriodStart,
          period_end: recordsPeriodEnd,
          search: recordsSearch.trim() || undefined,
          skip: recordsSkip,
          limit: recordsLimit,
        }),
      ]);
      setProducts(productRows);
      setSummary(summaryData);
      setRecentActivity(recentActivityData);
      setSalesLinesPage(salesLinesData);
      setSuccess(`Producto quitado de inversión: ${productName}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo quitar el producto de inversión.");
    } finally {
      setRemovingProductId(null);
    }
  }

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const run = async () => {
      try {
        const preview = await previewInvestmentCut(token, {
          period_start: periodStart,
          period_end: periodEnd,
        });
        if (cancelled) return;
        setPreviewCut(preview);
      } catch {
        if (!cancelled) setPreviewCut(null);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [periodEnd, periodStart, token]);

  if (loading) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Inversión</h1>
        <p className="text-sm text-slate-500">Cargando datos...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Inversión</h1>
        <p className="text-sm text-slate-500">
          Módulo simple para seguimiento de productos, cortes y pagos.
        </p>
      </header>

      {error ? (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      <nav className="overflow-auto">
        <div className="inline-flex min-w-full gap-2 rounded-xl border border-slate-200 bg-white p-2">
          {[
            { id: "resumen", label: "Resumen" },
            { id: "productos", label: "Productos" },
            { id: "registros", label: "Registros" },
            { id: "cortes", label: "Cortes" },
            { id: "pagos", label: "Pagos" },
            { id: "participantes", label: "Participantes" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() =>
                setActiveTab(
                  tab.id as
                    | "resumen"
                    | "productos"
                    | "registros"
                    | "cortes"
                    | "pagos"
                    | "participantes"
                )
              }
              className={`rounded-lg px-3 py-2 text-sm font-medium ${
                activeTab === tab.id
                  ? "bg-slate-900 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {activeTab === "resumen" ? (
        <section className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <article className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Productos</p>
              <p className="mt-1 text-xl font-semibold">{summary?.total_products ?? 0}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Activos</p>
              <p className="mt-1 text-xl font-semibold">{summary?.active_products ?? 0}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Stock unidades</p>
              <p className="mt-1 text-xl font-semibold">
                {(summary?.stock_units ?? 0).toLocaleString("es-CO")}
              </p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Valor costo</p>
              <p className="mt-1 text-xl font-semibold">
                {formatMoney(summary?.stock_cost_value ?? 0)}
              </p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Valor venta</p>
              <p className="mt-1 text-xl font-semibold">
                {formatMoney(summary?.stock_sale_value ?? 0)}
              </p>
            </article>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <p className="text-slate-500">{hasCuts ? "Total a pagar" : "Total a pagar (estimado)"}</p>
              <p className="font-semibold">{formatMoney(effectiveDueTotal)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <p className="text-slate-500">Total pagado</p>
              <p className="font-semibold">{formatMoney(ledgerPaidTotal)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <p className="text-slate-500">{hasCuts ? "Pendiente" : "Pendiente (estimado)"}</p>
              <p className="font-semibold">{formatMoney(effectiveBalanceTotal)}</p>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="mb-2 text-sm font-semibold text-slate-800">Saldos por participante</p>
            <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Participante</th>
                    <th className="px-3 py-2 text-right">Debe</th>
                    <th className="px-3 py-2 text-right">Pagado</th>
                    <th className="px-3 py-2 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {participantFinancialRows.map((row) => (
                    <tr key={row.participant_id} className="border-t border-slate-100">
                      <td className="px-3 py-2">{row.participant_name}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(row.due_total)}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(row.paid_total)}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(row.balance)}</td>
                    </tr>
                  ))}
                  {participantFinancialRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-5 text-center text-slate-500">
                        Sin datos para mostrar.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            <article className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">Ventas recientes (inversión)</p>
                <p className="text-xs text-slate-500">Incluye descuento por línea</p>
              </div>
              <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Fecha</th>
                      <th className="px-3 py-2 text-left">Producto</th>
                      <th className="px-3 py-2 text-right">Cant.</th>
                      <th className="px-3 py-2 text-right">Desc.</th>
                      <th className="px-3 py-2 text-right">
                        Papá ({salesSplit.papaPercentLabel.toFixed(0)}%)
                      </th>
                      <th className="px-3 py-2 text-right">
                        Ken+Sar ({salesSplit.oursPercentLabel.toFixed(0)}% + capital)
                      </th>
                      <th className="px-3 py-2 text-right">Neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(recentActivity?.recent_sales ?? []).map((sale) => {
                      const split = splitSaleLine(sale);
                      const detailsText = split.participantBreakdown
                        .map((person) => `${person.name}: ${formatMoney(person.amount)}`)
                        .join("\n");
                      return (
                      <tr key={`recent-sale-${sale.sale_id}-${sale.product_id}-${sale.sold_at}`} className="border-t border-slate-100">
                        <td className="px-3 py-2">
                          <div>{new Date(sale.sold_at).toLocaleDateString("es-CO")}</div>
                          <div className="text-xs text-slate-500">
                            {sale.sale_document_number || `#${sale.sale_id}`}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div>{sale.product_name}</div>
                          <div className="text-xs text-slate-500">
                            {sale.seller_name || sale.pos_name || "—"}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">{sale.quantity.toLocaleString("es-CO")}</td>
                        <td className="px-3 py-2 text-right">
                          <div>{formatMoney(sale.line_discount_value)}</div>
                          <div className="text-xs text-slate-500">{sale.discount_percent.toFixed(2)}%</div>
                        </td>
                        <td className="px-3 py-2 text-right font-medium">{formatMoney(split.papaAmount)}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="font-medium">{formatMoney(split.oursAmount)}</div>
                          <div className="text-xs text-slate-500 inline-flex items-center gap-1">
                            <span>Cap: {formatMoney(split.lineCostTotal)}</span>
                            <span
                              className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-slate-300 text-[10px] font-semibold text-slate-500"
                              title={detailsText}
                              aria-label={`Detalle Ken y Sar: ${detailsText}`}
                            >
                                i
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-medium">{formatMoney(sale.net_total)}</td>
                      </tr>
                    )})}
                    {(recentActivity?.recent_sales ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-5 text-center text-slate-500">
                          Sin ventas recientes de productos de inversión.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">Movimientos recientes</p>
                <p className="text-xs text-slate-500">Inventario de productos de inversión</p>
              </div>
              <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Fecha</th>
                      <th className="px-3 py-2 text-left">Producto</th>
                      <th className="px-3 py-2 text-left">Motivo</th>
                      <th className="px-3 py-2 text-right">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(recentActivity?.recent_movements ?? []).map((movement) => (
                      <tr key={`recent-movement-${movement.movement_id}`} className="border-t border-slate-100">
                        <td className="px-3 py-2">
                          {new Date(movement.created_at).toLocaleString("es-CO")}
                        </td>
                        <td className="px-3 py-2">
                          <div>{movement.product_name}</div>
                          {movement.notes ? (
                            <div className="text-xs text-slate-500">{movement.notes}</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">{movement.reason}</td>
                        <td
                          className={`px-3 py-2 text-right font-medium ${
                            movement.qty_delta >= 0 ? "text-emerald-700" : "text-rose-700"
                          }`}
                        >
                          {movement.qty_delta >= 0 ? "+" : ""}
                          {movement.qty_delta.toLocaleString("es-CO")}
                        </td>
                      </tr>
                    ))}
                    {(recentActivity?.recent_movements ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-5 text-center text-slate-500">
                          Sin movimientos recientes de inversión.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </article>
          </div>
        </section>
      ) : null}

      {activeTab === "registros" ? (
        <section className="space-y-4">
          <article
            className={`rounded-xl border p-4 space-y-3 transition-colors ${
              payoutFormEnabled
                ? "border-slate-200 bg-white"
                : "border-slate-200/80 bg-slate-50/70"
            }`}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Registros de ventas</h2>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setRecordsExportOpen((prev) => !prev)}
                  disabled={exportingRecords !== null}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 disabled:opacity-60"
                >
                  {exportingRecords ? `Exportando ${exportingRecords.toUpperCase()}...` : "Exportar"}
                </button>
                {recordsExportOpen ? (
                  <div className="absolute right-0 z-20 mt-1 w-36 overflow-hidden rounded-md border border-slate-200 bg-white shadow-md">
                    <button
                      type="button"
                      onClick={() => void handleExportRecords("pdf")}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleExportRecords("xlsx")}
                      className="block w-full border-t border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      Excel (.xlsx)
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <label className="text-xs text-slate-600">Desde</label>
                <input
                  type="datetime-local"
                  value={recordsPeriodStart}
                  onChange={(event) => setRecordsPeriodStart(event.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-600">Hasta</label>
                <input
                  type="datetime-local"
                  value={recordsPeriodEnd}
                  onChange={(event) => setRecordsPeriodEnd(event.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="min-w-[220px] flex-1 space-y-1">
                <label className="text-xs text-slate-600">Buscar</label>
                <input
                  value={recordsSearch}
                  onChange={(event) => setRecordsSearch(event.target.value)}
                  placeholder="Producto, documento, vendedor, POS"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={handleSearchSalesLines}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
              >
                Buscar
              </button>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <p className="text-slate-500">Unidades vendidas</p>
                <p className="font-semibold">
                  {(salesLinesPage?.total_quantity ?? 0).toLocaleString("es-CO")}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <p className="text-slate-500">Descuento total líneas</p>
                <p className="font-semibold">{formatMoney(salesLinesPage?.total_discount ?? 0)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <p className="text-slate-500">Venta neta total</p>
                <p className="font-semibold">{formatMoney(salesLinesPage?.total_net ?? 0)}</p>
              </div>
            </div>
            <div className="max-h-[520px] overflow-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Fecha</th>
                    <th className="px-3 py-2 text-left">Documento</th>
                    <th className="px-3 py-2 text-left">Producto</th>
                    <th className="px-3 py-2 text-right">Cant.</th>
                    <th className="px-3 py-2 text-right">P.Unit</th>
                    <th className="px-3 py-2 text-right">Bruto</th>
                    <th className="px-3 py-2 text-right">Desc.</th>
                    <th className="px-3 py-2 text-right">
                      Papá ({salesSplit.papaPercentLabel.toFixed(0)}%)
                    </th>
                    <th className="px-3 py-2 text-right">
                      Ken+Sar ({salesSplit.oursPercentLabel.toFixed(0)}% + capital)
                    </th>
                    <th className="px-3 py-2 text-right">Neto</th>
                  </tr>
                </thead>
                <tbody>
                  {(salesLinesPage?.items ?? []).map((row, index) => {
                    const split = splitSaleLine(row);
                    const detailsText = split.participantBreakdown
                      .map((person) => `${person.name}: ${formatMoney(person.amount)}`)
                      .join("\n");
                    return (
                    <tr
                      key={`${row.sale_id}-${row.product_id}-${row.sold_at}-${index}`}
                      className="border-t border-slate-100"
                    >
                      <td className="px-3 py-2">{new Date(row.sold_at).toLocaleString("es-CO")}</td>
                      <td className="px-3 py-2">{row.sale_document_number || `#${row.sale_id}`}</td>
                      <td className="px-3 py-2">
                        <div>{row.product_name}</div>
                        <div className="text-xs text-slate-500">
                          {row.seller_name || row.pos_name || "—"}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">{row.quantity.toLocaleString("es-CO")}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(row.unit_price)}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(row.gross_line_total)}</td>
                      <td className="px-3 py-2 text-right">
                        <div>{formatMoney(row.line_discount_value)}</div>
                        <div className="text-xs text-slate-500">{row.discount_percent.toFixed(2)}%</div>
                      </td>
                      <td className="px-3 py-2 text-right font-medium">{formatMoney(split.papaAmount)}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="font-medium">{formatMoney(split.oursAmount)}</div>
                        <div className="text-xs text-slate-500 inline-flex items-center gap-1">
                          <span>Cap: {formatMoney(split.lineCostTotal)}</span>
                          <span
                            className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-slate-300 text-[10px] font-semibold text-slate-500"
                            title={detailsText}
                            aria-label={`Detalle Ken y Sar: ${detailsText}`}
                          >
                              i
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{formatMoney(row.net_total)}</td>
                    </tr>
                  )})}
                  {(salesLinesPage?.items ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-3 py-5 text-center text-slate-500">
                        No hay registros para ese filtro.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Mostrando {Math.min((salesLinesPage?.skip ?? 0) + 1, salesLinesPage?.total ?? 0)}-
                {Math.min((salesLinesPage?.skip ?? 0) + (salesLinesPage?.items.length ?? 0), salesLinesPage?.total ?? 0)} de{" "}
                {salesLinesPage?.total ?? 0} líneas
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!token || recordsSkip <= 0}
                  onClick={() => {
                    if (!token) return;
                    const nextSkip = Math.max(0, recordsSkip - recordsLimit);
                    void loadSalesLines(token, nextSkip);
                  }}
                  className="rounded-md border border-slate-300 px-3 py-1 text-sm disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={
                    !token ||
                    !salesLinesPage ||
                    recordsSkip + recordsLimit >= (salesLinesPage?.total ?? 0)
                  }
                  onClick={() => {
                    if (!token || !salesLinesPage) return;
                    const nextSkip = recordsSkip + recordsLimit;
                    if (nextSkip >= salesLinesPage.total) return;
                    void loadSalesLines(token, nextSkip);
                  }}
                  className="rounded-md border border-slate-300 px-3 py-1 text-sm disabled:opacity-50"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === "productos" ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Productos de inversión</h2>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre, SKU o grupo"
              className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <article className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Valor stock costo</p>
              <p className="mt-1 text-xl font-semibold">{formatMoney(filteredProductsStockCostTotal)}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Valor stock venta</p>
              <p className="mt-1 text-xl font-semibold">{formatMoney(filteredProductsStockSaleTotal)}</p>
            </article>
          </div>
          <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">Producto</th>
                  <th className="px-3 py-2 text-left">SKU</th>
                  <th className="px-3 py-2 text-left">Grupo</th>
                  <th className="px-3 py-2 text-right">Stock</th>
                  <th className="px-3 py-2 text-right">Costo</th>
                  <th className="px-3 py-2 text-right">Precio</th>
                  <th className="px-3 py-2 text-center">Estado</th>
                  <th className="px-3 py-2 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((item) => (
                  <tr key={item.product_id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{item.product_name}</td>
                    <td className="px-3 py-2">{item.sku || "—"}</td>
                    <td className="px-3 py-2">{item.group_name || "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {item.qty_on_hand.toLocaleString("es-CO")}
                    </td>
                    <td className="px-3 py-2 text-right">{formatMoney(item.cost)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(item.price)}</td>
                    <td className="px-3 py-2 text-center">
                      {item.status === "ok"
                        ? "OK"
                        : item.status === "low"
                        ? "Bajo"
                        : "Crítico"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          void handleRemoveInvestmentProduct(item.product_id, item.product_name)
                        }
                        disabled={removingProductId === item.product_id}
                        className="rounded-md border border-rose-200 px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                      >
                        {removingProductId === item.product_id ? "Quitando..." : "Quitar"}
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-5 text-center text-slate-500">
                      No hay productos de inversión para mostrar.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeTab === "cortes" ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Cortes automáticos</h2>
            <button
              type="button"
              onClick={handleRefreshCurrentCut}
              disabled={previewLoading}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {previewLoading ? "Actualizando..." : "Actualizar corte actual"}
            </button>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            El sistema cierra cortes automáticamente por quincena: <strong>1-15</strong> y{" "}
            <strong>16-fin de mes</strong>.
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <article className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">Estado</p>
              <p className="font-semibold text-emerald-700">Abierto</p>
            </article>
            <article className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">Período actual</p>
              <p className="text-sm font-semibold">
                {currentPeriodStartDate.toLocaleDateString("es-CO")} -{" "}
                {currentPeriodDisplayEnd.toLocaleDateString("es-CO")}
              </p>
            </article>
            <article className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">Acumulado hasta</p>
              <p className="text-sm font-semibold">
                {nowDate.toLocaleDateString("es-CO")} {nowDate.toLocaleTimeString("es-CO")}
              </p>
            </article>
            <article className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">Días para cierre</p>
              <p className="font-semibold">{daysRemaining}</p>
            </article>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Ventas netas</p>
              <p className="font-semibold">{formatMoney(previewCut?.gross_sales ?? 0)}</p>
            </article>
            <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Costo a devolver</p>
              <p className="font-semibold">{formatMoney(previewCut?.cogs ?? 0)}</p>
            </article>
            <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Utilidad a repartir</p>
              <p className="font-semibold">{formatMoney(previewCut?.profit_base ?? 0)}</p>
            </article>
            <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Total Ken+Sar a pagar</p>
              <p className="font-semibold">{formatMoney(currentCutKenSarDue)}</p>
            </article>
          </div>

          <div className="rounded-lg border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold">
              Distribución del corte actual
            </div>
            <div className="max-h-64 overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Participante</th>
                    <th className="px-3 py-2 text-right">% utilidad</th>
                    <th className="px-3 py-2 text-right">% capital</th>
                    <th className="px-3 py-2 text-right">Capital</th>
                    <th className="px-3 py-2 text-right">Utilidad</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(previewCut?.allocations ?? []).map((allocation) => (
                    <tr key={`open-cut-${allocation.participant_id}`} className="border-t border-slate-100">
                      <td className="px-3 py-2">{allocation.participant_name}</td>
                      <td className="px-3 py-2 text-right">
                        {Number(allocation.profit_share_percent || allocation.share_percent || 0).toFixed(2)}%
                      </td>
                      <td className="px-3 py-2 text-right">
                        {Number(allocation.capital_share_percent || 0).toFixed(2)}%
                      </td>
                      <td className="px-3 py-2 text-right">{formatMoney(allocation.capital_amount)}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(allocation.profit_amount)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatMoney(allocation.amount_due)}</td>
                    </tr>
                  ))}
                  {(previewCut?.allocations ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-4 text-center text-slate-500">
                        Sin datos de distribución para el corte actual.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold">
              Cortes cerrados
            </div>
            <div className="max-h-64 overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Período</th>
                    <th className="px-3 py-2 text-left">Cerrado el</th>
                    <th className="px-3 py-2 text-right">Ventas</th>
                    <th className="px-3 py-2 text-right">Utilidad</th>
                    <th className="px-3 py-2 text-right">Debe</th>
                    <th className="px-3 py-2 text-right">Pagado</th>
                    <th className="px-3 py-2 text-right">Pendiente</th>
                    <th className="px-3 py-2 text-center">Estado</th>
                    <th className="px-3 py-2 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {closedCutsRows.map((cutRow) => (
                    <tr key={`closed-cut-${cutRow.id}`} className="border-t border-slate-100">
                      <td className="px-3 py-2">
                        {new Date(cutRow.period_start).toLocaleDateString("es-CO")} -{" "}
                        {new Date(new Date(cutRow.period_end).getTime() - 1000).toLocaleDateString("es-CO")}
                      </td>
                      <td className="px-3 py-2">
                        {new Date(cutRow.created_at).toLocaleDateString("es-CO")}
                      </td>
                      <td className="px-3 py-2 text-right">{formatMoney(cutRow.gross_sales)}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(cutRow.profit_base)}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(cutRow.due_total)}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(cutRow.paid_total)}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(cutRow.pending_total)}</td>
                      <td className="px-3 py-2 text-center">
                        {cuts.find((item) => item.id === cutRow.id)?.reconciled
                          ? "Conciliado"
                          : cutRow.pending_total > 0
                            ? "Cerrado con saldo"
                            : "Cerrado"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          disabled={
                            reconcilingCutId === cutRow.id ||
                            cutRow.pending_total > 0.009 ||
                            Boolean(cuts.find((item) => item.id === cutRow.id)?.reconciled)
                          }
                          onClick={() => void handleReconcileCut(cutRow.id)}
                          className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                          title={
                            cuts.find((item) => item.id === cutRow.id)?.reconciled
                              ? "Este corte ya está conciliado"
                              : cutRow.pending_total > 0.009
                                ? "Debes dejar pendiente en 0 para conciliar"
                                : "Marcar corte como conciliado"
                          }
                        >
                          {cuts.find((item) => item.id === cutRow.id)?.reconciled
                            ? "Conciliado"
                            : reconcilingCutId === cutRow.id
                              ? "Conciliando..."
                              : "Conciliar"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {closedCutsRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-4 text-center text-slate-500">
                        Aún no hay cortes cerrados.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "pagos" ? (
        <section className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Por pagar Ken+Sar (corte actual)
              </p>
              <p className="mt-1 text-xl font-semibold">{formatMoney(currentCutKenSarPending)}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Recibido quincena actual
              </p>
              <p className="mt-1 text-xl font-semibold">{formatMoney(paidCurrentFortnightKenSar)}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Pendiente acumulado Ken+Sar
              </p>
              <p className="mt-1 text-xl font-semibold">{formatMoney(kenSarGlobalPending)}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Pendiente global</p>
              <p className="mt-1 text-xl font-semibold">{formatMoney(globalPending)}</p>
            </article>
          </div>

          <article className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Pendiente por destinatario</h2>
              <p className="text-xs text-slate-500">
                Flujo real: Kensar/Papá transfiere a destinatarios.
              </p>
            </div>
            <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Destinatario</th>
                    <th className="px-3 py-2 text-right">Debe</th>
                    <th className="px-3 py-2 text-right">Recibido</th>
                    <th className="px-3 py-2 text-right">Saldo</th>
                    <th className="px-3 py-2 text-right">Sugerido</th>
                    <th className="px-3 py-2 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {recipientPendingRows.flatMap((row) => {
                    const rows = [
                      <tr key={`pending-recipient-${row.key}`} className="border-t border-slate-100">
                        <td className="px-3 py-2">
                          <div className="inline-flex items-center gap-2">
                            {row.key === "ken_sar" ? (
                              <button
                                type="button"
                                onClick={() => setShowKenSarDetail((prev) => !prev)}
                                className="inline-flex items-center justify-center px-0 text-sm text-slate-500 hover:text-slate-800"
                                aria-label={
                                  showKenSarDetail ? "Ocultar detalle Ken+Sar" : "Ver detalle Ken+Sar"
                                }
                              >
                                {showKenSarDetail ? "▾" : "▸"}
                              </button>
                            ) : null}
                            <span>{row.label}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">{formatMoney(row.due_total)}</td>
                        <td className="px-3 py-2 text-right">{formatMoney(row.paid_total)}</td>
                        <td className="px-3 py-2 text-right font-semibold">{formatMoney(row.balance)}</td>
                        <td className="px-3 py-2 text-right">{formatMoney(row.balance)}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              row.key === "ken_sar"
                                ? setSuggestedPaymentForRecipient("ken_sar")
                                : setSuggestedPaymentForRecipient("papa", papaParticipantId || undefined)
                            }
                            className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700"
                          >
                            Registrar
                          </button>
                        </td>
                      </tr>,
                    ];
                    if (row.key === "ken_sar" && showKenSarDetail) {
                      for (const detail of kenSarDetailRows) {
                        rows.push(
                          <tr
                            key={`pending-recipient-detail-${detail.participant_id}`}
                            className="border-t border-slate-100 bg-slate-50/70"
                          >
                            <td className="px-3 py-2 text-slate-600">{detail.participant_name}</td>
                            <td className="px-3 py-2 text-right text-slate-600">
                              {formatMoney(detail.due_total)}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-600">
                              {formatMoney(detail.paid_total)}
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-slate-700">
                              {formatMoney(detail.balance)}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-600">
                              {formatMoney(detail.balance)}
                            </td>
                            <td className="px-3 py-2 text-right text-xs text-slate-500">Detalle</td>
                          </tr>
                        );
                      }
                    }
                    return rows;
                  })}
                  {recipientPendingRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-4 text-center text-slate-500">
                        No hay saldos pendientes por destinatario.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <h2 className="text-lg font-semibold">Registrar transferencia recibida</h2>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <p>
                Cortes cerrados disponibles: <strong>{closedCutsCount}</strong>
                {closedCutsCount > 0 ? (
                  <>
                    {" "}
                    (con saldo pendiente: <strong>{closedCutsWithPendingCount}</strong>)
                  </>
                ) : null}
              </p>
              <p>
                Corte actual abierto:{" "}
                <strong>
                  {currentPeriodStartDate.toLocaleDateString("es-CO")} -{" "}
                  {currentPeriodDisplayEnd.toLocaleDateString("es-CO")}
                </strong>
              </p>
              {closedCutsCount === 0 ? (
                <p className="text-amber-700">
                  Aún no hay cortes cerrados para asociar. Usa <strong>Sin corte asociado</strong>.
                </p>
              ) : null}
              {!payoutFormEnabled ? (
                <p className="text-slate-500">
                  Pulsa <strong>Registrar</strong> en una fila de destinatario para habilitar este formulario.
                </p>
              ) : null}
            </div>
            {selectedCut && payoutRecipient !== "" ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <p>
                  Corte #{selectedCut.id}:{" "}
                  {new Date(selectedCut.period_start).toLocaleDateString("es-CO")} -{" "}
                  {new Date(new Date(selectedCut.period_end).getTime() - 1000).toLocaleDateString("es-CO")}
                </p>
                <p>
                  Pendiente de este destinatario en corte:{" "}
                  <strong>
                    {formatMoney(
                      payoutRecipient === "ken_sar"
                        ? kenSarParticipantIds.reduce(
                            (acc, id) => acc + Number(cutParticipantPendingMap[`${selectedCut.id}:${id}`] || 0),
                            0
                          )
                        : selectedCutParticipantPending || 0
                    )}
                  </strong>
                </p>
              </div>
            ) : null}
            {payoutRecipient === "ken_sar" ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Saldo acumulado Ken+Sar: <strong>{formatMoney(kenSarPending)}</strong> · Pendiente
                corte actual: <strong>{formatMoney(currentCutKenSarPending)}</strong>
              </div>
            ) : selectedParticipantLedger ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Saldo total participante:{" "}
                <strong>{formatMoney(Number(selectedParticipantLedger.balance || 0))}</strong>
              </div>
            ) : null}
            <div
              aria-disabled={!payoutFormEnabled}
              className={`grid gap-2 md:grid-cols-2 transition-opacity ${
                payoutFormEnabled ? "opacity-100" : "opacity-55"
              }`}
            >
              <select
                value={payoutRecipient}
                onChange={(event) => {
                  const value = event.target.value as "" | "ken_sar" | "papa";
                  if (value === "") {
                    setPayoutRecipient("");
                    setPayoutParticipantId("");
                    return;
                  }
                  if (value === "ken_sar") {
                    setSuggestedPaymentForRecipient("ken_sar");
                    return;
                  }
                  setSuggestedPaymentForRecipient("papa", papaParticipantId || undefined);
                }}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                disabled={!payoutFormEnabled}
              >
                <option value="">Destinatario</option>
                {kenSarParticipantIds.length ? (
                  <option value="ken_sar">Ken+Sar (cuenta conjunta)</option>
                ) : null}
                {papaParticipantId ? <option value="papa">Papá</option> : null}
              </select>
              <select
                value={payoutParticipantId}
                onChange={(event) =>
                  event.target.value
                    ? setSuggestedPaymentForRecipient("papa", Number(event.target.value))
                    : setPayoutParticipantId("")
                }
                className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                disabled={!payoutFormEnabled || payoutRecipient === "ken_sar"}
              >
                <option value="">Participante interno</option>
                {activeParticipants.map((participant) => (
                  <option key={participant.id} value={participant.id}>
                    {participant.display_name}
                  </option>
                ))}
              </select>
              <select
                value={payoutCutId}
                onChange={(event) =>
                  setPayoutCutId(event.target.value ? Number(event.target.value) : "")
                }
                className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                disabled={!payoutFormEnabled}
              >
                <option value="">Sin corte asociado</option>
                {cuts.map((cut) => (
                  <option key={cut.id} value={cut.id}>
                    Corte #{cut.id} ({new Date(cut.period_start).toLocaleDateString("es-CO")} -{" "}
                    {new Date(new Date(cut.period_end).getTime() - 1000).toLocaleDateString("es-CO")}){" "}
                    {Number(payoutsByCut[cut.id] || 0) < cut.allocations.reduce((acc, row) => acc + Number(row.amount_due || 0), 0)
                      ? "· con saldo"
                      : "· liquidado"}
                  </option>
                ))}
              </select>
              <input
                type="text"
                inputMode="numeric"
                value={payoutAmount}
                onChange={(event) => setPayoutAmount(formatThousandsInput(event.target.value))}                placeholder="Monto"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                disabled={!payoutFormEnabled}
              />
              <input
                value={payoutMethod}
                onChange={(event) => setPayoutMethod(event.target.value)}
                placeholder="Método (transferencia, cash...)"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                disabled={!payoutFormEnabled}
              />
              <input
                value={payoutReference}
                onChange={(event) => setPayoutReference(event.target.value)}
                placeholder="Referencia"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                disabled={!payoutFormEnabled}
              />
              <input
                value={payoutNotes}
                onChange={(event) => setPayoutNotes(event.target.value)}
                placeholder="Notas"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                disabled={!payoutFormEnabled}
              />
            </div>
            <div className={`flex justify-end gap-2 ${payoutFormEnabled ? "" : "opacity-65"}`}>
              <button
                type="button"
                onClick={clearPayoutForm}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                disabled={!payoutFormEnabled}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreatePayout}
                disabled={creatingPayout || payoutRecipient === "" || !payoutFormEnabled}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {creatingPayout ? "Registrando..." : "Registrar transferencia"}
              </button>
            </div>
          </article>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Transferencias registradas</h2>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPayoutsExportOpen((prev) => !prev)}
                  disabled={exportingPayouts !== null}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 disabled:opacity-60"
                >
                  {exportingPayouts ? `Exportando ${exportingPayouts.toUpperCase()}...` : "Exportar"}
                </button>
                {payoutsExportOpen ? (
                  <div className="absolute right-0 z-20 mt-1 w-36 overflow-hidden rounded-md border border-slate-200 bg-white shadow-md">
                    <button
                      type="button"
                      onClick={() => void handleExportPayouts("pdf")}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleExportPayouts("xlsx")}
                      className="block w-full border-t border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      Excel (.xlsx)
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Fecha</th>
                    <th className="px-3 py-2 text-left">Destinatario</th>
                    <th className="px-3 py-2 text-left">Corte</th>
                    <th className="px-3 py-2 text-right">Monto</th>
                    <th className="px-3 py-2 text-left">Método</th>
                    <th className="px-3 py-2 text-left">Referencia</th>
                  </tr>
                </thead>
                <tbody>
                  {payoutGroupedRows.flatMap((group) => {
                    const rows = [
                      <tr key={`payout-group-${group.key}`} className="border-t border-slate-100">
                        <td className="px-3 py-2">{new Date(group.paidAt).toLocaleString("es-CO")}</td>
                        <td className="px-3 py-2">
                          <div className="inline-flex items-center gap-2">
                            {group.recipientKey === "ken_sar" ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setShowKenSarPayoutDetail((prev) => ({
                                    ...prev,
                                    [group.key]: !prev[group.key],
                                  }))
                                }
                                className="inline-flex items-center justify-center px-0 text-sm text-slate-500 hover:text-slate-800"
                                aria-label={
                                  showKenSarPayoutDetail[group.key]
                                    ? "Ocultar detalle transferencia Ken+Sar"
                                    : "Ver detalle transferencia Ken+Sar"
                                }
                              >
                                {showKenSarPayoutDetail[group.key] ? "▾" : "▸"}
                              </button>
                            ) : null}
                            <span>{group.recipientLabel}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2">{group.cutId ? `#${group.cutId}` : "—"}</td>
                        <td className="px-3 py-2 text-right">{formatMoney(group.totalAmount)}</td>
                        <td className="px-3 py-2">{group.method}</td>
                        <td className="px-3 py-2">{group.reference}</td>
                      </tr>,
                    ];
                    if (group.recipientKey === "ken_sar" && showKenSarPayoutDetail[group.key]) {
                      for (const detail of group.details) {
                        rows.push(
                          <tr
                            key={`payout-group-detail-${group.key}-${detail.id}`}
                            className="border-t border-slate-100 bg-slate-50/70"
                          >
                            <td className="px-3 py-2 text-slate-500">—</td>
                            <td className="px-3 py-2 text-slate-600">{detail.participant_name}</td>
                            <td className="px-3 py-2 text-slate-500">—</td>
                            <td className="px-3 py-2 text-right text-slate-700">
                              {formatMoney(detail.amount)}
                            </td>
                            <td className="px-3 py-2 text-slate-500">Detalle</td>
                            <td className="px-3 py-2 text-slate-500">—</td>
                          </tr>
                        );
                      }
                    }
                    return rows;
                  })}
                  {payoutGroupedRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-5 text-center text-slate-500">
                        No hay pagos registrados.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      ) : null}

      {activeTab === "participantes" ? (
        <section className="space-y-4">
          <article className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <h2 className="text-lg font-semibold">Distribución guardada</h2>
            <p className="text-xs text-slate-500">
              Vista rápida de cómo se reparte el 100% entre participantes activos.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="mb-3 flex items-center justify-between text-xs text-slate-600">
                  <span>Distribución utilidad</span>
                  <span>{activeParticipantsSummary.profitTotal.toFixed(2)}%</span>
                </div>
                <div className="flex items-center gap-4">
                  <DonutChart
                    rows={activeParticipantsSummary.rows}
                    valueKey="profit"
                    title="Distribución de utilidad"
                  />
                  <div className="space-y-1.5 text-xs">
                    {activeParticipantsSummary.rows.map((row) => (
                      <div
                        key={`legend-profit-${row.id}`}
                        className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1"
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-sm border border-slate-200"
                          style={{ backgroundColor: row.color }}
                        />
                        <span className="text-slate-700">
                          {row.name}: {row.profit.toFixed(2)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="mb-3 flex items-center justify-between text-xs text-slate-600">
                  <span>Distribución capital</span>
                  <span>{activeParticipantsSummary.capitalTotal.toFixed(2)}%</span>
                </div>
                <div className="flex items-center gap-4">
                  <DonutChart
                    rows={activeParticipantsSummary.rows}
                    valueKey="capital"
                    title="Distribución de capital"
                  />
                  <div className="space-y-1.5 text-xs">
                    {activeParticipantsSummary.rows
                      .filter((row) => row.capital > 0)
                      .map((row) => (
                      <div
                        key={`legend-capital-${row.id}`}
                        className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1"
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-sm border border-slate-200"
                          style={{ backgroundColor: row.color }}
                        />
                        <span className="text-slate-700">
                          {row.name}: {row.capital.toFixed(2)}%
                        </span>
                      </div>
                    ))}
                    {activeParticipantsSummary.rows.filter((row) => row.capital > 0).length === 0 ? (
                      <p className="text-xs text-slate-500">Sin participantes con % capital mayor a 0.</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
            <div className="overflow-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Participante</th>
                    <th className="px-3 py-2 text-right">% utilidad</th>
                    <th className="px-3 py-2 text-right">% capital</th>
                    <th className="px-3 py-2 text-center">Estado</th>
                    <th className="px-3 py-2 text-right">Editar</th>
                  </tr>
                </thead>
                <tbody>
                  {participants.map((participant) => (
                    <tr key={`summary-${participant.id}`} className="border-t border-slate-100">
                      <td className="px-3 py-2">{participant.display_name}</td>
                      <td className="px-3 py-2 text-right">
                        {Number(
                          participant.profit_share_percent ?? participant.share_percent ?? 0
                        ).toFixed(2)}
                        %
                      </td>
                      <td className="px-3 py-2 text-right">
                        {Number(participant.capital_share_percent ?? 0).toFixed(2)}%
                      </td>
                      <td className="px-3 py-2 text-center">
                        {participant.is_active ? "Activo" : "Inactivo"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => startEditingParticipant(participant)}
                          className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                  {participants.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-slate-500">
                        Aún no hay participantes guardados.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Crear participante</h2>
              <button
                type="button"
                onClick={() => {
                  if (!showCreateParticipantForm) {
                    setShowCreateParticipantForm(true);
                    setCreateParticipantDraft([
                      {
                        draft_id: createDraftId(),
                        display_name: "",
                        profit_share_percent: "",
                        capital_share_percent: "",
                        is_active: true,
                      },
                    ]);
                    return;
                  }
                  setCreateParticipantDraft((prev) => [
                    ...prev,
                    {
                      draft_id: createDraftId(),
                      display_name: "",
                      profit_share_percent: "",
                      capital_share_percent: "",
                      is_active: true,
                    },
                  ]);
                }}
                className="rounded-md border border-slate-300 px-3 py-1 text-sm"
              >
                {showCreateParticipantForm ? "Agregar fila" : "Nuevo participante"}
              </button>
            </div>
            {!showCreateParticipantForm ? (
              <p className="text-sm text-slate-500">
                Pulsa <strong>Nuevo participante</strong> para abrir un formulario limpio.
              </p>
            ) : (
              <>
                <p className="text-xs text-slate-500">
                  Este formulario solo agrega participantes nuevos. Para editar uno existente usa
                  el botón Editar de su fila.
                </p>
                <div className="space-y-2">
                  {createParticipantDraft.map((item, index) => (
                    <div key={item.draft_id} className="grid gap-2 md:grid-cols-12">
                      <input
                        value={item.display_name}
                        onChange={(event) =>
                          setCreateParticipantDraft((prev) =>
                            prev.map((row, rowIndex) =>
                              rowIndex === index
                                ? { ...row, display_name: event.target.value }
                                : row
                            )
                          )
                        }
                        placeholder="Nombre participante"
                        className="md:col-span-6 rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        inputMode="decimal"
                        value={item.profit_share_percent}
                        onChange={(event) =>
                          setCreateParticipantDraft((prev) =>
                            prev.map((row, rowIndex) =>
                              rowIndex === index
                                ? {
                                    ...row,
                                    profit_share_percent: event.target.value,
                                  }
                                : row
                            )
                          )
                        }
                        placeholder="% utilidad (ej: 30)"
                        className="md:col-span-2 rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        inputMode="decimal"
                        value={item.capital_share_percent}
                        onChange={(event) =>
                          setCreateParticipantDraft((prev) =>
                            prev.map((row, rowIndex) =>
                              rowIndex === index
                                ? {
                                    ...row,
                                    capital_share_percent: event.target.value,
                                  }
                                : row
                            )
                          )
                        }
                        placeholder="% capital (ej: 60)"
                        className="md:col-span-2 rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                      <label className="md:col-span-1 inline-flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={item.is_active}
                          onChange={(event) =>
                            setCreateParticipantDraft((prev) =>
                              prev.map((row, rowIndex) =>
                                rowIndex === index
                                  ? { ...row, is_active: event.target.checked }
                                  : row
                              )
                            )
                          }
                        />
                        Activo
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setCreateParticipantDraft((prev) =>
                            prev.filter((_, rowIndex) => rowIndex !== index)
                          )
                        }
                        className="md:col-span-1 rounded-md border border-rose-300 px-2 py-2 text-xs text-rose-700"
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateParticipantForm(false);
                      setCreateParticipantDraft([]);
                    }}
                    className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveCreatedParticipants}
                    disabled={savingParticipants}
                    className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {savingParticipants ? "Guardando..." : "Guardar nuevos"}
                  </button>
                </div>
              </>
            )}
          </article>

          {editingParticipantDraft ? (
            <article className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              <h2 className="text-lg font-semibold">
                Editar participante: {editingParticipantDraft.display_name}
              </h2>
              <p className="text-xs text-slate-500">
                `% utilidad` reparte ganancia. `% capital` reparte devolución del costo vendido.
              </p>
              <div className="grid gap-2 md:grid-cols-12">
                <input
                  value={editingParticipantDraft.display_name}
                  onChange={(event) =>
                    setEditingParticipantDraft((prev) =>
                      prev ? { ...prev, display_name: event.target.value } : prev
                    )
                  }
                  placeholder="Nombre participante"
                  className="md:col-span-6 rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  inputMode="decimal"
                  value={editingParticipantDraft.profit_share_percent}
                  onChange={(event) =>
                    setEditingParticipantDraft((prev) =>
                      prev ? { ...prev, profit_share_percent: event.target.value } : prev
                    )
                  }
                  placeholder="% utilidad (ej: 30)"
                  className="md:col-span-2 rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  inputMode="decimal"
                  value={editingParticipantDraft.capital_share_percent}
                  onChange={(event) =>
                    setEditingParticipantDraft((prev) =>
                      prev ? { ...prev, capital_share_percent: event.target.value } : prev
                    )
                  }
                  placeholder="% capital (ej: 60)"
                  className="md:col-span-2 rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <label className="md:col-span-2 inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={editingParticipantDraft.is_active}
                    onChange={(event) =>
                      setEditingParticipantDraft((prev) =>
                        prev ? { ...prev, is_active: event.target.checked } : prev
                      )
                    }
                  />
                  Activo
                </label>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingParticipantDraft(null)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditedParticipant}
                  disabled={savingParticipants}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {savingParticipants ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            </article>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

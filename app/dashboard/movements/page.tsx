"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../providers/AuthProvider";
import {
  applyInventoryRecount,
  cancelInventoryRecount,
  cancelManualMovementDocument,
  cancelReceivingLot,
  closeInventoryRecount,
  createManualMovementDocument,
  createInventoryRecount,
  createReceivingLot,
  downloadReceivingSupportFile,
  exportInventoryProducts,
  exportInventoryProductsPdf,
  fetchInventoryLatestEntries,
  fetchInventoryMovements,
  fetchInventoryStockTrend,
  fetchManualMovementDocumentDetail,
  fetchManualMovementDocuments,
  fetchInventoryOverview,
  fetchInventoryProductHistory,
  fetchInventoryProducts,
  getInventoryRecountDraft,
  getInventoryRecountDetail,
  listInventoryRecounts,
  fetchReceivingDocuments,
  fetchReceivingLots,
  fetchReceivingLotDetail,
  fetchReceivingProductGroups,
  deleteInventoryRecountDraft,
  upsertInventoryRecountLine,
  upsertInventoryRecountDraft,
  type InventoryMovementReason,
  type InventoryMovementRecord,
  type InventoryStockTrendPoint,
  type InventoryLatestEntryRecord,
  type InventoryOverview,
  type InventoryRecountDraftState,
  type InventoryRecountDetail,
  type InventoryRecountRecord,
  type InventoryProductHistory,
  type InventoryProductPage,
  type InventoryProductRow,
  type ManualMovementDocumentDetail,
  type ReceivingDocumentPage,
  type ReceivingLotDetail,
  type ReceivingLotRead,
  type ReceivingProductGroupOption,
  type ManualMovementDocumentRead,
} from "@/lib/api/inventory";
import {
  LABEL_AGENT_DEFAULT_FORMAT,
  LABEL_AGENT_DEFAULT_PRINT_URL,
  LABEL_AGENT_HEALTH_URL,
  LABEL_AGENT_UI_URL,
  LABEL_AGENT_WINDOWS_DOWNLOAD_URL,
} from "@/lib/printing/labelAgentConfig";

const tabs = [
  { key: "summary", label: "Resumen" },
  { key: "inventory", label: "Inventario" },
  { key: "movements", label: "Movimientos" },
  { key: "recounts", label: "Recuentos" },
  { key: "receptions", label: "Recepciones" },
] as const;
const MOVEMENTS_ACTIVE_TAB_KEY = "metrik_movements_active_tab_v1";
const RECEIVING_DRAFT_LOT_KEY = "metrik_receiving_draft_lot_id_v1";
const RECOUNT_DRAFT_STORAGE_PREFIX = "metrik_recount_draft_v1";
const ACTIVE_MOVEMENT_FORM_KEY = "metrik_active_movement_form_v1";
const ACTIVE_MOVEMENT_FORM_TTL_MS = 1000 * 60 * 60 * 8;
const INVENTORY_FILTERS_KEY = "metrik_movements_inventory_filters_v1";
const INVENTORY_FILTERS_TTL_MS = 1000 * 60 * 60 * 8;
const WEB_RECEIVING_ORIGIN = "recepción web";
const CLOSED_DOCS_PANEL_LIMIT = 8;
type AgentProbeStatus = "idle" | "printing" | "success" | "error";
type LabelPrintPayload = {
  CODIGO: string;
  BARRAS: string;
  NOMBRE: string;
  PRECIO: string;
  format: string;
  copies: number;
};

const TEST_LABEL_PAYLOAD: LabelPrintPayload = {
  CODIGO: "3519",
  BARRAS: "3519",
  NOMBRE: "Microfono Condensador TCM-304",
  PRECIO: "$22.000",
  format: LABEL_AGENT_DEFAULT_FORMAT,
  copies: 1,
};

type TabKey = (typeof tabs)[number]["key"];

type ManualMovementKind =
  | "entrada_manual"
  | "salida_manual"
  | "venta_manual"
  | "ajuste"
  | "perdida_dano";

type StatusFilter = "all" | "ok" | "low" | "critical" | "negative";
type InventorySort =
  | "name_asc"
  | "stock_asc"
  | "stock_desc"
  | "sku_asc"
  | "sku_desc"
  | "cost_stock_asc"
  | "cost_stock_desc"
  | "price_stock_asc"
  | "price_stock_desc";
type InventoryStockFilter = "all" | "positive" | "zero" | "negative";

type InventoryFiltersSnapshot = {
  savedAt: number;
  search: string;
  sort: InventorySort;
  stock: InventoryStockFilter;
  status: StatusFilter;
  group: string;
  pageSize: number;
};

const reasonLabel: Record<InventoryMovementReason, string> = {
  sale: "Venta",
  purchase: "Compra",
  adjustment: "Ajuste",
  count: "Recuento",
  loss: "Pérdida",
  damage: "Daño",
  transfer_in: "Entrada",
  transfer_out: "Salida",
};

const kindOptions: Array<{ id: ManualMovementKind; label: string }> = [
  { id: "entrada_manual", label: "Entrada manual - Recepción" },
  { id: "salida_manual", label: "Salida manual" },
  { id: "venta_manual", label: "Venta manual" },
  { id: "ajuste", label: "Ajuste" },
  { id: "perdida_dano", label: "Pérdida / daño" },
];

const kindDescriptions: Record<ManualMovementKind, string> = {
  entrada_manual: "Registra ingresos de inventario con documento de compra.",
  salida_manual: "Descuenta inventario por salida operativa o consumo interno.",
  venta_manual: "Flujo excepcional para registrar ventas con cliente y descuento.",
  ajuste: "Corrige diferencias puntuales incrementando o disminuyendo stock.",
  perdida_dano: "Registra mermas por pérdida o daño con trazabilidad.",
};

const manualKindLabel: Record<Exclude<ManualMovementKind, "entrada_manual">, string> = {
  salida_manual: "Salida manual",
  venta_manual: "Venta manual",
  ajuste: "Ajuste",
  perdida_dano: "Pérdida / daño",
};

export default function MovementsPage() {
  const { token, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<TabKey>("summary");
  const [activeTabReady, setActiveTabReady] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const [overview, setOverview] = useState<InventoryOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [, setOverviewError] = useState<string | null>(null);
  const [recentMovements, setRecentMovements] = useState<InventoryMovementRecord[]>([]);
  const [movementsModalRows, setMovementsModalRows] = useState<InventoryMovementRecord[]>([]);
  const [movementsModalOpen, setMovementsModalOpen] = useState(false);
  const [recentMovementsLoading, setRecentMovementsLoading] = useState(false);
  const [recentMovementsError, setRecentMovementsError] = useState<string | null>(null);
  const [stockTrend, setStockTrend] = useState<InventoryStockTrendPoint[]>([]);
  const [stockTrendLoading, setStockTrendLoading] = useState(false);
  const [stockTrendError, setStockTrendError] = useState<string | null>(null);
  const [latestEntries, setLatestEntries] = useState<InventoryLatestEntryRecord[]>([]);
  const [latestEntriesLoading, setLatestEntriesLoading] = useState(false);
  const [latestEntriesError, setLatestEntriesError] = useState<string | null>(null);
  const [latestEntriesFilter, setLatestEntriesFilter] = useState<
    "all" | "app" | "manual"
  >("all");
  const latestEntriesCacheRef = useRef<{
    refreshNonce: number;
    rows: Partial<Record<"all" | "app" | "manual", InventoryLatestEntryRecord[]>>;
  }>({ refreshNonce: 0, rows: {} });
  const [showInventorySaleValue, setShowInventorySaleValue] = useState(false);
  const [openingFormKind, setOpeningFormKind] = useState<ManualMovementKind | null>(null);

  const [inventoryPage, setInventoryPage] = useState<InventoryProductPage | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [summaryInventoryTotals, setSummaryInventoryTotals] = useState<{
    totalCostValue: number;
    totalPriceValue: number;
  }>({ totalCostValue: 0, totalPriceValue: 0 });
  const [inventoryPageNo, setInventoryPageNo] = useState(1);
  const [inventoryPageSize, setInventoryPageSize] = useState(100);
  const [inventorySearch, setInventorySearch] = useState("");
  const [inventorySort, setInventorySort] = useState<InventorySort>("sku_asc");
  const [inventoryStockFilter, setInventoryStockFilter] = useState<InventoryStockFilter>("all");
  const [inventoryStatusFilter, setInventoryStatusFilter] =
    useState<StatusFilter>("all");
  const [inventoryGroupFilter, setInventoryGroupFilter] = useState("all");
  const [groupOptions, setGroupOptions] = useState<ReceivingProductGroupOption[]>([]);
  const [inventoryExportModalOpen, setInventoryExportModalOpen] = useState(false);
  const [inventoryExportScope, setInventoryExportScope] = useState<"all" | "current">("all");
  const [inventoryExportFormat, setInventoryExportFormat] = useState<"pdf" | "xlsx">("xlsx");
  const [inventoryExporting, setInventoryExporting] = useState(false);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<InventoryProductHistory | null>(null);

  const [openRecountDocs, setOpenRecountDocs] = useState<InventoryRecountRecord[]>([]);
  const [closedRecountDocs, setClosedRecountDocs] = useState<InventoryRecountRecord[]>([]);
  const [recountDocsLoading, setRecountDocsLoading] = useState(false);
  const [recountDocsError, setRecountDocsError] = useState<string | null>(null);
  const [selectedRecountId, setSelectedRecountId] = useState<number | null>(null);
  const [recountDetail, setRecountDetail] = useState<InventoryRecountDetail | null>(null);
  const [recountDetailLoading, setRecountDetailLoading] = useState(false);
  const [recountDetailError, setRecountDetailError] = useState<string | null>(null);
  const [recountSearch, setRecountSearch] = useState("");
  const [recountSearchApplied, setRecountSearchApplied] = useState("");
  const [recountLineViewMode, setRecountLineViewMode] = useState<"differences" | "counted">(
    "counted"
  );
  const [recountPrintMode, setRecountPrintMode] = useState<"differences" | "counted" | "all">(
    "differences"
  );
  const [recountPrintModalOpen, setRecountPrintModalOpen] = useState(false);
  const [recountCountedDraft, setRecountCountedDraft] = useState<Record<number, string>>({});
  const [recountLineSavingId, setRecountLineSavingId] = useState<number | null>(null);
  const [recountActionLoading, setRecountActionLoading] = useState<"close" | "apply" | null>(null);
  const [cancellingRecountId, setCancellingRecountId] = useState<number | null>(null);
  const [closingRecountId, setClosingRecountId] = useState<number | null>(null);
  const [applyingRecountId, setApplyingRecountId] = useState<number | null>(null);
  const [recountFeedback, setRecountFeedback] = useState<string | null>(null);
  const [newRecountTitle, setNewRecountTitle] = useState("");
  const [newRecountScopeType, setNewRecountScopeType] = useState<"all" | "group" | "free">("all");
  const [newRecountScopeValue, setNewRecountScopeValue] = useState("");
  const [recountFreeSearch, setRecountFreeSearch] = useState("");
  const [recountFreeSearchApplied, setRecountFreeSearchApplied] = useState("");
  const [recountFreeSearchLoading, setRecountFreeSearchLoading] = useState(false);
  const [recountFreeSearchError, setRecountFreeSearchError] = useState<string | null>(null);
  const [recountFreeSearchResults, setRecountFreeSearchResults] = useState<InventoryProductRow[]>([]);
  const [recountFreeCountDraft, setRecountFreeCountDraft] = useState<Record<number, string>>({});
  const [newRecountMode, setNewRecountMode] = useState<"blind" | "visible">("blind");
  const [newRecountNotes, setNewRecountNotes] = useState("");
  const [creatingRecount, setCreatingRecount] = useState(false);
  const [recountView, setRecountView] = useState<"home" | "form" | "document">("home");

  const [receivingDocs, setReceivingDocs] = useState<ReceivingDocumentPage | null>(null);
  const [receivingLoading, setReceivingLoading] = useState(false);
  const [receivingError, setReceivingError] = useState<string | null>(null);
  const [receivingPage, setReceivingPage] = useState(1);
  const [receivingDateFrom, setReceivingDateFrom] = useState("");
  const [receivingDateTo, setReceivingDateTo] = useState("");
  const receivingLimit = 25;
  const [openReceivingLots, setOpenReceivingLots] = useState<ReceivingLotRead[]>([]);
  const [openReceivingLotsLoading, setOpenReceivingLotsLoading] = useState(false);
  const [openReceivingLotsError, setOpenReceivingLotsError] = useState<string | null>(null);
  const [closedReceivingLots, setClosedReceivingLots] = useState<ReceivingLotRead[]>([]);
  const [closedReceivingLotsLoading, setClosedReceivingLotsLoading] = useState(false);
  const [closedReceivingLotsError, setClosedReceivingLotsError] = useState<string | null>(null);
  const [openManualDocs, setOpenManualDocs] = useState<ManualMovementDocumentRead[]>([]);
  const [closedManualDocs, setClosedManualDocs] = useState<ManualMovementDocumentRead[]>([]);
  const [cancellingLotId, setCancellingLotId] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<{ hide?: number; remove?: number }>({});
  const recountInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const [lotDetailOpen, setLotDetailOpen] = useState(false);
  const [lotDetailLoading, setLotDetailLoading] = useState(false);
  const [lotDetailError, setLotDetailError] = useState<string | null>(null);
  const [lotDetail, setLotDetail] = useState<ReceivingLotDetail | null>(null);
  const [manualDetailOpen, setManualDetailOpen] = useState(false);
  const [manualDetailLoading, setManualDetailLoading] = useState(false);
  const [manualDetailError, setManualDetailError] = useState<string | null>(null);
  const [manualDetail, setManualDetail] = useState<ManualMovementDocumentDetail | null>(null);
  const [printerSettingsOpen, setPrinterSettingsOpen] = useState(false);
  const [agentHealth, setAgentHealth] = useState<"checking" | "online" | "offline">(
    "checking"
  );
  const [probeStatus, setProbeStatus] = useState<AgentProbeStatus>("idle");
  const [probeMessage, setProbeMessage] = useState<string | null>(null);
  const recountDraftStateRef = useRef<{
    recountId: number | null;
    userId: number | null;
    countedDraft: Record<number, string>;
    freeCountDraft: Record<number, string>;
  }>({
    recountId: null,
    userId: null,
    countedDraft: {},
    freeCountDraft: {},
  });
  const recountDraftHydratingRef = useRef(false);
  const recountDraftAutosaveTimerRef = useRef<number | null>(null);
  const recountDraftLastSyncedRef = useRef<string>("");

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam && tabs.some((tab) => tab.key === tabParam)) {
      setActiveTab(tabParam as TabKey);
      setActiveTabReady(true);
      return;
    }

    const storedTab = window.localStorage.getItem(MOVEMENTS_ACTIVE_TAB_KEY);
    if (storedTab && tabs.some((tab) => tab.key === storedTab)) {
      setActiveTab(storedTab as TabKey);
      setActiveTabReady(true);
      return;
    }

    const draftLotIdRaw = window.localStorage.getItem(RECEIVING_DRAFT_LOT_KEY);
    const draftLotId = draftLotIdRaw ? Number(draftLotIdRaw) : NaN;
    if (Number.isFinite(draftLotId) && draftLotId > 0) {
      setActiveTab("movements");
    }
    setActiveTabReady(true);
  }, [searchParams]);

  useEffect(() => {
    if (!activeTabReady) return;
    window.localStorage.setItem(MOVEMENTS_ACTIVE_TAB_KEY, activeTab);
  }, [activeTab, activeTabReady]);

  useEffect(() => {
    setRecountFreeSearch("");
    setRecountFreeSearchApplied("");
    setRecountFreeSearchResults([]);
    setRecountFreeSearchError(null);
    if (!selectedRecountId || typeof window === "undefined") {
      recountDraftHydratingRef.current = false;
      setRecountCountedDraft({});
      setRecountFreeCountDraft({});
      recountDraftStateRef.current = {
        recountId: null,
        userId: user?.id ?? null,
        countedDraft: {},
        freeCountDraft: {},
      };
      return;
    }
    if (!token) return;

    let cancelled = false;
    const currentUserId = user?.id ?? null;
    recountDraftHydratingRef.current = true;
    const loadDraft = async () => {
      const localDraft = readPersistedRecountDraft(currentUserId, selectedRecountId);
      let backendDraft: InventoryRecountDraftState | null = null;
      try {
        backendDraft = await getInventoryRecountDraft(token, selectedRecountId);
      } catch {
        backendDraft = null;
      }

      if (cancelled) return;

      const normalizedBackend = normalizeDraftState(backendDraft);
      const normalizedLocal = normalizeDraftState(localDraft);
      const source =
        normalizedBackend.savedAtMs >= normalizedLocal.savedAtMs
          ? normalizedBackend
          : normalizedLocal;
      const nextCountedDraft = source.countedDraft;
      const nextFreeCountDraft = source.freeCountDraft;

      setRecountCountedDraft(nextCountedDraft);
      setRecountFreeCountDraft(nextFreeCountDraft);
      recountDraftStateRef.current = {
        recountId: selectedRecountId,
        userId: currentUserId,
        countedDraft: nextCountedDraft,
        freeCountDraft: nextFreeCountDraft,
      };

      if (normalizedBackend.savedAtMs >= normalizedLocal.savedAtMs) {
        persistRecountDraftLocal(
          currentUserId,
          selectedRecountId,
          nextCountedDraft,
          nextFreeCountDraft
        );
        recountDraftLastSyncedRef.current = serializeRecountDraftPayload(
          currentUserId,
          selectedRecountId,
          nextCountedDraft,
          nextFreeCountDraft
        );
      } else {
        recountDraftLastSyncedRef.current = "";
      }
      recountDraftHydratingRef.current = false;
    };

    void loadDraft();

    return () => {
      cancelled = true;
      recountDraftHydratingRef.current = false;
    };
  }, [selectedRecountId, token, user?.id]);

  useEffect(() => {
    recountDraftStateRef.current = {
      recountId: selectedRecountId,
      userId: user?.id ?? null,
      countedDraft: recountCountedDraft,
      freeCountDraft: recountFreeCountDraft,
    };
  }, [selectedRecountId, user?.id, recountCountedDraft, recountFreeCountDraft]);

  useEffect(() => {
    if (!selectedRecountId || typeof window === "undefined") return;
    const currentUserId = user?.id ?? null;
    if (recountDraftHydratingRef.current) return;
    persistRecountDraftLocal(currentUserId, selectedRecountId, recountCountedDraft, recountFreeCountDraft);

    if (!token || !currentUserId || !recountDetail) return;
    if (recountDetail.recount.id !== selectedRecountId) return;
    if (!["draft", "counting", "closed"].includes(recountDetail.recount.status)) return;

    const payloadKey = serializeRecountDraftPayload(
      currentUserId,
      selectedRecountId,
      recountCountedDraft,
      recountFreeCountDraft
    );
    if (payloadKey === recountDraftLastSyncedRef.current) return;

    if (recountDraftAutosaveTimerRef.current != null) {
      window.clearTimeout(recountDraftAutosaveTimerRef.current);
    }

    recountDraftAutosaveTimerRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          const saved = await upsertInventoryRecountDraft(token, selectedRecountId, {
            counted_draft: recountCountedDraft,
            free_count_draft: recountFreeCountDraft,
          });
          recountDraftLastSyncedRef.current = payloadKey;
          persistRecountDraftLocal(
            currentUserId,
            selectedRecountId,
            saved.counted_draft,
            saved.free_count_draft
          );
        } catch {
          // Keep the local backup; retry on the next change.
        }
      })();
    }, 1200);

    return () => {
      if (recountDraftAutosaveTimerRef.current != null) {
        window.clearTimeout(recountDraftAutosaveTimerRef.current);
        recountDraftAutosaveTimerRef.current = null;
      }
    };
  }, [selectedRecountId, recountCountedDraft, recountFreeCountDraft, token, user?.id, recountDetail]);

  useEffect(() => {
    const flushDraft = () => {
      const snapshot = recountDraftStateRef.current;
      if (!snapshot.recountId) return;
      persistRecountDraftLocal(
        snapshot.userId,
        snapshot.recountId,
        snapshot.countedDraft,
        snapshot.freeCountDraft
      );
    };
    window.addEventListener("pagehide", flushDraft);
    window.addEventListener("beforeunload", flushDraft);
    return () => {
      window.removeEventListener("pagehide", flushDraft);
      window.removeEventListener("beforeunload", flushDraft);
    };
  }, []);

  useEffect(() => {
    if (!activeTabReady) return;
    if (typeof window === "undefined") return;
    if (pathname !== "/dashboard/movements") return;
    if (searchParams.get("tab")) return;
    try {
      const raw = window.sessionStorage.getItem(ACTIVE_MOVEMENT_FORM_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { href?: string; savedAt?: number };
      if (!parsed?.href || typeof parsed.savedAt !== "number") {
        window.sessionStorage.removeItem(ACTIVE_MOVEMENT_FORM_KEY);
        return;
      }
      const isExpired = Date.now() - parsed.savedAt > ACTIVE_MOVEMENT_FORM_TTL_MS;
      const isFormRoute = parsed.href.startsWith("/dashboard/movements/form/");
      if (isExpired || !isFormRoute) {
        window.sessionStorage.removeItem(ACTIVE_MOVEMENT_FORM_KEY);
        return;
      }
      if (parsed.href.startsWith("/dashboard/movements/form/entrada_manual")) {
        const draftLotIdRaw = window.localStorage.getItem(RECEIVING_DRAFT_LOT_KEY);
        const draftLotId = draftLotIdRaw ? Number(draftLotIdRaw) : NaN;
        const hrefLotIdRaw = parsed.href.match(/[?&]lotId=(\d+)/)?.[1];
        const hrefLotId = hrefLotIdRaw ? Number(hrefLotIdRaw) : NaN;
        const hasOpenDraft =
          Number.isFinite(draftLotId) &&
          draftLotId > 0 &&
          Number.isFinite(hrefLotId) &&
          hrefLotId > 0 &&
          draftLotId === hrefLotId;
        if (!hasOpenDraft) {
          window.sessionStorage.removeItem(ACTIVE_MOVEMENT_FORM_KEY);
          return;
        }
      }
      router.replace(parsed.href, { scroll: false });
    } catch {
      window.sessionStorage.removeItem(ACTIVE_MOVEMENT_FORM_KEY);
    }
  }, [activeTabReady, pathname, router, searchParams]);

  useEffect(() => {
    if (!activeTabReady) return;
    if (typeof window !== "undefined" && !searchParams.get("tab")) {
      try {
        const raw = window.sessionStorage.getItem(ACTIVE_MOVEMENT_FORM_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as { href?: string; savedAt?: number };
          const isValidForm =
            typeof parsed?.href === "string" &&
            parsed.href.startsWith("/dashboard/movements/form/") &&
            typeof parsed.savedAt === "number" &&
            Date.now() - parsed.savedAt <= ACTIVE_MOVEMENT_FORM_TTL_MS;
          if (isValidForm) return;
        }
      } catch {
        window.sessionStorage.removeItem(ACTIVE_MOVEMENT_FORM_KEY);
      }
    }
    const currentTab = searchParams.get("tab");
    if (currentTab === activeTab) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", activeTab);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [activeTab, activeTabReady, pathname, router, searchParams]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(INVENTORY_FILTERS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as InventoryFiltersSnapshot;
      if (!parsed || typeof parsed !== "object") return;
      if (typeof parsed.savedAt !== "number") return;
      if (Date.now() - parsed.savedAt > INVENTORY_FILTERS_TTL_MS) {
        window.localStorage.removeItem(INVENTORY_FILTERS_KEY);
        return;
      }

      const allowedSort: InventorySort[] = [
        "name_asc",
        "stock_asc",
        "stock_desc",
        "sku_asc",
        "sku_desc",
        "cost_stock_asc",
        "cost_stock_desc",
        "price_stock_asc",
        "price_stock_desc",
      ];
      const allowedStock: InventoryStockFilter[] = ["all", "positive", "zero", "negative"];
      const allowedStatus: StatusFilter[] = ["all", "ok", "low", "critical", "negative"];
      const allowedPageSizes = [25, 50, 100, 200];

      setInventorySearch(typeof parsed.search === "string" ? parsed.search : "");
      setInventorySort(allowedSort.includes(parsed.sort) ? parsed.sort : "sku_asc");
      setInventoryStockFilter(allowedStock.includes(parsed.stock) ? parsed.stock : "all");
      setInventoryStatusFilter(allowedStatus.includes(parsed.status) ? parsed.status : "all");
      setInventoryGroupFilter(
        typeof parsed.group === "string" && parsed.group.trim() ? parsed.group : "all"
      );
      setInventoryPageSize(
        typeof parsed.pageSize === "number" && allowedPageSizes.includes(parsed.pageSize)
          ? parsed.pageSize
          : 100
      );
    } catch {
      window.localStorage.removeItem(INVENTORY_FILTERS_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const snapshot: InventoryFiltersSnapshot = {
      savedAt: Date.now(),
      search: inventorySearch,
      sort: inventorySort,
      stock: inventoryStockFilter,
      status: inventoryStatusFilter,
      group: inventoryGroupFilter,
      pageSize: inventoryPageSize,
    };
    window.localStorage.setItem(INVENTORY_FILTERS_KEY, JSON.stringify(snapshot));
  }, [
    inventorySearch,
    inventorySort,
    inventoryStockFilter,
    inventoryStatusFilter,
    inventoryGroupFilter,
    inventoryPageSize,
  ]);

  const clearToastTimers = () => {
    const timers = toastTimerRef.current;
    if (timers.hide) window.clearTimeout(timers.hide);
    if (timers.remove) window.clearTimeout(timers.remove);
  };

  const showToast = (message: string) => {
    clearToastTimers();
    setToastMessage(message);
    setToastVisible(false);
    window.requestAnimationFrame(() => setToastVisible(true));
    toastTimerRef.current.hide = window.setTimeout(() => setToastVisible(false), 2500);
    toastTimerRef.current.remove = window.setTimeout(() => {
      setToastMessage((current) => (current === message ? null : current));
    }, 2850);
  };

  useEffect(() => clearToastTimers, []);

  useEffect(() => {
    if (!movementsModalOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMovementsModalOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [movementsModalOpen]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setOverviewLoading(true);
    setOverviewError(null);
    fetchInventoryOverview(token)
      .then((data) => {
        if (!cancelled) setOverview(data);
      })
      .catch((err) => {
        if (!cancelled) setOverviewError(err instanceof Error ? err.message : "Error");
      })
      .finally(() => {
        if (!cancelled) setOverviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, refreshNonce]);

  useEffect(() => {
    if (!token || activeTab !== "summary") return;
    let cancelled = false;
    setRecentMovementsLoading(true);
    setRecentMovementsError(null);
    fetchInventoryMovements(token, { skip: 0, limit: 120 })
      .then((rows) => {
        if (cancelled) return;
        const normalized = [...rows].sort(
          (a, b) => parseMovementDateMs(b.created_at) - parseMovementDateMs(a.created_at)
        );
        setRecentMovements(normalized.slice(0, 8));
        setMovementsModalRows(normalized.slice(0, 100));
      })
      .catch((err) => {
        if (cancelled) return;
        setRecentMovements([]);
        setMovementsModalRows([]);
        setRecentMovementsError(err instanceof Error ? err.message : "Error");
      })
      .finally(() => {
        if (!cancelled) setRecentMovementsLoading(false);
      });

    setStockTrendLoading(true);
    setStockTrendError(null);
    fetchInventoryStockTrend(token, 7)
      .then((rows) => {
        if (!cancelled) setStockTrend(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        setStockTrend([]);
        setStockTrendError(err instanceof Error ? err.message : "Error");
      })
      .finally(() => {
        if (!cancelled) setStockTrendLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, activeTab, refreshNonce]);

  useEffect(() => {
    if (!token || activeTab !== "summary") return;
    let cancelled = false;
    const cache = latestEntriesCacheRef.current;
    if (cache.refreshNonce !== refreshNonce) {
      cache.refreshNonce = refreshNonce;
      cache.rows = {};
    }

    const cachedRows = cache.rows[latestEntriesFilter];
    if (cachedRows) {
      setLatestEntries(cachedRows);
      setLatestEntriesError(null);
      setLatestEntriesLoading(false);
      return;
    }

    setLatestEntriesLoading(true);
    setLatestEntriesError(null);
    fetchInventoryLatestEntries(token, {
      source: latestEntriesFilter,
      limit: 8,
    })
      .then((rows) => {
        if (cancelled) return;
        latestEntriesCacheRef.current.rows[latestEntriesFilter] = rows;
        setLatestEntries(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        setLatestEntries([]);
        setLatestEntriesError(err instanceof Error ? err.message : "Error");
      })
      .finally(() => {
        if (!cancelled) setLatestEntriesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, activeTab, latestEntriesFilter, refreshNonce]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchReceivingProductGroups(token)
      .then((rows) => {
        if (!cancelled) setGroupOptions(rows);
      })
      .catch(() => {
        if (!cancelled) setGroupOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    if (activeTab !== "inventory") return;
    let cancelled = false;
    setInventoryLoading(true);
    setInventoryError(null);

    const skip = Math.max(0, (inventoryPageNo - 1) * inventoryPageSize);
    fetchInventoryProducts(token, {
      skip,
      limit: inventoryPageSize,
      search: inventorySearch.trim() || undefined,
      group: inventoryGroupFilter !== "all" ? inventoryGroupFilter : undefined,
      stock: inventoryStockFilter,
      status: inventoryStatusFilter,
      sort: inventorySort,
    })
      .then((data) => {
        if (!cancelled) setInventoryPage(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setInventoryError(err instanceof Error ? err.message : "Error");
          setInventoryPage(null);
        }
      })
      .finally(() => {
        if (!cancelled) setInventoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    token,
    activeTab,
    inventoryPageNo,
    inventoryPageSize,
    inventorySearch,
    inventorySort,
    inventoryStockFilter,
    inventoryStatusFilter,
    inventoryGroupFilter,
    refreshNonce,
  ]);

  useEffect(() => {
    if (!token) return;
    if (activeTab !== "summary") return;
    let cancelled = false;

    fetchInventoryProducts(token, {
      skip: 0,
      limit: 1,
      sort: "sku_asc",
    })
      .then((data) => {
        if (cancelled) return;
        setSummaryInventoryTotals({
          totalCostValue: data.total_cost_value ?? 0,
          totalPriceValue: data.total_price_value ?? 0,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setSummaryInventoryTotals({ totalCostValue: 0, totalPriceValue: 0 });
      });

    return () => {
      cancelled = true;
    };
  }, [token, activeTab, refreshNonce]);

  useEffect(() => {
    if (!token || activeTab !== "receptions") return;
    let cancelled = false;
    setReceivingLoading(true);
    setReceivingError(null);
    const skip = Math.max(0, (receivingPage - 1) * receivingLimit);
    fetchReceivingDocuments(token, {
      skip,
      limit: receivingLimit,
      date_from: receivingDateFrom ? `${receivingDateFrom}T00:00:00` : undefined,
      date_to: receivingDateTo ? `${receivingDateTo}T23:59:59` : undefined,
    })
      .then((data) => {
        if (!cancelled) setReceivingDocs(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setReceivingError(err instanceof Error ? err.message : "Error");
          setReceivingDocs(null);
        }
      })
      .finally(() => {
        if (!cancelled) setReceivingLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, activeTab, receivingPage, receivingDateFrom, receivingDateTo, refreshNonce]);

  useEffect(() => {
    if (!token || activeTab !== "movements") return;
    let cancelled = false;
    setOpenReceivingLotsLoading(true);
    setClosedReceivingLotsLoading(true);
    setOpenReceivingLotsError(null);
    setClosedReceivingLotsError(null);
    Promise.all([
      fetchReceivingLots(token, { status: "open", skip: 0, limit: 30 }),
      fetchReceivingLots(token, { status: "closed", skip: 0, limit: 10 }),
      fetchManualMovementDocuments(token, { status: "open", skip: 0, limit: 30 }),
      fetchManualMovementDocuments(token, { status: "closed", skip: 0, limit: 10 }),
    ])
      .then(([openReceivingPage, closedReceivingPage, openManualPage, closedManualPage]) => {
        if (cancelled) return;
        setOpenReceivingLots(openReceivingPage.items);
        setClosedReceivingLots(closedReceivingPage.items);
        setOpenManualDocs(openManualPage.items);
        setClosedManualDocs(closedManualPage.items);
      })
      .catch((err) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Error";
          setOpenReceivingLots([]);
          setClosedReceivingLots([]);
          setOpenManualDocs([]);
          setClosedManualDocs([]);
          setOpenReceivingLotsError(message);
          setClosedReceivingLotsError(message);
        }
      })
      .finally(() => {
        if (cancelled) return;
        setOpenReceivingLotsLoading(false);
        setClosedReceivingLotsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, activeTab, refreshNonce]);

  useEffect(() => {
    if (!token || activeTab !== "recounts") return;
    let cancelled = false;
    setRecountDocsLoading(true);
    setRecountDocsError(null);
    Promise.all([
      listInventoryRecounts(token, { status: "draft", skip: 0, limit: 50 }),
      listInventoryRecounts(token, { status: "counting", skip: 0, limit: 50 }),
      listInventoryRecounts(token, { status: "closed", skip: 0, limit: 50 }),
      listInventoryRecounts(token, { status: "applied", skip: 0, limit: 50 }),
    ])
      .then(([draftPage, countingPage, closedPage, appliedPage]) => {
        if (cancelled) return;
        const openCombined = [...draftPage.items, ...countingPage.items, ...closedPage.items].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        const closedCombined = [...appliedPage.items].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setOpenRecountDocs(openCombined);
        setClosedRecountDocs(closedCombined);
        const allDocs = [...openCombined, ...closedCombined];
        if (allDocs.length === 0) return;
        if (!selectedRecountId) {
          setSelectedRecountId(allDocs[0].id);
          return;
        }
        const selectedStillVisible = allDocs.some((doc) => doc.id === selectedRecountId);
        if (!selectedStillVisible) setSelectedRecountId(allDocs[0].id);
      })
      .catch((err) => {
        if (!cancelled) {
          setOpenRecountDocs([]);
          setClosedRecountDocs([]);
          setRecountDocsError(err instanceof Error ? err.message : "Error");
        }
      })
      .finally(() => {
        if (!cancelled) setRecountDocsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, activeTab, refreshNonce, selectedRecountId]);

  useEffect(() => {
    if (!token || activeTab !== "recounts" || !selectedRecountId) return;
    let cancelled = false;
    setRecountDetailLoading(true);
    setRecountDetailError(null);
    const isDifferencesView = recountLineViewMode === "differences";
    const run = async () => {
      try {
        const pageLimit = isDifferencesView ? 500 : 1000;
        let skipCursor = 0;
        let mergedDetail: InventoryRecountDetail | null = null;
        const allLines: InventoryRecountDetail["lines"] = [];

        while (!cancelled) {
          const page = await getInventoryRecountDetail(token, selectedRecountId, {
            q: recountSearchApplied.trim() || undefined,
            counted_only: isDifferencesView,
            skip: skipCursor,
            limit: pageLimit,
          });
          if (!mergedDetail) {
            mergedDetail = { ...page, lines: [] };
          }
          allLines.push(...page.lines);
          if (page.lines.length < pageLimit) break;
          skipCursor += pageLimit;
        }

        if (cancelled || !mergedDetail) return;
        mergedDetail.lines = allLines;
        setRecountDetail(mergedDetail);
        setRecountCountedDraft((prev) => {
          const next = { ...prev };
          for (const line of mergedDetail.lines) {
            if (!(line.product_id in next)) {
              next[line.product_id] = line.counted_qty != null ? String(line.counted_qty) : "";
            }
          }
          return next;
        });
      } catch (err) {
        if (!cancelled) {
          setRecountDetail(null);
          setRecountDetailError(err instanceof Error ? err.message : "Error");
        }
      } finally {
        if (!cancelled) setRecountDetailLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    token,
    activeTab,
    selectedRecountId,
    recountSearchApplied,
    recountLineViewMode,
    refreshNonce,
  ]);

  useEffect(() => {
    if (!token || activeTab !== "recounts" || recountView !== "document" || !selectedRecountId || !recountDetail) {
      return;
    }
    if (recountDetail.recount.scope_type !== "free") return;
    if (!["draft", "counting"].includes(recountDetail.recount.status)) return;
    const query = recountFreeSearchApplied.trim();
    if (query.length < 2) {
      setRecountFreeSearchResults([]);
      setRecountFreeSearchError(null);
      return;
    }
    let cancelled = false;
    setRecountFreeSearchLoading(true);
    setRecountFreeSearchError(null);
    fetchInventoryProducts(token, {
      search: query,
      skip: 0,
      limit: 20,
      stock: "all",
      status: "all",
      sort: "name_asc",
    })
      .then((page) => {
        if (cancelled) return;
        setRecountFreeSearchResults(page.items);
      })
      .catch((err) => {
        if (!cancelled) {
          setRecountFreeSearchResults([]);
          setRecountFreeSearchError(err instanceof Error ? err.message : "No se pudo buscar productos.");
        }
      })
      .finally(() => {
        if (!cancelled) setRecountFreeSearchLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    token,
    activeTab,
    recountView,
    selectedRecountId,
    recountDetail,
    recountFreeSearchApplied,
  ]);

  useEffect(() => {
    setInventoryPageNo(1);
  }, [inventorySearch, inventorySort, inventoryStockFilter, inventoryStatusFilter, inventoryGroupFilter, inventoryPageSize]);

  const inventoryItemsRaw = useMemo(
    () => inventoryPage?.items ?? [],
    [inventoryPage?.items]
  );
  const inventoryItems = inventoryItemsRaw;

  const inventoryTotal = inventoryPage?.total ?? 0;
  const inventoryPages = Math.max(1, Math.ceil(inventoryTotal / inventoryPageSize));

  const summaryCards = useMemo(() => {
    const summary = overview?.summary;
    const totalQty = summary?.total_qty ?? 0;
    const totalCostValue = summaryInventoryTotals.totalCostValue;
    const totalPriceValue = summaryInventoryTotals.totalPriceValue;
    const lowStockCount = summary?.low_stock_count ?? 0;
    const criticalCount = summary?.critical_count ?? 0;
    const recentMovementsCount = overview?.recent_movements?.length ?? 0;
    return [
      {
        key: "stock_total",
        title: "Stock total",
        value: `${formatQty(totalQty)} uds`,
        isNegative: totalQty < 0,
      },
      {
        key: "inventory_value",
        title: showInventorySaleValue ? "Valor inventario (venta)" : "Valor inventario (costo)",
        value: formatMoney(showInventorySaleValue ? totalPriceValue : totalCostValue),
        isNegative: showInventorySaleValue ? totalPriceValue < 0 : totalCostValue < 0,
      },
      {
        key: "low_stock",
        title: "SKUs bajo mínimo",
        value: `${lowStockCount}`,
        isNegative: lowStockCount < 0,
      },
      {
        key: "critical",
        title: "SKUs críticos",
        value: `${criticalCount}`,
        isNegative: criticalCount < 0,
      },
      {
        key: "movements_24h",
        title: "Movimientos 24h",
        value: `${recentMovementsCount}`,
        isNegative: recentMovementsCount < 0,
      },
    ];
  }, [overview, showInventorySaleValue, summaryInventoryTotals]);

  const latestEntriesVisible = useMemo(() => {
    const filtered =
      latestEntriesFilter === "all"
        ? latestEntries
        : latestEntries.filter((row) => row.source === latestEntriesFilter);
    return filtered.slice(0, 8);
  }, [latestEntries, latestEntriesFilter]);

  const recountDiffSummary = useMemo(() => {
    const lines = recountDetail?.lines ?? [];
    const diffLines = lines
      .map((line) => {
        const counted = line.counted_qty;
        if (counted == null) return null;
        const diff = counted - line.system_qty;
        if (Math.abs(diff) < 0.000001) return null;
        return { line, diff };
      })
      .filter((item): item is { line: (typeof lines)[number]; diff: number } => item !== null);

    const plusQty = diffLines.reduce((acc, item) => acc + (item.diff > 0 ? item.diff : 0), 0);
    const minusQty = diffLines.reduce((acc, item) => acc + (item.diff < 0 ? Math.abs(item.diff) : 0), 0);
    const netQty = plusQty - minusQty;

    return {
      affectedLines: diffLines.length,
      plusQty,
      minusQty,
      netQty,
    };
  }, [recountDetail]);

  const recountLinesVisible = useMemo(() => {
    const lines = recountDetail?.lines ?? [];
    if (recountLineViewMode === "counted") return lines;
    return lines.filter((line) => {
      if (line.counted_qty == null) return false;
      return Math.abs(line.counted_qty - line.system_qty) >= 0.000001;
    });
  }, [recountDetail, recountLineViewMode]);

  const openDocsSorted = useMemo(() => {
    const receiving = openReceivingLots.map((lot) => ({ type: "receiving" as const, lot }));
    const manual = openManualDocs.map((doc) => ({ type: "manual" as const, doc }));
    return [...receiving, ...manual].sort((a, b) => {
      const aTime =
        a.type === "receiving"
          ? new Date(a.lot.created_at).getTime()
          : new Date(a.doc.created_at).getTime();
      const bTime =
        b.type === "receiving"
          ? new Date(b.lot.created_at).getTime()
          : new Date(b.doc.created_at).getTime();
      return bTime - aTime;
    });
  }, [openReceivingLots, openManualDocs]);

  const closedDocsSorted = useMemo(() => {
    const receiving = closedReceivingLots.map((lot) => ({ type: "receiving" as const, lot }));
    const manual = closedManualDocs.map((doc) => ({ type: "manual" as const, doc }));
    return [...receiving, ...manual].sort((a, b) => {
      const aTime =
        a.type === "receiving"
          ? new Date(a.lot.closed_at || a.lot.updated_at).getTime()
          : new Date(a.doc.closed_at || a.doc.updated_at).getTime();
      const bTime =
        b.type === "receiving"
          ? new Date(b.lot.closed_at || b.lot.updated_at).getTime()
          : new Date(b.doc.closed_at || b.doc.updated_at).getTime();
      return bTime - aTime;
    });
  }, [closedReceivingLots, closedManualDocs]);

  const isRecountDocumentFocused = activeTab === "recounts" && recountView === "document";
  const recountCreationBlocked = openRecountDocs.length >= 2;
  const openRecountDocsVisible = useMemo(
    () => openRecountDocs.slice(0, CLOSED_DOCS_PANEL_LIMIT),
    [openRecountDocs]
  );
  const closedRecountDocsVisible = useMemo(
    () => closedRecountDocs.slice(0, CLOSED_DOCS_PANEL_LIMIT),
    [closedRecountDocs]
  );

  const closedDocsVisible = useMemo(
    () => closedDocsSorted.slice(0, CLOSED_DOCS_PANEL_LIMIT),
    [closedDocsSorted]
  );

  const hasInventoryFilteredScope = useMemo(
    () =>
      inventorySearch.trim().length > 0 ||
      inventoryGroupFilter !== "all" ||
      inventoryStockFilter !== "all" ||
      inventoryStatusFilter !== "all",
    [inventorySearch, inventoryGroupFilter, inventoryStockFilter, inventoryStatusFilter]
  );

  const openInventoryExportModal = () => {
    setInventoryExportScope(hasInventoryFilteredScope ? "current" : "all");
    setInventoryExportFormat("xlsx");
    setInventoryExportModalOpen(true);
  };

  const handleExport = async () => {
    if (!token || inventoryExporting) return;
    const currentScopeEnabled = hasInventoryFilteredScope;
    const scope = !currentScopeEnabled && inventoryExportScope === "current" ? "all" : inventoryExportScope;
    const options =
      scope === "current"
        ? {
            search: inventorySearch.trim() || undefined,
            group: inventoryGroupFilter !== "all" ? inventoryGroupFilter : undefined,
            stock: inventoryStockFilter,
            status: inventoryStatusFilter,
            sort: inventorySort,
          }
        : {
            sort: inventorySort,
          };
    try {
      setInventoryExporting(true);
      const blob =
        inventoryExportFormat === "pdf"
          ? await exportInventoryProductsPdf(token, options)
          : await exportInventoryProducts(token, options);
      const ext = inventoryExportFormat === "pdf" ? "pdf" : "xlsx";
      const fileScope = scope === "current" ? "busqueda" : "completo";
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `inventario_${fileScope}.${ext}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setInventoryExportModalOpen(false);
      showToast(`Exportación ${inventoryExportFormat.toUpperCase()} generada.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "No se pudo exportar inventario.");
    } finally {
      setInventoryExporting(false);
    }
  };

  const openHistory = async (productId: number) => {
    if (!token) return;
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const data = await fetchInventoryProductHistory(token, productId, { skip: 0, limit: 100 });
      setHistoryData(data);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : "Error");
      setHistoryData(null);
    } finally {
      setHistoryLoading(false);
    }
  };

  const submitCreateRecount = async () => {
    if (!token) return;
    if (recountCreationBlocked) {
      setRecountFeedback(
        "Límite alcanzado: máximo 2 recuentos en curso/pedientes por empresa. Aplica o cancela uno antes de crear otro."
      );
      return;
    }
    setRecountFeedback(null);
    if (newRecountScopeType === "group" && !newRecountScopeValue.trim()) {
      setRecountFeedback("Para alcance por grupo, indica la categoría.");
      return;
    }
    setCreatingRecount(true);
    try {
      const created = await createInventoryRecount(token, {
        source: "web",
        title: newRecountTitle.trim() || undefined,
        scope_type: newRecountScopeType,
        scope_value: newRecountScopeType === "group" ? newRecountScopeValue.trim() : undefined,
        count_mode: newRecountMode,
        notes: newRecountNotes.trim() || undefined,
      });
      setNewRecountTitle("");
      setNewRecountScopeType("all");
      setNewRecountScopeValue("");
      setRecountFreeSearch("");
      setRecountFreeSearchApplied("");
      setRecountFreeSearchResults([]);
      setRecountFreeCountDraft({});
      setNewRecountMode("blind");
      setNewRecountNotes("");
      setSelectedRecountId(created.id);
      setRecountView("document");
      setRecountFeedback(`Recuento ${created.code} creado y abierto para captura en web.`);
      setRefreshNonce((prev) => prev + 1);
    } catch (err) {
      setRecountFeedback(err instanceof Error ? err.message : "No se pudo crear el recuento.");
    } finally {
      setCreatingRecount(false);
    }
  };

  const submitRecountLine = async (
    productId: number,
    draftOverride?: string | null
  ): Promise<boolean> => {
    if (!token || !selectedRecountId) return false;
    if (
      !recountDetail ||
      recountDetail.recount.status === "applied" ||
      recountDetail.recount.status === "cancelled"
    ) {
      setRecountFeedback("Este recuento ya no acepta edición.");
      return false;
    }
    const draft = draftOverride ?? recountCountedDraft[productId];
    const counted = parseRecountCountDraft(draft);
    if (counted == null) {
      setRecountFeedback("La cantidad contada debe ser un número entero (0 o mayor).");
      return false;
    }
    setRecountFeedback(null);
    setRecountLineSavingId(productId);
    try {
      const savedLine = await upsertInventoryRecountLine(token, selectedRecountId, {
        product_id: productId,
        counted_qty: counted,
      });
      const savedCountText = String(savedLine.counted_qty ?? counted);
      setRecountDetail((prev) => {
        if (!prev) return prev;
        const updatedLine = {
          id: savedLine.id,
          product_id: savedLine.product_id,
          product_name: savedLine.product_name,
          sku: savedLine.sku,
          barcode: savedLine.barcode,
          group_name: savedLine.group_name,
          system_qty: Number(savedLine.system_qty ?? 0),
          counted_qty: savedLine.counted_qty ?? counted,
          diff_qty:
            savedLine.counted_qty != null
              ? Number(savedLine.counted_qty) - Number(savedLine.system_qty ?? 0)
              : null,
          notes: savedLine.notes,
          counted_at: savedLine.counted_at,
          counted_by_user_id: savedLine.counted_by_user_id,
        };
        const existingIndex = prev.lines.findIndex((line) => line.product_id === productId);
        const nextLines = [...prev.lines];
        if (existingIndex >= 0) {
          nextLines[existingIndex] = { ...nextLines[existingIndex], ...updatedLine };
        } else {
          nextLines.unshift(updatedLine);
        }
        const countedLines = nextLines.filter((line) => line.counted_qty != null);
        const differenceLines = countedLines.filter(
          (line) => Math.abs((line.counted_qty ?? 0) - line.system_qty) >= 0.000001
        );
        const totalCountedQty = countedLines.reduce(
          (acc, line) => acc + Number(line.counted_qty ?? 0),
          0
        );
        const totalDiffQty = countedLines.reduce(
          (acc, line) => acc + (Number(line.counted_qty ?? 0) - Number(line.system_qty)),
          0
        );
        const totalLines = nextLines.length;
        return {
          ...prev,
          recount: {
            ...prev.recount,
            status: prev.recount.status === "draft" ? "counting" : prev.recount.status,
            summary: {
              ...prev.recount.summary,
              counted_lines: countedLines.length,
              pending_lines: Math.max(totalLines - countedLines.length, 0),
              difference_lines: differenceLines.length,
              total_counted_qty: totalCountedQty,
              total_diff_qty: totalDiffQty,
            },
          },
          lines: nextLines,
        };
      });
      setRecountCountedDraft((prevDrafts) => ({
        ...prevDrafts,
        [productId]: savedCountText,
      }));
      return true;
    } catch (err) {
      setRecountFeedback(err instanceof Error ? err.message : "No se pudo guardar la línea.");
      return false;
    } finally {
      setRecountLineSavingId(null);
    }
  };

  const addFreeRecountProduct = async (productId: number) => {
    const draft = recountFreeCountDraft[productId];
    const counted = parseRecountCountDraft(draft);
    if (counted == null) {
      setRecountFeedback("Indica cantidad contada (0 o mayor) para agregar al recuento.");
      return;
    }
    const saved = await submitRecountLine(productId, String(counted));
    if (!saved) return;
    setRecountFreeCountDraft((prev) => ({ ...prev, [productId]: "" }));
    setRecountFeedback("Producto agregado al recuento.");
  };

  useEffect(() => {
    if (!selectedRecountId || !recountDetail) return;
    if (recountDetail.recount.id !== selectedRecountId) return;
    if (!["applied", "cancelled"].includes(recountDetail.recount.status)) return;
    if (typeof window === "undefined") return;
    if (!token) return;
    if (recountDraftAutosaveTimerRef.current != null) {
      window.clearTimeout(recountDraftAutosaveTimerRef.current);
      recountDraftAutosaveTimerRef.current = null;
    }
    void deleteInventoryRecountDraft(token, selectedRecountId).catch(() => undefined);
    clearPersistedRecountDraft(user?.id ?? null, selectedRecountId);
    setRecountCountedDraft({});
    setRecountFreeCountDraft({});
    recountDraftLastSyncedRef.current = "";
  }, [selectedRecountId, recountDetail, token, user?.id]);

  const printSelectedRecountSheet = async (
    mode: "differences" | "counted" | "all",
    output: "form" | "report"
  ) => {
    if (!token || !selectedRecountId || !recountDetail) return;
    setRecountFeedback(null);
    try {
      const limit = 1000;
      let skip = 0;
      const lines: InventoryRecountDetail["lines"] = [];
      while (true) {
        const page = await getInventoryRecountDetail(token, selectedRecountId, {
          skip,
          limit,
          counted_only: output === "form" ? false : mode !== "all",
        });
        lines.push(...page.lines);
        if (page.lines.length < limit) break;
        skip += limit;
      }

      const printableLines =
        output === "form"
          ? lines
          : mode === "differences"
          ? lines.filter(
              (line) =>
                line.counted_qty != null &&
                Math.abs((line.counted_qty ?? 0) - line.system_qty) >= 0.000001
            )
          : lines;
      if (printableLines.length === 0) {
        setRecountFeedback("No hay líneas para imprimir con el filtro seleccionado.");
        return;
      }

      const title = recountDetail.recount.title || "Recuento";
      const creatorName = recountDetail.recount.created_by_user_name || "-";
      const scopeLabel =
        recountDetail.recount.scope_type === "group"
          ? `Categoría: ${recountDetail.recount.scope_value || "-"}`
          : recountDetail.recount.scope_type === "free"
            ? "Selección libre de productos"
            : "Inventario completo";
      const htmlRows = printableLines
        .map((line) => {
          const diff =
            line.counted_qty == null ? null : Number(line.counted_qty) - Number(line.system_qty);
          if (output === "form") {
            return `
          <tr>
            <td>${escapeHtml(line.product_name)}</td>
            <td>${escapeHtml(line.sku || "-")}</td>
            <td>${escapeHtml(line.barcode || "-")}</td>
            <td style="text-align:right">${formatQty(line.system_qty)}</td>
            <td style="text-align:center"></td>
            <td style="text-align:center"></td>
          </tr>`;
          }
          return `
          <tr>
            <td>${escapeHtml(line.product_name)}</td>
            <td>${escapeHtml(line.sku || "-")}</td>
            <td>${escapeHtml(line.barcode || "-")}</td>
            <td style="text-align:right">${formatQty(line.system_qty)}</td>
            <td style="text-align:right">${line.counted_qty == null ? "-" : formatQty(line.counted_qty)}</td>
            <td style="text-align:right">${diff == null ? "-" : formatQty(diff)}</td>
          </tr>`;
        })
        .join("");

      const printHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${output === "form" ? "Formulario" : "Reporte"} ${escapeHtml(recountDetail.recount.code)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color:#0f172a; }
    h1 { font-size: 22px; margin: 0 0 8px; }
    .meta { font-size: 12px; color:#334155; margin-bottom: 12px; }
    table { width:100%; border-collapse:collapse; font-size:12px; }
    th, td { border:1px solid #cbd5e1; padding:6px; vertical-align:top; }
    th { background:#f8fafc; text-align:left; }
    .sign { margin-top:14px; font-size:12px; display:flex; gap:20px; }
    .line { border-top:1px solid #334155; width:220px; margin-top:18px; padding-top:4px; }
    @media print { body { margin: 10mm; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(recountDetail.recount.code)} · ${escapeHtml(title)} · ${escapeHtml(creatorName)}</h1>
  <div class="meta">
    ${escapeHtml(scopeLabel)} · Modo: ${recountDetail.recount.count_mode === "blind" ? "Ciego" : "Visible"} ·
    Tipo: ${escapeHtml(output === "form" ? "Formulario de conteo" : "Reporte de recuento")} ·
    Filtro: ${escapeHtml(
      mode === "all"
        ? "Todo el universo"
        : mode === "counted"
          ? "Solo líneas contadas"
          : "Solo diferencias"
    )} ·
    Fecha: ${escapeHtml(formatDate(new Date().toISOString()))}
  </div>
  <table>
    <thead>
      <tr>
        <th>Producto</th>
        <th>SKU</th>
        <th>Código de barras</th>
        <th>Sistema</th>
        <th>${output === "form" ? "Conteo físico" : "Contado"}</th>
        <th>${output === "form" ? "Observación" : "Dif."}</th>
      </tr>
    </thead>
    <tbody>${htmlRows}</tbody>
  </table>
  <div class="sign">
    <div><div class="line">Responsable de conteo</div></div>
    <div><div class="line">Verificación</div></div>
  </div>
</body>
</html>`;

      const frame = document.createElement("iframe");
      frame.setAttribute("aria-hidden", "true");
      frame.style.position = "fixed";
      frame.style.right = "0";
      frame.style.bottom = "0";
      frame.style.width = "0";
      frame.style.height = "0";
      frame.style.border = "0";
      frame.style.opacity = "0";
      document.body.appendChild(frame);

      const cleanup = () => {
        window.setTimeout(() => {
          frame.remove();
        }, 300);
      };

      const frameWindow = frame.contentWindow;
      const frameDoc = frame.contentDocument;
      if (!frameWindow || !frameDoc) {
        frame.remove();
        setRecountFeedback("No se pudo preparar la impresión en esta sesión.");
        return;
      }

      frameDoc.open();
      frameDoc.write(printHtml);
      frameDoc.close();

      window.setTimeout(() => {
        try {
          frameWindow.focus();
          frameWindow.print();
        } finally {
          cleanup();
        }
      }, 50);
    } catch (err) {
      setRecountFeedback(err instanceof Error ? err.message : "No se pudo generar la impresión.");
    }
  };

  const closeSelectedRecount = async () => {
    if (!token || !selectedRecountId) return;
    setRecountActionLoading("close");
    setRecountFeedback(null);
    try {
      await closeInventoryRecount(token, selectedRecountId);
      setRecountFeedback("Recuento cerrado. Revisa diferencias y aplica ajustes.");
      setRefreshNonce((prev) => prev + 1);
    } catch (err) {
      setRecountFeedback(err instanceof Error ? err.message : "No se pudo cerrar el recuento.");
    } finally {
      setRecountActionLoading(null);
    }
  };

  const closeRecountFromList = async (doc: InventoryRecountRecord) => {
    if (!token) return;
    if (!["draft", "counting"].includes(doc.status)) return;
    setClosingRecountId(doc.id);
    setRecountFeedback(null);
    try {
      await closeInventoryRecount(token, doc.id);
      setRecountFeedback(`Recuento ${doc.code} cerrado. Revisa y aplica ajustes.`);
      setRefreshNonce((prev) => prev + 1);
    } catch (err) {
      setRecountFeedback(err instanceof Error ? err.message : "No se pudo cerrar el recuento.");
    } finally {
      setClosingRecountId(null);
    }
  };

  const applySelectedRecount = async () => {
    if (!token || !selectedRecountId) return;
    if (!recountDetail || recountDetail.recount.status !== "closed") {
      setRecountFeedback("Solo puedes aplicar ajustes cuando el recuento está cerrado.");
      return;
    }
    const confirmed = window.confirm(
      "¿Aplicar este recuento? Se generarán ajustes de inventario por diferencias."
    );
    if (!confirmed) return;
    setRecountActionLoading("apply");
    setRecountFeedback(null);
    try {
      await applyInventoryRecount(token, selectedRecountId);
      setRecountFeedback("Recuento aplicado con éxito.");
      setRefreshNonce((prev) => prev + 1);
    } catch (err) {
      setRecountFeedback(err instanceof Error ? err.message : "No se pudo aplicar el recuento.");
    } finally {
      setRecountActionLoading(null);
    }
  };

  const applyRecountFromList = async (doc: InventoryRecountRecord) => {
    if (!token) return;
    if (doc.status !== "closed") {
      setRecountFeedback("Solo puedes aplicar ajustes cuando el recuento está cerrado.");
      return;
    }
    const confirmed = window.confirm(
      `¿Aplicar ${doc.code}? Se generarán ajustes de inventario por diferencias.`
    );
    if (!confirmed) return;
    setApplyingRecountId(doc.id);
    setRecountFeedback(null);
    try {
      await applyInventoryRecount(token, doc.id);
      setRecountFeedback(`Recuento ${doc.code} aplicado con éxito.`);
      setRefreshNonce((prev) => prev + 1);
    } catch (err) {
      setRecountFeedback(err instanceof Error ? err.message : "No se pudo aplicar el recuento.");
    } finally {
      setApplyingRecountId(null);
    }
  };

  const cancelOpenRecountFromList = async (doc: InventoryRecountRecord) => {
    if (!token) return;
    const confirmed = window.confirm(
      `¿Cancelar ${doc.code}? Esta acción dejará el documento en estado cancelado.`
    );
    if (!confirmed) return;
    setCancellingRecountId(doc.id);
    setRecountFeedback(null);
    try {
      await cancelInventoryRecount(token, doc.id);
      if (selectedRecountId === doc.id && recountView === "document") {
        setRecountView("home");
      }
      setRefreshNonce((prev) => prev + 1);
    } catch (err) {
      setRecountFeedback(err instanceof Error ? err.message : "No se pudo cancelar el recuento.");
    } finally {
      setCancellingRecountId(null);
    }
  };

  const openLotDetail = async (lotId: number) => {
    if (!token) return;
    setLotDetailOpen(true);
    setLotDetailLoading(true);
    setLotDetailError(null);
    try {
      const detail = await fetchReceivingLotDetail(token, lotId);
      setLotDetail(detail);
    } catch (err) {
      setLotDetailError(err instanceof Error ? err.message : "Error");
      setLotDetail(null);
    } finally {
      setLotDetailLoading(false);
    }
  };

  const openManualDetail = async (documentId: number) => {
    if (!token) return;
    setManualDetailOpen(true);
    setManualDetailLoading(true);
    setManualDetailError(null);
    try {
      const detail = await fetchManualMovementDocumentDetail(token, documentId);
      setManualDetail(detail);
    } catch (err) {
      setManualDetailError(err instanceof Error ? err.message : "Error");
      setManualDetail(null);
    } finally {
      setManualDetailLoading(false);
    }
  };

  const handleCancelOpenReception = async (lotId: number, lotNumber: string) => {
    if (!token) return;
    const confirmed = window.confirm(
      `¿Cancelar la recepción ${lotNumber}? Esta acción dejará el documento cancelado.`
    );
    if (!confirmed) return;

    setCancellingLotId(lotId);
    try {
      await cancelReceivingLot(token, lotId);
      setRefreshNonce((prev) => prev + 1);
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo cancelar la recepción");
    } finally {
      setCancellingLotId(null);
    }
  };

  const handleDownloadSupport = async (lotId: number, lotNumber: string) => {
    if (!token) return;
    try {
      const blob = await downloadReceivingSupportFile(token, lotId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `soporte_${lotNumber}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("No se pudo descargar soporte", err);
    }
  };

  const checkAgentHealth = async () => {
    if (typeof window === "undefined") return;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 2000);
    try {
      const res = await fetch(LABEL_AGENT_HEALTH_URL, {
        method: "GET",
        signal: controller.signal,
      });
      setAgentHealth(res.ok ? "online" : "offline");
    } catch {
      setAgentHealth("offline");
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  useEffect(() => {
    void checkAgentHealth();
    if (typeof document === "undefined") return;
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      void checkAgentHealth();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void checkAgentHealth();
    }, 30000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!printerSettingsOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPrinterSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [printerSettingsOpen]);

  const handleOpenAgentUi = () => {
    window.open(LABEL_AGENT_UI_URL, "_blank", "noopener,noreferrer");
  };

  const printLabelDirect = async (
    targetUrl: string,
    payload: LabelPrintPayload | LabelPrintPayload[]
  ) => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Array.isArray(payload) ? payload : [payload]),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Error ${res.status}`);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error("Tiempo de espera agotado (8s).");
      }
      if (err instanceof TypeError) {
        throw new Error("No se pudo conectar a la impresora. Revisa la URL o red.");
      }
      throw err;
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  const handleProbePrinter = async () => {
    try {
      setProbeStatus("printing");
      setProbeMessage(null);
      await printLabelDirect(LABEL_AGENT_DEFAULT_PRINT_URL, TEST_LABEL_PAYLOAD);
      setProbeStatus("success");
      setProbeMessage("Impresion de prueba enviada.");
    } catch (err) {
      setProbeStatus("error");
      setProbeMessage(
        err instanceof Error ? err.message : "No pudimos enviar la impresion de prueba."
      );
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[84rem] min-w-0 flex-col gap-4 px-20 xl:px-24">
      <section className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-[1.55rem] font-semibold leading-none text-slate-900">Movimientos</h1>
            <p className="text-xs leading-none text-slate-600">Control y trazabilidad de inventario.</p>
          </div>
          {isRecountDocumentFocused ? (
            <button
              onClick={() => setRecountView("home")}
              className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-100"
            >
              Volver a recuentos
            </button>
          ) : null}
        </div>
      </section>

      {!isRecountDocumentFocused ? (
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  aria-current={activeTab === tab.key ? "page" : undefined}
                  className={`rounded-xl px-3 py-1.5 text-[13px] font-medium transition ${
                    activeTab === tab.key
                      ? "bg-slate-900 text-white shadow-sm"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {activeTab === "movements" ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700">
                  <span className="font-semibold">Agente:</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      agentHealth === "online"
                        ? "bg-emerald-100 text-emerald-700"
                        : agentHealth === "offline"
                        ? "bg-rose-100 text-rose-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {agentHealth === "online"
                      ? "online"
                      : agentHealth === "offline"
                      ? "offline"
                      : "verificando"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setPrinterSettingsOpen(true)}
                  className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700"
                >
                  Configuración impresora
                </button>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {activeTab === "summary" ? (
        <section className="min-w-0 space-y-3.5">
          <div className="grid min-w-0 gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
            {summaryCards.map((card) => {
              const content = (
                <>
                  <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{card.title}</p>
                  <p
                    className={`mt-1.5 truncate text-[17px] font-semibold ${
                      card.isNegative ? "text-rose-700" : "text-slate-900"
                    }`}
                    title={card.value}
                  >
                    {card.value}
                  </p>
                </>
              );

              if (card.key === "inventory_value") {
                return (
                  <button
                    key={card.key}
                    type="button"
                    onClick={() => setShowInventorySaleValue((current) => !current)}
                    aria-label={`Alternar valor inventario a ${
                      showInventorySaleValue ? "costo" : "venta"
                    }`}
                    className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50/40"
                  >
                    {content}
                  </button>
                );
              }

              return (
                <div
                  key={card.key}
                  className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                >
                  {content}
                </div>
              );
            })}
          </div>

          <div className="grid min-w-0 gap-3.5 lg:grid-cols-2">
            <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-900">Movimientos recientes</h2>
                <button
                  type="button"
                  onClick={() => setMovementsModalOpen(true)}
                  className="cursor-pointer text-xs font-medium text-emerald-700 underline-offset-2 hover:text-emerald-800 hover:underline"
                >
                  Ver movimientos
                </button>
              </div>
              <div className="mt-3 space-y-2">
                {overviewLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <div
                        key={`mv-skeleton-${index}`}
                        className="h-16 animate-pulse rounded-lg border border-slate-200 bg-slate-100"
                      />
                    ))}
                  </div>
                ) : recentMovementsLoading ? (
                  <p className="text-sm text-slate-500">Cargando movimientos recientes...</p>
                ) : recentMovementsError ? (
                  <p className="text-sm text-rose-600">{recentMovementsError}</p>
                ) : recentMovements.length === 0 ? (
                  <p className="text-sm text-slate-500">Sin movimientos recientes.</p>
                ) : (
                  recentMovements.map((row) => (
                    <div
                      key={row.id}
                      title={`${row.product_name} · SKU: ${row.sku || "-"} · ${
                        reasonLabel[row.reason as InventoryMovementReason] ?? row.reason
                      }${row.reason === "sale" && row.sale_pos_name ? ` · POS: ${row.sale_pos_name}` : ""}${
                        row.reason === "sale" && row.sale_seller_name
                          ? ` · Vendedor: ${row.sale_seller_name}`
                          : ""
                      } · ${formatDate(row.created_at)}`}
                      className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-semibold leading-4 text-slate-900" title={row.product_name}>
                          {row.product_name}
                        </p>
                        <p
                          className="truncate whitespace-nowrap text-[11px] leading-4 text-slate-500"
                          title={`SKU: ${row.sku || "-"} · ${
                            reasonLabel[row.reason as InventoryMovementReason] ?? row.reason
                          }${row.reason === "sale" && row.sale_pos_name ? ` · POS: ${row.sale_pos_name}` : ""}${
                            row.reason === "sale" && row.sale_seller_name
                              ? ` · Vendedor: ${row.sale_seller_name}`
                              : ""
                          }`}
                        >
                          SKU: {row.sku || "-"} ·{" "}
                          {reasonLabel[row.reason as InventoryMovementReason] ?? row.reason}
                          {row.reason === "sale" && row.sale_pos_name ? (
                            <>
                              {" · "}
                              POS: {row.sale_pos_name}
                            </>
                          ) : null}
                          {row.reason === "sale" && row.sale_seller_name ? (
                            <>
                              {" · "}
                              Vendedor: {row.sale_seller_name}
                            </>
                          ) : null}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={`text-[12px] font-semibold ${row.qty_delta < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                          {row.qty_delta > 0 ? "+" : ""}
                          {formatQty(row.qty_delta)}
                        </p>
                        <p className="text-[11px] text-slate-500">{formatDate(row.created_at)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-900">Últimas entradas de Stock</h2>
                <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
                  <button
                    onClick={() => setLatestEntriesFilter("all")}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                      latestEntriesFilter === "all"
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    Todas
                  </button>
                  <button
                    onClick={() => setLatestEntriesFilter("app")}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                      latestEntriesFilter === "app"
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    Solo app
                  </button>
                  <button
                    onClick={() => setLatestEntriesFilter("manual")}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                      latestEntriesFilter === "manual"
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    Solo Metrik Web
                  </button>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {latestEntriesLoading ? (
                  <p className="text-sm text-slate-500">Cargando entradas...</p>
                ) : latestEntriesError ? (
                  <p className="text-sm text-rose-600">{latestEntriesError}</p>
                ) : latestEntriesVisible.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    {latestEntriesFilter === "all"
                      ? "No hay entradas de stock registradas."
                      : "No hay entradas registradas para esta fuente."}
                  </p>
                ) : (
                  latestEntriesVisible.map((row) => (
                    <div
                      key={row.id}
                      title={`${row.product_name} · SKU: ${row.sku || "-"} · ${resolveEntrySourceLabel(row)} · ${formatDate(row.created_at)}`}
                      className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-semibold leading-4 text-slate-900" title={row.product_name}>
                          {row.product_name}
                        </p>
                        <p
                          className="truncate whitespace-nowrap text-[11px] leading-4 text-slate-500"
                          title={`SKU: ${row.sku || "-"} · ${resolveEntrySourceLabel(row)} · ${formatDate(row.created_at)}`}
                        >
                          SKU: {row.sku || "-"} · {resolveEntrySourceLabel(row)} · {formatDate(row.created_at)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="inline-flex h-5 w-[78px] items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-2 text-[11px] font-semibold text-emerald-700">
                          Entrada
                        </span>
                        <span className="text-[12px] font-semibold text-emerald-700 tabular-nums">
                          +{formatQty(row.qty_delta)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Comportamiento reciente del stock</h2>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Cierre diario de los últimos 7 días · valor calculado con precios de venta actuales
                </p>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-medium text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-sky-500" /> Unidades
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Valor de venta
                </span>
              </div>
            </div>
            <div className="mt-3">
              {stockTrendLoading ? (
                <div className="h-48 animate-pulse rounded-lg bg-slate-100" />
              ) : stockTrendError ? (
                <div className="flex h-48 items-center justify-center text-sm text-rose-600">{stockTrendError}</div>
              ) : stockTrend.length === 0 ? (
                <div className="flex h-48 items-center justify-center text-sm text-slate-500">Sin datos de stock.</div>
              ) : (
                <StockTrendChart points={stockTrend} />
              )}
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "inventory" ? (
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Inventario</h2>
              <p className="text-xs text-slate-600">
                Lista simplificada de productos con estado y último movimiento.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setInventorySearch("");
                  setInventoryGroupFilter("all");
                  setInventoryStockFilter("all");
                  setInventoryStatusFilter("all");
                  setInventorySort("sku_asc");
                  setInventoryPageSize(100);
                  setInventoryPageNo(1);
                }}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-100"
              >
                Limpiar filtros
              </button>
              <button
                onClick={openInventoryExportModal}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-100"
              >
                Exportar búsqueda
              </button>
            </div>
          </div>

          <div className="mt-3 grid min-w-0 gap-2.5 lg:grid-cols-5">
            <input
              value={inventorySearch}
              onChange={(e) => setInventorySearch(e.target.value)}
              placeholder="Buscar por nombre, SKU o código"
              className="min-w-0 rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] text-slate-900 lg:col-span-2"
            />
            <select
              value={inventoryGroupFilter}
              onChange={(e) => setInventoryGroupFilter(e.target.value)}
              className="min-w-0 rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] text-slate-900"
            >
              <option value="all">Todas las categorías</option>
              {groupOptions.map((group) => (
                <option key={group.path} value={group.display_name}>
                  {group.display_name}
                </option>
              ))}
            </select>
            <select
              value={inventoryStockFilter}
              onChange={(e) =>
                setInventoryStockFilter(e.target.value as "all" | "positive" | "zero" | "negative")
              }
              className="min-w-0 rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] text-slate-900"
            >
              <option value="all">Todos los stocks</option>
              <option value="positive">Stock positivo</option>
              <option value="zero">Stock en cero</option>
              <option value="negative">Stock negativo</option>
            </select>
            <select
              value={inventoryStatusFilter}
              onChange={(e) => setInventoryStatusFilter(e.target.value as StatusFilter)}
              className="min-w-0 rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] text-slate-900"
            >
              <option value="all">Todos los estados</option>
              <option value="ok">Saludable</option>
              <option value="low">Bajo stock</option>
              <option value="critical">Crítico</option>
              <option value="negative">Negativo</option>
            </select>
          </div>

          <div className="mt-2.5 grid min-w-0 gap-2.5 lg:grid-cols-4">
            <select
              value={inventorySort}
              onChange={(e) =>
                setInventorySort(
                  e.target.value as
                    | "name_asc"
                    | "stock_asc"
                    | "stock_desc"
                    | "sku_asc"
                    | "sku_desc"
                    | "cost_stock_asc"
                    | "cost_stock_desc"
                    | "price_stock_asc"
                    | "price_stock_desc"
                )
              }
              className="min-w-0 rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] text-slate-900"
            >
              <option value="name_asc">Orden alfabético</option>
              <option value="stock_asc">Stock menor a mayor (más negativos primero)</option>
              <option value="stock_desc">Stock mayor a menor (más altos primero)</option>
              <option value="sku_asc">SKU menor a mayor</option>
              <option value="sku_desc">SKU mayor a menor</option>
              <option value="cost_stock_asc">Costo en stock menor a mayor</option>
              <option value="cost_stock_desc">Costo en stock mayor a menor</option>
              <option value="price_stock_asc">Precio en stock menor a mayor</option>
              <option value="price_stock_desc">Precio en stock mayor a menor</option>
            </select>
            <select
              value={inventoryPageSize}
              onChange={(e) => setInventoryPageSize(Number(e.target.value))}
              className="min-w-0 rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] text-slate-900"
            >
              <option value={50}>50 por página</option>
              <option value={100}>100 por página</option>
              <option value={200}>200 por página</option>
            </select>
            <div className="text-[13px] text-slate-600 lg:col-span-2">
              Mostrando {inventoryItems.length} de {inventoryTotal} · Resultados: {inventoryTotal} · Página{" "}
              {inventoryPageNo} de {inventoryPages}
            </div>
            {inventoryStockFilter === "negative" ? (
              <div className="text-xs text-slate-500 lg:col-span-5">
                Tip: para ver primero los más negativos usa{" "}
                <span className="font-medium">Stock menor a mayor</span>.
              </div>
            ) : null}
          </div>

          <div className="mt-4 min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3.5 py-2.5 text-xs text-slate-600">
              <div>
                Página <span className="font-semibold text-slate-900">{inventoryPageNo}</span> de{" "}
                <span className="font-semibold text-slate-900">{inventoryPages}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  onClick={() => setInventoryPageNo(1)}
                  disabled={inventoryPageNo <= 1}
                  className="rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40"
                >
                  ⇤ Primera
                </button>
                <button
                  onClick={() => setInventoryPageNo((prev) => Math.max(1, prev - 1))}
                  disabled={inventoryPageNo <= 1}
                  className="rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40"
                >
                  ← Anterior
                </button>
                <button
                  onClick={() => setInventoryPageNo((prev) => Math.min(inventoryPages, prev + 1))}
                  disabled={inventoryPageNo >= inventoryPages}
                  className="rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40"
                >
                  Siguiente →
                </button>
                <button
                  onClick={() => setInventoryPageNo(inventoryPages)}
                  disabled={inventoryPageNo >= inventoryPages}
                  className="rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40"
                >
                  Última ⇥
                </button>
              </div>
            </div>

            <div className="h-[min(62vh,720px)] min-h-[340px] overflow-auto">
              <table className="w-full min-w-[1040px] table-fixed text-[12px]">
              <colgroup>
                <col style={{ width: "240px" }} />
                <col style={{ width: "56px" }} />
                <col style={{ width: "150px" }} />
                <col style={{ width: "58px" }} />
                <col style={{ width: "112px" }} />
                <col style={{ width: "122px" }} />
                <col style={{ width: "122px" }} />
                <col style={{ width: "108px" }} />
                <col style={{ width: "88px" }} />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
                  <th className="px-2 py-2.5 text-left">Producto</th>
                  <th className="px-2 py-2.5 text-left">SKU</th>
                  <th className="px-2 py-2.5 text-left">Categoría</th>
                  <th className="px-2 py-2.5 text-center">Stock</th>
                  <th className="px-2 py-2.5 text-left">Estado</th>
                  <th className="px-2 py-2.5 text-left">Costo en stock</th>
                  <th className="px-2 py-2.5 text-left">Precio en stock</th>
                  <th className="px-2 py-2.5 text-left">Último mov.</th>
                  <th className="py-2.5 pl-2 pr-4 text-left" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {inventoryLoading ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-sm text-slate-500">
                      Cargando inventario...
                    </td>
                  </tr>
                ) : inventoryError ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-sm text-rose-600">
                      {inventoryError}
                    </td>
                  </tr>
                ) : inventoryItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-sm text-slate-500">
                      No hay productos con ese filtro.
                    </td>
                  </tr>
                ) : (
                  inventoryItems.map((row) => {
                    const status = resolveStatus(row);
                    const rowBg =
                      status === "negative"
                        ? "bg-rose-50/80"
                        : status === "critical"
                          ? "bg-amber-50/80"
                          : status === "low"
                            ? "bg-amber-50/60"
                            : "bg-emerald-50/70";
                    return (
                      <tr key={row.product_id} className="group">
                        <td className={`${rowBg} px-2 py-2 transition-colors group-hover:bg-sky-50/60`}>
                          <span
                            className={`block truncate font-medium ${
                              row.qty_on_hand < 0 ? "text-rose-600" : "text-slate-900"
                            }`}
                            title={row.product_name}
                          >
                            {row.product_name}
                          </span>
                        </td>
                        <td className={`${rowBg} px-2 py-2 transition-colors group-hover:bg-sky-50/60`}>
                          <span className="block truncate text-slate-600" title={row.sku || "-"}>
                            {row.sku || "-"}
                          </span>
                        </td>
                        <td className={`${rowBg} px-2 py-2 transition-colors group-hover:bg-sky-50/60`}>
                          <span
                            className="block truncate text-slate-600"
                            title={row.group_name || "Sin categoría"}
                          >
                            {row.group_name || "Sin categoría"}
                          </span>
                        </td>
                        <td
                          className={`${rowBg} px-2 py-2 text-center font-semibold tabular-nums transition-colors group-hover:bg-sky-50/60 ${
                            row.qty_on_hand < 0 ? "text-rose-700" : "text-slate-800"
                          }`}
                        >
                          {formatQty(row.qty_on_hand)}
                        </td>
                        <td className={`${rowBg} px-2 py-2 transition-colors group-hover:bg-sky-50/60`}>
                          <span className={badgeClass(status)}>{statusLabel(status)}</span>
                        </td>
                        <td
                          className={`${rowBg} px-2 py-2 align-top text-slate-700 tabular-nums transition-colors group-hover:bg-sky-50/60`}
                        >
                          <span
                            className={`block whitespace-nowrap ${
                              row.cost * row.qty_on_hand < 0 ? "text-rose-600" : "text-slate-700"
                            }`}
                          >
                            {formatMoney(row.cost * row.qty_on_hand)}
                          </span>
                          <span className="whitespace-nowrap text-[11px] text-slate-500">
                            Unit: {formatMoney(row.cost)}
                          </span>
                        </td>
                        <td
                          className={`${rowBg} px-2 py-2 align-top text-slate-700 tabular-nums transition-colors group-hover:bg-sky-50/60`}
                        >
                          <span
                            className={`block whitespace-nowrap ${
                              row.price * row.qty_on_hand < 0 ? "text-rose-600" : "text-slate-700"
                            }`}
                          >
                            {formatMoney(row.price * row.qty_on_hand)}
                          </span>
                          <span className="whitespace-nowrap text-[11px] text-slate-500">
                            Unit: {formatMoney(row.price)}
                          </span>
                        </td>
                        <td
                          className={`${rowBg} px-2 py-2 align-top text-[11px] leading-4 text-slate-600 transition-colors group-hover:bg-sky-50/60`}
                        >
                          {row.last_movement_at ? formatDate(row.last_movement_at) : "-"}
                        </td>
                        <td className={`${rowBg} py-2 pl-2 pr-4 align-top transition-colors group-hover:bg-sky-50/60`}>
                          <button
                            onClick={() => openHistory(row.product_id)}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                          >
                            Historial
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-3.5 py-2.5 text-xs text-slate-600">
              <div>
                Página <span className="font-semibold text-slate-900">{inventoryPageNo}</span> de{" "}
                <span className="font-semibold text-slate-900">{inventoryPages}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  onClick={() => setInventoryPageNo(1)}
                  disabled={inventoryPageNo <= 1}
                  className="rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40"
                >
                  ⇤ Primera
                </button>
                <button
                  onClick={() => setInventoryPageNo((prev) => Math.max(1, prev - 1))}
                  disabled={inventoryPageNo <= 1}
                  className="rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40"
                >
                  ← Anterior
                </button>
                <button
                  onClick={() => setInventoryPageNo((prev) => Math.min(inventoryPages, prev + 1))}
                  disabled={inventoryPageNo >= inventoryPages}
                  className="rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40"
                >
                  Siguiente →
                </button>
                <button
                  onClick={() => setInventoryPageNo(inventoryPages)}
                  disabled={inventoryPageNo >= inventoryPages}
                  className="rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40"
                >
                  Última ⇥
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "movements" ? (
        <section className="min-w-0 space-y-3.5">
          <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Formularios de movimientos manuales
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  Selecciona el tipo de operación y abre su formulario en una vista separada.
                </p>
              </div>
            </div>
            <div className="mt-3 grid min-w-0 gap-2 md:grid-cols-2 xl:grid-cols-4">
              {kindOptions.map((kind) => (
                <div
                  key={kind.id}
                  className="rounded-xl border border-slate-200 bg-white p-3"
                >
                  <p className="text-[13px] font-semibold text-slate-900">{kind.label}</p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-600">
                    {kindDescriptions[kind.id]}
                  </p>
                  <button
                    type="button"
                    onClick={async () => {
                      if (kind.id === "entrada_manual" && openReceivingLots.length >= 2) {
                        showToast("Límite alcanzado: ya hay 2 documentos activos en curso.");
                        return;
                      }
                      setOpeningFormKind(kind.id);
                      if (kind.id === "entrada_manual") {
                        if (!token) {
                          setOpeningFormKind(null);
                          return;
                        }
                        try {
                          const created = await createReceivingLot(token, {
                            purchase_type: "cash",
                            origin_name: "Recepción web",
                            source_reference: undefined,
                            supplier_name: undefined,
                            invoice_reference: undefined,
                            notes: undefined,
                          });
                          window.localStorage.setItem(RECEIVING_DRAFT_LOT_KEY, String(created.id));
                          router.push(`/dashboard/movements/form/${kind.id}?lotId=${created.id}`);
                        } catch (err) {
                          showToast(
                            err instanceof Error
                              ? err.message
                              : "No fue posible crear la recepción en este momento."
                          );
                          setOpeningFormKind(null);
                        }
                        return;
                      }
                      if (!token) {
                        setOpeningFormKind(null);
                        return;
                      }
                      try {
                        const created = await createManualMovementDocument(token, {
                          kind: kind.id,
                          origin_name: "Metrik web",
                          header: {},
                        });
                        router.push(`/dashboard/movements/form/${kind.id}?docId=${created.id}`);
                      } catch (err) {
                        showToast(
                          err instanceof Error
                            ? err.message
                            : "No fue posible crear el documento en este momento."
                        );
                        setOpeningFormKind(null);
                      }
                    }}
                    disabled={openingFormKind !== null}
                    className="mt-2 inline-flex cursor-pointer rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-wait disabled:opacity-70"
                  >
                    {openingFormKind === kind.id ? "Abriendo..." : "Abrir formulario"}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid min-w-0 gap-3.5 lg:grid-cols-2">
            <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Documentos abiertos o en curso
                  </h2>
                  <p className="mt-1 text-xs text-slate-600">
                    Seguimiento de documentos activos (recepciones y salidas manuales por ahora).
                  </p>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {openReceivingLotsLoading ? (
                  <p className="text-xs text-slate-500">Cargando documentos abiertos...</p>
                ) : openReceivingLotsError ? (
                  <p className="text-xs text-rose-600">{openReceivingLotsError}</p>
                ) : openDocsSorted.length === 0 ? (
                  <p className="text-xs text-slate-500">No hay documentos en curso en este momento.</p>
                ) : (
                  <>
                    {openDocsSorted.map((entry) =>
                      entry.type === "receiving" ? (
                        <div
                          key={`rc-${entry.lot.id}`}
                          title={`${entry.lot.lot_number} · Recepción · ${
                            entry.lot.purchase_type === "invoice" ? "Factura" : "Efectivo"
                          } · Inicio: ${formatDate(entry.lot.created_at)} · Inició: ${
                            entry.lot.created_by_user_name || "Usuario no disponible"
                          }`}
                          className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5"
                        >
                          {(() => {
                            const lot = entry.lot;
                            const sourceBadge = resolveReceivingSourceBadge(lot.origin_name);
                            const isWebOrigin =
                              (lot.origin_name || "").trim().toLowerCase() === WEB_RECEIVING_ORIGIN;
                            return (
                              <>
                                <div className="min-w-0 flex-1 truncate whitespace-nowrap text-[12px] text-slate-700">
                                  <span className="font-semibold text-slate-900">{lot.lot_number}</span>
                                  <span className="mx-1.5 text-slate-400">·</span>
                                  <span>Recepción</span>
                                  <span className="mx-1.5 text-slate-400">·</span>
                                  <span>{lot.purchase_type === "invoice" ? "Factura" : "Efectivo"}</span>
                                  <span className="mx-1.5 text-slate-400">·</span>
                                  <span>Inicio: {formatDate(lot.created_at)}</span>
                                  <span className="mx-1.5 text-slate-400">·</span>
                                  <span>Inició: {lot.created_by_user_name || "Usuario no disponible"}</span>
                                  <span className="mx-1.5 text-slate-400">·</span>
                                  <span
                                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${sourceBadge.className}`}
                                  >
                                    {sourceBadge.label}
                                  </span>
                                  {!isWebOrigin ? (
                                    <>
                                      <span className="mx-1.5 text-slate-400">·</span>
                                      <span className="text-amber-700">Solo lectura (creado en app)</span>
                                    </>
                                  ) : null}
                                </div>
                                <div className="ml-auto flex shrink-0 items-center justify-end gap-2">
                                  {isWebOrigin ? (
                                    <>
                                      <button
                                        onClick={() => router.push(`/dashboard/movements/form/entrada_manual?lotId=${lot.id}`)}
                                        className="cursor-pointer rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                                      >
                                        Continuar
                                      </button>
                                      <button
                                        onClick={() => void handleCancelOpenReception(lot.id, lot.lot_number)}
                                        disabled={cancellingLotId === lot.id}
                                        className="cursor-pointer rounded-md border border-rose-300 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        {cancellingLotId === lot.id ? "Cancelando..." : "Cancelar"}
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      onClick={() => void openLotDetail(lot.id)}
                                      className="cursor-pointer rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                                    >
                                      Ver detalle
                                    </button>
                                  )}
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      ) : (
                        <div
                          key={`sm-${entry.doc.id}`}
                          title={`${entry.doc.document_number} · ${manualKindLabel[entry.doc.kind]} · ${String(
                            (entry.doc.header?.exit_type as string) ||
                              (entry.doc.header?.movement_type as string) ||
                              "Sin tipo"
                          )} · ${formatDate(entry.doc.created_at)} · Inició: ${
                            entry.doc.created_by_user_name || "Usuario no disponible"
                          }`}
                          className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5"
                        >
                          <div className="min-w-0 flex-1 truncate whitespace-nowrap text-[12px] text-slate-700">
                            <span className="font-semibold text-slate-900">{entry.doc.document_number}</span>
                            <span className="mx-1.5 text-slate-400">·</span>
                            <span>{manualKindLabel[entry.doc.kind]}</span>
                            <span className="mx-1.5 text-slate-400">·</span>
                            <span>
                              {String(
                                (entry.doc.header?.exit_type as string) ||
                                  (entry.doc.header?.movement_type as string) ||
                                  "Sin tipo"
                              )}
                            </span>
                            <span className="mx-1.5 text-slate-400">·</span>
                            <span>{formatDate(entry.doc.created_at)}</span>
                            <span className="mx-1.5 text-slate-400">·</span>
                            <span>Inició: {entry.doc.created_by_user_name || "Usuario no disponible"}</span>
                            <span className="mx-1.5 text-slate-400">·</span>
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${resolveReceivingSourceBadge(entry.doc.origin_name).className}`}
                            >
                              {resolveReceivingSourceBadge(entry.doc.origin_name).label}
                            </span>
                          </div>
                          <div className="ml-auto flex shrink-0 items-center justify-end gap-2">
                            <button
                              onClick={() => router.push(`/dashboard/movements/form/${entry.doc.kind}?docId=${entry.doc.id}`)}
                              className="cursor-pointer rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                            >
                              Continuar
                            </button>
                            <button
                              onClick={async () => {
                                if (!token) return;
                                try {
                                  await cancelManualMovementDocument(token, entry.doc.id);
                                  setRefreshNonce((value) => value + 1);
                                } catch (err) {
                                  showToast(err instanceof Error ? err.message : "No se pudo cancelar.");
                                }
                              }}
                              className="cursor-pointer rounded-md border border-rose-300 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-700"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Documentos cerrados recientes
                  </h2>
                  <p className="mt-1 text-xs text-slate-600">
                    Últimos documentos cerrados para consulta rápida.
                  </p>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {closedReceivingLotsLoading ? (
                  <p className="text-xs text-slate-500">Cargando documentos cerrados...</p>
                ) : closedReceivingLotsError ? (
                  <p className="text-xs text-rose-600">{closedReceivingLotsError}</p>
                ) : closedDocsVisible.length === 0 ? (
                  <p className="text-xs text-slate-500">No hay documentos cerrados recientes.</p>
                ) : (
                  <>
                    {closedDocsVisible.map((entry) =>
                      entry.type === "receiving" ? (
                        <div
                          key={`rc-closed-${entry.lot.id}`}
                          className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5"
                        >
                          <div className="min-w-0 flex-1 truncate whitespace-nowrap text-[12px] text-slate-700">
                            <span className="font-semibold text-slate-900">{entry.lot.lot_number}</span>
                            <span className="mx-1.5 text-slate-400">·</span>
                            <span>Recepción</span>
                            <span className="mx-1.5 text-slate-400">·</span>
                            <span>{entry.lot.purchase_type === "invoice" ? "Factura" : "Efectivo"}</span>
                            <span className="mx-1.5 text-slate-400">·</span>
                            <span>Inicio: {formatDate(entry.lot.created_at)}</span>
                            <span className="mx-1.5 text-slate-400">·</span>
                            <span>Inició: {entry.lot.created_by_user_name || "Usuario no disponible"}</span>
                            <span className="mx-1.5 text-slate-400">·</span>
                            <span>Cierre: {formatDate(entry.lot.closed_at || entry.lot.updated_at)}</span>
                            <span className="mx-1.5 text-slate-400">·</span>
                            <span>Cerró: {entry.lot.closed_by_user_name || "Usuario no disponible"}</span>
                            <span className="mx-1.5 text-slate-400">·</span>
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                                resolveReceivingSourceBadge(entry.lot.origin_name).className
                              }`}
                            >
                              {resolveReceivingSourceBadge(entry.lot.origin_name).label}
                            </span>
                          </div>
                          <div className="ml-auto flex shrink-0 items-center justify-end gap-2">
                            <button
                              onClick={() => void openLotDetail(entry.lot.id)}
                              className="cursor-pointer rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                            >
                              Ver detalle
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          key={`sm-closed-${entry.doc.id}`}
                          className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5"
                        >
                          <div className="min-w-0 flex-1 truncate whitespace-nowrap text-[12px] text-slate-700">
                            <span className="font-semibold text-slate-900">{entry.doc.document_number}</span>
                            <span className="mx-1.5 text-slate-400">·</span>
                            <span>{manualKindLabel[entry.doc.kind]}</span>
                            <span className="mx-1.5 text-slate-400">·</span>
                            <span>
                              {String(
                                (entry.doc.header?.exit_type as string) ||
                                  (entry.doc.header?.movement_type as string) ||
                                  "Sin tipo"
                              )}
                            </span>
                            <span className="mx-1.5 text-slate-400">·</span>
                            <span>Inicio: {formatDate(entry.doc.created_at)}</span>
                            <span className="mx-1.5 text-slate-400">·</span>
                            <span>Inició: {entry.doc.created_by_user_name || "Usuario no disponible"}</span>
                            <span className="mx-1.5 text-slate-400">·</span>
                            <span>Cierre: {formatDate(entry.doc.closed_at || entry.doc.updated_at)}</span>
                            <span className="mx-1.5 text-slate-400">·</span>
                            <span>Cerró: {entry.doc.closed_by_user_name || "Usuario no disponible"}</span>
                            <span className="mx-1.5 text-slate-400">·</span>
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                                resolveReceivingSourceBadge(entry.doc.origin_name).className
                              }`}
                            >
                              {resolveReceivingSourceBadge(entry.doc.origin_name).label}
                            </span>
                          </div>
                          <div className="ml-auto flex shrink-0 items-center justify-end gap-2">
                            <button
                              onClick={() => void openManualDetail(entry.doc.id)}
                              className="cursor-pointer rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                            >
                              Ver detalle
                            </button>
                          </div>
                        </div>
                      )
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

        </section>
      ) : null}

      {activeTab === "recounts" ? (
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Recuentos de inventario</h2>
          <p className="mt-1 text-xs text-slate-600">
            Crea documentos de conteo, captura cantidades y aplica diferencias con trazabilidad.
          </p>

          {recountView === "form" ? (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-[15px] font-semibold text-slate-900">Formulario de nuevo recuento (Web)</h3>
                  <p className="text-xs text-slate-600">
                    Configura alcance y crea el documento. Al crear, se abre de inmediato para captura manual.
                  </p>
                </div>
                <button
                  onClick={() => setRecountView("home")}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] text-slate-700 hover:bg-white"
                >
                  Volver
                </button>
              </div>
              <div className="mt-3 grid gap-2.5 md:grid-cols-2">
                <label className="block text-[13px] text-slate-700">
                  Título (opcional)
                  <input
                    value={newRecountTitle}
                    onChange={(e) => setNewRecountTitle(e.target.value)}
                    placeholder="Ej: Conteo bodega marzo"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[13px] text-slate-900"
                  />
                </label>
                <label className="block text-[13px] text-slate-700">
                  Modo de conteo
                  <select
                    value={newRecountMode}
                    onChange={(e) => setNewRecountMode(e.target.value as "blind" | "visible")}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[13px] text-slate-900"
                  >
                    <option value="blind">Ciego (recomendado)</option>
                    <option value="visible">Visible</option>
                  </select>
                </label>
                <label className="block text-[13px] text-slate-700">
                  Alcance
                  <select
                    value={newRecountScopeType}
                    onChange={(e) =>
                      setNewRecountScopeType(e.target.value as "all" | "group" | "free")
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[13px] text-slate-900"
                  >
                    <option value="all">Inventario completo</option>
                    <option value="group">Solo una categoría</option>
                    <option value="free">Selección libre (SKU puntuales)</option>
                  </select>
                </label>
                {newRecountScopeType === "group" ? (
                  <label className="block text-[13px] text-slate-700">
                    Categoría
                    <select
                      value={newRecountScopeValue}
                      onChange={(e) => setNewRecountScopeValue(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[13px] text-slate-900"
                    >
                      <option value="">Selecciona categoría...</option>
                      {groupOptions.map((group) => (
                        <option key={group.path} value={group.path}>
                          {group.display_name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
              <label className="mt-3 block text-[13px] text-slate-700">
                Notas
                <textarea
                  value={newRecountNotes}
                  onChange={(e) => setNewRecountNotes(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[13px] text-slate-900"
                />
              </label>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-600">
                  Luego de crear, podrás imprimir el formato del conteo para diligenciar en tienda y cargarlo manualmente.
                </p>
                {recountCreationBlocked ? (
                  <p className="text-xs font-medium text-amber-700">
                    No se pueden crear más: ya hay 2 recuentos en curso/pedientes.
                  </p>
                ) : null}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setRecountView("home")}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] text-slate-700 hover:bg-white"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={submitCreateRecount}
                    disabled={creatingRecount || recountCreationBlocked}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
                  >
                    {creatingRecount ? "Creando..." : "Crear y abrir documento"}
                  </button>
                </div>
              </div>
            </div>
          ) : recountView === "document" ? (
            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-[15px] font-semibold text-slate-900">Documento de recuento</h3>
                  <p className="text-xs text-slate-600">Captura, revisión y cierre en vista dedicada.</p>
                </div>
                <button
                  onClick={() => setRecountView("home")}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-100"
                >
                  Volver a recuentos
                </button>
              </div>
              {!selectedRecountId ? (
                <p className="text-xs text-slate-600">No hay documento seleccionado.</p>
              ) : recountDetailLoading ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-2">
                      <div className="h-6 w-64 animate-pulse rounded bg-slate-200" />
                      <div className="h-4 w-44 animate-pulse rounded bg-slate-100" />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-32 animate-pulse rounded bg-slate-100" />
                      <div className="h-9 w-28 animate-pulse rounded bg-slate-100" />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div
                        key={`recount-loading-stat-${index}`}
                        className="h-[74px] animate-pulse rounded-lg border border-slate-200 bg-slate-50"
                      />
                    ))}
                  </div>
                  <div className="h-10 w-full animate-pulse rounded-lg bg-slate-100" />
                  <div className="h-[260px] animate-pulse rounded-lg border border-slate-200 bg-slate-50" />
                  <p className="text-xs text-slate-500">Cargando detalle...</p>
                </div>
              ) : recountDetailError ? (
                <p className="text-xs text-rose-600">{recountDetailError}</p>
              ) : recountDetail ? (
                <div>
                  {(() => {
                    const showPrintFormButton = ["draft", "counting"].includes(
                      recountDetail.recount.status
                    );
                    const showPrintReportButton = ["closed", "applied"].includes(
                      recountDetail.recount.status
                    );
                    return (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-900">
                          {recountDetail.recount.code} · {recountDetail.recount.title || "Recuento"}
                        </h3>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                            recountDetail.recount.source === "app"
                              ? "border-sky-300 bg-sky-50 text-sky-700"
                              : "border-slate-300 bg-slate-100 text-slate-600"
                          }`}
                        >
                          {recountDetail.recount.source === "app" ? "Origen: app/tablet" : "Origen: web"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">
                        Estado: {statusLabelRecount(recountDetail.recount.status)} · Modo:{" "}
                        {recountDetail.recount.count_mode === "blind" ? "Ciego" : "Visible"} · Por:{" "}
                        {recountDetail.recount.created_by_user_name || "-"}
                      </p>
                      <p className="text-xs text-slate-500">
                        Apertura: {formatDate(recountDetail.recount.created_at)} · Abrió:{" "}
                        {recountDetail.recount.created_by_user_name || "Usuario no disponible"} · Cierre:{" "}
                        {recountDetail.recount.closed_at ? formatDate(recountDetail.recount.closed_at) : "-"} · Cerró:{" "}
                        {recountDetail.recount.closed_by_user_name || "Usuario no disponible"} · Aplicó:{" "}
                        {recountDetail.recount.applied_by_user_name || "Usuario no disponible"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {showPrintFormButton ? (
                        <button
                          onClick={() => void printSelectedRecountSheet("all", "form")}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Imprimir formulario
                        </button>
                      ) : null}
                      {showPrintReportButton ? (
                        <button
                          onClick={() => setRecountPrintModalOpen(true)}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Imprimir reporte
                        </button>
                      ) : null}
                      <button
                        onClick={closeSelectedRecount}
                        disabled={
                          recountActionLoading !== null ||
                          !["draft", "counting"].includes(recountDetail.recount.status)
                        }
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                      >
                        {recountActionLoading === "close" ? "Cerrando..." : "Cerrar recuento"}
                      </button>
                      <button
                        onClick={applySelectedRecount}
                        disabled={
                          recountActionLoading !== null ||
                          recountDetail.recount.status !== "closed"
                        }
                        className="rounded-lg border border-emerald-500 bg-emerald-500 px-3 py-1.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:border-emerald-600 hover:bg-emerald-600 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
                      >
                        {recountActionLoading === "apply" ? "Aplicando..." : "Aplicar ajustes"}
                      </button>
                    </div>
                  </div>
                    );
                  })()}

                  {(recountDetail.recount.status === "draft" || recountDetail.recount.status === "counting") ? (
                    <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
                      Recuento en captura: puedes registrar conteos manuales en web e imprimir formulario las veces que necesites para conteo físico en tienda.
                    </div>
                  ) : null}
                  {recountDetail.recount.status === "closed" ? (
                    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-900">
                      Siguiente paso natural: revisar diferencias y luego aplicar ajustes para actualizar stock.
                    </div>
                  ) : null}
                  {recountDetail.recount.status === "applied" ? (
                    <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs text-sky-900">
                      Ajustes aplicados. Este recuento quedó en solo lectura para trazabilidad.
                    </div>
                  ) : null}
                  {recountDetail.recount.scope_type === "free" &&
                  ["draft", "counting"].includes(recountDetail.recount.status) ? (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-semibold text-slate-900">
                        Agregar productos al recuento libre
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <input
                          value={recountFreeSearch}
                          onChange={(e) => setRecountFreeSearch(e.target.value)}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter") return;
                            event.preventDefault();
                            setRecountFreeSearchApplied(recountFreeSearch);
                          }}
                          placeholder="Buscar por nombre, SKU o código"
                          className="min-w-[260px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[13px] text-slate-900"
                        />
                        <button
                          type="button"
                          onClick={() => setRecountFreeSearchApplied(recountFreeSearch)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Buscar
                        </button>
                      </div>
                      {recountFreeSearchLoading ? (
                        <p className="mt-2 text-xs text-slate-500">Buscando productos...</p>
                      ) : recountFreeSearchError ? (
                        <p className="mt-2 text-xs text-rose-600">{recountFreeSearchError}</p>
                      ) : recountFreeSearchApplied.trim().length < 2 ? (
                        <p className="mt-2 text-xs text-slate-500">Escribe al menos 2 caracteres.</p>
                      ) : (
                        <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white">
                          <table className="w-full table-fixed">
                            <colgroup>
                              <col className="w-[38%]" />
                              <col className="w-[10%]" />
                              <col className="w-[12%]" />
                              <col className="w-[14%]" />
                              <col className="w-[14%]" />
                              <col className="w-[12%]" />
                            </colgroup>
                            <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.06em] text-slate-600">
                              <tr>
                                <th className="px-2.5 py-2 text-left">Producto</th>
                                <th className="px-2.5 py-2 text-left">SKU</th>
                                <th className="px-2.5 py-2 text-right">Costo</th>
                                <th className="px-2.5 py-2 text-right">Precio</th>
                                <th className="px-2.5 py-2 text-right">Cantidad</th>
                                <th className="px-2.5 py-2 text-right" />
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 text-[12px]">
                              {recountFreeSearchResults.length === 0 ? (
                                <tr>
                                  <td colSpan={6} className="px-3 py-3 text-center text-xs text-slate-500">
                                    Sin resultados.
                                  </td>
                                </tr>
                              ) : (
                                recountFreeSearchResults.map((row) => (
                                  <tr key={`recount-free-${row.product_id}`}>
                                    <td className="px-2.5 py-1.5">
                                      <p className="truncate font-medium text-slate-900">{row.product_name}</p>
                                    </td>
                                    <td className="px-2.5 py-1.5 text-slate-600">{row.sku || "-"}</td>
                                    <td className="px-2.5 py-1.5 text-right tabular-nums text-slate-700">
                                      {formatMoney(row.cost)}
                                    </td>
                                    <td className="px-2.5 py-1.5 text-right tabular-nums text-slate-700">
                                      {formatMoney(row.price)}
                                    </td>
                                    <td className="px-2.5 py-1.5 text-right">
                                      <input
                                        value={recountFreeCountDraft[row.product_id] ?? ""}
                                        onChange={(e) =>
                                          setRecountFreeCountDraft((prev) => ({
                                            ...prev,
                                            [row.product_id]: e.target.value.replace(/[^\d]/g, ""),
                                          }))
                                        }
                                        type="number"
                                        min="0"
                                        step="1"
                                        className="w-20 rounded border border-slate-300 px-2 py-1 text-right text-[12px] tabular-nums text-slate-900"
                                      />
                                    </td>
                                    <td className="px-2.5 py-1.5 text-right">
                                      <button
                                        type="button"
                                        onClick={() => void addFreeRecountProduct(row.product_id)}
                                        disabled={recountLineSavingId === row.product_id}
                                        className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                                      >
                                        {recountLineSavingId === row.product_id ? "Agregando..." : "Agregar"}
                                      </button>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ) : null}

                  <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
                    <StatCard
                      label="Líneas contadas"
                      value={`${recountDetail.recount.summary.counted_lines}/${recountDetail.recount.summary.total_lines}`}
                    />
                    <StatCard
                      label="Con diferencia"
                      value={`${recountDetail.recount.summary.difference_lines}`}
                    />
                    <StatCard
                      label="Diferencia total"
                      value={formatQty(recountDetail.recount.summary.total_diff_qty)}
                    />
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-4">
                    <StatCard label="Afectados" value={`${recountDiffSummary.affectedLines}`} />
                    <StatCard label="Ajuste +" value={`+${formatQty(recountDiffSummary.plusQty)}`} />
                    <StatCard label="Ajuste -" value={`-${formatQty(recountDiffSummary.minusQty)}`} />
                    <StatCard
                      label="Neto unidades"
                      value={`${recountDiffSummary.netQty > 0 ? "+" : ""}${formatQty(
                        recountDiffSummary.netQty
                      )}`}
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <div className="inline-flex rounded-lg border border-slate-300 bg-slate-50 p-1">
                      <button
                        type="button"
                        onClick={() => setRecountLineViewMode("differences")}
                        className={`rounded-md px-3 py-1 text-xs font-semibold ${
                          recountLineViewMode === "differences"
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-600 hover:text-slate-800"
                        }`}
                      >
                        Solo diferencias
                      </button>
                      <button
                        type="button"
                        onClick={() => setRecountLineViewMode("counted")}
                        className={`rounded-md px-3 py-1 text-xs font-semibold ${
                          recountLineViewMode === "counted"
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-600 hover:text-slate-800"
                        }`}
                      >
                        Todas las líneas
                      </button>
                    </div>
                    <div className="flex min-w-[280px] flex-1 items-center gap-2">
                      <input
                        value={recountSearch}
                        onChange={(e) => setRecountSearch(e.target.value)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") return;
                          event.preventDefault();
                          setRecountSearchApplied(recountSearch);
                        }}
                        placeholder="Buscar línea registrada por nombre, SKU o código"
                        className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] text-slate-900"
                      />
                      <button
                        type="button"
                        onClick={() => setRecountSearchApplied(recountSearch)}
                        className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-100"
                        aria-label="Buscar"
                        title="Buscar"
                      >
                        <span className="sm:hidden" aria-hidden="true">
                          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6" />
                            <path d="M13 13L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                          </svg>
                        </span>
                        <span className="hidden sm:inline">Buscar</span>
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 max-h-[520px] overflow-auto rounded-lg border border-slate-200">
                    <table className="w-full table-fixed">
                      <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.06em] text-slate-600">
                        <tr>
                          <th className="px-2.5 py-2 text-left">Producto</th>
                          <th className="px-2.5 py-2 text-right">Sistema</th>
                          <th className="px-2.5 py-2 text-right">Contado</th>
                          <th className="px-2.5 py-2 text-right">Dif.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-[12px]">
                        {recountLinesVisible.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-3 py-5 text-center text-xs text-slate-500">
                              No hay líneas para el filtro seleccionado.
                            </td>
                          </tr>
                        ) : recountLinesVisible.map((line) => {
                          const visibleIndex = recountLinesVisible.findIndex(
                            (candidate) => candidate.product_id === line.product_id
                          );
                          const isEditable = !["applied", "cancelled"].includes(
                            recountDetail.recount.status
                          );
                          const draft = recountCountedDraft[line.product_id] ?? "";
                          const counted = draft === "" ? null : Number(draft);
                          const effectiveCounted =
                            isEditable ? counted : line.counted_qty ?? null;
                          const diff =
                            isEditable
                              ? counted == null || Number.isNaN(counted)
                                ? null
                                : counted - line.system_qty
                              : line.diff_qty ?? null;
                          return (
                            <tr key={line.id} className="odd:bg-white even:bg-slate-50">
                              <td className="px-2.5 py-1.5">
                                <p className="truncate font-medium text-slate-900">{line.product_name}</p>
                                <p className="text-[11px] text-slate-500">{line.sku || "-"}</p>
                              </td>
                              <td className="px-2.5 py-1.5 text-right tabular-nums text-slate-700">
                                {formatQty(line.system_qty)}
                              </td>
                              <td className="px-2.5 py-1.5 text-right">
                                {isEditable ? (
                                  <input
                                    ref={(node) => {
                                      recountInputRefs.current[line.product_id] = node;
                                    }}
                                    value={draft}
                                    onChange={(e) =>
                                      setRecountCountedDraft((prev) => ({
                                        ...prev,
                                        [line.product_id]: e.target.value.replace(/[^\d]/g, ""),
                                      }))
                                    }
                                    onKeyDown={(event) => {
                                      if (event.key !== "Enter") return;
                                      event.preventDefault();
                                      const nextLine = recountLinesVisible[visibleIndex + 1];
                                      void (async () => {
                                        const saved = await submitRecountLine(line.product_id);
                                        if (saved && nextLine) {
                                          const nextInput =
                                            recountInputRefs.current[nextLine.product_id];
                                          nextInput?.focus();
                                          nextInput?.select();
                                        }
                                      })();
                                    }}
                                    onFocus={(event) => {
                                      event.currentTarget.select();
                                    }}
                                    type="number"
                                    min="0"
                                    step="1"
                                    className="w-20 rounded border border-slate-300 px-2 py-1 text-right text-[12px] tabular-nums text-slate-900"
                                  />
                                ) : (
                                  <span className="inline-block min-w-20 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-right tabular-nums text-slate-900">
                                    {effectiveCounted == null ? "-" : formatQty(effectiveCounted)}
                                  </span>
                                )}
                              </td>
                              <td
                                className={`px-2.5 py-1.5 text-right tabular-nums ${
                                  diff == null
                                    ? "text-slate-500"
                                    : diff === 0
                                      ? "text-slate-700"
                                      : diff < 0
                                        ? "text-rose-700"
                                        : "text-emerald-700"
                                }`}
                              >
                                {diff == null ? "-" : formatQty(diff)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <h3 className="text-sm font-semibold text-slate-900">Iniciar recuento desde web</h3>
                <p className="mt-1 text-xs text-slate-600">
                  Crea el documento con un formulario dedicado, igual al flujo de formularios en Movimientos.
                </p>
                {recountCreationBlocked ? (
                  <p className="mt-2 text-xs font-medium text-amber-700">
                    Límite alcanzado: ya hay 2 recuentos en curso/pedientes.
                  </p>
                ) : null}
                <button
                  onClick={() => {
                    setRecountFeedback(null);
                    setRecountView("form");
                  }}
                  disabled={recountCreationBlocked}
                  className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Iniciar formulario
                </button>
              </div>

              <div className="mt-3 grid gap-3.5 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Documentos abiertos o en curso</h3>
                  <p className="mt-1 text-xs text-slate-600">
                    Incluye borradores, en captura y cerrados pendientes de aplicar al stock.
                  </p>
                  <div className="mt-3 space-y-2">
                    {recountDocsLoading ? (
                      <p className="text-xs text-slate-500">Cargando recuentos...</p>
                    ) : recountDocsError ? (
                      <p className="text-xs text-rose-600">{recountDocsError}</p>
                    ) : openRecountDocsVisible.length === 0 ? (
                      <p className="text-xs text-slate-500">No hay recuentos abiertos.</p>
                    ) : (
                      openRecountDocsVisible.map((doc) => (
                        <div
                          key={doc.id}
                          title={`${doc.code}${doc.title ? ` · ${doc.title}` : ""}${
                            doc.created_by_user_name ? ` · ${doc.created_by_user_name}` : ""
                          } · ${statusLabelRecount(doc.status)} · ${doc.summary.counted_lines}/${
                            doc.summary.total_lines
                          } líneas · ${formatDate(doc.applied_at || doc.closed_at || doc.created_at)}`}
                          className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12px] font-semibold leading-4 text-slate-900">
                              {doc.code}
                              {doc.title ? ` · ${doc.title}` : ""}
                              {doc.created_by_user_name ? ` · Abrió: ${doc.created_by_user_name}` : ""}
                            </p>
                            <p className="truncate whitespace-nowrap text-[11px] leading-4 text-slate-600">
                              {statusLabelRecount(doc.status)} · {doc.summary.counted_lines}/{doc.summary.total_lines} líneas ·{" "}
                              {formatDate(doc.applied_at || doc.closed_at || doc.created_at)}
                            </p>
                            <p className="truncate whitespace-nowrap text-[10px] leading-4 text-slate-500">
                              Cerró: {doc.closed_by_user_name || "Usuario no disponible"} · Aplicó:{" "}
                              {doc.applied_by_user_name || "Pendiente"}
                            </p>
                            {doc.status === "closed" ? (
                              <p className="truncate text-[10px] font-medium leading-3 text-amber-700">
                                Pendiente de aplicar ajustes
                              </p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {doc.source === "web" ? (
                              <button
                                onClick={() => {
                                  setSelectedRecountId(doc.id);
                                  setRecountView("document");
                                }}
                                className="rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                              >
                                Continuar
                              </button>
                            ) : (
                              <span className="rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">
                                En app/tablet
                              </span>
                            )}
                            <button
                              onClick={() => void closeRecountFromList(doc)}
                              disabled={
                                closingRecountId === doc.id ||
                                !["draft", "counting"].includes(doc.status)
                              }
                              className="rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                            >
                              {closingRecountId === doc.id ? "Cerrando..." : "Cerrar"}
                            </button>
                            <button
                              onClick={() => void applyRecountFromList(doc)}
                              disabled={applyingRecountId === doc.id || doc.status !== "closed"}
                              className="rounded-md border border-emerald-500 bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm transition-colors hover:border-emerald-600 hover:bg-emerald-600 disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
                            >
                              {applyingRecountId === doc.id ? "Aplicando..." : "Aplicar"}
                            </button>
                            <button
                              onClick={() => void cancelOpenRecountFromList(doc)}
                              disabled={
                                cancellingRecountId === doc.id ||
                                !["draft", "counting", "closed"].includes(doc.status)
                              }
                              className="rounded-md border border-rose-300 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                            >
                              {cancellingRecountId === doc.id ? "Cancelando..." : "Cancelar"}
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Documentos cerrados recientes</h3>
                  <p className="mt-1 text-xs text-slate-600">
                    Solo recuentos aplicados al stock para consulta y trazabilidad.
                  </p>
                  <div className="mt-3 space-y-2">
                    {recountDocsLoading ? (
                      <p className="text-xs text-slate-500">Cargando recuentos...</p>
                    ) : recountDocsError ? (
                      <p className="text-xs text-rose-600">{recountDocsError}</p>
                    ) : closedRecountDocsVisible.length === 0 ? (
                      <p className="text-xs text-slate-500">No hay recuentos cerrados recientes.</p>
                    ) : (
                      closedRecountDocsVisible.map((doc) => (
                        <div
                          key={doc.id}
                          title={`${doc.code}${doc.title ? ` · ${doc.title}` : ""}${
                            doc.created_by_user_name ? ` · ${doc.created_by_user_name}` : ""
                          } · ${statusLabelRecount(doc.status)} · ${doc.summary.counted_lines}/${
                            doc.summary.total_lines
                          } líneas · ${formatDate(doc.applied_at || doc.closed_at || doc.created_at)}`}
                          className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12px] font-semibold leading-4 text-slate-900">
                              {doc.code}
                              {doc.title ? ` · ${doc.title}` : ""}
                              {doc.created_by_user_name ? ` · Abrió: ${doc.created_by_user_name}` : ""}
                            </p>
                            <p className="truncate whitespace-nowrap text-[11px] leading-4 text-slate-600">
                              {statusLabelRecount(doc.status)} · {doc.summary.counted_lines}/{doc.summary.total_lines} líneas ·{" "}
                              {formatDate(doc.applied_at || doc.closed_at || doc.created_at)}
                            </p>
                            <p className="truncate whitespace-nowrap text-[10px] leading-4 text-slate-500">
                              Cerró: {doc.closed_by_user_name || "Usuario no disponible"} · Aplicó:{" "}
                              {doc.applied_by_user_name || "Usuario no disponible"}
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              setSelectedRecountId(doc.id);
                              setRecountView("document");
                            }}
                            className="shrink-0 rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                          >
                            Ver
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
          {recountFeedback ? <p className="mt-3 text-xs text-slate-700">{recountFeedback}</p> : null}
        </section>
      ) : null}

      {activeTab === "receptions" ? (
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Recepciones (Metrik Stock)</h2>
              <p className="text-xs text-slate-600">
                Consulta de lotes cerrados y soportes documentales sincronizados desde móvil.
              </p>
            </div>
          </div>

          <div className="mt-3 grid min-w-0 gap-2.5 md:grid-cols-4">
            <label className="text-[13px] text-slate-700">
              Desde
              <input
                type="date"
                value={receivingDateFrom}
                onChange={(e) => setReceivingDateFrom(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] text-slate-900"
              />
            </label>
            <label className="text-[13px] text-slate-700">
              Hasta
              <input
                type="date"
                value={receivingDateTo}
                onChange={(e) => setReceivingDateTo(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] text-slate-900"
              />
            </label>
            <div className="md:col-span-2 flex items-end gap-2">
              <button
                onClick={() => setReceivingPage(1)}
                className="cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] text-slate-700 hover:bg-slate-100"
              >
                Aplicar filtros
              </button>
              <button
                onClick={() => {
                  setReceivingDateFrom("");
                  setReceivingDateTo("");
                  setReceivingPage(1);
                }}
                className="cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] text-slate-700 hover:bg-slate-100"
              >
                Limpiar
              </button>
            </div>
          </div>

          <div className="mt-3.5 min-w-0 overflow-hidden rounded-xl border border-slate-200">
            <div className="overflow-auto">
            <div className="grid min-w-[900px] grid-cols-[0.8fr_0.7fr_0.9fr_0.8fr_0.9fr_0.9fr_0.8fr] gap-3 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
              <span>Lote</span>
              <span>Tipo</span>
              <span>Origen</span>
              <span>Ítems / uds</span>
              <span>Factura</span>
              <span>Cerrado</span>
              <span></span>
            </div>
            <div className="min-w-[900px] divide-y divide-slate-200 bg-white">
              {receivingLoading ? (
                <div className="px-3 py-5 text-xs text-slate-500">Cargando recepciones...</div>
              ) : receivingError ? (
                <div className="px-3 py-5 text-xs text-rose-600">{receivingError}</div>
              ) : (receivingDocs?.items ?? []).length === 0 ? (
                <div className="px-3 py-5 text-xs text-slate-500">No hay lotes cerrados en ese rango.</div>
              ) : (
                (receivingDocs?.items ?? []).map((row) => (
                  <div
                    key={row.id}
                    title={`${row.lot_number} · ${row.purchase_type === "invoice" ? "Factura" : "Efectivo"} · ${
                      row.origin_name
                    } · ${row.lines_count} / ${formatQty(row.units_total)} · ${
                      row.invoice_reference || "-"
                    } · ${row.closed_at ? formatDate(row.closed_at) : "-"}`}
                    className="grid grid-cols-[0.8fr_0.7fr_0.9fr_0.8fr_0.9fr_0.9fr_0.8fr] items-center gap-3 px-3 py-2 text-[12px]"
                  >
                    <span className="truncate font-medium text-slate-900">{row.lot_number}</span>
                    <span className="truncate text-slate-700">{row.purchase_type === "invoice" ? "Factura" : "Efectivo"}</span>
                    <span className="truncate text-slate-600">{row.origin_name}</span>
                    <span className="truncate text-slate-600">{row.lines_count} / {formatQty(row.units_total)}</span>
                    <span className="truncate text-slate-600">{row.invoice_reference || "-"}</span>
                    <span className="truncate text-slate-600">{row.closed_at ? formatDate(row.closed_at) : "-"}</span>
                    <div className="flex items-center justify-end gap-1.5">
                      {row.support_file_name ? (
                        <button
                          onClick={() => handleDownloadSupport(row.id, row.lot_number)}
                          className="cursor-pointer rounded-md border border-slate-300 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
                        >
                          Soporte
                        </button>
                      ) : null}
                      <button
                        onClick={() => openLotDetail(row.id)}
                        className="cursor-pointer rounded-md border border-slate-300 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
                      >
                        Ver
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              onClick={() => setReceivingPage((prev) => Math.max(1, prev - 1))}
              disabled={receivingPage <= 1}
              className="cursor-pointer rounded-lg border border-slate-300 px-3 py-1 text-[13px] text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              onClick={() => {
                const total = receivingDocs?.total ?? 0;
                const pages = Math.max(1, Math.ceil(total / receivingLimit));
                setReceivingPage((prev) => Math.min(pages, prev + 1));
              }}
              className="cursor-pointer rounded-lg border border-slate-300 px-3 py-1 text-[13px] text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </section>
      ) : null}

      {movementsModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMovementsModalOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="movements-history-title"
            className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h3 id="movements-history-title" className="text-base font-semibold text-slate-900">
                  Últimos 100 movimientos
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Historial reciente de ventas, entradas, ajustes, recuentos, pérdidas y transferencias.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMovementsModalOpen(false)}
                className="cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Cerrar
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              {recentMovementsLoading ? (
                <div className="px-5 py-10 text-center text-sm text-slate-500">Cargando movimientos...</div>
              ) : recentMovementsError ? (
                <div className="px-5 py-10 text-center text-sm text-rose-600">{recentMovementsError}</div>
              ) : movementsModalRows.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-slate-500">No hay movimientos registrados.</div>
              ) : (
                <table className="w-full min-w-[1020px] border-collapse text-left">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] uppercase tracking-[0.08em] text-slate-600 shadow-[0_1px_0_#e2e8f0]">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Fecha</th>
                      <th className="px-4 py-2.5 font-semibold">Producto</th>
                      <th className="px-4 py-2.5 font-semibold">SKU</th>
                      <th className="px-4 py-2.5 font-semibold">Tipo</th>
                      <th className="px-4 py-2.5 font-semibold">Documento</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Cantidad</th>
                      <th className="px-4 py-2.5 font-semibold">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs text-slate-700">
                    {movementsModalRows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/80">
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{formatDate(row.created_at)}</td>
                        <td className="max-w-[320px] px-4 py-2.5 font-medium text-slate-900">
                          <span className="block truncate" title={row.product_name}>{row.product_name}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5">{row.sku || "-"}</td>
                        <td className="whitespace-nowrap px-4 py-2.5">
                          {reasonLabel[row.reason as InventoryMovementReason] ?? row.reason}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-700">
                          {row.reference_label || "-"}
                        </td>
                        <td
                          className={`whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums ${
                            row.qty_delta < 0 ? "text-rose-700" : "text-emerald-700"
                          }`}
                        >
                          {row.qty_delta > 0 ? "+" : ""}{formatQty(row.qty_delta)}
                        </td>
                        <td className="max-w-[300px] px-4 py-2.5 text-slate-500">
                          <span className="block truncate" title={movementDetailLabel(row)}>
                            {movementDetailLabel(row)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="border-t border-slate-200 bg-slate-50 px-5 py-2 text-right text-[11px] text-slate-500">
              {movementsModalRows.length} movimientos mostrados
            </div>
          </div>
        </div>
      ) : null}

      {recountPrintModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h3 className="text-base font-semibold text-slate-900">Imprimir reporte</h3>
              <button
                onClick={() => setRecountPrintModalOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-700"
              >
                Cerrar
              </button>
            </div>
            <div className="space-y-3 px-5 py-4">
              <label className="block text-sm text-slate-700">
                Qué incluir
                <select
                  value={recountPrintMode}
                  onChange={(e) =>
                    setRecountPrintMode(e.target.value as "differences" | "counted" | "all")
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                >
                  <option value="differences">Solo diferencias</option>
                  <option value="counted">Solo líneas contadas</option>
                  <option value="all">Todas las líneas del recuento</option>
                </select>
              </label>
              <p className="text-xs text-slate-500">
                Usa este reporte para auditoría, validación y trazabilidad del cierre.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setRecountPrintModalOpen(false)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    await printSelectedRecountSheet(recountPrintMode, "report");
                    setRecountPrintModalOpen(false);
                  }}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Imprimir
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {inventoryExportModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Exportar inventario</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Elige alcance y formato de exportación.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInventoryExportModalOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                disabled={inventoryExporting}
              >
                Cerrar
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-800">Alcance</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setInventoryExportScope("all")}
                    className={`rounded-lg border px-3 py-2 text-left text-sm font-medium transition ${
                      inventoryExportScope === "all"
                        ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                        : "border-slate-300 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    Todo el inventario
                  </button>
                  <button
                    type="button"
                    onClick={() => setInventoryExportScope("current")}
                    disabled={!hasInventoryFilteredScope}
                    className={`rounded-lg border px-3 py-2 text-left text-sm font-medium transition ${
                      inventoryExportScope === "current" && hasInventoryFilteredScope
                        ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                        : hasInventoryFilteredScope
                          ? "border-slate-300 text-slate-700 hover:bg-slate-100"
                          : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                    }`}
                  >
                    Solo búsqueda actual
                  </button>
                </div>
                {!hasInventoryFilteredScope ? (
                  <p className="mt-1 text-xs text-slate-500">
                    No hay filtros activos; solo está disponible “Todo el inventario”.
                  </p>
                ) : null}
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-800">Formato</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setInventoryExportFormat("xlsx")}
                    className={`rounded-lg border px-3 py-2 text-left text-sm font-medium transition ${
                      inventoryExportFormat === "xlsx"
                        ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                        : "border-slate-300 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    XLSX
                  </button>
                  <button
                    type="button"
                    onClick={() => setInventoryExportFormat("pdf")}
                    className={`rounded-lg border px-3 py-2 text-left text-sm font-medium transition ${
                      inventoryExportFormat === "pdf"
                        ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                        : "border-slate-300 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    PDF (horizontal)
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setInventoryExportModalOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                disabled={inventoryExporting}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExport}
                className="rounded-lg border border-emerald-300 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={inventoryExporting}
              >
                {inventoryExporting ? "Exportando..." : "Exportar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {historyOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-5xl rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h3 className="text-base font-semibold text-slate-900">
                Historial: {historyData?.product_name || "Producto"}
              </h3>
              <button
                onClick={() => setHistoryOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-700"
              >
                Cerrar
              </button>
            </div>
            <div className="p-5">
              {historyLoading ? (
                <p className="text-sm text-slate-500">Cargando...</p>
              ) : historyError ? (
                <p className="text-sm text-rose-600">{historyError}</p>
              ) : historyData ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                    <StatCard
                      label="Stock"
                      value={formatQty(historyData.qty_on_hand)}
                      valueClassName={historyData.qty_on_hand < 0 ? "text-rose-600" : undefined}
                    />
                    <StatCard
                      label="Entradas"
                      value={formatQty(historyData.total_in)}
                      valueClassName={historyData.total_in < 0 ? "text-rose-600" : undefined}
                    />
                    <StatCard
                      label="Salidas"
                      value={formatQty(historyData.total_out)}
                      valueClassName={historyData.total_out < 0 ? "text-rose-600" : undefined}
                    />
                    <StatCard
                      label="Neto"
                      value={formatQty(historyData.net)}
                      valueClassName={historyData.net < 0 ? "text-rose-600" : undefined}
                    />
                    <StatCard
                      label="Total costo stock"
                      value={formatMoney(historyData.qty_on_hand * historyData.unit_cost)}
                      valueClassName={
                        historyData.qty_on_hand * historyData.unit_cost < 0 ? "text-rose-600" : undefined
                      }
                    />
                    <StatCard
                      label="Total precio stock"
                      value={formatMoney(historyData.qty_on_hand * historyData.unit_price)}
                      valueClassName={
                        historyData.qty_on_hand * historyData.unit_price < 0 ? "text-rose-600" : undefined
                      }
                    />
                  </div>
                  <div className="mt-4 max-h-80 overflow-y-auto rounded-xl border border-slate-200">
                    {historyData.movements.map((move) => (
                      <div
                        key={move.id}
                        className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-sm"
                      >
                        <div>
                          <p className="font-medium text-slate-900">
                            {reasonLabel[move.reason as InventoryMovementReason] ?? move.reason}
                          </p>
                          {move.reference_label ? (
                          <button
                              type="button"
                              onClick={() => {
                                const params = new URLSearchParams();
                                params.set("fromMovements", "1");
                                params.set("type", mapHistoryReferenceToDocumentsType(move.reference_type));
                                if (move.reference_type) {
                                  params.set("reference_type", move.reference_type);
                                }
                                if (typeof move.reference_id === "number") {
                                  params.set("reference_id", String(move.reference_id));
                                }
                                if (!move.reference_id) {
                                  params.set("term", move.reference_label || "");
                                }
                                router.push(`/dashboard/documents?${params.toString()}`);
                              }}
                              className="text-xs font-medium text-sky-700 underline-offset-2 hover:underline"
                            >
                              Ref: {move.reference_label}
                            </button>
                          ) : null}
                          <p className="text-xs text-slate-500">{move.notes || move.reference_type || "-"}</p>
                        </div>
                        <div className="text-right">
                          <p className={move.qty_delta < 0 ? "text-rose-700" : "text-emerald-700"}>
                            {move.qty_delta > 0 ? "+" : ""}
                            {formatQty(move.qty_delta)}
                          </p>
                          <p className="text-xs text-slate-500">{formatDate(move.created_at)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {lotDetailOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-5xl rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h3 className="text-base font-semibold text-slate-900">
                Detalle lote {lotDetail?.lot.lot_number || ""}
              </h3>
              <button
                onClick={() => setLotDetailOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-700"
              >
                Cerrar
              </button>
            </div>
            <div className="p-5">
              {lotDetailLoading ? (
                <p className="text-sm text-slate-500">Cargando detalle...</p>
              ) : lotDetailError ? (
                <p className="text-sm text-rose-600">{lotDetailError}</p>
              ) : lotDetail ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <StatCard label="Tipo" value={lotDetail.lot.purchase_type === "invoice" ? "Factura" : "Efectivo"} />
                    <StatCard label="Origen" value={lotDetail.lot.origin_name} />
                    <StatCard label="Estado" value={lotStatusLabel(lotDetail.lot.status)} />
                    <StatCard
                      label="Cierre"
                      value={lotDetail.lot.closed_at ? formatDate(lotDetail.lot.closed_at) : "-"}
                    />
                  </div>
                  <div className="mt-3 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 sm:grid-cols-2">
                    <div className="min-w-0">
                      <span className="font-medium">Apertura:</span>{" "}
                      <span className="text-slate-900">{formatDate(lotDetail.lot.created_at)}</span>
                    </div>
                    <div className="min-w-0 sm:text-right">
                      <span className="font-medium">Inició por:</span>{" "}
                      <span className="text-slate-900">{lotDetail.lot.created_by_user_name || "Usuario no disponible"}</span>
                    </div>
                    <div className="min-w-0">
                      <span className="font-medium">Cierre:</span>{" "}
                      <span className="text-slate-900">{lotDetail.lot.closed_at ? formatDate(lotDetail.lot.closed_at) : "-"}</span>
                    </div>
                    <div className="min-w-0 sm:text-right">
                      <span className="font-medium">Cerró:</span>{" "}
                      <span className="text-slate-900">{lotDetail.lot.closed_by_user_name || "Usuario no disponible"}</span>
                    </div>
                    <div className="min-w-0 sm:col-span-2">
                      <span className="font-medium">Origen:</span>{" "}
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                          resolveReceivingSourceBadge(lotDetail.lot.origin_name).className
                        }`}
                      >
                        {resolveReceivingSourceBadge(lotDetail.lot.origin_name).label}
                      </span>
                    </div>
                  </div>

                  {lotDetail.warnings.length > 0 ? (
                    <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                      {lotDetail.warnings.map((warning) => (
                        <p key={warning.code}>{warning.message}</p>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-4 h-72 overflow-y-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-600">
                        <tr className="border-b border-slate-200/50">
                          <th className="px-3 py-2">Producto</th>
                          <th className="px-3 py-2">SKU</th>
                          <th className="px-3 py-2 text-right">Cant.</th>
                          <th className="px-3 py-2 text-right">Costo</th>
                          <th className="px-3 py-2 text-right">Precio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lotDetail.items.map((item, index) => (
                          <tr key={item.id}>
                            <td className={`px-3 py-2 text-slate-900 ${index > 0 ? "border-t border-slate-200/50" : ""}`}>
                              {item.product_name_snapshot}
                            </td>
                            <td className={`px-3 py-2 text-slate-700 ${index > 0 ? "border-t border-slate-200/50" : ""}`}>
                              {item.sku_snapshot || "-"}
                            </td>
                            <td className={`px-3 py-2 text-right text-slate-700 ${index > 0 ? "border-t border-slate-200/50" : ""}`}>
                              {formatQty(item.qty_received)}
                            </td>
                            <td className={`px-3 py-2 text-right text-slate-700 ${index > 0 ? "border-t border-slate-200/50" : ""}`}>
                              {formatMoney(item.unit_cost_snapshot)}
                            </td>
                            <td className={`px-3 py-2 text-right text-slate-700 ${index > 0 ? "border-t border-slate-200/50" : ""}`}>
                              {formatMoney(item.unit_price_snapshot)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {manualDetailOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-5xl rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h3 className="text-base font-semibold text-slate-900">
                Detalle documento {manualDetail?.document.document_number || ""}
              </h3>
              <button
                onClick={() => setManualDetailOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-700"
              >
                Cerrar
              </button>
            </div>
            <div className="p-5">
              {manualDetailLoading ? (
                <p className="text-sm text-slate-500">Cargando detalle...</p>
              ) : manualDetailError ? (
                <p className="text-sm text-rose-600">{manualDetailError}</p>
              ) : manualDetail ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <StatCard label="Tipo" value={manualKindLabel[manualDetail.document.kind]} />
                    <StatCard label="Origen" value={manualDetail.document.origin_name || "Metrik web"} />
                    <StatCard
                      label="Estado"
                      value={
                        manualDetail.document.status === "closed"
                          ? "Cerrado"
                          : manualDetail.document.status === "open"
                          ? "Abierto"
                          : "Cancelado"
                      }
                    />
                    <StatCard
                      label="Cierre"
                      value={
                        manualDetail.document.closed_at
                          ? formatDate(manualDetail.document.closed_at)
                          : "-"
                      }
                    />
                  </div>
                  <div className="mt-3 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 sm:grid-cols-2">
                    <div className="min-w-0">
                      <span className="font-medium">Apertura:</span>{" "}
                      <span className="text-slate-900">{formatDate(manualDetail.document.created_at)}</span>
                    </div>
                    <div className="min-w-0 sm:text-right">
                      <span className="font-medium">Inició por:</span>{" "}
                      <span className="text-slate-900">{manualDetail.document.created_by_user_name || "Usuario no disponible"}</span>
                    </div>
                    <div className="min-w-0">
                      <span className="font-medium">Cierre:</span>{" "}
                      <span className="text-slate-900">{manualDetail.document.closed_at ? formatDate(manualDetail.document.closed_at) : "-"}</span>
                    </div>
                    <div className="min-w-0 sm:text-right">
                      <span className="font-medium">Cerró:</span>{" "}
                      <span className="text-slate-900">{manualDetail.document.closed_by_user_name || "Usuario no disponible"}</span>
                    </div>
                    <div className="min-w-0 sm:col-span-2">
                      <span className="font-medium">Origen:</span>{" "}
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                          resolveReceivingSourceBadge(manualDetail.document.origin_name).className
                        }`}
                      >
                        {resolveReceivingSourceBadge(manualDetail.document.origin_name).label}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 h-72 overflow-y-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-600">
                        <tr className="border-b border-slate-200/50">
                          <th className="px-3 py-2">Producto</th>
                          <th className="px-3 py-2">SKU</th>
                          <th className="px-3 py-2 text-right">Cant.</th>
                          <th className="px-3 py-2 text-right">Costo</th>
                          <th className="px-3 py-2 text-right">Precio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {manualDetail.lines.map((line, index) => (
                          <tr key={line.id}>
                            <td className={`px-3 py-2 text-slate-900 ${index > 0 ? "border-t border-slate-200/50" : ""}`}>
                              {line.product_name_snapshot}
                            </td>
                            <td className={`px-3 py-2 text-slate-700 ${index > 0 ? "border-t border-slate-200/50" : ""}`}>
                              {line.sku_snapshot || "-"}
                            </td>
                            <td className={`px-3 py-2 text-right text-slate-700 ${index > 0 ? "border-t border-slate-200/50" : ""}`}>
                              {formatQty(line.qty)}
                            </td>
                            <td className={`px-3 py-2 text-right text-slate-700 ${index > 0 ? "border-t border-slate-200/50" : ""}`}>
                              {line.unit_cost_snapshot != null ? formatMoney(line.unit_cost_snapshot) : "-"}
                            </td>
                            <td className={`px-3 py-2 text-right text-slate-700 ${index > 0 ? "border-t border-slate-200/50" : ""}`}>
                              {line.unit_price_snapshot != null ? formatMoney(line.unit_price_snapshot) : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {toastMessage ? (
        <div className="fixed bottom-5 right-5 z-[60]">
          <div
            className={`rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 shadow-lg transition-all ${
              toastVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
            }`}
          >
            {toastMessage}
          </div>
        </div>
      ) : null}

      {printerSettingsOpen ? (
        <div
          className="fixed inset-0 z-50 bg-slate-900/45 p-4 backdrop-blur-[2px] md:p-8"
          onClick={() => setPrinterSettingsOpen(false)}
        >
          <div
            className="mx-auto mt-4 w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl md:mt-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Configuración de impresión
                </h3>
                <p className="text-xs text-slate-600">
                  Ajusta el agente local y prueba conexión.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPrinterSettingsOpen(false)}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cerrar
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <span className="text-xs text-slate-600">
                  Abre la app del agente para autodetección y selección de impresora.
                </span>
                <div className="flex items-center gap-2">
                  <a
                    href={LABEL_AGENT_WINDOWS_DOWNLOAD_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                  >
                    Descargar agente (Windows)
                  </a>
                  <button
                    type="button"
                    onClick={handleOpenAgentUi}
                    className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    Abrir app del agente
                  </button>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">
                    Conexión del agente
                  </h4>
                  <p className="text-xs text-slate-600">
                    Datos técnicos para conectar con el print-agent local.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">
                      Modo
                    </label>
                    <input
                      className="ui-input w-full bg-white px-3 py-2 text-sm"
                      value="Agente local"
                      disabled
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-semibold text-slate-700">
                      URL del agente
                    </label>
                    <input
                      className="ui-input w-full bg-white px-3 py-2 text-sm"
                      value={LABEL_AGENT_DEFAULT_PRINT_URL}
                      placeholder={LABEL_AGENT_DEFAULT_PRINT_URL}
                      disabled
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1 text-sm">
                <button
                  type="button"
                  className="rounded-xl border border-emerald-500 bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  onClick={() => void handleProbePrinter()}
                  disabled={probeStatus === "printing"}
                >
                  {probeStatus === "printing"
                    ? "Probando..."
                    : "Probar conexión (imprimir test)"}
                </button>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    probeStatus === "success"
                      ? "bg-emerald-100 text-emerald-700"
                      : probeStatus === "error"
                      ? "bg-rose-100 text-rose-700"
                      : probeStatus === "printing"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {probeStatus === "success"
                    ? "éxito"
                    : probeStatus === "error"
                    ? "error"
                    : probeStatus === "printing"
                    ? "imprimiendo"
                    : "inactivo"}
                </span>
                {probeMessage ? (
                  <span className="text-sm text-slate-600">{probeMessage}</span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${valueClassName || "text-slate-900"}`}>{value}</p>
    </div>
  );
}

function resolveStatus(row: InventoryProductRow): StatusFilter {
  if (row.qty_on_hand < 0) return "negative";
  if (row.status === "low") return "low";
  if (row.status === "critical") return "critical";
  return "ok";
}

function statusLabel(status: StatusFilter) {
  if (status === "negative") return "Negativo";
  if (status === "critical") return "Crítico";
  if (status === "low") return "Bajo stock";
  if (status === "ok") return "Saludable";
  return "Todos";
}

function statusLabelRecount(
  status: "draft" | "counting" | "closed" | "applied" | "cancelled"
) {
  if (status === "draft") return "Borrador";
  if (status === "counting") return "En conteo";
  if (status === "closed") return "Cerrado (pendiente de aplicar)";
  if (status === "applied") return "Aplicado";
  return "Cancelado";
}

function lotStatusLabel(status: "open" | "closed" | "cancelled") {
  if (status === "open") return "Abierto";
  if (status === "closed") return "Cerrado";
  return "Cancelado";
}

function resolveReceivingSourceBadge(originName?: string | null) {
  const normalized = (originName || "").trim().toLowerCase();
  if (normalized.includes("web")) {
    return {
      label: "Web",
      className: "border-sky-200 bg-sky-50 text-sky-700",
    };
  }
  return {
    label: "App",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
}

function resolveEntrySourceLabel(movement: InventoryLatestEntryRecord) {
  if (movement.source === "manual" && movement.reference_type === "receiving_lot") {
    if (movement.lot_number) return `Recepción Metrik Web · Lote ${movement.lot_number}`;
    return "Recepción Metrik Web";
  }
  if (movement.source === "app") {
    if (movement.lot_number) return `Recepción app · Lote ${movement.lot_number}`;
    return "Recepción app";
  }
  if ((movement.reference_type || "").toLowerCase() === "invoice") {
    return "Entrada Metrik Web · Factura";
  }
  if ((movement.reference_type || "").toLowerCase() === "cash") {
    return "Entrada Metrik Web · Efectivo";
  }
  if ((movement.reference_type || "").toLowerCase().includes("receiving")) {
    return "Recepción app";
  }
  if (movement.reason === "purchase") return "Recepción app";
  return "Entrada";
}

function movementDetailLabel(movement: InventoryMovementRecord) {
  const details: string[] = [];
  if (movement.sale_pos_name) details.push(`POS: ${movement.sale_pos_name}`);
  if (movement.sale_seller_name) details.push(`Vendedor: ${movement.sale_seller_name}`);
  if (movement.notes?.trim()) details.push(movement.notes.trim());
  if (details.length === 0 && movement.reference_type) {
    details.push(
      movement.reference_id != null
        ? `${movement.reference_type} #${movement.reference_id}`
        : movement.reference_type
    );
  }
  return details.join(" · ") || "-";
}

function mapHistoryReferenceToDocumentsType(referenceType?: string | null) {
  const normalized = (referenceType || "").trim().toLowerCase();
  if (normalized === "sale") return "venta";
  if (normalized === "receiving_lot") return "recepcion";
  if (normalized === "recount") return "recuento";
  if (["salida_manual", "venta_manual", "ajuste", "perdida_dano"].includes(normalized)) {
    return "movimiento_manual";
  }
  return "all";
}

function badgeClass(status: StatusFilter) {
  const base =
    "inline-flex h-6 w-[98px] items-center justify-center rounded-full border px-2 text-xs font-semibold leading-none";
  if (status === "negative") {
    return `${base} border-rose-300 bg-rose-50 text-rose-700`;
  }
  if (status === "critical") {
    return `${base} border-amber-300 bg-amber-50 text-amber-700`;
  }
  if (status === "low") {
    return `${base} border-amber-200 bg-amber-50 text-amber-700`;
  }
  return `${base} border-emerald-200 bg-emerald-50 text-emerald-700`;
}

function formatQty(value: number, maxDigits = 2) {
  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: maxDigits,
  }).format(value);
}

type PersistedRecountDraft = {
  recountId: number;
  userId: number | null;
  countedDraft: Record<number, string>;
  freeCountDraft: Record<number, string>;
  savedAtMs: number;
};

type DraftStateInput = {
  countedDraft?: Record<number, string>;
  freeCountDraft?: Record<number, string>;
  counted_draft?: Record<number, string>;
  free_count_draft?: Record<number, string>;
  saved_at_ms?: number;
  savedAtMs?: number;
};

function recountDraftStorageKey(userId: number | null, recountId: number) {
  return `${RECOUNT_DRAFT_STORAGE_PREFIX}:${userId ?? "anon"}:${recountId}`;
}

function normalizeDraftMap(value: unknown): Record<number, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<number, string> = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = Number(rawKey);
    if (!Number.isInteger(key) || key <= 0) continue;
    if (typeof rawValue !== "string") continue;
    const normalized = rawValue.trim();
    if (normalized === "") continue;
    result[key] = normalized.replace(/[^\d]/g, "");
  }
  return Object.fromEntries(
    Object.entries(result)
      .sort(([left], [right]) => Number(left) - Number(right))
      .map(([key, entry]) => [Number(key), entry])
  ) as Record<number, string>;
}

function normalizeDraftState(source: DraftStateInput | null | undefined): {
  countedDraft: Record<number, string>;
  freeCountDraft: Record<number, string>;
  savedAtMs: number;
} {
  if (!source) {
    return { countedDraft: {}, freeCountDraft: {}, savedAtMs: 0 };
  }
  return {
    countedDraft: normalizeDraftMap(source.countedDraft ?? source.counted_draft),
    freeCountDraft: normalizeDraftMap(source.freeCountDraft ?? source.free_count_draft),
    savedAtMs: Number(source.savedAtMs ?? source.saved_at_ms ?? 0),
  };
}

function serializeRecountDraftPayload(
  userId: number | null,
  recountId: number,
  countedDraft: Record<number, string>,
  freeCountDraft: Record<number, string>
) {
  return JSON.stringify({
    userId,
    recountId,
    countedDraft: normalizeDraftMap(countedDraft),
    freeCountDraft: normalizeDraftMap(freeCountDraft),
  });
}

function readPersistedRecountDraft(
  userId: number | null,
  recountId: number
): PersistedRecountDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(recountDraftStorageKey(userId, recountId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedRecountDraft>;
    if (parsed.recountId !== recountId) return null;
    if ((parsed.userId ?? null) !== (userId ?? null)) return null;
    return {
      recountId,
      userId,
      countedDraft: normalizeDraftMap(parsed.countedDraft),
      freeCountDraft: normalizeDraftMap(parsed.freeCountDraft),
      savedAtMs: Number(parsed.savedAtMs ?? Date.now()),
    };
  } catch {
    return null;
  }
}

function persistRecountDraftLocal(
  userId: number | null,
  recountId: number,
  countedDraft: Record<number, string>,
  freeCountDraft: Record<number, string>
) {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedRecountDraft = {
      recountId,
      userId,
      countedDraft: normalizeDraftMap(countedDraft),
      freeCountDraft: normalizeDraftMap(freeCountDraft),
      savedAtMs: Date.now(),
    };
    window.localStorage.setItem(
      recountDraftStorageKey(userId, recountId),
      JSON.stringify(payload)
    );
  } catch {
    // Ignore storage failures; server save remains the source of truth.
  }
}

function clearPersistedRecountDraft(userId: number | null, recountId: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(recountDraftStorageKey(userId, recountId));
  } catch {
    // Ignore storage failures.
  }
}

function parseRecountCountDraft(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (trimmed === "") return null;
  const counted = Number(trimmed);
  if (!Number.isFinite(counted) || counted < 0 || !Number.isInteger(counted)) {
    return null;
  }
  return counted;
}

function StockTrendChart({ points }: { points: InventoryStockTrendPoint[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const width = 900;
  const height = 200;
  const left = 56;
  const right = 76;
  const top = 18;
  const bottom = 34;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const units = points.map((point) => Number(point.stock_units || 0));
  const values = points.map((point) => Number(point.stock_sale_value || 0));
  const unitMin = Math.min(...units);
  const unitMax = Math.max(...units);
  const valueMin = Math.min(...values);
  const valueMax = Math.max(...values);
  const xAt = (index: number) =>
    left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const yAt = (value: number, min: number, max: number) =>
    max === min ? top + plotHeight / 2 : top + ((max - value) / (max - min)) * plotHeight;
  const unitCoordinates = points.map((point, index) => ({
    x: xAt(index),
    y: yAt(point.stock_units, unitMin, unitMax),
  }));
  const valueCoordinates = points.map((point, index) => ({
    x: xAt(index),
    y: yAt(point.stock_sale_value, valueMin, valueMax),
  }));
  const unitLine = unitCoordinates.map(({ x, y }) => `${x},${y}`).join(" ");
  const valueLine = valueCoordinates.map(({ x, y }) => `${x},${y}`).join(" ");
  const selectedIndex = hoveredIndex ?? 0;
  const selected = points[selectedIndex];
  const selectedX = xAt(selectedIndex);
  const tooltipWidth = 190;
  const tooltipX = Math.min(Math.max(selectedX - tooltipWidth / 2, left), width - right - tooltipWidth);

  return (
    <div className="w-full" onMouseLeave={() => setHoveredIndex(null)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-48 w-full overflow-visible"
        role="img"
        aria-label="Gráfica del stock total en unidades y valor de venta durante los últimos siete días"
      >
        {[0, 0.5, 1].map((ratio) => {
          const y = top + ratio * plotHeight;
          return (
            <line
              key={ratio}
              x1={left}
              x2={width - right}
              y1={y}
              y2={y}
              stroke="#e2e8f0"
              strokeDasharray="4 5"
            />
          );
        })}

        <text x={left - 8} y={top + 4} textAnchor="end" className="fill-slate-400 text-[10px]">
          {formatCompactNumber(unitMax)}
        </text>
        <text x={left - 8} y={top + plotHeight + 4} textAnchor="end" className="fill-slate-400 text-[10px]">
          {formatCompactNumber(unitMin)}
        </text>
        <text x={width - right + 8} y={top + 4} className="fill-slate-400 text-[10px]">
          {formatCompactMoney(valueMax)}
        </text>
        <text x={width - right + 8} y={top + plotHeight + 4} className="fill-slate-400 text-[10px]">
          {formatCompactMoney(valueMin)}
        </text>

        <polyline points={unitLine} fill="none" stroke="#0ea5e9" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={valueLine} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

        {hoveredIndex != null ? (
          <line x1={selectedX} x2={selectedX} y1={top} y2={top + plotHeight} stroke="#94a3b8" strokeDasharray="3 4" />
        ) : null}

        {points.map((point, index) => (
          <g key={point.date}>
            <circle cx={unitCoordinates[index].x} cy={unitCoordinates[index].y} r="3.5" fill="white" stroke="#0ea5e9" strokeWidth="2" />
            <circle cx={valueCoordinates[index].x} cy={valueCoordinates[index].y} r="3.5" fill="white" stroke="#10b981" strokeWidth="2" />
            <circle
              cx={xAt(index)}
              cy={top + plotHeight / 2}
              r={plotWidth / Math.max(points.length - 1, 1) / 2}
              fill="transparent"
              onMouseEnter={() => setHoveredIndex(index)}
            />
            <text x={xAt(index)} y={height - 8} textAnchor="middle" className="fill-slate-500 text-[10px]">
              {formatTrendDate(point.date)}
            </text>
          </g>
        ))}

        {hoveredIndex != null ? (
          <g pointerEvents="none">
            <rect x={tooltipX} y={24} width={tooltipWidth} height="48" rx="8" fill="#0f172a" opacity="0.94" />
            <text x={tooltipX + 10} y={43} className="fill-slate-300 text-[10px]">
              {formatTrendDate(selected.date, true)}
            </text>
            <text x={tooltipX + 10} y={61} className="fill-white text-[11px] font-semibold">
              {formatQty(selected.stock_units)} uds · {formatMoney(selected.stock_sale_value)}
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}

function formatTrendDate(value: string, long = false) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, Math.max(0, month - 1), day);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-CO", long
    ? { weekday: "short", day: "numeric", month: "short" }
    : { day: "numeric", month: "short" });
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("es-CO", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatCompactMoney(value: number) {
  return `$${new Intl.NumberFormat("es-CO", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  const date = parseMovementDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseMovementDate(value: string) {
  const raw = String(value || "").trim();
  const hasZone = /(?:Z|[+\-]\d{2}:\d{2})$/i.test(raw);
  const normalized = hasZone ? raw : `${raw}Z`;
  return new Date(normalized);
}

function parseMovementDateMs(value: string) {
  const date = parseMovementDate(value);
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

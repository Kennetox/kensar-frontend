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
  fetchManualMovementDocumentDetail,
  fetchManualMovementDocuments,
  fetchInventoryOverview,
  fetchInventoryProductHistory,
  fetchInventoryProducts,
  getInventoryRecountDetail,
  listInventoryRecounts,
  fetchReceivingDocuments,
  fetchReceivingLots,
  fetchReceivingLotDetail,
  fetchReceivingProductGroups,
  upsertInventoryRecountLine,
  type InventoryMovementReason,
  type InventoryLatestEntryRecord,
  type InventoryOverview,
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

const tabs = [
  { key: "summary", label: "Resumen" },
  { key: "inventory", label: "Inventario" },
  { key: "movements", label: "Movimientos" },
  { key: "recounts", label: "Recuentos" },
  { key: "receptions", label: "Recepciones" },
] as const;
const MOVEMENTS_ACTIVE_TAB_KEY = "metrik_movements_active_tab_v1";
const RECEIVING_DRAFT_LOT_KEY = "metrik_receiving_draft_lot_id_v1";
const ACTIVE_MOVEMENT_FORM_KEY = "metrik_active_movement_form_v1";
const ACTIVE_MOVEMENT_FORM_TTL_MS = 1000 * 60 * 60 * 8;
const INVENTORY_FILTERS_KEY = "metrik_movements_inventory_filters_v1";
const INVENTORY_FILTERS_TTL_MS = 1000 * 60 * 60 * 8;
const WEB_RECEIVING_ORIGIN = "recepción web";
const CLOSED_DOCS_PANEL_LIMIT = 8;

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
  const { token } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<TabKey>("summary");
  const [activeTabReady, setActiveTabReady] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const [overview, setOverview] = useState<InventoryOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [latestEntries, setLatestEntries] = useState<InventoryLatestEntryRecord[]>([]);
  const [latestEntriesLoading, setLatestEntriesLoading] = useState(false);
  const [latestEntriesError, setLatestEntriesError] = useState<string | null>(null);
  const [latestEntriesFilter, setLatestEntriesFilter] = useState<
    "all" | "app" | "manual"
  >("all");
  const [openingFormKind, setOpeningFormKind] = useState<ManualMovementKind | null>(null);

  const [inventoryPage, setInventoryPage] = useState<InventoryProductPage | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
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
  const [newRecountScopeType, setNewRecountScopeType] = useState<"all" | "group">("all");
  const [newRecountScopeValue, setNewRecountScopeValue] = useState("");
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
    setLatestEntriesLoading(true);
    setLatestEntriesError(null);
    fetchInventoryLatestEntries(token, {
      source: "all",
      limit: 48,
    })
      .then((rows) => {
        if (cancelled) return;
        setLatestEntries(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setLatestEntries([]);
          setLatestEntriesError(err instanceof Error ? err.message : "Error");
        }
      })
      .finally(() => {
        if (!cancelled) setLatestEntriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, activeTab, refreshNonce]);

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
    if (activeTab !== "inventory" && activeTab !== "summary") return;
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
    inventoryGroupFilter,
    refreshNonce,
  ]);

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
            q: recountSearch.trim() || undefined,
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
  }, [token, activeTab, selectedRecountId, recountSearch, recountLineViewMode, refreshNonce]);

  useEffect(() => {
    setInventoryPageNo(1);
  }, [inventorySearch, inventorySort, inventoryStockFilter, inventoryGroupFilter, inventoryPageSize]);

  const inventoryItemsRaw = useMemo(
    () => inventoryPage?.items ?? [],
    [inventoryPage?.items]
  );
  const inventoryItems = useMemo(() => {
    if (inventoryStatusFilter === "all") return inventoryItemsRaw;
    return inventoryItemsRaw.filter((row) => resolveStatus(row) === inventoryStatusFilter);
  }, [inventoryItemsRaw, inventoryStatusFilter]);

  const inventoryTotal = inventoryPage?.total ?? 0;
  const inventoryPages = Math.max(1, Math.ceil(inventoryTotal / inventoryPageSize));

  const summaryCards = useMemo(() => {
    const summary = overview?.summary;
    const totalQty = summary?.total_qty ?? 0;
    const totalCostValue = inventoryPage?.total_cost_value ?? 0;
    const totalPriceValue = inventoryPage?.total_price_value ?? 0;
    const lowStockCount = summary?.low_stock_count ?? 0;
    const criticalCount = summary?.critical_count ?? 0;
    const recentMovementsCount = overview?.recent_movements?.length ?? 0;
    return [
      {
        title: "Stock total",
        value: `${formatQty(totalQty)} uds`,
        isNegative: totalQty < 0,
      },
      {
        title: "Valor inventario (costo)",
        value: formatMoney(totalCostValue),
        isNegative: totalCostValue < 0,
      },
      {
        title: "Valor inventario (venta)",
        value: formatMoney(totalPriceValue),
        isNegative: totalPriceValue < 0,
      },
      {
        title: "SKUs bajo mínimo",
        value: `${lowStockCount}`,
        isNegative: lowStockCount < 0,
      },
      {
        title: "SKUs críticos",
        value: `${criticalCount}`,
        isNegative: criticalCount < 0,
      },
      {
        title: "Movimientos 24h",
        value: `${recentMovementsCount}`,
        isNegative: recentMovementsCount < 0,
      },
    ];
  }, [overview, inventoryPage]);

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

  const submitRecountLine = async (productId: number): Promise<boolean> => {
    if (!token || !selectedRecountId) return false;
    if (
      !recountDetail ||
      recountDetail.recount.status === "applied" ||
      recountDetail.recount.status === "cancelled"
    ) {
      setRecountFeedback("Este recuento ya no acepta edición.");
      return false;
    }
    const draft = recountCountedDraft[productId];
    const counted = Number(draft);
    if (!Number.isFinite(counted) || counted < 0 || !Number.isInteger(counted)) {
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
      setRecountDetail((prev) => {
        if (!prev) return prev;
        const nextLines = prev.lines.map((line) =>
          line.product_id === productId
            ? {
                ...line,
                counted_qty: savedLine.counted_qty ?? counted,
                diff_qty:
                  savedLine.counted_qty != null
                    ? Number(savedLine.counted_qty) - Number(line.system_qty)
                    : null,
                counted_at: savedLine.counted_at ?? line.counted_at,
                counted_by_user_id: savedLine.counted_by_user_id ?? line.counted_by_user_id,
              }
            : line
        );
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
        const totalLines = prev.recount.summary.total_lines;
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
      return true;
    } catch (err) {
      setRecountFeedback(err instanceof Error ? err.message : "No se pudo guardar la línea.");
      return false;
    } finally {
      setRecountLineSavingId(null);
    }
  };

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
      const scopeLabel =
        recountDetail.recount.scope_type === "group"
          ? `Categoría: ${recountDetail.recount.scope_value || "-"}`
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
  <h1>${escapeHtml(recountDetail.recount.code)} · ${escapeHtml(title)}</h1>
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

  return (
    <div className="space-y-4">
      <section className="px-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-semibold leading-none text-slate-900">Movimientos</h1>
            <p className="text-sm leading-none text-slate-600">Control y trazabilidad de inventario.</p>
          </div>
          {isRecountDocumentFocused ? (
            <button
              onClick={() => setRecountView("home")}
              className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Volver a recuentos
            </button>
          ) : null}
        </div>
      </section>

      {!isRecountDocumentFocused ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                aria-current={activeTab === tab.key ? "page" : undefined}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  activeTab === tab.key
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === "summary" ? (
        <section className="space-y-4">
          <div className="flex gap-3 overflow-x-auto pb-1">
            {summaryCards.map((card) => (
              <div
                key={card.title}
                className="min-w-[230px] flex-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">{card.title}</p>
                <p
                  className={`mt-2 text-xl font-semibold ${
                    card.isNegative ? "text-rose-700" : "text-slate-900"
                  }`}
                >
                  {card.value}
                </p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">Movimientos recientes</h2>
              <div className="mt-4 space-y-2">
                {overviewLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <div
                        key={`mv-skeleton-${index}`}
                        className="h-16 animate-pulse rounded-lg border border-slate-200 bg-slate-100"
                      />
                    ))}
                  </div>
                ) : overviewError ? (
                  <p className="text-sm text-rose-600">{overviewError}</p>
                ) : (overview?.recent_movements ?? []).length === 0 ? (
                  <p className="text-sm text-slate-500">Sin movimientos recientes.</p>
                ) : (
                  (overview?.recent_movements ?? []).map((row) => (
                    <div
                      key={row.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-900">{row.product_name}</p>
                        <p className="text-xs text-slate-500">
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
                      <div className="text-right">
                        <p className={`text-sm font-semibold ${row.qty_delta < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                          {row.qty_delta > 0 ? "+" : ""}
                          {formatQty(row.qty_delta)}
                        </p>
                        <p className="text-xs text-slate-500">{formatDate(row.created_at)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-slate-900">Últimas entradas de Stock</h2>
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
              <div className="mt-4 space-y-2">
                {latestEntriesLoading ? (
                  <p className="text-sm text-slate-500">Cargando entradas...</p>
                ) : latestEntriesError ? (
                  <p className="text-sm text-rose-600">{latestEntriesError}</p>
                ) : latestEntriesVisible.length === 0 ? (
                  <p className="text-sm text-slate-500">No hay entradas recientes.</p>
                ) : (
                  latestEntriesVisible.map((row) => (
                    <div
                      key={row.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-900">{row.product_name}</p>
                        <p className="text-xs text-slate-500">
                          {resolveEntrySourceLabel(row)} · {formatDate(row.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-7 w-[116px] items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-2 text-sm font-semibold text-emerald-700">
                          Entrada
                        </span>
                        <span className="text-sm font-semibold text-emerald-700 tabular-nums">
                          +{formatQty(row.qty_delta)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "inventory" ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Inventario</h2>
              <p className="text-sm text-slate-600">
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
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Limpiar filtros
              </button>
              <button
                onClick={openInventoryExportModal}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Exportar búsqueda
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-5">
            <input
              value={inventorySearch}
              onChange={(e) => setInventorySearch(e.target.value)}
              placeholder="Buscar por nombre, SKU o código"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 lg:col-span-2"
            />
            <select
              value={inventoryGroupFilter}
              onChange={(e) => setInventoryGroupFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
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
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            >
              <option value="all">Todos los stocks</option>
              <option value="positive">Stock positivo</option>
              <option value="zero">Stock en cero</option>
              <option value="negative">Stock negativo</option>
            </select>
            <select
              value={inventoryStatusFilter}
              onChange={(e) => setInventoryStatusFilter(e.target.value as StatusFilter)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            >
              <option value="all">Todos los estados</option>
              <option value="ok">Saludable</option>
              <option value="low">Bajo stock</option>
              <option value="critical">Crítico</option>
              <option value="negative">Negativo</option>
            </select>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-4">
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
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
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
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            >
              <option value={50}>50 por página</option>
              <option value={100}>100 por página</option>
              <option value={200}>200 por página</option>
            </select>
            <div className="text-sm text-slate-600 lg:col-span-2">
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

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              onClick={() => setInventoryPageNo(1)}
              disabled={inventoryPageNo <= 1}
              className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-40"
            >
              ⇤ Primera
            </button>
            <button
              onClick={() => setInventoryPageNo((prev) => Math.max(1, prev - 1))}
              disabled={inventoryPageNo <= 1}
              className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-40"
            >
              ← Anterior
            </button>
            <button
              onClick={() => setInventoryPageNo((prev) => Math.min(inventoryPages, prev + 1))}
              disabled={inventoryPageNo >= inventoryPages}
              className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-40"
            >
              Siguiente →
            </button>
            <button
              onClick={() => setInventoryPageNo(inventoryPages)}
              disabled={inventoryPageNo >= inventoryPages}
              className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-40"
            >
              Última ⇥
            </button>
          </div>

          <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full table-fixed">
              <colgroup>
                <col style={{ width: "24%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "15%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "8%" }} />
              </colgroup>
              <thead className="bg-slate-50">
                <tr className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                  <th className="px-3 py-3 text-left">Producto</th>
                  <th className="px-3 py-3 text-left">SKU</th>
                  <th className="px-3 py-3 text-left">Categoría</th>
                  <th className="px-3 py-3 text-center">Stock</th>
                  <th className="px-3 py-3 text-left">Estado</th>
                  <th className="px-3 py-3 text-left">Costo en stock</th>
                  <th className="px-3 py-3 text-left">Precio en stock</th>
                  <th className="px-3 py-3 text-left">Último mov.</th>
                  <th className="px-3 py-3 text-left" />
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
                  inventoryItems.map((row, index) => {
                    const status = resolveStatus(row);
                    const rowBg = index % 2 === 0 ? "bg-white" : "bg-slate-100";
                    return (
                      <tr key={row.product_id} className="group text-sm">
                        <td className={`${rowBg} px-3 py-3 transition-colors group-hover:bg-sky-50/60`}>
                          <span
                            className={`block truncate font-medium ${
                              row.qty_on_hand < 0 ? "text-rose-600" : "text-slate-900"
                            }`}
                            title={row.product_name}
                          >
                            {row.product_name}
                          </span>
                        </td>
                        <td className={`${rowBg} px-3 py-3 transition-colors group-hover:bg-sky-50/60`}>
                          <span className="block truncate text-slate-600" title={row.sku || "-"}>
                            {row.sku || "-"}
                          </span>
                        </td>
                        <td className={`${rowBg} px-3 py-3 transition-colors group-hover:bg-sky-50/60`}>
                          <span
                            className="block truncate text-slate-600"
                            title={row.group_name || "Sin categoría"}
                          >
                            {row.group_name || "Sin categoría"}
                          </span>
                        </td>
                        <td
                          className={`${rowBg} px-3 py-3 text-center font-semibold tabular-nums transition-colors group-hover:bg-sky-50/60 ${
                            row.qty_on_hand < 0 ? "text-rose-700" : "text-slate-800"
                          }`}
                        >
                          {formatQty(row.qty_on_hand)}
                        </td>
                        <td className={`${rowBg} px-3 py-3 transition-colors group-hover:bg-sky-50/60`}>
                          <span className={badgeClass(status)}>{statusLabel(status)}</span>
                        </td>
                        <td
                          className={`${rowBg} px-3 py-3 text-slate-700 tabular-nums transition-colors group-hover:bg-sky-50/60`}
                        >
                          <span
                            className={`block ${
                              row.cost * row.qty_on_hand < 0 ? "text-rose-600" : "text-slate-700"
                            }`}
                          >
                            {formatMoney(row.cost * row.qty_on_hand)}
                          </span>
                          <span className="text-xs text-slate-500">
                            Unit: {formatMoney(row.cost)}
                          </span>
                        </td>
                        <td
                          className={`${rowBg} px-3 py-3 text-slate-700 tabular-nums transition-colors group-hover:bg-sky-50/60`}
                        >
                          <span
                            className={`block ${
                              row.price * row.qty_on_hand < 0 ? "text-rose-600" : "text-slate-700"
                            }`}
                          >
                            {formatMoney(row.price * row.qty_on_hand)}
                          </span>
                          <span className="text-xs text-slate-500">
                            Unit: {formatMoney(row.price)}
                          </span>
                        </td>
                        <td
                          className={`${rowBg} px-3 py-3 text-slate-600 transition-colors group-hover:bg-sky-50/60`}
                        >
                          {row.last_movement_at ? formatDate(row.last_movement_at) : "-"}
                        </td>
                        <td className={`${rowBg} px-3 py-3 transition-colors group-hover:bg-sky-50/60`}>
                          <button
                            onClick={() => openHistory(row.product_id)}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
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

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              onClick={() => setInventoryPageNo(1)}
              disabled={inventoryPageNo <= 1}
              className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-40"
            >
              ⇤ Primera
            </button>
            <button
              onClick={() => setInventoryPageNo((prev) => Math.max(1, prev - 1))}
              disabled={inventoryPageNo <= 1}
              className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-40"
            >
              ← Anterior
            </button>
            <button
              onClick={() => setInventoryPageNo((prev) => Math.min(inventoryPages, prev + 1))}
              disabled={inventoryPageNo >= inventoryPages}
              className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-40"
            >
              Siguiente →
            </button>
            <button
              onClick={() => setInventoryPageNo(inventoryPages)}
              disabled={inventoryPageNo >= inventoryPages}
              className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-40"
            >
              Última ⇥
            </button>
          </div>
        </section>
      ) : null}

      {activeTab === "movements" ? (
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Formularios de movimientos manuales
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Selecciona el tipo de operación y abre su formulario en una vista separada.
                </p>
              </div>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
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
                    className="mt-2 inline-flex rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-wait disabled:opacity-70"
                  >
                    {openingFormKind === kind.id ? "Abriendo..." : "Abrir formulario"}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Documentos abiertos o en curso
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Seguimiento de documentos activos (recepciones y salidas manuales por ahora).
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {openReceivingLotsLoading ? (
                  <p className="text-sm text-slate-500">Cargando documentos abiertos...</p>
                ) : openReceivingLotsError ? (
                  <p className="text-sm text-rose-600">{openReceivingLotsError}</p>
                ) : openDocsSorted.length === 0 ? (
                  <p className="text-sm text-slate-500">No hay documentos en curso en este momento.</p>
                ) : (
                  <>
                    {openDocsSorted.map((entry) =>
                      entry.type === "receiving" ? (
                        <div
                          key={`rc-${entry.lot.id}`}
                          className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-3 py-2"
                        >
                          {(() => {
                            const lot = entry.lot;
                            const isWebOrigin =
                              (lot.origin_name || "").trim().toLowerCase() === WEB_RECEIVING_ORIGIN;
                            return (
                              <>
                                <div className="text-sm text-slate-700">
                                  <span className="font-semibold text-slate-900">{lot.lot_number}</span>
                                  <span className="mx-2 text-slate-400">·</span>
                                  <span>Recepción</span>
                                  <span className="mx-2 text-slate-400">·</span>
                                  <span>{lot.purchase_type === "invoice" ? "Factura" : "Efectivo"}</span>
                                  <span className="mx-2 text-slate-400">·</span>
                                  <span>{formatDate(lot.created_at)}</span>
                                  <span className="mx-2 text-slate-400">·</span>
                                  <span>Inició: {lot.created_by_user_name || "Usuario no disponible"}</span>
                                  {!isWebOrigin ? (
                                    <>
                                      <span className="mx-2 text-slate-400">·</span>
                                      <span className="text-amber-700">Solo lectura (creado en app)</span>
                                    </>
                                  ) : null}
                                </div>
                                <div className="ml-auto flex items-center justify-end gap-2">
                                  {isWebOrigin ? (
                                    <>
                                      <button
                                        onClick={() => router.push(`/dashboard/movements/form/entrada_manual?lotId=${lot.id}`)}
                                        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                                      >
                                        Continuar
                                      </button>
                                      <button
                                        onClick={() => void handleCancelOpenReception(lot.id, lot.lot_number)}
                                        disabled={cancellingLotId === lot.id}
                                        className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 disabled:opacity-50"
                                      >
                                        {cancellingLotId === lot.id ? "Cancelando..." : "Cancelar"}
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      onClick={() => void openLotDetail(lot.id)}
                                      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
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
                          className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-3 py-2"
                        >
                          <div className="text-sm text-slate-700">
                            <span className="font-semibold text-slate-900">{entry.doc.document_number}</span>
                            <span className="mx-2 text-slate-400">·</span>
                            <span>{manualKindLabel[entry.doc.kind]}</span>
                            <span className="mx-2 text-slate-400">·</span>
                            <span>
                              {String(
                                (entry.doc.header?.exit_type as string) ||
                                  (entry.doc.header?.movement_type as string) ||
                                  "Sin tipo"
                              )}
                            </span>
                            <span className="mx-2 text-slate-400">·</span>
                            <span>{formatDate(entry.doc.created_at)}</span>
                            <span className="mx-2 text-slate-400">·</span>
                            <span>Inició: {entry.doc.created_by_user_name || "Usuario no disponible"}</span>
                          </div>
                          <div className="ml-auto flex items-center justify-end gap-2">
                            <button
                              onClick={() => router.push(`/dashboard/movements/form/${entry.doc.kind}?docId=${entry.doc.id}`)}
                              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
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
                              className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700"
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

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Documentos cerrados recientes
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Últimos documentos cerrados para consulta rápida.
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {closedReceivingLotsLoading ? (
                  <p className="text-sm text-slate-500">Cargando documentos cerrados...</p>
                ) : closedReceivingLotsError ? (
                  <p className="text-sm text-rose-600">{closedReceivingLotsError}</p>
                ) : closedDocsVisible.length === 0 ? (
                  <p className="text-sm text-slate-500">No hay documentos cerrados recientes.</p>
                ) : (
                  <>
                    {closedDocsVisible.map((entry) =>
                      entry.type === "receiving" ? (
                        <div
                          key={`rc-closed-${entry.lot.id}`}
                          className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-3 py-2"
                        >
                          <div className="text-sm text-slate-700">
                            <span className="font-semibold text-slate-900">{entry.lot.lot_number}</span>
                            <span className="mx-2 text-slate-400">·</span>
                            <span>Recepción</span>
                            <span className="mx-2 text-slate-400">·</span>
                            <span>{entry.lot.purchase_type === "invoice" ? "Factura" : "Efectivo"}</span>
                            <span className="mx-2 text-slate-400">·</span>
                            <span>{formatDate(entry.lot.closed_at || entry.lot.updated_at)}</span>
                          </div>
                          <div className="ml-auto flex items-center justify-end gap-2">
                            <button
                              onClick={() => void openLotDetail(entry.lot.id)}
                              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            >
                              Ver detalle
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          key={`sm-closed-${entry.doc.id}`}
                          className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-3 py-2"
                        >
                          <div className="text-sm text-slate-700">
                            <span className="font-semibold text-slate-900">{entry.doc.document_number}</span>
                            <span className="mx-2 text-slate-400">·</span>
                            <span>{manualKindLabel[entry.doc.kind]}</span>
                            <span className="mx-2 text-slate-400">·</span>
                            <span>
                              {String(
                                (entry.doc.header?.exit_type as string) ||
                                  (entry.doc.header?.movement_type as string) ||
                                  "Sin tipo"
                              )}
                            </span>
                            <span className="mx-2 text-slate-400">·</span>
                            <span>{formatDate(entry.doc.closed_at || entry.doc.updated_at)}</span>
                          </div>
                          <div className="ml-auto flex items-center justify-end gap-2">
                            <button
                              onClick={() => void openManualDetail(entry.doc.id)}
                              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
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
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Recuentos de inventario</h2>
          <p className="mt-1 text-sm text-slate-600">
            Crea documentos de conteo, captura cantidades y aplica diferencias con trazabilidad.
          </p>

          {recountView === "form" ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Formulario de nuevo recuento (Web)</h3>
                  <p className="text-sm text-slate-600">
                    Configura alcance y crea el documento. Al crear, se abre de inmediato para captura manual.
                  </p>
                </div>
                <button
                  onClick={() => setRecountView("home")}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-white"
                >
                  Volver
                </button>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="block text-sm text-slate-700">
                  Título (opcional)
                  <input
                    value={newRecountTitle}
                    onChange={(e) => setNewRecountTitle(e.target.value)}
                    placeholder="Ej: Conteo bodega marzo"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                </label>
                <label className="block text-sm text-slate-700">
                  Modo de conteo
                  <select
                    value={newRecountMode}
                    onChange={(e) => setNewRecountMode(e.target.value as "blind" | "visible")}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  >
                    <option value="blind">Ciego (recomendado)</option>
                    <option value="visible">Visible</option>
                  </select>
                </label>
                <label className="block text-sm text-slate-700">
                  Alcance
                  <select
                    value={newRecountScopeType}
                    onChange={(e) => setNewRecountScopeType(e.target.value as "all" | "group")}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  >
                    <option value="all">Inventario completo</option>
                    <option value="group">Solo una categoría</option>
                  </select>
                </label>
                {newRecountScopeType === "group" ? (
                  <label className="block text-sm text-slate-700">
                    Categoría
                    <select
                      value={newRecountScopeValue}
                      onChange={(e) => setNewRecountScopeValue(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
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
              <label className="mt-3 block text-sm text-slate-700">
                Notas
                <textarea
                  value={newRecountNotes}
                  onChange={(e) => setNewRecountNotes(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
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
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-white"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={submitCreateRecount}
                    disabled={creatingRecount || recountCreationBlocked}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {creatingRecount ? "Creando..." : "Crear y abrir documento"}
                  </button>
                </div>
              </div>
            </div>
          ) : recountView === "document" ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Documento de recuento</h3>
                  <p className="text-sm text-slate-600">Captura, revisión y cierre en vista dedicada.</p>
                </div>
                <button
                  onClick={() => setRecountView("home")}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Volver a recuentos
                </button>
              </div>
              {!selectedRecountId ? (
                <p className="text-sm text-slate-600">No hay documento seleccionado.</p>
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
                  <p className="text-sm text-slate-500">Cargando detalle...</p>
                </div>
              ) : recountDetailError ? (
                <p className="text-sm text-rose-600">{recountDetailError}</p>
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
                        <h3 className="text-base font-semibold text-slate-900">
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
                      <p className="text-sm text-slate-600">
                        Estado: {statusLabelRecount(recountDetail.recount.status)} · Modo:{" "}
                        {recountDetail.recount.count_mode === "blind" ? "Ciego" : "Visible"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {showPrintFormButton ? (
                        <button
                          onClick={() => void printSelectedRecountSheet("all", "form")}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Imprimir formulario
                        </button>
                      ) : null}
                      {showPrintReportButton ? (
                        <button
                          onClick={() => setRecountPrintModalOpen(true)}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
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
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                      >
                        {recountActionLoading === "close" ? "Cerrando..." : "Cerrar recuento"}
                      </button>
                      <button
                        onClick={applySelectedRecount}
                        disabled={
                          recountActionLoading !== null ||
                          recountDetail.recount.status !== "closed"
                        }
                        className="rounded-lg border border-emerald-500 bg-emerald-500 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:border-emerald-600 hover:bg-emerald-600 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
                      >
                        {recountActionLoading === "apply" ? "Aplicando..." : "Aplicar ajustes"}
                      </button>
                    </div>
                  </div>
                    );
                  })()}

                  {(recountDetail.recount.status === "draft" || recountDetail.recount.status === "counting") ? (
                    <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      Recuento en captura: puedes registrar conteos manuales en web e imprimir formulario las veces que necesites para conteo físico en tienda.
                    </div>
                  ) : null}
                  {recountDetail.recount.status === "closed" ? (
                    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                      Siguiente paso natural: revisar diferencias y luego aplicar ajustes para actualizar stock.
                    </div>
                  ) : null}
                  {recountDetail.recount.status === "applied" ? (
                    <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                      Ajustes aplicados. Este recuento quedó en solo lectura para trazabilidad.
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
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

                  <div className="mt-4 flex flex-wrap items-center gap-2">
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
                    <input
                      value={recountSearch}
                      onChange={(e) => setRecountSearch(e.target.value)}
                      placeholder="Buscar línea registrada por nombre, SKU o código"
                      className="min-w-[280px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                    />
                  </div>

                  <div className="mt-4 max-h-[520px] overflow-auto rounded-lg border border-slate-200">
                    <table className="w-full table-fixed">
                      <thead className="bg-slate-50 text-xs uppercase tracking-[0.06em] text-slate-600">
                        <tr>
                          <th className="px-3 py-2 text-left">Producto</th>
                          <th className="px-3 py-2 text-right">Sistema</th>
                          <th className="px-3 py-2 text-right">Contado</th>
                          <th className="px-3 py-2 text-right">Dif.</th>
                          <th className="px-3 py-2 text-right" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-sm">
                        {recountLinesVisible.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">
                              No hay líneas para el filtro seleccionado.
                            </td>
                          </tr>
                        ) : recountLinesVisible.map((line) => {
                          const visibleIndex = recountLinesVisible.findIndex(
                            (candidate) => candidate.product_id === line.product_id
                          );
                          const draft = recountCountedDraft[line.product_id] ?? "";
                          const counted = draft === "" ? null : Number(draft);
                          const diff = counted == null || Number.isNaN(counted) ? null : counted - line.system_qty;
                          return (
                            <tr key={line.id} className="odd:bg-white even:bg-slate-50">
                              <td className="px-3 py-2">
                                <p className="truncate font-medium text-slate-900">{line.product_name}</p>
                                <p className="text-xs text-slate-500">{line.sku || "-"}</p>
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                                {formatQty(line.system_qty)}
                              </td>
                              <td className="px-3 py-2 text-right">
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
                                  disabled={["applied", "cancelled"].includes(recountDetail.recount.status)}
                                  className="w-24 rounded border border-slate-300 px-2 py-1 text-right tabular-nums text-slate-900"
                                />
                              </td>
                              <td
                                className={`px-3 py-2 text-right tabular-nums ${
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
                              <td className="px-3 py-2 text-right">
                                <button
                                  onClick={() => void submitRecountLine(line.product_id)}
                                  disabled={
                                    recountLineSavingId === line.product_id ||
                                    ["applied", "cancelled"].includes(recountDetail.recount.status)
                                  }
                                  className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                                >
                                  {recountLineSavingId === line.product_id ? "Guardando..." : "Guardar"}
                                </button>
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
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-semibold text-slate-900">Iniciar recuento desde web</h3>
                <p className="mt-1 text-sm text-slate-600">
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
                  className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Iniciar formulario
                </button>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Documentos abiertos o en curso</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Incluye borradores, en captura y cerrados pendientes de aplicar al stock.
                  </p>
                  <div className="mt-3 space-y-2">
                    {recountDocsLoading ? (
                      <p className="text-sm text-slate-500">Cargando recuentos...</p>
                    ) : recountDocsError ? (
                      <p className="text-sm text-rose-600">{recountDocsError}</p>
                    ) : openRecountDocs.length === 0 ? (
                      <p className="text-sm text-slate-500">No hay recuentos abiertos.</p>
                    ) : (
                      openRecountDocs.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{doc.code}</p>
                            <p className="text-xs text-slate-600">
                              {statusLabelRecount(doc.status)} · {doc.summary.counted_lines}/{doc.summary.total_lines} líneas
                            </p>
                            {doc.status === "closed" ? (
                              <p className="mt-0.5 text-[11px] font-medium text-amber-700">
                                Pendiente de aplicar ajustes
                              </p>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2">
                            {doc.source === "web" ? (
                              <button
                                onClick={() => {
                                  setSelectedRecountId(doc.id);
                                  setRecountView("document");
                                }}
                                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                              >
                                Continuar
                              </button>
                            ) : (
                              <span className="rounded-md border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-500">
                                En app/tablet
                              </span>
                            )}
                            <button
                              onClick={() => void closeRecountFromList(doc)}
                              disabled={
                                closingRecountId === doc.id ||
                                !["draft", "counting"].includes(doc.status)
                              }
                              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                            >
                              {closingRecountId === doc.id ? "Cerrando..." : "Cerrar"}
                            </button>
                            <button
                              onClick={() => void applyRecountFromList(doc)}
                              disabled={applyingRecountId === doc.id || doc.status !== "closed"}
                              className="rounded-md border border-emerald-500 bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:border-emerald-600 hover:bg-emerald-600 disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
                            >
                              {applyingRecountId === doc.id ? "Aplicando..." : "Aplicar"}
                            </button>
                            <button
                              onClick={() => void cancelOpenRecountFromList(doc)}
                              disabled={
                                cancellingRecountId === doc.id ||
                                !["draft", "counting", "closed"].includes(doc.status)
                              }
                              className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
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
                  <p className="mt-1 text-sm text-slate-600">
                    Solo recuentos aplicados al stock para consulta y trazabilidad.
                  </p>
                  <div className="mt-3 space-y-2">
                    {recountDocsLoading ? (
                      <p className="text-sm text-slate-500">Cargando recuentos...</p>
                    ) : recountDocsError ? (
                      <p className="text-sm text-rose-600">{recountDocsError}</p>
                    ) : closedRecountDocs.length === 0 ? (
                      <p className="text-sm text-slate-500">No hay recuentos cerrados recientes.</p>
                    ) : (
                      closedRecountDocs.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{doc.code}</p>
                            <p className="text-xs text-slate-600">
                              {statusLabelRecount(doc.status)} · {doc.summary.counted_lines}/{doc.summary.total_lines} líneas
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              setSelectedRecountId(doc.id);
                              setRecountView("document");
                            }}
                            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
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
          {recountFeedback ? <p className="mt-4 text-sm text-slate-700">{recountFeedback}</p> : null}
        </section>
      ) : null}

      {activeTab === "receptions" ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Recepciones (Metrik Stock)</h2>
              <p className="text-sm text-slate-600">
                Consulta de lotes cerrados y soportes documentales sincronizados desde móvil.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <label className="text-sm text-slate-700">
              Desde
              <input
                type="date"
                value={receivingDateFrom}
                onChange={(e) => setReceivingDateFrom(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </label>
            <label className="text-sm text-slate-700">
              Hasta
              <input
                type="date"
                value={receivingDateTo}
                onChange={(e) => setReceivingDateTo(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </label>
            <div className="md:col-span-2 flex items-end gap-2">
              <button
                onClick={() => setReceivingPage(1)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                Aplicar filtros
              </button>
              <button
                onClick={() => {
                  setReceivingDateFrom("");
                  setReceivingDateTo("");
                  setReceivingPage(1);
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                Limpiar
              </button>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
            <div className="grid grid-cols-[0.8fr_0.7fr_0.9fr_0.8fr_0.9fr_0.9fr_0.8fr] gap-3 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
              <span>Lote</span>
              <span>Tipo</span>
              <span>Origen</span>
              <span>Ítems / uds</span>
              <span>Factura</span>
              <span>Cerrado</span>
              <span></span>
            </div>
            <div className="divide-y divide-slate-200 bg-white">
              {receivingLoading ? (
                <div className="px-4 py-6 text-sm text-slate-500">Cargando recepciones...</div>
              ) : receivingError ? (
                <div className="px-4 py-6 text-sm text-rose-600">{receivingError}</div>
              ) : (receivingDocs?.items ?? []).length === 0 ? (
                <div className="px-4 py-6 text-sm text-slate-500">No hay lotes cerrados en ese rango.</div>
              ) : (
                (receivingDocs?.items ?? []).map((row) => (
                  <div
                    key={row.id}
                    className="grid grid-cols-[0.8fr_0.7fr_0.9fr_0.8fr_0.9fr_0.9fr_0.8fr] items-center gap-3 px-4 py-3 text-sm"
                  >
                    <span className="font-medium text-slate-900">{row.lot_number}</span>
                    <span className="text-slate-700">{row.purchase_type === "invoice" ? "Factura" : "Efectivo"}</span>
                    <span className="text-slate-600">{row.origin_name}</span>
                    <span className="text-slate-600">{row.lines_count} / {formatQty(row.units_total)}</span>
                    <span className="text-slate-600">{row.invoice_reference || "-"}</span>
                    <span className="text-slate-600">{row.closed_at ? formatDate(row.closed_at) : "-"}</span>
                    <div className="flex items-center justify-end gap-2">
                      {row.support_file_name ? (
                        <button
                          onClick={() => handleDownloadSupport(row.id, row.lot_number)}
                          className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                        >
                          Soporte
                        </button>
                      ) : null}
                      <button
                        onClick={() => openLotDetail(row.id)}
                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                      >
                        Ver
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              onClick={() => setReceivingPage((prev) => Math.max(1, prev - 1))}
              disabled={receivingPage <= 1}
              className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-700 disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              onClick={() => {
                const total = receivingDocs?.total ?? 0;
                const pages = Math.max(1, Math.ceil(total / receivingLimit));
                setReceivingPage((prev) => Math.min(pages, prev + 1));
              }}
              className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-700 disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </section>
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
                                params.set("term", move.reference_label || "");
                                params.set("type", mapHistoryReferenceToDocumentsType(move.reference_type));
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
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    <span className="font-medium">Inició:</span>{" "}
                    {lotDetail.lot.created_by_user_name || "Usuario no disponible"}
                    <span className="mx-2 text-slate-400">|</span>
                    <span className="font-medium">Cerró:</span>{" "}
                    {lotDetail.lot.closed_by_user_name || "Usuario no disponible"}
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
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    <span className="font-medium">Inició:</span>{" "}
                    {manualDetail.document.created_by_user_name || "Usuario no disponible"}
                    <span className="mx-2 text-slate-400">|</span>
                    <span className="font-medium">Cerró:</span>{" "}
                    {manualDetail.document.closed_by_user_name || "Usuario no disponible"}
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

function mapHistoryReferenceToDocumentsType(referenceType?: string | null) {
  const normalized = (referenceType || "").trim().toLowerCase();
  if (normalized === "sale") return "venta";
  if (normalized === "receiving_lot") return "recepcion";
  if (["salida_manual", "venta_manual", "ajuste", "perdida_dano"].includes(normalized)) {
    return "movimiento_manual";
  }
  return "all";
}

function badgeClass(status: StatusFilter) {
  const base =
    "inline-flex h-7 w-[116px] items-center justify-center rounded-full border px-2 text-sm font-semibold leading-none";
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

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

"use client";

/* eslint-disable @next/next/no-img-element */

import React, {
  useEffect,
  useMemo,
  useState,
  ChangeEvent,
  FormEvent,
  useCallback,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { useRouter, useSearchParams } from "next/navigation";
import {
  usePos,
  POS_DISPLAY_NAME,
  type SurchargeMethod,
} from "./poscontext";
import type { Product, CartItem } from "./poscontext";
import { getApiBase } from "@/lib/api/base";
import { useAuth } from "../providers/AuthProvider";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import {
  getPendingSales,
  removePendingSale,
  submitPendingSale,
  PENDING_SALES_EVENT,
  PENDING_SALES_STORAGE_KEY,
  type PendingSaleRecord,
} from "@/lib/pos/pendingSales";
import { fetchPosSettings, PosSettingsPayload } from "@/lib/api/settings";
import {
  fetchSeparatedOrders,
  type SeparatedOrder,
  type SeparatedOrderPayment,
} from "@/lib/api/separatedOrders";
import { usePaymentMethodsCatalog } from "@/app/hooks/usePaymentMethodsCatalog";
import type { PaymentMethodRecord } from "@/lib/api/paymentMethods";
import { renderClosureTicket } from "@/lib/printing/saleTicket";
import {
  buildBogotaDateFromKey,
  formatBogotaDate,
  getBogotaDateKey,
  getBogotaDateParts,
} from "@/lib/time/bogota";
import {
  getPosStationAccess,
  type PosStationAccess,
  formatPosDisplayName,
  getStoredPosMode,
  setStoredPosMode,
  isValidPosMode,
  getWebPosStation,
  subscribeToPosStationChanges,
  type PosAccessMode,
  fetchPosStationPrinterConfig,
  updatePosStationPrinterConfig,
  type PosStationPrinterConfig,
} from "@/lib/api/posStations";

const PENDING_ALERT_ACK_STORAGE_KEY = "metrik_pos_pending_ack_v1";

type DiscountScope = "item" | "cart";
type DiscountMode = "value" | "percent";

type ClosureFormState = {
  totalAmount: number;
  totalCash: number;
  totalCard: number;
  totalQr: number;
  totalNequi: number;
  totalDaviplata: number;
  totalCredit: number;
  totalRefunds: number;
  changeExtraTotal: number;
  changeRefundTotal: number;
  changeCount: number;
  countedCash: number;
  notes: string;
};
type UserContribution = {
  name: string;
  total: number;
};

type PosClosureResult = {
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
  closed_by_user_id: number;
  closed_by_user_name: string;
  separated_summary?: {
    tickets: number;
    payments_total: number;
    reserved_total: number;
    pending_total: number;
  } | null;
  adjusted_totals?: ClosureAdjustedTotals | null;
  custom_methods?: ClosureCustomMethod[] | null;
};

const initialClosureForm: ClosureFormState = {
  totalAmount: 0,
  totalCash: 0,
  totalCard: 0,
  totalQr: 0,
  totalNequi: 0,
  totalDaviplata: 0,
  totalCredit: 0,
  totalRefunds: 0,
  changeExtraTotal: 0,
  changeRefundTotal: 0,
  changeCount: 0,
  countedCash: 0,
  notes: "",
};
type ClosureSale = {
  id: number;
  created_at: string;
  closure_id?: number | null;
  status?: string | null;
  pos_name?: string | null;
  total?: number;
  payment_method: string;
  payments?: { id?: number; method: string; amount: number }[];
  refunded_total?: number | null;
  refunded_balance?: number | null;
  vendor_name?: string | null;
  is_separated?: boolean;
  initial_payment_method?: string | null;
  initial_payment_amount?: number | null;
  balance?: number | null;
  station_id?: string | null;
};

type ClosureReturnPayment = {
  method: string;
  amount: number;
};

type ClosureReturnRecord = {
  id: number;
  created_at?: string;
  closure_id?: number | null;
  sale_id?: number;
  status?: string | null;
  pos_name?: string | null;
  station_id?: string | null;
  total_refund?: number | null;
  payments?: ClosureReturnPayment[];
  vendor_name?: string | null;
};

type ClosureChangePayment = {
  method: string;
  amount: number;
};

type ClosureChangeRecord = {
  id: number;
  created_at?: string;
  closure_id?: number | null;
  sale_id?: number;
  status?: string | null;
  pos_name?: string | null;
  station_id?: string | null;
  extra_payment?: number | null;
  refund_due?: number | null;
  payments?: ClosureChangePayment[];
};

type TotalsByMethod = {
  cash: number;
  card: number;
  qr: number;
  nequi: number;
  daviplata: number;
  credit: number;
};

type ClosureSeparatedOverview = {
  tickets: number;
  reservedTotal: number;
  pendingTotal: number;
  paymentsTotal: number;
};

type ClosureCustomMethod = {
  label: string;
  amount: number;
  slug?: string | null;
};

type ClosureAdjustedTotals = {
  total_amount: number;
  total_cash: number;
  total_card: number;
  total_qr: number;
  total_nequi: number;
  total_daviplata: number;
  total_credit: number;
  total_refunds: number;
  net_amount: number;
  change_extra_total?: number;
  change_refund_total?: number;
  change_count?: number;
  counted_cash: number;
  difference: number;
};

type ClosureMethodDetail = {
  label: string;
  gross: number;
  refunds: number;
  net: number;
};

type PendingClosureInfo = {
  count: number;
  dateLabel: string;
  dateKey: string;
};

const STANDARD_METHOD_SLUGS = new Set([
  "cash",
  "qr",
  "card",
  "nequi",
  "daviplata",
  "credito",
  "credit",
  "separado",
]);

const formatPriceInputValue = (rawValue: string): string => {
  if (!rawValue) return "";
  const digitsOnly = rawValue.replace(/\D/g, "");
  if (!digitsOnly) return "";
  const normalized =
    digitsOnly.replace(/^0+(?=\d)/, "") || (digitsOnly ? "0" : "");
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

const getLocalDateKey = (value?: string | number | Date) =>
  getBogotaDateKey(value);

const buildDateFromKey = (key: string) => buildBogotaDateFromKey(key);

const formatDateLabelFromKey = (key: string) =>
  formatBogotaDate(buildDateFromKey(key), {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

const formatDateLabelFromIso = (value?: string | null) =>
  value ? formatDateLabelFromKey(getLocalDateKey(value)) : null;

function mapMethodToKey(method: string): keyof TotalsByMethod | null {
  const normalized = method?.toLowerCase() ?? "";
  if (!normalized) return null;
  if (normalized.includes("cash") || normalized.includes("efectivo")) return "cash";
  if (
    normalized.includes("card") ||
    normalized.includes("tarjeta") ||
    normalized.includes("datáfono") ||
    normalized.includes("dataphone")
  )
    return "card";
  if (
    normalized.includes("qr") ||
    normalized.includes("transfer") ||
    normalized.includes("bancolombia") ||
    normalized.includes("consignacion")
  )
    return "qr";
  if (normalized.includes("nequi")) return "nequi";
  if (normalized.includes("davi")) return "daviplata";
  if (
    normalized.includes("credito") ||
    normalized.includes("crédito") ||
    normalized.includes("separado")
  )
    return "credit";
  return null;
}

const normalizeMethodKey = (value: string | null | undefined) =>
  value
    ? value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
    : "";

const slugifyMethodKey = (value: string | null | undefined) => {
  const normalized = normalizeMethodKey(value);
  return normalized.replace(/[^a-z0-9]+/g, "-");
};

// Tile base genérica
// --------- Tipos para el grid del POS ---------
type Path = string[];

type ProductTile = {
  type: "product";
  id: string;        // ej: "p-123"
  product: Product;
};

type GroupTile = {
  type: "group";
  id: string;        // ej: "g-Cámaras", "sg-Megáfonos"
  label: string;
  path: Path;        // ruta completa del grupo / subgrupo
  imageUrl?: string | null;
  color?: string | null;
};

type BackTile = {
  type: "back";
  id: "back";
  label: string;
};

type GridTile = ProductTile | GroupTile | BackTile;

type GroupAppearance = {
  image_url: string | null;
  image_thumb_url: string | null;
  tile_color: string | null;
};



function formatMoney(value: number): string {
  return value.toLocaleString("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatDateTime(value: string): string {
  const formatted = formatBogotaDate(value, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return formatted || value;
}

function parseEmailsList(value: string): string[] {
  return value
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

const roundUpToThousand = (value: number): number => {
  if (value <= 0) return 0;
  return Math.ceil(value / 1000) * 1000;
};

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const CART_PANEL_MIN_PERCENT = 24;
const CART_PANEL_MAX_PERCENT = 58;
const CART_PANEL_DEFAULT_PERCENT = 30;
const CART_PANEL_MIN_WIDTH_PX = 300;
const CART_WIDTH_STORAGE_PREFIX = "posCartPanelWidth";
const GRID_DEFAULT_COLUMNS = 4;
const GRID_MIN_COLUMNS = 2;
const GRID_TILE_TARGET_WIDTH = 240;
const GRID_TILE_MIN_WIDTH = 190;
const GRID_GAP_PX = 16;
const GRID_TILE_HEIGHT_BASE = 190;
const OPENED_NEW_TAB_STORAGE_KEY = "metrik_pos_opened_new_tab";
const GRID_ZOOM_STORAGE_PREFIX = "kensar_pos_grid_zoom";
const GRID_ZOOM_MIN = 0.8;
const GRID_ZOOM_MAX = 1.25;
const GRID_ZOOM_STEP = 0.05;
const GRID_ZOOM_DEFAULT = 1;

const getSurchargeMethodLabel = (method: SurchargeMethod | null) => {
  switch (method) {
    case "addi":
      return "Addi";
    case "sistecredito":
      return "Sistecrédito";
    case "manual":
      return "Manual";
    default:
      return "Incremento";
  }
};

function splitGroupPath(groupName: string | null): string[] | null {
  if (!groupName) return null;
  const parts = groupName
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts : null;
}

export default function PosPage() {
  // --------- Datos base ---------
  const searchParams = useSearchParams();
  const newTabQuery = searchParams.get("newTab") === "1";
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [posMode, setPosMode] = useState<PosAccessMode | null>(null);
  const [stationInfo, setStationInfo] = useState<PosStationAccess | null>(null);
  const [openedAsNewTab, setOpenedAsNewTab] = useState<boolean>(() => {
    if (typeof window === "undefined") return newTabQuery;
    const stored = window.sessionStorage.getItem(OPENED_NEW_TAB_STORAGE_KEY);
    return newTabQuery || stored === "1";
  });
  const resolvedPosName = useMemo(
    () => formatPosDisplayName(stationInfo, POS_DISPLAY_NAME),
    [stationInfo]
  );
  const isStationMode = posMode === "station";
  const isWebMode = posMode === "web";
  const isKioskMode = isStationMode;
  const activeStationId = isStationMode ? stationInfo?.id ?? null : null;
  const normalizePosLabel = useCallback((value?: string | null) => {
    return (value ?? "").replace(/^(pos\s+)+/i, "").trim().toLowerCase();
  }, []);
const matchesStationLabel = useCallback(
    (posName?: string | null) => {
      const label = stationInfo?.label?.trim();
      if (!label) return false;
      const normalizedLabel = normalizePosLabel(label);
      if (!normalizedLabel) return false;
      return normalizePosLabel(posName) === normalizedLabel;
    },
    [normalizePosLabel, stationInfo]
  );
  const isPosWebName = useCallback((name?: string | null) => {
    if (!name) return false;
    return name.toLowerCase().includes("pos web");
  }, []);

  const qzGuideSections = useMemo(
    () => [
      {
        title: "1) Instala QZ Tray",
        items: [
          "Descarga desde https://qz.io/download/.",
          "Instala y deja QZ Tray abierto en segundo plano.",
        ],
      },
      {
        title: "2) Importa el certificado",
        items: [
          "Abre https://api.metrikpos.com/pos/qz/cert y guarda como qz_api.crt.",
          "QZ Tray > Site Manager > + > selecciona qz_api.crt.",
          "En macOS, si falla, usa override.crt (ver nota abajo).",
        ],
      },
      {
        title: "3) Conecta la impresora",
        items: [
          "Selecciona 'Conector local (QZ Tray)'.",
          "Pulsa 'Detectar impresoras' y elige la correcta.",
          "Guarda la configuracion.",
        ],
      },
      {
        title: "Si aparece 'Invalid Signature'",
        items: [
          "El cert importado no coincide con el usado por el backend.",
          "Vuelve a importar qz_api.crt desde el enlace del paso 2.",
        ],
      },
    ],
    []
  );

  // --------- Estado POS (UI) ---------
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [surchargeMenuOpen, setSurchargeMenuOpen] = useState(false);
  const surchargeMenuRef = useRef<HTMLDivElement | null>(null);
  const [customSurchargeValue, setCustomSurchargeValue] = useState("");
  const [customSurchargePercent, setCustomSurchargePercent] = useState("5");
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [groupAppearances, setGroupAppearances] = useState<Record<string, GroupAppearance>>({});
  const [syncingCatalog, setSyncingCatalog] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const imageBaseUrl = useMemo(() => getApiBase(), []);
  const apiBase = useMemo(() => getApiBase(), []);
  const [printerModalOpen, setPrinterModalOpen] = useState(false);
  const [qzGuideOpen, setQzGuideOpen] = useState(false);
  const [availablePrinters, setAvailablePrinters] = useState<string[]>([]);
  const [printerScanMessage, setPrinterScanMessage] = useState<string | null>(null);
  const [printerScanning, setPrinterScanning] = useState(false);
  const [currentTime, setCurrentTime] = useState("");
  const [currentPeriod, setCurrentPeriod] = useState("");
  const [printerConfig, setPrinterConfig] = useState<PosStationPrinterConfig>({
    mode: "qz-tray",
    printerName: "",
    width: "80mm",
    autoOpenDrawer: false,
    showDrawerButton: true,
  });
  const router = useRouter();
  const { token, user, logout } = useAuth();
  const isOnline = useOnlineStatus();
  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : null),
    [token]
  );
  const printerWidthOptions = useMemo(
    () => [
      { value: "80mm", label: "80 mm" },
      { value: "58mm", label: "58 mm" },
    ],
    []
  );

  const {
    cart,
    setCart,
    cartGrossSubtotal,
    cartLineDiscountTotal,
    cartSubtotal,
    cartTotalBeforeSurcharge,
    cartTotal,
    cartDiscountValue,
    cartDiscountPercent,
    setCartDiscountValue,
    setCartDiscountPercent,
    cartSurcharge,
    setCartSurcharge,
    saleNumber,
    clearSale,
    selectedCustomer,
    setSelectedCustomer,
  } = usePos();
  const paymentMethodsCatalog = usePaymentMethodsCatalog();
  const paymentMethodIndex = useMemo(() => {
    const slugMap = new Map<string, PaymentMethodRecord>();
    const nameMap = new Map<string, PaymentMethodRecord>();
    paymentMethodsCatalog.forEach((method) => {
      const slugKey = slugifyMethodKey(method.slug);
      if (slugKey) {
        slugMap.set(slugKey, method);
      }
      const normalizedSlug = normalizeMethodKey(method.slug);
      if (normalizedSlug) {
        slugMap.set(normalizedSlug, method);
      }
      const nameKey = normalizeMethodKey(method.name);
      if (nameKey) {
        nameMap.set(nameKey, method);
      }
    });
    return { slugMap, nameMap };
  }, [paymentMethodsCatalog]);

  useEffect(() => {
    if (!syncStatus) return;
    const timer = setTimeout(() => setSyncStatus(null), 4000);
    return () => clearTimeout(timer);
  }, [syncStatus]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateTime = () => {
      const { hour, minute, second } = getBogotaDateParts();
      const hours = Number(hour);
      const hours12 = hours % 12 || 12;
      const ampm = hours >= 12 ? "PM" : "AM";
      const paddedHours = String(hours12).padStart(2, "0");
      const paddedMinutes = String(minute).padStart(2, "0");
      const paddedSeconds = String(second).padStart(2, "0");
      setCurrentTime(`${paddedHours}:${paddedMinutes}:${paddedSeconds}`);
      setCurrentPeriod(ampm);
    };
    updateTime();
    const interval = window.setInterval(updateTime, 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    handleFullscreenChange();
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const printerStorageKey = useMemo(() => {
    const base = activeStationId ?? "pos-web";
    return `kensar_pos_printer_${base}`;
  }, [activeStationId]);

  useEffect(() => {
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
  }, [printerStorageKey]);

  const savePrinterConfig = useCallback(
    (next: typeof printerConfig) => {
      setPrinterConfig(next);
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(printerStorageKey, JSON.stringify(next));
      } catch (err) {
        console.warn("No se pudo guardar la configuración de impresora", err);
      }
    },
    [printerStorageKey]
  );

  useEffect(() => {
    if (!token) return;
    if (!isStationMode || !activeStationId) return;
    let cancelled = false;
    const loadRemote = async () => {
      try {
        const remote = await fetchPosStationPrinterConfig(
          apiBase,
          token,
          activeStationId
        );
        if (!remote || cancelled) return;
        savePrinterConfig(remote);
      } catch (err) {
        console.warn("No se pudo cargar la impresora guardada", err);
      }
    };
    loadRemote();
    return () => {
      cancelled = true;
    };
  }, [token, apiBase, activeStationId, isStationMode, savePrinterConfig]);

  const persistPrinterConfig = useCallback(
    async (next: PosStationPrinterConfig) => {
      savePrinterConfig(next);
      if (!token) return;
      if (!isStationMode || !activeStationId) return;
      try {
        await updatePosStationPrinterConfig(apiBase, token, activeStationId, next);
      } catch (err) {
        console.warn("No se pudo guardar la impresora en el servidor", err);
      }
    },
    [savePrinterConfig, token, isStationMode, activeStationId, apiBase]
  );

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
  const [qzInstance, setQzInstance] = useState<QzType | null>(() => {
    if (typeof window !== "undefined") {
      const w = window as unknown as { qz?: QzType };
      return w.qz ?? null;
    }
    return null;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const setIfPresent = () => {
      if (cancelled) return;
      const w = window as unknown as { qz?: QzType };
      if (w.qz) setQzInstance(w.qz);
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
  }, []);
  const qzSecurityConfiguredRef = useRef(false);
  const configureQzSecurity = useCallback(() => {
    if (!qzInstance?.security) return true;
    if (!token) return false;
    if (qzSecurityConfiguredRef.current) return true;
    const authHeaders = {
      Authorization: `Bearer ${token}`,
    };
    qzInstance.security.setCertificatePromise(
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
    qzInstance.security.setSignaturePromise(
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
  }, [apiBase, qzInstance, token]);
  useEffect(() => {
    configureQzSecurity();
  }, [configureQzSecurity]);

  const handleScanPrinters = useCallback(async () => {
    if (!qzInstance) {
      setPrinterScanMessage("Instala QZ Tray y autoriza este dominio para listar impresoras.");
      return;
    }
    if (!configureQzSecurity()) {
      setPrinterScanMessage("No se pudo configurar QZ. Verifica tu sesión.");
      return;
    }
    try {
      setPrinterScanning(true);
      setPrinterScanMessage(null);
      if (!qzInstance.websocket.isActive()) {
        await qzInstance.websocket.connect();
      }
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      timeoutId = setTimeout(() => {
        setPrinterScanMessage(
          "QZ Tray no respondió. Verifica que la impresora esté instalada en macOS."
        );
        setPrinterScanning(false);
      }, 8000);
      qzInstance.printers
        .find()
        .then((list: string[]) => {
          if (timeoutId) clearTimeout(timeoutId);
          setAvailablePrinters(list ?? []);
          if (!list?.length) {
            setPrinterScanMessage("No se detectaron impresoras en QZ Tray.");
          }
        })
        .catch((err) => {
          if (timeoutId) clearTimeout(timeoutId);
          console.error(err);
          setPrinterScanMessage(
            err instanceof Error
              ? err.message
              : "No se pudieron listar las impresoras con QZ Tray."
          );
        })
        .finally(() => {
          setPrinterScanning(false);
        });
    } catch (err) {
      console.error(err);
      setPrinterScanMessage(
        err instanceof Error
          ? err.message
          : "No se pudieron listar las impresoras con QZ Tray."
      );
      setPrinterScanning(false);
    }
  }, [qzInstance, configureQzSecurity]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (newTabQuery) {
      setOpenedAsNewTab(true);
      window.sessionStorage.setItem(OPENED_NEW_TAB_STORAGE_KEY, "1");
      return;
    }
    const stored = window.sessionStorage.getItem(OPENED_NEW_TAB_STORAGE_KEY);
    if (stored === "1" && !openedAsNewTab) {
      setOpenedAsNewTab(true);
    }
  }, [newTabQuery, openedAsNewTab]);
  const modeQuery = searchParams.get("mode");
  useEffect(() => {
    if (typeof window === "undefined") return;
    let resolvedMode: PosAccessMode | null = null;
    if (modeQuery && isValidPosMode(modeQuery)) {
      resolvedMode = modeQuery;
    } else {
      resolvedMode = getStoredPosMode();
    }
    if (!resolvedMode) {
      resolvedMode = getPosStationAccess() ? "station" : "web";
    }
    setStoredPosMode(resolvedMode);
    setPosMode(resolvedMode);
  }, [modeQuery]);

  useEffect(() => {
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
  }, [posMode]);

  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  const focusSearchInput = useCallback((selectAll = false) => {
    const input = searchInputRef.current;
    if (!input) return;
    input.focus();
    if (selectAll) {
      input.select();
    }
  }, []);
  const resolveAssetUrl = useCallback(
    (url?: string | null) => {
      if (!url) return null;
      try {
        return new URL(url, imageBaseUrl).toString();
      } catch (err) {
        console.warn("URL de imagen inválida", url, err);
        return url;
      }
    },
    [imageBaseUrl]
  );
  useEffect(() => {
    if (!cartSurcharge.enabled) return;
    if (cartSurcharge.isManual) return;
    if (!cartSurcharge.method || cartSurcharge.method === "manual") return;
    const percent = Number(customSurchargePercent) || 5;
    const computed = roundUpToThousand(
      cartTotalBeforeSurcharge * (percent / 100)
    );
    if (computed === cartSurcharge.amount) return;
    setCartSurcharge((prev) => ({
      ...prev,
      amount: computed,
    }));
  }, [
    cartSurcharge,
    cartTotalBeforeSurcharge,
    setCartSurcharge,
    customSurchargePercent,
  ]);

  useEffect(() => {
    if (!surchargeMenuOpen) return;
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        surchargeMenuRef.current &&
        !surchargeMenuRef.current.contains(target)
      ) {
        setSurchargeMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [surchargeMenuOpen]);

  const [selectedCartId, setSelectedCartId] = useState<number | null>(null);

  // Modales
  const [quantityModalOpen, setQuantityModalOpen] = useState(false);
  const [quantityValue, setQuantityValue] = useState<string>("1");
  const quantityInputRef = useRef<HTMLInputElement | null>(null);
  const priceChangeInputRef = useRef<HTMLInputElement | null>(null);

  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [discountScope, setDiscountScope] = useState<DiscountScope>("item");
  const [discountMode, setDiscountMode] = useState<DiscountMode>("value");
  const [discountInput, setDiscountInput] = useState<string>("");
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [cartPanelWidthPercent, setCartPanelWidthPercent] = useState<number>(CART_PANEL_DEFAULT_PERCENT);
  const [isResizingCartPanel, setIsResizingCartPanel] = useState(false);
  const [gridWidth, setGridWidth] = useState(0);
  const [gridZoom, setGridZoom] = useState(GRID_ZOOM_DEFAULT);
  const [isMobile, setIsMobile] = useState(false);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const gridZoomHydratedRef = useRef(false);
  const cartWidthStorageKey = useMemo(
    () =>
      activeStationId
        ? `${CART_WIDTH_STORAGE_PREFIX}:${activeStationId}`
        : null,
    [activeStationId]
  );
  const gridZoomStorageKey = useMemo(() => {
    if (activeStationId) {
      return `${GRID_ZOOM_STORAGE_PREFIX}:${activeStationId}`;
    }
    if (posMode === "web") {
      return `${GRID_ZOOM_STORAGE_PREFIX}:pos-web`;
    }
    return null;
  }, [activeStationId, posMode]);
  const clampCartPanelPercent = useCallback(
    (value: number) =>
      clampNumber(value, CART_PANEL_MIN_PERCENT, CART_PANEL_MAX_PERCENT),
    []
  );
  const handleCartResizeStart = useCallback(
    (
      event:
        | React.MouseEvent<HTMLDivElement>
        | React.TouchEvent<HTMLDivElement>
    ) => {
      event.preventDefault();
      const clientX =
        "touches" in event ? event.touches[0]?.clientX : event.clientX;
      if (clientX == null) return;
      const container = layoutRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) return;
      const relativeX = clientX - rect.left;
      const nextPercent = clampCartPanelPercent(
        (relativeX / rect.width) * 100
      );
      setCartPanelWidthPercent(nextPercent);
      setIsResizingCartPanel(true);
    },
    [clampCartPanelPercent]
  );
  const handleCartResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const delta = event.key === "ArrowLeft" ? -2 : 2;
        setCartPanelWidthPercent((prev) =>
          clampCartPanelPercent(prev + delta)
        );
      } else if (event.key === "Home") {
        event.preventDefault();
        setCartPanelWidthPercent(CART_PANEL_MIN_PERCENT);
      } else if (event.key === "End") {
        event.preventDefault();
        setCartPanelWidthPercent(CART_PANEL_MAX_PERCENT);
      } else if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        setCartPanelWidthPercent(CART_PANEL_DEFAULT_PERCENT);
      }
    },
    [clampCartPanelPercent]
  );
  const handleCartResizeReset = useCallback(() => {
    setCartPanelWidthPercent(CART_PANEL_DEFAULT_PERCENT);
  }, []);
  const clampGridZoom = useCallback(
    (value: number) => clampNumber(value, GRID_ZOOM_MIN, GRID_ZOOM_MAX),
    []
  );
  const handleZoomChange = useCallback(
    (delta: number) => {
      setGridZoom((prev) => clampGridZoom(prev + delta));
    },
    [clampGridZoom]
  );
  const handleZoomReset = useCallback(() => {
    setGridZoom(GRID_ZOOM_DEFAULT);
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!cartWidthStorageKey) return;
    const stored = window.localStorage.getItem(cartWidthStorageKey);
    if (!stored) return;
    const parsed = Number(stored);
    if (!Number.isFinite(parsed)) return;
    setCartPanelWidthPercent(clampCartPanelPercent(parsed));
  }, [cartWidthStorageKey, clampCartPanelPercent]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    gridZoomHydratedRef.current = false;
    if (!gridZoomStorageKey) return;
    const stored = window.localStorage.getItem(gridZoomStorageKey);
    if (stored) {
      const parsed = Number(stored);
      if (Number.isFinite(parsed)) {
        setGridZoom(clampGridZoom(parsed));
      }
    }
    gridZoomHydratedRef.current = true;
  }, [gridZoomStorageKey, clampGridZoom]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!cartWidthStorageKey) return;
    window.localStorage.setItem(
      cartWidthStorageKey,
      String(cartPanelWidthPercent)
    );
  }, [cartPanelWidthPercent, cartWidthStorageKey]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!gridZoomStorageKey) return;
    if (!gridZoomHydratedRef.current) return;
    window.localStorage.setItem(gridZoomStorageKey, String(gridZoom));
  }, [gridZoom, gridZoomStorageKey]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isResizingCartPanel) return;
    const handleMouseMove = (event: MouseEvent) => {
      event.preventDefault();
      const container = layoutRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) return;
      const relativeX = event.clientX - rect.left;
      const percent = clampCartPanelPercent((relativeX / rect.width) * 100);
      setCartPanelWidthPercent(percent);
    };
    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      const container = layoutRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) return;
      const relativeX = touch.clientX - rect.left;
      const percent = clampCartPanelPercent((relativeX / rect.width) * 100);
      setCartPanelWidthPercent(percent);
    };
    const stopResizing = () => setIsResizingCartPanel(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchmove", handleTouchMove);
    window.addEventListener("mouseup", stopResizing);
    window.addEventListener("touchend", stopResizing);
    window.addEventListener("touchcancel", stopResizing);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("mouseup", stopResizing);
      window.removeEventListener("touchend", stopResizing);
      window.removeEventListener("touchcancel", stopResizing);
    };
  }, [isResizingCartPanel, clampCartPanelPercent]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 1023px)");
    const update = (match: boolean) => {
      setIsMobile(match);
      if (!match) {
        setCartDrawerOpen(false);
      }
    };
    update(media.matches);
    const handler = (e: MediaQueryListEvent) => update(e.matches);
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!isResizingCartPanel) return;
    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
    };
  }, [isResizingCartPanel]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const element = gridRef.current;
    if (!element) return;
    const updateWidth = () => {
      const rect = element.getBoundingClientRect();
      setGridWidth(rect.width);
    };
    updateWidth();
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => updateWidth());
      observer.observe(element);
    } else {
      window.addEventListener("resize", updateWidth);
    }
    return () => {
      if (observer) {
        observer.disconnect();
      } else {
        window.removeEventListener("resize", updateWidth);
      }
    };
  }, []);
  const gridSizingMetrics = useMemo(() => {
    let columnCount = GRID_DEFAULT_COLUMNS;
    if (gridWidth > 0) {
      const defaultMinWidth =
        GRID_DEFAULT_COLUMNS * GRID_TILE_TARGET_WIDTH +
        GRID_GAP_PX * (GRID_DEFAULT_COLUMNS - 1);
      if (gridWidth < defaultMinWidth) {
        const approxColumns = Math.floor(
          (gridWidth + GRID_GAP_PX) / (GRID_TILE_MIN_WIDTH + GRID_GAP_PX)
        );
        columnCount = clampNumber(
          approxColumns,
          GRID_MIN_COLUMNS,
          GRID_DEFAULT_COLUMNS
        );
      }
    }
    const columnRatio = columnCount / GRID_DEFAULT_COLUMNS;
    const tileHeight = Math.round(
      GRID_TILE_HEIGHT_BASE * (0.85 + 0.15 * columnRatio) * gridZoom
    );
    const imageHeight = Math.max(96, Math.round(tileHeight * 0.55));
    const labelFontSize = +(
      (0.85 + 0.15 * columnRatio) * gridZoom
    ).toFixed(2);
    const priceFontSize = +(
      (1 + 0.2 * columnRatio) * gridZoom
    ).toFixed(2);
    const metaFontSize = +(
      (0.7 + 0.15 * columnRatio) * gridZoom
    ).toFixed(2);
    return {
      gridStyle: {
        gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
        gridAutoRows: `${tileHeight}px`,
        gap: `${Math.max(6, Math.round(GRID_GAP_PX * gridZoom))}px`,
      } as React.CSSProperties,
      imageHeight,
      labelFontSize,
      priceFontSize,
      metaFontSize,
    };
  }, [gridWidth, gridZoom]);
  const {
    gridStyle,
    imageHeight: tileImageHeight,
    labelFontSize: tileLabelFontSize,
    priceFontSize: tilePriceFontSize,
    metaFontSize: tileMetaFontSize,
  } = gridSizingMetrics;
  const handleDiscountInputChange = useCallback(
    (value: string) => {
      if (discountMode === "value") {
        const formatted = formatPriceInputValue(value);
        setDiscountInput(formatted || "");
      } else {
        setDiscountInput(value.replace(/[^0-9.,]/g, ""));
      }
    },
    [discountMode]
  );
  const adjustQuantityValue = useCallback((delta: number) => {
    setQuantityValue((prev) => {
      const parsed = parseInt(prev, 10);
      const safe = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
      return String(Math.max(1, safe + delta));
    });
  }, []);

  const [priceChangeProduct, setPriceChangeProduct] = useState<Product | null>(
    null
  );

  const baseTotalForSurcharge = cartTotalBeforeSurcharge;

  type PresetSurchargeMethod = Exclude<SurchargeMethod, "manual" | null>;

  const applySurchargePreset = useCallback(
    (method: PresetSurchargeMethod) => {
      const amount = roundUpToThousand(baseTotalForSurcharge * 0.05);
      setCartSurcharge({
        method,
        amount,
        enabled: true,
        isManual: false,
      });
      setSurchargeMenuOpen(false);
    },
    [baseTotalForSurcharge, setCartSurcharge]
  );

  const handleApplyManualSurcharge = () => {
    const raw = customSurchargeValue.replace(/[^\d]/g, "");
    const parsedManual = Number(raw);
    let normalized = 0;

    if (parsedManual > 0) {
      normalized = roundUpToThousand(parsedManual);
    } else {
      const percentNumber = Math.min(
        100,
        Math.max(0, Number(customSurchargePercent) || 0)
      );
      if (percentNumber > 0) {
        normalized = roundUpToThousand(
          baseTotalForSurcharge * (percentNumber / 100)
        );
      }
    }

    if (normalized <= 0) {
      setSurchargeMenuOpen(false);
      return;
    }

    setCartSurcharge({
      method: "manual",
      amount: normalized,
      enabled: true,
      isManual: true,
    });
    setSurchargeMenuOpen(false);
  };

  const handleManualPercentChange = (value: string) => {
    const sanitized = value.replace(/[^\d]/g, "").slice(0, 3);
    const normalizedPercent = sanitized.replace(/^0+(?=\d)/, "");
    const percentNumber = Math.min(
      100,
      Math.max(0, Number(normalizedPercent) || 0)
    );
    setCustomSurchargePercent(
      percentNumber > 0 ? percentNumber.toString() : ""
    );

    if (percentNumber > 0) {
      const computed = roundUpToThousand(
        baseTotalForSurcharge * (percentNumber / 100)
      );
      setCustomSurchargeValue(computed > 0 ? computed.toString() : "");
    }
  };

  const handleManualValueChange = (value: string) => {
    setCustomSurchargeValue(value.replace(/[^\d]/g, ""));
  };

  const handleManualSurchargeKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleApplyManualSurcharge();
    }
  };

  const handleDeactivateSurcharge = () => {
    setCartSurcharge({
      method: null,
      amount: 0,
      enabled: false,
      isManual: false,
    });
    setCustomSurchargeValue("");
    setCustomSurchargePercent("5");
    setSurchargeMenuOpen(false);
  };

  useEffect(() => {
    if (!surchargeMenuOpen) return;
    if (cartSurcharge.enabled) {
      setCustomSurchargeValue(
        cartSurcharge.amount > 0 ? cartSurcharge.amount.toString() : ""
      );
      if (!cartSurcharge.isManual && cartSurcharge.method) {
        setCustomSurchargePercent("5");
      }
    } else {
      setCustomSurchargeValue("");
      setCustomSurchargePercent("5");
    }
  }, [surchargeMenuOpen, cartSurcharge]);
  const [priceChangeValue, setPriceChangeValue] = useState<string>("0");
  const handlePriceChangeInput = useCallback((value: string) => {
    const formatted = formatPriceInputValue(value);
    setPriceChangeValue(formatted || "");
  }, []);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closureReminderOpen, setClosureReminderOpen] = useState(false);
  const [closureForm, setClosureForm] = useState<ClosureFormState>(
    initialClosureForm
  );
  const [closureSaving, setClosureSaving] = useState(false);
  const [closureError, setClosureError] = useState<string | null>(null);
  const [closureResult, setClosureResult] = useState<PosClosureResult | null>(
    null
  );
  const [closureCustomMethods, setClosureCustomMethods] = useState<
    ClosureCustomMethod[]
  >([]);
  const [closureMethodDetails, setClosureMethodDetails] = useState<
    ClosureMethodDetail[]
  >([]);
  const [closureTotalsLoading, setClosureTotalsLoading] = useState(false);
  const [closureEmailStatus, setClosureEmailStatus] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [closureEmailStatusMessage, setClosureEmailStatusMessage] = useState<string | null>(
    null
  );
  const [closureEmailModalOpen, setClosureEmailModalOpen] = useState(false);
  const [closureEmailRecipients, setClosureEmailRecipients] = useState("");
  const [closureEmailSubject, setClosureEmailSubject] = useState("");
  const [closureEmailMessage, setClosureEmailMessage] = useState("");
  const [closureEmailSending, setClosureEmailSending] = useState(false);
  const [closureEmailFeedback, setClosureEmailFeedback] = useState<string | null>(null);
  const [closureEmailError, setClosureEmailError] = useState<string | null>(null);
  const lastClosureEmailedRef = useRef<number | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [posSettings, setPosSettings] = useState<PosSettingsPayload | null>(null);

  const canProceedToPayment = cart.length > 0;
  const sellerName = user?.name
    ? `Vendedor: ${user.name}`
    : "Vendedor: (no identificado)";
  const sellerRole = user?.role ?? "Sin rol asignado";
  const sellerInitials = useMemo(() => {
    if (!user?.name) return "👤";
    const [first, second] = user.name.split(" ");
    const initials = `${first?.[0] ?? ""}${second?.[0] ?? ""}`.trim();
    return initials.toUpperCase() || user.name[0]?.toUpperCase() || "👤";
  }, [user?.name]);

  const isClosureEmailEnabledForStation = useMemo(() => {
    if (!posSettings) return false;
    if (posMode === "web") {
      return posSettings.web_pos_send_closure_email !== false;
    }
    if (activeStationId) {
      const overrides = posSettings.station_closure_email_overrides;
      if (
        overrides &&
        Object.prototype.hasOwnProperty.call(overrides, activeStationId)
      ) {
        return Boolean(overrides[activeStationId]);
      }
    }
    return true;
  }, [posSettings, posMode, activeStationId]);

  const resetClosureState = useCallback(() => {
    setClosureForm(initialClosureForm);
    setClosureError(null);
    setClosureResult(null);
    setClosureSeparatedInfo(null);
    setClosureCustomMethods([]);
    setClosureMethodDetails([]);
    setClosureSaving(false);
    setClosureEmailStatus("idle");
    setClosureEmailStatusMessage(null);
    setClosureEmailModalOpen(false);
    setClosureEmailRecipients("");
    setClosureEmailSubject("");
    setClosureEmailMessage("");
    setClosureEmailFeedback(null);
    setClosureEmailError(null);
    setClosureRange(null);
    lastClosureEmailedRef.current = null;
  }, []);

  const refreshPendingSales = useCallback(() => {
    setPendingSales(getPendingSales());
  }, []);

  const handleToggleFullscreen = useCallback(async () => {
    if (typeof document === "undefined") return;
    if (!document.documentElement.requestFullscreen || !document.exitFullscreen) {
      setError("Tu navegador no soporta pantalla completa.");
      return;
    }
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? `No se pudo cambiar a pantalla completa: ${err.message}`
          : "No se pudo cambiar a pantalla completa."
      );
    }
  }, []);

  const [closureUsers, setClosureUsers] = useState<UserContribution[]>([]);
  const [closureSeparatedInfo, setClosureSeparatedInfo] =
    useState<ClosureSeparatedOverview | null>(null);
  const [pendingClosureAlert, setPendingClosureAlert] =
    useState<PendingClosureInfo | null>(null);
  const [pendingClosureAcknowledged, setPendingClosureAcknowledged] =
    useState(false);
  const pendingAlertAckKey = useMemo(() => {
    if (!pendingClosureAlert) return null;
    if (!activeStationId) return null;
    return `${activeStationId}:${pendingClosureAlert.dateKey}`;
  }, [pendingClosureAlert, activeStationId]);
  const shouldBlockSales = Boolean(
    pendingClosureAlert && !pendingClosureAcknowledged
  );
  const [closureRange, setClosureRange] = useState<{
    startKey: string;
    endKey: string;
    startLabel: string;
    endLabel: string;
  } | null>(null);
  const [pendingSales, setPendingSales] = useState<PendingSaleRecord[]>([]);
  const [pendingBannerStatus, setPendingBannerStatus] = useState<{
    type: "info" | "success" | "error";
    message: string;
  } | null>(null);
  const [sendingPendingId, setSendingPendingId] = useState<string | null>(null);
  const [sendingAllPending, setSendingAllPending] = useState(false);

  useEffect(() => {
    if (!token) return;
    let active = true;
    async function loadSettings() {
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
    refreshPendingSales();
    const win = typeof window === "undefined" ? null : window;
    if (!win) return;
    const handleUpdate = (event: Event) => {
      refreshPendingSales();
      const custom = event as CustomEvent<{ action?: string }>;
      const action = custom.detail?.action;
      if (action === "added") {
        setPendingBannerStatus({
          type: "info",
          message:
            "Guardamos una venta pendiente. Envíala cuando vuelva la conexión.",
        });
      } else if (action === "removed") {
        setPendingBannerStatus({
          type: "success",
          message: "Venta pendiente enviada correctamente.",
        });
      }
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === PENDING_SALES_STORAGE_KEY) {
        refreshPendingSales();
      }
    };
    win.addEventListener(
      PENDING_SALES_EVENT,
      handleUpdate as EventListener
    );
    win.addEventListener("storage", handleStorage);
    return () => {
      win.removeEventListener(
        PENDING_SALES_EVENT,
        handleUpdate as EventListener
      );
      win.removeEventListener("storage", handleStorage);
    };
  }, [refreshPendingSales]);

  useEffect(() => {
    if (!pendingBannerStatus) return;
    const timer =
      typeof window === "undefined"
        ? null
        : window.setTimeout(() => setPendingBannerStatus(null), 5000);
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [pendingBannerStatus]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!pendingAlertAckKey) {
      setPendingClosureAcknowledged(false);
      return;
    }
    try {
      const raw = window.sessionStorage.getItem(
        PENDING_ALERT_ACK_STORAGE_KEY
      );
      if (!raw) {
        setPendingClosureAcknowledged(false);
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      setPendingClosureAcknowledged(Boolean(parsed[pendingAlertAckKey]));
    } catch (err) {
      console.warn("No se pudo leer el estado del recordatorio de cierre", err);
      setPendingClosureAcknowledged(false);
    }
  }, [pendingAlertAckKey]);

  useEffect(() => {
    if (shouldBlockSales) {
      setClosureReminderOpen(true);
    } else if (!pendingClosureAlert) {
      setClosureReminderOpen(false);
    }
  }, [shouldBlockSales, pendingClosureAlert]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    async function checkPendingClosures() {
      try {
        const apiBase = getApiBase();
        const [salesRes, separatedOrders] = await Promise.all([
          fetch(`${apiBase}/pos/sales?skip=0&limit=500`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            credentials: "include",
          }),
          fetchSeparatedOrders({ limit: 500 }, token),
        ]);
        if (!salesRes.ok) return;
        const sales = (await salesRes.json()) as ClosureSale[];
        const allSalesMap = new Map<number, ClosureSale>();
        sales.forEach((sale) => allSalesMap.set(sale.id, sale));
        const pendingSales = sales.filter(
          (sale) => sale.closure_id == null && sale.status !== "voided"
        );
        const filteredSales =
          activeStationId && activeStationId !== ""
            ? pendingSales.filter(
                (sale) =>
                  sale.station_id === activeStationId ||
                  (!sale.station_id && matchesStationLabel(sale.pos_name))
              )
            : isWebMode
              ? pendingSales.filter((sale) => isPosWebName(sale.pos_name))
              : pendingSales;
        const todayKey = getLocalDateKey();
        const lookback = new Date();
        lookback.setDate(lookback.getDate() - 7);
        const lookbackKey = getLocalDateKey(lookback);
        let count = 0;
        let oldestDateKey: string | null = null;
        const registerPendingDate = (candidateKey: string | null) => {
          if (!candidateKey) return;
          if (candidateKey >= todayKey) return;
          if (candidateKey < lookbackKey) return;
          count += 1;
          if (!oldestDateKey || candidateKey < oldestDateKey) {
            oldestDateKey = candidateKey;
          }
        };
        filteredSales.forEach((sale) => {
          const saleDateKey = getLocalDateKey(sale.created_at);
          registerPendingDate(saleDateKey);
        });
        separatedOrders.forEach((order) => {
          const baseSale = allSalesMap.get(order.sale_id);
          (order.payments ?? []).forEach((payment) => {
            if (payment.closure_id != null || payment.status === "voided") return;
            if (activeStationId) {
              if (
                payment.station_id !== activeStationId &&
                (!payment.station_id &&
                  baseSale?.station_id !== activeStationId) &&
                !matchesStationLabel(baseSale?.pos_name)
              ) {
                return;
              }
            } else if (isWebMode) {
              if (!isPosWebName(baseSale?.pos_name)) {
                return;
              }
            }
            const paymentDateKey = getLocalDateKey(payment.paid_at);
            registerPendingDate(paymentDateKey);
          });
        });
        if (!active) return;
        if (count > 0 && oldestDateKey) {
          const label = formatDateLabelFromKey(oldestDateKey);
          setPendingClosureAlert({
            count,
            dateLabel: label,
            dateKey: oldestDateKey,
          });
        } else {
          setPendingClosureAlert(null);
        }
      } catch (err) {
        console.warn("No se pudo verificar cierres pendientes", err);
      }
    }
    void checkPendingClosures();
    return () => {
      active = false;
    };
  }, [token, activeStationId, isWebMode, isPosWebName, matchesStationLabel]);

  useEffect(() => {
    if (!quantityModalOpen) return;
    const input = quantityInputRef.current;
    if (!input) return;
    const id = requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
    return () => cancelAnimationFrame(id);
  }, [quantityModalOpen]);

  useEffect(() => {
    if (!priceChangeProduct) return;
    const input = priceChangeInputRef.current;
    if (!input) return;
    const id = requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(0, input.value.length);
    });
    return () => cancelAnimationFrame(id);
  }, [priceChangeProduct]);

  const fetchPendingClosureTotals = useCallback(async () => {
    if (!token) return;
    try {
      setClosureTotalsLoading(true);
      setClosureError(null);
      const apiBase = getApiBase();
      const [salesRes, returnsRes, changesRes, separatedOrders] = await Promise.all([
        fetch(`${apiBase}/pos/sales?skip=0&limit=500`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        }),
        fetch(`${apiBase}/pos/returns?skip=0&limit=500`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        }),
        fetch(`${apiBase}/pos/changes?skip=0&limit=500`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        }),
        fetchSeparatedOrders({ limit: 500 }, token),
      ]);
      if (!salesRes.ok) {
        throw new Error(`Error ${salesRes.status} al obtener las ventas.`);
      }
      if (!returnsRes.ok) {
        throw new Error(`Error ${returnsRes.status} al obtener las devoluciones.`);
      }
      if (!changesRes.ok) {
        throw new Error(`Error ${changesRes.status} al obtener los cambios.`);
      }
      const sales = (await salesRes.json()) as ClosureSale[];
      const returns = (await returnsRes.json()) as ClosureReturnRecord[];
      const changes = (await changesRes.json()) as ClosureChangeRecord[];
      const allSalesMap = new Map<number, ClosureSale>();
      sales.forEach((sale) => allSalesMap.set(sale.id, sale));
      const pendingSales = sales.filter(
        (sale) => sale.closure_id == null && sale.status !== "voided"
      );
      const shouldFilterByStation =
        Boolean(activeStationId) && activeStationId !== "";
      const filteredPendingSales = shouldFilterByStation
        ? pendingSales.filter(
            (sale) =>
              sale.station_id === activeStationId ||
              (!sale.station_id && matchesStationLabel(sale.pos_name))
          )
        : isWebMode
          ? pendingSales.filter((sale) => isPosWebName(sale.pos_name))
          : pendingSales;
      const filteredSaleIds = new Set(filteredPendingSales.map((sale) => sale.id));
      const pendingReturns = returns.filter(
        (ret) => ret.closure_id == null && ret.status === "confirmed"
      );
      const filteredPendingReturns = shouldFilterByStation
        ? pendingReturns.filter((ret) => {
            const relatedSale = ret.sale_id
              ? allSalesMap.get(ret.sale_id)
              : undefined;
            const stationId = ret.station_id ?? relatedSale?.station_id;
            const posName = ret.pos_name ?? relatedSale?.pos_name ?? null;
            return (
              stationId === activeStationId ||
              (!stationId && matchesStationLabel(posName))
            );
          })
        : isWebMode
          ? pendingReturns.filter((ret) => {
              const relatedSale = ret.sale_id
                ? allSalesMap.get(ret.sale_id)
                : undefined;
              const posName = ret.pos_name ?? relatedSale?.pos_name ?? null;
              return isPosWebName(posName);
            })
          : pendingReturns;
      const pendingChanges = changes.filter(
        (change) => change.closure_id == null && change.status === "confirmed"
      );
      const filteredPendingChanges = shouldFilterByStation
        ? pendingChanges.filter((change) => {
            const relatedSale = change.sale_id
              ? allSalesMap.get(change.sale_id)
              : undefined;
            const stationId =
              change.station_id ?? relatedSale?.station_id;
            const posName =
              change.pos_name ?? relatedSale?.pos_name ?? null;
            return (
              stationId === activeStationId ||
              (!stationId && matchesStationLabel(posName))
            );
          })
        : isWebMode
          ? pendingChanges.filter((change) => {
              const relatedSale = change.sale_id
                ? allSalesMap.get(change.sale_id)
                : undefined;
              const posName =
                change.pos_name ?? relatedSale?.pos_name ?? null;
              return isPosWebName(posName);
            })
          : pendingChanges;
      let totalGrossCollected = 0;
      let fallbackRefundsTotal = 0;
      let refundsFromReturnsTotal = 0;
      let hasReturnRefunds = false;
      let changeExtraTotal = 0;
      let changeRefundTotal = 0;
      let changeCount = 0;
      const methodGrossMap: TotalsByMethod = {
        cash: 0,
        card: 0,
        qr: 0,
        nequi: 0,
        daviplata: 0,
        credit: 0,
      };
      const methodRefundMap: TotalsByMethod = {
        cash: 0,
        card: 0,
        qr: 0,
        nequi: 0,
        daviplata: 0,
        credit: 0,
      };
      const fallbackRefundMap: TotalsByMethod = {
        cash: 0,
        card: 0,
        qr: 0,
        nequi: 0,
        daviplata: 0,
        credit: 0,
      };
      const extraMethodGrossMap = new Map<
        string,
        { label: string; slug?: string | null; amount: number; order: number }
      >();
      const extraMethodRefundMap = new Map<
        string,
        { label: string; slug?: string | null; amount: number; order: number }
      >();
      const extraMethodRefundFallbackMap = new Map<
        string,
        { label: string; slug?: string | null; amount: number; order: number }
      >();
      const userTotals = new Map<string, number>();
      const saleMap = new Map<number, ClosureSale>();
      filteredPendingSales.forEach((sale) => {
        saleMap.set(sale.id, sale);
      });
      type NormalizedSeparatedOrder = {
        order: SeparatedOrder;
        baseSale: ClosureSale | undefined;
        pendingPayments: SeparatedOrderPayment[];
        saleMatches: boolean;
      };
      const normalizedSeparatedOrders = separatedOrders
        .map<NormalizedSeparatedOrder | null>((order) => {
          const baseSale = allSalesMap.get(order.sale_id);
          const pendingPayments =
            order.payments?.filter(
              (payment) =>
                payment.closure_id == null && payment.status !== "voided"
            ) ?? [];
          const saleMatches = filteredSaleIds.has(order.sale_id);
          const paymentMatches = shouldFilterByStation
            ? pendingPayments.some(
                (payment) =>
                  payment.station_id === activeStationId ||
                  (!payment.station_id &&
                    baseSale?.station_id === activeStationId) ||
                  (!payment.station_id &&
                    !baseSale?.station_id &&
                    matchesStationLabel(baseSale?.pos_name))
              )
            : isWebMode
              ? pendingPayments.some(() => isPosWebName(baseSale?.pos_name))
              : pendingPayments.length > 0;
          if (!saleMatches && !paymentMatches) {
            return null;
          }
          return {
            order,
            baseSale,
            pendingPayments,
            saleMatches,
          };
        })
        .filter(
          (entry): entry is NormalizedSeparatedOrder => entry !== null
        );
      const separatedOrdersMap = new Map<
        number,
        NormalizedSeparatedOrder
      >();
      normalizedSeparatedOrders.forEach((entry) => {
        if (entry.saleMatches) {
          separatedOrdersMap.set(entry.order.sale_id, entry);
        }
      });

      const separatedSummary: ClosureSeparatedOverview = {
        tickets: 0,
        reservedTotal: 0,
        pendingTotal: 0,
        paymentsTotal: 0,
      };

      const findCatalogMethod = (methodRaw?: string | null) => {
        if (!methodRaw) return null;
        const normalized = normalizeMethodKey(methodRaw);
        if (!normalized) return null;
        const slugCandidate = slugifyMethodKey(methodRaw);
        return (
          paymentMethodIndex.slugMap.get(slugCandidate) ??
          paymentMethodIndex.slugMap.get(normalized) ??
          paymentMethodIndex.nameMap.get(normalized)
        );
      };

      const buildDescriptorFromRecord = (
        record: PaymentMethodRecord
      ): { label: string; slug?: string | null; order: number } => ({
        label: record.name,
        slug: record.slug,
        order:
          typeof record.order_index === "number"
            ? record.order_index
            : Number.MAX_SAFE_INTEGER,
      });

      const buildDescriptorFromRaw = (
        methodRaw: string
      ): { label: string; slug?: string | null; order: number } => ({
        label: methodRaw.trim() || "Otro método",
        slug: slugifyMethodKey(methodRaw) || normalizeMethodKey(methodRaw),
        order: Number.MAX_SAFE_INTEGER,
      });

      const addExtraMethodAmount = (
        targetMap: Map<
          string,
          { label: string; slug?: string | null; amount: number; order: number }
        >,
        descriptor: { label: string; slug?: string | null; order: number } | null,
        amount?: number
      ) => {
        if (!descriptor || amount == null || Number.isNaN(amount) || amount === 0) {
          return;
        }
        const slugKey = descriptor.slug?.trim().length
          ? slugifyMethodKey(descriptor.slug)
          : slugifyMethodKey(descriptor.label);
        const key = slugKey || descriptor.label.toLowerCase();
        const current = targetMap.get(key);
        targetMap.set(key, {
          slug: descriptor.slug ?? key,
          label: descriptor.label,
          order: descriptor.order,
          amount: (current?.amount ?? 0) + amount,
        });
      };

      const addMethodAmount = (
        methodMapTarget: TotalsByMethod,
        extraMapTarget: Map<
          string,
          { label: string; slug?: string | null; amount: number; order: number }
        >,
        method?: string | null,
        amount?: number
      ) => {
        if (!method || amount == null || Number.isNaN(amount) || amount === 0) {
          return;
        }
        const catalogRecord = findCatalogMethod(method);
        const catalogSlug =
          catalogRecord?.slug && slugifyMethodKey(catalogRecord.slug);
        const catalogIsStandard =
          !!catalogSlug && STANDARD_METHOD_SLUGS.has(catalogSlug);
        if (catalogRecord && !catalogIsStandard) {
          addExtraMethodAmount(
            extraMapTarget,
            buildDescriptorFromRecord(catalogRecord),
            amount
          );
          return;
        }
        const methodKey = mapMethodToKey(method);
        if (methodKey) {
          methodMapTarget[methodKey] += amount;
          return;
        }
        const fallbackDescriptor = catalogRecord
          ? buildDescriptorFromRecord(catalogRecord)
          : buildDescriptorFromRaw(method);
        addExtraMethodAmount(extraMapTarget, fallbackDescriptor, amount);
      };

      const addVendorAmount = (vendor?: string | null, amount?: number) => {
        if (!vendor || amount == null || Number.isNaN(amount) || amount === 0) {
          return;
        }
        userTotals.set(vendor, (userTotals.get(vendor) ?? 0) + amount);
      };

      let rangeStartKey: string | null = null;
      let rangeEndKey: string | null = null;

      filteredPendingSales.forEach((sale) => {
        const saleDate = getLocalDateKey(sale.created_at);
        if (!rangeStartKey || saleDate < rangeStartKey) {
          rangeStartKey = saleDate;
        }
        if (!rangeEndKey || saleDate > rangeEndKey) {
          rangeEndKey = saleDate;
        }
        const normalizedEntry = separatedOrdersMap.get(sale.id);
        const order = normalizedEntry?.order;
        const isSeparated = !!sale.is_separated;
        const vendor = sale.vendor_name?.trim();

        if (isSeparated) {
          separatedSummary.tickets += 1;
          separatedSummary.reservedTotal += order?.total_amount ?? sale.total ?? 0;
          const pending = order?.balance ?? sale.balance ?? 0;
          separatedSummary.pendingTotal += Math.max(pending ?? 0, 0);
          const initialAmount =
            sale.initial_payment_amount ?? order?.initial_payment ?? 0;
          if (initialAmount > 0) {
            const initialMethod =
              sale.initial_payment_method ?? sale.payment_method;
            addMethodAmount(
              methodGrossMap,
              extraMethodGrossMap,
              initialMethod,
              initialAmount
            );
            totalGrossCollected += initialAmount;
            separatedSummary.paymentsTotal += initialAmount;
            addVendorAmount(vendor, initialAmount);
          }
          return;
        }

        const gross = sale.total ?? 0;
        const refund = Math.max(0, sale.refunded_total ?? 0);
        const net =
          sale.refunded_balance != null
            ? Math.max(0, sale.refunded_balance)
            : Math.max(0, gross - refund);
        totalGrossCollected += gross;

        const payments =
          sale.payments && sale.payments.length > 0
            ? sale.payments
            : [{ method: sale.payment_method, amount: gross }];

        const paymentsTotal = payments.reduce(
          (sum, payment) => sum + Math.max(payment.amount ?? 0, 0),
          0
        );
        payments.forEach((payment) => {
          const paymentAmount = Math.max(payment.amount ?? 0, 0);
          const amount = paymentsTotal > 0
            ? (paymentAmount / paymentsTotal) * gross
            : gross / payments.length;
          addMethodAmount(
            methodGrossMap,
            extraMethodGrossMap,
            payment.method,
            amount
          );
        });
        if (refund > 0) {
          fallbackRefundsTotal += refund;
          payments.forEach((payment) => {
            const paymentAmount = Math.max(payment.amount ?? 0, 0);
            const amount = paymentsTotal > 0
              ? (paymentAmount / paymentsTotal) * refund
              : refund / payments.length;
            addMethodAmount(
              fallbackRefundMap,
              extraMethodRefundFallbackMap,
              payment.method,
              amount
            );
          });
        }
        addVendorAmount(vendor, net);
      });

      normalizedSeparatedOrders.forEach((entry) => {
        const { order, baseSale, pendingPayments } = entry;
        const relatedSale = saleMap.get(order.sale_id);
        pendingPayments.forEach((payment) => {
          const paymentDate = payment.paid_at
            ? getLocalDateKey(payment.paid_at)
            : null;
          if (paymentDate) {
            if (!rangeStartKey || paymentDate < rangeStartKey) {
              rangeStartKey = paymentDate;
            }
            if (!rangeEndKey || paymentDate > rangeEndKey) {
              rangeEndKey = paymentDate;
            }
          }
          const paymentMatches = shouldFilterByStation
            ? payment.station_id === activeStationId ||
              (!payment.station_id &&
                (relatedSale?.station_id ?? baseSale?.station_id) ===
                  activeStationId) ||
              (!payment.station_id &&
                !relatedSale?.station_id &&
                !baseSale?.station_id &&
                matchesStationLabel(
                  relatedSale?.pos_name ?? baseSale?.pos_name ?? null
                ))
            : isWebMode
              ? isPosWebName(
                  relatedSale?.pos_name ?? baseSale?.pos_name ?? null
                )
              : true;
          if (!paymentMatches) return;
          addMethodAmount(
            methodGrossMap,
            extraMethodGrossMap,
            payment.method,
            payment.amount
          );
          totalGrossCollected += payment.amount;
          separatedSummary.paymentsTotal += payment.amount;
          const vendorName =
            relatedSale?.vendor_name?.trim() ??
            baseSale?.vendor_name?.trim() ??
            null;
          addVendorAmount(vendorName, payment.amount);
        });
      });

      filteredPendingReturns.forEach((ret) => {
        const returnDate = ret.created_at
          ? getLocalDateKey(ret.created_at)
          : null;
        if (returnDate) {
          if (!rangeStartKey || returnDate < rangeStartKey) {
            rangeStartKey = returnDate;
          }
          if (!rangeEndKey || returnDate > rangeEndKey) {
            rangeEndKey = returnDate;
          }
        }
        const payments =
          ret.payments?.filter((payment) => (payment.amount ?? 0) > 0) ?? [];
        if (payments.length > 0) {
          hasReturnRefunds = true;
          payments.forEach((payment) => {
            const amount = Math.max(payment.amount ?? 0, 0);
            if (amount <= 0) return;
            addMethodAmount(
              methodRefundMap,
              extraMethodRefundMap,
              payment.method,
              amount
            );
            refundsFromReturnsTotal += amount;
          });
          return;
        }

        const refundAmount = Math.max(ret.total_refund ?? 0, 0);
        if (refundAmount <= 0) return;
        hasReturnRefunds = true;
        const relatedSale = ret.sale_id
          ? allSalesMap.get(ret.sale_id)
          : undefined;
        const salePayments =
          relatedSale?.payments && relatedSale.payments.length > 0
            ? relatedSale.payments
            : relatedSale?.payment_method
              ? [
                  {
                    method: relatedSale.payment_method,
                    amount: refundAmount,
                  },
                ]
              : [];
        if (salePayments.length > 0) {
          const paymentsTotal = salePayments.reduce(
            (sum, payment) => sum + Math.max(payment.amount ?? 0, 0),
            0
          );
          salePayments.forEach((payment) => {
            const paymentAmount = Math.max(payment.amount ?? 0, 0);
            const amount = paymentsTotal > 0
              ? (paymentAmount / paymentsTotal) * refundAmount
              : refundAmount / salePayments.length;
            addMethodAmount(
              methodRefundMap,
              extraMethodRefundMap,
              payment.method,
              amount
            );
          });
        } else {
          addMethodAmount(
            methodRefundMap,
            extraMethodRefundMap,
            "Otro método",
            refundAmount
          );
        }
        refundsFromReturnsTotal += refundAmount;
      });

      filteredPendingChanges.forEach((change) => {
        const extra = Math.max(change.extra_payment ?? 0, 0);
        const refund = Math.max(change.refund_due ?? 0, 0);
        const changeDate = change.created_at
          ? getLocalDateKey(change.created_at)
          : null;
        if (changeDate) {
          if (!rangeStartKey || changeDate < rangeStartKey) {
            rangeStartKey = changeDate;
          }
          if (!rangeEndKey || changeDate > rangeEndKey) {
            rangeEndKey = changeDate;
          }
        }
        if (extra > 0 || refund > 0) {
          changeCount += 1;
        }
        changeExtraTotal += extra;
        changeRefundTotal += refund;

        if (extra > 0) {
          const payments =
            change.payments && change.payments.length > 0
              ? change.payments
              : [{ method: "cash", amount: extra }];
          payments.forEach((payment) => {
            addMethodAmount(
              methodGrossMap,
              extraMethodGrossMap,
              payment.method,
              payment.amount
            );
          });
        }
        if (refund > 0) {
          addMethodAmount(
            methodRefundMap,
            extraMethodRefundMap,
            "cash",
            refund
          );
        }
      });
      if (changeRefundTotal > 0) {
        hasReturnRefunds = true;
      }

      const resolvedRefundsTotal = hasReturnRefunds
        ? refundsFromReturnsTotal
        : fallbackRefundsTotal;
      const resolvedRefundMap = hasReturnRefunds
        ? methodRefundMap
        : fallbackRefundMap;
      const resolvedExtraRefundMap = hasReturnRefunds
        ? extraMethodRefundMap
        : extraMethodRefundFallbackMap;
      const methodNetMap: TotalsByMethod = {
        cash: methodGrossMap.cash - resolvedRefundMap.cash,
        card: methodGrossMap.card - resolvedRefundMap.card,
        qr: methodGrossMap.qr - resolvedRefundMap.qr,
        nequi: methodGrossMap.nequi - resolvedRefundMap.nequi,
        daviplata: methodGrossMap.daviplata - resolvedRefundMap.daviplata,
        credit: methodGrossMap.credit - resolvedRefundMap.credit,
      };

      setClosureUsers(
        Array.from(userTotals.entries())
          .map(([name, total]) => ({ name, total }))
          .sort((a, b) => b.total - a.total)
      );

      setClosureSeparatedInfo(
        separatedSummary.tickets > 0 ||
          separatedSummary.paymentsTotal > 0 ||
          separatedSummary.pendingTotal > 0
          ? separatedSummary
          : null
      );

      const roundedTotals = {
        totalAmount: Number(totalGrossCollected.toFixed(2)),
        totalRefunds: Number(resolvedRefundsTotal.toFixed(2)),
        totalCash: Number(methodNetMap.cash.toFixed(2)),
        totalCard: Number(methodNetMap.card.toFixed(2)),
        totalQr: Number(methodNetMap.qr.toFixed(2)),
        totalNequi: Number(methodNetMap.nequi.toFixed(2)),
        totalDaviplata: Number(methodNetMap.daviplata.toFixed(2)),
        totalCredit: Number(methodNetMap.credit.toFixed(2)),
        changeExtraTotal: Number(changeExtraTotal.toFixed(2)),
        changeRefundTotal: Number(changeRefundTotal.toFixed(2)),
        changeCount,
      };

      const extraMethodDetailsMap = new Map<
        string,
        { label: string; order: number; gross: number; refunds: number }
      >();
      extraMethodGrossMap.forEach((entry) => {
        extraMethodDetailsMap.set(entry.slug ?? entry.label, {
          label: entry.label,
          order: entry.order,
          gross: entry.amount,
          refunds: 0,
        });
      });
      resolvedExtraRefundMap.forEach((entry) => {
        const key = entry.slug ?? entry.label;
        const existing = extraMethodDetailsMap.get(key);
        extraMethodDetailsMap.set(key, {
          label: entry.label,
          order: existing?.order ?? entry.order,
          gross: existing?.gross ?? 0,
          refunds: (existing?.refunds ?? 0) + entry.amount,
        });
      });

      const extraMethodDetails = Array.from(extraMethodDetailsMap.values())
        .map((entry) => ({
          label: entry.label,
          gross: Number(entry.gross.toFixed(2)),
          refunds: Number(entry.refunds.toFixed(2)),
          net: Number((entry.gross - entry.refunds).toFixed(2)),
          order: entry.order,
        }))
        .filter((entry) => entry.gross !== 0 || entry.refunds !== 0)
        .sort((a, b) => a.order - b.order || b.net - a.net);

      const normalizedExtraMethods = extraMethodDetails
        .map((entry) => ({
          slug: slugifyMethodKey(entry.label) ?? entry.label,
          label: entry.label,
          amount: entry.net,
        }))
        .filter((entry) => entry.amount !== 0);
      setClosureCustomMethods(normalizedExtraMethods);

      const methodDetails: ClosureMethodDetail[] = [
        {
          label: "Efectivo",
          gross: methodGrossMap.cash,
          refunds: resolvedRefundMap.cash,
          net: methodNetMap.cash,
        },
        {
          label: "Tarjeta Datáfono",
          gross: methodGrossMap.card,
          refunds: resolvedRefundMap.card,
          net: methodNetMap.card,
        },
        {
          label: "Transferencias / QR",
          gross: methodGrossMap.qr,
          refunds: resolvedRefundMap.qr,
          net: methodNetMap.qr,
        },
        {
          label: "Nequi",
          gross: methodGrossMap.nequi,
          refunds: resolvedRefundMap.nequi,
          net: methodNetMap.nequi,
        },
        {
          label: "Daviplata",
          gross: methodGrossMap.daviplata,
          refunds: resolvedRefundMap.daviplata,
          net: methodNetMap.daviplata,
        },
        {
          label: "Crédito / Separado",
          gross: methodGrossMap.credit,
          refunds: resolvedRefundMap.credit,
          net: methodNetMap.credit,
        },
        ...extraMethodDetails.map((entry) => ({
          label: entry.label,
          gross: entry.gross,
          refunds: entry.refunds,
          net: entry.net,
        })),
      ].filter((entry) => entry.gross !== 0 || entry.refunds !== 0 || entry.net !== 0);
      setClosureMethodDetails(methodDetails);

      setClosureForm((prev) => ({
        ...prev,
        ...roundedTotals,
        countedCash: roundedTotals.totalCash,
      }));

      if (rangeStartKey && rangeEndKey) {
        const todayKey = getLocalDateKey();
        const startLabel =
          rangeStartKey === todayKey ? "hoy" : formatDateLabelFromKey(rangeStartKey);
        const endLabel =
          rangeEndKey === todayKey ? "hoy" : formatDateLabelFromKey(rangeEndKey);
        setClosureRange({
          startKey: rangeStartKey,
          endKey: rangeEndKey,
          startLabel,
          endLabel,
        });
      } else {
        setClosureRange(null);
      }
    } catch (err) {
      console.error(err);
      setClosureError(
        err instanceof Error
          ? err.message
          : "No se pudieron prellenar los datos del cierre."
      );
      setClosureCustomMethods([]);
      setClosureMethodDetails([]);
    } finally {
      setClosureTotalsLoading(false);
    }
  }, [token, paymentMethodIndex, activeStationId, isWebMode, isPosWebName, matchesStationLabel]);

  const processPendingSale = useCallback(
    async (
      record: PendingSaleRecord,
      options?: { silent?: boolean; skipTracking?: boolean }
    ) => {
      if (!token) {
        setPendingBannerStatus({
          type: "error",
          message:
            "Tu sesión expiró. Vuelve a iniciar sesión para enviar las ventas pendientes.",
        });
        return;
      }
      if (!options?.skipTracking) {
        setSendingPendingId(record.id);
      }
      try {
        const res = await submitPendingSale(record, token);
        if (!res.ok) {
          const detail = await res.json().catch(() => null);
          const message =
            detail?.detail ??
            `No se pudo enviar la venta pendiente (Error ${res.status}).`;
          throw new Error(message);
        }
        removePendingSale(record.id);
        refreshPendingSales();
        if (!options?.silent) {
          setPendingBannerStatus({
            type: "success",
            message: `Venta #${record.summary.saleNumber} enviada correctamente.`,
          });
        }
        void fetchPendingClosureTotals();
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "No se pudo enviar la venta pendiente.";
        setPendingBannerStatus({
          type: "error",
          message,
        });
        throw err;
      } finally {
        if (!options?.skipTracking) {
          setSendingPendingId(null);
        }
      }
    },
    [token, refreshPendingSales, fetchPendingClosureTotals]
  );

  const handleRetryPendingSale = useCallback(
    async (record: PendingSaleRecord) => {
      await processPendingSale(record);
    },
    [processPendingSale]
  );

  const handleSendAllPending = useCallback(async () => {
    const snapshot = getPendingSales();
    if (!snapshot.length) return;
    setSendingAllPending(true);
    try {
      for (const sale of snapshot) {
        await processPendingSale(sale, {
          silent: true,
          skipTracking: true,
        });
      }
      setPendingBannerStatus({
        type: "success",
        message: "Todas las ventas pendientes se enviaron correctamente.",
      });
    } catch {
      // El mensaje ya se estableció en processPendingSale
    } finally {
      setSendingAllPending(false);
      setSendingPendingId(null);
    }
  }, [processPendingSale]);

  const acknowledgePendingClosureAlert = useCallback(
    (options?: { dismiss?: boolean }) => {
      if (!pendingAlertAckKey) return;
      if (typeof window !== "undefined") {
        try {
          const raw = window.sessionStorage.getItem(
            PENDING_ALERT_ACK_STORAGE_KEY
          );
          const parsed = raw ? JSON.parse(raw) : {};
          parsed[pendingAlertAckKey] = {
            acknowledgedAt: new Date().toISOString(),
            user: user?.name ?? null,
          };
          window.sessionStorage.setItem(
            PENDING_ALERT_ACK_STORAGE_KEY,
            JSON.stringify(parsed)
          );
        } catch (err) {
          console.warn(
            "No se pudo registrar la confirmación del cierre pendiente",
            err
          );
        }
      }
      setPendingClosureAcknowledged(true);
      if (options?.dismiss) {
        setPendingClosureAlert(null);
      }
    },
    [pendingAlertAckKey, user?.name]
  );

  const handleOpenClosureModal = () => {
    resetClosureState();
    setCloseModalOpen(true);
    void fetchPendingClosureTotals();
  };

  const handleCloseClosureModal = () => {
    setCloseModalOpen(false);
    resetClosureState();
    setClosureRange(null);
  };

  const handleProceedToPayment = () => {
    if (!canProceedToPayment) return;
    if (shouldBlockSales) {
      setClosureReminderOpen(true);
      return;
    }
    router.push("/pos/pago");
  };

  const updateClosureField = (
    field: keyof ClosureFormState,
    value: number | string
  ) => {
    setClosureForm((prev) => ({
      ...prev,
      [field]:
        field === "notes"
          ? (value as string)
          : typeof value === "number"
          ? value
          : Number(value) || 0,
    }));
  };

  const closureNetAmount = useMemo(
    () =>
      closureForm.totalAmount -
      closureForm.totalRefunds +
      closureForm.changeExtraTotal -
      closureForm.changeRefundTotal,
    [
      closureForm.totalAmount,
      closureForm.totalRefunds,
      closureForm.changeExtraTotal,
      closureForm.changeRefundTotal,
    ]
  );

  const closureDifference = useMemo(
    () => closureForm.countedCash - closureForm.totalCash,
    [closureForm.countedCash, closureForm.totalCash]
  );

  const closureSummary = useMemo(() => {
    if (closureResult) {
      const merged: PosClosureResult = {
        ...closureResult,
        ...(closureResult.adjusted_totals ?? {}),
        custom_methods: closureResult.custom_methods ?? closureCustomMethods,
      };
      return merged;
    }
    return {
      id: 0,
      consecutive: null,
      pos_name: resolvedPosName,
      pos_identifier: null,
      opened_at: null,
      closed_at: null,
      total_amount: closureForm.totalAmount,
      total_cash: closureForm.totalCash,
      total_card: closureForm.totalCard,
      total_qr: closureForm.totalQr,
      total_nequi: closureForm.totalNequi,
      total_daviplata: closureForm.totalDaviplata,
      total_credit: closureForm.totalCredit,
      total_refunds: closureForm.totalRefunds,
      net_amount: closureNetAmount,
      change_extra_total: closureForm.changeExtraTotal,
      change_refund_total: closureForm.changeRefundTotal,
      change_count: closureForm.changeCount,
      counted_cash: closureForm.countedCash,
      difference: closureDifference,
      notes: closureForm.notes || undefined,
      closed_by_user_id: user?.id ?? 0,
      closed_by_user_name: user?.name ?? "—",
      custom_methods: closureCustomMethods,
      adjusted_totals: {
        total_amount: closureForm.totalAmount,
        total_cash: closureForm.totalCash,
        total_card: closureForm.totalCard,
        total_qr: closureForm.totalQr,
        total_nequi: closureForm.totalNequi,
        total_daviplata: closureForm.totalDaviplata,
        total_credit: closureForm.totalCredit,
        total_refunds: closureForm.totalRefunds,
        net_amount: closureNetAmount,
        change_extra_total: closureForm.changeExtraTotal,
        change_refund_total: closureForm.changeRefundTotal,
        change_count: closureForm.changeCount,
        counted_cash: closureForm.countedCash,
        difference: closureDifference,
      },
    } as PosClosureResult;
  }, [
    closureResult,
    closureForm,
    closureNetAmount,
    closureDifference,
    user?.id,
    user?.name,
    closureCustomMethods,
    resolvedPosName,
  ]);

  const closureMethods = useMemo(() => {
    if (closureMethodDetails.length > 0) {
      return closureMethodDetails;
    }
    return [
      {
        label: "Efectivo",
        gross: closureSummary.total_cash,
        refunds: 0,
        net: closureSummary.total_cash,
      },
      {
        label: "Tarjeta Datáfono",
        gross: closureSummary.total_card,
        refunds: 0,
        net: closureSummary.total_card,
      },
      {
        label: "Transferencias / QR",
        gross: closureSummary.total_qr,
        refunds: 0,
        net: closureSummary.total_qr,
      },
      {
        label: "Nequi",
        gross: closureSummary.total_nequi,
        refunds: 0,
        net: closureSummary.total_nequi,
      },
      {
        label: "Daviplata",
        gross: closureSummary.total_daviplata,
        refunds: 0,
        net: closureSummary.total_daviplata,
      },
      {
        label: "Crédito / Separado",
        gross: closureSummary.total_credit,
        refunds: 0,
        net: closureSummary.total_credit,
      },
      ...(closureSummary.custom_methods?.map((method) => ({
        label: method.label || "Otro método",
        gross: method.amount ?? 0,
        refunds: 0,
        net: method.amount ?? 0,
      })) ?? []),
    ];
  }, [closureMethodDetails, closureSummary]);

  const closureMethodsUsed = useMemo(
    () =>
      closureMethods.filter(
        (method) => method.gross !== 0 || method.refunds !== 0 || method.net !== 0
      ),
    [closureMethods]
  );

  const closureRegisteredTotals = useMemo(
    () =>
      [
        { label: "Ventas brutas del período", value: closureSummary.total_amount },
        { label: "Reembolsos del período", value: -closureSummary.total_refunds },
        ...(closureSummary.change_extra_total ||
        closureSummary.change_refund_total ||
        closureSummary.change_count
          ? [
              {
                label: "Cambios (excedente)",
                value: closureSummary.change_extra_total ?? 0,
              },
              {
                label: "Cambios (reembolsos)",
                value: -(closureSummary.change_refund_total ?? 0),
              },
              ...(closureSummary.change_count
                ? [
                    {
                      label: "Cambios registrados",
                      value: closureSummary.change_count ?? 0,
                    },
                  ]
                : []),
            ]
          : []),
        { label: "Neto del período", value: closureNetAmount },
      ],
    [
      closureSummary.total_amount,
      closureSummary.total_refunds,
      closureSummary.change_extra_total,
      closureSummary.change_refund_total,
      closureSummary.change_count,
      closureNetAmount,
    ]
  );

  const closureRangeDescription = useMemo(() => {
    if (!closureRange) {
      return "Mostrando movimientos (ventas, devoluciones, cambios y abonos) registrados hoy.";
    }
    if (closureRange.startKey === closureRange.endKey) {
      return `Mostrando movimientos (ventas, devoluciones, cambios y abonos) registrados el ${closureRange.startLabel}.`;
    }
    return `Mostrando movimientos (ventas, devoluciones, cambios y abonos) registrados desde ${closureRange.startLabel} hasta ${closureRange.endLabel}.`;
  }, [closureRange]);

  const handleSubmitClosure = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) {
      setClosureError("Sesión expirada, inicia sesión nuevamente.");
      return;
    }
    const hasPendingReportedTotals =
      closureSummary.total_amount > 0 ||
      closureSummary.total_cash > 0 ||
      closureSummary.total_card > 0 ||
      closureSummary.total_qr > 0 ||
      closureSummary.total_nequi > 0 ||
      closureSummary.total_daviplata > 0 ||
      closureSummary.total_credit > 0 ||
      (closureSummary.change_extra_total ?? 0) > 0 ||
      (closureSummary.change_refund_total ?? 0) > 0;
    if (!hasPendingReportedTotals) {
      setClosureError("No hay ventas pendientes por cerrar.");
      return;
    }
    const shouldPreOpenWindow =
      printerConfig.mode !== "qz-tray" ||
      !printerConfig.printerName.trim() ||
      !qzInstance;
    const preOpenedWindow =
      shouldPreOpenWindow && typeof window !== "undefined"
        ? window.open("", "_blank", "width=420,height=640")
        : null;
    try {
      setClosureSaving(true);
      setClosureError(null);
      const payload = {
        pos_name: resolvedPosName,
        total_amount: closureForm.totalAmount,
        total_cash: closureForm.totalCash,
        total_card: closureForm.totalCard,
        total_qr: closureForm.totalQr,
        total_nequi: closureForm.totalNequi,
        total_daviplata: closureForm.totalDaviplata,
        total_credit: closureForm.totalCredit,
        total_refunds: closureForm.totalRefunds,
        net_amount: closureNetAmount,
        change_extra_total: closureForm.changeExtraTotal,
        change_refund_total: closureForm.changeRefundTotal,
        change_count: closureForm.changeCount,
        counted_cash: closureForm.countedCash,
        difference: closureDifference,
        notes: closureForm.notes.trim() || undefined,
        station_id: activeStationId ?? undefined,
      };
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/pos/closures`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(
          detail?.detail ?? `Error ${res.status} al generar el reporte Z.`
        );
      }
      const data = (await res.json()) as PosClosureResult;
      const normalizedSeparated =
        closureSeparatedInfo ??
        (data.separated_summary
          ? {
              tickets: data.separated_summary.tickets ?? 0,
              paymentsTotal: data.separated_summary.payments_total ?? 0,
              reservedTotal: data.separated_summary.reserved_total ?? 0,
              pendingTotal: data.separated_summary.pending_total ?? 0,
            }
          : null);
      const normalizedCustomMethods =
        (Array.isArray(data.custom_methods) && data.custom_methods.length > 0
          ? data.custom_methods
          : closureCustomMethods
        )
          .map((method) => ({
            label: method.label,
            amount: method.amount ?? 0,
            slug: method.slug ?? null,
          }))
          .filter((method) => method.amount > 0);
      const adjustedTotals: ClosureAdjustedTotals = {
        total_amount: closureForm.totalAmount,
        total_cash: closureForm.totalCash,
        total_card: closureForm.totalCard,
        total_qr: closureForm.totalQr,
        total_nequi: closureForm.totalNequi,
        total_daviplata: closureForm.totalDaviplata,
        total_credit: closureForm.totalCredit,
        total_refunds: closureForm.totalRefunds,
        net_amount: closureNetAmount,
        change_extra_total: closureForm.changeExtraTotal,
        change_refund_total: closureForm.changeRefundTotal,
        change_count: closureForm.changeCount,
        counted_cash: closureForm.countedCash,
        difference: closureDifference,
      };
      const enrichedData: PosClosureResult & {
        separated_summary?: PosClosureResult["separated_summary"];
      } = {
        ...data,
        ...adjustedTotals,
        custom_methods: normalizedCustomMethods.length
          ? normalizedCustomMethods
          : null,
        adjusted_totals: adjustedTotals,
        separated_summary: normalizedSeparated
          ? {
              tickets: normalizedSeparated.tickets,
              payments_total: normalizedSeparated.paymentsTotal,
              reserved_total: normalizedSeparated.reservedTotal,
              pending_total: normalizedSeparated.pendingTotal,
            }
          : data.separated_summary ?? null,
      };
      setClosureCustomMethods(normalizedCustomMethods);
      setClosureResult(enrichedData);
      setPendingClosureAlert(null);
      handlePrintClosureTicket(enrichedData, preOpenedWindow);
      void fetchPendingClosureTotals();
    } catch (err) {
      if (preOpenedWindow && !preOpenedWindow.closed) {
        preOpenedWindow.close();
      }
      console.error(err);
      setClosureError(
        err instanceof Error
          ? err.message
          : "No se pudo generar el reporte Z."
      );
    } finally {
      setClosureSaving(false);
    }
  };

  const handlePrintClosureTicket = useCallback(
    async (closureData?: PosClosureResult, targetWindow?: Window | null) => {
      const payload = closureData ?? closureResult;
      if (!payload) return;
      const now = payload.closed_at ? new Date(payload.closed_at) : new Date();
      const totalsSource = payload.adjusted_totals ?? {
        total_cash: payload.total_cash,
        total_card: payload.total_card,
        total_qr: payload.total_qr,
        total_nequi: payload.total_nequi,
        total_daviplata: payload.total_daviplata,
        total_credit: payload.total_credit,
        total_amount: payload.total_amount,
        total_refunds: payload.total_refunds,
        net_amount: payload.net_amount,
        counted_cash: payload.counted_cash,
        difference: payload.difference,
      };
      const dynamicMethods =
        (payload.custom_methods && payload.custom_methods.length > 0
          ? payload.custom_methods
          : closureCustomMethods) ?? [];
      const methodDetailsForPrint: ClosureMethodDetail[] =
        closureMethodDetails.length > 0
          ? closureMethodDetails
          : [
              {
                label: "Efectivo",
                gross: totalsSource.total_cash,
                refunds: 0,
                net: totalsSource.total_cash,
              },
              {
                label: "Tarjeta",
                gross: totalsSource.total_card,
                refunds: 0,
                net: totalsSource.total_card,
              },
              {
                label: "Transferencias / QR",
                gross: totalsSource.total_qr,
                refunds: 0,
                net: totalsSource.total_qr,
              },
              {
                label: "Nequi",
                gross: totalsSource.total_nequi,
                refunds: 0,
                net: totalsSource.total_nequi,
              },
              {
                label: "Daviplata",
                gross: totalsSource.total_daviplata,
                refunds: 0,
                net: totalsSource.total_daviplata,
              },
              {
                label: "Crédito / separado",
                gross: totalsSource.total_credit,
                refunds: 0,
                net: totalsSource.total_credit,
              },
              ...dynamicMethods.map((method) => ({
                label: method.label || "Otro método",
                gross: method.amount ?? 0,
                refunds: 0,
                net: method.amount ?? 0,
              })),
            ];
      const methodRows = methodDetailsForPrint
        .filter((method) => method.gross !== 0 || method.refunds !== 0 || method.net !== 0)
        .map((method) => ({
          label: method.label,
          gross: method.gross,
          refunds: method.refunds,
          net: method.net,
          amount: method.net,
        }));
      const userBreakdown =
        closureUsers.length > 0
          ? closureUsers
              .filter((user) => user.total > 0)
              .map((user) => ({ name: user.name, total: user.total }))
          : undefined;
      const separatedSummary =
        closureSeparatedInfo ??
        (payload.separated_summary
          ? {
              tickets: payload.separated_summary.tickets ?? 0,
              paymentsTotal: payload.separated_summary.payments_total ?? 0,
              reservedTotal: payload.separated_summary.reserved_total ?? 0,
              pendingTotal: payload.separated_summary.pending_total ?? 0,
            }
          : null);

      const rangeSummary = closureRange
        ? {
            startLabel: formatDateLabelFromKey(closureRange.startKey),
            endLabel: formatDateLabelFromKey(closureRange.endKey),
          }
        : undefined;
      const html = renderClosureTicket({
        documentNumber:
          payload.consecutive ?? `CL-${payload.id.toString().padStart(5, "0")}`,
        closedAt: now,
        posName: payload.pos_name ?? resolvedPosName,
        responsible: payload.closed_by_user_name,
        rangeSummary,
        totals: {
          registered: totalsSource.total_amount,
          refunds: totalsSource.total_refunds,
          net: totalsSource.net_amount,
          expectedCash: totalsSource.total_cash,
          countedCash: totalsSource.counted_cash,
          difference: totalsSource.difference,
          changeExtra: totalsSource.change_extra_total ?? 0,
          changeRefund: totalsSource.change_refund_total ?? 0,
          changeCount: totalsSource.change_count ?? 0,
        },
        methods: methodRows,
        userBreakdown,
        notes: payload.notes ?? null,
        settings: posSettings,
        separatedSummary: separatedSummary || undefined,
      });
      const existingWindow =
        targetWindow && typeof targetWindow.closed === "boolean" && !targetWindow.closed
          ? (targetWindow as Window)
          : null;

      const printWithQz = async (): Promise<boolean> => {
        if (printerConfig.mode !== "qz-tray") return false;
        if (!printerConfig.printerName.trim()) {
          setError("Selecciona la impresora en Configurar impresora.");
          return false;
        }
        if (!qzInstance) {
          setError("No detectamos QZ Tray. Ábrelo y autoriza este dominio.");
          return false;
        }
        if (!configureQzSecurity()) {
          setError("No se pudo configurar QZ. Verifica tu sesión.");
          return false;
        }
        try {
          if (!qzInstance.websocket.isActive()) {
            await qzInstance.websocket.connect();
          }
          const sizeWidth = printerConfig.width === "58mm" ? 58 : 80;
          const cfg = qzInstance.configs.create(printerConfig.printerName, {
            altPrinting: true,
            units: "mm",
            size: { width: sizeWidth },
            margins: { top: 0, right: 0, bottom: 0, left: 0 },
          });
          await qzInstance.print(cfg, [{ type: "html", format: "plain", data: html }]);
          setError(null);
          return true;
        } catch (err) {
          console.error(err);
          setError(
            err instanceof Error
              ? `No se pudo imprimir con QZ Tray: ${err.message}`
              : "No se pudo imprimir con QZ Tray."
          );
          return false;
        }
      };

      const openAndPrintInBrowser = () => {
        const winCandidate: Window | null =
          existingWindow ??
          (typeof window !== "undefined"
            ? window.open("", "_blank", "width=420,height=640")
            : null);
        if (!winCandidate) return;
        const win: Window = winCandidate;
        win.document.write(html);
        win.document.close();
        const shouldAutoClose = !existingWindow;
        const triggerPrint = () => {
          try {
            win.focus();
            win.print();
          } catch (err) {
            console.error("No se pudo iniciar la impresión del reporte Z", err);
          }
        };
        if ("onafterprint" in win) {
          win.onafterprint = () => {
            if (shouldAutoClose) {
              win.close();
            }
          };
        } else if (shouldAutoClose) {
          const closeTarget: Window = win;
          setTimeout(() => {
            if (closeTarget.closed === false) {
              closeTarget.close();
            }
          }, 2000);
        }
        setTimeout(triggerPrint, 120);
      };

      const printedWithQz = await printWithQz();
      if (printedWithQz) {
        if (existingWindow) existingWindow.close();
        return;
      }
      openAndPrintInBrowser();
    },
    [
      closureResult,
      closureUsers,
      posSettings,
      closureSeparatedInfo,
      closureCustomMethods,
      closureMethodDetails,
      resolvedPosName,
      closureRange,
      printerConfig,
      qzInstance,
      configureQzSecurity,
    ]
  );

  const sendClosureEmail = useCallback(
    async (
      closure: PosClosureResult,
      options?: { recipients?: string[]; subject?: string; message?: string }
    ) => {
      if (!token) {
        throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
      }
      const apiBase = getApiBase();
      const body: Record<string, unknown> = { attach_pdf: true };
      if (options?.recipients && options.recipients.length > 0) {
        body.recipients = options.recipients;
      }
      if (options?.subject?.trim()) {
        body.subject = options.subject.trim();
      }
      if (options?.message?.trim()) {
        body.message = options.message.trim();
      }
      const res = await fetch(`${apiBase}/pos/closures/${closure.id}/email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(
          detail?.detail ??
            `No se pudo enviar el reporte por email (Error ${res.status}).`
        );
      }
    },
    [token]
  );

  const handleOpenClosureEmailModal = useCallback(() => {
    if (!closureResult) return;
    const subjectBase = closureResult.consecutive
      ? `Reporte Z ${closureResult.consecutive}`
      : `Reporte Z CL-${closureResult.id.toString().padStart(5, "0")}`;
    setClosureEmailRecipients(
      (posSettings?.closure_email_recipients ?? []).join("\n")
    );
    setClosureEmailSubject(subjectBase);
    setClosureEmailMessage("");
    setClosureEmailFeedback(null);
    setClosureEmailError(null);
    setClosureEmailModalOpen(true);
  }, [closureResult, posSettings?.closure_email_recipients]);

  const submitClosureEmail = useCallback(async () => {
    if (!closureResult) return;
    const recipients = parseEmailsList(closureEmailRecipients);
    if (recipients.length === 0) {
      setClosureEmailError("Ingresa al menos un destinatario.");
      return;
    }
    setClosureEmailSending(true);
    setClosureEmailError(null);
    setClosureEmailFeedback(null);
    try {
      await sendClosureEmail(closureResult, {
        recipients,
        subject:
          closureEmailSubject.trim() ||
          `Reporte Z ${closureResult.consecutive ?? closureResult.id}`,
        message: closureEmailMessage.trim() || undefined,
      });
      setClosureEmailFeedback("Reporte enviado correctamente.");
    } catch (err) {
      console.error(err);
      setClosureEmailError(
        err instanceof Error
          ? err.message
          : "No se pudo enviar el correo del reporte Z."
      );
    } finally {
      setClosureEmailSending(false);
    }
  }, [
    closureEmailMessage,
    closureEmailRecipients,
    closureEmailSubject,
    closureResult,
    sendClosureEmail,
  ]);

  useEffect(() => {
    if (!closureResult) return;
    if (!token) return;
    if (!posSettings) return;
    if (lastClosureEmailedRef.current === closureResult.id) return;

    const configuredRecipients = posSettings?.closure_email_recipients ?? [];
    if (configuredRecipients.length === 0) {
      lastClosureEmailedRef.current = closureResult.id;
      setClosureEmailStatus("idle");
      setClosureEmailStatusMessage(
        "No hay destinatarios configurados para el envío automático del cierre."
      );
      return;
    }

    if (!isClosureEmailEnabledForStation) {
      lastClosureEmailedRef.current = closureResult.id;
      setClosureEmailStatus("idle");
      setClosureEmailStatusMessage(
        "El envío automático del cierre está desactivado para esta estación."
      );
      return;
    }

    let cancelled = false;
    setClosureEmailStatus("sending");
    setClosureEmailStatusMessage("Enviando reporte Z por email…");

    sendClosureEmail(closureResult)
      .then(() => {
        if (cancelled) return;
        setClosureEmailStatus("sent");
        setClosureEmailStatusMessage("Reporte Z enviado correctamente.");
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setClosureEmailStatus("error");
        setClosureEmailStatusMessage(
          err instanceof Error
            ? err.message
            : "No se pudo enviar el correo del cierre."
        );
      })
      .finally(() => {
        lastClosureEmailedRef.current = closureResult.id;
      });

    return () => {
      cancelled = true;
    };
  }, [
    closureResult,
    posSettings,
    sendClosureEmail,
    token,
    isClosureEmailEnabledForStation,
  ]);



  const loadProducts = useCallback(async (): Promise<boolean> => {
    if (!authHeaders) return false;
    try {
      setLoading(true);
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/products/`, {
        headers: authHeaders ?? undefined,
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`Error ${res.status}`);
      }
      const data: Product[] = await res.json();
      const activeOnly = data.filter((p) => p.active);
      setProducts(activeOnly);
      setError(null);
      return true;
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError("Error al cargar productos");
      return false;
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  const loadGroupAppearances = useCallback(async (): Promise<boolean> => {
    if (!authHeaders) return false;
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/product-groups`, {
        headers: authHeaders ?? undefined,
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data: { path: string; image_url: string | null; image_thumb_url: string | null; tile_color: string | null }[] =
        await res.json();
      const map: Record<string, GroupAppearance> = {};
      data.forEach((group) => {
        if (group.path) {
          map[group.path] = {
            image_url: group.image_url,
            image_thumb_url: group.image_thumb_url,
            tile_color: group.tile_color,
          };
        }
      });
      setGroupAppearances(map);
      return true;
    } catch (err) {
      console.warn("No se pudieron cargar los grupos", err);
      return false;
    }
  }, [authHeaders]);

  useEffect(() => {
    if (!authHeaders) return;
    void loadProducts();
  }, [authHeaders, loadProducts]);

  useEffect(() => {
    if (!authHeaders) return;
    void loadGroupAppearances();
  }, [authHeaders, loadGroupAppearances]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!userMenuRef.current) return;
      if (userMenuRef.current.contains(event.target as Node)) return;
      setUserMenuOpen(false);
    }
    if (userMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [userMenuOpen]);

  /* Atajos de teclado: Delete para borrar item seleccionado */
  useEffect(() => {
    function handleKeyDown(e: WindowEventMap["keydown"]) {
      // 1) Si estamos escribiendo en un input / textarea / contenido editable, NO borrar nada
      const target = e.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (isTypingTarget) return;

      // 2) Si hay un modal abierto (cantidad o descuento), ignorar también
      if (quantityModalOpen || discountModalOpen) return;

      // 3) Tecla Delete: borrar la línea seleccionada
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedCartId != null) {
          e.preventDefault();

          // borramos directamente aquí, en vez de llamar a handleDeleteSelected()
          setCart((prev: CartItem[]) => prev.filter((i: CartItem) => i.id !== selectedCartId));
          setSelectedCartId(null);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    // Cleanup
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedCartId, quantityModalOpen, discountModalOpen, setCart]);







  // --------- Estructura de grupos / subgrupos ---------
  const structuredProducts = useMemo(
    () =>
      products.map((p) => ({
        product: p,
        path: splitGroupPath(p.group_name),
        isService:
          (!p.group_name || !p.group_name.trim()) &&
          (p.service || p.allow_price_change),
      })),
    [products]
  );

  const filteredBySearch = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return structuredProducts;

    return structuredProducts.filter(({ product }) => {
      const text = (
        (product.name ?? "") +
        " " +
        (product.sku ?? "") +
        " " +
        (product.barcode ?? "")
      ).toLowerCase();
      return text.includes(term);
    });
  }, [structuredProducts, search]);

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;

    e.preventDefault();
    const code = search.trim();
    if (!code) return;

    if (shouldBlockSales) {
      setClosureReminderOpen(true);
      return;
    }

    // Buscar por código de barras o SKU
    const product = products.find(
      (p) => p.barcode === code || p.sku === code
    );

    if (!product) {
      // Si quieres, podríamos mostrar algún mensaje en el futuro
      return;
    }

    // Si es servicio o permite cambio de precio -> abrir modal de precio
    if (product.allow_price_change || product.service) {
      setPriceChangeProduct(product);
      const initialValue =
        product.price && product.price > 0
          ? product.price.toString()
          : "0";
      setPriceChangeValue(formatPriceInputValue(initialValue) || "0");
    } else {
      // Producto normal
      addProductToCart(product, product.price);
    }

    // Limpiamos la búsqueda para el siguiente escaneo
    setSearch("");
  }

  const getGroupImageForPath = useCallback(
    (path: Path): string | null => {
      if (!path.length) return null;
      const key = path.join("/");
      const meta = groupAppearances[key];
      if (!meta) return null;
      return resolveAssetUrl(meta.image_thumb_url ?? meta.image_url);
    },
    [groupAppearances, resolveAssetUrl]
  );

  const getGroupColorForPath = useCallback(
    (path: Path): string | null => {
      if (!path.length) return null;
      const key = path.join("/");
      const meta = groupAppearances[key];
      return meta?.tile_color ?? null;
    },
    [groupAppearances]
  );

  const handleManualSync = useCallback(async () => {
    if (!authHeaders) {
      setSyncStatus({
        type: "error",
        message: "Debes iniciar sesión para sincronizar.",
      });
      return;
    }
    if (syncingCatalog) return;
    setSyncStatus(null);
    setSyncingCatalog(true);
    const [productsOk, groupsOk] = await Promise.all([
      loadProducts(),
      loadGroupAppearances(),
    ]);
    if (productsOk && groupsOk) {
      setSyncStatus({
        type: "success",
        message: "Catálogo sincronizado.",
      });
    } else {
      setSyncStatus({
        type: "error",
        message: "No se pudo sincronizar. Intenta nuevamente.",
      });
    }
    setSyncingCatalog(false);
  }, [authHeaders, loadProducts, loadGroupAppearances, syncingCatalog]);

  const handleReloadPos = useCallback(() => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }, []);

  const handleExitKiosk = useCallback(() => {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        "¿Deseas salir del modo kiosk y cerrar la ventana?"
      );
      if (!confirmed) return;
    }
    if (typeof document !== "undefined" && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    if (typeof window !== "undefined") {
      try {
        window.close();
      } catch {
        // ignore close failures
      }
      const fallback = () => {
        if (!window.closed) {
          window.location.assign("/login-pos?exit=kiosk");
        }
      };
      if (openedAsNewTab) {
        window.setTimeout(fallback, 200);
      } else {
        fallback();
      }
    }
  }, [openedAsNewTab]);


  const buildTiles = useCallback((): GridTile[] => {
    const tiles: GridTile[] = [];

    const inSearch = search.trim().length > 0;

    if (inSearch) {
      // En modo búsqueda ignoramos grupos: mostramos productos planos
      filteredBySearch.forEach(({ product }) => {
        tiles.push({
          type: "product",
          id: `p-${product.id}`,
          product,
        });
      });
      return tiles;
    }

    const path = currentPath;

    if (path.length === 0) {
      // Pantalla principal: grupos raíz + servicios sin grupo
      const groupsSet = new Set<string>();

      filteredBySearch.forEach(({ path: pPath, isService }) => {
        if (isService) return;
        if (pPath && pPath.length > 0) {
          groupsSet.add(pPath[0]);
        }
      });

      Array.from(groupsSet)
        .sort((a, b) => a.localeCompare(b))
        .forEach((g) => {
          const imageUrl = getGroupImageForPath([g]);
          const color = getGroupColorForPath([g]);
          tiles.push({
            type: "group",
            id: `g-${g}`,
            label: g,
            path: [g],
            imageUrl,
            color,
          });
        });

      // Servicios / productos sin grupo al final (bloques grises)
      filteredBySearch.forEach(({ product, isService, path: pPath }) => {
        if (pPath && pPath.length > 0) return;
        if (!isService) return;
        tiles.push({
          type: "product",
          id: `p-${product.id}`,
          product,
        });
      });

      return tiles;
    }

    // Vista dentro de un grupo / subgrupo
    tiles.push({
      type: "back",
      id: "back",
      label: "Volver",
    });

    const subGroupSet = new Set<string>();
    const productTiles: ProductTile[] = [];


    filteredBySearch.forEach(({ product, path: pPath }) => {
      if (!pPath || pPath.length === 0) return;

      // ¿Coincide el prefijo con currentPath?
      const matches =
        pPath.length >= path.length &&
        path.every((seg, idx) => seg === pPath[idx]);

      if (!matches) return;

      if (pPath.length === path.length) {
        // Producto directamente en este grupo
        productTiles.push({
          type: "product",
          id: `p-${product.id}`,
          product,
        });
      } else {
        // Hay subgrupo más profundo
        const nextName = pPath[path.length];
        subGroupSet.add(nextName);
      }
    });

    Array.from(subGroupSet)
      .sort((a, b) => a.localeCompare(b))
      .forEach((sg) => {
        const subPath = [...path, sg];
        tiles.push({
          type: "group",
          id: `sg-${sg}`,
          label: sg,
          path: subPath,
          imageUrl: getGroupImageForPath(subPath),
          color: getGroupColorForPath(subPath),
        });
      });

    // Después de subgrupos, productos
    productTiles.sort((a, b) =>
      a.product.name.localeCompare(b.product.name)
    );
    tiles.push(...productTiles);

    return tiles;
  }, [filteredBySearch, currentPath, search, getGroupColorForPath, getGroupImageForPath]);

  const tiles = useMemo(() => buildTiles(), [buildTiles]);

  // --------- Paginación del grid ---------
  const PAGE_SIZE = 16; 

  const totalPages = Math.max(1, Math.ceil(tiles.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const pageTiles = useMemo(
    () => tiles.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [tiles, safePage]
  );

  // Cuando cambie el contenido (buscar / navegar), reseteamos página
  useEffect(() => {
    setCurrentPage(1);
  }, [search, currentPath.length]);

  // --------- Carrito & totales ---------
  function calcLineTotal(item: CartItem): number {
  const gross = item.quantity * item.unitPrice;
  return Math.max(0, gross - item.lineDiscountValue);
}

  // --------- Handlers: grid ---------
  function handleTileClick(tile: GridTile) {
    if (shouldBlockSales) {
      setClosureReminderOpen(true);
      return;
    }
    if (tile.type === "back") {
      if (currentPath.length === 0) return;
      setCurrentPath((prev) => prev.slice(0, -1));
      return;
    }

    if (tile.type === "group") {
      setCurrentPath(tile.path);
      return;
    }

    // Producto
    const product = tile.product;
    // Servicios o productos con cambio de precio
    if (product.allow_price_change || product.service) {
      setPriceChangeProduct(product);
      const initialValue =
        product.price && product.price > 0
          ? product.price.toString()
          : "0";
      setPriceChangeValue(formatPriceInputValue(initialValue) || "0");
      return;
    }

    // Producto normal
    addProductToCart(product, product.price);
    if (search.trim().length > 0) {
      focusSearchInput(true);
    }
  }

  function addProductToCart(product: Product, unitPrice: number) {
  if (shouldBlockSales) {
    setClosureReminderOpen(true);
    return;
  }
  setCart((prev: CartItem[]) => {
    const existingIndex = prev.findIndex(
      (item: CartItem) => item.id === product.id
    );
    if (existingIndex >= 0) {
      const updated = [...prev];
      const current = updated[existingIndex];
      updated[existingIndex] = {
        ...current,
        quantity: current.quantity + 1,
      };
      return updated;
    }

    return [
      ...prev,
      {
        id: product.id,
        product,
        quantity: 1,
        unitPrice,
        lineDiscountValue: 0,
        lineDiscountIsPercent: false,
        lineDiscountPercent: 0,
      },
    ];
  });
}




  // --------- Handlers: carrito ---------
  function handleSelectCartItem(id: number) {
    setSelectedCartId(id);
  }

  function getSelectedItem(): CartItem | undefined {
    if (selectedCartId == null) return undefined;
    return cart.find((i) => i.id === selectedCartId);
  }

  function handleDeleteSelected() {
    if (selectedCartId == null) return;

    setCart((prev: CartItem[]) =>
      prev.filter((i: CartItem) => i.id !== selectedCartId)
    );
    setSelectedCartId(null);
  }

  function handleOpenQuantityModal() {
    const item = getSelectedItem();
    if (!item) return;
    setQuantityValue(item.quantity.toString());
    setQuantityModalOpen(true);
  }

  function handleApplyQuantity(e: FormEvent) {
    e.preventDefault();
    const item = getSelectedItem();
    if (!item) return;

    const qty = parseFloat(quantityValue.replace(",", "."));
    if (!isFinite(qty) || qty <= 0) {
      setQuantityModalOpen(false);
      return;
    }

    setCart((prev: CartItem[]) =>
      prev.map((it: CartItem) =>
        it.id === item.id ? { ...it, quantity: qty } : it
      )
    );
    setQuantityModalOpen(false);
  }

  function handleOpenDiscountModal() {
    if (!cart.length) return;
    const selectedItem = getSelectedItem();
    const scope = selectedItem ? "item" : "cart";
    setDiscountScope(scope);

    let nextMode: DiscountMode = "value";
    let initialValue = "";

    if (scope === "item" && selectedItem) {
      if (
        selectedItem.lineDiscountIsPercent &&
        selectedItem.lineDiscountPercent > 0
      ) {
        nextMode = "percent";
        initialValue = selectedItem.lineDiscountPercent.toString();
      } else {
        nextMode = "value";
        initialValue =
          selectedItem.lineDiscountValue > 0
            ? selectedItem.lineDiscountValue.toString()
            : "";
      }
    } else if (cartDiscountPercent > 0) {
      nextMode = "percent";
      initialValue = cartDiscountPercent.toString();
    } else if (cartDiscountValue > 0) {
      nextMode = "value";
      initialValue = cartDiscountValue.toString();
    }

    setDiscountMode(nextMode);
    setDiscountInput(
      nextMode === "value" ? formatPriceInputValue(initialValue) : initialValue
    );
    setDiscountModalOpen(true);
  }

  function handleApplyDiscount(e: FormEvent) {
    e.preventDefault();
    const rawInput = discountInput.trim();
    const normalized =
      discountMode === "value"
        ? rawInput.replace(/\./g, "")
        : rawInput.replace(/,/g, ".");
    const value = parseFloat(normalized);
    if (!isFinite(value) || value < 0) {
      setDiscountModalOpen(false);
      return;
    }

    if (discountScope === "item") {
      const item = getSelectedItem();
      if (!item) {
        setDiscountModalOpen(false);
        return;
      }

      if (discountMode === "value") {
        setCart((prev: CartItem[]) =>
          prev.map((it: CartItem) =>
            it.id === item.id
              ? {
                  ...it,
                  lineDiscountValue: value,
                  lineDiscountIsPercent: false,
                  lineDiscountPercent: 0,
                }
              : it
          )
        );
      } else {
        const gross = item.quantity * item.unitPrice;
        const disc = (gross * value) / 100;
        setCart((prev: CartItem[]) =>
          prev.map((it: CartItem) =>
            it.id === item.id
              ? {
                  ...it,
                  lineDiscountValue: disc,
                  lineDiscountIsPercent: true,
                  lineDiscountPercent: value,
                }
              : it
          )
        );
      }
    } else {
      // carrito
      if (discountMode === "value") {
        setCartDiscountValue(value);
        setCartDiscountPercent(0);
      } else {
        setCartDiscountPercent(value);
        setCartDiscountValue(0);
      }
    }

    setDiscountModalOpen(false);
  }

  function handleNewOrder() {
    // Limpiar venta actual (carrito, descuentos, número de venta +1)
    clearSale();
    setSelectedCartId(null);

    // Volver el grid al estado inicial (Home)
    setCurrentPath([]);
    setCurrentPage(1);
    setSearch("");
  }

  function openCancelOrderDialog() {
    if (!cart.length) {
      handleNewOrder();
      return;
    }
    setConfirmCancelOpen(true);
  }

  function handleConfirmCancelOrder() {
    handleNewOrder();
    setConfirmCancelOpen(false);
  }

  function handleCloseCancelDialog() {
    setConfirmCancelOpen(false);
  }



  function handleApplyPriceChange(e: FormEvent) {
    e.preventDefault();
    if (!priceChangeProduct) return;

    const raw = priceChangeValue.trim().replace(/\./g, "").replace(",", ".");
    const val = parseFloat(raw);
    if (!isFinite(val) || val < 0) {
      setPriceChangeProduct(null);
      return;
    }

    addProductToCart(priceChangeProduct, val);
    setPriceChangeProduct(null);
  }

  function handleSavePrinterModal() {
    persistPrinterConfig(printerConfig);
    setQzGuideOpen(false);
    setPrinterModalOpen(false);
  }

  function handleClosePrinterModal() {
    setQzGuideOpen(false);
    setPrinterModalOpen(false);
  }

  async function handleOpenDrawerCommand() {
    if (printerConfig.mode !== "qz-tray") {
      setError("Configura QZ Tray para abrir el cajón automáticamente.");
      return;
    }
    if (!printerConfig.printerName) {
      setError("Selecciona la impresora en Configurar impresora antes de abrir el cajón.");
      return;
    }
    if (!qzInstance) {
      setError("No detectamos QZ Tray. Ábrelo y autoriza este dominio.");
      return;
    }
    try {
      if (!qzInstance.websocket.isActive()) {
        await qzInstance.websocket.connect();
      }
      const cfg = qzInstance.configs.create(printerConfig.printerName, {
        altPrinting: true,
      });
      const drawerPulse = "\x1B\x70\x00\x19\xFA";
      await qzInstance.print(cfg, [{ type: "raw", format: "command", data: drawerPulse }]);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? `No se pudo abrir el cajón: ${err.message}`
          : "No se pudo abrir el cajón. Revisa QZ Tray y la conexión de la impresora."
      );
    }
  }

  // --------- Render ---------
  const cartPanelStyle = isMobile
    ? undefined
    : {
        flexBasis: `${cartPanelWidthPercent}%`,
        width: `${cartPanelWidthPercent}%`,
        minWidth: CART_PANEL_MIN_WIDTH_PX,
        flexShrink: 0,
      };
  return (
    <main className="relative h-screen w-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden">
      {loading && (
        <div className="absolute inset-0 z-50 bg-slate-950/95 backdrop-blur-sm flex flex-col gap-6 px-6 py-8">
          <div className="h-12 rounded-2xl bg-slate-900/70 animate-pulse" />
          <div className="flex-1 grid gap-6 lg:grid-cols-[2.2fr,1fr]">
            <div className="rounded-3xl border border-slate-900/70 bg-slate-950/70 p-6 space-y-4">
              <div className="h-5 w-40 rounded bg-slate-800/70 animate-pulse" />
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                {Array.from({ length: 18 }).map((_, idx) => (
                  <div
                    key={`pos-skeleton-${idx}`}
                    className="h-20 rounded-2xl bg-slate-900 animate-pulse"
                  />
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-slate-900/70 bg-slate-950/80 p-6 space-y-4">
              <div className="h-5 w-32 rounded bg-slate-800/70 animate-pulse" />
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={`ticket-skeleton-${idx}`}
                  className="h-10 rounded-xl bg-slate-900 animate-pulse"
                />
              ))}
              <div className="h-12 rounded-2xl bg-slate-900 animate-pulse" />
            </div>
          </div>
          <div className="text-center text-xs text-slate-400">
            Sincronizando productos y métodos de pago…
          </div>
        </div>
      )}
      {/* Top bar */}
      <header className="bg-slate-900 border-b border-slate-800">
        <div className="h-16 min-h-[72px] flex items-center justify-between px-4">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              className="px-5 py-3.5 text-base bg-slate-800 hover:bg-slate-700 rounded flex items-center gap-1 md:hidden"
              onClick={() => setCartDrawerOpen(true)}
            >
              ☰ Carrito
            </button>
            {/* Botones estilo Aronium arriba de la pantalla */}
          <button
            className="px-5 py-3.5 text-base bg-slate-800 hover:bg-slate-700 rounded flex items-center gap-1"
            onClick={() => handleOpenDiscountModal()}
          >
            <span className="font-semibold">Descuento</span>
          </button>
          <button
            className="px-5 py-3.5 text-base bg-slate-800 hover:bg-slate-700 rounded"
            onClick={handleOpenQuantityModal}
          >
            Cantidad
          </button>
          <button
            className="px-6 py-3.5 text-base font-semibold bg-rose-600 hover:bg-rose-500 text-white rounded-md min-w-[128px]"
            onClick={handleDeleteSelected}
          >
            Eliminar
          </button>
          <button
            className="px-5 py-3.5 text-base bg-slate-800 hover:bg-slate-700 rounded border border-emerald-400/70 text-emerald-300 transition"
            onClick={() => {
              if (shouldBlockSales) {
                setClosureReminderOpen(true);
                return;
              }
              router.push("/pos/devoluciones");
            }}
          >
            Devolución
          </button>
          <button
            className="px-5 py-3.5 text-base bg-slate-800 hover:bg-slate-700 rounded border border-cyan-400/70 text-cyan-200 transition"
            onClick={() => {
              if (shouldBlockSales) {
                setClosureReminderOpen(true);
                return;
              }
              router.push("/pos/abonos");
            }}
          >
            Abono de separados
          </button>
          <button
            className="px-5 py-3.5 text-base bg-slate-800 hover:bg-slate-700 rounded border border-amber-400/70 text-amber-200 transition"
            onClick={() => router.push("/pos/clientes")}
          >
            Asignar cliente
          </button>
          <button
            className="px-5 py-3.5 text-base bg-slate-800 hover:bg-slate-700 rounded border border-emerald-400/70 text-emerald-200 transition"
            onClick={() => router.push("/pos/cambios")}
          >
            Cambio
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end gap-1 text-sm">
            <div className="flex items-center gap-2">
              {currentTime && (
                <span className="flex items-center gap-2 text-base text-slate-400 tracking-wide whitespace-nowrap">
                  <span>{currentTime}</span>
                  {currentPeriod && <span>{currentPeriod}</span>}
                </span>
              )}
              <button
                type="button"
                onClick={() => void handleManualSync()}
                disabled={syncingCatalog}
                className="flex items-center gap-2 rounded-full border border-slate-700 px-4 py-2 font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                <span role="img" aria-label="sincronizar">
                  🔄
                </span>
                {syncingCatalog ? "Sincronizando…" : "Sincronizar"}
              </button>
            </div>
            {syncStatus && (
              <span
                className={`text-[11px] ${
                  syncStatus.type === "error" ? "text-red-300" : "text-emerald-300"
                }`}
              >
                {syncStatus.message}
              </span>
            )}
          </div>
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setUserMenuOpen((prev) => !prev)}
              className="flex items-center gap-3 text-xs hover:bg-slate-800/70 rounded-full px-4 py-2 transition"
            >
              <div className="text-right leading-tight">
                <div className="text-base font-semibold text-slate-100">
                  {user?.name ?? "Usuario sin identificar"}
                </div>
                <div className="text-[12px] text-slate-400">{sellerRole}</div>
              </div>
              <div className="w-11 h-11 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-base font-semibold text-slate-100">
                {sellerInitials}
              </div>
            </button>
            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-slate-700 bg-slate-900 shadow-xl overflow-hidden z-30">
                <div className="px-5 py-3 text-[12px] uppercase tracking-wide text-slate-500 border-b border-slate-800">
                  Acciones de caja
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    router.push("/pos/historial");
                  }}
                  className="w-full text-left px-5 py-5 text-[17px] text-slate-100 hover:bg-slate-800 flex items-center justify-between"
                >
                  Historial
                  <span className="text-[12px] text-slate-400">Ventas registradas</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    handleOpenClosureModal();
                  }}
                  className="w-full text-left px-5 py-5 text-[17px] text-slate-100 hover:bg-slate-800 flex items-center justify-between"
                >
                  Cerrar caja
                  <span className="text-[12px] text-amber-200">Reporte Z</span>
                </button>
                {printerConfig.showDrawerButton && (
                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false);
                      void handleOpenDrawerCommand();
                    }}
                    className="w-full text-left px-5 py-5 text-[17px] text-slate-200 hover:bg-slate-800 flex items-center justify-between"
                  >
                    Abrir cajón
                    <span className="text-[11px] text-slate-400">
                      {printerConfig.mode === "qz-tray" ? "" : "Requiere QZ Tray"}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    router.push("/dashboard?posPreview=1");
                  }}
                  className="w-full text-left px-5 py-5 text-[17px] text-slate-200 hover:bg-slate-800"
                >
                  Ir al panel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    setPrinterModalOpen(true);
                  }}
                  className="w-full text-left px-5 py-5 text-[15px] text-slate-200 hover:bg-slate-800"
                >
                  Configurar impresora
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    void handleToggleFullscreen();
                  }}
                  className="w-full text-left px-5 py-5 text-[15px] text-slate-200 hover:bg-slate-800 flex items-center justify-between"
                >
                  {isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
                  <span className="text-[12px] text-slate-400">
                    {isFullscreen ? "Desactivar" : "Activar"}
                  </span>
                </button>
                <div className="border-t border-slate-800/60" />
                {isKioskMode && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        handleReloadPos();
                      }}
                      className="w-full text-left px-5 py-5 text-[16px] text-slate-200 hover:bg-slate-800 flex items-center justify-between"
                    >
                      Recargar POS
                      <span className="text-[12px] text-slate-400">Actualizar vista</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        handleExitKiosk();
                      }}
                      className="w-full text-left px-5 py-5 text-[16px] text-slate-200 hover:bg-slate-800 flex items-center justify-between"
                    >
                      Salir de kiosk
                      <span className="text-[12px] text-slate-400">
                        {openedAsNewTab ? "Cerrar ventana" : "Salir pantalla completa"}
                      </span>
                    </button>
                    <div className="border-t border-slate-800/60" />
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    logout("Cerraste sesión del POS.");
                    router.replace("/login-pos");
                  }}
                  className="w-full text-left px-5 py-5 text-[17px] text-rose-200 hover:bg-rose-500/10 flex items-center justify-between"
                >
                  Cerrar sesión
                  <span className="text-[12px] text-rose-300">Volver a ingresar</span>
                </button>
                {openedAsNewTab && (
                  <>
                    <div className="border-t border-slate-800/60" />
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        if (typeof window !== "undefined") {
                          window.close();
                        }
                      }}
                      className="w-full text-left px-5 py-5 text-[15px] text-slate-300 hover:bg-slate-800"
                    >
                      Cerrar pestaña POS
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        </div>

        <div className="flex items-center justify-between px-4 py-3 text-sm border-t border-slate-800">
          <div className="flex items-center gap-4">
            <span className="font-semibold text-base">{resolvedPosName}</span>
            <span className="text-slate-300 text-base">
              {sellerName}
            </span>
          </div>
        </div>
      </header>

      {(!isOnline || pendingBannerStatus || pendingSales.length > 0) && (
        <div className="px-4 py-3 space-y-2 border-b border-slate-900 bg-slate-950/70">
          {!isOnline && (
            <div className="px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs text-amber-100">
              Sin conexión a internet. Las ventas nuevas se guardarán como pendientes y podrás enviarlas cuando vuelva la red.
            </div>
          )}
          {pendingBannerStatus && (
            <div
              className={`px-3 py-2 rounded-lg border text-xs ${
                pendingBannerStatus.type === "error"
                  ? "border-rose-500/50 bg-rose-500/10 text-rose-100"
                  : pendingBannerStatus.type === "success"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
                  : "border-amber-400/40 bg-amber-400/10 text-amber-100"
              }`}
            >
              {pendingBannerStatus.message}
            </div>
          )}
          {pendingSales.length > 0 && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-amber-100">
                    {pendingSales.length} venta
                    {pendingSales.length === 1 ? "" : "s"} pendientes
                  </p>
                  <p className="text-[11px] text-amber-100/80">
                    Se guardaron sin conexión. Envíalas cuando vuelvas a estar en línea.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void refreshPendingSales()}
                    className="px-3 py-1.5 rounded-md border border-slate-600 text-xs text-slate-200 hover:bg-slate-800"
                  >
                    Actualizar
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSendAllPending()}
                    disabled={
                      !isOnline || sendingAllPending || pendingSales.length === 0
                    }
                    className="px-3 py-1.5 rounded-md border border-emerald-400/70 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sendingAllPending ? "Enviando…" : "Enviar todas"}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {pendingSales.slice(0, 3).map((sale) => (
                  <div
                    key={sale.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-amber-400/20 bg-slate-950/60 px-3 py-2 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-amber-100">
                        {formatMoney(sale.summary.total)} ·{" "}
                        {sale.summary.methodLabel}
                      </div>
                      <div className="text-[11px] text-slate-300">
                        Ticket #{sale.summary.saleNumber} ·{" "}
                        {formatDateTime(sale.summary.createdAt)}
                        {sale.summary.customerName
                          ? ` · ${sale.summary.customerName}`
                          : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRetryPendingSale(sale)}
                      disabled={
                        !isOnline ||
                        sendingAllPending ||
                        sendingPendingId === sale.id
                      }
                      className="px-3 py-1.5 rounded-md border border-emerald-400/70 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sendingPendingId === sale.id ? "Enviando…" : "Enviar"}
                    </button>
                  </div>
                ))}
                {pendingSales.length > 3 && (
                  <div className="text-[11px] text-slate-400">
                    +{pendingSales.length - 3} ventas pendientes adicionales.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {pendingClosureAlert && (
        <div className="px-4 py-3 bg-amber-500/10 border border-amber-400/40 text-amber-100 text-sm flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-amber-200">Cierre pendiente</p>
            <p className="text-xs text-amber-100/90">
              Se detectaron {pendingClosureAlert.count} ventas sin cierre desde{" "}
              {pendingClosureAlert.dateLabel}. Genera el reporte Z para dejar el día anterior al día.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                handleOpenClosureModal();
              }}
              className="px-3 py-1.5 rounded-md bg-amber-400 text-slate-900 text-xs font-semibold"
            >
              Realizar cierre
            </button>
            <button
              type="button"
              onClick={() => setClosureReminderOpen(true)}
              className="px-3 py-1.5 rounded-md border border-amber-400/50 text-xs"
            >
              Recordármelo luego
            </button>
          </div>
        </div>
      )}

      {/* Cuerpo: carrito izquierda, grid derecha */}
      {cartDrawerOpen && isMobile && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={() => setCartDrawerOpen(false)}
          aria-label="Cerrar carrito"
        />
      )}
      <div ref={layoutRef} className="flex flex-1 overflow-hidden">
        {/* Carrito */}
        <section
          className={`border-r border-slate-800 flex flex-col bg-slate-950 transition-all ${
            cartDrawerOpen
              ? "fixed inset-y-0 left-0 z-40 w-[90vw] max-w-md shadow-2xl md:static md:flex"
              : "hidden md:flex"
          }`}
          style={cartPanelStyle}
        >
          {/* Encabezado carrito */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
            <div className="flex flex-col">
              <span className="text-base font-semibold uppercase tracking-wide">
                Carrito
              </span>
              <span className="text-base text-slate-400">
                Venta No.{saleNumber.toString().padStart(1, "0")}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-400 hidden sm:inline">
                {cart.length} líneas
              </span>
              {isMobile && (
                <button
                  type="button"
                  className="text-xs text-slate-300 rounded-md border border-slate-700 px-2 py-1 md:hidden"
                  onClick={() => setCartDrawerOpen(false)}
                  aria-label="Cerrar carrito"
                >
                  Cerrar
                </button>
              )}
            </div>
          </div>

          {selectedCustomer && (
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/60">
              <div className="text-base text-slate-200">
                <span className="text-slate-400">Cliente:</span>{" "}
                <span className="font-semibold text-slate-50">
                  {selectedCustomer.name}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="ml-2 inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-[13px] font-semibold text-slate-200 hover:bg-slate-800 hover:text-rose-200 active:scale-95 transition"
                title="Quitar cliente de la venta"
                aria-label="Quitar cliente"
              >
                Quitar
              </button>
            </div>
          )}


          {/* Lista carrito */}
          <div className="flex-1 overflow-auto text-base">
            {cart.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-base select-none">
                No hay artículos
              </div>
            ) : (
              cart.map((item) => {
                const isSelected = item.id === selectedCartId;
                const lineTotal = calcLineTotal(item);
                const gross = item.quantity * item.unitPrice;
                const hasDiscount = item.lineDiscountValue > 0;

                return (
                  <button
                    key={item.id}
                    className={`w-full text-left px-4 py-3 border-b border-slate-800 ${
                      isSelected ? "bg-sky-800/60" : "hover:bg-slate-800/60"
                    }`}
                    onClick={() => handleSelectCartItem(item.id)}
                  >
                    <div className="flex justify-between gap-2">
                      <div className="flex-1">
                        <div className="font-semibold truncate text-base text-slate-50">
                          {item.product.name}
                        </div>
                        <div className="text-sm text-slate-400">
                          {item.quantity} x {formatMoney(item.unitPrice)}
                        </div>
                      </div>

                      <div className="text-right">
                        {hasDiscount && (
                          <div className="text-sm text-slate-500 line-through">
                            {formatMoney(gross)}
                          </div>
                        )}
                        <div className="font-semibold text-base text-slate-50">
                          {formatMoney(lineTotal)}
                        </div>
                        {hasDiscount && (
                          <div className="text-sm text-emerald-400">
                            Descuento -{formatMoney(item.lineDiscountValue)}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Totales */}
          <div className="border-t border-slate-800 text-base">
            {cartLineDiscountTotal > 0 && (
              <>
                <div className="flex justify-between px-4 py-2 text-slate-400">
                  <span>Subtotal sin descuentos</span>
                  <span>{formatMoney(cartGrossSubtotal)}</span>
                </div>
                <div className="flex justify-between px-4 py-2 text-emerald-400">
                  <span>Descuento artículos</span>
                  <span>-{formatMoney(cartLineDiscountTotal)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between px-4 py-2 text-slate-300">
              <span>Subtotal</span>
              <span>{formatMoney(cartSubtotal)}</span>
            </div>
            <div className="flex justify-between px-4 py-2 text-slate-400">
              <span>Descuento carrito</span>
              <span>
                {cartDiscountValue > 0
                  ? `-${formatMoney(cartDiscountValue)}`
                  : cartDiscountPercent > 0
                  ? `-${cartDiscountPercent}%`
                  : "0"}
              </span>
            </div>
            {cartSurcharge.enabled && cartSurcharge.amount > 0 && (
              <div className="flex justify-between px-4 py-2 text-amber-300">
                <span>
                  Incremento
                  {cartSurcharge.method
                    ? ` ${getSurchargeMethodLabel(cartSurcharge.method)}`
                    : ""}
                </span>
                <div className="flex items-center gap-2">
                  <span>{formatMoney(cartSurcharge.amount)}</span>
                  <button
                    type="button"
                    onClick={() => setSurchargeMenuOpen(true)}
                            className="px-3 py-1 text-sm font-semibold rounded-md border border-slate-600 text-slate-200 hover:bg-slate-800"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={handleDeactivateSurcharge}
                    className="px-3 py-1 text-sm font-semibold rounded-md border border-rose-500/60 text-rose-200 hover:bg-rose-500/10"
                  >
                    Quitar
                  </button>
                </div>
              </div>
            )}
            <div className="flex justify-between px-4 py-3 bg-slate-900 font-semibold text-lg">
              <span>TOTAL</span>
              <span>{formatMoney(cartTotal)}</span>
            </div>
          </div>

          {/* Botón Pago grande */}
          <button
            className={`w-full font-semibold py-7 text-xl rounded-none ${
              canProceedToPayment
                ? "bg-emerald-500 hover:bg-emerald-400 text-slate-900"
                : "bg-slate-800 text-slate-500 cursor-not-allowed"
            }`}
            disabled={!canProceedToPayment}
            onClick={handleProceedToPayment}
          >
            Pago
          </button>

            
          {/* Botones inferiores (estilo Aronium mejorado) */}
          <div className="border-t border-slate-800 bg-slate-900 px-4 py-3">
            <div className="flex gap-4">
              <button
                className="flex-1 h-14 bg-red-600 hover:bg-red-700 text-sm font-semibold rounded-md"
                onClick={openCancelOrderDialog}
              >
                Anular orden
              </button>

              <button
                className="flex-1 h-14 bg-slate-800 hover:bg-slate-700 text-sm rounded-md"
              >
                Bloquear
              </button>

              <div className="relative flex-1" ref={surchargeMenuRef}>
                <button
                  type="button"
                  onClick={() => setSurchargeMenuOpen((prev) => !prev)}
                  className={`w-full h-14 text-sm rounded-md border ${
                    cartSurcharge.enabled
                      ? "border-amber-400 text-amber-200 bg-slate-800"
                      : "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                  }`}
                >
                  {cartSurcharge.enabled
                    ? `Incremento · ${getSurchargeMethodLabel(
                        cartSurcharge.method
                      )}`
                    : "Incremento"}
                </button>

                {surchargeMenuOpen && (
                  <div className="absolute right-0 bottom-16 w-72 rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl z-20">
                    <div className="px-4 py-2 text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-800">
                      Selecciona incremento
                    </div>
                    <div className="p-4 space-y-3">
                      <button
                        type="button"
                        onClick={() => applySurchargePreset("addi")}
                        className="w-full rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-500/20"
                      >
                        Addi · 5% ({formatMoney(
                          roundUpToThousand(baseTotalForSurcharge * 0.05)
                        )})
                      </button>
                      <button
                        type="button"
                        onClick={() => applySurchargePreset("sistecredito")}
                        className="w-full rounded-md border border-sky-500/50 bg-sky-500/10 px-3 py-2 text-sm text-sky-100 hover:bg-sky-500/20"
                      >
                        Sistecrédito · 5% ({formatMoney(
                          roundUpToThousand(baseTotalForSurcharge * 0.05)
                        )})
                      </button>
                    </div>
                    <div className="border-t border-slate-800 p-4 space-y-3">
                      <label className="text-xs uppercase tracking-wide text-slate-500">
                        Valor manual
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={customSurchargeValue
                          .replace(/[^\d]/g, "")
                          .replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
                        onChange={(e) =>
                          handleManualValueChange(e.target.value)
                        }
                        onKeyDown={handleManualSurchargeKeyDown}
                        placeholder="Ej. 50.000"
                        className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-slate-100 text-right tracking-wide"
                      />
                      <label className="text-xs uppercase tracking-wide text-slate-500">
                        Porcentaje manual
                      </label>
                      <div className="flex items-center rounded-md border border-slate-700 bg-slate-900 px-2">
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={customSurchargePercent}
                          onChange={(e) =>
                            handleManualPercentChange(e.target.value)
                          }
                          onKeyDown={handleManualSurchargeKeyDown}
                          className="w-full bg-transparent py-1.5 text-right text-slate-100 outline-none"
                        />
                        <span className="text-slate-400 text-sm pr-1">%</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleApplyManualSurcharge}
                        className="w-full rounded-md bg-emerald-500 text-slate-900 text-sm font-semibold py-2"
                      >
                        Aplicar
                      </button>
                      <button
                        type="button"
                        onClick={handleDeactivateSurcharge}
                        className="text-xs text-rose-300 hover:text-rose-200 underline"
                      >
                        Desactivar incremento
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-valuemin={CART_PANEL_MIN_PERCENT}
          aria-valuemax={CART_PANEL_MAX_PERCENT}
          aria-valuenow={Math.round(cartPanelWidthPercent)}
          tabIndex={0}
          onMouseDown={handleCartResizeStart}
          onTouchStart={handleCartResizeStart}
          onKeyDown={handleCartResizeKeyDown}
          onDoubleClick={handleCartResizeReset}
          className={`flex flex-col items-center justify-center px-1 ${
            isResizingCartPanel ? "bg-emerald-500/10" : "bg-slate-900/20"
          } border-r border-slate-900/40 cursor-col-resize select-none`}
          aria-label="Ajustar ancho del carrito"
        >
          <div className="h-12 w-1 rounded-full bg-slate-600" />
        </div>

        {/* Grid productos / grupos */}
        <section className="flex-1 flex flex-col">
          {/* Búsqueda y breadcrumb */}
          <div className="min-h-[65.5px] flex items-center px-4 py-2 border-b border-slate-800 bg-slate-900 gap-3">
            <div className="flex-1">
              <input
                ref={searchInputRef}
                value={search}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setSearch(e.target.value)                  
                }
                onKeyDown={handleSearchKeyDown}
                placeholder="Buscar productos por nombre, código o código de barras"
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-4 py-2 text-base outline-none focus:border-emerald-400"
              />
            </div>
            <div className="text-xs text-slate-400">
              {currentPath.length === 0 ? (
                <span>Inicio</span>
              ) : (
                <span>
                  {["Inicio", ...currentPath].join(" › ")}
                </span>
              )}
            </div>
          </div>

          {/* Grid + paginación */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Grid */}
            <div className="flex-1 overflow-auto px-3 py-3">
              <div
                ref={gridRef}
                className="grid w-full gap-4"
                style={gridStyle}
              >
                {pageTiles.map((tile) => {
                  if (tile.type === "back") {
                    return (
                      <button
                        key={tile.id}
                        onClick={() => handleTileClick(tile)}
                        className="rounded-lg border border-slate-600 bg-slate-900 hover:bg-slate-800 flex items-center justify-center text-sm font-semibold select-none"
                      >
                        ← Volver
                      </button>
                    );
                  }

                  if (tile.type === "group") {
                    const groupStyle = tile.color ? { backgroundColor: tile.color } : undefined;
                    return (
                      <button
                        key={tile.id}
                        onClick={() => handleTileClick(tile)}
                        className="rounded-lg bg-slate-800 hover:bg-slate-700 flex flex-col items-center justify-center text-sm font-semibold text-center px-3 py-4 select-none"
                        style={groupStyle}
                      >
                        <div className="w-full flex flex-col items-center gap-2">
                          {tile.imageUrl && (
                            <div
                              className="w-full rounded-lg flex items-center justify-center overflow-hidden p-2"
                              style={{
                                height: `${tileImageHeight}px`,
                                maxHeight: `${tileImageHeight}px`,
                              }}
                            >
                              <img
                                src={tile.imageUrl}
                                alt={tile.label}
                                loading="lazy"
                                className="max-h-full max-w-full object-contain"
                              />
                            </div>
                          )}
                          <span
                            className="text-center font-semibold text-slate-100 leading-tight whitespace-normal break-words mt-1"
                            style={{ fontSize: `${tileLabelFontSize}rem` }}
                          >
                            {tile.label}
                          </span>
                        </div>
                      </button>
                    );
                  }

                  const product = tile.product;
                  const productImageUrl = resolveAssetUrl(
                    product.image_thumb_url ?? product.image_url
                  );
                  const hasProductImage = Boolean(productImageUrl);
                  const isServiceTile =
                    (!product.group_name || !product.group_name.trim()) &&
                    (product.service || product.allow_price_change);
                  const tileBgClass = hasProductImage
                    ? "bg-slate-800 hover:bg-slate-700"
                    : isServiceTile
                      ? "bg-slate-800 hover:bg-slate-700"
                      : "bg-slate-700 hover:bg-slate-600";
                  const tileStyle = product.tile_color
                    ? { backgroundColor: product.tile_color }
                    : undefined;

                  return (
                    <button
                      key={tile.id}
                      onClick={() => handleTileClick(tile)}
                      className={`group relative w-full h-full min-h-[190px] rounded-xl border border-slate-700/60 px-3 py-3 text-xs text-slate-50 overflow-hidden select-none ${tileBgClass}`}
                      style={tileStyle}
                    >
                      {hasProductImage ? (
                        <div className="flex h-full w-full flex-col items-center justify-between gap-2">
                          <span
                            className="line-clamp-2 text-center font-semibold mt-1"
                            style={{ fontSize: `${tileLabelFontSize}rem` }}
                          >
                            {product.name}
                          </span>
                          <div
                            className="flex-1 w-full flex items-center justify-center py-2 overflow-hidden min-h-0"
                            style={{
                              height: `${tileImageHeight}px`,
                              maxHeight: `${tileImageHeight}px`,
                            }}
                          >
                            <img
                              src={productImageUrl ?? undefined}
                              alt={product.name}
                              loading="lazy"
                              className="max-h-full max-w-full object-contain"
                            />
                          </div>
                          <span
                            className="font-bold mb-1"
                            style={{ fontSize: `${tilePriceFontSize}rem` }}
                          >
                            {formatMoney(product.price)}
                          </span>
                        </div>
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-between">
                          <span
                            className="mt-1 line-clamp-2 text-center font-semibold"
                            style={{ fontSize: `${tileLabelFontSize}rem` }}
                          >
                            {product.name}
                          </span>
                          <span
                            className="mt-2 text-slate-300"
                            style={{ fontSize: `${tileMetaFontSize}rem` }}
                          >
                            {product.sku || product.barcode || " "}
                          </span>
                          <span
                            className="mt-3 font-bold"
                            style={{ fontSize: `${tilePriceFontSize}rem` }}
                          >
                            {formatMoney(product.price)}
                          </span>
                        </div>
                      )}
                    </button>
                  );

                })}

                {pageTiles.length === 0 && !loading && (
                  <div className="col-span-full text-center text-sm text-slate-400 py-6">
                    No hay elementos para mostrar.
                  </div>
                )}
              </div>
            </div>

            {/* Paginación inferior */}
            <div className="h-14 border-t border-slate-800 flex items-center justify-between px-6 text-sm bg-slate-900">
              <span className="whitespace-nowrap">
                Página {safePage} / {totalPages}
              </span>
              <div className="flex items-center gap-4">
                <div className="hidden items-center gap-2 text-xs text-slate-300 lg:flex">
                  <span className="text-slate-400">Zoom</span>
                  <button
                    type="button"
                    onClick={() => handleZoomChange(-GRID_ZOOM_STEP)}
                    className="px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700"
                  >
                    –
                  </button>
                  <button
                    type="button"
                    onClick={handleZoomReset}
                    className="px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700"
                  >
                    {Math.round(gridZoom * 100)}%
                  </button>
                  <button
                    type="button"
                    onClick={() => handleZoomChange(GRID_ZOOM_STEP)}
                    className="px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700"
                  >
                    +
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    className="px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-40"
                    disabled={safePage === 1}
                    onClick={() => setCurrentPage(1)}
                  >
                    ⏮
                  </button>
                  <button
                    className="px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-40"
                    disabled={safePage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  >
                    ◀
                  </button>
                  <button
                    className="px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-40"
                    disabled={safePage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  >
                    ▶
                  </button>
                  <button
                    className="px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-40"
                    disabled={safePage === totalPages}
                    onClick={() => setCurrentPage(totalPages)}
                  >
                    ⏭
                  </button>
                  <button
                    className="ml-4 px-4 py-2 rounded-md bg-slate-800 hover:bg-slate-700"
                    onClick={() => {
                      setCurrentPath([]);
                      setCurrentPage(1);
                      setSearch("");
                    }}
                  >
                    Home
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Modales */}
      {/* Cantidad */}
      {quantityModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-20 px-4">
          <form
            onSubmit={handleApplyQuantity}
            className="bg-slate-900 rounded-3xl border border-slate-700 px-8 py-7 w-full max-w-md text-base space-y-5 shadow-2xl"
          >
            <h2 className="font-semibold text-lg text-center">Cambiar cantidad</h2>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => adjustQuantityValue(-1)}
                className="h-20 w-20 rounded-2xl border border-slate-700 bg-slate-950 text-4xl font-semibold text-slate-100 hover:bg-slate-900 focus:outline-none focus-visible:bg-slate-900 active:bg-slate-900"
              >
                –
              </button>
              <div className="flex-1 h-20 rounded-2xl border border-slate-700 bg-slate-950 flex items-center justify-center">
                <input
                  ref={quantityInputRef}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={quantityValue}
                  onChange={(e) => setQuantityValue(e.target.value.replace(/[^0-9]/g, ""))}
                  className="w-full bg-transparent px-4 text-center text-4xl font-semibold tracking-wide outline-none select-none"
                />
              </div>
              <button
                type="button"
                onClick={() => adjustQuantityValue(1)}
                className="h-20 w-20 rounded-2xl border border-slate-700 bg-slate-950 text-4xl font-semibold text-slate-100 hover:bg-slate-900 focus:outline-none focus-visible:bg-slate-900 active:bg-slate-900"
              >
                +
              </button>
            </div>
            <div className="flex justify-end gap-3 pt-2 text-base">
              <button
                type="button"
                className="px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700"
                onClick={() => setQuantityModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold"
              >
                Aplicar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Descuento */}
      {discountModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-20 px-4">
          <form
            onSubmit={handleApplyDiscount}
            className="bg-slate-900 rounded-3xl border border-slate-700 px-8 py-7 w-full max-w-md text-base space-y-5 shadow-2xl"
          >
            <div>
              <h2 className="font-semibold text-lg text-slate-100">
                {discountScope === "item"
                  ? "Aplicar descuento a artículo"
                  : "Aplicar descuento al carrito"}
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                Elige dónde aplicar el descuento y escribe el valor o porcentaje. Pulsa “Aplicar” para confirmar.
              </p>
            </div>

            {/* Alcance */}
            <div className="flex gap-3 text-sm">
              <button
                type="button"
                onClick={() => setDiscountScope("item")}
                className={`flex-1 py-2 rounded-xl border transition ${
                  discountScope === "item"
                    ? "border-emerald-400 bg-emerald-950 text-emerald-100"
                    : "border-slate-700 bg-slate-900 text-slate-200"
                }`}
              >
                Artículo
              </button>
              <button
                type="button"
                onClick={() => setDiscountScope("cart")}
                className={`flex-1 py-2 rounded-xl border transition ${
                  discountScope === "cart"
                    ? "border-emerald-400 bg-emerald-950 text-emerald-100"
                    : "border-slate-700 bg-slate-900 text-slate-200"
                }`}
              >
                Carrito
              </button>
            </div>

            {/* Tipo de descuento */}
            <div className="flex gap-3 text-sm">
              <button
                type="button"
                onClick={() => {
                  setDiscountMode("value");
                  setDiscountInput((prev) => formatPriceInputValue(prev));
                }}
                className={`flex-1 py-2 rounded-xl border transition ${
                  discountMode === "value"
                    ? "border-emerald-400 bg-emerald-950 text-emerald-100"
                    : "border-slate-700 bg-slate-900 text-slate-200"
                }`}
              >
                Valor $
              </button>
              <button
                type="button"
                onClick={() => {
                  setDiscountMode("percent");
                  setDiscountInput((prev) => prev.replace(/\./g, ""));
                }}
                className={`flex-1 py-2 rounded-xl border transition ${
                  discountMode === "percent"
                    ? "border-emerald-400 bg-emerald-950 text-emerald-100"
                    : "border-slate-700 bg-slate-900 text-slate-200"
                }`}
              >
                %
              </button>
            </div>

            <input
              autoFocus
              inputMode={discountMode === "value" ? "numeric" : "decimal"}
              value={discountInput}
              onChange={(e) => handleDiscountInputChange(e.target.value)}
              placeholder={
                discountMode === "value"
                  ? "Cantidad a descontar"
                  : "Porcentaje a descontar"
              }
              className="w-full rounded-2xl bg-slate-950 border border-slate-700 px-4 py-3 outline-none focus:border-emerald-400 text-lg"
            />

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                className="px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700"
                onClick={() => setDiscountModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold"
              >
                Aplicar
              </button>
            </div>
          </form>
        </div>
      )}

      {closureReminderOpen && (
        <div className="fixed inset-0 z-40 bg-black/70 px-4 flex items-center justify-center">
          <div className="w-full max-w-md rounded-2xl border border-amber-400/40 bg-slate-950 text-slate-100 p-6 space-y-4 shadow-2xl">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-amber-300">
                Recordatorio de cierre
              </p>
              <h3 className="mt-2 text-xl font-semibold">
                ¿Cerrar el día pendiente antes de continuar?
              </h3>
              <p className="mt-3 text-sm text-slate-300">
                Hay ventas sin cierre registradas el{" "}
                <span className="text-amber-200 font-semibold">
                  {pendingClosureAlert?.dateLabel ?? "día anterior"}
                </span>
                . Te recomendamos generar el reporte Z antes de seguir con la
                venta actual.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
                onClick={() => setClosureReminderOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-xl border border-amber-400/70 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-400/20"
                onClick={() => {
                  setClosureReminderOpen(false);
                  handleOpenClosureModal();
                }}
              >
                Cerrar día pendiente
              </button>
              <button
                type="button"
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-emerald-400"
                onClick={() => {
                  acknowledgePendingClosureAlert();
                  setClosureReminderOpen(false);
                }}
              >
                Continuar sin cerrar
              </button>
            </div>
          </div>

        </div>
      )}

      {qzGuideOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="w-full max-w-3xl rounded-3xl border border-slate-800 bg-slate-950 text-slate-100 shadow-2xl max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex items-start justify-between px-5 py-4 border-b border-slate-800">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">
                  Guia de configuracion
                </p>
                <h3 className="text-lg font-semibold">QZ Tray y impresoras</h3>
              </div>
              <button
                type="button"
                onClick={() => setQzGuideOpen(false)}
                className="text-slate-400 hover:text-slate-100 text-2xl leading-none"
                aria-label="Cerrar guia"
              >
                ×
              </button>
            </div>
            <div className="p-5 space-y-4 text-sm overflow-auto">
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs text-slate-300">
                Descarga QZ Tray en{" "}
                <a
                  href="https://qz.io/download/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-300 underline"
                >
                  qz.io/download
                </a>
                .
              </div>
              {qzGuideSections.map((section) => (
                <div
                  key={section.title}
                  className="rounded-xl border border-slate-800/70 bg-slate-900/40 p-4 space-y-2"
                >
                  <p className="font-semibold text-slate-100">{section.title}</p>
                  <ul className="list-disc pl-4 text-xs text-slate-300 space-y-1">
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
              <div className="rounded-xl border border-slate-800/70 bg-slate-950/80 p-4 text-xs text-slate-300 space-y-2">
                <p className="font-semibold text-slate-100">Nota macOS</p>
                <p>
                  Si QZ no deja importar el certificado, copia el cert a{" "}
                  <code className="text-slate-100">override.crt</code>:
                </p>
                <pre className="whitespace-pre-wrap rounded-lg bg-slate-950 px-3 py-2 text-[11px] text-slate-200 border border-slate-800">
sudo cp ~/Downloads/qz_api.crt &quot;/Applications/QZ Tray.app/Contents/Resources/override.crt&quot;
                </pre>
                <p>Reinicia QZ Tray despues de copiar.</p>
              </div>
              <div className="flex justify-end gap-2">
                <a
                  href="/docs/qz-tray-setup"
                  className="px-3 py-2 rounded-lg border border-slate-700 text-slate-200 text-xs hover:bg-slate-800/70"
                >
                  Ver guia completa
                </a>
                <button
                  type="button"
                  onClick={() => setQzGuideOpen(false)}
                  className="px-3 py-2 rounded-lg bg-emerald-500 text-slate-900 text-xs font-semibold hover:bg-emerald-400"
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {closeModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-30 px-4 py-6 overflow-y-auto sm:items-center sm:py-0">
          <form
            onSubmit={handleSubmitClosure}
            className="w-full max-w-4xl max-h-[calc(100vh-2rem)] sm:max-h-[90vh] rounded-2xl border border-slate-700 bg-slate-900 text-sm flex flex-col"
          >
            <div className="flex-1 overflow-y-auto space-y-5 p-6 pr-4">
              <header className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-amber-300 tracking-wide uppercase">
                  Cierre de caja
                </p>
                <h2 className="text-2xl font-semibold text-slate-100">
                  Reporte Z preliminar
                </h2>
                <p className="text-slate-400">
                  Esta vista es un adelanto del cierre. Cuando conectemos los datos reales del backend, aquí verás los totales exactos por método de pago y las diferencias en caja.
                </p>
                <p className="text-xs text-slate-400 mt-2">
                  {closureRangeDescription}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseClosureModal}
                className="text-slate-400 hover:text-slate-100 text-xl leading-none"
                aria-label="Cerrar reporte Z"
              >
                ×
              </button>
            </header>

            {closureTotalsLoading && !closureResult && (
              <div className="rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-400">
                Cargando ventas del día para prellenar el cierre…
              </div>
            )}

            {closureResult && (
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100 space-y-2">
                <div>
                  Reporte registrado como{" "}
                  <span className="font-semibold">
                    {closureResult.consecutive ?? `CL-${closureResult.id}`}
                  </span>{" "}
                  por {closureResult.closed_by_user_name} el{" "}
                  {closureResult.closed_at
                    ? formatBogotaDate(closureResult.closed_at, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })
                    : "—"}
                  .
                  {closureResult.opened_at && closureResult.closed_at && (
                    <>
                      {" "}
                      Incluye movimientos desde{" "}
                      <span className="font-semibold">
                        {formatDateLabelFromIso(closureResult.opened_at)}
                      </span>{" "}
                      hasta{" "}
                      <span className="font-semibold">
                        {formatDateLabelFromIso(closureResult.closed_at)}
                      </span>
                      .
                    </>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-200">
                  <span>
                    ¿No viste la ventana para imprimir? Puedes abrir el ticket aquí:
                  </span>
                  <button
                    type="button"
                    onClick={() => handlePrintClosureTicket()}
                    className="px-3 py-1.5 rounded-md border border-emerald-400 text-emerald-50 hover:bg-emerald-400/10"
                  >
                    Ver / imprimir reporte Z
                  </button>
                </div>
                {closureEmailStatusMessage && (
                  <p
                    className={
                      "text-xs " +
                      (closureEmailStatus === "error"
                        ? "text-red-300"
                        : closureEmailStatus === "sent"
                        ? "text-emerald-300"
                        : "text-slate-200")
                    }
                  >
                    {closureEmailStatusMessage}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-200">
                  <span>¿Necesitas reenviar el cierre?</span>
                  <button
                    type="button"
                    onClick={handleOpenClosureEmailModal}
                    className="px-3 py-1.5 rounded-md border border-slate-600 hover:bg-slate-800 disabled:opacity-50"
                    disabled={closureEmailSending}
                  >
                    Reenviar por email
                  </button>
                  {closureEmailFeedback && (
                    <span className="text-emerald-300">
                      {closureEmailFeedback}
                    </span>
                  )}
                </div>
              </div>
            )}

            <section className="grid lg:grid-cols-[1.3fr_0.7fr] gap-4">
              <div className="rounded-2xl border border-slate-800 overflow-hidden">
                <div className="px-4 py-2 bg-slate-950 text-xs text-slate-400 uppercase tracking-wide">
                  Totales registrados
                </div>
                <div className="grid sm:grid-cols-2 gap-3 p-4">
                  {closureRegisteredTotals.map((item) => (
                    <div key={item.label} className="text-xs text-slate-300 flex flex-col gap-1">
                      {item.label}
                      <div className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-slate-50 font-mono">
                        {formatMoney(item.value)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 overflow-hidden flex flex-col">
                <div className="px-4 py-2 bg-slate-950 text-xs text-slate-400 uppercase tracking-wide">
                  Conteo físico y notas
                </div>
                <div className="p-4 space-y-3 flex-1">
                  <label className="text-xs text-slate-300 flex flex-col gap-1">
                    Efectivo contado en caja
                    <input
                      type="number"
                      step="0.01"
                      value={closureForm.countedCash}
                      onChange={(e) =>
                        updateClosureField("countedCash", Number(e.target.value))
                      }
                      className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
                    />
                  </label>
                  <label className="text-xs text-slate-300 flex flex-col gap-1">
                    Notas del cierre
                    <textarea
                      rows={4}
                      value={closureForm.notes}
                      onChange={(e) => updateClosureField("notes", e.target.value)}
                      className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
                      placeholder="Observaciones, diferencias, responsable, etc."
                    />
                  </label>
                  <div className="rounded-md border border-slate-700 bg-slate-950/30 px-3 py-2 text-xs text-slate-300 space-y-1">
                    <p>
                      <span className="text-slate-400">Neto del día:</span>{" "}
                      <span className="font-semibold text-slate-100">
                        {formatMoney(closureNetAmount)}
                      </span>
                    </p>
                    <p>
                      <span className="text-slate-400">Diferencia en caja:</span>{" "}
                      <span
                        className={
                          closureDifference === 0
                            ? "text-slate-100"
                            : closureDifference > 0
                            ? "text-emerald-300"
                            : "text-rose-300"
                        }
                      >
                        {formatMoney(closureDifference)}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <div className="grid md:grid-cols-3 gap-4">
              {[
                {
                  title: "Ventas brutas",
                  value: formatMoney(closureSummary.total_amount),
                  note: "Antes de reembolsos",
                },
                {
                  title: "Reembolsos",
                  value: formatMoney(-closureSummary.total_refunds),
                  note: "Devoluciones del período",
                },
                {
                  title: "Neto del período",
                  value: formatMoney(closureNetAmount),
                  note: "Ventas menos reembolsos",
                },
              ].map((card) => (
                <div
                  key={card.title}
                  className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3"
                >
                  <p className="text-xs text-slate-400 uppercase tracking-wide">
                    {card.title}
                  </p>
                  <p className="text-2xl font-semibold text-slate-50">{card.value}</p>
                  <p className="text-[11px] text-slate-500">{card.note}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-slate-800 overflow-hidden">
              <div className="px-4 py-2 bg-slate-950 text-xs text-slate-400 uppercase tracking-wide">
                Detalle por método
              </div>
              <div className="divide-y divide-slate-800">
                {closureMethodsUsed.length === 0 && (
                  <div className="px-4 py-3 text-xs text-slate-500">
                    No se registraron movimientos por método.
                  </div>
                )}
                {closureMethodsUsed.length > 0 && (
                  <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-3 px-4 py-2 text-[11px] text-slate-500 uppercase tracking-wide">
                    <span>Método</span>
                    <span className="text-right">Ventas</span>
                    <span className="text-right">Reembolsos</span>
                    <span className="text-right">Neto</span>
                  </div>
                )}
                {closureMethodsUsed.map((method) => (
                  <div
                    key={method.label}
                    className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-3 px-4 py-2 text-slate-200"
                  >
                    <span>{method.label}</span>
                    <span className="text-right font-mono text-slate-300">
                      {formatMoney(method.gross)}
                    </span>
                    <span className="text-right font-mono text-rose-300">
                      {formatMoney(-method.refunds)}
                    </span>
                    <span className="text-right font-mono text-slate-100">
                      {formatMoney(method.net)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {closureSeparatedInfo && (
              <div className="rounded-2xl border border-dashed border-slate-700 px-4 py-3 bg-slate-950/30 space-y-1">
                <div className="flex justify-between text-[11px] text-slate-100 font-semibold uppercase tracking-wide">
                  <span>Ventas por separado</span>
                  <span>{closureSeparatedInfo.tickets} tickets</span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Abonos cobrados hoy</span>
                  <span className="text-slate-100">
                    {formatMoney(closureSeparatedInfo.paymentsTotal)}
                  </span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Total reservado</span>
                  <span className="text-slate-100">
                    {formatMoney(closureSeparatedInfo.reservedTotal)}
                  </span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Saldo pendiente</span>
                  <span
                    className={`font-semibold ${
                      closureSeparatedInfo.pendingTotal === 0
                        ? "text-emerald-300"
                        : "text-rose-300"
                    }`}
                  >
                    {formatMoney(closureSeparatedInfo.pendingTotal)}
                  </span>
                </div>
              </div>
            )}

            {closureUsers.length > 0 && (
              <div className="rounded-2xl border border-slate-800 overflow-hidden">
                <div className="px-4 py-2 bg-slate-950 text-xs text-slate-400 uppercase tracking-wide">
                  Ventas por usuario (día actual)
                </div>
                <div className="divide-y divide-slate-800">
                  {closureUsers.map((userContribution) => (
                    <div
                      key={userContribution.name}
                      className="flex items-center justify-between px-4 py-2 text-slate-200"
                    >
                      <span>{userContribution.name}</span>
                      <span className="font-mono text-slate-400">
                        {formatMoney(userContribution.total)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {closureError && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/40 px-3 py-2 rounded-md">
                {closureError}
              </div>
            )}
            </div>
            <footer className="flex justify-end gap-3 border-t border-slate-800 px-6 py-4 bg-slate-900/80">
              <button
                type="button"
                onClick={handleCloseClosureModal}
                className="px-4 py-2 rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={closureSaving}
                className="px-4 py-2 rounded-lg bg-emerald-500 text-slate-900 font-semibold hover:bg-emerald-400 disabled:opacity-50"
              >
                {closureResult ? "Cierre registrado" : "Generar reporte Z"}
              </button>
            </footer>
          </form>
        </div>
      )}

      {confirmCancelOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-40 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 px-6 py-5 space-y-4 shadow-2xl">
            <div>
              <h3 className="text-lg font-semibold text-slate-50">
                ¿Anular esta orden?
              </h3>
              <p className="text-sm text-slate-400 mt-2">
                Se vaciará el carrito y se solicitará un nuevo número de venta. Esta acción no se puede deshacer.
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleConfirmCancelOrder}
                className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-sm font-semibold text-white"
              >
                Sí, anular orden
              </button>
              <button
                type="button"
                onClick={handleCloseCancelDialog}
                className="flex-1 py-2.5 rounded-lg border border-slate-600 text-sm font-semibold text-slate-200 hover:bg-slate-800"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {closureEmailModalOpen && closureResult && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-4 text-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-emerald-300 uppercase tracking-wide">
                  Enviar reporte Z por email
                </p>
                <h3 className="text-lg font-semibold text-slate-100">
                  {closureResult.consecutive ??
                    `CL-${closureResult.id.toString().padStart(5, "0")}`}
                </h3>
                {posSettings?.closure_email_recipients &&
                  posSettings.closure_email_recipients.length > 0 && (
                    <p className="text-[11px] text-slate-400 mt-1">
                      Predeterminados:{" "}
                      {posSettings.closure_email_recipients.join(", ")}
                    </p>
                  )}
              </div>
              <button
                type="button"
                onClick={() => setClosureEmailModalOpen(false)}
                className="text-slate-400 hover:text-slate-100 text-xl leading-none"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">
                Destinatarios (uno por línea o separados por coma)
              </span>
              <textarea
                rows={3}
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                value={closureEmailRecipients}
                onChange={(e) => setClosureEmailRecipients(e.target.value)}
                placeholder="administracion@empresa.com"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">Asunto</span>
              <input
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                value={closureEmailSubject}
                onChange={(e) => setClosureEmailSubject(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">
                Mensaje (opcional)
              </span>
              <textarea
                rows={4}
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                value={closureEmailMessage}
                onChange={(e) => setClosureEmailMessage(e.target.value)}
                placeholder="Notas adicionales del cierre…"
              />
            </label>
            {closureEmailError && (
              <p className="text-xs text-red-400">{closureEmailError}</p>
            )}
            {closureEmailFeedback && (
              <p className="text-xs text-emerald-300">{closureEmailFeedback}</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setClosureEmailModalOpen(false)}
                className="px-4 py-2 rounded-md border border-slate-700 text-slate-200 hover:bg-slate-800"
                disabled={closureEmailSending}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void submitClosureEmail()}
                className="px-4 py-2 rounded-md bg-emerald-500 text-slate-900 font-semibold hover:bg-emerald-400 disabled:opacity-50"
                disabled={closureEmailSending}
              >
                {closureEmailSending ? "Enviando…" : "Enviar reporte"}
              </button>
            </div>
          </div>
      </div>
    )}

      {/* Configuración de impresora/cajón */}
      {printerModalOpen && (
        <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-center justify-center px-3 sm:px-4">
          <div className="w-full max-w-lg sm:max-w-3xl rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-800">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">
                  Configuración local
                </p>
                <h3 className="text-xl font-semibold text-slate-50">
                  Impresora y cajón de dinero
                </h3>
                <p className="text-xs text-slate-400">
                  Esta configuración se guarda para esta estación ({activeStationId ?? "POS Web"}).
                </p>
              </div>
              <button
                type="button"
                onClick={handleClosePrinterModal}
                className="text-slate-400 hover:text-slate-100 text-2xl leading-none"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-5 text-sm overflow-auto">
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  {
                    id: "browser" as const,
                    label: "Ventana del navegador",
                    description:
                      "Usa la impresora predeterminada del sistema y muestra el cuadro de impresión.",
                  },
                  {
                    id: "qz-tray" as const,
                    label: "Conector local (QZ Tray)",
                    description:
                      "Envía directo a la impresora térmica y permite abrir el cajón (requiere QZ Tray).",
                  },
                ].map((mode) => {
                  const isActive = printerConfig.mode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() =>
                        setPrinterConfig((prev) => ({ ...prev, mode: mode.id }))
                      }
                      className={`rounded-xl border px-3 py-3 text-left transition ${
                        isActive
                          ? "border-blue-400/70 bg-blue-500/10 text-blue-100"
                          : "border-slate-800 bg-slate-950 text-slate-200 hover:border-slate-700"
                      }`}
                    >
                      <p className="text-sm font-semibold">{mode.label}</p>
                      <p className="text-[11px] text-slate-400">
                        {mode.description}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-slate-400 text-xs uppercase tracking-wide">
                    Nombre de la impresora
                  </span>
                  <input
                    type="text"
                    value={printerConfig.printerName}
                    onChange={(e) =>
                      setPrinterConfig((prev) => ({
                        ...prev,
                        printerName: e.target.value,
                      }))
                    }
                    placeholder='Ej: "EPSON TM-T20"'
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 placeholder:text-slate-600"
                  />
                  <span className="text-[11px] text-slate-500">
                    Debe coincidir con el nombre en el sistema operativo o en QZ Tray.
                  </span>
                </label>
                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-slate-400 text-xs uppercase tracking-wide">
                    Ancho del rollo
                  </span>
                  <select
                    value={printerConfig.width}
                    onChange={(e) =>
                      setPrinterConfig((prev) => ({
                        ...prev,
                        width: e.target.value as typeof prev.width,
                      }))
                    }
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                  >
                    {printerWidthOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <span className="text-[11px] text-slate-500">
                    Usaremos esta medida para ajustar márgenes y escala del ticket.
                  </span>
                </label>
              </div>

              <div className="space-y-3 text-sm">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={printerConfig.autoOpenDrawer}
                    onChange={(e) =>
                      setPrinterConfig((prev) => ({
                        ...prev,
                        autoOpenDrawer: e.target.checked,
                      }))
                    }
                    className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                  />
                  <div>
                    <p className="font-semibold">Abrir cajón al finalizar la venta</p>
                    <p className="text-slate-400 text-xs">
                      Cuando QZ Tray esté activo, enviaremos el pulso al cajón tras imprimir.
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={printerConfig.showDrawerButton}
                    onChange={(e) =>
                      setPrinterConfig((prev) => ({
                        ...prev,
                        showDrawerButton: e.target.checked,
                      }))
                    }
                    className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                  />
                  <div>
                    <p className="font-semibold">Mostrar botón “Abrir cajón”</p>
                    <p className="text-slate-400 text-xs">
                      Habilita el botón manual en el POS para enviar el comando al cajón.
                    </p>
                  </div>
                </label>
              </div>

              {printerConfig.mode === "qz-tray" && (
                <div className="rounded-xl border border-slate-800/70 bg-slate-900/70 p-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-semibold text-slate-200">
                        Detectar impresoras con QZ Tray
                      </p>
                      <p className="text-xs text-slate-400">
                        Necesitas QZ Tray instalado y autorizado en este equipo.
                      </p>
                      <button
                        type="button"
                        onClick={() => setQzGuideOpen(true)}
                        className="mt-2 inline-flex items-center gap-2 text-xs text-blue-200 hover:text-blue-100"
                      >
                        Ver guia de instalacion
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleScanPrinters()}
                      disabled={printerScanning}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-500 text-emerald-100 text-xs hover:bg-emerald-500/10 disabled:opacity-50"
                    >
                      {printerScanning ? "Buscando..." : "Detectar impresoras"}
                    </button>
                  </div>
                  {printerScanMessage && (
                    <div className="text-xs text-amber-200 bg-amber-500/10 border border-amber-400/40 rounded-md px-3 py-2">
                      {printerScanMessage}
                    </div>
                  )}
                  {availablePrinters.length > 0 && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {availablePrinters.map((printer) => {
                        const active = printerConfig.printerName === printer;
                        return (
                          <button
                            key={printer}
                            type="button"
                            onClick={() =>
                              setPrinterConfig((prev) => ({
                                ...prev,
                                printerName: printer,
                                mode: "qz-tray",
                              }))
                            }
                            className={`rounded-lg border px-3 py-2 text-left text-sm ${
                              active
                                ? "border-emerald-400/70 bg-emerald-500/10 text-emerald-100"
                                : "border-slate-700 bg-slate-950 text-slate-200 hover:border-slate-600"
                            }`}
                          >
                            {printer}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClosePrinterModal}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-200 hover:bg-slate-800/70"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSavePrinterModal}
                  className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-900 font-semibold hover:bg-emerald-400"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cambio de precio (servicios / productos con asterisco) */}
      {priceChangeProduct && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-40 px-4">
          <form
            onSubmit={handleApplyPriceChange}
            className="w-full max-w-lg rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950/90 px-8 py-6 text-sm shadow-[0_25px_60px_rgba(15,23,42,0.6)] space-y-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.4em] text-emerald-300">
                  Cambio autorizado
                </p>
                <h2 className="text-xl font-semibold text-slate-50">
                  Cambiar precio · {priceChangeProduct.name}
                </h2>
                <p className="text-[12px] text-slate-400 mt-1">
                  Ingresa el nuevo valor y confirma. Actualizaremos solo este artículo.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPriceChangeProduct(null)}
                className="text-slate-400 hover:text-slate-100 text-2xl leading-none"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>
            <label className="flex flex-col gap-2">
              <span className="text-xs text-slate-400">Nuevo precio</span>
              <input
                autoFocus
                ref={priceChangeInputRef}
                value={priceChangeValue}
                onChange={(e) => handlePriceChangeInput(e.target.value)}
                inputMode="numeric"
                className="w-full rounded-2xl bg-slate-950 border border-slate-700/80 px-4 py-3 text-lg text-slate-50 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30"
              />
            </label>
            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 px-4 py-3 text-xs text-slate-400">
              Presiona <span className="font-semibold text-slate-200">Enter</span> para confirmar o
              usa los botones para aplicar o cancelar este cambio.
            </div>
            <div className="flex justify-end gap-3 pt-2 text-sm">
              <button
                type="button"
                className="px-4 py-2 rounded-xl border border-slate-700 text-slate-200 hover:bg-slate-800/70"
                onClick={() => setPriceChangeProduct(null)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-900 font-semibold hover:bg-emerald-400"
              >
                Aplicar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Mensajes de carga / error */}
      {loading && (
        <div className="absolute bottom-3 left-3 text-xs text-slate-400">
          Cargando productos...
        </div>
      )}
      {error && (
        <div className="absolute bottom-3 left-3 text-xs text-red-400">
          Error: {error}
        </div>
      )}
    </main>
  );
}

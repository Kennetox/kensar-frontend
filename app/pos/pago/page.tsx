// app/pos/pago/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  usePos,
  POS_DISPLAY_NAME,
  PosCustomer,
  type CartItem,
  type SurchargeMethod,
} from "../poscontext";
import { useAuth } from "../../providers/AuthProvider";
import { getApiBase } from "@/lib/api/base";
import { SALE_NOTE_PRESETS } from "../notePresets";
import { fetchPosSettings, PosSettingsPayload } from "@/lib/api/settings";
import {
  renderSaleTicket,
  renderSaleInvoice,
  buildSaleTicketCustomer,
} from "@/lib/printing/saleTicket";
import {
  buildSaleTicketDisplayBreakdown,
  type SaleTicketSourceItem,
} from "@/lib/pos/saleTicketData";
import CustomerPanel from "../components/CustomerPanel";
import { usePaymentMethodsCatalog } from "@/app/hooks/usePaymentMethodsCatalog";
import type { SeparatedOrder } from "@/lib/api/separatedOrders";
import { useOnlineStatus } from "@/app/hooks/useOnlineStatus";
import { addPendingSale } from "@/lib/pos/pendingSales";
import { REQUIRE_FREE_SALE_REASON } from "@/lib/config/featureFlags";
import {
  getPosStationAccess,
  type PosStationAccess,
  formatPosDisplayName,
  ensureStoredPosMode,
  getWebPosStation,
  subscribeToPosStationChanges,
  type PosAccessMode,
  fetchPosStationPrinterConfig,
  type PosStationPrinterConfig,
} from "@/lib/api/posStations";
import { buildScopedPosStorageKey } from "@/lib/pos/storageScope";

type PaymentMethodSlug = string;

type SaleResponse = {
  id: number;
  total: number;
  paid_amount: number;
  change_amount: number;
  payment_method: string;
  has_cash_payment?: boolean;
  customer_name?: string | null;
  customer_id?: number | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  customer_tax_id?: string | null;
  customer_address?: string | null;
  notes?: string | null;
  sale_number?: number;
  document_number?: string;
  created_at: string;
  surcharge_amount?: number | null;
  surcharge_label?: string | null;
  cart_discount_value?: number | null;
  cart_discount_percent?: number | null;
  items?: SaleTicketSourceItem[];
  payments?: { method: PaymentMethodSlug; amount: number }[];
};

type SuccessSaleSummary = {
  saleId: number;
  documentNumber: string;
  saleNumber: number;
  total: number;
  subtotal: number;
  lineDiscountTotal: number;
  surchargeLabel?: string;
  surchargeValueDisplay?: string;
  surchargeAmount?: number;
  cartDiscountLabel: string;
  cartDiscountValueDisplay: string;
  notes?: string | null;
  items: { name: string; quantity: number; unitPrice: number; total: number }[];
  payments: { label: string; amount: number }[];
  changeAmount: number;
  showChange?: boolean;
  customer?: PosCustomer | null;
  separatedInfo?: {
    dueDate?: string | null;
    balance: number;
    initialPayments: { label: string; amount: number; paidAt?: string; method?: string }[];
    payments: { label: string; amount: number; paidAt?: string; method?: string }[];
  };
};

type SeparatedInitialPaymentLine = {
  id: number;
  method: PaymentMethodSlug;
  amount: number;
};

const RESUME_HELD_SALE_KEY_BASE = "kensar_pos_resume_held_sale_v1";
const FREE_SALE_REASON_NOTE_LABEL = "Motivo venta libre";
const TECH_SERVICE_REASON_NOTE_LABEL = "Motivo servicio tecnico";
const BALANCE_TOPUP_REASON_NOTE_LABEL = "Motivo abono de saldo";
const REQUIRED_REASON_SKU_LABELS: Record<string, string> = {
  "138": TECH_SERVICE_REASON_NOTE_LABEL,
  "1087": BALANCE_TOPUP_REASON_NOTE_LABEL,
};

function buildCombinedSaleNotes(
  reasonsByLabel: Record<string, string[]>,
  extraSaleNotes: string
): string {
  const extra = extraSaleNotes.trim();
  const blocks: string[] = [];
  if (REQUIRE_FREE_SALE_REASON) {
    Object.entries(reasonsByLabel).forEach(([label, reasons]) => {
      if (!reasons.length) return;
      const lines = reasons.map((reason, index) => `${index + 1}. ${reason}`);
      blocks.push(`${label}:\n${lines.join("\n")}`);
    });
  }
  if (extra) {
    blocks.push(extra);
  }
  return blocks.join("\n\n");
}

function getRequiredReasonLabel(item: CartItem): string {
  const sku = (item.product.sku ?? "").trim();
  if (sku && REQUIRED_REASON_SKU_LABELS[sku]) {
    return REQUIRED_REASON_SKU_LABELS[sku];
  }
  return FREE_SALE_REASON_NOTE_LABEL;
}

function getRequiredReasonsFromCart(cart: CartItem[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  cart.forEach((item) => {
    const reason = item.freeSaleReason?.trim() ?? "";
    if (!reason) return;
    const label = getRequiredReasonLabel(item);
    if (!grouped[label]) grouped[label] = [];
    grouped[label].push(reason);
  });
  return grouped;
}

export default function PagoPage() {
  const router = useRouter();
  const { token, user, tenant } = useAuth();
  const isOnline = useOnlineStatus();

  // 👇 asegúrate de que usePos expone cartTotal (ya lo usábamos antes)
  const {
    cart,
    cartTotal,
    cartSubtotal,
    cartGrossSubtotal,
    cartLineDiscountTotal,
    cartDiscountPercent,
    cartDiscountValue,
    cartSurcharge,
    clearSale,
    saleNumber,
    refreshSaleNumber,
    saleNotes,
    setSaleNotes,
    selectedCustomer,
    reservedSaleId,
    reservedSaleNumber,
    setReservedSaleId,
    setReservedSaleNumber,
    setSaleNumber,
    saleAttemptId,
  } = usePos();

  // Total real de la venta
  const totalToPay = cartTotal;
  const requiredReasonsByLabel = useMemo(
    () => (REQUIRE_FREE_SALE_REASON ? getRequiredReasonsFromCart(cart) : {}),
    [cart]
  );
  const combinedSaleNotes = useMemo(
    () => buildCombinedSaleNotes(requiredReasonsByLabel, saleNotes),
    [requiredReasonsByLabel, saleNotes]
  );

  const [method, setMethod] = useState<PaymentMethodSlug>("cash");
  const [paidValue, setPaidValue] = useState<string>("0");
  const [separatedInitialPayments, setSeparatedInitialPayments] = useState<
    SeparatedInitialPaymentLine[]
  >([]);
  const [selectedSeparatedPaymentId, setSelectedSeparatedPaymentId] = useState<
    number | null
  >(null);
  const [message, setMessage] = useState<string | null>(null);
  const [, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(
    null
  );
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<{ hide?: number; remove?: number }>({});

  const [successSale, setSuccessSale] = useState<SuccessSaleSummary | null>(null);

  const [posSettings, setPosSettings] = useState<PosSettingsPayload | null>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailRecipients, setEmailRecipients] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailDocumentType, setEmailDocumentType] = useState<
    "ticket" | "invoice"
  >("ticket");
  const [emailFeedback, setEmailFeedback] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [stationInfo, setStationInfo] = useState<PosStationAccess | null>(null);
  const [posMode, setPosMode] = useState<PosAccessMode | null>(null);
  const [isConfirmingSale, setIsConfirmingSale] = useState(false);
  const confirmInFlightRef = useRef(false);
  const apiBase = useMemo(() => getApiBase(), []);
  const [printerConfig, setPrinterConfig] = useState<PosStationPrinterConfig>({
    mode: "qz-tray",
    printerName: "",
    width: "80mm",
    autoOpenDrawer: false,
    showDrawerButton: true,
  });
  const handleConfirmRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const showToast = useCallback((message: string, duration = 2600) => {
    if (toastTimerRef.current.hide) {
      window.clearTimeout(toastTimerRef.current.hide);
    }
    if (toastTimerRef.current.remove) {
      window.clearTimeout(toastTimerRef.current.remove);
    }
    setToast({ id: Date.now(), message });
    setToastVisible(false);
    requestAnimationFrame(() => setToastVisible(true));
    toastTimerRef.current.hide = window.setTimeout(
      () => setToastVisible(false),
      duration
    );
    toastTimerRef.current.remove = window.setTimeout(
      () => setToast(null),
      duration + 260
    );
  }, []);
  const setErrorWithToast = useCallback(
    (message: string) => {
      setError(message);
      showToast(message);
    },
    [showToast]
  );
  const fetchWithTimeout = useCallback(
    async (
      input: RequestInfo | URL,
      init: RequestInit | undefined,
      timeoutMs: number,
      label: string
    ) => {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(input, {
          ...init,
          signal: controller.signal,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          throw new Error(`La ${label} tardó demasiado. Intenta de nuevo.`);
        }
        throw err;
      } finally {
        window.clearTimeout(timeoutId);
      }
    },
    []
  );
  const parseEmails = (value: string) =>
    value
      .split(/[\n,]/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mode = ensureStoredPosMode();
    setPosMode(mode);
  }, []);

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

  const paidInputRef = useRef<HTMLInputElement | null>(null);
  const resolvedPosName = useMemo(
    () => formatPosDisplayName(stationInfo, POS_DISPLAY_NAME),
    [stationInfo]
  );
  const isStationMode = posMode === "station";
  const activeStationId = isStationMode ? stationInfo?.id ?? null : null;
  const resumeHeldSaleKey = useMemo(
    () =>
      buildScopedPosStorageKey(RESUME_HELD_SALE_KEY_BASE, {
        tenantId: tenant?.id ?? null,
        userId: user?.id ?? null,
        stationId: activeStationId,
      }),
    [activeStationId, tenant?.id, user?.id]
  );
  const markResumeHeldSale = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(resumeHeldSaleKey, "1");
    } catch (err) {
      console.warn("No se pudo marcar la venta en espera para reanudar", err);
    }
  }, [resumeHeldSaleKey]);
  const printerStorageKey = useMemo(
    () => `kensar_pos_printer_${activeStationId ?? "pos-web"}`,
    [activeStationId]
  );
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
  }, [token, apiBase, activeStationId, isStationMode, printerStorageKey]);
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
  useEffect(() => {
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
  }, []);
  const qzSecurityConfiguredRef = useRef(false);
  const configureQzSecurity = useCallback(() => {
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
  }, [apiBase, qzClient, token]);
  useEffect(() => {
    configureQzSecurity();
  }, [configureQzSecurity]);
  const paymentCatalog = usePaymentMethodsCatalog({
    fallbackToDefault: false,
  });
  const creditMethodSlugs = useMemo(
    () => new Set(["credito", "separado"]),
    []
  );
  const activePaymentMethods = useMemo(
    () =>
      [...paymentCatalog]
        .filter((m) => m.is_active)
        .sort(
          (a, b) =>
            a.order_index - b.order_index || a.name.localeCompare(b.name)
        ),
    [paymentCatalog]
  );
  const hasActivePaymentMethods = activePaymentMethods.length > 0;
  const getMethodLabel = useCallback(
    (slug: PaymentMethodSlug) => {
      const found = paymentCatalog.find((m) => m.slug === slug);
      return found ? found.name : slug.toUpperCase();
    },
    [paymentCatalog]
  );
  const selectedMethod = activePaymentMethods.find((m) => m.slug === method);
  const methodLabel = getMethodLabel(method);
  const allowsChange = selectedMethod?.allow_change ?? false;
  const isCreditLike = creditMethodSlugs.has(method);
  const isSeparatedSale = method === "separado";
  const separatedMethodOptions = useMemo(
    () => activePaymentMethods.filter((m) => !creditMethodSlugs.has(m.slug)),
    [activePaymentMethods, creditMethodSlugs]
  );
  const separatedInitialPaymentTotal = useMemo(
    () =>
      separatedInitialPayments.reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
    [separatedInitialPayments]
  );
  const separatedInitialPaymentLabel = useMemo(() => {
    if (!isSeparatedSale) return null;
    if (separatedInitialPayments.length === 0) return "Sin método asignado";
    if (separatedInitialPayments.length === 1) {
      return "Abono inicial";
    }
    return "Pago mixto";
  }, [isSeparatedSale, separatedInitialPayments]);
  const effectivePaymentLabel =
    isSeparatedSale && separatedInitialPaymentLabel
      ? separatedInitialPaymentLabel
      : methodLabel;

  // Métodos que requieren escribir un monto manual
  // (los que permiten cambio o los que manejan crédito/separado)
  const requiresManualAmount = allowsChange || (isCreditLike && !isSeparatedSale);
  const confirmDisabled =
    !cart.length ||
    !hasActivePaymentMethods ||
    (isSeparatedSale
      ? separatedInitialPayments.length === 0 ||
        separatedInitialPaymentTotal <= 0 ||
        separatedInitialPaymentTotal - totalToPay > 0.01
      : requiresManualAmount && (!paidValue || paidValue === "0"));
  const canSubmitWithEnter = !confirmDisabled && !successSale;

  useEffect(() => {
    if (!hasActivePaymentMethods) return;
    const exists = activePaymentMethods.some((m) => m.slug === method);
    if (!exists) {
      setMethod(activePaymentMethods[0].slug);
    }
  }, [activePaymentMethods, hasActivePaymentMethods, method]);

  useEffect(() => {
    if (method !== "separado") {
      setSeparatedInitialPayments([]);
      setSelectedSeparatedPaymentId(null);
      setPaidValue("0");
      return;
    }
    if (separatedMethodOptions.length > 0 && separatedInitialPayments.length === 0) {
      const line: SeparatedInitialPaymentLine = {
        id: Date.now(),
        method: separatedMethodOptions[0].slug,
        amount: 0,
      };
      setSeparatedInitialPayments([line]);
      setSelectedSeparatedPaymentId(line.id);
      setPaidValue("0");
    }
  }, [method, separatedInitialPayments.length, separatedMethodOptions]);


  useEffect(() => {
    if (isSeparatedSale) {
      return;
    }
    if (requiresManualAmount) {
      // Para efectivo / crédito / separado, empezamos en 0
      setPaidValue("0");
      return;
    }

    // Métodos sin monto manual (tarjeta, qr, nequi, daviplata): pagado = total
    setPaidValue(totalToPay.toString());
  }, [isSeparatedSale, requiresManualAmount, totalToPay]);

  const paidNumber =
    Number(paidValue.toString().replace(/[^\d.]/g, "")) || 0;

  let displayChange = 0;
  let displayChangeLabel = "Cambio";

  // Efectivo: cambio normal (puede ser negativo mientras escribe)
  if (allowsChange) {
    const changeRaw = paidNumber - totalToPay;
    displayChange = changeRaw;
    displayChangeLabel = "Cambio";
  }
  // Crédito / Separado: mostramos saldo pendiente (nunca negativo)
  else if (isSeparatedSale) {
    const saldoPendiente = Math.max(0, totalToPay - separatedInitialPaymentTotal);
    displayChange = saldoPendiente;
    displayChangeLabel = "Saldo pendiente";
  }
  // Crédito: mostramos saldo pendiente (nunca negativo)
  else if (isCreditLike) {
    const saldoPendiente = Math.max(0, totalToPay - paidNumber);
    displayChange = saldoPendiente;
    displayChangeLabel = "Saldo pendiente";
  }
  // Otros métodos (qr, tarjeta, nequi, daviplata): siempre 0 de cambio
  else {
    displayChange = 0;
    displayChangeLabel = "Cambio";
  }

  // Si no hay carrito y NO estamos en la ventana de éxito, mandamos al POS
  useEffect(() => {
    if (!cart.length && !successSale) {
      router.push("/pos");
    }
  }, [cart.length, successSale, router]); 

  useEffect(() => {
    let active = true;
    async function loadSettings() {
      try {
        if (!token) return;
        const data = await fetchPosSettings(token);
        if (!active) return;
        setPosSettings(data);
      } catch (err) {
        console.warn("No se pudo cargar la configuración del POS", err);
      }
    }
    void loadSettings();
    return () => {
      active = false;
    };
  }, [token]);


  // Enfocar input cuando el método requiere monto manual
  useEffect(() => {
    if (requiresManualAmount && paidInputRef.current) {
      paidInputRef.current.focus();
      paidInputRef.current.select();
    }
  }, [requiresManualAmount]);

function formatMoney(value: number): string {
  return value.toLocaleString("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function getDefaultDueDate(): string {
  const due = new Date();
  due.setMonth(due.getMonth() + 2);
  return due.toISOString();
}

const amountDisplayFormatter = new Intl.NumberFormat("es-CO", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatInputAmount(value: string): string {
  if (!value) return "";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  return amountDisplayFormatter.format(numeric);
}

function sanitizeAmountInput(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

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

  function handleSelectMethod(slug: PaymentMethodSlug) {
    setMethod(slug);
    if (slug !== "separado") {
      setSeparatedInitialPayments([]);
      setSelectedSeparatedPaymentId(null);
      setPaidValue("0");
    }
  }

  function handleSeparatedMethodClick(slug: PaymentMethodSlug) {
    const existing = separatedInitialPayments.find((entry) => entry.method === slug);
    if (existing) {
      setSelectedSeparatedPaymentId(existing.id);
      return;
    }
    const line: SeparatedInitialPaymentLine = {
      id: Date.now(),
      method: slug,
      amount: 0,
    };
    setSeparatedInitialPayments((prev) => [...prev, line]);
    setSelectedSeparatedPaymentId(line.id);
  }

  function handleSeparatedAmountChange(lineId: number, rawValue: string) {
    const normalized = sanitizeAmountInput(rawValue);
    const numeric = Number(normalized) || 0;
    setSeparatedInitialPayments((prev) =>
      prev.map((entry) =>
        entry.id === lineId ? { ...entry, amount: numeric } : entry
      )
    );
    setSelectedSeparatedPaymentId(lineId);
  }

  function handleSeparatedDeleteLine(lineId: number) {
    setSeparatedInitialPayments((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((entry) => entry.id !== lineId);
      if (selectedSeparatedPaymentId === lineId) {
        const fallback = next[0];
        setSelectedSeparatedPaymentId(fallback.id);
        setPaidValue(Math.max(0, Math.round(fallback.amount)).toString());
      }
      return next;
    });
  }

  async function handleConfirm() {
    if (confirmInFlightRef.current) return;
    confirmInFlightRef.current = true;
    setIsConfirmingSale(true);
    try {
      setError(null);
      setMessage(null);

      if (!cart.length) {
        setErrorWithToast("No hay productos en el carrito.");
        return;
      }
      if (!hasActivePaymentMethods || !selectedMethod) {
        setErrorWithToast(
          "No hay métodos de pago activos. Configúralos en Configuración > Métodos de pago."
        );
        return;
      }

      if (isSeparatedSale) {
        if (separatedInitialPayments.length === 0) {
          setErrorWithToast(
            "Agrega al menos un método para el abono inicial."
          );
          return;
        }
        if (separatedInitialPaymentTotal <= 0) {
          setErrorWithToast("El abono inicial debe ser mayor a cero.");
          return;
        }
        if (separatedInitialPaymentTotal - totalToPay > 0.01) {
          setErrorWithToast(
            "El abono inicial dividido no puede superar el total de la venta."
          );
          return;
        }
      }

      // Solo validamos que el efectivo no sea menor al total
      if (!isSeparatedSale && !isCreditLike && allowsChange && paidNumber < totalToPay) {
        setErrorWithToast(
          "El monto pagado en efectivo no puede ser menor al total."
        );
        return;
      }

      if (!saleNumber || Number.isNaN(saleNumber)) {
        setErrorWithToast(
          "No se pudo obtener el consecutivo de venta. Intentando nuevamente…"
        );
        await refreshSaleNumber();
        return;
      }

      // 1) Monto pagado y cambio (igual que antes)
      const paid_amount = isSeparatedSale
        ? separatedInitialPaymentTotal
        : isCreditLike
        ? paidNumber
        : allowsChange
        ? paidNumber
        : totalToPay;

      const change_amount = isSeparatedSale
        ? 0
        : isCreditLike
        ? 0
        : allowsChange
        ? Math.max(0, paidNumber - totalToPay)
        : 0;

      if (!token) {
        throw new Error("Sesión expirada. Inicia sesión nuevamente.");
      }

      // 2) Reservar número si hace falta
      let assignedSaleNumber = saleNumber;
      let reservationId = reservedSaleId ?? null;
      let reservationNumber = reservedSaleNumber ?? null;
      const isInvalidReservationDetail = (detail: string) => {
        const normalized = detail
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        return normalized.includes("la reserva de numero de venta no es valida");
      };

      const reserveIfNeeded = async (forceNew = false) => {
        if (forceNew) {
          reservationId = null;
          reservationNumber = null;
          setReservedSaleId(null);
          setReservedSaleNumber(null);
        }
        if (reservationId) return;
        if (!isOnline) {
          setErrorWithToast("Necesitas conexión para reservar el número de venta.");
          throw new Error("Necesitas conexión para reservar el número de venta.");
        }
        const reservationRes = await fetchWithTimeout(
          `${apiBase}/pos/sales/reserve-number`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
              "X-Request-ID": `${saleAttemptId}_reserve`,
            },
            credentials: "include",
            body: JSON.stringify({
              pos_name: resolvedPosName,
              station_id: activeStationId,
              vendor_name: user?.name ?? null,
              min_sale_number:
                typeof saleNumber === "number" && saleNumber > 0
                  ? saleNumber
                  : null,
            }),
          },
          20000,
          "reserva"
        );
        if (!reservationRes.ok) {
          const data = await reservationRes.json().catch(() => null);
          const detail =
            data && data.detail ? data.detail : `Error ${reservationRes.status}`;
          throw new Error(detail);
        }
        const reservation = (await reservationRes.json()) as {
          reservation_id: number;
          sale_number: number;
        };
        reservationId = reservation.reservation_id;
        reservationNumber = reservation.sale_number;
        setReservedSaleId(reservationId);
        setReservedSaleNumber(reservationNumber);
        if (
          typeof reservationNumber === "number" &&
          reservationNumber !== saleNumber
        ) {
          setSaleNumber(reservationNumber);
        }
      };

      if (isOnline) {
        await reserveIfNeeded();
      }

      if (
        typeof reservationNumber === "number" &&
        reservationNumber !== assignedSaleNumber
      ) {
        assignedSaleNumber = reservationNumber;
      }

      const saleItemsPayload = cart.map((item) => {
        const gross = item.unitPrice * item.quantity;
        const lineDiscount = item.lineDiscountValue;
        const netLine = Math.max(0, gross - lineDiscount);

        return {
          product_id: item.product.id,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          product_sku: item.product.sku ?? undefined,
          product_name: item.product.name,
          product_barcode: item.product.barcode ?? undefined,
          discount: lineDiscount,
          total: netLine,
        };
      });

      type SaleSubmissionPayload = {
        payment_method: PaymentMethodSlug;
        total: number;
        surcharge_amount?: number;
        surcharge_label?: string;
        paid_amount: number;
        change_amount: number;
        cart_discount_value?: number;
        cart_discount_percent?: number;
        items: {
          product_id: number;
          quantity: number;
          unit_price: number;
          product_sku?: string | null;
          product_name: string;
          product_barcode?: string | null;
          discount?: number;
          total?: number;
        }[];
        payments?: { method: PaymentMethodSlug; amount: number }[];
        sale_number_preassigned: number;
        reservation_id?: number;
        client_request_id: string;
        notes?: string;
        pos_name?: string;
        vendor_name?: string;
        customer_id?: number;
        due_date?: string;
        station_id?: string;
      };

      const basePayload: Omit<SaleSubmissionPayload, "sale_number_preassigned"> = {
        payment_method: method,
        total: totalToPay,
        paid_amount,
        change_amount,
        cart_discount_value: cartDiscountValue,
        cart_discount_percent: cartDiscountPercent,
        items: saleItemsPayload,
        notes: combinedSaleNotes || undefined,
        pos_name: resolvedPosName,
        vendor_name: user?.name ?? undefined,
        reservation_id: reservationId ?? undefined,
        client_request_id: saleAttemptId,
      };
      if (activeStationId) {
        basePayload.station_id = activeStationId;
      }
      if (cartSurcharge.enabled && cartSurcharge.amount > 0) {
        basePayload.surcharge_amount = cartSurcharge.amount;
        basePayload.surcharge_label = cartSurcharge.method
          ? `Incremento ${cartSurcharge.method}`
          : "Incremento";
      }
      if (selectedCustomer?.id) {
        basePayload.customer_id = selectedCustomer.id;
      }

      if (isSeparatedSale) {
        basePayload.due_date = getDefaultDueDate();
      }

      // 3) Si es CRÉDITO / SEPARADO, mandamos también la lista de pagos
      //    (por ahora es solo un pago, pero ya queda registrado en sale_payments).
      if (isSeparatedSale) {
        basePayload.payments = separatedInitialPayments.map((entry) => ({
          method: entry.method,
          amount: entry.amount,
        }));
      } else if (isCreditLike) {
        basePayload.payments = [
          {
            method,
            amount: paid_amount,
          },
        ];
      }

      const buildPayload = (): SaleSubmissionPayload => ({
        ...basePayload,
        sale_number_preassigned: assignedSaleNumber,
      });

      // 4) Enviamos al backend
      const endpoint = isSeparatedSale ? "/separated-orders" : "/pos/sales";

      const queueSaleOffline = (customMessage?: string) => {
        const payloadForQueue = buildPayload();
        addPendingSale({
          endpoint,
          payload: payloadForQueue,
          scope: {
            tenantId: tenant?.id ?? null,
            userId: user?.id ?? null,
            stationId: activeStationId,
          },
          summary: {
            saleNumber: assignedSaleNumber,
            total: totalToPay,
            methodLabel: effectivePaymentLabel,
            createdAt: new Date().toISOString(),
            customerName: selectedCustomer?.name ?? null,
            vendorName: user?.name ?? null,
            isSeparated: isSeparatedSale,
          },
        });
        clearSale();
        setSuccessSale(null);
        setMessage(null);
        setErrorWithToast(
          customMessage ??
            "Guardamos la venta como pendiente. Se enviará cuando se recupere la conexión con el servidor."
        );
        markResumeHeldSale();
        router.replace("/pos");
      };

      if (!isOnline) {
        queueSaleOffline();
        return;
      }

      let res: Response;
      try {
        const payloadToSend = buildPayload();
        res = await fetchWithTimeout(
          `${apiBase}${endpoint}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
              "X-Request-ID": saleAttemptId,
            },
            credentials: "include",
            body: JSON.stringify(payloadToSend),
          },
          45000,
          "confirmación de la venta"
        );
      } catch (err) {
        console.error(err);
        const browserOffline =
          typeof navigator !== "undefined" && !navigator.onLine;
        if (
          browserOffline ||
          err instanceof TypeError
        ) {
          queueSaleOffline(
            browserOffline
              ? undefined
              : "No se pudo conectar con el servidor. Guardamos la venta como pendiente para enviarla al restablecer la conexión."
          );
          return;
        }
        throw err;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        let detail =
          data && data.detail
            ? Array.isArray(data.detail)
              ? data.detail
                  .map((d: { msg?: string } | string) =>
                    typeof d === "string" ? d : d.msg ?? ""
                  )
                  .filter(Boolean)
                  .join(", ")
              : String(data.detail)
            : `Error ${res.status}`;

        if (isInvalidReservationDetail(detail)) {
          await reserveIfNeeded(true);
          const retryInvalidReservationPayload = buildPayload();
          try {
            res = await fetchWithTimeout(
              `${apiBase}${endpoint}`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                  "X-Request-ID": saleAttemptId,
                },
                credentials: "include",
                body: JSON.stringify(retryInvalidReservationPayload),
              },
              45000,
              "confirmación de la venta"
            );
          } catch (err) {
            console.error(err);
            const browserOffline =
              typeof navigator !== "undefined" && !navigator.onLine;
            if (browserOffline || err instanceof TypeError) {
              queueSaleOffline(
                browserOffline
                  ? "Renovamos la reserva, pero perdimos internet. Guardamos la venta como pendiente."
                  : "Renovamos la reserva, pero no hubo conexión con el servidor. Guardamos la venta como pendiente."
              );
              return;
            }
            throw err;
          }
          if (!res.ok) {
            const retryInvalidData = await res.json().catch(() => null);
            detail =
              retryInvalidData && retryInvalidData.detail
                ? Array.isArray(retryInvalidData.detail)
                  ? retryInvalidData.detail
                      .map((d: { msg?: string } | string) =>
                        typeof d === "string" ? d : d.msg ?? ""
                      )
                      .filter(Boolean)
                      .join(", ")
                  : String(retryInvalidData.detail)
                : `Error ${res.status}`;
          }
        }

        if (res.ok) {
          // Reserva renovada y venta registrada en el reintento.
        } else if (res.status === 409) {
          const updated = await refreshSaleNumber();
          if (updated && updated > 0) {
            assignedSaleNumber = updated;
          } else {
            assignedSaleNumber += 1;
            setSaleNumber(assignedSaleNumber);
          }
          const retryPayload = buildPayload();
          try {
            res = await fetchWithTimeout(
              `${apiBase}${endpoint}`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                  "X-Request-ID": saleAttemptId,
                },
                credentials: "include",
                body: JSON.stringify(retryPayload),
              },
              45000,
              "confirmación de la venta"
            );
          } catch (err) {
            console.error(err);
            const browserOffline =
              typeof navigator !== "undefined" && !navigator.onLine;
            if (
              browserOffline ||
              err instanceof TypeError
            ) {
              queueSaleOffline(
                browserOffline
                  ? "El consecutivo se actualizó pero perdimos internet. Guardamos la venta como pendiente."
                  : "El consecutivo se actualizó, pero no hubo conexión con el servidor. Guardamos la venta como pendiente."
              );
              return;
            }
            throw err;
          }
          if (!res.ok) {
            const dataRetry = await res.json().catch(() => null);
            const retryDetail =
              dataRetry && dataRetry.detail
                ? Array.isArray(dataRetry.detail)
                  ? dataRetry.detail
                      .map((d: { msg?: string } | string) =>
                        typeof d === "string" ? d : d.msg ?? ""
                      )
                      .filter(Boolean)
                      .join(", ")
                  : String(dataRetry.detail)
                : `Error ${res.status}`;
            throw new Error(retryDetail);
          }
        } else {
          throw new Error(detail);
        }
      }

      let backendSaleNumber: number;
      let ticketCustomer: PosCustomer | null = selectedCustomer ?? null;
      let saleId: number;
      let documentNumber: string;
      let serverNotes: string | null | undefined = null;
      const changeAmountForTicket = change_amount;
      let separatedInfo: SuccessSaleSummary["separatedInfo"] | undefined;
      let responseSurchargeAmount: number | undefined;
      let responseSurchargeLabel: string | undefined;
      let shouldOpenDrawer = false;
      let shouldShowChange = false;
      let saleResponse: SaleResponse | null = null;

      let saleTotalForSummary = totalToPay;
      if (isSeparatedSale) {
        const order: SeparatedOrder = await res.json();
        backendSaleNumber = order.sale_number ?? order.sale_id;
        saleId = order.sale_id;
        documentNumber =
          order.sale_document_number ??
          `V-${order.sale_id.toString().padStart(6, "0")}`;
        serverNotes = order.notes;
        if (!ticketCustomer && order.customer_name) {
          ticketCustomer = {
            id: order.customer_id ?? order.sale_id,
            name: order.customer_name,
            phone: order.customer_phone ?? undefined,
            email: order.customer_email ?? undefined,
          };
        }
        if (typeof order.surcharge_amount === "number" && order.surcharge_amount > 0) {
          responseSurchargeAmount = order.surcharge_amount;
        }
        if (order.surcharge_label) {
          responseSurchargeLabel = order.surcharge_label;
        }
        const initialPaymentsForTicket =
          order.initial_payments && order.initial_payments.length > 0
            ? order.initial_payments.map((payment, idx) => ({
                label:
                  order.initial_payments.length > 1
                    ? `Abono inicial ${idx + 1}`
                    : "Abono inicial",
                amount: payment.amount,
                paidAt: payment.paid_at ?? order.created_at,
                method: getMethodLabel(payment.method),
              }))
            : [
                {
                  label: "Abono inicial",
                  amount: order.initial_payment,
                  paidAt: order.created_at,
                  method: effectivePaymentLabel,
                },
              ];
        const laterPaymentsForTicket = order.payments.map((payment, idx) => ({
            label: `Abono ${initialPaymentsForTicket.length + idx + 1}`,
            amount: payment.amount,
            paidAt: payment.paid_at,
              method: getMethodLabel(payment.method),
            }));
        separatedInfo = {
          dueDate: order.due_date ?? basePayload.due_date,
          balance: Math.max(order.balance ?? 0, 0),
          initialPayments: initialPaymentsForTicket,
          payments: laterPaymentsForTicket,
        };
      } else {
        saleResponse = await res.json();
        if (!saleResponse) {
          throw new Error("Respuesta de venta inválida.");
        }
        const sale = saleResponse;
        backendSaleNumber = sale.sale_number ?? sale.id;
        saleId = sale.id;
        documentNumber =
          sale.document_number ??
          `V-${sale.id.toString().padStart(6, "0")}`;
        serverNotes = sale.notes;
        if (!ticketCustomer && sale.customer_name) {
          ticketCustomer = {
            id: sale.customer_id ?? sale.id,
            name: sale.customer_name,
            phone: sale.customer_phone ?? undefined,
            email: sale.customer_email ?? undefined,
            taxId: sale.customer_tax_id ?? undefined,
            address: sale.customer_address ?? undefined,
          };
        }
        if (typeof sale.surcharge_amount === "number" && sale.surcharge_amount > 0) {
          responseSurchargeAmount = sale.surcharge_amount;
        }
        if (sale.surcharge_label) {
          responseSurchargeLabel = sale.surcharge_label;
        }
        shouldOpenDrawer = Boolean(
          printerConfig.autoOpenDrawer && sale.has_cash_payment
        );
      }
      shouldShowChange = allowsChange && changeAmountForTicket > 0;

      const fallbackSurchargeAmount =
        cartSurcharge.enabled && cartSurcharge.amount > 0
          ? cartSurcharge.amount
          : undefined;
      const summarySurchargeAmount =
        typeof responseSurchargeAmount === "number"
          ? responseSurchargeAmount
          : fallbackSurchargeAmount;
      const summarySurchargeLabel =
        responseSurchargeLabel ??
        (summarySurchargeAmount
          ? cartSurcharge.method
            ? `Incremento ${getSurchargeMethodLabel(cartSurcharge.method)}`
            : "Incremento"
          : undefined);
      const summarySurchargeDisplay =
        typeof summarySurchargeAmount === "number"
          ? formatMoney(summarySurchargeAmount)
          : undefined;

      const responseItems = saleResponse?.items?.length ? saleResponse.items : saleItemsPayload;
      const responseCartDiscountValue =
        typeof saleResponse?.cart_discount_value === "number"
          ? saleResponse.cart_discount_value
          : cartDiscountValue;
      const responseCartDiscountPercent =
        typeof saleResponse?.cart_discount_percent === "number"
          ? saleResponse.cart_discount_percent
          : cartDiscountPercent;
      const ticketLineBreakdown = buildSaleTicketDisplayBreakdown(
        responseItems,
        responseCartDiscountValue
      );
      const ticketItemsTotal = ticketLineBreakdown.lines.reduce(
        (sum, line) => sum + (line.displayTotal ?? 0),
        0
      );
      saleTotalForSummary = Math.max(
        0,
        ticketItemsTotal + (summarySurchargeAmount ?? 0)
      );
      if (isSeparatedSale && separatedInfo) {
        const separatedPending = Math.max(
          0,
          saleTotalForSummary - separatedInitialPaymentTotal
        );
        separatedInfo = {
          ...separatedInfo,
          balance: separatedPending,
        };
      }
      const saleItemsForTicket = ticketLineBreakdown.lines.map((line) => ({
        name: line.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        total: line.displayTotal,
      }));
      const paymentSummary =
        saleResponse?.payments && saleResponse.payments.length > 0
          ? saleResponse.payments.map((payment) => ({
              label: getMethodLabel(payment.method),
              amount: payment.amount,
            }))
          : [
              {
                label: effectivePaymentLabel,
                amount: paid_amount,
              },
            ];
      const ticketTotal =
        saleTotalForSummary;
      const ticketChangeAmount =
        typeof saleResponse?.change_amount === "number"
          ? saleResponse.change_amount
          : changeAmountForTicket;

      // Guardamos info para la ventana de éxito
      setSuccessSale({
        saleId,
        documentNumber,
        saleNumber: backendSaleNumber,
        total: ticketTotal,
        subtotal: ticketLineBreakdown.subtotal,
        lineDiscountTotal: ticketLineBreakdown.lineDiscountTotal,
        surchargeLabel: summarySurchargeLabel,
        surchargeValueDisplay: summarySurchargeDisplay,
        surchargeAmount: summarySurchargeAmount,
        cartDiscountLabel:
          responseCartDiscountValue > 0
            ? "Descuento carrito (valor)"
            : responseCartDiscountPercent > 0
            ? "Descuento carrito (%)"
            : "Descuento carrito",
        cartDiscountValueDisplay:
          responseCartDiscountValue > 0
            ? `-${formatMoney(responseCartDiscountValue)}`
            : responseCartDiscountPercent > 0
            ? `-${responseCartDiscountPercent}%`
            : "0",
        notes: serverNotes ?? (combinedSaleNotes || undefined),
        items: saleItemsForTicket,
        payments: paymentSummary,
        changeAmount: ticketChangeAmount,
        showChange: shouldShowChange,
        customer: ticketCustomer,
        separatedInfo,
      });

      if (shouldOpenDrawer) {
        void openDrawerWithQz();
      }

      // Limpiamos carrito y descuentos
      clearSale();

      setMessage(
        `${isSeparatedSale ? "Separado" : "Venta"} registrada correctamente (ticket #${backendSaleNumber}).`
      );
    } catch (err: unknown) {
      console.error(err);
      const msg =
        err instanceof Error
          ? err.message
          : "Error al registrar la venta.";
      setErrorWithToast(msg);
      setMessage(null);
    } finally {
      confirmInFlightRef.current = false;
      setIsConfirmingSale(false);
    }
  }

  function handleCancel() {
    router.push("/pos");
  }

  function buildSaleDocumentHtml(variant: "ticket" | "invoice" = "ticket") {
    if (!successSale) return null;
    const payload = {
      documentNumber: successSale.documentNumber,
      saleNumber: successSale.saleNumber,
      date: new Date(),
      subtotal: successSale.subtotal,
      lineDiscountTotal: successSale.lineDiscountTotal,
      cartDiscountLabel: successSale.cartDiscountLabel,
      cartDiscountValueDisplay: successSale.cartDiscountValueDisplay,
      surchargeLabel: successSale.surchargeLabel,
      surchargeValueDisplay: successSale.surchargeValueDisplay,
      surchargeAmount: successSale.surchargeAmount,
      total: successSale.total,
      items: successSale.items,
      payments: successSale.payments,
      changeAmount: successSale.changeAmount,
      notes: successSale.notes,
      posName: resolvedPosName,
      vendorName: user?.name ?? undefined,
      settings: posSettings,
      customer: buildSaleTicketCustomer(successSale.customer),
      separatedInfo: successSale.separatedInfo,
    };
    if (variant === "invoice") {
      return renderSaleInvoice(payload);
    }
    return renderSaleTicket(payload);
  }

  function openSaleDocumentWindow(
    html: string,
    size: { width: number; height: number }
  ) {
    const specs = `width=${size.width},height=${size.height}`;
    const win = window.open("", "_blank", specs);
    if (!win) return;
    win.document.write(html);
    win.document.close();

    const triggerPrint = () => {
      try {
        win.focus();
        win.print();
      } catch (err) {
        console.error("No se pudo abrir la ventana de impresión", err);
      } finally {
        win.close();
      }
    };

    const waitForImages = async () => {
      const imgs = Array.from(win.document.images ?? []);
      if (!imgs.length) return;
      await Promise.all(
        imgs.map(
          (img) =>
            img.complete
              ? Promise.resolve()
              : new Promise((resolve) => {
                  img.onload = () => resolve(null);
                  img.onerror = () => resolve(null);
                })
        )
      );
    };

    const handleReady = async () => {
      try {
        await waitForImages();
      } catch (err) {
        console.warn("No se pudieron precargar las imágenes del ticket", err);
      }
      setTimeout(triggerPrint, 50);
    };

    if (win.document.readyState === "complete") {
      void handleReady();
    } else {
      win.onload = () => void handleReady();
    }
  }

  async function printTicketWithQz(html: string): Promise<boolean> {
    if (printerConfig.mode !== "qz-tray") return false;
    if (!printerConfig.printerName.trim()) {
      setErrorWithToast("Selecciona la impresora en Configurar impresora.");
      return false;
    }
    if (!qzClient) {
      setErrorWithToast("No detectamos QZ Tray. Ábrelo y autoriza este dominio.");
      return false;
    }
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
      await qzClient.print(cfg, [{ type: "html", format: "plain", data: html }]);
      setError(null);
      return true;
    } catch (err) {
      console.error(err);
      setErrorWithToast(
        err instanceof Error
          ? `No se pudo imprimir con QZ Tray: ${err.message}`
          : "No se pudo imprimir con QZ Tray."
      );
      return false;
    }
  }

  const openDrawerWithQz = useCallback(async () => {
    if (printerConfig.mode !== "qz-tray") return false;
    if (!printerConfig.printerName.trim()) return false;
    if (!qzClient) return false;
    try {
      configureQzSecurity();
      if (!qzClient.websocket.isActive()) {
        await qzClient.websocket.connect();
      }
      const cfg = qzClient.configs.create(printerConfig.printerName, {
        altPrinting: true,
      });
      const drawerPulse = "\x1B\x70\x00\x19\xFA";
      await qzClient.print(cfg, [
        { type: "raw", format: "command", data: drawerPulse },
      ]);
      return true;
    } catch (err) {
      console.error("No se pudo abrir el cajon al confirmar el pago", err);
      return false;
    }
  }, [configureQzSecurity, printerConfig.mode, printerConfig.printerName, qzClient]);

  async function handlePrintTicket() {
    const html = buildSaleDocumentHtml("ticket");
    if (!html) return;
    const printedWithQz = await printTicketWithQz(html);
    if (printedWithQz) return;
    openSaleDocumentWindow(html, { width: 420, height: 640 });
  }

  function openEmailModal(documentType: "ticket" | "invoice") {
    if (!successSale) return;
    setEmailSubject(
      documentType === "invoice"
        ? `Factura ${successSale.documentNumber}`
        : `Ticket ${successSale.documentNumber}`
    );
    setEmailRecipients(successSale.customer?.email ?? "");
    setEmailMessage("");
    setEmailFeedback(null);
    setEmailError(null);
    setEmailDocumentType(documentType);
    setEmailModalOpen(true);
  }

  const handleEmailTicket = () => openEmailModal("ticket");
  const handleEmailInvoice = () => openEmailModal("invoice");

  async function submitTicketEmail() {
    if (!token || !successSale) return;
    const recipients = Array.from(
      new Set([
        ...parseEmails(emailRecipients),
        ...((posSettings?.ticket_email_cc as string[]) ?? []),
      ])
    );
    if (recipients.length === 0) {
      setEmailError("Agrega al menos un destinatario para enviar el ticket.");
      return;
    }
    setEmailSending(true);
    setEmailError(null);
    setEmailFeedback(null);
    try {
      const apiBase = getApiBase();
      const res = await fetch(
        `${apiBase}/pos/sales/${successSale.saleId}/email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
          body: JSON.stringify({
            recipients,
            subject:
              emailSubject.trim() ||
              (emailDocumentType === "invoice"
                ? `Factura ${successSale.documentNumber}`
                : `Ticket ${successSale.documentNumber}`),
            message: emailMessage.trim() || undefined,
            attach_pdf: true,
            document_type: emailDocumentType,
          }),
        }
      );
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(
          detail?.detail ?? `No se pudo enviar el ticket (Error ${res.status}).`
        );
      }
      setEmailFeedback("Ticket enviado correctamente.");
    } catch (err) {
      console.error(err);
      setEmailError(
        err instanceof Error ? err.message : "No se pudo enviar el ticket."
      );
    } finally {
      setEmailSending(false);
    }
  }

  const handleSuccessDone = useCallback(() => {
    setSuccessSale(null);
    markResumeHeldSale();
    router.push("/pos");
  }, [markResumeHeldSale, router]);
  useEffect(() => {
    handleConfirmRef.current = () => handleConfirm();
  });
  useEffect(() => {
    if (!successSale) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Enter") {
        event.preventDefault();
        handleSuccessDone();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [successSale, handleSuccessDone]);
  useEffect(() => {
    if (!canSubmitWithEnter) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.key !== "Enter") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.getAttribute("contenteditable") === "true")) {
        return;
      }
      if (target && target.tagName === "INPUT") {
        // allow dedicated handlers to run
        // they may call preventDefault; respect if already prevented
      }
      event.preventDefault();
      void handleConfirmRef.current();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [canSubmitWithEnter]);

  const saleNumberDisplay =
    typeof saleNumber === "number" && Number.isFinite(saleNumber)
      ? `#${saleNumber.toString().padStart(3, "0")}`
      : "—";
  const successSeparatedInfo = successSale?.separatedInfo;
  const successInitialPayments = successSeparatedInfo?.initialPayments ?? [];
  const successFollowupPayments = successSeparatedInfo?.payments ?? [];
  const successPaidTotal = successSeparatedInfo
    ? [...successInitialPayments, ...successFollowupPayments].reduce(
        (sum, payment) => sum + Number(payment.amount || 0),
        0
      )
    : successSale?.total ?? 0;
  const successPendingBalance = successSeparatedInfo?.balance ?? 0;
  const successTotalLabel = successSeparatedInfo ? "Total abonado" : "Total pagado";
  const successHeadline = successSeparatedInfo
    ? "¡Venta separada registrada con éxito!"
    : "¡Venta completada con éxito!";
  const successSubtitle = successSeparatedInfo
    ? "El abono inicial quedó aplicado. Puedes entregar comprobante o continuar luego con abonos."
    : "Selecciona cómo deseas entregar el recibo al cliente.";

  return (
    <main className="h-screen bg-slate-950 text-slate-50 flex flex-col overflow-hidden">
      {/* Barra superior */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-slate-900">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/pos")}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-semibold"
          >
            ← Volver al POS
          </button>
          <span className="text-xs uppercase tracking-wide text-slate-400">
            {resolvedPosName}
          </span>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Venta {saleNumberDisplay}
            </div>
            <div className="text-sm text-slate-400">Pago de venta</div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Total
            </div>
            <div className="text-2xl font-semibold text-emerald-400">
              {formatMoney(totalToPay)}
            </div>
          </div>
        </div>
      </header>
      {!isOnline && (
        <div className="px-6 py-2 text-xs text-amber-200 bg-amber-500/10 border-b border-amber-500/30">
          Sin conexión a internet. Las ventas se guardarán como pendientes y podrás enviarlas desde el POS cuando vuelva la red.
        </div>
      )}

      {/* Cuerpo principal */}
      <div className="flex-1 flex overflow-hidden">
        {/* Columna izquierda: artículos */}
        <section className="w-[18rem] border-r border-slate-800 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 text-sm font-semibold tracking-wide text-slate-400">
            Artículos
          </div>
          <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                No hay artículos en la venta.
              </div>
            ) : (
              cart.map((item) => {
                const gross = item.quantity * item.unitPrice;
                const lineTotal = Math.max(0, gross - item.lineDiscountValue);
                const hasDiscount = item.lineDiscountValue > 0;
                const freeSaleReason = (item.freeSaleReason ?? "").trim();

                return (
                  <div
                    key={item.id}
                    className="px-4 py-3 text-sm border-b border-slate-900"
                  >
                    <div className="font-semibold truncate text-base">
                      {item.product.name}
                    </div>
                    <div className="flex justify-between gap-3 text-slate-400 mt-1 text-sm">
                      <span>
                        {item.quantity} x {formatMoney(item.unitPrice)}
                      </span>
                      <div className="text-right">
                        {hasDiscount && (
                          <div className="text-xs text-slate-500 line-through">
                            {formatMoney(gross)}
                          </div>
                        )}
                        <div className="font-semibold text-slate-100 text-base">
                          {formatMoney(lineTotal)}
                        </div>
                        {hasDiscount && (
                          <div className="text-xs text-emerald-400">
                            Descuento -{formatMoney(item.lineDiscountValue)}
                          </div>
                        )}
                      </div>
                    </div>
                    {freeSaleReason && (
                      <div
                        className="mt-1 text-sm text-amber-200 truncate"
                        title={`Motivo: ${freeSaleReason}`}
                      >
                        Motivo: {freeSaleReason}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
          {/* Totales abajo */}
          <div className="border-t border-slate-800 px-4 py-4 space-y-3 shrink-0 text-sm">
            {cartLineDiscountTotal > 0 && (
              <>
                <div className="flex items-center justify-between text-sm text-slate-300">
                  <span>Subtotal sin descuentos</span>
                  <span className="font-semibold text-slate-100">
                    {formatMoney(cartGrossSubtotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm text-emerald-400">
                  <span>Descuento artículos</span>
                  <span className="font-semibold">
                    -{formatMoney(cartLineDiscountTotal)}
                  </span>
                </div>
              </>
            )}
            <div className="flex items-center justify-between text-sm text-slate-300">
              <span>Subtotal</span>
              <span className="font-semibold text-slate-100">
                {formatMoney(cartSubtotal)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm text-slate-300">
              <span>
                {cartDiscountValue > 0 || cartDiscountPercent > 0
                  ? "Descuento carrito"
                  : cartSurcharge.enabled && cartSurcharge.amount > 0
                  ? `Incremento${
                      cartSurcharge.method
                        ? ` ${getSurchargeMethodLabel(cartSurcharge.method)}`
                        : ""
                    }`
                  : "Descuento carrito"}
              </span>
            <span className="font-semibold text-slate-100">
                {cartDiscountValue > 0
                  ? `-${formatMoney(cartDiscountValue)}`
                  : cartDiscountPercent > 0
                  ? `-${cartDiscountPercent}%`
                  : cartSurcharge.enabled && cartSurcharge.amount > 0
                  ? `${formatMoney(cartSurcharge.amount)}`
                  : "0"}
              </span>
            </div>
            <div className="flex items-center justify-between pt-3">
              <span className="text-base font-bold text-slate-200">
                TOTAL
              </span>
              <span className="text-3xl font-extrabold text-emerald-400">
                {formatMoney(totalToPay)}
              </span>
            </div>
          </div>

          </div>
        </section>

        {/* Columna central: métodos y valores */}
        <section className="flex-1 border-r border-slate-800 flex flex-col overflow-hidden">
          <div className="flex-1 flex overflow-hidden">
            {/* Métodos de pago */}
            <div className="w-[14.25rem] border-r border-slate-800 p-4 flex flex-col gap-3 bg-slate-950/70">
              <h2 className="text-sm font-semibold text-slate-300 mb-1 uppercase tracking-wide">
                Tipo de pago
              </h2>

              {!hasActivePaymentMethods && (
                <p className="text-xs text-amber-300">
                  No hay métodos de pago activos. Configúralos en
                  Configuración {">"} Métodos de pago.
                </p>
              )}

              {activePaymentMethods.map((m) => {
                const methodColor = m.color?.trim();
                const isSelected = method === m.slug;
                const idleStyle = methodColor
                  ? { backgroundColor: methodColor, borderColor: methodColor }
                  : undefined;

                return (
                  <button
                    key={m.id}
                    onClick={() => handleSelectMethod(m.slug)}
                    className={
                      "w-full text-left px-4 py-3.5 rounded-xl text-base font-semibold border shadow-inner transition-colors " +
                      (isSelected
                        ? "bg-emerald-500 text-slate-950 border-emerald-400 shadow-emerald-500/30"
                        : "bg-slate-900/80 hover:bg-slate-800 border-slate-700 text-slate-200")
                    }
                    style={!isSelected ? idleStyle : undefined}
                  >
                    {m.name}
                  </button>
                );
              })}
            </div>

            {/* Área de pago */}
            <div className="payment-main-panel flex-1 px-5 py-4 flex flex-col items-stretch overflow-y-auto min-h-0">
              <div className="w-full max-w-none space-y-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold">Pago</h2>
                    <p className="text-base text-slate-400">
                      Ajusta el monto recibido y agrega notas antes de confirmar.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-base">
                    <span className="rounded-full border border-slate-800 bg-slate-900/70 px-4 py-2 text-slate-200">
                      {selectedMethod?.name ?? "Método"}
                    </span>
                  </div>
                </div>

                <div className="grid gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-inner text-lg">
                  <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                    <span className="text-slate-300">Total</span>
                    <span className="font-semibold text-slate-100 text-xl">
                      {formatMoney(totalToPay)}
                    </span>
                  </div>
                  {!isSeparatedSale ? (
                    <div className="grid grid-cols-[1fr_auto] items-center gap-3">
                      <span className="text-slate-300">Pagado</span>
                      <div className="flex items-center gap-3">
                        <input
                          ref={paidInputRef}
                          type="text"
                          inputMode="numeric"
                          disabled={!requiresManualAmount}
                          required={requiresManualAmount}
                          value={formatInputAmount(paidValue)}
                          onChange={(e) => setPaidValue(sanitizeAmountInput(e.target.value))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void handleConfirm();
                            }
                            if (e.key === "Escape") {
                              e.preventDefault();
                              handleCancel();
                            }
                          }}
                          className={
                            "w-56 rounded-xl border px-4 py-3 text-2xl bg-slate-900/80 " +
                            "border-slate-700 text-slate-50 outline-none shadow-inner " +
                            "focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/40 " +
                            (!requiresManualAmount ? "opacity-40 cursor-not-allowed" : "")
                          }
                        />
                      </div>
                    </div>
                  ) : null}
                  {isSeparatedSale && (
                    <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="text-base font-semibold text-slate-100">
                            Abono inicial
                          </p>
                          <p className="text-base text-slate-500">
                            Puedes registrar uno o varios métodos en el mismo abono.
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-right">
                          <p className="text-xs uppercase tracking-wide text-slate-500">
                            {separatedInitialPayments.length > 1 ? "Pago mixto" : "Abono inicial"}
                          </p>
                          <p className="text-lg font-semibold text-slate-100">
                            {formatMoney(separatedInitialPaymentTotal)}
                          </p>
                          <p className="text-xs text-slate-400">
                            Pendiente: {formatMoney(Math.max(0, totalToPay - separatedInitialPaymentTotal))}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {separatedMethodOptions.length === 0 && (
                          <span className="text-base text-red-400">
                            No hay métodos disponibles para registrar el abono.
                          </span>
                        )}
                        {separatedMethodOptions.map((option) => {
                          const isUsed = separatedInitialPayments.some(
                            (entry) => entry.method === option.slug
                          );
                          return (
                            <button
                              key={option.id ?? option.slug}
                              type="button"
                              onClick={() => handleSeparatedMethodClick(option.slug)}
                              className={
                                "px-4 py-2 rounded-lg border text-base transition-colors " +
                                (isUsed
                                  ? "bg-emerald-500 text-slate-900 border-emerald-400"
                                  : "bg-slate-900/80 border-slate-700 hover:border-emerald-400/60")
                              }
                            >
                              {option.name}
                            </button>
                          );
                        })}
                      </div>

                      <div className="space-y-3">
                        {separatedInitialPayments.map((line, index) => {
                          const activeLine = selectedSeparatedPaymentId === line.id;
                          return (
                            <div
                              key={line.id}
                              className={
                                "rounded-xl border px-4 py-4 transition-colors " +
                                (activeLine
                                  ? "border-emerald-400 bg-emerald-500/10"
                                  : "border-slate-700 bg-slate-900/60")
                              }
                              onClick={() => setSelectedSeparatedPaymentId(line.id)}
                              role="button"
                              tabIndex={0}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm uppercase tracking-wide text-slate-500">
                                    {separatedInitialPayments.length > 1 ? `Método ${index + 1}` : "Método"}
                                  </p>
                                  <p className="text-lg font-semibold text-slate-100">
                                    {getMethodLabel(line.method)}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleSeparatedDeleteLine(line.id);
                                  }}
                                  disabled={separatedInitialPayments.length <= 1}
                                  className="rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-200 hover:border-rose-400 hover:text-rose-200 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  Quitar
                                </button>
                              </div>
                              <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_200px] md:items-center">
                                <div className="text-sm text-slate-400">
                                  Usa este valor para el aporte de este método.
                                </div>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={formatInputAmount(String(line.amount))}
                                  onChange={(e) =>
                                    handleSeparatedAmountChange(line.id, e.target.value)
                                  }
                                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-xl text-slate-50 outline-none shadow-inner focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/40"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                    <span className="text-slate-300">{displayChangeLabel}</span>
                    <span
                      className={
                        "inline-flex items-center gap-2 rounded-full px-4 py-2 text-base font-semibold " +
                        (allowsChange && displayChange < 0
                          ? "bg-red-500/15 text-red-300 border border-red-500/30"
                          : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30")
                      }
                    >
                      {formatMoney(displayChange)}
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-3">
                  <div className="flex items-center justify-between text-base text-slate-400">
                    <span className="uppercase tracking-wide text-base">Notas adicionales</span>
                    <button
                      type="button"
                      onClick={() => setSaleNotes("")}
                      className="rounded-full border border-slate-700/80 bg-slate-950/70 px-4 py-2 text-base font-semibold text-slate-200 hover:border-emerald-400/70 hover:text-emerald-100"
                    >
                      Limpiar
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {SALE_NOTE_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() =>
                          setSaleNotes((prev) =>
                            prev ? `${prev}\n${preset.text}` : preset.text
                          )
                        }
                        className="px-4 py-2 rounded-full border border-slate-700/80 bg-slate-950/70 text-base text-slate-200 hover:border-emerald-400/70 hover:text-emerald-100 transition"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={saleNotes}
                    onChange={(e) => setSaleNotes(e.target.value)}
                    rows={4}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-lg text-slate-50 focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-inner"
                    placeholder="Notas de garantía, instrucciones especiales..."
                  />
                </div>
              </div>
              {message && (
                <div className="mt-6 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/40 rounded-md px-3 py-2">
                  {message}
                </div>
              )}
            </div>
          </div>

          {/* Botones inferiores */}
          <footer className="grid grid-cols-3 items-center gap-5 px-10 py-6 min-h-[9.075rem] border-t border-slate-800 bg-slate-950/85">
            <button
              type="button"
              onClick={handleCancel}
              className="w-full h-[89.2px] rounded-xl bg-red-600 hover:bg-red-700 text-lg font-semibold text-slate-50 transition-colors shadow-lg shadow-red-900/30"
            >
              Cancelar
            </button>

            {/* Botón para ir a la pantalla de pagos múltiples (NUEVO) */}
            <button
              type="button"
              onClick={() => router.push("/pos/pago/pago-multiple")}
              className="w-full h-[89.2px] rounded-xl bg-slate-800 hover:bg-slate-700 text-lg font-semibold text-slate-100 transition-colors border border-slate-600 shadow-inner disabled:opacity-60"
              disabled={!cart.length}
            >
              Pagos múltiples
            </button>

            <button
              type="button"
              onClick={handleConfirm}
              className="w-full h-[89.2px] rounded-xl bg-emerald-500 hover:bg-emerald-600 text-lg font-semibold text-slate-950 transition-colors shadow-lg shadow-emerald-900/30 disabled:opacity-50"
              disabled={confirmDisabled || isConfirmingSale}
            >
              {isConfirmingSale ? "Procesando..." : "Confirmar pago"}
            </button>
          </footer>
        </section>

        {/* Panel derecho: cliente */}
        <CustomerPanel />
      </div>

      {toast && (
        <div className="fixed right-8 top-24 z-40 w-[360px] max-w-[90vw]">
          <div
            className={
              "rounded-2xl border border-rose-400/40 bg-slate-900/80 px-4 py-3 text-rose-100 shadow-[0_16px_40px_rgba(15,23,42,0.45)] backdrop-blur transition-all duration-300 " +
              (toastVisible
                ? "translate-x-0 opacity-100"
                : "translate-x-4 opacity-0")
            }
          >
            <div className="text-sm font-semibold">Error</div>
            <p className="mt-1 text-sm text-slate-100/90">{toast.message}</p>
          </div>
        </div>
      )}

      {/* Modal de éxito de venta */}
      {successSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-3 py-3 sm:px-4 sm:py-4">
          <div className="w-full max-w-5xl bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl max-h-[96vh] flex flex-col overflow-hidden">
            <div className="shrink-0 text-center px-6 pt-7 pb-5 sm:px-10 sm:pt-9 sm:pb-7 border-b border-slate-800">
              <p className="text-sm sm:text-base font-semibold text-emerald-400 tracking-wide uppercase">
                Venta registrada correctamente
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-50 mt-2">
                {successHeadline}
              </h2>
              <p className="text-slate-400 mt-2 text-sm sm:text-base">
                {successSubtitle}
              </p>
            </div>

            <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-8 sm:py-6">
              <div className="mx-auto w-full max-w-2xl bg-slate-800/40 border border-slate-700 rounded-xl p-4 sm:p-6 text-sm sm:text-base space-y-2">
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Documento</span>
                  <span className="font-mono font-semibold text-slate-100">
                    {successSale.documentNumber}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Ticket</span>
                  <span className="font-mono text-slate-100">
                    #{successSale.saleNumber}
                  </span>
                </div>
                <div className="flex justify-between py-1 text-slate-400">
                  <span>Subtotal</span>
                  <span className="text-slate-100">
                    {successSale.subtotal.toLocaleString("es-CO")}
                  </span>
                </div>
                {successSale.lineDiscountTotal > 0 && (
                  <div className="flex justify-between py-1 text-emerald-400">
                    <span>Descuento artículos</span>
                    <span>
                      -{successSale.lineDiscountTotal.toLocaleString("es-CO")}
                    </span>
                  </div>
                )}
                {successSale.cartDiscountValueDisplay &&
                  successSale.cartDiscountValueDisplay !== "0" && (
                    <div className="flex justify-between py-1 text-slate-400">
                      <span>{successSale.cartDiscountLabel}</span>
                      <span className="text-slate-100">
                        {successSale.cartDiscountValueDisplay}
                      </span>
                    </div>
                  )}
                {successSale.surchargeLabel &&
                  successSale.surchargeValueDisplay && (
                    <div className="flex justify-between py-1 text-amber-300">
                      <span>{successSale.surchargeLabel}</span>
                      <span className="text-amber-200">
                        +{successSale.surchargeValueDisplay}
                      </span>
                    </div>
                  )}
                {successSeparatedInfo && (
                  <>
                    <div className="flex justify-between py-1 text-slate-300">
                      <span>Total venta</span>
                      <span className="font-semibold text-slate-100">
                        {successSale.total.toLocaleString("es-CO")}
                      </span>
                    </div>
                    {successInitialPayments.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs uppercase tracking-wide text-slate-500">
                          Abono inicial
                        </div>
                        {successInitialPayments.length > 1 && (
                          <div className="text-xs text-emerald-300">
                            Pago mixto
                          </div>
                        )}
                        {successInitialPayments.map((payment, index) => (
                          <div
                            key={`${payment.method ?? "initial"}-${index}`}
                            className="flex justify-between py-1 text-slate-300"
                          >
                            <span>
                              {successInitialPayments.length > 1
                                ? `Abono inicial ${index + 1}`
                                : "Abono inicial"}
                            </span>
                            <span className="text-slate-100">
                              {payment.method ?? "No especificado"} ·{" "}
                              {Number(payment.amount || 0).toLocaleString("es-CO")}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {successFollowupPayments.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <div className="text-xs uppercase tracking-wide text-slate-500">
                          Abonos posteriores
                        </div>
                        {successFollowupPayments.map((payment, index) => (
                          <div
                            key={`${payment.method ?? "payment"}-${index}`}
                            className="flex justify-between py-1 text-slate-400"
                          >
                            <span>{payment.label ?? `Abono ${index + 2}`}</span>
                            <span className="text-slate-100">
                              {payment.method ?? "No especificado"} ·{" "}
                              {Number(payment.amount || 0).toLocaleString("es-CO")}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex justify-between py-1 text-rose-300">
                      <span>Saldo pendiente</span>
                      <span className="font-semibold">
                        {successPendingBalance.toLocaleString("es-CO")}
                      </span>
                    </div>
                  </>
                )}
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">{successTotalLabel}</span>
                  <span className="font-semibold text-emerald-400 text-xl">
                    {successPaidTotal.toLocaleString("es-CO")}
                  </span>
                </div>
                {successSale.showChange && successSale.changeAmount > 0 && (
                  <div className="flex justify-between py-1 text-amber-300 text-lg">
                    <span className="font-semibold">Cambio</span>
                    <span className="font-semibold text-xl">
                      {successSale.changeAmount.toLocaleString("es-CO")}
                    </span>
                  </div>
                )}
                {successSale.notes && (
                  <div className="pt-3 text-left text-slate-300">
                    <div className="text-slate-400 text-xs sm:text-sm uppercase tracking-wide mb-1">
                      Notas
                    </div>
                    <p className="whitespace-pre-line">{successSale.notes}</p>
                  </div>
                )}
                {successSale.customer && (
                  <div className="pt-3 text-left text-slate-300">
                    <div className="text-slate-400 text-xs sm:text-sm uppercase tracking-wide mb-1">
                      Cliente
                    </div>
                    <p className="font-semibold">{successSale.customer.name}</p>
                    {successSale.customer.phone && (
                      <p className="text-sm text-slate-400">
                        Tel: {successSale.customer.phone}
                      </p>
                    )}
                    {successSale.customer.email && (
                      <p className="text-sm text-slate-400">
                        Email: {successSale.customer.email}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0 border-t border-slate-800 px-4 py-3 sm:px-8 sm:py-4 bg-slate-900/95 space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <button
                  onClick={() => void handlePrintTicket()}
                  className="flex flex-col items-center justify-center p-4 sm:p-5 rounded-xl bg-slate-800 hover:bg-slate-700 transition border border-slate-600 min-h-[84px] sm:min-h-[96px]"
                >
                  <div className="text-3xl sm:text-4xl mb-1 sm:mb-2">🖨️</div>
                  <span className="text-sm sm:text-base font-semibold text-slate-100">
                    Imprimir ticket
                  </span>
                </button>

                <div className="flex flex-col gap-3">
                  <button
                    onClick={handleEmailTicket}
                    className="flex flex-col items-center justify-center p-3 sm:p-4 rounded-xl bg-slate-800 hover:bg-slate-700 transition border border-slate-600 min-h-[64px] sm:min-h-[72px]"
                  >
                    <div className="text-2xl sm:text-3xl mb-1">✉️</div>
                    <span className="text-sm font-semibold text-slate-100">
                      Enviar ticket
                    </span>
                  </button>
                  <button
                    onClick={handleEmailInvoice}
                    className="flex flex-col items-center justify-center p-3 sm:p-4 rounded-xl bg-slate-800 hover:bg-slate-700 transition border border-slate-600 min-h-[64px] sm:min-h-[72px]"
                  >
                    <div className="text-2xl sm:text-3xl mb-1">✉️</div>
                    <span className="text-sm font-semibold text-slate-100">
                      Enviar factura
                    </span>
                  </button>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={handleSuccessDone}
                  className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm sm:text-base shadow-lg transition"
                >
                  Hecho (volver al POS)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {emailModalOpen && successSale && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-4 text-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-emerald-300 uppercase tracking-wide">
                  {emailDocumentType === "invoice"
                    ? "Enviar factura"
                    : "Enviar ticket"}
                </p>
                <h3 className="text-xl font-semibold text-slate-100">
                  {successSale.documentNumber}
                </h3>
                {posSettings?.ticket_email_cc &&
                  posSettings.ticket_email_cc.length > 0 && (
                    <p className="text-[11px] text-slate-400 mt-1">
                      Copia para: {posSettings.ticket_email_cc.join(", ")}
                    </p>
                  )}
              </div>
              <button
                type="button"
                onClick={() => setEmailModalOpen(false)}
                className="text-slate-400 hover:text-slate-100 text-xl leading-none"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">
                Destinatarios (uno por línea o separación por coma)
              </span>
              <textarea
                value={emailRecipients}
                onChange={(e) => setEmailRecipients(e.target.value)}
                rows={3}
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                placeholder="cliente@correo.com"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">Asunto</span>
              <input
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">Mensaje</span>
              <textarea
                value={emailMessage}
                onChange={(e) => setEmailMessage(e.target.value)}
                rows={4}
                placeholder="Notas adicionales para el cliente (opcional)"
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              />
            </label>
            {emailError && (
              <p className="text-xs text-red-400">{emailError}</p>
            )}
            {emailFeedback && (
              <p className="text-xs text-emerald-300">{emailFeedback}</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEmailModalOpen(false)}
                className="px-4 py-2 rounded-md border border-slate-700 text-slate-200 hover:bg-slate-800"
                disabled={emailSending}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submitTicketEmail}
                className="px-4 py-2 rounded-md bg-emerald-500 text-slate-900 font-semibold hover:bg-emerald-400 disabled:opacity-50"
                disabled={emailSending}
              >
                {emailSending
                  ? "Enviando…"
                  : emailDocumentType === "invoice"
                  ? "Enviar factura"
                  : "Enviar ticket"}
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}

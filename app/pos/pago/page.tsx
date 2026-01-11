// app/pos/pago/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  usePos,
  POS_DISPLAY_NAME,
  PosCustomer,
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
import CustomerPanel from "../components/CustomerPanel";
import {
  DEFAULT_PAYMENT_METHODS,
  fetchPaymentMethods,
  type PaymentMethodRecord,
} from "@/lib/api/paymentMethods";
import type { SeparatedOrder } from "@/lib/api/separatedOrders";
import { useOnlineStatus } from "@/app/hooks/useOnlineStatus";
import { addPendingSale } from "@/lib/pos/pendingSales";
import {
  getPosStationAccess,
  type PosStationAccess,
  formatPosDisplayName,
  ensureStoredPosMode,
  getWebPosStation,
  subscribeToPosStationChanges,
  type PosAccessMode,
} from "@/lib/api/posStations";

type PaymentMethodSlug = string;

type SaleResponse = {
  id: number;
  total: number;
  paid_amount: number;
  change_amount: number;
  payment_method: string;
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
  customer?: PosCustomer | null;
  separatedInfo?: {
    dueDate?: string | null;
    balance: number;
    payments: { label: string; amount: number; paidAt?: string; method?: string }[];
  };
};

export default function PagoPage() {
  const router = useRouter();
  const { token, user } = useAuth();
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
    setSaleNumber,
  } = usePos();

  // Total real de la venta
  const totalToPay = cartTotal;

  const [method, setMethod] = useState<PaymentMethodSlug>("cash");
  const [paidValue, setPaidValue] = useState<string>("0");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  const apiBase = useMemo(() => getApiBase(), []);
  const [printerConfig, setPrinterConfig] = useState<{
    mode: "browser" | "qz-tray";
    printerName: string;
    width: "58mm" | "80mm";
  }>({
    mode: "qz-tray",
    printerName: "",
    width: "80mm",
  });
  const handleConfirmRef = useRef<() => Promise<void>>(() => Promise.resolve());
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
  const printerStorageKey = useMemo(
    () => `kensar_pos_printer_${activeStationId ?? "pos-web"}`,
    [activeStationId]
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(printerStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        setPrinterConfig((prev) => ({ ...prev, ...parsed }));
      }
    } catch (err) {
      console.warn("No se pudo cargar la configuración de impresora", err);
    }
  }, [printerStorageKey]);
  type QzType = {
    websocket: { isActive: () => boolean; connect: () => Promise<void> };
    printers: { find: () => Promise<string[]> };
    configs: { create: (printer: string, options?: Record<string, unknown>) => unknown };
    print: (config: unknown, data: unknown) => Promise<void>;
    security?: {
      setCertificatePromise: (promise: () => Promise<string>) => void;
      setSignaturePromise: (promise: (toSign: string) => Promise<string>) => void;
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
    qzClient.security.setCertificatePromise((resolve, reject) => {
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
    });
    qzClient.security.setSignaturePromise((toSign) => (resolve, reject) => {
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
              detail?.detail ?? `No se pudo firmar el reto (Error ${res.status}).`
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
    });
    qzSecurityConfiguredRef.current = true;
    return true;
  }, [apiBase, qzClient, token]);
  useEffect(() => {
    configureQzSecurity();
  }, [configureQzSecurity]);
  const [paymentCatalog, setPaymentCatalog] = useState<PaymentMethodRecord[]>(
    DEFAULT_PAYMENT_METHODS
  );
  const [separatedPaymentMethod, setSeparatedPaymentMethod] =
    useState<PaymentMethodSlug | null>(null);
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
  const separatedMethodLabel = separatedPaymentMethod
    ? getMethodLabel(separatedPaymentMethod)
    : null;
  const effectivePaymentLabel =
    isSeparatedSale && separatedMethodLabel
      ? separatedMethodLabel
      : methodLabel;

  // Métodos que requieren escribir un monto manual
  // (los que permiten cambio o los que manejan crédito/separado)
  const requiresManualAmount = allowsChange || isCreditLike;
  const confirmDisabled =
    !cart.length ||
    (requiresManualAmount && (!paidValue || paidValue === "0"));
  const canSubmitWithEnter = !confirmDisabled && !successSale;

  useEffect(() => {
    let active = true;
    async function loadMethods() {
      if (!token) return;
      try {
        const data = await fetchPaymentMethods(token);
        if (!active) return;
        if (data.length) {
          setPaymentCatalog(data);
        }
      } catch (err) {
        console.warn("No se pudieron cargar los métodos de pago", err);
      }
    }
    void loadMethods();
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!activePaymentMethods.length) return;
    const exists = activePaymentMethods.some((m) => m.slug === method);
    if (!exists) {
      setMethod(activePaymentMethods[0].slug);
    }
  }, [activePaymentMethods, method]);

  useEffect(() => {
    if (method !== "separado") {
      setSeparatedPaymentMethod(null);
    }
  }, [method]);


  useEffect(() => {
    if (requiresManualAmount) {
      // Para efectivo / crédito / separado, empezamos en 0
      setPaidValue("0");
      return;
    }

    // Métodos sin monto manual (tarjeta, qr, nequi, daviplata): pagado = total
    setPaidValue(totalToPay.toString());
  }, [requiresManualAmount, totalToPay]);

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
  due.setMonth(due.getMonth() + 3);
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
    setSeparatedPaymentMethod(null);
  }

  async function handleConfirm() {
    try {
      setError(null);
      setMessage(null);

      if (!cart.length) {
        setError("No hay productos en el carrito.");
        return;
      }

      if (isSeparatedSale && !separatedPaymentMethod) {
        setError("Selecciona el método del abono inicial para este separado.");
        return;
      }

      // Solo validamos que el efectivo no sea menor al total
      if (!isCreditLike && allowsChange && paidNumber < totalToPay) {
        setError("El monto pagado en efectivo no puede ser menor al total.");
        return;
      }

      if (!saleNumber || Number.isNaN(saleNumber)) {
        setError(
          "No se pudo obtener el consecutivo de venta. Intentando nuevamente…"
        );
        await refreshSaleNumber();
        return;
      }

      // 1) Monto pagado y cambio (igual que antes)
      const paid_amount = isCreditLike
        ? paidNumber
        : allowsChange
        ? paidNumber
        : totalToPay;

      const change_amount = isCreditLike
        ? 0
        : allowsChange
        ? Math.max(0, paidNumber - totalToPay)
        : 0;

      // 2) Payload base de la venta (tipado explícito)
      let assignedSaleNumber = saleNumber;

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
        items: saleItemsPayload,
        notes: saleNotes.trim() ? saleNotes.trim() : undefined,
        pos_name: resolvedPosName,
        vendor_name: user?.name ?? undefined,
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
      if (isCreditLike) {
        const paymentEntryMethod =
          isSeparatedSale && separatedPaymentMethod
            ? separatedPaymentMethod
            : method;
        basePayload.payments = [
          {
            method: paymentEntryMethod,
            amount: paid_amount,
          },
        ];
      }

      const buildPayload = (): SaleSubmissionPayload => ({
        ...basePayload,
        sale_number_preassigned: assignedSaleNumber,
      });

      // 4) Enviamos al backend
      if (!token) {
        throw new Error("Sesión expirada. Inicia sesión nuevamente.");
      }

      const apiBase = getApiBase();
      const endpoint = isSeparatedSale ? "/separated-orders" : "/pos/sales";

      const queueSaleOffline = (customMessage?: string) => {
        const payloadForQueue = buildPayload();
        addPendingSale({
          endpoint,
          payload: payloadForQueue,
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
        setError(
          customMessage ??
            "Guardamos la venta como pendiente. Se enviará cuando vuelva la conexión."
        );
        router.replace("/pos");
      };

      if (!isOnline) {
        queueSaleOffline();
        return;
      }

      let res: Response;
      try {
        const payloadToSend = buildPayload();
        res = await fetch(`${apiBase}${endpoint}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
          body: JSON.stringify(payloadToSend),
        });
      } catch (err) {
        console.error(err);
        if (
          (typeof navigator !== "undefined" && !navigator.onLine) ||
          err instanceof TypeError
        ) {
          queueSaleOffline();
          return;
        }
        throw err;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const detail =
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

        if (res.status === 409) {
          const updated = await refreshSaleNumber();
          if (updated && updated > 0) {
            assignedSaleNumber = updated;
          } else {
            assignedSaleNumber += 1;
            setSaleNumber(assignedSaleNumber);
          }
          const retryPayload = buildPayload();
          try {
            res = await fetch(`${apiBase}${endpoint}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              credentials: "include",
              body: JSON.stringify(retryPayload),
            });
          } catch (err) {
            console.error(err);
            if (
              (typeof navigator !== "undefined" && !navigator.onLine) ||
              err instanceof TypeError
            ) {
              queueSaleOffline(
                "El consecutivo se actualizó pero perdimos la conexión. Guardamos la venta como pendiente."
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
      let changeAmountForTicket = change_amount;
      let separatedInfo: SuccessSaleSummary["separatedInfo"] | undefined;
      let responseSurchargeAmount: number | undefined;
      let responseSurchargeLabel: string | undefined;

      const saleItemsNetTotal = saleItemsPayload.reduce(
        (sum, item) => sum + (item.total ?? item.quantity * item.unit_price),
        0
      );
      let saleTotalForSummary = totalToPay;
      if (isSeparatedSale) {
        const order: SeparatedOrder = await res.json();
        backendSaleNumber = order.sale_number ?? order.sale_id;
        saleId = order.sale_id;
        documentNumber =
          order.sale_document_number ??
          `V-${order.sale_id.toString().padStart(6, "0")}`;
        serverNotes = order.notes;
        const pendingBalance = Math.max(order.balance ?? 0, 0);
        changeAmountForTicket = pendingBalance > 0 ? -pendingBalance : 0;
        if (order.total_amount && order.total_amount > 0) {
          saleTotalForSummary = order.total_amount;
        } else {
          saleTotalForSummary = saleItemsNetTotal;
        }
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
        const paymentsForTicket = [
          {
            label: "Abono inicial",
            amount: order.initial_payment,
            paidAt: order.created_at,
            method: effectivePaymentLabel,
          },
          ...order.payments.map((payment, idx) => ({
            label: `Abono ${idx + 2}`,
            amount: payment.amount,
            paidAt: payment.paid_at,
            method: getMethodLabel(payment.method),
          })),
        ];
        separatedInfo = {
          dueDate: order.due_date ?? basePayload.due_date,
          balance: pendingBalance,
          payments: paymentsForTicket,
        };
      } else {
        const sale: SaleResponse = await res.json();
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
      }

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

      const saleItemsForTicket = saleItemsPayload.map((item) => ({
        name: item.product_name,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        total: item.total ?? item.quantity * item.unit_price,
      }));

      const paymentSummary = [
        {
          label: effectivePaymentLabel,
          amount: paid_amount,
        },
      ];

      // Guardamos info para la ventana de éxito
      setSuccessSale({
        saleId,
        documentNumber,
        saleNumber: backendSaleNumber,
        total: saleTotalForSummary,
        subtotal: cartSubtotal,
        lineDiscountTotal: cartLineDiscountTotal,
        surchargeLabel: summarySurchargeLabel,
        surchargeValueDisplay: summarySurchargeDisplay,
        surchargeAmount: summarySurchargeAmount,
        cartDiscountLabel:
          cartDiscountValue > 0
            ? "Descuento carrito (valor)"
            : cartDiscountPercent > 0
            ? "Descuento carrito (%)"
            : "Descuento carrito",
        cartDiscountValueDisplay:
          cartDiscountValue > 0
            ? `-${formatMoney(cartDiscountValue)}`
            : cartDiscountPercent > 0
            ? `-${cartDiscountPercent}%`
            : "0",
        notes: serverNotes ?? (saleNotes.trim() ? saleNotes.trim() : undefined),
        items: saleItemsForTicket,
        payments: paymentSummary,
        changeAmount: changeAmountForTicket,
        customer: ticketCustomer,
        separatedInfo,
      });

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
      setError(msg);
      setMessage(null);
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
      setError("Selecciona la impresora en Configurar impresora.");
      return false;
    }
    if (!qzClient) {
      setError("No detectamos QZ Tray. Ábrelo y autoriza este dominio.");
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
      setError(
        err instanceof Error
          ? `No se pudo imprimir con QZ Tray: ${err.message}`
          : "No se pudo imprimir con QZ Tray."
      );
      return false;
    }
  }

  async function handlePrintTicket() {
    const html = buildSaleDocumentHtml("ticket");
    if (!html) return;
    const printedWithQz = await printTicketWithQz(html);
    if (printedWithQz) return;
    openSaleDocumentWindow(html, { width: 420, height: 640 });
  }

  function handlePrintInvoice() {
    const html = buildSaleDocumentHtml("invoice");
    if (!html) return;
    openSaleDocumentWindow(html, { width: 960, height: 900 });
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
    router.push("/pos");
  }, [router]);
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

  return (
    <main className="h-screen bg-slate-950 text-slate-50 flex flex-col overflow-hidden">
      {/* Barra superior */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-slate-900">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/pos")}
            className="px-3 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-xs"
          >
            ← Volver al POS
          </button>
          <span className="text-xs uppercase tracking-wide text-slate-400">
            {resolvedPosName}
          </span>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">
            Venta {saleNumberDisplay}
          </div>
          <div className="text-xs text-slate-400">Pago de venta</div>
          <div className="text-lg font-semibold text-emerald-400">
            Total: {formatMoney(totalToPay)}
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
        <section className="w-[26rem] border-r border-slate-800 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 text-xs font-semibold tracking-wide text-slate-400">
            Artículos
          </div>
          <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                No hay artículos en la venta.
              </div>
            ) : (
              cart.map((item) => {
                const gross = item.quantity * item.unitPrice;
                const lineTotal = Math.max(0, gross - item.lineDiscountValue);
                const hasDiscount = item.lineDiscountValue > 0;

                return (
                  <div
                    key={item.id}
                    className="px-4 py-2 text-xs border-b border-slate-900"
                  >
                    <div className="font-semibold truncate">
                      {item.product.name}
                    </div>
                    <div className="flex justify-between gap-3 text-slate-400 mt-1">
                      <span>
                        {item.quantity} x {formatMoney(item.unitPrice)}
                      </span>
                      <div className="text-right">
                        {hasDiscount && (
                          <div className="text-[11px] text-slate-500 line-through">
                            {formatMoney(gross)}
                          </div>
                        )}
                        <div className="font-semibold text-slate-100">
                          {formatMoney(lineTotal)}
                        </div>
                        {hasDiscount && (
                          <div className="text-[11px] text-emerald-400">
                            Descuento -{formatMoney(item.lineDiscountValue)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {/* Totales abajo */}
          <div className="border-t border-slate-800 px-4 py-3 space-y-2 shrink-0">
            {cartLineDiscountTotal > 0 && (
              <>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Subtotal sin descuentos</span>
                  <span className="font-medium text-slate-100">
                    {formatMoney(cartGrossSubtotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-emerald-400">
                  <span>Descuento artículos</span>
                  <span className="font-medium">
                    -{formatMoney(cartLineDiscountTotal)}
                  </span>
                </div>
              </>
            )}
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Subtotal</span>
              <span className="font-medium text-slate-100">
                {formatMoney(cartSubtotal)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400">
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
            <span className="font-medium text-slate-100">
                {cartDiscountValue > 0
                  ? `-${formatMoney(cartDiscountValue)}`
                  : cartDiscountPercent > 0
                  ? `-${cartDiscountPercent}%`
                  : cartSurcharge.enabled && cartSurcharge.amount > 0
                  ? `${formatMoney(cartSurcharge.amount)}`
                  : "0"}
              </span>
            </div>
            <div className="flex items-center justify-between pt-2">
              <span className="text-sm font-semibold text-slate-300">
                TOTAL
              </span>
              <span className="text-2xl font-extrabold text-emerald-400">
                {formatMoney(totalToPay)}
              </span>
            </div>
          </div>

          </div>
        </section>

        {/* Columna central: métodos y valores */}
        <section className="flex-1 border-r border-slate-800 flex flex-col">
          <div className="flex-1 flex">
            {/* Métodos de pago */}
            <div className="w-60 border-r border-slate-800 p-4 flex flex-col gap-3 bg-slate-950/70">
              <h2 className="text-xs font-semibold text-slate-300 mb-1 uppercase tracking-wide">
                Tipo de pago
              </h2>

              {activePaymentMethods.length === 0 && (
                <p className="text-[11px] text-slate-500">
                  No hay métodos de pago activos.
                </p>
              )}

              {activePaymentMethods.map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleSelectMethod(m.slug)}
                  className={
                    "w-full text-left px-3 py-2.5 rounded-lg text-xs border shadow-inner transition-colors " +
                    (method === m.slug
                      ? "bg-emerald-500 text-slate-950 border-emerald-400 shadow-emerald-500/30"
                      : "bg-slate-900/80 hover:bg-slate-800 border-slate-700 text-slate-200")
                  }
                >
                  {m.name}
                </button>
              ))}
            </div>

            {/* Área de pago */}
            <div className="flex-1 p-8 flex flex-col items-center">
              <div className="w-full max-w-3xl space-y-8">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Pago</h2>
                    <p className="text-xs text-slate-500">
                      Ajusta el monto recibido y agrega notas antes de confirmar.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1 text-slate-300">
                      {selectedMethod?.name ?? "Método"}
                    </span>
                  </div>
                </div>

                <div className="grid gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-inner text-sm">
                  <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                    <span className="text-slate-400">Total</span>
                    <span className="font-semibold text-slate-100">
                      {formatMoney(totalToPay)}
                    </span>
                  </div>
                  <div className="grid grid-cols-[1fr_auto] items-center gap-3">
                    <span className="text-slate-400">Pagado</span>
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
                          "w-52 rounded-xl border px-4 py-3 text-lg bg-slate-900/80 " +
                          "border-slate-700 text-slate-50 outline-none shadow-inner " +
                          "focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/40 " +
                          (!requiresManualAmount ? "opacity-40 cursor-not-allowed" : "")
                        }
                      />
                    </div>
                  </div>
                  {isSeparatedSale && (
                    <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>Método del abono inicial</span>
                        {separatedMethodLabel && (
                          <span className="text-slate-200 font-semibold">
                            {separatedMethodLabel}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Selecciona cómo recibe el pago inicial (efectivo, tarjeta,
                        transferencia, etc.). Este método se imprimirá en el ticket.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {separatedMethodOptions.length === 0 && (
                          <span className="text-[11px] text-red-400">
                            No hay métodos disponibles para registrar el abono.
                          </span>
                        )}
                        {separatedMethodOptions.map((option) => (
                          <button
                            key={option.id ?? option.slug}
                            type="button"
                            onClick={() => setSeparatedPaymentMethod(option.slug)}
                            className={
                              "px-3 py-2 rounded-lg border text-xs transition-colors " +
                              (separatedPaymentMethod === option.slug
                                ? "bg-emerald-500 text-slate-900 border-emerald-400"
                                : "bg-slate-900/80 border-slate-700 hover:border-emerald-400/60")
                            }
                          >
                            {option.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                    <span className="text-slate-400">{displayChangeLabel}</span>
                    <span
                      className={
                        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold " +
                        (allowsChange && displayChange < 0
                          ? "bg-red-500/15 text-red-300 border border-red-500/30"
                          : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30")
                      }
                    >
                      {formatMoney(displayChange)}
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-3 max-w-3xl">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="uppercase tracking-wide text-[11px]">Notas para el ticket</span>
                    <button
                      type="button"
                      onClick={() => setSaleNotes("")}
                      className="text-[11px] text-slate-400 hover:text-slate-200 underline"
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
                        className="px-3 py-1.5 rounded-full border border-slate-700/80 bg-slate-950/70 text-[11px] text-slate-200 hover:border-emerald-400/70 hover:text-emerald-100 transition"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={saleNotes}
                    onChange={(e) => setSaleNotes(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-50 focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-inner"
                    placeholder="Notas de garantía, instrucciones especiales..."
                  />
                </div>
              </div>
              {message && (
                <div className="mt-6 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/40 rounded-md px-3 py-2">
                  {message}
                </div>
              )}

              {error && (
                <div className="mt-3 text-xs text-red-400 bg-red-500/10 border border-red-500/40 rounded-md px-3 py-2">
                  {error}
                </div>
              )}
            </div>
          </div>

          {/* Botones inferiores */}
          <footer className="grid grid-cols-3 gap-5 px-10 py-5 border-t border-slate-800 bg-slate-950/85">
            <button
              type="button"
              onClick={handleCancel}
              className="w-full py-4 rounded-xl bg-red-600 hover:bg-red-700 text-base font-semibold text-slate-50 transition-colors shadow-lg shadow-red-900/30"
            >
              Cancelar
            </button>

            {/* Botón para ir a la pantalla de pagos múltiples (NUEVO) */}
            <button
              type="button"
              onClick={() => router.push("/pos/pago/pago-multiple")}
              className="w-full py-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-base font-semibold text-slate-100 transition-colors border border-slate-600 shadow-inner disabled:opacity-60"
              disabled={!cart.length}
            >
              Pagos múltiples
            </button>

            <button
              type="button"
              onClick={handleConfirm}
              className="w-full py-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-base font-semibold text-slate-950 transition-colors shadow-lg shadow-emerald-900/30 disabled:opacity-50"
              disabled={confirmDisabled}
            >
              Confirmar pago
            </button>
          </footer>
        </section>

        {/* Panel derecho: cliente */}
        <CustomerPanel />
      </div>

      {/* Modal de éxito de venta */}
{successSale && (
  <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm px-4 py-6 overflow-y-auto sm:items-center sm:py-0">

    <div className="w-full max-w-4xl bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl p-10 max-h-[calc(100vh-2rem)] sm:max-h-[90vh] overflow-y-auto">

      {/* ENCABEZADO */}
      <div className="text-center mb-10">
        <p className="text-sm font-semibold text-emerald-400 tracking-wide uppercase">
          Venta registrada correctamente
        </p>
        <h2 className="text-3xl font-bold text-slate-50 mt-1">
          ¡Venta completada con éxito!
        </h2>
        <p className="text-slate-400 mt-2 text-sm">
          Selecciona cómo deseas entregar el recibo al cliente.
        </p>
      </div>

      {/* INFORMACIÓN DEL DOCUMENTO */}
      <div className="mx-auto mb-12 w-full max-w-lg bg-slate-800/40 border border-slate-700 rounded-xl p-6 text-sm space-y-2">
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
        {successSale.surchargeLabel && successSale.surchargeValueDisplay && (
          <div className="flex justify-between py-1 text-amber-300">
            <span>{successSale.surchargeLabel}</span>
            <span className="text-amber-200">
              +{successSale.surchargeValueDisplay}
            </span>
          </div>
        )}
        <div className="flex justify-between py-1">
          <span className="text-slate-400">Total pagado</span>
          <span className="font-semibold text-emerald-400 text-lg">
            {successSale.total.toLocaleString("es-CO")}
          </span>
        </div>
        {successSale.notes && (
          <div className="pt-3 text-left text-slate-300 text-sm">
            <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">
              Notas
            </div>
            <p className="whitespace-pre-line">{successSale.notes}</p>
          </div>
        )}
        {successSale.customer && (
          <div className="pt-3 text-left text-slate-300 text-sm">
            <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">
              Cliente
            </div>
            <p className="font-semibold">{successSale.customer.name}</p>
            {successSale.customer.phone && (
              <p className="text-xs text-slate-400">
                Tel: {successSale.customer.phone}
              </p>
            )}
            {successSale.customer.email && (
              <p className="text-xs text-slate-400">
                Email: {successSale.customer.email}
              </p>
            )}
          </div>
        )}
      </div>

      {/* BOTONES GRANDES — FILA 1 */}
      <div className="grid grid-cols-3 gap-6 mb-6">

        <button
          onClick={() => void handlePrintTicket()}
          className="flex flex-col items-center justify-center p-6 rounded-xl bg-slate-800 hover:bg-slate-700 transition border border-slate-600"
        >
          <div className="text-4xl mb-3">🖨️</div>
          <span className="text-sm font-semibold text-slate-100">
            Imprimir ticket
          </span>
        </button>

        <button
          onClick={handlePrintInvoice}
          className="flex flex-col items-center justify-center p-6 rounded-xl bg-slate-800 hover:bg-slate-700 transition border border-slate-600"
        >
          <div className="text-4xl mb-3">📄</div>
          <span className="text-sm font-semibold text-slate-100">
            Imprimir factura
          </span>
        </button>

        <div className="flex flex-col gap-4">
          <button
            onClick={handleEmailTicket}
            className="flex flex-col items-center justify-center p-4 rounded-xl bg-slate-800 hover:bg-slate-700 transition border border-slate-600"
          >
            <div className="text-3xl mb-2">✉️</div>
            <span className="text-xs font-semibold text-slate-100">
              Enviar ticket
            </span>
          </button>
          <button
            onClick={handleEmailInvoice}
            className="flex flex-col items-center justify-center p-4 rounded-xl bg-slate-800 hover:bg-slate-700 transition border border-slate-600"
          >
            <div className="text-3xl mb-2">✉️</div>
            <span className="text-xs font-semibold text-slate-100">
              Enviar factura
            </span>
          </button>
        </div>

      </div>

      {/* BOTONES GRANDES — FILA 2 */}
      <div className="grid grid-cols-3 gap-6 mb-10">

        <button
          onClick={() => alert('Guardar PDF (pendiente)')}
          className="flex flex-col items-center justify-center p-6 rounded-xl bg-slate-800 hover:bg-slate-700 transition border border-slate-600"
        >
          <div className="text-4xl mb-3">📝</div>
          <span className="text-sm font-semibold text-slate-100">
            Guardar como PDF
          </span>
        </button>

      </div>

      {/* BOTÓN HECHO */}
      <div className="flex justify-end">
        <button
          onClick={handleSuccessDone}
          className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 
                     text-slate-950 font-semibold text-sm shadow-lg transition"
        >
          Hecho (volver al POS)
        </button>
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

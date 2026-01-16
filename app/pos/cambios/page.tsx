"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../providers/AuthProvider";
import { renderChangeTicket } from "@/lib/printing/saleTicket";
import { fetchPosSettings, PosSettingsPayload } from "@/lib/api/settings";
import {
  DEFAULT_PAYMENT_METHODS,
  fetchPaymentMethods,
  type PaymentMethodRecord,
} from "@/lib/api/paymentMethods";
import { getApiBase } from "@/lib/api/base";
import {
  fetchPosStationPrinterConfig,
  getPosStationAccess,
  getWebPosStation,
  getStoredPosMode,
  setStoredPosMode,
  isValidPosMode,
  subscribeToPosStationChanges,
  type PosAccessMode,
  type PosStationAccess,
  type PosStationPrinterConfig,
} from "@/lib/api/posStations";
import { formatBogotaDate } from "@/lib/time/bogota";
import type { Product } from "../poscontext";

type PaymentMethodSlug = string;

type SaleChangeReturnItem = {
  sale_item_id: number;
  quantity: number;
};

type SaleChange = {
  items_returned?: SaleChangeReturnItem[];
};

type SaleReturnItem = {
  sale_item_id: number;
  quantity: number;
};

type SaleReturn = {
  items?: SaleReturnItem[];
};

type SaleItem = {
  id: number;
  product_name?: string;
  name?: string;
  quantity: number;
  total?: number;
  unit_price?: number;
  unit_price_original?: number;
  discount?: number;
  line_discount_value?: number;
};

type Sale = {
  id: number;
  sale_number?: number;
  document_number?: string;
  created_at: string;
  total?: number;
  paid_amount?: number;
  cart_discount_value?: number | null;
  cart_discount_percent?: number | null;
  customer_name?: string | null;
  payment_method?: string | null;
  refunded_total?: number | null;
  refunded_balance?: number | null;
  refund_count?: number | null;
  pos_name?: string | null;
  vendor_name?: string | null;
  station_id?: string | null;
  items: SaleItem[];
  returns?: SaleReturn[];
  changes?: SaleChange[];
};

type ChangeReturnItemDetail = {
  product_name: string;
  product_sku?: string | null;
  quantity: number;
  unit_price_net: number;
  total_credit: number;
};

type ChangeNewItemDetail = {
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

type ChangeNewItem = {
  product: Product;
  quantity: number;
  unitPrice: number;
};

type ChangePayment = {
  method: PaymentMethodSlug;
  amount: string;
};

function normalizeDocument(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function formatMoney(value: number | undefined | null): string {
  if (value == null || Number.isNaN(value)) return "0";
  return value.toLocaleString("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function computeLineBreakdown(item: SaleItem) {
  const quantity = item.quantity ?? 1;
  const unitOriginal = item.unit_price_original ?? item.unit_price ?? null;
  const netFromApi = item.total != null ? item.total : null;
  const discountFromApi = item.line_discount_value ?? item.discount ?? null;

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
  const total = netFromApi != null ? netFromApi : Math.max(0, subtotal - discount);

  return {
    subtotal,
    total,
    unitNet: quantity > 0 ? total / quantity : 0,
  };
}

export default function CambiosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSaleId = searchParams.get("saleId");
  const backTarget = searchParams.get("back");
  const resolvedBackPath = backTarget ? decodeURIComponent(backTarget) : "/pos";
  const resolvedBackLabel = backTarget ? "Volver" : "Volver al POS";
  const encodedBackTarget = backTarget ? encodeURIComponent(backTarget) : null;
  const currentCambiosPath = encodedBackTarget
    ? `/pos/cambios?back=${encodedBackTarget}`
    : "/pos/cambios";

  const [sale, setSale] = useState<Sale | null>(null);
  const [saleError, setSaleError] = useState<string | null>(null);
  const [scanValue, setScanValue] = useState("");
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const scanInputRef = useRef<HTMLInputElement | null>(null);

  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState("");

  const [productCatalog, setProductCatalog] = useState<Product[]>([]);
  const [productScan, setProductScan] = useState("");
  const [newItems, setNewItems] = useState<ChangeNewItem[]>([]);

  const [paymentCatalog, setPaymentCatalog] = useState<PaymentMethodRecord[]>(
    DEFAULT_PAYMENT_METHODS
  );
  const [payments, setPayments] = useState<ChangePayment[]>([]);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [changeSuccess, setChangeSuccess] = useState<SaleChangeDetail | null>(
    null
  );

  const [posSettings, setPosSettings] = useState<PosSettingsPayload | null>(
    null
  );
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

  const { token } = useAuth();
  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : null),
    [token]
  );
  const apiBase = useMemo(() => getApiBase(), []);
  const SALES_API = useMemo(() => `${apiBase}/pos/sales`, [apiBase]);
  const CHANGES_API = useMemo(() => `${apiBase}/pos/changes`, [apiBase]);

  const activePaymentMethods = useMemo(
    () =>
      [...paymentCatalog]
        .filter((m) => m.is_active)
        .sort(
          (a, b) => a.order_index - b.order_index || a.name.localeCompare(b.name)
        ),
    [paymentCatalog]
  );

  const paymentLabels = useMemo(
    () => new Map(paymentCatalog.map((method) => [method.slug, method.name])),
    [paymentCatalog]
  );

  const resolvePaymentLabel = useCallback(
    (method: string) => paymentLabels.get(method) ?? method,
    [paymentLabels]
  );

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
    const existing = document.querySelector(
      'script[data-qz-tray]'
    ) as HTMLScriptElement | null;
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
                throw new Error("La API no devolvio la firma.");
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

  const alreadyReturnedMap = useMemo(() => {
    const map = new Map<number, number>();
    if (sale?.returns) {
      for (const ret of sale.returns) {
        if (!ret.items) continue;
        for (const item of ret.items) {
          map.set(
            item.sale_item_id,
            (map.get(item.sale_item_id) ?? 0) + item.quantity
          );
        }
      }
    }
    if (sale?.changes) {
      for (const change of sale.changes) {
        if (!change.items_returned) continue;
        for (const item of change.items_returned) {
          map.set(
            item.sale_item_id,
            (map.get(item.sale_item_id) ?? 0) + item.quantity
          );
        }
      }
    }
    return map;
  }, [sale]);

  const lineData = useMemo(() => {
    if (!sale) return [];
    return sale.items.map((item) => {
      const breakdown = computeLineBreakdown(item);
      return {
        item,
        subtotal: breakdown.subtotal,
        total: breakdown.total,
        unitNet: breakdown.unitNet,
      };
    });
  }, [sale]);

  const saleNetAfterLine = useMemo(
    () => lineData.reduce((sum, line) => sum + line.total, 0),
    [lineData]
  );

  const selectedNet = useMemo(() => {
    if (!sale) return 0;
    return lineData.reduce((sum, line) => {
      const id = line.item.id;
      if (!id) return sum;
      const qty = Number((quantities[id] ?? "0").replace(/[^\d.]/g, "")) || 0;
      if (!qty) return sum;
      const returned = alreadyReturnedMap.get(id) ?? 0;
      const available = Math.max(0, (line.item.quantity ?? 0) - returned);
      const finalQty = Math.min(qty, available);
      return sum + line.unitNet * finalQty;
    }, 0);
  }, [sale, lineData, quantities, alreadyReturnedMap]);

  const cartDiscountValue = sale?.cart_discount_value ?? 0;
  const estimatedCartShare =
    saleNetAfterLine > 0
      ? (selectedNet / saleNetAfterLine) * cartDiscountValue
      : 0;
  const totalCredit = Math.max(0, selectedNet - estimatedCartShare);

  const totalNew = useMemo(
    () =>
      newItems.reduce(
        (sum, item) => sum + item.quantity * item.unitPrice,
        0
      ),
    [newItems]
  );
  const netDifference = totalNew - totalCredit;
  const extraPayment = Math.max(0, netDifference);
  const refundDue = Math.max(0, -netDifference);

  const totalPayments = useMemo(
    () =>
      payments.reduce(
        (sum, payment) =>
          sum + (Number(payment.amount.replace(/[^\d.]/g, "")) || 0),
        0
      ),
    [payments]
  );

  useEffect(() => {
    if (extraPayment <= 0) {
      setPayments([]);
      return;
    }
    if (payments.length === 0) {
      setPayments([{ method: "cash", amount: extraPayment.toString() }]);
      return;
    }
    if (payments.length === 1) {
      setPayments((prev) => [
        { ...prev[0], amount: extraPayment.toString() },
      ]);
    }
  }, [extraPayment, payments.length]);

  const fetchSaleById = useCallback(
    async (id: string) => {
      if (!authHeaders) throw new Error("Sesion expirada.");
      const res = await fetch(`${SALES_API}/${id}`, {
        headers: authHeaders,
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Venta no encontrada.");
      }
      return (await res.json()) as Sale;
    },
    [authHeaders, SALES_API]
  );

  const findSaleByIdentifier = useCallback(
    async (identifier: string) => {
      const value = identifier.trim();
      if (!value) return null;
      const digitsOnly = value.replace(/[^\d]/g, "");
      const normalizedDoc = normalizeDocument(value);
      if (normalizedDoc.startsWith("DV") || normalizedDoc.startsWith("CB")) {
        throw new Error("Ese codigo no corresponde a una venta.");
      }
      if (!authHeaders) throw new Error("Sesion expirada.");
      const res = await fetch(`${SALES_API}?skip=0&limit=400`, {
        headers: authHeaders,
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("No se pudieron consultar las ventas.");
      }
      const list: Sale[] = await res.json();
      const saleFromList =
        list.find((s) => {
          const saleDocNormalized = normalizeDocument(s.document_number ?? "");
          if (
            saleDocNormalized &&
            normalizedDoc &&
            saleDocNormalized === normalizedDoc
          ) {
            return true;
          }
          if (digitsOnly && `${s.sale_number ?? ""}` === digitsOnly) {
            return true;
          }
          return false;
        }) ?? null;
      if (saleFromList) return saleFromList;
      if (digitsOnly) {
        try {
          const saleById = await fetchSaleById(digitsOnly);
          return saleById;
        } catch (err) {
          console.warn("No se encontro la venta por ID", err);
        }
      }
      return null;
    },
    [SALES_API, authHeaders, fetchSaleById]
  );

  const resetFormState = useCallback(() => {
    setQuantities({});
    setNotes("");
    setPayments([]);
    setSubmitError(null);
    setNewItems([]);
  }, []);

  const clearSelection = useCallback(() => {
    setSale(null);
    resetFormState();
  }, [resetFormState]);

  const applyLoadedSale = useCallback(
    (loadedSale: Sale) => {
      setSaleError(null);
      resetFormState();
      setSale(loadedSale);
      return true;
    },
    [resetFormState]
  );

  const handleLoadSale = useCallback(
    async (identifier: string, fallbackSale?: Sale) => {
      if (!authHeaders) {
        setSaleError("Sesion expirada, inicia sesion nuevamente.");
        return;
      }
      const value = identifier.trim();
      if (!value) return;
      setSaleError(null);
      try {
        const loadedSale = await fetchSaleById(value);
        applyLoadedSale(loadedSale);
      } catch (err) {
        console.error(err);
        if (fallbackSale) {
          applyLoadedSale(fallbackSale);
        } else {
          setSaleError(
            err instanceof Error ? err.message : "Error al cargar la venta."
          );
        }
      }
    },
    [applyLoadedSale, authHeaders, fetchSaleById]
  );

  const handleScanSubmit = useCallback(
    async (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const value = scanValue.trim();
      if (!value) {
        setScanError("Ingresa un numero de venta o documento.");
        return;
      }
      setScanLoading(true);
      setScanError(null);
      try {
        const saleFromList = await findSaleByIdentifier(value);
        if (!saleFromList) {
          throw new Error("Venta no encontrada.");
        }
        applyLoadedSale(saleFromList);
        await handleLoadSale(saleFromList.id.toString(), saleFromList);
      } catch (err) {
        console.error(err);
        setScanError(
          err instanceof Error ? err.message : "No se pudo cargar la venta."
        );
      } finally {
        setScanLoading(false);
      }
    },
    [
      applyLoadedSale,
      findSaleByIdentifier,
      handleLoadSale,
      scanValue,
    ]
  );

  useEffect(() => {
    if (scanLoading) return;
    if (scanInputRef.current) {
      scanInputRef.current.focus();
      scanInputRef.current.select();
    }
  }, [scanLoading]);

  const handleQuantityChange = (itemId: number, value: string) => {
    setQuantities((prev) => ({ ...prev, [itemId]: value }));
  };

  const handleAddProduct = (product: Product) => {
    setNewItems((prev) => {
      const existing = prev.find((entry) => entry.product.id === product.id);
      if (existing) {
        return prev.map((entry) =>
          entry.product.id === product.id
            ? { ...entry, quantity: entry.quantity + 1 }
            : entry
        );
      }
      return [
        ...prev,
        { product, quantity: 1, unitPrice: product.price },
      ];
    });
  };

  const handleProductScan = (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const value = productScan.trim().toLowerCase();
    if (!value) return;
    const product =
      productCatalog.find(
        (item) =>
          item.barcode?.toLowerCase() === value ||
          item.sku?.toLowerCase() === value
      ) ??
      productCatalog.find((item) =>
        item.name.toLowerCase().includes(value)
      );
    if (!product) {
      setProductScan("");
      return;
    }
    handleAddProduct(product);
    setProductScan("");
  };

  const handleNewItemQuantityChange = (
    productId: number,
    value: string
  ) => {
    const qty = Number(value.replace(/[^\d.]/g, "")) || 0;
    setNewItems((prev) =>
      prev.map((entry) =>
        entry.product.id === productId
          ? { ...entry, quantity: Math.max(0, qty) }
          : entry
      )
    );
  };

  const handleRemoveNewItem = (productId: number) => {
    setNewItems((prev) => prev.filter((entry) => entry.product.id !== productId));
  };

  const handlePaymentChange = (
    index: number,
    field: "method" | "amount",
    value: string
  ) => {
    setPayments((prev) =>
      prev.map((entry, idx) =>
        idx === index ? { ...entry, [field]: value } : entry
      )
    );
  };

  const handleAddPaymentRow = () => {
    const defaultMethod = activePaymentMethods[0]?.slug ?? "cash";
    setPayments((prev) => [...prev, { method: defaultMethod, amount: "0" }]);
  };

  const handleRemovePaymentRow = (index: number) => {
    setPayments((prev) => prev.filter((_, idx) => idx !== index));
  };

  const canSubmit =
    !!sale &&
    totalCredit > 0 &&
    totalNew > 0 &&
    (extraPayment <= 0 || Math.abs(totalPayments - extraPayment) < 0.01);

  const handleSubmitChange = useCallback(async () => {
    if (!sale) return;
    if (!token) {
      setSubmitError("Sesion expirada, inicia sesion nuevamente.");
      return;
    }
    if (totalCredit <= 0) {
      setSubmitError("Selecciona al menos un producto devuelto.");
      return;
    }
    if (totalNew <= 0) {
      setSubmitError("Agrega al menos un producto nuevo.");
      return;
    }
    if (extraPayment > 0 && Math.abs(totalPayments - extraPayment) > 0.01) {
      setSubmitError("El excedente debe coincidir con la suma de pagos.");
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      const itemsPayload = lineData
        .map((line) => {
          const id = line.item.id;
          if (!id) return null;
          const qty =
            Number((quantities[id] ?? "0").replace(/[^\d.]/g, "")) || 0;
          if (!qty) return null;
          const returned = alreadyReturnedMap.get(id) ?? 0;
          const available = Math.max(0, (line.item.quantity ?? 0) - returned);
          const finalQty = Math.min(qty, available);
          if (finalQty <= 0) return null;
          return { sale_item_id: id, quantity: finalQty };
        })
        .filter((item): item is { sale_item_id: number; quantity: number } => !!item);

      const newItemsPayload = newItems
        .filter((entry) => entry.quantity > 0)
        .map((entry) => ({
          product_id: entry.product.id,
          quantity: entry.quantity,
        }));

      const paymentsPayload =
        extraPayment > 0
          ? payments.map((payment) => ({
              method: payment.method,
              amount: Number(payment.amount.replace(/[^\d.]/g, "")) || 0,
            }))
          : [];

      const res = await fetch(CHANGES_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({
          sale_id: sale.id,
          notes: notes.trim() || undefined,
          return_items: itemsPayload,
          new_items: newItemsPayload,
          payments: paymentsPayload.length > 0 ? paymentsPayload : undefined,
        }),
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(
          detail?.detail ?? `Error ${res.status} al registrar el cambio.`
        );
      }

      const data = (await res.json()) as SaleChangeDetail;
      setChangeSuccess(data);
    } catch (err) {
      console.error(err);
      setSubmitError(
        err instanceof Error ? err.message : "No se pudo registrar el cambio."
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    CHANGES_API,
    alreadyReturnedMap,
    extraPayment,
    lineData,
    newItems,
    notes,
    payments,
    quantities,
    sale,
    token,
    totalCredit,
    totalNew,
    totalPayments,
  ]);

  const handlePrintChangeTicket = useCallback(async () => {
    if (!changeSuccess) return;
    const itemsReturned = changeSuccess.items_returned.map((item) => ({
      name: item.product_name,
      quantity: item.quantity,
      unitPrice: item.unit_price_net,
      total: item.total_credit,
      sku: item.product_sku ?? undefined,
    }));
    const itemsNew = changeSuccess.items_new.map((item) => ({
      name: item.product_name,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      total: item.total,
      sku: item.product_sku ?? undefined,
    }));
    const paymentsTicket = (changeSuccess.payments ?? []).map((payment) => ({
      label: resolvePaymentLabel(payment.method),
      amount: payment.amount,
    }));
    const html = renderChangeTicket({
      settings: posSettings,
      documentNumber:
        changeSuccess.document_number ??
        `CB-${changeSuccess.id.toString().padStart(6, "0")}`,
      originalDocumentNumber: sale?.document_number ?? null,
      createdAt: changeSuccess.created_at ?? null,
      posName: sale?.pos_name ?? undefined,
      sellerName: sale?.vendor_name ?? changeSuccess.created_by ?? undefined,
      itemsReturned,
      itemsNew,
      payments: paymentsTicket,
      totalCredit: changeSuccess.total_credit ?? 0,
      totalNew: changeSuccess.total_new ?? 0,
      extraPayment: changeSuccess.extra_payment ?? 0,
      refundDue: changeSuccess.refund_due ?? 0,
      notes: changeSuccess.notes,
    });

    const shouldUseQz = printerConfig.mode === "qz-tray";
    const sizeWidth = printerConfig.width === "58mm" ? 58 : 80;

    const printWithQz = async () => {
      if (!qzClient) return false;
      try {
        if (!qzClient.websocket.isActive()) {
          await qzClient.websocket.connect();
        }
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

    if (shouldUseQz && printerConfig.printerName.trim()) {
      const printed = await printWithQz();
      if (printed) return;
    }

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
  }, [
    changeSuccess,
    posSettings,
    printerConfig,
    qzClient,
    resolvePaymentLabel,
    sale,
  ]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    const loadSettings = async () => {
      try {
        const settings = await fetchPosSettings(token);
        if (active) setPosSettings(settings);
      } catch (err) {
        console.warn("No se pudieron cargar ajustes POS", err);
      }
    };
    const loadPayments = async () => {
      try {
        const methods = await fetchPaymentMethods(token);
        if (active) setPaymentCatalog(methods);
      } catch (err) {
        console.warn("No se pudieron cargar metodos de pago", err);
      }
    };
    loadSettings();
    loadPayments();
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const loadProducts = async () => {
      try {
        const res = await fetch(`${apiBase}/products/`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });
        if (!res.ok) throw new Error("No se pudieron cargar productos");
        const data = (await res.json()) as Product[];
        if (!cancelled) {
          setProductCatalog(data.filter((product) => product.active));
        }
      } catch (err) {
        console.warn("No se pudo cargar el catalogo", err);
      }
    };
    loadProducts();
    return () => {
      cancelled = true;
    };
  }, [apiBase, token]);

  useEffect(() => {
    let resolvedMode: PosAccessMode | null = null;
    const storedMode = getStoredPosMode();
    if (storedMode && isValidPosMode(storedMode)) {
      resolvedMode = storedMode;
    }
    if (!resolvedMode) {
      resolvedMode = getPosStationAccess() ? "station" : "web";
    }
    setStoredPosMode(resolvedMode);
    setPosMode(resolvedMode);
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

  useEffect(() => {
    let cancelled = false;
    if (!token) return;
    if (!stationInfo?.id && posMode !== "web") return;
    const stationId = stationInfo?.id ?? "";
    const isStationMode = posMode === "station";
    if (!isStationMode || !stationId) return;
    const printerStorageKey = `kensar_pos_printer_${stationId}`;
    const loadRemote = async () => {
      try {
        const remote = await fetchPosStationPrinterConfig(
          apiBase,
          token,
          stationId
        );
        if (cancelled) return;
        if (remote) {
          setPrinterConfig({
            mode: remote.mode ?? "qz-tray",
            printerName: remote.printerName ?? "",
            width: remote.width ?? "80mm",
            autoOpenDrawer: remote.autoOpenDrawer ?? false,
            showDrawerButton: remote.showDrawerButton ?? true,
          });
          return;
        }
        const raw = window.localStorage.getItem(printerStorageKey);
        if (!raw) return;
        const parsed = JSON.parse(raw) as PosStationPrinterConfig;
        setPrinterConfig(parsed);
      } catch (err) {
        console.warn("No se pudo cargar la impresora guardada", err);
      }
    };
    loadRemote();
    return () => {
      cancelled = true;
    };
  }, [apiBase, token, posMode, stationInfo]);

  useEffect(() => {
    if (!initialSaleId || !authHeaders) return;
    void handleLoadSale(initialSaleId);
  }, [authHeaders, handleLoadSale, initialSaleId]);

  const paymentMismatch = extraPayment > 0 && Math.abs(totalPayments - extraPayment) > 0.01;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 px-6 py-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">
              Cambios
            </p>
            <h1 className="text-2xl font-semibold text-white">
              Gestiona cambios de productos
            </h1>
            <p className="text-sm text-slate-400">
              Escanea el ticket y confirma el cambio antes de imprimir.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push(resolvedBackPath)}
            className="h-12 px-4 rounded-xl border border-slate-700 bg-slate-900/70 text-slate-100 hover:bg-slate-800"
          >
            {resolvedBackLabel}
          </button>
        </header>

        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-slate-400">
                  Paso 1
                </p>
                <h2 className="text-lg font-semibold text-slate-100">
                  Selecciona la venta
                </h2>
              </div>
              {sale && (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="h-10 rounded-full border border-slate-700 bg-slate-900/80 px-4 text-sm font-semibold text-slate-100 hover:bg-slate-800"
                >
                  Cambiar venta
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const params = new URLSearchParams();
                  params.set("returnTo", "/pos/cambios");
                  params.set("back", currentCambiosPath);
                  params.set("origin", resolvedBackPath);
                  router.push(`/pos/historial?${params.toString()}`);
                }}
                className="flex-1 h-12 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-semibold"
              >
                Abrir historial
              </button>
              <button
                type="button"
                onClick={() => {
                  const params = new URLSearchParams();
                  params.set("back", currentCambiosPath);
                  router.push(`/pos/documentos?${params.toString()}`);
                }}
                className="flex-1 h-12 rounded-lg border border-slate-600 text-sm text-slate-200 hover:bg-slate-800"
              >
                Ver documentos
              </button>
            </div>

            <form onSubmit={handleScanSubmit} className="flex gap-2">
              <input
                type="text"
                value={scanValue}
                onChange={(e) => setScanValue(e.target.value)}
                placeholder="Escanea o escribe: V-000021"
                className="flex-1 h-12 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                ref={scanInputRef}
              />
              <button
                type="submit"
                disabled={scanLoading}
                className="h-12 px-5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {scanLoading ? "Buscando..." : "Cargar"}
              </button>
            </form>
            {(scanError || saleError) && (
              <p className="text-xs text-red-400">{scanError ?? saleError}</p>
            )}

            <div className="rounded-xl border border-slate-800/60 bg-slate-950/30 p-4 text-sm text-slate-200 space-y-2">
              <div className="text-xs uppercase tracking-wide text-slate-400">
                Venta seleccionada
              </div>
              {sale ? (
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Venta</span>
                    <span className="font-mono text-slate-100">
                      #{sale.sale_number ?? sale.id}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Documento</span>
                    <span className="font-mono text-slate-100">
                      {sale.document_number ?? "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Fecha</span>
                    <span className="text-slate-100">
                      {formatBogotaDate(sale.created_at, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Total</span>
                    <span className="font-semibold text-slate-100">
                      {formatMoney(sale.total)}
                    </span>
                  </div>
                  {sale.customer_name && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Cliente</span>
                      <span className="text-slate-100">
                        {sale.customer_name}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  Escanea un ticket para continuar.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-slate-400">
                  Paso 2
                </p>
                <h2 className="text-lg font-semibold text-slate-100">
                  Selecciona productos a devolver
                </h2>
              </div>
              <div className="text-sm text-slate-400">
                Credito:{" "}
                <span className="text-emerald-300 font-semibold">
                  {formatMoney(totalCredit)}
                </span>
              </div>
            </div>

            {!sale ? (
              <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-6 text-sm text-slate-500">
                Debes seleccionar una venta para continuar.
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-4 space-y-3 max-h-[300px] overflow-y-auto">
                {sale.items.map((item) => {
                  const id = item.id;
                  const returned = alreadyReturnedMap.get(id) ?? 0;
                  const available = Math.max(0, (item.quantity ?? 0) - returned);
                  const currentQty =
                    Number(
                      (quantities[id] ?? "0").replace(/[^\d.]/g, "")
                    ) || 0;
                  const nextQty = Math.min(available, currentQty + 1);
                  const prevQty = Math.max(0, currentQty - 1);
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-4 border-b border-slate-800/60 pb-3"
                    >
                      <div>
                        <div className="text-sm font-semibold text-slate-100">
                          {item.product_name ?? item.name ?? "Producto"}
                        </div>
                        <div className="text-xs text-slate-400">
                          Disponible: {available} de {item.quantity}
                        </div>
                      </div>
                      {available <= 1 ? (
                        <button
                          type="button"
                          onClick={() =>
                            handleQuantityChange(
                              id,
                              currentQty === 1 ? "0" : "1"
                            )
                          }
                          disabled={available === 0}
                          className={`h-11 rounded-xl border px-6 text-sm font-semibold ${
                            currentQty === 1
                              ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                              : "border-slate-700 bg-slate-950 text-slate-200"
                          } disabled:opacity-50`}
                        >
                          {currentQty === 1 ? "✓ Devolver" : "Devolver"}
                        </button>
                      ) : (
                        <div className="h-11 grid grid-cols-[46px_1fr_46px] items-center rounded-xl border border-slate-700 bg-slate-950 text-slate-100">
                          <button
                            type="button"
                            onClick={() =>
                              handleQuantityChange(id, prevQty.toString())
                            }
                            className="h-full text-2xl font-semibold hover:bg-slate-800"
                          >
                            −
                          </button>
                          <div className="text-center text-lg font-semibold">
                            {currentQty}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              handleQuantityChange(id, nextQty.toString())
                            }
                            className="h-full text-2xl font-semibold hover:bg-slate-800"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="border-t border-slate-800/70 pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-widest text-slate-400">
                    Paso 3
                  </p>
                  <h2 className="text-lg font-semibold text-slate-100">
                    Agrega productos nuevos
                  </h2>
                </div>
                <div className="text-sm text-slate-400">
                  Total nuevo:{" "}
                  <span className="text-emerald-300 font-semibold">
                    {formatMoney(totalNew)}
                  </span>
                </div>
              </div>

              <form onSubmit={handleProductScan} className="flex gap-2">
                <input
                  type="text"
                  value={productScan}
                  onChange={(e) => setProductScan(e.target.value)}
                  placeholder="Escanea codigo o escribe nombre"
                  className="flex-1 h-12 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="submit"
                  className="h-12 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-semibold"
                >
                  Agregar
                </button>
              </form>

              {newItems.length > 0 && (
                <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-4 space-y-3">
                  <div className="text-xs uppercase tracking-wide text-slate-400">
                    Productos seleccionados
                  </div>
                  {newItems.map((entry) => (
                    <div
                      key={entry.product.id}
                      className="flex items-center justify-between gap-4 border-b border-slate-800/60 pb-3"
                    >
                      <div>
                        <div className="text-sm font-semibold text-slate-100">
                          {entry.product.name}
                        </div>
                        <div className="text-xs text-slate-400">
                          {formatMoney(entry.unitPrice)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-10 grid grid-cols-[40px_1fr_40px] items-center rounded-xl border border-slate-700 bg-slate-950 text-slate-100">
                          <button
                            type="button"
                            onClick={() =>
                              handleNewItemQuantityChange(
                                entry.product.id,
                                Math.max(0, entry.quantity - 1).toString()
                              )
                            }
                            className="h-full text-xl font-semibold hover:bg-slate-800"
                          >
                            −
                          </button>
                          <div className="text-center text-sm font-semibold">
                            {entry.quantity}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              handleNewItemQuantityChange(
                                entry.product.id,
                                (entry.quantity + 1).toString()
                              )
                            }
                            className="h-full text-xl font-semibold hover:bg-slate-800"
                          >
                            +
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveNewItem(entry.product.id)}
                          className="px-3 h-10 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-slate-800/70 pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-widest text-slate-400">
                    Paso 4
                  </p>
                  <h2 className="text-lg font-semibold text-slate-100">
                    Confirma el cambio
                  </h2>
                </div>
                <div className="text-sm text-slate-400">
                  Diferencia:{" "}
                  <span
                    className={`font-semibold ${
                      extraPayment > 0 ? "text-emerald-300" : "text-rose-300"
                    }`}
                  >
                    {formatMoney(netDifference)}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Credito</span>
                  <span className="text-slate-100">
                    {formatMoney(totalCredit)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Total nuevo</span>
                  <span className="text-slate-100">
                    {formatMoney(totalNew)}
                  </span>
                </div>
                {extraPayment > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Excedente a cobrar</span>
                    <span className="text-emerald-300 font-semibold">
                      {formatMoney(extraPayment)}
                    </span>
                  </div>
                )}
                {refundDue > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Saldo a devolver (efectivo)</span>
                    <span className="text-rose-300 font-semibold">
                      {formatMoney(refundDue)}
                    </span>
                  </div>
                )}
              </div>

              {extraPayment > 0 && (
                <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-4 space-y-3">
                  <div className="text-xs uppercase tracking-wide text-slate-400">
                    Pagos del excedente
                  </div>
                  {payments.map((payment, index) => (
                    <div key={`${payment.method}-${index}`} className="flex gap-2">
                      <select
                        value={payment.method}
                        onChange={(e) =>
                          handlePaymentChange(index, "method", e.target.value)
                        }
                        className="flex-1 h-10 rounded-lg border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100"
                      >
                        {activePaymentMethods.map((method) => (
                          <option key={method.id} value={method.slug}>
                            {method.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={payment.amount}
                        onChange={(e) =>
                          handlePaymentChange(index, "amount", e.target.value)
                        }
                        className="w-32 h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 text-right"
                      />
                      {payments.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemovePaymentRow(index)}
                          className="px-3 h-10 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
                        >
                          —
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Total pagos</span>
                    <span>{formatMoney(totalPayments)}</span>
                  </div>
                  {paymentMismatch && (
                    <p className="text-xs text-rose-300">
                      La suma de pagos debe igualar el excedente.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={handleAddPaymentRow}
                    className="h-10 rounded-lg border border-slate-700 text-sm text-slate-200 hover:bg-slate-800"
                  >
                    Agregar metodo
                  </button>
                </div>
              )}

              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Notas del cambio (opcional)"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100"
              />

              {submitError && (
                <p className="text-xs text-rose-300">{submitError}</p>
              )}

              <button
                type="button"
                onClick={() => void handleSubmitChange()}
                disabled={!canSubmit || submitting}
                className="h-12 w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Registrando..." : "Confirmar cambio"}
              </button>
            </div>
          </section>
        </div>
      </div>

      {changeSuccess && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-30 px-4">
          <div className="bg-slate-900 rounded-3xl border border-slate-700 px-8 py-7 w-full max-w-xl space-y-4 shadow-2xl text-center">
            <div className="text-emerald-300 text-sm uppercase tracking-[0.3em]">
              Cambio registrado
            </div>
            <h2 className="text-2xl font-semibold text-white">
              {changeSuccess.document_number ??
                `CB-${changeSuccess.id.toString().padStart(6, "0")}`}
            </h2>
            <div className="grid gap-2 text-sm text-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-400">Credito</span>
                <span>{formatMoney(changeSuccess.total_credit)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total nuevo</span>
                <span>{formatMoney(changeSuccess.total_new)}</span>
              </div>
              {changeSuccess.extra_payment > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Excedente cobrado</span>
                  <span className="text-emerald-300 font-semibold">
                    {formatMoney(changeSuccess.extra_payment)}
                  </span>
                </div>
              )}
              {changeSuccess.refund_due > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Saldo devuelto (efectivo)</span>
                  <span className="text-rose-300 font-semibold">
                    {formatMoney(changeSuccess.refund_due)}
                  </span>
                </div>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => void handlePrintChangeTicket()}
                className="flex-1 h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold"
              >
                Imprimir ticket de cambio
              </button>
              <button
                type="button"
                onClick={() => {
                  setChangeSuccess(null);
                  clearSelection();
                }}
                className="flex-1 h-12 rounded-xl border border-slate-700 text-slate-200 hover:bg-slate-800"
              >
                Nuevo cambio
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setChangeSuccess(null);
                router.push("/pos");
              }}
              className="w-full h-11 rounded-xl text-slate-300 hover:bg-slate-800"
            >
              Volver al POS
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

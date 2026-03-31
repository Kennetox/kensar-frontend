"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/app/providers/AuthProvider";
import { getApiBase } from "@/lib/api/base";
import {
  convertComercioWebOrderToSale,
  fetchComercioWebOrders,
  recordComercioWebPayment,
  type ComercioWebOrder,
  type ComercioWebOrderPayment,
  type ComercioWebPaymentStatus,
  type ComercioWebOrderStatus,
  updateComercioWebOrderStatus,
} from "@/lib/api/comercioWeb";
import {
  fetchComercioWebCatalogPublicationsPage,
  fetchComercioWebCatalogProducts,
  updateComercioWebCatalogProduct,
  type ComercioWebCatalogPublicationStats,
  type ComercioWebCatalogProduct,
  type ComercioWebCatalogProductUpdate,
} from "@/lib/api/comercioWebCatalog";
import {
  defaultRolePermissions,
  fetchRolePermissions,
  type RolePermissionModule,
} from "@/lib/api/settings";

type CommerceTab = "overview" | "catalog" | "orders" | "payments" | "customers";

type PaymentRow = {
  paymentId: number;
  orderId: number;
  orderDocument: string;
  customerName: string;
  customerEmail: string;
  method: string;
  provider: string;
  amount: number;
  status: string;
  createdAt: string;
};

type CustomerRow = {
  key: string;
  name: string;
  email: string;
  phone: string;
  orders: number;
  total: number;
  approved: number;
  converted: number;
  lastOrderAt: string;
};

type CatalogEditorState = {
  web_name: string;
  web_slug: string;
  web_category_key: string;
  web_published: boolean;
  web_featured: boolean;
  web_short_description: string;
  web_long_description: string;
  web_compare_price: string;
  web_price_source: "base" | "fixed" | "discount_percent";
  web_price_value: string;
  web_badge_text: string;
  web_sort_order: string;
  web_visible_when_out_of_stock: boolean;
  web_price_mode: "visible" | "consultar";
  web_whatsapp_message: string;
  image_url: string;
  image_thumb_url: string;
  web_gallery_urls: string[];
};

type InlineToast = {
  id: number;
  message: string;
  tone: "success" | "error";
};

type CatalogComposerMode = "create" | "edit";

type UploadProductImageResponse = {
  url: string;
  thumb_url: string | null;
};

type CatalogTableAction = "edit" | "publish_toggle" | "feature_toggle" | "delete";

type CatalogActionConfirmState = {
  product: ComercioWebCatalogProduct;
  action: CatalogTableAction;
} | null;

const COMMERCE_WEB_ACTIVE_TAB_STORAGE_KEY = "commerce_web_active_tab";

const WEB_CATEGORY_OPTIONS = [
  { value: "audio-profesional", label: "Audio profesional" },
  { value: "instrumentos", label: "Instrumentos" },
  { value: "microfonos", label: "Microfonos" },
  { value: "accesorios", label: "Accesorios" },
  { value: "camaras", label: "Camaras" },
] as const;

const TABS: Array<{ id: CommerceTab; label: string }> = [
  { id: "overview", label: "Resumen" },
  { id: "catalog", label: "Catálogo Web" },
  { id: "orders", label: "Órdenes" },
  { id: "payments", label: "Pagos" },
  { id: "customers", label: "Clientes" },
];

function isCommerceTab(value: string): value is CommerceTab {
  return TABS.some((tab) => tab.id === value);
}

const ORDER_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Todos los estados" },
  { value: "pending_payment", label: "Pendiente de pago" },
  { value: "paid", label: "Pagada" },
  { value: "processing", label: "En proceso" },
  { value: "ready", label: "Lista" },
  { value: "fulfilled", label: "Entregada" },
  { value: "payment_failed", label: "Pago fallido" },
  { value: "cancelled", label: "Cancelada" },
];

const PAYMENT_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Todos los pagos" },
  { value: "pending", label: "Pendiente" },
  { value: "approved", label: "Aprobado" },
  { value: "failed", label: "Fallido" },
  { value: "cancelled", label: "Cancelado" },
  { value: "refunded", label: "Reembolsado" },
];

const SHORT_DESCRIPTION_MAX_CHARS = 96;
const CATALOG_TABLE_PAGE_SIZE = 50;
const EMPTY_CATALOG_STATS: ComercioWebCatalogPublicationStats = {
  configured: 0,
  published: 0,
  featured: 0,
  discounted: 0,
  consult: 0,
};

const OPERATIVE_STATUS_OPTIONS: Array<{
  value: ComercioWebOrderStatus;
  label: string;
}> = [
  { value: "processing", label: "Mover a proceso" },
  { value: "ready", label: "Marcar lista" },
  { value: "fulfilled", label: "Marcar entregada" },
  { value: "cancelled", label: "Cancelar orden" },
];

const emptyCatalogEditorState: CatalogEditorState = {
  web_name: "",
  web_slug: "",
  web_category_key: "",
  web_published: false,
  web_featured: false,
  web_short_description: "",
  web_long_description: "",
  web_compare_price: "",
  web_price_source: "base",
  web_price_value: "",
  web_badge_text: "",
  web_sort_order: "0",
  web_visible_when_out_of_stock: true,
  web_price_mode: "visible",
  web_whatsapp_message: "",
  image_url: "",
  image_thumb_url: "",
  web_gallery_urls: [],
};

function formatMoney(value: number): string {
  return value.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });
}

function formatDateTime(value?: string | null): string {
  if (!value) return "No disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No disponible";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "approved":
    case "paid":
    case "ready":
    case "fulfilled":
      return "border-emerald-300 bg-emerald-50 text-emerald-700";
    case "processing":
      return "border-sky-300 bg-sky-50 text-sky-700";
    case "pending":
    case "pending_payment":
      return "border-amber-300 bg-amber-50 text-amber-700";
    case "failed":
    case "payment_failed":
    case "cancelled":
    case "refunded":
      return "border-rose-300 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function sumApprovedPayments(order: ComercioWebOrder): number {
  return order.payments
    .filter((payment) => payment.status === "approved")
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
}

function getPrimaryContact(order: ComercioWebOrder): string {
  return order.customer_phone || order.customer_email || "Sin contacto";
}

function getCatalogDisplayName(product: ComercioWebCatalogProduct): string {
  return product.web_name?.trim() || product.name;
}

function normalizeSlugBase(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function generateSuggestedSlug(value: string): string {
  const normalized = normalizeSlugBase(value);
  if (!normalized) return "";
  return normalized.slice(0, 60).replace(/-+$/g, "");
}

function hasVisibleDiscount(product: ComercioWebCatalogProduct): boolean {
  const webSalePrice = resolveWebSalePriceFromProduct(product);
  return (
    product.web_price_mode === "visible" &&
    typeof product.web_compare_price === "number" &&
    product.web_compare_price > webSalePrice
  );
}

function isConfiguredWebPublication(product: ComercioWebCatalogProduct): boolean {
  return (
    product.web_published ||
    product.web_featured ||
    Boolean(product.web_name?.trim()) ||
    Boolean(product.web_category_key?.trim()) ||
    Boolean(product.web_short_description?.trim()) ||
    Boolean(product.web_long_description?.trim()) ||
    Boolean(product.web_badge_text?.trim()) ||
    typeof product.web_compare_price === "number" ||
    product.web_price_source !== "base" ||
    typeof product.web_price_value === "number" ||
    (product.web_gallery_urls?.length ?? 0) > 0 ||
    product.web_price_mode === "consultar" ||
    product.web_visible_when_out_of_stock === false ||
    Boolean(product.web_whatsapp_message?.trim()) ||
    Number(product.web_sort_order || 0) > 0
  );
}

function resolveWebSalePrice(
  basePrice: number,
  source?: "base" | "fixed" | "discount_percent" | null,
  value?: number | string | null
): number {
  const normalizedSource = source || "base";
  const numericValue =
    typeof value === "string"
      ? normalizedSource === "discount_percent"
        ? Number(value.replace(/[^\d,.-]/g, "").replace(",", ".") || "0")
        : Number(value.replace(/[^\d]/g, "") || "0")
      : Number(value ?? 0);
  if (normalizedSource === "fixed") {
    return Math.max(0, Number.isFinite(numericValue) ? numericValue : 0);
  }
  if (normalizedSource === "discount_percent") {
    const safeDiscount = Math.min(100, Math.max(0, Number.isFinite(numericValue) ? numericValue : 0));
    return Math.max(0, basePrice * (1 - safeDiscount / 100));
  }
  return Math.max(0, basePrice);
}

function resolveWebSalePriceFromProduct(product: ComercioWebCatalogProduct): number {
  return resolveWebSalePrice(product.price, product.web_price_source, product.web_price_value);
}

function formatThousandsWithDots(value: string): string {
  const digitsOnly = value.replace(/[^\d]/g, "");
  if (!digitsOnly) return "";
  return Number(digitsOnly).toLocaleString("es-CO");
}

function parseThousandsWithDots(value: string): number | null {
  const digitsOnly = value.replace(/[^\d]/g, "");
  if (!digitsOnly) return null;
  return Number(digitsOnly);
}

function parseDiscountPercent(value?: string | number | null): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return Math.min(100, Math.max(0, value));
  }
  const raw = String(value ?? "")
    .replace(/[^\d,.-]/g, "")
    .replace(",", ".")
    .trim();
  if (!raw) return null;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return null;
  return Math.min(100, Math.max(0, numeric));
}

function getDiscountBadgeText(percent: number | null): string | null {
  if (percent === null || percent <= 0) return null;
  const formatted = Number.isInteger(percent) ? String(percent) : percent.toFixed(1).replace(/\.0$/, "");
  return `Descuento ${formatted}%`;
}

function getDiscountBadgeTextFromProduct(product: ComercioWebCatalogProduct): string | null {
  if (product.web_price_mode !== "visible" || product.web_price_source !== "discount_percent") {
    return null;
  }
  return getDiscountBadgeText(parseDiscountPercent(product.web_price_value));
}

function getDiscountBadgeTextFromEditor(editor: CatalogEditorState): string | null {
  if (editor.web_price_mode !== "visible" || editor.web_price_source !== "discount_percent") {
    return null;
  }
  return getDiscountBadgeText(parseDiscountPercent(editor.web_price_value));
}

function getWebCategoryLabel(value?: string | null): string {
  return (
    WEB_CATEGORY_OPTIONS.find((item) => item.value === (value || "").trim().toLowerCase())?.label || ""
  );
}

function buildEditorState(product: ComercioWebCatalogProduct | null): CatalogEditorState {
  if (!product) return emptyCatalogEditorState;
  const galleryUrls = product.web_gallery_urls ?? [];
  return {
    web_name: product.web_name || product.name || "",
    web_slug: product.web_slug || generateSuggestedSlug(product.web_name || product.name || ""),
    web_category_key: product.web_category_key || "",
    web_published: Boolean(product.web_published),
    web_featured: Boolean(product.web_featured),
    web_short_description: product.web_short_description || "",
    web_long_description: product.web_long_description || "",
    web_compare_price:
      typeof product.web_compare_price === "number"
        ? Number(product.web_compare_price).toLocaleString("es-CO")
        : "",
    web_price_source: product.web_price_source || "base",
    web_price_value:
      typeof product.web_price_value === "number"
        ? (product.web_price_source || "base") === "discount_percent"
          ? String(product.web_price_value)
          : Number(product.web_price_value).toLocaleString("es-CO")
        : "",
    web_badge_text: product.web_badge_text || "",
    web_sort_order: String(product.web_sort_order ?? 0),
    web_visible_when_out_of_stock: Boolean(product.web_visible_when_out_of_stock),
    web_price_mode: product.web_price_mode || "visible",
    web_whatsapp_message: product.web_whatsapp_message || "",
    image_url: product.image_url || "",
    image_thumb_url: product.image_thumb_url || "",
    web_gallery_urls:
      galleryUrls.length
        ? galleryUrls.slice(0, 3)
        : [product.image_url, product.image_thumb_url].filter(
            (value, index, list): value is string =>
              Boolean(value?.trim()) && list.indexOf(value) === index
          ),
  };
}

function MetricCard({
  label,
  value,
  tone = "default",
  hint,
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "danger";
  hint?: string;
}) {
  const toneClasses =
    tone === "success"
      ? "text-emerald-600"
      : tone === "warning"
        ? "text-amber-600"
        : tone === "danger"
          ? "text-rose-600"
          : "text-slate-900";
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${toneClasses}`}>{value}</p>
      {hint ? <p className="mt-1.5 text-[11px] text-slate-500">{hint}</p> : null}
    </article>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export default function ComercioWebPage() {
  const { token, user } = useAuth();
  const [activeTab, setActiveTab] = useState<CommerceTab>(() => {
    if (typeof window === "undefined") return "overview";
    const stored = window.sessionStorage.getItem(COMMERCE_WEB_ACTIVE_TAB_STORAGE_KEY);
    if (stored && isCommerceTab(stored)) return stored;
    return "overview";
  });

  const [orders, setOrders] = useState<ComercioWebOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [publishedCatalogProducts, setPublishedCatalogProducts] = useState<
    ComercioWebCatalogProduct[]
  >([]);
  const [publishedCatalogTotal, setPublishedCatalogTotal] = useState(0);
  const [catalogMetrics, setCatalogMetrics] =
    useState<ComercioWebCatalogPublicationStats>(EMPTY_CATALOG_STATS);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogSearchTerm, setCatalogSearchTerm] = useState("");
  const [catalogSearchResults, setCatalogSearchResults] = useState<ComercioWebCatalogProduct[]>([]);
  const [catalogSearching, setCatalogSearching] = useState(false);
  const [catalogSearchExecuted, setCatalogSearchExecuted] = useState(false);
  const [publishedCatalogFilter, setPublishedCatalogFilter] = useState("");
  const [publishedCatalogFieldFilter, setPublishedCatalogFieldFilter] = useState("all");
  const [publishedCatalogStatusFilter, setPublishedCatalogStatusFilter] = useState("all");
  const [publishedCatalogFeaturedFilter, setPublishedCatalogFeaturedFilter] = useState("all");
  const [publishedCatalogBadgeFilter, setPublishedCatalogBadgeFilter] = useState("all");
  const [publishedCatalogPage, setPublishedCatalogPage] = useState(1);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [catalogComposerOpen, setCatalogComposerOpen] = useState(false);
  const [catalogComposerMode, setCatalogComposerMode] = useState<CatalogComposerMode>("create");
  const [catalogEditor, setCatalogEditor] = useState<CatalogEditorState>(emptyCatalogEditorState);
  const [previewImageIndex, setPreviewImageIndex] = useState(0);
  const [catalogDirty, setCatalogDirty] = useState(false);
  const [catalogSaving, setCatalogSaving] = useState(false);
  const [catalogImageUploading, setCatalogImageUploading] = useState(false);
  const [catalogSavePublishPromptOpen, setCatalogSavePublishPromptOpen] = useState(false);
  const [catalogActionConfirm, setCatalogActionConfirm] = useState<CatalogActionConfirmState>(null);
  const [catalogActionSubmitting, setCatalogActionSubmitting] = useState(false);
  const [toast, setToast] = useState<InlineToast | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<{ hide?: number; remove?: number }>({});
  const catalogImageInputRef = useRef<HTMLInputElement | null>(null);

  const [roleModules, setRoleModules] = useState<RolePermissionModule[]>(defaultRolePermissions);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(COMMERCE_WEB_ACTIVE_TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    fetchRolePermissions(token)
      .then((modules) => {
        if (active) setRoleModules(modules);
      })
      .catch(() => {
        if (active) setRoleModules(defaultRolePermissions);
      });
    return () => {
      active = false;
    };
  }, [token]);

  const commerceModule = useMemo(
    () => roleModules.find((module) => module.id === "commerce_web"),
    [roleModules]
  );

  const canManage = useMemo(() => {
    if (!user || !commerceModule) return false;
    const action = commerceModule.actions.find((item) => item.id === "commerce_web.manage");
    if (action) return Boolean(action.roles[user.role as keyof typeof action.roles]);
    return Boolean(commerceModule.roles[user.role as keyof typeof commerceModule.roles]);
  }, [commerceModule, user]);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedId) ?? null,
    [orders, selectedId]
  );

  const selectedProduct = useMemo(
    () =>
      publishedCatalogProducts.find((product) => product.id === selectedProductId) ??
      catalogSearchResults.find((product) => product.id === selectedProductId) ??
      null,
    [catalogSearchResults, publishedCatalogProducts, selectedProductId]
  );

  const resolveAssetUrl = useCallback((url?: string | null) => {
    if (!url) return null;
    try {
      return new URL(url, getApiBase()).toString();
    } catch {
      return url;
    }
  }, []);

  const publishedCatalogTotalPages = useMemo(
    () => Math.max(1, Math.ceil(publishedCatalogTotal / CATALOG_TABLE_PAGE_SIZE)),
    [publishedCatalogTotal]
  );
  const publishedCatalogStartIndex = publishedCatalogTotal
    ? (publishedCatalogPage - 1) * CATALOG_TABLE_PAGE_SIZE + 1
    : 0;
  const publishedCatalogEndIndex =
    publishedCatalogStartIndex === 0
      ? 0
      : Math.min(
          publishedCatalogStartIndex + publishedCatalogProducts.length - 1,
          publishedCatalogTotal
        );

  useEffect(() => {
    setPublishedCatalogPage(1);
  }, [
    publishedCatalogFilter,
    publishedCatalogFieldFilter,
    publishedCatalogStatusFilter,
    publishedCatalogFeaturedFilter,
    publishedCatalogBadgeFilter,
  ]);

  useEffect(() => {
    if (publishedCatalogPage > publishedCatalogTotalPages) {
      setPublishedCatalogPage(publishedCatalogTotalPages);
    }
  }, [publishedCatalogPage, publishedCatalogTotalPages]);

  const previewGalleryImages = useMemo(() => {
    const candidates = [
      ...(catalogEditor.web_gallery_urls ?? []),
      catalogEditor.image_url,
      catalogEditor.image_thumb_url,
    ];
    const unique = candidates.filter(
      (value, index, list): value is string =>
        Boolean(value?.trim()) && list.indexOf(value) === index
    );
    return unique
      .map((value) => resolveAssetUrl(value) || value)
      .filter((value): value is string => Boolean(value));
  }, [
    catalogEditor.image_thumb_url,
    catalogEditor.image_url,
    catalogEditor.web_gallery_urls,
    resolveAssetUrl,
  ]);

  useEffect(() => {
    setCatalogEditor(buildEditorState(selectedProduct));
    setCatalogDirty(false);
  }, [selectedProduct]);

  useEffect(() => {
    setPreviewImageIndex(0);
  }, [selectedProductId]);

  useEffect(() => {
    setPreviewImageIndex((prev) => {
      if (!previewGalleryImages.length) return 0;
      return Math.min(prev, previewGalleryImages.length - 1);
    });
  }, [previewGalleryImages.length]);

  const clearToastTimers = useCallback(() => {
    const timers = toastTimerRef.current;
    if (timers.hide) window.clearTimeout(timers.hide);
    if (timers.remove) window.clearTimeout(timers.remove);
  }, []);

  const showToast = useCallback((message: string, tone: InlineToast["tone"] = "success") => {
    clearToastTimers();

    const toastId = Date.now();
    setToast({ id: toastId, message, tone });
    setToastVisible(true);

    toastTimerRef.current.hide = window.setTimeout(() => setToastVisible(false), 2600);
    toastTimerRef.current.remove = window.setTimeout(() => {
      setToast((current) => (current?.id === toastId ? null : current));
    }, 3000);
  }, [clearToastTimers]);

  useEffect(() => {
    return () => {
      clearToastTimers();
    };
  }, [clearToastTimers]);

  const resetCatalogComposer = useCallback(() => {
    setCatalogComposerOpen(false);
    setCatalogComposerMode("create");
    setSelectedProductId(null);
    setCatalogSearchTerm("");
    setCatalogSearchResults([]);
    setCatalogSearchExecuted(false);
    setCatalogError(null);
    setCatalogDirty(false);
  }, []);

  const openCatalogComposer = useCallback((productId?: number) => {
    setCatalogComposerOpen(true);
    setCatalogError(null);
    if (typeof productId === "number") {
      setCatalogComposerMode("edit");
      setSelectedProductId(productId);
      return;
    }
    setCatalogComposerMode("create");
    setSelectedProductId(null);
    setCatalogSearchTerm("");
    setCatalogSearchResults([]);
    setCatalogSearchExecuted(false);
    setCatalogDirty(false);
  }, []);

  const paymentRows = useMemo<PaymentRow[]>(
    () =>
      orders
        .flatMap((order) =>
          order.payments.map((payment) => ({
            paymentId: payment.id,
            orderId: order.id,
            orderDocument: order.document_number || `Orden #${order.id}`,
            customerName: order.customer_name || "Cliente web",
            customerEmail: order.customer_email || "Sin correo",
            method: payment.method || "Sin método",
            provider: payment.provider || "Sin proveedor",
            amount: Number(payment.amount || 0),
            status: payment.status,
            createdAt: payment.created_at,
          }))
        )
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [orders]
  );

  const customerRows = useMemo<CustomerRow[]>(() => {
    const map = new Map<string, CustomerRow>();
    for (const order of orders) {
      const key = order.customer_email || order.customer_phone || `account-${order.account_id}`;
      const approved = sumApprovedPayments(order);
      const current = map.get(key) ?? {
        key,
        name: order.customer_name || "Cliente web",
        email: order.customer_email || "Sin correo",
        phone: order.customer_phone || "Sin teléfono",
        orders: 0,
        total: 0,
        approved: 0,
        converted: 0,
        lastOrderAt: order.created_at,
      };
      current.orders += 1;
      current.total += Number(order.total || 0);
      current.approved += approved;
      current.converted += order.sale_id ? 1 : 0;
      if (new Date(order.created_at).getTime() > new Date(current.lastOrderAt).getTime()) {
        current.lastOrderAt = order.created_at;
      }
      map.set(key, current);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [orders]);

  const orderMetrics = useMemo(() => {
    const pendingPayment = orders.filter((order) => order.status === "pending_payment").length;
    const paid = orders.filter((order) => order.payment_status === "approved").length;
    const readyToConvert = orders.filter(
      (order) => order.payment_status === "approved" && order.sale_id == null
    ).length;
    const converted = orders.filter((order) => order.sale_id != null).length;
    const inFulfillment = orders.filter((order) =>
      ["processing", "ready"].includes(order.status)
    ).length;
    const total = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const approvedAmount = orders.reduce((sum, order) => sum + sumApprovedPayments(order), 0);
    return {
      pendingPayment,
      paid,
      readyToConvert,
      converted,
      inFulfillment,
      total,
      approvedAmount,
    };
  }, [orders]);

  const pendingPaymentOrders = useMemo(
    () => orders.filter((order) => order.status === "pending_payment").slice(0, 6),
    [orders]
  );
  const readyToConvertOrders = useMemo(
    () =>
      orders
        .filter((order) => order.payment_status === "approved" && order.sale_id == null)
        .slice(0, 6),
    [orders]
  );
  const fulfillmentQueue = useMemo(
    () => orders.filter((order) => ["processing", "ready"].includes(order.status)).slice(0, 6),
    [orders]
  );

  const loadOrders = useCallback(async () => {
    if (!token) return;
    try {
      setLoadingOrders(true);
      setOrderError(null);
      const rows = await fetchComercioWebOrders(token, {
        status: status || undefined,
        payment_status: paymentStatus || undefined,
        search: search.trim() || undefined,
        limit: 120,
      });
      setOrders(rows);
      setSelectedId((prev) => prev ?? rows[0]?.id ?? null);
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : "No se pudo cargar Comercio Web");
    } finally {
      setLoadingOrders(false);
    }
  }, [paymentStatus, search, status, token]);

  const loadCatalogProducts = useCallback(async () => {
    if (!token) return;
    try {
      setCatalogLoading(true);
      setCatalogError(null);
      const page = await fetchComercioWebCatalogPublicationsPage(token, {
        q: publishedCatalogFilter.trim() || undefined,
        field:
          publishedCatalogFieldFilter === "all"
            ? undefined
            : (publishedCatalogFieldFilter as "name" | "sku" | "brand" | "group" | "badge"),
        status_filter:
          publishedCatalogStatusFilter === "all"
            ? undefined
            : (publishedCatalogStatusFilter as "featured" | "discounted" | "consult"),
        featured_filter:
          publishedCatalogFeaturedFilter === "all"
            ? undefined
            : (publishedCatalogFeaturedFilter as "featured" | "standard"),
        badge_filter:
          publishedCatalogBadgeFilter === "all"
            ? undefined
            : (publishedCatalogBadgeFilter as "with_badge" | "without_badge"),
        skip: (publishedCatalogPage - 1) * CATALOG_TABLE_PAGE_SIZE,
        limit: CATALOG_TABLE_PAGE_SIZE,
      });

      setPublishedCatalogProducts(page.items);
      setPublishedCatalogTotal(page.total);
      setCatalogMetrics(page.stats);
      setSelectedProductId((prev) => {
        if (prev && page.items.some((product) => product.id === prev)) {
          return prev;
        }
        return null;
      });
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : "No se pudo cargar el catálogo web");
    } finally {
      setCatalogLoading(false);
    }
  }, [
    publishedCatalogBadgeFilter,
    publishedCatalogFeaturedFilter,
    publishedCatalogFieldFilter,
    publishedCatalogFilter,
    publishedCatalogPage,
    publishedCatalogStatusFilter,
    token,
  ]);

  const searchCatalogProducts = useCallback(async () => {
    if (!token) return;
    const term = catalogSearchTerm.trim();
    if (!term) {
      setCatalogSearchResults([]);
      setCatalogSearchExecuted(false);
      return;
    }
    try {
      setCatalogSearching(true);
      setCatalogError(null);
      const rows = await fetchComercioWebCatalogProducts(token, {
        q: term,
        limit: 40,
      });
      setCatalogSearchResults(rows);
      setCatalogSearchExecuted(true);
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : "No se pudo buscar en la base maestra");
    } finally {
      setCatalogSearching(false);
    }
  }, [catalogSearchTerm, token]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    if (activeTab !== "catalog") return;
    const timer = window.setTimeout(() => {
      void loadCatalogProducts();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [activeTab, loadCatalogProducts]);

  async function handleApprovePayment(order: ComercioWebOrder) {
    if (!token) return;
    const remaining = Math.max(0, Number(order.total || 0) - sumApprovedPayments(order));
    if (remaining <= 0) return;
    try {
      setBusyAction(`pay-${order.id}`);
      const updated = await recordComercioWebPayment(token, order.id, {
        method: "online",
        amount: remaining,
        provider: "manual_backoffice",
        status: "approved" as ComercioWebPaymentStatus,
        note: "Pago aprobado manualmente desde Comercio Web",
      });
      setOrders((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedId(updated.id);
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : "No se pudo registrar el pago");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleStatusUpdate(order: ComercioWebOrder, nextStatus: ComercioWebOrderStatus) {
    if (!token) return;
    try {
      setBusyAction(`status-${order.id}-${nextStatus}`);
      const updated = await updateComercioWebOrderStatus(token, order.id, {
        status: nextStatus,
        note: `Estado actualizado a ${nextStatus} desde Comercio Web`,
      });
      setOrders((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedId(updated.id);
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : "No se pudo cambiar el estado");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleConvert(order: ComercioWebOrder) {
    if (!token) return;
    try {
      setBusyAction(`convert-${order.id}`);
      const updated = await convertComercioWebOrderToSale(token, order.id, {
        note: "Conversión iniciada desde el módulo Comercio Web",
      });
      setOrders((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedId(updated.id);
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : "No se pudo convertir la orden");
    } finally {
      setBusyAction(null);
    }
  }

  function handleCatalogField<K extends keyof CatalogEditorState>(
    key: K,
    value: CatalogEditorState[K]
  ) {
    setCatalogEditor((prev) => ({ ...prev, [key]: value }));
    setCatalogDirty(true);
  }

  function applyCatalogGalleryOrder(nextGallery: string[]) {
    setCatalogEditor((prev) => ({
      ...prev,
      web_gallery_urls: nextGallery,
      image_url: nextGallery[0] || "",
      image_thumb_url: nextGallery[0] || "",
    }));
    setCatalogDirty(true);
  }

  function moveCatalogGalleryImage(fromIndex: number, toIndex: number) {
    const current = [...(catalogEditor.web_gallery_urls ?? [])];
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= current.length ||
      toIndex >= current.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const [moved] = current.splice(fromIndex, 1);
    current.splice(toIndex, 0, moved);
    applyCatalogGalleryOrder(current);
  }

  function setCatalogGalleryPrimary(index: number) {
    moveCatalogGalleryImage(index, 0);
  }

  async function handleCatalogImageFileChange(file: File) {
    const galleryUrls = catalogEditor.web_gallery_urls ?? [];
    if (!token) {
      showToast("Debes iniciar sesión para subir la imagen.", "error");
      return;
    }
    if (galleryUrls.length >= 3) {
      showToast("Solo puedes cargar hasta 3 imágenes por publicación.", "error");
      return;
    }

    setCatalogImageUploading(true);
    setCatalogError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const uploadRes = await fetch(`${getApiBase()}/uploads/product-images`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: formData,
      });

      if (!uploadRes.ok) {
        const data = await uploadRes.json().catch(() => null);
        const msg =
          (data && (data.detail as string)) ||
          `Error al subir imagen (código ${uploadRes.status})`;
        throw new Error(msg);
      }

      const data: UploadProductImageResponse = await uploadRes.json();
      setCatalogEditor((prev) => ({
        ...prev,
        web_gallery_urls: [...(prev.web_gallery_urls ?? []), data.url].filter(
          (value, index, list) => Boolean(value?.trim()) && list.indexOf(value) === index
        ).slice(0, 3),
        image_url: (prev.web_gallery_urls ?? []).length > 0 ? (prev.web_gallery_urls ?? [])[0] : data.url,
        image_thumb_url:
          (prev.web_gallery_urls ?? []).length > 0
            ? (prev.web_gallery_urls ?? [])[0]
            : data.thumb_url || data.url,
      }));
      setCatalogDirty(true);
      showToast("Imagen cargada con éxito.");
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : "No se pudo subir la imagen");
      showToast("No se pudo subir la imagen.", "error");
    } finally {
      setCatalogImageUploading(false);
      if (catalogImageInputRef.current) catalogImageInputRef.current.value = "";
    }
  }

  async function handleSaveCatalogProduct(overridePublished?: boolean) {
    if (!token || !selectedProduct) return;
    if (!catalogEditor.web_category_key.trim()) {
      setCatalogError("Debes elegir una categoría web para la publicación.");
      showToast("Debes elegir una categoría web.", "error");
      return;
    }
    const parsedComparePrice = parseThousandsWithDots(catalogEditor.web_compare_price);
    const autoComparePrice =
      catalogEditor.web_price_mode === "visible" &&
      catalogEditor.web_price_source === "discount_percent" &&
      parsedComparePrice === null
        ? selectedProduct.price
        : parsedComparePrice;

    const payload: ComercioWebCatalogProductUpdate = {
      web_name: catalogEditor.web_name.trim() || undefined,
      web_slug: catalogEditor.web_slug.trim() || undefined,
      web_category_key: catalogEditor.web_category_key.trim() || undefined,
      web_published:
        typeof overridePublished === "boolean" ? overridePublished : catalogEditor.web_published,
      web_featured: catalogEditor.web_featured,
      web_short_description:
        catalogEditor.web_short_description.trim().slice(0, SHORT_DESCRIPTION_MAX_CHARS) || undefined,
      web_long_description: catalogEditor.web_long_description.trim() || undefined,
      web_compare_price: autoComparePrice,
      web_price_source: catalogEditor.web_price_source,
      web_price_value:
        catalogEditor.web_price_source === "base"
          ? null
          : catalogEditor.web_price_source === "discount_percent"
            ? catalogEditor.web_price_value.trim()
              ? Number(catalogEditor.web_price_value.replace(",", "."))
              : null
            : parseThousandsWithDots(catalogEditor.web_price_value),
      web_badge_text: catalogEditor.web_badge_text.trim() || undefined,
      web_sort_order: Number(catalogEditor.web_sort_order || "0"),
      web_visible_when_out_of_stock: catalogEditor.web_visible_when_out_of_stock,
      web_price_mode: catalogEditor.web_price_mode,
      web_whatsapp_message: catalogEditor.web_whatsapp_message.trim() || undefined,
      image_url: catalogEditor.image_url.trim() || undefined,
      image_thumb_url: catalogEditor.image_thumb_url.trim() || undefined,
      web_gallery_urls: catalogEditor.web_gallery_urls,
    };
    try {
      setCatalogSaving(true);
      setCatalogError(null);
      const updated = await updateComercioWebCatalogProduct(token, selectedProduct.id, payload);
      setPublishedCatalogProducts((prev) => {
        const exists = prev.some((row) => row.id === updated.id);
        const include = isConfiguredWebPublication(updated);
        if (exists && include) return prev.map((row) => (row.id === updated.id ? updated : row));
        if (exists && !include) return prev.filter((row) => row.id !== updated.id);
        if (!exists && include) return [updated, ...prev];
        return prev;
      });
      setCatalogSearchResults((prev) =>
        prev.map((row) => (row.id === updated.id ? updated : row))
      );
      resetCatalogComposer();
      showToast(
        updated.web_published
          ? "Publicación guardada y publicada con éxito."
          : "Publicación guardada con éxito."
      );
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : "No se pudo guardar el producto");
      showToast("No se pudo guardar la publicación.", "error");
    } finally {
      setCatalogSaving(false);
    }
  }

  function shouldPromptPublishOnSave() {
    return catalogComposerMode === "create" && !catalogEditor.web_published;
  }

  async function updateCatalogRow(
    product: ComercioWebCatalogProduct,
    payload: ComercioWebCatalogProductUpdate
  ) {
    if (!token || !canManage) return null;
    const updated = await updateComercioWebCatalogProduct(token, product.id, payload);
    setPublishedCatalogProducts((prev) => {
      const exists = prev.some((row) => row.id === updated.id);
      const include = isConfiguredWebPublication(updated);
      if (exists && include) return prev.map((row) => (row.id === updated.id ? updated : row));
      if (exists && !include) return prev.filter((row) => row.id !== updated.id);
      if (!exists && include) return [updated, ...prev];
      return prev;
    });
    setCatalogSearchResults((prev) =>
      prev.map((row) => (row.id === updated.id ? updated : row))
    );
    if (selectedProductId === updated.id) {
      setSelectedProductId(updated.id);
    }
    return updated;
  }

  async function handleDeleteCatalogProduct(product: ComercioWebCatalogProduct) {
    if (!token || !canManage) return;
    setCatalogError(null);
    await updateComercioWebCatalogProduct(token, product.id, {
      active: false,
      web_published: false,
      web_featured: false,
    });
    setPublishedCatalogProducts((prev) => prev.filter((row) => row.id !== product.id));
    setCatalogSearchResults((prev) => prev.filter((row) => row.id !== product.id));
    if (selectedProductId === product.id) {
      setSelectedProductId(null);
    }
  }

  function getCatalogActionMeta(state: CatalogActionConfirmState) {
    if (!state) return null;
    const { action, product } = state;
    if (action === "edit") {
      return {
        title: "Confirmar edición",
        description: `¿Abrir el editor comercial para "${getCatalogDisplayName(product)}"?`,
        confirmLabel: "Abrir editor",
      };
    }
    if (action === "publish_toggle") {
      return product.web_published
        ? {
            title: "Confirmar pausa",
            description: "Esta publicación dejará de verse en el sitio, pero seguirá en esta tabla.",
            confirmLabel: "Pausar publicación",
          }
        : {
            title: "Confirmar activación",
            description: "Esta publicación volverá a verse en el sitio.",
            confirmLabel: "Activar publicación",
          };
    }
    if (action === "feature_toggle") {
      return product.web_featured
        ? {
            title: "Quitar destacado",
            description: "El producto seguirá publicado, pero sin la marca de destacado.",
            confirmLabel: "Quitar destacado",
          }
        : {
            title: "Marcar como destacado",
            description: "El producto quedará marcado como destacado en la vitrina.",
            confirmLabel: "Destacar",
          };
    }
    return {
      title: "Eliminar publicación",
      description:
        "Esta acción quitará el producto de esta tabla y lo desactivará para la operación web.",
      confirmLabel: "Eliminar",
    };
  }

  async function handleConfirmCatalogAction() {
    if (!catalogActionConfirm || !token || !canManage) return;
    const { action, product } = catalogActionConfirm;

    try {
      setCatalogActionSubmitting(true);
      setCatalogError(null);

      if (action === "edit") {
        openCatalogComposer(product.id);
        setCatalogActionConfirm(null);
        return;
      }

      if (action === "publish_toggle") {
        await updateCatalogRow(product, { web_published: !product.web_published });
        showToast(
          product.web_published ? "Publicación pausada con éxito." : "Publicación activada con éxito."
        );
        setCatalogActionConfirm(null);
        return;
      }

      if (action === "feature_toggle") {
        await updateCatalogRow(product, { web_featured: !product.web_featured });
        showToast(
          product.web_featured ? "Destacado removido con éxito." : "Producto destacado con éxito."
        );
        setCatalogActionConfirm(null);
        return;
      }

      await handleDeleteCatalogProduct(product);
      showToast("Publicación eliminada con éxito.");
      setCatalogActionConfirm(null);
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : "No se pudo completar la acción");
      showToast("No se pudo completar la acción solicitada.", "error");
    } finally {
      setCatalogActionSubmitting(false);
    }
  }

  async function handlePublishFromSearch(product: ComercioWebCatalogProduct) {
    if (!token || !canManage) return;
    try {
      setCatalogError(null);
      await updateCatalogRow(product, { web_published: true });
      showToast(
        product.web_published
          ? "La publicación ya estaba activa."
          : "Publicación activada con éxito."
      );
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : "No se pudo publicar el producto");
      showToast("No se pudo activar la publicación.", "error");
    }
  }

  const selectedRemaining = selectedOrder
    ? Math.max(0, Number(selectedOrder.total || 0) - sumApprovedPayments(selectedOrder))
    : 0;
  const catalogActionMeta = getCatalogActionMeta(catalogActionConfirm);

  return (
    <main className="flex-1 min-h-screen bg-slate-50 px-4 py-4 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-[88rem] space-y-4">
        <section className="px-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-semibold leading-none text-slate-900">
              Comercio Web
            </h1>
            <p className="text-sm leading-none text-slate-600">
              Publicación, órdenes, pagos y operación del canal online.
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-current={activeTab === tab.id ? "page" : undefined}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  activeTab === tab.id
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        {activeTab === "overview" ? (
          <section className="space-y-4">
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <MetricCard
                label="Pendientes de pago"
                value={String(orderMetrics.pendingPayment)}
                tone="warning"
              />
              <MetricCard label="Pagadas" value={String(orderMetrics.paid)} tone="success" />
              <MetricCard
                label="Publicadas web"
                value={String(catalogMetrics.published)}
                hint={`${catalogMetrics.featured} destacadas`}
              />
              <MetricCard
                label="Con descuento visible"
                value={String(catalogMetrics.discounted)}
                hint={`${catalogMetrics.consult} en modo consultar`}
              />
              <MetricCard
                label="Valor OW visible"
                value={formatMoney(orderMetrics.total)}
                hint={`Aprobado: ${formatMoney(orderMetrics.approvedAmount)}`}
              />
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid gap-2 lg:grid-cols-[1.4fr,1fr,1fr,auto,auto]">
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") setSearch(searchInput);
                  }}
                  placeholder="Buscar por OW, cliente, correo o teléfono"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                />
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none"
                >
                  {ORDER_STATUS_OPTIONS.map((item) => (
                    <option key={item.value || "all"} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <select
                  value={paymentStatus}
                  onChange={(event) => setPaymentStatus(event.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none"
                >
                  {PAYMENT_STATUS_OPTIONS.map((item) => (
                    <option key={item.value || "all"} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setSearch(searchInput)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-400"
                >
                  Aplicar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void loadOrders();
                  }}
                  className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                  Refrescar
                </button>
              </div>
              {orderError ? <p className="mt-2 text-sm text-rose-600">{orderError}</p> : null}
            </section>

          <section className="grid gap-4 xl:grid-cols-[1.15fr,0.85fr]">
            <div className="space-y-6">
              <SectionCard
                title="Cola operativa"
                subtitle="Lo que el equipo debe resolver hoy dentro del canal web."
              >
                <div className="grid gap-4 md:grid-cols-3">
                  <SummaryBox
                    title="Por cobrar"
                    value={pendingPaymentOrders.length}
                    caption="Órdenes aún sin pago aprobado."
                    tone="warning"
                  />
                  <SummaryBox
                    title="Por convertir"
                    value={readyToConvertOrders.length}
                    caption="Pago aprobado, falta ticket V."
                    tone="info"
                  />
                  <SummaryBox
                    title="En fulfillment"
                    value={fulfillmentQueue.length}
                    caption="Órdenes en proceso o listas."
                    tone="success"
                  />
                </div>
              </SectionCard>

              <SectionCard
                title="Pendientes inmediatos"
                subtitle="Una vista táctica para iniciar operación sin revisar orden por orden."
              >
                <div className="space-y-5">
                  <QueueList
                    title="Cobros pendientes"
                    emptyMessage="No hay cobros pendientes."
                    orders={pendingPaymentOrders}
                    onSelect={setSelectedId}
                    onJump={() => setActiveTab("orders")}
                    highlight="warning"
                  />
                  <QueueList
                    title="Órdenes listas para convertir"
                    emptyMessage="No hay órdenes con pago aprobado pendientes de ticket."
                    orders={readyToConvertOrders}
                    onSelect={setSelectedId}
                    onJump={() => setActiveTab("orders")}
                    highlight="info"
                  />
                  <QueueList
                    title="Fulfillment activo"
                    emptyMessage="No hay órdenes en preparación o listas para entrega."
                    orders={fulfillmentQueue}
                    onSelect={setSelectedId}
                    onJump={() => setActiveTab("orders")}
                    highlight="success"
                  />
                </div>
              </SectionCard>
            </div>

            <div className="space-y-6">
              <SectionCard
                title="Distribución documental"
                subtitle="Cómo se mueve el canal web dentro del flujo operativo."
              >
                <div className="space-y-3">
                  <DistributionRow
                    label="Pendiente de pago"
                    count={orders.filter((order) => order.status === "pending_payment").length}
                    total={orders.length}
                    color="bg-amber-500"
                  />
                  <DistributionRow
                    label="Pagada"
                    count={orders.filter((order) => order.status === "paid").length}
                    total={orders.length}
                    color="bg-emerald-500"
                  />
                  <DistributionRow
                    label="En proceso"
                    count={orders.filter((order) => order.status === "processing").length}
                    total={orders.length}
                    color="bg-sky-500"
                  />
                  <DistributionRow
                    label="Lista"
                    count={orders.filter((order) => order.status === "ready").length}
                    total={orders.length}
                    color="bg-violet-500"
                  />
                  <DistributionRow
                    label="Entregada"
                    count={orders.filter((order) => order.status === "fulfilled").length}
                    total={orders.length}
                    color="bg-slate-700"
                  />
                </div>
              </SectionCard>

              <SectionCard
                title="Salud del catálogo"
                subtitle="Estado comercial del subconjunto publicado en tienda."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <MetricCard label="Publicados" value={String(catalogMetrics.published)} />
                  <MetricCard label="Destacados" value={String(catalogMetrics.featured)} />
                  <MetricCard label="Con descuento" value={String(catalogMetrics.discounted)} />
                  <MetricCard label="Solo consultar" value={String(catalogMetrics.consult)} />
                </div>
              </SectionCard>
            </div>
          </section>
          </section>
        ) : null}

        {activeTab === "catalog" ? (
          <section className="space-y-4">
          <section className={`grid gap-4 ${catalogComposerOpen ? "" : "xl:grid-cols-[0.95fr,1.05fr]"}`}>
            {!catalogComposerOpen ? (
            <SectionCard
              title="Catálogo de publicación"
              subtitle="Consulta el resumen comercial de lo que ya está visible en tienda."
            >
              <div className="grid gap-4 xl:grid-cols-[1fr,auto]">
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Publicados ahora
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    Aquí ves únicamente el subconjunto activo en tienda. La búsqueda y el editor
                    aparecen cuando inicias el flujo de creación.
                  </p>
                  <div className="mt-4 grid gap-4 md:grid-cols-4">
                    <SummaryMini label="Publicados" value={catalogMetrics.published} />
                    <SummaryMini label="Destacados" value={catalogMetrics.featured} />
                    <SummaryMini label="Descuento" value={catalogMetrics.discounted} />
                    <SummaryMini label="Consultar" value={catalogMetrics.consult} />
                  </div>
                </div>

                <div className="flex w-full flex-col gap-3 xl:items-end">
                  <div className="flex w-full flex-wrap items-end justify-end gap-2.5">
                    <div className="flex flex-1 flex-wrap items-end gap-2.5 xl:flex-nowrap">
                        <label className="block">
                          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Buscar
                          </span>
                          <input
                            value={publishedCatalogFilter}
                            onChange={(event) => setPublishedCatalogFilter(event.target.value)}
                            placeholder="Nombre, SKU, marca, grupo o badge"
                            className="w-full min-w-[13rem] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Campo
                          </span>
                          <select
                            value={publishedCatalogFieldFilter}
                            onChange={(event) => setPublishedCatalogFieldFilter(event.target.value)}
                            className="w-full min-w-[9rem] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                          >
                            <option value="all">Todo</option>
                            <option value="name">Nombre</option>
                            <option value="sku">SKU</option>
                            <option value="brand">Marca</option>
                            <option value="group">Grupo</option>
                            <option value="badge">Badge</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Estado
                          </span>
                          <select
                            value={publishedCatalogStatusFilter}
                            onChange={(event) => setPublishedCatalogStatusFilter(event.target.value)}
                            className="w-full min-w-[9rem] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                          >
                            <option value="all">Todas</option>
                            <option value="featured">Con destaque</option>
                            <option value="discounted">Con descuento</option>
                            <option value="consult">Modo consultar</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Destacado
                          </span>
                          <select
                            value={publishedCatalogFeaturedFilter}
                            onChange={(event) => setPublishedCatalogFeaturedFilter(event.target.value)}
                            className="w-full min-w-[9rem] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                          >
                            <option value="all">Todos</option>
                            <option value="featured">Solo destacados</option>
                            <option value="standard">No destacados</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Badge
                          </span>
                          <select
                            value={publishedCatalogBadgeFilter}
                            onChange={(event) => setPublishedCatalogBadgeFilter(event.target.value)}
                            className="w-full min-w-[9rem] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                          >
                            <option value="all">Todos</option>
                            <option value="with_badge">Con badge</option>
                            <option value="without_badge">Sin badge</option>
                          </select>
                        </label>
                    </div>

                    <div className="flex flex-wrap items-end justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPublishedCatalogFilter("");
                          setPublishedCatalogFieldFilter("all");
                          setPublishedCatalogStatusFilter("all");
                          setPublishedCatalogFeaturedFilter("all");
                          setPublishedCatalogBadgeFilter("all");
                        }}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                      >
                        Limpiar filtros
                      </button>
                      <button
                        type="button"
                        disabled={!canManage}
                        onClick={() => openCatalogComposer()}
                        className="rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed"
                        style={{
                          backgroundColor: canManage ? "#2563eb" : "#bfdbfe",
                          borderColor: canManage ? "#1d4ed8" : "#93c5fd",
                          color: canManage ? "#ffffff" : "#1e3a8a",
                        }}
                      >
                        + Crear publicación
                      </button>
                    <button
                      type="button"
                      onClick={() => void loadCatalogProducts()}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                    >
                      Refrescar publicaciones
                    </button>
                    </div>
                  </div>
                </div>
              </div>

              {catalogError ? <p className="mt-3 text-sm text-rose-600">{catalogError}</p> : null}

              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">Publicaciones web</h3>
                  <span className="text-xs text-slate-500">
                    Mostrando {publishedCatalogStartIndex}-{publishedCatalogEndIndex} de{" "}
                    {publishedCatalogTotal} filtradas · {catalogMetrics.configured} total configuradas
                  </span>
                </div>
                <div className="max-h-[32rem] overflow-auto rounded-2xl border border-slate-200">
                  {catalogLoading ? (
                    <div className="px-4 py-8 text-sm text-slate-500">
                      Cargando publicaciones…
                    </div>
                  ) : publishedCatalogTotal === 0 ? (
                    <div className="px-4 py-8 text-sm text-slate-500">
                      Aún no hay publicaciones web. Usa `Crear publicación` para iniciar el flujo.
                    </div>
                  ) : publishedCatalogProducts.length === 0 ? (
                    <div className="px-4 py-8 text-sm text-slate-500">
                      No hay publicaciones que coincidan con esos filtros.
                    </div>
                  ) : (
                    <table className="min-w-full text-sm">
                      <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        <tr>
                          <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Producto</th>
                          <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">SKU</th>
                          <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Marca / Grupo</th>
                          <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Precio</th>
                          <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Estado</th>
                          <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {publishedCatalogProducts.map((product) => (
                          <tr
                            key={`published-${product.id}`}
                            onDoubleClick={() => {
                              if (!canManage) return;
                              openCatalogComposer(product.id);
                            }}
                            title={canManage ? "Doble click para editar publicación" : undefined}
                            className={`border-b border-slate-100 align-top ${canManage ? "cursor-pointer" : ""}`}
                          >
                            <td className="px-4 py-3">
                              <div className="min-w-[18rem]">
                                <p className="font-medium text-slate-900">
                                  {getCatalogDisplayName(product)}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {product.web_short_description || "Sin descripción comercial"}
                                </p>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              {product.sku || "sin SKU"}
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              <div>
                                <p>{product.brand || "sin marca"}</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {product.group_name || "sin grupo"}
                                </p>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-medium text-slate-900">
                                {product.web_price_mode === "visible"
                                  ? formatMoney(resolveWebSalePriceFromProduct(product))
                                  : "Consultar"}
                              </p>
                              {hasVisibleDiscount(product) ? (
                                <p className="mt-1 text-xs text-slate-500 line-through">
                                  {formatMoney(product.web_compare_price || 0)}
                                </p>
                              ) : null}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1.5">
                                <span
                                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                                    product.web_published
                                      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                      : "border-amber-300 bg-amber-50 text-amber-700"
                                  }`}
                                >
                                  {product.web_published ? "publicado" : "pausado"}
                                </span>
                                {product.web_featured ? (
                                  <span className="rounded-full border border-sky-300 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700">
                                    destacado
                                  </span>
                                ) : null}
                                {product.web_badge_text ? (
                                  <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                                    {product.web_badge_text}
                                  </span>
                                ) : null}
                                {getDiscountBadgeTextFromProduct(product) ? (
                                  <span className="rounded-full border border-blue-300 bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700">
                                    {getDiscountBadgeTextFromProduct(product)}
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap justify-end gap-2">
                                <button
                                  type="button"
                                  disabled={!canManage}
                                  onClick={() => setCatalogActionConfirm({ action: "edit", product })}
                                  title="Editar"
                                  aria-label="Editar"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current" aria-hidden="true">
                                    <path d="M14.7 2.3a1 1 0 0 1 1.4 0l1.6 1.6a1 1 0 0 1 0 1.4l-8.9 8.9-3.5.8.8-3.5 8.9-8.9zM4.8 15.2h10.4v1.5H4.8z" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  disabled={!canManage}
                                  onClick={() =>
                                    setCatalogActionConfirm({ action: "publish_toggle", product })
                                  }
                                  title={product.web_published ? "Pausar" : "Reactivar"}
                                  aria-label={product.web_published ? "Pausar" : "Reactivar"}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {product.web_published ? (
                                    <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current" aria-hidden="true">
                                      <path d="M6 4h3v12H6zM11 4h3v12h-3z" />
                                    </svg>
                                  ) : (
                                    <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current" aria-hidden="true">
                                      <path d="M6 4l10 6-10 6z" />
                                    </svg>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  disabled={!canManage}
                                  onClick={() =>
                                    setCatalogActionConfirm({ action: "feature_toggle", product })
                                  }
                                  title={product.web_featured ? "Quitar destacado" : "Destacar"}
                                  aria-label={product.web_featured ? "Quitar destacado" : "Destacar"}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {product.web_featured ? (
                                    <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current" aria-hidden="true">
                                      <path d="M10 2.2l2.3 4.7 5.2.8-3.8 3.7.9 5.2-4.6-2.4-4.6 2.4.9-5.2-3.8-3.7 5.2-.8L10 2.2z" />
                                    </svg>
                                  ) : (
                                    <svg viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current" aria-hidden="true">
                                      <path d="M10 2.2l2.3 4.7 5.2.8-3.8 3.7.9 5.2-4.6-2.4-4.6 2.4.9-5.2-3.8-3.7 5.2-.8L10 2.2z" strokeWidth="1.8" />
                                    </svg>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  disabled={!canManage}
                                  onClick={() => setCatalogActionConfirm({ action: "delete", product })}
                                  title="Eliminar"
                                  aria-label="Eliminar"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 transition hover:border-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current" aria-hidden="true">
                                    <path d="M7 2.8h6l.6 1.2H17v1.8H3V4h3.4L7 2.8zM5.5 7h9l-.7 10.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8L5.5 7zm2.3 1.8v7.4h1.7V8.8H7.8zm2.7 0v7.4h1.7V8.8h-1.7z" />
                                  </svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                {publishedCatalogTotal > 0 ? (
                  <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs text-slate-600">
                      Página {publishedCatalogPage} de {publishedCatalogTotalPages}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPublishedCatalogPage((prev) => Math.max(1, prev - 1))}
                        disabled={publishedCatalogPage <= 1}
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPublishedCatalogPage((prev) =>
                            Math.min(publishedCatalogTotalPages, prev + 1)
                          )
                        }
                        disabled={publishedCatalogPage >= publishedCatalogTotalPages}
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </SectionCard>
            ) : null}

            {catalogComposerOpen ? (
            <SectionCard
              title={selectedProduct ? "Editor comercial" : "Nueva publicación"}
              subtitle={
                selectedProduct
                  ? "Cómo se presenta realmente el producto en la tienda, distinto al dato operativo interno."
                  : "Busca en la base maestra y selecciona el producto que vas a convertir en publicación."
              }
            >
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
                      {selectedProduct ? "Producto seleccionado" : "Flujo de creación"}
                    </p>
                    <p className="mt-1 text-sm text-emerald-900/80">
                      {selectedProduct
                        ? `${getCatalogDisplayName(selectedProduct)} · ${selectedProduct.sku || "sin SKU"}`
                        : "Primero busca el producto en la base maestra y luego termina su configuración comercial."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => resetCatalogComposer()}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                    >
                      Volver a publicaciones
                    </button>
                  </div>
                </div>

                <div className="grid gap-5">
                  {catalogComposerMode === "create" && !selectedProduct ? (
                  <div className="space-y-3">
                    <div className="rounded-[24px] border border-emerald-200 bg-emerald-50/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
                        Buscar en base maestra
                      </p>
                      <p className="mt-2 text-sm text-emerald-900/80">
                        Busca por SKU, nombre, marca, grupo o código de barras y selecciona el
                        producto para construir su publicación comercial.
                      </p>
                      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr,auto]">
                        <input
                          value={catalogSearchTerm}
                          onChange={(event) => setCatalogSearchTerm(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") void searchCatalogProducts();
                          }}
                          placeholder="Buscar por SKU, nombre, marca o código"
                          className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                        />
                        <button
                          type="button"
                          onClick={() => void searchCatalogProducts()}
                          className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
                        >
                          {catalogSearching ? "Buscando..." : "Buscar producto"}
                        </button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-emerald-900/75">
                        <span className="rounded-full border border-emerald-300 bg-white px-2.5 py-1">
                          Resultados solo bajo demanda
                        </span>
                        {catalogSearchExecuted ? (
                          <span className="rounded-full border border-emerald-300 bg-white px-2.5 py-1">
                            {catalogSearchResults.length} coincidencia
                            {catalogSearchResults.length === 1 ? "" : "s"}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-900">Resultados de búsqueda</h3>
                        <span className="text-xs text-slate-500">
                          {catalogSearchExecuted
                            ? `${catalogSearchResults.length} coincidencias`
                            : "Busca un producto para empezar"}
                        </span>
                      </div>
                      <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
                        {!catalogSearchExecuted ? (
                          <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-sm text-slate-500">
                            La base maestra no se lista completa. Busca el producto que quieras convertir en publicación.
                          </div>
                        ) : catalogSearchResults.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-sm text-slate-500">
                            No encontramos productos para ese criterio.
                          </div>
                        ) : (
                          catalogSearchResults.map((product) => (
                            <div
                              key={`search-${product.id}`}
                              className={`rounded-3xl border px-4 py-4 transition ${
                                selectedProductId === product.id
                                  ? "border-emerald-300 bg-emerald-50/70"
                                  : "border-slate-200 bg-white hover:border-slate-300"
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => setSelectedProductId(product.id)}
                                className="w-full text-left"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-base font-semibold text-slate-900">
                                        {getCatalogDisplayName(product)}
                                      </span>
                                      {product.web_published ? (
                                        <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                                          ya publicado
                                        </span>
                                      ) : (
                                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                                          no publicado
                                        </span>
                                      )}
                                    </div>
                                    <p className="mt-2 text-sm text-slate-700">
                                      {product.sku || "sin SKU"} · {product.brand || "sin marca"} ·{" "}
                                      {product.group_name || "sin grupo"}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-500">
                                      {product.web_short_description || "Sin descripción comercial"}
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-sm font-semibold text-slate-900">
                                      {formatMoney(resolveWebSalePriceFromProduct(product))}
                                    </p>
                                  </div>
                                </div>
                              </button>
                              <div className="mt-4 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => setSelectedProductId(product.id)}
                                  className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition"
                                >
                                  Seleccionar
                                </button>
                                <button
                                  type="button"
                                  disabled={!canManage}
                                  onClick={() => void handlePublishFromSearch(product)}
                                  className="rounded-2xl bg-slate-900 px-3 py-2 text-xs font-medium text-white transition disabled:cursor-not-allowed disabled:bg-slate-300"
                                >
                                  {product.web_published ? "Mantener publicado" : "Crear publicación"}
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                  ) : null}

                  {catalogComposerMode !== "create" || selectedProduct ? (
                  <div>
                  {!selectedProduct ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-sm text-slate-500">
                      Selecciona un producto desde los resultados para abrir su editor comercial.
                    </div>
                  ) : (
                    <div className="space-y-4">
                  <div className="grid gap-3">
                    <div className="space-y-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        <LabeledField label="Nombre público" required>
                          <input
                            value={catalogEditor.web_name}
                            onChange={(event) => {
                              const nextName = event.target.value;
                              const currentSuggested = generateSuggestedSlug(
                                selectedProduct.web_name || selectedProduct.name || ""
                              );
                              const currentNameSuggested = generateSuggestedSlug(catalogEditor.web_name);
                              setCatalogEditor((prev) => ({
                                ...prev,
                                web_name: nextName,
                                web_slug:
                                  !prev.web_slug ||
                                  prev.web_slug === currentSuggested ||
                                  prev.web_slug === currentNameSuggested
                                    ? generateSuggestedSlug(nextName)
                                    : prev.web_slug,
                              }));
                              setCatalogDirty(true);
                            }}
                            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                          />
                        </LabeledField>
                        <LabeledField label="Slug web" required>
                          <input
                            value={catalogEditor.web_slug}
                            onChange={(event) =>
                              handleCatalogField(
                                "web_slug",
                                generateSuggestedSlug(event.target.value)
                              )
                            }
                            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                          />
                        </LabeledField>
                      </div>

                      <div className="grid gap-3 md:grid-cols-3">
                        <LabeledField label="Precio base (referencia)">
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-900">
                            {formatMoney(selectedProduct.price)}
                          </div>
                        </LabeledField>
                        <LabeledField label="Origen precio web" required>
                          <select
                            value={catalogEditor.web_price_source}
                            onChange={(event) =>
                              handleCatalogField(
                                "web_price_source",
                                event.target.value as "base" | "fixed" | "discount_percent"
                              )
                            }
                            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                          >
                            <option value="base">Usar precio base</option>
                            <option value="fixed">Precio fijo web</option>
                            <option value="discount_percent">Descuento sobre base (%)</option>
                          </select>
                        </LabeledField>
                        <LabeledField
                          label={
                            catalogEditor.web_price_source === "discount_percent"
                              ? "Descuento web (%)"
                              : "Precio de venta web"
                          }
                        >
                          <input
                            value={catalogEditor.web_price_value}
                            onChange={(event) => {
                              const rawValue = event.target.value;
                              if (catalogEditor.web_price_source === "discount_percent") {
                                handleCatalogField(
                                  "web_price_value",
                                  rawValue.replace(/[^\d,]/g, "")
                                );
                                return;
                              }
                              handleCatalogField(
                                "web_price_value",
                                formatThousandsWithDots(rawValue)
                              );
                            }}
                            placeholder={
                              catalogEditor.web_price_source === "base"
                                ? "No aplica con precio base"
                                : catalogEditor.web_price_source === "discount_percent"
                                  ? "Ej: 15"
                                  : "Ej: 120.000"
                            }
                            disabled={catalogEditor.web_price_source === "base"}
                            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                          />
                        </LabeledField>
                      </div>

                      <div className="grid gap-3 md:grid-cols-3">
                        <LabeledField label="Precio comparativo">
                          <input
                            value={catalogEditor.web_compare_price}
                            onChange={(event) =>
                              handleCatalogField(
                                "web_compare_price",
                                formatThousandsWithDots(event.target.value)
                              )
                            }
                            placeholder="Ej: 270.000"
                            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                          />
                        </LabeledField>
                        <LabeledField label="Badge comercial">
                          <input
                            value={catalogEditor.web_badge_text}
                            onChange={(event) =>
                              handleCatalogField("web_badge_text", event.target.value)
                            }
                            placeholder="Oferta, Nuevo, Top ventas"
                            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                          />
                        </LabeledField>
                        <LabeledField label="Categoría web" required>
                          <select
                            value={catalogEditor.web_category_key}
                            onChange={(event) =>
                              handleCatalogField("web_category_key", event.target.value)
                            }
                            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                          >
                            <option value="">Selecciona una categoría</option>
                            {WEB_CATEGORY_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </LabeledField>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <LabeledField label="Descripción corta" required>
                          <textarea
                            value={catalogEditor.web_short_description}
                            onChange={(event) =>
                              handleCatalogField(
                                "web_short_description",
                                event.target.value.slice(0, SHORT_DESCRIPTION_MAX_CHARS)
                              )
                            }
                            maxLength={SHORT_DESCRIPTION_MAX_CHARS}
                            rows={2}
                            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                          />
                          <p className="mt-1 text-xs text-slate-500">
                            {catalogEditor.web_short_description.length}/{SHORT_DESCRIPTION_MAX_CHARS} caracteres
                          </p>
                        </LabeledField>
                        <LabeledField label="Descripción larga">
                          <textarea
                            value={catalogEditor.web_long_description}
                            onChange={(event) =>
                              handleCatalogField("web_long_description", event.target.value)
                            }
                            rows={4}
                            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                          />
                        </LabeledField>
                      </div>

                      <div className="block">
                        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Imagen
                        </span>
                        <div className="max-w-xl rounded-2xl border border-slate-200 bg-slate-50 p-3">
                          <div className="flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              disabled={catalogImageUploading || (catalogEditor.web_gallery_urls ?? []).length >= 3}
                              onClick={() => catalogImageInputRef.current?.click()}
                              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {catalogImageUploading ? "Subiendo..." : "Agregar imagen"}
                            </button>
                            <span className="text-xs text-slate-500">
                              JPG, PNG o WebP. Máximo 3 imágenes. La primera será la principal.
                            </span>
                          </div>
                          <input
                            ref={catalogImageInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (!file) return;
                              void handleCatalogImageFileChange(file);
                            }}
                            className="hidden"
                          />
                          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                            {(catalogEditor.web_gallery_urls ?? []).length ? (
                              <div className="grid gap-3 sm:grid-cols-3">
                                {(catalogEditor.web_gallery_urls ?? []).map((imageUrl, index) => (
                                  <div
                                    key={`${imageUrl}-${index}`}
                                    className="rounded-xl border border-slate-200 bg-slate-50 p-2"
                                  >
                                    <div className="relative h-28 overflow-hidden rounded-lg border border-slate-200 bg-white">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={resolveAssetUrl(imageUrl) || imageUrl}
                                        alt={`Imagen ${index + 1}`}
                                        className="h-full w-full object-cover"
                                      />
                                      {index === 0 ? (
                                        <span className="absolute left-2 top-2 rounded-full bg-slate-900 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">
                                          Principal
                                        </span>
                                      ) : null}
                                    </div>
                                    <div className="mt-2 space-y-1.5">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="truncate text-[11px] text-slate-500">
                                          Imagen {index + 1}
                                        </span>
                                        <div className="flex items-center gap-1">
                                          <button
                                            type="button"
                                            disabled={index === 0}
                                            onClick={() => moveCatalogGalleryImage(index, index - 1)}
                                            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition disabled:cursor-not-allowed disabled:opacity-40"
                                            title="Mover a la izquierda"
                                            aria-label="Mover a la izquierda"
                                          >
                                            ←
                                          </button>
                                          <button
                                            type="button"
                                            disabled={index === (catalogEditor.web_gallery_urls ?? []).length - 1}
                                            onClick={() => moveCatalogGalleryImage(index, index + 1)}
                                            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition disabled:cursor-not-allowed disabled:opacity-40"
                                            title="Mover a la derecha"
                                            aria-label="Mover a la derecha"
                                          >
                                            →
                                          </button>
                                        </div>
                                      </div>
                                      <div className="flex items-center justify-between gap-2">
                                        {index !== 0 ? (
                                          <button
                                            type="button"
                                            onClick={() => setCatalogGalleryPrimary(index)}
                                            className="text-[11px] font-medium text-sky-700"
                                          >
                                            Hacer principal
                                          </button>
                                        ) : (
                                          <span className="text-[11px] font-medium text-emerald-700">
                                            Imagen principal
                                          </span>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const nextGallery = (catalogEditor.web_gallery_urls ?? []).filter(
                                              (_, galleryIndex) => galleryIndex !== index
                                            );
                                            applyCatalogGalleryOrder(nextGallery);
                                          }}
                                          className="text-[11px] font-medium text-rose-600"
                                        >
                                          Quitar
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-500">Sin imagen cargada</p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-4">
                        <LabeledField label="Modo precio" required>
                          <select
                            value={catalogEditor.web_price_mode}
                            onChange={(event) =>
                              handleCatalogField(
                                "web_price_mode",
                                event.target.value as "visible" | "consultar"
                              )
                            }
                            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                          >
                            <option value="visible">Visible</option>
                            <option value="consultar">Consultar</option>
                          </select>
                        </LabeledField>
                        <LabeledField label="Orden">
                          <input
                            value={catalogEditor.web_sort_order}
                            onChange={(event) =>
                              handleCatalogField("web_sort_order", event.target.value)
                            }
                            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                          />
                        </LabeledField>
                        <ToggleField
                          label="Publicado"
                          checked={catalogEditor.web_published}
                          onChange={(checked) => handleCatalogField("web_published", checked)}
                        />
                        <ToggleField
                          label="Destacado"
                          checked={catalogEditor.web_featured}
                          onChange={(checked) => handleCatalogField("web_featured", checked)}
                        />
                      </div>

                      <div className="grid gap-3">
                        <ToggleField
                          label="Visible sin stock"
                          checked={catalogEditor.web_visible_when_out_of_stock}
                          onChange={(checked) =>
                            handleCatalogField("web_visible_when_out_of_stock", checked)
                          }
                        />
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          disabled={!canManage || !catalogDirty || catalogSaving}
                          onClick={() => {
                            if (shouldPromptPublishOnSave()) {
                              setCatalogSavePublishPromptOpen(true);
                              return;
                            }
                            void handleSaveCatalogProduct();
                          }}
                          className="rounded-xl border px-4 py-2.5 text-sm font-medium shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed"
                          style={{
                            backgroundColor:
                              !canManage || !catalogDirty || catalogSaving ? "#bfdbfe" : "#2563eb",
                            borderColor:
                              !canManage || !catalogDirty || catalogSaving ? "#93c5fd" : "#1d4ed8",
                            color: !canManage || !catalogDirty || catalogSaving ? "#1e3a8a" : "#ffffff",
                          }}
                        >
                          {catalogSaving ? "Guardando..." : "Guardar publicación"}
                        </button>
                        <button
                          type="button"
                          disabled={catalogSaving}
                          onClick={() => {
                            setCatalogEditor(buildEditorState(selectedProduct));
                            setCatalogDirty(false);
                          }}
                          className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Revertir cambios
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                      <div className="w-fit rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                          Vista previa de card
                        </p>
                        <div className="mt-2.5 w-fit max-w-full">
                          {(() => {
                            const previewCardImageUrl = previewGalleryImages[previewImageIndex] || null;
                            const hasMultiplePreviewImages = previewGalleryImages.length > 1;
                            const previewBadges: Array<{ text: string; className: string }> = [];
                            const editorDiscountBadge = getDiscountBadgeTextFromEditor(catalogEditor);

                            if (catalogEditor.web_badge_text?.trim()) {
                              previewBadges.push({
                                text: catalogEditor.web_badge_text.trim(),
                                className: "bg-rose-600 text-white",
                              });
                            } else if (!catalogEditor.web_visible_when_out_of_stock) {
                              previewBadges.push({
                                text: "Sin stock",
                                className: "bg-rose-600 text-white",
                              });
                            }

                            if (editorDiscountBadge) {
                              previewBadges.push({
                                text: editorDiscountBadge,
                                className: "bg-blue-600 text-white",
                              });
                            }

                            return (
                              <div className="max-w-full" style={{ width: "272px" }}>
                                <article
                                  className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_14px_32px_rgba(15,23,42,0.08)]"
                                  style={{ width: "272px", maxWidth: "100%" }}
                                >
                                  <div className="relative">
                                    {previewCardImageUrl ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={previewCardImageUrl}
                                        alt={catalogEditor.web_name.trim() || selectedProduct.name}
                                        className="block bg-slate-100 object-cover"
                                        style={{ width: "272px", maxWidth: "100%", height: "290px" }}
                                      />
                                    ) : (
                                      <div
                                        className="flex items-center justify-center bg-[linear-gradient(135deg,#eef2f7_0%,#dce5f2_100%)] text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500"
                                        style={{ width: "272px", maxWidth: "100%", height: "290px" }}
                                      >
                                        Sin imagen
                                      </div>
                                    )}

                                    {previewBadges.length ? (
                                      <div className="absolute left-4 top-4 z-20 flex flex-col items-start gap-2">
                                        {previewBadges.map((badge, index) => (
                                          <span
                                            key={`preview-badge-${index}-${badge.text}`}
                                            className={`rounded-md border border-white/20 px-3 py-1.5 text-xs font-semibold tracking-[0.01em] ${badge.className}`}
                                          >
                                            {badge.text}
                                          </span>
                                        ))}
                                      </div>
                                    ) : null}

                                    {hasMultiplePreviewImages ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setPreviewImageIndex((prev) =>
                                              prev <= 0 ? previewGalleryImages.length - 1 : prev - 1
                                            )
                                          }
                                          className="absolute left-2 top-1/2 z-20 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-transparent leading-none transition"
                                          style={{
                                            color: "#ffffff",
                                            fontSize: "46px",
                                            fontWeight: 700,
                                            textShadow: "0 2px 6px rgba(15,23,42,0.9)",
                                          }}
                                          aria-label="Imagen anterior"
                                        >
                                          ‹
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setPreviewImageIndex((prev) =>
                                              prev >= previewGalleryImages.length - 1 ? 0 : prev + 1
                                            )
                                          }
                                          className="absolute right-2 top-1/2 z-20 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-transparent leading-none transition"
                                          style={{
                                            color: "#ffffff",
                                            fontSize: "46px",
                                            fontWeight: 700,
                                            textShadow: "0 2px 6px rgba(15,23,42,0.9)",
                                          }}
                                          aria-label="Imagen siguiente"
                                        >
                                          ›
                                        </button>
                                        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-white/85 px-2 py-1">
                                          {previewGalleryImages.map((_, index) => (
                                            <span
                                              key={`preview-dot-${index}`}
                                              className={`h-1.5 w-1.5 rounded-full ${
                                                index === previewImageIndex
                                                  ? "bg-slate-700"
                                                  : "bg-slate-300"
                                              }`}
                                            />
                                          ))}
                                        </div>
                                      </>
                                    ) : null}
                                  </div>

                                  <div className="bg-white px-5 py-4">
                                    <div className="flex flex-wrap items-center gap-1.5 text-[8px] font-bold uppercase tracking-[0.16em] text-slate-500">
                                      <span className="rounded-full bg-blue-50 px-2 py-1 text-[8px] font-semibold tracking-[0.08em] text-blue-700">
                                        {getWebCategoryLabel(catalogEditor.web_category_key) || "Sin categoría"}
                                      </span>
                                    </div>
                                    <h3 className="mt-2 text-[0.92rem] font-semibold leading-tight text-slate-900">
                                      {catalogEditor.web_name.trim() || selectedProduct.name}
                                    </h3>
                                    <p className="mt-2.5 min-h-[36px] text-xs leading-5 text-slate-600">
                                      {catalogEditor.web_short_description.trim() || "Sin descripción comercial."}
                                    </p>

                                    <div className="mt-4 flex items-end justify-between gap-3">
                                      <div className="flex min-w-0 flex-wrap items-end gap-2">
                                        <strong className="text-[1.05rem] leading-none text-slate-900">
                                          {catalogEditor.web_price_mode === "visible"
                                            ? formatMoney(
                                                resolveWebSalePrice(
                                                  selectedProduct.price,
                                                  catalogEditor.web_price_source,
                                                  catalogEditor.web_price_value
                                                )
                                              )
                                            : "Consultar"}
                                        </strong>
                                        {catalogEditor.web_price_mode === "visible" &&
                                        catalogEditor.web_compare_price.trim() &&
                                        (parseThousandsWithDots(catalogEditor.web_compare_price) || 0) >
                                          resolveWebSalePrice(
                                            selectedProduct.price,
                                            catalogEditor.web_price_source,
                                            catalogEditor.web_price_value
                                          ) ? (
                                          <span className="text-[10px] text-slate-400 line-through">
                                            {formatMoney(
                                              parseThousandsWithDots(catalogEditor.web_compare_price) || 0
                                            )}
                                          </span>
                                        ) : null}
                                      </div>
                                      <span className="shrink-0 text-xs font-medium text-slate-500">
                                        SKU {selectedProduct.sku || "s/n"}
                                      </span>
                                    </div>

                                  </div>
                                </article>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:min-w-[34rem] lg:flex-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                          Contexto operativo
                        </p>
                        <div className="mt-3 space-y-2.5 text-sm text-slate-700">
                          <div className="grid grid-cols-[11rem_minmax(0,1fr)] items-start gap-x-5">
                            <span>Producto maestro</span>
                            <span className="font-medium leading-snug break-words text-slate-800">
                              {selectedProduct.name}
                            </span>
                          </div>
                          <div className="grid grid-cols-[11rem_minmax(0,1fr)] items-start gap-x-5">
                            <span>SKU</span>
                            <span className="font-medium leading-snug break-words text-slate-800">
                              {selectedProduct.sku || "Sin SKU"}
                            </span>
                          </div>
                          <div className="grid grid-cols-[11rem_minmax(0,1fr)] items-start gap-x-5">
                            <span>Marca</span>
                            <span className="font-medium leading-snug break-words text-slate-800">
                              {selectedProduct.brand || "Sin marca"}
                            </span>
                          </div>
                          <div className="grid grid-cols-[11rem_minmax(0,1fr)] items-start gap-x-5">
                            <span>Grupo</span>
                            <span className="font-medium leading-snug break-words text-slate-800">
                              {selectedProduct.group_name || "Sin grupo"}
                            </span>
                          </div>
                          <div className="grid grid-cols-[11rem_minmax(0,1fr)] items-start gap-x-5">
                            <span>Precio base</span>
                            <span className="font-medium leading-snug break-words text-slate-800">
                              {formatMoney(selectedProduct.price)}
                            </span>
                          </div>
                          <div className="grid grid-cols-[11rem_minmax(0,1fr)] items-start gap-x-5">
                            <span>Precio venta web</span>
                            <span className="font-medium leading-snug break-words text-slate-800">
                              {formatMoney(
                                resolveWebSalePrice(
                                  selectedProduct.price,
                                  catalogEditor.web_price_source,
                                  catalogEditor.web_price_value
                                )
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                    </div>
                  )}
                  </div>
                  ) : null}
                </div>
              </div>
            </SectionCard>
            ) : null}
          </section>
          </section>
        ) : null}

        {activeTab === "orders" ? (
          <section className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid gap-2 lg:grid-cols-[1.4fr,1fr,1fr,auto,auto]">
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") setSearch(searchInput);
                  }}
                  placeholder="Buscar por OW, cliente, correo o teléfono"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                />
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none"
                >
                  {ORDER_STATUS_OPTIONS.map((item) => (
                    <option key={item.value || "all"} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <select
                  value={paymentStatus}
                  onChange={(event) => setPaymentStatus(event.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none"
                >
                  {PAYMENT_STATUS_OPTIONS.map((item) => (
                    <option key={item.value || "all"} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setSearch(searchInput)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-400"
                >
                  Aplicar
                </button>
                <button
                  type="button"
                  onClick={() => void loadOrders()}
                  className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                  Refrescar
                </button>
              </div>
              {orderError ? <p className="mt-2 text-sm text-rose-600">{orderError}</p> : null}
            </section>

          <section className="grid gap-4 xl:grid-cols-[1.05fr,0.95fr]">
            <SectionCard title="Listado de órdenes" subtitle="Documentos `OW` creados por el canal web.">
              {loadingOrders ? (
                <div className="py-8 text-sm text-slate-500">Cargando órdenes…</div>
              ) : orders.length === 0 ? (
                <div className="py-8 text-sm text-slate-500">No hay órdenes para los filtros actuales.</div>
              ) : (
                <div className="space-y-3">
                  {orders.map((order) => (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => setSelectedId(order.id)}
                      className={`w-full rounded-3xl border px-4 py-4 text-left transition ${
                        selectedId === order.id
                          ? "border-emerald-300 bg-emerald-50/70"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-base font-semibold text-slate-900">
                              {order.document_number || `Orden #${order.id}`}
                            </span>
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusBadgeClass(order.status)}`}>
                              {order.status}
                            </span>
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusBadgeClass(order.payment_status)}`}>
                              pago {order.payment_status}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-slate-700">
                            {order.customer_name || "Cliente web"} · {getPrimaryContact(order)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {order.items.length} item{order.items.length === 1 ? "" : "s"} · {formatDateTime(order.created_at)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-semibold text-slate-900">{formatMoney(order.total)}</p>
                          {order.sale_document_number ? (
                            <p className="mt-1 text-xs font-medium text-emerald-700">{order.sale_document_number}</p>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Detalle operativo" subtitle="Pago, items, timeline y acciones disponibles.">
              {!selectedOrder ? (
                <div className="text-sm text-slate-500">Selecciona una orden para ver su detalle.</div>
              ) : (
                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Documento web</p>
                      <h2 className="mt-2 text-2xl font-semibold text-slate-900">{selectedOrder.document_number}</h2>
                      <p className="mt-2 text-sm text-slate-600">
                        {selectedOrder.customer_name || "Cliente web"} · {getPrimaryContact(selectedOrder)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Total</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-900">{formatMoney(selectedOrder.total)}</p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <InfoPill label="Estado" value={selectedOrder.status} />
                    <InfoPill label="Pago" value={selectedOrder.payment_status} />
                    <InfoPill label="Fulfillment" value={selectedOrder.fulfillment_status} />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <InfoStat label="Pagado aprobado" value={formatMoney(sumApprovedPayments(selectedOrder))} tone="success" />
                    <InfoStat label="Saldo pendiente" value={formatMoney(selectedRemaining)} tone="warning" />
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <h3 className="text-sm font-semibold text-slate-900">Acciones operativas</h3>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        disabled={!canManage || selectedRemaining <= 0 || busyAction !== null}
                        onClick={() => void handleApprovePayment(selectedOrder)}
                        className="rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {busyAction === `pay-${selectedOrder.id}` ? "Registrando..." : "Aprobar pago"}
                      </button>
                      <button
                        type="button"
                        disabled={!canManage || selectedOrder.payment_status !== "approved" || busyAction !== null}
                        onClick={() => void handleConvert(selectedOrder)}
                        className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {busyAction === `convert-${selectedOrder.id}` ? "Convirtiendo..." : "Convertir a venta"}
                      </button>
                      {OPERATIVE_STATUS_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          disabled={!canManage || (option.value === "fulfilled" && selectedOrder.sale_id == null) || busyAction !== null}
                          onClick={() => void handleStatusUpdate(selectedOrder, option.value)}
                          className="rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-200">
                    <div className="border-b border-slate-200 px-4 py-3">
                      <h3 className="text-sm font-semibold text-slate-900">Items</h3>
                    </div>
                    <div className="divide-y divide-slate-200">
                      {selectedOrder.items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-slate-900">{item.product_name}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              SKU {item.product_sku || "sin SKU"} · {item.quantity} x {formatMoney(item.unit_price)}
                            </p>
                          </div>
                          <div className="text-sm font-semibold text-slate-900">{formatMoney(item.line_total)}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-5 xl:grid-cols-2">
                    <div className="rounded-3xl border border-slate-200">
                      <div className="border-b border-slate-200 px-4 py-3">
                        <h3 className="text-sm font-semibold text-slate-900">Pagos de la orden</h3>
                      </div>
                      <div className="space-y-3 px-4 py-4">
                        {selectedOrder.payments.length === 0 ? (
                          <p className="text-sm text-slate-500">Aún no hay pagos registrados.</p>
                        ) : (
                          selectedOrder.payments.map((payment) => <PaymentCard key={payment.id} payment={payment} />)
                        )}
                      </div>
                    </div>

                    <div className="rounded-3xl border border-slate-200">
                      <div className="border-b border-slate-200 px-4 py-3">
                        <h3 className="text-sm font-semibold text-slate-900">Timeline documental</h3>
                      </div>
                      <div className="space-y-3 px-4 py-4">
                        {selectedOrder.status_logs.length === 0 ? (
                          <p className="text-sm text-slate-500">Sin trazabilidad visible todavía.</p>
                        ) : (
                          selectedOrder.status_logs.map((log) => (
                            <div key={log.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-medium text-slate-900">
                                  {log.from_status ? `${log.from_status} → ` : ""}{log.to_status}
                                </p>
                                <span className="text-xs text-slate-500">{formatDateTime(log.created_at)}</span>
                              </div>
                              <p className="mt-1 text-xs text-slate-500">
                                Actor: {log.actor_type}{log.actor_user_id ? ` #${log.actor_user_id}` : ""}
                              </p>
                              <p className="mt-2 text-xs text-slate-700">{log.note || "Sin nota adicional"}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </SectionCard>
          </section>
          </section>
        ) : null}

        {activeTab === "payments" ? (
          <section className="space-y-4">
          <section className="grid gap-4 xl:grid-cols-[0.9fr,1.1fr]">
            <SectionCard title="Resumen de pagos" subtitle="Ledger aplanado de todo lo registrado sobre órdenes web.">
              <div className="grid gap-4 md:grid-cols-2">
                <MetricCard label="Pagos registrados" value={String(paymentRows.length)} tone="default" />
                <MetricCard
                  label="Pagos aprobados"
                  value={formatMoney(paymentRows.filter((payment) => payment.status === "approved").reduce((sum, payment) => sum + payment.amount, 0))}
                  tone="success"
                />
              </div>
              <div className="mt-5 space-y-3">
                {paymentRows.slice(0, 8).map((payment) => (
                  <button
                    key={payment.paymentId}
                    type="button"
                    onClick={() => {
                      setSelectedId(payment.orderId);
                      setActiveTab("orders");
                    }}
                    className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-slate-300"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">{payment.orderDocument} · {payment.method}</p>
                      <p className="mt-1 text-xs text-slate-500">{payment.customerName} · {payment.provider}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900">{formatMoney(payment.amount)}</p>
                      <span className={`mt-1 inline-flex rounded-full border px-2 py-1 text-[11px] font-medium ${statusBadgeClass(payment.status)}`}>{payment.status}</span>
                    </div>
                  </button>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Ledger de pagos" subtitle="Útil para auditoría rápida del canal web.">
              {paymentRows.length === 0 ? (
                <div className="text-sm text-slate-500">Aún no hay pagos registrados.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                      <tr>
                        <th className="px-3 py-3">Fecha</th>
                        <th className="px-3 py-3">Documento</th>
                        <th className="px-3 py-3">Cliente</th>
                        <th className="px-3 py-3">Método</th>
                        <th className="px-3 py-3">Proveedor</th>
                        <th className="px-3 py-3">Estado</th>
                        <th className="px-3 py-3 text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentRows.map((payment) => (
                        <tr key={payment.paymentId} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-3 py-3 text-slate-600">{formatDateTime(payment.createdAt)}</td>
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedId(payment.orderId);
                                setActiveTab("orders");
                              }}
                              className="font-medium text-slate-900 hover:text-emerald-700"
                            >
                              {payment.orderDocument}
                            </button>
                          </td>
                          <td className="px-3 py-3 text-slate-700">
                            {payment.customerName}
                            <div className="text-xs text-slate-500">{payment.customerEmail}</div>
                          </td>
                          <td className="px-3 py-3 text-slate-700">{payment.method}</td>
                          <td className="px-3 py-3 text-slate-700">{payment.provider}</td>
                          <td className="px-3 py-3">
                            <span className={`rounded-full border px-2 py-1 text-[11px] font-medium ${statusBadgeClass(payment.status)}`}>{payment.status}</span>
                          </td>
                          <td className="px-3 py-3 text-right font-semibold text-slate-900">{formatMoney(payment.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </section>
          </section>
        ) : null}

        {activeTab === "customers" ? (
          <section className="space-y-4">
          <section className="grid gap-4 xl:grid-cols-[0.88fr,1.12fr]">
            <SectionCard title="Clientes del canal web" subtitle="Acumulado comercial derivado de órdenes `OW`.">
              <div className="grid gap-4 md:grid-cols-2">
                <MetricCard label="Clientes visibles" value={String(customerRows.length)} />
                <MetricCard label="Clientes con venta convertida" value={String(customerRows.filter((row) => row.converted > 0).length)} tone="success" />
              </div>
              <div className="mt-5 space-y-3">
                {customerRows.slice(0, 8).map((customer) => (
                  <div key={customer.key} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{customer.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{customer.email} · {customer.phone}</p>
                      </div>
                      <p className="text-sm font-semibold text-slate-900">{formatMoney(customer.total)}</p>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">{customer.orders} órdenes · {customer.converted} convertidas</p>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Tabla comercial" subtitle="Detecta clientes repetitivos y maduración del canal web.">
              {customerRows.length === 0 ? (
                <div className="text-sm text-slate-500">Aún no hay suficientes órdenes para construir una vista comercial de clientes.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                      <tr>
                        <th className="px-3 py-3">Cliente</th>
                        <th className="px-3 py-3">Órdenes</th>
                        <th className="px-3 py-3">Aprobado</th>
                        <th className="px-3 py-3">Convertidas</th>
                        <th className="px-3 py-3">Última orden</th>
                        <th className="px-3 py-3 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerRows.map((customer) => (
                        <tr key={customer.key} className="border-b border-slate-100">
                          <td className="px-3 py-3">
                            <p className="font-medium text-slate-900">{customer.name}</p>
                            <p className="text-xs text-slate-500">{customer.email} · {customer.phone}</p>
                          </td>
                          <td className="px-3 py-3 text-slate-700">{customer.orders}</td>
                          <td className="px-3 py-3 text-slate-700">{formatMoney(customer.approved)}</td>
                          <td className="px-3 py-3 text-slate-700">{customer.converted}</td>
                          <td className="px-3 py-3 text-slate-700">{formatDateTime(customer.lastOrderAt)}</td>
                          <td className="px-3 py-3 text-right font-semibold text-slate-900">{formatMoney(customer.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </section>
          </section>
        ) : null}

        {catalogActionConfirm && catalogActionMeta ? (
          <div
            className="fixed inset-0 z-[998] flex items-center justify-center bg-slate-900/35 px-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
              <h3 className="text-base font-semibold text-slate-900">{catalogActionMeta.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{catalogActionMeta.description}</p>
              <p className="mt-2 text-xs text-slate-500">
                Producto: <span className="font-semibold text-slate-700">{getCatalogDisplayName(catalogActionConfirm.product)}</span>
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={catalogActionSubmitting}
                  onClick={() => setCatalogActionConfirm(null)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={catalogActionSubmitting}
                  onClick={() => void handleConfirmCatalogAction()}
                  className="rounded-xl border border-blue-700 bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300 disabled:text-slate-500"
                >
                  {catalogActionSubmitting ? "Procesando..." : catalogActionMeta.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {catalogSavePublishPromptOpen ? (
          <div
            className="fixed inset-0 z-[998] flex items-center justify-center bg-slate-900/35 px-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
              <h3 className="text-base font-semibold text-slate-900">¿Cómo quieres guardar?</h3>
              <p className="mt-2 text-sm text-slate-600">
                Esta publicación está en modo no publicada. Puedes guardarla así o publicarla de una vez.
              </p>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={catalogSaving}
                  onClick={() => setCatalogSavePublishPromptOpen(false)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={catalogSaving}
                  onClick={() => {
                    setCatalogSavePublishPromptOpen(false);
                    void handleSaveCatalogProduct(false);
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Guardar sin publicar
                </button>
                <button
                  type="button"
                  disabled={catalogSaving}
                  onClick={() => {
                    setCatalogSavePublishPromptOpen(false);
                    void handleSaveCatalogProduct(true);
                  }}
                  className="rounded-xl border border-blue-700 bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300 disabled:text-slate-500"
                >
                  Guardar y publicar
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {toast ? (
          <div
            role="status"
            aria-live="polite"
            style={{ position: "fixed", top: 20, right: 20, left: "auto", bottom: "auto" }}
            className={`z-[999] max-w-sm rounded-xl border px-4 py-3 text-sm shadow-lg transition-all duration-300 ${
              toast.tone === "error"
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            } ${toastVisible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"}`}
          >
            {toast.message}
          </div>
        ) : null}
      </div>
    </main>
  );
}

function LabeledField({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
        {required ? <span className="ml-1 text-rose-500">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2.5">
        <span className="text-sm font-medium text-slate-900">{label}</span>
        <button
          type="button"
          onClick={() => onChange(!checked)}
          className={`relative h-7 w-12 rounded-full transition ${
            checked ? "bg-emerald-500" : "bg-slate-300"
          }`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
              checked ? "left-6" : "left-1"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1.5 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function InfoStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning";
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className={`mt-1.5 text-lg font-semibold ${tone === "success" ? "text-emerald-700" : "text-amber-700"}`}>{value}</p>
    </div>
  );
}

function SummaryBox({
  title,
  value,
  caption,
  tone,
}: {
  title: string;
  value: number;
  caption: string;
  tone: "warning" | "info" | "success";
}) {
  const classes =
    tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : tone === "info"
        ? "border-sky-200 bg-sky-50 text-sky-900"
        : "border-emerald-200 bg-emerald-50 text-emerald-900";
  return (
    <div className={`rounded-2xl border p-3 ${classes}`}>
      <p className="text-[11px] uppercase tracking-[0.18em]">{title}</p>
      <p className="mt-1.5 text-xl font-semibold">{value}</p>
      <p className="mt-1.5 text-[11px] opacity-80">{caption}</p>
    </div>
  );
}

function SummaryMini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1.5 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function QueueList({
  title,
  orders,
  emptyMessage,
  onSelect,
  onJump,
  highlight,
}: {
  title: string;
  orders: ComercioWebOrder[];
  emptyMessage: string;
  onSelect: (orderId: number) => void;
  onJump: () => void;
  highlight: "warning" | "info" | "success";
}) {
  const colorClass =
    highlight === "warning"
      ? "border-amber-200 bg-amber-50/60"
      : highlight === "info"
        ? "border-sky-200 bg-sky-50/60"
        : "border-emerald-200 bg-emerald-50/60";
  return (
    <div>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <div className="mt-2.5 space-y-2.5">
        {orders.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-3 py-3 text-sm text-slate-500">{emptyMessage}</div>
        ) : (
          orders.map((order) => (
            <button
              key={order.id}
              type="button"
              onClick={() => {
                onSelect(order.id);
                onJump();
              }}
              className={`flex w-full items-start justify-between rounded-xl border px-3 py-2.5 text-left transition hover:border-slate-300 ${colorClass}`}
            >
              <div>
                <p className="text-sm font-medium text-slate-900">{order.document_number || `Orden #${order.id}`}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {order.customer_name || "Cliente web"} · {getPrimaryContact(order)}
                </p>
              </div>
              <span className="text-sm font-semibold text-slate-900">{formatMoney(order.total)}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function DistributionRow({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-slate-700">{label}</span>
        <span className="font-medium text-slate-900">{count} · {percentage}%</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.max(percentage, count > 0 ? 8 : 0)}%` }} />
      </div>
    </div>
  );
}

function PaymentCard({ payment }: { payment: ComercioWebOrderPayment }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-900">{payment.method || "Sin método"}</p>
          <p className="mt-1 text-xs text-slate-500">
            {payment.provider || "Sin proveedor"}
            {payment.provider_reference ? ` · ${payment.provider_reference}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-slate-900">{formatMoney(payment.amount)}</p>
          <span className={`mt-1 inline-flex rounded-full border px-2 py-1 text-[11px] font-medium ${statusBadgeClass(payment.status)}`}>{payment.status}</span>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">{formatDateTime(payment.created_at)}</p>
    </div>
  );
}

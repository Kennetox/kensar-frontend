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
  createComercioWebCatalogCategory,
  deleteComercioWebCatalogCategory,
  fetchComercioWebCatalogCategories,
  fetchComercioWebCatalogPublicationsPage,
  fetchComercioWebCatalogProducts,
  updateComercioWebCatalogCategory,
  updateComercioWebCatalogProduct,
  type ComercioWebCatalogCategory,
  type ComercioWebCatalogPublicationStats,
  type ComercioWebCatalogProduct,
  type ComercioWebCatalogProductUpdate,
} from "@/lib/api/comercioWebCatalog";
import {
  createComercioWebDiscountCode,
  fetchComercioWebDiscountCodes,
  updateComercioWebDiscountCode,
  type ComercioWebDiscountCode,
} from "@/lib/api/comercioWebDiscountCodes";
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
  providerReference: string;
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
  brand: string;
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
  web_warranty_text: string;
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
type CatalogWorkspaceView = "publications" | "discount_codes" | "categories";
type DiscountCodePeriodOption = "day" | "week" | "month" | "indefinite" | "custom";

type DiscountCodeEditorState = {
  code: string;
  discount_percent: string;
  period: DiscountCodePeriodOption;
  max_uses: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
};

type CategoryEditorState = {
  key: string;
  name: string;
  parent_key: string;
  image_url: string;
  tile_color: string;
  home_featured: boolean;
  home_featured_order: string;
  sort_order: string;
  is_active: boolean;
};

type CommerceWebDraftState = {
  activeTab?: CommerceTab;
  catalogWorkspaceView?: CatalogWorkspaceView;
  catalogComposerOpen?: boolean;
  catalogComposerMode?: CatalogComposerMode;
  selectedProductId?: number | null;
  previewImageIndex?: number;
  catalogDirty?: boolean;
  catalogEditor?: CatalogEditorState;
  catalogSearchTerm?: string;
  publishedCatalogFilter?: string;
  publishedCatalogFieldFilter?: string;
  publishedCatalogStatusFilter?: string;
  publishedCatalogFeaturedFilter?: string;
  publishedCatalogBadgeFilter?: string;
  publishedCatalogOrderFilter?: "newest" | "oldest" | "alphabetical";
  publishedCatalogActiveOnly?: boolean;
  discountCodeComposerOpen?: boolean;
  discountCodeEditingId?: number | null;
  discountCodeEditor?: DiscountCodeEditorState;
  catalogCategoryEditingId?: number | null;
  catalogCategoryEditor?: CategoryEditorState;
};

type UploadProductImageResponse = {
  url: string;
  thumb_url: string | null;
};

type CatalogTableAction = "edit" | "publish_toggle" | "feature_toggle" | "delete";

type CatalogActionConfirmState = {
  product: ComercioWebCatalogProduct;
  action: CatalogTableAction;
} | null;

type PendingCatalogExitAction =
  | { type: "close_composer" }
  | { type: "switch_workspace"; view: CatalogWorkspaceView }
  | { type: "switch_tab"; tab: CommerceTab };

const COMMERCE_WEB_ACTIVE_TAB_STORAGE_KEY = "commerce_web_active_tab";
const COMMERCE_WEB_DRAFT_STORAGE_KEY = "commerce_web_catalog_draft_v1";
const COMMERCE_WEB_ORDERS_AUTO_REFRESH_MS = 20_000;
const COMMERCE_WEB_PAYMENTS_LEDGER_PAGE_SIZE = 15;
const COMMERCE_WEB_LIVE_ORDER_TABS: CommerceTab[] = [
  "overview",
  "orders",
  "payments",
  "customers",
];

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

function isCatalogWorkspaceView(value: string): value is CatalogWorkspaceView {
  return value === "publications" || value === "discount_codes" || value === "categories";
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

const WARRANTY_PRESET_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "Garantía de 3 meses", label: "Garantía de 3 meses" },
  { value: "Garantía de 6 meses", label: "Garantía de 6 meses" },
  { value: "Garantía de 1 año", label: "Garantía de 1 año" },
];

const SHORT_DESCRIPTION_MAX_CHARS = 96;
const CATALOG_TABLE_PAGE_SIZE = 50;
const DISCOUNT_CODE_TABLE_PAGE_SIZE = 50;
const MAX_HOME_FEATURED_CATEGORIES = 5;
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
const CHECKOUT_CONTEXT_NOTE_MARKER = "CHECKOUT_CONTEXT_JSON:";

const emptyCatalogEditorState: CatalogEditorState = {
  web_name: "",
  web_slug: "",
  brand: "",
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
  web_warranty_text: "",
  image_url: "",
  image_thumb_url: "",
  web_gallery_urls: [],
};

const emptyDiscountCodeEditorState: DiscountCodeEditorState = {
  code: "",
  discount_percent: "",
  period: "indefinite",
  max_uses: "",
  starts_at: "",
  ends_at: "",
  is_active: true,
};

const DISCOUNT_PERIOD_OPTIONS: Array<{ value: DiscountCodePeriodOption; label: string }> = [
  { value: "day", label: "Un día" },
  { value: "week", label: "Una semana" },
  { value: "month", label: "Un mes" },
  { value: "indefinite", label: "Indefinido" },
  { value: "custom", label: "Personalizado" },
];

const emptyCategoryEditorState: CategoryEditorState = {
  key: "",
  name: "",
  parent_key: "",
  image_url: "",
  tile_color: "",
  home_featured: false,
  home_featured_order: "0",
  sort_order: "0",
  is_active: true,
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

function toDateTimeLocalInput(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function fromDateTimeLocalInput(value?: string): string | null {
  const trimmed = (value || "").trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toDateTimeLocalValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function getRangeForPeriod(period: DiscountCodePeriodOption): {
  startsAt: string;
  endsAt: string;
} {
  const now = new Date();
  if (period === "indefinite") {
    return { startsAt: "", endsAt: "" };
  }
  if (period === "custom") {
    return { startsAt: toDateTimeLocalValue(now), endsAt: "" };
  }
  const endsAt = new Date(now);
  if (period === "day") {
    endsAt.setDate(endsAt.getDate() + 1);
  } else if (period === "week") {
    endsAt.setDate(endsAt.getDate() + 7);
  } else {
    endsAt.setMonth(endsAt.getMonth() + 1);
  }
  return { startsAt: toDateTimeLocalValue(now), endsAt: toDateTimeLocalValue(endsAt) };
}

function inferPeriodFromDates(
  startsAt?: string | null,
  endsAt?: string | null
): DiscountCodePeriodOption {
  if (!startsAt && !endsAt) return "indefinite";
  if (!startsAt || !endsAt) return "custom";
  const startMs = new Date(startsAt).getTime();
  const endMs = new Date(endsAt).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) return "custom";
  const diffHours = (endMs - startMs) / (1000 * 60 * 60);
  if (Math.abs(diffHours - 24) <= 2) return "day";
  if (Math.abs(diffHours - 24 * 7) <= 2) return "week";
  if (Math.abs(diffHours - 24 * 30) <= 12) return "month";
  return "custom";
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

function translateOrderStatus(status: string): string {
  switch (status) {
    case "pending_payment":
      return "Pendiente de pago";
    case "paid":
      return "Pagada";
    case "processing":
      return "En proceso";
    case "ready":
      return "Lista";
    case "fulfilled":
      return "Entregada";
    case "payment_failed":
      return "Pago fallido";
    case "cancelled":
      return "Cancelada";
    case "refunded":
      return "Reembolsada";
    case "draft":
      return "Borrador";
    default:
      return status;
  }
}

function translatePaymentStatus(status: string): string {
  switch (status) {
    case "pending":
      return "Pendiente";
    case "approved":
      return "Aprobado";
    case "failed":
    case "rejected":
      return "Rechazado";
    case "cancelled":
      return "Cancelado";
    case "refunded":
      return "Reembolsado";
    default:
      return status;
  }
}

function formatPaymentLabel(value: string): string {
  const normalized = (value || "").trim().toLowerCase();
  if (!normalized) return "Sin definir";
  if (normalized === "mercadopago") return "Mercado Pago";
  if (normalized === "wompi") return "Wompi";
  if (normalized === "manual_backoffice") return "Backoffice";
  if (normalized === "card") return "Tarjeta";
  if (normalized === "pse") return "PSE";
  if (normalized === "nequi") return "Nequi";
  return normalized
    .split(/[_\s-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function translateFulfillmentStatus(status: string): string {
  switch (status) {
    case "pending":
      return "Pendiente";
    case "processing":
      return "En proceso";
    case "ready":
      return "Lista";
    case "fulfilled":
      return "Entregada";
    case "cancelled":
      return "Cancelada";
    default:
      return status;
  }
}

function extractCheckoutContextFromOrderNotes(notes?: string | null): Record<string, unknown> | null {
  const raw = (notes || "").trim();
  if (!raw) return null;
  const markerIndex = raw.indexOf(CHECKOUT_CONTEXT_NOTE_MARKER);
  if (markerIndex < 0) return null;
  const jsonPart = raw.slice(markerIndex + CHECKOUT_CONTEXT_NOTE_MARKER.length).trim();
  if (!jsonPart) return null;
  try {
    const parsed = JSON.parse(jsonPart);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function flattenCheckoutContextEntries(
  value: unknown,
  prefix = ""
): Array<{ key: string; value: string }> {
  if (value == null) return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [{ key: prefix || "valor", value: String(value) }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      flattenCheckoutContextEntries(entry, `${prefix}[${index}]`)
    );
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([entryKey, entryValue]) => {
      const nextPrefix = prefix ? `${prefix}.${entryKey}` : entryKey;
      return flattenCheckoutContextEntries(entryValue, nextPrefix);
    });
  }
  return [{ key: prefix || "valor", value: String(value) }];
}

function formatCheckoutContextKey(key: string): string {
  return key
    .replace(/\./g, " / ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function translateTimelineActorType(actorType?: string): string {
  const normalized = (actorType || "").trim().toLowerCase();
  if (normalized === "guest") return "Invitado";
  if (normalized === "customer") return "Cliente";
  if (normalized === "pos_user") return "Usuario POS";
  if (normalized === "system") return "Sistema";
  return actorType || "Sin actor";
}

function translateTimelineNote(note?: string | null): string {
  const raw = (note || "").trim();
  if (!raw) return "Sin nota adicional";
  return raw
    .replace("(approved)", "(aprobado)")
    .replace("(failed)", "(fallido)")
    .replace("(cancelled)", "(cancelado)")
    .replace("(refunded)", "(reembolsado)")
    .replace("(pending)", "(pendiente)");
}

function sumApprovedPayments(order: ComercioWebOrder): number {
  return order.payments
    .filter((payment) => payment.status === "approved")
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
}

function paymentStatusPriority(status: string): number {
  const normalized = (status || "").trim().toLowerCase();
  if (normalized === "approved") return 5;
  if (normalized === "refunded") return 4;
  if (normalized === "cancelled") return 3;
  if (normalized === "failed") return 2;
  if (normalized === "pending") return 1;
  return 0;
}

function getPrimaryContact(order: ComercioWebOrder): string {
  return order.customer_phone || order.customer_email || "Sin contacto";
}

function isOrderConverted(order: ComercioWebOrder): boolean {
  return Boolean(order.sale_id || order.sale_document_number);
}

function conversionBadgeClass(order: ComercioWebOrder): string {
  return isOrderConverted(order)
    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
    : "border-slate-300 bg-slate-100 text-slate-700";
}

function conversionBadgeLabel(order: ComercioWebOrder): string {
  return isOrderConverted(order) ? "Venta convertida" : "Sin convertir";
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

function normalizeCategoryKey(value: string): string {
  const normalized = normalizeSlugBase(value);
  if (!normalized) return "";
  return normalized.slice(0, 64).replace(/-+$/g, "");
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
    Boolean(product.web_warranty_text?.trim()) ||
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

function buildEditorState(product: ComercioWebCatalogProduct | null): CatalogEditorState {
  if (!product) return emptyCatalogEditorState;
  const galleryUrls = product.web_gallery_urls ?? [];
  return {
    web_name: product.web_name || product.name || "",
    web_slug: product.web_slug || generateSuggestedSlug(product.web_name || product.name || ""),
    brand: product.brand || "",
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
    web_warranty_text: product.web_warranty_text || "",
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
    <article className="rounded-2xl border border-slate-200 bg-white px-5 py-3.5 shadow-sm">
      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className={`mt-1.5 text-[2rem] leading-none font-semibold ${toneClasses}`}>{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-slate-500">{hint}</p> : null}
    </article>
  );
}

function SectionCard({
  title,
  subtitle,
  headerActions,
  children,
}: {
  title: string;
  subtitle?: string;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
          </div>
          {headerActions ? <div className="shrink-0">{headerActions}</div> : null}
        </div>
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
  const [paymentsLedgerPage, setPaymentsLedgerPage] = useState(1);

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
  const [publishedCatalogOrderFilter, setPublishedCatalogOrderFilter] = useState<
    "newest" | "oldest" | "alphabetical"
  >("newest");
  const [publishedCatalogActiveOnly, setPublishedCatalogActiveOnly] = useState(true);
  const [publishedCatalogPage, setPublishedCatalogPage] = useState(1);
  const [catalogWorkspaceView, setCatalogWorkspaceView] =
    useState<CatalogWorkspaceView>("publications");
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [catalogComposerOpen, setCatalogComposerOpen] = useState(false);
  const [catalogComposerMode, setCatalogComposerMode] = useState<CatalogComposerMode>("create");
  const [catalogEditor, setCatalogEditor] = useState<CatalogEditorState>(emptyCatalogEditorState);
  const [previewImageIndex, setPreviewImageIndex] = useState(0);
  const [catalogDirty, setCatalogDirty] = useState(false);
  const [catalogSaving, setCatalogSaving] = useState(false);
  const [catalogImageUploading, setCatalogImageUploading] = useState(false);
  const [catalogSavePublishPromptOpen, setCatalogSavePublishPromptOpen] = useState(false);
  const [catalogExitPromptOpen, setCatalogExitPromptOpen] = useState(false);
  const [pendingCatalogExitAction, setPendingCatalogExitAction] =
    useState<PendingCatalogExitAction | null>(null);
  const [catalogActionConfirm, setCatalogActionConfirm] = useState<CatalogActionConfirmState>(null);
  const [catalogActionSubmitting, setCatalogActionSubmitting] = useState(false);
  const [discountCodeRows, setDiscountCodeRows] = useState<ComercioWebDiscountCode[]>([]);
  const [discountCodeTotal, setDiscountCodeTotal] = useState(0);
  const [discountCodeLoading, setDiscountCodeLoading] = useState(false);
  const [discountCodeError, setDiscountCodeError] = useState<string | null>(null);
  const [discountCodePage, setDiscountCodePage] = useState(1);
  const [discountCodeEditor, setDiscountCodeEditor] = useState<DiscountCodeEditorState>(
    emptyDiscountCodeEditorState
  );
  const [discountCodeComposerOpen, setDiscountCodeComposerOpen] = useState(false);
  const [discountCodeEditingId, setDiscountCodeEditingId] = useState<number | null>(null);
  const [discountCodeSaving, setDiscountCodeSaving] = useState(false);
  const [catalogCategories, setCatalogCategories] = useState<ComercioWebCatalogCategory[]>([]);
  const [catalogCategoryLoading, setCatalogCategoryLoading] = useState(false);
  const [catalogCategoryError, setCatalogCategoryError] = useState<string | null>(null);
  const [catalogCategoryEditor, setCatalogCategoryEditor] = useState<CategoryEditorState>(
    emptyCategoryEditorState
  );
  const [catalogCategoryEditingId, setCatalogCategoryEditingId] = useState<number | null>(null);
  const [catalogCategoryEditorOpen, setCatalogCategoryEditorOpen] = useState(false);
  const [catalogCategoryImageUploading, setCatalogCategoryImageUploading] = useState(false);
  const [catalogAssetPreviewOpenUrl, setCatalogAssetPreviewOpenUrl] = useState<string | null>(null);
  const [draggedGalleryIndex, setDraggedGalleryIndex] = useState<number | null>(null);
  const [dragOverGalleryIndex, setDragOverGalleryIndex] = useState<number | null>(null);
  const [draggedCategoryId, setDraggedCategoryId] = useState<number | null>(null);
  const [dragOverCategoryId, setDragOverCategoryId] = useState<number | null>(null);
  const [dragOverCategoryPosition, setDragOverCategoryPosition] = useState<"before" | "after" | null>(null);
  const [catalogCategoryKeyTouched, setCatalogCategoryKeyTouched] = useState(false);
  const [catalogCategorySaving, setCatalogCategorySaving] = useState(false);
  const [brandSuggestionsOpen, setBrandSuggestionsOpen] = useState(false);
  const [catalogBrandLibrary, setCatalogBrandLibrary] = useState<string[]>([]);
  const [toast, setToast] = useState<InlineToast | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<{ hide?: number; remove?: number }>({});
  const ordersFetchInFlightRef = useRef(false);
  const catalogImageInputRef = useRef<HTMLInputElement | null>(null);
  const categoryImageInputRef = useRef<HTMLInputElement | null>(null);
  const brandAutocompleteRef = useRef<HTMLDivElement | null>(null);
  const draftHydratedRef = useRef(false);

  const [roleModules, setRoleModules] = useState<RolePermissionModule[]>(defaultRolePermissions);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(COMMERCE_WEB_ACTIVE_TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (draftHydratedRef.current) return;
    try {
      const raw = window.sessionStorage.getItem(COMMERCE_WEB_DRAFT_STORAGE_KEY);
      if (!raw) {
        draftHydratedRef.current = true;
        return;
      }
      const draft = JSON.parse(raw) as CommerceWebDraftState;
      if (draft.activeTab && isCommerceTab(draft.activeTab)) {
        setActiveTab(draft.activeTab);
      }
      if (draft.catalogWorkspaceView && isCatalogWorkspaceView(draft.catalogWorkspaceView)) {
        setCatalogWorkspaceView(draft.catalogWorkspaceView);
      }
      if (typeof draft.catalogComposerOpen === "boolean") {
        setCatalogComposerOpen(draft.catalogComposerOpen);
      }
      if (draft.catalogComposerMode === "create" || draft.catalogComposerMode === "edit") {
        setCatalogComposerMode(draft.catalogComposerMode);
      }
      if (typeof draft.selectedProductId === "number" || draft.selectedProductId === null) {
        setSelectedProductId(draft.selectedProductId ?? null);
      }
      if (typeof draft.previewImageIndex === "number" && draft.previewImageIndex >= 0) {
        setPreviewImageIndex(draft.previewImageIndex);
      }
      if (typeof draft.catalogDirty === "boolean") {
        setCatalogDirty(draft.catalogDirty);
      }
      if (draft.catalogEditor) {
        setCatalogEditor({
          ...emptyCatalogEditorState,
          ...draft.catalogEditor,
          web_gallery_urls: Array.isArray(draft.catalogEditor.web_gallery_urls)
            ? draft.catalogEditor.web_gallery_urls.filter((item) => typeof item === "string")
            : [],
        });
      }
      if (typeof draft.catalogSearchTerm === "string") {
        setCatalogSearchTerm(draft.catalogSearchTerm);
      }
      if (typeof draft.publishedCatalogFilter === "string") {
        setPublishedCatalogFilter(draft.publishedCatalogFilter);
      }
      if (typeof draft.publishedCatalogFieldFilter === "string") {
        setPublishedCatalogFieldFilter(draft.publishedCatalogFieldFilter);
      }
      if (typeof draft.publishedCatalogStatusFilter === "string") {
        setPublishedCatalogStatusFilter(draft.publishedCatalogStatusFilter);
      }
      if (typeof draft.publishedCatalogFeaturedFilter === "string") {
        setPublishedCatalogFeaturedFilter(draft.publishedCatalogFeaturedFilter);
      }
      if (typeof draft.publishedCatalogBadgeFilter === "string") {
        setPublishedCatalogBadgeFilter(draft.publishedCatalogBadgeFilter);
      }
      if (
        draft.publishedCatalogOrderFilter === "newest" ||
        draft.publishedCatalogOrderFilter === "oldest" ||
        draft.publishedCatalogOrderFilter === "alphabetical"
      ) {
        setPublishedCatalogOrderFilter(draft.publishedCatalogOrderFilter);
      }
      if (typeof draft.publishedCatalogActiveOnly === "boolean") {
        setPublishedCatalogActiveOnly(draft.publishedCatalogActiveOnly);
      }
      if (typeof draft.discountCodeComposerOpen === "boolean") {
        setDiscountCodeComposerOpen(draft.discountCodeComposerOpen);
      }
      if (typeof draft.discountCodeEditingId === "number" || draft.discountCodeEditingId === null) {
        setDiscountCodeEditingId(draft.discountCodeEditingId ?? null);
      }
      if (draft.discountCodeEditor) {
        setDiscountCodeEditor({
          ...emptyDiscountCodeEditorState,
          ...draft.discountCodeEditor,
        });
      }
      if (typeof draft.catalogCategoryEditingId === "number" || draft.catalogCategoryEditingId === null) {
        setCatalogCategoryEditingId(draft.catalogCategoryEditingId ?? null);
      }
      if (draft.catalogCategoryEditor) {
        setCatalogCategoryEditor({
          ...emptyCategoryEditorState,
          ...draft.catalogCategoryEditor,
        });
      }
    } catch {
      // Ignore malformed storage payloads.
    } finally {
      draftHydratedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!brandSuggestionsOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (!brandAutocompleteRef.current?.contains(target)) {
        setBrandSuggestionsOpen(false);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [brandSuggestionsOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!draftHydratedRef.current) return;
    const draft: CommerceWebDraftState = {
      activeTab,
      catalogWorkspaceView,
      catalogComposerOpen,
      catalogComposerMode,
      selectedProductId,
      previewImageIndex,
      catalogDirty,
      catalogEditor,
      catalogSearchTerm,
      publishedCatalogFilter,
      publishedCatalogFieldFilter,
      publishedCatalogStatusFilter,
      publishedCatalogFeaturedFilter,
      publishedCatalogBadgeFilter,
      publishedCatalogOrderFilter,
      publishedCatalogActiveOnly,
      discountCodeComposerOpen,
      discountCodeEditingId,
      discountCodeEditor,
      catalogCategoryEditingId,
      catalogCategoryEditor,
    };
    window.sessionStorage.setItem(COMMERCE_WEB_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [
    activeTab,
    catalogWorkspaceView,
    catalogComposerOpen,
    catalogComposerMode,
    selectedProductId,
    previewImageIndex,
    catalogDirty,
    catalogEditor,
    catalogSearchTerm,
    publishedCatalogFilter,
    publishedCatalogFieldFilter,
    publishedCatalogStatusFilter,
    publishedCatalogFeaturedFilter,
    publishedCatalogBadgeFilter,
    publishedCatalogOrderFilter,
    publishedCatalogActiveOnly,
    discountCodeComposerOpen,
    discountCodeEditingId,
    discountCodeEditor,
    catalogCategoryEditingId,
    catalogCategoryEditor,
  ]);

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
  const catalogBrandOptions = useMemo(() => {
    const normalizedByKey = new Map<string, string>();
    catalogBrandLibrary.forEach((brand) => {
      const raw = (brand || "").trim();
      if (!raw) return;
      const key = raw.toLocaleLowerCase("es");
      if (!normalizedByKey.has(key)) {
        normalizedByKey.set(key, raw);
      }
    });
    [...publishedCatalogProducts, ...catalogSearchResults].forEach((product) => {
      const raw = (product.brand || "").trim();
      if (!raw) return;
      const key = raw.toLocaleLowerCase("es");
      if (!normalizedByKey.has(key)) {
        normalizedByKey.set(key, raw);
      }
    });
    return [...normalizedByKey.values()].sort((a, b) => a.localeCompare(b, "es"));
  }, [catalogBrandLibrary, catalogSearchResults, publishedCatalogProducts]);
  const filteredCatalogBrandOptions = useMemo(() => {
    const search = catalogEditor.brand.trim().toLocaleLowerCase("es");
    if (!search) return catalogBrandOptions;
    return catalogBrandOptions.filter((option) => option.toLocaleLowerCase("es").includes(search));
  }, [catalogBrandOptions, catalogEditor.brand]);
  const categoryLabelMap = useMemo(() => {
    const next = new Map<string, string>();
    catalogCategories.forEach((item) => {
      const key = (item.key || "").trim().toLowerCase();
      if (key) next.set(key, item.name);
    });
    return next;
  }, [catalogCategories]);
  const activeCatalogCategories = useMemo(
    () =>
      catalogCategories
        .filter((item) => item.is_active)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "es")),
    [catalogCategories]
  );
  const selectedCatalogCategory = useMemo(() => {
    const key = (catalogEditor.web_category_key || "").trim().toLowerCase();
    if (!key) return null;
    return catalogCategories.find((item) => (item.key || "").trim().toLowerCase() === key) || null;
  }, [catalogCategories, catalogEditor.web_category_key]);
  const orderedCatalogCategories = useMemo(
    () =>
      [...catalogCategories].sort(
        (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "es")
      ),
    [catalogCategories]
  );
  const availableParentCatalogCategories = useMemo(
    () =>
      orderedCatalogCategories.filter((item) => item.id !== catalogCategoryEditingId),
    [catalogCategoryEditingId, orderedCatalogCategories]
  );
  const homeFeaturedCategoryCount = useMemo(
    () => catalogCategories.filter((item) => item.home_featured).length,
    [catalogCategories]
  );
  const nextAvailableHomeFeaturedOrder = useCallback(
    (excludeId?: number | null) => {
      const usedOrders = new Set<number>();
      catalogCategories.forEach((item) => {
        if (!item.home_featured) return;
        if (excludeId && item.id === excludeId) return;
        const order = Number(item.home_featured_order || 0);
        if (Number.isFinite(order) && order >= 1 && order <= MAX_HOME_FEATURED_CATEGORIES) {
          usedOrders.add(order);
        }
      });
      for (let order = 1; order <= MAX_HOME_FEATURED_CATEGORIES; order += 1) {
        if (!usedOrders.has(order)) return order;
      }
      return null;
    },
    [catalogCategories]
  );
  const suggestedCatalogCategoryKey = useMemo(
    () => normalizeCategoryKey(catalogCategoryEditor.name),
    [catalogCategoryEditor.name]
  );
  const getWebCategoryLabel = useCallback(
    (value?: string | null) => {
      const key = (value || "").trim().toLowerCase();
      if (!key) return "";
      return categoryLabelMap.get(key) || value || "";
    },
    [categoryLabelMap]
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

  const discountCodeTotalPages = useMemo(
    () => Math.max(1, Math.ceil(discountCodeTotal / DISCOUNT_CODE_TABLE_PAGE_SIZE)),
    [discountCodeTotal]
  );
  const discountCodeStartIndex = discountCodeTotal
    ? (discountCodePage - 1) * DISCOUNT_CODE_TABLE_PAGE_SIZE + 1
    : 0;
  const discountCodeEndIndex =
    discountCodeStartIndex === 0
      ? 0
      : Math.min(discountCodeStartIndex + discountCodeRows.length - 1, discountCodeTotal);

  useEffect(() => {
    setPublishedCatalogPage(1);
  }, [
    publishedCatalogFilter,
    publishedCatalogFieldFilter,
    publishedCatalogStatusFilter,
    publishedCatalogFeaturedFilter,
    publishedCatalogBadgeFilter,
    publishedCatalogOrderFilter,
    publishedCatalogActiveOnly,
  ]);

  useEffect(() => {
    if (publishedCatalogPage > publishedCatalogTotalPages) {
      setPublishedCatalogPage(publishedCatalogTotalPages);
    }
  }, [publishedCatalogPage, publishedCatalogTotalPages]);

  useEffect(() => {
    if (discountCodePage > discountCodeTotalPages) {
      setDiscountCodePage(discountCodeTotalPages);
    }
  }, [discountCodePage, discountCodeTotalPages]);

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

  const loadCatalogCategories = useCallback(async () => {
    if (!token) return;
    try {
      setCatalogCategoryLoading(true);
      setCatalogCategoryError(null);
      const rows = await fetchComercioWebCatalogCategories(token, { include_inactive: true });
      setCatalogCategories(rows);
    } catch (err) {
      setCatalogCategoryError(
        err instanceof Error ? err.message : "No se pudieron cargar las categorías"
      );
    } finally {
      setCatalogCategoryLoading(false);
    }
  }, [token]);

  const resetCatalogComposer = useCallback(() => {
    setCatalogComposerOpen(false);
    setCatalogWorkspaceView("publications");
    setCatalogComposerMode("create");
    setSelectedProductId(null);
    setCatalogSearchTerm("");
    setCatalogSearchResults([]);
    setCatalogSearchExecuted(false);
    setCatalogError(null);
    setCatalogDirty(false);
  }, []);

  const openCatalogComposer = useCallback((productId?: number) => {
    setCatalogWorkspaceView("publications");
    setCatalogComposerOpen(true);
    setCatalogError(null);
    void loadCatalogCategories();
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
  }, [loadCatalogCategories]);

  const executeCatalogExitAction = useCallback(
    (action: PendingCatalogExitAction | null) => {
      if (!action) return;
      if (action.type === "close_composer") {
        resetCatalogComposer();
        return;
      }
      if (action.type === "switch_workspace") {
        if (catalogComposerOpen) {
          resetCatalogComposer();
        }
        setCatalogWorkspaceView(action.view);
        return;
      }
      if (catalogComposerOpen) {
        resetCatalogComposer();
      }
      setActiveTab(action.tab);
    },
    [catalogComposerOpen, resetCatalogComposer]
  );

  const requestCatalogExit = useCallback(
    (action: PendingCatalogExitAction) => {
      if (catalogSaving) return;
      const hasUnsavedCatalogChanges =
        activeTab === "catalog" &&
        catalogWorkspaceView === "publications" &&
        catalogComposerOpen &&
        catalogDirty;
      if (hasUnsavedCatalogChanges) {
        setPendingCatalogExitAction(action);
        setCatalogExitPromptOpen(true);
        return;
      }
      executeCatalogExitAction(action);
    },
    [
      activeTab,
      catalogComposerOpen,
      catalogDirty,
      catalogSaving,
      catalogWorkspaceView,
      executeCatalogExitAction,
    ]
  );

  const requestTabChange = useCallback(
    (nextTab: CommerceTab) => {
      if (nextTab === activeTab) return;
      requestCatalogExit({ type: "switch_tab", tab: nextTab });
    },
    [activeTab, requestCatalogExit]
  );

  const requestWorkspaceChange = useCallback(
    (nextView: CatalogWorkspaceView) => {
      if (nextView === catalogWorkspaceView) return;
      requestCatalogExit({ type: "switch_workspace", view: nextView });
    },
    [catalogWorkspaceView, requestCatalogExit]
  );

  const paymentRows = useMemo<PaymentRow[]>(
    () =>
      orders
        .flatMap((order) => {
          const sortedPayments = [...order.payments].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );

          // 1) Consolidar cambios de estado de una misma referencia externa.
          const byExternalReference = new Map<string, ComercioWebOrderPayment>();
          const withoutExternalReference: ComercioWebOrderPayment[] = [];
          sortedPayments.forEach((payment) => {
            const provider = (payment.provider || "").trim().toLowerCase();
            const providerReference = (payment.provider_reference || "").trim();
            if (!providerReference) {
              withoutExternalReference.push(payment);
              return;
            }
            const key = `${provider}::${providerReference}`;
            const existing = byExternalReference.get(key);
            if (!existing) {
              byExternalReference.set(key, payment);
              return;
            }
            const currentRank = paymentStatusPriority(payment.status);
            const existingRank = paymentStatusPriority(existing.status);
            if (currentRank > existingRank) {
              byExternalReference.set(key, payment);
              return;
            }
            if (currentRank === existingRank) {
              const currentTs = new Date(payment.created_at).getTime();
              const existingTs = new Date(existing.created_at).getTime();
              if (currentTs >= existingTs) {
                byExternalReference.set(key, payment);
              }
            }
          });

          const compacted = [...byExternalReference.values(), ...withoutExternalReference].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );

          // 2) Ocultar pendientes de inicialización cuando ya existe resultado final
          // para la misma orden/proveedor/monto (caso típico: checkout creado + webhook aprobado).
          const consolidated = compacted.filter((payment) => {
            if (payment.status !== "pending") return true;
            const pendingProvider = (payment.provider || "").trim().toLowerCase();
            const pendingAmount = Number(payment.amount || 0);
            const pendingCreatedAt = new Date(payment.created_at).getTime();
            return !compacted.some((candidate) => {
              if (candidate.id === payment.id) return false;
              if (candidate.status === "pending") return false;
              const candidateProvider = (candidate.provider || "").trim().toLowerCase();
              if (candidateProvider !== pendingProvider) return false;
              if (Math.abs(Number(candidate.amount || 0) - pendingAmount) > 0.01) return false;
              const candidateCreatedAt = new Date(candidate.created_at).getTime();
              return candidateCreatedAt >= pendingCreatedAt;
            });
          });

          return consolidated.map((payment) => ({
            paymentId: payment.id,
            orderId: order.id,
            orderDocument: order.document_number || `Orden #${order.id}`,
            customerName: order.customer_name || "Cliente web",
            customerEmail: order.customer_email || "Sin correo",
            method: payment.method || "Sin método",
            provider: payment.provider || "Sin proveedor",
            providerReference: payment.provider_reference || "Sin referencia",
            amount: Number(payment.amount || 0),
            status: payment.status,
            createdAt: payment.created_at,
          }));
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [orders]
  );
  const paymentsLedgerTotalPages = useMemo(
    () => Math.max(1, Math.ceil(paymentRows.length / COMMERCE_WEB_PAYMENTS_LEDGER_PAGE_SIZE)),
    [paymentRows.length]
  );
  const paymentsLedgerStart = paymentRows.length
    ? (paymentsLedgerPage - 1) * COMMERCE_WEB_PAYMENTS_LEDGER_PAGE_SIZE + 1
    : 0;
  const paymentsLedgerEnd = paymentRows.length
    ? Math.min(paymentsLedgerPage * COMMERCE_WEB_PAYMENTS_LEDGER_PAGE_SIZE, paymentRows.length)
    : 0;
  const paginatedPaymentRows = useMemo(() => {
    const start = (paymentsLedgerPage - 1) * COMMERCE_WEB_PAYMENTS_LEDGER_PAGE_SIZE;
    const end = start + COMMERCE_WEB_PAYMENTS_LEDGER_PAGE_SIZE;
    return paymentRows.slice(start, end);
  }, [paymentRows, paymentsLedgerPage]);
  useEffect(() => {
    if (paymentsLedgerPage > paymentsLedgerTotalPages) {
      setPaymentsLedgerPage(paymentsLedgerTotalPages);
    }
  }, [paymentsLedgerPage, paymentsLedgerTotalPages]);
  useEffect(() => {
    setPaymentsLedgerPage(1);
  }, [search, status, paymentStatus, paymentRows.length]);

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

  const loadOrders = useCallback(async (options?: { silent?: boolean }) => {
    if (!token) return;
    if (ordersFetchInFlightRef.current) return;
    const silent = Boolean(options?.silent);
    try {
      ordersFetchInFlightRef.current = true;
      if (!silent) {
        setLoadingOrders(true);
        setOrderError(null);
      }
      const rows = await fetchComercioWebOrders(token, {
        status: status || undefined,
        payment_status: paymentStatus || undefined,
        search: search.trim() || undefined,
        limit: 120,
      });
      setOrders(rows);
      setSelectedId((prev) => prev ?? rows[0]?.id ?? null);
    } catch (err) {
      if (!silent) {
        setOrderError(err instanceof Error ? err.message : "No se pudo cargar Comercio Web");
      }
    } finally {
      if (!silent) {
        setLoadingOrders(false);
      }
      ordersFetchInFlightRef.current = false;
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
        order: publishedCatalogOrderFilter,
        active_only: publishedCatalogActiveOnly,
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
    publishedCatalogOrderFilter,
    publishedCatalogActiveOnly,
    publishedCatalogPage,
    publishedCatalogStatusFilter,
    token,
  ]);

  const loadCatalogBrands = useCallback(async () => {
    if (!token) return;
    try {
      const rows = await fetchComercioWebCatalogProducts(token, {
        published_only: true,
        limit: 5000,
      });
      const normalizedByKey = new Map<string, string>();
      rows.forEach((product) => {
        const raw = (product.brand || "").trim();
        if (!raw) return;
        const key = raw.toLocaleLowerCase("es");
        if (!normalizedByKey.has(key)) {
          normalizedByKey.set(key, raw);
        }
      });
      setCatalogBrandLibrary(
        [...normalizedByKey.values()].sort((a, b) => a.localeCompare(b, "es"))
      );
    } catch {
      // No bloquear la edición si falla la carga de sugerencias.
    }
  }, [token]);

  const loadDiscountCodes = useCallback(async () => {
    if (!token) return;
    try {
      setDiscountCodeLoading(true);
      setDiscountCodeError(null);
      const page = await fetchComercioWebDiscountCodes(token, {
        skip: (discountCodePage - 1) * DISCOUNT_CODE_TABLE_PAGE_SIZE,
        limit: DISCOUNT_CODE_TABLE_PAGE_SIZE,
      });
      setDiscountCodeRows(page.items);
      setDiscountCodeTotal(page.total);
    } catch (err) {
      setDiscountCodeError(
        err instanceof Error ? err.message : "No se pudieron cargar los códigos de descuento"
      );
    } finally {
      setDiscountCodeLoading(false);
    }
  }, [discountCodePage, token]);

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
    if (!token) return;
    if (!COMMERCE_WEB_LIVE_ORDER_TABS.includes(activeTab)) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (busyAction) return;
      void loadOrders({ silent: true });
    }, COMMERCE_WEB_ORDERS_AUTO_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [activeTab, busyAction, loadOrders, token]);

  useEffect(() => {
    if (activeTab !== "catalog") return;
    void loadCatalogCategories();
  }, [activeTab, loadCatalogCategories]);

  useEffect(() => {
    if (activeTab !== "catalog") return;
    const timer = window.setTimeout(() => {
      if (catalogWorkspaceView === "discount_codes") {
        void loadDiscountCodes();
        return;
      }
      if (catalogWorkspaceView === "categories") {
        void loadCatalogCategories();
        return;
      }
      void loadCatalogProducts();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [activeTab, catalogWorkspaceView, loadCatalogProducts, loadDiscountCodes, loadCatalogCategories]);

  useEffect(() => {
    if (activeTab !== "catalog") return;
    void loadCatalogBrands();
  }, [activeTab, loadCatalogBrands]);

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

  function handleGalleryDragStart(index: number) {
    setDraggedGalleryIndex(index);
    setDragOverGalleryIndex(index);
  }

  function handleGalleryDrop(dropIndex: number) {
    if (draggedGalleryIndex === null) return;
    if (draggedGalleryIndex !== dropIndex) {
      moveCatalogGalleryImage(draggedGalleryIndex, dropIndex);
    }
    setDraggedGalleryIndex(null);
    setDragOverGalleryIndex(null);
  }

  function shouldSkipRowDrag(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest("button, a, input, textarea, select, label"));
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

  async function handleSaveCatalogProduct(
    overridePublished?: boolean,
    onSaved?: () => void
  ): Promise<boolean> {
    if (!token || !selectedProduct) return false;
    if (!catalogEditor.web_category_key.trim()) {
      setCatalogError("Debes elegir una categoría web para la publicación.");
      showToast("Debes elegir una categoría web.", "error");
      return false;
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
      brand: catalogEditor.brand.trim() || null,
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
      web_warranty_text: catalogEditor.web_warranty_text.trim() || undefined,
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
      onSaved?.();
      showToast(
        updated.web_published
          ? "Publicación guardada y publicada con éxito."
          : "Publicación guardada con éxito."
      );
      return true;
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : "No se pudo guardar el producto");
      showToast("No se pudo guardar la publicación.", "error");
      return false;
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

  function resetDiscountCodeEditor(closeComposer = false) {
    setDiscountCodeEditingId(null);
    setDiscountCodeEditor(emptyDiscountCodeEditorState);
    if (closeComposer) {
      setDiscountCodeComposerOpen(false);
    }
  }

  function editDiscountCodeRow(row: ComercioWebDiscountCode) {
    const period = inferPeriodFromDates(row.starts_at, row.ends_at);
    setDiscountCodeEditingId(row.id);
    setDiscountCodeEditor({
      code: row.code,
      discount_percent: String(row.discount_percent ?? ""),
      period,
      max_uses: row.max_uses ? String(row.max_uses) : "",
      starts_at: toDateTimeLocalInput(row.starts_at),
      ends_at: toDateTimeLocalInput(row.ends_at),
      is_active: Boolean(row.is_active),
    });
    setDiscountCodeComposerOpen(true);
  }

  function openCreateDiscountCodeComposer() {
    setDiscountCodeEditingId(null);
    setDiscountCodeEditor({
      ...emptyDiscountCodeEditorState,
      ...getRangeForPeriod(emptyDiscountCodeEditorState.period),
    });
    setDiscountCodeError(null);
    setDiscountCodeComposerOpen(true);
  }

  function handleDiscountCodePeriodChange(period: DiscountCodePeriodOption) {
    const range = getRangeForPeriod(period);
    setDiscountCodeEditor((prev) => ({
      ...prev,
      period,
      starts_at: period === "custom" ? prev.starts_at || range.startsAt : range.startsAt,
      ends_at: period === "custom" ? prev.ends_at : range.endsAt,
    }));
  }

  async function handleSaveDiscountCode() {
    if (!token || !canManage) return;
    const code = discountCodeEditor.code.trim().toUpperCase();
    const percent = Number(discountCodeEditor.discount_percent);
    const maxUsesRaw = discountCodeEditor.max_uses.trim();
    const maxUses = maxUsesRaw ? Number(maxUsesRaw) : null;
    if (!code) {
      setDiscountCodeError("Debes ingresar el código.");
      return;
    }
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      setDiscountCodeError("El descuento debe ser un porcentaje válido entre 0 y 100.");
      return;
    }
    if (
      maxUsesRaw &&
      (!Number.isInteger(maxUses) || !Number.isFinite(maxUses) || Number(maxUses) < 1)
    ) {
      setDiscountCodeError("El uso máximo debe ser un número entero mayor o igual a 1.");
      return;
    }

    let startsAt: string | null = null;
    let endsAt: string | null = null;
    if (discountCodeEditor.period === "custom") {
      startsAt = fromDateTimeLocalInput(discountCodeEditor.starts_at);
      endsAt = fromDateTimeLocalInput(discountCodeEditor.ends_at);
      if (!startsAt || !endsAt) {
        setDiscountCodeError("Debes definir fecha inicio y fecha fin para el periodo personalizado.");
        return;
      }
    } else {
      startsAt = fromDateTimeLocalInput(discountCodeEditor.starts_at);
      endsAt = fromDateTimeLocalInput(discountCodeEditor.ends_at);
    }

    try {
      setDiscountCodeSaving(true);
      setDiscountCodeError(null);
      const payload = {
        code,
        discount_percent: percent,
        is_active: discountCodeEditor.is_active,
        max_uses: maxUses,
        starts_at: startsAt,
        ends_at: endsAt,
      };
      if (discountCodeEditingId) {
        await updateComercioWebDiscountCode(token, discountCodeEditingId, payload);
        showToast("Código actualizado con éxito.");
      } else {
        await createComercioWebDiscountCode(token, payload);
        showToast("Código creado con éxito.");
      }
      resetDiscountCodeEditor(true);
      await loadDiscountCodes();
    } catch (err) {
      setDiscountCodeError(err instanceof Error ? err.message : "No se pudo guardar el código");
      showToast("No se pudo guardar el código.", "error");
    } finally {
      setDiscountCodeSaving(false);
    }
  }

  async function handleToggleDiscountCode(row: ComercioWebDiscountCode) {
    if (!token || !canManage) return;
    try {
      setDiscountCodeSaving(true);
      setDiscountCodeError(null);
      await updateComercioWebDiscountCode(token, row.id, { is_active: !row.is_active });
      showToast(row.is_active ? "Código desactivado." : "Código activado.");
      await loadDiscountCodes();
    } catch (err) {
      setDiscountCodeError(err instanceof Error ? err.message : "No se pudo actualizar el estado");
      showToast("No se pudo actualizar el estado del código.", "error");
    } finally {
      setDiscountCodeSaving(false);
    }
  }

  function resetCategoryEditor() {
    setCatalogCategoryEditingId(null);
    setCatalogCategoryEditor(emptyCategoryEditorState);
    setCatalogCategoryKeyTouched(false);
  }

  function openCreateCatalogCategoryEditor() {
    resetCategoryEditor();
    setCatalogCategoryError(null);
    setCatalogCategoryEditorOpen(true);
  }

  function editCategoryRow(row: ComercioWebCatalogCategory) {
    const shouldFeature = Boolean(row.home_featured);
    const rawHomeOrder = Number(row.home_featured_order ?? 0);
    const normalizedHomeOrder =
      shouldFeature && rawHomeOrder <= 0
        ? nextAvailableHomeFeaturedOrder(row.id) || 0
        : rawHomeOrder;
    setCatalogCategoryEditingId(row.id);
    setCatalogCategoryEditor({
      key: row.key,
      name: row.name,
      parent_key: row.parent_key || "",
      image_url: row.image_url || "",
      tile_color: row.tile_color || "",
      home_featured: shouldFeature,
      home_featured_order: String(normalizedHomeOrder),
      sort_order: String(row.sort_order ?? 0),
      is_active: Boolean(row.is_active),
    });
    setCatalogCategoryKeyTouched(false);
    setCatalogCategoryError(null);
    setCatalogCategoryEditorOpen(true);
  }

  function handleCatalogCategoryNameChange(value: string) {
    setCatalogCategoryEditor((prev) => {
      const nextName = value;
      if (catalogCategoryKeyTouched) {
        return { ...prev, name: nextName };
      }
      const previousSuggested = normalizeCategoryKey(prev.name);
      const nextSuggested = normalizeCategoryKey(nextName);
      const currentKey = (prev.key || "").trim();
      const shouldUpdateKey = !currentKey || currentKey === previousSuggested;
      return {
        ...prev,
        name: nextName,
        key: shouldUpdateKey ? nextSuggested : prev.key,
      };
    });
  }

  function handleCatalogCategoryKeyChange(value: string) {
    setCatalogCategoryKeyTouched(true);
    setCatalogCategoryEditor((prev) => ({
      ...prev,
      key: normalizeCategoryKey(value),
    }));
  }

  async function handleCategoryImageFileChange(file: File) {
    if (!token) {
      showToast("Debes iniciar sesión para subir la imagen.", "error");
      return;
    }
    setCatalogCategoryImageUploading(true);
    setCatalogCategoryError(null);

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
      setCatalogCategoryEditor((prev) => ({
        ...prev,
        image_url: data.url || "",
      }));
      showToast("Imagen de categoría cargada con éxito.");
    } catch (err) {
      setCatalogCategoryError(
        err instanceof Error ? err.message : "No se pudo subir la imagen de categoría"
      );
      showToast("No se pudo subir la imagen de categoría.", "error");
    } finally {
      setCatalogCategoryImageUploading(false);
      if (categoryImageInputRef.current) categoryImageInputRef.current.value = "";
    }
  }

  async function handleSaveCatalogCategory() {
    if (!token || !canManage) return;
    const key = normalizeCategoryKey(catalogCategoryEditor.key.trim());
    const parentKey = normalizeCategoryKey(catalogCategoryEditor.parent_key.trim());
    const name = catalogCategoryEditor.name.trim();
    const imageUrl = catalogCategoryEditor.image_url.trim();
    const tileColor = catalogCategoryEditor.tile_color.trim();
    let homeFeaturedOrder = Number(catalogCategoryEditor.home_featured_order || "0");
    const featuredCountExcludingCurrent = catalogCategories.filter(
      (item) => item.home_featured && item.id !== catalogCategoryEditingId
    ).length;
    if (!key || !name) {
      setCatalogCategoryError("Debes completar clave y nombre.");
      return;
    }
    if (catalogCategoryEditor.home_featured && !catalogCategoryEditor.is_active) {
      setCatalogCategoryError(
        "Una categoría destacada en inicio debe estar visible en web."
      );
      return;
    }
    if (catalogCategoryEditor.home_featured && !imageUrl) {
      setCatalogCategoryError(
        "Para destacar una categoría en inicio debes configurar su imagen."
      );
      return;
    }
    if (
      catalogCategoryEditor.home_featured &&
      featuredCountExcludingCurrent >= MAX_HOME_FEATURED_CATEGORIES &&
      !catalogCategoryEditingId
    ) {
      setCatalogCategoryError(
        `Solo se permiten ${MAX_HOME_FEATURED_CATEGORIES} categorías destacadas en inicio.`
      );
      return;
    }
    if (catalogCategoryEditor.home_featured && featuredCountExcludingCurrent >= MAX_HOME_FEATURED_CATEGORIES) {
      const current = catalogCategories.find((item) => item.id === catalogCategoryEditingId);
      if (!current?.home_featured) {
        setCatalogCategoryError(
          `Solo se permiten ${MAX_HOME_FEATURED_CATEGORIES} categorías destacadas en inicio.`
        );
        return;
      }
    }
    if (Number.isNaN(homeFeaturedOrder) || homeFeaturedOrder < 0) {
      setCatalogCategoryError("El orden en inicio debe ser un número igual o mayor que 0.");
      return;
    }
    if (catalogCategoryEditor.home_featured) {
      if (homeFeaturedOrder === 0) {
        const nextOrder = nextAvailableHomeFeaturedOrder(catalogCategoryEditingId);
        if (!nextOrder) {
          setCatalogCategoryError(
            `No hay posiciones disponibles. Máximo ${MAX_HOME_FEATURED_CATEGORIES} destacadas.`
          );
          return;
        }
        homeFeaturedOrder = nextOrder;
      }
      if (homeFeaturedOrder < 1 || homeFeaturedOrder > MAX_HOME_FEATURED_CATEGORIES) {
        setCatalogCategoryError(
          `El orden en inicio debe estar entre 1 y ${MAX_HOME_FEATURED_CATEGORIES}.`
        );
        return;
      }
      const conflictingCategory = catalogCategories.find(
        (item) =>
          item.id !== catalogCategoryEditingId &&
          item.home_featured &&
          Number(item.home_featured_order || 0) === homeFeaturedOrder
      );
      if (conflictingCategory) {
        setCatalogCategoryError(
          `La posición ${homeFeaturedOrder} ya está ocupada por "${conflictingCategory.name}".`
        );
        return;
      }
    } else {
      homeFeaturedOrder = 0;
    }
    try {
      setCatalogCategorySaving(true);
      setCatalogCategoryError(null);
      const payload = {
        key,
        name,
        parent_key: parentKey || undefined,
        image_url: imageUrl || undefined,
        tile_color: tileColor || undefined,
        home_featured: catalogCategoryEditor.home_featured,
        home_featured_order: homeFeaturedOrder,
        sort_order: Number(catalogCategoryEditor.sort_order || "0"),
        is_active: catalogCategoryEditor.is_active,
      };
      if (catalogCategoryEditingId) {
        await updateComercioWebCatalogCategory(token, catalogCategoryEditingId, payload);
        showToast("Categoría actualizada.");
      } else {
        await createComercioWebCatalogCategory(token, payload);
        showToast("Categoría creada.");
      }
      resetCategoryEditor();
      setCatalogCategoryEditorOpen(false);
      await loadCatalogCategories();
    } catch (err) {
      setCatalogCategoryError(err instanceof Error ? err.message : "No se pudo guardar la categoría");
      showToast("No se pudo guardar la categoría.", "error");
    } finally {
      setCatalogCategorySaving(false);
    }
  }

  async function handleToggleCatalogCategoryVisibility(row: ComercioWebCatalogCategory) {
    if (!token || !canManage) return;
    try {
      setCatalogCategorySaving(true);
      setCatalogCategoryError(null);
      await updateComercioWebCatalogCategory(token, row.id, { is_active: !row.is_active });
      showToast(row.is_active ? "Categoría oculta en web." : "Categoría visible en web.");
      if (catalogCategoryEditingId === row.id) {
        setCatalogCategoryEditor((prev) => ({ ...prev, is_active: !row.is_active }));
      }
      await loadCatalogCategories();
    } catch (err) {
      setCatalogCategoryError(
        err instanceof Error ? err.message : "No se pudo actualizar la visibilidad."
      );
      showToast("No se pudo actualizar la visibilidad de la categoría.", "error");
    } finally {
      setCatalogCategorySaving(false);
    }
  }

  async function handleDeleteCatalogCategory(row: ComercioWebCatalogCategory) {
    if (!token || !canManage) return;
    const accepted = window.confirm(
      `¿Eliminar la categoría "${row.name}"? Esta acción no se puede deshacer.`
    );
    if (!accepted) return;
    try {
      setCatalogCategorySaving(true);
      setCatalogCategoryError(null);
      await deleteComercioWebCatalogCategory(token, row.id);
      showToast("Categoría eliminada.");
      if (catalogCategoryEditingId === row.id) resetCategoryEditor();
      await loadCatalogCategories();
    } catch (err) {
      setCatalogCategoryError(err instanceof Error ? err.message : "No se pudo eliminar la categoría");
      showToast("No se pudo eliminar la categoría.", "error");
    } finally {
      setCatalogCategorySaving(false);
    }
  }

  async function handleMoveCatalogCategory(
    row: ComercioWebCatalogCategory,
    direction: "up" | "down"
  ) {
    if (!token || !canManage) return;
    const currentIndex = orderedCatalogCategories.findIndex((item) => item.id === row.id);
    if (currentIndex < 0) return;
    const swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (swapIndex < 0 || swapIndex >= orderedCatalogCategories.length) return;
    const target = orderedCatalogCategories[swapIndex];
    try {
      setCatalogCategorySaving(true);
      setCatalogCategoryError(null);
      await updateComercioWebCatalogCategory(token, row.id, {
        sort_order: target.sort_order,
      });
      await updateComercioWebCatalogCategory(token, target.id, {
        sort_order: row.sort_order,
      });
      await loadCatalogCategories();
    } catch (err) {
      setCatalogCategoryError(err instanceof Error ? err.message : "No se pudo reordenar.");
      showToast("No se pudo mover la categoría.", "error");
    } finally {
      setCatalogCategorySaving(false);
    }
  }

  async function handleReorderCatalogCategoriesByDrag(
    sourceId: number,
    targetId: number,
    position: "before" | "after" = "before"
  ) {
    if (!token || !canManage || sourceId === targetId) return;
    const rows = [...orderedCatalogCategories];
    const sourceIndex = rows.findIndex((item) => item.id === sourceId);
    const targetIndex = rows.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    const [moved] = rows.splice(sourceIndex, 1);
    const targetIndexAfterRemoval = rows.findIndex((item) => item.id === targetId);
    if (targetIndexAfterRemoval < 0) return;
    const insertAt = position === "after" ? targetIndexAfterRemoval + 1 : targetIndexAfterRemoval;
    rows.splice(insertAt, 0, moved);

    try {
      setCatalogCategorySaving(true);
      setCatalogCategoryError(null);

      const updates = rows
        .map((item, index) => ({ id: item.id, sort_order: index * 10 }))
        .filter((item) => {
          const current = orderedCatalogCategories.find((row) => row.id === item.id);
          return (current?.sort_order ?? 0) !== item.sort_order;
        });

      await Promise.all(
        updates.map((item) =>
          updateComercioWebCatalogCategory(token, item.id, { sort_order: item.sort_order })
        )
      );
      await loadCatalogCategories();
    } catch (err) {
      setCatalogCategoryError(err instanceof Error ? err.message : "No se pudo reordenar.");
      showToast("No se pudo reordenar las categorías.", "error");
    } finally {
      setCatalogCategorySaving(false);
      setDraggedCategoryId(null);
      setDragOverCategoryId(null);
      setDragOverCategoryPosition(null);
    }
  }

  const selectedRemaining = selectedOrder
    ? Math.max(0, Number(selectedOrder.total || 0) - sumApprovedPayments(selectedOrder))
    : 0;
  const selectedCheckoutContext = useMemo(
    () => extractCheckoutContextFromOrderNotes(selectedOrder?.notes),
    [selectedOrder?.notes]
  );
  const selectedCheckoutContextEntries = useMemo(
    () => flattenCheckoutContextEntries(selectedCheckoutContext),
    [selectedCheckoutContext]
  );
  const catalogActionMeta = getCatalogActionMeta(catalogActionConfirm);
  const completePendingCatalogExit = useCallback(() => {
    if (!pendingCatalogExitAction) return;
    const action = pendingCatalogExitAction;
    setPendingCatalogExitAction(null);
    executeCatalogExitAction(action);
  }, [executeCatalogExitAction, pendingCatalogExitAction]);

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
                onClick={() => requestTabChange(tab.id)}
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

            <section className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
                <label className="flex flex-col gap-1 lg:w-[320px] lg:flex-none">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Buscar
                  </span>
                  <input
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") setSearch(searchInput);
                    }}
                    placeholder="Buscar por OW, cliente, correo o teléfono"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                  />
                </label>
                <label className="flex flex-col gap-1 lg:w-[190px] lg:flex-none">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Estado
                  </span>
                  <select
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none"
                  >
                    {ORDER_STATUS_OPTIONS.map((item) => (
                      <option key={item.value || "all"} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 lg:w-[190px] lg:flex-none">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Pago
                  </span>
                  <select
                    value={paymentStatus}
                    onChange={(event) => setPaymentStatus(event.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none"
                  >
                    {PAYMENT_STATUS_OPTIONS.map((item) => (
                      <option key={item.value || "all"} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-end lg:ml-1">
                  <button
                    type="button"
                    onClick={() => setSearch(searchInput)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400"
                  >
                    Aplicar
                  </button>
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => {
                      void loadOrders();
                    }}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800"
                  >
                    Refrescar
                  </button>
                </div>
              </div>
              {orderError ? <p className="mt-2 text-sm text-rose-600">{orderError}</p> : null}
            </section>

          <section className="grid gap-4 xl:grid-cols-2">
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
                  onJump={() => requestTabChange("orders")}
                  highlight="warning"
                />
                <QueueList
                  title="Órdenes listas para convertir"
                  emptyMessage="No hay órdenes con pago aprobado pendientes de ticket."
                  orders={readyToConvertOrders}
                  onSelect={setSelectedId}
                  onJump={() => requestTabChange("orders")}
                  highlight="info"
                />
                <QueueList
                  title="Fulfillment activo"
                  emptyMessage="No hay órdenes en preparación o listas para entrega."
                  orders={fulfillmentQueue}
                  onSelect={setSelectedId}
                  onJump={() => requestTabChange("orders")}
                  highlight="success"
                />
              </div>
            </SectionCard>

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
          </section>
          </section>
        ) : null}

        {activeTab === "catalog" ? (
          <section className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => requestWorkspaceChange("publications")}
                className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                  catalogWorkspaceView === "publications"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                }`}
              >
                Publicaciones
              </button>
              <button
                type="button"
                onClick={() => requestWorkspaceChange("discount_codes")}
                className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                  catalogWorkspaceView === "discount_codes"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                }`}
              >
                Códigos de descuento
              </button>
              <button
                type="button"
                onClick={() => requestWorkspaceChange("categories")}
                className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                  catalogWorkspaceView === "categories"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                }`}
              >
                Categorías
              </button>
            </div>
          </section>
          {catalogWorkspaceView === "publications" ? (
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

                <div className="w-full space-y-3">
                  <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-[minmax(16rem,1.5fr)_repeat(5,minmax(8.5rem,1fr))]">
                    <label className="block md:col-span-2 xl:col-span-1">
                      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Buscar
                      </span>
                      <input
                        value={publishedCatalogFilter}
                        onChange={(event) => setPublishedCatalogFilter(event.target.value)}
                        placeholder="Nombre, SKU, marca, grupo o badge"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Campo
                      </span>
                      <select
                        value={publishedCatalogFieldFilter}
                        onChange={(event) => setPublishedCatalogFieldFilter(event.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
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
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
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
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
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
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                      >
                        <option value="all">Todos</option>
                        <option value="with_badge">Con badge</option>
                        <option value="without_badge">Sin badge</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Orden
                      </span>
                      <select
                        value={publishedCatalogOrderFilter}
                        onChange={(event) =>
                          setPublishedCatalogOrderFilter(
                            event.target.value as "newest" | "oldest" | "alphabetical"
                          )
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                      >
                        <option value="newest">Más reciente</option>
                        <option value="oldest">Más antiguo</option>
                        <option value="alphabetical">Alfabético</option>
                      </select>
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="inline-flex min-h-[2.5rem] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        checked={publishedCatalogActiveOnly}
                        onChange={(event) => setPublishedCatalogActiveOnly(event.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      Mostrar solo activos
                    </label>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPublishedCatalogFilter("");
                          setPublishedCatalogFieldFilter("all");
                          setPublishedCatalogStatusFilter("all");
                          setPublishedCatalogFeaturedFilter("all");
                          setPublishedCatalogBadgeFilter("all");
                          setPublishedCatalogOrderFilter("newest");
                          setPublishedCatalogActiveOnly(true);
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
                          <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Imagen</th>
                          <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">SKU</th>
                          <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Marca / Cat. web</th>
                          <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Precio</th>
                          <th className="sticky top-0 z-10 w-[10rem] max-w-[10rem] bg-slate-50 px-4 py-3">
                            Estado
                          </th>
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
                            <td className="px-4 py-3">
                              {product.image_thumb_url || product.image_url ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCatalogAssetPreviewOpenUrl(
                                      resolveAssetUrl(product.image_thumb_url || product.image_url) ||
                                        product.image_thumb_url ||
                                        product.image_url ||
                                        null
                                    )
                                  }
                                  className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-100 transition hover:border-slate-300"
                                  aria-label={`Ver imagen principal de ${getCatalogDisplayName(product)}`}
                                  title="Ver imagen principal"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={
                                      resolveAssetUrl(product.image_thumb_url || product.image_url) ||
                                      product.image_thumb_url ||
                                      product.image_url ||
                                      ""
                                    }
                                    alt={`Miniatura ${getCatalogDisplayName(product)}`}
                                    className="h-full w-full object-cover"
                                  />
                                </button>
                              ) : (
                                <span className="text-xs text-slate-400">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              {product.sku || "sin SKU"}
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              <div>
                                <p>{product.brand || "sin marca"}</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {getWebCategoryLabel(product.web_category_key) || "sin categoría web"}
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
                            <td className="w-[10rem] max-w-[10rem] px-4 py-3">
                              <div className="w-[10rem] max-w-[10rem] overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                <div className="inline-flex min-w-max items-center gap-1">
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-[10px] font-medium leading-4 ${
                                    product.web_published
                                      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                      : "border-amber-300 bg-amber-50 text-amber-700"
                                  }`}
                                >
                                  {product.web_published ? "publicado" : "pausado"}
                                </span>
                                {product.web_featured ? (
                                  <span className="rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-[10px] font-medium leading-4 text-sky-700">
                                    destacado
                                  </span>
                                ) : null}
                                {product.web_badge_text ? (
                                  <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium leading-4 text-amber-700">
                                    {product.web_badge_text}
                                  </span>
                                ) : null}
                                {getDiscountBadgeTextFromProduct(product) ? (
                                  <span className="rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-[10px] font-medium leading-4 text-blue-700">
                                    {getDiscountBadgeTextFromProduct(product)}
                                  </span>
                                ) : null}
                                </div>
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
              headerActions={
                <button
                  type="button"
                  onClick={() => requestCatalogExit({ type: "close_composer" })}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                >
                  Volver a publicaciones
                </button>
              }
            >
              <div className="space-y-4">
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
                      <div className="max-h-[34rem] space-y-1 overflow-y-auto pr-1">
                        {!catalogSearchExecuted ? (
                          <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-sm text-slate-500">
                            La base maestra no se lista completa. Busca el producto que quieras convertir en publicación.
                          </div>
                        ) : catalogSearchResults.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-sm text-slate-500">
                            No encontramos productos para ese criterio.
                          </div>
                        ) : (
                          catalogSearchResults.map((product) => {
                            const isPublished = Boolean(product.web_published);
                            const isSelectable = !isPublished;
                            return (
                              <div
                                key={`search-${product.id}`}
                                className={`rounded-xl border px-2 py-1.5 transition ${
                                  selectedProductId === product.id
                                    ? "border-emerald-300 bg-emerald-50/70"
                                    : isSelectable
                                      ? "border-slate-200 bg-white hover:border-slate-300"
                                      : "border-slate-200 bg-slate-50/70"
                                }`}
                              >
                              <button
                                type="button"
                                onClick={() => {
                                  if (!isSelectable) return;
                                  setSelectedProductId(product.id);
                                }}
                                disabled={!isSelectable}
                                className={`w-full text-left ${isSelectable ? "" : "cursor-not-allowed opacity-80"}`}
                              >
                                <div className="flex items-start justify-between gap-1.5">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="truncate text-[13px] font-semibold leading-4 text-slate-900">
                                        {getCatalogDisplayName(product)}
                                      </span>
                                      {isPublished ? (
                                        <span className="rounded-full border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium leading-4 text-emerald-700">
                                          ya publicado
                                        </span>
                                      ) : (
                                        <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium leading-4 text-slate-600">
                                          no publicado
                                        </span>
                                      )}
                                    </div>
                                    <p className="mt-0.5 truncate text-[12px] leading-4 text-slate-700">
                                      {product.sku || "sin SKU"} · {product.brand || "sin marca"} ·{" "}
                                      {product.group_name || "sin grupo"}
                                    </p>
                                  </div>
                                  <div className="shrink-0 text-right">
                                    <p className="text-[13px] font-semibold leading-4 text-slate-900">
                                      {formatMoney(resolveWebSalePriceFromProduct(product))}
                                    </p>
                                  </div>
                                </div>
                              </button>
                              <div className="mt-1 flex flex-wrap gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!isSelectable) return;
                                    setSelectedProductId(product.id);
                                  }}
                                  disabled={!isSelectable}
                                  className="rounded-lg border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-700 transition disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Seleccionar
                                </button>
                                <button
                                  type="button"
                                  disabled={!canManage || isPublished}
                                  onClick={() => void handlePublishFromSearch(product)}
                                  className="rounded-lg bg-slate-900 px-1.5 py-0.5 text-[10px] font-medium text-white transition disabled:cursor-not-allowed disabled:bg-slate-300"
                                >
                                  {isPublished ? "Ya publicado" : "Crear publicación"}
                                </button>
                              </div>
                              </div>
                            );
                          })
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
                        <LabeledField label="Marca">
                          <div ref={brandAutocompleteRef} className="relative">
                            <input
                              value={catalogEditor.brand}
                              onFocus={() => setBrandSuggestionsOpen(true)}
                              onChange={(event) => {
                                handleCatalogField("brand", event.target.value);
                                setBrandSuggestionsOpen(true);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Escape") setBrandSuggestionsOpen(false);
                              }}
                              placeholder="Ej: Spain, Pro DJ, Yamaha"
                              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                            />
                            {brandSuggestionsOpen && filteredCatalogBrandOptions.length > 0 ? (
                              <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-300 bg-white shadow-lg">
                                {filteredCatalogBrandOptions.map((brandOption) => (
                                  <button
                                    key={brandOption}
                                    type="button"
                                    onMouseDown={(event) => {
                                      event.preventDefault();
                                      handleCatalogField("brand", brandOption);
                                      setBrandSuggestionsOpen(false);
                                    }}
                                    className="block w-full border-b border-slate-200 px-3 py-2 text-left text-sm text-slate-800 transition last:border-b-0 hover:bg-slate-100"
                                  >
                                    {brandOption}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </LabeledField>
                        <LabeledField label="Categoría web" required>
                          <select
                            value={catalogEditor.web_category_key}
                            onChange={(event) =>
                              handleCatalogField("web_category_key", event.target.value)
                            }
                            disabled={catalogCategoryLoading}
                            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                          >
                            <option value="">
                              {catalogCategoryLoading ? "Cargando categorías..." : "Selecciona una categoría"}
                            </option>
                            {activeCatalogCategories.map((option) => (
                              <option key={option.id} value={option.key}>
                                {option.parent_name ? `${option.parent_name} / ${option.name}` : option.name}
                              </option>
                            ))}
                            {selectedCatalogCategory && !selectedCatalogCategory.is_active ? (
                              <option value={selectedCatalogCategory.key}>
                                {selectedCatalogCategory.name} (inactiva)
                              </option>
                            ) : null}
                          </select>
                        </LabeledField>
                      </div>

                      <div className="grid gap-3 md:grid-cols-3">
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
                        <LabeledField label="Garantía (detalle)">
                          <select
                            value=""
                            onChange={(event) => {
                              const selected = event.target.value;
                              if (!selected) return;
                              handleCatalogField("web_warranty_text", selected);
                            }}
                            className="mb-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                          >
                            <option value="">Seleccionar opción rápida</option>
                            {WARRANTY_PRESET_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <input
                            value={catalogEditor.web_warranty_text}
                            onChange={(event) =>
                              handleCatalogField("web_warranty_text", event.target.value)
                            }
                            placeholder="Ej: Garantía de 12 meses"
                            maxLength={160}
                            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                          />
                          <p className="mt-1 text-xs text-slate-500">
                            Solo se muestra en el detalle del producto.
                          </p>
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
                              JPG, PNG o WebP. Recomendado: 1200x1200 px (1:1), hasta 3 imágenes. La primera será la principal.
                            </span>
                            <span className="text-xs text-slate-500">Arrastra para reordenar.</span>
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
                                    draggable
                                    onDragStart={() => handleGalleryDragStart(index)}
                                    onDragOver={(event) => {
                                      event.preventDefault();
                                      setDragOverGalleryIndex(index);
                                    }}
                                    onDrop={(event) => {
                                      event.preventDefault();
                                      handleGalleryDrop(index);
                                    }}
                                    onDragEnd={() => {
                                      setDraggedGalleryIndex(null);
                                      setDragOverGalleryIndex(null);
                                    }}
                                    className={`rounded-xl border bg-slate-50 p-2 transition ${
                                      dragOverGalleryIndex === index
                                        ? "border-blue-300 ring-1 ring-blue-200"
                                        : "border-slate-200"
                                    }`}
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
                                      {catalogEditor.brand.trim() ? (
                                        <span className="text-[11px] font-semibold tracking-[0.08em] text-slate-500">
                                          {catalogEditor.brand.trim()}
                                        </span>
                                      ) : null}
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
                              {catalogEditor.brand.trim() || "Sin marca"}
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
          ) : null}
          {catalogWorkspaceView === "categories" ? (
            <SectionCard
              title="Categorías web"
              subtitle="Gestiona las categorías que se usan para publicar y filtrar el catálogo web."
            >
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Gestión rápida
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    Destacadas en inicio:{" "}
                    <strong className="font-semibold text-slate-800">{homeFeaturedCategoryCount}</strong>{" "}
                    · Máximo: {MAX_HOME_FEATURED_CATEGORIES} categorías.
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Doble click sobre cualquier fila para editar más rápido.
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    También puedes arrastrar filas para cambiar el orden en catálogo.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!canManage || catalogCategorySaving}
                      onClick={openCreateCatalogCategoryEditor}
                      className="rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed"
                      style={{
                        backgroundColor: canManage ? "#2563eb" : "#bfdbfe",
                        borderColor: canManage ? "#1d4ed8" : "#93c5fd",
                        color: canManage ? "#ffffff" : "#1e3a8a",
                      }}
                    >
                      + Nueva categoría
                    </button>
                    <button
                      type="button"
                      onClick={() => void loadCatalogCategories()}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                    >
                      Refrescar categorías
                    </button>
                  </div>
                  {catalogCategoryError ? (
                    <p className="mt-2 text-xs text-rose-600">{catalogCategoryError}</p>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">
                      Los errores de validación se muestran dentro del modal de creación/edición.
                    </p>
                  )}
                </div>

                <div className="max-h-[30rem] overflow-auto rounded-2xl border border-slate-200">
                  {catalogCategoryLoading ? (
                    <div className="px-4 py-8 text-sm text-slate-500">Cargando categorías…</div>
                  ) : catalogCategories.length === 0 ? (
                    <div className="px-4 py-8 text-sm text-slate-500">
                      Aún no hay categorías configuradas.
                    </div>
                  ) : (
                    <table className="min-w-full text-sm">
                      <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        <tr>
                          <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Clave</th>
                          <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Nombre</th>
                          <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Destacada inicio</th>
                          <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Prioridad inicio</th>
                          <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Imagen</th>
                          <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Orden catálogo</th>
                          <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Productos</th>
                          <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Estado</th>
                          <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderedCatalogCategories.map((row, index) => (
                          <tr
                            key={row.id}
                            draggable={!catalogCategorySaving}
                            onDragStart={(event) => {
                              if (shouldSkipRowDrag(event.target)) {
                                event.preventDefault();
                                return;
                              }
                              setDraggedCategoryId(row.id);
                              setDragOverCategoryId(row.id);
                              setDragOverCategoryPosition("before");
                              event.dataTransfer.effectAllowed = "move";
                              const ghost = document.createElement("div");
                              ghost.style.position = "fixed";
                              ghost.style.top = "-1000px";
                              ghost.style.left = "-1000px";
                              ghost.style.padding = "10px 14px";
                              ghost.style.borderRadius = "10px";
                              ghost.style.border = "1px solid #93c5fd";
                              ghost.style.background = "#eff6ff";
                              ghost.style.color = "#1e3a8a";
                              ghost.style.fontSize = "13px";
                              ghost.style.fontWeight = "600";
                              ghost.style.boxShadow = "0 8px 18px -10px rgba(15,23,42,0.55)";
                              ghost.textContent = `${row.name} (${row.key})`;
                              document.body.appendChild(ghost);
                              event.dataTransfer.setDragImage(ghost, 16, 16);
                              window.setTimeout(() => {
                                if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
                              }, 0);
                            }}
                            onDragOver={(event) => {
                              event.preventDefault();
                              if (draggedCategoryId !== null && draggedCategoryId !== row.id) {
                                setDragOverCategoryId(row.id);
                                const rect = event.currentTarget.getBoundingClientRect();
                                const isAfter = event.clientY > rect.top + rect.height / 2;
                                setDragOverCategoryPosition(isAfter ? "after" : "before");
                              }
                            }}
                            onDragLeave={(event) => {
                              if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                                if (dragOverCategoryId === row.id) {
                                  setDragOverCategoryPosition(null);
                                }
                              }
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              if (draggedCategoryId !== null) {
                                void handleReorderCatalogCategoriesByDrag(
                                  draggedCategoryId,
                                  row.id,
                                  dragOverCategoryPosition || "before"
                                );
                              }
                            }}
                            onDragEnd={() => {
                              setDraggedCategoryId(null);
                              setDragOverCategoryId(null);
                              setDragOverCategoryPosition(null);
                            }}
                            className={`border-b border-slate-100 hover:bg-slate-50/50 ${
                              draggedCategoryId === row.id
                                ? "bg-blue-50/60 opacity-80 ring-1 ring-blue-200"
                                : ""
                            } ${
                              dragOverCategoryId === row.id && draggedCategoryId !== row.id
                                ? "bg-blue-50/60"
                                : ""
                            } ${
                              dragOverCategoryId === row.id &&
                              draggedCategoryId !== row.id &&
                              dragOverCategoryPosition === "before"
                                ? "border-t-4 border-t-blue-400"
                                : ""
                            } ${
                              dragOverCategoryId === row.id &&
                              draggedCategoryId !== row.id &&
                              dragOverCategoryPosition === "after"
                                ? "border-b-4 border-b-blue-400"
                                : ""
                            }`}
                            onDoubleClick={() => editCategoryRow(row)}
                            title="Doble click para editar"
                          >
                            <td className="px-4 py-3 font-mono text-xs text-slate-700">{row.key}</td>
                            <td className="px-4 py-3 font-medium text-slate-900">
                              <span>{row.level && row.level > 1 ? "↳ " : ""}{row.name}</span>
                              {row.parent_name ? (
                                <p className="mt-0.5 text-xs font-normal text-slate-500">
                                  Padre: {row.parent_name}
                                </p>
                              ) : null}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                                  row.home_featured
                                    ? "border-amber-300 bg-amber-100 text-amber-800"
                                    : "border-slate-300 bg-slate-100 text-slate-600"
                                }`}
                              >
                                {row.home_featured ? "sí" : "no"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-700">{row.home_featured_order ?? 0}</td>
                            <td className="px-4 py-3 text-slate-700">
                              {row.image_url ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCatalogAssetPreviewOpenUrl(
                                      resolveAssetUrl(row.image_url) || row.image_url || null
                                    )
                                  }
                                  className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-100 transition hover:border-slate-300"
                                  aria-label={`Ver imagen de ${row.name}`}
                                  title="Ver imagen"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={resolveAssetUrl(row.image_url) || row.image_url}
                                    alt={`Miniatura ${row.name}`}
                                    className="h-full w-full object-cover"
                                  />
                                </button>
                              ) : (
                                "Sin imagen"
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-700">{row.sort_order}</td>
                            <td className="px-4 py-3 text-slate-700">{row.product_count}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                                  row.is_active
                                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                    : "border-slate-300 bg-slate-100 text-slate-600"
                                }`}
                              >
                                {row.is_active ? "activa" : "inactiva"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  disabled={!canManage || catalogCategorySaving || index === 0}
                                  onClick={() => void handleMoveCatalogCategory(row, "up")}
                                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                                  title="Subir"
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  disabled={
                                    !canManage ||
                                    catalogCategorySaving ||
                                    index === orderedCatalogCategories.length - 1
                                  }
                                  onClick={() => void handleMoveCatalogCategory(row, "down")}
                                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                                  title="Bajar"
                                >
                                  ↓
                                </button>
                                <button
                                  type="button"
                                  disabled={!canManage || catalogCategorySaving}
                                  onClick={() => void handleToggleCatalogCategoryVisibility(row)}
                                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                    row.is_active
                                      ? "border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300"
                                      : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300"
                                  }`}
                                >
                                  {row.is_active ? "Ocultar" : "Mostrar"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => editCategoryRow(row)}
                                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  disabled={!canManage || catalogCategorySaving}
                                  onClick={() => void handleDeleteCatalogCategory(row)}
                                  className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-700 transition hover:border-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Eliminar
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </SectionCard>
          ) : null}
          {catalogWorkspaceView === "discount_codes" ? (
            <SectionCard
              title="Códigos de descuento"
              subtitle="Crea, activa y controla vigencia de códigos promocionales para el canal web."
            >
              <div className="space-y-4">
                {!discountCodeComposerOpen ? (
                  <div>
                    <button
                      type="button"
                      disabled={!canManage || discountCodeSaving}
                      onClick={openCreateDiscountCodeComposer}
                      className="rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed"
                      style={{
                        backgroundColor: canManage && !discountCodeSaving ? "#2563eb" : "#bfdbfe",
                        borderColor: canManage && !discountCodeSaving ? "#1d4ed8" : "#93c5fd",
                        color: canManage && !discountCodeSaving ? "#ffffff" : "#1e3a8a",
                      }}
                    >
                      + Crear cupón
                    </button>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      {discountCodeEditingId ? "Editar cupón" : "Crear cupón"}
                    </p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-7">
                      <input
                        value={discountCodeEditor.code}
                        onChange={(event) =>
                          setDiscountCodeEditor((prev) => ({
                            ...prev,
                            code: event.target.value.toUpperCase(),
                          }))
                        }
                        placeholder="Código (ej: KENSAR10)"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                      />
                      <input
                        type="number"
                        min={1}
                        max={100}
                        step={0.1}
                        value={discountCodeEditor.discount_percent}
                        onChange={(event) =>
                          setDiscountCodeEditor((prev) => ({ ...prev, discount_percent: event.target.value }))
                        }
                        placeholder="% descuento"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                      />
                      <select
                        value={discountCodeEditor.period}
                        onChange={(event) =>
                          handleDiscountCodePeriodChange(event.target.value as DiscountCodePeriodOption)
                        }
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                      >
                        {DISCOUNT_PERIOD_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={discountCodeEditor.max_uses}
                        onChange={(event) =>
                          setDiscountCodeEditor((prev) => ({ ...prev, max_uses: event.target.value }))
                        }
                        placeholder="Uso máximo (opcional)"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                      />
                      <input
                        type="datetime-local"
                        value={discountCodeEditor.starts_at}
                        onChange={(event) =>
                          setDiscountCodeEditor((prev) => ({ ...prev, starts_at: event.target.value }))
                        }
                        disabled={discountCodeEditor.period !== "custom"}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                      />
                      <input
                        type="datetime-local"
                        value={discountCodeEditor.ends_at}
                        onChange={(event) =>
                          setDiscountCodeEditor((prev) => ({ ...prev, ends_at: event.target.value }))
                        }
                        disabled={discountCodeEditor.period !== "custom"}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                      />
                      <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={discountCodeEditor.is_active}
                          onChange={(event) =>
                            setDiscountCodeEditor((prev) => ({ ...prev, is_active: event.target.checked }))
                          }
                        />
                        Activo
                      </label>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!canManage || discountCodeSaving}
                        onClick={() => void handleSaveDiscountCode()}
                        className="rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed"
                        style={{
                          backgroundColor: canManage && !discountCodeSaving ? "#2563eb" : "#bfdbfe",
                          borderColor: canManage && !discountCodeSaving ? "#1d4ed8" : "#93c5fd",
                          color: canManage && !discountCodeSaving ? "#ffffff" : "#1e3a8a",
                        }}
                      >
                        {discountCodeSaving
                          ? "Guardando..."
                          : discountCodeEditingId
                            ? "Guardar cambios"
                            : "Crear cupón"}
                      </button>
                      <button
                        type="button"
                        onClick={() => resetDiscountCodeEditor(true)}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                      >
                        Cancelar
                      </button>
                    </div>
                    {discountCodeError ? (
                      <p className="mt-2 text-sm text-rose-600">{discountCodeError}</p>
                    ) : null}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">Tabla de códigos</h3>
                  <span className="text-xs text-slate-500">
                    Mostrando {discountCodeStartIndex}-{discountCodeEndIndex} de {discountCodeTotal}
                  </span>
                </div>

                <div className="max-h-[30rem] overflow-auto rounded-2xl border border-slate-200">
                  {discountCodeLoading ? (
                    <div className="px-4 py-8 text-sm text-slate-500">Cargando códigos…</div>
                  ) : discountCodeRows.length === 0 ? (
                    <div className="px-4 py-8 text-sm text-slate-500">
                      Aún no hay códigos de descuento configurados.
                    </div>
                  ) : (
                    <table className="min-w-full text-sm">
                      <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        <tr>
                          <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Código</th>
                          <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Descuento</th>
                          <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Uso</th>
                          <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Inicio</th>
                          <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Fin</th>
                          <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Estado</th>
                          <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {discountCodeRows.map((row) => (
                          <tr key={row.id} className="border-b border-slate-100">
                            <td className="px-4 py-3 font-semibold text-slate-900">{row.code}</td>
                            <td className="px-4 py-3 text-slate-700">{row.discount_percent}%</td>
                            <td className="px-4 py-3 text-slate-700">
                              {row.max_uses ? `${row.uses_count || 0} / ${row.max_uses}` : "Ilimitado"}
                            </td>
                            <td className="px-4 py-3 text-slate-700">{formatDateTime(row.starts_at)}</td>
                            <td className="px-4 py-3 text-slate-700">{formatDateTime(row.ends_at)}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                                  row.is_active
                                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                    : "border-slate-300 bg-slate-100 text-slate-600"
                                }`}
                              >
                                {row.is_active ? "activo" : "inactivo"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => editDiscountCodeRow(row)}
                                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  disabled={!canManage || discountCodeSaving}
                                  onClick={() => void handleToggleDiscountCode(row)}
                                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {row.is_active ? "Desactivar" : "Activar"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                {discountCodeTotal > 0 ? (
                  <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs text-slate-600">
                      Página {discountCodePage} de {discountCodeTotalPages}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDiscountCodePage((prev) => Math.max(1, prev - 1))}
                        disabled={discountCodePage <= 1}
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDiscountCodePage((prev) => Math.min(discountCodeTotalPages, prev + 1))
                        }
                        disabled={discountCodePage >= discountCodeTotalPages}
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
          </section>
        ) : null}

        {activeTab === "orders" ? (
          <section className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
                <label className="flex flex-col gap-1 lg:w-[320px] lg:flex-none">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Buscar
                  </span>
                  <input
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") setSearch(searchInput);
                    }}
                    placeholder="OW, cliente o correo"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                  />
                </label>
                <label className="flex flex-col gap-1 lg:w-[190px] lg:flex-none">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Estado
                  </span>
                  <select
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none"
                  >
                    {ORDER_STATUS_OPTIONS.map((item) => (
                      <option key={item.value || "all"} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 lg:w-[190px] lg:flex-none">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Pago
                  </span>
                  <select
                    value={paymentStatus}
                    onChange={(event) => setPaymentStatus(event.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none"
                  >
                    {PAYMENT_STATUS_OPTIONS.map((item) => (
                      <option key={item.value || "all"} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-end lg:ml-1">
                  <button
                    type="button"
                    onClick={() => setSearch(searchInput)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400"
                  >
                    Aplicar
                  </button>
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => void loadOrders()}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800"
                  >
                    Refrescar
                  </button>
                </div>
              </div>
              {orderError ? <p className="mt-2 text-sm text-rose-600">{orderError}</p> : null}
            </section>

            <section className="grid gap-4 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <SectionCard
                  title="Órdenes"
                  subtitle={`Lista operativa del canal web (${orders.length})`}
                >
                {loadingOrders ? (
                  <div className="py-8 text-sm text-slate-500">Cargando órdenes…</div>
                ) : orders.length === 0 ? (
                  <div className="py-8 text-sm text-slate-500">No hay órdenes para los filtros actuales.</div>
                ) : (
                  <div className="max-h-[68vh] space-y-2 overflow-y-auto pr-1">
                    {orders.map((order) => (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => setSelectedId(order.id)}
                        className={`w-full rounded-2xl border px-3.5 py-3 text-left transition ${
                          selectedId === order.id
                            ? "border-emerald-300 bg-emerald-50/70"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {order.document_number || `Orden #${order.id}`}
                            </p>
                            <p className="mt-1 truncate text-xs text-slate-600">
                              {order.customer_name || "Cliente web"} · {getPrimaryContact(order)}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusBadgeClass(order.status)}`}>
                                {translateOrderStatus(order.status)}
                              </span>
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusBadgeClass(order.payment_status)}`}>
                                {translatePaymentStatus(order.payment_status)}
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] text-slate-500">
                              {order.items.length} item{order.items.length === 1 ? "" : "s"} · {formatDateTime(order.created_at)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-base font-semibold text-slate-900">{formatMoney(order.total)}</p>
                            {order.sale_document_number ? (
                              <p className="mt-1 text-[11px] font-medium text-emerald-700">Venta {order.sale_document_number}</p>
                            ) : (
                              <p className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${conversionBadgeClass(order)}`}>
                                {conversionBadgeLabel(order)}
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                </SectionCard>
              </div>

              <div className="lg:col-span-7">
                <SectionCard title="Detalle operativo" subtitle="Resumen, productos, pagos, timeline y acciones.">
                  {!selectedOrder ? (
                    <div className="text-sm text-slate-500">Selecciona una orden de la lista para ver el detalle.</div>
                  ) : (
                    <div className="max-h-[68vh] space-y-5 overflow-y-auto pr-1">
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
                    <InfoPill label="Estado" value={translateOrderStatus(selectedOrder.status)} />
                    <InfoPill label="Pago" value={translatePaymentStatus(selectedOrder.payment_status)} />
                    <InfoPill label="Fulfillment" value={translateFulfillmentStatus(selectedOrder.fulfillment_status)} />
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-slate-900">
                        Datos capturados en checkout web
                      </h3>
                      <span className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
                        {selectedCheckoutContextEntries.length} campo(s)
                      </span>
                    </div>
                    {selectedCheckoutContextEntries.length === 0 ? (
                      <p className="mt-3 text-sm text-slate-600">
                        Esta orden no tiene contexto extendido de checkout almacenado.
                      </p>
                    ) : (
                      <div className="mt-3 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white">
                        <div className="divide-y divide-slate-100">
                          {selectedCheckoutContextEntries.map((entry, index) => (
                            <div key={`${entry.key}-${index}`} className="grid gap-1 px-3 py-2 md:grid-cols-[0.45fr,0.55fr]">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                                {formatCheckoutContextKey(entry.key)}
                              </p>
                              <p className="break-words text-sm text-slate-800">{entry.value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">Estado de conversión a venta</p>
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${conversionBadgeClass(selectedOrder)}`}>
                        {conversionBadgeLabel(selectedOrder)}
                      </span>
                    </div>
                    {isOrderConverted(selectedOrder) ? (
                      <div className="mt-3 space-y-1.5 text-sm text-slate-700">
                        <p>
                          Documento de venta:{" "}
                          <span className="font-semibold text-slate-900">
                            {selectedOrder.sale_document_number || `#${selectedOrder.sale_id}`}
                          </span>
                        </p>
                        {selectedOrder.converted_to_sale_at ? (
                          <p className="text-xs text-slate-500">
                            Convertida el {formatDateTime(selectedOrder.converted_to_sale_at)}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-slate-600">
                        Esta orden aún no tiene ticket de venta (`V-*`) generado.
                      </p>
                    )}
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
                                  {log.from_status ? `${translateOrderStatus(log.from_status)} → ` : ""}{translateOrderStatus(log.to_status)}
                                </p>
                                <span className="text-xs text-slate-500">{formatDateTime(log.created_at)}</span>
                              </div>
                              <p className="mt-1 text-xs text-slate-500">
                                Actor: {translateTimelineActorType(log.actor_type)}{log.actor_user_id ? ` #${log.actor_user_id}` : ""}
                              </p>
                              <p className="mt-2 text-xs text-slate-700">{translateTimelineNote(log.note)}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                  </div>
                )}
                </SectionCard>
              </div>
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
                      requestTabChange("orders");
                    }}
                    className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-slate-300"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {payment.orderDocument} · {formatPaymentLabel(payment.method)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {payment.customerName} · {formatPaymentLabel(payment.provider)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900">{formatMoney(payment.amount)}</p>
                      <span className={`mt-1 inline-flex rounded-full border px-2 py-1 text-[11px] font-medium ${statusBadgeClass(payment.status)}`}>{translatePaymentStatus(payment.status)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Ledger de pagos" subtitle="Útil para auditoría rápida del canal web.">
              {paymentRows.length === 0 ? (
                <div className="text-sm text-slate-500">Aún no hay pagos registrados.</div>
              ) : (
                <>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <p>
                    Mostrando <strong>{paymentsLedgerStart}</strong>–<strong>{paymentsLedgerEnd}</strong> de{" "}
                    <strong>{paymentRows.length}</strong> pagos consolidados.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentsLedgerPage((current) => Math.max(1, current - 1))}
                      disabled={paymentsLedgerPage <= 1}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Anterior
                    </button>
                    <span className="rounded-md border border-slate-200 bg-white px-2 py-1">
                      Página {paymentsLedgerPage} / {paymentsLedgerTotalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setPaymentsLedgerPage((current) => Math.min(paymentsLedgerTotalPages, current + 1))
                      }
                      disabled={paymentsLedgerPage >= paymentsLedgerTotalPages}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                      <tr>
                        <th className="px-3 py-3">Fecha</th>
                        <th className="px-3 py-3">Documento</th>
                        <th className="px-3 py-3">Cliente</th>
                        <th className="px-3 py-3">Método</th>
                        <th className="px-3 py-3">Proveedor</th>
                        <th className="px-3 py-3">Referencia</th>
                        <th className="px-3 py-3">Estado</th>
                        <th className="px-3 py-3 text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedPaymentRows.map((payment) => (
                        <tr key={payment.paymentId} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-3 py-3 text-slate-600">{formatDateTime(payment.createdAt)}</td>
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedId(payment.orderId);
                                requestTabChange("orders");
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
                          <td className="px-3 py-3 text-slate-700">
                            <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium">
                              {formatPaymentLabel(payment.method)}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-slate-700">
                            <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium">
                              {formatPaymentLabel(payment.provider)}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-xs font-mono text-slate-600">{payment.providerReference}</td>
                          <td className="px-3 py-3">
                            <span className={`rounded-full border px-2 py-1 text-[11px] font-medium ${statusBadgeClass(payment.status)}`}>{translatePaymentStatus(payment.status)}</span>
                          </td>
                          <td className="px-3 py-3 text-right font-semibold text-slate-900">{formatMoney(payment.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </>
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

        {catalogCategoryEditorOpen ? (
          <div
            className="fixed inset-0 z-[998] flex items-center justify-center bg-slate-900/35 px-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    {catalogCategoryEditingId ? "Editar categoría" : "Crear categoría"}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Configura visibilidad, orden e imagen para el catálogo y el inicio.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCatalogCategoryEditorOpen(false);
                    resetCategoryEditor();
                    setCatalogCategoryError(null);
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                >
                  Cerrar
                </button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div className="grid gap-1">
                  <label className="text-xs font-medium text-slate-600">Nombre visible</label>
                  <input
                    value={catalogCategoryEditor.name}
                    onChange={(event) => handleCatalogCategoryNameChange(event.target.value)}
                    placeholder="Ej: Audio profesional"
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                  />
                </div>
                <div className="grid gap-1">
                  <label className="text-xs font-medium text-slate-600">Clave de categoría</label>
                  <input
                    value={catalogCategoryEditor.key}
                    onChange={(event) => handleCatalogCategoryKeyChange(event.target.value)}
                    placeholder="Ej: audio-profesional"
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                  />
                </div>
                <div className="grid gap-1">
                  <label className="text-xs font-medium text-slate-600">Categoría padre</label>
                  <select
                    value={catalogCategoryEditor.parent_key}
                    onChange={(event) =>
                      setCatalogCategoryEditor((prev) => ({
                        ...prev,
                        parent_key: event.target.value,
                      }))
                    }
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                  >
                    <option value="">Sin categoría padre (principal)</option>
                    {availableParentCatalogCategories.map((option) => (
                      <option key={option.id} value={option.key}>
                        {option.parent_name ? `${option.parent_name} / ${option.name}` : option.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1">
                  <label className="text-xs font-medium text-slate-600">Orden en catálogo</label>
                  <input
                    type="number"
                    value={catalogCategoryEditor.sort_order}
                    onChange={(event) =>
                      setCatalogCategoryEditor((prev) => ({
                        ...prev,
                        sort_order: event.target.value,
                      }))
                    }
                    placeholder="0"
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                  />
                </div>

                <div className="md:col-span-2 xl:col-span-2 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-slate-600">Imagen de la categoría</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={catalogCategoryImageUploading}
                        onClick={() => categoryImageInputRef.current?.click()}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {catalogCategoryImageUploading ? "Subiendo..." : "Subir imagen"}
                      </button>
                      {catalogCategoryEditor.image_url ? (
                        <button
                          type="button"
                          onClick={() =>
                            setCatalogCategoryEditor((prev) => ({
                              ...prev,
                              image_url: "",
                            }))
                          }
                          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:border-rose-300"
                        >
                          Quitar
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    Formatos: JPG, PNG o WebP. Recomendado: 1200x1200 px (1:1) para mejor ajuste en tarjetas.
                  </p>
                  <input
                    ref={categoryImageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      void handleCategoryImageFileChange(file);
                    }}
                  />
                  <div className="flex items-center gap-3">
                    <span
                      className="h-14 w-14 shrink-0 rounded-lg border border-slate-200 bg-slate-100 bg-cover bg-center bg-no-repeat"
                      style={
                        catalogCategoryEditor.image_url
                          ? {
                              backgroundImage: `url('${resolveAssetUrl(catalogCategoryEditor.image_url) || catalogCategoryEditor.image_url}')`,
                            }
                          : undefined
                      }
                      aria-hidden="true"
                    />
                    <p className="min-w-0 truncate text-xs text-slate-500">
                      {catalogCategoryEditor.image_url || "Sin imagen cargada"}
                    </p>
                  </div>
                </div>

                <div className="grid gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <label className="text-xs font-medium text-slate-600">Color del mosaico</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={catalogCategoryEditor.tile_color || "#e8eef8"}
                      onChange={(event) =>
                        setCatalogCategoryEditor((prev) => ({
                          ...prev,
                          tile_color: event.target.value,
                        }))
                      }
                      className="h-9 w-12 cursor-pointer rounded-md border border-slate-200 bg-white p-1"
                    />
                    <span className="text-xs text-slate-500">
                      {catalogCategoryEditor.tile_color || "#E8EEF8"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {["#E8EEF8", "#E2ECFF", "#E8F3E8", "#FFF1CC", "#FCE7E7"].map((swatch) => (
                      <button
                        key={swatch}
                        type="button"
                        onClick={() =>
                          setCatalogCategoryEditor((prev) => ({
                            ...prev,
                            tile_color: swatch,
                          }))
                        }
                        className="h-6 w-6 rounded-full border border-slate-200"
                        style={{ backgroundColor: swatch }}
                        aria-label={`Seleccionar color ${swatch}`}
                        title={swatch}
                      />
                    ))}
                  </div>
                </div>

                <div className="grid gap-1">
                  <label className="text-xs font-medium text-slate-600">Orden en inicio</label>
                  <select
                    value={catalogCategoryEditor.home_featured_order}
                    onChange={(event) =>
                      setCatalogCategoryEditor((prev) => ({
                        ...prev,
                        home_featured_order: event.target.value,
                      }))
                    }
                    disabled={!catalogCategoryEditor.home_featured}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                  >
                    {Array.from({ length: MAX_HOME_FEATURED_CATEGORIES }, (_, index) => {
                      const value = String(index + 1);
                      return (
                        <option key={`home-order-${value}`} value={value}>
                          Posición {value}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={catalogCategoryEditor.home_featured}
                    onChange={(event) => {
                      const shouldFeature = event.target.checked;
                      if (!shouldFeature) {
                        setCatalogCategoryEditor((prev) => ({
                          ...prev,
                          home_featured: false,
                          home_featured_order: "0",
                        }));
                        setCatalogCategoryError(null);
                        return;
                      }
                      const featuredCountExcludingCurrent = catalogCategories.filter(
                        (item) => item.home_featured && item.id !== catalogCategoryEditingId
                      ).length;
                      const currentRow = catalogCategories.find(
                        (item) => item.id === catalogCategoryEditingId
                      );
                      if (
                        featuredCountExcludingCurrent >= MAX_HOME_FEATURED_CATEGORIES &&
                        !currentRow?.home_featured
                      ) {
                        setCatalogCategoryError(
                          `Solo se permiten ${MAX_HOME_FEATURED_CATEGORIES} categorías destacadas en inicio.`
                        );
                        return;
                      }
                      const nextOrder = nextAvailableHomeFeaturedOrder(catalogCategoryEditingId);
                      setCatalogCategoryEditor((prev) => ({
                        ...prev,
                        home_featured: true,
                        home_featured_order:
                          prev.home_featured_order !== "0"
                            ? prev.home_featured_order
                            : String(nextOrder || 1),
                      }));
                      setCatalogCategoryError(null);
                    }}
                  />
                  Destacar en inicio
                </label>
                <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={catalogCategoryEditor.is_active}
                    onChange={(event) =>
                      setCatalogCategoryEditor((prev) => ({
                        ...prev,
                        is_active: event.target.checked,
                      }))
                    }
                  />
                  Visible en web
                </label>
              </div>

              {suggestedCatalogCategoryKey &&
              suggestedCatalogCategoryKey !== catalogCategoryEditor.key ? (
                <div className="mt-2 text-xs text-slate-500">
                  Sugerida:{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setCatalogCategoryEditor((prev) => ({
                        ...prev,
                        key: suggestedCatalogCategoryKey,
                      }));
                      setCatalogCategoryKeyTouched(false);
                    }}
                    className="font-semibold text-emerald-700 underline decoration-dotted underline-offset-2"
                  >
                    {suggestedCatalogCategoryKey}
                  </button>
                </div>
              ) : null}

              {catalogCategoryError ? (
                <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {catalogCategoryError}
                </p>
              ) : null}

              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCatalogCategoryEditorOpen(false);
                    resetCategoryEditor();
                    setCatalogCategoryError(null);
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!canManage || catalogCategorySaving}
                  onClick={() => void handleSaveCatalogCategory()}
                  className="rounded-xl border border-blue-700 bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300 disabled:text-slate-500"
                >
                  {catalogCategorySaving
                    ? "Guardando..."
                    : catalogCategoryEditingId
                      ? "Guardar cambios"
                      : "Crear categoría"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {catalogAssetPreviewOpenUrl ? (
          <div
            className="fixed inset-0 z-[998] flex items-center justify-center bg-slate-900/45 px-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
              <div className="mb-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => setCatalogAssetPreviewOpenUrl(null)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                >
                  Cerrar
                </button>
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={catalogAssetPreviewOpenUrl}
                  alt="Preview imagen"
                  className="h-auto max-h-[70vh] w-full object-contain"
                />
              </div>
            </div>
          </div>
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
                  onClick={() => {
                    setCatalogSavePublishPromptOpen(false);
                    setPendingCatalogExitAction(null);
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={catalogSaving}
                  onClick={() => {
                    setCatalogSavePublishPromptOpen(false);
                    void handleSaveCatalogProduct(
                      false,
                      pendingCatalogExitAction ? completePendingCatalogExit : undefined
                    );
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
                    void handleSaveCatalogProduct(
                      true,
                      pendingCatalogExitAction ? completePendingCatalogExit : undefined
                    );
                  }}
                  className="button-primary rounded-xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Guardar y publicar
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {catalogExitPromptOpen ? (
          <div
            className="fixed inset-0 z-[998] flex items-center justify-center bg-slate-900/35 px-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
              <h3 className="text-base font-semibold text-slate-900">Tienes cambios sin guardar</h3>
              <p className="mt-2 text-sm text-slate-600">
                ¿Quieres guardar antes de salir del editor de publicación?
              </p>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={catalogSaving}
                  onClick={() => {
                    setCatalogExitPromptOpen(false);
                    setPendingCatalogExitAction(null);
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={catalogSaving}
                  onClick={() => {
                    const nextAction = pendingCatalogExitAction;
                    setCatalogExitPromptOpen(false);
                    setPendingCatalogExitAction(null);
                    executeCatalogExitAction(nextAction);
                  }}
                  className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition hover:border-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Descartar cambios
                </button>
                <button
                  type="button"
                  disabled={catalogSaving}
                  onClick={() => {
                    setCatalogExitPromptOpen(false);
                    if (shouldPromptPublishOnSave()) {
                      setCatalogSavePublishPromptOpen(true);
                      return;
                    }
                    void handleSaveCatalogProduct(
                      undefined,
                      pendingCatalogExitAction ? completePendingCatalogExit : undefined
                    );
                  }}
                  className="rounded-xl border border-blue-700 bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300 disabled:text-slate-500"
                >
                  Guardar y salir
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
                <p className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${conversionBadgeClass(order)}`}>
                  {conversionBadgeLabel(order)}
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
          <span className={`mt-1 inline-flex rounded-full border px-2 py-1 text-[11px] font-medium ${statusBadgeClass(payment.status)}`}>{translatePaymentStatus(payment.status)}</span>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">{formatDateTime(payment.created_at)}</p>
    </div>
  );
}

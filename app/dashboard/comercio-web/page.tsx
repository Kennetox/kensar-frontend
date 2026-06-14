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
  createComercioWebDescriptionTemplate,
  createComercioWebCatalogCategory,
  deleteComercioWebCatalogCategory,
  deleteComercioWebDescriptionTemplate,
  fetchComercioWebCatalogCategories,
  fetchComercioWebDescriptionTemplates,
  exportComercioWebCatalogPublicationsXlsx,
  createComercioWebCatalogCombo,
  deleteComercioWebCatalogCombo,
  fetchComercioWebCatalogPublicationsPage,
  fetchComercioWebCatalogCombos,
  fetchComercioWebCatalogProducts,
  resetComercioWebDescriptionTemplates,
  updateComercioWebCatalogCombo,
  updateComercioWebCatalogCategory,
  updateComercioWebCatalogProduct,
  updateComercioWebDescriptionTemplate,
  fetchComercioWebTechnicalSpecTypes,
  type ComercioWebCatalogCategory,
  type ComercioWebDescriptionTemplate,
  type ComercioWebCatalogPublicationStats,
  type ComercioWebCombo,
  type ComercioWebComboCreate,
  type ComercioWebComboItem,
  type ComercioWebComboUpdate,
  type ComercioWebCatalogProduct,
  type ComercioWebCatalogProductUpdate,
} from "@/lib/api/comercioWebCatalog";
import {
  createComercioWebDiscountCode,
  fetchComercioWebDiscountCodeUsage,
  fetchComercioWebDiscountCodes,
  updateComercioWebDiscountCode,
  type ComercioWebDiscountCode,
  type ComercioWebDiscountCodeUsageRow,
} from "@/lib/api/comercioWebDiscountCodes";
import {
  fetchComercioWebHomeSliders,
  updateComercioWebHomeSlider,
  type ComercioWebHomeSlider,
  type ComercioWebHomeSliderLinkType,
} from "@/lib/api/comercioWebHomeSliders";
import {
  defaultRolePermissions,
  fetchPosSettings,
  fetchRolePermissions,
  updatePosSettings,
  type WebBrandCollageImages,
  type WebHomeSectionsMode,
  type WebPersonalizationHomeImages,
  type RolePermissionModule,
} from "@/lib/api/settings";
import {
  DEFAULT_COMMERCE_DESCRIPTION_CONFIG,
  generateCommerceWebDescription,
  type CommerceDescriptionGeneratorConfig,
  type DescriptionTemplateConfig,
} from "@/lib/comercioWebDescriptionGenerator";
import { DEFAULT_TECHNICAL_SPEC_TYPE_OPTIONS } from "@/lib/comercioWebTechnicalSpecTypes";

type CommerceTab =
  | "overview"
  | "catalog"
  | "orders"
  | "personalization"
  | "personalization_home_images"
  | "payments"
  | "customers"
  | "sliders";

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

type PersonalizationConfiguration = {
  id: string;
  label: string;
  traceLines: string[];
  viewerPayload: Record<string, unknown> | null;
};

type PersonalizationHomeImageSide = "before" | "after";

type PersonalizationHomeImageConfig = {
  beforeImageUrl: string;
  afterImageUrl: string;
};

type BrandCollageSlotKey = "main" | "top_left" | "top_right" | "bottom";

type BrandCollageSlotConfig = {
  imageUrl: string;
  href: string;
};

type PersonalizableInstrumentKey = "campana" | "guiro" | "maraca";

type InstrumentBindingConfig = {
  productId: string;
  productSku: string;
  productName: string;
  productSlug: string;
  serviceId: string;
  serviceSku: string;
  serviceName: string;
};

type InstrumentVariantKey =
  | "campana_clasica_mediana"
  | "campana_clasica_grande"
  | "campana_cromada_mediana"
  | "campana_cromada_grande"
  | "guiro_mediano"
  | "guiro_grande"
  | "maraca_par";
type SkuFieldKind = "product" | "service";

type CatalogTechnicalSpec = {
  type: string;
  value: string;
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
  web_technical_specs: CatalogTechnicalSpec[];
  image_url: string;
  image_thumb_url: string;
  web_gallery_urls: string[];
  web_video_url: string;
};

type ComboEditorItemState = {
  product_id: string;
  quantity: string;
  required: boolean;
  sort_order: string;
  product_name: string;
  product_sku: string;
  product_original_price: string;
  product_price: string;
};

type ComboEditorState = {
  name: string;
  slug: string;
  short_description: string;
  long_description: string;
  image_url: string;
  image_thumb_url: string;
  gallery_urls: string[];
  video_url: string;
  badge_text: string;
  price_mode: "auto" | "fixed" | "discount";
  price: string;
  compare_price: string;
  stock_mode: "manual" | "components";
  published: boolean;
  featured: boolean;
  sort_order: string;
  visible_when_out_of_stock: boolean;
  active: boolean;
  warranty_text: string;
  technical_specs: CatalogTechnicalSpec[];
  items: ComboEditorItemState[];
};

type ComboWizardStep = 1 | 2;

type InlineToast = {
  id: number;
  message: string;
  tone: "success" | "error";
};

type CatalogComposerMode = "create" | "edit";
type CatalogWorkspaceView = "publications" | "combos" | "discount_codes" | "categories" | "descriptions";
type PublishedCatalogStockFilter = "all" | "with_stock" | "without_stock" | "without_image";
type DiscountCodePeriodOption = "day" | "week" | "month" | "indefinite" | "custom";

type DiscountCodeEditorState = {
  code: string;
  discount_type: "percent" | "fixed_amount";
  discount_value: string;
  period: DiscountCodePeriodOption;
  max_uses: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
};

type DiscountCodeStatusFilter = "all" | "active" | "inactive";

type DiscountCodeBatchState = {
  quantity: string;
  discount_type: "percent" | "fixed_amount";
  discount_value: string;
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
  publishedCatalogStockFilter?: PublishedCatalogStockFilter;
  publishedCatalogCategoryFilter?: string;
  publishedCatalogOrderFilter?:
    | "newest"
    | "oldest"
    | "alphabetical"
    | "price_asc"
    | "price_desc";
  publishedCatalogActiveOnly?: boolean;
  discountCodeComposerOpen?: boolean;
  discountCodeEditingId?: number | null;
  discountCodeEditor?: DiscountCodeEditorState;
  catalogComboEditorOpen?: boolean;
  catalogComboEditingId?: number | null;
  catalogComboEditor?: ComboEditorState;
  catalogComboDirty?: boolean;
  catalogComboSearchTerm?: string;
  catalogComboWizardStep?: ComboWizardStep;
  catalogComboDraggedGalleryIndex?: number | null;
  catalogComboDragOverGalleryIndex?: number | null;
  catalogCategoryEditingId?: number | null;
  catalogCategoryEditor?: CategoryEditorState;
  descriptionTemplateSelectedId?: string;
};

type UploadProductImageResponse = {
  url: string;
  thumb_url: string | null;
};

type UploadProductVideoResponse = {
  url: string;
  duration_seconds?: number | null;
  size_bytes: number;
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

type CatalogScrollSnapshot = {
  pageScrollTop: number;
  tableScrollTop: number;
};

const COMMERCE_WEB_ACTIVE_TAB_STORAGE_KEY = "commerce_web_active_tab";
const COMMERCE_WEB_DRAFT_STORAGE_KEY = "commerce_web_catalog_draft_v1";
const COMMERCE_WEB_ORDERS_AUTO_REFRESH_MS = 45_000;
const COMMERCE_WEB_PAYMENTS_LEDGER_PAGE_SIZE = 15;
const COMMERCE_WEB_LIVE_ORDER_TABS: CommerceTab[] = [
  "overview",
  "orders",
  "payments",
];

const TABS: Array<{ id: CommerceTab; label: string }> = [
  { id: "overview", label: "Resumen" },
  { id: "catalog", label: "Catálogo Web" },
  { id: "sliders", label: "Sliders Inicio" },
  { id: "orders", label: "Órdenes" },
  { id: "personalization", label: "Personalización" },
  { id: "personalization_home_images", label: "Imágenes Home" },
  { id: "payments", label: "Pagos" },
  { id: "customers", label: "Clientes" },
];

function isCommerceTab(value: string): value is CommerceTab {
  return TABS.some((tab) => tab.id === value);
}

function isCatalogWorkspaceView(value: string): value is CatalogWorkspaceView {
  return (
    value === "publications" ||
    value === "combos" ||
    value === "discount_codes" ||
    value === "categories" ||
    value === "descriptions"
  );
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
const CATALOG_TABLE_PAGE_SIZE = 50;
const DISCOUNT_CODE_TABLE_PAGE_SIZE = 50;
const TECHNICAL_SPEC_TYPE_OPTIONS = DEFAULT_TECHNICAL_SPEC_TYPE_OPTIONS;

const DEFAULT_PERSONALIZATION_BINDINGS: Record<
  PersonalizableInstrumentKey,
  InstrumentBindingConfig
> = {
  campana: {
    productId: "",
    productSku: "",
    productName: "",
    productSlug: "",
    serviceId: "",
    serviceSku: "",
    serviceName: "",
  },
  guiro: {
    productId: "",
    productSku: "",
    productName: "",
    productSlug: "",
    serviceId: "",
    serviceSku: "",
    serviceName: "",
  },
  maraca: {
    productId: "",
    productSku: "",
    productName: "",
    productSlug: "",
    serviceId: "",
    serviceSku: "",
    serviceName: "",
  },
};

const DEFAULT_PERSONALIZATION_HOME_IMAGES: Record<
  PersonalizableInstrumentKey,
  PersonalizationHomeImageConfig
> = {
  campana: {
    beforeImageUrl: "",
    afterImageUrl: "",
  },
  guiro: {
    beforeImageUrl: "",
    afterImageUrl: "",
  },
  maraca: {
    beforeImageUrl: "",
    afterImageUrl: "",
  },
};

const DEFAULT_BRAND_COLLAGE_IMAGES: Record<BrandCollageSlotKey, BrandCollageSlotConfig> = {
  main: {
    imageUrl: "/brands/collage/hero-yamaha.webp",
    href: "/catalogo?brand=Yamaha",
  },
  top_left: {
    imageUrl: "/brands/collage/title-prodj.webp",
    href: "/catalogo?brand=Pro%20DJ",
  },
  top_right: {
    imageUrl: "/brands/collage/title-rm1.webp",
    href: "/catalogo?brand=Ritmo%20Musical",
  },
  bottom: {
    imageUrl: "/brands/collage/banner-spain.webp",
    href: "/catalogo?brand=Spain",
  },
};

const PERSONALIZATION_VARIANT_OPTIONS: Array<{
  key: InstrumentVariantKey;
  instrument: PersonalizableInstrumentKey;
  label: string;
}> = [
  { key: "campana_clasica_mediana", instrument: "campana", label: "Campana clásica · Mediana" },
  { key: "campana_clasica_grande", instrument: "campana", label: "Campana clásica · Grande" },
  { key: "campana_cromada_mediana", instrument: "campana", label: "Campana cromada · Mediana" },
  { key: "campana_cromada_grande", instrument: "campana", label: "Campana cromada · Grande" },
  { key: "guiro_mediano", instrument: "guiro", label: "Güiro · Mediano" },
  { key: "guiro_grande", instrument: "guiro", label: "Güiro · Grande" },
  { key: "maraca_par", instrument: "maraca", label: "Maracas · Par" },
];

const DEFAULT_PERSONALIZATION_VARIANT_BINDINGS: Record<InstrumentVariantKey, InstrumentBindingConfig> =
  PERSONALIZATION_VARIANT_OPTIONS.reduce(
    (acc, option) => {
      acc[option.key] = { ...DEFAULT_PERSONALIZATION_BINDINGS[option.instrument] };
      return acc;
    },
    {} as Record<InstrumentVariantKey, InstrumentBindingConfig>
  );
const MAX_HOME_FEATURED_CATEGORIES = 5;
const EMPTY_CATALOG_STATS: ComercioWebCatalogPublicationStats = {
  configured: 0,
  published: 0,
  featured: 0,
  discounted: 0,
  consult: 0,
  with_stock: 0,
  without_stock: 0,
  without_image: 0,
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
const DEFAULT_KENSAR_WEB_URL = "https://kensarelectronic.com";
const MAX_CATALOG_GALLERY_IMAGES = 5;
const MAX_CATALOG_VIDEO_DURATION_SECONDS = 45;

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
  web_visible_when_out_of_stock: false,
  web_price_mode: "visible",
  web_whatsapp_message: "",
  web_warranty_text: "",
  web_technical_specs: [],
  image_url: "",
  image_thumb_url: "",
  web_gallery_urls: [],
  web_video_url: "",
};

const emptyComboEditorState: ComboEditorState = {
  name: "",
  slug: "",
  short_description: "",
  long_description: "",
  image_url: "",
  image_thumb_url: "",
  gallery_urls: [],
  video_url: "",
  badge_text: "",
  price_mode: "auto",
  price: "",
  compare_price: "",
  stock_mode: "components",
  published: false,
  featured: false,
  sort_order: "0",
  visible_when_out_of_stock: true,
  active: true,
  warranty_text: "",
  technical_specs: [],
  items: [],
};

const emptyDiscountCodeEditorState: DiscountCodeEditorState = {
  code: "",
  discount_type: "percent",
  discount_value: "",
  period: "indefinite",
  max_uses: "",
  starts_at: "",
  ends_at: "",
  is_active: true,
};

const emptyDiscountCodeBatchState: DiscountCodeBatchState = {
  quantity: "10",
  discount_type: "percent",
  discount_value: "",
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

function formatCopInputValue(value: string): string {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("es-CO");
}

function sanitizeCopInputValue(value: string): string {
  return String(value || "").replace(/\D/g, "");
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

function extractPersonalizationContextFromOrder(order: ComercioWebOrder | null): Record<string, unknown> | null {
  if (!order) return null;
  const checkoutContext = extractCheckoutContextFromOrderNotes(order.notes);
  const personalization = checkoutContext?.personalization;
  if (!personalization || typeof personalization !== "object" || Array.isArray(personalization)) {
    return null;
  }
  const context = { ...(personalization as Record<string, unknown>) };
  if ("preview_images" in context) {
    delete context.preview_images;
  }
  return context;
}

function buildPersonalizationTraceLines(context: Record<string, unknown> | null): string[] {
  if (!context) return [];
  const lines: string[] = [];

  const appendTextLines = (value: unknown) => {
    if (typeof value !== "string") return;
    value
      .split(/\r?\n/g)
      .map((line) => line.trim().replace(/^[-•\s]+/, ""))
      .filter(Boolean)
      .forEach((line) => lines.push(line));
  };

  appendTextLines(context.design_trace_text);

  if (!lines.length && typeof context.summary === "string" && context.summary.trim()) {
    appendTextLines(context.summary);
  }

  return lines;
}

function resolvePersonalizationConfigurationLabel(entry: Record<string, unknown>, index: number): string {
  const productRaw = entry.product;
  if (productRaw && typeof productRaw === "object" && !Array.isArray(productRaw)) {
    const product = productRaw as Record<string, unknown>;
    const name = typeof product.name === "string" ? product.name.trim() : "";
    const size = typeof product.size_label === "string" ? product.size_label.trim() : "";
    if (name && size) return `${name} · ${size}`;
    if (name) return name;
    if (size) return size;
  }
  const summary = typeof entry.summary === "string" ? entry.summary.trim() : "";
  if (summary) return summary.slice(0, 72);
  return `Configuración ${index}`;
}

function buildPersonalizationConfigurations(
  context: Record<string, unknown> | null
): PersonalizationConfiguration[] {
  if (!context) return [];
  if (Array.isArray(context.entries)) {
    const entries = context.entries
      .filter((rawEntry) => rawEntry && typeof rawEntry === "object")
      .map((rawEntry) => rawEntry as Record<string, unknown>);
    if (entries.length) {
      return entries.map((entry, index) => ({
        id: typeof entry.id === "string" && entry.id.trim() ? entry.id : `cfg-${index + 1}`,
        label: resolvePersonalizationConfigurationLabel(entry, index + 1),
        traceLines: buildPersonalizationTraceLines(entry),
        viewerPayload: buildPersonalizationViewerPayload(entry),
      }));
    }
  }
  return [
    {
      id: typeof context.id === "string" && context.id.trim() ? context.id : "cfg-1",
      label: resolvePersonalizationConfigurationLabel(context, 1),
      traceLines: buildPersonalizationTraceLines(context),
      viewerPayload: buildPersonalizationViewerPayload(context),
    },
  ];
}

function buildPersonalizationViewerPayload(
  context: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!context) return null;

  const payload: Record<string, unknown> = {};

  const productRaw = context.product;
  if (productRaw && typeof productRaw === "object" && !Array.isArray(productRaw)) {
    const product = productRaw as Record<string, unknown>;
    payload.product = {
      id: typeof product.id === "string" ? product.id : "campana",
      campana_type: typeof product.campana_type === "string" ? product.campana_type : null,
      campana_bell_type:
        typeof product.campana_bell_type === "string" ? product.campana_bell_type : null,
    };
  }

  const paintRaw = context.paint;
  if (paintRaw && typeof paintRaw === "object" && !Array.isArray(paintRaw)) {
    const paint = paintRaw as Record<string, unknown>;
    if (paint.mode === "gradient") {
      payload.paint = {
        mode: "gradient",
        startColor: typeof paint.startColor === "string" ? paint.startColor : "#f97316",
        endColor: typeof paint.endColor === "string" ? paint.endColor : "#dc2626",
        angle: Number(paint.angle) || 90,
        position: Number(paint.position) || 50,
      };
    } else {
      payload.paint = {
        mode: "solid",
        color: typeof paint.color === "string" ? paint.color : "#1f2937",
      };
    }
  }

  if (Array.isArray(context.text_layers)) {
    payload.text_layers = context.text_layers
      .filter((entry) => entry && typeof entry === "object")
      .slice(0, 8)
      .map((entry, index) => {
        const layer = entry as Record<string, unknown>;
        const face = typeof layer.face === "string" ? layer.face : "front_up";
        const transformRaw =
          layer.transform && typeof layer.transform === "object" && !Array.isArray(layer.transform)
            ? (layer.transform as Record<string, unknown>)
            : {};
        const defaultRotation = face === "left" || face === "right" ? -90 : 0;
        return {
          id: typeof layer.id === "string" ? layer.id : `layer-${index + 1}`,
          text: typeof layer.text === "string" ? layer.text.slice(0, 160) : "",
          color: typeof layer.color === "string" ? layer.color : "#ffffff",
          font_family: typeof layer.font_family === "string" ? layer.font_family : "Arial, sans-serif",
          font_weight: Number(layer.font_weight) || 700,
          face,
          transform: {
            scaleX: Number(transformRaw.scaleX) || 100,
            scaleY: Number(transformRaw.scaleY) || 100,
            offsetX: Number(transformRaw.offsetX) || 0,
            offsetY: Number(transformRaw.offsetY) || 0,
            rotation: Number(transformRaw.rotation) || defaultRotation,
          },
        };
      });
  }

  if (typeof context.summary === "string" && context.summary.trim()) {
    payload.summary = context.summary.slice(0, 500);
  }

  return Object.keys(payload).length > 0 ? payload : null;
}

function isInstrumentPersonalizationOrder(order: ComercioWebOrder): boolean {
  const personalization = extractPersonalizationContextFromOrder(order);
  if (!personalization) return false;
  const type = typeof personalization.type === "string" ? personalization.type.trim().toLowerCase() : "";
  return type === "instrumento";
}

function isApprovedInstrumentPersonalizationOrder(order: ComercioWebOrder): boolean {
  if ((order.payment_status || "").trim().toLowerCase() !== "approved") return false;
  return isInstrumentPersonalizationOrder(order);
}

function resolveKensarWebViewerBaseUrl(): string {
  const configured = (process.env.NEXT_PUBLIC_KENSAR_WEB_URL || "").trim().replace(/\/+$/g, "");
  if (configured) {
    try {
      const parsed = new URL(configured);
      if (
        typeof window !== "undefined" &&
        window.location.protocol === "https:" &&
        parsed.protocol !== "https:"
      ) {
        return DEFAULT_KENSAR_WEB_URL;
      }
      return configured;
    } catch {
      // Ignore malformed env value and fallback.
    }
  }
  if (typeof window !== "undefined" && window.location.protocol === "http:") {
    return "http://localhost:3000";
  }
  return DEFAULT_KENSAR_WEB_URL;
}

function encodeBase64Url(value: string): string {
  if (typeof window === "undefined") return "";
  const utf8 = new TextEncoder().encode(value);
  let binary = "";
  for (let i = 0; i < utf8.length; i += 1) {
    binary += String.fromCharCode(utf8[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readStringValue(record: Record<string, unknown> | null, key: string): string {
  if (!record) return "";
  const raw = record[key];
  return typeof raw === "string" ? raw.trim() : "";
}

function translateDeliveryModeLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "pickup") return "Retiro en tienda";
  if (normalized === "shipping") return "Envío a domicilio";
  return value || "Sin definir";
}

function translateBillingModeLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "pickup") return "Facturación de retiro";
  if (normalized === "same_as_shipping") return "Facturación igual a envío";
  if (normalized === "different") return "Facturación distinta";
  return value || "Sin definir";
}

function resolveOrderDeliverySummary(
  order: ComercioWebOrder | null,
  checkoutContext: Record<string, unknown> | null
): {
  deliveryModeLabel: string;
  shippingLabel: string;
  shippingAddress: string;
  shippingCityState: string;
  billingModeLabel: string;
  contactPhone: string;
} {
  const context = checkoutContext || null;
  const shipping = asRecord(context?.shipping);
  const contact = asRecord(context?.contact);
  const checkoutResultContext = asRecord(context?.checkout_result_context);

  const deliveryModeRaw =
    readStringValue(context, "delivery_mode") || readStringValue(checkoutResultContext, "deliveryMode");
  const shippingLabel =
    readStringValue(shipping, "label") ||
    readStringValue(checkoutResultContext, "shippingLabel") ||
    (deliveryModeRaw.toLowerCase() === "pickup" ? "Retiro en tienda" : "Envío a domicilio");
  const shippingAddress =
    readStringValue(shipping, "full_address") ||
    readStringValue(checkoutResultContext, "shippingAddress") ||
    (order?.customer_address || "").trim() ||
    "Sin dirección confirmada";
  const city = readStringValue(shipping, "city");
  const state = readStringValue(shipping, "state");
  const shippingCityState = [city, state].filter(Boolean).join(", ") || "Sin ciudad/departamento";
  const billingModeRaw = readStringValue(context, "billing_mode");
  const billingModeLabel = translateBillingModeLabel(billingModeRaw || "Sin definir");
  const contactPhone =
    readStringValue(contact, "phone") || (order?.customer_phone || "").trim() || "Sin teléfono";

  return {
    deliveryModeLabel: translateDeliveryModeLabel(deliveryModeRaw || "Sin definir"),
    shippingLabel,
    shippingAddress,
    shippingCityState,
    billingModeLabel,
    contactPhone,
  };
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

function buildSuggestedComboName(items: ComboEditorItemState[]): string {
  const names = items
    .map((item) => item.product_name.trim())
    .filter(Boolean);
  if (!names.length) return "Nuevo combo";
  if (names.length === 1) return `Kit ${names[0]}`;
  if (names.length === 2) return `Kit ${names[0]} + ${names[1]}`;
  return `Kit ${names[0]} + ${names[1]} y más`;
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

function normalizeCategoryLookupKey(value?: string | null): string {
  return (value || "").trim().toLowerCase();
}

function compareCatalogCategories(
  a: ComercioWebCatalogCategory,
  b: ComercioWebCatalogCategory
): number {
  return a.sort_order - b.sort_order || a.name.localeCompare(b.name, "es");
}

function buildHierarchicalCatalogCategories(
  categories: ComercioWebCatalogCategory[]
): ComercioWebCatalogCategory[] {
  if (categories.length <= 1) return categories;

  const categoryByKey = new Map<string, ComercioWebCatalogCategory>();
  categories.forEach((item) => {
    const key = normalizeCategoryLookupKey(item.key);
    if (key) categoryByKey.set(key, item);
  });

  const childrenByParentKey = new Map<string, ComercioWebCatalogCategory[]>();
  const roots: ComercioWebCatalogCategory[] = [];

  categories.forEach((item) => {
    const parentKey = normalizeCategoryLookupKey(item.parent_key);
    const ownKey = normalizeCategoryLookupKey(item.key);
    const isValidParent =
      parentKey && parentKey !== ownKey && categoryByKey.has(parentKey);

    if (!isValidParent) {
      roots.push(item);
      return;
    }

    const existing = childrenByParentKey.get(parentKey) || [];
    existing.push(item);
    childrenByParentKey.set(parentKey, existing);
  });

  const visited = new Set<number>();
  const output: ComercioWebCatalogCategory[] = [];

  const walk = (row: ComercioWebCatalogCategory) => {
    if (visited.has(row.id)) return;
    visited.add(row.id);
    output.push(row);

    const key = normalizeCategoryLookupKey(row.key);
    const children = (childrenByParentKey.get(key) || []).sort(compareCatalogCategories);
    children.forEach(walk);
  };

  [...roots].sort(compareCatalogCategories).forEach(walk);

  if (output.length !== categories.length) {
    categories
      .filter((item) => !visited.has(item.id))
      .sort(compareCatalogCategories)
      .forEach((item) => output.push(item));
  }

  return output;
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

function resolveCatalogProductStock(product: ComercioWebCatalogProduct): number | null {
  const candidates = [product.qty_on_hand, product.stock, product.available_stock];
  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function resolveCatalogRowStockClass(product: ComercioWebCatalogProduct): string {
  const stock = resolveCatalogProductStock(product);
  if (stock === null) return "";
  if (stock > 0) return "bg-emerald-50/70";
  return "bg-rose-50/70";
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

function sanitizeCatalogTechnicalSpecs(value: unknown): CatalogTechnicalSpec[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Partial<CatalogTechnicalSpec>;
      const type = typeof row.type === "string" ? row.type.trim() : "";
      const fieldValue = typeof row.value === "string" ? row.value.trim() : "";
      if (!type) return null;
      if (type.toLowerCase() === "sku") return null;
      return { type, value: fieldValue };
    })
    .filter((item): item is CatalogTechnicalSpec => Boolean(item));
}

function formatCatalogTechnicalSpec(spec: CatalogTechnicalSpec): string {
  const type = spec.type.trim();
  const value = spec.value.trim();
  if (!type) return "";
  return value ? `${type}: ${value}` : type;
}

function parseTechnicalSpecsFromShortDescription(raw?: string | null): CatalogTechnicalSpec[] {
  const source = (raw || "").trim();
  if (!source) return [];
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const parsed = lines
    .map((line) => {
      const hasSeparator = line.includes(":");
      if (!hasSeparator) {
        if (line.length > 30 || /[.!?]$/.test(line)) return null;
        return { type: line.trim(), value: "" };
      }
      const parts = line.split(":");
      const type = parts.shift()?.trim() || "";
      const value = parts.join(":").trim();
      if (!type) return null;
      if (type.toLowerCase() === "sku") return null;
      return { type, value };
    })
    .filter((item): item is CatalogTechnicalSpec => Boolean(item));
  if (parsed.length) return parsed;
  return [{ type: "Accesorios", value: source }];
}

function serializeTechnicalSpecsForShortDescription(specs: CatalogTechnicalSpec[]): string {
  return specs
    .map((item) => formatCatalogTechnicalSpec(item))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function upsertCharacteristicsBlock(description: string, specs: string[]): string {
  const normalizedSpecs = specs
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !/^sku\s*:/i.test(item));
  const specLines = normalizedSpecs.map((item) => `- ${item}`);
  const source = description
    .replace(/\r\n/g, "\n")
    .replace(/\s*Datos tecnicos relevantes:\s*[^\n]*/gi, "")
    .replace(/\s*SKU:\s*[^|\n]+/gi, "")
    .replace(/\n?\s*-\s*SKU\s*:[^\n]*/gi, "")
    .replace(/\s*\|\s*Unidad:\s*[^\n]+/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const lines = source.split("\n");

  const characteristicsIndex = lines.findIndex(
    (line) => line.trim().toLowerCase() === "caracteristicas:"
  );
  if (characteristicsIndex >= 0) {
    let endIndex = characteristicsIndex + 1;
    while (endIndex < lines.length && lines[endIndex].trim().startsWith("- ")) {
      endIndex += 1;
    }
    const nextLine = (lines[endIndex] || "").trim().toLowerCase();
    const shouldSeparateClosing = nextLine.startsWith("en kensar te asesoramos");
    const replacement = specLines.length
      ? ["Caracteristicas:", ...specLines, ...(shouldSeparateClosing ? [""] : [])]
      : [];
    return [...lines.slice(0, characteristicsIndex), ...replacement, ...lines.slice(endIndex)]
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  const legacyLineIndex = lines.findIndex((line) =>
    line.trim().toLowerCase().startsWith("datos tecnicos relevantes:")
  );
  if (legacyLineIndex >= 0) {
    const nextLine = (lines[legacyLineIndex + 1] || "").trim().toLowerCase();
    const shouldSeparateClosing = nextLine.startsWith("en kensar te asesoramos");
    const replacement = specLines.length
      ? ["Caracteristicas:", ...specLines, ...(shouldSeparateClosing ? [""] : [])]
      : [];
    return [...lines.slice(0, legacyLineIndex), ...replacement, ...lines.slice(legacyLineIndex + 1)]
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  if (!specLines.length) return source.trim();
  const block = ["Caracteristicas:", ...specLines];
  const closingIndex = lines.findIndex((line) =>
    line.trim().toLowerCase().startsWith("en kensar te asesoramos")
  );
  if (closingIndex >= 0) {
    return [...lines.slice(0, closingIndex), ...block, "", ...lines.slice(closingIndex)]
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  return [...lines, ...block].filter(Boolean).join("\n").replace(/\n{3,}/g, "\n\n").trim();
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
    web_technical_specs: parseTechnicalSpecsFromShortDescription(product.web_short_description),
    image_url: product.image_url || "",
    image_thumb_url: product.image_thumb_url || "",
    web_video_url: product.web_video_url || "",
    web_gallery_urls:
      galleryUrls.length
        ? galleryUrls.slice(0, MAX_CATALOG_GALLERY_IMAGES)
        : [product.image_url, product.image_thumb_url].filter(
            (value, index, list): value is string =>
              Boolean(value?.trim()) && list.indexOf(value) === index
      ),
  };
}

function buildComboItemEditorState(
  item: ComercioWebComboItem | null,
  fallbackProduct?: ComercioWebCatalogProduct | null
): ComboEditorItemState {
  const product = fallbackProduct || null;
  return {
    product_id: item ? String(item.product_id || "") : product ? String(product.id || "") : "",
    quantity: item ? String(item.quantity || 1) : "1",
    required: item ? Boolean(item.required) : true,
    sort_order: item ? String(item.sort_order || 0) : "0",
    product_name:
      item?.product_name?.trim() ||
      product?.web_name?.trim() ||
      product?.name?.trim() ||
      "",
    product_sku: item?.product_sku?.trim() || product?.sku?.trim() || "",
    product_original_price:
      typeof item?.product_original_price === "number"
        ? formatThousandsWithDots(String(Math.round(item.product_original_price)))
        : product
          ? formatThousandsWithDots(String(Math.round(product.price || 0)))
          : "",
    product_price:
      typeof item?.product_price === "number"
        ? formatThousandsWithDots(String(Math.round(item.product_price)))
        : product
          ? formatThousandsWithDots(String(Math.round(product.price || 0)))
          : "",
  };
}

function buildComboEditorState(combo: ComercioWebCombo | null): ComboEditorState {
  if (!combo) return emptyComboEditorState;
  const items = (combo.items || []).map((item) => buildComboItemEditorState(item));
  const calculatedTotal = formatComboTotalValue(items);
  const price = typeof combo.price === "number" ? formatThousandsWithDots(String(Math.round(combo.price))) : "";
  const comparePrice =
    typeof combo.compare_price === "number"
      ? formatThousandsWithDots(String(Math.round(combo.compare_price)))
      : "";
  const priceMode: ComboEditorState["price_mode"] =
    combo.price_mode === "auto" || combo.price_mode === "fixed" || combo.price_mode === "discount"
      ? combo.price_mode
      : comparePrice &&
          (parseThousandsWithDots(comparePrice) || 0) > (parseThousandsWithDots(price) || 0)
        ? "discount"
        : price && calculatedTotal && parseThousandsWithDots(price) === parseThousandsWithDots(calculatedTotal)
          ? "auto"
          : "fixed";
  return {
    name: combo.name || "",
    slug: combo.slug || "",
    short_description: combo.short_description || "",
    long_description: combo.long_description || "",
    image_url: combo.image_url || "",
    image_thumb_url: combo.image_thumb_url || "",
    gallery_urls: Array.isArray(combo.gallery_urls)
      ? combo.gallery_urls.slice(0, MAX_CATALOG_GALLERY_IMAGES)
      : [],
    video_url: combo.video_url || "",
    badge_text: combo.badge_text || "",
    price_mode: priceMode,
    price: price || calculatedTotal,
    compare_price: comparePrice,
    stock_mode: combo.stock_mode || "components",
    published: Boolean(combo.published),
    featured: Boolean(combo.featured),
    sort_order: String(combo.sort_order ?? 0),
    visible_when_out_of_stock: Boolean(combo.visible_when_out_of_stock),
    active: Boolean(combo.active),
    warranty_text: combo.warranty_text || "",
    technical_specs: Array.isArray(combo.technical_specs) ? combo.technical_specs : [],
    items,
  };
}

function computeComboItemsTotal(items: ComboEditorItemState[]): number {
  return items.reduce((sum, item) => {
    const quantity = Number(String(item.quantity || "0").replace(",", ".")) || 0;
    const unitPrice = parseThousandsWithDots(item.product_price) ?? 0;
    if (quantity <= 0 || unitPrice <= 0) return sum;
    return sum + quantity * unitPrice;
  }, 0);
}

function formatComboTotalValue(items: ComboEditorItemState[]): string {
  return formatThousandsWithDots(String(Math.round(computeComboItemsTotal(items))));
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

function mapDescriptionTemplateFromApi(
  row: ComercioWebDescriptionTemplate
): DescriptionTemplateConfig {
  const parseVariants = (value: string) =>
    value
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
  const paragraph1Variants = parseVariants(row.paragraph1 || "");
  const paragraph2Variants = parseVariants(row.paragraph2 || "");
  const paragraph3Variants = parseVariants(row.paragraph3 || "");
  const closingVariants = parseVariants(row.closing || "");
  return {
    id: (row.template_key || "").trim(),
    label: (row.label || "").trim() || "Plantilla",
    assigned_category_key: (row.assigned_category_key || "").trim(),
    keywords: Array.isArray(row.keywords)
      ? row.keywords.filter((item): item is string => typeof item === "string")
      : [],
    paragraph1: paragraph1Variants[0] || row.paragraph1 || "",
    paragraph2: paragraph2Variants[0] || row.paragraph2 || "",
    paragraph3: paragraph3Variants[0] || row.paragraph3 || "",
    closing: closingVariants[0] || row.closing || "",
    paragraph1_variants: paragraph1Variants,
    paragraph2_variants: paragraph2Variants,
    paragraph3_variants: paragraph3Variants,
    closing_variants: closingVariants,
  };
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
  const [selectedPersonalizationId, setSelectedPersonalizationId] = useState<number | null>(null);
  const [selectedPersonalizationConfigId, setSelectedPersonalizationConfigId] = useState<string | null>(null);
  const [showPersonalizationViewer, setShowPersonalizationViewer] = useState(false);
  const [personalizationVariantBindings, setPersonalizationVariantBindings] = useState<
    Record<InstrumentVariantKey, InstrumentBindingConfig>
  >(DEFAULT_PERSONALIZATION_VARIANT_BINDINGS);
  const [personalizationVariantBindingsBaseline, setPersonalizationVariantBindingsBaseline] =
    useState<Record<InstrumentVariantKey, InstrumentBindingConfig>>(
      DEFAULT_PERSONALIZATION_VARIANT_BINDINGS
    );
  const [personalizationBindingsOpen, setPersonalizationBindingsOpen] = useState(false);
  const [personalizationBindingsSavedAt, setPersonalizationBindingsSavedAt] = useState<string | null>(
    null
  );
  const [personalizationBindingsSaving, setPersonalizationBindingsSaving] = useState(false);
  const [activeSkuField, setActiveSkuField] = useState<{
    variant: InstrumentVariantKey;
    kind: SkuFieldKind;
  } | null>(null);
  const [personalizationHomeImages, setPersonalizationHomeImages] = useState<
    Record<PersonalizableInstrumentKey, PersonalizationHomeImageConfig>
  >(DEFAULT_PERSONALIZATION_HOME_IMAGES);
  const [personalizationHomeImagesBaseline, setPersonalizationHomeImagesBaseline] = useState<
    Record<PersonalizableInstrumentKey, PersonalizationHomeImageConfig>
  >(DEFAULT_PERSONALIZATION_HOME_IMAGES);
  const [homeSectionsMode, setHomeSectionsMode] = useState<WebHomeSectionsMode>("categories");
  const [homeSectionsModeBaseline, setHomeSectionsModeBaseline] =
    useState<WebHomeSectionsMode>("categories");
  const [homeSectionsModeSaving, setHomeSectionsModeSaving] = useState(false);
  const [personalizationHomeImagesSavingInstrument, setPersonalizationHomeImagesSavingInstrument] =
    useState<PersonalizableInstrumentKey | null>(null);
  const [personalizationHomeImagesUploading, setPersonalizationHomeImagesUploading] = useState<{
    instrument: PersonalizableInstrumentKey;
    side: PersonalizationHomeImageSide;
  } | null>(null);
  const [brandCollageImages, setBrandCollageImages] = useState<
    Record<BrandCollageSlotKey, BrandCollageSlotConfig>
  >(DEFAULT_BRAND_COLLAGE_IMAGES);
  const [brandCollageImagesBaseline, setBrandCollageImagesBaseline] = useState<
    Record<BrandCollageSlotKey, BrandCollageSlotConfig>
  >(DEFAULT_BRAND_COLLAGE_IMAGES);
  const [brandCollageImagesSavingSlot, setBrandCollageImagesSavingSlot] =
    useState<BrandCollageSlotKey | null>(null);
  const [brandCollageImagesUploadingSlot, setBrandCollageImagesUploadingSlot] =
    useState<BrandCollageSlotKey | null>(null);
  const [brandCollageImagePicker, setBrandCollageImagePicker] = useState<BrandCollageSlotKey | null>(
    null
  );
  const brandCollageImageInputRef = useRef<HTMLInputElement | null>(null);
  const catalogComboImageInputRef = useRef<HTMLInputElement | null>(null);
  const catalogComboVideoInputRef = useRef<HTMLInputElement | null>(null);
  const [skuSuggestions, setSkuSuggestions] = useState<ComercioWebCatalogProduct[]>([]);
  const [skuSuggestionsLoading, setSkuSuggestionsLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [paymentsLedgerPage, setPaymentsLedgerPage] = useState(1);

  const [publishedCatalogProducts, setPublishedCatalogProducts] = useState<
    ComercioWebCatalogProduct[]
  >([]);
  const [publishedCatalogTotal, setPublishedCatalogTotal] = useState(0);
  const [catalogMetrics, setCatalogMetrics] =
    useState<ComercioWebCatalogPublicationStats>(EMPTY_CATALOG_STATS);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogExporting, setCatalogExporting] = useState(false);
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
  const [publishedCatalogStockFilter, setPublishedCatalogStockFilter] =
    useState<PublishedCatalogStockFilter>("all");
  const [publishedCatalogCategoryFilter, setPublishedCatalogCategoryFilter] = useState("all");
  const [publishedCatalogOrderFilter, setPublishedCatalogOrderFilter] = useState<
    "newest" | "oldest" | "alphabetical" | "price_asc" | "price_desc"
  >("newest");
  const [publishedCatalogActiveOnly, setPublishedCatalogActiveOnly] = useState(true);
  const [publishedCatalogPage, setPublishedCatalogPage] = useState(1);
  const [catalogWorkspaceView, setCatalogWorkspaceView] =
    useState<CatalogWorkspaceView>("publications");
  const [catalogCombos, setCatalogCombos] = useState<ComercioWebCombo[]>([]);
  const [catalogCombosLoading, setCatalogCombosLoading] = useState(false);
  const [catalogCombosError, setCatalogCombosError] = useState<string | null>(null);
  const [catalogComboEditorOpen, setCatalogComboEditorOpen] = useState(false);
  const [catalogComboEditingId, setCatalogComboEditingId] = useState<number | null>(null);
  const [catalogComboWizardStep, setCatalogComboWizardStep] = useState<ComboWizardStep>(1);
  const [catalogComboEditor, setCatalogComboEditor] = useState<ComboEditorState>(
    emptyComboEditorState
  );
  const [catalogComboDirty, setCatalogComboDirty] = useState(false);
  const [catalogComboSaving, setCatalogComboSaving] = useState(false);
  const [catalogComboSearchTerm, setCatalogComboSearchTerm] = useState("");
  const [catalogComboSearchResults, setCatalogComboSearchResults] = useState<
    ComercioWebCatalogProduct[]
  >([]);
  const [catalogComboSearching, setCatalogComboSearching] = useState(false);
  const [catalogComboSearchExecuted, setCatalogComboSearchExecuted] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [catalogComposerOpen, setCatalogComposerOpen] = useState(false);
  const [catalogComposerMode, setCatalogComposerMode] = useState<CatalogComposerMode>("create");
  const [catalogEditor, setCatalogEditor] = useState<CatalogEditorState>(emptyCatalogEditorState);
  const [previewImageIndex, setPreviewImageIndex] = useState(0);
  const [catalogDirty, setCatalogDirty] = useState(false);
  const [catalogSaving, setCatalogSaving] = useState(false);
  const [catalogImageUploading, setCatalogImageUploading] = useState(false);
  const [catalogVideoUploading, setCatalogVideoUploading] = useState(false);
  const [catalogSavePublishPromptOpen, setCatalogSavePublishPromptOpen] = useState(false);
  const [catalogExitPromptOpen, setCatalogExitPromptOpen] = useState(false);
  const [catalogDescriptionGenerating, setCatalogDescriptionGenerating] = useState(false);
  const [catalogDescriptionSpecsUpdating, setCatalogDescriptionSpecsUpdating] = useState(false);
  const [catalogDescriptionTemplateId, setCatalogDescriptionTemplateId] = useState("");
  const [catalogSpecModalOpen, setCatalogSpecModalOpen] = useState(false);
  const [catalogSpecDraftType, setCatalogSpecDraftType] = useState<string>(
    TECHNICAL_SPEC_TYPE_OPTIONS[0]
  );
  const [catalogSpecDraftValue, setCatalogSpecDraftValue] = useState("");
  const [technicalSpecTypeOptions, setTechnicalSpecTypeOptions] = useState<string[]>(
    [...TECHNICAL_SPEC_TYPE_OPTIONS]
  );
  const [descriptionConfig, setDescriptionConfig] = useState<CommerceDescriptionGeneratorConfig>(
    DEFAULT_COMMERCE_DESCRIPTION_CONFIG
  );
  const [descriptionTemplatesLoading, setDescriptionTemplatesLoading] = useState(false);
  const [descriptionTemplatesSaving, setDescriptionTemplatesSaving] = useState(false);
  const [descriptionTemplateSelectedId, setDescriptionTemplateSelectedId] = useState<string>(
    DEFAULT_COMMERCE_DESCRIPTION_CONFIG.templates[0]?.id || "default"
  );
  const [descriptionEditorDraft, setDescriptionEditorDraft] = useState<DescriptionTemplateConfig | null>(
    null
  );
  const [descriptionEditorMode, setDescriptionEditorMode] = useState<"create" | "edit">("edit");
  const [descriptionEditorOriginalId, setDescriptionEditorOriginalId] = useState<string | null>(null);
  const [descriptionPreviewName, setDescriptionPreviewName] = useState("Cabina Activa 12\" XYZ");
  const [descriptionPreviewCategory, setDescriptionPreviewCategory] = useState("sonido");
  const [descriptionPreviewSubcategory, setDescriptionPreviewSubcategory] = useState("cabinas activas");
  const [descriptionPreviewBrand, setDescriptionPreviewBrand] = useState("Yamaha");
  const [descriptionPreviewWarranty, setDescriptionPreviewWarranty] = useState("Garantia de 12 meses");
  const [pendingCatalogExitAction, setPendingCatalogExitAction] =
    useState<PendingCatalogExitAction | null>(null);
  const [catalogActionConfirm, setCatalogActionConfirm] = useState<CatalogActionConfirmState>(null);
  const [catalogActionSubmitting, setCatalogActionSubmitting] = useState(false);
  const [discountCodeRows, setDiscountCodeRows] = useState<ComercioWebDiscountCode[]>([]);
  const [discountCodeTotal, setDiscountCodeTotal] = useState(0);
  const [discountCodeLoading, setDiscountCodeLoading] = useState(false);
  const [discountCodeError, setDiscountCodeError] = useState<string | null>(null);
  const [discountCodePage, setDiscountCodePage] = useState(1);
  const [discountCodeStatusFilter, setDiscountCodeStatusFilter] = useState<DiscountCodeStatusFilter>("all");
  const [discountCodeTypeFilter, setDiscountCodeTypeFilter] = useState<"all" | "percent" | "fixed_amount">("all");
  const [discountCodeEditor, setDiscountCodeEditor] = useState<DiscountCodeEditorState>(
    emptyDiscountCodeEditorState
  );
  const [discountCodeComposerOpen, setDiscountCodeComposerOpen] = useState(false);
  const [discountCodeEditingId, setDiscountCodeEditingId] = useState<number | null>(null);
  const [discountCodeSaving, setDiscountCodeSaving] = useState(false);
  const [discountCodeBatchOpen, setDiscountCodeBatchOpen] = useState(false);
  const [discountCodeBatchEditor, setDiscountCodeBatchEditor] =
    useState<DiscountCodeBatchState>(emptyDiscountCodeBatchState);
  const [discountCodeBatchSaving, setDiscountCodeBatchSaving] = useState(false);
  const [discountCodeBatchError, setDiscountCodeBatchError] = useState<string | null>(null);
  const [discountCodeBatchCreated, setDiscountCodeBatchCreated] = useState<string[]>([]);
  const [selectedDiscountCodeMap, setSelectedDiscountCodeMap] = useState<Record<number, ComercioWebDiscountCode>>({});
  const [discountCodeHistoryOpenId, setDiscountCodeHistoryOpenId] = useState<number | null>(null);
  const [discountCodeHistoryOpenCode, setDiscountCodeHistoryOpenCode] = useState<string>("");
  const [discountCodeHistoryRows, setDiscountCodeHistoryRows] = useState<ComercioWebDiscountCodeUsageRow[]>([]);
  const [discountCodeHistoryTotal, setDiscountCodeHistoryTotal] = useState(0);
  const [discountCodeHistoryLoading, setDiscountCodeHistoryLoading] = useState(false);
  const [discountCodeHistoryError, setDiscountCodeHistoryError] = useState<string | null>(null);
  const [catalogCategories, setCatalogCategories] = useState<ComercioWebCatalogCategory[]>([]);
  const [catalogCategoryLoading, setCatalogCategoryLoading] = useState(false);
  const [catalogCategoryError, setCatalogCategoryError] = useState<string | null>(null);
  const [catalogCategoryEditor, setCatalogCategoryEditor] = useState<CategoryEditorState>(
    emptyCategoryEditorState
  );
  const [catalogCategoryEditingId, setCatalogCategoryEditingId] = useState<number | null>(null);
  const [catalogCategoryEditorOpen, setCatalogCategoryEditorOpen] = useState(false);
  const [catalogCategoryImageUploading, setCatalogCategoryImageUploading] = useState(false);
  const [homeSliders, setHomeSliders] = useState<ComercioWebHomeSlider[]>([]);
  const [homeSlidersLoading, setHomeSlidersLoading] = useState(false);
  const [homeSlidersSavingSlot, setHomeSlidersSavingSlot] = useState<number | null>(null);
  const [homeSliderUploadingSlot, setHomeSliderUploadingSlot] = useState<number | null>(null);
  const [homeSliderMobileUploadingSlot, setHomeSliderMobileUploadingSlot] = useState<number | null>(null);
  const [homeSliderPickerSlot, setHomeSliderPickerSlot] = useState<number | null>(null);
  const [homeSliderPickerTarget, setHomeSliderPickerTarget] = useState<"desktop" | "mobile">("desktop");
  const [homeSliderPositioningSlot, setHomeSliderPositioningSlot] = useState<number | null>(null);
  const [isDraggingSliderCta, setIsDraggingSliderCta] = useState(false);
  const [homeSliderOrderEditorOpen, setHomeSliderOrderEditorOpen] = useState(false);
  const [homeSliderOrderDraft, setHomeSliderOrderDraft] = useState<number[]>([]);
  const [homeSliderOrderDraggedSlot, setHomeSliderOrderDraggedSlot] = useState<number | null>(null);
  const [homeSliderOrderSaving, setHomeSliderOrderSaving] = useState(false);
  const [viewportWidth, setViewportWidth] = useState<number>(1920);
  const [homeSliderPreviewWidth, setHomeSliderPreviewWidth] = useState<number>(0);
  const [homeSlidersError, setHomeSlidersError] = useState<string | null>(null);
  const [personalizationHomeImagePicker, setPersonalizationHomeImagePicker] = useState<{
    instrument: PersonalizableInstrumentKey;
    side: PersonalizationHomeImageSide;
  } | null>(null);
  const [catalogAssetPreviewOpenUrl, setCatalogAssetPreviewOpenUrl] = useState<string | null>(null);
  const [draggedGalleryIndex, setDraggedGalleryIndex] = useState<number | null>(null);
  const [dragOverGalleryIndex, setDragOverGalleryIndex] = useState<number | null>(null);
  const [catalogComboDraggedGalleryIndex, setCatalogComboDraggedGalleryIndex] = useState<number | null>(null);
  const [catalogComboDragOverGalleryIndex, setCatalogComboDragOverGalleryIndex] = useState<number | null>(null);
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
  const catalogVideoInputRef = useRef<HTMLInputElement | null>(null);
  const categoryImageInputRef = useRef<HTMLInputElement | null>(null);
  const homeSliderImageInputRef = useRef<HTMLInputElement | null>(null);
  const personalizationHomeImageInputRef = useRef<HTMLInputElement | null>(null);
  const homeSliderPositionerRef = useRef<HTMLDivElement | null>(null);
  const categoryTableScrollRef = useRef<HTMLDivElement | null>(null);
  const publishedCatalogTableScrollRef = useRef<HTMLDivElement | null>(null);
  const catalogScrollSnapshotRef = useRef<CatalogScrollSnapshot | null>(null);
  const categoryDragAutoScrollRafRef = useRef<number | null>(null);
  const categoryDragAutoScrollDirRef = useRef<-1 | 0 | 1>(0);
  const brandAutocompleteRef = useRef<HTMLDivElement | null>(null);
  const draftHydratedRef = useRef(false);
  const skuSuggestTimerRef = useRef<number | null>(null);
  const skuSuggestRequestSeqRef = useRef(0);

  const [roleModules, setRoleModules] = useState<RolePermissionModule[]>(defaultRolePermissions);

  const personalizationBindingsDirty = useMemo(
    () =>
      JSON.stringify(personalizationVariantBindings) !==
      JSON.stringify(personalizationVariantBindingsBaseline),
    [personalizationVariantBindings, personalizationVariantBindingsBaseline]
  );
  const personalizationHomeImagesDirty = useMemo(
    () => JSON.stringify(personalizationHomeImages) !== JSON.stringify(personalizationHomeImagesBaseline),
    [personalizationHomeImages, personalizationHomeImagesBaseline]
  );
  const homeSectionsModeDirty = homeSectionsMode !== homeSectionsModeBaseline;
  const brandCollageImagesDirty = useMemo(
    () => JSON.stringify(brandCollageImages) !== JSON.stringify(brandCollageImagesBaseline),
    [brandCollageImages, brandCollageImagesBaseline]
  );

  useEffect(() => {
    return () => {
      if (skuSuggestTimerRef.current) {
        window.clearTimeout(skuSuggestTimerRef.current);
      }
      if (categoryDragAutoScrollRafRef.current !== null) {
        window.cancelAnimationFrame(categoryDragAutoScrollRafRef.current);
      }
    };
  }, []);

  const updateCategoryDragAutoScrollFromPointer = useCallback((clientY: number) => {
    const container = categoryTableScrollRef.current;
    if (!container) {
      categoryDragAutoScrollDirRef.current = 0;
      return;
    }
    const rect = container.getBoundingClientRect();
    const edgeThreshold = Math.min(96, Math.max(56, rect.height * 0.2));
    if (clientY < rect.top + edgeThreshold) {
      categoryDragAutoScrollDirRef.current = -1;
      return;
    }
    if (clientY > rect.bottom - edgeThreshold) {
      categoryDragAutoScrollDirRef.current = 1;
      return;
    }
    categoryDragAutoScrollDirRef.current = 0;
  }, []);

  useEffect(() => {
    if (draggedCategoryId === null) {
      categoryDragAutoScrollDirRef.current = 0;
      if (categoryDragAutoScrollRafRef.current !== null) {
        window.cancelAnimationFrame(categoryDragAutoScrollRafRef.current);
        categoryDragAutoScrollRafRef.current = null;
      }
      return;
    }

    const step = () => {
      const container = categoryTableScrollRef.current;
      if (container && categoryDragAutoScrollDirRef.current !== 0) {
        const maxScroll = container.scrollHeight - container.clientHeight;
        const nextScrollTop = Math.max(
          0,
          Math.min(maxScroll, container.scrollTop + categoryDragAutoScrollDirRef.current * 14)
        );
        if (nextScrollTop !== container.scrollTop) {
          container.scrollTop = nextScrollTop;
        }
      }
      categoryDragAutoScrollRafRef.current = window.requestAnimationFrame(step);
    };

    categoryDragAutoScrollRafRef.current = window.requestAnimationFrame(step);
    return () => {
      if (categoryDragAutoScrollRafRef.current !== null) {
        window.cancelAnimationFrame(categoryDragAutoScrollRafRef.current);
        categoryDragAutoScrollRafRef.current = null;
      }
      categoryDragAutoScrollDirRef.current = 0;
    };
  }, [draggedCategoryId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setViewportWidth(window.innerWidth || 1920);
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  useEffect(() => {
    if (homeSliderPositioningSlot === null) return;
    if (typeof window === "undefined") return;
    const node = homeSliderPositionerRef.current;
    if (!node) return;

    const syncPreviewWidth = () => {
      const width = node.getBoundingClientRect().width;
      setHomeSliderPreviewWidth(width > 0 ? width : 0);
    };

    syncPreviewWidth();
    const observer = new ResizeObserver(syncPreviewWidth);
    observer.observe(node);
    window.addEventListener("resize", syncPreviewWidth);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncPreviewWidth);
    };
  }, [homeSliderPositioningSlot]);

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
      if (typeof draft.catalogComboEditorOpen === "boolean") {
        setCatalogComboEditorOpen(draft.catalogComboEditorOpen);
      }
      if (typeof draft.catalogComboEditingId === "number" || draft.catalogComboEditingId === null) {
        setCatalogComboEditingId(draft.catalogComboEditingId ?? null);
      }
      if (draft.catalogComboWizardStep === 1 || draft.catalogComboWizardStep === 2) {
        setCatalogComboWizardStep(draft.catalogComboWizardStep);
      }
      if (typeof draft.catalogComboDirty === "boolean") {
        setCatalogComboDirty(draft.catalogComboDirty);
      }
      if (typeof draft.catalogComboSearchTerm === "string") {
        setCatalogComboSearchTerm(draft.catalogComboSearchTerm);
      }
      if (draft.catalogComboEditor) {
        setCatalogComboEditor({
          ...emptyComboEditorState,
          ...draft.catalogComboEditor,
          gallery_urls: Array.isArray(draft.catalogComboEditor.gallery_urls)
            ? draft.catalogComboEditor.gallery_urls
                .filter((item) => typeof item === "string")
                .slice(0, MAX_CATALOG_GALLERY_IMAGES)
            : [],
          video_url:
            typeof draft.catalogComboEditor.video_url === "string"
              ? draft.catalogComboEditor.video_url
              : "",
          warranty_text:
            typeof draft.catalogComboEditor.warranty_text === "string"
              ? draft.catalogComboEditor.warranty_text
              : "",
          technical_specs: Array.isArray(draft.catalogComboEditor.technical_specs)
            ? draft.catalogComboEditor.technical_specs
                .filter((item) => item && typeof item === "object")
                .map((item) => {
                  const row = item as Partial<CatalogTechnicalSpec>;
                  return {
                    type: typeof row.type === "string" ? row.type : "",
                    value: typeof row.value === "string" ? row.value : "",
                  };
                })
                .filter((item) => Boolean(item.type))
            : [],
          items: Array.isArray(draft.catalogComboEditor.items)
            ? draft.catalogComboEditor.items
                .filter((item) => item && typeof item === "object")
                .map((item) => {
                  const row = item as Partial<ComboEditorItemState>;
                  return {
                    product_id: typeof row.product_id === "string" ? row.product_id : "",
                    quantity: typeof row.quantity === "string" ? row.quantity : "1",
                    required: typeof row.required === "boolean" ? row.required : true,
                    sort_order: typeof row.sort_order === "string" ? row.sort_order : "0",
                    product_name: typeof row.product_name === "string" ? row.product_name : "",
                    product_sku: typeof row.product_sku === "string" ? row.product_sku : "",
                    product_original_price:
                      typeof row.product_original_price === "string"
                        ? row.product_original_price
                        : "",
                    product_price: typeof row.product_price === "string" ? row.product_price : "",
                  };
                })
            : [],
        });
      }
      if (draft.catalogEditor) {
        const draftTechnicalSpecs = sanitizeCatalogTechnicalSpecs(draft.catalogEditor.web_technical_specs);
        setCatalogEditor({
          ...emptyCatalogEditorState,
          ...draft.catalogEditor,
          web_gallery_urls: Array.isArray(draft.catalogEditor.web_gallery_urls)
            ? draft.catalogEditor.web_gallery_urls
                .filter((item) => typeof item === "string")
                .slice(0, MAX_CATALOG_GALLERY_IMAGES)
            : [],
          web_video_url:
            typeof draft.catalogEditor.web_video_url === "string"
              ? draft.catalogEditor.web_video_url
              : "",
          web_technical_specs:
            draftTechnicalSpecs.length > 0
              ? draftTechnicalSpecs
              : parseTechnicalSpecsFromShortDescription(draft.catalogEditor.web_short_description),
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
        draft.publishedCatalogStockFilter === "all" ||
        draft.publishedCatalogStockFilter === "with_stock" ||
        draft.publishedCatalogStockFilter === "without_stock" ||
        draft.publishedCatalogStockFilter === "without_image"
      ) {
        setPublishedCatalogStockFilter(draft.publishedCatalogStockFilter);
      }
      if (typeof draft.publishedCatalogCategoryFilter === "string") {
        const nextValue = draft.publishedCatalogCategoryFilter.trim();
        setPublishedCatalogCategoryFilter(nextValue || "all");
      }
      if (
        draft.publishedCatalogOrderFilter === "newest" ||
        draft.publishedCatalogOrderFilter === "oldest" ||
        draft.publishedCatalogOrderFilter === "alphabetical" ||
        draft.publishedCatalogOrderFilter === "price_asc" ||
        draft.publishedCatalogOrderFilter === "price_desc"
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
        const legacyPercent = (draft.discountCodeEditor as { discount_percent?: string }).discount_percent;
        setDiscountCodeEditor({
          ...emptyDiscountCodeEditorState,
          ...draft.discountCodeEditor,
          discount_value:
            typeof draft.discountCodeEditor.discount_value === "string"
              ? draft.discountCodeEditor.discount_value
              : typeof legacyPercent === "string"
                ? legacyPercent
                : "",
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
      if (typeof draft.descriptionTemplateSelectedId === "string") {
        setDescriptionTemplateSelectedId(draft.descriptionTemplateSelectedId);
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
    if (!token) return;
    let active = true;
    fetchPosSettings(token)
      .then((settings) => {
        if (!active) return;
        const source = settings.web_personalization_bindings;
        if (source && typeof source === "object") {
          const next = { ...DEFAULT_PERSONALIZATION_VARIANT_BINDINGS };
          PERSONALIZATION_VARIANT_OPTIONS.forEach(({ key }) => {
            const row = source[key as keyof typeof source];
            if (!row || typeof row !== "object") return;
            next[key] = {
              productId: typeof row.product_id === "string" ? row.product_id : "",
              productSku: typeof row.product_sku === "string" ? row.product_sku : "",
              productName: typeof row.product_name === "string" ? row.product_name : "",
              productSlug: typeof row.product_slug === "string" ? row.product_slug : "",
              serviceId: typeof row.service_id === "string" ? row.service_id : "",
              serviceSku: typeof row.service_sku === "string" ? row.service_sku : "",
              serviceName: typeof row.service_name === "string" ? row.service_name : "",
            };
          });
          setPersonalizationVariantBindings(next);
          setPersonalizationVariantBindingsBaseline(next);
        }

        const homeImagesSource = settings.web_personalization_home_images;
        if (homeImagesSource && typeof homeImagesSource === "object") {
          const nextHomeImages = { ...DEFAULT_PERSONALIZATION_HOME_IMAGES };
          (Object.keys(DEFAULT_PERSONALIZATION_HOME_IMAGES) as PersonalizableInstrumentKey[]).forEach(
            (key) => {
              const row = homeImagesSource[key as keyof typeof homeImagesSource];
              if (!row || typeof row !== "object") return;
              nextHomeImages[key] = {
                beforeImageUrl:
                  typeof row.before_image_url === "string" ? row.before_image_url : "",
                afterImageUrl: typeof row.after_image_url === "string" ? row.after_image_url : "",
              };
            }
          );
          setPersonalizationHomeImages(nextHomeImages);
          setPersonalizationHomeImagesBaseline(nextHomeImages);
        }

        const homeSectionsModeSource = settings.web_home_sections_mode;
        const nextHomeSectionsMode: WebHomeSectionsMode =
          homeSectionsModeSource === "instruments" || homeSectionsModeSource === "both"
            ? homeSectionsModeSource
            : "categories";
        setHomeSectionsMode(nextHomeSectionsMode);
        setHomeSectionsModeBaseline(nextHomeSectionsMode);

        const brandCollageSource = settings.web_brand_collage_images;
        if (brandCollageSource && typeof brandCollageSource === "object") {
          const nextBrandCollageImages = { ...DEFAULT_BRAND_COLLAGE_IMAGES };
          (Object.keys(DEFAULT_BRAND_COLLAGE_IMAGES) as BrandCollageSlotKey[]).forEach((key) => {
            const row = brandCollageSource[key as keyof typeof brandCollageSource];
            if (!row || typeof row !== "object") return;
            nextBrandCollageImages[key] = {
              imageUrl: typeof row.image_url === "string" ? row.image_url : "",
              href: typeof row.href === "string" ? row.href : DEFAULT_BRAND_COLLAGE_IMAGES[key].href,
            };
          });
          setBrandCollageImages(nextBrandCollageImages);
          setBrandCollageImagesBaseline(nextBrandCollageImages);
        }
      })
      .catch(() => {
        // Keep current local state on fetch errors.
      });
    return () => {
      active = false;
    };
  }, [token]);

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
      catalogComboEditorOpen,
      catalogComboEditingId,
      catalogComboWizardStep,
      catalogComboDraggedGalleryIndex,
      catalogComboDragOverGalleryIndex,
      catalogComboDirty,
      catalogComboEditor,
      catalogComboSearchTerm,
      catalogSearchTerm,
      publishedCatalogFilter,
      publishedCatalogFieldFilter,
      publishedCatalogStatusFilter,
      publishedCatalogFeaturedFilter,
      publishedCatalogBadgeFilter,
      publishedCatalogStockFilter,
      publishedCatalogCategoryFilter,
      publishedCatalogOrderFilter,
      publishedCatalogActiveOnly,
      discountCodeComposerOpen,
      discountCodeEditingId,
      discountCodeEditor,
      catalogCategoryEditingId,
      catalogCategoryEditor,
      descriptionTemplateSelectedId,
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
    catalogComboEditorOpen,
    catalogComboEditingId,
    catalogComboWizardStep,
    catalogComboDraggedGalleryIndex,
    catalogComboDragOverGalleryIndex,
    catalogComboDirty,
    catalogComboEditor,
    catalogComboSearchTerm,
    catalogSearchTerm,
    publishedCatalogFilter,
    publishedCatalogFieldFilter,
    publishedCatalogStatusFilter,
    publishedCatalogFeaturedFilter,
    publishedCatalogBadgeFilter,
    publishedCatalogStockFilter,
    publishedCatalogCategoryFilter,
    publishedCatalogOrderFilter,
    publishedCatalogActiveOnly,
    discountCodeComposerOpen,
    discountCodeEditingId,
    discountCodeEditor,
    catalogCategoryEditingId,
    catalogCategoryEditor,
    descriptionTemplateSelectedId,
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

  const personalizationBindingsEnvPreview = useMemo(() => {
    const byInstrument: Record<PersonalizableInstrumentKey, string> = {
      campana: "",
      guiro: "",
      maraca: "",
    };
    PERSONALIZATION_VARIANT_OPTIONS.forEach(({ instrument, key }) => {
      if (byInstrument[instrument]) return;
      const value = personalizationVariantBindings[key].serviceId.trim();
      if (value) byInstrument[instrument] = value;
    });
    const lines: string[] = [];
    const appendLine = (name: string, value: string) => {
      if (!value.trim()) return;
      lines.push(`${name}=${value.trim()}`);
    };
    appendLine("PERSONALIZA_SERVICE_CAMPANA_PRODUCT_ID", byInstrument.campana);
    appendLine("PERSONALIZA_SERVICE_GUIRO_PRODUCT_ID", byInstrument.guiro);
    appendLine("PERSONALIZA_SERVICE_MARACA_PRODUCT_ID", byInstrument.maraca);
    return lines.join("\n");
  }, [personalizationVariantBindings]);

  const handleSavePersonalizationBindings = useCallback(() => {
    if (!token) return;
    setPersonalizationBindingsSaving(true);
    const payloadBindings = PERSONALIZATION_VARIANT_OPTIONS.reduce(
      (acc, { key }) => {
        const row = personalizationVariantBindings[key];
        acc[key] = {
          product_id: row.productId.trim(),
          product_sku: row.productSku.trim(),
          product_name: row.productName.trim(),
          product_slug: row.productSlug.trim(),
          service_id: row.serviceId.trim(),
          service_sku: row.serviceSku.trim(),
          service_name: row.serviceName.trim(),
        };
        return acc;
      },
      {} as Record<
        InstrumentVariantKey,
        {
          product_id: string;
          product_sku: string;
          product_name: string;
          product_slug: string;
          service_id: string;
          service_sku: string;
          service_name: string;
        }
      >
    );
    void fetchPosSettings(token)
      .then((settings) =>
        updatePosSettings(
          {
            ...settings,
            web_personalization_bindings: payloadBindings,
          },
          token
        )
      )
      .then(() => setPersonalizationBindingsSavedAt(new Date().toISOString()))
      .then(() => setPersonalizationVariantBindingsBaseline(personalizationVariantBindings))
      .finally(() => setPersonalizationBindingsSaving(false));
  }, [personalizationVariantBindings, token]);

  const clearToastTimers = useCallback(() => {
    const timers = toastTimerRef.current;
    if (timers.hide) window.clearTimeout(timers.hide);
    if (timers.remove) window.clearTimeout(timers.remove);
  }, []);

  const showToast = useCallback(
    (message: string, tone: InlineToast["tone"] = "success") => {
      clearToastTimers();

      const toastId = Date.now();
      setToast({ id: toastId, message, tone });
      setToastVisible(true);

      toastTimerRef.current.hide = window.setTimeout(() => setToastVisible(false), 2600);
      toastTimerRef.current.remove = window.setTimeout(() => {
        setToast((current) => (current?.id === toastId ? null : current));
      }, 3000);
    },
    [clearToastTimers]
  );

  const handleSavePersonalizationHomeImages = useCallback(
    (instrument: PersonalizableInstrumentKey) => {
      if (!token) return;
      setPersonalizationHomeImagesSavingInstrument(instrument);
      const payloadHomeImages = (Object.keys(personalizationHomeImages) as PersonalizableInstrumentKey[]).reduce(
        (acc, key) => {
          const row = personalizationHomeImages[key];
          acc[key] = {
            before_image_url: row.beforeImageUrl.trim(),
            after_image_url: row.afterImageUrl.trim(),
          };
          return acc;
        },
        {} as WebPersonalizationHomeImages
      );
      void fetchPosSettings(token)
        .then((settings) =>
          updatePosSettings(
            {
              ...settings,
              web_personalization_home_images: payloadHomeImages,
            },
            token
          )
        )
        .then(() => setPersonalizationHomeImagesBaseline(personalizationHomeImages))
        .then(() => showToast(`Imágenes de ${instrument} guardadas.`))
        .catch((err) => {
          const message = err instanceof Error ? err.message : "No se pudieron guardar las imágenes.";
          showToast(message, "error");
        })
      .finally(() => setPersonalizationHomeImagesSavingInstrument(null));
    },
    [personalizationHomeImages, showToast, token]
  );

  const handleSaveHomeSectionsMode = useCallback(() => {
    if (!token) return;
    setHomeSectionsModeSaving(true);
    void fetchPosSettings(token)
      .then((settings) =>
        updatePosSettings(
          {
            ...settings,
            web_home_sections_mode: homeSectionsMode,
          },
          token
        )
      )
      .then(() => setHomeSectionsModeBaseline(homeSectionsMode))
      .then(() => showToast("Preferencia de portada guardada."))
      .catch((err) => {
        const message = err instanceof Error ? err.message : "No se pudo guardar la preferencia.";
        showToast(message, "error");
      })
      .finally(() => setHomeSectionsModeSaving(false));
  }, [homeSectionsMode, showToast, token]);

  const handlePersonalizationHomeImageFileChange = useCallback(
    async (instrument: PersonalizableInstrumentKey, side: PersonalizationHomeImageSide, file: File) => {
      if (!token) {
        showToast("Debes iniciar sesión para subir la imagen.", "error");
        return;
      }
      setPersonalizationHomeImagesUploading({ instrument, side });
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
            (data && (data.detail as string)) || `Error al subir imagen (código ${uploadRes.status})`;
          throw new Error(msg);
        }
        const data: UploadProductImageResponse = await uploadRes.json();
        const fieldName = side === "before" ? "beforeImageUrl" : "afterImageUrl";
        setPersonalizationHomeImages((current) => ({
          ...current,
          // Mantiene el otro lado intacto y solo reemplaza el que se subió.
          [instrument]: {
            ...current[instrument],
            [fieldName]: data.url || current[instrument][fieldName as keyof PersonalizationHomeImageConfig],
          },
        }));
        showToast(`Imagen ${side === "before" ? "antes" : "después"} cargada con éxito.`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "No se pudo subir la imagen.";
        showToast(message, "error");
      } finally {
        setPersonalizationHomeImagesUploading(null);
      }
    },
    [showToast, token]
  );

  const handleSaveBrandCollageImage = useCallback(
    (slot: BrandCollageSlotKey) => {
      if (!token) return;
      setBrandCollageImagesSavingSlot(slot);
      const payloadBrandCollageImages = (Object.keys(brandCollageImages) as BrandCollageSlotKey[]).reduce(
        (acc, key) => {
          const row = brandCollageImages[key];
          acc[key] = {
            image_url: row.imageUrl.trim(),
            href: row.href.trim(),
          };
          return acc;
        },
        {} as WebBrandCollageImages
      );
      void fetchPosSettings(token)
        .then((settings) =>
          updatePosSettings(
            {
              ...settings,
              web_brand_collage_images: payloadBrandCollageImages,
            },
            token
          )
        )
        .then(() => setBrandCollageImagesBaseline(brandCollageImages))
        .then(() => showToast(`Imagen de collage guardada.`))
        .catch((err) => {
          const message = err instanceof Error ? err.message : "No se pudo guardar la imagen del collage.";
          showToast(message, "error");
        })
        .finally(() => setBrandCollageImagesSavingSlot(null));
    },
    [brandCollageImages, showToast, token]
  );

  const handleBrandCollageImageFileChange = useCallback(
    async (slot: BrandCollageSlotKey, file: File) => {
      if (!token) {
        showToast("Debes iniciar sesión para subir la imagen.", "error");
        return;
      }
      setBrandCollageImagesUploadingSlot(slot);
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
            (data && (data.detail as string)) || `Error al subir imagen (código ${uploadRes.status})`;
          throw new Error(msg);
        }
        const data: UploadProductImageResponse = await uploadRes.json();
        setBrandCollageImages((current) => ({
          ...current,
          [slot]: {
            imageUrl: data.url || current[slot].imageUrl,
          },
        }));
        showToast("Imagen del collage cargada con éxito.");
      } catch (err) {
        const message = err instanceof Error ? err.message : "No se pudo subir la imagen.";
        showToast(message, "error");
      } finally {
        setBrandCollageImagesUploadingSlot(null);
      }
    },
    [showToast, token]
  );

  const handleCloseBindingsModal = useCallback(() => {
    if (personalizationBindingsDirty) {
      const shouldClose = window.confirm(
        "Tienes cambios sin guardar. ¿Quieres salir sin guardar?"
      );
      if (!shouldClose) return;
      setPersonalizationVariantBindings(personalizationVariantBindingsBaseline);
    }
    setPersonalizationBindingsOpen(false);
  }, [
    personalizationBindingsDirty,
    personalizationVariantBindingsBaseline,
  ]);

  const handlePersonalizationVariantBindingChange = useCallback(
    (variant: InstrumentVariantKey, field: keyof InstrumentBindingConfig, value: string) => {
      setPersonalizationVariantBindings((current) => ({
        ...current,
        [variant]: {
          ...current[variant],
          [field]: value,
        },
      }));
    },
    []
  );

  const findCatalogProductBySku = useCallback(
    async (sku: string) => {
      if (!token) return null;
      const normalizedSku = sku.trim();
      if (!normalizedSku) return null;
      const products = await fetchComercioWebCatalogProducts(token, {
        q: normalizedSku,
        limit: 80,
      });
      return (
        products.find((item) => (item.sku || "").trim() === normalizedSku) ||
        null
      );
    },
    [token]
  );

  const handleSkuSuggestionSearch = useCallback(
    (variant: InstrumentVariantKey, kind: SkuFieldKind, rawValue: string) => {
      const value = rawValue.trim();
      setActiveSkuField({ variant, kind });
      if (skuSuggestTimerRef.current) {
        window.clearTimeout(skuSuggestTimerRef.current);
      }
      skuSuggestRequestSeqRef.current += 1;
      const requestSeq = skuSuggestRequestSeqRef.current;
      if (value.length < 1 || !token) {
        setSkuSuggestions([]);
        setSkuSuggestionsLoading(false);
        return;
      }
      setSkuSuggestionsLoading(true);
      skuSuggestTimerRef.current = window.setTimeout(() => {
        void (async () => {
          const normalized = value.toLowerCase();
          const pageSize = 80;
          const maxPages = value.length <= 3 ? 4 : 2;
          const collected: ComercioWebCatalogProduct[] = [];
          for (let page = 0; page < maxPages; page += 1) {
            const rows = await fetchComercioWebCatalogProducts(token, {
              q: value,
              limit: pageSize,
              skip: page * pageSize,
            });
            if (!rows.length) break;
            collected.push(...rows);
            const hasExact = rows.some((row) => (row.sku || "").trim().toLowerCase() === normalized);
            if (hasExact) break;
          }

          const uniqueById = new Map<number, ComercioWebCatalogProduct>();
          for (const row of collected) {
            uniqueById.set(row.id, row);
          }

          const ranked = Array.from(uniqueById.values())
            .filter((row) => (row.sku || "").trim().toLowerCase().includes(normalized))
            .sort((a, b) => {
              const skuA = (a.sku || "").trim().toLowerCase();
              const skuB = (b.sku || "").trim().toLowerCase();
              const rankA = skuA === normalized ? 0 : skuA.startsWith(normalized) ? 1 : 2;
              const rankB = skuB === normalized ? 0 : skuB.startsWith(normalized) ? 1 : 2;
              if (rankA !== rankB) return rankA - rankB;
              return skuA.localeCompare(skuB, undefined, { numeric: true, sensitivity: "base" });
            });

          if (requestSeq !== skuSuggestRequestSeqRef.current) return;
          setSkuSuggestions(ranked.slice(0, 12));
        })()
          .catch(() => {
            if (requestSeq !== skuSuggestRequestSeqRef.current) return;
            setSkuSuggestions([]);
          })
          .finally(() => {
            if (requestSeq !== skuSuggestRequestSeqRef.current) return;
            setSkuSuggestionsLoading(false);
          });
      }, 220);
    },
    [token]
  );

  const applySkuSelection = useCallback(
    (variant: InstrumentVariantKey, kind: SkuFieldKind, product: ComercioWebCatalogProduct) => {
      if (kind === "product") {
        setPersonalizationVariantBindings((current) => ({
          ...current,
          [variant]: {
            ...current[variant],
            productSku: (product.sku || "").trim(),
            productId: String(product.id),
            productName: (product.web_name || product.name || "").trim(),
            productSlug: (product.web_slug || "").trim(),
          },
        }));
      } else {
        setPersonalizationVariantBindings((current) => ({
          ...current,
          [variant]: {
            ...current[variant],
            serviceSku: (product.sku || "").trim(),
            serviceId: String(product.id),
            serviceName: (product.web_name || product.name || "").trim(),
          },
        }));
      }
      setSkuSuggestions([]);
      setActiveSkuField(null);
    },
    []
  );

  const handleSkuBlur = useCallback(() => {
    window.setTimeout(() => {
      setActiveSkuField(null);
      setSkuSuggestions([]);
    }, 120);
  }, []);

  const handleProductSkuAutoFill = useCallback(
    async (variant: InstrumentVariantKey, skuValue: string) => {
      const product = await findCatalogProductBySku(skuValue);
      if (!product) return;
      setPersonalizationVariantBindings((current) => ({
        ...current,
        [variant]: {
          ...current[variant],
          productSku: (product.sku || "").trim(),
          productId: String(product.id),
          productName: (product.web_name || product.name || "").trim(),
          productSlug: (product.web_slug || "").trim(),
        },
      }));
    },
    [findCatalogProductBySku]
  );

  const handleServiceSkuAutoFill = useCallback(
    async (variant: InstrumentVariantKey, skuValue: string) => {
      const product = await findCatalogProductBySku(skuValue);
      if (!product) return;
      setPersonalizationVariantBindings((current) => ({
        ...current,
        [variant]: {
          ...current[variant],
          serviceSku: (product.sku || "").trim(),
          serviceId: String(product.id),
          serviceName: (product.web_name || product.name || "").trim(),
        },
      }));
    },
    [findCatalogProductBySku]
  );

  const handleProductSkuInputChange = useCallback(
    (variant: InstrumentVariantKey, value: string) => {
      handlePersonalizationVariantBindingChange(variant, "productSku", value);
      if (value.trim()) return;
      setPersonalizationVariantBindings((current) => ({
        ...current,
        [variant]: {
          ...current[variant],
          productId: "",
          productName: "",
          productSlug: "",
        },
      }));
    },
    [handlePersonalizationVariantBindingChange]
  );

  const handleServiceSkuInputChange = useCallback(
    (variant: InstrumentVariantKey, value: string) => {
      handlePersonalizationVariantBindingChange(variant, "serviceSku", value);
      if (value.trim()) return;
      setPersonalizationVariantBindings((current) => ({
        ...current,
        [variant]: {
          ...current[variant],
          serviceId: "",
          serviceName: "",
        },
      }));
    },
    [handlePersonalizationVariantBindingChange]
  );

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedId) ?? null,
    [orders, selectedId]
  );
  const personalizationOrders = useMemo(
    () => orders.filter((order) => isApprovedInstrumentPersonalizationOrder(order)),
    [orders]
  );
  const selectedPersonalizationOrder = useMemo(
    () =>
      personalizationOrders.find((order) => order.id === selectedPersonalizationId) ??
      personalizationOrders[0] ??
      null,
    [personalizationOrders, selectedPersonalizationId]
  );
  const selectedPersonalizationContext = useMemo(
    () => extractPersonalizationContextFromOrder(selectedPersonalizationOrder),
    [selectedPersonalizationOrder]
  );
  const selectedPersonalizationConfigurations = useMemo(
    () => buildPersonalizationConfigurations(selectedPersonalizationContext),
    [selectedPersonalizationContext]
  );
  const selectedPersonalizationConfiguration = useMemo(
    () =>
      selectedPersonalizationConfigurations.find(
        (entry) => entry.id === selectedPersonalizationConfigId
      ) ??
      selectedPersonalizationConfigurations[0] ??
      null,
    [selectedPersonalizationConfigId, selectedPersonalizationConfigurations]
  );
  const selectedPersonalizationViewerPayload = useMemo(
    () => selectedPersonalizationConfiguration?.viewerPayload ?? null,
    [selectedPersonalizationConfiguration]
  );
  const selectedPersonalizationTraceLines = useMemo(
    () => selectedPersonalizationConfiguration?.traceLines ?? [],
    [selectedPersonalizationConfiguration]
  );
  const personalizationViewerSrc = useMemo(() => {
    if (!showPersonalizationViewer) return "";
    if (!selectedPersonalizationViewerPayload) return "";
    const webBaseUrl = resolveKensarWebViewerBaseUrl();
    const encoded = encodeBase64Url(JSON.stringify(selectedPersonalizationViewerPayload));
    if (!encoded) return "";
    return `${webBaseUrl}/personaliza/visor?data=${encodeURIComponent(encoded)}`;
  }, [selectedPersonalizationViewerPayload, showPersonalizationViewer]);
  const hasPersonalizationViewerPayload = Boolean(selectedPersonalizationViewerPayload);
  useEffect(() => {
    setShowPersonalizationViewer(false);
  }, [selectedPersonalizationOrder?.id]);
  useEffect(() => {
    setSelectedPersonalizationConfigId((current) => {
      if (!selectedPersonalizationConfigurations.length) return null;
      if (
        current &&
        selectedPersonalizationConfigurations.some((configuration) => configuration.id === current)
      ) {
        return current;
      }
      return selectedPersonalizationConfigurations[0].id;
    });
  }, [selectedPersonalizationOrder?.id, selectedPersonalizationConfigurations]);

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
  const publishedCatalogActiveFiltersCount = useMemo(() => {
    const filters = [
      publishedCatalogFilter.trim().length > 0,
      publishedCatalogFieldFilter !== "all",
      publishedCatalogStatusFilter !== "all",
      publishedCatalogFeaturedFilter !== "all",
      publishedCatalogBadgeFilter !== "all",
      publishedCatalogStockFilter !== "all",
      publishedCatalogCategoryFilter !== "all",
      publishedCatalogOrderFilter !== "newest",
      publishedCatalogActiveOnly !== true,
    ];
    return filters.filter(Boolean).length;
  }, [
    publishedCatalogActiveOnly,
    publishedCatalogBadgeFilter,
    publishedCatalogStockFilter,
    publishedCatalogFeaturedFilter,
    publishedCatalogFieldFilter,
    publishedCatalogFilter,
    publishedCatalogCategoryFilter,
    publishedCatalogOrderFilter,
    publishedCatalogStatusFilter,
  ]);
  const hasPublishedCatalogActiveFilters = publishedCatalogActiveFiltersCount > 0;
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
      buildHierarchicalCatalogCategories(catalogCategories.filter((item) => item.is_active)),
    [catalogCategories]
  );
  const selectedCatalogCategory = useMemo(() => {
    const key = (catalogEditor.web_category_key || "").trim().toLowerCase();
    if (!key) return null;
    return catalogCategories.find((item) => (item.key || "").trim().toLowerCase() === key) || null;
  }, [catalogCategories, catalogEditor.web_category_key]);
  const orderedCatalogCategories = useMemo(
    () => buildHierarchicalCatalogCategories(catalogCategories),
    [catalogCategories]
  );
  const categoryPathLabelMap = useMemo(() => {
    const next = new Map<string, string>();
    orderedCatalogCategories.forEach((item) => {
      const key = (item.key || "").trim().toLowerCase();
      if (!key) return;
      next.set(key, item.parent_name ? `${item.parent_name} / ${item.name}` : item.name);
    });
    return next;
  }, [orderedCatalogCategories]);
  const selectedDescriptionTemplate = useMemo(
    () =>
      descriptionConfig.templates.find((template) => template.id === descriptionTemplateSelectedId) ||
      descriptionConfig.templates[0] ||
      null,
    [descriptionConfig.templates, descriptionTemplateSelectedId]
  );
  const preferredCatalogDescriptionTemplateId = useMemo(() => {
    if (!descriptionConfig.templates.length) return "";
    const selectedKey = (selectedCatalogCategory?.key || "").trim().toLowerCase();
    const parentKey = (selectedCatalogCategory?.parent_key || "").trim().toLowerCase();
    const subcategoryKey = parentKey ? selectedKey : "";
    const categoryKey = parentKey || selectedKey;
    if (subcategoryKey) {
      const exactSubcategoryTemplate = descriptionConfig.templates.find(
        (template) => (template.assigned_category_key || "").trim().toLowerCase() === subcategoryKey
      );
      if (exactSubcategoryTemplate) return exactSubcategoryTemplate.id;
    }
    if (categoryKey) {
      const categoryTemplate = descriptionConfig.templates.find(
        (template) => (template.assigned_category_key || "").trim().toLowerCase() === categoryKey
      );
      if (categoryTemplate) return categoryTemplate.id;
    }
    return descriptionConfig.templates.find((template) => template.id === "default")?.id || descriptionConfig.templates[0].id;
  }, [descriptionConfig.templates, selectedCatalogCategory?.key, selectedCatalogCategory?.parent_key]);
  const selectedCatalogDescriptionTemplate = useMemo(
    () =>
      descriptionConfig.templates.find((template) => template.id === catalogDescriptionTemplateId) ||
      null,
    [catalogDescriptionTemplateId, descriptionConfig.templates]
  );
  const descriptionEditorOpen = descriptionEditorDraft !== null;
  const descriptionPreviewConfig = useMemo<CommerceDescriptionGeneratorConfig>(() => {
    if (!descriptionEditorDraft) return descriptionConfig;
    if (descriptionEditorMode === "edit" && descriptionEditorOriginalId) {
      return {
        templates: descriptionConfig.templates.map((template) =>
          template.id === descriptionEditorOriginalId ? descriptionEditorDraft : template
        ),
      };
    }
    return { templates: [...descriptionConfig.templates, descriptionEditorDraft] };
  }, [descriptionConfig, descriptionEditorDraft, descriptionEditorMode, descriptionEditorOriginalId]);
  const descriptionPreviewText = useMemo(() => {
    try {
      return generateCommerceWebDescription(
        {
          productName: descriptionPreviewName.trim() || "Producto de ejemplo",
          categoryName: descriptionPreviewCategory,
          subcategoryName: descriptionPreviewSubcategory,
          brand: descriptionPreviewBrand,
          warrantyText: descriptionPreviewWarranty,
          technicalSpecs: [],
        },
        descriptionPreviewConfig
      );
    } catch {
      return "No fue posible generar la vista previa con la configuracion actual.";
    }
  }, [
    descriptionPreviewConfig,
    descriptionPreviewBrand,
    descriptionPreviewCategory,
    descriptionPreviewName,
    descriptionPreviewSubcategory,
    descriptionPreviewWarranty,
  ]);
  const allCatalogCategoryOptions = useMemo(() => orderedCatalogCategories, [orderedCatalogCategories]);
  const rootCatalogCategoryOptions = useMemo(
    () => orderedCatalogCategories.filter((item) => !item.parent_key),
    [orderedCatalogCategories]
  );
  const subcategoryOptionsByParent = useMemo(() => {
    const map = new Map<string, ComercioWebCatalogCategory[]>();
    orderedCatalogCategories.forEach((item) => {
      const parentKey = (item.parent_key || "").trim().toLowerCase();
      if (!parentKey) return;
      const current = map.get(parentKey) || [];
      current.push(item);
      map.set(parentKey, current);
    });
    return map;
  }, [orderedCatalogCategories]);
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
  useEffect(() => {
    if (!descriptionConfig.templates.length) return;
    const exists = descriptionConfig.templates.some(
      (template) => template.id === descriptionTemplateSelectedId
    );
    if (!exists) {
      setDescriptionTemplateSelectedId(descriptionConfig.templates[0].id);
    }
  }, [descriptionConfig.templates, descriptionTemplateSelectedId]);
  useEffect(() => {
    if (!preferredCatalogDescriptionTemplateId) {
      setCatalogDescriptionTemplateId("");
      return;
    }
    setCatalogDescriptionTemplateId(preferredCatalogDescriptionTemplateId);
  }, [preferredCatalogDescriptionTemplateId]);
  const getWebCategoryLabel = useCallback(
    (value?: string | null) => {
      const key = (value || "").trim().toLowerCase();
      if (!key) return "";
      return categoryLabelMap.get(key) || value || "";
    },
    [categoryLabelMap]
  );
  const getWebCategoryPathLabel = useCallback(
    (value?: string | null) => {
      const key = (value || "").trim().toLowerCase();
      if (!key) return "";
      return categoryPathLabelMap.get(key) || getWebCategoryLabel(value);
    },
    [categoryPathLabelMap, getWebCategoryLabel]
  );

  const resolveAssetUrl = useCallback((url?: string | null) => {
    if (!url) return null;
    try {
      return new URL(url, getApiBase()).toString();
    } catch {
      return url;
    }
  }, []);

  const resolveBrandCollagePreviewUrl = useCallback((url?: string | null) => {
    if (!url) return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("/brands/")) return trimmed;
    try {
      return new URL(trimmed, getApiBase()).toString();
    } catch {
      return trimmed;
    }
  }, []);

  function buildBrandCollageHref(brand: string) {
    const clean = brand.trim();
    return clean ? `/catalogo?brand=${encodeURIComponent(clean)}` : "";
  }

  function resolveBrandCollageSelection(href?: string | null) {
    const cleanHref = (href || "").trim();
    if (!cleanHref) return "";

    try {
      const parsed = new URL(cleanHref, getApiBase());
      const brandValue = (parsed.searchParams.get("brand") || "").trim();
      if (!brandValue) return "";
      const normalized = brandValue.toLocaleLowerCase("es");
      const match = catalogBrandOptions.find((option) => option.toLocaleLowerCase("es") === normalized);
      return match || "";
    } catch {
      return "";
    }
  }

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
  const visibleDiscountCodeRows = useMemo(
    () =>
      discountCodeRows.filter((row) => {
        if (discountCodeTypeFilter === "all") return true;
        return (row.discount_type || "percent") === discountCodeTypeFilter;
      }),
    [discountCodeRows, discountCodeTypeFilter]
  );
  const selectedDiscountCodeRows = useMemo(
    () => Object.values(selectedDiscountCodeMap),
    [selectedDiscountCodeMap]
  );
  const selectedVisibleCount = useMemo(
    () => visibleDiscountCodeRows.filter((row) => Boolean(selectedDiscountCodeMap[row.id])).length,
    [visibleDiscountCodeRows, selectedDiscountCodeMap]
  );
  const allVisibleSelected = visibleDiscountCodeRows.length > 0 && selectedVisibleCount === visibleDiscountCodeRows.length;

  useEffect(() => {
    const normalizedCategoryKey = normalizeCategoryLookupKey(publishedCatalogCategoryFilter);
    if (!normalizedCategoryKey || normalizedCategoryKey === "all") return;
    const categoryExists = allCatalogCategoryOptions.some(
      (item) => normalizeCategoryLookupKey(item.key) === normalizedCategoryKey
    );
    if (!categoryExists) {
      setPublishedCatalogCategoryFilter("all");
    }
  }, [
    allCatalogCategoryOptions,
    publishedCatalogCategoryFilter,
  ]);

  useEffect(() => {
    setPublishedCatalogPage(1);
  }, [
    publishedCatalogFilter,
    publishedCatalogFieldFilter,
    publishedCatalogStatusFilter,
    publishedCatalogFeaturedFilter,
    publishedCatalogBadgeFilter,
    publishedCatalogStockFilter,
    publishedCatalogCategoryFilter,
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

  useEffect(() => {
    setDiscountCodePage(1);
  }, [discountCodeStatusFilter, discountCodeTypeFilter]);

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
    setCatalogSpecModalOpen(false);
    setCatalogSpecDraftType(TECHNICAL_SPEC_TYPE_OPTIONS[0]);
    setCatalogSpecDraftValue("");
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

  const loadHomeSliders = useCallback(async () => {
    if (!token) return;
    try {
      setHomeSlidersLoading(true);
      setHomeSlidersError(null);
      const rows = await fetchComercioWebHomeSliders(token);
      const sorted = rows
        .map((item) => ({
          ...item,
          cta_x_percent:
            typeof item.cta_x_percent === "number" ? item.cta_x_percent : 50,
          cta_y_percent:
            typeof item.cta_y_percent === "number" ? item.cta_y_percent : 80,
        }))
        .slice()
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.slot - b.slot);
      setHomeSliders(sorted);
    } catch (err) {
      setHomeSlidersError(
        err instanceof Error ? err.message : "No se pudieron cargar los sliders de inicio."
      );
    } finally {
      setHomeSlidersLoading(false);
    }
  }, [token]);

  const loadDescriptionTemplates = useCallback(async () => {
    if (!token) return;
    try {
      setDescriptionTemplatesLoading(true);
      const rows = await fetchComercioWebDescriptionTemplates(token);
      const templates = rows
        .map(mapDescriptionTemplateFromApi)
        .filter((item) => item.id && item.label);
      if (!templates.length) {
        setDescriptionConfig(DEFAULT_COMMERCE_DESCRIPTION_CONFIG);
        setDescriptionTemplateSelectedId(
          DEFAULT_COMMERCE_DESCRIPTION_CONFIG.templates[0]?.id || "default"
        );
        return;
      }
      setDescriptionConfig({ templates });
      setDescriptionTemplateSelectedId((prev) => {
        const normalized = (prev || "").trim();
        if (normalized && templates.some((template) => template.id === normalized)) {
          return normalized;
        }
        return templates[0].id;
      });
    } catch (err) {
      showToast(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar las plantillas de descripción.",
        "error"
      );
    } finally {
      setDescriptionTemplatesLoading(false);
    }
  }, [showToast, token]);

  const loadCatalogCombos = useCallback(async (options?: { silent?: boolean }) => {
    if (!token) return;
    const silent = Boolean(options?.silent);
    try {
      if (!silent) {
        setCatalogCombosLoading(true);
      }
      setCatalogCombosError(null);
      const rows = await fetchComercioWebCatalogCombos(token);
      setCatalogCombos(rows);
      setCatalogComboEditingId((current) => {
        if (current && rows.some((row) => row.id === current)) {
          return current;
        }
        return current;
      });
      setCatalogComboEditor((current) => {
        if (catalogComboEditorOpen && catalogComboEditingId !== null) {
          const next = rows.find((row) => row.id === catalogComboEditingId);
          if (next && !catalogComboDirty) {
            return buildComboEditorState(next);
          }
        }
        return current;
      });
    } catch (err) {
      setCatalogCombosError(
        err instanceof Error ? err.message : "No se pudieron cargar los combos"
      );
    } finally {
      if (!silent) {
        setCatalogCombosLoading(false);
      }
    }
  }, [catalogComboDirty, catalogComboEditorOpen, catalogComboEditingId, token]);

  const resetComboEditor = useCallback(() => {
    setCatalogComboEditorOpen(false);
    setCatalogComboEditingId(null);
    setCatalogComboWizardStep(1);
    setCatalogComboDraggedGalleryIndex(null);
    setCatalogComboDragOverGalleryIndex(null);
    setCatalogComboEditor(emptyComboEditorState);
    setCatalogComboDirty(false);
    setCatalogComboSearchTerm("");
    setCatalogComboSearchResults([]);
    setCatalogComboSearchExecuted(false);
  }, []);

  const openComboEditor = useCallback(
    (comboId?: number) => {
      setCatalogWorkspaceView("combos");
      setCatalogCombosError(null);
      if (typeof comboId !== "number") {
        setCatalogComboEditorOpen(true);
        setCatalogComboEditingId(null);
        setCatalogComboWizardStep(1);
        setCatalogComboDraggedGalleryIndex(null);
        setCatalogComboDragOverGalleryIndex(null);
        setCatalogComboEditor(emptyComboEditorState);
        setCatalogComboDirty(false);
        setCatalogComboSearchTerm("");
        setCatalogComboSearchResults([]);
        setCatalogComboSearchExecuted(false);
        return;
      }
      const combo = catalogCombos.find((row) => row.id === comboId) || null;
      setCatalogComboEditorOpen(true);
      setCatalogComboEditingId(comboId);
      setCatalogComboWizardStep(2);
      setCatalogComboDraggedGalleryIndex(null);
      setCatalogComboDragOverGalleryIndex(null);
      setCatalogComboEditor(buildComboEditorState(combo));
      setCatalogComboDirty(false);
      setCatalogComboSearchTerm("");
      setCatalogComboSearchResults([]);
      setCatalogComboSearchExecuted(false);
    },
    [catalogCombos]
  );

  const searchComboProducts = useCallback(async () => {
    if (!token) return;
    const term = catalogComboSearchTerm.trim();
    if (!term) {
      setCatalogComboSearchResults([]);
      setCatalogComboSearchExecuted(false);
      return;
    }
    try {
      setCatalogComboSearching(true);
      setCatalogCombosError(null);
      const rows = await fetchComercioWebCatalogProducts(token, {
        q: term,
        limit: 20,
      });
      setCatalogComboSearchResults(rows);
      setCatalogComboSearchExecuted(true);
    } catch (err) {
      setCatalogCombosError(err instanceof Error ? err.message : "No se pudo buscar productos");
    } finally {
      setCatalogComboSearching(false);
    }
  }, [catalogComboSearchTerm, token]);

  const syncComboPriceWithMode = useCallback(
    (prev: ComboEditorState, nextItems: ComboEditorItemState[]) => {
      const nextTotal = formatComboTotalValue(nextItems);
      if (prev.price_mode === "auto") {
        return { ...prev, items: nextItems, price: nextTotal };
      }
      if (prev.price_mode === "discount" && !prev.compare_price.trim()) {
        return { ...prev, items: nextItems, price: prev.price || nextTotal, compare_price: nextTotal };
      }
      return { ...prev, items: nextItems };
    },
    []
  );

  const addComboProduct = useCallback((product: ComercioWebCatalogProduct) => {
    setCatalogComboEditor((prev) => {
      const existingIndex = prev.items.findIndex(
        (item) => Number(item.product_id || 0) === product.id
      );
      if (existingIndex >= 0) {
        const nextItems = [...prev.items];
        const currentItem = nextItems[existingIndex];
        const currentQuantity = Number(String(currentItem.quantity || "1").replace(",", ".")) || 1;
        const currentPrice = parseThousandsWithDots(currentItem.product_price) ?? 0;
        const fallbackPrice = resolveWebSalePriceFromProduct(product);
        nextItems[existingIndex] = {
          ...nextItems[existingIndex],
          quantity: String(Math.max(1, currentQuantity + 1)),
          product_price: formatThousandsWithDots(
            String(Math.round(currentPrice || fallbackPrice || 0))
          ),
        };
        return syncComboPriceWithMode(prev, nextItems);
      }
      const nextSortOrder = prev.items.length
        ? Math.max(...prev.items.map((item) => Number(item.sort_order || 0))) + 1
      : 0;
      const nextItems = [
        ...prev.items,
        {
          product_id: String(product.id),
          quantity: "1",
          required: true,
          sort_order: String(nextSortOrder),
          product_name: getCatalogDisplayName(product),
          product_sku: product.sku || "",
          product_original_price: formatThousandsWithDots(
            String(Math.round(product.price || resolveWebSalePriceFromProduct(product)))
          ),
          product_price: formatThousandsWithDots(
            String(Math.round(resolveWebSalePriceFromProduct(product)))
          ),
        },
      ];
      const shouldAutoName = !prev.name.trim();
      const nextName = shouldAutoName ? buildSuggestedComboName(nextItems) : prev.name;
      const currentSuggestedSlug = generateSuggestedSlug(prev.name);
      const nextSuggestedSlug = generateSuggestedSlug(nextName);
      const nextState = syncComboPriceWithMode(
        {
          ...prev,
          items: nextItems,
          name: nextName,
          slug:
            !prev.slug.trim() || prev.slug === currentSuggestedSlug ? nextSuggestedSlug : prev.slug,
        },
        nextItems
      );
      return {
        ...prev,
        ...nextState,
        name: nextName,
        slug:
          !prev.slug.trim() || prev.slug === currentSuggestedSlug ? nextSuggestedSlug : prev.slug,
      };
    });
    setCatalogComboDirty(true);
  }, [syncComboPriceWithMode]);

  const saveComboEditor = useCallback(async () => {
    if (!token) return;
    const name = catalogComboEditor.name.trim();
    const slug = catalogComboEditor.slug.trim() || generateSuggestedSlug(name);
    const computedPrice = computeComboItemsTotal(catalogComboEditor.items);
    const manualPrice = parseThousandsWithDots(catalogComboEditor.price);
    const manualComparePrice = parseThousandsWithDots(catalogComboEditor.compare_price);
    const price =
      catalogComboEditor.price_mode === "auto"
        ? computedPrice
        : manualPrice ?? null;
    if (!name) {
      showToast("Debes escribir el nombre del combo.", "error");
      return;
    }
    if (!slug) {
      showToast("Debes escribir un slug válido para el combo.", "error");
      return;
    }
    if (price === null || price <= 0) {
      showToast("Debes definir un precio válido para el combo.", "error");
      return;
    }
    const comparePrice =
      catalogComboEditor.price_mode === "discount"
        ? manualComparePrice && manualComparePrice > price
          ? manualComparePrice
          : computedPrice > price
            ? computedPrice
            : null
        : catalogComboEditor.compare_price.trim()
          ? manualComparePrice && manualComparePrice > price
            ? manualComparePrice
            : null
          : null;
    const items = catalogComboEditor.items
      .map((item) => ({
        product_id: Number(item.product_id || 0),
        quantity: Number(String(item.quantity || "0").replace(",", ".")),
        required: Boolean(item.required),
        sort_order: Number(item.sort_order || 0),
        product_price: Number(parseThousandsWithDots(item.product_price) || 0),
      }))
      .filter((item) => item.product_id > 0 && item.quantity > 0 && item.product_price > 0);
    if (!items.length) {
      showToast("Debes agregar al menos un producto al combo.", "error");
      return;
    }
    const totalFromItems = items.reduce((sum, item) => sum + item.quantity * item.product_price, 0);
    if (totalFromItems <= 0) {
      showToast("Los productos del combo deben tener precio válido.", "error");
      return;
    }

    const payload: ComercioWebComboCreate | ComercioWebComboUpdate = {
      name,
      slug,
      short_description: catalogComboEditor.short_description.trim() || null,
      long_description: catalogComboEditor.long_description.trim() || null,
      image_url: catalogComboEditor.image_url.trim() || null,
      image_thumb_url: catalogComboEditor.image_thumb_url.trim() || null,
      gallery_urls: catalogComboEditor.gallery_urls
        .map((item) => item.trim())
        .filter(Boolean),
      video_url: catalogComboEditor.video_url.trim() || null,
      badge_text: catalogComboEditor.badge_text.trim() || null,
      price_mode: catalogComboEditor.price_mode,
      price,
      compare_price: comparePrice,
      stock_mode: catalogComboEditor.stock_mode,
      published: catalogComboEditor.published,
      featured: catalogComboEditor.featured,
      sort_order: Number(catalogComboEditor.sort_order || 0),
      visible_when_out_of_stock: catalogComboEditor.visible_when_out_of_stock,
      active: catalogComboEditor.active,
      warranty_text: catalogComboEditor.warranty_text.trim() || null,
      technical_specs: catalogComboEditor.technical_specs
        .map((spec) => ({
          type: spec.type.trim(),
          value: spec.value.trim(),
        }))
        .filter((spec) => spec.type),
      items,
    };

    try {
      setCatalogComboSaving(true);
      const updated =
        catalogComboEditingId !== null
          ? await updateComercioWebCatalogCombo(token, catalogComboEditingId, payload)
          : await createComercioWebCatalogCombo(token, payload as ComercioWebComboCreate);
      setCatalogCombos((prev) => {
        const next = prev.filter((row) => row.id !== updated.id);
        next.unshift(updated);
        return next.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || b.id - a.id);
      });
      setCatalogComboEditor(buildComboEditorState(updated));
      setCatalogComboEditingId(updated.id);
      setCatalogComboWizardStep(2);
      setCatalogComboDirty(false);
      setCatalogComboEditorOpen(false);
      showToast(catalogComboEditingId !== null ? "Combo actualizado." : "Combo creado.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "No se pudo guardar el combo.", "error");
    } finally {
      setCatalogComboSaving(false);
    }
  }, [
    catalogComboEditingId,
    catalogComboEditor,
    showToast,
    token,
  ]);

  const toggleComboPublished = useCallback(
    async (combo: ComercioWebCombo) => {
      if (!token || !canManage) return;
      try {
        setBusyAction(`combo-published-${combo.id}`);
        setCatalogCombosError(null);
        const updated = await updateComercioWebCatalogCombo(token, combo.id, {
          published: !combo.published,
        });
        setCatalogCombos((prev) =>
          prev
            .map((row) => (row.id === updated.id ? updated : row))
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || b.id - a.id)
        );
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : "No se pudo cambiar la publicación.",
          "error"
        );
      } finally {
        setBusyAction(null);
      }
    },
    [canManage, showToast, token]
  );

  const toggleComboFeatured = useCallback(
    async (combo: ComercioWebCombo) => {
      if (!token || !canManage) return;
      try {
        setBusyAction(`combo-featured-${combo.id}`);
        setCatalogCombosError(null);
        const updated = await updateComercioWebCatalogCombo(token, combo.id, {
          featured: !combo.featured,
        });
        setCatalogCombos((prev) =>
          prev
            .map((row) => (row.id === updated.id ? updated : row))
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || b.id - a.id)
        );
      } catch (err) {
        showToast(err instanceof Error ? err.message : "No se pudo cambiar el destacado.", "error");
      } finally {
        setBusyAction(null);
      }
    },
    [canManage, showToast, token]
  );

  const deleteCombo = useCallback(
    async (combo: ComercioWebCombo) => {
      if (!token || !canManage) return;
      const confirmed = window.confirm(
        `¿Eliminar el combo "${combo.name}"? Esta acción no se puede deshacer.`
      );
      if (!confirmed) return;
      try {
        setBusyAction(`combo-delete-${combo.id}`);
        setCatalogCombosError(null);
        await deleteComercioWebCatalogCombo(token, combo.id);
        setCatalogCombos((prev) => prev.filter((row) => row.id !== combo.id));
        if (catalogComboEditingId === combo.id) {
          resetComboEditor();
        }
        showToast("Combo eliminado.");
      } catch (err) {
        showToast(err instanceof Error ? err.message : "No se pudo eliminar el combo.", "error");
      } finally {
        setBusyAction(null);
      }
    },
    [canManage, catalogComboEditingId, resetComboEditor, showToast, token]
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchComercioWebTechnicalSpecTypes(token);
        if (cancelled || !rows.length) return;
        setTechnicalSpecTypeOptions(rows);
        setCatalogSpecDraftType((current) =>
          rows.includes(current) ? current : rows[0] || TECHNICAL_SPEC_TYPE_OPTIONS[0]
        );
      } catch {
        if (!cancelled) {
          setTechnicalSpecTypeOptions([...TECHNICAL_SPEC_TYPE_OPTIONS]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
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
    setCatalogSpecModalOpen(false);
    setCatalogSpecDraftType(TECHNICAL_SPEC_TYPE_OPTIONS[0]);
    setCatalogSpecDraftValue("");
    setCatalogComboEditorOpen(false);
    setCatalogComboEditingId(null);
    setCatalogComboEditor(emptyComboEditorState);
    setCatalogComboDirty(false);
    setCatalogComboSearchTerm("");
    setCatalogComboSearchResults([]);
    setCatalogComboSearchExecuted(false);
  }, []);

  const captureCatalogScrollSnapshot = useCallback(() => {
    if (typeof window === "undefined") return;
    catalogScrollSnapshotRef.current = {
      pageScrollTop: window.scrollY,
      tableScrollTop: publishedCatalogTableScrollRef.current?.scrollTop ?? 0,
    };
  }, []);

  const restoreCatalogScrollSnapshot = useCallback(() => {
    if (typeof window === "undefined") return;
    const snapshot = catalogScrollSnapshotRef.current;
    if (!snapshot) return;

    window.requestAnimationFrame(() => {
      window.scrollTo({ top: snapshot.pageScrollTop, behavior: "auto" });
      const tableNode = publishedCatalogTableScrollRef.current;
      if (tableNode) {
        tableNode.scrollTop = snapshot.tableScrollTop;
      }
    });
  }, []);

  useEffect(() => {
    if (catalogComposerOpen) return;
    if (catalogWorkspaceView !== "publications") return;
    restoreCatalogScrollSnapshot();
  }, [catalogComposerOpen, catalogWorkspaceView, restoreCatalogScrollSnapshot]);

  const openCatalogComposer = useCallback((productId?: number) => {
    captureCatalogScrollSnapshot();
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
  }, [captureCatalogScrollSnapshot, loadCatalogCategories]);

  useEffect(() => {
    if (!token) return;
    void loadHomeSliders();
  }, [loadHomeSliders, token]);

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
      if (catalogComboEditorOpen) {
        resetComboEditor();
      }
      setActiveTab(action.tab);
    },
    [catalogComboEditorOpen, catalogComposerOpen, resetCatalogComposer, resetComboEditor]
  );

  const requestCatalogExit = useCallback(
    (action: PendingCatalogExitAction) => {
      if (catalogSaving) return;
      const hasUnsavedCatalogChanges =
        activeTab === "catalog" &&
        ((catalogWorkspaceView === "publications" &&
          catalogComposerOpen &&
          catalogDirty) ||
          (catalogWorkspaceView === "combos" && catalogComboEditorOpen && catalogComboDirty));
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
      catalogComboDirty,
      catalogComboEditorOpen,
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

  const comboMetrics = useMemo(() => {
    const published = catalogCombos.filter((combo) => combo.published).length;
    const featured = catalogCombos.filter((combo) => combo.featured).length;
    const active = catalogCombos.filter((combo) => combo.active).length;
    const withItems = catalogCombos.filter((combo) => (combo.items?.length ?? 0) > 0).length;
    const totalItems = catalogCombos.reduce((sum, combo) => sum + (combo.items?.length ?? 0), 0);
    return {
      total: catalogCombos.length,
      published,
      featured,
      active,
      withItems,
      totalItems,
    };
  }, [catalogCombos]);

  const comboDraftTotal = useMemo(
    () => computeComboItemsTotal(catalogComboEditor.items),
    [catalogComboEditor.items]
  );

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
      setSelectedPersonalizationId((prev) => {
        if (prev && rows.some((order) => order.id === prev && isApprovedInstrumentPersonalizationOrder(order))) {
          return prev;
        }
        const firstPersonalization = rows.find((order) => isApprovedInstrumentPersonalizationOrder(order));
        return firstPersonalization?.id ?? null;
      });
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

  const loadCatalogProducts = useCallback(async (options?: { silent?: boolean }) => {
    if (!token) return;
    const silent = Boolean(options?.silent);
    try {
      if (!silent) {
        setCatalogLoading(true);
      }
      setCatalogError(null);
      const normalizedStatusFilter = publishedCatalogStatusFilter as
        | "all"
        | "featured"
        | "discounted"
        | "consult"
        | "published"
        | "paused";
      const page = await fetchComercioWebCatalogPublicationsPage(token, {
        q: publishedCatalogFilter.trim() || undefined,
        field:
          publishedCatalogFieldFilter === "all"
            ? undefined
            : (publishedCatalogFieldFilter as "name" | "sku" | "brand" | "group" | "badge"),
        status_filter:
          normalizedStatusFilter === "all"
            ? undefined
            : normalizedStatusFilter,
        featured_filter:
          publishedCatalogFeaturedFilter === "all"
            ? undefined
            : (publishedCatalogFeaturedFilter as "featured" | "standard"),
        badge_filter:
          publishedCatalogBadgeFilter === "all"
            ? undefined
            : (publishedCatalogBadgeFilter as "with_badge" | "without_badge"),
        stock_filter:
          publishedCatalogStockFilter === "all" ? undefined : publishedCatalogStockFilter,
        category_key:
          publishedCatalogCategoryFilter === "all"
            ? undefined
            : publishedCatalogCategoryFilter,
        order: publishedCatalogOrderFilter,
        active_only:
          normalizedStatusFilter === "published" || normalizedStatusFilter === "paused"
            ? undefined
            : publishedCatalogActiveOnly,
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
      if (!silent) {
        setCatalogLoading(false);
      }
    }
  }, [
    publishedCatalogBadgeFilter,
    publishedCatalogStockFilter,
    publishedCatalogFeaturedFilter,
    publishedCatalogFieldFilter,
    publishedCatalogFilter,
    publishedCatalogCategoryFilter,
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

  const exportCatalogProductsXlsx = useCallback(async () => {
    if (!token) {
      showToast("Debes iniciar sesión para exportar.", "error");
      return;
    }
    try {
      setCatalogExporting(true);
      const normalizedStatusFilter = publishedCatalogStatusFilter as
        | "all"
        | "featured"
        | "discounted"
        | "consult"
        | "published"
        | "paused";
      const blob = await exportComercioWebCatalogPublicationsXlsx(token, {
        q: publishedCatalogFilter.trim() || undefined,
        field:
          publishedCatalogFieldFilter === "all"
            ? undefined
            : (publishedCatalogFieldFilter as "name" | "sku" | "brand" | "group" | "badge"),
        status_filter:
          normalizedStatusFilter === "all"
            ? undefined
            : normalizedStatusFilter,
        featured_filter:
          publishedCatalogFeaturedFilter === "all"
            ? undefined
            : (publishedCatalogFeaturedFilter as "featured" | "standard"),
        badge_filter:
          publishedCatalogBadgeFilter === "all"
            ? undefined
            : (publishedCatalogBadgeFilter as "with_badge" | "without_badge"),
        stock_filter:
          publishedCatalogStockFilter === "all" ? undefined : publishedCatalogStockFilter,
        category_key:
          publishedCatalogCategoryFilter === "all"
            ? undefined
            : publishedCatalogCategoryFilter,
        order: publishedCatalogOrderFilter,
        active_only:
          normalizedStatusFilter === "published" || normalizedStatusFilter === "paused"
            ? undefined
            : publishedCatalogActiveOnly,
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      link.href = url;
      link.download = `catalogo-web-publicaciones-${timestamp}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showToast("Excel generado con éxito.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "No se pudo exportar el Excel.", "error");
    } finally {
      setCatalogExporting(false);
    }
  }, [
    publishedCatalogBadgeFilter,
    publishedCatalogStockFilter,
    publishedCatalogFeaturedFilter,
    publishedCatalogFieldFilter,
    publishedCatalogFilter,
    publishedCatalogCategoryFilter,
    publishedCatalogOrderFilter,
    publishedCatalogActiveOnly,
    publishedCatalogStatusFilter,
    showToast,
    token,
  ]);

  const loadDiscountCodes = useCallback(async () => {
    if (!token) return;
    try {
      setDiscountCodeLoading(true);
      setDiscountCodeError(null);
      const page = await fetchComercioWebDiscountCodes(token, {
        skip: (discountCodePage - 1) * DISCOUNT_CODE_TABLE_PAGE_SIZE,
        limit: DISCOUNT_CODE_TABLE_PAGE_SIZE,
        active_only:
          discountCodeStatusFilter === "all"
            ? undefined
            : discountCodeStatusFilter === "active",
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
  }, [discountCodePage, discountCodeStatusFilter, token]);

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
    if (activeTab !== "sliders") return;
    if (catalogCategories.length === 0) {
      void loadCatalogCategories();
    }
  }, [activeTab, catalogCategories.length, loadCatalogCategories]);

  useEffect(() => {
    if (activeTab !== "catalog") return;
    void loadDescriptionTemplates();
  }, [activeTab, loadDescriptionTemplates]);

  useEffect(() => {
    if (activeTab !== "catalog") return;
    const timer = window.setTimeout(() => {
      if (catalogWorkspaceView === "discount_codes") {
        void loadDiscountCodes();
        return;
      }
      if (catalogWorkspaceView === "combos") {
        void loadCatalogCombos();
        return;
      }
      if (catalogWorkspaceView === "categories") {
        void loadCatalogCategories();
        return;
      }
      if (catalogWorkspaceView === "descriptions") {
        void loadDescriptionTemplates();
        return;
      }
      void loadCatalogProducts();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [
    activeTab,
    catalogWorkspaceView,
    loadCatalogCombos,
    loadCatalogProducts,
    loadDiscountCodes,
    loadCatalogCategories,
    loadDescriptionTemplates,
  ]);

  useEffect(() => {
    if (activeTab !== "catalog" && activeTab !== "personalization_home_images") return;
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

  function handleComboField<K extends keyof ComboEditorState>(key: K, value: ComboEditorState[K]) {
    setCatalogComboEditor((prev) => ({ ...prev, [key]: value }));
    setCatalogComboDirty(true);
  }

  function handleComboItemField<K extends keyof ComboEditorItemState>(
    index: number,
    key: K,
    value: ComboEditorItemState[K]
  ) {
    setCatalogComboEditor((prev) => {
      const nextItems = prev.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item
      );
      return syncComboPriceWithMode(prev, nextItems);
    });
    setCatalogComboDirty(true);
  }

  function removeComboItem(indexToRemove: number) {
    setCatalogComboEditor((prev) => {
      const nextItems = prev.items.filter((_, index) => index !== indexToRemove);
      return syncComboPriceWithMode(prev, nextItems);
    });
    setCatalogComboDirty(true);
  }

  function addComboTechnicalSpec() {
    setCatalogComboEditor((prev) => ({
      ...prev,
      technical_specs: [...prev.technical_specs, { type: "", value: "" }],
    }));
    setCatalogComboDirty(true);
  }

  function updateComboTechnicalSpec(index: number, key: keyof CatalogTechnicalSpec, value: string) {
    setCatalogComboEditor((prev) => ({
      ...prev,
      technical_specs: prev.technical_specs.map((spec, specIndex) =>
        specIndex === index ? { ...spec, [key]: value } : spec
      ),
    }));
    setCatalogComboDirty(true);
  }

  function removeComboTechnicalSpec(indexToRemove: number) {
    setCatalogComboEditor((prev) => ({
      ...prev,
      technical_specs: prev.technical_specs.filter((_, index) => index !== indexToRemove),
    }));
    setCatalogComboDirty(true);
  }

  function openCatalogSpecModal() {
    setCatalogSpecDraftType(TECHNICAL_SPEC_TYPE_OPTIONS[0]);
    setCatalogSpecDraftValue("");
    setCatalogSpecModalOpen(true);
  }

  function addCatalogTechnicalSpec() {
    const nextType = catalogSpecDraftType.trim();
    const nextValue = catalogSpecDraftValue.trim();
    if (!nextType) {
      showToast("Selecciona la caracteristica.", "error");
      return;
    }
    setCatalogEditor((prev) => ({
      ...prev,
      web_technical_specs: [...prev.web_technical_specs, { type: nextType, value: nextValue }],
    }));
    setCatalogDirty(true);
    setCatalogSpecModalOpen(false);
    setCatalogSpecDraftType(TECHNICAL_SPEC_TYPE_OPTIONS[0]);
    setCatalogSpecDraftValue("");
  }

  function removeCatalogTechnicalSpec(indexToRemove: number) {
    setCatalogEditor((prev) => ({
      ...prev,
      web_technical_specs: prev.web_technical_specs.filter((_, index) => index !== indexToRemove),
    }));
    setCatalogDirty(true);
  }

  async function handleGenerateCatalogDescription() {
    if (!selectedProduct) {
      showToast("Selecciona un producto para generar la descripcion.", "error");
      return;
    }
    const currentDescription = catalogEditor.web_long_description.trim();
    if (currentDescription) {
      const shouldReplace = window.confirm(
        "Este producto ya tiene descripcion. ¿Deseas reemplazarla?"
      );
      if (!shouldReplace) return;
    }
    try {
      setCatalogDescriptionGenerating(true);
      await Promise.resolve();
      const categoryName = selectedCatalogCategory?.parent_name || selectedCatalogCategory?.name || "";
      const subcategoryName = selectedCatalogCategory?.parent_name ? selectedCatalogCategory.name : "";
      const generatorConfig = selectedCatalogDescriptionTemplate
        ? { templates: [selectedCatalogDescriptionTemplate] }
        : descriptionConfig;
      const generated = generateCommerceWebDescription({
        productName: (catalogEditor.web_name || "").trim() || selectedProduct.name,
        categoryName,
        subcategoryName,
        categoryKey: selectedCatalogCategory?.parent_key || selectedCatalogCategory?.key || "",
        subcategoryKey: selectedCatalogCategory?.parent_key ? selectedCatalogCategory.key : "",
        brand: catalogEditor.brand || selectedProduct.brand,
        warrantyText: catalogEditor.web_warranty_text,
        technicalSpecs: catalogEditor.web_technical_specs.map((item) => formatCatalogTechnicalSpec(item)),
      }, generatorConfig);
      handleCatalogField("web_long_description", generated);
      showToast("Descripcion generada. Revisa y edita antes de guardar.");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "No se pudo generar la descripcion.",
        "error"
      );
    } finally {
      setCatalogDescriptionGenerating(false);
    }
  }

  async function handleUpdateCatalogDescriptionSpecs() {
    if (!selectedProduct) {
      showToast("Selecciona un producto para actualizar las caracteristicas.", "error");
      return;
    }
    const currentDescription = catalogEditor.web_long_description.trim();
    if (!currentDescription) {
      showToast(
        "Este producto no tiene descripcion. Genera la descripcion completa primero.",
        "error"
      );
      return;
    }
    const nextSpecs = catalogEditor.web_technical_specs
      .map((item) => formatCatalogTechnicalSpec(item))
      .filter(Boolean);
    try {
      setCatalogDescriptionSpecsUpdating(true);
      await Promise.resolve();
      const updatedDescription = upsertCharacteristicsBlock(currentDescription, nextSpecs);
      handleCatalogField("web_long_description", updatedDescription);
      showToast("Caracteristicas actualizadas dentro de la descripcion.");
    } catch (err) {
      showToast(
        err instanceof Error
          ? err.message
          : "No se pudieron actualizar las caracteristicas en la descripcion.",
        "error"
      );
    } finally {
      setCatalogDescriptionSpecsUpdating(false);
    }
  }

  function updateDescriptionEditorDraft(
    field: keyof DescriptionTemplateConfig,
    value: string | string[]
  ) {
    setDescriptionEditorDraft((prev) =>
      prev
        ? {
            ...prev,
            [field]: value,
          }
        : prev
    );
  }

  function normalizeVariantLines(value: string[] | undefined, fallback = ""): string[] {
    const source = Array.isArray(value) ? value : [];
    const normalized = source.map((item) => item.trim()).filter(Boolean);
    if (normalized.length) return normalized;
    const fallbackText = fallback.trim();
    return fallbackText ? [fallbackText] : [];
  }

  function variantsToTextareaValue(value: string[] | undefined, fallback = ""): string {
    const normalized = normalizeVariantLines(value, fallback);
    return normalized.join("\n");
  }

  function openDescriptionTemplateEditor(templateId: string) {
    const template = descriptionConfig.templates.find((item) => item.id === templateId);
    if (!template) return;
    setDescriptionTemplateSelectedId(template.id);
    setDescriptionEditorMode("edit");
    setDescriptionEditorOriginalId(template.id);
    setDescriptionEditorDraft({
      ...template,
      keywords: [...template.keywords],
    });
  }

  function cancelDescriptionTemplateEditor() {
    setDescriptionEditorDraft(null);
    setDescriptionEditorOriginalId(null);
    const selectedExists = descriptionConfig.templates.some(
      (template) => template.id === descriptionTemplateSelectedId
    );
    if (!selectedExists && descriptionConfig.templates[0]) {
      setDescriptionTemplateSelectedId(descriptionConfig.templates[0].id);
    }
  }

  async function saveDescriptionTemplateEditor() {
    if (!descriptionEditorDraft) return;
    if (!token) {
      showToast("Debes iniciar sesión para guardar plantillas.", "error");
      return;
    }
    const nextId = descriptionEditorDraft.id.trim();
    const nextLabel = descriptionEditorDraft.label.trim();
    if (!nextId) {
      showToast("El ID interno es obligatorio.", "error");
      return;
    }
    if (!nextLabel) {
      showToast("El nombre de la plantilla es obligatorio.", "error");
      return;
    }
    const duplicateId = descriptionConfig.templates.some((template) => {
      if (descriptionEditorMode === "edit" && descriptionEditorOriginalId) {
        return template.id === nextId && template.id !== descriptionEditorOriginalId;
      }
      return template.id === nextId;
    });
    if (duplicateId) {
      showToast("Ya existe una plantilla con ese ID interno.", "error");
      return;
    }
    const normalizedTemplate: DescriptionTemplateConfig = {
      ...descriptionEditorDraft,
      id: nextId,
      label: nextLabel,
      assigned_category_key: (descriptionEditorDraft.assigned_category_key || "").trim(),
      keywords: descriptionEditorDraft.keywords
        .map((item) => item.trim())
        .filter(Boolean),
      paragraph1_variants: normalizeVariantLines(
        descriptionEditorDraft.paragraph1_variants,
        descriptionEditorDraft.paragraph1
      ),
      paragraph2_variants: normalizeVariantLines(
        descriptionEditorDraft.paragraph2_variants,
        descriptionEditorDraft.paragraph2
      ),
      paragraph3_variants: normalizeVariantLines(
        descriptionEditorDraft.paragraph3_variants,
        descriptionEditorDraft.paragraph3
      ),
      closing_variants: normalizeVariantLines(
        descriptionEditorDraft.closing_variants,
        descriptionEditorDraft.closing
      ),
    };
    normalizedTemplate.paragraph1 = normalizedTemplate.paragraph1_variants?.[0] || "";
    normalizedTemplate.paragraph2 = normalizedTemplate.paragraph2_variants?.[0] || "";
    normalizedTemplate.paragraph3 = normalizedTemplate.paragraph3_variants?.[0] || "";
    normalizedTemplate.closing = normalizedTemplate.closing_variants?.[0] || "";
    const serializedParagraph1 = (normalizedTemplate.paragraph1_variants || []).join("\n");
    const serializedParagraph2 = (normalizedTemplate.paragraph2_variants || []).join("\n");
    const serializedParagraph3 = (normalizedTemplate.paragraph3_variants || []).join("\n");
    const serializedClosing = (normalizedTemplate.closing_variants || []).join("\n");
    try {
      setDescriptionTemplatesSaving(true);
      const currentIndex = descriptionConfig.templates.findIndex((template) => {
        const key =
          descriptionEditorMode === "edit" && descriptionEditorOriginalId
            ? descriptionEditorOriginalId
            : nextId;
        return template.id === key;
      });
      const fallbackOrder = descriptionConfig.templates.length + 1;
      const sortOrder = (currentIndex >= 0 ? currentIndex + 1 : fallbackOrder) * 10;
      if (descriptionEditorMode === "create") {
        await createComercioWebDescriptionTemplate(token, {
          template_key: normalizedTemplate.id,
          label: normalizedTemplate.label,
          assigned_category_key: normalizedTemplate.assigned_category_key || undefined,
          keywords: normalizedTemplate.keywords,
          paragraph1: serializedParagraph1,
          paragraph2: serializedParagraph2,
          paragraph3: serializedParagraph3,
          closing: serializedClosing,
          sort_order: sortOrder,
        });
      } else {
        const targetKey = descriptionEditorOriginalId || normalizedTemplate.id;
        await updateComercioWebDescriptionTemplate(token, targetKey, {
          template_key: normalizedTemplate.id,
          label: normalizedTemplate.label,
          assigned_category_key: normalizedTemplate.assigned_category_key || undefined,
          keywords: normalizedTemplate.keywords,
          paragraph1: serializedParagraph1,
          paragraph2: serializedParagraph2,
          paragraph3: serializedParagraph3,
          closing: serializedClosing,
          sort_order: sortOrder,
        });
      }
      await loadDescriptionTemplates();
      setDescriptionTemplateSelectedId(nextId);
      setDescriptionEditorDraft(null);
      setDescriptionEditorOriginalId(null);
      showToast(
        descriptionEditorMode === "create"
          ? "Plantilla creada y guardada."
          : "Cambios de plantilla guardados."
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "No se pudo guardar la plantilla.",
        "error"
      );
    } finally {
      setDescriptionTemplatesSaving(false);
    }
  }

  async function resetDescriptionTemplatesToDefault() {
    if (!token) {
      showToast("Debes iniciar sesión para restaurar plantillas.", "error");
      return;
    }
    const shouldReset = window.confirm(
      "Esto restaurara las plantillas de descripcion por defecto. ¿Deseas continuar?"
    );
    if (!shouldReset) return;
    try {
      setDescriptionTemplatesSaving(true);
      const rows = await resetComercioWebDescriptionTemplates(token);
      const templates = rows.map(mapDescriptionTemplateFromApi).filter((item) => item.id && item.label);
      setDescriptionConfig({
        templates: templates.length
          ? templates
          : DEFAULT_COMMERCE_DESCRIPTION_CONFIG.templates,
      });
      setDescriptionTemplateSelectedId(
        templates[0]?.id || DEFAULT_COMMERCE_DESCRIPTION_CONFIG.templates[0]?.id || "default"
      );
      setDescriptionEditorDraft(null);
      setDescriptionEditorOriginalId(null);
      showToast("Plantillas restauradas a configuración por defecto.");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "No se pudieron restaurar las plantillas.",
        "error"
      );
    } finally {
      setDescriptionTemplatesSaving(false);
    }
  }

  function createDescriptionTemplate() {
    const templateIndex = descriptionConfig.templates.length + 1;
    const nextId = `plantilla_${Date.now()}`;
    const nextTemplate: DescriptionTemplateConfig = {
      id: nextId,
      label: `Nueva plantilla ${templateIndex}`,
      assigned_category_key: "",
      keywords: [],
      paragraph1: "",
      paragraph2: "",
      paragraph3: "",
      closing: "",
      paragraph1_variants: [],
      paragraph2_variants: [],
      paragraph3_variants: [],
      closing_variants: [],
    };
    setDescriptionEditorMode("create");
    setDescriptionEditorOriginalId(null);
    setDescriptionEditorDraft(nextTemplate);
    showToast("Completa la plantilla y guarda los cambios.");
  }

  async function deleteDescriptionTemplate(templateId: string) {
    if (!token) {
      showToast("Debes iniciar sesión para eliminar plantillas.", "error");
      return;
    }
    if (descriptionConfig.templates.length <= 1) {
      showToast("Debes mantener al menos una plantilla.", "error");
      return;
    }
    const shouldDelete = window.confirm("¿Eliminar esta plantilla?");
    if (!shouldDelete) return;
    try {
      setDescriptionTemplatesSaving(true);
      await deleteComercioWebDescriptionTemplate(token, templateId);
      await loadDescriptionTemplates();
      if (descriptionEditorOriginalId === templateId) {
        setDescriptionEditorDraft(null);
        setDescriptionEditorOriginalId(null);
      }
      showToast("Plantilla eliminada.");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "No se pudo eliminar la plantilla.",
        "error"
      );
    } finally {
      setDescriptionTemplatesSaving(false);
    }
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

  function applyComboGalleryOrder(nextGallery: string[]) {
    setCatalogComboEditor((prev) => ({
      ...prev,
      gallery_urls: nextGallery,
      image_url: nextGallery[0] || "",
      image_thumb_url: nextGallery[0] || "",
    }));
    setCatalogComboDirty(true);
  }

  function moveComboGalleryImage(fromIndex: number, toIndex: number) {
    const current = [...(catalogComboEditor.gallery_urls ?? [])];
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
    applyComboGalleryOrder(current);
  }

  function setComboGalleryPrimary(index: number) {
    moveComboGalleryImage(index, 0);
  }

  function handleComboGalleryDragStart(index: number) {
    setCatalogComboDraggedGalleryIndex(index);
    setCatalogComboDragOverGalleryIndex(index);
  }

  function handleComboGalleryDrop(dropIndex: number) {
    if (catalogComboDraggedGalleryIndex === null) return;
    if (catalogComboDraggedGalleryIndex !== dropIndex) {
      moveComboGalleryImage(catalogComboDraggedGalleryIndex, dropIndex);
    }
    setCatalogComboDraggedGalleryIndex(null);
    setCatalogComboDragOverGalleryIndex(null);
  }

  function shouldSkipRowDrag(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest("button, a, input, textarea, select, label"));
  }

  function patchHomeSliderLocal(slot: number, updater: (current: ComercioWebHomeSlider) => ComercioWebHomeSlider) {
    setHomeSliders((prev) =>
      prev.map((item) => (item.slot === slot ? updater(item) : item))
    );
  }

  function clampPercent(value: number) {
    return Math.max(0, Math.min(100, value));
  }

  function updateHomeSliderCtaPositionFromPointer(slot: number, clientX: number, clientY: number) {
    const shell = homeSliderPositionerRef.current;
    if (!shell) return;
    const rect = shell.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = clampPercent(((clientX - rect.left) / rect.width) * 100);
    const y = clampPercent(((clientY - rect.top) / rect.height) * 100);
    patchHomeSliderLocal(slot, (current) => ({
      ...current,
      cta_x_percent: x,
      cta_y_percent: y,
    }));
  }

  async function handleSaveHomeSlider(slot: number) {
    if (!token) {
      showToast("Debes iniciar sesión para guardar sliders.", "error");
      return;
    }
    const current = homeSliders.find((item) => item.slot === slot);
    if (!current) return;
    try {
      setHomeSlidersSavingSlot(slot);
      setHomeSlidersError(null);
      const saved = await updateComercioWebHomeSlider(token, slot, {
        enabled: current.enabled,
        image_url: current.image_url || null,
        mobile_image_url: current.mobile_image_url || null,
        alt_text: current.alt_text || null,
        cta_label: current.cta_label || null,
        cta_x_percent: current.cta_x_percent,
        cta_y_percent: current.cta_y_percent,
        link_type: current.link_type,
        link_value: current.link_value || null,
        sort_order: current.sort_order,
      });
      patchHomeSliderLocal(slot, () => saved);
      showToast(`Slider ${slot} guardado.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo guardar el slider.";
      setHomeSlidersError(message);
      showToast(message, "error");
    } finally {
      setHomeSlidersSavingSlot(null);
    }
  }

  async function handleHomeSliderImageFileChange(
    slot: number,
    file: File,
    target: "desktop" | "mobile" = "desktop"
  ) {
    if (!token) {
      showToast("Debes iniciar sesión para subir la imagen.", "error");
      return;
    }

    if (target === "mobile") {
      setHomeSliderMobileUploadingSlot(slot);
    } else {
      setHomeSliderUploadingSlot(slot);
    }
    setHomeSlidersError(null);

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
      patchHomeSliderLocal(slot, (current) => ({
        ...current,
        image_url: target === "desktop" ? data.url || current.image_url : current.image_url,
        mobile_image_url:
          target === "mobile" ? data.url || current.mobile_image_url : current.mobile_image_url,
      }));
      showToast(
        target === "mobile"
          ? "Imagen móvil del slider cargada con éxito."
          : "Imagen del slider cargada con éxito."
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo subir la imagen del slider.";
      setHomeSlidersError(message);
      showToast(message, "error");
    } finally {
      if (target === "mobile") {
        setHomeSliderMobileUploadingSlot(null);
      } else {
        setHomeSliderUploadingSlot(null);
      }
      setHomeSliderPickerSlot(null);
      setHomeSliderPickerTarget("desktop");
      if (homeSliderImageInputRef.current) homeSliderImageInputRef.current.value = "";
    }
  }

  async function handleCatalogImageFileChange(file: File) {
    const galleryUrls = catalogEditor.web_gallery_urls ?? [];
    if (!token) {
      showToast("Debes iniciar sesión para subir la imagen.", "error");
      return;
    }
    if (galleryUrls.length >= MAX_CATALOG_GALLERY_IMAGES) {
      showToast(`Solo puedes cargar hasta ${MAX_CATALOG_GALLERY_IMAGES} imágenes por publicación.`, "error");
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
        ).slice(0, MAX_CATALOG_GALLERY_IMAGES),
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

  async function getVideoDurationSeconds(file: File): Promise<number> {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        const duration = Number(video.duration || 0);
        URL.revokeObjectURL(objectUrl);
        if (!Number.isFinite(duration) || duration <= 0) {
          reject(new Error("No pudimos leer la duración del video."));
          return;
        }
        resolve(duration);
      };
      video.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("No se pudo procesar el video seleccionado."));
      };
      video.src = objectUrl;
    });
  }

  async function handleCatalogVideoFileChange(file: File) {
    if (!token) {
      showToast("Debes iniciar sesión para subir el video.", "error");
      return;
    }
    const isMp4 = file.type === "video/mp4";
    const isMov = file.type === "video/quicktime" || file.name.toLowerCase().endsWith(".mov");
    if (!isMp4 && !isMov) {
      showToast("Solo se permite video MP4 o MOV.", "error");
      return;
    }

    let durationSeconds = 0;
    try {
      durationSeconds = await getVideoDurationSeconds(file);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "No se pudo leer la duración del video.", "error");
      return;
    }
    if (durationSeconds > MAX_CATALOG_VIDEO_DURATION_SECONDS) {
      showToast(`El video no puede superar ${MAX_CATALOG_VIDEO_DURATION_SECONDS} segundos.`, "error");
      return;
    }

    setCatalogVideoUploading(true);
    setCatalogError(null);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const uploadRes = await fetch(`${getApiBase()}/uploads/product-videos`, {
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
          `Error al subir video (código ${uploadRes.status})`;
        throw new Error(msg);
      }
      const data: UploadProductVideoResponse = await uploadRes.json();
      setCatalogEditor((prev) => ({
        ...prev,
        web_video_url: data.url || "",
      }));
      setCatalogDirty(true);
      showToast("Video cargado con éxito.");
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : "No se pudo subir el video");
      showToast("No se pudo subir el video.", "error");
    } finally {
      setCatalogVideoUploading(false);
      if (catalogVideoInputRef.current) catalogVideoInputRef.current.value = "";
    }
  }

  async function handleComboImageFileChange(file: File) {
    const galleryUrls = catalogComboEditor.gallery_urls ?? [];
    if (!token) {
      showToast("Debes iniciar sesión para subir la imagen.", "error");
      return;
    }
    if (galleryUrls.length >= MAX_CATALOG_GALLERY_IMAGES) {
      showToast(`Solo puedes cargar hasta ${MAX_CATALOG_GALLERY_IMAGES} imágenes por combo.`, "error");
      return;
    }

    setCatalogImageUploading(true);
    setCatalogCombosError(null);
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
      setCatalogComboEditor((prev) => ({
        ...prev,
        gallery_urls: [...(prev.gallery_urls ?? []), data.url]
          .filter((value, index, list) => Boolean(value?.trim()) && list.indexOf(value) === index)
          .slice(0, MAX_CATALOG_GALLERY_IMAGES),
        image_url: (prev.gallery_urls ?? []).length > 0 ? (prev.gallery_urls ?? [])[0] : data.url,
        image_thumb_url:
          (prev.gallery_urls ?? []).length > 0
            ? (prev.gallery_urls ?? [])[0]
            : data.thumb_url || data.url,
      }));
      setCatalogComboDirty(true);
      showToast("Imagen cargada con éxito.");
    } catch (err) {
      setCatalogCombosError(err instanceof Error ? err.message : "No se pudo subir la imagen");
      showToast("No se pudo subir la imagen.", "error");
    } finally {
      setCatalogImageUploading(false);
      if (catalogComboImageInputRef.current) catalogComboImageInputRef.current.value = "";
    }
  }

  async function handleComboVideoFileChange(file: File) {
    if (!token) {
      showToast("Debes iniciar sesión para subir el video.", "error");
      return;
    }
    const isMp4 = file.type === "video/mp4";
    const isMov = file.type === "video/quicktime" || file.name.toLowerCase().endsWith(".mov");
    if (!isMp4 && !isMov) {
      showToast("Solo se permite video MP4 o MOV.", "error");
      return;
    }

    let durationSeconds = 0;
    try {
      durationSeconds = await getVideoDurationSeconds(file);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "No se pudo leer la duración del video.", "error");
      return;
    }
    if (durationSeconds > MAX_CATALOG_VIDEO_DURATION_SECONDS) {
      showToast(`El video no puede superar ${MAX_CATALOG_VIDEO_DURATION_SECONDS} segundos.`, "error");
      return;
    }

    setCatalogVideoUploading(true);
    setCatalogCombosError(null);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const uploadRes = await fetch(`${getApiBase()}/uploads/product-videos`, {
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
          `Error al subir video (código ${uploadRes.status})`;
        throw new Error(msg);
      }
      const data: UploadProductVideoResponse = await uploadRes.json();
      setCatalogComboEditor((prev) => ({
        ...prev,
        video_url: data.url || "",
      }));
      setCatalogComboDirty(true);
      showToast("Video cargado con éxito.");
    } catch (err) {
      setCatalogCombosError(err instanceof Error ? err.message : "No se pudo subir el video");
      showToast("No se pudo subir el video.", "error");
    } finally {
      setCatalogVideoUploading(false);
      if (catalogComboVideoInputRef.current) catalogComboVideoInputRef.current.value = "";
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
        serializeTechnicalSpecsForShortDescription(catalogEditor.web_technical_specs) || null,
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
      web_video_url: catalogEditor.web_video_url.trim() || null,
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
      void loadCatalogProducts({ silent: true });
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
    void loadCatalogProducts({ silent: true });
    return updated;
  }

  async function handleDeleteCatalogProduct(product: ComercioWebCatalogProduct) {
    if (!token || !canManage) return;
    setCatalogError(null);
    await updateComercioWebCatalogProduct(token, product.id, {
      web_published: false,
      web_featured: false,
    });
    setPublishedCatalogProducts((prev) => prev.filter((row) => row.id !== product.id));
    setCatalogSearchResults((prev) => prev.filter((row) => row.id !== product.id));
    if (selectedProductId === product.id) {
      setSelectedProductId(null);
    }
    void loadCatalogProducts({ silent: true });
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
        "Esta acción quitará el producto de esta tabla y solo lo despublicará de la operación web.",
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
      discount_type: row.discount_type === "fixed_amount" ? "fixed_amount" : "percent",
      discount_value: String(
        (row.discount_type === "fixed_amount" ? row.discount_value : row.discount_percent) ?? ""
      ),
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

  function buildExistingDiscountCodeSet(extraCodes: string[] = []): Set<string> {
    return new Set(
      [...discountCodeRows.map((row) => (row.code || "").trim().toUpperCase()), ...extraCodes]
        .map((value) => value.trim().toUpperCase())
        .filter((value) => value.length > 0)
    );
  }

  function createGeneratedDiscountCode(existing: Set<string>): string {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const makeCode = (length: number) =>
      Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = makeCode(attempt < 12 ? 6 : 7);
      if (!existing.has(candidate)) {
        return candidate;
      }
    }
    return makeCode(7);
  }

  function generateUniqueDiscountCode() {
    const existing = buildExistingDiscountCodeSet();
    const nextCode = createGeneratedDiscountCode(existing);
    setDiscountCodeEditor((prev) => ({ ...prev, code: nextCode }));
    setDiscountCodeError(null);
  }

  function exportDiscountCodesCsv(rows: ComercioWebDiscountCode[], filenamePrefix = "cupones") {
    const header = ["codigo", "tipo", "valor_descuento", "estado", "max_uses", "inicio", "fin"];
    const body = rows.map((row) => [
      row.code || "",
      row.discount_type === "fixed_amount" ? "valor_fijo" : "porcentaje",
      String(row.discount_type === "fixed_amount" ? row.discount_value || 0 : row.discount_percent || 0),
      row.is_active ? "activo" : "inactivo",
      row.max_uses ?? "",
      row.starts_at ?? "",
      row.ends_at ?? "",
    ]);
    const csvContent = [header, ...body]
      .map((line) => line.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    link.href = url;
    link.download = `${filenamePrefix}-${timestamp}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  function exportDiscountCodesPrintSheet(rows: ComercioWebDiscountCode[], title = "Cupones promocionales") {
    if (!rows.length) return;
    const formatPrintDate = (value?: string | null) => {
      if (!value) return "";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "";
      return new Intl.DateTimeFormat("es-CO", { dateStyle: "short" }).format(date);
    };
    const qrTargetUrl = "https://kensarelectronic.com";
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrTargetUrl)}`;
    const printableRows = rows
      .map((row) => {
        const discountLabel =
          row.discount_type === "fixed_amount"
            ? `${formatMoney(row.discount_value || 0)} OFF`
            : `${row.discount_percent || 0}% OFF`;
        const startDate = formatPrintDate(row.starts_at);
        const endDate = formatPrintDate(row.ends_at);
        const validity = startDate && endDate
          ? `Vigencia: ${startDate} - ${endDate}`
          : startDate
            ? `Vigencia desde: ${startDate}`
            : endDate
              ? `Vigencia hasta: ${endDate}`
              : "Vigencia: Sin fecha límite";
        const usageHint = "Úsalo al finalizar tu compra en el campo de código de descuento.";
        return `
          <article class="coupon-card">
            <div class="coupon-header">
              <div class="brand">KENSAR ELECTRONIC</div>
              <img class="qr" src="${qrImageUrl}" alt="QR kensarelectronic.com" />
            </div>
            <div class="code">${row.code}</div>
            <div class="discount">${discountLabel}</div>
            <div class="meta">${validity}</div>
            <div class="meta">${usageHint}</div>
            <div class="meta">Escanea para entrar a kensarelectronic.com</div>
          </article>
        `;
      })
      .join("");

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${title}</title>
          <style>
            @page { size: A4 portrait; margin: 10mm; }
            * { box-sizing: border-box; }
            body { margin: 0; font-family: Arial, sans-serif; color: #0f172a; }
            .sheet-title { margin: 0 0 10px; font-size: 16px; font-weight: 700; }
            .grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 8px;
            }
            .coupon-card {
              border: 1px dashed #334155;
              border-radius: 10px;
              padding: 10px;
              min-height: 145px;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
            }
            .coupon-header {
              display: flex;
              align-items: flex-start;
              justify-content: space-between;
              gap: 8px;
            }
            .brand { font-size: 11px; letter-spacing: .08em; font-weight: 700; color: #475569; }
            .qr { width: 56px; height: 56px; border: 1px solid #cbd5e1; border-radius: 6px; }
            .code { font-size: 24px; font-weight: 800; letter-spacing: .05em; margin: 8px 0 4px; }
            .discount { font-size: 16px; font-weight: 700; margin-bottom: 6px; }
            .meta { font-size: 10px; color: #64748b; }
          </style>
        </head>
        <body>
          <h1 class="sheet-title">${title}</h1>
          <section class="grid">${printableRows}</section>
          <script>
            window.onload = () => { window.print(); };
          </script>
        </body>
      </html>
    `;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const printUrl = window.URL.createObjectURL(blob);
    const opened = window.open(printUrl, "_blank");
    if (!opened) {
      window.URL.revokeObjectURL(printUrl);
      showToast("Safari bloqueó la ventana de impresión. Permite pop-ups e intenta de nuevo.", "error");
      return;
    }
    window.setTimeout(() => {
      window.URL.revokeObjectURL(printUrl);
    }, 45000);
  }

  function openDiscountCodeBatchComposer() {
    const initial = {
      ...emptyDiscountCodeBatchState,
      ...getRangeForPeriod(emptyDiscountCodeBatchState.period),
      discount_type: discountCodeEditor.discount_type || "percent",
      discount_value: discountCodeEditor.discount_value || "",
      max_uses: discountCodeEditor.max_uses || "",
      is_active: discountCodeEditor.is_active,
    };
    setDiscountCodeBatchEditor(initial);
    setDiscountCodeBatchCreated([]);
    setDiscountCodeBatchError(null);
    setDiscountCodeBatchOpen(true);
  }

  function handleDiscountCodeBatchPeriodChange(period: DiscountCodePeriodOption) {
    const range = getRangeForPeriod(period);
    setDiscountCodeBatchEditor((prev) => ({
      ...prev,
      period,
      starts_at: period === "custom" ? prev.starts_at || range.startsAt : range.startsAt,
      ends_at: period === "custom" ? prev.ends_at : range.endsAt,
    }));
  }

  async function handleCreateDiscountCodesBatch() {
    if (!token || !canManage) return;
    const quantity = Number(discountCodeBatchEditor.quantity || 0);
    const discountValue = Number(discountCodeBatchEditor.discount_value || 0);
    const maxUsesRaw = discountCodeBatchEditor.max_uses.trim();
    const maxUses = maxUsesRaw ? Number(maxUsesRaw) : null;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 200) {
      setDiscountCodeBatchError("La cantidad debe ser un entero entre 1 y 200.");
      return;
    }
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      setDiscountCodeBatchError("El valor del descuento debe ser mayor a 0.");
      return;
    }
    if (discountCodeBatchEditor.discount_type === "percent" && discountValue > 100) {
      setDiscountCodeBatchError("El descuento porcentual debe ser un valor entre 0 y 100.");
      return;
    }
    if (
      maxUsesRaw &&
      (!Number.isInteger(maxUses) || !Number.isFinite(maxUses) || Number(maxUses) < 1)
    ) {
      setDiscountCodeBatchError("El uso máximo debe ser un número entero mayor o igual a 1.");
      return;
    }

    let startsAt: string | null = null;
    let endsAt: string | null = null;
    if (discountCodeBatchEditor.period === "custom") {
      startsAt = fromDateTimeLocalInput(discountCodeBatchEditor.starts_at);
      endsAt = fromDateTimeLocalInput(discountCodeBatchEditor.ends_at);
      if (!startsAt || !endsAt) {
        setDiscountCodeBatchError("Debes definir fecha inicio y fecha fin para el periodo personalizado.");
        return;
      }
    } else {
      startsAt = fromDateTimeLocalInput(discountCodeBatchEditor.starts_at);
      endsAt = fromDateTimeLocalInput(discountCodeBatchEditor.ends_at);
    }

    try {
      setDiscountCodeBatchSaving(true);
      setDiscountCodeBatchError(null);
      const created: string[] = [];
      const existing = buildExistingDiscountCodeSet();
      for (let index = 0; index < quantity; index += 1) {
        let success = false;
        let retries = 0;
        while (!success && retries < 6) {
          const code = createGeneratedDiscountCode(existing);
          try {
            await createComercioWebDiscountCode(token, {
              code,
              discount_type: discountCodeBatchEditor.discount_type,
              discount_value: discountValue,
              discount_percent: discountCodeBatchEditor.discount_type === "percent" ? discountValue : 0,
              is_active: discountCodeBatchEditor.is_active,
              max_uses: maxUses,
              starts_at: startsAt,
              ends_at: endsAt,
            });
            created.push(code);
            existing.add(code);
            success = true;
          } catch (error) {
            retries += 1;
            if (retries >= 6) throw error;
          }
        }
      }
      setDiscountCodeBatchCreated(created);
      showToast(`Se crearon ${created.length} cupones.`);
      await loadDiscountCodes();
    } catch (err) {
      setDiscountCodeBatchError(err instanceof Error ? err.message : "No se pudo crear el lote de cupones.");
      showToast("No se pudo crear el lote de cupones.", "error");
    } finally {
      setDiscountCodeBatchSaving(false);
    }
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
    const discountType = discountCodeEditor.discount_type;
    const discountValue = Number(discountCodeEditor.discount_value);
    const maxUsesRaw = discountCodeEditor.max_uses.trim();
    const maxUses = maxUsesRaw ? Number(maxUsesRaw) : null;
    if (!code) {
      setDiscountCodeError("Debes ingresar el código.");
      return;
    }
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      setDiscountCodeError("El valor del descuento debe ser mayor a 0.");
      return;
    }
    if (discountType === "percent" && discountValue > 100) {
      setDiscountCodeError("El descuento porcentual debe ser un valor entre 0 y 100.");
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
        discount_type: discountType,
        discount_value: discountValue,
        discount_percent: discountType === "percent" ? discountValue : 0,
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

  async function openDiscountCodeHistory(row: ComercioWebDiscountCode) {
    if (!token) return;
    try {
      setDiscountCodeHistoryLoading(true);
      setDiscountCodeHistoryError(null);
      setDiscountCodeHistoryOpenId(row.id);
      setDiscountCodeHistoryOpenCode(row.code);
      const page = await fetchComercioWebDiscountCodeUsage(token, row.id, { skip: 0, limit: 100 });
      setDiscountCodeHistoryRows(page.items || []);
      setDiscountCodeHistoryTotal(page.total || 0);
    } catch (err) {
      setDiscountCodeHistoryRows([]);
      setDiscountCodeHistoryTotal(0);
      setDiscountCodeHistoryError(err instanceof Error ? err.message : "No se pudo cargar el historial.");
    } finally {
      setDiscountCodeHistoryLoading(false);
    }
  }

  function toggleDiscountCodeSelection(row: ComercioWebDiscountCode) {
    setSelectedDiscountCodeMap((prev) => {
      const next = { ...prev };
      if (next[row.id]) {
        delete next[row.id];
      } else {
        next[row.id] = row;
      }
      return next;
    });
  }

  function toggleSelectAllVisibleDiscountCodes(checked: boolean) {
    setSelectedDiscountCodeMap((prev) => {
      const next = { ...prev };
      if (checked) {
        visibleDiscountCodeRows.forEach((row) => {
          next[row.id] = row;
        });
      } else {
        visibleDiscountCodeRows.forEach((row) => {
          delete next[row.id];
        });
      }
      return next;
    });
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
  const homeSliderBeingPositioned = useMemo(
    () =>
      homeSliderPositioningSlot !== null
        ? homeSliders.find((item) => item.slot === homeSliderPositioningSlot) || null
        : null,
    [homeSliderPositioningSlot, homeSliders]
  );
  const homeSliderOrderItems = useMemo(
    () =>
      homeSliders
        .slice()
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.slot - b.slot),
    [homeSliders]
  );
  const homeSliderCards = useMemo(
    () =>
      homeSliders
        .slice()
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.slot - b.slot),
    [homeSliders]
  );
  const sliderModalCtaVisual = useMemo(() => {
    const previewWidth = homeSliderPreviewWidth > 0 ? homeSliderPreviewWidth : viewportWidth;
    const scale = Math.max(0.72, Math.min(1, previewWidth / Math.max(1, viewportWidth)));
    return {
      minHeight: Math.round(46 * scale),
      fontSizeRem: Number((2.05 * scale).toFixed(3)),
      radius: Math.round(14 * scale),
      paddingX: Math.round(24 * scale),
    };
  }, [homeSliderPreviewWidth, viewportWidth]);
  const selectedDeliverySummary = useMemo(
    () => resolveOrderDeliverySummary(selectedOrder, selectedCheckoutContext),
    [selectedOrder, selectedCheckoutContext]
  );
  const catalogActionMeta = getCatalogActionMeta(catalogActionConfirm);
  const completePendingCatalogExit = useCallback(() => {
    if (!pendingCatalogExitAction) return;
    const action = pendingCatalogExitAction;
    setPendingCatalogExitAction(null);
    executeCatalogExitAction(action);
  }, [executeCatalogExitAction, pendingCatalogExitAction]);

  function openHomeSliderOrderEditor() {
    setHomeSliderOrderDraft(homeSliderOrderItems.map((item) => item.slot));
    setHomeSliderOrderDraggedSlot(null);
    setHomeSliderOrderEditorOpen(true);
  }

  function moveHomeSliderOrderSlot(fromSlot: number, toSlot: number) {
    if (fromSlot === toSlot) return;
    setHomeSliderOrderDraft((prev) => {
      const fromIndex = prev.indexOf(fromSlot);
      const toIndex = prev.indexOf(toSlot);
      if (fromIndex < 0 || toIndex < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  async function handleApplyHomeSliderOrder() {
    if (!token) {
      showToast("Debes iniciar sesión para guardar orden.", "error");
      return;
    }
    if (!homeSliderOrderDraft.length) {
      setHomeSliderOrderEditorOpen(false);
      return;
    }
    try {
      setHomeSliderOrderSaving(true);
      setHomeSlidersError(null);

      const orderBySlot = new Map<number, number>();
      homeSliderOrderDraft.forEach((slot, index) => {
        orderBySlot.set(slot, index * 10);
      });

      const updates = homeSliders
        .map((item) => ({
          slot: item.slot,
          sort_order: orderBySlot.get(item.slot) ?? item.sort_order ?? item.slot * 10,
        }))
        .filter((item) => {
          const current = homeSliders.find((row) => row.slot === item.slot);
          return (current?.sort_order ?? 0) !== item.sort_order;
        });

      await Promise.all(
        updates.map((item) =>
          updateComercioWebHomeSlider(token, item.slot, { sort_order: item.sort_order })
        )
      );

      setHomeSliders((prev) =>
        prev.map((item) => ({
          ...item,
          sort_order: orderBySlot.get(item.slot) ?? item.sort_order,
        }))
      );
      setHomeSliderOrderEditorOpen(false);
      showToast("Orden de sliders actualizado.");
      await loadHomeSliders();
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo guardar el orden.";
      setHomeSlidersError(message);
      showToast(message, "error");
    } finally {
      setHomeSliderOrderSaving(false);
    }
  }

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
                onClick={() => requestWorkspaceChange("combos")}
                className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                  catalogWorkspaceView === "combos"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                }`}
              >
                Combos
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
              <button
                type="button"
                onClick={() => requestWorkspaceChange("descriptions")}
                className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                  catalogWorkspaceView === "descriptions"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                }`}
              >
                Descripciones
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
                  <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-7">
                    <SummaryMini label="Publicados" value={catalogMetrics.published} />
                    <SummaryMini label="Destacados" value={catalogMetrics.featured} />
                    <SummaryMini label="Descuento" value={catalogMetrics.discounted} />
                    <SummaryMini label="Consultar" value={catalogMetrics.consult} />
                    <SummaryMini
                      label="Con stock sin imagen"
                      value={catalogMetrics.without_image}
                      tone={catalogMetrics.without_image > 0 ? "warning" : "default"}
                      showAlert={catalogMetrics.without_image > 0}
                      isActive={publishedCatalogStockFilter === "without_image"}
                      onClick={() =>
                        setPublishedCatalogStockFilter((prev) =>
                          prev === "without_image" ? "all" : "without_image"
                        )
                      }
                    />
                    <SummaryMini
                      label="Con stock (publicados)"
                      value={catalogMetrics.with_stock}
                      tone="success"
                      isActive={publishedCatalogStockFilter === "with_stock"}
                      onClick={() =>
                        setPublishedCatalogStockFilter((prev) =>
                          prev === "with_stock" ? "all" : "with_stock"
                        )
                      }
                    />
                    <SummaryMini
                      label="Sin stock (publicados)"
                      value={catalogMetrics.without_stock}
                      tone="danger"
                      isActive={publishedCatalogStockFilter === "without_stock"}
                      onClick={() =>
                        setPublishedCatalogStockFilter((prev) =>
                          prev === "without_stock" ? "all" : "without_stock"
                        )
                      }
                    />
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
                        <option value="published">Publicado</option>
                        <option value="paused">Pausado</option>
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
                            event.target.value as
                              | "newest"
                              | "oldest"
                              | "alphabetical"
                              | "price_asc"
                              | "price_desc"
                          )
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                      >
                        <option value="newest">Más reciente</option>
                        <option value="oldest">Más antiguo</option>
                        <option value="alphabetical">Alfabético</option>
                        <option value="price_asc">Precio: menor a mayor</option>
                        <option value="price_desc">Precio: mayor a menor</option>
                      </select>
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex min-h-[2.5rem] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
                        <input
                          type="checkbox"
                          checked={publishedCatalogActiveOnly}
                          onChange={(event) => setPublishedCatalogActiveOnly(event.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        Mostrar solo activos
                      </label>
                      <label className="inline-flex min-h-[2.5rem] items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800">
                        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Categoría
                        </span>
                        <select
                          value={publishedCatalogCategoryFilter}
                          onChange={(event) => setPublishedCatalogCategoryFilter(event.target.value)}
                          className="w-[12rem] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                        >
                          <option value="all">Todas</option>
                          {allCatalogCategoryOptions.map((category) => (
                            <option key={`filter-category-${category.id}`} value={category.key}>
                              {`${"  ".repeat(Math.max(0, (category.level || 1) - 1))}${category.name}`}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        disabled={!hasPublishedCatalogActiveFilters}
                        onClick={() => {
                          setPublishedCatalogFilter("");
                          setPublishedCatalogFieldFilter("all");
                          setPublishedCatalogStatusFilter("all");
                          setPublishedCatalogFeaturedFilter("all");
                          setPublishedCatalogBadgeFilter("all");
                          setPublishedCatalogStockFilter("all");
                          setPublishedCatalogCategoryFilter("all");
                          setPublishedCatalogOrderFilter("newest");
                          setPublishedCatalogActiveOnly(true);
                        }}
                        className={`relative rounded-xl border px-3 py-2 text-xs font-medium transition ${
                          hasPublishedCatalogActiveFilters
                            ? "border-slate-400 bg-slate-100 text-slate-800 shadow-sm hover:border-slate-500"
                            : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                        }`}
                      >
                        Limpiar filtros
                        {hasPublishedCatalogActiveFilters ? (
                          <span
                            className="absolute -left-2 -top-2 inline-flex h-6 w-6 animate-bounce items-center justify-center rounded-full border-2 border-white bg-rose-600 text-[11px] font-bold leading-none shadow-[0_6px_14px_rgba(225,29,72,0.38)] ring-1 ring-rose-300/70"
                            style={{ color: "#ffffff" }}
                          >
                            {publishedCatalogActiveFiltersCount}
                          </span>
                        ) : null}
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
                      disabled={catalogExporting}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                    >
                      Refrescar publicaciones
                    </button>
                    <button
                      type="button"
                      onClick={() => void exportCatalogProductsXlsx()}
                      disabled={catalogExporting}
                      className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 transition hover:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {catalogExporting ? "Exportando..." : "Exportar Excel (.xlsx)"}
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
                <div
                  ref={publishedCatalogTableScrollRef}
                  className="max-h-[32rem] overflow-auto rounded-2xl border border-slate-200"
                >
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
                            className={`border-b border-slate-100 align-top ${resolveCatalogRowStockClass(product)} ${canManage ? "cursor-pointer" : ""}`}
                          >
                            <td className="px-4 py-3">
                              <div className="min-w-[18rem]">
                                <p className="font-medium text-slate-900">
                                  {getCatalogDisplayName(product)}
                                </p>
                                <p className="mt-1 max-w-[64ch] truncate text-xs text-slate-500">
                                  {product.web_long_description?.trim() || "Sin descripción comercial"}
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

                      <div className="grid gap-3 md:grid-cols-2">
                        <LabeledField label="Descripción larga">
                          <div className="mb-2 flex items-center gap-1.5">
                            <select
                              value={catalogDescriptionTemplateId}
                              onChange={(event) => setCatalogDescriptionTemplateId(event.target.value)}
                              className="w-[11rem] min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700 outline-none focus:border-emerald-400"
                            >
                              {descriptionConfig.templates.map((template) => (
                                <option key={`catalog-description-template-${template.id}`} value={template.id}>
                                  {template.label}
                                  {template.assigned_category_key
                                    ? ` · ${getWebCategoryPathLabel(template.assigned_category_key)}`
                                    : ""}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={catalogDescriptionGenerating || catalogDescriptionSpecsUpdating}
                              onClick={() => void handleGenerateCatalogDescription()}
                              className="whitespace-nowrap rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-[11px] font-medium text-emerald-700 transition hover:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              {catalogDescriptionGenerating
                                ? "Generando..."
                                : "Generar descripción"}
                            </button>
                            <button
                              type="button"
                              disabled={catalogDescriptionGenerating || catalogDescriptionSpecsUpdating}
                              onClick={() => void handleUpdateCatalogDescriptionSpecs()}
                              className="whitespace-nowrap rounded-lg border border-blue-300 bg-blue-50 px-2 py-1.5 text-[11px] font-medium text-blue-700 transition hover:border-blue-400 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              {catalogDescriptionSpecsUpdating
                                ? "Actualizando..."
                                : "Actualizar características"}
                            </button>
                          </div>
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

                          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                Caracteristicas tecnicas
                              </p>
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={openCatalogSpecModal}
                                  className="rounded-lg border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 transition hover:border-blue-400"
                                >
                                  +
                                </button>
                                {catalogSpecModalOpen ? (
                                  <div className="absolute right-0 z-40 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                      Nueva caracteristica
                                    </p>
                                    <select
                                      value={catalogSpecDraftType}
                                      onChange={(event) => setCatalogSpecDraftType(event.target.value)}
                                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-emerald-400"
                                    >
                                      {technicalSpecTypeOptions.map((option) => (
                                        <option key={`technical-spec-type-${option}`} value={option}>
                                          {option}
                                        </option>
                                      ))}
                                    </select>
                                    <input
                                      value={catalogSpecDraftValue}
                                      onChange={(event) => setCatalogSpecDraftValue(event.target.value)}
                                      placeholder="Ej: 3 Mts o deja vacío si solo aplica el tipo"
                                      className="mt-2 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-emerald-400"
                                    />
                                    <p className="mt-1 text-[11px] text-slate-500">
                                      Algunos tipos, como USB o Bluetooth, pueden agregarse solo con el nombre.
                                    </p>
                                    <div className="mt-2 flex justify-end gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setCatalogSpecModalOpen(false)}
                                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                                      >
                                        Cancelar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={addCatalogTechnicalSpec}
                                        className="rounded-lg border border-blue-700 bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
                                      >
                                        Agregar
                                      </button>
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            </div>

                            <div className="mt-2 space-y-1.5">
                              {catalogEditor.web_technical_specs.length ? (
                                catalogEditor.web_technical_specs.map((spec, index) => (
                                  <div
                                    key={`catalog-spec-${index}-${spec.type}`}
                                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-2.5 py-2"
                                  >
                                    <span className="text-sm text-slate-700">
                                      <strong>{spec.type}</strong>
                                      {spec.value.trim() ? <span>: {spec.value}</span> : null}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => removeCatalogTechnicalSpec(index)}
                                      className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-700 transition hover:border-rose-300"
                                    >
                                      Quitar
                                    </button>
                                  </div>
                                ))
                              ) : (
                                <p className="text-xs text-slate-500">
                                  Aun no hay caracteristicas agregadas.
                                </p>
                              )}
                            </div>
                          </div>
                        </LabeledField>
                      </div>

                      <div className="block">
                        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Imagen
                        </span>
                        <div className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3">
                          <div className="flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              disabled={
                                catalogImageUploading ||
                                (catalogEditor.web_gallery_urls ?? []).length >= MAX_CATALOG_GALLERY_IMAGES
                              }
                              onClick={() => catalogImageInputRef.current?.click()}
                              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {catalogImageUploading ? "Subiendo..." : "Agregar imagen"}
                            </button>
                            <button
                              type="button"
                              disabled={catalogVideoUploading || Boolean(catalogEditor.web_video_url?.trim())}
                              onClick={() => catalogVideoInputRef.current?.click()}
                              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {catalogVideoUploading ? "Subiendo video..." : "Agregar video"}
                            </button>
                            <span className="text-xs text-slate-500">
                              JPG, PNG o WebP. Recomendado: 1200x1200 px (1:1), hasta {MAX_CATALOG_GALLERY_IMAGES} imágenes. La primera será la principal.
                            </span>
                            <span className="text-xs text-slate-500">
                              Video: 1 archivo MP4 o MOV, máximo {MAX_CATALOG_VIDEO_DURATION_SECONDS}s. El sistema lo comprime automáticamente.
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
                          <input
                            ref={catalogVideoInputRef}
                            type="file"
                            accept="video/mp4,video/quicktime,.mov"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (!file) return;
                              void handleCatalogVideoFileChange(file);
                            }}
                            className="hidden"
                          />
                          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                            {(catalogEditor.web_gallery_urls ?? []).length || catalogEditor.web_video_url?.trim() ? (
                              <div className="grid grid-flow-col auto-cols-[minmax(220px,220px)] gap-3 overflow-x-auto pb-1">
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
                                {catalogEditor.web_video_url?.trim() ? (
                                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                                    <div className="relative h-28 overflow-hidden rounded-lg border border-slate-200 bg-black">
                                      <video
                                        src={resolveAssetUrl(catalogEditor.web_video_url) || catalogEditor.web_video_url}
                                        className="h-full w-full object-contain"
                                        controls
                                        preload="metadata"
                                      />
                                    </div>
                                    <div className="mt-2 space-y-1.5">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="truncate text-[11px] text-slate-500">Video (último)</span>
                                      </div>
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-[11px] font-medium text-slate-500">
                                          Se publica al final
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setCatalogEditor((prev) => ({ ...prev, web_video_url: "" }));
                                            setCatalogDirty(true);
                                          }}
                                          className="text-[11px] font-medium text-rose-600"
                                        >
                                          Quitar
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ) : null}
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
                                    <p className="mt-2.5 min-h-[40px] line-clamp-2 text-xs leading-5 text-slate-600">
                                      {catalogEditor.web_long_description.trim() ||
                                        "Sin descripción comercial."}
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
          {catalogWorkspaceView === "descriptions" ? (
            <SectionCard
              title={descriptionEditorOpen ? "Editor de Plantilla" : "Descripciones Base"}
              subtitle={
                descriptionEditorOpen
                  ? "Edita la plantilla seleccionada y guarda los cambios para aplicarlos."
                  : "Gestiona las plantillas de descripcion. Doble click para editar."
              }
            >
              {!descriptionEditorOpen ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-slate-600">
                        Doble click en una fila para abrir el editor de plantilla.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={createDescriptionTemplate}
                          disabled={descriptionTemplatesLoading || descriptionTemplatesSaving}
                          className="rounded-xl border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 transition hover:border-blue-400"
                        >
                          + Nueva plantilla
                        </button>
                        <button
                          type="button"
                          onClick={() => void resetDescriptionTemplatesToDefault()}
                          disabled={descriptionTemplatesLoading || descriptionTemplatesSaving}
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                        >
                          Restaurar plantillas por defecto
                        </button>
                      </div>
                    </div>
                    <div className="max-h-[22rem] overflow-auto rounded-xl border border-slate-200">
                      <table className="min-w-full text-sm">
                        <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-[0.16em] text-slate-500">
                          <tr>
                            <th className="px-3 py-2">Plantilla</th>
                            <th className="px-3 py-2">Asignada a</th>
                            <th className="px-3 py-2">Keywords</th>
                            <th className="px-3 py-2 text-right">Acciones</th>
                          </tr>
                        </thead>
                      <tbody>
                        {descriptionTemplatesLoading ? (
                          <tr>
                            <td colSpan={4} className="px-3 py-6 text-center text-xs text-slate-500">
                              Cargando plantillas...
                            </td>
                          </tr>
                        ) : descriptionConfig.templates.length ? (
                          descriptionConfig.templates.map((template) => {
                            const isSelected = selectedDescriptionTemplate?.id === template.id;
                            return (
                              <tr
                                key={template.id}
                                onDoubleClick={() => {
                                  if (descriptionTemplatesSaving) return;
                                  openDescriptionTemplateEditor(template.id);
                                }}
                                className="border-b border-slate-100 hover:bg-slate-50"
                              >
                                <td className="px-3 py-2">
                                  <button
                                    type="button"
                                    onClick={() => setDescriptionTemplateSelectedId(template.id)}
                                    className={`text-left text-sm ${isSelected ? "font-semibold text-blue-800" : "text-slate-800"}`}
                                  >
                                    {template.label || "Plantilla sin nombre"}
                                  </button>
                                </td>
                                <td className="px-3 py-2 text-xs text-slate-600">
                                  {template.assigned_category_key
                                    ? getWebCategoryPathLabel(template.assigned_category_key)
                                    : "Sin asignar"}
                                </td>
                                <td className="px-3 py-2 text-xs text-slate-600">
                                  {template.keywords.length}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <button
                                    type="button"
                                    disabled={descriptionTemplatesSaving}
                                    onClick={() => void deleteDescriptionTemplate(template.id)}
                                    className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 transition hover:border-rose-300"
                                  >
                                    Eliminar
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={4} className="px-3 py-6 text-center text-xs text-slate-500">
                              No hay plantillas registradas.
                            </td>
                          </tr>
                        )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : descriptionEditorDraft ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-700">
                      {descriptionEditorMode === "create"
                        ? "Nueva plantilla en creación."
                        : `Editando: ${descriptionEditorDraft.label || "Plantilla sin nombre"}`}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={cancelDescriptionTemplateEditor}
                        disabled={descriptionTemplatesSaving}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={descriptionTemplatesSaving}
                        onClick={() => void saveDescriptionTemplateEditor()}
                        className="rounded-xl border border-blue-700 bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
                      >
                        {descriptionTemplatesSaving ? "Guardando..." : "Guardar cambios"}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="block">
                        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Nombre de plantilla
                        </span>
                        <input
                          value={descriptionEditorDraft.label}
                          onChange={(event) => updateDescriptionEditorDraft("label", event.target.value)}
                          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          ID interno
                        </span>
                        <input
                          value={descriptionEditorDraft.id}
                          onChange={(event) => updateDescriptionEditorDraft("id", event.target.value)}
                          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                        />
                      </label>
                      <label className="block md:col-span-2">
                        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Categoria/Subcategoria web asignada
                        </span>
                        <select
                          value={descriptionEditorDraft.assigned_category_key || ""}
                          onChange={(event) =>
                            updateDescriptionEditorDraft("assigned_category_key", event.target.value)
                          }
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                        >
                          <option value="">Sin asignar (usar keywords)</option>
                          {orderedCatalogCategories.map((option) => (
                            <option key={`description-template-category-${option.key}`} value={option.key}>
                              {option.parent_name ? `${option.parent_name} / ${option.name}` : option.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block md:col-span-2">
                        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Palabras clave (separadas por coma)
                        </span>
                        <input
                          value={descriptionEditorDraft.keywords.join(", ")}
                          onChange={(event) =>
                            updateDescriptionEditorDraft(
                              "keywords",
                              event.target.value
                                .split(",")
                                .map((item) => item.trim())
                                .filter(Boolean)
                            )
                          }
                          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                        />
                      </label>
                      <label className="block md:col-span-2">
                        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Parrafo 1 (una variante por linea)
                        </span>
                        <textarea
                          value={variantsToTextareaValue(
                            descriptionEditorDraft.paragraph1_variants,
                            descriptionEditorDraft.paragraph1
                          )}
                          onChange={(event) =>
                            updateDescriptionEditorDraft(
                              "paragraph1_variants",
                              event.target.value
                                .split("\n")
                                .map((item) => item.trim())
                                .filter(Boolean)
                            )
                          }
                          rows={4}
                          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Parrafo 2 (una variante por linea)
                        </span>
                        <textarea
                          value={variantsToTextareaValue(
                            descriptionEditorDraft.paragraph2_variants,
                            descriptionEditorDraft.paragraph2
                          )}
                          onChange={(event) =>
                            updateDescriptionEditorDraft(
                              "paragraph2_variants",
                              event.target.value
                                .split("\n")
                                .map((item) => item.trim())
                                .filter(Boolean)
                            )
                          }
                          rows={4}
                          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Parrafo 3 (una variante por linea)
                        </span>
                        <textarea
                          value={variantsToTextareaValue(
                            descriptionEditorDraft.paragraph3_variants,
                            descriptionEditorDraft.paragraph3
                          )}
                          onChange={(event) =>
                            updateDescriptionEditorDraft(
                              "paragraph3_variants",
                              event.target.value
                                .split("\n")
                                .map((item) => item.trim())
                                .filter(Boolean)
                            )
                          }
                          rows={4}
                          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                        />
                      </label>
                      <label className="block md:col-span-2">
                        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Cierre comercial (una variante por linea)
                        </span>
                        <textarea
                          value={variantsToTextareaValue(
                            descriptionEditorDraft.closing_variants,
                            descriptionEditorDraft.closing
                          )}
                          onChange={(event) =>
                            updateDescriptionEditorDraft(
                              "closing_variants",
                              event.target.value
                                .split("\n")
                                .map((item) => item.trim())
                                .filter(Boolean)
                            )
                          }
                          rows={3}
                          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Vista previa
                    </p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="block">
                        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Nombre producto
                        </span>
                        <input
                          value={descriptionPreviewName}
                          onChange={(event) => setDescriptionPreviewName(event.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Categoria
                        </span>
                        <input
                          value={descriptionPreviewCategory}
                          onChange={(event) => setDescriptionPreviewCategory(event.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Subcategoria
                        </span>
                        <input
                          value={descriptionPreviewSubcategory}
                          onChange={(event) => setDescriptionPreviewSubcategory(event.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Marca
                        </span>
                        <input
                          value={descriptionPreviewBrand}
                          onChange={(event) => setDescriptionPreviewBrand(event.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Garantia
                        </span>
                        <input
                          value={descriptionPreviewWarranty}
                          onChange={(event) => setDescriptionPreviewWarranty(event.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400"
                        />
                      </label>
                    </div>
                    <label className="mt-3 block">
                      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Resultado final
                      </span>
                      <textarea
                        value={descriptionPreviewText}
                        readOnly
                        rows={9}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none"
                      />
                    </label>
                  </div>
                </div>
              ) : null}
            </SectionCard>
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

                <div
                  ref={categoryTableScrollRef}
                  className="max-h-[30rem] overflow-auto rounded-2xl border border-slate-200"
                  onDragOver={(event) => {
                    if (draggedCategoryId === null) return;
                    updateCategoryDragAutoScrollFromPointer(event.clientY);
                  }}
                  onDragLeave={() => {
                    if (draggedCategoryId === null) return;
                    categoryDragAutoScrollDirRef.current = 0;
                  }}
                  onDrop={() => {
                    categoryDragAutoScrollDirRef.current = 0;
                  }}
                >
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
                              updateCategoryDragAutoScrollFromPointer(event.clientY);
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
                              categoryDragAutoScrollDirRef.current = 0;
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
          {catalogWorkspaceView === "combos" ? (
            <div className="space-y-4">
              <SectionCard
                title="Combos y kits"
                subtitle="Agrupa productos, define un precio final y publícalo como una sola oferta."
              >
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <SummaryMini label="Total combos" value={comboMetrics.total} />
                  <SummaryMini label="Publicados" value={comboMetrics.published} />
                  <SummaryMini label="Destacados" value={comboMetrics.featured} />
                  <SummaryMini label="Activos" value={comboMetrics.active} />
                  <SummaryMini label="Con productos" value={comboMetrics.withItems} />
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-slate-600">
                    {comboMetrics.totalItems} productos están distribuidos en {comboMetrics.total} combos.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!canManage || catalogCombosLoading}
                      onClick={() => openComboEditor()}
                      className="rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed"
                      style={{
                        backgroundColor: canManage && !catalogCombosLoading ? "#2563eb" : "#bfdbfe",
                        borderColor: canManage && !catalogCombosLoading ? "#1d4ed8" : "#93c5fd",
                        color: canManage && !catalogCombosLoading ? "#ffffff" : "#1e3a8a",
                      }}
                    >
                      + Crear combo
                    </button>
                    <button
                      type="button"
                      onClick={() => void loadCatalogCombos()}
                      disabled={catalogCombosLoading}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {catalogCombosLoading ? "Cargando..." : "Refrescar combos"}
                    </button>
                  </div>
                </div>
                {catalogCombosError ? (
                  <p className="mt-3 text-sm text-rose-600">{catalogCombosError}</p>
                ) : null}
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                  {catalogCombosLoading ? (
                    <div className="px-4 py-8 text-sm text-slate-500">Cargando combos...</div>
                  ) : catalogCombos.length === 0 ? (
                    <div className="px-4 py-8 text-sm text-slate-500">
                      Aún no hay combos. Usa <span className="font-medium">Crear combo</span> para iniciar.
                    </div>
                  ) : (
                    <table className="min-w-full text-sm">
                      <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        <tr>
                          <th className="sticky top-0 bg-slate-50 px-4 py-3">Combo</th>
                          <th className="sticky top-0 bg-slate-50 px-4 py-3">Precio</th>
                          <th className="sticky top-0 bg-slate-50 px-4 py-3">Ítems</th>
                          <th className="sticky top-0 bg-slate-50 px-4 py-3">Estado</th>
                          <th className="sticky top-0 bg-slate-50 px-4 py-3 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {catalogCombos.map((combo) => {
                          const coverUrl = resolveAssetUrl(combo.image_thumb_url || combo.image_url);
                          return (
                            <tr key={`combo-${combo.id}`} className="border-b border-slate-100 align-top">
                              <td className="px-4 py-3">
                                <div className="flex items-start gap-3">
                                  <div className="h-12 w-12 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                                    {coverUrl ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={coverUrl} alt={combo.name} className="h-full w-full object-cover" />
                                    ) : null}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-medium text-slate-900">{combo.name}</p>
                                    <p className="truncate text-xs text-slate-500">/{combo.slug}</p>
                                    {combo.short_description ? (
                                      <p className="mt-1 max-w-[42rem] truncate text-xs text-slate-500">
                                        {combo.short_description}
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <p className="font-medium text-slate-900">{formatMoney(combo.price)}</p>
                                {typeof combo.compare_price === "number" ? (
                                  <p className="mt-1 text-xs text-slate-500 line-through">
                                    {formatMoney(combo.compare_price)}
                                  </p>
                                ) : null}
                              </td>
                              <td className="px-4 py-3 text-slate-700">
                                {combo.items.length} producto{combo.items.length === 1 ? "" : "s"}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-1.5">
                                  <span
                                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium leading-4 ${
                                      combo.published
                                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                        : "border-amber-300 bg-amber-50 text-amber-700"
                                    }`}
                                  >
                                    {combo.published ? "publicado" : "pausado"}
                                  </span>
                                  {combo.featured ? (
                                    <span className="rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-[10px] font-medium leading-4 text-sky-700">
                                      destacado
                                    </span>
                                  ) : null}
                                  {combo.active ? (
                                    <span className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] font-medium leading-4 text-slate-700">
                                      activo
                                    </span>
                                  ) : (
                                    <span className="rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-[10px] font-medium leading-4 text-rose-700">
                                      inactivo
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap justify-end gap-2">
                                  <button
                                    type="button"
                                    disabled={!canManage || catalogCombosLoading}
                                    onClick={() => openComboEditor(combo.id)}
                                    className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!canManage || busyAction === `combo-published-${combo.id}`}
                                    onClick={() => void toggleComboPublished(combo)}
                                    className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {combo.published ? "Pausar" : "Publicar"}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!canManage || busyAction === `combo-featured-${combo.id}`}
                                    onClick={() => void toggleComboFeatured(combo)}
                                    className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {combo.featured ? "Quitar destacado" : "Destacar"}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!canManage || busyAction === `combo-delete-${combo.id}`}
                                    onClick={() => void deleteCombo(combo)}
                                    className="inline-flex h-8 items-center rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-medium text-rose-700 transition hover:border-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Eliminar
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </SectionCard>

              {catalogComboEditorOpen ? (
                <div className="fixed inset-0 z-[121] overflow-y-auto bg-slate-950/55 p-4" role="dialog" aria-modal="true">
                  <div className="mx-auto w-full max-w-7xl rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">
                          {catalogComboEditingId !== null ? "Editar combo" : "Crear combo"}
                        </h3>
                        <p className="mt-1 text-xs text-slate-500">
                          Paso 1: selecciona productos. Paso 2: edita el combo y define su precio final.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex rounded-full border border-slate-200 bg-slate-50 p-1">
                          <button
                            type="button"
                            onClick={() => setCatalogComboWizardStep(1)}
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                              catalogComboWizardStep === 1
                                ? "bg-white text-slate-900 shadow-sm"
                                : "text-slate-500"
                            }`}
                          >
                            1. Selección
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (catalogComboEditor.items.length === 0) return;
                              setCatalogComboWizardStep(2);
                            }}
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                              catalogComboWizardStep === 2
                                ? "bg-white text-slate-900 shadow-sm"
                                : "text-slate-500"
                            }`}
                          >
                            2. Edición
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={resetComboEditor}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                        >
                          Cerrar
                        </button>
                      </div>
                    </div>

                    {catalogComboWizardStep === 1 ? (
                      <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
                        <SectionCard
                          title="Buscar productos"
                          subtitle="Busca y agrega los productos que formarán parte del combo."
                        >
                          <div className="space-y-3">
                            <div className="flex gap-2">
                              <input
                                value={catalogComboSearchTerm}
                                onChange={(event) => setCatalogComboSearchTerm(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    void searchComboProducts();
                                  }
                                }}
                                placeholder="Nombre, SKU, marca..."
                                className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                              />
                              <button
                                type="button"
                                onClick={() => void searchComboProducts()}
                                disabled={catalogComboSearching}
                                className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {catalogComboSearching ? "Buscando..." : "Buscar"}
                              </button>
                            </div>
                            {catalogComboSearchExecuted ? (
                              <div className="max-h-[34rem] overflow-auto rounded-2xl border border-slate-200">
                                {catalogComboSearchResults.length ? (
                                  <div className="divide-y divide-slate-100">
                                    {catalogComboSearchResults.map((product) => (
                                      <div
                                        key={`combo-search-${product.id}`}
                                        className="flex items-center justify-between gap-3 px-3 py-2.5"
                                      >
                                        <div className="min-w-0">
                                          <p className="truncate text-sm font-medium text-slate-900">
                                            {getCatalogDisplayName(product)}
                                          </p>
                                          <p className="text-xs text-slate-500">
                                            SKU {product.sku || "sin SKU"} · {formatMoney(resolveWebSalePriceFromProduct(product))}
                                          </p>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => addComboProduct(product)}
                                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:border-emerald-300"
                                        >
                                          Agregar
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="px-3 py-4 text-sm text-slate-500">
                                    No encontramos productos con esa búsqueda.
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-500">
                                Busca por nombre o SKU y luego agrega productos a la lista.
                              </p>
                            )}
                          </div>
                        </SectionCard>

                        <SectionCard
                          title="Productos seleccionados"
                          subtitle="Aquí van quedando los productos elegidos antes de pasar a la edición comercial."
                          headerActions={
                            <button
                              type="button"
                              disabled={catalogComboEditor.items.length === 0}
                              onClick={() => setCatalogComboWizardStep(2)}
                              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Siguiente
                            </button>
                          }
                        >
                          <div className="overflow-hidden rounded-2xl border border-slate-200">
                            {catalogComboEditor.items.length ? (
                              <table className="min-w-full text-sm">
                                <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-[0.18em] text-slate-500">
                                  <tr>
                                    <th className="px-3 py-3">Producto</th>
                                    <th className="px-3 py-3">Cant.</th>
                                    <th className="px-3 py-3">Precio</th>
                                    <th className="px-3 py-3">Subtotal</th>
                                    <th className="px-3 py-3 text-right">Acción</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {catalogComboEditor.items.map((item, index) => {
                                    const unitPrice = parseThousandsWithDots(item.product_price) ?? 0;
                                    const quantity = Number(String(item.quantity || "0").replace(",", ".")) || 0;
                                    const subtotal = quantity * unitPrice;
                                    return (
                                      <tr key={`combo-selected-${index}`} className="border-b border-slate-100">
                                        <td className="px-3 py-3">
                                          <p className="font-medium text-slate-900">
                                            {item.product_name || "Sin nombre"}
                                          </p>
                                          <p className="text-xs text-slate-500">
                                            SKU {item.product_sku || "sin SKU"} · ID {item.product_id || "-"}
                                          </p>
                                        </td>
                                        <td className="px-3 py-3">{item.quantity}</td>
                                        <td className="px-3 py-3">{formatMoney(unitPrice)}</td>
                                        <td className="px-3 py-3">{formatMoney(subtotal)}</td>
                                        <td className="px-3 py-3 text-right">
                                          <button
                                            type="button"
                                            onClick={() => removeComboItem(index)}
                                            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:border-rose-300"
                                          >
                                            Quitar
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            ) : (
                              <div className="px-4 py-8 text-sm text-slate-500">
                                Todavía no agregaste productos. Usa el buscador para armar el combo.
                              </div>
                            )}
                          </div>
                          <div className="mt-3 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                            <p className="text-xs text-slate-600">
                              Subtotal calculado: <span className="font-semibold text-slate-900">{formatMoney(comboDraftTotal)}</span>
                            </p>
                            <button
                              type="button"
                              disabled={catalogComboEditor.items.length === 0}
                              onClick={() => setCatalogComboWizardStep(2)}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Editar combo
                            </button>
                          </div>
                        </SectionCard>
                      </div>
                    ) : (
                      <div className="mt-4 grid gap-4 xl:grid-cols-[0.95fr,1.05fr]">
                        <div className="space-y-4">
                          <SectionCard
                            title="Edición comercial"
                            subtitle="Aquí ajustas el nombre global, imágenes, categoría y publicación del combo."
                          >
                            <div className="space-y-4">
                              <div className="grid gap-3 md:grid-cols-2">
                                <LabeledField label="Nombre" required>
                                  <input
                                    value={catalogComboEditor.name}
                                    onChange={(event) => {
                                      const nextName = event.target.value;
                                      setCatalogComboEditor((prev) => {
                                        const currentSuggested = generateSuggestedSlug(prev.name);
                                        const nextSuggested = generateSuggestedSlug(nextName);
                                        const shouldSyncSlug =
                                          !prev.slug.trim() || prev.slug === currentSuggested;
                                        return {
                                          ...prev,
                                          name: nextName,
                                          slug: shouldSyncSlug ? nextSuggested : prev.slug,
                                        };
                                      });
                                      setCatalogComboDirty(true);
                                    }}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                                  />
                                </LabeledField>
                                <LabeledField label="Slug" required>
                                  <input
                                    value={catalogComboEditor.slug}
                                    onChange={(event) =>
                                      handleComboField("slug", generateSuggestedSlug(event.target.value))
                                    }
                                    placeholder="kit-dvr-4-camaras"
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                                  />
                                </LabeledField>
                              </div>

                              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                                  Precio calculado
                                </p>
                                <p className="mt-1 text-2xl font-semibold text-slate-900">{formatMoney(comboDraftTotal)}</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  Se calcula automáticamente desde el precio y la cantidad de cada componente.
                                </p>
                              </div>

                              <div className="grid gap-3 md:grid-cols-2">
                                <LabeledField label="Modo de precio">
                                  <select
                                    value={catalogComboEditor.price_mode}
                                    onChange={(event) => {
                                      const nextMode = event.target.value as ComboEditorState["price_mode"];
                                      setCatalogComboEditor((prev) => {
                                        const nextCompare =
                                          nextMode === "discount" && !prev.compare_price.trim()
                                            ? formatThousandsWithDots(String(Math.round(comboDraftTotal)))
                                            : prev.compare_price;
                                        const nextPrice =
                                          nextMode === "auto" ? formatThousandsWithDots(String(Math.round(comboDraftTotal))) : prev.price;
                                        return {
                                          ...prev,
                                          price_mode: nextMode,
                                          price: nextPrice,
                                          compare_price:
                                            nextMode === "auto" ? "" : nextCompare,
                                        };
                                      });
                                      setCatalogComboDirty(true);
                                    }}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                                  >
                                    <option value="auto">Automático: suma de componentes</option>
                                    <option value="fixed">Precio fijo</option>
                                    <option value="discount">Con descuento visible</option>
                                  </select>
                                </LabeledField>
                                <LabeledField label="Orden">
                                  <input
                                    value={catalogComboEditor.sort_order}
                                    onChange={(event) => handleComboField("sort_order", event.target.value)}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                                  />
                                </LabeledField>
                              </div>

                              <div className="grid gap-3 md:grid-cols-2">
                                <LabeledField label="Precio final">
                                  <input
                                    value={catalogComboEditor.price}
                                    onChange={(event) =>
                                      handleComboField("price", formatThousandsWithDots(event.target.value))
                                    }
                                    placeholder="Precio final del combo"
                                    disabled={catalogComboEditor.price_mode === "auto"}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 disabled:bg-slate-100"
                                  />
                                  <p className="mt-1 text-xs text-slate-500">
                                    {catalogComboEditor.price_mode === "auto"
                                      ? "Se toma directamente del subtotal del combo."
                                      : "Este es el precio visible al público."}
                                  </p>
                                </LabeledField>
                                <LabeledField label="Precio comparativo">
                                  <input
                                    value={catalogComboEditor.compare_price}
                                    onChange={(event) =>
                                      handleComboField("compare_price", formatThousandsWithDots(event.target.value))
                                    }
                                    placeholder="Precio antes del descuento"
                                    disabled={catalogComboEditor.price_mode === "auto"}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 disabled:bg-slate-100"
                                  />
                                  <p className="mt-1 text-xs text-slate-500">
                                    {catalogComboEditor.price_mode === "discount"
                                      ? "Si es mayor que el precio final, se mostrará tachado."
                                      : "Opcional. Sirve para mostrar el precio anterior tachado."}
                                  </p>
                                </LabeledField>
                              </div>

                              <div className="grid gap-3 md:grid-cols-2">
                                <LabeledField label="Badge">
                                  <input
                                    value={catalogComboEditor.badge_text}
                                    onChange={(event) => handleComboField("badge_text", event.target.value)}
                                    placeholder="Oferta"
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                                  />
                                </LabeledField>
                                <LabeledField label="Modo de stock">
                                  <select
                                    value={catalogComboEditor.stock_mode}
                                    onChange={(event) =>
                                      handleComboField(
                                        "stock_mode",
                                        event.target.value as "manual" | "components"
                                      )
                                    }
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                                  >
                                    <option value="components">Por componentes</option>
                                    <option value="manual">Manual</option>
                                  </select>
                                </LabeledField>
                              </div>

                              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                <div className="flex flex-wrap items-center gap-3">
                                  <button
                                    type="button"
                                    disabled={
                                      catalogImageUploading ||
                                      (catalogComboEditor.gallery_urls ?? []).length >= MAX_CATALOG_GALLERY_IMAGES
                                    }
                                    onClick={() => catalogComboImageInputRef.current?.click()}
                                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {catalogImageUploading ? "Subiendo..." : "Agregar imagen"}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={catalogVideoUploading || Boolean(catalogComboEditor.video_url?.trim())}
                                    onClick={() => catalogComboVideoInputRef.current?.click()}
                                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {catalogVideoUploading ? "Subiendo video..." : "Agregar video"}
                                  </button>
                                  <span className="text-xs text-slate-500">
                                    JPG, PNG o WebP. Recomendado: 1200x1200 px (1:1), hasta {MAX_CATALOG_GALLERY_IMAGES} imágenes. La primera será la principal.
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    Video: 1 archivo MP4 o MOV, máximo {MAX_CATALOG_VIDEO_DURATION_SECONDS}s.
                                  </span>
                                  <span className="text-xs text-slate-500">Arrastra para reordenar.</span>
                                </div>
                                <input
                                  ref={catalogComboImageInputRef}
                                  type="file"
                                  accept="image/png,image/jpeg,image/webp"
                                  onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    if (!file) return;
                                    void handleComboImageFileChange(file);
                                  }}
                                  className="hidden"
                                />
                                <input
                                  ref={catalogComboVideoInputRef}
                                  type="file"
                                  accept="video/mp4,video/quicktime,.mov"
                                  onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    if (!file) return;
                                    void handleComboVideoFileChange(file);
                                  }}
                                  className="hidden"
                                />
                                <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                                  {(catalogComboEditor.gallery_urls ?? []).length || catalogComboEditor.video_url?.trim() ? (
                                    <div className="grid grid-flow-col auto-cols-[minmax(220px,220px)] gap-3 overflow-x-auto pb-1">
                                      {(catalogComboEditor.gallery_urls ?? []).map((imageUrl, index) => (
                                        <div
                                          key={`combo-gallery-${imageUrl}-${index}`}
                                          draggable
                                          onDragStart={() => handleComboGalleryDragStart(index)}
                                          onDragOver={(event) => {
                                            event.preventDefault();
                                            setCatalogComboDragOverGalleryIndex(index);
                                          }}
                                          onDrop={(event) => {
                                            event.preventDefault();
                                            handleComboGalleryDrop(index);
                                          }}
                                          onDragEnd={() => {
                                            setCatalogComboDraggedGalleryIndex(null);
                                            setCatalogComboDragOverGalleryIndex(null);
                                          }}
                                          className={`rounded-xl border bg-slate-50 p-2 transition ${
                                            catalogComboDragOverGalleryIndex === index
                                              ? "border-blue-300 ring-1 ring-blue-200"
                                              : "border-slate-200"
                                          }`}
                                        >
                                          <div className="relative h-28 overflow-hidden rounded-lg border border-slate-200 bg-white">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                              src={resolveAssetUrl(imageUrl) || imageUrl}
                                              alt={`Combo imagen ${index + 1}`}
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
                                                  onClick={() => moveComboGalleryImage(index, index - 1)}
                                                  className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition disabled:cursor-not-allowed disabled:opacity-40"
                                                >
                                                  ←
                                                </button>
                                                <button
                                                  type="button"
                                                  disabled={index === (catalogComboEditor.gallery_urls ?? []).length - 1}
                                                  onClick={() => moveComboGalleryImage(index, index + 1)}
                                                  className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition disabled:cursor-not-allowed disabled:opacity-40"
                                                >
                                                  →
                                                </button>
                                              </div>
                                            </div>
                                            <div className="flex items-center justify-between gap-2">
                                              {index !== 0 ? (
                                                <button
                                                  type="button"
                                                  onClick={() => setComboGalleryPrimary(index)}
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
                                                  const nextGallery = (catalogComboEditor.gallery_urls ?? []).filter(
                                                    (_, galleryIndex) => galleryIndex !== index
                                                  );
                                                  applyComboGalleryOrder(nextGallery);
                                                }}
                                                className="text-[11px] font-medium text-rose-600"
                                              >
                                                Quitar
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                      {catalogComboEditor.video_url?.trim() ? (
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                                          <div className="relative h-28 overflow-hidden rounded-lg border border-slate-200 bg-black">
                                            <video
                                              src={resolveAssetUrl(catalogComboEditor.video_url) || catalogComboEditor.video_url}
                                              className="h-full w-full object-contain"
                                              controls
                                              preload="metadata"
                                            />
                                          </div>
                                          <div className="mt-2 space-y-1.5">
                                            <div className="flex items-center justify-between gap-2">
                                              <span className="truncate text-[11px] text-slate-500">Video (último)</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-2">
                                              <span className="text-[11px] font-medium text-slate-500">
                                                Se publica al final
                                              </span>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setCatalogComboEditor((prev) => ({ ...prev, video_url: "" }));
                                                  setCatalogComboDirty(true);
                                                }}
                                                className="text-[11px] font-medium text-rose-600"
                                              >
                                                Quitar
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-slate-500">Sin imagen cargada</p>
                                  )}
                                </div>
                              </div>

                              <div className="grid gap-3 md:grid-cols-2">
                                <ToggleField
                                  label="Publicado"
                                  checked={catalogComboEditor.published}
                                  onChange={(checked) => handleComboField("published", checked)}
                                />
                                <ToggleField
                                  label="Destacado"
                                  checked={catalogComboEditor.featured}
                                  onChange={(checked) => handleComboField("featured", checked)}
                                />
                                <ToggleField
                                  label="Activo"
                                  checked={catalogComboEditor.active}
                                  onChange={(checked) => handleComboField("active", checked)}
                                />
                                <ToggleField
                                  label="Visible sin stock"
                                  checked={catalogComboEditor.visible_when_out_of_stock}
                                  onChange={(checked) =>
                                    handleComboField("visible_when_out_of_stock", checked)
                                  }
                                />
                              </div>

                              <LabeledField label="Descripción larga">
                                <textarea
                                  value={catalogComboEditor.long_description}
                                  onChange={(event) =>
                                    handleComboField("long_description", event.target.value)
                                  }
                                  rows={5}
                                  className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                                />
                              </LabeledField>

                              <LabeledField label="Garantía (detalle)">
                                <input
                                  value={catalogComboEditor.warranty_text}
                                  onChange={(event) => handleComboField("warranty_text", event.target.value)}
                                  placeholder="Ej: Garantía de 12 meses"
                                  maxLength={160}
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                                />
                                <p className="mt-1 text-xs text-slate-500">
                                  Solo se muestra en el detalle del combo.
                                </p>
                              </LabeledField>

                              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    Características técnicas
                                  </p>
                                  <button
                                    type="button"
                                    onClick={addComboTechnicalSpec}
                                    className="rounded-lg border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 transition hover:border-blue-400"
                                  >
                                    +
                                  </button>
                                </div>
                                <div className="mt-2 space-y-1.5">
                                  {catalogComboEditor.technical_specs.length ? (
                                    catalogComboEditor.technical_specs.map((spec, index) => (
                                      <div
                                        key={`combo-spec-${index}-${spec.type}`}
                                        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2"
                                      >
                                        <input
                                          value={spec.type}
                                          onChange={(event) =>
                                            updateComboTechnicalSpec(index, "type", event.target.value)
                                          }
                                          placeholder="Característica"
                                          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-emerald-400"
                                        />
                                        <input
                                          value={spec.value}
                                          onChange={(event) =>
                                            updateComboTechnicalSpec(index, "value", event.target.value)
                                          }
                                          placeholder="Valor"
                                          className="min-w-0 flex-[1.2] rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-emerald-400"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => removeComboTechnicalSpec(index)}
                                          className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-700 transition hover:border-rose-300"
                                        >
                                          Quitar
                                        </button>
                                      </div>
                                    ))
                                  ) : (
                                    <p className="text-xs text-slate-500">Aun no hay caracteristicas agregadas.</p>
                                  )}
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-3">
                                <button
                                  type="button"
                                  onClick={() => setCatalogComboWizardStep(1)}
                                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-400"
                                >
                                  Volver
                                </button>
                                <button
                                  type="button"
                                  disabled={!canManage || catalogComboSaving}
                                  onClick={() => void saveComboEditor()}
                                  className="rounded-xl border px-4 py-2.5 text-sm font-medium shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed"
                                  style={{
                                    backgroundColor: canManage && !catalogComboSaving ? "#2563eb" : "#bfdbfe",
                                    borderColor: canManage && !catalogComboSaving ? "#1d4ed8" : "#93c5fd",
                                    color: canManage && !catalogComboSaving ? "#ffffff" : "#1e3a8a",
                                  }}
                                >
                                  {catalogComboSaving ? "Guardando..." : "Guardar combo"}
                                </button>
                                <button
                                  type="button"
                                  disabled={catalogComboSaving}
                                  onClick={resetComboEditor}
                                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          </SectionCard>
                        </div>

                        <div className="space-y-4">
                          <SectionCard
                            title="Componente por componente"
                            subtitle="Edita nombre, precio, cantidad y orden de cada producto del combo."
                          >
                            <div className="overflow-hidden rounded-2xl border border-slate-200">
                              {catalogComboEditor.items.length ? (
                                <table className="min-w-full text-sm">
                                  <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-[0.18em] text-slate-500">
                                    <tr>
                                      <th className="px-3 py-3">Producto</th>
                                      <th className="px-3 py-3">Precio</th>
                                      <th className="px-3 py-3">Cant.</th>
                                      <th className="px-3 py-3">Orden</th>
                                      <th className="px-3 py-3">Req.</th>
                                      <th className="px-3 py-3 text-right">Acción</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {catalogComboEditor.items.map((item, index) => {
                                      const unitPrice = parseThousandsWithDots(item.product_price) ?? 0;
                                      const quantity = Number(String(item.quantity || "0").replace(",", ".")) || 0;
                                      const subtotal = quantity * unitPrice;
                                      return (
                                        <tr key={`combo-item-${index}`} className="border-b border-slate-100 align-top">
                                          <td className="px-3 py-3">
                                            <div className="space-y-2">
                                              <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                                                <p className="text-sm font-medium text-slate-900">
                                                  {item.product_name || "Producto"}
                                                </p>
                                                <p className="mt-1 text-xs text-slate-500">
                                                  SKU {item.product_sku || "sin SKU"}
                                                </p>
                                                <p className="mt-1 text-xs text-slate-500">
                                                  Precio original{" "}
                                                  <span className="font-medium text-slate-700">
                                                    {formatMoney(parseThousandsWithDots(item.product_original_price) || 0)}
                                                  </span>
                                                </p>
                                              </div>
                                            </div>
                                          </td>
                                          <td className="px-3 py-3">
                                            <input
                                              value={item.product_price}
                                              onChange={(event) =>
                                                handleComboItemField(
                                                  index,
                                                  "product_price",
                                                  formatThousandsWithDots(event.target.value)
                                                )
                                              }
                                              className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-emerald-400"
                                            />
                                            <p className="mt-1 text-[11px] text-slate-500">
                                              Subtotal: {formatMoney(subtotal)}
                                            </p>
                                          </td>
                                          <td className="px-3 py-3">
                                            <input
                                              value={item.quantity}
                                              onChange={(event) =>
                                                handleComboItemField(index, "quantity", event.target.value)
                                              }
                                              className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-emerald-400"
                                            />
                                          </td>
                                          <td className="px-3 py-3">
                                            <input
                                              value={item.sort_order}
                                              onChange={(event) =>
                                                handleComboItemField(index, "sort_order", event.target.value)
                                              }
                                              className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-emerald-400"
                                            />
                                          </td>
                                          <td className="px-3 py-3">
                                            <input
                                              type="checkbox"
                                              checked={item.required}
                                              onChange={(event) =>
                                                handleComboItemField(index, "required", event.target.checked)
                                              }
                                              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                            />
                                          </td>
                                          <td className="px-3 py-3 text-right">
                                            <button
                                              type="button"
                                              onClick={() => removeComboItem(index)}
                                              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:border-rose-300"
                                            >
                                              Quitar
                                            </button>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              ) : (
                                <div className="px-4 py-8 text-sm text-slate-500">
                                  Todavía no agregaste productos. Vuelve al paso 1 para armar el combo.
                                </div>
                              )}
                            </div>
                            <div className="mt-3 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                              <p className="text-xs text-slate-600">
                                Total calculado: <span className="font-semibold text-slate-900">{formatMoney(comboDraftTotal)}</span>
                              </p>
                              <button
                                type="button"
                                onClick={() => setCatalogComboWizardStep(1)}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                              >
                                Volver al paso 1
                              </button>
                            </div>
                          </SectionCard>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {catalogWorkspaceView === "discount_codes" ? (
            <SectionCard
              title="Códigos de descuento"
              subtitle="Crea, activa y controla vigencia de códigos promocionales para el canal web."
            >
              <div className="space-y-4">
                <div className="flex flex-wrap items-end gap-2">
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
                  <button
                    type="button"
                    disabled={!canManage || discountCodeSaving}
                    onClick={openDiscountCodeBatchComposer}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    + Crear lote
                  </button>
                  <button
                    type="button"
                    disabled={visibleDiscountCodeRows.length === 0}
                    onClick={() => exportDiscountCodesCsv(visibleDiscountCodeRows, "cupones-visibles")}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Exportar CSV
                  </button>
                  <button
                    type="button"
                    disabled={visibleDiscountCodeRows.length === 0}
                    onClick={() => exportDiscountCodesPrintSheet(visibleDiscountCodeRows, "Cupones visibles")}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Imprimir / PDF
                  </button>
                  <button
                    type="button"
                    disabled={selectedDiscountCodeRows.length === 0}
                    onClick={() => exportDiscountCodesCsv(selectedDiscountCodeRows, "cupones-seleccionados")}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Exportar seleccionados ({selectedDiscountCodeRows.length})
                  </button>
                  <button
                    type="button"
                    disabled={selectedDiscountCodeRows.length === 0}
                    onClick={() => exportDiscountCodesPrintSheet(selectedDiscountCodeRows, "Cupones seleccionados")}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Imprimir seleccionados ({selectedDiscountCodeRows.length})
                  </button>
                  <button
                    type="button"
                    disabled={selectedDiscountCodeRows.length === 0}
                    onClick={() => setSelectedDiscountCodeMap({})}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Limpiar selección
                  </button>
                  <label className="ml-auto flex items-center gap-2 text-xs font-medium text-slate-600">
                    Estado
                    <select
                      value={discountCodeStatusFilter}
                      onChange={(event) =>
                        setDiscountCodeStatusFilter(event.target.value as DiscountCodeStatusFilter)
                      }
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none"
                    >
                      <option value="all">Todos</option>
                      <option value="active">Activos</option>
                      <option value="inactive">Inactivos</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                    Tipo
                    <select
                      value={discountCodeTypeFilter}
                      onChange={(event) =>
                        setDiscountCodeTypeFilter(event.target.value as "all" | "percent" | "fixed_amount")
                      }
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none"
                    >
                      <option value="all">Todos</option>
                      <option value="percent">Porcentaje</option>
                      <option value="fixed_amount">Valor fijo</option>
                    </select>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">Tabla de códigos</h3>
                  <span className="text-xs text-slate-500">
                    Mostrando {visibleDiscountCodeRows.length} en esta página · Seleccionados {selectedDiscountCodeRows.length}
                  </span>
                </div>

                <div className="max-h-[30rem] overflow-auto rounded-2xl border border-slate-200">
                  {discountCodeLoading ? (
                    <div className="px-4 py-8 text-sm text-slate-500">Cargando códigos…</div>
                  ) : visibleDiscountCodeRows.length === 0 ? (
                    <div className="px-4 py-8 text-sm text-slate-500">
                      No hay códigos para los filtros seleccionados.
                    </div>
                  ) : (
                    <table className="min-w-full text-sm">
                      <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        <tr>
                          <th className="sticky top-0 z-10 w-12 bg-slate-50 px-3 py-3">
                            <input
                              type="checkbox"
                              checked={allVisibleSelected}
                              onChange={(event) => toggleSelectAllVisibleDiscountCodes(event.target.checked)}
                              aria-label="Seleccionar todos los códigos visibles"
                            />
                          </th>
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
                        {visibleDiscountCodeRows.map((row) => (
                          <tr key={row.id} className="border-b border-slate-100">
                            <td className="px-3 py-3">
                              <input
                                type="checkbox"
                                checked={Boolean(selectedDiscountCodeMap[row.id])}
                                onChange={() => toggleDiscountCodeSelection(row)}
                                aria-label={`Seleccionar cupón ${row.code}`}
                              />
                            </td>
                            <td className="px-4 py-3 font-semibold text-slate-900">{row.code}</td>
                            <td className="px-4 py-3 text-slate-700">
                              {row.discount_type === "fixed_amount"
                                ? formatMoney(row.discount_value || 0)
                                : `${row.discount_percent}%`}
                            </td>
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
                                  onClick={() => void openDiscountCodeHistory(row)}
                                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                                >
                                  Historial
                                </button>
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

        {activeTab === "catalog" &&
        catalogWorkspaceView === "discount_codes" &&
        discountCodeComposerOpen ? (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-6xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    {discountCodeEditingId ? "Editar cupón" : "Crear cupón"}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">Configura código, porcentaje, vigencia y estado.</p>
                </div>
                <button
                  type="button"
                  onClick={() => resetDiscountCodeEditor(true)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                >
                  Cerrar
                </button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-7">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Código
                  </span>
                  <input
                    value={discountCodeEditor.code}
                    onChange={(event) =>
                      setDiscountCodeEditor((prev) => ({
                        ...prev,
                        code: event.target.value.toUpperCase(),
                      }))
                    }
                    placeholder="Código (ej: KENSAR10)"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Tipo de descuento
                  </span>
                  <select
                    value={discountCodeEditor.discount_type}
                    onChange={(event) =>
                      setDiscountCodeEditor((prev) => ({
                        ...prev,
                        discount_type: event.target.value as "percent" | "fixed_amount",
                      }))
                    }
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                  >
                    <option value="percent">Porcentaje (%)</option>
                    <option value="fixed_amount">Valor fijo (COP)</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Valor
                  </span>
                  <input
                    type={discountCodeEditor.discount_type === "percent" ? "number" : "text"}
                    inputMode={discountCodeEditor.discount_type === "percent" ? "decimal" : "numeric"}
                    min={discountCodeEditor.discount_type === "percent" ? 1 : undefined}
                    max={discountCodeEditor.discount_type === "percent" ? 100 : undefined}
                    step={discountCodeEditor.discount_type === "percent" ? 0.1 : undefined}
                    value={
                      discountCodeEditor.discount_type === "percent"
                        ? discountCodeEditor.discount_value
                        : formatCopInputValue(discountCodeEditor.discount_value)
                    }
                    onChange={(event) => {
                      const nextValue =
                        discountCodeEditor.discount_type === "percent"
                          ? event.target.value
                          : sanitizeCopInputValue(event.target.value);
                      setDiscountCodeEditor((prev) => ({ ...prev, discount_value: nextValue }));
                    }}
                    placeholder={discountCodeEditor.discount_type === "percent" ? "% descuento" : "Valor fijo (COP)"}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Vigencia
                  </span>
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
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Uso máximo
                  </span>
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
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Inicio
                  </span>
                  <input
                    type="datetime-local"
                    value={discountCodeEditor.starts_at}
                    onChange={(event) =>
                      setDiscountCodeEditor((prev) => ({ ...prev, starts_at: event.target.value }))
                    }
                    disabled={discountCodeEditor.period !== "custom"}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Fin
                  </span>
                  <input
                    type="datetime-local"
                    value={discountCodeEditor.ends_at}
                    onChange={(event) =>
                      setDiscountCodeEditor((prev) => ({ ...prev, ends_at: event.target.value }))
                    }
                    disabled={discountCodeEditor.period !== "custom"}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </label>
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

              <div className="mt-3">
                <button
                  type="button"
                  onClick={generateUniqueDiscountCode}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                >
                  Generar código
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
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
                  {discountCodeSaving ? "Guardando..." : discountCodeEditingId ? "Guardar cambios" : "Crear cupón"}
                </button>
                <button
                  type="button"
                  onClick={() => resetDiscountCodeEditor(true)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                >
                  Cancelar
                </button>
              </div>
              {discountCodeError ? <p className="mt-2 text-sm text-rose-600">{discountCodeError}</p> : null}
            </div>
          </div>
        ) : null}

        {activeTab === "catalog" &&
        catalogWorkspaceView === "discount_codes" &&
        discountCodeBatchOpen ? (
          <div className="fixed inset-0 z-[123] flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Crear lote de cupones</h3>
                  <p className="mt-1 text-xs text-slate-500">Genera varios códigos únicos con la misma configuración.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (discountCodeBatchSaving) return;
                    setDiscountCodeBatchOpen(false);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                >
                  Cerrar
                </button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-7">
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={discountCodeBatchEditor.quantity}
                  onChange={(event) =>
                    setDiscountCodeBatchEditor((prev) => ({ ...prev, quantity: event.target.value }))
                  }
                  placeholder="Cantidad (ej: 10)"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                />
                <select
                  value={discountCodeBatchEditor.discount_type}
                  onChange={(event) =>
                    setDiscountCodeBatchEditor((prev) => ({
                      ...prev,
                      discount_type: event.target.value as "percent" | "fixed_amount",
                    }))
                  }
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                >
                  <option value="percent">Porcentaje (%)</option>
                  <option value="fixed_amount">Valor fijo (COP)</option>
                </select>
                <input
                  type={discountCodeBatchEditor.discount_type === "percent" ? "number" : "text"}
                  inputMode={discountCodeBatchEditor.discount_type === "percent" ? "decimal" : "numeric"}
                  min={discountCodeBatchEditor.discount_type === "percent" ? 1 : undefined}
                  max={discountCodeBatchEditor.discount_type === "percent" ? 100 : undefined}
                  step={discountCodeBatchEditor.discount_type === "percent" ? 0.1 : undefined}
                  value={
                    discountCodeBatchEditor.discount_type === "percent"
                      ? discountCodeBatchEditor.discount_value
                      : formatCopInputValue(discountCodeBatchEditor.discount_value)
                  }
                  onChange={(event) => {
                    const nextValue =
                      discountCodeBatchEditor.discount_type === "percent"
                        ? event.target.value
                        : sanitizeCopInputValue(event.target.value);
                    setDiscountCodeBatchEditor((prev) => ({ ...prev, discount_value: nextValue }));
                  }}
                  placeholder={
                    discountCodeBatchEditor.discount_type === "percent" ? "% descuento" : "Valor fijo (COP)"
                  }
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                />
                <select
                  value={discountCodeBatchEditor.period}
                  onChange={(event) =>
                    handleDiscountCodeBatchPeriodChange(event.target.value as DiscountCodePeriodOption)
                  }
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                >
                  {DISCOUNT_PERIOD_OPTIONS.map((option) => (
                    <option key={`batch-${option.value}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={discountCodeBatchEditor.max_uses}
                  onChange={(event) =>
                    setDiscountCodeBatchEditor((prev) => ({ ...prev, max_uses: event.target.value }))
                  }
                  placeholder="Uso máximo (opcional)"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                />
                <input
                  type="datetime-local"
                  value={discountCodeBatchEditor.starts_at}
                  onChange={(event) =>
                    setDiscountCodeBatchEditor((prev) => ({ ...prev, starts_at: event.target.value }))
                  }
                  disabled={discountCodeBatchEditor.period !== "custom"}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                />
                <input
                  type="datetime-local"
                  value={discountCodeBatchEditor.ends_at}
                  onChange={(event) =>
                    setDiscountCodeBatchEditor((prev) => ({ ...prev, ends_at: event.target.value }))
                  }
                  disabled={discountCodeBatchEditor.period !== "custom"}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                />
              </div>

              <label className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={discountCodeBatchEditor.is_active}
                  onChange={(event) =>
                    setDiscountCodeBatchEditor((prev) => ({ ...prev, is_active: event.target.checked }))
                  }
                />
                Activo
              </label>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!canManage || discountCodeBatchSaving}
                  onClick={() => void handleCreateDiscountCodesBatch()}
                  className="rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: canManage && !discountCodeBatchSaving ? "#2563eb" : "#bfdbfe",
                    borderColor: canManage && !discountCodeBatchSaving ? "#1d4ed8" : "#93c5fd",
                    color: canManage && !discountCodeBatchSaving ? "#ffffff" : "#1e3a8a",
                  }}
                >
                  {discountCodeBatchSaving ? "Creando lote..." : "Crear lote"}
                </button>
                <button
                  type="button"
                  onClick={() => setDiscountCodeBatchOpen(false)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={discountCodeBatchCreated.length === 0}
                  onClick={() => {
                    const rows = discountCodeBatchCreated.map((code) => ({
                      id: 0,
                      code,
                      discount_type: discountCodeBatchEditor.discount_type,
                      discount_value: Number(discountCodeBatchEditor.discount_value || 0),
                      discount_percent:
                        discountCodeBatchEditor.discount_type === "percent"
                          ? Number(discountCodeBatchEditor.discount_value || 0)
                          : 0,
                      is_active: discountCodeBatchEditor.is_active,
                      max_uses: discountCodeBatchEditor.max_uses
                        ? Number(discountCodeBatchEditor.max_uses)
                        : null,
                      uses_count: 0,
                      starts_at: fromDateTimeLocalInput(discountCodeBatchEditor.starts_at),
                      ends_at: fromDateTimeLocalInput(discountCodeBatchEditor.ends_at),
                      created_by_user_id: null,
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    }));
                    exportDiscountCodesCsv(rows, "cupones-lote");
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Exportar lote (CSV)
                </button>
                <button
                  type="button"
                  disabled={discountCodeBatchCreated.length === 0}
                  onClick={() => {
                    const rows = discountCodeBatchCreated.map((code) => ({
                      id: 0,
                      code,
                      discount_type: discountCodeBatchEditor.discount_type,
                      discount_value: Number(discountCodeBatchEditor.discount_value || 0),
                      discount_percent:
                        discountCodeBatchEditor.discount_type === "percent"
                          ? Number(discountCodeBatchEditor.discount_value || 0)
                          : 0,
                      is_active: discountCodeBatchEditor.is_active,
                      max_uses: discountCodeBatchEditor.max_uses
                        ? Number(discountCodeBatchEditor.max_uses)
                        : null,
                      uses_count: 0,
                      starts_at: fromDateTimeLocalInput(discountCodeBatchEditor.starts_at),
                      ends_at: fromDateTimeLocalInput(discountCodeBatchEditor.ends_at),
                      created_by_user_id: null,
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    }));
                    exportDiscountCodesPrintSheet(rows, "Lote de cupones");
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Imprimir lote / PDF
                </button>
              </div>
              {discountCodeBatchError ? <p className="mt-2 text-sm text-rose-600">{discountCodeBatchError}</p> : null}
              {discountCodeBatchCreated.length > 0 ? (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                    Códigos creados ({discountCodeBatchCreated.length})
                  </p>
                  <p className="mt-2 text-sm text-emerald-900">
                    {discountCodeBatchCreated.join(", ")}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {activeTab === "catalog" &&
        catalogWorkspaceView === "discount_codes" &&
        discountCodeHistoryOpenId !== null ? (
          <div className="fixed inset-0 z-[125] flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Historial de uso</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Cupón <span className="font-semibold text-slate-700">{discountCodeHistoryOpenCode || "-"}</span> · usos registrados: {discountCodeHistoryTotal}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDiscountCodeHistoryOpenId(null);
                    setDiscountCodeHistoryOpenCode("");
                    setDiscountCodeHistoryRows([]);
                    setDiscountCodeHistoryError(null);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                >
                  Cerrar
                </button>
              </div>

              <div className="mt-4 max-h-[60vh] overflow-auto rounded-2xl border border-slate-200">
                {discountCodeHistoryLoading ? (
                  <div className="px-4 py-8 text-sm text-slate-500">Cargando historial…</div>
                ) : discountCodeHistoryError ? (
                  <div className="px-4 py-8 text-sm text-rose-600">{discountCodeHistoryError}</div>
                ) : discountCodeHistoryRows.length === 0 ? (
                  <div className="px-4 py-8 text-sm text-slate-500">Este cupón aún no registra usos.</div>
                ) : (
                  <table className="min-w-full text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      <tr>
                        <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Fecha uso</th>
                        <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Orden</th>
                        <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Cliente</th>
                        <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Total</th>
                        <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Estado</th>
                        <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Pago</th>
                      </tr>
                    </thead>
                    <tbody>
                      {discountCodeHistoryRows.map((entry) => (
                        <tr key={`coupon-usage-${entry.order_id}-${entry.created_at}`} className="border-b border-slate-100">
                          <td className="px-4 py-3 text-slate-700">{formatDateTime(entry.used_at || entry.created_at)}</td>
                          <td className="px-4 py-3 font-medium text-slate-900">{entry.document_number || `OW-${entry.order_id}`}</td>
                          <td className="px-4 py-3 text-slate-700">
                            <p className="font-medium text-slate-900">{entry.customer_name || "Cliente web"}</p>
                            <p className="text-xs text-slate-500">{entry.customer_email || "Sin correo"}</p>
                          </td>
                          <td className="px-4 py-3 text-slate-700">{formatMoney(entry.total || 0)}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusBadgeClass(entry.order_status)}`}>
                              {translateOrderStatus(entry.order_status)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusBadgeClass(entry.payment_status)}`}>
                              {translatePaymentStatus(entry.payment_status)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
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
                    <h3 className="text-sm font-semibold text-slate-900">Entrega (checkout)</h3>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Modalidad
                        </p>
                        <p className="mt-1 text-sm font-medium text-slate-900">{selectedDeliverySummary.deliveryModeLabel}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Método
                        </p>
                        <p className="mt-1 text-sm font-medium text-slate-900">{selectedDeliverySummary.shippingLabel}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Ciudad / Departamento
                        </p>
                        <p className="mt-1 text-sm text-slate-800">{selectedDeliverySummary.shippingCityState}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Teléfono de contacto
                        </p>
                        <p className="mt-1 text-sm text-slate-800">{selectedDeliverySummary.contactPhone}</p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Dirección de entrega
                      </p>
                      <p className="mt-1 text-sm text-slate-800">{selectedDeliverySummary.shippingAddress}</p>
                    </div>
                    <div className="mt-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Facturación
                      </p>
                      <p className="mt-1 text-sm text-slate-800">{selectedDeliverySummary.billingModeLabel}</p>
                    </div>
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

        {activeTab === "sliders" ? (
          <section className="space-y-4">
            <SectionCard
              title="Sliders del inicio"
              subtitle="Configura hasta 5 slides reutilizables para la web sin tocar código."
              headerActions={
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={openHomeSliderOrderEditor}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                  >
                    Cambiar orden
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void loadHomeSliders();
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                  >
                    Refrescar
                  </button>
                </div>
              }
            >
              <input
                ref={homeSliderImageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file || homeSliderPickerSlot === null) return;
                  void handleHomeSliderImageFileChange(homeSliderPickerSlot, file, homeSliderPickerTarget);
                }}
              />
              <p className="text-xs text-slate-500">
                Desktop recomendado: 1920x520 (.webp). Móvil opcional por slot: 1200x900 (4:3). Solo se publican sliders activos con imagen desktop.
              </p>
              {homeSlidersError ? <p className="mt-2 text-sm text-rose-600">{homeSlidersError}</p> : null}
              {homeSlidersLoading ? (
                <p className="mt-4 text-sm text-slate-500">Cargando sliders...</p>
              ) : (
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  {homeSliderCards.map((slider) => (
                    <div key={`home-slider-${slider.slot}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">Slot {slider.slot}</p>
                        <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                          <input
                            type="checkbox"
                            checked={slider.enabled}
                            onChange={(event) =>
                              patchHomeSliderLocal(slider.slot, (current) => ({
                                ...current,
                                enabled: event.target.checked,
                              }))
                            }
                          />
                          Activo
                        </label>
                      </div>

                      <div className="mt-3 h-28 w-full rounded-xl border border-slate-200 bg-white bg-cover bg-center bg-no-repeat" style={slider.image_url ? { backgroundImage: `url('${resolveAssetUrl(slider.image_url) || slider.image_url}')` } : undefined}>
                        {!slider.image_url ? (
                          <div className="flex h-full items-center justify-center text-xs text-slate-400">Placeholder vacío</div>
                        ) : null}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={homeSliderUploadingSlot === slider.slot}
                          onClick={() => {
                            setHomeSliderPickerSlot(slider.slot);
                            setHomeSliderPickerTarget("desktop");
                            homeSliderImageInputRef.current?.click();
                          }}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {homeSliderUploadingSlot === slider.slot ? "Subiendo..." : "Subir imagen"}
                        </button>
                        <button
                          type="button"
                          disabled={homeSliderMobileUploadingSlot === slider.slot}
                          onClick={() => {
                            setHomeSliderPickerSlot(slider.slot);
                            setHomeSliderPickerTarget("mobile");
                            homeSliderImageInputRef.current?.click();
                          }}
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {homeSliderMobileUploadingSlot === slider.slot ? "Subiendo móvil..." : "Subir móvil"}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            patchHomeSliderLocal(slider.slot, (current) => ({
                              ...current,
                              image_url: null,
                            }))
                          }
                          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:border-rose-300"
                        >
                          Quitar
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            patchHomeSliderLocal(slider.slot, (current) => ({
                              ...current,
                              mobile_image_url: null,
                            }))
                          }
                          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:border-amber-300"
                        >
                          Quitar móvil
                        </button>
                      </div>
                      <div className="mt-2">
                        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
                          Vista móvil (opcional)
                        </p>
                        <div
                          className="mt-1 h-16 w-32 rounded-lg border border-slate-200 bg-white bg-cover bg-center bg-no-repeat"
                          style={
                            slider.mobile_image_url
                              ? {
                                  backgroundImage: `url('${resolveAssetUrl(slider.mobile_image_url) || slider.mobile_image_url}')`,
                                }
                              : undefined
                          }
                        >
                          {!slider.mobile_image_url ? (
                            <div className="flex h-full items-center justify-center text-[10px] text-slate-400">
                              Sin imagen móvil
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2">
                        <div className="grid grid-cols-[1fr_auto] gap-2">
                          <input
                            value={slider.cta_label || ""}
                            onChange={(event) =>
                              patchHomeSliderLocal(slider.slot, (current) => ({
                                ...current,
                                cta_label: event.target.value,
                              }))
                            }
                            placeholder="Texto CTA (ej: VER GUITARRAS)"
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-400"
                          />
                          <button
                            type="button"
                            disabled={!slider.image_url}
                            onClick={() => setHomeSliderPositioningSlot(slider.slot)}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                            title={slider.image_url ? "Ubicar CTA" : "Sube imagen para ubicar CTA"}
                          >
                            Ubicar
                          </button>
                        </div>
                        <input
                          value={slider.alt_text || ""}
                          onChange={(event) =>
                            patchHomeSliderLocal(slider.slot, (current) => ({
                              ...current,
                              alt_text: event.target.value,
                            }))
                          }
                          placeholder="Texto alternativo (accesibilidad)"
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-400"
                        />
                        <select
                          value={slider.link_type}
                          onChange={(event) =>
                            patchHomeSliderLocal(slider.slot, (current) => ({
                              ...current,
                              link_type: event.target.value as ComercioWebHomeSliderLinkType,
                              link_value:
                                event.target.value === "sin_link" ||
                                event.target.value === "catalogo" ||
                                event.target.value === "personalizacion"
                                  ? ""
                                  : current.link_value,
                            }))
                          }
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-400"
                        >
                          <option value="sin_link">Sin link</option>
                          <option value="catalogo">Catálogo principal</option>
                          <option value="categoria">Catálogo por categoría</option>
                          <option value="subcategoria">Catálogo por subcategoría</option>
                          <option value="personalizacion">Personalización</option>
                          <option value="contacto">Contacto (sección)</option>
                          <option value="url_interna">Ruta interna</option>
                        </select>
                        {slider.link_type === "categoria" ? (
                          <select
                            value={slider.link_value || ""}
                            onChange={(event) =>
                              patchHomeSliderLocal(slider.slot, (current) => ({
                                ...current,
                                link_value: event.target.value,
                              }))
                            }
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-400"
                          >
                            <option value="">Selecciona categoría</option>
                            {rootCatalogCategoryOptions.map((category) => (
                              <option key={`slider-category-${slider.slot}-${category.id}`} value={category.key}>
                                {category.name}
                              </option>
                            ))}
                            </select>
                        ) : slider.link_type === "subcategoria" ? (
                          <>
                            <select
                              value={(slider.link_value || "").split("::")[0] || ""}
                              onChange={(event) => {
                                const parentKey = event.target.value;
                                patchHomeSliderLocal(slider.slot, (current) => ({
                                  ...current,
                                  link_value: parentKey ? `${parentKey}::` : "",
                                }));
                              }}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-400"
                            >
                              <option value="">Selecciona categoría</option>
                              {rootCatalogCategoryOptions.map((category) => (
                                <option key={`slider-sub-parent-${slider.slot}-${category.id}`} value={category.key}>
                                  {category.name}
                                </option>
                              ))}
                            </select>
                            <select
                              value={(slider.link_value || "").split("::")[1] || ""}
                              onChange={(event) => {
                                const [parentKey] = (slider.link_value || "").split("::");
                                const childKey = event.target.value;
                                patchHomeSliderLocal(slider.slot, (current) => ({
                                  ...current,
                                  link_value: parentKey && childKey ? `${parentKey}::${childKey}` : "",
                                }));
                              }}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-400"
                            >
                              <option value="">Selecciona subcategoría</option>
                              {(((slider.link_value || "").split("::")[0] &&
                                subcategoryOptionsByParent.get(((slider.link_value || "").split("::")[0] || "").toLowerCase())) ||
                                []
                              ).map((subcategory) => (
                                <option key={`slider-sub-child-${slider.slot}-${subcategory.id}`} value={subcategory.key}>
                                  {subcategory.name}
                                </option>
                              ))}
                            </select>
                          </>
                        ) : (
                          <input
                            value={slider.link_value || ""}
                            onChange={(event) =>
                              patchHomeSliderLocal(slider.slot, (current) => ({
                                ...current,
                                link_value: event.target.value,
                              }))
                            }
                            placeholder={
                              slider.link_type === "contacto"
                                ? "Sección contacto (ej: formulario)"
                                : slider.link_type === "personalizacion"
                                  ? "Sin valor adicional"
                                : slider.link_type === "sin_link"
                                  ? "Sin valor adicional"
                                : slider.link_type === "url_interna"
                                  ? "Ruta interna (ej: /catalogo?category=instrumentos)"
                                  : "Sin valor adicional"
                            }
                            disabled={
                              slider.link_type === "sin_link" ||
                              slider.link_type === "catalogo" ||
                              slider.link_type === "personalizacion"
                            }
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-400 disabled:bg-slate-100"
                          />
                        )}
                      </div>

                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            void handleSaveHomeSlider(slider.slot);
                          }}
                          disabled={homeSlidersSavingSlot === slider.slot}
                          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {homeSlidersSavingSlot === slider.slot ? "Guardando..." : "Guardar slot"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </section>
        ) : null}

        {activeTab === "personalization_home_images" ? (
          <section className="space-y-4">
            <SectionCard
              title="Sección principal de la portada"
              subtitle="Elige si la home muestra las categorías destacadas, el carrusel de instrumentos o ambos."
              headerActions={
                <button
                  type="button"
                  onClick={() => {
                    if (!token) return;
                    void fetchPosSettings(token).then((settings) => {
                      const value = settings.web_home_sections_mode;
                      const nextMode: WebHomeSectionsMode =
                        value === "instruments" || value === "both" ? value : "categories";
                      setHomeSectionsMode(nextMode);
                      setHomeSectionsModeBaseline(nextMode);
                    });
                  }}
                  className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
                >
                  Refrescar
                </button>
              }
            >
              <div className="grid gap-3 md:grid-cols-3">
                {[
                  {
                    value: "categories" as const,
                    title: "Solo categorías",
                    copy: "Muestra únicamente el bloque de categorías destacadas actual.",
                  },
                  {
                    value: "instruments" as const,
                    title: "Solo instrumentos",
                    copy: "Oculta categorías y muestra el carrusel de instrumentos.",
                  },
                  {
                    value: "both" as const,
                    title: "Ambos bloques",
                    copy: "Muestra categorías destacadas y carrusel de instrumentos.",
                  },
                ].map((option) => {
                  const active = homeSectionsMode === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setHomeSectionsMode(option.value)}
                      className={`rounded-2xl border px-4 py-4 text-left transition ${
                        active
                          ? "border-slate-900 bg-slate-900 text-white shadow-lg"
                          : "border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-300 hover:bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{option.title}</p>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${
                            active
                              ? "bg-white/15 text-white"
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {active ? "Activo" : "Elegir"}
                        </span>
                      </div>
                      <p className={`mt-2 text-sm leading-5 ${active ? "text-slate-100" : "text-slate-500"}`}>
                        {option.copy}
                      </p>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  Esta preferencia controla qué bloques se muestran en la portada pública.
                </p>
                <button
                  type="button"
                  onClick={handleSaveHomeSectionsMode}
                  disabled={!homeSectionsModeDirty || homeSectionsModeSaving}
                  className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {homeSectionsModeSaving ? "Guardando..." : "Guardar preferencia"}
                </button>
              </div>
            </SectionCard>

            <SectionCard
              title="Imágenes Home de personalización"
              subtitle="Configura las imágenes before/after que se muestran en la portada del sitio."
              headerActions={
                <button
                  type="button"
                  onClick={() => {
                    if (!token) return;
                    void fetchPosSettings(token).then((settings) => {
                      const source = settings.web_personalization_home_images;
                      if (!source || typeof source !== "object") return;
                      const next = { ...DEFAULT_PERSONALIZATION_HOME_IMAGES };
                      (Object.keys(DEFAULT_PERSONALIZATION_HOME_IMAGES) as PersonalizableInstrumentKey[]).forEach(
                        (key) => {
                          const row = source[key as keyof typeof source];
                          if (!row || typeof row !== "object") return;
                          next[key] = {
                            beforeImageUrl:
                              typeof row.before_image_url === "string" ? row.before_image_url : "",
                            afterImageUrl:
                              typeof row.after_image_url === "string" ? row.after_image_url : "",
                          };
                        }
                      );
                      setPersonalizationHomeImages(next);
                      setPersonalizationHomeImagesBaseline(next);
                    });
                  }}
                  className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
                >
                  Refrescar
                </button>
              }
            >
              <input
                ref={personalizationHomeImageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file || !personalizationHomeImagePicker) return;
                  void handlePersonalizationHomeImageFileChange(
                    personalizationHomeImagePicker.instrument,
                    personalizationHomeImagePicker.side,
                    file
                  );
                  if (personalizationHomeImageInputRef.current) {
                    personalizationHomeImageInputRef.current.value = "";
                  }
                  setPersonalizationHomeImagePicker(null);
                }}
              />
              <p className="text-xs text-slate-500">
                Sube dos imágenes por instrumento: una para el estado antes y otra para el estado después.
              </p>
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Recomendado: <span className="font-semibold text-slate-800">1200x1200 px</span> o
                más, fondo limpio y el instrumento centrado para que no se corte en el preview.
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-3">
                {(Object.keys(DEFAULT_PERSONALIZATION_HOME_IMAGES) as PersonalizableInstrumentKey[]).map((instrument) => {
                  const item = personalizationHomeImages[instrument];
                  const beforeSrc = item.beforeImageUrl.trim();
                  const afterSrc = item.afterImageUrl.trim();
                  const saving = personalizationHomeImagesSavingInstrument === instrument;
                  const uploadingBefore =
                    personalizationHomeImagesUploading?.instrument === instrument &&
                    personalizationHomeImagesUploading.side === "before";
                  const uploadingAfter =
                    personalizationHomeImagesUploading?.instrument === instrument &&
                    personalizationHomeImagesUploading.side === "after";
                  return (
                    <div
                      key={`personalization-home-image-${instrument}`}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">
                          {instrument === "campana" ? "Campana" : instrument === "guiro" ? "Güiro" : "Maracas"}
                        </p>
                        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
                          Before / After
                        </span>
                      </div>

                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                            Antes
                          </p>
                          <div
                            className="h-28 w-full border border-slate-200 bg-white bg-cover bg-center bg-no-repeat"
                            style={
                              beforeSrc
                                ? { backgroundImage: `url('${resolveAssetUrl(beforeSrc) || beforeSrc}')` }
                                : undefined
                            }
                          >
                            {!beforeSrc ? (
                              <div className="flex h-full items-center justify-center text-xs text-slate-400">
                                Sin imagen
                              </div>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={uploadingBefore}
                              onClick={() => {
                                setPersonalizationHomeImagePicker({ instrument, side: "before" });
                                personalizationHomeImageInputRef.current?.click();
                              }}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {uploadingBefore ? "Subiendo..." : "Subir antes"}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setPersonalizationHomeImages((current) => ({
                                  ...current,
                                  [instrument]: {
                                    ...current[instrument],
                                    beforeImageUrl: "",
                                  },
                                }))
                              }
                              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:border-rose-300"
                            >
                              Quitar
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                            Después
                          </p>
                          <div
                            className="h-28 w-full border border-slate-200 bg-white bg-cover bg-center bg-no-repeat"
                            style={
                              afterSrc
                                ? { backgroundImage: `url('${resolveAssetUrl(afterSrc) || afterSrc}')` }
                                : undefined
                            }
                          >
                            {!afterSrc ? (
                              <div className="flex h-full items-center justify-center text-xs text-slate-400">
                                Sin imagen
                              </div>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={uploadingAfter}
                              onClick={() => {
                                setPersonalizationHomeImagePicker({ instrument, side: "after" });
                                personalizationHomeImageInputRef.current?.click();
                              }}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {uploadingAfter ? "Subiendo..." : "Subir después"}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setPersonalizationHomeImages((current) => ({
                                  ...current,
                                  [instrument]: {
                                    ...current[instrument],
                                    afterImageUrl: "",
                                  },
                                }))
                              }
                              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:border-rose-300"
                            >
                              Quitar
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            void handleSavePersonalizationHomeImages(instrument);
                          }}
                          disabled={!personalizationHomeImagesDirty || saving}
                          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {saving ? "Guardando..." : "Guardar imágenes"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>

            <SectionCard
              title="Collage de marcas"
              subtitle="Reemplaza las imágenes del collage de la portada sin tocar el diseño general."
              headerActions={
                <button
                  type="button"
                  onClick={() => {
                    if (!token) return;
                    void fetchPosSettings(token).then((settings) => {
                      const source = settings.web_brand_collage_images;
                      if (!source || typeof source !== "object") return;
                      const next = { ...DEFAULT_BRAND_COLLAGE_IMAGES };
                      (Object.keys(DEFAULT_BRAND_COLLAGE_IMAGES) as BrandCollageSlotKey[]).forEach(
                        (key) => {
                          const row = source[key as keyof typeof source];
                          if (!row || typeof row !== "object") return;
                          next[key] = {
                            imageUrl: typeof row.image_url === "string" ? row.image_url : "",
                            href: typeof row.href === "string" ? row.href : DEFAULT_BRAND_COLLAGE_IMAGES[key].href,
                          };
                        }
                      );
                      setBrandCollageImages(next);
                      setBrandCollageImagesBaseline(next);
                    });
                  }}
                  className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
                >
                  Refrescar
                </button>
              }
            >
              <input
                ref={brandCollageImageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file || !brandCollageImagePicker) return;
                  void handleBrandCollageImageFileChange(brandCollageImagePicker, file);
                  if (brandCollageImageInputRef.current) {
                    brandCollageImageInputRef.current.value = "";
                  }
                  setBrandCollageImagePicker(null);
                }}
              />
              <p className="text-xs text-slate-500">
                Usa imágenes limpias y centradas. Recomendado: 1200x1200 px o más, fondo claro y
                sin texto demasiado pequeño para que el collage no se vea cortado.
              </p>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {(
                  [
                    { key: "main", label: "Principal" },
                    { key: "top_left", label: "Superior izquierda" },
                    { key: "top_right", label: "Superior derecha" },
                    { key: "bottom", label: "Inferior" },
                  ] as Array<{ key: BrandCollageSlotKey; label: string }>
                ).map((slot) => {
                  const item = brandCollageImages[slot.key];
                  const imageSrc = item.imageUrl.trim();
                  const saving = brandCollageImagesSavingSlot === slot.key;
                  const uploading = brandCollageImagesUploadingSlot === slot.key;
                  return (
                    <div
                      key={`brand-collage-${slot.key}`}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">{slot.label}</p>
                        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
                          Collage
                        </span>
                      </div>

                      <div
                        className="mt-3 h-36 w-full border border-slate-200 bg-white bg-cover bg-center bg-no-repeat"
                        style={
                          imageSrc
                            ? {
                                backgroundImage: `url('${resolveBrandCollagePreviewUrl(imageSrc) || imageSrc}')`,
                              }
                            : undefined
                        }
                      >
                        {!imageSrc ? (
                          <div className="flex h-full items-center justify-center text-xs text-slate-400">
                            Sin imagen
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={uploading}
                          onClick={() => {
                            setBrandCollageImagePicker(slot.key);
                            brandCollageImageInputRef.current?.click();
                          }}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {uploading ? "Subiendo..." : "Subir imagen"}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setBrandCollageImages((current) => ({
                              ...current,
                              [slot.key]: {
                                imageUrl: "",
                                href: current[slot.key].href,
                              },
                            }))
                          }
                          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:border-rose-300"
                        >
                          Quitar
                        </button>
                      </div>

                      <div className="mt-3 space-y-2">
                        <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                          Enlace destino
                        </label>
                        <select
                          value={resolveBrandCollageSelection(item.href)}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            setBrandCollageImages((current) => ({
                              ...current,
                              [slot.key]: {
                                ...current[slot.key],
                                href: buildBrandCollageHref(nextValue),
                              },
                            }));
                          }}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-slate-400"
                        >
                          <option value="">Selecciona una marca</option>
                          {catalogBrandOptions.map((brandOption) => (
                            <option key={brandOption} value={brandOption}>
                              {brandOption}
                            </option>
                          ))}
                        </select>
                        <p className="text-[11px] leading-4 text-slate-500">
                          Elige una marca existente; el sistema arma automáticamente el enlace al catálogo.
                        </p>
                      </div>

                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            void handleSaveBrandCollageImage(slot.key);
                          }}
                          disabled={!brandCollageImagesDirty || saving}
                          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {saving ? "Guardando..." : "Guardar imagen"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          </section>
        ) : null}

        {homeSliderOrderEditorOpen ? (
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Orden de sliders</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Arrastra los bloques para definir cómo se muestran en inicio.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (homeSliderOrderSaving) return;
                    setHomeSliderOrderEditorOpen(false);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                >
                  Cerrar
                </button>
              </div>

              <div className="mt-4 space-y-2">
                {homeSliderOrderDraft.map((slot, index) => {
                  const item = homeSliders.find((row) => row.slot === slot);
                  if (!item) return null;
                  return (
                    <button
                      key={`slider-order-slot-${slot}`}
                      type="button"
                      draggable={!homeSliderOrderSaving}
                      onDragStart={() => setHomeSliderOrderDraggedSlot(slot)}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (homeSliderOrderDraggedSlot !== null && homeSliderOrderDraggedSlot !== slot) {
                          moveHomeSliderOrderSlot(homeSliderOrderDraggedSlot, slot);
                        }
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (homeSliderOrderDraggedSlot !== null && homeSliderOrderDraggedSlot !== slot) {
                          moveHomeSliderOrderSlot(homeSliderOrderDraggedSlot, slot);
                        }
                        setHomeSliderOrderDraggedSlot(null);
                      }}
                      onDragEnd={() => setHomeSliderOrderDraggedSlot(null)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                        homeSliderOrderDraggedSlot === slot
                          ? "border-emerald-300 bg-emerald-50"
                          : "border-slate-200 bg-slate-50 hover:border-slate-300"
                      }`}
                    >
                      <div className="w-8 text-center text-xs font-semibold text-slate-500">#{index + 1}</div>
                      <div
                        className="h-10 w-24 rounded-md border border-slate-200 bg-white bg-cover bg-center bg-no-repeat"
                        style={
                          item.image_url
                            ? {
                                backgroundImage: `url('${resolveAssetUrl(item.image_url) || item.image_url}')`,
                              }
                            : undefined
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">Slot {item.slot}</p>
                        <p className="truncate text-xs text-slate-500">
                          {(item.cta_label || "").trim()
                            ? `CTA: ${item.cta_label}`
                            : item.image_url
                              ? "Slide con imagen"
                              : "Placeholder vacío"}
                        </p>
                      </div>
                      <div className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                        Drag
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setHomeSliderOrderDraft(homeSliderOrderItems.map((item) => item.slot))}
                  disabled={homeSliderOrderSaving}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleApplyHomeSliderOrder();
                  }}
                  disabled={homeSliderOrderSaving}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {homeSliderOrderSaving ? "Aplicando..." : "Aplicar orden"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === "personalization" ? (
          <section className="space-y-4">
            <SectionCard
              title="Vinculación de instrumentos"
              subtitle="Define qué producto catálogo y qué servicio de personalización corresponde a cada instrumento."
              headerActions={
                <button
                  type="button"
                  onClick={() => setPersonalizationBindingsOpen(true)}
                  className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
                >
                  Configurar vinculación
                </button>
              }
            >
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Configura los vínculos de instrumentos desde una ventana aislada para no mezclarlo con el resto del flujo.
              </div>
            </SectionCard>
            {personalizationBindingsOpen ? (
              <div className="fixed inset-0 z-[120] flex items-start justify-center bg-slate-950/50 p-4 md:p-6">
                <div className="max-h-[92vh] w-full max-w-7xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                  <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">Configurar vinculación de instrumentos</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Vincula SKU/ID/slug por variante y guarda en backend.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSavePersonalizationBindings}
                        disabled={
                          personalizationBindingsSaving ||
                          !canManage ||
                          !personalizationBindingsDirty
                        }
                        className="inline-flex items-center rounded-xl bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {personalizationBindingsSaving ? "Guardando..." : "Guardar configuración"}
                      </button>
                      <button
                        type="button"
                        onClick={handleCloseBindingsModal}
                        className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
                      >
                        {personalizationBindingsDirty ? "Cancelar" : "Cerrar"}
                      </button>
                    </div>
                  </div>
                  <div className="max-h-[74vh] space-y-3 overflow-y-auto p-4">
                    {PERSONALIZATION_VARIANT_OPTIONS.map(({ key, label }) => (
                      <div
                        key={key}
                        className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5"
                      >
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{label}</p>
                        </div>
                        <div>
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                            Producto base
                          </p>
                          <div className="grid gap-1.5 md:grid-cols-12">
                            <label className="relative space-y-1 md:col-span-2">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                                SKU
                              </span>
                              <input
                                value={personalizationVariantBindings[key].productSku}
                                onChange={(event) => {
                                  handleProductSkuInputChange(key, event.target.value);
                                  handleSkuSuggestionSearch(key, "product", event.target.value);
                                }}
                                onBlur={(event) => {
                                  void handleProductSkuAutoFill(key, event.target.value);
                                  handleSkuBlur();
                                }}
                                onFocus={(event) => {
                                  handleSkuSuggestionSearch(key, "product", event.target.value);
                                }}
                                placeholder="551"
                                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                              />
                              {activeSkuField?.variant === key && activeSkuField.kind === "product" ? (
                                <div className="absolute top-full right-0 left-0 z-20 mt-1 max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                                  {skuSuggestionsLoading ? (
                                    <p className="px-3 py-2 text-xs text-slate-500">Buscando SKU...</p>
                                  ) : skuSuggestions.length === 0 ? (
                                    <p className="px-3 py-2 text-xs text-slate-500">Sin coincidencias por SKU.</p>
                                  ) : (
                                    skuSuggestions.map((item) => (
                                      <button
                                        key={`sku-sug-product-${key}-${item.id}`}
                                        type="button"
                                        onMouseDown={(event) => {
                                          event.preventDefault();
                                          applySkuSelection(key, "product", item);
                                        }}
                                        className="flex w-full items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-left text-xs hover:bg-slate-50"
                                      >
                                        <span className="font-semibold text-slate-800">{item.sku || "-"}</span>
                                        <span className="truncate text-slate-600">{item.web_name || item.name}</span>
                                      </button>
                                    ))
                                  )}
                                </div>
                              ) : null}
                            </label>
                            <label className="space-y-1 md:col-span-4">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                                Nombre
                              </span>
                              <input
                                value={personalizationVariantBindings[key].productName}
                                readOnly
                                placeholder="Nombre del producto"
                                className="w-full rounded-xl border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-600"
                              />
                            </label>
                            <label className="relative space-y-1 md:col-span-2">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                                ID
                              </span>
                              <input
                                value={personalizationVariantBindings[key].productId}
                                readOnly
                                placeholder="551"
                                className="w-full rounded-xl border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-600"
                              />
                            </label>
                            <label className="space-y-1 md:col-span-4">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                                Slug
                              </span>
                              <input
                                value={personalizationVariantBindings[key].productSlug}
                                readOnly
                                placeholder="par-de-maracas-instrumento"
                                className="w-full rounded-xl border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-600"
                              />
                            </label>
                          </div>
                        </div>
                        <div>
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                            Servicio de personalización
                          </p>
                          <div className="grid gap-1.5 md:grid-cols-12">
                            <label className="relative space-y-1 md:col-span-2">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                                SKU
                              </span>
                              <input
                                value={personalizationVariantBindings[key].serviceSku}
                                onChange={(event) => {
                                  handleServiceSkuInputChange(key, event.target.value);
                                  handleSkuSuggestionSearch(key, "service", event.target.value);
                                }}
                                onBlur={(event) => {
                                  void handleServiceSkuAutoFill(key, event.target.value);
                                  handleSkuBlur();
                                }}
                                onFocus={(event) => {
                                  handleSkuSuggestionSearch(key, "service", event.target.value);
                                }}
                                placeholder="3753"
                                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                              />
                              {activeSkuField?.variant === key && activeSkuField.kind === "service" ? (
                                <div className="absolute top-full right-0 left-0 z-20 mt-1 max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                                  {skuSuggestionsLoading ? (
                                    <p className="px-3 py-2 text-xs text-slate-500">Buscando SKU...</p>
                                  ) : skuSuggestions.length === 0 ? (
                                    <p className="px-3 py-2 text-xs text-slate-500">Sin coincidencias por SKU.</p>
                                  ) : (
                                    skuSuggestions.map((item) => (
                                      <button
                                        key={`sku-sug-service-${key}-${item.id}`}
                                        type="button"
                                        onMouseDown={(event) => {
                                          event.preventDefault();
                                          applySkuSelection(key, "service", item);
                                        }}
                                        className="flex w-full items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-left text-xs hover:bg-slate-50"
                                      >
                                        <span className="font-semibold text-slate-800">{item.sku || "-"}</span>
                                        <span className="truncate text-slate-600">{item.web_name || item.name}</span>
                                      </button>
                                    ))
                                  )}
                                </div>
                              ) : null}
                            </label>
                            <label className="space-y-1 md:col-span-8">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                                Nombre
                              </span>
                              <input
                                value={personalizationVariantBindings[key].serviceName}
                                readOnly
                                placeholder="Nombre del servicio"
                                className="w-full rounded-xl border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-600"
                              />
                            </label>
                            <label className="space-y-1 md:col-span-2">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                                ID
                              </span>
                              <input
                                value={personalizationVariantBindings[key].serviceId}
                                readOnly
                                placeholder="3755"
                                className="w-full rounded-xl border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-600"
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Variables recomendadas (Kensar Web)
                      </p>
                      <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-700">
                        {personalizationBindingsEnvPreview || "Completa al menos los Service ID para generar variables."}
                      </pre>
                      <p className="mt-2 text-xs text-slate-500">
                        Estado:{" "}
                        {personalizationBindingsSavedAt
                          ? `guardado en backend (${formatDateTime(personalizationBindingsSavedAt)})`
                          : "sin guardar"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            <section className="grid gap-4 lg:grid-cols-12">
              <div className="lg:col-span-4">
                <SectionCard
                  title="Órdenes personalizadas"
                  subtitle={`${personalizationOrders.length} orden(es)`}
                >
                  {loadingOrders ? (
                    <div className="py-8 text-sm text-slate-500">Cargando órdenes…</div>
                  ) : personalizationOrders.length === 0 ? (
                    <div className="py-8 text-sm text-slate-500">
                      No hay órdenes de personalización para los filtros actuales.
                    </div>
                  ) : (
                    <div className="max-h-[68vh] space-y-2 overflow-y-auto pr-1">
                      {personalizationOrders.map((order) => (
                        <button
                          key={order.id}
                          type="button"
                          onClick={() => setSelectedPersonalizationId(order.id)}
                          className={`w-full rounded-2xl border px-3.5 py-3 text-left transition ${
                            selectedPersonalizationOrder?.id === order.id
                              ? "border-emerald-300 bg-emerald-50/70"
                              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {order.document_number || `Orden #${order.id}`}
                          </p>
                          <p className="mt-1 truncate text-xs text-slate-600">
                            {order.customer_name || "Cliente web"} · {getPrimaryContact(order)}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {formatDateTime(order.created_at)}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">{formatMoney(order.total)}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </SectionCard>
              </div>

              <div className="lg:col-span-8">
                <SectionCard
                  title="Detalle de personalización"
                  subtitle="Vista 3D de referencia y productos del pedido."
                  headerActions={
                    <button
                      type="button"
                      onClick={() => void loadOrders()}
                      disabled={loadingOrders}
                      className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loadingOrders ? "Actualizando..." : "Refrescar"}
                    </button>
                  }
                >
                  {!selectedPersonalizationOrder ? (
                    <p className="text-sm text-slate-500">
                      Selecciona una orden de personalización para ver el detalle.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {orderError ? (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                          {orderError}
                        </div>
                      ) : null}
                      <div className="grid gap-3 sm:grid-cols-4">
                        <InfoPill
                          label="Documento"
                          value={selectedPersonalizationOrder.document_number || `#${selectedPersonalizationOrder.id}`}
                        />
                        <InfoPill label="Estado" value={translateOrderStatus(selectedPersonalizationOrder.status)} />
                        <InfoPill label="Pago" value={translatePaymentStatus(selectedPersonalizationOrder.payment_status)} />
                        <InfoPill label="Total" value={formatMoney(selectedPersonalizationOrder.total)} />
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Configuraciones
                          </p>
                          <span className="text-xs text-slate-500">
                            {selectedPersonalizationConfigurations.length} configuración(es)
                          </span>
                        </div>
                        {selectedPersonalizationConfigurations.length === 0 ? (
                          <p className="mt-2 text-sm text-slate-500">
                            Esta orden no incluye configuraciones legibles de personalización.
                          </p>
                        ) : (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {selectedPersonalizationConfigurations.map((configuration, index) => (
                              <button
                                key={configuration.id}
                                type="button"
                                onClick={() => setSelectedPersonalizationConfigId(configuration.id)}
                                className={`inline-flex items-center rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                                  selectedPersonalizationConfiguration?.id === configuration.id
                                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                    : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-100"
                                }`}
                              >
                                Configuración {index + 1}: {configuration.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Vista 3D {selectedPersonalizationConfiguration ? `· ${selectedPersonalizationConfiguration.label}` : ""}
                        </p>
                        {!hasPersonalizationViewerPayload ? (
                          <p className="mt-2 text-sm text-slate-500">No hay payload válido para renderizar.</p>
                        ) : !showPersonalizationViewer ? (
                          <div className="mt-2 flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => setShowPersonalizationViewer(true)}
                              className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                            >
                              Ver vista 3D
                            </button>
                            <p className="text-xs text-slate-500">
                              El visor se carga solo bajo demanda para mejorar rendimiento.
                            </p>
                          </div>
                        ) : (
                          <div className="mt-2 space-y-2">
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => setShowPersonalizationViewer(false)}
                                className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
                              >
                                Ocultar visor
                              </button>
                            </div>
                            <iframe
                              src={personalizationViewerSrc}
                              title={`Vista 3D ${selectedPersonalizationOrder.document_number || selectedPersonalizationOrder.id}`}
                              className="h-[560px] w-full rounded-xl border border-slate-200 bg-white"
                              loading="lazy"
                            />
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Productos de la orden
                        </p>
                        {selectedPersonalizationOrder.items.length === 0 ? (
                          <p className="mt-2 text-sm text-slate-500">Esta orden no tiene ítems asociados.</p>
                        ) : (
                          <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white">
                            <div className="divide-y divide-slate-100">
                              {selectedPersonalizationOrder.items.map((item) => (
                                <div key={item.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-slate-900">
                                      {item.product_name}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-500">
                                      SKU {item.product_sku || "sin SKU"} · {item.quantity} x{" "}
                                      {formatMoney(item.unit_price)}
                                    </p>
                                  </div>
                                  <p className="shrink-0 text-sm font-semibold text-slate-900">
                                    {formatMoney(item.line_total)}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Trazabilidad del diseño {selectedPersonalizationConfiguration ? `· ${selectedPersonalizationConfiguration.label}` : ""}
                        </p>
                        {selectedPersonalizationTraceLines.length === 0 ? (
                          <p className="mt-2 text-sm text-slate-500">
                            No hay traza textual disponible en esta orden.
                          </p>
                        ) : (
                          <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white">
                            <div className="divide-y divide-slate-100">
                              {selectedPersonalizationTraceLines.map((line, index) => (
                                <p key={`personalization-trace-${index}`} className="px-3 py-2 text-sm text-slate-700">
                                  {line}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}
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

        {homeSliderBeingPositioned ? (
          <div
            className="fixed inset-0 z-[998] flex items-center justify-center bg-slate-900/45 px-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    Ubicar CTA · Slot {homeSliderBeingPositioned.slot}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Haz clic o arrastra el CTA sobre la imagen. Vista en proporción real del placeholder.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsDraggingSliderCta(false);
                    setHomeSliderPositioningSlot(null);
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                >
                  Cerrar
                </button>
              </div>

              <div className="mt-4 space-y-3">
                <div
                  ref={homeSliderPositionerRef}
                  className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"
                  style={{ aspectRatio: "2000 / 650" }}
                  onMouseDown={(event) => {
                    if (!homeSliderBeingPositioned) return;
                    setIsDraggingSliderCta(true);
                    updateHomeSliderCtaPositionFromPointer(
                      homeSliderBeingPositioned.slot,
                      event.clientX,
                      event.clientY
                    );
                  }}
                  onMouseMove={(event) => {
                    if (!isDraggingSliderCta || !homeSliderBeingPositioned) return;
                    updateHomeSliderCtaPositionFromPointer(
                      homeSliderBeingPositioned.slot,
                      event.clientX,
                      event.clientY
                    );
                  }}
                  onMouseUp={() => setIsDraggingSliderCta(false)}
                  onMouseLeave={() => setIsDraggingSliderCta(false)}
                >
                  <div
                    className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                    style={{
                      backgroundImage: `url('${resolveAssetUrl(homeSliderBeingPositioned.image_url) || homeSliderBeingPositioned.image_url || ""}')`,
                    }}
                    aria-hidden="true"
                  />
                  {(homeSliderBeingPositioned.cta_label || "").trim() ? (
                    <div
                      className="pointer-events-none absolute z-[8]"
                      style={{
                        left: `${homeSliderBeingPositioned.cta_x_percent ?? 50}%`,
                        top: `${homeSliderBeingPositioned.cta_y_percent ?? 80}%`,
                        transform: "translate(-50%, -50%)",
                      }}
                    >
                      <span
                        className="inline-flex items-center justify-center whitespace-nowrap border border-white/45 bg-white/85 font-black leading-none tracking-[-0.01em] text-slate-900 shadow-[0_12px_24px_-16px_rgba(15,23,42,0.52)]"
                        style={{
                          minHeight: `${sliderModalCtaVisual.minHeight}px`,
                          borderRadius: `${sliderModalCtaVisual.radius}px`,
                          paddingLeft: `${sliderModalCtaVisual.paddingX}px`,
                          paddingRight: `${sliderModalCtaVisual.paddingX}px`,
                          fontSize: `${sliderModalCtaVisual.fontSizeRem}rem`,
                        }}
                      >
                        {homeSliderBeingPositioned.cta_label}
                      </span>
                    </div>
                  ) : null}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs text-slate-600">
                    Posición X: {Math.round(homeSliderBeingPositioned.cta_x_percent ?? 50)}%
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={homeSliderBeingPositioned.cta_x_percent ?? 50}
                      onChange={(event) =>
                        patchHomeSliderLocal(homeSliderBeingPositioned.slot, (current) => ({
                          ...current,
                          cta_x_percent: Number(event.target.value),
                        }))
                      }
                      className="mt-1 w-full"
                    />
                  </label>
                  <label className="text-xs text-slate-600">
                    Posición Y: {Math.round(homeSliderBeingPositioned.cta_y_percent ?? 80)}%
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={homeSliderBeingPositioned.cta_y_percent ?? 80}
                      onChange={(event) =>
                        patchHomeSliderLocal(homeSliderBeingPositioned.slot, (current) => ({
                          ...current,
                          cta_y_percent: Number(event.target.value),
                        }))
                      }
                      className="mt-1 w-full"
                    />
                  </label>
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() =>
                    patchHomeSliderLocal(homeSliderBeingPositioned.slot, (current) => ({
                      ...current,
                      cta_x_percent: 50,
                      cta_y_percent: 80,
                    }))
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleSaveHomeSlider(homeSliderBeingPositioned.slot);
                    setHomeSliderPositioningSlot(null);
                  }}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-800"
                >
                  Guardar posición
                </button>
              </div>
            </div>
          </div>
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

function SummaryMini({
  label,
  value,
  tone = "default",
  showAlert = false,
  isActive = false,
  onClick,
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "danger" | "warning";
  showAlert?: boolean;
  isActive?: boolean;
  onClick?: () => void;
}) {
  const labelClass =
    tone === "success"
      ? "text-emerald-700"
      : tone === "warning"
        ? "text-amber-700"
      : tone === "danger"
        ? "text-rose-700"
        : "text-slate-500";
  const valueClass =
    tone === "success"
      ? "text-emerald-700"
      : tone === "warning"
        ? "text-amber-700"
      : tone === "danger"
        ? "text-rose-700"
        : "text-slate-900";
  const cardToneClass =
    tone === "warning"
      ? "border-amber-200 bg-amber-50/75"
      : "border-slate-200 bg-slate-50";
  const warningLabelClass = tone === "warning" ? "text-[9px] tracking-[0.08em]" : "text-[10px] tracking-[0.12em]";

  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      className={`relative w-full rounded-xl border px-3 py-2 text-left transition ${
        isActive
          ? "border-slate-400 bg-white shadow-[inset_0_0_0_1px_rgba(15,23,42,0.12)]"
          : cardToneClass
      } ${onClick ? "cursor-pointer hover:border-slate-300" : "cursor-default"}`}
    >
      <p className={`${warningLabelClass} uppercase leading-tight ${labelClass}`}>{label}</p>
      <div className="mt-1 inline-flex items-center gap-1.5">
        <p className={`text-base font-semibold ${valueClass}`}>{value}</p>
        {showAlert ? (
          <span className="inline-flex h-5 w-5 animate-bounce items-center justify-center rounded-full bg-amber-500 text-[11px] font-black text-white shadow-[0_6px_12px_rgba(245,158,11,0.38)]">
            !
          </span>
        ) : null}
      </div>
    </button>
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

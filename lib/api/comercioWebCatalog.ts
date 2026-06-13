"use client";

import { getApiBase } from "@/lib/api/base";
import { DEFAULT_TECHNICAL_SPEC_TYPE_OPTIONS } from "@/lib/comercioWebTechnicalSpecTypes";

export type ComercioWebCatalogProduct = {
  id: number;
  sku?: string | null;
  name: string;
  price: number;
  cost: number;
  qty_on_hand?: number | null;
  stock?: number | null;
  available_stock?: number | null;
  barcode?: string | null;
  unit?: string | null;
  image_url?: string | null;
  image_thumb_url?: string | null;
  web_gallery_urls?: string[];
  web_video_url?: string | null;
  active: boolean;
  service: boolean;
  group_name?: string | null;
  brand?: string | null;
  supplier?: string | null;
  web_category_key?: string | null;
  web_name?: string | null;
  web_slug?: string | null;
  web_published: boolean;
  web_featured: boolean;
  web_short_description?: string | null;
  web_long_description?: string | null;
  web_compare_price?: number | null;
  web_price_source: "base" | "fixed" | "discount_percent";
  web_price_value?: number | null;
  web_badge_text?: string | null;
  web_sort_order: number;
  web_visible_when_out_of_stock: boolean;
  web_price_mode: "visible" | "consultar";
  web_whatsapp_message?: string | null;
  web_warranty_text?: string | null;
};

export type ComercioWebCatalogProductUpdate = Partial<
  Pick<
    ComercioWebCatalogProduct,
    | "name"
    | "price"
    | "cost"
    | "image_url"
    | "image_thumb_url"
    | "web_gallery_urls"
    | "web_video_url"
    | "group_name"
    | "brand"
    | "supplier"
    | "web_category_key"
    | "web_name"
    | "web_slug"
    | "web_published"
    | "web_featured"
    | "web_short_description"
    | "web_long_description"
    | "web_compare_price"
    | "web_price_source"
    | "web_price_value"
    | "web_badge_text"
    | "web_sort_order"
    | "web_visible_when_out_of_stock"
    | "web_price_mode"
    | "web_whatsapp_message"
    | "web_warranty_text"
    | "active"
  >
>;

export type ComercioWebCatalogPublicationStats = {
  configured: number;
  published: number;
  featured: number;
  discounted: number;
  consult: number;
  with_stock: number;
  without_stock: number;
  without_image: number;
};

export type ComercioWebCatalogPublicationPage = {
  items: ComercioWebCatalogProduct[];
  total: number;
  skip: number;
  limit: number;
  stats: ComercioWebCatalogPublicationStats;
};

export type ComercioWebComboItem = {
  id: number;
  product_id: number;
  quantity: number;
  required: boolean;
  sort_order: number;
  product_original_price: number;
  product_price: number;
  product_name: string;
  product_sku?: string | null;
  product_slug?: string | null;
  product_image_url?: string | null;
  product_image_thumb_url?: string | null;
  product_brand?: string | null;
  created_at: string;
  updated_at: string;
};

export type ComercioWebCombo = {
  id: number;
  name: string;
  slug: string;
  short_description?: string | null;
  long_description?: string | null;
  image_url?: string | null;
  image_thumb_url?: string | null;
  gallery_urls: string[];
  video_url?: string | null;
  badge_text?: string | null;
  category_key?: string | null;
  price: number;
  compare_price?: number | null;
  price_mode: "auto" | "fixed" | "discount";
  stock_mode: "manual" | "components";
  published: boolean;
  featured: boolean;
  sort_order: number;
  visible_when_out_of_stock: boolean;
  active: boolean;
  warranty_text?: string | null;
  technical_specs?: Array<{ type: string; value: string }>;
  items: ComercioWebComboItem[];
  created_at: string;
  updated_at: string;
};

export type ComercioWebComboCreate = {
  name: string;
  slug: string;
  short_description?: string | null;
  long_description?: string | null;
  image_url?: string | null;
  image_thumb_url?: string | null;
  gallery_urls?: string[];
  video_url?: string | null;
  badge_text?: string | null;
  category_key?: string | null;
  price: number;
  compare_price?: number | null;
  price_mode?: "auto" | "fixed" | "discount";
  stock_mode?: "manual" | "components";
  published?: boolean;
  featured?: boolean;
  sort_order?: number;
  visible_when_out_of_stock?: boolean;
  active?: boolean;
  warranty_text?: string | null;
  technical_specs?: Array<{ type: string; value: string }>;
  items: Array<{
    product_id: number;
    quantity: number;
    required?: boolean;
    sort_order?: number;
    product_price?: number;
  }>;
};

export type ComercioWebComboUpdate = Partial<
  Omit<ComercioWebComboCreate, "items"> & {
    items?: ComercioWebComboCreate["items"];
  }
>;

export type ComercioWebCatalogPublicationFilters = {
  q?: string;
  field?: "all" | "name" | "sku" | "brand" | "group" | "badge";
  status_filter?: "all" | "featured" | "discounted" | "consult" | "published" | "paused";
  featured_filter?: "all" | "featured" | "standard";
  badge_filter?: "all" | "with_badge" | "without_badge";
  stock_filter?: "with_stock" | "without_stock" | "without_image";
  category_key?: string;
  subcategory_key?: string;
  order?: "newest" | "oldest" | "alphabetical" | "price_asc" | "price_desc";
  active_only?: boolean;
  skip?: number;
  limit?: number;
};

export type ComercioWebCatalogCategory = {
  id: number;
  key: string;
  parent_key?: string | null;
  parent_name?: string | null;
  level?: number;
  has_children?: boolean;
  name: string;
  image_url?: string | null;
  tile_color?: string | null;
  home_featured: boolean;
  home_featured_order: number;
  sort_order: number;
  is_active: boolean;
  product_count: number;
  created_at: string;
  updated_at: string;
};

export type ComercioWebCatalogCategoryCreate = {
  key: string;
  name: string;
  parent_key?: string | null;
  image_url?: string | null;
  tile_color?: string | null;
  home_featured?: boolean;
  home_featured_order?: number;
  sort_order?: number;
  is_active?: boolean;
};

export type ComercioWebCatalogCategoryUpdate = Partial<ComercioWebCatalogCategoryCreate>;

export type ComercioWebDescriptionTemplate = {
  id: number;
  template_key: string;
  label: string;
  assigned_category_key?: string | null;
  keywords: string[];
  paragraph1: string;
  paragraph2: string;
  paragraph3: string;
  closing: string;
  sort_order: number;
  created_by_user_id?: number | null;
  updated_by_user_id?: number | null;
  created_at: string;
  updated_at: string;
};

export type ComercioWebDescriptionTemplateCreate = {
  template_key: string;
  label: string;
  assigned_category_key?: string | null;
  keywords?: string[];
  paragraph1?: string;
  paragraph2?: string;
  paragraph3?: string;
  closing?: string;
  sort_order?: number;
};

export type ComercioWebDescriptionTemplateUpdate =
  Partial<ComercioWebDescriptionTemplateCreate>;

function normalizeCatalogProduct(product: ComercioWebCatalogProduct): ComercioWebCatalogProduct {
  return {
    ...product,
    web_price_source: product.web_price_source ?? "base",
    web_price_value:
      typeof product.web_price_value === "number" ? product.web_price_value : null,
    web_gallery_urls: Array.isArray(product.web_gallery_urls) ? product.web_gallery_urls : [],
    web_video_url: typeof product.web_video_url === "string" ? product.web_video_url : null,
  };
}

function normalizeCombo(combo: ComercioWebCombo): ComercioWebCombo {
  return {
    ...combo,
    short_description: typeof combo.short_description === "string" ? combo.short_description : null,
    long_description: typeof combo.long_description === "string" ? combo.long_description : null,
    image_url: typeof combo.image_url === "string" ? combo.image_url : null,
    image_thumb_url: typeof combo.image_thumb_url === "string" ? combo.image_thumb_url : null,
    gallery_urls: Array.isArray(combo.gallery_urls) ? combo.gallery_urls : [],
    video_url: typeof combo.video_url === "string" ? combo.video_url : null,
    badge_text: typeof combo.badge_text === "string" ? combo.badge_text : null,
    category_key: typeof combo.category_key === "string" ? combo.category_key : null,
    compare_price:
      typeof combo.compare_price === "number" ? combo.compare_price : null,
    warranty_text: typeof combo.warranty_text === "string" ? combo.warranty_text : null,
    technical_specs: Array.isArray(combo.technical_specs)
      ? combo.technical_specs.filter(
          (item): item is { type: string; value: string } =>
            Boolean(item && typeof item.type === "string")
        )
      : [],
    items: Array.isArray(combo.items)
      ? combo.items.map((item) => ({
          ...item,
          product_sku: typeof item.product_sku === "string" ? item.product_sku : null,
          product_slug: typeof item.product_slug === "string" ? item.product_slug : null,
          product_image_url:
            typeof item.product_image_url === "string" ? item.product_image_url : null,
          product_image_thumb_url:
            typeof item.product_image_thumb_url === "string" ? item.product_image_thumb_url : null,
          product_brand: typeof item.product_brand === "string" ? item.product_brand : null,
        }))
      : [],
  };
}

function buildHeaders(token: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function parseError(res: Response): Promise<Error> {
  const body = await res.json().catch(() => null);
  const detail =
    typeof body?.detail === "string" ? body.detail : `Error ${res.status}`;
  const err = new Error(detail) as Error & { status?: number };
  err.status = res.status;
  return err;
}

export async function fetchComercioWebCatalogProducts(
  token: string,
  params?: {
    q?: string;
    published_only?: boolean;
    configured_only?: boolean;
    skip?: number;
    limit?: number;
  }
): Promise<ComercioWebCatalogProduct[]> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (typeof params?.published_only === "boolean") {
    qs.set("published_only", String(params.published_only));
  }
  if (typeof params?.configured_only === "boolean") {
    qs.set("configured_only", String(params.configured_only));
  }
  if (typeof params?.skip === "number" && params.skip > 0) {
    qs.set("skip", String(params.skip));
  }
  qs.set("limit", String(params?.limit ?? 60));
  const res = await fetch(`${getApiBase()}/comercio-web/catalog/products?${qs.toString()}`, {
    headers: buildHeaders(token),
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
  const data = (await res.json()) as ComercioWebCatalogProduct[];
  return data.map(normalizeCatalogProduct);
}

export async function updateComercioWebCatalogProduct(
  token: string,
  productId: number,
  input: ComercioWebCatalogProductUpdate
): Promise<ComercioWebCatalogProduct> {
  const res = await fetch(`${getApiBase()}/comercio-web/catalog/products/${productId}`, {
    method: "PUT",
    headers: buildHeaders(token),
    body: JSON.stringify(input),
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
  return normalizeCatalogProduct((await res.json()) as ComercioWebCatalogProduct);
}

export async function fetchComercioWebCatalogPublicationsPage(
  token: string,
  params?: ComercioWebCatalogPublicationFilters
): Promise<ComercioWebCatalogPublicationPage> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.field) qs.set("field", params.field);
  if (params?.status_filter) qs.set("status_filter", params.status_filter);
  if (params?.featured_filter) qs.set("featured_filter", params.featured_filter);
  if (params?.badge_filter) qs.set("badge_filter", params.badge_filter);
  if (params?.stock_filter) qs.set("stock_filter", params.stock_filter);
  if (params?.category_key) qs.set("category_key", params.category_key);
  if (params?.subcategory_key) qs.set("subcategory_key", params.subcategory_key);
  if (params?.order) qs.set("order", params.order);
  if (typeof params?.active_only === "boolean") {
    qs.set("active_only", String(params.active_only));
  }
  qs.set("skip", String(params?.skip ?? 0));
  qs.set("limit", String(params?.limit ?? 50));

  const res = await fetch(`${getApiBase()}/comercio-web/catalog/publications?${qs.toString()}`, {
    headers: buildHeaders(token),
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
  const data = (await res.json()) as ComercioWebCatalogPublicationPage;
  return {
    ...data,
    items: Array.isArray(data.items) ? data.items.map(normalizeCatalogProduct) : [],
    total: Number(data.total || 0),
    skip: Number(data.skip || 0),
    limit: Number(data.limit || 50),
    stats: {
      configured: Number(data.stats?.configured || 0),
      published: Number(data.stats?.published || 0),
      featured: Number(data.stats?.featured || 0),
      discounted: Number(data.stats?.discounted || 0),
      consult: Number(data.stats?.consult || 0),
      with_stock: Number(data.stats?.with_stock || 0),
      without_stock: Number(data.stats?.without_stock || 0),
      without_image: Number(data.stats?.without_image || 0),
    },
  };
}

export async function exportComercioWebCatalogPublicationsXlsx(
  token: string,
  params?: ComercioWebCatalogPublicationFilters
): Promise<Blob> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.field) qs.set("field", params.field);
  if (params?.status_filter) qs.set("status_filter", params.status_filter);
  if (params?.featured_filter) qs.set("featured_filter", params.featured_filter);
  if (params?.badge_filter) qs.set("badge_filter", params.badge_filter);
  if (params?.stock_filter) qs.set("stock_filter", params.stock_filter);
  if (params?.category_key) qs.set("category_key", params.category_key);
  if (params?.subcategory_key) qs.set("subcategory_key", params.subcategory_key);
  if (params?.order) qs.set("order", params.order);
  if (typeof params?.active_only === "boolean") {
    qs.set("active_only", String(params.active_only));
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await fetch(`${getApiBase()}/comercio-web/catalog/publications/export/xlsx${suffix}`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
  return await res.blob();
}

export async function fetchComercioWebCatalogCategories(
  token: string,
  params?: { include_inactive?: boolean }
): Promise<ComercioWebCatalogCategory[]> {
  const qs = new URLSearchParams();
  if (typeof params?.include_inactive === "boolean") {
    qs.set("include_inactive", String(params.include_inactive));
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await fetch(`${getApiBase()}/comercio-web/catalog/categories${suffix}`, {
    headers: buildHeaders(token),
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
  const data = (await res.json()) as ComercioWebCatalogCategory[];
  return Array.isArray(data) ? data : [];
}

export async function createComercioWebCatalogCategory(
  token: string,
  input: ComercioWebCatalogCategoryCreate
): Promise<ComercioWebCatalogCategory> {
  const res = await fetch(`${getApiBase()}/comercio-web/catalog/categories`, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify(input),
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as ComercioWebCatalogCategory;
}

export async function updateComercioWebCatalogCategory(
  token: string,
  categoryId: number,
  input: ComercioWebCatalogCategoryUpdate
): Promise<ComercioWebCatalogCategory> {
  const res = await fetch(`${getApiBase()}/comercio-web/catalog/categories/${categoryId}`, {
    method: "PUT",
    headers: buildHeaders(token),
    body: JSON.stringify(input),
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as ComercioWebCatalogCategory;
}

export async function deleteComercioWebCatalogCategory(
  token: string,
  categoryId: number
): Promise<void> {
  const res = await fetch(`${getApiBase()}/comercio-web/catalog/categories/${categoryId}`, {
    method: "DELETE",
    headers: buildHeaders(token),
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
}

export async function fetchComercioWebCatalogCombos(
  token: string,
  params?: { q?: string; published_only?: boolean; active_only?: boolean }
): Promise<ComercioWebCombo[]> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (typeof params?.published_only === "boolean") {
    qs.set("published_only", String(params.published_only));
  }
  if (typeof params?.active_only === "boolean") {
    qs.set("active_only", String(params.active_only));
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await fetch(`${getApiBase()}/comercio-web/catalog/combos${suffix}`, {
    headers: buildHeaders(token),
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
  const data = (await res.json()) as ComercioWebCombo[];
  return Array.isArray(data) ? data.map(normalizeCombo) : [];
}

export async function createComercioWebCatalogCombo(
  token: string,
  input: ComercioWebComboCreate
): Promise<ComercioWebCombo> {
  const res = await fetch(`${getApiBase()}/comercio-web/catalog/combos`, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify(input),
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
  return normalizeCombo((await res.json()) as ComercioWebCombo);
}

export async function updateComercioWebCatalogCombo(
  token: string,
  comboId: number,
  input: ComercioWebComboUpdate
): Promise<ComercioWebCombo> {
  const res = await fetch(`${getApiBase()}/comercio-web/catalog/combos/${comboId}`, {
    method: "PUT",
    headers: buildHeaders(token),
    body: JSON.stringify(input),
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
  return normalizeCombo((await res.json()) as ComercioWebCombo);
}

export async function deleteComercioWebCatalogCombo(
  token: string,
  comboId: number
): Promise<void> {
  const res = await fetch(`${getApiBase()}/comercio-web/catalog/combos/${comboId}`, {
    method: "DELETE",
    headers: buildHeaders(token),
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
}

export async function fetchComercioWebDescriptionTemplates(
  token: string
): Promise<ComercioWebDescriptionTemplate[]> {
  const res = await fetch(`${getApiBase()}/comercio-web/catalog/description-templates`, {
    headers: buildHeaders(token),
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
  const data = (await res.json()) as ComercioWebDescriptionTemplate[];
  return Array.isArray(data) ? data : [];
}

export async function createComercioWebDescriptionTemplate(
  token: string,
  input: ComercioWebDescriptionTemplateCreate
): Promise<ComercioWebDescriptionTemplate> {
  const res = await fetch(`${getApiBase()}/comercio-web/catalog/description-templates`, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify(input),
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as ComercioWebDescriptionTemplate;
}

export async function updateComercioWebDescriptionTemplate(
  token: string,
  templateKey: string,
  input: ComercioWebDescriptionTemplateUpdate
): Promise<ComercioWebDescriptionTemplate> {
  const res = await fetch(
    `${getApiBase()}/comercio-web/catalog/description-templates/${encodeURIComponent(templateKey)}`,
    {
      method: "PUT",
      headers: buildHeaders(token),
      body: JSON.stringify(input),
      credentials: "include",
    }
  );
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as ComercioWebDescriptionTemplate;
}

export async function deleteComercioWebDescriptionTemplate(
  token: string,
  templateKey: string
): Promise<void> {
  const res = await fetch(
    `${getApiBase()}/comercio-web/catalog/description-templates/${encodeURIComponent(templateKey)}`,
    {
      method: "DELETE",
      headers: buildHeaders(token),
      credentials: "include",
    }
  );
  if (!res.ok) throw await parseError(res);
}

export async function resetComercioWebDescriptionTemplates(
  token: string
): Promise<ComercioWebDescriptionTemplate[]> {
  const res = await fetch(`${getApiBase()}/comercio-web/catalog/description-templates/reset`, {
    method: "POST",
    headers: buildHeaders(token),
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
  const data = (await res.json()) as ComercioWebDescriptionTemplate[];
  return Array.isArray(data) ? data : [];
}

export async function fetchComercioWebTechnicalSpecTypes(
  token: string
): Promise<string[]> {
  const res = await fetch(`${getApiBase()}/comercio-web/catalog/technical-spec-types`, {
    headers: buildHeaders(token),
    credentials: "include",
  });
  if (!res.ok) {
    return [...DEFAULT_TECHNICAL_SPEC_TYPE_OPTIONS];
  }
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) {
    return [...DEFAULT_TECHNICAL_SPEC_TYPE_OPTIONS];
  }
  const normalized = data
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return normalized.length ? normalized : [...DEFAULT_TECHNICAL_SPEC_TYPE_OPTIONS];
}

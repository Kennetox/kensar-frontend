"use client";

import { getApiBase } from "@/lib/api/base";

export type ComercioWebCatalogProduct = {
  id: number;
  sku?: string | null;
  name: string;
  price: number;
  cost: number;
  barcode?: string | null;
  unit?: string | null;
  image_url?: string | null;
  image_thumb_url?: string | null;
  web_gallery_urls?: string[];
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
};

export type ComercioWebCatalogPublicationPage = {
  items: ComercioWebCatalogProduct[];
  total: number;
  skip: number;
  limit: number;
  stats: ComercioWebCatalogPublicationStats;
};

export type ComercioWebCatalogCategory = {
  id: number;
  key: string;
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
  image_url?: string | null;
  tile_color?: string | null;
  home_featured?: boolean;
  home_featured_order?: number;
  sort_order?: number;
  is_active?: boolean;
};

export type ComercioWebCatalogCategoryUpdate = Partial<ComercioWebCatalogCategoryCreate>;

function normalizeCatalogProduct(product: ComercioWebCatalogProduct): ComercioWebCatalogProduct {
  return {
    ...product,
    web_price_source: product.web_price_source ?? "base",
    web_price_value:
      typeof product.web_price_value === "number" ? product.web_price_value : null,
    web_gallery_urls: Array.isArray(product.web_gallery_urls) ? product.web_gallery_urls : [],
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
  params?: {
    q?: string;
    field?: "all" | "name" | "sku" | "brand" | "group" | "badge";
    status_filter?: "all" | "featured" | "discounted" | "consult";
    featured_filter?: "all" | "featured" | "standard";
    badge_filter?: "all" | "with_badge" | "without_badge";
    skip?: number;
    limit?: number;
  }
): Promise<ComercioWebCatalogPublicationPage> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.field) qs.set("field", params.field);
  if (params?.status_filter) qs.set("status_filter", params.status_filter);
  if (params?.featured_filter) qs.set("featured_filter", params.featured_filter);
  if (params?.badge_filter) qs.set("badge_filter", params.badge_filter);
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
    },
  };
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

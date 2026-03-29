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
  active: boolean;
  service: boolean;
  group_name?: string | null;
  brand?: string | null;
  supplier?: string | null;
  web_name?: string | null;
  web_slug?: string | null;
  web_published: boolean;
  web_featured: boolean;
  web_short_description?: string | null;
  web_long_description?: string | null;
  web_compare_price?: number | null;
  web_badge_text?: string | null;
  web_sort_order: number;
  web_visible_when_out_of_stock: boolean;
  web_price_mode: "visible" | "consultar";
  web_whatsapp_message?: string | null;
};

export type ComercioWebCatalogProductUpdate = Partial<
  Pick<
    ComercioWebCatalogProduct,
    | "name"
    | "price"
    | "cost"
    | "image_url"
    | "image_thumb_url"
    | "group_name"
    | "brand"
    | "supplier"
    | "web_name"
    | "web_slug"
    | "web_published"
    | "web_featured"
    | "web_short_description"
    | "web_long_description"
    | "web_compare_price"
    | "web_badge_text"
    | "web_sort_order"
    | "web_visible_when_out_of_stock"
    | "web_price_mode"
    | "web_whatsapp_message"
    | "active"
  >
>;

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
    limit?: number;
  }
): Promise<ComercioWebCatalogProduct[]> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (typeof params?.published_only === "boolean") {
    qs.set("published_only", String(params.published_only));
  }
  qs.set("limit", String(params?.limit ?? 60));
  const res = await fetch(`${getApiBase()}/comercio-web/catalog/products?${qs.toString()}`, {
    headers: buildHeaders(token),
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as ComercioWebCatalogProduct[];
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
  return (await res.json()) as ComercioWebCatalogProduct;
}

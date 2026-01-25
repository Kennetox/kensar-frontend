import { getApiBase } from "@/lib/api/base";

export type InventorySummary = {
  total_qty: number;
  low_stock_count: number;
  critical_count: number;
  anomaly_count: number;
  reorder_count: number;
};

export type InventoryMovementRecord = {
  id: number;
  product_id: number;
  product_name: string;
  qty_delta: number;
  reason: string;
  notes?: string | null;
  reference_type?: string | null;
  reference_id?: number | null;
  created_at: string;
  created_by_user_id?: number | null;
};

export type InventoryStatusRow = {
  product_id: number;
  product_name: string;
  qty_on_hand: number;
  status: "ok" | "low" | "critical";
};

export type InventoryProductRow = {
  product_id: number;
  product_name: string;
  sku?: string | null;
  barcode?: string | null;
  qty_on_hand: number;
  status: "ok" | "low" | "critical";
  cost: number;
  price: number;
};

export type InventoryProductPage = {
  items: InventoryProductRow[];
  total: number;
  skip: number;
  limit: number;
  total_cost_value: number;
  total_price_value: number;
};

export type InventoryOverview = {
  summary: InventorySummary;
  recent_movements: InventoryMovementRecord[];
  status_rows: InventoryStatusRow[];
};

export async function fetchInventoryOverview(
  token: string
): Promise<InventoryOverview> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/inventory/overview`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as InventoryOverview;
}

export async function fetchInventoryProducts(
  token: string,
  options?: {
    skip?: number;
    limit?: number;
    search?: string;
    stock?: "all" | "positive" | "zero" | "negative";
    sort?: "name_asc" | "stock_asc" | "stock_desc";
  }
): Promise<InventoryProductPage> {
  const apiBase = getApiBase();
  const params = new URLSearchParams();
  if (options?.skip) params.set("skip", String(options.skip));
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.search) params.set("search", options.search);
  if (options?.stock && options.stock !== "all") params.set("stock", options.stock);
  if (options?.sort) params.set("sort", options.sort);
  const query = params.toString();
  const res = await fetch(`${apiBase}/inventory/products${query ? `?${query}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as InventoryProductPage;
}

export async function exportInventoryProducts(
  token: string,
  options?: {
    search?: string;
    stock?: "all" | "positive" | "zero" | "negative";
    sort?: "name_asc" | "stock_asc" | "stock_desc";
  }
): Promise<Blob> {
  const apiBase = getApiBase();
  const params = new URLSearchParams();
  if (options?.search) params.set("search", options.search);
  if (options?.stock && options.stock !== "all") params.set("stock", options.stock);
  if (options?.sort) params.set("sort", options.sort);
  const query = params.toString();
  const res = await fetch(
    `${apiBase}/inventory/products/export/xlsx${query ? `?${query}` : ""}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return await res.blob();
}

export type InventoryProductMovement = {
  id: number;
  reason: string;
  qty_delta: number;
  notes?: string | null;
  reference_type?: string | null;
  reference_id?: number | null;
  created_at: string;
};

export type InventoryProductHistory = {
  product_id: number;
  product_name: string;
  qty_on_hand: number;
  total_in: number;
  total_out: number;
  net: number;
  movements: InventoryProductMovement[];
  total_movements: number;
  skip: number;
  limit: number;
};

export async function fetchInventoryProductHistory(
  token: string,
  productId: number,
  options?: { skip?: number; limit?: number }
): Promise<InventoryProductHistory> {
  const apiBase = getApiBase();
  const params = new URLSearchParams();
  if (options?.skip) params.set("skip", String(options.skip));
  if (options?.limit) params.set("limit", String(options.limit));
  const query = params.toString();
  const res = await fetch(
    `${apiBase}/inventory/products/${productId}/history${
      query ? `?${query}` : ""
    }`,
    {
    headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as InventoryProductHistory;
}

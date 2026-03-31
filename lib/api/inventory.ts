import { getApiBase } from "@/lib/api/base";

function apiErrorMessage(payload: unknown, status: number): string {
  if (!payload) return `Error ${status}`;
  if (typeof payload === "string") return payload;
  if (typeof payload !== "object") return `Error ${status}`;

  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const joined = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) {
          const msg = (item as { msg?: unknown }).msg;
          return typeof msg === "string" ? msg : JSON.stringify(item);
        }
        return JSON.stringify(item);
      })
      .join(" | ");
    return joined || `Error ${status}`;
  }
  if (detail && typeof detail === "object") return JSON.stringify(detail);
  return `Error ${status}`;
}

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
  sku?: string | null;
  qty_delta: number;
  reason: string;
  notes?: string | null;
  reference_type?: string | null;
  reference_id?: number | null;
  created_at: string;
  created_by_user_id?: number | null;
  sale_pos_name?: string | null;
  sale_seller_name?: string | null;
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
  group_name?: string | null;
  qty_on_hand: number;
  status: "ok" | "low" | "critical";
  cost: number;
  price: number;
  last_movement_at?: string | null;
};

export type InventoryProductPage = {
  items: InventoryProductRow[];
  total: number;
  skip: number;
  limit: number;
  total_cost_value: number;
  total_price_value: number;
};

export type PosCustomerRead = {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  tax_id?: string | null;
  address?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ManualSaleCreatePayload = {
  payment_method: string;
  total: number;
  paid_amount: number;
  change_amount: number;
  cart_discount_value?: number;
  cart_discount_percent?: number;
  customer_name?: string;
  customer_id?: number;
  customer_phone?: string;
  customer_email?: string;
  customer_tax_id?: string;
  customer_address?: string;
  notes?: string;
  pos_name?: string;
  station_id?: string;
  vendor_name?: string;
  items: Array<{
    product_id: number;
    quantity: number;
    unit_price: number;
    unit_price_original?: number;
    product_sku?: string;
    product_name: string;
    product_barcode?: string;
    discount?: number;
    line_discount_value?: number;
  }>;
  payments?: Array<{
    method: string;
    amount: number;
  }>;
};

export type ManualSaleRead = {
  id: number;
  sale_number?: number | null;
  document_number?: string | null;
  total: number;
  status?: string;
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

export type InventoryMovementReason =
  | "sale"
  | "purchase"
  | "adjustment"
  | "count"
  | "loss"
  | "damage"
  | "transfer_in"
  | "transfer_out";

export async function fetchInventoryProducts(
  token: string,
  options?: {
    skip?: number;
    limit?: number;
    search?: string;
    group?: string;
    stock?: "all" | "positive" | "zero" | "negative";
    status?: "all" | "ok" | "low" | "critical" | "negative";
    sort?:
      | "name_asc"
      | "stock_asc"
      | "stock_desc"
      | "sku_asc"
      | "sku_desc"
      | "cost_stock_asc"
      | "cost_stock_desc"
      | "price_stock_asc"
      | "price_stock_desc";
  }
): Promise<InventoryProductPage> {
  const apiBase = getApiBase();
  const params = new URLSearchParams();
  if (options?.skip) params.set("skip", String(options.skip));
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.search) params.set("search", options.search);
  if (options?.group) params.set("group", options.group);
  if (options?.stock && options.stock !== "all") params.set("stock", options.stock);
  if (options?.status && options.status !== "all") params.set("status", options.status);
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

export async function fetchPosCustomers(
  token: string,
  options?: { search?: string; skip?: number; limit?: number; include_inactive?: boolean }
): Promise<PosCustomerRead[]> {
  const apiBase = getApiBase();
  const params = new URLSearchParams();
  if (options?.search) params.set("search", options.search);
  if (options?.skip) params.set("skip", String(options.skip));
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.include_inactive) params.set("include_inactive", "true");
  const query = params.toString();
  const res = await fetch(`${apiBase}/pos/customers${query ? `?${query}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as PosCustomerRead[];
}

export async function createPosCustomer(
  token: string,
  payload: {
    name: string;
    phone?: string;
    email?: string;
    tax_id?: string;
    address?: string;
  }
): Promise<PosCustomerRead> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/pos/customers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as PosCustomerRead;
}

export async function createManualSale(
  token: string,
  payload: ManualSaleCreatePayload
): Promise<ManualSaleRead> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/pos/sales`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as ManualSaleRead;
}

export async function fetchInventoryMovements(
  token: string,
  options?: { skip?: number; limit?: number }
): Promise<InventoryMovementRecord[]> {
  const apiBase = getApiBase();
  const params = new URLSearchParams();
  if (options?.skip) params.set("skip", String(options.skip));
  if (options?.limit) params.set("limit", String(options.limit));
  const query = params.toString();
  const res = await fetch(`${apiBase}/inventory/movements${query ? `?${query}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as InventoryMovementRecord[];
}

export type InventoryLatestEntryRecord = {
  id: string;
  source: "app" | "manual";
  product_id: number;
  product_name: string;
  sku?: string | null;
  qty_delta: number;
  reason?: InventoryMovementReason | null;
  reference_type?: string | null;
  reference_id?: number | null;
  lot_id?: number | null;
  lot_number?: string | null;
  created_at: string;
};

export type InventoryRecountStatus =
  | "draft"
  | "counting"
  | "closed"
  | "applied"
  | "cancelled";

export type InventoryRecountScope = "all" | "group";
export type InventoryRecountMode = "blind" | "visible";

export type InventoryRecountSummary = {
  total_lines: number;
  counted_lines: number;
  pending_lines: number;
  difference_lines: number;
  total_system_qty: number;
  total_counted_qty: number;
  total_diff_qty: number;
};

export type InventoryRecountRecord = {
  id: number;
  code: string;
  status: InventoryRecountStatus;
  source: "web" | "app";
  scope_type: InventoryRecountScope;
  scope_value?: string | null;
  count_mode: InventoryRecountMode;
  title?: string | null;
  notes?: string | null;
  created_by_user_id?: number | null;
  created_by_user_name?: string | null;
  closed_by_user_id?: number | null;
  closed_by_user_name?: string | null;
  applied_by_user_id?: number | null;
  applied_by_user_name?: string | null;
  created_at: string;
  started_at?: string | null;
  closed_at?: string | null;
  applied_at?: string | null;
  cancelled_at?: string | null;
  summary: InventoryRecountSummary;
};

export type InventoryRecountLine = {
  id: number;
  product_id: number;
  product_name: string;
  sku?: string | null;
  barcode?: string | null;
  group_name?: string | null;
  system_qty: number;
  counted_qty?: number | null;
  diff_qty?: number | null;
  notes?: string | null;
  counted_by_user_id?: number | null;
  counted_at?: string | null;
};

export type InventoryRecountPage = {
  items: InventoryRecountRecord[];
  total: number;
  skip: number;
  limit: number;
};

export type InventoryRecountDetail = {
  recount: InventoryRecountRecord;
  lines: InventoryRecountLine[];
};

export async function fetchInventoryLatestEntries(
  token: string,
  options?: { source?: "all" | "app" | "manual"; limit?: number }
): Promise<InventoryLatestEntryRecord[]> {
  const apiBase = getApiBase();
  const params = new URLSearchParams();
  if (options?.source) params.set("source", options.source);
  if (options?.limit) params.set("limit", String(options.limit));
  const query = params.toString();
  const res = await fetch(
    `${apiBase}/inventory/latest-entries${query ? `?${query}` : ""}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as InventoryLatestEntryRecord[];
}

export async function listInventoryRecounts(
  token: string,
  options?: {
    status?: InventoryRecountStatus;
    source?: "web" | "app";
    skip?: number;
    limit?: number;
  }
): Promise<InventoryRecountPage> {
  const apiBase = getApiBase();
  const params = new URLSearchParams();
  if (options?.status) params.set("status", options.status);
  if (options?.source) params.set("source", options.source);
  if (options?.skip != null) params.set("skip", String(options.skip));
  if (options?.limit != null) params.set("limit", String(options.limit));
  const query = params.toString();
  const res = await fetch(`${apiBase}/inventory/recounts${query ? `?${query}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as InventoryRecountPage;
}

export async function createInventoryRecount(
  token: string,
  payload: {
    source?: "web" | "app";
    title?: string;
    scope_type: InventoryRecountScope;
    scope_value?: string;
    count_mode?: InventoryRecountMode;
    notes?: string;
  }
): Promise<InventoryRecountRecord> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/inventory/recounts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as InventoryRecountRecord;
}

export async function getInventoryRecountDetail(
  token: string,
  recountId: number,
  options?: { q?: string; counted_only?: boolean; skip?: number; limit?: number }
): Promise<InventoryRecountDetail> {
  const apiBase = getApiBase();
  const params = new URLSearchParams();
  if (options?.q) params.set("q", options.q);
  if (options?.counted_only) params.set("counted_only", "true");
  if (options?.skip != null) params.set("skip", String(options.skip));
  if (options?.limit != null) params.set("limit", String(options.limit));
  const query = params.toString();
  const res = await fetch(
    `${apiBase}/inventory/recounts/${recountId}${query ? `?${query}` : ""}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(apiErrorMessage(detail, res.status));
  }
  return (await res.json()) as InventoryRecountDetail;
}

export async function upsertInventoryRecountLine(
  token: string,
  recountId: number,
  payload: {
    product_id: number;
    counted_qty: number;
    notes?: string;
  }
): Promise<InventoryRecountLine> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/inventory/recounts/${recountId}/lines`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as InventoryRecountLine;
}

export async function closeInventoryRecount(
  token: string,
  recountId: number
): Promise<InventoryRecountRecord> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/inventory/recounts/${recountId}/close`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as InventoryRecountRecord;
}

export async function cancelInventoryRecount(
  token: string,
  recountId: number
): Promise<InventoryRecountRecord> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/inventory/recounts/${recountId}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(apiErrorMessage(detail, res.status));
  }
  return (await res.json()) as InventoryRecountRecord;
}

export async function applyInventoryRecount(
  token: string,
  recountId: number
): Promise<InventoryRecountRecord> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/inventory/recounts/${recountId}/apply`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as InventoryRecountRecord;
}

export async function createInventoryMovement(
  token: string,
  payload: {
    product_id: number;
    qty_delta: number;
    reason: InventoryMovementReason;
    notes?: string;
    reference_type?: string;
    reference_id?: number;
  }
): Promise<InventoryMovementRecord> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/inventory/movements`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as InventoryMovementRecord;
}

export async function exportInventoryProducts(
  token: string,
  options?: {
    search?: string;
    group?: string;
    stock?: "all" | "positive" | "zero" | "negative";
    status?: "all" | "ok" | "low" | "critical" | "negative";
    sort?:
      | "name_asc"
      | "stock_asc"
      | "stock_desc"
      | "sku_asc"
      | "sku_desc"
      | "cost_stock_asc"
      | "cost_stock_desc"
      | "price_stock_asc"
      | "price_stock_desc";
  }
): Promise<Blob> {
  const apiBase = getApiBase();
  const params = new URLSearchParams();
  if (options?.search) params.set("search", options.search);
  if (options?.group) params.set("group", options.group);
  if (options?.stock && options.stock !== "all") params.set("stock", options.stock);
  if (options?.status && options.status !== "all") params.set("status", options.status);
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

export async function exportInventoryProductsPdf(
  token: string,
  options?: {
    search?: string;
    group?: string;
    stock?: "all" | "positive" | "zero" | "negative";
    status?: "all" | "ok" | "low" | "critical" | "negative";
    sort?:
      | "name_asc"
      | "stock_asc"
      | "stock_desc"
      | "sku_asc"
      | "sku_desc"
      | "cost_stock_asc"
      | "cost_stock_desc"
      | "price_stock_asc"
      | "price_stock_desc";
  }
): Promise<Blob> {
  const apiBase = getApiBase();
  const params = new URLSearchParams();
  if (options?.search) params.set("search", options.search);
  if (options?.group) params.set("group", options.group);
  if (options?.stock && options.stock !== "all") params.set("stock", options.stock);
  if (options?.status && options.status !== "all") params.set("status", options.status);
  if (options?.sort) params.set("sort", options.sort);
  const query = params.toString();
  const res = await fetch(
    `${apiBase}/inventory/products/export/pdf${query ? `?${query}` : ""}`,
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
  reference_label?: string | null;
  created_at: string;
};

export type InventoryProductHistory = {
  product_id: number;
  product_name: string;
  unit_cost: number;
  unit_price: number;
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

export type ReceivingPurchaseType = "invoice" | "cash";
export type ReceivingProductGroupOption = {
  path: string;
  display_name: string;
  parent_path?: string | null;
};

export type ReceivingDocumentRow = {
  id: number;
  lot_number: string;
  status: "open" | "closed" | "cancelled";
  purchase_type: ReceivingPurchaseType;
  origin_name: string;
  lines_count: number;
  units_total: number;
  created_at: string;
  closed_at?: string | null;
  closed_by_user_name?: string | null;
  supplier_name?: string | null;
  invoice_reference?: string | null;
  notes?: string | null;
  support_file_name?: string | null;
  support_file_url?: string | null;
  support_file_size?: number | null;
};

export type ReceivingDocumentPage = {
  items: ReceivingDocumentRow[];
  total: number;
  skip: number;
  limit: number;
};

export type ReceivingLotItem = {
  id: number;
  lot_id: number;
  product_id: number;
  product_name_snapshot: string;
  sku_snapshot?: string | null;
  barcode_snapshot?: string | null;
  label_format_snapshot?: string | null;
  qty_received: number;
  unit_cost_snapshot: number;
  unit_price_snapshot: number;
  labels_printed_qty?: number;
  is_new_product: boolean;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type ReceivingLotRead = {
  id: number;
  lot_number: string;
  status: "open" | "closed" | "cancelled";
  purchase_type: ReceivingPurchaseType;
  origin_name: string;
  source_reference?: string | null;
  supplier_name?: string | null;
  invoice_reference?: string | null;
  notes?: string | null;
  created_by_user_id?: number | null;
  created_by_user_name?: string | null;
  closed_by_user_id?: number | null;
  closed_by_user_name?: string | null;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
  support_file_name?: string | null;
  support_file_url?: string | null;
  support_file_size?: number | null;
};

export type ReceivingLotDetail = {
  lot: ReceivingLotRead;
  items: ReceivingLotItem[];
  labels_summary: {
    pending: number;
    printed: number;
    error: number;
  };
  warnings: Array<{ code: string; message: string }>;
};

export type ReceivingLotPage = {
  items: ReceivingLotRead[];
  total: number;
  skip: number;
  limit: number;
};

export type ManualMovementDocumentKind =
  | "salida_manual"
  | "venta_manual"
  | "ajuste"
  | "perdida_dano";
export type ManualMovementDocumentStatus = "open" | "closed" | "cancelled";

export type ManualMovementDocumentLine = {
  id: number;
  document_id: number;
  product_id: number;
  product_name_snapshot: string;
  sku_snapshot?: string | null;
  barcode_snapshot?: string | null;
  qty: number;
  unit_cost_snapshot?: number | null;
  unit_price_snapshot?: number | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type ManualMovementDocumentRead = {
  id: number;
  document_number: string;
  kind: ManualMovementDocumentKind;
  status: ManualMovementDocumentStatus;
  origin_name: string;
  header: Record<string, unknown>;
  notes?: string | null;
  external_reference_type?: string | null;
  external_reference_id?: number | null;
  created_by_user_id?: number | null;
  created_by_user_name?: string | null;
  closed_by_user_id?: number | null;
  closed_by_user_name?: string | null;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
  lines_count: number;
  units_total: number;
};

export type ManualMovementDocumentDetail = {
  document: ManualMovementDocumentRead;
  lines: ManualMovementDocumentLine[];
};

export type ManualMovementDocumentPage = {
  items: ManualMovementDocumentRead[];
  total: number;
  skip: number;
  limit: number;
};

export async function fetchReceivingDocuments(
  token: string,
  options?: {
    skip?: number;
    limit?: number;
    date_from?: string;
    date_to?: string;
  }
): Promise<ReceivingDocumentPage> {
  const apiBase = getApiBase();
  const params = new URLSearchParams();
  if (options?.skip) params.set("skip", String(options.skip));
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.date_from) params.set("date_from", options.date_from);
  if (options?.date_to) params.set("date_to", options.date_to);
  const query = params.toString();
  const res = await fetch(`${apiBase}/receiving/documents${query ? `?${query}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as ReceivingDocumentPage;
}

export async function fetchReceivingLots(
  token: string,
  options?: {
    status?: "open" | "closed" | "cancelled";
    skip?: number;
    limit?: number;
  }
): Promise<ReceivingLotPage> {
  const apiBase = getApiBase();
  const params = new URLSearchParams();
  if (options?.status) params.set("status", options.status);
  if (options?.skip) params.set("skip", String(options.skip));
  if (options?.limit) params.set("limit", String(options.limit));
  const query = params.toString();
  const res = await fetch(`${apiBase}/receiving/lots${query ? `?${query}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as ReceivingLotPage;
}

export async function fetchReceivingProductGroups(
  token: string
): Promise<ReceivingProductGroupOption[]> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/receiving/product-groups`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as ReceivingProductGroupOption[];
}

export async function fetchReceivingLotDetail(
  token: string,
  lotId: number
): Promise<ReceivingLotDetail> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/receiving/lots/${lotId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as ReceivingLotDetail;
}

export async function markReceivingLotItemLabelsPrinted(
  token: string,
  lotId: number,
  itemId: number,
  copies: number
): Promise<ReceivingLotItem> {
  const apiBase = getApiBase();
  const params = new URLSearchParams();
  params.set("copies", String(Math.max(1, Math.round(Number(copies) || 1))));
  const res = await fetch(
    `${apiBase}/receiving/lots/${lotId}/items/${itemId}/labels/mark-printed?${params.toString()}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as ReceivingLotItem;
}

export async function downloadReceivingSupportFile(
  token: string,
  lotId: number
): Promise<Blob> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/receiving/lots/${lotId}/support-file`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return await res.blob();
}

export async function createReceivingLot(
  token: string,
  payload: {
    purchase_type: ReceivingPurchaseType;
    origin_name: string;
    source_reference?: string;
    supplier_name?: string;
    invoice_reference?: string;
    notes?: string;
  }
): Promise<ReceivingLotRead> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/receiving/lots`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as ReceivingLotRead;
}

export async function updateReceivingLot(
  token: string,
  lotId: number,
  payload: {
    purchase_type: ReceivingPurchaseType;
    source_reference?: string;
    supplier_name?: string;
    invoice_reference?: string;
    notes?: string;
  }
): Promise<ReceivingLotRead> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/receiving/lots/${lotId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as ReceivingLotRead;
}

export async function addReceivingLotItem(
  token: string,
  lotId: number,
  payload: {
    product_id: number;
    qty_received: number;
    unit_cost?: number;
    notes?: string;
  }
): Promise<ReceivingLotItem> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/receiving/lots/${lotId}/items`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as ReceivingLotItem;
}

export async function updateReceivingLotItem(
  token: string,
  lotId: number,
  itemId: number,
  payload: {
    qty_received: number;
    unit_cost?: number;
    notes?: string;
  }
): Promise<ReceivingLotItem> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/receiving/lots/${lotId}/items/${itemId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as ReceivingLotItem;
}

export async function deleteReceivingLotItem(
  token: string,
  lotId: number,
  itemId: number
): Promise<void> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/receiving/lots/${lotId}/items/${itemId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
}

export async function closeReceivingLot(
  token: string,
  lotId: number
): Promise<ReceivingLotRead> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/receiving/lots/${lotId}/close`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as ReceivingLotRead;
}

export async function cancelReceivingLot(
  token: string,
  lotId: number
): Promise<ReceivingLotRead> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/receiving/lots/${lotId}/cancel`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as ReceivingLotRead;
}

export async function uploadReceivingLotSupportFile(
  token: string,
  lotId: number,
  file: File
): Promise<ReceivingLotRead> {
  const apiBase = getApiBase();
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${apiBase}/receiving/lots/${lotId}/support-file`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as ReceivingLotRead;
}

export async function createManualMovementDocument(
  token: string,
  payload: {
    kind: ManualMovementDocumentKind;
    origin_name?: string;
    header?: Record<string, unknown>;
    notes?: string;
  }
): Promise<ManualMovementDocumentRead> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/manual-movements/documents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as ManualMovementDocumentRead;
}

export async function fetchManualMovementDocuments(
  token: string,
  options?: {
    status?: ManualMovementDocumentStatus;
    kind?: ManualMovementDocumentKind;
    skip?: number;
    limit?: number;
  }
): Promise<ManualMovementDocumentPage> {
  const apiBase = getApiBase();
  const params = new URLSearchParams();
  if (options?.status) params.set("status", options.status);
  if (options?.kind) params.set("kind", options.kind);
  if (options?.skip) params.set("skip", String(options.skip));
  if (options?.limit) params.set("limit", String(options.limit));
  const query = params.toString();
  const res = await fetch(
    `${apiBase}/manual-movements/documents${query ? `?${query}` : ""}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as ManualMovementDocumentPage;
}

export async function fetchManualMovementDocumentDetail(
  token: string,
  documentId: number
): Promise<ManualMovementDocumentDetail> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/manual-movements/documents/${documentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as ManualMovementDocumentDetail;
}

export async function updateManualMovementDocumentHeader(
  token: string,
  documentId: number,
  payload: {
    header: Record<string, unknown>;
    notes?: string;
  }
): Promise<ManualMovementDocumentRead> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/manual-movements/documents/${documentId}/header`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as ManualMovementDocumentRead;
}

export async function replaceManualMovementDocumentLines(
  token: string,
  documentId: number,
  payload: {
    lines: Array<{
      product_id: number;
      qty: number;
      unit_cost?: number;
      unit_price?: number;
      notes?: string;
    }>;
  }
): Promise<ManualMovementDocumentDetail> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/manual-movements/documents/${documentId}/lines`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as ManualMovementDocumentDetail;
}

export async function closeManualMovementDocument(
  token: string,
  documentId: number,
  payload?: {
    external_reference_type?: string;
    external_reference_id?: number;
  }
): Promise<ManualMovementDocumentRead> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/manual-movements/documents/${documentId}/close`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload ?? {}),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as ManualMovementDocumentRead;
}

export async function cancelManualMovementDocument(
  token: string,
  documentId: number
): Promise<ManualMovementDocumentRead> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/manual-movements/documents/${documentId}/cancel`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as ManualMovementDocumentRead;
}

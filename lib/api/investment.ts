import { getApiBase } from "@/lib/api/base";

export type InvestmentSummary = {
  total_products: number;
  active_products: number;
  stock_units: number;
  stock_cost_value: number;
  stock_sale_value: number;
};

export type InvestmentRecentActivity = {
  recent_sales: Array<{
    sale_id: number;
    sale_document_number?: string | null;
    sold_at: string;
    product_id: number;
    product_name: string;
    quantity: number;
    unit_price: number;
    gross_line_total: number;
    line_discount_value: number;
    discount_percent: number;
    line_cost_total: number;
    net_total: number;
    pos_name?: string | null;
    seller_name?: string | null;
  }>;
  recent_movements: Array<{
    movement_id: number;
    product_id: number;
    product_name: string;
    qty_delta: number;
    reason: string;
    notes?: string | null;
    created_at: string;
  }>;
};

export type InvestmentSaleLinePage = {
  items: Array<{
    sale_id: number;
    sale_document_number?: string | null;
    sold_at: string;
    product_id: number;
    product_name: string;
    quantity: number;
    unit_price: number;
    gross_line_total: number;
    line_discount_value: number;
    discount_percent: number;
    line_cost_total: number;
    net_total: number;
    pos_name?: string | null;
    seller_name?: string | null;
  }>;
  total: number;
  skip: number;
  limit: number;
  total_quantity: number;
  total_discount: number;
  total_net: number;
};

export type InvestmentProduct = {
  product_id: number;
  product_name: string;
  sku?: string | null;
  group_name?: string | null;
  qty_on_hand: number;
  status: "ok" | "low" | "critical";
  cost: number;
  price: number;
  last_movement_at?: string | null;
};

export type InvestmentParticipant = {
  id: number;
  user_id?: number | null;
  display_name: string;
  share_percent: number;
  profit_share_percent: number;
  capital_share_percent: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type InvestmentCutAllocation = {
  participant_id: number;
  participant_name: string;
  share_percent: number;
  profit_share_percent: number;
  capital_share_percent: number;
  profit_amount: number;
  capital_amount: number;
  amount_due: number;
};

export type InvestmentCut = {
  id: number;
  period_start: string;
  period_end: string;
  gross_sales: number;
  collected_sales: number;
  cogs: number;
  profit_base: number;
  notes?: string | null;
  reconciled: boolean;
  reconciled_at?: string | null;
  reconciled_by_user_id?: number | null;
  created_at: string;
  allocations: InvestmentCutAllocation[];
};

export type InvestmentPayout = {
  id: number;
  participant_id: number;
  participant_name: string;
  cut_id?: number | null;
  amount: number;
  paid_at: string;
  method?: string | null;
  reference?: string | null;
  notes?: string | null;
  created_at: string;
};

export type InvestmentLedger = {
  rows: Array<{
    participant_id: number;
    participant_name: string;
    due_total: number;
    paid_total: number;
    balance: number;
  }>;
  due_total: number;
  paid_total: number;
  balance_total: number;
};

export async function fetchInvestmentSummary(token: string): Promise<InvestmentSummary> {
  const res = await fetch(`${getApiBase()}/investment/summary`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as InvestmentSummary;
}

export async function fetchInvestmentRecentActivity(
  token: string,
  options?: { limit_sales?: number; limit_movements?: number }
): Promise<InvestmentRecentActivity> {
  const params = new URLSearchParams();
  if (options?.limit_sales) params.set("limit_sales", String(options.limit_sales));
  if (options?.limit_movements) params.set("limit_movements", String(options.limit_movements));
  const query = params.toString();
  const res = await fetch(`${getApiBase()}/investment/recent-activity${query ? `?${query}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as InvestmentRecentActivity;
}

export async function fetchInvestmentParticipants(
  token: string
): Promise<InvestmentParticipant[]> {
  const res = await fetch(`${getApiBase()}/investment/participants`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as InvestmentParticipant[];
}

export async function replaceInvestmentParticipants(
  token: string,
  items: Array<{
    user_id?: number | null;
    display_name: string;
    share_percent?: number;
    profit_share_percent?: number;
    capital_share_percent?: number;
    is_active: boolean;
  }>
): Promise<InvestmentParticipant[]> {
  const res = await fetch(`${getApiBase()}/investment/participants`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ items }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as InvestmentParticipant[];
}

export async function previewInvestmentCut(
  token: string,
  payload: { period_start: string; period_end: string }
): Promise<InvestmentCut> {
  const res = await fetch(`${getApiBase()}/investment/cuts/preview`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as InvestmentCut;
}

export async function createInvestmentCut(
  token: string,
  payload: { period_start: string; period_end: string; notes?: string }
): Promise<InvestmentCut> {
  const res = await fetch(`${getApiBase()}/investment/cuts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as InvestmentCut;
}

export async function fetchInvestmentCuts(token: string): Promise<InvestmentCut[]> {
  const res = await fetch(`${getApiBase()}/investment/cuts`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as InvestmentCut[];
}

export async function reconcileInvestmentCut(
  token: string,
  cutId: number
): Promise<InvestmentCut> {
  const res = await fetch(`${getApiBase()}/investment/cuts/${cutId}/reconcile`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as InvestmentCut;
}

export async function createInvestmentPayout(
  token: string,
  payload: {
    participant_id: number;
    cut_id?: number | null;
    amount: number;
    paid_at?: string;
    method?: string;
    reference?: string;
    notes?: string;
  }
): Promise<InvestmentPayout> {
  const res = await fetch(`${getApiBase()}/investment/payouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as InvestmentPayout;
}

export async function fetchInvestmentPayouts(token: string): Promise<InvestmentPayout[]> {
  const res = await fetch(`${getApiBase()}/investment/payouts`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as InvestmentPayout[];
}

export async function fetchInvestmentLedger(token: string): Promise<InvestmentLedger> {
  const res = await fetch(`${getApiBase()}/investment/ledger`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as InvestmentLedger;
}

export async function fetchInvestmentProducts(
  token: string,
  options?: { search?: string; skip?: number; limit?: number }
): Promise<InvestmentProduct[]> {
  const params = new URLSearchParams();
  if (options?.search) params.set("search", options.search);
  if (options?.skip) params.set("skip", String(options.skip));
  if (options?.limit) params.set("limit", String(options.limit));
  const query = params.toString();
  const res = await fetch(
    `${getApiBase()}/investment/products${query ? `?${query}` : ""}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    }
  );
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as InvestmentProduct[];
}

export async function removeInvestmentProduct(
  token: string,
  productId: number
): Promise<void> {
  const res = await fetch(`${getApiBase()}/investment/products/${productId}/remove`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
}

export async function fetchInvestmentSalesLines(
  token: string,
  options?: {
    period_start?: string;
    period_end?: string;
    search?: string;
    skip?: number;
    limit?: number;
  }
): Promise<InvestmentSaleLinePage> {
  const params = new URLSearchParams();
  if (options?.period_start) params.set("period_start", options.period_start);
  if (options?.period_end) params.set("period_end", options.period_end);
  if (options?.search) params.set("search", options.search);
  if (typeof options?.skip === "number") params.set("skip", String(options.skip));
  if (typeof options?.limit === "number") params.set("limit", String(options.limit));
  const query = params.toString();
  const res = await fetch(`${getApiBase()}/investment/sales-lines${query ? `?${query}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as InvestmentSaleLinePage;
}

export async function exportInvestmentSalesLines(
  token: string,
  format: "pdf" | "xlsx",
  options?: {
    period_start?: string;
    period_end?: string;
    search?: string;
  }
): Promise<Blob> {
  const params = new URLSearchParams();
  if (options?.period_start) params.set("period_start", options.period_start);
  if (options?.period_end) params.set("period_end", options.period_end);
  if (options?.search) params.set("search", options.search);
  const query = params.toString();
  const res = await fetch(
    `${getApiBase()}/investment/sales-lines/export/${format}${query ? `?${query}` : ""}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    }
  );
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return await res.blob();
}

export async function exportInvestmentPayouts(
  token: string,
  format: "pdf" | "xlsx",
  options?: { period_start?: string; period_end?: string }
): Promise<Blob> {
  const params = new URLSearchParams();
  if (options?.period_start) params.set("period_start", options.period_start);
  if (options?.period_end) params.set("period_end", options.period_end);
  const query = params.toString();
  const res = await fetch(
    `${getApiBase()}/investment/payouts/export/${format}${query ? `?${query}` : ""}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    }
  );
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return await res.blob();
}

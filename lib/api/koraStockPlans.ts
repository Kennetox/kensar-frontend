import { getApiBase } from "@/lib/api/base";

export type KoraStockPlanItem = {
  id: number;
  product_id: number;
  product_name: string;
  sku?: string | null;
  barcode?: string | null;
  group_name?: string | null;
  system_qty: number;
  unit_cost: number;
  unit_price: number;
  cost_impact: number;
  sale_impact: number;
  units_sold_lookback: number;
  web_published: boolean;
  priority_rank: number;
  priority_score: number;
  reasons: string[];
  last_sale_at?: string | null;
  last_movement_at?: string | null;
  last_recount_at?: string | null;
};

export type KoraStockPlanContext = {
  scheduled_people?: number | null;
  scheduled_names: string[];
  schedule_status?: "published" | "draft" | null;
  reserved_for_sales: number;
  reserved_for_receiving: number;
  available_people?: number | null;
  open_receiving_count: number;
  open_receiving_codes: string[];
  sales_count_30m: number;
  sales_total_30m: number;
  workload_state: "quiet" | "normal" | "busy" | "unknown";
  automatic_plan_allowed: boolean;
  automatic_reason: string;
  presence_basis: "published_schedule" | "configured_schedule";
};

export type KoraStockPlan = {
  id: number;
  code: string;
  status: "ready" | "converted" | "completed" | "expired" | "cancelled";
  trigger: "manual" | "automatic";
  title: string;
  group_name?: string | null;
  requested_count: number;
  lookback_days: number;
  negative_sku_count: number;
  selected_count: number;
  total_negative_units: number;
  total_cost_impact: number;
  total_sale_impact: number;
  workload_state: "quiet" | "normal" | "busy" | "unknown";
  converted_recount_id?: number | null;
  created_at: string;
  expires_at?: string | null;
  converted_at?: string | null;
  completed_at?: string | null;
  context: KoraStockPlanContext;
  items: KoraStockPlanItem[];
};

export type KoraStockPlanResponse = {
  generated_at: string;
  source: "stock-sanitization-v1";
  state: "ready" | "existing" | "not_eligible" | "no_candidates" | "none";
  message: string;
  plan?: KoraStockPlan | null;
};

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
  }
  return `Error ${status}`;
}
async function request<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorMessage(body, response.status));
  return body as T;
}

export async function fetchCurrentKoraStockPlan(token: string): Promise<KoraStockPlanResponse> {
  return request<KoraStockPlanResponse>(token, "/kora/stock-sanitization-plans/current");
}

export async function fetchKoraStockPlan(token: string, planId: number): Promise<KoraStockPlan> {
  return request<KoraStockPlan>(token, `/kora/stock-sanitization-plans/${planId}`);
}

export async function retrieveKoraStockPlan(
  token: string,
  options?: { requestedCount?: number; lookbackDays?: number; groupName?: string | null }
): Promise<KoraStockPlanResponse> {
  return request<KoraStockPlanResponse>(token, "/kora/stock-sanitization-plans/retrieve", {
    method: "POST",
    body: JSON.stringify({
      requested_count: options?.requestedCount ?? 15,
      lookback_days: options?.lookbackDays ?? 30,
      group_name: options?.groupName?.trim() || null,
    }),
  });
}

export function readKoraStockPlanFromNotificationPayload(
  payload?: Record<string, unknown> | null
): KoraStockPlan | null {
  const candidate = payload?.plan;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const plan = candidate as Partial<KoraStockPlan>;
  if (!Number.isFinite(plan.id) || !Array.isArray(plan.items) || typeof plan.title !== "string") {
    return null;
  }
  return plan as KoraStockPlan;
}

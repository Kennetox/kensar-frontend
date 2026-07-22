import { getApiBase } from "@/lib/api/base";

export type KoraWebOpportunityItem = {
  product_id: number;
  product_name: string;
  sku?: string | null;
  group_name?: string | null;
  sale_price: number;
  suggested_category_key: string;
  suggested_category_name: string;
  qty_on_hand: number;
  units_7d: number;
  units_lookback: number;
  revenue_lookback: number;
  last_sale_at?: string | null;
  readiness_score: number;
  missing_web_fields: string[];
  score: number;
  reason: string;
};

export type KoraWebOpportunityResponse = {
  generated_at: string;
  source: "web-opportunities-v2";
  state: "opportunities" | "no_sales" | "no_candidates";
  lookback_days: number;
  analyzed_product_count: number;
  minimum_sale_price: number;
  eligible_group_count: number;
  headline: string;
  items: KoraWebOpportunityItem[];
};

export async function fetchKoraWebOpportunities(
  token: string,
  options?: { lookbackDays?: number; maxItems?: number; signal?: AbortSignal }
): Promise<KoraWebOpportunityResponse> {
  const params = new URLSearchParams({
    lookback_days: String(options?.lookbackDays ?? 30),
    max_items: String(options?.maxItems ?? 8),
  });
  const response = await fetch(`${getApiBase()}/kora/web-opportunities?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: options?.signal,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? `Error ${response.status} al consultar oportunidades web.`);
  }
  return (await response.json()) as KoraWebOpportunityResponse;
}

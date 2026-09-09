import { getApiBase } from "@/lib/api/base";

export type LoyaltyRewardRule = {
  id: number;
  min_purchase: number;
  max_purchase: number | null;
  reward_amount: number;
  minimum_purchase: number;
  validity_days: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type LoyaltyRewardRuleInput = {
  min_purchase: number;
  max_purchase?: number | null;
  reward_amount: number;
  minimum_purchase: number;
  validity_days: number;
  is_active: boolean;
  sort_order: number;
};

export type LoyaltyRedemptionRule = {
  id: number;
  min_purchase: number;
  max_purchase: number | null;
  discount_amount: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type LoyaltyRedemptionRuleInput = {
  min_purchase: number;
  max_purchase?: number | null;
  discount_amount: number;
  is_active: boolean;
  sort_order: number;
};

export type LoyaltyRewardMetrics = {
  issued: number;
  activated: number;
  redeemed: number;
  expired: number;
  cancelled: number;
  scan_count_total: number;
  emitted_count: number;
  issued_amount_total: number;
  redeemed_amount_total: number;
  redeemed_discount_amount_total: number;
  attributed_sales_total: number;
  issued_to_activated_rate: number;
  activated_to_redeemed_rate: number;
};

function headers(token: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function parseError(res: Response): Promise<Error> {
  const body = await res.json().catch(() => null);
  return new Error(typeof body?.detail === "string" ? body.detail : `Error ${res.status}`);
}

export async function fetchLoyaltyRewardRules(token: string): Promise<LoyaltyRewardRule[]> {
  const res = await fetch(`${getApiBase()}/comercio-web/loyalty/rules`, {
    headers: headers(token),
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as LoyaltyRewardRule[];
}

export async function createLoyaltyRewardRule(
  token: string,
  input: LoyaltyRewardRuleInput
): Promise<LoyaltyRewardRule> {
  const res = await fetch(`${getApiBase()}/comercio-web/loyalty/rules`, {
    method: "POST",
    headers: headers(token),
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as LoyaltyRewardRule;
}

export async function updateLoyaltyRewardRule(
  token: string,
  ruleId: number,
  input: Partial<LoyaltyRewardRuleInput>
): Promise<LoyaltyRewardRule> {
  const res = await fetch(`${getApiBase()}/comercio-web/loyalty/rules/${ruleId}`, {
    method: "PUT",
    headers: headers(token),
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as LoyaltyRewardRule;
}

export async function fetchLoyaltyRedemptionRules(token: string): Promise<LoyaltyRedemptionRule[]> {
  const res = await fetch(`${getApiBase()}/comercio-web/loyalty/redemption-rules`, {
    headers: headers(token),
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as LoyaltyRedemptionRule[];
}

export async function createLoyaltyRedemptionRule(
  token: string,
  input: LoyaltyRedemptionRuleInput
): Promise<LoyaltyRedemptionRule> {
  const res = await fetch(`${getApiBase()}/comercio-web/loyalty/redemption-rules`, {
    method: "POST",
    headers: headers(token),
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as LoyaltyRedemptionRule;
}

export async function updateLoyaltyRedemptionRule(
  token: string,
  ruleId: number,
  input: Partial<LoyaltyRedemptionRuleInput>
): Promise<LoyaltyRedemptionRule> {
  const res = await fetch(`${getApiBase()}/comercio-web/loyalty/redemption-rules/${ruleId}`, {
    method: "PUT",
    headers: headers(token),
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as LoyaltyRedemptionRule;
}

export async function fetchLoyaltyRewardMetrics(token: string): Promise<LoyaltyRewardMetrics> {
  const res = await fetch(`${getApiBase()}/comercio-web/loyalty/metrics`, {
    headers: headers(token),
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as LoyaltyRewardMetrics;
}

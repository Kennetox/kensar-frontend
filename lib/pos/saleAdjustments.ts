import { getApiBase } from "@/lib/api/base";

export type SaleAdjustmentRecord = {
  id: number;
  doc_id: number;
  adjustment_type: "payment" | "discount" | "total" | "note";
  reason?: string | null;
  payload?: Record<string, unknown> | null;
  total_delta: number;
  payment_delta: number;
  is_post_closure?: boolean;
  original_closure_id?: number | null;
  created_by_user_name?: string | null;
  created_at: string;
};

export type SaleAdjustmentSummary = {
  records: SaleAdjustmentRecord[];
  totalDelta: number;
  paymentDelta: number;
};

export async function fetchSaleAdjustmentSummary(
  saleId: number,
  authHeaders: HeadersInit
): Promise<SaleAdjustmentSummary> {
  const apiBase = getApiBase();
  const res = await fetch(
    `${apiBase}/pos/documents/adjustments?doc_type=sale&doc_ids=${saleId}`,
    {
      headers: authHeaders,
      credentials: "include",
    }
  );
  if (!res.ok) {
    return { records: [], totalDelta: 0, paymentDelta: 0 };
  }
  const records = (await res.json()) as SaleAdjustmentRecord[];
  return {
    records,
    totalDelta: records.reduce((sum, entry) => sum + Number(entry.total_delta ?? 0), 0),
    paymentDelta: records.reduce((sum, entry) => sum + Number(entry.payment_delta ?? 0), 0),
  };
}

export function distributeSaleAdjustment(
  baseAmount: number,
  baseTotal: number,
  totalDelta: number
): number {
  if (!Number.isFinite(baseAmount) || !Number.isFinite(baseTotal) || baseTotal <= 0) {
    return Math.max(0, Math.round(baseAmount));
  }
  const adjusted = baseAmount + (baseAmount / baseTotal) * totalDelta;
  return Math.max(0, Math.round(adjusted));
}

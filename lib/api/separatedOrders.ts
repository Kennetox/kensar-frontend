"use client";

import { getApiBase } from "@/lib/api/base";

const buildHeaders = (token?: string | null): HeadersInit => {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

export type SeparatedOrderPayment = {
  id: number;
  method: string;
  amount: number;
  paid_at: string;
  reference?: string | null;
  note?: string | null;
  station_id?: string | null;
  closure_id?: number | null;
  status?: string | null;
  voided_at?: string | null;
  voided_by_user_id?: number | null;
  void_reason?: string | null;
  adjustment_reference?: string | null;
};

export type SeparatedOrder = {
  id: number;
  sale_id: number;
  sale_number?: number | null;
  sale_document_number: string;
  barcode?: string | null;
  customer_id?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  total_amount: number;
  initial_payment: number;
  balance: number;
  due_date?: string | null;
  status: string;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  cancelled_at?: string | null;
  recorded_paid_total: number;
  refunded_total: number;
  net_paid_total: number;
  active_total_amount: number;
  reconciled_amount: number;
  waived_amount: number;
  retained_amount: number;
  credit_amount: number;
  pending_refund_amount: number;
  balance_before_resolution?: number | null;
  resolution_type?: string | null;
  resolution_reason?: string | null;
  resolution_reference?: string | null;
  resolution_notes?: string | null;
  resolution_history?: Array<Record<string, unknown>> | null;
  resolved_at?: string | null;
  resolved_by_user_id?: number | null;
  inventory_released_at?: string | null;
  items: {
    id: number;
    product_id: number;
    product_sku?: string | null;
    product_name: string;
    quantity: number;
    unit_price: number;
    total: number;
  }[];
  initial_payments: {
    id: number;
    method: string;
    amount: number;
    paid_at?: string;
    reference?: string | null;
  }[];
  payments: SeparatedOrderPayment[];
  surcharge_amount?: number | null;
  surcharge_label?: string | null;
};

export type SeparatedOrderResolutionPayload = {
  action: "reconcile" | "reschedule" | "cancel" | "refund_pending";
  amount?: number;
  reference?: string;
  reason?: string;
  notes?: string;
  due_date?: string;
  cancellation_outcome?: "cancelled" | "uncollectible" | "voided_error";
  refund_amount?: number;
  refund_method?: string;
  remainder_disposition?: "retained" | "credit" | "pending_refund";
};

export type SeparatedOrderPaymentPayload = {
  method: string;
  amount: number;
  reference?: string;
  note?: string;
  station_id?: string;
  expired_acknowledged?: boolean;
};

type FetchSeparatedParams = {
  barcode?: string;
  saleNumber?: number;
  customer?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  paidFrom?: string;
  paidTo?: string;
  skip?: number;
  limit?: number;
};

export async function fetchSeparatedOrders(
  params: FetchSeparatedParams,
  token?: string | null,
  init?: RequestInit
): Promise<SeparatedOrder[]> {
  const searchParams = new URLSearchParams();
  if (params.barcode) searchParams.set("barcode", params.barcode);
  if (params.saleNumber != null)
    searchParams.set("sale_number", String(params.saleNumber));
  if (params.customer) searchParams.set("customer", params.customer);
  if (params.status) searchParams.set("status", params.status);
  if (params.dateFrom) searchParams.set("date_from", params.dateFrom);
  if (params.dateTo) searchParams.set("date_to", params.dateTo);
  if (params.paidFrom) searchParams.set("paid_from", params.paidFrom);
  if (params.paidTo) searchParams.set("paid_to", params.paidTo);
  if (params.skip != null) searchParams.set("skip", String(params.skip));
  if (params.limit != null) searchParams.set("limit", String(params.limit));
  const query = searchParams.toString();

  const apiBase = getApiBase();
  const res = await fetch(
    `${apiBase}/separated-orders${query ? `?${query}` : ""}`,
    {
      headers: buildHeaders(token),
      credentials: "include",
      ...init,
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail || `Error ${res.status}`);
  }
  return res.json();
}

export async function registerSeparatedOrderPayment(
  orderId: number,
  payload: SeparatedOrderPaymentPayload,
  token?: string | null
): Promise<SeparatedOrder> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/separated-orders/${orderId}/payments`, {
    method: "POST",
    headers: buildHeaders(token),
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail || `Error ${res.status}`);
  }
  return res.json();
}

export async function resolveSeparatedOrder(
  orderId: number,
  payload: SeparatedOrderResolutionPayload,
  token?: string | null
): Promise<SeparatedOrder> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/separated-orders/${orderId}/resolve`, {
    method: "POST",
    headers: buildHeaders(token),
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body?.detail;
    throw new Error(typeof detail === "string" ? detail : `Error ${res.status}`);
  }
  return res.json();
}

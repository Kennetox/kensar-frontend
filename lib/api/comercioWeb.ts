"use client";

import { getApiBase } from "@/lib/api/base";

export type ComercioWebOrderStatus =
  | "draft"
  | "pending_payment"
  | "paid"
  | "processing"
  | "ready"
  | "fulfilled"
  | "cancelled"
  | "payment_failed"
  | "refunded";

export type ComercioWebPaymentStatus =
  | "pending"
  | "approved"
  | "failed"
  | "cancelled"
  | "refunded";

export type ComercioWebFulfillmentStatus =
  | "pending"
  | "processing"
  | "ready"
  | "fulfilled"
  | "cancelled";

export type ComercioWebOrderItem = {
  id: number;
  product_id: number;
  product_name: string;
  product_slug: string;
  product_sku?: string | null;
  image_url?: string | null;
  quantity: number;
  unit_price: number;
  line_discount_value: number;
  line_total: number;
};

export type ComercioWebOrderPayment = {
  id: number;
  provider?: string | null;
  provider_reference?: string | null;
  method?: string | null;
  status: ComercioWebPaymentStatus;
  amount: number;
  currency: string;
  approved_at?: string | null;
  failed_at?: string | null;
  cancelled_at?: string | null;
  created_at: string;
};

export type ComercioWebOrderStatusLog = {
  id: number;
  from_status?: string | null;
  to_status: string;
  note?: string | null;
  actor_type: string;
  actor_user_id?: number | null;
  created_at: string;
};

export type ComercioWebOrder = {
  id: number;
  account_id: number;
  pos_customer_id?: number | null;
  web_order_number?: number | null;
  document_number?: string | null;
  status: ComercioWebOrderStatus;
  payment_status: ComercioWebPaymentStatus;
  fulfillment_status: ComercioWebFulfillmentStatus;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  customer_tax_id?: string | null;
  customer_address?: string | null;
  subtotal: number;
  discount_amount: number;
  shipping_amount: number;
  total: number;
  currency: string;
  notes?: string | null;
  submitted_at?: string | null;
  paid_at?: string | null;
  cancelled_at?: string | null;
  converted_to_sale_at?: string | null;
  sale_id?: number | null;
  sale_document_number?: string | null;
  created_at: string;
  updated_at: string;
  items: ComercioWebOrderItem[];
  payments: ComercioWebOrderPayment[];
  status_logs: ComercioWebOrderStatusLog[];
};

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

export async function fetchComercioWebOrders(
  token: string,
  params?: {
    status?: string;
    payment_status?: string;
    search?: string;
    limit?: number;
  }
): Promise<ComercioWebOrder[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.payment_status) qs.set("payment_status", params.payment_status);
  if (params?.search) qs.set("search", params.search);
  if (params?.limit) qs.set("limit", String(params.limit));
  const query = qs.toString();
  const res = await fetch(
    `${getApiBase()}/comercio-web/orders${query ? `?${query}` : ""}`,
    {
      headers: buildHeaders(token),
      credentials: "include",
    }
  );
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as ComercioWebOrder[];
}

export async function updateComercioWebOrderStatus(
  token: string,
  orderId: number,
  input: { status: ComercioWebOrderStatus; note?: string }
): Promise<ComercioWebOrder> {
  const res = await fetch(`${getApiBase()}/comercio-web/orders/${orderId}/status`, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify(input),
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as ComercioWebOrder;
}

export async function recordComercioWebPayment(
  token: string,
  orderId: number,
  input: {
    method: string;
    amount: number;
    provider?: string;
    provider_reference?: string;
    status?: ComercioWebPaymentStatus;
    note?: string;
    raw_payload?: Record<string, unknown>;
  }
): Promise<ComercioWebOrder> {
  const res = await fetch(`${getApiBase()}/comercio-web/orders/${orderId}/payments`, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify(input),
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as ComercioWebOrder;
}

export async function convertComercioWebOrderToSale(
  token: string,
  orderId: number,
  input?: { note?: string }
): Promise<ComercioWebOrder> {
  const res = await fetch(
    `${getApiBase()}/comercio-web/orders/${orderId}/convert-to-sale`,
    {
      method: "POST",
      headers: buildHeaders(token),
      body: JSON.stringify(input ?? {}),
      credentials: "include",
    }
  );
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as ComercioWebOrder;
}

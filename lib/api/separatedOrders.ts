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
  payments: SeparatedOrderPayment[];
  surcharge_amount?: number | null;
  surcharge_label?: string | null;
};

export type SeparatedOrderPaymentPayload = {
  method: string;
  amount: number;
  reference?: string;
  note?: string;
  station_id?: string;
};

type FetchSeparatedParams = {
  barcode?: string;
  saleNumber?: number;
  customer?: string;
  status?: string;
  skip?: number;
  limit?: number;
};

export async function fetchSeparatedOrders(
  params: FetchSeparatedParams,
  token?: string | null
): Promise<SeparatedOrder[]> {
  const searchParams = new URLSearchParams();
  if (params.barcode) searchParams.set("barcode", params.barcode);
  if (params.saleNumber != null)
    searchParams.set("sale_number", String(params.saleNumber));
  if (params.customer) searchParams.set("customer", params.customer);
  if (params.status) searchParams.set("status", params.status);
  if (params.skip != null) searchParams.set("skip", String(params.skip));
  if (params.limit != null) searchParams.set("limit", String(params.limit));
  const query = searchParams.toString();

  const apiBase = getApiBase();
  const res = await fetch(
    `${apiBase}/separated-orders${query ? `?${query}` : ""}`,
    {
      headers: buildHeaders(token),
      credentials: "include",
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

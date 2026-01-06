"use client";

import { getApiBase } from "@/lib/api/base";

export type PaymentMethodRecord = {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  is_active: boolean;
  allow_change: boolean;
  order_index: number;
  color?: string | null;
  icon?: string | null;
};

export const DEFAULT_PAYMENT_METHODS: PaymentMethodRecord[] = [
  {
    id: -1,
    name: "Efectivo",
    slug: "cash",
    is_active: true,
    allow_change: true,
    order_index: 1,
  },
  {
    id: -2,
    name: "Bancolombia QR / Transferencia",
    slug: "qr",
    is_active: true,
    allow_change: false,
    order_index: 2,
  },
  {
    id: -3,
    name: "Tarjeta Datáfono",
    slug: "card",
    is_active: true,
    allow_change: false,
    order_index: 3,
  },
  {
    id: -4,
    name: "Nequi",
    slug: "nequi",
    is_active: true,
    allow_change: false,
    order_index: 4,
  },
  {
    id: -5,
    name: "Daviplata",
    slug: "daviplata",
    is_active: true,
    allow_change: false,
    order_index: 5,
  },
  {
    id: -6,
    name: "Crédito",
    slug: "credito",
    is_active: true,
    allow_change: false,
    order_index: 6,
  },
  {
    id: -7,
    name: "Separado",
    slug: "separado",
    is_active: true,
    allow_change: false,
    order_index: 7,
  },
];

export async function fetchPaymentMethods(
  token?: string | null
): Promise<PaymentMethodRecord[]> {
  const apiBase = getApiBase();
  const headers = buildHeaders(token);
  const res = await fetch(`${apiBase}/pos/payment-methods`, {
    headers,
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`Error ${res.status}`);
  }
  const data: PaymentMethodRecord[] = await res.json();
  return data;
}

type PaymentMethodPayload = {
  name: string;
  slug: string;
  description?: string;
  allow_change: boolean;
  color?: string;
};

const buildHeaders = (token?: string | null): HeadersInit => {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

export async function createPaymentMethod(
  payload: PaymentMethodPayload,
  token?: string | null
): Promise<PaymentMethodRecord> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/pos/payment-methods`, {
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

export async function updatePaymentMethod(
  id: number,
  payload: PaymentMethodPayload,
  token?: string | null
): Promise<PaymentMethodRecord> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/pos/payment-methods/${id}`, {
    method: "PUT",
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

export async function togglePaymentMethod(
  id: number,
  isActive: boolean,
  token?: string | null
): Promise<PaymentMethodRecord> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/pos/payment-methods/${id}/toggle`, {
    method: "PATCH",
    headers: buildHeaders(token),
    credentials: "include",
    body: JSON.stringify({ is_active: isActive }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail || `Error ${res.status}`);
  }
  return res.json();
}

export async function deletePaymentMethod(
  id: number,
  token?: string | null
): Promise<void> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/pos/payment-methods/${id}`, {
    method: "DELETE",
    headers: buildHeaders(token),
    credentials: "include",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail || `Error ${res.status}`);
  }
}

export async function reorderPaymentMethods(
  ids: Array<{ id: number; order_index: number }>,
  token?: string | null
): Promise<PaymentMethodRecord[]> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/pos/payment-methods/reorder`, {
    method: "PATCH",
    headers: buildHeaders(token),
    credentials: "include",
    body: JSON.stringify({ items: ids }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail || `Error ${res.status}`);
  }
  return res.json();
}

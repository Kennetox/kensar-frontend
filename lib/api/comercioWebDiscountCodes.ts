"use client";

import { getApiBase } from "@/lib/api/base";

export type ComercioWebDiscountCode = {
  id: number;
  code: string;
  discount_percent: number;
  is_active: boolean;
  max_uses: number | null;
  uses_count: number;
  starts_at: string | null;
  ends_at: string | null;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
};

export type ComercioWebDiscountCodePage = {
  items: ComercioWebDiscountCode[];
  total: number;
  skip: number;
  limit: number;
};

export type ComercioWebDiscountCodeCreateInput = {
  code: string;
  discount_percent: number;
  is_active: boolean;
  max_uses?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
};

export type ComercioWebDiscountCodeUpdateInput = Partial<ComercioWebDiscountCodeCreateInput>;

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

export async function fetchComercioWebDiscountCodes(
  token: string,
  params?: {
    q?: string;
    active_only?: boolean;
    skip?: number;
    limit?: number;
  }
): Promise<ComercioWebDiscountCodePage> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (typeof params?.active_only === "boolean") {
    qs.set("active_only", String(params.active_only));
  }
  qs.set("skip", String(params?.skip ?? 0));
  qs.set("limit", String(params?.limit ?? 50));

  const res = await fetch(`${getApiBase()}/comercio-web/catalog/discount-codes?${qs.toString()}`, {
    headers: buildHeaders(token),
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as ComercioWebDiscountCodePage;
}

export async function createComercioWebDiscountCode(
  token: string,
  input: ComercioWebDiscountCodeCreateInput
): Promise<ComercioWebDiscountCode> {
  const res = await fetch(`${getApiBase()}/comercio-web/catalog/discount-codes`, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify(input),
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as ComercioWebDiscountCode;
}

export async function updateComercioWebDiscountCode(
  token: string,
  discountCodeId: number,
  input: ComercioWebDiscountCodeUpdateInput
): Promise<ComercioWebDiscountCode> {
  const res = await fetch(`${getApiBase()}/comercio-web/catalog/discount-codes/${discountCodeId}`, {
    method: "PUT",
    headers: buildHeaders(token),
    body: JSON.stringify(input),
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as ComercioWebDiscountCode;
}

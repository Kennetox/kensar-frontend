"use client";

import { getApiBase } from "@/lib/api/base";

export type PosCashExpenseCategory =
  | "nomina"
  | "almuerzo"
  | "flete"
  | "compra"
  | "otro";

export type PosCashExpenseStatus = "open" | "closed" | "voided";

export type PosCashExpense = {
  id: number;
  tenant_id?: number | null;
  station_id?: string | null;
  pos_name?: string | null;
  closure_id?: number | null;
  category: PosCashExpenseCategory;
  description?: string | null;
  amount: number;
  status: PosCashExpenseStatus;
  created_by_user_id: number;
  created_by_user_name: string;
  voided_by_user_id?: number | null;
  voided_by_user_name?: string | null;
  void_reason?: string | null;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
  voided_at?: string | null;
};

export type PosCashExpenseSummary = {
  expenses: PosCashExpense[];
  total: number;
};

export type PosCashExpensePayload = {
  category: PosCashExpenseCategory;
  amount: number;
  description?: string;
  station_id?: string | null;
  pos_name?: string | null;
};

const buildHeaders = (token: string): HeadersInit => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${token}`,
});

async function parseResponseError(res: Response, fallback: string): Promise<Error> {
  const detail = await res.json().catch(() => null);
  return new Error(detail?.detail ?? fallback);
}

export async function fetchOpenCashExpenses(
  token: string,
  params: { stationId?: string | null; posName?: string | null } = {}
): Promise<PosCashExpenseSummary> {
  const query = new URLSearchParams({ status: "open" });
  if (params.stationId) query.set("station_id", params.stationId);
  if (params.posName) query.set("pos_name", params.posName);
  const res = await fetch(`${getApiBase()}/pos/cash-expenses?${query.toString()}`, {
    headers: buildHeaders(token),
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    throw await parseResponseError(res, `No se pudieron cargar los gastos de caja (${res.status}).`);
  }
  return res.json();
}

export async function createCashExpense(
  token: string,
  payload: PosCashExpensePayload
): Promise<PosCashExpense> {
  const res = await fetch(`${getApiBase()}/pos/cash-expenses`, {
    method: "POST",
    headers: buildHeaders(token),
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw await parseResponseError(res, `No se pudo registrar el gasto (${res.status}).`);
  }
  return res.json();
}

export async function updateCashExpense(
  token: string,
  expenseId: number,
  payload: PosCashExpensePayload
): Promise<PosCashExpense> {
  const res = await fetch(`${getApiBase()}/pos/cash-expenses/${expenseId}`, {
    method: "PATCH",
    headers: buildHeaders(token),
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw await parseResponseError(res, `No se pudo actualizar el gasto (${res.status}).`);
  }
  return res.json();
}

export async function voidCashExpense(
  token: string,
  expenseId: number,
  reason?: string
): Promise<PosCashExpense> {
  const res = await fetch(`${getApiBase()}/pos/cash-expenses/${expenseId}/void`, {
    method: "POST",
    headers: buildHeaders(token),
    credentials: "include",
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    throw await parseResponseError(res, `No se pudo anular el gasto (${res.status}).`);
  }
  return res.json();
}

export async function attachCashExpensesToClosure(
  token: string,
  closureId: number,
  params: { stationId?: string | null; posName?: string | null } = {}
): Promise<PosCashExpenseSummary> {
  const res = await fetch(`${getApiBase()}/pos/closures/${closureId}/cash-expenses/attach`, {
    method: "POST",
    headers: buildHeaders(token),
    credentials: "include",
    body: JSON.stringify({
      station_id: params.stationId ?? undefined,
      pos_name: params.posName ?? undefined,
    }),
  });
  if (!res.ok) {
    throw await parseResponseError(res, `No se pudieron asociar los gastos al cierre (${res.status}).`);
  }
  return res.json();
}

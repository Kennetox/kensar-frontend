"use client";

import { getApiBase } from "@/lib/api/base";

export type WebCheckoutMethod = "card" | "pse" | "nequi";
export type WebCheckoutProvider = "mercadopago" | "wompi";

export type WompiPsePaymentData = {
  user_type: 0 | 1;
  user_legal_id_type: string;
  user_legal_id: string;
  financial_institution_code: string;
  payment_description?: string;
  phone_number?: string;
  reference_one?: string;
  reference_two?: string;
  reference_three?: string;
};

export type WompiNequiPaymentData = {
  phone_number: string;
};

export type WebPaymentCheckoutResult =
  | {
      provider: "mercadopago";
      order_id: number;
      preference_id: string;
      init_point?: string | null;
      sandbox_init_point?: string | null;
      public_key?: string | null;
      order_access_token?: string | null;
    }
  | {
      provider: "wompi";
      order_id: number;
      payment_method: "pse" | "nequi";
      transaction_id: string;
      status: "pending" | "approved" | "failed" | "cancelled" | "refunded";
      reference: string;
      redirect_url?: string | null;
      checkout_url?: string | null;
      async_payment_url?: string | null;
      acceptance_token_permalink?: string | null;
      personal_data_auth_permalink?: string | null;
    };

export type WompiPseFinancialInstitution = {
  financial_institution_code: string;
  financial_institution_name: string;
};

function buildHeaders(token: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function parseError(res: Response): Promise<Error> {
  const body = await res.json().catch(() => null);
  const detail = typeof body?.detail === "string" ? body.detail : `Error ${res.status}`;
  const error = new Error(detail) as Error & { status?: number };
  error.status = res.status;
  return error;
}

export function resolveProviderForCheckoutMethod(method: WebCheckoutMethod): WebCheckoutProvider {
  if (method === "card") return "mercadopago";
  return "wompi";
}

export async function startCheckoutByMethod(
  token: string,
  input: {
    orderId: number;
    method: WebCheckoutMethod;
    checkoutContext?: Record<string, unknown>;
    wompiPseData?: WompiPsePaymentData;
    wompiNequiData?: WompiNequiPaymentData;
    customerEmail?: string;
    customerPhone?: string;
    customerFullName?: string;
  }
): Promise<WebPaymentCheckoutResult> {
  const provider = resolveProviderForCheckoutMethod(input.method);

  if (provider === "mercadopago") {
    const res = await fetch(`${getApiBase()}/web/payments/mercadopago/checkout`, {
      method: "POST",
      headers: buildHeaders(token),
      credentials: "include",
      body: JSON.stringify({
        order_id: input.orderId,
        checkout_context: input.checkoutContext,
      }),
    });
    if (!res.ok) throw await parseError(res);
    return (await res.json()) as WebPaymentCheckoutResult;
  }

  const wompiMethod = input.method as "pse" | "nequi";
  const paymentMethodData =
    wompiMethod === "pse"
      ? input.wompiPseData
      : input.wompiNequiData;

  const res = await fetch(`${getApiBase()}/web/payments/wompi/checkout`, {
    method: "POST",
    headers: buildHeaders(token),
    credentials: "include",
    body: JSON.stringify({
      order_id: input.orderId,
      payment_method: wompiMethod,
      payment_method_data: paymentMethodData ?? {},
      customer_email: input.customerEmail,
      customer_phone: input.customerPhone,
      customer_full_name: input.customerFullName,
      checkout_context: input.checkoutContext,
    }),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as WebPaymentCheckoutResult;
}

export async function fetchWompiPseFinancialInstitutions(
  token: string
): Promise<WompiPseFinancialInstitution[]> {
  const res = await fetch(`${getApiBase()}/web/payments/wompi/pse/financial-institutions`, {
    headers: buildHeaders(token),
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as WompiPseFinancialInstitution[];
}

export async function fetchCheckoutOrderStatus(
  token: string,
  input: {
    orderId: number;
    provider: WebCheckoutProvider;
  }
): Promise<Record<string, unknown>> {
  const providerPath = input.provider === "wompi" ? "wompi" : "mercadopago";
  const res = await fetch(`${getApiBase()}/web/payments/${providerPath}/orders/${input.orderId}/status`, {
    headers: buildHeaders(token),
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as Record<string, unknown>;
}

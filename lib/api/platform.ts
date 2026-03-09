import { TenantModuleCatalogItem } from "@/lib/tenantModules";
import { getApiBase } from "@/lib/api/base";

export type PlatformTenant = {
  id: number;
  slug: string;
  name: string;
  is_active: boolean;
  lifecycle_stage: "demo" | "active" | "inactive" | "suspended" | "archived";
  trial_started_at: string | null;
  trial_ends_at: string | null;
  converted_at: string | null;
  enabled_modules: string[];
  trial_days_remaining: number | null;
  created_at: string;
  updated_at: string;
  module_catalog: TenantModuleCatalogItem[];
  admin_user: {
    id: number;
    name: string;
    email: string;
    phone: string | null;
    status: "Activo" | "Inactivo";
    created_at: string;
  } | null;
  company_details: {
    company_name: string;
    tax_id: string | null;
    address: string | null;
    contact_email: string | null;
    contact_phone: string | null;
  } | null;
};

export type PlatformTenantCreateInput = {
  slug: string;
  name: string;
  admin_name: string;
  admin_email: string;
  admin_password: string;
  admin_phone?: string;
};

type PlatformTenantCreateResponse = {
  tenant: PlatformTenant;
  admin_user: {
    id: number;
    name: string;
    email: string;
    role: string;
    status: string;
  };
  detail: string;
};

export type PlatformTenantRecoveryResponse = {
  detail: string;
  recipient: string;
  expires_in: number;
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

export async function listPlatformTenants(token: string): Promise<PlatformTenant[]> {
  const res = await fetch(`${getApiBase()}/platform/tenants`, {
    headers: buildHeaders(token),
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as PlatformTenant[];
}

export async function createPlatformTenant(
  input: PlatformTenantCreateInput,
  token: string
): Promise<PlatformTenantCreateResponse> {
  const res = await fetch(`${getApiBase()}/platform/tenants`, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify(input),
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as PlatformTenantCreateResponse;
}

export async function updatePlatformTenant(
  tenantId: number,
  input: {
    name?: string;
    is_active?: boolean;
    enabled_modules?: string[];
    lifecycle_stage?: "demo" | "active" | "inactive" | "suspended" | "archived";
  },
  token: string
): Promise<PlatformTenant> {
  const res = await fetch(`${getApiBase()}/platform/tenants/${tenantId}`, {
    method: "PATCH",
    headers: buildHeaders(token),
    body: JSON.stringify(input),
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as PlatformTenant;
}

export async function sendPlatformTenantRecovery(
  tenantId: number,
  token: string
): Promise<PlatformTenantRecoveryResponse> {
  const res = await fetch(`${getApiBase()}/platform/tenants/${tenantId}/admin/recovery`, {
    method: "POST",
    headers: buildHeaders(token),
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as PlatformTenantRecoveryResponse;
}

export async function convertPlatformTenant(
  tenantId: number,
  token: string
): Promise<PlatformTenant> {
  const res = await fetch(`${getApiBase()}/platform/tenants/${tenantId}/convert`, {
    method: "POST",
    headers: buildHeaders(token),
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as PlatformTenant;
}

export async function extendPlatformTenantTrial(
  tenantId: number,
  extraDays: number,
  token: string
): Promise<PlatformTenant> {
  const res = await fetch(`${getApiBase()}/platform/tenants/${tenantId}/extend-trial`, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify({ extra_days: extraDays }),
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as PlatformTenant;
}

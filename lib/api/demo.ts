import { getApiBase } from "@/lib/api/base";

export type DemoStartInput = {
  company_name: string;
  business_type?: string;
  company_phone?: string;
  company_city?: string;
  admin_name: string;
  admin_email: string;
  admin_phone?: string;
  password: string;
};

export type DemoStartResponse = {
  token: string;
  user: {
    id: number;
    name: string;
    email: string;
    role: string;
    phone?: string | null;
    avatar_url?: string | null;
    birth_date?: string | null;
    location?: string | null;
    bio?: string | null;
  };
  tenant?: {
    id: number;
    slug: string;
    name: string;
    lifecycle_stage: "demo" | "active" | "inactive" | "suspended" | "archived";
    trial_started_at?: string | null;
    trial_ends_at?: string | null;
    trial_days_remaining?: number | null;
    enabled_modules?: string[];
  } | null;
  expires_at?: string | null;
  detail: string;
};

export async function startDemo(input: DemoStartInput): Promise<DemoStartResponse> {
  const res = await fetch(`${getApiBase()}/auth/demo/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(
      typeof body?.detail === "string" ? body.detail : `Error ${res.status}`
    );
  }
  return (await res.json()) as DemoStartResponse;
}

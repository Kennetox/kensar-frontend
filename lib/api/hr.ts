import { getApiBase } from "@/lib/api/base";

export type HrEmployeeRecord = {
  id: number;
  name: string;
  email: string;
  role: "Administrador" | "Supervisor" | "Vendedor" | "Auditor";
  status: "Activo" | "Inactivo";
  phone?: string | null;
  position?: string | null;
  notes?: string | null;
  created_at: string;
  invited_at?: string | null;
  accepted_at?: string | null;
};

export async function fetchHrEmployees(
  token: string
): Promise<HrEmployeeRecord[]> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/hr/employees`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as HrEmployeeRecord[];
}

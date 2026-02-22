import { getApiBase } from "@/lib/api/base";

export type SystemRole = "Administrador" | "Supervisor" | "Vendedor" | "Auditor";
export type SystemStatus = "Activo" | "Inactivo";

export type HrEmployeeRecord = {
  id: number;
  name: string;
  email?: string | null;
  status: SystemStatus;
  phone?: string | null;
  position?: string | null;
  notes?: string | null;
  avatar_url?: string | null;
  birth_date?: string | null;
  location?: string | null;
  bio?: string | null;
  payroll_frequency?: "diario" | "semanal" | "mensual" | null;
  payroll_amount?: number | null;
  payroll_currency?: string | null;
  payroll_payment_method?: string | null;
  payroll_day_of_week?: string | null;
  payroll_day_of_month?: number | null;
  payroll_last_paid_at?: string | null;
  payroll_next_due_at?: string | null;
  payroll_reference?: string | null;
  payroll_notes?: string | null;
  created_at: string;
  updated_at: string;
  system_user?: {
    id: number;
    email: string;
    role: SystemRole;
    status: SystemStatus;
  } | null;
};

export type HrEmployeeDocumentRecord = {
  id: number;
  employee_id: number;
  file_name: string;
  file_url: string;
  file_size: number;
  note?: string | null;
  created_at: string;
  source?: "hr" | "profile";
  can_delete?: boolean;
};

export type HrSystemUserOption = {
  id: number;
  name: string;
  email: string;
  role: SystemRole;
  status: SystemStatus;
  employee_id?: number | null;
};

type HrEmployeePayload = Partial<
  Pick<
    HrEmployeeRecord,
    | "name"
    | "email"
    | "status"
    | "phone"
    | "position"
    | "notes"
    | "birth_date"
    | "location"
    | "bio"
    | "payroll_frequency"
    | "payroll_amount"
    | "payroll_currency"
    | "payroll_payment_method"
    | "payroll_day_of_week"
    | "payroll_day_of_month"
    | "payroll_last_paid_at"
    | "payroll_next_due_at"
    | "payroll_reference"
    | "payroll_notes"
  >
>;

async function jsonRequest<T>(
  path: string,
  token: string,
  init?: RequestInit
): Promise<T> {
  const apiBase = getApiBase();
  const headers = new Headers(init?.headers as HeadersInit | undefined);
  headers.set("Authorization", `Bearer ${token}`);
  if (!(init?.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${apiBase}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export async function fetchHrEmployees(token: string): Promise<HrEmployeeRecord[]> {
  return jsonRequest<HrEmployeeRecord[]>("/hr/employees", token);
}

export async function createHrEmployee(
  payload: HrEmployeePayload,
  token: string
): Promise<HrEmployeeRecord> {
  return jsonRequest<HrEmployeeRecord>("/hr/employees", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchHrEmployeeById(
  employeeId: number,
  token: string
): Promise<HrEmployeeRecord> {
  return jsonRequest<HrEmployeeRecord>(`/hr/employees/${employeeId}`, token);
}

export async function updateHrEmployee(
  employeeId: number,
  payload: HrEmployeePayload,
  token: string
): Promise<HrEmployeeRecord> {
  return jsonRequest<HrEmployeeRecord>(`/hr/employees/${employeeId}`, token, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function createSystemUserForEmployee(
  employeeId: number,
  payload: {
    email: string;
    role: SystemRole;
    password?: string;
    pin_plain?: string;
  },
  token: string
): Promise<void> {
  await jsonRequest(`/hr/employees/${employeeId}/system-user`, token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function linkSystemUserToEmployee(
  employeeId: number,
  userId: number,
  token: string
): Promise<void> {
  await jsonRequest(`/hr/employees/${employeeId}/system-user/link`, token, {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  });
}

export async function deactivateSystemUserForEmployee(
  employeeId: number,
  token: string
): Promise<void> {
  await jsonRequest(`/hr/employees/${employeeId}/system-user/deactivate`, token, {
    method: "POST",
  });
}

export async function deleteSystemUserForEmployee(
  employeeId: number,
  token: string
): Promise<void> {
  await jsonRequest(`/hr/employees/${employeeId}/system-user`, token, {
    method: "DELETE",
  });
}

export async function uploadHrEmployeeAvatar(
  employeeId: number,
  file: File,
  token: string
): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append("file", file, file.name);
  return jsonRequest<{ url: string }>(`/hr/employees/${employeeId}/avatar`, token, {
    method: "POST",
    body: formData,
  });
}

export async function clearHrEmployeeAvatar(
  employeeId: number,
  token: string
): Promise<HrEmployeeRecord> {
  return jsonRequest<HrEmployeeRecord>(`/hr/employees/${employeeId}/avatar`, token, {
    method: "DELETE",
  });
}

export async function fetchHrSystemUsers(
  token: string,
  options?: {
    q?: string;
    only_unlinked?: boolean;
  }
): Promise<HrSystemUserOption[]> {
  const search = new URLSearchParams();
  if (options?.q?.trim()) {
    search.set("q", options.q.trim());
  }
  if (typeof options?.only_unlinked === "boolean") {
    search.set("only_unlinked", String(options.only_unlinked));
  }
  const query = search.toString();
  return jsonRequest<HrSystemUserOption[]>(
    `/hr/system-users${query ? `?${query}` : ""}`,
    token
  );
}

export async function fetchHrEmployeeDocuments(
  employeeId: number,
  token: string
): Promise<HrEmployeeDocumentRecord[]> {
  return jsonRequest<HrEmployeeDocumentRecord[]>(
    `/hr/employees/${employeeId}/documents`,
    token
  );
}

export async function uploadHrEmployeeDocument(
  employeeId: number,
  file: File,
  note: string | undefined,
  token: string
): Promise<HrEmployeeDocumentRecord> {
  const formData = new FormData();
  formData.append("file", file, file.name);
  if (note?.trim()) {
    formData.append("note", note.trim());
  }
  return jsonRequest<HrEmployeeDocumentRecord>(
    `/hr/employees/${employeeId}/documents`,
    token,
    {
      method: "POST",
      body: formData,
    }
  );
}

export async function deleteHrEmployeeDocument(
  employeeId: number,
  docId: number,
  source: "hr" | "profile" = "hr",
  token: string
): Promise<void> {
  const query = new URLSearchParams({ source }).toString();
  await jsonRequest<void>(
    `/hr/employees/${employeeId}/documents/${docId}?${query}`,
    token,
    {
      method: "DELETE",
    }
  );
}

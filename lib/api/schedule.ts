import { getApiBase } from "@/lib/api/base";

export type ScheduleStatus = "draft" | "published";

export type ScheduleTemplateRecord = {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  color?: string | null;
  position?: string | null;
  is_active: boolean;
  order_index: number;
  created_at: string;
  updated_at: string;
};

export type ScheduleWeekRecord = {
  id: number;
  week_start: string;
  status: ScheduleStatus;
  notes?: string | null;
  published_at?: string | null;
  published_by_user_id?: number | null;
  created_at: string;
  updated_at: string;
};

export type ScheduleEmployeeRow = {
  id: number;
  name: string;
  status: "Activo" | "Inactivo";
  position?: string | null;
  avatar_url?: string | null;
};

export type ScheduleShiftRecord = {
  id: number;
  week_id: number;
  employee_id: number;
  shift_date: string;
  start_time?: string | null;
  end_time?: string | null;
  break_minutes: number;
  position?: string | null;
  color?: string | null;
  note?: string | null;
  is_time_off: boolean;
  source_template_id?: number | null;
  total_hours: number;
  created_at: string;
  updated_at: string;
};

export type ScheduleDayTotal = {
  shift_date: string;
  total_hours: number;
};

export type ScheduleWeekView = {
  week: ScheduleWeekRecord;
  employees: ScheduleEmployeeRow[];
  shifts: ScheduleShiftRecord[];
  day_totals: ScheduleDayTotal[];
  week_total_hours: number;
};

type ScheduleShiftPayload = {
  week_id?: number;
  week_start?: string;
  employee_id: number;
  shift_date: string;
  start_time?: string | null;
  end_time?: string | null;
  break_minutes?: number;
  position?: string | null;
  color?: string | null;
  note?: string | null;
  is_time_off?: boolean;
  source_template_id?: number | null;
};

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

export async function fetchScheduleWeekView(
  token: string,
  weekStart?: string
): Promise<ScheduleWeekView> {
  const query = weekStart ? `?week_start=${encodeURIComponent(weekStart)}` : "";
  return jsonRequest<ScheduleWeekView>(`/schedule/weeks${query}`, token);
}

export async function fetchScheduleTemplates(
  token: string,
  includeInactive = true
): Promise<ScheduleTemplateRecord[]> {
  return jsonRequest<ScheduleTemplateRecord[]>(
    `/schedule/templates?include_inactive=${includeInactive ? "true" : "false"}`,
    token
  );
}

export async function createScheduleTemplate(
  token: string,
  payload: Omit<ScheduleTemplateRecord, "id" | "created_at" | "updated_at">
): Promise<ScheduleTemplateRecord> {
  return jsonRequest<ScheduleTemplateRecord>("/schedule/templates", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function upsertScheduleShift(
  token: string,
  payload: ScheduleShiftPayload
): Promise<ScheduleShiftRecord> {
  return jsonRequest<ScheduleShiftRecord>("/schedule/shifts", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function patchScheduleShift(
  token: string,
  shiftId: number,
  payload: Partial<ScheduleShiftPayload>
): Promise<ScheduleShiftRecord> {
  return jsonRequest<ScheduleShiftRecord>(`/schedule/shifts/${shiftId}`, token, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteScheduleShift(
  token: string,
  shiftId: number
): Promise<void> {
  await jsonRequest<void>(`/schedule/shifts/${shiftId}`, token, {
    method: "DELETE",
  });
}

export async function publishScheduleWeek(
  token: string,
  weekId: number,
  notes?: string
): Promise<ScheduleWeekRecord> {
  return jsonRequest<ScheduleWeekRecord>(`/schedule/weeks/${weekId}/publish`, token, {
    method: "PUT",
    body: JSON.stringify({ notes: notes ?? null }),
  });
}

function extractFilename(contentDisposition: string | null, fallback: string): string {
  if (!contentDisposition) return fallback;
  const match = /filename=\"?([^\";]+)\"?/i.exec(contentDisposition);
  if (!match?.[1]) return fallback;
  return match[1];
}

export async function downloadScheduleExport(
  token: string,
  weekId: number,
  format: "csv" | "pdf"
): Promise<void> {
  const apiBase = getApiBase();
  const endpoint = format === "pdf" ? "export.pdf" : "export.csv";
  const res = await fetch(`${apiBase}/schedule/weeks/${weekId}/${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  const blob = await res.blob();
  const fallback = `horario.${format}`;
  const filename = extractFilename(res.headers.get("Content-Disposition"), fallback);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

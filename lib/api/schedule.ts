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
  is_time_off?: boolean;
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
  row_color?: string | null;
  birth_date?: string | null;
  order_index?: number;
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

export type ScheduleDayEvent = {
  shift_date: string;
  kind: "holiday" | "birthday" | "event";
  label: string;
  employee_id?: number | null;
  employee_name?: string | null;
};

export type ScheduleWeekView = {
  week: ScheduleWeekRecord;
  employees: ScheduleEmployeeRow[];
  shifts: ScheduleShiftRecord[];
  day_totals: ScheduleDayTotal[];
  day_events: ScheduleDayEvent[];
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
    const errorDetail = detail?.detail;
    const message =
      typeof errorDetail === "string"
        ? errorDetail
        : Array.isArray(errorDetail)
          ? errorDetail
              .map((entry) => {
                if (typeof entry === "string") return entry;
                if (entry?.msg) return String(entry.msg);
                return JSON.stringify(entry);
              })
              .join(" | ")
          : errorDetail
            ? JSON.stringify(errorDetail)
            : `Error ${res.status}`;
    throw new Error(message);
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

export async function patchScheduleTemplate(
  token: string,
  templateId: number,
  payload: Partial<
    Omit<ScheduleTemplateRecord, "id" | "created_at" | "updated_at">
  >
): Promise<ScheduleTemplateRecord> {
  return jsonRequest<ScheduleTemplateRecord>(`/schedule/templates/${templateId}`, token, {
    method: "PATCH",
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

export async function reorderScheduleEmployees(
  token: string,
  employeeIdsInOrder: number[]
): Promise<ScheduleEmployeeRow[]> {
  return jsonRequest<ScheduleEmployeeRow[]>("/hr/employees/reorder-list", token, {
    method: "PATCH",
    body: JSON.stringify({
      items: employeeIdsInOrder.map((id, index) => ({
        id,
        order_index: (index + 1) * 10,
      })),
    }),
  });
}

export async function updateScheduleEmployeeRowColor(
  token: string,
  employeeId: number,
  rowColor: string | null
): Promise<ScheduleEmployeeRow> {
  return jsonRequest<ScheduleEmployeeRow>(`/hr/employees/${employeeId}`, token, {
    method: "PATCH",
    body: JSON.stringify({ row_color: rowColor }),
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

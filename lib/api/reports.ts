import { getApiBase } from "@/lib/api/base";

export type ReportExportPayload = {
  preset_id: string;
  title: string;
  company: {
    name: string;
    address?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  filters: {
    from_date: string;
    to_date: string;
    pos_filter: string;
    method_filter: string;
    seller_filter: string;
  };
  summary: Array<{
    label: string;
    value: string;
  }>;
  table: {
    columns: string[];
    rows: string[][];
    empty_message?: string;
  };
};

export type ReportPdfExportPayload = {
  title?: string;
  document_html: string;
  preset_id?: string;
};

export type ReportFavoritesResponse = {
  preset_ids: string[];
};

export async function exportReportPdf(
  payload: ReportPdfExportPayload,
  token?: string | null
): Promise<Blob> {
  const apiBase = getApiBase();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${apiBase}/reports/export/pdf`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    credentials: "include",
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }

  return await res.blob();
}

export async function fetchReportFavorites(
  token?: string | null
): Promise<string[]> {
  if (!token) return [];
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/reports/favorites`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }

  const json: ReportFavoritesResponse = await res.json();
  if (!Array.isArray(json.preset_ids)) return [];
  return json.preset_ids.filter((id): id is string => typeof id === "string");
}

export async function saveReportFavorites(
  presetIds: string[],
  token?: string | null
): Promise<string[]> {
  if (!token) return [];
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/reports/favorites`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ preset_ids: presetIds }),
    credentials: "include",
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }

  const json: ReportFavoritesResponse = await res.json();
  if (!Array.isArray(json.preset_ids)) return [];
  return json.preset_ids.filter((id): id is string => typeof id === "string");
}

export async function exportReportExcel(
  payload: ReportExportPayload,
  token?: string | null
): Promise<Blob> {
  const apiBase = getApiBase();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${apiBase}/reports/export/xlsx`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    credentials: "include",
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }

  return await res.blob();
}

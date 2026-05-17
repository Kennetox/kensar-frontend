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
  version?: string;
};

export class ReportFavoritesConflictError extends Error {
  constructor(message = "Conflicto de versión en favoritos") {
    super(message);
    this.name = "ReportFavoritesConflictError";
  }
}

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
): Promise<ReportFavoritesResponse> {
  if (!token) return { preset_ids: [], version: "" };
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
  if (!Array.isArray(json.preset_ids)) return { preset_ids: [], version: "" };
  return {
    preset_ids: json.preset_ids.filter((id): id is string => typeof id === "string"),
    version: typeof json.version === "string" ? json.version : "",
  };
}

export async function saveReportFavorites(
  presetIds: string[],
  expectedVersion?: string,
  token?: string | null
): Promise<ReportFavoritesResponse> {
  if (!token) return { preset_ids: [], version: "" };
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/reports/favorites`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      preset_ids: presetIds,
      expected_version: expectedVersion ?? null,
    }),
    credentials: "include",
  });

  if (res.status === 409) {
    const detail = await res.json().catch(() => null);
    throw new ReportFavoritesConflictError(
      detail?.detail?.message ?? detail?.detail ?? "Conflicto de versión en favoritos"
    );
  }

  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }

  const json: ReportFavoritesResponse = await res.json();
  if (!Array.isArray(json.preset_ids)) return { preset_ids: [], version: "" };
  return {
    preset_ids: json.preset_ids.filter((id): id is string => typeof id === "string"),
    version: typeof json.version === "string" ? json.version : "",
  };
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

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

export type ReportProductLastSaleRow = {
  product_id: number;
  last_sale_at: string;
};

export type ReportProductsByTargetRequest = {
  date_from: string;
  date_to: string;
  source: "all" | "metrik" | "aronium";
  mode: "product" | "group";
  result_mode: "detailed" | "grouped";
  product_id?: number | null;
  product_sku?: string;
  product_name?: string;
  group_path?: string;
  group_name?: string;
};

export type ReportProductsByTargetRow = {
  sku: string;
  product: string;
  group: string;
  units: number;
  product_cost?: number | null;
  unit_value: number;
  total_value: number;
  last_sale_at?: string | null;
  sale_at?: string | null;
  document?: string | null;
  pos_name?: string | null;
};

export type ReportProductsByTargetResponse = {
  rows_count: number;
  units: number;
  total_value: number;
  documents: number;
  rows: ReportProductsByTargetRow[];
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

export async function fetchProductsLastSales(
  payload: { sale_ids: number[]; product_ids: number[] },
  token?: string | null
): Promise<ReportProductLastSaleRow[]> {
  if (!token) return [];
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/reports/products/last-sales`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    credentials: "include",
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }

  const json = (await res.json()) as { rows?: ReportProductLastSaleRow[] };
  return Array.isArray(json.rows) ? json.rows : [];
}

export async function fetchProductsByTarget(
  payload: ReportProductsByTargetRequest,
  token?: string | null
): Promise<ReportProductsByTargetResponse> {
  if (!token) {
    return { rows_count: 0, units: 0, total_value: 0, documents: 0, rows: [] };
  }
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/reports/products/by-target`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    credentials: "include",
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }

  const json = (await res.json()) as Partial<ReportProductsByTargetResponse>;
  return {
    rows_count: Number(json.rows_count ?? 0),
    units: Number(json.units ?? 0),
    total_value: Number(json.total_value ?? 0),
    documents: Number(json.documents ?? 0),
    rows: Array.isArray(json.rows) ? (json.rows as ReportProductsByTargetRow[]) : [],
  };
}

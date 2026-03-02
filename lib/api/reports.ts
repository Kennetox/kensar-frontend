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

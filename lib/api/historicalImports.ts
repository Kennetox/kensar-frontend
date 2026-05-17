import { getApiBase } from "@/lib/api/base";

export type LegacyImportBatch = {
  id: number;
  tenant_id?: number | null;
  source_system: string;
  batch_key: string;
  title: string;
  status: string;
  note?: string | null;
  uploaded_sales_path?: string | null;
  uploaded_items_path?: string | null;
  uploaded_payments_path?: string | null;
  uploaded_refunds_path?: string | null;
  processed_at?: string | null;
  published_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type LegacyImportProcessResult = {
  batch: LegacyImportBatch;
  sales_loaded: number;
  items_loaded: number;
  payments_loaded: number;
  warnings: string[];
};

async function readError(res: Response): Promise<string> {
  const detail = await res.json().catch(() => null);
  return detail?.detail ?? `Error ${res.status}`;
}

export async function createLegacyImportBatch(
  payload: {
    title: string;
    source_system: string;
    note?: string;
    batch_key?: string;
  },
  token?: string | null
): Promise<LegacyImportBatch> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/legacy-imports/batches`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as LegacyImportBatch;
}

export async function uploadLegacyImportFile(
  payload: {
    batchId: number;
    fileKind: "sales" | "items" | "payments" | "refunds";
    file: File;
  },
  token?: string | null
): Promise<LegacyImportBatch> {
  const apiBase = getApiBase();
  const form = new FormData();
  form.append("file_kind", payload.fileKind);
  form.append("file", payload.file);
  const res = await fetch(`${apiBase}/legacy-imports/batches/${payload.batchId}/files`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: "include",
    body: form,
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as LegacyImportBatch;
}

export async function processLegacyImportBatch(
  batchId: number,
  token?: string | null
): Promise<LegacyImportProcessResult> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/legacy-imports/batches/${batchId}/process`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: "include",
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as LegacyImportProcessResult;
}

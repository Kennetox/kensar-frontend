import { getApiBase } from "@/lib/api/base";

export type PendingSaleRecord = {
  id: string;
  endpoint: "/pos/sales" | "/separated-orders";
  payload: unknown;
  summary: {
    saleNumber: number;
    total: number;
    methodLabel: string;
    createdAt: string;
    customerName?: string | null;
    vendorName?: string | null;
    isSeparated: boolean;
  };
};

export const PENDING_SALES_STORAGE_KEY = "kensar_pos_pending_sales_v1";
export const PENDING_SALES_EVENT = "kensar-pos-pending-sales";

type PendingSalesEventDetail = {
  action: "added" | "removed" | "updated";
};

function getSafeWindow(): typeof window | null {
  return typeof window === "undefined" ? null : window;
}

function readStorage(): PendingSaleRecord[] {
  const win = getSafeWindow();
  if (!win) return [];
  const raw = win.localStorage.getItem(PENDING_SALES_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (err) {
    console.warn("No se pudieron leer las ventas pendientes", err);
    return [];
  }
}

function writeStorage(list: PendingSaleRecord[]) {
  const win = getSafeWindow();
  if (!win) return;
  win.localStorage.setItem(
    PENDING_SALES_STORAGE_KEY,
    JSON.stringify(list)
  );
}

function emitUpdate(action: PendingSalesEventDetail["action"]) {
  const win = getSafeWindow();
  if (!win) return;
  const event = new CustomEvent<PendingSalesEventDetail>(PENDING_SALES_EVENT, {
    detail: { action },
  });
  win.dispatchEvent(event);
}

export function getPendingSales(): PendingSaleRecord[] {
  return readStorage();
}

export function addPendingSale(
  entry: Omit<PendingSaleRecord, "id" | "summary"> & {
    summary: Omit<PendingSaleRecord["summary"], "createdAt"> & {
      createdAt?: string;
    };
  }
): PendingSaleRecord[] {
  const win = getSafeWindow();
  const id =
    win?.crypto?.randomUUID() ??
    `pending-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const record: PendingSaleRecord = {
    ...entry,
    id,
    summary: {
      ...entry.summary,
      createdAt: entry.summary.createdAt ?? new Date().toISOString(),
    },
  };
  const current = readStorage();
  const next = [record, ...current];
  writeStorage(next);
  emitUpdate("added");
  return next;
}

export function removePendingSale(id: string): PendingSaleRecord[] {
  const current = readStorage();
  const next = current.filter((item) => item.id !== id);
  writeStorage(next);
  emitUpdate("removed");
  return next;
}

export async function submitPendingSale(
  record: PendingSaleRecord,
  token: string
): Promise<Response> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}${record.endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
    body: JSON.stringify(record.payload),
  });
  return res;
}

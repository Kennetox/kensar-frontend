import { getApiBase } from "../api/base.ts";

export type PendingSaleRecord = {
  id: string;
  endpoint: "/pos/sales" | "/separated-orders";
  payload: unknown;
  scope?: PendingSaleScope;
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

export type PendingSaleScope = {
  tenantId: number | null;
  userId: number | null;
  stationId: string | null;
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

function matchesScope(record: PendingSaleRecord, scope?: PendingSaleScope): boolean {
  if (!scope) return true;
  if (!record.scope) return false;
  return (
    record.scope.tenantId === scope.tenantId &&
    record.scope.userId === scope.userId &&
    record.scope.stationId === scope.stationId
  );
}

function migrateLegacyStationScope(
  records: PendingSaleRecord[],
  scope?: PendingSaleScope
): PendingSaleRecord[] {
  if (!scope?.stationId) return records;
  let changed = false;
  const migrated = records.map((record) => {
    if (record.scope || !record.payload || typeof record.payload !== "object") {
      return record;
    }
    const payloadStationId = (record.payload as Record<string, unknown>).station_id;
    if (payloadStationId !== scope.stationId) return record;
    changed = true;
    return { ...record, scope };
  });
  if (changed) writeStorage(migrated);
  return migrated;
}

export function getPendingSales(scope?: PendingSaleScope): PendingSaleRecord[] {
  return migrateLegacyStationScope(readStorage(), scope).filter((record) =>
    matchesScope(record, scope)
  );
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
  const payload =
    entry.payload && typeof entry.payload === "object" && !Array.isArray(entry.payload)
      ? {
          ...(entry.payload as Record<string, unknown>),
          client_request_id:
            (entry.payload as Record<string, unknown>).client_request_id ?? id,
        }
      : entry.payload;
  const record: PendingSaleRecord = {
    ...entry,
    id,
    payload,
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

function persistPendingPayload(
  id: string,
  payload: Record<string, unknown>,
  saleNumber?: number
): void {
  const current = readStorage();
  const next = current.map((item) =>
    item.id === id
      ? {
          ...item,
          payload,
          summary: {
            ...item.summary,
            saleNumber: saleNumber ?? item.summary.saleNumber,
          },
        }
      : item
  );
  writeStorage(next);
  emitUpdate("updated");
}

export async function submitPendingSale(
  record: PendingSaleRecord,
  token: string
): Promise<Response> {
  const sanitizePayload = (payload: unknown) => {
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const clone = { ...(payload as Record<string, unknown>) };
      return clone;
    }
    return payload;
  };
  const apiBase = getApiBase();
  const payload = sanitizePayload(record.payload) as Record<string, unknown>;
  const fetchWithTimeout = async (
    url: string,
    init: RequestInit,
    timeoutMs: number
  ): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  if (!payload.reservation_id) {
    const reservationResponse = await fetchWithTimeout(
      `${apiBase}/pos/sales/reserve-number`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Request-ID": `${record.id}_reserve`.slice(0, 64),
        },
        credentials: "include",
        body: JSON.stringify({
          pos_name: payload.pos_name ?? null,
          station_id: payload.station_id ?? null,
          min_sale_number: payload.sale_number_preassigned ?? null,
        }),
      },
      20000
    );
    if (!reservationResponse.ok) return reservationResponse;
    const reservation = (await reservationResponse.json()) as {
      reservation_id: number;
      sale_number: number;
    };
    payload.reservation_id = reservation.reservation_id;
    payload.sale_number_preassigned = reservation.sale_number;
    persistPendingPayload(record.id, payload, reservation.sale_number);
  }

  const res = await fetchWithTimeout(`${apiBase}${record.endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Request-ID":
        typeof payload.client_request_id === "string"
          ? payload.client_request_id
          : record.id,
    },
    credentials: "include",
    body: JSON.stringify(payload),
  }, 45000);
  return res;
}

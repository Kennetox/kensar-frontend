import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { webcrypto } from "node:crypto";

import {
  PENDING_SALES_STORAGE_KEY,
  addPendingSale,
  getPendingSales,
  submitPendingSale,
} from "../../lib/pos/pendingSales.ts";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

const localStorage = new MemoryStorage();
const browserEvents = new EventTarget();

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage,
    crypto: webcrypto,
    setTimeout,
    clearTimeout,
    dispatchEvent: (event: Event) => browserEvents.dispatchEvent(event),
  },
});

beforeEach(() => {
  localStorage.clear();
  process.env.NEXT_PUBLIC_API_URL = "https://api.test.local";
});

test("mantiene las ventas pendientes aisladas por tenant, usuario y caja", () => {
  const firstScope = { tenantId: 1, userId: 10, stationId: "caja-1" };
  const secondScope = { tenantId: 1, userId: 11, stationId: "caja-2" };

  addPendingSale({
    endpoint: "/pos/sales",
    payload: { station_id: "caja-1", client_request_id: "sale_scope_0001" },
    scope: firstScope,
    summary: {
      saleNumber: 1,
      total: 1000,
      methodLabel: "Efectivo",
      isSeparated: false,
    },
  });
  addPendingSale({
    endpoint: "/pos/sales",
    payload: { station_id: "caja-2", client_request_id: "sale_scope_0002" },
    scope: secondScope,
    summary: {
      saleNumber: 2,
      total: 2000,
      methodLabel: "Tarjeta",
      isSeparated: false,
    },
  });

  assert.equal(getPendingSales(firstScope).length, 1);
  assert.equal(getPendingSales(firstScope)[0].summary.saleNumber, 1);
  assert.equal(getPendingSales(secondScope).length, 1);
  assert.equal(getPendingSales(secondScope)[0].summary.saleNumber, 2);
});

test("reserva consecutivo y conserva el mismo código al reenviar una venta", async () => {
  const scope = { tenantId: 1, userId: 10, stationId: "caja-1" };
  addPendingSale({
    endpoint: "/pos/sales",
    payload: {
      station_id: "caja-1",
      client_request_id: "sale_retry_0001",
      sale_number_preassigned: 9,
    },
    scope,
    summary: {
      saleNumber: 9,
      total: 5000,
      methodLabel: "Efectivo",
      isSeparated: false,
    },
  });
  const record = getPendingSales(scope)[0];
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/pos/sales/reserve-number")) {
      return new Response(
        JSON.stringify({ reservation_id: 77, sale_number: 12 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(JSON.stringify({ id: 99 }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const response = await submitPendingSale(record, "token-test");

    assert.equal(response.status, 201);
    assert.equal(calls.length, 2);
    const saleHeaders = new Headers(calls[1].init?.headers);
    assert.equal(saleHeaders.get("X-Request-ID"), "sale_retry_0001");
    const submittedPayload = JSON.parse(String(calls[1].init?.body));
    assert.equal(submittedPayload.reservation_id, 77);
    assert.equal(submittedPayload.sale_number_preassigned, 12);
    const persisted = JSON.parse(
      localStorage.getItem(PENDING_SALES_STORAGE_KEY) ?? "[]"
    );
    assert.equal(persisted[0].payload.reservation_id, 77);
    assert.equal(persisted[0].summary.saleNumber, 12);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

import assert from "node:assert/strict";
import test from "node:test";

import { buildSeparatedTicketReconciliations } from "../../lib/printing/separatedTicket.ts";

test("builds each external reconciliation from the administrative history", () => {
  const entries = buildSeparatedTicketReconciliations({
    reconciled_amount: 50_000,
    resolution_reference: "V-007642",
    resolution_history: [
      {
        action: "reconcile",
        amount: 50_000,
        reference: "V-007642",
        created_at: "2026-09-08T15:00:00.000Z",
      },
    ],
  });

  assert.deepEqual(entries, [
    {
      amount: 50_000,
      reference: "V-007642",
      reconciledAt: "2026-09-08T15:00:00.000Z",
    },
  ]);
});

test("falls back to the reconciled aggregate for historical records", () => {
  const entries = buildSeparatedTicketReconciliations({
    reconciled_amount: 50_000,
    resolution_reference: "V-007642",
    resolved_at: "2026-09-08T15:00:00.000Z",
  });

  assert.deepEqual(entries, [
    {
      amount: 50_000,
      reference: "V-007642",
      reconciledAt: "2026-09-08T15:00:00.000Z",
    },
  ]);
});

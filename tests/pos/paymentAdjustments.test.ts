import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNetPaymentAllocation,
  capPaymentAllocation,
} from "../../lib/pos/paymentAdjustments.ts";

test("excludes cash change from the payment allocation", () => {
  assert.deepEqual(
    buildNetPaymentAllocation([{ method: "cash", amount: 50_000 }], 18_000),
    [{ method: "cash", amount: 32_000 }]
  );
});

test("only subtracts change from cash in a mixed payment", () => {
  assert.deepEqual(
    buildNetPaymentAllocation(
      [
        { method: "nequi", amount: 10_000 },
        { method: "efectivo", amount: 40_000 },
      ],
      8_000
    ),
    [
      { method: "nequi", amount: 10_000 },
      { method: "efectivo", amount: 32_000 },
    ]
  );
});

test("leaves payments unchanged when there was no change", () => {
  assert.deepEqual(
    buildNetPaymentAllocation([{ method: "card", amount: 32_000 }], 0),
    [{ method: "card", amount: 32_000 }]
  );
});

test("caps an already inflated adjustment while preserving its selected method", () => {
  assert.deepEqual(
    capPaymentAllocation([{ method: "nequi", amount: 50_000 }], 32_000),
    [{ method: "nequi", amount: 32_000 }]
  );
});

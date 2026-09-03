import assert from "node:assert/strict";
import test from "node:test";

import { buildSeparatedOrderLookups } from "../../lib/pos/separatedOrderLookup.ts";

test("normalizes a sale ticket scanned with the expected keyboard layout", () => {
  assert.deepEqual(buildSeparatedOrderLookups("V-007865"), [
    { barcode: "V-007865" },
    { saleNumber: 7865 },
  ]);
});

test("normalizes a dash read as an apostrophe by the scanner", () => {
  assert.deepEqual(buildSeparatedOrderLookups("v'007865"), [
    { barcode: "V-007865" },
    { saleNumber: 7865 },
  ]);
});

test("keeps the legacy numeric ticket lookup", () => {
  assert.deepEqual(buildSeparatedOrderLookups("007865"), [
    { saleNumber: 7865 },
  ]);
});

test("keeps unrelated alphanumeric barcodes unchanged", () => {
  assert.deepEqual(buildSeparatedOrderLookups("SEP-ABC123"), [
    { barcode: "SEP-ABC123" },
  ]);
});

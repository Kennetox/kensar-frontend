import assert from "node:assert/strict";
import test from "node:test";

import { generateCode128Svg } from "../../lib/utils/barcode.ts";

test("Code 128 preserves alphanumeric POS document numbers", () => {
  for (const documentNumber of ["V-000123", "CB-000045", "DV-000018"]) {
    const svg = generateCode128Svg(documentNumber);
    assert.match(svg, /<svg/);
    assert.ok(svg.includes(`>${documentNumber}</text>`));
    assert.ok((svg.match(/<rect/g) ?? []).length > 10);
  }
});

test("legacy numeric codes remain supported", () => {
  const svg = generateCode128Svg("000123");
  assert.ok(svg.includes(">000123</text>"));
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  extractProductCode,
  extractProductTerm,
  normalizeQuery,
  parseSpecificDate,
  resolvePaymentMethodFromQuery,
  tokenizeQuery,
} from "../../app/dashboard/components/kora/nlp.ts";

test("normalizeQuery removes accents and punctuation", () => {
  const got = normalizeQuery("¿Cómo está, KÓRA?  SKU-100045!!!");
  assert.equal(got, "como esta kora sku-100045");
});

test("tokenizeQuery splits normalized tokens", () => {
  const got = tokenizeQuery("  Ventas   del   MES  ");
  assert.deepEqual(got, ["ventas", "del", "mes"]);
});

test("parseSpecificDate parses numeric dd/mm/yyyy", () => {
  const got = parseSpecificDate("ventas 21/02/2026");
  assert.ok(got);
  assert.equal(got.key, "2026-02-21");
  assert.equal(got.day, 21);
  assert.equal(got.month, 2);
  assert.equal(got.year, 2026);
});

test("parseSpecificDate parses textual spanish month", () => {
  const got = parseSpecificDate("metodos de pago 3 de febrero de 2026");
  assert.ok(got);
  assert.equal(got.key, "2026-02-03");
});

test("extractProductCode prefers explicit sku syntax", () => {
  const got = extractProductCode("precio del SKU 100045");
  assert.equal(got, "100045");
});

test("extractProductCode avoids date collisions", () => {
  const got = extractProductCode("ventas del 21/02/2026");
  assert.equal(got, "");
});

test("extractProductTerm captures target product", () => {
  const got = extractProductTerm("cual fue la ultima cabina 8A que vendimos");
  assert.equal(got, "cabina 8a");
});

test("extractProductTerm can produce generic price words", () => {
  const got = extractProductTerm("y el precio");
  assert.equal(got, "precio");
});

test("extractProductTerm ignores generic stock count phrases", () => {
  const got = extractProductTerm("cuantos tenemos?");
  assert.equal(got, "");
});

test("resolvePaymentMethodFromQuery identifies Addi", () => {
  const got = resolvePaymentMethodFromQuery("incremento de ventas por addi");
  assert.ok(got);
  assert.equal(got?.slug, "addi");
});

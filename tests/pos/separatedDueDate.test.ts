import assert from "node:assert/strict";
import test from "node:test";

import { getDefaultSeparatedDueDate } from "../../lib/pos/separatedDueDate.ts";

test("uses December 24 during the annual Christmas campaign", () => {
  assert.equal(
    getDefaultSeparatedDueDate(new Date("2026-09-08T15:00:00.000Z")),
    "2026-12-25T04:59:59.999Z"
  );
  assert.equal(
    getDefaultSeparatedDueDate(new Date("2027-10-23T15:00:00.000Z")),
    "2027-12-25T04:59:59.999Z"
  );
});

test("returns to two calendar months on October 24", () => {
  assert.equal(
    getDefaultSeparatedDueDate(new Date("2026-10-24T15:30:00.000Z")),
    "2026-12-24T15:30:00.000Z"
  );
});

test("uses two calendar months before September and clamps month ends", () => {
  assert.equal(
    getDefaultSeparatedDueDate(new Date("2026-08-31T15:30:00.000Z")),
    "2026-10-31T15:30:00.000Z"
  );
  assert.equal(
    getDefaultSeparatedDueDate(new Date("2026-12-31T15:30:00.000Z")),
    "2027-02-28T15:30:00.000Z"
  );
});

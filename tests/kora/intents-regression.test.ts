import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  detectIntent,
  resolveIntentWithContext,
  type KoraEntityContext,
  type KoraTopic,
  type QueryIntent,
} from "../../app/dashboard/components/kora/intent-engine.ts";
import { resolveModuleFromQuery } from "../../app/dashboard/components/kora/module-knowledge.ts";

type DirectCase = {
  kind: "direct";
  input: string;
  expected: QueryIntent;
};

type ContextCase = {
  kind: "context";
  input: string;
  lastTopic: KoraTopic;
  lastEntity?: KoraEntityContext;
  expected: QueryIntent;
};

type IntentCase = DirectCase | ContextCase;

function loadCases(): IntentCase[] {
  const file = path.resolve(process.cwd(), "tests/kora/fixtures/intents.v1.json");
  const raw = readFileSync(file, "utf8");
  return JSON.parse(raw) as IntentCase[];
}

test("intents regression fixture v1", () => {
  const cases = loadCases();
  assert.ok(cases.length >= 80, `expected >= 80 cases, got ${cases.length}`);

  for (const row of cases) {
    if (row.kind === "direct") {
      const got = detectIntent(row.input, resolveModuleFromQuery);
      assert.equal(got, row.expected, `direct: \"${row.input}\"`);
      continue;
    }

    const got = resolveIntentWithContext(
      row.input,
      row.lastTopic,
      row.lastEntity ?? {},
      resolveModuleFromQuery
    );
    assert.equal(got, row.expected, `context: \"${row.input}\" (topic=${row.lastTopic})`);
  }
});

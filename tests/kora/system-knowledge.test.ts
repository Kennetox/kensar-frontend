import assert from "node:assert/strict";
import test from "node:test";

import { MODULE_GUIDES, type KoraModuleKey } from "../../app/dashboard/components/kora/module-knowledge.ts";
import { MODULE_SYSTEM_KNOWLEDGE } from "../../app/dashboard/components/kora/system-knowledge.ts";

test("MODULE_SYSTEM_KNOWLEDGE covers all module keys", () => {
  const keys = Object.keys(MODULE_GUIDES) as KoraModuleKey[];
  for (const key of keys) {
    assert.ok(MODULE_SYSTEM_KNOWLEDGE[key], `missing knowledge for module ${key}`);
  }
});

test("MODULE_SYSTEM_KNOWLEDGE has actionable content per module", () => {
  const keys = Object.keys(MODULE_GUIDES) as KoraModuleKey[];
  for (const key of keys) {
    const entry = MODULE_SYSTEM_KNOWLEDGE[key];
    assert.ok(entry.frontendSurface.length > 0, `${key} missing frontendSurface`);
    assert.ok(entry.backendCapabilities.length > 0, `${key} missing backendCapabilities`);
    assert.ok(entry.operatorCapabilities.length > 0, `${key} missing operatorCapabilities`);
    assert.ok(entry.suggestedPrompts.length > 0, `${key} missing suggestedPrompts`);
  }
});

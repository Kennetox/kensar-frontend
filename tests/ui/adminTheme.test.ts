import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();
const documentsExplorer = readFileSync(
  join(projectRoot, "app/components/DocumentsExplorer.tsx"),
  "utf8"
);

const legacyDarkClasses = [
  "bg-black/60",
  "bg-slate-950",
  "bg-slate-900",
  "bg-slate-800",
  "border-slate-800",
  "border-slate-700",
  "text-slate-50",
  "text-slate-100",
  "text-slate-200",
  "text-slate-300",
  "text-sky-50",
  "text-sky-100",
  "text-sky-200",
];

function getSection(startMarker: string, endMarker: string) {
  const start = documentsExplorer.indexOf(startMarker);
  const end = documentsExplorer.indexOf(endMarker, start);

  assert.notEqual(start, -1, `${startMarker} was not found`);
  assert.notEqual(end, -1, `${endMarker} was not found`);

  return documentsExplorer.slice(start, end);
}

function assertNoLegacyDarkPalette(section: string, name: string) {
  for (const legacyClass of legacyDarkClasses) {
    assert.equal(
      section.includes(legacyClass),
      false,
      `${name} reintroduced ${legacyClass}`
    );
  }
}

function assertUsesIsolatedAdminPortal(section: string, name: string) {
  assert.match(section, /<AdminModalPortal>/, `${name} is not portaled`);
  assert.match(
    section,
    /className="dashboard-theme admin-modal-backdrop/,
    `${name} does not carry its isolated dashboard theme`
  );
}

test("administrative theme primitives stay scoped away from the POS", () => {
  const css = readFileSync(join(projectRoot, "app/globals.css"), "utf8");

  assert.match(css, /\.dashboard-theme \{[\s\S]*?--admin-surface:/);
  assert.match(css, /\.dashboard-theme \.admin-modal-panel/);
  assert.match(css, /\.dashboard-theme \.admin-table-shell/);
  assert.match(css, /\.dashboard-theme \.admin-loading-overlay/);
  assert.doesNotMatch(css, /\n\.admin-modal-panel\s*\{/);
});

test("the migrated adjustment dialog does not use the legacy dark palette", () => {
  const dialog = getSection("{adjustTarget && (", "\n    </section>");
  assertNoLegacyDarkPalette(dialog, "adjustment dialog");
  assertUsesIsolatedAdminPortal(dialog, "adjustment dialog");
});

test("the document guide dialog does not use the legacy dark palette", () => {
  const dialog = getSection("{showDocumentGuide && (", "{toast && (");
  assertNoLegacyDarkPalette(dialog, "document guide dialog");
  assertUsesIsolatedAdminPortal(dialog, "document guide dialog");
});

test("the void dialog does not use the legacy dark palette", () => {
  const dialog = getSection("{voidTarget && (", "{adjustTarget && (");
  assertNoLegacyDarkPalette(dialog, "void dialog");
  assertUsesIsolatedAdminPortal(dialog, "void dialog");
});

test("the documents header and filters do not use the legacy dark palette", () => {
  assertNoLegacyDarkPalette(
    getSection(
      'data-admin-section="documents-header"',
      '<div className="documents-action-bar'
    ),
    "documents header and filters"
  );
});

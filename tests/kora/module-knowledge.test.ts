import assert from "node:assert/strict";
import test from "node:test";

import {
  buildModuleGuideMessage,
  buildModuleTaskActions,
  MODULE_GUIDES,
  resolveModuleFromQuery,
  type KoraModuleKey,
} from "../../app/dashboard/components/kora/module-knowledge.ts";

test("resolveModuleFromQuery resolves reportes aliases", () => {
  const got = resolveModuleFromQuery("como ver reportes detallados");
  assert.equal(got, "reportes");
});

test("resolveModuleFromQuery resolves comercio web aliases", () => {
  const got = resolveModuleFromQuery("pedido web pendiente");
  assert.equal(got, "comercio_web");
});

test("resolveModuleFromQuery resolves rrhh aliases", () => {
  const got = resolveModuleFromQuery("crear empleado en recursos humanos");
  assert.equal(got, "rrhh");
});

test("resolveModuleFromQuery resolves horarios aliases", () => {
  const got = resolveModuleFromQuery("publicar horarios de esta semana");
  assert.equal(got, "horarios");
});

test("resolveModuleFromQuery resolves perfil aliases", () => {
  const got = resolveModuleFromQuery("quiero editar mi perfil");
  assert.equal(got, "perfil");
});

test("resolveModuleFromQuery returns null when unmatched", () => {
  const got = resolveModuleFromQuery("meteorologia de bogota");
  assert.equal(got, null);
});

test("buildModuleGuideMessage includes title and numbered steps", () => {
  const got = buildModuleGuideMessage("productos");
  assert.ok(got.startsWith("Productos:"));
  assert.ok(got.includes("1. Abre Productos."));
});

test("buildModuleTaskActions returns first two actions max", () => {
  const rrhhActions = buildModuleTaskActions("rrhh");
  assert.equal(rrhhActions.length, 2);

  const inicioActions = buildModuleTaskActions("inicio");
  assert.equal(inicioActions.length, 1);
});

test("MODULE_GUIDES keeps all expected keys", () => {
  const expected: KoraModuleKey[] = [
    "inicio",
    "productos",
    "movimientos",
    "documentos",
    "clientes",
    "pos",
    "etiquetas",
    "etiquetado_beta",
    "reportes",
    "comercio_web",
    "inversion",
    "rrhh",
    "horarios",
    "perfil",
    "configuracion",
  ];
  for (const key of expected) {
    assert.ok(MODULE_GUIDES[key]);
  }
});

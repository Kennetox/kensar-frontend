import assert from "node:assert/strict";
import test from "node:test";

import {
  buildIntentCandidates,
  detectIntent,
  resolveIntentWithContext,
  type KoraEntityContext,
  type KoraTopic,
  type QueryIntent,
} from "../../app/dashboard/components/kora/intent-engine.ts";

const resolveModuleFromQuery = (input: string): string | null => {
  const text = input.toLowerCase();
  if (text.includes("report")) return "reportes";
  if (text.includes("producto") || text.includes("sku")) return "productos";
  if (text.includes("comercio web") || text.includes("pedido web")) return "comercio_web";
  if (text.includes("rrhh") || text.includes("recursos humanos")) return "rrhh";
  return null;
};

function assertIntent(input: string, expected: QueryIntent) {
  assert.equal(detectIntent(input, resolveModuleFromQuery), expected);
}

test("detectIntent greeting", () => {
  assertIntent("hola kora", "greeting");
});

test("detectIntent current module context", () => {
  assertIntent("que estoy viendo?", "current_module_context");
});

test("detectIntent report guide", () => {
  assertIntent("como ver reportes", "module_playbook_task");
});

test("detectIntent product create", () => {
  assertIntent("como crear un producto", "module_playbook_task");
});

test("detectIntent employee create", () => {
  assertIntent("como crear empleado en recursos humanos", "how_create_hr_employee");
});

test("detectIntent payment by date", () => {
  assertIntent("metodos de pago del 21/02/2026", "payment_methods_by_date");
});

test("detectIntent sales specific date", () => {
  assertIntent("ventas del 21/02/2026", "sales_specific_date");
});

test("detectIntent mtd comparison", () => {
  assertIntent("cuanto más vendimos que el mes anterior hasta ahora", "sales_mtd_comparison");
});

test("detectIntent method year comparison", () => {
  assertIntent("incremento de ventas por addi del año anterior a este", "sales_method_year_comparison");
});

test("detectIntent best sales month", () => {
  assertIntent("cual es el mes que mas hemos vendido", "sales_best_month");
});

test("detectIntent best sales day", () => {
  assertIntent("cual es el dia que mas hemos vendido", "sales_best_day");
});

test("detectIntent top product", () => {
  assertIntent("cual es el producto más vendido de este mes", "top_product_current_month");
});

test("detectIntent top products ranking", () => {
  assertIntent("cuales son los 10 productos mas vendidos", "top_products_current_month");
});

test("detectIntent top products previous month", () => {
  assertIntent("top 10 productos del mes pasado", "top_products_previous_month");
});

test("detectIntent top products specific month", () => {
  assertIntent("top 10 productos de febrero", "top_products_specific_month");
});

test("detectIntent product by code", () => {
  assertIntent("dime producto sku 100045", "product_by_code");
});

test("detectIntent product group", () => {
  assertIntent("a qué grupo pertenece SKU 100045", "product_group_lookup");
});

test("detectIntent product price", () => {
  assertIntent("qué precio tiene SKU 100045", "product_price_lookup");
});

test("detectIntent product restock advice", () => {
  assertIntent("debemos pedir mas del producto 100045", "product_restock_advice");
});

test("detectIntent inventory critical", () => {
  assertIntent("inventario critico", "inventory_critical");
});

test("detectIntent web pending", () => {
  assertIntent("comercio web pendientes", "module_playbook_task");
});

test("detectIntent customer lookup by name", () => {
  assertIntent("buscar cliente juan perez", "customer_lookup");
});

test("detectIntent customer lookup by id", () => {
  assertIntent("cliente con 12345678", "customer_lookup");
});

test("detectIntent customer lookup all by name", () => {
  assertIntent("dame todos los que tienen nombre juan", "customer_lookup");
});

test("detectIntent customer lookup by document phrase", () => {
  assertIntent("estoy buscando el que tiene documento 12345678", "customer_lookup");
});

test("detectIntent customer lookup natural question", () => {
  assertIntent("tenemos cliente con nombre juan?", "customer_lookup");
});

test("detectIntent customer lookup existential plural", () => {
  assertIntent("tenemos clientes garcia?", "customer_lookup");
});

test("detectIntent customer lookup existential with surname field", () => {
  assertIntent("si, tenemos clientes con nombre o apellido garcia?", "customer_lookup");
});

test("detectIntent customer sales lookup", () => {
  assertIntent("dame las ventas del cliente juan", "customer_sales_lookup");
});

test("detectIntent customer sales lookup natural question with name", () => {
  assertIntent("que ventas tienen juan ricardo", "customer_sales_lookup");
});

test("resolveIntentWithContext sales follow-up previous", () => {
  const got = resolveIntentWithContext("y antes de ese", "sales", {}, resolveModuleFromQuery);
  assert.equal(got, "last_sale_followup_previous");
});

test("resolveIntentWithContext inventory follow-up price", () => {
  const topic: KoraTopic = "inventory";
  const entity: KoraEntityContext = { productTerm: "cable" };
  const got = resolveIntentWithContext("y precio?", topic, entity, resolveModuleFromQuery);
  assert.equal(got, "product_price_lookup");
});

test("resolveIntentWithContext inventory follow-up stock count", () => {
  const topic: KoraTopic = "inventory";
  const entity: KoraEntityContext = { productTerm: "cable" };
  const got = resolveIntentWithContext("cuantos tenemos?", topic, entity, resolveModuleFromQuery);
  assert.equal(got, "product_by_code");
});

test("resolveIntentWithContext customer sales follow-up", () => {
  const got = resolveIntentWithContext(
    "y las ventas de ese cliente?",
    "sales",
    { customerTerm: "juan perez" },
    resolveModuleFromQuery
  );
  assert.equal(got, "customer_sales_lookup");
});

test("resolveIntentWithContext customer sales short follow-up", () => {
  const got = resolveIntentWithContext(
    "que ventas tiene?",
    "sales",
    { customerTerm: "alba liliana garcia" },
    resolveModuleFromQuery
  );
  assert.equal(got, "customer_sales_lookup");
});

test("resolveIntentWithContext customer sales pronoun follow-up", () => {
  const got = resolveIntentWithContext(
    "y de ella?",
    "sales",
    { customerTerm: "alba liliana garcia" },
    resolveModuleFromQuery
  );
  assert.equal(got, "customer_sales_lookup");
});

test("resolveIntentWithContext customer sales latest N follow-up", () => {
  const got = resolveIntentWithContext(
    "muestrame las ultimas 5",
    "sales",
    { customerTerm: "alba liliana garcia" },
    resolveModuleFromQuery
  );
  assert.equal(got, "customer_sales_lookup");
});

test("resolveIntentWithContext web follow-up", () => {
  const got = resolveIntentWithContext("y pendientes de pago web", "web", {}, resolveModuleFromQuery);
  assert.equal(got, "web_pending");
});

test("resolveIntentWithContext sales by current product reference", () => {
  const topic: KoraTopic = "inventory";
  const entity: KoraEntityContext = { productTerm: "1000" };
  const got = resolveIntentWithContext(
    "crees que deberiamos pedir mas? cuales han sido las ventas de este producto?",
    topic,
    entity,
    resolveModuleFromQuery
  );
  assert.equal(got, "last_sale_product");
});

test("resolveIntentWithContext inventory restock by context", () => {
  const topic: KoraTopic = "inventory";
  const entity: KoraEntityContext = { productTerm: "1000" };
  const got = resolveIntentWithContext("deberiamos pedir mas?", topic, entity, resolveModuleFromQuery);
  assert.equal(got, "product_restock_advice");
});

test("resolveIntentWithContext top products previous month follow-up", () => {
  const topic: KoraTopic = "sales";
  const entity: KoraEntityContext = { topProductsQueryActive: true, topProductsLimit: 10 };
  const got = resolveIntentWithContext("y del mes anterior?", topic, entity, resolveModuleFromQuery);
  assert.equal(got, "top_products_previous_month");
});

test("resolveIntentWithContext top products specific month follow-up", () => {
  const topic: KoraTopic = "sales";
  const entity: KoraEntityContext = { topProductsQueryActive: true, topProductsLimit: 10 };
  const got = resolveIntentWithContext("y de febrero?", topic, entity, resolveModuleFromQuery);
  assert.equal(got, "top_products_specific_month");
});

test("detectIntent sales day reading", () => {
  assertIntent("dame la lectura del dia", "sales_day_reading");
});

test("buildIntentCandidates orders by score", () => {
  const got = buildIntentCandidates("incremento de ventas por addi del año anterior a este", resolveModuleFromQuery);
  assert.ok(got.length > 0);
  assert.equal(got[0]?.intent, "sales_method_year_comparison");
});

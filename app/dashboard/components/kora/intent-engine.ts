import {
  hasPhrase,
  hasTokenStartingWith,
  normalizeQuery,
  parseSpecificDate,
  queryContainsAny,
  resolvePaymentMethodFromQuery,
  tokenizeQuery,
} from "./nlp.ts";
import type { KoraModuleKey } from "./module-knowledge.ts";

export type QueryIntent =
  | "greeting"
  | "help"
  | "current_module_context"
  | "module_guide"
  | "module_connection"
  | "module_playbook_task"
  | "cross_module_compare"
  | "kpi_drop_diagnostic"
  | "how_reports"
  | "how_create_product"
  | "how_create_hr_employee"
  | "last_created_product"
  | "how_find_sale"
  | "payment_methods_by_date"
  | "sales_mtd_comparison"
  | "sales_method_month_comparison"
  | "sales_method_year_comparison"
  | "sales_best_month"
  | "sales_best_day"
  | "top_product_current_month"
  | "top_products_current_month"
  | "top_products_previous_month"
  | "top_products_specific_month"
  | "sales_previous_month"
  | "sales_specific_date"
  | "product_by_code"
  | "product_price_lookup"
  | "product_group_lookup"
  | "product_restock_advice"
  | "last_sale_product"
  | "customer_lookup"
  | "customer_sales_lookup"
  | "last_sale_followup_product"
  | "last_sale_followup_previous"
  | "inventory_overview"
  | "inventory_critical"
  | "inventory_low"
  | "sales_overview"
  | "sales_day_reading"
  | "sales_today"
  | "sales_month"
  | "sales_tickets"
  | "separated_pending"
  | "web_overview"
  | "web_pending"
  | "web_processing"
  | "unknown";

export type KoraTopic = "inventory" | "sales" | "web" | null;

export type KoraEntityContext = {
  moduleKey?: KoraModuleKey | null;
  productTerm?: string | null;
  paymentMethodSlug?: string | null;
  dateKey?: string | null;
  topProductsQueryActive?: boolean;
  topProductsLimit?: number | null;
  customerTerm?: string | null;
  customerId?: number | null;
};

export type IntentCandidate = {
  intent: QueryIntent;
  score: number;
};

type ResolveModuleFromQuery = (input: string) => string | null;

function detectTaskSignal(text: string) {
  return (
    text.includes("como ") ||
    text.includes("cómo ") ||
    text.includes("crear") ||
    text.includes("nuevo") ||
    text.includes("registrar") ||
    text.includes("editar") ||
    text.includes("actualizar") ||
    text.includes("cambiar") ||
    text.includes("paso a paso") ||
    text.includes("ayudame") ||
    text.includes("ayúdame") ||
    text.includes("no encuentro") ||
    text.includes("donde esta") ||
    text.includes("dónde está") ||
    text.includes("procesar") ||
    text.includes("convertir") ||
    text.includes("aprobar") ||
    text.includes("pendiente") ||
    text.includes("pago") ||
    text.includes("kpi") ||
    text.includes("indicador") ||
    text.includes("ticket promedio") ||
    text.includes("tendencia") ||
    text.includes("comparar")
  );
}

export function detectIntent(input: string, resolveModuleFromQuery: ResolveModuleFromQuery): QueryIntent {
  const text = normalizeQuery(input);
  const tokens = tokenizeQuery(input);
  if (!text) return "unknown";

  const hasModule = !!resolveModuleFromQuery(text);
  const salesAliases = [
    "venta",
    "ventas",
    "vendimos",
    "factura",
    "facturas",
    "ticket",
    "tickets",
    "ingreso",
    "ingresos",
    "movimiento",
    "movimientos",
  ];
  const productAliases = ["producto", "productos", "articulo", "articulos", "item", "items", "sku", "codigo", "código"];
  const paymentAliases = [
    "metodo de pago",
    "metodos de pago",
    "método de pago",
    "métodos de pago",
    "medio de pago",
    "medios de pago",
    "pago",
    "pagos",
    "efectivo",
    "tarjeta",
    "transferencia",
    "addi",
    "sistecredito",
  ];
  const reportAliases = ["reporte", "reportes", "informe", "informes", "analitica", "analítica"];

  const asksHow = hasPhrase(text, ["como", "cómo", "de que forma", "de qué forma"]) || hasTokenStartingWith(tokens, ["como", "cómo"]);
  const hasSalesVerb = hasTokenStartingWith(tokens, ["vent", "vend", "factur", "ingres", "ticket"]) || queryContainsAny(text, salesAliases);
  const hasProductNoun = hasTokenStartingWith(tokens, ["produc", "articul", "item"]) || queryContainsAny(text, productAliases);
  const hasCreateVerb = hasTokenStartingWith(tokens, ["crea", "regist", "agreg", "alta", "mont", "nuev"]);
  const hasReportNoun = hasTokenStartingWith(tokens, ["report", "inform"]) || queryContainsAny(text, reportAliases);
  const hasPaymentNoun = hasTokenStartingWith(tokens, ["pago", "metod", "medio", "tarjet", "efect"]) || queryContainsAny(text, paymentAliases);
  const hasIncreaseNoun = hasTokenStartingWith(tokens, ["increment", "aument", "crec", "compar", "mas", "más", "diferen"]);
  const hasMonthToken = hasTokenStartingWith(tokens, ["mes"]);
  const hasYearToken = hasTokenStartingWith(tokens, ["ano", "año", "year"]);
  const hasDate = !!parseSpecificDate(text);
  const hasCodeNoun = hasTokenStartingWith(tokens, ["sku", "codig", "codigo", "barra", "barcode"]);
  const hasGroupNoun = hasTokenStartingWith(tokens, ["grupo", "categori"]);
  const hasBelongVerb = hasTokenStartingWith(tokens, ["pertenec", "clasif"]);
  const hasLastToken = hasPhrase(text, ["ultima vez", "última vez"]) || hasTokenStartingWith(tokens, ["ultim"]);
  const hasTodayToken = hasTokenStartingWith(tokens, ["hoy", "dia", "día"]);
  const hasTicketToken = hasTokenStartingWith(tokens, ["ticket"]);
  const hasPendingToken = hasTokenStartingWith(tokens, ["pendient"]);
  const hasCustomerNoun = hasTokenStartingWith(tokens, ["client"]) || hasPhrase(text, ["cliente", "clientes"]);
  const asksWhichProduct = hasPhrase(text, [
    "cual producto fue",
    "cuál producto fue",
    "que producto fue",
    "qué producto fue",
    "cual fue",
    "cuál fue",
    "que fue",
    "qué fue",
  ]) && hasTokenStartingWith(tokens, ["produc", "cual", "cuál", "que", "qué"]);
  const asksPreviousOne =
    hasPhrase(text, ["antes de este", "antes de ese", "el anterior", "la anterior", "y antes", "y el anterior"]) ||
    (tokens.includes("antes") && (tokens.includes("este") || tokens.includes("ese") || tokens.includes("anterior")));
  const asksProductPrice =
    hasPhrase(text, ["que precio tiene", "qué precio tiene", "cual es el precio", "cuál es el precio", "precio de ese", "precio del producto"]) ||
    (hasTokenStartingWith(tokens, ["preci", "valor", "cuanto", "cuánto"]) && hasProductNoun);
  const asksLastCreatedProduct =
    hasPhrase(text, ["ultimo producto creado", "último producto creado", "producto mas reciente", "producto más reciente", "ultimo item creado", "último ítem creado"]) ||
    ((text.includes("ultimo") || text.includes("último")) && text.includes("producto") && hasTokenStartingWith(tokens, ["cread", "registr", "agreg"]));
  const asksHowCreateEmployee =
    hasPhrase(text, ["crear empleado", "nuevo empleado", "agregar empleado", "crear en recursos humanos"]) ||
    ((hasCreateVerb || asksHow) && hasPhrase(text, ["empleado", "empleados", "rrhh", "recursos humanos"]));
  const asksModuleConnection =
    hasPhrase(text, ["como se conecta", "cómo se conecta", "como se relaciona", "cómo se relaciona", "interconect", "flujo entre", "relacion entre", "relación entre"]) &&
    hasModule;
  const asksCurrentModuleContext =
    hasPhrase(text, [
      "que estoy viendo",
      "qué estoy viendo",
      "donde estoy",
      "dónde estoy",
      "en que pagina estoy",
      "en qué página estoy",
      "en que modulo estoy",
      "en qué módulo estoy",
      "en que ventana estoy",
      "en qué ventana estoy",
      "que pagina es esta",
      "qué página es esta",
      "que modulo es este",
      "qué módulo es este",
      "que puedo hacer aqui",
      "qué puedo hacer aquí",
      "que puedo hacer en este modulo",
      "qué puedo hacer en este módulo",
    ]) ||
    ((text.includes("donde") || text.includes("dónde") || text.includes("modulo") || text.includes("módulo")) &&
      (text.includes("estoy") || text.includes("viendo")));
  const asksModuleTask = hasModule && detectTaskSignal(text);
  const asksCustomerLookup =
    (hasCustomerNoun ||
      ((text.includes("documento") || text.includes("cedula") || text.includes("cédula") || text.includes("nombre")) &&
        hasTokenStartingWith(tokens, ["busc", "encuentr", "localiz", "consult", "muestr", "dime", "ver", "dam", "tra"]))) &&
    (hasTokenStartingWith(tokens, ["busc", "encuentr", "localiz", "consult", "muestr", "dime", "ver", "dam", "tra"]) ||
      ((text.includes("tenemos") || text.includes("hay") || text.includes("existe") || text.includes("tienen") || text.includes("tiene")) &&
        (text.includes("cliente") || text.includes("clientes")) &&
        tokens.some((token) => token.length >= 3 && !["tenemos", "hay", "existe", "tienen", "tiene", "cliente", "clientes", "con", "nombre", "apellido", "si", "sí"].includes(token))) ||
      hasPhrase(text, [
        "buscar cliente",
        "busca cliente",
        "cliente con",
        "datos del cliente",
        "quien es cliente",
        "quién es cliente",
        "dame todos los que tienen nombre",
        "estoy buscando el que tiene documento",
      ]) ||
      /\b\d{6,}\b/.test(text));
  const asksCustomerSales =
    (text.includes("venta") || text.includes("ventas") || text.includes("vendio") || text.includes("vendió")) &&
    (text.includes("cliente") ||
      text.includes("ese cliente") ||
      text.includes("este cliente") ||
      text.includes("del cliente") ||
      /\b(que|qué)\s+ventas?\s+(tiene|tienen|tuvo)\s+/.test(text));
  const asksCrossModuleCompare =
    hasPhrase(text, [
      "inicio vs reportes",
      "inicio y reportes",
      "dashboard y reportes",
      "panel y reportes",
      "comparar inicio con reportes",
      "comparar reportes con inicio",
    ]) ||
    ((text.includes("comparar") || text.includes("vs") || text.includes("contra")) &&
      ((text.includes("inicio") || text.includes("panel") || text.includes("dashboard")) && text.includes("report")));
  const asksKpiDropDiagnostic =
    hasPhrase(text, [
      "si baja ticket promedio",
      "si cae ticket promedio",
      "bajo ticket promedio",
      "baja ticket",
      "cayo ticket promedio",
      "cayó ticket promedio",
      "que revisar primero",
      "qué revisar primero",
    ]) ||
    ((text.includes("ticket promedio") || text.includes("ticket")) &&
      (text.includes("baja") || text.includes("cae") || text.includes("cayo") || text.includes("cayó")) &&
      (text.includes("revisar") || text.includes("diagnostico") || text.includes("diagnóstico")));
  const asksTopProductsRanking =
    hasPhrase(text, [
      "productos mas vendidos",
      "productos más vendidos",
      "top productos",
      "top 10",
      "top diez",
      "ranking de productos",
    ]) ||
    ((text.includes("top") || text.includes("ranking")) &&
      hasProductNoun &&
      (text.includes("productos") || /\b\d{1,2}\b/.test(text)));
  const asksRestockAdvice =
    hasPhrase(text, [
      "debemos pedir mas",
      "deberiamos pedir mas",
      "deberiamos comprar mas",
      "deberíamos pedir más",
      "deberíamos comprar más",
      "conviene pedir mas",
      "conviene comprar mas",
      "conviene reponer",
      "hay que reponer",
      "vale la pena reponer",
    ]) ||
    ((text.includes("pedir") || text.includes("comprar") || text.includes("reponer")) &&
      (text.includes("mas") || text.includes("más") || text.includes("stock")));
  const hasMonthNameReference = /(?:^|\s)(ene(?:ro)?|feb(?:rero)?|mar(?:zo)?|abr(?:il)?|may(?:o)?|jun(?:io)?|jul(?:io)?|ago(?:sto)?|sep(?:tiembre)?|set(?:iembre)?|oct(?:ubre)?|nov(?:iembre)?|dic(?:iembre)?)(?:\s|$)/.test(text);
  const asksSalesReading =
    hasPhrase(text, [
      "lectura del dia",
      "lectura de hoy",
      "lectura kora",
      "como va el dia",
      "cómo va el día",
      "opinion del dia",
      "opinión del día",
      "fue buen dia",
      "fue buen día",
      "dia suave",
      "día suave",
    ]) ||
    ((text.includes("lectura") || text.includes("opinion") || text.includes("opinión")) &&
      (text.includes("dia") || text.includes("día") || text.includes("hoy")));
  const asksBestSalesMonth =
    hasPhrase(text, [
      "mes que mas hemos vendido",
      "mes que más hemos vendido",
      "mes con mas ventas",
      "mes con más ventas",
      "mejor mes de ventas",
      "mes mas vendido",
      "mes más vendido",
      "que mes vendimos mas",
      "qué mes vendimos más",
      "cual es el mejor mes",
      "cuál es el mejor mes",
    ]) ||
    (hasPhrase(text, ["que mes", "qué mes", "cual mes", "cuál mes"]) &&
      hasSalesVerb &&
      (text.includes("mas") || text.includes("más") || text.includes("mejor")));
  const asksBestSalesDay =
    hasPhrase(text, [
      "dia que mas hemos vendido",
      "día que más hemos vendido",
      "dia con mas ventas",
      "día con más ventas",
      "mejor dia de ventas",
      "mejor día de ventas",
      "dia mas vendido",
      "día más vendido",
      "que dia vendimos mas",
      "qué día vendimos más",
      "cual es el mejor dia",
      "cuál es el mejor día",
    ]) ||
    (hasPhrase(text, ["que dia", "qué día", "cual dia", "cuál día"]) &&
      hasSalesVerb &&
      (text.includes("mas") || text.includes("más") || text.includes("mejor")));

  if (hasPhrase(text, ["hola", "buenos dias", "buenas tardes", "buenas noches"])) return "greeting";
  if (
    hasPhrase(text, [
      "ayuda",
      "que haces",
      "que puedes",
      "como funciona",
      "cómo funciona",
      "quien eres",
      "quién eres",
      "para que sirves",
      "para qué sirves",
      "quien te creo",
      "quién te creó",
      "quien te creo a ti",
      "quién te creó a ti",
      "quien te hizo",
      "quién te hizo",
      "quien te desarrollo",
      "quién te desarrolló",
      "de donde saliste",
      "de dónde saliste",
    ])
  ) {
    return "help";
  }
  if (asksCurrentModuleContext) return "current_module_context";
  if (asksCustomerSales) return "customer_sales_lookup";
  if (asksCustomerLookup) return "customer_lookup";
  if (asksLastCreatedProduct) return "last_created_product";
  if (asksHowCreateEmployee) return "how_create_hr_employee";
  if (asksProductPrice) return "product_price_lookup";
  if (asksRestockAdvice && hasProductNoun) return "product_restock_advice";
  if (asksTopProductsRanking) {
    if (hasMonthNameReference) return "top_products_specific_month";
    if (text.includes("mes anterior") || text.includes("mes pasado")) return "top_products_previous_month";
    return "top_products_current_month";
  }
  if (asksBestSalesMonth) return "sales_best_month";
  if (asksBestSalesDay) return "sales_best_day";
  if (asksSalesReading) return "sales_day_reading";
  if (asksKpiDropDiagnostic) return "kpi_drop_diagnostic";
  if (asksCrossModuleCompare) return "cross_module_compare";
  if (asksModuleConnection) return "module_connection";
  if (asksModuleTask) return "module_playbook_task";
  if (
    hasModule &&
    (asksHow ||
      hasPhrase(text, ["para que sirve", "para qué sirve", "como usar", "cómo usar", "como entro", "cómo entro", "donde esta", "dónde está"]))
  ) {
    return "module_guide";
  }

  if (hasReportNoun && (asksHow || hasTokenStartingWith(tokens, ["ver", "gener", "sac", "consult"]))) {
    return "how_reports";
  }
  if (hasProductNoun && hasCreateVerb) {
    return "how_create_product";
  }
  if (hasSalesVerb && hasPhrase(text, ["ayer", "buscar", "encontrar"])) {
    return "how_find_sale";
  }
  if (
    hasSalesVerb &&
    hasMonthToken &&
    hasPhrase(text, ["hasta ahora", "mismo corte", "mes anterior", "mes pasado", "vs mes pasado", "contra mes pasado"]) &&
    hasIncreaseNoun
  ) {
    return "sales_mtd_comparison";
  }
  if (hasSalesVerb && hasMonthToken && hasIncreaseNoun && !!resolvePaymentMethodFromQuery(text)) {
    return "sales_method_month_comparison";
  }
  if (hasSalesVerb && hasYearToken && hasIncreaseNoun && !!resolvePaymentMethodFromQuery(text)) {
    return "sales_method_year_comparison";
  }
  if ((hasPhrase(text, ["producto mas vendido", "producto más vendido", "top producto", "mas vendido del mes", "más vendido del mes"])) || (hasProductNoun && hasSalesVerb && hasMonthToken)) {
    return "top_product_current_month";
  }
  if (hasPaymentNoun && hasDate) {
    return "payment_methods_by_date";
  }
  if (hasSalesVerb && hasMonthToken && hasPhrase(text, ["mes anterior", "mes pasado"])) {
    return "sales_previous_month";
  }
  if (hasSalesVerb && hasDate) {
    return "sales_specific_date";
  }
  if ((hasProductNoun || hasCodeNoun) && (hasGroupNoun || hasBelongVerb)) {
    return "product_group_lookup";
  }
  if (asksRestockAdvice && (hasProductNoun || hasCodeNoun)) {
    return "product_restock_advice";
  }
  if ((hasProductNoun || hasCodeNoun) && (hasPhrase(text, ["cual es", "cuál es", "info", "detalle"]) || hasTokenStartingWith(tokens, ["mostr", "dime", "busc"]))) {
    return "product_by_code";
  }
  if (hasLastToken && hasSalesVerb) {
    return "last_sale_product";
  }
  if (asksWhichProduct) {
    return "last_sale_followup_product";
  }
  if (asksPreviousOne) {
    return "last_sale_followup_previous";
  }

  if (text.includes("inventario") || text.includes("stock") || text.includes("reposicion")) {
    if (text.includes("critico")) return "inventory_critical";
    if (text.includes("bajo")) return "inventory_low";
    return "inventory_overview";
  }
  if (text.includes("separado") || (hasPendingToken && !text.includes("pago web"))) return "separated_pending";
  if (hasSalesVerb || hasTicketToken || hasTodayToken || hasMonthToken) {
    if (hasTicketToken) return "sales_tickets";
    if (hasTodayToken) return "sales_today";
    if (hasMonthToken) return "sales_month";
    return "sales_overview";
  }
  if (text.includes("comercio web") || text.includes("orden web") || text.includes("pedido web") || text.includes("pago web")) {
    if (text.includes("pendiente")) return "web_pending";
    if (text.includes("proceso") || text.includes("procesando")) return "web_processing";
    return "web_overview";
  }
  return "unknown";
}

export function resolveIntentWithContext(
  input: string,
  lastTopic: KoraTopic,
  lastEntity: KoraEntityContext,
  resolveModuleFromQuery: ResolveModuleFromQuery
): QueryIntent {
  const text = normalizeQuery(input);
  const asksAnySales =
    text.includes("venta") ||
    text.includes("ventas") ||
    text.includes("vendio") ||
    text.includes("vendió");
  const hasCustomerReference =
    text.includes("ese cliente") ||
    text.includes("este cliente") ||
    text.includes("del cliente") ||
    text.includes("de ese cliente") ||
    text.includes("de este cliente") ||
    text.includes("de ella") ||
    text.includes("de el") ||
    text.includes("de él");
  const asksCustomerSalesRecentFollowUp =
    !!lastEntity.customerTerm &&
    (text.startsWith("y ") || text.startsWith("muestrame") || text.startsWith("dame") || text.startsWith("ver")) &&
    (text.includes("ultimas") || text.includes("últimas") || text.includes("ultimos") || text.includes("últimos")) &&
    /\b\d{1,2}\b/.test(text);
  const asksCustomerSalesShortFollowUp =
    !!lastEntity.customerTerm &&
    (asksCustomerSalesRecentFollowUp ||
      (asksAnySales &&
        (text.split(" ").length <= 6 ||
          text.startsWith("y ") ||
          /^((que|qué)\s+ventas?\s+tiene\??)$/.test(text) ||
          /^((que|qué)\s+ventas?\s+tienen\??)$/.test(text))) ||
      (hasCustomerReference && text.split(" ").length <= 6) ||
      /^((y\s+)?de\s+(ella|el|él|ese cliente|este cliente)\??)$/.test(text));
  if (asksCustomerSalesShortFollowUp) return "customer_sales_lookup";
  const asksBestSalesMonth =
    hasPhrase(text, [
      "mes que mas hemos vendido",
      "mes que más hemos vendido",
      "mes con mas ventas",
      "mes con más ventas",
      "mejor mes de ventas",
      "mes mas vendido",
      "mes más vendido",
      "que mes vendimos mas",
      "qué mes vendimos más",
      "cual es el mejor mes",
      "cuál es el mejor mes",
    ]) ||
    (hasPhrase(text, ["que mes", "qué mes", "cual mes", "cuál mes"]) &&
      (text.includes("vend") || text.includes("venta")) &&
      (text.includes("mas") || text.includes("más") || text.includes("mejor")));
  const asksBestSalesDay =
    hasPhrase(text, [
      "dia que mas hemos vendido",
      "día que más hemos vendido",
      "dia con mas ventas",
      "día con más ventas",
      "mejor dia de ventas",
      "mejor día de ventas",
      "dia mas vendido",
      "día más vendido",
      "que dia vendimos mas",
      "qué día vendimos más",
      "cual es el mejor dia",
      "cuál es el mejor día",
    ]) ||
    (hasPhrase(text, ["que dia", "qué día", "cual dia", "cuál día"]) &&
      (text.includes("vend") || text.includes("venta")) &&
      (text.includes("mas") || text.includes("más") || text.includes("mejor")));
  const hasMonthNameReference = /(?:^|\s)(ene(?:ro)?|feb(?:rero)?|mar(?:zo)?|abr(?:il)?|may(?:o)?|jun(?:io)?|jul(?:io)?|ago(?:sto)?|sep(?:tiembre)?|set(?:iembre)?|oct(?:ubre)?|nov(?:iembre)?|dic(?:iembre)?)(?:\s|$)/.test(text);
  const asksSalesForCurrentProduct =
    !!lastEntity.productTerm &&
    (text.includes("este producto") ||
      text.includes("ese producto") ||
      text.includes("este sku") ||
      text.includes("ese sku")) &&
    (text.includes("venta") || text.includes("ventas") || text.includes("vendimos"));
  if (asksSalesForCurrentProduct) return "last_sale_product";
  const asksSalesForCurrentCustomer =
    !!lastEntity.customerTerm &&
    hasCustomerReference &&
    (text.includes("venta") || text.includes("ventas") || text.includes("vendio") || text.includes("vendió"));
  if (asksSalesForCurrentCustomer) return "customer_sales_lookup";
  const asksRestockForCurrentProduct =
    !!lastEntity.productTerm &&
    (text.includes("pedir") || text.includes("comprar") || text.includes("reponer")) &&
    (text.includes("mas") || text.includes("más") || text.includes("stock") || text.includes("este producto") || text.includes("ese producto"));
  if (asksRestockForCurrentProduct) return "product_restock_advice";
  if (lastTopic === "sales" && lastEntity.topProductsQueryActive && (text.includes("mes anterior") || text.includes("mes pasado"))) {
    return "top_products_previous_month";
  }
  if (lastTopic === "sales" && lastEntity.topProductsQueryActive && hasMonthNameReference) {
    return "top_products_specific_month";
  }
  if (
    lastTopic === "sales" &&
    lastEntity.topProductsQueryActive &&
    (text.includes("este mes") || text.includes("mes actual") || text.includes("de este mes"))
  ) {
    return "top_products_current_month";
  }

  const direct = detectIntent(input, resolveModuleFromQuery);
  if (direct !== "unknown") return direct;

  const moduleFromQuery = resolveModuleFromQuery(text);
  const followUp =
    text.startsWith("y ") ||
    text.startsWith("y si") ||
    text.startsWith("entonces") ||
    text.startsWith("ok ") ||
    text.startsWith("vale ") ||
    text.startsWith("listo ") ||
    text.startsWith("y ahora");
  const shortFollowUp = text.split(" ").length <= 8;
  if ((!followUp && !shortFollowUp) || !lastTopic) return "unknown";

  if (
    text.includes("ticket promedio") &&
    (text.includes("baja") || text.includes("cae") || text.includes("cayo") || text.includes("cayó"))
  ) {
    return "kpi_drop_diagnostic";
  }

  if (
    (text.includes("comparar") || text.includes("vs") || text.includes("contra")) &&
    (text.includes("inicio") || text.includes("panel") || text.includes("dashboard")) &&
    text.includes("report")
  ) {
    return "cross_module_compare";
  }

  if (lastEntity.moduleKey && detectTaskSignal(text)) {
    return "module_playbook_task";
  }

  if (moduleFromQuery && (text.includes("como") || text.includes("cómo") || text.includes("sirve") || text.includes("usar"))) {
    return "module_guide";
  }
  if (!moduleFromQuery && lastEntity.moduleKey && (text.includes("como") || text.includes("cómo") || text.includes("sirve") || text.includes("usar"))) {
    return "module_guide";
  }

  if (lastTopic === "sales") {
    if (asksBestSalesMonth) return "sales_best_month";
    if (asksBestSalesDay) return "sales_best_day";
    if (text.includes("lectura") && (text.includes("dia") || text.includes("día") || text.includes("hoy"))) return "sales_day_reading";
    if (text.includes("antes")) return "last_sale_followup_previous";
    if (text.includes("producto") || text.includes("cual fue") || text.includes("que fue")) return "last_sale_followup_product";
    if (shortFollowUp && (text.includes("metodo de pago") || text.includes("metodos de pago") || text.includes("pagos"))) {
      return "payment_methods_by_date";
    }
    if (shortFollowUp && lastEntity.productTerm && (text.includes("ultima") || text.includes("última") || text.includes("vendimos"))) {
      return "last_sale_product";
    }
    if (text.includes("mes")) return "sales_month";
    if (text.includes("hoy") || text.includes("dia")) return "sales_today";
    if (text.includes("ticket")) return "sales_tickets";
    if (text.includes("separado") || text.includes("pendiente")) return "separated_pending";
    return "sales_overview";
  }

  if (lastTopic === "inventory") {
    if (text.includes("ultimo") && text.includes("creado") && text.includes("producto")) return "last_created_product";
    if (/^\d+$/.test(text)) return "product_by_code";
    const asksStockForCurrentProduct =
      !!lastEntity.productTerm &&
      (text.includes("cuanto tenemos") ||
        text.includes("cuantos tenemos") ||
        text.includes("cuántos tenemos") ||
        text.includes("cuanto hay") ||
        text.includes("cuantos hay") ||
        text.includes("cuántos hay") ||
        text.includes("cantidad") ||
        text.includes("unidades") ||
        text.includes("stock"));
    if (asksStockForCurrentProduct) return "product_by_code";
    if (!!lastEntity.productTerm && (text.includes("pedir") || text.includes("comprar") || text.includes("reponer"))) {
      return "product_restock_advice";
    }
    if ((text.includes("precio") || text.includes("valor") || text.includes("cuanto") || text.includes("cuánto")) && !!lastEntity.productTerm) {
      return "product_price_lookup";
    }
    if (text.includes("grupo")) return "product_group_lookup";
    if (text.includes("producto") || text.includes("sku") || text.includes("codigo") || text.includes("código")) return "product_by_code";
    if (text.includes("critico")) return "inventory_critical";
    if (text.includes("bajo")) return "inventory_low";
    if (text.includes("inventario") || text.includes("stock")) return "inventory_overview";
    if (
      hasPhrase(text, ["cual producto es", "cuál producto es", "que producto es", "qué producto es", "cual es", "cuál es"]) &&
      !!lastEntity.productTerm
    ) {
      return "product_by_code";
    }
    return "unknown";
  }

  if (text.includes("empleado") || text.includes("rrhh") || text.includes("recursos humanos")) {
    if (text.includes("crear") || text.includes("nuevo") || text.includes("registrar")) return "how_create_hr_employee";
  }

  if (lastTopic === "web") {
    if (text.includes("pendiente")) return "web_pending";
    if (text.includes("proceso") || text.includes("procesando") || text.includes("lista")) return "web_processing";
    return "web_overview";
  }

  return "unknown";
}

export function buildIntentCandidates(input: string, resolveModuleFromQuery: ResolveModuleFromQuery): IntentCandidate[] {
  const text = normalizeQuery(input);
  const tokens = tokenizeQuery(input);
  const candidates: IntentCandidate[] = [];
  const push = (intent: QueryIntent, score: number) => candidates.push({ intent, score });
  const hasModule = !!resolveModuleFromQuery(text);

  const hasSales = hasTokenStartingWith(tokens, ["vent", "vend", "factur", "ingres", "ticket"]);
  const hasDate = !!parseSpecificDate(text);
  const hasPayment = hasTokenStartingWith(tokens, ["pago", "metod", "medio", "tarjet", "efect"]);
  const hasMonth = hasTokenStartingWith(tokens, ["mes"]);
  const hasIncrease = hasTokenStartingWith(tokens, ["increment", "aument", "crec", "compar", "diferen", "mas", "más"]);
  const hasYear = hasTokenStartingWith(tokens, ["ano", "año", "year"]);
  const hasMethod = !!resolvePaymentMethodFromQuery(text);
  const hasProduct = hasTokenStartingWith(tokens, ["produc", "item", "articul", "sku", "codig", "codigo"]);
  const hasCustomer = hasTokenStartingWith(tokens, ["client"]);
  const hasPrice = hasTokenStartingWith(tokens, ["preci", "valor", "cuanto", "cuánto"]);
  const hasGroup = hasTokenStartingWith(tokens, ["grupo", "categori", "pertenec"]);
  const hasLast = hasPhrase(text, ["ultima vez", "última vez", "ultimo", "último"]);
  const asksHow = hasTokenStartingWith(tokens, ["como", "cómo"]) || hasPhrase(text, ["de que forma", "de qué forma"]);
  const asksCurrentModuleContext =
    hasPhrase(text, [
      "que estoy viendo",
      "qué estoy viendo",
      "donde estoy",
      "dónde estoy",
      "en que pagina estoy",
      "en qué página estoy",
      "en que modulo estoy",
      "en qué módulo estoy",
      "en que ventana estoy",
      "en qué ventana estoy",
      "que pagina es esta",
      "qué página es esta",
      "que modulo es este",
      "qué módulo es este",
      "que puedo hacer aqui",
      "qué puedo hacer aquí",
      "que puedo hacer en este modulo",
      "qué puedo hacer en este módulo",
    ]) ||
    ((text.includes("donde") || text.includes("dónde") || text.includes("modulo") || text.includes("módulo")) &&
      (text.includes("estoy") || text.includes("viendo")));
  const asksCustomerLookup =
    (hasCustomer ||
      hasPhrase(text, ["cliente", "clientes"]) ||
      ((text.includes("documento") || text.includes("cedula") || text.includes("cédula") || text.includes("nombre")) &&
        hasTokenStartingWith(tokens, ["busc", "encuentr", "localiz", "consult", "muestr", "dime", "ver", "dam", "tra"]))) &&
    (hasTokenStartingWith(tokens, ["busc", "encuentr", "localiz", "consult", "muestr", "dime", "ver", "dam", "tra"]) ||
      ((text.includes("tenemos") || text.includes("hay") || text.includes("existe") || text.includes("tienen") || text.includes("tiene")) &&
        (text.includes("cliente") || text.includes("clientes")) &&
        tokens.some((token) => token.length >= 3 && !["tenemos", "hay", "existe", "tienen", "tiene", "cliente", "clientes", "con", "nombre", "apellido", "si", "sí"].includes(token))) ||
      hasPhrase(text, [
        "buscar cliente",
        "busca cliente",
        "cliente con",
        "datos del cliente",
        "dame todos los que tienen nombre",
        "estoy buscando el que tiene documento",
      ]) ||
      /\b\d{6,}\b/.test(text));
  const asksCustomerSales =
    (text.includes("venta") || text.includes("ventas") || text.includes("vendio") || text.includes("vendió")) &&
    (text.includes("cliente") ||
      text.includes("ese cliente") ||
      text.includes("este cliente") ||
      text.includes("del cliente") ||
      /\b(que|qué)\s+ventas?\s+(tiene|tienen|tuvo)\s+/.test(text));
  const hasMethodExplicit = !!resolvePaymentMethodFromQuery(text);
  const hasMonthNameReference = /(?:^|\s)(ene(?:ro)?|feb(?:rero)?|mar(?:zo)?|abr(?:il)?|may(?:o)?|jun(?:io)?|jul(?:io)?|ago(?:sto)?|sep(?:tiembre)?|set(?:iembre)?|oct(?:ubre)?|nov(?:iembre)?|dic(?:iembre)?)(?:\s|$)/.test(text);
  const asksSalesReading =
    hasPhrase(text, [
      "lectura del dia",
      "lectura de hoy",
      "lectura kora",
      "como va el dia",
      "cómo va el día",
      "opinion del dia",
      "opinión del día",
      "fue buen dia",
      "fue buen día",
      "dia suave",
      "día suave",
    ]) ||
    ((text.includes("lectura") || text.includes("opinion") || text.includes("opinión")) &&
      (text.includes("dia") || text.includes("día") || text.includes("hoy")));
  const asksTopProductsRanking =
    hasPhrase(text, [
      "productos mas vendidos",
      "productos más vendidos",
      "top productos",
      "top 10",
      "top diez",
      "ranking de productos",
    ]) ||
    ((text.includes("top") || text.includes("ranking")) &&
      hasProduct &&
      (text.includes("productos") || /\b\d{1,2}\b/.test(text)));
  const asksBestSalesMonth =
    hasPhrase(text, [
      "mes que mas hemos vendido",
      "mes que más hemos vendido",
      "mes con mas ventas",
      "mes con más ventas",
      "mejor mes de ventas",
      "mes mas vendido",
      "mes más vendido",
      "que mes vendimos mas",
      "qué mes vendimos más",
      "cual es el mejor mes",
      "cuál es el mejor mes",
    ]) ||
    (hasPhrase(text, ["que mes", "qué mes", "cual mes", "cuál mes"]) &&
      hasSales &&
      (text.includes("mas") || text.includes("más") || text.includes("mejor")));
  const asksBestSalesDay =
    hasPhrase(text, [
      "dia que mas hemos vendido",
      "día que más hemos vendido",
      "dia con mas ventas",
      "día con más ventas",
      "mejor dia de ventas",
      "mejor día de ventas",
      "dia mas vendido",
      "día más vendido",
      "que dia vendimos mas",
      "qué día vendimos más",
      "cual es el mejor dia",
      "cuál es el mejor día",
    ]) ||
    (hasPhrase(text, ["que dia", "qué día", "cual dia", "cuál día"]) &&
      hasSales &&
      (text.includes("mas") || text.includes("más") || text.includes("mejor")));

  if (hasSales && hasDate) push("sales_specific_date", 84);
  if (asksCurrentModuleContext) push("current_module_context", 96);
  if (asksCustomerLookup) push("customer_lookup", 90);
  if (asksCustomerSales) push("customer_sales_lookup", 91);
  if (hasPayment && hasDate) push("payment_methods_by_date", 90);
  if (hasSales && hasMonth && hasIncrease) push("sales_mtd_comparison", 80);
  if (hasSales && hasMonth && hasIncrease && hasMethod) push("sales_method_month_comparison", 90);
  if (hasSales && hasYear && hasIncrease && hasMethod) push("sales_method_year_comparison", 90);
  if (hasProduct && hasGroup) push("product_group_lookup", 84);
  if (hasProduct && (text.includes("pedir") || text.includes("comprar") || text.includes("reponer"))) push("product_restock_advice", 88);
  if (hasPrice && hasProduct) push("product_price_lookup", 86);
  if (hasProduct && hasTokenStartingWith(tokens, ["cual", "cuál", "dime", "muestr", "busc", "info", "detalle"])) push("product_by_code", 78);
  if (hasLast && hasSales) push("last_sale_product", 86);
  if (hasLast && hasSales && hasMethodExplicit) push("payment_methods_by_date", 70);
  if (hasPhrase(text, ["producto mas vendido", "producto más vendido", "top producto"])) push("top_product_current_month", 92);
  if (asksTopProductsRanking && hasMonthNameReference) push("top_products_specific_month", 95);
  if (asksTopProductsRanking && (text.includes("mes anterior") || text.includes("mes pasado"))) push("top_products_previous_month", 94);
  if (asksTopProductsRanking && !(text.includes("mes anterior") || text.includes("mes pasado"))) push("top_products_current_month", 93);
  if (asksBestSalesMonth) push("sales_best_month", 94);
  if (asksBestSalesDay) push("sales_best_day", 94);
  if (asksSalesReading) push("sales_day_reading", 93);
  if (hasPhrase(text, ["ultimo producto creado", "último producto creado", "producto mas reciente", "producto más reciente"])) push("last_created_product", 95);
  if (
    (text.includes("ticket promedio") || text.includes("ticket")) &&
    (text.includes("baja") || text.includes("cae") || text.includes("cayo") || text.includes("cayó")) &&
    (text.includes("revisar") || text.includes("diagnostico") || text.includes("diagnóstico"))
  ) {
    push("kpi_drop_diagnostic", 94);
  }
  if (
    (text.includes("comparar") || text.includes("vs") || text.includes("contra")) &&
    (text.includes("inicio") || text.includes("panel") || text.includes("dashboard")) &&
    text.includes("report")
  ) {
    push("cross_module_compare", 92);
  }
  if (hasModule && (asksHow || hasPhrase(text, ["para que sirve", "para qué sirve", "como usar", "cómo usar"]))) push("module_guide", 88);
  if (hasModule && detectTaskSignal(text)) push("module_playbook_task", 90);
  if (hasPhrase(text, ["crear empleado", "nuevo empleado", "agregar empleado"]) && hasPhrase(text, ["rrhh", "recursos humanos", "empleado"])) {
    push("how_create_hr_employee", 90);
  }
  if (hasProduct && hasTokenStartingWith(tokens, ["crea", "regist", "agreg", "nuev"])) push("how_create_product", 85);
  if (asksHow && hasTokenStartingWith(tokens, ["report", "inform"])) push("how_reports", 85);

  return candidates.sort((a, b) => b.score - a.score);
}

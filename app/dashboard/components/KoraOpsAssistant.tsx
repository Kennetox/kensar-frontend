"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  fetchInventoryOverview,
  fetchInventoryProducts,
  type InventoryOverview,
} from "@/lib/api/inventory";
import { getApiBase } from "@/lib/api/base";
import { fetchSeparatedOrders } from "@/lib/api/separatedOrders";
import { fetchComercioWebOrders } from "@/lib/api/comercioWeb";
import { getBogotaDateKey } from "@/lib/time/bogota";

type KoraOpsAssistantProps = {
  enabled: boolean;
  userName?: string | null;
  token?: string | null;
};

type KoraAction = {
  id: string;
  label: string;
  href?: string;
  intent?: QueryIntent;
  inputOverride?: string;
};

type KoraMessage = {
  id: number;
  role: "kora" | "user";
  text: string;
  actions?: KoraAction[];
};

type QueryIntent =
  | "greeting"
  | "help"
  | "how_reports"
  | "how_create_product"
  | "how_find_sale"
  | "payment_methods_by_date"
  | "sales_mtd_comparison"
  | "sales_method_month_comparison"
  | "sales_method_year_comparison"
  | "top_product_current_month"
  | "sales_previous_month"
  | "sales_specific_date"
  | "product_by_code"
  | "product_group_lookup"
  | "last_sale_product"
  | "last_sale_followup_product"
  | "last_sale_followup_previous"
  | "inventory_overview"
  | "inventory_critical"
  | "inventory_low"
  | "sales_overview"
  | "sales_today"
  | "sales_month"
  | "sales_tickets"
  | "separated_pending"
  | "web_overview"
  | "web_pending"
  | "web_processing"
  | "unknown";

type KoraTopic = "inventory" | "sales" | "web" | null;

type SalesSnapshot = {
  todaySales: number;
  todayTickets: number;
  monthSales: number;
  monthTickets: number;
  pendingSeparated: number;
};

type WebSnapshot = {
  totalOrders: number;
  pendingPayment: number;
  paid: number;
  processing: number;
  ready: number;
  cancelled: number;
};

type MonthlySalesPoint = {
  month: number;
  total: number;
  tickets: number;
};

type SalesHistoryItem = {
  id: number;
  created_at?: string;
  total?: number;
  sale_number?: number;
  document_number?: string;
  payment_method?: string;
  payments?: Array<{
    method?: string;
    amount?: number;
  }>;
  items?: Array<{
    product_name?: string;
    name?: string;
    product_sku?: string | null;
    quantity?: number;
  }>;
};

type LastSaleLookupContext = {
  query: string;
  matches: SalesHistoryItem[];
  currentIndex: number;
} | null;

type IntentCandidate = {
  intent: QueryIntent;
  score: number;
};

type KoraMetricEntry = {
  at: string;
  source: "message" | "action";
  input: string;
  intent: QueryIntent;
  status: "handled" | "fallback" | "confirm";
  latencyMs: number;
};

type QuickTopRow = {
  name: string;
  units: number;
  total: number;
};

const CACHE_TTL_MS = 45_000;
const KORA_METRICS_KEY = "kora_ops_metrics_v1";
const KORA_MAX_METRICS = 200;

const INVENTORY_ACTIONS: KoraAction[] = [
  { id: "go-movements", label: "Abrir Movimientos", href: "/dashboard/movements" },
  { id: "go-products", label: "Abrir Productos", href: "/dashboard/products" },
];

const SALES_ACTIONS: KoraAction[] = [
  { id: "go-reports", label: "Abrir Reportes", href: "/dashboard/reports" },
  { id: "go-sales", label: "Abrir Historial de ventas", href: "/dashboard/sales" },
];

const WEB_ACTIONS: KoraAction[] = [
  { id: "go-web", label: "Abrir Comercio web", href: "/dashboard/comercio-web" },
  { id: "go-reports-web", label: "Abrir Reportes", href: "/dashboard/reports" },
];

const REPORT_GUIDE_ACTIONS: KoraAction[] = [
  { id: "guide-reports-main", label: "Abrir Reportes", href: "/dashboard/reports" },
  { id: "guide-reports-detailed", label: "Abrir Reporte detallado", href: "/dashboard/reports/detailed" },
];

const PRODUCT_GUIDE_ACTIONS: KoraAction[] = [
  { id: "guide-products-main", label: "Abrir Productos", href: "/dashboard/products" },
  { id: "guide-labels", label: "Abrir Etiquetas", href: "/dashboard/labels" },
];

const PRODUCT_ACTIONS: KoraAction[] = [
  { id: "product-open-products", label: "Abrir Productos", href: "/dashboard/products" },
];

function resolveFirstName(value?: string | null) {
  const cleaned = (value || "").trim();
  if (!cleaned) return "";
  return cleaned.split(/\s+/)[0] || "";
}

function resolveGreetingByBogotaTime() {
  const hourRaw = new Intl.DateTimeFormat("es-CO", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone: "America/Bogota",
  }).format(new Date());

  const hour = Number.parseInt(hourRaw, 10);
  if (!Number.isFinite(hour)) return "Hola";
  if (hour >= 5 && hour < 12) return "Buenos días";
  if (hour >= 12 && hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

function buildWelcomeMessage(userName?: string | null) {
  const firstName = resolveFirstName(userName);
  const greeting = resolveGreetingByBogotaTime();
  const recipient = firstName ? ` ${firstName}` : "";
  return `${greeting}${recipient}, soy KORA. ¿En qué te ayudo hoy?`;
}

function normalizeQuery(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s/-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeQuery(value: string) {
  return normalizeQuery(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function hasTokenStartingWith(tokens: string[], prefixes: string[]) {
  return tokens.some((token) => prefixes.some((prefix) => token.startsWith(prefix)));
}

function hasPhrase(text: string, phrases: string[]) {
  return phrases.some((phrase) => text.includes(phrase));
}

function saleLabel(sale: SalesHistoryItem) {
  if (sale.document_number?.trim()) return `Doc ${sale.document_number.trim()}`;
  if (Number.isFinite(sale.sale_number)) return `Venta #${sale.sale_number}`;
  return `Venta ID ${sale.id}`;
}

function getBogotaYesterdayKey() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return getBogotaDateKey(yesterday) ?? "";
}

function monthLabel(month: number) {
  const names = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];
  return names[Math.max(1, Math.min(12, month)) - 1] ?? "mes";
}

function getBogotaDateParts(date = new Date()) {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const [year, month, day] = formatted.split("-").map((part) => Number.parseInt(part, 10));
  return { year, month, day };
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function diffPercent(current: number, base: number) {
  if (!base) return current > 0 ? 100 : 0;
  return ((current - base) / base) * 100;
}

function formatSignedMoney(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;
}

function formatSignedPercent(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toLocaleString("es-CO", { maximumFractionDigits: 2 })}%`;
}

function buildDateRangeKeys(from: Date, to: Date) {
  const date_from = getBogotaDateKey(from) ?? "";
  const date_to = getBogotaDateKey(to) ?? "";
  return { date_from, date_to };
}

function resolvePaymentMethodFromQuery(input: string) {
  const text = normalizeQuery(input);
  const methods = [
    { keys: ["addi"], slug: "addi", label: "Addi" },
    { keys: ["sistecredito", "sistecredito"], slug: "sistecredito", label: "Sistecrédito" },
    { keys: ["efectivo", "cash"], slug: "cash", label: "Efectivo" },
    { keys: ["transferencia", "transfer"], slug: "transferencia", label: "Transferencia" },
    { keys: ["tarjeta", "card"], slug: "card", label: "Tarjeta" },
    { keys: ["nequi"], slug: "nequi", label: "Nequi" },
    { keys: ["daviplata"], slug: "daviplata", label: "Daviplata" },
  ];
  const found = methods.find((method) => method.keys.some((key) => text.includes(key)));
  return found ?? null;
}

function parseSpecificDate(input: string) {
  const text = normalizeQuery(input);

  const numeric = text.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/);
  if (numeric) {
    const day = Number.parseInt(numeric[1], 10);
    const month = Number.parseInt(numeric[2], 10);
    const rawYear = numeric[3];
    const currentYear = Number.parseInt(
      new Intl.DateTimeFormat("en-CA", { year: "numeric", timeZone: "America/Bogota" }).format(new Date()),
      10
    );
    let year = rawYear ? Number.parseInt(rawYear, 10) : currentYear;
    if (year < 100) year += 2000;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2020) {
      const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return { key, day, month, year };
    }
  }

  const months: Record<string, number> = {
    enero: 1,
    febrero: 2,
    marzo: 3,
    abril: 4,
    mayo: 5,
    junio: 6,
    julio: 7,
    agosto: 8,
    septiembre: 9,
    setiembre: 9,
    octubre: 10,
    noviembre: 11,
    diciembre: 12,
  };
  const words = text.match(/\b(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?\b/);
  if (!words) return null;
  const day = Number.parseInt(words[1], 10);
  const month = months[words[2]];
  if (!month || day < 1 || day > 31) return null;
  const currentYear = Number.parseInt(
    new Intl.DateTimeFormat("en-CA", { year: "numeric", timeZone: "America/Bogota" }).format(new Date()),
    10
  );
  let year = words[3] ? Number.parseInt(words[3], 10) : currentYear;
  const todayMonth = Number.parseInt(
    new Intl.DateTimeFormat("en-CA", { month: "2-digit", timeZone: "America/Bogota" }).format(new Date()),
    10
  );
  if (!words[3] && month > todayMonth) year = currentYear - 1;
  const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { key, day, month, year };
}

function extractProductHint(input: string) {
  const text = normalizeQuery(input);
  const match = text.match(/(?:de|del)\s+([a-z0-9\s-]{2,})$/i);
  if (!match) return "";
  const candidate = match[1]
    .replace(/\b(producto|sku)\b/g, "")
    .trim();
  const blocked = new Set(["ayer", "hoy", "mes", "venta", "ventas", "reporte", "reportes"]);
  if (!candidate || blocked.has(candidate)) return "";
  return candidate;
}

function extractProductCode(input: string) {
  const raw = input.trim();
  const directCode = raw.match(/(?:sku|codigo|código|barcode|barra)\s*[:#-]?\s*([a-z0-9._-]{3,})/i);
  if (directCode?.[1]) return directCode[1].trim();

  const inQuotes = raw.match(/["“]([^"”]{2,})["”]/);
  if (inQuotes?.[1]) return inQuotes[1].trim();
  return "";
}

function extractProductTerm(input: string) {
  const normalized = normalizeQuery(input);

  // Captura común en preguntas tipo: "cual fue la ultima cabina que vendimos"
  const beforeSold = normalized.match(/ultima\s+(.+?)\s+que\s+vend/i);
  if (beforeSold?.[1]) {
    const candidate = beforeSold[1].trim();
    if (candidate) return candidate;
  }

  const byDe = normalized.match(/(?:de|del|producto)\s+([a-z0-9\s._-]{2,})$/i);
  if (byDe?.[1]) return byDe[1].trim();

  const stopwords = new Set([
    "cual",
    "cuál",
    "cuales",
    "cuáles",
    "que",
    "qué",
    "como",
    "cómo",
    "fue",
    "fueron",
    "la",
    "el",
    "los",
    "las",
    "un",
    "una",
    "unos",
    "unas",
    "de",
    "del",
    "al",
    "en",
    "por",
    "para",
    "con",
    "venta",
    "ventas",
    "vendimos",
    "vendi",
    "vendio",
    "vendió",
    "ultima",
    "última",
    "ultimo",
    "último",
    "vez",
    "producto",
    "productos",
    "grupo",
    "codigo",
    "código",
    "sku",
    "hoy",
    "ayer",
    "mes",
    "dia",
    "día",
    "tal",
  ]);

  const lexicalTokens = normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !stopwords.has(token))
    .map((token) => {
      // simplificación leve para plural común: "cabinas" -> "cabina"
      if (token.length > 4 && token.endsWith("s")) return token.slice(0, -1);
      return token;
    });

  if (!lexicalTokens.length) return "";
  return lexicalTokens.slice(0, 3).join(" ");
}

function buildFindSaleActions(productHint: string): KoraAction[] {
  const saleDate = getBogotaYesterdayKey();
  const dateParams = new URLSearchParams();
  if (saleDate) dateParams.set("saleDate", saleDate);
  if (productHint) dateParams.set("term", productHint);
  const yesterdayHref = `/dashboard/sales${dateParams.toString() ? `?${dateParams.toString()}` : ""}`;
  return [
    { id: "guide-sales-yesterday", label: "Abrir ventas de ayer", href: yesterdayHref },
    { id: "guide-sales-all", label: "Abrir historial de ventas", href: "/dashboard/sales" },
  ];
}

function detectIntent(input: string): QueryIntent {
  const text = normalizeQuery(input);
  const tokens = tokenizeQuery(input);
  if (!text) return "unknown";
  const asksHow = hasPhrase(text, ["como", "cómo", "de que forma", "de qué forma"]) || hasTokenStartingWith(tokens, ["como", "cómo"]);
  const hasSalesVerb = hasTokenStartingWith(tokens, ["vent", "vend"]);
  const hasProductNoun = hasTokenStartingWith(tokens, ["produc", "articul", "item"]);
  const hasCreateVerb = hasTokenStartingWith(tokens, ["crea", "regist", "agreg", "alta", "mont", "nuev"]);
  const hasReportNoun = hasTokenStartingWith(tokens, ["report", "inform"]);
  const hasPaymentNoun = hasTokenStartingWith(tokens, ["pago", "metod", "medio", "tarjet", "efect"]);
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

  if (hasPhrase(text, ["hola", "buenos dias", "buenas tardes", "buenas noches"])) return "greeting";
  if (hasPhrase(text, ["ayuda", "que haces", "que puedes", "como funciona", "cómo funciona"])) return "help";

  if (hasReportNoun && (asksHow || hasTokenStartingWith(tokens, ["ver", "gener", "sac", "consult"]))) {
    return "how_reports";
  }
  if (hasProductNoun && hasCreateVerb) {
    return "how_create_product";
  }
  if (hasSalesVerb && hasPhrase(text, ["ayer", "buscar", "encontrar"])) {
    return "how_find_sale";
  }
  if (hasSalesVerb && hasMonthToken && hasPhrase(text, ["hasta ahora", "mismo corte", "mes anterior", "mes pasado"]) && hasIncreaseNoun) {
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

function resolveIntentWithContext(input: string, lastTopic: KoraTopic): QueryIntent {
  const direct = detectIntent(input);
  if (direct !== "unknown") return direct;

  const text = normalizeQuery(input);
  const followUp = text.startsWith("y ") || text.startsWith("y si") || text.startsWith("entonces");
  if (!followUp || !lastTopic) return "unknown";

  if (lastTopic === "sales") {
    if (text.includes("antes")) return "last_sale_followup_previous";
    if (text.includes("producto") || text.includes("cual fue") || text.includes("que fue")) return "last_sale_followup_product";
    if (text.includes("mes")) return "sales_month";
    if (text.includes("hoy") || text.includes("dia")) return "sales_today";
    if (text.includes("ticket")) return "sales_tickets";
    if (text.includes("separado") || text.includes("pendiente")) return "separated_pending";
    return "sales_overview";
  }

  if (lastTopic === "inventory") {
    if (text.includes("critico")) return "inventory_critical";
    if (text.includes("bajo")) return "inventory_low";
    return "inventory_overview";
  }

  if (lastTopic === "web") {
    if (text.includes("pendiente")) return "web_pending";
    if (text.includes("proceso") || text.includes("procesando") || text.includes("lista")) return "web_processing";
    return "web_overview";
  }

  return "unknown";
}

function intentLabel(intent: QueryIntent) {
  const labels: Partial<Record<QueryIntent, string>> = {
    how_reports: "Ver reportes",
    how_create_product: "Crear producto",
    payment_methods_by_date: "Métodos de pago por fecha",
    sales_specific_date: "Ventas por fecha",
    sales_mtd_comparison: "Comparativo mes vs anterior",
    sales_method_month_comparison: "Comparativo por método (mes)",
    sales_method_year_comparison: "Comparativo por método (año)",
    top_product_current_month: "Producto más vendido del mes",
    product_by_code: "Buscar producto por código",
    product_group_lookup: "Consultar grupo de producto",
    last_sale_product: "Última venta de producto",
    sales_overview: "Resumen comercial",
    inventory_overview: "Resumen inventario",
    web_overview: "Resumen comercio web",
  };
  return labels[intent] ?? "Consulta";
}

function buildIntentCandidates(input: string): IntentCandidate[] {
  const text = normalizeQuery(input);
  const tokens = tokenizeQuery(input);
  const candidates: IntentCandidate[] = [];
  const push = (intent: QueryIntent, score: number) => candidates.push({ intent, score });

  const hasSales = hasTokenStartingWith(tokens, ["vent", "vend"]);
  const hasDate = !!parseSpecificDate(text);
  const hasPayment = hasTokenStartingWith(tokens, ["pago", "metod", "medio", "tarjet", "efect"]);
  const hasMonth = hasTokenStartingWith(tokens, ["mes"]);
  const hasIncrease = hasTokenStartingWith(tokens, ["increment", "aument", "crec", "compar", "diferen", "mas", "más"]);
  const hasYear = hasTokenStartingWith(tokens, ["ano", "año", "year"]);
  const hasMethod = !!resolvePaymentMethodFromQuery(text);
  const hasProduct = hasTokenStartingWith(tokens, ["produc", "item", "articul", "sku", "codig", "codigo"]);
  const hasGroup = hasTokenStartingWith(tokens, ["grupo", "categori", "pertenec"]);
  const hasLast = hasPhrase(text, ["ultima vez", "última vez", "ultimo", "último"]);
  const asksHow = hasTokenStartingWith(tokens, ["como", "cómo"]) || hasPhrase(text, ["de que forma", "de qué forma"]);

  if (hasSales && hasDate) push("sales_specific_date", 82);
  if (hasPayment && hasDate) push("payment_methods_by_date", 88);
  if (hasSales && hasMonth && hasIncrease) push("sales_mtd_comparison", 80);
  if (hasSales && hasMonth && hasIncrease && hasMethod) push("sales_method_month_comparison", 90);
  if (hasSales && hasYear && hasIncrease && hasMethod) push("sales_method_year_comparison", 90);
  if (hasProduct && hasGroup) push("product_group_lookup", 84);
  if (hasProduct && hasTokenStartingWith(tokens, ["cual", "cuál", "dime", "muestr", "busc", "info", "detalle"])) push("product_by_code", 78);
  if (hasLast && hasSales) push("last_sale_product", 86);
  if (hasPhrase(text, ["producto mas vendido", "producto más vendido", "top producto"])) push("top_product_current_month", 92);
  if (hasProduct && hasTokenStartingWith(tokens, ["crea", "regist", "agreg", "nuev"])) push("how_create_product", 85);
  if (asksHow && hasTokenStartingWith(tokens, ["report", "inform"])) push("how_reports", 85);

  return candidates.sort((a, b) => b.score - a.score);
}

function buildFallbackSuggestions(input: string): { text: string; actions: KoraAction[] } {
  const text = normalizeQuery(input);
  const actions: KoraAction[] = [];

  if (parseSpecificDate(text)) {
    actions.push(
      { id: "fb-sales-date", label: "Ver ventas de esa fecha", intent: "sales_specific_date", inputOverride: input },
      { id: "fb-pay-date", label: "Ver métodos de pago de esa fecha", intent: "payment_methods_by_date", inputOverride: input }
    );
    return {
      text: "Puedo ayudarte con la fecha, pero necesito más contexto de ventas o pagos. Elige una opción:",
      actions,
    };
  }

  if (text.includes("producto") || text.includes("sku") || text.includes("codigo") || text.includes("código")) {
    actions.push(
      { id: "fb-product-code", label: "Buscar producto por código", intent: "product_by_code", inputOverride: input },
      { id: "fb-product-group", label: "Consultar grupo de producto", intent: "product_group_lookup", inputOverride: input }
    );
    return {
      text: "Tu consulta parece de productos. Te sugiero reformular así:",
      actions,
    };
  }

  actions.push(
    { id: "fb-sales-mtd", label: "Comparar ventas mes vs anterior", intent: "sales_mtd_comparison", inputOverride: "cuánto más vendimos que el mes anterior hasta ahora" },
    { id: "fb-top-product", label: "Producto más vendido del mes", intent: "top_product_current_month", inputOverride: "cuál es el producto más vendido de este mes" },
    { id: "fb-last-sale", label: "Última venta de un producto", intent: "last_sale_product", inputOverride: "cuál fue la última vez que vendimos cable" }
  );
  return {
    text: "No la interpreté completa. Prueba una reformulación guiada:",
    actions,
  };
}

export default function KoraOpsAssistant({ enabled, userName, token }: KoraOpsAssistantProps) {
  const router = useRouter();
  const welcomeMessage = buildWelcomeMessage(userName);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<KoraMessage[]>([{ id: 1, role: "kora", text: welcomeMessage }]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const nextIdRef = useRef(2);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inventoryCacheRef = useRef<{ at: number; data: InventoryOverview } | null>(null);
  const salesCacheRef = useRef<{ at: number; data: SalesSnapshot } | null>(null);
  const webCacheRef = useRef<{ at: number; data: WebSnapshot } | null>(null);
  const monthlySalesCacheRef = useRef<Map<number, { at: number; data: MonthlySalesPoint[] }>>(new Map());
  const lastTopicRef = useRef<KoraTopic>(null);
  const lastSaleLookupRef = useRef<LastSaleLookupContext>(null);
  const pendingConfirmationRef = useRef<{ input: string; candidates: IntentCandidate[] } | null>(null);

  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, open]);

  useEffect(() => {
    if (!enabled || !open) return;
    function handlePointerDown(event: PointerEvent) {
      const root = rootRef.current;
      if (!root) return;
      const path = typeof event.composedPath === "function" ? event.composedPath() : [];
      if (path.includes(root)) return;
      setOpen(false);
    }
    window.addEventListener("pointerdown", handlePointerDown, true);
    return () => window.removeEventListener("pointerdown", handlePointerDown, true);
  }, [enabled, open]);

  if (!enabled) return null;

  function logMetric(entry: KoraMetricEntry) {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(KORA_METRICS_KEY);
      const current = raw ? (JSON.parse(raw) as KoraMetricEntry[]) : [];
      const next = [...current.slice(-(KORA_MAX_METRICS - 1)), entry];
      window.localStorage.setItem(KORA_METRICS_KEY, JSON.stringify(next));
    } catch {
      // no-op
    }
  }

  function pushMessage(role: KoraMessage["role"], text: string, actions?: KoraAction[]) {
    setMessages((current) => [...current, { id: nextIdRef.current++, role, text, actions }]);
  }

  function formatMoney(value: number) {
    return value.toLocaleString("es-CO", { maximumFractionDigits: 0, minimumFractionDigits: 0 });
  }

  function ensureToken() {
    if (token) return true;
    pushMessage("kora", "No pude validar la sesión actual. Recarga el panel e intenta de nuevo.");
    return false;
  }

  function isFresh(timestamp: number) {
    return Date.now() - timestamp < CACHE_TTL_MS;
  }

  async function readInventory() {
    const cached = inventoryCacheRef.current;
    if (cached && isFresh(cached.at)) return cached.data;
    const data = await fetchInventoryOverview(token as string);
    inventoryCacheRef.current = { at: Date.now(), data };
    return data;
  }

  async function readSales() {
    const cached = salesCacheRef.current;
    if (cached && isFresh(cached.at)) return cached.data;
    const apiBase = getApiBase();
    const [summaryRes, separated] = await Promise.all([
      fetch(`${apiBase}/dashboard/summary`, { headers: { Authorization: `Bearer ${token}` } }),
      fetchSeparatedOrders({ limit: 120 }, token),
    ]);
    if (!summaryRes.ok) throw new Error(`Error ${summaryRes.status} al consultar resumen de ventas.`);
    const summary = (await summaryRes.json()) as {
      today_sales_total?: number;
      today_tickets?: number;
      month_sales_total?: number;
      month_tickets?: number;
    };
    const pendingSeparated = separated.filter((order) => {
      const status = (order.status || "").toLowerCase();
      return status !== "cancelled" && status !== "completed" && (order.balance ?? 0) > 0;
    }).length;
    const data: SalesSnapshot = {
      todaySales: summary.today_sales_total ?? 0,
      todayTickets: summary.today_tickets ?? 0,
      monthSales: summary.month_sales_total ?? 0,
      monthTickets: summary.month_tickets ?? 0,
      pendingSeparated,
    };
    salesCacheRef.current = { at: Date.now(), data };
    return data;
  }

  async function readWeb() {
    const cached = webCacheRef.current;
    if (cached && isFresh(cached.at)) return cached.data;
    const orders = await fetchComercioWebOrders(token as string, { limit: 120 });
    const data: WebSnapshot = {
      totalOrders: orders.length,
      pendingPayment: orders.filter((order) => order.payment_status === "pending").length,
      paid: orders.filter((order) => order.payment_status === "approved").length,
      processing: orders.filter((order) => order.fulfillment_status === "processing").length,
      ready: orders.filter((order) => order.fulfillment_status === "ready").length,
      cancelled: orders.filter((order) => order.status === "cancelled").length,
    };
    webCacheRef.current = { at: Date.now(), data };
    return data;
  }

  async function readMonthlySeries(year: number) {
    const cached = monthlySalesCacheRef.current.get(year);
    if (cached && isFresh(cached.at)) return cached.data;
    const apiBase = getApiBase();
    const res = await fetch(`${apiBase}/dashboard/monthly-sales?year=${year}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Error ${res.status} al consultar serie mensual.`);
    const data = ((await res.json()) as MonthlySalesPoint[]) ?? [];
    monthlySalesCacheRef.current.set(year, { at: Date.now(), data });
    return data;
  }

  async function fetchSalesHistory(params: URLSearchParams) {
    const apiBase = getApiBase();
    const res = await fetch(`${apiBase}/pos/sales/history?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Error ${res.status} al consultar ventas históricas.`);
    return (await res.json()) as { total?: number; items?: SalesHistoryItem[] };
  }

  async function fetchQuickInsights(monthKey: string) {
    const apiBase = getApiBase();
    const month = Number(monthKey.slice(5, 7));
    const year = Number(monthKey.slice(0, 4));
    const params = new URLSearchParams({ year: String(year), month: String(month) });
    const res = await fetch(`${apiBase}/reports/quick/insights?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Error ${res.status} al consultar productos del mes.`);
    const json = (await res.json()) as { top_products?: QuickTopRow[] };
    return Array.isArray(json.top_products) ? json.top_products : [];
  }

  async function sumSalesForRange(dateFrom: string, dateTo: string, paymentMethod?: string | null) {
    const limit = 200;
    const maxPages = 8;
    let totalAmount = 0;
    let totalTickets = 0;

    for (let page = 0; page < maxPages; page += 1) {
      const params = new URLSearchParams({
        date_from: dateFrom,
        date_to: dateTo,
        skip: String(page * limit),
        limit: String(limit),
      });
      if (paymentMethod) params.set("payment_method", paymentMethod);

      const history = await fetchSalesHistory(params);
      const rows = history.items ?? [];
      for (const sale of rows) {
        totalAmount += sale.total ?? 0;
      }
      totalTickets += rows.length;
      if (rows.length < limit) break;
    }

    return { totalAmount, totalTickets };
  }

  async function findProductRecord(query: string) {
    const term = query.trim();
    if (!term) return null;
    const page = await fetchInventoryProducts(token as string, {
      search: term,
      limit: 25,
      sort: "name_asc",
    });
    const items = page.items ?? [];
    if (!items.length) return null;

    const normalizedTerm = normalizeQuery(term);
    const exact = items.find((item) => {
      const sku = normalizeQuery(item.sku ?? "");
      const barcode = normalizeQuery(item.barcode ?? "");
      return sku === normalizedTerm || barcode === normalizedTerm;
    });
    if (exact) return exact;

    const starts = items.find((item) => {
      const sku = normalizeQuery(item.sku ?? "");
      const barcode = normalizeQuery(item.barcode ?? "");
      const name = normalizeQuery(item.product_name ?? "");
      return sku.startsWith(normalizedTerm) || barcode.startsWith(normalizedTerm) || name.startsWith(normalizedTerm);
    });
    return starts ?? items[0] ?? null;
  }

  async function answerInventory(kind: "overview" | "critical" | "low") {
    if (!ensureToken()) return;
    setBusy(true);
    lastTopicRef.current = "inventory";
    try {
      const data = await readInventory();
      const criticalRows = data.status_rows.filter((row) => row.status === "critical").slice(0, 5);
      const lowRows = data.status_rows.filter((row) => row.status === "low").slice(0, 5);

      if (kind === "critical") {
        pushMessage(
          "kora",
          criticalRows.length
            ? `Productos en crítico (${data.summary.critical_count}): ${criticalRows.map((row) => `${row.product_name} (${row.qty_on_hand})`).join(", ")}.`
            : "No hay productos en estado crítico en este momento.",
          INVENTORY_ACTIONS
        );
        return;
      }

      if (kind === "low") {
        pushMessage(
          "kora",
          lowRows.length
            ? `Productos en bajo stock (${data.summary.low_stock_count}): ${lowRows.map((row) => `${row.product_name} (${row.qty_on_hand})`).join(", ")}.`
            : "No hay productos en bajo stock relevantes ahora.",
          INVENTORY_ACTIONS
        );
        return;
      }

      pushMessage(
        "kora",
        `Inventario actual:\n- Críticos: ${data.summary.critical_count}\n- Bajo stock: ${data.summary.low_stock_count}\n- Reposición sugerida: ${data.summary.reorder_count}\n- Anomalías: ${data.summary.anomaly_count}`,
        INVENTORY_ACTIONS
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible cargar inventario.";
      pushMessage("kora", `No pude consultar inventario en este momento. ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function answerSales(kind: "overview" | "today" | "month" | "tickets" | "separated") {
    if (!ensureToken()) return;
    setBusy(true);
    lastTopicRef.current = "sales";
    try {
      const data = await readSales();

      if (kind === "today") {
        pushMessage(
          "kora",
          `Ventas de hoy:\n- Total: ${formatMoney(data.todaySales)} COP\n- Tickets: ${data.todayTickets}\n- Ticket promedio: ${formatMoney(data.todayTickets > 0 ? data.todaySales / data.todayTickets : 0)} COP`,
          SALES_ACTIONS
        );
        return;
      }

      if (kind === "month") {
        pushMessage(
          "kora",
          `Ventas del mes:\n- Total: ${formatMoney(data.monthSales)} COP\n- Tickets: ${data.monthTickets}\n- Ticket promedio: ${formatMoney(data.monthTickets > 0 ? data.monthSales / data.monthTickets : 0)} COP`,
          SALES_ACTIONS
        );
        return;
      }

      if (kind === "tickets") {
        pushMessage(
          "kora",
          `Tickets:\n- Hoy: ${data.todayTickets}\n- Mes: ${data.monthTickets}\n- Separados pendientes: ${data.pendingSeparated}`,
          SALES_ACTIONS
        );
        return;
      }

      if (kind === "separated") {
        pushMessage("kora", `Separados pendientes actualmente: ${data.pendingSeparated}.`, SALES_ACTIONS);
        return;
      }

      pushMessage(
        "kora",
        `Resumen comercial:\n- Venta de hoy: ${formatMoney(data.todaySales)} COP\n- Tickets hoy: ${data.todayTickets}\n- Venta del mes: ${formatMoney(data.monthSales)} COP\n- Tickets mes: ${data.monthTickets}\n- Separados pendientes: ${data.pendingSeparated}`,
        SALES_ACTIONS
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible cargar ventas.";
      pushMessage("kora", `No pude consultar ventas en este momento. ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function answerWeb(kind: "overview" | "pending" | "processing") {
    if (!ensureToken()) return;
    setBusy(true);
    lastTopicRef.current = "web";
    try {
      const data = await readWeb();
      if (kind === "pending") {
        pushMessage("kora", `Comercio web: ${data.pendingPayment} órdenes pendientes de pago.`, WEB_ACTIONS);
        return;
      }
      if (kind === "processing") {
        pushMessage("kora", `Comercio web: ${data.processing} órdenes en procesamiento y ${data.ready} listas para entregar.`, WEB_ACTIONS);
        return;
      }
      pushMessage(
        "kora",
        `Resumen de comercio web:\n- Órdenes revisadas: ${data.totalOrders}\n- Pendientes de pago: ${data.pendingPayment}\n- Pagadas: ${data.paid}\n- En procesamiento: ${data.processing}\n- Listas para entregar: ${data.ready}\n- Canceladas: ${data.cancelled}`,
        WEB_ACTIONS
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible cargar comercio web.";
      pushMessage("kora", `No pude consultar comercio web en este momento. ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function answerPreviousMonthSales() {
    if (!ensureToken()) return;
    setBusy(true);
    lastTopicRef.current = "sales";
    try {
      const now = new Date();
      const currentYear = Number.parseInt(
        new Intl.DateTimeFormat("en-CA", { year: "numeric", timeZone: "America/Bogota" }).format(now),
        10
      );
      const currentMonth = Number.parseInt(
        new Intl.DateTimeFormat("en-CA", { month: "2-digit", timeZone: "America/Bogota" }).format(now),
        10
      );
      const targetMonth = currentMonth === 1 ? 12 : currentMonth - 1;
      const targetYear = currentMonth === 1 ? currentYear - 1 : currentYear;
      const series = await readMonthlySeries(targetYear);
      const point = series.find((row) => row.month === targetMonth);
      const total = point?.total ?? 0;
      const tickets = point?.tickets ?? 0;
      pushMessage(
        "kora",
        `Ventas de ${monthLabel(targetMonth)} ${targetYear}:\n- Total: ${formatMoney(total)} COP\n- Tickets: ${tickets}\n- Ticket promedio: ${formatMoney(tickets > 0 ? total / tickets : 0)} COP`,
        SALES_ACTIONS
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible cargar ventas del mes anterior.";
      pushMessage("kora", `No pude consultar el mes anterior. ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function answerSalesMonthToDateComparison() {
    if (!ensureToken()) return;
    setBusy(true);
    lastTopicRef.current = "sales";
    try {
      const { year, month, day } = getBogotaDateParts();
      const currentFrom = new Date(Date.UTC(year, month - 1, 1));
      const currentTo = new Date(Date.UTC(year, month - 1, day));
      const previousMonthDate = new Date(Date.UTC(year, month - 2, 1));
      const prevYear = previousMonthDate.getUTCFullYear();
      const prevMonth = previousMonthDate.getUTCMonth() + 1;
      const prevFrom = new Date(Date.UTC(prevYear, prevMonth - 1, 1));
      const prevMonthDays = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
      const prevTo = new Date(Date.UTC(prevYear, prevMonth - 1, Math.min(day, prevMonthDays)));

      const currentRange = buildDateRangeKeys(currentFrom, currentTo);
      const previousRange = buildDateRangeKeys(prevFrom, prevTo);
      const [current, previous] = await Promise.all([
        sumSalesForRange(currentRange.date_from, currentRange.date_to),
        sumSalesForRange(previousRange.date_from, previousRange.date_to),
      ]);

      const diffValue = current.totalAmount - previous.totalAmount;
      const diffPct = diffPercent(current.totalAmount, previous.totalAmount);
      pushMessage(
        "kora",
        `Comparativo mes actual vs mes anterior (mismo corte al día ${day}):\n- Actual: ${formatMoney(current.totalAmount)} COP\n- Anterior: ${formatMoney(previous.totalAmount)} COP\n- Diferencia: ${formatSignedMoney(diffValue)} COP (${formatSignedPercent(diffPct)})`,
        SALES_ACTIONS
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible comparar ventas del mes.";
      pushMessage("kora", `No pude calcular ese comparativo ahora. ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function answerSalesMethodMonthComparison(input: string) {
    if (!ensureToken()) return;
    const paymentMethod = resolvePaymentMethodFromQuery(input);
    if (!paymentMethod) {
      pushMessage("kora", "Indícame el método. Ejemplo: incremento de ventas por Addi del mes anterior a este.");
      return;
    }
    setBusy(true);
    lastTopicRef.current = "sales";
    try {
      const { year, month, day } = getBogotaDateParts();
      const currentFrom = new Date(Date.UTC(year, month - 1, 1));
      const currentTo = new Date(Date.UTC(year, month - 1, day));
      const previousMonthDate = new Date(Date.UTC(year, month - 2, 1));
      const prevYear = previousMonthDate.getUTCFullYear();
      const prevMonth = previousMonthDate.getUTCMonth() + 1;
      const prevFrom = new Date(Date.UTC(prevYear, prevMonth - 1, 1));
      const prevMonthDays = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
      const prevTo = new Date(Date.UTC(prevYear, prevMonth - 1, Math.min(day, prevMonthDays)));

      const currentRange = buildDateRangeKeys(currentFrom, currentTo);
      const previousRange = buildDateRangeKeys(prevFrom, prevTo);
      const [current, previous] = await Promise.all([
        sumSalesForRange(currentRange.date_from, currentRange.date_to, paymentMethod.slug),
        sumSalesForRange(previousRange.date_from, previousRange.date_to, paymentMethod.slug),
      ]);

      const diffValue = current.totalAmount - previous.totalAmount;
      const diffPct = diffPercent(current.totalAmount, previous.totalAmount);
      pushMessage(
        "kora",
        `Incremento de ${paymentMethod.label} (mes actual vs mes anterior, mismo corte):\n- Actual: ${formatMoney(current.totalAmount)} COP\n- Anterior: ${formatMoney(previous.totalAmount)} COP\n- Diferencia: ${formatSignedMoney(diffValue)} COP (${formatSignedPercent(diffPct)})`,
        SALES_ACTIONS
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible calcular incremento por método.";
      pushMessage("kora", `No pude calcular ese incremento ahora. ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function answerSalesMethodYearComparison(input: string) {
    if (!ensureToken()) return;
    const paymentMethod = resolvePaymentMethodFromQuery(input);
    if (!paymentMethod) {
      pushMessage("kora", "Indícame el método. Ejemplo: incremento de Addi del año anterior a este.");
      return;
    }
    setBusy(true);
    lastTopicRef.current = "sales";
    try {
      const { year, month, day } = getBogotaDateParts();
      const currentFrom = new Date(Date.UTC(year, 0, 1));
      const currentTo = new Date(Date.UTC(year, month - 1, day));
      const previousFrom = new Date(Date.UTC(year - 1, 0, 1));
      const previousTo = new Date(Date.UTC(year - 1, month - 1, day));

      const currentRange = buildDateRangeKeys(currentFrom, currentTo);
      const previousRange = buildDateRangeKeys(previousFrom, previousTo);
      const [current, previous] = await Promise.all([
        sumSalesForRange(currentRange.date_from, currentRange.date_to, paymentMethod.slug),
        sumSalesForRange(previousRange.date_from, previousRange.date_to, paymentMethod.slug),
      ]);

      const diffValue = current.totalAmount - previous.totalAmount;
      const diffPct = diffPercent(current.totalAmount, previous.totalAmount);
      pushMessage(
        "kora",
        `Incremento anual de ${paymentMethod.label} (año actual vs año anterior, mismo corte):\n- Actual: ${formatMoney(current.totalAmount)} COP\n- Anterior: ${formatMoney(previous.totalAmount)} COP\n- Diferencia: ${formatSignedMoney(diffValue)} COP (${formatSignedPercent(diffPct)})`,
        SALES_ACTIONS
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible calcular incremento anual por método.";
      pushMessage("kora", `No pude calcular ese comparativo anual ahora. ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function answerTopProductCurrentMonth() {
    if (!ensureToken()) return;
    setBusy(true);
    lastTopicRef.current = "sales";
    try {
      const { year, month } = getBogotaDateParts();
      const monthKey = `${year}-${pad2(month)}`;
      const topProducts = await fetchQuickInsights(monthKey);
      const top = topProducts[0];
      if (!top) {
        pushMessage("kora", "No encontré ventas suficientes este mes para definir un top producto.", SALES_ACTIONS);
        return;
      }
      pushMessage(
        "kora",
        `Producto más vendido de ${monthLabel(month)} ${year}:\n- ${top.name}\n- Unidades: ${Math.max(0, Math.trunc(top.units))}\n- Venta total: ${formatMoney(top.total)} COP`,
        SALES_ACTIONS
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible consultar top producto del mes.";
      pushMessage("kora", `No pude consultar el top producto ahora. ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function answerSalesBySpecificDate(input: string) {
    if (!ensureToken()) return;
    const parsed = parseSpecificDate(input);
    if (!parsed) {
      pushMessage("kora", "No pude interpretar esa fecha. Prueba por ejemplo: 3 de febrero o 03/02/2026.");
      return;
    }
    setBusy(true);
    lastTopicRef.current = "sales";
    try {
      const params = new URLSearchParams({
        date_from: parsed.key,
        date_to: parsed.key,
        skip: "0",
        limit: "200",
      });
      const history = await fetchSalesHistory(params);
      const rows = history.items ?? [];
      const total = rows.reduce((acc, row) => acc + (row.total ?? 0), 0);
      const actionParams = new URLSearchParams({ saleDate: parsed.key });
      pushMessage(
        "kora",
        `Ventas del ${parsed.day} de ${monthLabel(parsed.month)} de ${parsed.year}:\n- Ventas registradas: ${rows.length}\n- Total vendido: ${formatMoney(total)} COP`,
        [{ id: "sales-open-day", label: "Abrir ventas de esa fecha", href: `/dashboard/sales?${actionParams.toString()}` }]
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible cargar ventas por fecha.";
      pushMessage("kora", `No pude consultar esa fecha ahora. ${message}`);
    } finally {
      setBusy(false);
    }
  }

  function formatMethodLabel(method: string) {
    const cleaned = method
      .replace(/[_-]+/g, " ")
      .trim()
      .toLowerCase();
    if (!cleaned) return "Sin método";
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  async function answerPaymentMethodsByDate(input: string) {
    if (!ensureToken()) return;
    const parsed = parseSpecificDate(input);
    if (!parsed) {
      pushMessage("kora", "No pude interpretar esa fecha. Prueba por ejemplo: 21 de febrero o 21/02/2026.");
      return;
    }

    setBusy(true);
    lastTopicRef.current = "sales";
    try {
      const params = new URLSearchParams({
        date_from: parsed.key,
        date_to: parsed.key,
        skip: "0",
        limit: "250",
      });
      const history = await fetchSalesHistory(params);
      const rows = history.items ?? [];

      const byMethod = new Map<string, { tickets: number; total: number }>();
      for (const sale of rows) {
        const saleTotal = sale.total ?? 0;
        const nestedPayments = sale.payments ?? [];
        if (nestedPayments.length) {
          for (const payment of nestedPayments) {
            const method = (payment.method || "").trim().toLowerCase() || "sin_metodo";
            const amount = payment.amount ?? 0;
            const prev = byMethod.get(method) ?? { tickets: 0, total: 0 };
            byMethod.set(method, {
              tickets: prev.tickets + 1,
              total: prev.total + amount,
            });
          }
          continue;
        }

        const fallback = (sale.payment_method || "sin_metodo").trim().toLowerCase();
        const prev = byMethod.get(fallback) ?? { tickets: 0, total: 0 };
        byMethod.set(fallback, {
          tickets: prev.tickets + 1,
          total: prev.total + saleTotal,
        });
      }

      const summary = [...byMethod.entries()]
        .map(([method, data]) => ({ method, ...data }))
        .sort((a, b) => b.total - a.total);

      if (!summary.length) {
        pushMessage(
          "kora",
          `No encontré ventas con métodos de pago para el ${parsed.day} de ${monthLabel(parsed.month)} de ${parsed.year}.`,
          [{ id: "payment-open-day-empty", label: "Abrir ventas de esa fecha", href: `/dashboard/sales?saleDate=${parsed.key}` }]
        );
        return;
      }

      const lines = summary
        .slice(0, 6)
        .map((row) => `- ${formatMethodLabel(row.method)}: ${row.tickets} registros · ${formatMoney(row.total)} COP`)
        .join("\n");
      pushMessage(
        "kora",
        `Métodos de pago del ${parsed.day} de ${monthLabel(parsed.month)} de ${parsed.year}:\n${lines}`,
        [{ id: "payment-open-day", label: "Abrir ventas de esa fecha", href: `/dashboard/sales?saleDate=${parsed.key}` }]
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible consultar métodos de pago por fecha.";
      pushMessage("kora", `No pude consultar métodos de pago para esa fecha. ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function answerProductByCode(input: string) {
    if (!ensureToken()) return;
    const code = extractProductCode(input);
    if (!code) {
      pushMessage("kora", "Para buscar por código, escríbeme algo como: producto código ABC123 o SKU 100045.");
      return;
    }
    setBusy(true);
    lastTopicRef.current = "inventory";
    try {
      const product = await findProductRecord(code);
      if (!product) {
        pushMessage("kora", `No encontré un producto con código ${code}.`, PRODUCT_ACTIONS);
        return;
      }
      pushMessage(
        "kora",
        `Producto encontrado:\n- Nombre: ${product.product_name}\n- SKU: ${product.sku ?? "—"}\n- Código barras: ${product.barcode ?? "—"}\n- Grupo: ${product.group_name ?? "Sin grupo"}\n- Stock: ${product.qty_on_hand}`,
        PRODUCT_ACTIONS
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible consultar productos.";
      pushMessage("kora", `No pude buscar ese código ahora. ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function answerProductGroup(input: string) {
    if (!ensureToken()) return;
    const codeOrTerm = extractProductCode(input) || extractProductTerm(input);
    if (!codeOrTerm) {
      pushMessage("kora", "Dime el producto o código. Ejemplo: ¿a qué grupo pertenece SKU 100045?");
      return;
    }
    setBusy(true);
    lastTopicRef.current = "inventory";
    try {
      const product = await findProductRecord(codeOrTerm);
      if (!product) {
        pushMessage("kora", `No encontré ese producto (${codeOrTerm}).`, PRODUCT_ACTIONS);
        return;
      }
      pushMessage(
        "kora",
        `${product.product_name} pertenece al grupo: ${product.group_name ?? "Sin grupo asignado"}.`,
        PRODUCT_ACTIONS
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible consultar el grupo del producto.";
      pushMessage("kora", `No pude consultar ese grupo ahora. ${message}`);
    } finally {
      setBusy(false);
    }
  }

  function rowContainsProduct(row: SalesHistoryItem, productTerm: string) {
    const target = normalizeQuery(productTerm);
    if (!target) return false;
    const items = row.items ?? [];
    return items.some((item) => {
      const name = normalizeQuery(item.product_name || item.name || "");
      const sku = normalizeQuery(item.product_sku || "");
      return name.includes(target) || sku.includes(target);
    });
  }

  function resolveMatchedProductsText(sale: SalesHistoryItem, query: string) {
    const items = sale.items ?? [];
    if (!items.length) return "No pude leer el detalle de productos de esa venta.";
    const target = normalizeQuery(query);
    const matched = items.filter((item) => {
      const name = normalizeQuery(item.product_name || item.name || "");
      const sku = normalizeQuery(item.product_sku || "");
      return !!target && (name.includes(target) || sku.includes(target));
    });
    const source = matched.length ? matched : items;
    const preview = source
      .slice(0, 4)
      .map((item) => {
        const name = item.product_name || item.name || "Producto";
        const qty = Number(item.quantity ?? 0) > 0 ? ` x${item.quantity}` : "";
        const sku = item.product_sku ? ` (${item.product_sku})` : "";
        return `${name}${qty}${sku}`;
      })
      .join(", ");
    return preview || "No pude leer el detalle de productos de esa venta.";
  }

  function buildSaleActions(sale: SalesHistoryItem) {
    const saleDate = sale.created_at ? getBogotaDateKey(new Date(sale.created_at)) ?? "" : "";
    const params = new URLSearchParams();
    if (saleDate) params.set("saleDate", saleDate);
    params.set("saleId", String(sale.id));
    return [{ id: `sales-open-${sale.id}`, label: "Abrir esa venta", href: `/dashboard/sales?${params.toString()}` }];
  }

  async function answerLastSaleForProduct(input: string) {
    if (!ensureToken()) return;
    const productTerm = extractProductCode(input) || extractProductTerm(input);
    if (!productTerm) {
      pushMessage("kora", "Indícame el producto. Ejemplo: ¿cuándo fue la última vez que vendimos cabina 8A?");
      return;
    }
    setBusy(true);
    lastTopicRef.current = "sales";
    try {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 540);
      const dateFrom = getBogotaDateKey(fromDate) ?? "";
      const maxPages = 6;
      const limit = 100;
      const matches: SalesHistoryItem[] = [];

      for (let page = 0; page < maxPages; page++) {
        const params = new URLSearchParams({
          date_from: dateFrom,
          skip: String(page * limit),
          limit: String(limit),
          term: productTerm,
        });
        const history = await fetchSalesHistory(params);
        const rows = (history.items ?? []).sort((a, b) => {
          const aTime = new Date(a.created_at ?? "").getTime();
          const bTime = new Date(b.created_at ?? "").getTime();
          return bTime - aTime;
        });
        for (const row of rows) {
          if (rowContainsProduct(row, productTerm)) matches.push(row);
          if (matches.length >= 20) break;
        }
        if (matches.length >= 20 || rows.length < limit) break;
      }

      const found = matches[0] ?? null;
      if (!found || !found.created_at) {
        lastSaleLookupRef.current = null;
        pushMessage(
          "kora",
          `No encontré ventas recientes para "${productTerm}" en el rango consultado.`,
          SALES_ACTIONS
        );
        return;
      }

      const soldAt = new Intl.DateTimeFormat("es-CO", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Bogota",
      }).format(new Date(found.created_at));

      lastSaleLookupRef.current = {
        query: productTerm,
        matches,
        currentIndex: 0,
      };
      const productsPreview = resolveMatchedProductsText(found, productTerm);
      pushMessage(
        "kora",
        `La última venta encontrada de "${productTerm}" fue el ${soldAt}.\n${saleLabel(found)}.\nProducto(s): ${productsPreview}`,
        buildSaleActions(found)
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible buscar la última venta.";
      pushMessage("kora", `No pude consultar esa última venta ahora. ${message}`);
    } finally {
      setBusy(false);
    }
  }

  function answerLastSaleFollowupProduct() {
    const context = lastSaleLookupRef.current;
    if (!context?.matches.length) {
      pushMessage("kora", "Primero pregúntame por la última venta de un producto. Ejemplo: última vez que vendimos cable.");
      return;
    }
    const current = context.matches[context.currentIndex];
    const productsPreview = resolveMatchedProductsText(current, context.query);
    pushMessage(
      "kora",
      `En ${saleLabel(current)} se vendió: ${productsPreview}.`,
      buildSaleActions(current)
    );
  }

  function answerLastSaleFollowupPrevious() {
    const context = lastSaleLookupRef.current;
    if (!context?.matches.length) {
      pushMessage("kora", "No tengo una búsqueda previa activa. Pregunta primero por la última venta de un producto.");
      return;
    }
    const nextIndex = context.currentIndex + 1;
    const nextSale = context.matches[nextIndex];
    if (!nextSale || !nextSale.created_at) {
      pushMessage("kora", `No encontré una venta anterior para "${context.query}" en el rango revisado.`);
      return;
    }
    context.currentIndex = nextIndex;
    lastSaleLookupRef.current = context;

    const soldAt = new Intl.DateTimeFormat("es-CO", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Bogota",
    }).format(new Date(nextSale.created_at));
    const productsPreview = resolveMatchedProductsText(nextSale, context.query);
    pushMessage(
      "kora",
      `La venta anterior para "${context.query}" fue el ${soldAt}.\n${saleLabel(nextSale)}.\nProducto(s): ${productsPreview}`,
      buildSaleActions(nextSale)
    );
  }

  async function dispatchIntent(intent: QueryIntent, input: string) {
    if (intent === "greeting") {
      pushMessage("kora", `${resolveGreetingByBogotaTime()}, aquí estoy para ayudarte.`);
      return "handled" as const;
    }
    if (intent === "help") {
      pushMessage(
        "kora",
        "Puedo ayudarte con operación diaria de Metrik. Ejemplos: “cómo ver reportes”, “cómo crear un producto”, “buscar venta de ayer de cabina”, “críticos de inventario”, “ventas hoy”."
      );
      return "handled" as const;
    }
    if (intent === "last_sale_followup_product") {
      answerLastSaleFollowupProduct();
      return "handled" as const;
    }
    if (intent === "last_sale_followup_previous") {
      answerLastSaleFollowupPrevious();
      return "handled" as const;
    }
    if (intent === "how_reports") {
      lastTopicRef.current = "sales";
      pushMessage(
        "kora",
        "Para ver reportes en Metrik:\n1. Entra a Reportes.\n2. Ajusta rango de fechas y filtros.\n3. Revisa resumen general.\n4. Si quieres más detalle, abre Reporte detallado.",
        REPORT_GUIDE_ACTIONS
      );
      return "handled" as const;
    }
    if (intent === "how_create_product") {
      lastTopicRef.current = "inventory";
      pushMessage(
        "kora",
        "Para crear un producto:\n1. Ve a Productos.\n2. Clic en crear nuevo producto.\n3. Completa nombre, SKU, categoría y precio.\n4. Guarda y valida inventario inicial.",
        PRODUCT_GUIDE_ACTIONS
      );
      return "handled" as const;
    }
    if (intent === "how_find_sale") {
      lastTopicRef.current = "sales";
      const productHint = extractProductHint(input);
      const detail = productHint
        ? `Te dejo ventas de ayer con filtro sugerido para: ${productHint}.`
        : "Te llevo a ventas de ayer para que filtres por producto.";
      pushMessage(
        "kora",
        `${detail}\n1. Abre ventas de ayer.\n2. Revisa la lista y usa el filtro de término si necesitas ajustar.\n3. Entra al detalle de la venta para validar ítems y pagos.`,
        buildFindSaleActions(productHint)
      );
      return "handled" as const;
    }
    if (intent === "payment_methods_by_date") {
      await answerPaymentMethodsByDate(input);
      return "handled" as const;
    }
    if (intent === "sales_mtd_comparison") {
      await answerSalesMonthToDateComparison();
      return "handled" as const;
    }
    if (intent === "sales_method_month_comparison") {
      await answerSalesMethodMonthComparison(input);
      return "handled" as const;
    }
    if (intent === "sales_method_year_comparison") {
      await answerSalesMethodYearComparison(input);
      return "handled" as const;
    }
    if (intent === "top_product_current_month") {
      await answerTopProductCurrentMonth();
      return "handled" as const;
    }
    if (intent === "sales_previous_month") {
      await answerPreviousMonthSales();
      return "handled" as const;
    }
    if (intent === "sales_specific_date") {
      await answerSalesBySpecificDate(input);
      return "handled" as const;
    }
    if (intent === "product_by_code") {
      await answerProductByCode(input);
      return "handled" as const;
    }
    if (intent === "product_group_lookup") {
      await answerProductGroup(input);
      return "handled" as const;
    }
    if (intent === "last_sale_product") {
      await answerLastSaleForProduct(input);
      return "handled" as const;
    }
    if (intent === "inventory_overview") {
      await answerInventory("overview");
      return "handled" as const;
    }
    if (intent === "inventory_critical") {
      await answerInventory("critical");
      return "handled" as const;
    }
    if (intent === "inventory_low") {
      await answerInventory("low");
      return "handled" as const;
    }
    if (intent === "sales_overview") {
      await answerSales("overview");
      return "handled" as const;
    }
    if (intent === "sales_today") {
      await answerSales("today");
      return "handled" as const;
    }
    if (intent === "sales_month") {
      await answerSales("month");
      return "handled" as const;
    }
    if (intent === "sales_tickets") {
      await answerSales("tickets");
      return "handled" as const;
    }
    if (intent === "separated_pending") {
      await answerSales("separated");
      return "handled" as const;
    }
    if (intent === "web_overview") {
      await answerWeb("overview");
      return "handled" as const;
    }
    if (intent === "web_pending") {
      await answerWeb("pending");
      return "handled" as const;
    }
    if (intent === "web_processing") {
      await answerWeb("processing");
      return "handled" as const;
    }
    return "fallback" as const;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const input = draft.trim();
    if (!input) return;
    const startedAt = Date.now();

    pushMessage("user", input);
    setDraft("");

    const intent = resolveIntentWithContext(input, lastTopicRef.current);
    if (intent !== "unknown") {
      const status = await dispatchIntent(intent, input);
      logMetric({
        at: new Date().toISOString(),
        source: "message",
        input,
        intent,
        status,
        latencyMs: Date.now() - startedAt,
      });
      return;
    }

    const candidates = buildIntentCandidates(input);
    if (candidates.length >= 2 && candidates[0].score - candidates[1].score <= 8) {
      pendingConfirmationRef.current = { input, candidates: candidates.slice(0, 2) };
      pushMessage(
        "kora",
        `Tu consulta puede significar dos cosas. ¿Cuál quieres que resuelva?`,
        candidates.slice(0, 2).map((candidate) => ({
          id: `confirm-${candidate.intent}`,
          label: intentLabel(candidate.intent),
          intent: candidate.intent,
          inputOverride: input,
        }))
      );
      logMetric({
        at: new Date().toISOString(),
        source: "message",
        input,
        intent: "unknown",
        status: "confirm",
        latencyMs: Date.now() - startedAt,
      });
      return;
    }

    const fallback = buildFallbackSuggestions(input);
    pushMessage("kora", fallback.text, fallback.actions);
    logMetric({
      at: new Date().toISOString(),
      source: "message",
      input,
      intent: "unknown",
      status: "fallback",
      latencyMs: Date.now() - startedAt,
    });
  }

  async function handleAction(action: KoraAction) {
    const startedAt = Date.now();
    pushMessage("user", action.label);
    if (action.intent) {
      const intentInput = action.inputOverride || action.label;
      const status = await dispatchIntent(action.intent, intentInput);
      logMetric({
        at: new Date().toISOString(),
        source: "action",
        input: intentInput,
        intent: action.intent,
        status,
        latencyMs: Date.now() - startedAt,
      });
      return;
    }
    if (!action.href) return;
    if (action.href.startsWith("/dashboard/movements") || action.href.startsWith("/dashboard/products")) {
      lastTopicRef.current = "inventory";
    } else if (action.href.startsWith("/dashboard/reports") || action.href.startsWith("/dashboard/sales")) {
      lastTopicRef.current = "sales";
    } else if (action.href.startsWith("/dashboard/comercio-web")) {
      lastTopicRef.current = "web";
    }
    router.push(action.href);
    setOpen(false);
  }

  function handleReset() {
    setMessages([{ id: 1, role: "kora", text: welcomeMessage }]);
    setDraft("");
    lastTopicRef.current = null;
    lastSaleLookupRef.current = null;
    pendingConfirmationRef.current = null;
    nextIdRef.current = 2;
  }

  return (
    <div ref={rootRef} className="fixed right-5 bottom-5 z-[140] md:right-6 md:bottom-6">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="h-12 w-[78px] md:h-12 md:w-[82px] rounded-full border text-sm font-bold tracking-[0.08em] transition hover:translate-y-[-1px]"
        style={{
          borderColor: "rgba(255,255,255,0.55)",
          background: "linear-gradient(145deg, #34d399 0%, #10b981 100%)",
          color: "#ffffff",
          boxShadow: "0 16px 30px -16px rgba(16,185,129,0.82)",
        }}
        aria-label={open ? "Cerrar asistente KORA" : "Abrir asistente KORA"}
        aria-expanded={open}
      >
        KORA
      </button>

      <section
        className={[
          "absolute right-0 w-[min(420px,calc(100vw-24px))] overflow-hidden rounded-2xl border transition-all",
          open ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0",
        ].join(" ")}
        style={{
          bottom: "calc(100% + 12px)",
          borderColor: "rgba(16, 185, 129, 0.35)",
          background: "#ffffff",
          color: "#0f172a",
          boxShadow: "0 24px 50px -24px rgba(2, 6, 23, 0.82)",
        }}
        role="dialog"
        aria-label="Asistente KORA operativo"
      >
        <header
          className="flex items-center justify-between border-b px-3 py-2.5"
          style={{ borderColor: "rgba(16, 185, 129, 0.28)", background: "#10b981", color: "#ffffff" }}
        >
          <div>
            <p className="text-sm font-bold tracking-[0.12em]">KORA</p>
            <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.92)" }}>Asistente operativo</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="rounded-md border px-2.5 py-1 text-[11px] font-semibold"
              style={{
                borderColor: "rgba(255,255,255,0.48)",
                background: "rgba(255,255,255,0.16)",
                color: "#ffffff",
              }}
            >
              Reiniciar
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-7 w-7 rounded-md border text-base leading-none"
              style={{
                borderColor: "rgba(255,255,255,0.48)",
                background: "rgba(255,255,255,0.16)",
                color: "#ffffff",
              }}
              aria-label="Cerrar panel KORA"
            >
              ×
            </button>
          </div>
        </header>

        <div className="max-h-[56vh] space-y-3 overflow-y-auto p-4" style={{ background: "#ffffff" }}>
          {messages.map((message) => (
            <article key={message.id} className={message.role === "kora" ? "max-w-[92%]" : "ml-auto max-w-[92%]"}>
              <p
                className={["whitespace-pre-line rounded-xl px-3 py-2 text-sm leading-relaxed", message.role === "kora" ? "border" : ""].join(" ")}
                style={
                  message.role === "kora"
                    ? { borderColor: "rgba(148, 163, 184, 0.38)", background: "#f8fafc", color: "#0f172a" }
                    : { background: "#10b981", color: "#ffffff" }
                }
              >
                {message.text}
              </p>

              {message.actions?.length ? (
                <div className="mt-2 grid gap-2">
                  {message.actions.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => {
                        void handleAction(action);
                      }}
                      className="rounded-lg border px-3 py-2 text-left text-sm font-semibold"
                      style={{ borderColor: "rgba(16,185,129,0.5)", background: "#ffffff", color: "#0f172a" }}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
          {busy ? <p className="text-xs font-semibold text-slate-500">KORA está consultando información...</p> : null}
          <div ref={endRef} />
        </div>

        <footer className="border-t p-3" style={{ borderColor: "rgba(148, 163, 184, 0.3)", background: "#ffffff" }}>
          <form onSubmit={handleSubmit} className="grid grid-cols-[1fr_auto] gap-2">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Escribe tu mensaje..."
              className="h-10 rounded-lg border px-3 text-sm outline-none"
              style={{ borderColor: "rgba(16,185,129,0.45)" }}
              maxLength={180}
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="h-10 rounded-lg border px-3 text-sm font-semibold"
              style={{
                borderColor: "rgba(16,185,129,0.55)",
                background: "#10b981",
                color: "#ffffff",
                opacity: busy ? 0.72 : 1,
              }}
            >
              Enviar
            </button>
          </form>
        </footer>
      </section>
    </div>
  );
}

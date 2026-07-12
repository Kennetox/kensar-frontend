"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import {
  fetchInventoryOverview,
  fetchInventoryProducts,
  fetchPosCustomers,
  type PosCustomerRead,
  type InventoryOverview,
} from "@/lib/api/inventory";
import { getApiBase } from "@/lib/api/base";
import { exportReportPdf } from "@/lib/api/reports";
import { fetchSeparatedOrders } from "@/lib/api/separatedOrders";
import { fetchComercioWebOrders } from "@/lib/api/comercioWeb";
import { getBogotaDateKey } from "@/lib/time/bogota";
import {
  extractProductCode,
  extractProductHint,
  extractProductTerm,
  hasPhrase,
  normalizeQuery,
  parseSpecificDate,
  resolvePaymentMethodFromQuery,
} from "./kora/nlp";
import {
  buildIntentCandidates,
  resolveIntentWithContext,
  type IntentCandidate,
  type KoraTopic,
  type QueryIntent,
} from "./kora/intent-engine";
import {
  buildModuleGuideMessage,
  buildModuleTaskActions,
  MODULE_GUIDES,
  PRODUCT_GUIDE_ACTIONS,
  REPORT_GUIDE_ACTIONS,
  resolveModuleFromQuery,
  type KoraModuleKey,
} from "./kora/module-knowledge";
import { getModuleSystemKnowledge } from "./kora/system-knowledge";

type KoraOpsAssistantProps = {
  enabled: boolean;
  userName?: string | null;
  token?: string | null;
  userRole?: "Administrador" | "Supervisor" | "Vendedor" | "Auditor" | "";
  initialOpen?: boolean;
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

type KoraToneMode = "professional" | "friendly";

type KoraConversationIntent =
  | "greeting"
  | "small_talk"
  | "identity"
  | "capabilities"
  | "thanks"
  | "farewell"
  | "acknowledgement"
  | "unknown";

type KoraReplyTone = {
  directness: "high" | "medium" | "low";
  warmth: "high" | "medium" | "low";
  detail: "high" | "medium" | "low";
};

type KoraSessionContext = {
  topic: KoraTopic;
  entity: KoraEntityContext;
  toneMode: KoraToneMode;
  dismissedSignals: string[];
};

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

type PendingCustomerSalesNavigation = {
  customerTerm: string;
  salesHref: string;
  documentsHref: string;
} | null;

type KoraEntityContext = {
  moduleKey?: KoraModuleKey | null;
  productTerm?: string | null;
  paymentMethodSlug?: string | null;
  dateKey?: string | null;
  topProductsQueryActive?: boolean;
  topProductsLimit?: number | null;
  customerTerm?: string | null;
  customerId?: number | null;
};

type KoraMetricEntry = {
  at: string;
  source: "message" | "action";
  input: string;
  intent: QueryIntent;
  status: "handled" | "fallback" | "confirm";
  latencyMs: number;
};

type KoraApiAskResponse = {
  handled: boolean;
  answer: string;
  source: "rules-v2" | "openai-v2";
  confidence: number;
  actions?: Array<{ label: string; href?: string | null }>;
  suggestions?: string[];
  generated_at: string;
};

type KoraRestockForecastItem = {
  product_id: number;
  product_name: string;
  sku?: string | null;
  group_name?: string | null;
  price: number;
  units_today: number;
  qty_on_hand: number;
  stock_min: number;
  preferred_qty: number;
  reorder_point: number;
  effective_threshold: number;
  threshold_source: "configured" | "inferred" | "mixed";
  units_7d: number;
  units_lookback: number;
  daily_rate: number;
  coverage_days?: number | null;
  projected_demand: number;
  suggested_qty: number;
  urgency: "high" | "medium" | "low";
  reason: string;
  last_sale_at?: string | null;
  last_movement_at?: string | null;
};

type KoraRestockForecastResponse = {
  generated_at: string;
  source: "restock-forecast-v1";
  mode: "general" | "today";
  state: "alert" | "watch" | "calm";
  horizon_days: number;
  lookback_days: number;
  headline: string;
  summary_lines: string[];
  items: KoraRestockForecastItem[];
  recommended_actions: KoraAction[];
  conversation_starters: string[];
};

type KoraRestockReportRow = {
  product_id: number;
  sku: string;
  product_name: string;
  stock: number;
  price: number;
  units_today: number;
  coverage_days: string;
  suggested_qty: number;
  urgency: "high" | "medium" | "low";
  reason: string;
};

type QuickTopRow = {
  name: string;
  units: number;
  total: number;
};

type KoraProductAuditEntry = {
  id: number;
  product_id: number;
  action: string;
  actor_name?: string | null;
  actor_email?: string | null;
  changes?: Record<string, unknown> | null;
  created_at: string;
};

const CACHE_TTL_MS = 45_000;
const KORA_METRICS_KEY = "kora_ops_metrics_v1";
const KORA_MAX_METRICS = 200;
const KORA_CONTEXT_KEY = "kora_ops_context_v1";
const KORA_SESSION_NUDGE_KEY_PREFIX = "kora_ops_session_nudge_seen_v1";
const KORA_NUDGE_VISIBLE_MS = 20_000;
const KORA_NUDGE_REPEAT_MS = 30 * 60 * 1000;
const KORA_SESSION_NUDGE_ENABLED = false;

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

const PRODUCT_ACTIONS: KoraAction[] = [
  { id: "product-open-products", label: "Abrir Productos", href: "/dashboard/products" },
];

const CROSS_MODULE_ACTIONS: KoraAction[] = [
  { id: "cross-open-dashboard", label: "Abrir Inicio", href: "/dashboard" },
  { id: "cross-open-reports", label: "Abrir Reportes", href: "/dashboard/reports" },
  { id: "cross-open-reports-detailed", label: "Abrir Reporte detallado", href: "/dashboard/reports/detailed" },
];

function resolveModuleFromPathname(pathname: string | null | undefined): KoraModuleKey | null {
  if (!pathname) return null;
  if (pathname === "/dashboard" || pathname === "/dashboard/") return "inicio";
  if (pathname.startsWith("/dashboard/products")) return "productos";
  if (pathname.startsWith("/dashboard/movements")) return "movimientos";
  if (pathname.startsWith("/dashboard/documents")) return "documentos";
  if (pathname.startsWith("/dashboard/customers")) return "clientes";
  if (pathname.startsWith("/dashboard/pos")) return "pos";
  if (pathname.startsWith("/dashboard/labels-pilot")) return "etiquetado_beta";
  if (pathname.startsWith("/dashboard/labels")) return "etiquetas";
  if (pathname.startsWith("/dashboard/reports")) return "reportes";
  if (pathname.startsWith("/dashboard/comercio-web")) return "comercio_web";
  if (pathname.startsWith("/dashboard/investment")) return "inversion";
  if (pathname.startsWith("/dashboard/hr")) return "rrhh";
  if (pathname.startsWith("/dashboard/schedule")) return "horarios";
  if (pathname.startsWith("/dashboard/profile")) return "perfil";
  if (pathname.startsWith("/dashboard/settings")) return "configuracion";
  return null;
}

function resolveFirstName(value?: string | null) {
  const cleaned = (value || "").trim();
  if (!cleaned) return "";
  return cleaned.split(/\s+/)[0] || "";
}

function normalizeRole(value?: string | null): "Administrador" | "Supervisor" | "Vendedor" | "Auditor" | "unknown" {
  if (value === "Administrador" || value === "Supervisor" || value === "Vendedor" || value === "Auditor") return value;
  return "unknown";
}

function getRoleTone(role: "Administrador" | "Supervisor" | "Vendedor" | "Auditor" | "unknown"): KoraReplyTone {
  switch (role) {
    case "Administrador":
      return { directness: "high", warmth: "medium", detail: "high" };
    case "Supervisor":
      return { directness: "medium", warmth: "medium", detail: "high" };
    case "Vendedor":
      return { directness: "high", warmth: "high", detail: "medium" };
    case "Auditor":
      return { directness: "high", warmth: "low", detail: "high" };
    default:
      return { directness: "medium", warmth: "medium", detail: "medium" };
  }
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

function hasOperationalSignal(text: string) {
  const normalized = normalizeQuery(text);
  if (!normalized) return false;
  return (
    parseSpecificDate(normalized) !== null ||
    resolvePaymentMethodFromQuery(normalized) !== null ||
    !!resolveModuleFromQuery(normalized) ||
    hasPhrase(normalized, [
      "venta",
      "ventas",
      "producto",
      "productos",
      "sku",
      "inventario",
      "stock",
      "cliente",
      "clientes",
      "reporte",
      "reportes",
      "informe",
      "informes",
      "movimiento",
      "movimientos",
      "pedido",
      "pedidos",
      "etiqueta",
      "etiquetas",
      "horario",
      "horarios",
      "empleado",
      "empleados",
      "perfil",
      "configuracion",
      "configuración",
      "caja",
      "pos",
      "margen",
      "rentabilidad",
      "corte",
    ]) ||
    hasPhrase(normalized, [
      "buscar",
      "busca",
      "consultar",
      "consulta",
      "ver",
      "mostrar",
      "dame",
      "dime",
      "abrir",
      "crear",
      "editar",
      "actualizar",
      "cambiar",
      "registrar",
      "explicar",
      "explicame",
      "explícame",
      "comparar",
      "revisar",
      "diagnosticar",
      "reponer",
      "imprimir",
      "convertir",
    ])
  );
}

function hasNormalizedPhrase(text: string, phrases: string[]) {
  const normalized = normalizeQuery(text);
  return phrases.some((phrase) => normalized.includes(normalizeQuery(phrase)));
}

function isGreetingOnlyInput(text: string) {
  const normalized = normalizeQuery(text);
  if (!normalized || hasOperationalSignal(normalized)) return false;
  const tokens = normalized.split(" ").filter(Boolean);
  const greetingOnly =
    normalized === "hola" ||
    normalized === "buenos dias" ||
    normalized === "buenas tardes" ||
    normalized === "buenas noches" ||
    normalized === "buen dia" ||
    normalized === "buenas";
  return greetingOnly || (tokens.length <= 3 && /^(hola|buenos|buenas)\b/.test(normalized));
}

function isCasualConversationInput(text: string) {
  const normalized = normalizeQuery(text);
  if (!normalized || hasOperationalSignal(normalized)) return false;
  return (
    hasNormalizedPhrase(normalized, [
      "como estas",
      "como andas",
      "como vas",
      "como te sientes",
      "que sientes",
      "que opinas",
      "que piensas",
      "como te ha ido",
      "como va tu dia",
      "como va tu dia hoy",
      "que tal",
      "todo bien",
      "que hay de nuevo",
      "como te va",
      "estas bien",
      "te sientes bien",
    ]) ||
    (/^(y\s+)?tu\b/.test(normalized) && normalized.length <= 40)
  );
}

function isHumanSmallTalkReply(text: string) {
  const normalized = normalizeQuery(text);
  return hasNormalizedPhrase(normalized, [
    "voy bien",
    "todo bien",
    "gracias por preguntar",
    "me alegra verte",
    "aqui estoy",
    "que gusto verte",
    "yo tambien",
  ]);
}

function isIdentityQuestion(text: string) {
  const normalized = normalizeQuery(text);
  return hasNormalizedPhrase(normalized, [
    "quien eres",
    "quien es kora",
    "quien te creo",
    "quien te hizo",
    "de donde saliste",
  ]);
}

function isCapabilitiesQuestion(text: string) {
  const normalized = normalizeQuery(text);
  return hasNormalizedPhrase(normalized, [
    "que puedes hacer",
    "que sabes hacer",
    "para que sirves",
    "en que ayudas",
    "como ayudas",
    "que haces",
    "como funciona",
  ]);
}

function isThanksInput(text: string) {
  const normalized = normalizeQuery(text);
  return hasNormalizedPhrase(normalized, [
    "gracias",
    "muchas gracias",
    "mil gracias",
    "te agradezco",
    "muy amable",
  ]);
}

function isFarewellInput(text: string) {
  const normalized = normalizeQuery(text);
  return hasNormalizedPhrase(normalized, [
    "adios",
    "chao",
    "hasta luego",
    "nos vemos",
    "me voy",
    "gracias nos vemos",
    "hasta pronto",
  ]);
}

function isAcknowledgementInput(text: string) {
  const normalized = normalizeQuery(text);
  return hasNormalizedPhrase(normalized, [
    "ok",
    "okay",
    "vale",
    "listo",
    "de una",
    "perfecto",
    "entendido",
    "bueno",
    "dale",
    "hágale",
    "hagale",
  ]);
}

function classifyConversationInput(text: string): KoraConversationIntent {
  const normalized = normalizeQuery(text);
  if (!normalized) return "unknown";
  if (isGreetingOnlyInput(normalized)) return "greeting";
  if (isIdentityQuestion(normalized)) return "identity";
  if (isCapabilitiesQuestion(normalized)) return "capabilities";
  if (isThanksInput(normalized)) return "thanks";
  if (isFarewellInput(normalized)) return "farewell";
  if (isAcknowledgementInput(normalized) && !hasOperationalSignal(normalized)) return "acknowledgement";
  if (isCasualConversationInput(normalized)) return "small_talk";
  return "unknown";
}

function buildWelcomeMessage(userName?: string | null) {
  const firstName = resolveFirstName(userName);
  const greeting = resolveGreetingByBogotaTime();
  const recipient = firstName ? ` ${firstName}` : "";
  const opener = pickByHash(`${greeting}:${recipient}:opener`, [
    "estoy lista para ayudarte 🙂",
    "te acompaño con lo que necesites ✨",
    "vamos directo a lo importante 🤝",
  ]);
  const closing = pickByHash(`${greeting}:${recipient}:closing`, [
    "¿Qué necesitas revisar hoy?",
    "¿Qué quieres ver primero?",
    "¿Con qué arrancamos?",
  ]);
  return `${greeting}${recipient}, soy KORA 🙂. ${opener}. ${closing}`;
}

function buildKoraIdentityMessage() {
  return "Soy KORA, asistente operativo de Metrik 🙂.\n\nMe creó Kenneth para apoyar al equipo del negocio en tareas reales del día a día.\n\nEstoy en fase inicial, pero me gusta aprender rápido y acompañarte con cosas útiles de verdad ✨.";
}

function buildKoraCapabilitiesMessage() {
  return "Soy KORA, asistente operativo de Metrik 🙂.\n\nEsto es lo que puedo hacer hoy:\n\nVentas:\n- \"ventas de hoy\"\n- \"cuánto vendimos el mes pasado\"\n- \"cuál fue el mejor día de ventas\"\n\nProductos e inventario:\n- \"buscar SKU 100045\"\n- \"qué precio tiene el SKU 100045\"\n- \"deberíamos pedir más de este producto\"\n\nClientes:\n- \"tenemos clientes garcía\"\n- \"buscar cliente por documento 12345678\"\n- \"qué ventas tiene juan ricardo\"\n\nMódulos y operación:\n- \"qué estoy viendo\"\n- \"cómo usar Comercio Web\"\n- \"paso a paso para crear producto\"\n\nSi quieres, yo te acompaño y vamos mirando el negocio juntos, paso a paso 🤝.";
}

function buildGreetingReply(input?: string) {
  const greeting = resolveGreetingByBogotaTime();
  const text = normalizeQuery(input ?? "");
  if (isGreetingOnlyInput(text)) {
    return pickByHash(text || greeting, [
      `${greeting} 🙂. Soy KORA y te acompaño con lo que necesites ✨.`,
      `${greeting} ☀️. Estoy lista para ayudarte.`,
      `${greeting} 😊. ¿Qué necesitas revisar hoy?`,
    ]);
  }
  if (isCasualConversationInput(text)) {
    const reply = pickByHash(text || greeting, [
      "Voy bien, gracias por preguntar 🙂. Me alegra verte por aquí.",
      "Todo bien por acá ✨. Aquí estoy contigo.",
      "Muy bien 😊. Cuéntame qué necesitas y lo vemos juntos.",
    ]);
    return reply;
  }

  const reaction = pickByHash(`${greeting}:reply`, [
    "aquí estoy para ayudarte 🙂",
    "listo, vamos con eso ✨",
    "encantado de ayudarte 🤝",
  ]);
  return `${greeting} 🙂. ${reaction}.`;
}

function buildThanksReply() {
  return pickByHash("thanks", [
    "Con gusto 🙂. Si quieres, seguimos con otra cosa.",
    "Para eso estoy ✨. Dime qué más necesitas.",
    "Cuando quieras seguimos 🤝.",
  ]);
}

function buildFarewellReply() {
  return pickByHash("farewell", [
    "Listo 🙂, nos vemos luego.",
    "Perfecto ✨, quedo por aquí por si vuelves.",
    "Hasta luego 🤝. Cuando quieras seguimos.",
  ]);
}

function buildAcknowledgementReply() {
  return pickByHash("ack", [
    "Perfecto 🙂.",
    "Listo ✨.",
    "Entendido 🤝.",
  ]);
}

function buildIdentityReply() {
  return pickByHash("identity", [
    "Soy KORA, asistente operativo de Metrik 🙂.",
    "Soy KORA, la asistente operativa del panel ✨.",
    "Soy KORA, pensada para ayudarte con la operación del negocio 🤝.",
  ]);
}

function buildCapabilitiesReply() {
  return pickByHash("capabilities", [
    "Puedo ayudarte con ventas, productos, clientes, inventario, reportes y módulos del panel 🙂.",
    "Te ayudo a revisar ventas, buscar productos, ubicar clientes y entender los módulos del sistema ✨.",
    "Puedo acompañarte en consultas del día a día del negocio y en pasos operativos del panel 🤝.",
  ]);
}

function buildSmallTalkReply(input?: string) {
  const text = normalizeQuery(input ?? "");
  if (hasPhrase(text, ["como te sientes", "cómo te sientes", "te sientes bien", "estas bien", "estás bien"])) {
    return pickByHash(text, [
      "Voy bien 🙂, gracias por preguntar. Me hace bien que me hables así.",
      "Me siento bien ✨. Gracias por preguntar, eso se agradece.",
      "Todo en orden 🤝. Estoy aquí contigo.",
    ]);
  }
  if (hasPhrase(text, ["que opinas", "qué opinas", "que piensas", "qué piensas", "como va tu dia", "cómo va tu día"])) {
    return pickByHash(text, [
      "Pienso que vamos por buen camino 🙂. Cuéntame qué necesitas.",
      "Opino que podemos sacarle bastante provecho al panel ✨. ¿Qué revisamos?",
      "Creo que vale la pena ir paso a paso 🤝. Dime por dónde empezamos.",
    ]);
  }
  if (hasPhrase(text, ["que tal", "qué tal", "como vas", "cómo vas", "como te va", "cómo te va"])) {
    return pickByHash(text, [
      "Voy bien, gracias 🙂. ¿Y tú cómo vas?",
      "Todo bien por acá ✨. ¿Qué me cuentas?",
      "Bien por acá 😊. ¿En qué te ayudo?",
    ]);
  }
  return pickByHash(text || "small-talk", [
    "Voy bien, gracias por preguntar 🙂. ¿Y tú cómo vas?",
    "Todo bien por acá ✨. Me alegra verte por aquí.",
    "Bien por aquí 😊. Si quieres, seguimos con algo del panel.",
  ]);
}

function buildConversationReply(intent: KoraConversationIntent, input: string) {
  switch (intent) {
    case "greeting":
      return buildGreetingReply(input);
    case "small_talk":
      return buildSmallTalkReply(input);
    case "identity":
      return buildIdentityReply();
    case "capabilities":
      return buildCapabilitiesReply();
    case "thanks":
      return buildThanksReply();
    case "farewell":
      return buildFarewellReply();
    case "acknowledgement":
      return buildAcknowledgementReply();
    default:
      return "";
  }
}

function buildHumanReplyLead(
  text: string,
  toneMode: KoraToneMode,
  lastIntent: QueryIntent | null,
  userInput: string,
  roleStyle: { directness: "high" | "medium" | "low"; warmth: "high" | "medium" | "low"; detail: "high" | "medium" | "low" }
) {
  const normalized = normalizeQuery(text);
  const normalizedUserInput = normalizeQuery(userInput);
  if (!normalized) return "";
  if (
    classifyConversationInput(normalizedUserInput) !== "unknown" ||
    isHumanSmallTalkReply(normalized) ||
    isGreetingOnlyInput(normalized)
  ) {
    return "";
  }
  if (startsWithGreetingOrWelcome(text)) return "";

  const isRecovery =
    normalized.startsWith("no pude") ||
    normalized.startsWith("no encontre") ||
    normalized.startsWith("indicame") ||
    normalized.startsWith("primero preguntame");
  const isGuide = text.includes("1.") || normalized.startsWith("para ");
  const isNegativeSignal =
    text.includes("Diferencia: -") ||
    normalized.includes("dia flojo") ||
    normalized.includes("por debajo del promedio");
  const isInsightIntent =
    lastIntent === "sales_overview" ||
    lastIntent === "sales_day_reading" ||
    lastIntent === "sales_best_month" ||
    lastIntent === "sales_best_day" ||
    lastIntent === "inventory_overview" ||
    lastIntent === "top_product_current_month" ||
    lastIntent === "top_products_current_month" ||
    lastIntent === "top_products_previous_month" ||
    lastIntent === "top_products_specific_month";

  const professional = {
    recovery: ["Entiendo", "Déjame ajustarlo contigo"],
    guide: ["Claro", "Perfecto, vamos por partes"],
    negative: ["Ojo", "Te marco la señal principal"],
    insight: ["Te cuento", "Aquí tienes lo clave"],
    default: [""],
  };
  const friendly = {
    recovery: ["Tranqui", "Vamos a arreglarlo juntos"],
    guide: ["De una", "Listo, vamos por partes"],
    negative: ["Ojo", "Te pongo la alerta principal"],
    insight: ["Te cuento", "Aquí va el resumen"],
    default: [""],
  };
  const voice = toneMode === "friendly" ? friendly : professional;
  const roleDefault =
    roleStyle.directness === "high"
      ? toneMode === "friendly"
        ? ["Te cuento", "Va"]
        : ["Te comparto", "Te cuento"]
      : roleStyle.warmth === "high"
        ? ["Claro", "Te cuento"]
        : ["Te dejo", "Va"];
  const base =
    (isRecovery && pickByHash(normalized, voice.recovery)) ||
    (isGuide && pickByHash(normalized, voice.guide)) ||
    (isNegativeSignal && pickByHash(normalized, voice.negative)) ||
    (isInsightIntent && pickByHash(normalized, voice.insight)) ||
    pickByHash(normalized, roleDefault.length ? roleDefault : voice.default);
  return base ? `${base}.` : "";
}

function getInitialSessionContext(): KoraSessionContext {
  return {
    topic: null,
    entity: {},
    toneMode: "professional",
    dismissedSignals: [],
  };
}

function loadSessionContext(): KoraSessionContext {
  if (typeof window === "undefined") return getInitialSessionContext();
  try {
    const raw = window.localStorage.getItem(KORA_CONTEXT_KEY);
    if (!raw) return getInitialSessionContext();
    const parsed = JSON.parse(raw) as Partial<KoraSessionContext> | null;
    return {
      topic: parsed?.topic ?? null,
      entity: parsed?.entity ?? {},
      toneMode: parsed?.toneMode === "friendly" ? "friendly" : "professional",
      dismissedSignals: Array.isArray(parsed?.dismissedSignals)
        ? parsed.dismissedSignals.filter((value): value is string => typeof value === "string")
        : [],
    };
  } catch {
    return getInitialSessionContext();
  }
}

function persistSessionContext(context: KoraSessionContext) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KORA_CONTEXT_KEY, JSON.stringify(context));
  } catch {
    // no-op
  }
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

function parseMonthFromInput(input: string) {
  const text = normalizeQuery(input);
  const map: Record<string, number> = {
    enero: 1,
    ene: 1,
    febrero: 2,
    feb: 2,
    marzo: 3,
    mar: 3,
    abril: 4,
    abr: 4,
    mayo: 5,
    may: 5,
    junio: 6,
    jun: 6,
    julio: 7,
    jul: 7,
    agosto: 8,
    ago: 8,
    septiembre: 9,
    setiembre: 9,
    sep: 9,
    set: 9,
    octubre: 10,
    oct: 10,
    noviembre: 11,
    nov: 11,
    diciembre: 12,
    dic: 12,
  };
  const hit = Object.entries(map).find(([key]) => new RegExp(`(^|\\s)${key}(\\s|$)`).test(text));
  if (!hit) return null;
  const month = hit[1];
  const yearRaw = text.match(/\b(20\d{2})\b/)?.[1];
  const now = getBogotaDateParts();
  const year = yearRaw ? Number.parseInt(yearRaw, 10) : month > now.month ? now.year - 1 : now.year;
  return { month, year };
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

  function clampPercent(value: number) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(-100, Math.min(100, value));
  }

  function buildDailySalesInsight(data: SalesSnapshot) {
    const monthDays = getBogotaDateParts().day;
    const avgDailySales = monthDays > 0 ? data.monthSales / monthDays : 0;
    const avgDailyTickets = monthDays > 0 ? data.monthTickets / monthDays : 0;
    const salesGapPct = diffPercent(data.todaySales, avgDailySales);
    const ticketsGapPct = diffPercent(data.todayTickets, avgDailyTickets);

    let label = "día suave";
    let explanation = "el ritmo está por debajo del promedio mensual.";
    if (salesGapPct >= 20 || ticketsGapPct >= 20) {
      label = "muy buen día";
      explanation = "el ritmo de hoy está claramente por encima del promedio mensual.";
    } else if (salesGapPct >= 0 || ticketsGapPct >= 0) {
      label = "buen día";
      explanation = "vamos al nivel o ligeramente por encima del promedio mensual.";
    } else if (salesGapPct <= -30 || ticketsGapPct <= -30) {
      label = "día flojo";
      explanation = "el ritmo de hoy está bastante por debajo del promedio mensual.";
    }

    return {
      label,
      explanation,
      avgDailySales,
      avgDailyTickets,
      salesGapPct,
      ticketsGapPct,
    };
  }

function buildDateRangeKeys(from: Date, to: Date) {
  const date_from = getBogotaDateKey(from) ?? "";
  const date_to = getBogotaDateKey(to) ?? "";
  return { date_from, date_to };
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

function tryGetValueFromUnknownRecord(value: unknown, key: string) {
  if (!value || typeof value !== "object") return undefined;
  return (value as Record<string, unknown>)[key];
}

function pickByHash(seed: string, options: string[]) {
  if (!options.length) return "";
  const hash = [...seed].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return options[Math.abs(hash) % options.length] ?? options[0];
}

function startsWithGreetingOrWelcome(text: string) {
  const normalized = normalizeQuery(text);
  return (
    normalized.includes("en que te ayudo hoy") ||
    normalized.startsWith("hola") ||
    normalized.startsWith("buenos dias") ||
    normalized.startsWith("buenas tardes") ||
    normalized.startsWith("buenas noches")
  );
}

function intentLabel(intent: QueryIntent) {
  const labels: Partial<Record<QueryIntent, string>> = {
    module_guide: "Guía de módulo",
    module_connection: "Conexión entre módulos",
    module_playbook_task: "Guía de tarea",
    cross_module_compare: "Cruce Inicio vs Reportes",
    kpi_drop_diagnostic: "Diagnóstico de caída KPI",
    how_reports: "Ver reportes",
    how_create_product: "Crear producto",
    how_create_hr_employee: "Crear empleado RRHH",
    last_created_product: "Último producto creado",
    payment_methods_by_date: "Métodos de pago por fecha",
    sales_specific_date: "Ventas por fecha",
    sales_mtd_comparison: "Comparativo mes vs anterior",
    sales_method_month_comparison: "Comparativo por método (mes)",
    sales_method_year_comparison: "Comparativo por método (año)",
    sales_best_month: "Mes con mayor venta",
    sales_best_day: "Día con mayor venta",
    top_product_current_month: "Producto más vendido del mes",
    top_products_current_month: "Top productos del mes",
    top_products_previous_month: "Top productos del mes anterior",
    top_products_specific_month: "Top productos por mes",
    product_by_code: "Buscar producto por código",
    product_price_lookup: "Consultar precio por SKU",
    product_group_lookup: "Consultar grupo de producto",
    product_restock_advice: "Recomendación de reposición",
    product_restock_general: "Reposición general",
    product_restock_today: "Reposición por ventas de hoy",
    restock_report_modal: "Ver reporte",
    last_sale_product: "Última venta de producto",
    customer_lookup: "Buscar cliente",
    customer_sales_lookup: "Ventas por cliente",
    sales_overview: "Resumen comercial",
    sales_day_reading: "Lectura del día",
    inventory_overview: "Resumen inventario",
    web_overview: "Resumen comercio web",
  };
  return labels[intent] ?? "Consulta";
}


function buildFallbackSuggestions(input: string, moduleKey?: KoraModuleKey | null): { text: string; actions: KoraAction[] } {
  const text = normalizeQuery(input);
  const actions: KoraAction[] = [];
  const looksLikeModuleHelp =
    hasPhrase(text, [
      "como usar",
      "cómo usar",
      "para que sirve",
      "para qué sirve",
      "como entro",
      "cómo entro",
      "donde esta",
      "dónde está",
      "que puedo hacer",
      "qué puedo hacer",
      "paso a paso",
      "ayuda con",
    ]) || text.includes("ayuda");

  if (parseSpecificDate(text)) {
    actions.push(
      { id: "fb-sales-date", label: "Ver ventas de esa fecha", intent: "sales_specific_date", inputOverride: input },
      { id: "fb-pay-date", label: "Ver métodos de pago de esa fecha", intent: "payment_methods_by_date", inputOverride: input }
    );
    return {
      text: "Entendí que hablas de una fecha 🙂. Si quieres, lo aterrizamos a ventas o pagos:",
      actions,
    };
  }

  if (text.includes("producto") || text.includes("sku") || text.includes("codigo") || text.includes("código")) {
    actions.push(
      { id: "fb-product-code", label: "Buscar producto por código", intent: "product_by_code", inputOverride: input },
      { id: "fb-product-group", label: "Consultar grupo de producto", intent: "product_group_lookup", inputOverride: input }
    );
    return {
      text: "Eso suena a productos 🙂. Te dejo dos caminos útiles:",
      actions,
    };
  }
  if (text.includes("cliente")) {
    actions.push(
      { id: "fb-customer-find", label: "Buscar cliente", intent: "customer_lookup", inputOverride: input },
      { id: "fb-customer-sales", label: "Ver ventas de ese cliente", intent: "customer_sales_lookup", inputOverride: input },
      { id: "fb-customer-open", label: "Abrir Gestión de clientes", href: "/dashboard/customers" }
    );
    return {
      text: "Eso parece una consulta de clientes 🙂. Puedo ayudarte por nombre, documento o teléfono:",
      actions,
    };
  }

  const contextualModuleKey = moduleKey || resolveModuleFromQuery(text);
  if (contextualModuleKey && looksLikeModuleHelp) {
    const guide = MODULE_GUIDES[contextualModuleKey];
    const knowledge = getModuleSystemKnowledge(contextualModuleKey);
    return {
      text: `Puedo guiarte en ${guide.title} 🙂. Mira por dónde quieres entrar:`,
      actions: [
        { id: "fb-module-task", label: `Paso a paso en ${guide.title}`, intent: "module_playbook_task", inputOverride: input },
        { id: "fb-module-guide", label: `Cómo usar ${guide.title}`, intent: "module_guide", inputOverride: `como usar ${guide.title}` },
        ...knowledge.suggestedPrompts.slice(0, 2).map((prompt, idx) => ({
          id: `fb-module-prompt-${contextualModuleKey}-${idx}`,
          label: prompt,
          intent: "module_playbook_task" as const,
          inputOverride: prompt,
        })),
        ...guide.actions.slice(0, 2),
      ],
    };
  }

  if (text.includes("ticket") || text.includes("kpi") || text.includes("indicador")) {
    return {
      text: "Puedo ayudarte a diagnosticar ese indicador. Elige una ruta:",
      actions: [
        { id: "fb-kpi-diagnostic", label: "Diagnóstico ticket promedio", intent: "kpi_drop_diagnostic", inputOverride: input },
        { id: "fb-cross-module", label: "Cruce Inicio vs Reportes", intent: "cross_module_compare", inputOverride: input },
      ],
    };
  }

  actions.push(
    { id: "fb-sales-mtd", label: "Comparar ventas mes vs anterior", intent: "sales_mtd_comparison", inputOverride: "cuánto más vendimos que el mes anterior hasta ahora" },
    { id: "fb-top-product", label: "Producto más vendido del mes", intent: "top_product_current_month", inputOverride: "cuál es el producto más vendido de este mes" },
    { id: "fb-last-sale", label: "Última venta de un producto", intent: "last_sale_product", inputOverride: "cuál fue la última vez que vendimos cable" }
  );
  return {
    text: "No te seguí del todo 😅. Te dejo una ruta más clara:",
    actions,
  };
}

export default function KoraOpsAssistant({ enabled, userName, token, userRole, initialOpen }: KoraOpsAssistantProps) {
  const router = useRouter();
  const pathname = usePathname();
  const welcomeMessage = buildWelcomeMessage(userName);
  const normalizedRole = normalizeRole(userRole);
  const roleTone = getRoleTone(normalizedRole);
  const [open, setOpen] = useState(false);
  const [showSessionNudge, setShowSessionNudge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<KoraMessage[]>([{ id: 1, role: "kora", text: welcomeMessage }]);
  const [restockReport, setRestockReport] = useState<KoraRestockForecastResponse | null>(null);
  const [restockReportSaving, setRestockReportSaving] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const nextIdRef = useRef(2);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inventoryCacheRef = useRef<{ at: number; data: InventoryOverview } | null>(null);
  const salesCacheRef = useRef<{ at: number; data: SalesSnapshot } | null>(null);
  const webCacheRef = useRef<{ at: number; data: WebSnapshot } | null>(null);
  const monthlySalesCacheRef = useRef<Map<number, { at: number; data: MonthlySalesPoint[] }>>(new Map());
  const lastTopicRef = useRef<KoraTopic>(null);
  const lastSaleLookupRef = useRef<LastSaleLookupContext>(null);
  const lastEntityRef = useRef<KoraEntityContext>({});
  const pendingConfirmationRef = useRef<{ input: string; candidates: IntentCandidate[] } | null>(null);
  const pendingCustomerSalesNavigationRef = useRef<PendingCustomerSalesNavigation>(null);
  const toneModeRef = useRef<KoraToneMode>("professional");
  const lastIntentRef = useRef<QueryIntent | null>(null);
  const lastUserInputRef = useRef("");
  const lastKoraReplyRef = useRef<{ text: string; at: string } | null>(null);
  const sessionNudgeKeyRef = useRef<string>("");
  const sessionNudgeOpenedRef = useRef(false);
  const nudgeHideTimeoutRef = useRef<number | null>(null);
  const nudgeReappearTimeoutRef = useRef<number | null>(null);
  const sessionContextRef = useRef<KoraSessionContext>(getInitialSessionContext());
  const latestRestockReportRef = useRef<KoraRestockForecastResponse | null>(null);

  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, open]);

  useEffect(() => {
    sessionContextRef.current = loadSessionContext();
    const context = sessionContextRef.current;
    lastTopicRef.current = context.topic;
    lastEntityRef.current = context.entity || {};
    toneModeRef.current = context.toneMode;
  }, []);

  useEffect(() => {
    if (!initialOpen) return;
    setOpen(true);
  }, [initialOpen]);

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

  const clearNudgeTimers = useCallback(() => {
    if (typeof window === "undefined") return;
    if (nudgeHideTimeoutRef.current != null) {
      window.clearTimeout(nudgeHideTimeoutRef.current);
      nudgeHideTimeoutRef.current = null;
    }
    if (nudgeReappearTimeoutRef.current != null) {
      window.clearTimeout(nudgeReappearTimeoutRef.current);
      nudgeReappearTimeoutRef.current = null;
    }
  }, []);

  const persistCurrentSessionContext = useCallback(() => {
    const context: KoraSessionContext = {
      topic: lastTopicRef.current,
      entity: lastEntityRef.current,
      toneMode: toneModeRef.current,
      dismissedSignals: sessionContextRef.current.dismissedSignals,
    };
    sessionContextRef.current = context;
    persistSessionContext(context);
  }, []);

  const scheduleNudgeCycle = useCallback(() => {
    if (typeof window === "undefined" || sessionNudgeOpenedRef.current) return;
    clearNudgeTimers();
    setShowSessionNudge(true);
    nudgeHideTimeoutRef.current = window.setTimeout(() => {
      setShowSessionNudge(false);
      if (sessionNudgeOpenedRef.current) return;
      nudgeReappearTimeoutRef.current = window.setTimeout(() => {
        scheduleNudgeCycle();
      }, KORA_NUDGE_REPEAT_MS);
    }, KORA_NUDGE_VISIBLE_MS);
  }, [clearNudgeTimers]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    if (!KORA_SESSION_NUDGE_ENABLED) {
      setShowSessionNudge(false);
      clearNudgeTimers();
      return;
    }
    const userKey =
      normalizeQuery(userName || "usuario").replace(/\s+/g, "-").slice(0, 40) || "usuario";
    const tokenTail = (token || "").slice(-12) || "no-token";
    const sessionKey = `${KORA_SESSION_NUDGE_KEY_PREFIX}:${userKey}:${tokenTail}`;
    sessionNudgeKeyRef.current = sessionKey;
    const opened = window.sessionStorage.getItem(sessionKey) === "1";
    sessionNudgeOpenedRef.current = opened;
    if (opened) {
      setShowSessionNudge(false);
      clearNudgeTimers();
      return;
    }
    scheduleNudgeCycle();
    return () => {
      clearNudgeTimers();
    };
  }, [enabled, token, userName, clearNudgeTimers, scheduleNudgeCycle]);

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

  function markSessionNudgeSeen() {
    if (typeof window === "undefined") return;
    const key = sessionNudgeKeyRef.current;
    if (!key) {
      setShowSessionNudge(false);
      return;
    }
    try {
      window.sessionStorage.setItem(key, "1");
    } catch {
      // no-op
    }
    sessionNudgeOpenedRef.current = true;
    clearNudgeTimers();
    setShowSessionNudge(false);
  }

  function updateToneModeFromUserInput(input: string) {
    const text = normalizeQuery(input);
    if (!text) return;
    const casualMarkers = [
      "hola",
      "como estas",
      "cómo estás",
      "que tal",
      "qué tal",
      "gracias",
      "porfa",
      "parce",
      "bro",
      "jaja",
      "jajaja",
      "dale",
      "ok",
      "vale",
      "bacano",
      "chevere",
      "chévere",
    ];
    const formalMarkers = ["por favor", "podrias", "podrías", "requiero", "necesito", "agradezco"];
    if (casualMarkers.some((marker) => text.includes(marker))) {
      toneModeRef.current = "friendly";
      persistCurrentSessionContext();
      return;
    }
    if (formalMarkers.some((marker) => text.includes(marker))) {
      toneModeRef.current = "professional";
      persistCurrentSessionContext();
    }
  }

  const pushMessage = useCallback(
    (
      role: KoraMessage["role"],
      text: string,
      actions?: KoraAction[],
      options?: { trackAsReply?: boolean }
    ) => {
      const finalText =
        role === "kora"
          ? (() => {
              const lead = buildHumanReplyLead(
                text,
                toneModeRef.current,
                lastIntentRef.current,
                lastUserInputRef.current,
                roleTone
              );
              if (!lead) return text;
              const normalizedText = normalizeQuery(text);
              if (normalizedText.startsWith(normalizeQuery(lead))) return text;
              return `${lead}\n\n${text}`;
            })()
          : text;
      if (role === "kora" && (options?.trackAsReply ?? true)) {
        lastKoraReplyRef.current = { text: finalText, at: new Date().toISOString() };
        persistCurrentSessionContext();
      }
      setMessages((current) => [...current, { id: nextIdRef.current++, role, text: finalText, actions }]);
    },
    [persistCurrentSessionContext, roleTone]
  );

  function resolveBinaryConfirmation(input: string): "yes" | "no" | null {
    const text = normalizeQuery(input).trim();
    if (!text) return null;
    if (
      /^(si|sí|s|ok|okay|dale|de una|claro|listo|hagale|hágale|por favor)$/.test(text)
    ) {
      return "yes";
    }
    if (/^(no|nop|negativo)$/.test(text)) {
      return "no";
    }
    return null;
  }

  function formatMoney(value: number) {
    return value.toLocaleString("es-CO", { maximumFractionDigits: 0, minimumFractionDigits: 0 });
  }

  function escapeHtml(value: string) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function buildRestockReportRows(report: KoraRestockForecastResponse): KoraRestockReportRow[] {
    return report.items.map((item) => ({
      product_id: item.product_id,
      sku: item.sku?.trim() || "—",
      product_name: item.product_name,
      stock: Number(item.qty_on_hand ?? 0),
      price: Math.max(0, Number(item.price ?? 0)),
      units_today: Math.max(0, Number(item.units_today ?? 0)),
      coverage_days:
        item.coverage_days == null
          ? "—"
          : item.coverage_days < 1
            ? "< 1 día"
            : `${Math.round(item.coverage_days)} días`,
      suggested_qty: Math.max(0, Number(item.suggested_qty ?? 0)),
      urgency: item.urgency,
      reason: item.reason,
    }));
  }

  function buildRestockReportHtml(report: KoraRestockForecastResponse) {
    const rows = buildRestockReportRows(report);
    const generatedAt = new Intl.DateTimeFormat("es-CO", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "America/Bogota",
    }).format(new Date(report.generated_at));
    const summaryHtml = report.summary_lines
      .map((line) => `<li>${escapeHtml(line)}</li>`)
      .join("");
    const tableRowsHtml = rows
      .map((row) => {
        const urgencyLabel = row.urgency === "high" ? "Alta" : row.urgency === "medium" ? "Media" : "Baja";
        const urgencyColor =
          row.urgency === "high" ? "#dc2626" : row.urgency === "medium" ? "#d97706" : "#047857";
        return `
          <tr>
            <td>${escapeHtml(row.sku)}</td>
            <td>${escapeHtml(row.product_name)}</td>
            <td class="numeric">${row.stock.toFixed(0)}</td>
            <td class="numeric">${row.units_today.toFixed(0)}</td>
            <td>${escapeHtml(row.coverage_days)}</td>
            <td class="numeric">${row.suggested_qty.toFixed(0)}</td>
            <td><span style="color:${urgencyColor};font-weight:700">${urgencyLabel}</span></td>
            <td class="numeric">${formatMoney(row.price)}</td>
            <td>${escapeHtml(row.reason)}</td>
          </tr>`;
      })
      .join("");
    return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Reporte de reposición KORA</title>
    <style>
      @page {
        size: A4 portrait;
        margin: 12mm;
      }
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #0f172a;
        background: #f8fafc;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .sheet {
        width: 100%;
        margin: 0 auto;
        padding: 0;
        background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
      }
      .page {
        width: 100%;
        border: 1px solid #dbe4f0;
        border-radius: 20px;
        overflow: hidden;
        background: #fff;
      }
      .header {
        display: flex;
        justify-content: space-between;
        gap: 18px;
        align-items: flex-start;
        padding: 18px 20px 16px;
        background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(34,197,94,0.04));
      }
      .brand {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .brand h1 {
        margin: 0;
        font-size: 28px;
        letter-spacing: 0.06em;
      }
      .brand p,
      .meta,
      .summary li,
      .muted {
        color: #475569;
        margin: 0;
        font-size: 13px;
        line-height: 1.45;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(16,185,129,0.12);
        color: #047857;
        font-weight: 700;
        font-size: 12px;
      }
      .cards {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin: 18px 0;
        padding: 0 20px;
      }
      .card {
        border: 1px solid #dbe4f0;
        border-radius: 18px;
        background: #fff;
        padding: 14px 16px;
      }
      .card .label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #64748b;
        margin-bottom: 6px;
      }
      .card .value {
        font-size: 18px;
        font-weight: 800;
        color: #0f172a;
      }
      .summary {
        margin: 0 0 16px 20px;
        padding: 0;
      }
      .summary li { margin-bottom: 4px; }
      .table-wrap {
        margin: 0 20px 20px;
        border: 1px solid #dbe4f0;
        border-radius: 18px;
        overflow: hidden;
        background: #fff;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      thead th {
        position: sticky;
        top: 0;
        background: #0f172a;
        color: #fff;
        text-align: left;
        font-size: 11px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        padding: 12px 10px;
        border-bottom: 1px solid #0b1220;
      }
      tbody td {
        border-top: 1px solid #e2e8f0;
        padding: 10px;
        font-size: 12px;
        vertical-align: top;
        overflow-wrap: anywhere;
      }
      td.numeric { text-align: right; font-variant-numeric: tabular-nums; }
      tbody tr:nth-child(even) td { background: #f8fafc; }
      .footer {
        margin: 0 20px 20px;
        font-size: 11px;
        color: #64748b;
      }
      .sku { width: 7%; }
      .name { width: 25%; }
      .stock { width: 8%; }
      .today { width: 9%; }
      .coverage { width: 11%; }
      .suggested { width: 8%; }
      .urgency { width: 9%; }
      .price { width: 10%; }
      .reason { width: 23%; }
      @media print {
        body { background: #fff; }
        .page { border: none; border-radius: 0; }
        .sheet { padding: 0; }
        .table-wrap, .header, .card { break-inside: avoid; }
        thead { display: table-header-group; }
        tr { break-inside: avoid; page-break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="page">
      <div class="header">
        <div class="brand">
          <h1>KORA</h1>
          <p>Reporte operativo de reposición</p>
          <p>${escapeHtml(report.mode === "today" ? "Reposición de ventas de hoy" : "Reposición general")}</p>
        </div>
        <div class="meta">
          <div class="badge">Generado ${escapeHtml(generatedAt)}</div>
          <p style="margin-top:10px;">${escapeHtml(report.headline)}</p>
        </div>
      </div>
      <div class="cards">
        <div class="card"><div class="label">Productos</div><div class="value">${rows.length}</div></div>
        <div class="card"><div class="label">Críticos</div><div class="value">${rows.filter((row) => row.urgency === "high").length}</div></div>
        <div class="card"><div class="label">En vigilancia</div><div class="value">${rows.filter((row) => row.urgency === "medium").length}</div></div>
        <div class="card"><div class="label">Bajos</div><div class="value">${rows.filter((row) => row.urgency === "low").length}</div></div>
      </div>
      <ul class="summary">${summaryHtml}</ul>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th class="sku">SKU</th>
              <th class="name">Nombre</th>
              <th class="stock">Stock</th>
              <th class="today">Hoy</th>
              <th class="coverage">Cobertura</th>
              <th class="suggested">Sugerido</th>
              <th class="urgency">Urgencia</th>
              <th class="price">Precio</th>
              <th class="reason">Motivo</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml || `<tr><td colspan="9" class="muted">No hay productos para mostrar.</td></tr>`}
          </tbody>
        </table>
      </div>
      <div class="footer">KORA puede ayudarte a revisar este documento, imprimirlo o guardarlo como PDF.</div>
      </div>
    </div>
  </body>
</html>`;
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 1500);
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

  async function readRestockForecast(mode: "general" | "today", horizonDays: number) {
    const apiBase = getApiBase();
    const params = new URLSearchParams({
      mode,
      horizon_days: String(horizonDays),
      lookback_days: "30",
    });
    const res = await fetch(`${apiBase}/kora/restock-forecast?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Error ${res.status} al consultar pronóstico de reposición.`);
    return (await res.json()) as KoraRestockForecastResponse;
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

  async function readSalesBySingleDate(dateKey: string) {
    const params = new URLSearchParams({
      date_from: dateKey,
      date_to: dateKey,
      skip: "0",
      limit: "250",
    });
    const history = await fetchSalesHistory(params);
    return history.items ?? [];
  }

  function buildPaymentSummary(rows: SalesHistoryItem[]) {
    const byMethod = new Map<string, { tickets: number; total: number }>();
    for (const sale of rows) {
      const saleTotal = sale.total ?? 0;
      const nestedPayments = sale.payments ?? [];
      if (nestedPayments.length) {
        for (const payment of nestedPayments) {
          const method = (payment.method || "").trim().toLowerCase() || "sin_metodo";
          const amount = payment.amount ?? 0;
          const prev = byMethod.get(method) ?? { tickets: 0, total: 0 };
          byMethod.set(method, { tickets: prev.tickets + 1, total: prev.total + amount });
        }
      } else {
        const fallback = (sale.payment_method || "sin_metodo").trim().toLowerCase();
        const prev = byMethod.get(fallback) ?? { tickets: 0, total: 0 };
        byMethod.set(fallback, { tickets: prev.tickets + 1, total: prev.total + saleTotal });
      }
    }
    return [...byMethod.entries()].map(([method, value]) => ({ method, ...value }));
  }

  function formatBogotaDateTime(value?: string | null) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("es-CO", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Bogota",
    }).format(date);
  }

  function answerModuleGuide(input: string) {
    const moduleKey = resolveModuleFromQuery(input) || lastEntityRef.current.moduleKey || null;
    if (!moduleKey) {
      pushMessage(
        "kora",
        "Puedo guiarte por módulo. Dime cuál: Productos, Movimientos, Reportes, Comercio Web, Recursos Humanos o Configuración."
      );
      return;
    }
    const guide = MODULE_GUIDES[moduleKey];
    lastEntityRef.current = { ...lastEntityRef.current, moduleKey };
    if (moduleKey === "productos" || moduleKey === "movimientos" || moduleKey === "etiquetas" || moduleKey === "etiquetado_beta") {
      lastTopicRef.current = "inventory";
    }
    if (moduleKey === "reportes" || moduleKey === "inicio" || moduleKey === "pos") {
      lastTopicRef.current = "sales";
    }
    if (moduleKey === "comercio_web") {
      lastTopicRef.current = "web";
    }
    persistCurrentSessionContext();
    pushMessage("kora", buildModuleGuideMessage(moduleKey), guide.actions);
  }

  function answerCurrentModuleContext() {
    const moduleByPath = resolveModuleFromPathname(pathname);
    const moduleKey = moduleByPath || lastEntityRef.current.moduleKey || null;
    if (!moduleKey) {
      pushMessage(
        "kora",
        "No logré identificar el módulo actual desde esta vista. Si me dices el nombre del módulo, te explico dónde estás y qué puedes hacer."
      );
      return;
    }

    const guide = MODULE_GUIDES[moduleKey];
    const knowledge = getModuleSystemKnowledge(moduleKey);
    lastEntityRef.current = { ...lastEntityRef.current, moduleKey };
    if (moduleKey === "productos" || moduleKey === "movimientos" || moduleKey === "etiquetas" || moduleKey === "etiquetado_beta") {
      lastTopicRef.current = "inventory";
    }
    if (moduleKey === "reportes" || moduleKey === "inicio" || moduleKey === "pos") {
      lastTopicRef.current = "sales";
    }
    if (moduleKey === "comercio_web") {
      lastTopicRef.current = "web";
    }
    persistCurrentSessionContext();

    const actions: KoraAction[] = [
      ...guide.actions.slice(0, 2).map((action) => ({
        id: `current-module-${action.id}`,
        label: action.label,
        href: action.href,
      })),
      {
        id: `current-module-help-${moduleKey}`,
        label: `Ayuda en ${guide.title}`,
        intent: "module_playbook_task",
        inputOverride: `como usar ${guide.title}`,
      },
      ...knowledge.suggestedPrompts.slice(0, 2).map((prompt, idx) => ({
        id: `current-module-prompt-${moduleKey}-${idx}`,
        label: prompt,
        intent: "module_playbook_task" as const,
        inputOverride: prompt,
      })),
    ];

    pushMessage(
      "kora",
      `Estás en ${guide.title}.\n${guide.summary}\n\nAquí puedes:\n${guide.steps
        .map((step, index) => `${index + 1}. ${step}`)
        .join("\n")}\n\nTe puedo ayudar con:\n${knowledge.operatorCapabilities
        .slice(0, 3)
        .map((item, index) => `${index + 1}. ${item}`)
        .join("\n")}\n\nCobertura técnica del módulo:\n- UI: ${knowledge.frontendSurface.join(", ")}\n- API: ${knowledge.backendCapabilities
        .slice(0, 4)
        .join(", ")}\n\nSi quieres, te ayudo con una tarea concreta de este módulo.`,
      actions
    );
  }

  function answerModuleConnection(input: string) {
    const moduleKey = resolveModuleFromQuery(input) || lastEntityRef.current.moduleKey || null;
    if (!moduleKey) {
      pushMessage(
        "kora",
        "Te explico la conexión entre módulos. Ejemplo: “cómo se conecta Productos con Movimientos” o “cómo se relaciona Reportes con POS”."
      );
      return;
    }
    const map: Partial<Record<KoraModuleKey, string>> = {
      productos:
        "Productos se conecta con Movimientos (stock), POS (venta), Etiquetas (impresión) y Comercio Web (catálogo publicado).",
      movimientos:
        "Movimientos alimenta inventario operativo. Impacta Productos (stock visible), POS (disponibilidad) y Reportes.",
      documentos:
        "Documentos centraliza soportes que respaldan operación en Movimientos, RRHH y procesos administrativos.",
      pos:
        "POS / Caja consume catálogo de Productos, descuenta inventario vía Movimientos y alimenta métricas en Reportes.",
      etiquetas:
        "Etiquetas toma información de Productos (SKU, nombre, precio) para operación física y control en tienda.",
      etiquetado_beta:
        "Etiquetado (beta) usa el mismo catálogo de Productos, pero en un flujo experimental de impresión y validación.",
      reportes:
        "Reportes consolida datos de POS, Movimientos y Comercio Web para análisis comercial y operativo.",
      comercio_web:
        "Comercio Web usa catálogo de Productos y genera órdenes que terminan en ventas/fulfillment, visibles en Reportes.",
      rrhh:
        "Recursos Humanos soporta operación interna (equipo/roles). Se complementa con Configuración para permisos.",
      clientes:
        "Clientes conecta ventas POS y seguimiento comercial. Sus datos mejoran historial, búsqueda y atención recurrente.",
      horarios:
        "Horarios organiza turnos del equipo y se cruza con RRHH para asignación operativa por semana.",
      perfil:
        "Perfil centraliza tus datos de usuario y documentos; influye en trazabilidad y contacto interno.",
      configuracion:
        "Configuración define reglas globales de operación que afectan POS, usuarios, seguridad y módulos administrativos.",
    };
    const response = map[moduleKey] ?? `${MODULE_GUIDES[moduleKey].title} se integra con el flujo operativo del panel.`;
    pushMessage("kora", response, MODULE_GUIDES[moduleKey].actions);
  }

  function answerModulePlaybookTask(input: string) {
    const text = normalizeQuery(input);
    const moduleKey = resolveModuleFromQuery(text) || lastEntityRef.current.moduleKey || null;
    if (!moduleKey) {
      pushMessage("kora", "Dime el módulo para darte el paso a paso. Ejemplo: “cómo crear producto en Productos”.");
      return;
    }

    lastEntityRef.current = { ...lastEntityRef.current, moduleKey };

    if (moduleKey === "productos") {
      if (text.includes("precio") || text.includes("editar") || text.includes("actualizar") || text.includes("cambiar")) {
        pushMessage(
          "kora",
          "Actualizar precio en Productos:\n1. Abre Productos.\n2. Busca por nombre/SKU.\n3. Edita el producto.\n4. Cambia precio y guarda.\n5. Verifica reflejo en catálogo/venta.",
          buildModuleTaskActions("productos")
        );
        return;
      }
      if (text.includes("desactivar") || text.includes("inactivar") || text.includes("activar")) {
        pushMessage(
          "kora",
          "Activar/Inactivar producto:\n1. Abre Productos.\n2. Busca el producto.\n3. Cambia estado Activo.\n4. Guarda y valida visibilidad en venta/web.",
          buildModuleTaskActions("productos")
        );
        return;
      }
      pushMessage(
        "kora",
        "Crear producto en Productos:\n1. Abre Productos.\n2. Clic en crear nuevo.\n3. Completa nombre, SKU, grupo, precio y costo.\n4. Guarda y valida stock inicial.",
        buildModuleTaskActions("productos")
      );
      return;
    }
    persistCurrentSessionContext();

    if (moduleKey === "movimientos") {
      if (text.includes("entrada") || text.includes("ingreso") || text.includes("compra")) {
        pushMessage(
          "kora",
          "Registrar entrada de inventario:\n1. Abre Movimientos.\n2. Crea documento/lote de entrada.\n3. Agrega productos y cantidades.\n4. Confirma y revisa stock.",
          buildModuleTaskActions("movimientos")
        );
        return;
      }
      if (text.includes("ajuste") || text.includes("reconteo") || text.includes("conteo")) {
        pushMessage(
          "kora",
          "Ajuste o reconteo:\n1. Abre Movimientos.\n2. Crea reconteo o ajuste manual.\n3. Captura cantidades reales.\n4. Confirma diferencias y guarda.",
          buildModuleTaskActions("movimientos")
        );
        return;
      }
      pushMessage(
        "kora",
        "Consultar trazabilidad en Movimientos:\n1. Abre Movimientos.\n2. Filtra por producto/fecha/tipo.\n3. Revisa documento y responsable del movimiento.",
        buildModuleTaskActions("movimientos")
      );
      return;
    }
    persistCurrentSessionContext();

    if (moduleKey === "documentos") {
      if (text.includes("buscar") || text.includes("filtrar") || text.includes("encontrar")) {
        pushMessage(
          "kora",
          "Buscar documentos operativos:\n1. Abre Documentos.\n2. Filtra por fecha, tipo o referencia.\n3. Abre el documento para validar detalle y estado.",
          buildModuleTaskActions("documentos")
        );
        return;
      }
      pushMessage(
        "kora",
        "Gestión básica en Documentos:\n1. Abre Documentos.\n2. Revisa registros recientes.\n3. Entra al detalle para trazabilidad y soporte de auditoría.",
        buildModuleTaskActions("documentos")
      );
      return;
    }
    persistCurrentSessionContext();

    if (moduleKey === "clientes") {
      if (text.includes("buscar") || text.includes("encontrar") || text.includes("cliente")) {
        pushMessage(
          "kora",
          "Buscar cliente en Gestión de clientes:\n1. Abre Gestión de clientes.\n2. Escribe nombre, documento o teléfono en el buscador.\n3. Abre el registro y valida datos de contacto.",
          buildModuleTaskActions("clientes")
        );
        return;
      }
      pushMessage("kora", buildModuleGuideMessage("clientes"), buildModuleTaskActions("clientes"));
      return;
    }
    persistCurrentSessionContext();

    if (moduleKey === "pos") {
      if (text.includes("devolucion") || text.includes("devolución")) {
        pushMessage(
          "kora",
          "Para devoluciones de POS lo trabajaremos en una fase dedicada del asistente POS. Por ahora te recomiendo abrir POS/Caja y gestionar el flujo actual manualmente.",
          buildModuleTaskActions("pos")
        );
        return;
      }
      if (text.includes("venta") || text.includes("cobro") || text.includes("pago")) {
        pushMessage(
          "kora",
          "Registrar venta en POS:\n1. Abre POS / Caja.\n2. Busca y agrega productos.\n3. Verifica totales y descuentos.\n4. Selecciona método de pago.\n5. Confirma venta y entrega comprobante.",
          buildModuleTaskActions("pos")
        );
        return;
      }
      pushMessage(
        "kora",
        "Operación rápida de POS:\n1. Abre POS / Caja.\n2. Valida estación y vendedor.\n3. Ejecuta venta/cobro.\n4. Revisa cierre y reporte diario.",
        buildModuleTaskActions("pos")
      );
      return;
    }
    persistCurrentSessionContext();

    if (moduleKey === "etiquetas" || moduleKey === "etiquetado_beta") {
      const target = moduleKey === "etiquetas" ? "etiquetas" : "etiquetado (beta)";
      if (text.includes("imprimir") || text.includes("etiqueta")) {
        pushMessage(
          "kora",
          `Impresión en ${target}:\n1. Abre ${MODULE_GUIDES[moduleKey].title}.\n2. Busca producto por nombre/SKU.\n3. Selecciona formato y cantidad.\n4. Previsualiza y envía a impresión.`,
          buildModuleTaskActions(moduleKey)
        );
        return;
      }
      pushMessage("kora", buildModuleGuideMessage(moduleKey), MODULE_GUIDES[moduleKey].actions);
      return;
    }
    persistCurrentSessionContext();

    if (moduleKey === "comercio_web") {
      if (text.includes("pendiente") || text.includes("pago")) {
        pushMessage(
          "kora",
          "Gestionar pagos pendientes en Comercio Web:\n1. Abre Comercio Web.\n2. Filtra por estado pendiente de pago.\n3. Revisa orden y contacto cliente.\n4. Confirma pago o seguimiento comercial.",
          buildModuleTaskActions("comercio_web")
        );
        return;
      }
      if (text.includes("procesar") || text.includes("alist") || text.includes("entrega")) {
        pushMessage(
          "kora",
          "Procesar pedidos web:\n1. Abre Comercio Web.\n2. Filtra órdenes pagadas/en proceso.\n3. Actualiza fulfillment (processing/ready).\n4. Confirma entrega o conversión a venta.",
          buildModuleTaskActions("comercio_web")
        );
        return;
      }
      if (text.includes("convertir") || text.includes("venta")) {
        pushMessage(
          "kora",
          "Convertir orden web a venta:\n1. Abre Comercio Web.\n2. Entra a la orden objetivo.\n3. Ejecuta acción de conversión a venta.\n4. Verifica documento generado en historial.",
          buildModuleTaskActions("comercio_web")
        );
        return;
      }
      pushMessage("kora", buildModuleGuideMessage("comercio_web"), MODULE_GUIDES.comercio_web.actions);
      return;
    }
    persistCurrentSessionContext();

    if (moduleKey === "inversion") {
      if (text.includes("margen") || text.includes("rentabilidad")) {
        pushMessage(
          "kora",
          "Revisar margen/rentabilidad:\n1. Abre Inversión.\n2. Filtra por periodo y producto.\n3. Ordena por margen o utilidad.\n4. Detecta productos con menor rendimiento.",
          buildModuleTaskActions("inversion")
        );
        return;
      }
      if (text.includes("corte") || text.includes("cerrar") || text.includes("cierre")) {
        pushMessage(
          "kora",
          "Flujo de corte en Inversión:\n1. Abre Inversión.\n2. Revisa movimientos pendientes.\n3. Genera/valida corte del periodo.\n4. Guarda para trazabilidad contable.",
          buildModuleTaskActions("inversion")
        );
        return;
      }
      pushMessage("kora", buildModuleGuideMessage("inversion"), MODULE_GUIDES.inversion.actions);
      return;
    }
    persistCurrentSessionContext();

    if (moduleKey === "rrhh") {
      if (text.includes("documento") || text.includes("contrato") || text.includes("archivo")) {
        pushMessage(
          "kora",
          "Cargar documentos de empleado:\n1. Abre Recursos Humanos.\n2. Entra al perfil del empleado.\n3. Sube documento y agrega nota.\n4. Guarda y valida en historial.",
          buildModuleTaskActions("rrhh")
        );
        return;
      }
      pushMessage(
        "kora",
        "Crear empleado en RRHH:\n1. Abre Recursos Humanos.\n2. Clic en nuevo empleado.\n3. Completa datos, cargo y contacto.\n4. Guarda y confirma en listado.",
        buildModuleTaskActions("rrhh")
      );
      return;
    }
    persistCurrentSessionContext();

    if (moduleKey === "reportes") {
      if (text.includes("kpi") || text.includes("indicador") || text.includes("ticket promedio")) {
        pushMessage(
          "kora",
          "Revisar KPIs en Reportes:\n1. Abre Reportes.\n2. Define rango de fechas.\n3. Revisa total ventas, tickets y ticket promedio.\n4. Compara con periodo anterior para detectar variaciones.",
          buildModuleTaskActions("reportes")
        );
        return;
      }
      if (text.includes("comparar") || text.includes("vs") || text.includes("contra")) {
        pushMessage(
          "kora",
          "Comparar periodos en Reportes:\n1. Abre Reportes.\n2. Selecciona periodo actual.\n3. Activa comparación con periodo anterior.\n4. Analiza diferencia en valor y porcentaje.",
          buildModuleTaskActions("reportes")
        );
        return;
      }
      if (text.includes("exportar") || text.includes("descargar") || text.includes("excel") || text.includes("pdf")) {
        pushMessage(
          "kora",
          "Exportar análisis de Reportes:\n1. Abre Reportes (o Reporte detallado).\n2. Ajusta filtros y rango.\n3. Usa opción de exportar/descargar.\n4. Valida que el archivo conserve los filtros aplicados.",
          buildModuleTaskActions("reportes")
        );
        return;
      }
      pushMessage(
        "kora",
        "Flujo recomendado en Reportes:\n1. Define pregunta de negocio (qué quieres medir).\n2. Ajusta rango y filtros.\n3. Revisa KPIs y tendencia.\n4. Baja a detalle para explicar la causa.",
        buildModuleTaskActions("reportes")
      );
      return;
    }
    persistCurrentSessionContext();

    if (moduleKey === "configuracion") {
      if (text.includes("usuario") || text.includes("permiso") || text.includes("rol")) {
        pushMessage(
          "kora",
          "Gestionar usuarios/permisos:\n1. Abre Configuración.\n2. Entra al bloque de usuarios.\n3. Crea o edita usuario.\n4. Ajusta permisos por módulo y guarda.",
          buildModuleTaskActions("configuracion")
        );
        return;
      }
      if (text.includes("estacion") || text.includes("estación") || text.includes("caja") || text.includes("pos")) {
        pushMessage(
          "kora",
          "Configurar estación POS:\n1. Abre Configuración.\n2. Entra a bloque POS/estaciones.\n3. Crea o edita estación.\n4. Ajusta correo de cierre y reglas.\n5. Guarda y valida desde POS.",
          buildModuleTaskActions("configuracion")
        );
        return;
      }
      if (text.includes("politica") || text.includes("política") || text.includes("parametro") || text.includes("parámetro")) {
        pushMessage(
          "kora",
          "Ajustar políticas/parámetros:\n1. Abre Configuración.\n2. Ubica el bloque de políticas.\n3. Cambia el parámetro requerido.\n4. Guarda y comunica el cambio al equipo.",
          buildModuleTaskActions("configuracion")
        );
        return;
      }
      pushMessage(
        "kora",
        "Ajuste general en Configuración:\n1. Abre Configuración.\n2. Selecciona el bloque requerido.\n3. Cambia parámetros.\n4. Guarda y valida impacto operativo.",
        buildModuleTaskActions("configuracion")
      );
      return;
    }
    persistCurrentSessionContext();

    if (moduleKey === "inicio") {
      if (text.includes("kpi") || text.includes("indicador") || text.includes("ticket promedio")) {
        pushMessage(
          "kora",
          "Lectura de KPIs en Inicio:\n1. Revisa venta hoy, venta mes y tickets.\n2. Valida ticket promedio y variación.\n3. Si algo cae, abre Reportes para detalle por fecha/método.",
          buildModuleTaskActions("inicio")
        );
        return;
      }
      if (text.includes("tendencia") || text.includes("semana") || text.includes("mes")) {
        pushMessage(
          "kora",
          "Analizar tendencia desde Inicio:\n1. Revisa gráfica semanal/mensual.\n2. Detecta picos y caídas por día.\n3. Cruza hallazgo con métodos de pago y top productos en Reportes.",
          buildModuleTaskActions("inicio")
        );
        return;
      }
      pushMessage(
        "kora",
        "Lectura rápida del Inicio:\n1. Revisa ventas/tickets del día y mes.\n2. Compara tendencia semanal.\n3. Usa refrescar para sincronizar con POS.",
        buildModuleTaskActions("inicio")
      );
      return;
    }
    persistCurrentSessionContext();

    // Cobertura exhaustiva por módulo en los bloques anteriores.
    // Este fallback evita que TypeScript infiera `never` en acceso dinámico.
    pushMessage(
      "kora",
      "Puedo ayudarte con ese flujo. Dime el módulo exacto para darte el paso a paso.",
      [
        { id: "fallback-open-dashboard", label: "Abrir Inicio", href: "/dashboard" },
        { id: "fallback-open-reports", label: "Abrir Reportes", href: "/dashboard/reports" },
      ]
    );
  }

  async function answerCrossModuleCompare() {
    if (!ensureToken()) return;
    setBusy(true);
    lastTopicRef.current = "sales";
    lastEntityRef.current = { ...lastEntityRef.current, moduleKey: "reportes" };
    try {
      const sales = await readSales();
      const avgToday = sales.todayTickets > 0 ? sales.todaySales / sales.todayTickets : 0;
      const avgMonth = sales.monthTickets > 0 ? sales.monthSales / sales.monthTickets : 0;
      const diff = avgToday - avgMonth;
      const diffPct = diffPercent(avgToday, avgMonth);
      pushMessage(
        "kora",
        `Cruce Inicio vs Reportes (lectura operativa):\n1. Inicio te da señal rápida del día.\n2. Reportes confirma causa por periodo, método y producto.\n3. Ticket promedio hoy: ${formatMoney(avgToday)} COP vs mes: ${formatMoney(avgMonth)} COP (${formatSignedMoney(diff)} COP, ${formatSignedPercent(diffPct)}).\n4. Si hay desvío, baja a Reporte detallado para explicar el cambio.`,
        CROSS_MODULE_ACTIONS
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible cruzar Inicio y Reportes.";
      pushMessage("kora", `No pude construir el cruce ahora. ${message}`, CROSS_MODULE_ACTIONS);
    } finally {
      setBusy(false);
    }
  }

  async function answerKpiDropDiagnostic() {
    if (!ensureToken()) return;
    setBusy(true);
    lastTopicRef.current = "sales";
    lastEntityRef.current = { ...lastEntityRef.current, moduleKey: "reportes" };
    try {
      const sales = await readSales();
      const { year, month, day } = getBogotaDateParts();
      const todayKey = getBogotaDateKey(new Date()) ?? `${year}-${pad2(month)}-${pad2(day)}`;
      const monthFrom = `${year}-${pad2(month)}-01`;
      const monthTo = todayKey;
      const [todayRows, topProducts, addiMonth, sisteMonth] = await Promise.all([
        todayKey ? readSalesBySingleDate(todayKey) : Promise.resolve([]),
        fetchQuickInsights(`${year}-${pad2(month)}`),
        sumSalesForRange(monthFrom, monthTo, "addi"),
        sumSalesForRange(monthFrom, monthTo, "sistecredito"),
      ]);

      const avgToday = sales.todayTickets > 0 ? sales.todaySales / sales.todayTickets : 0;
      const avgMonth = sales.monthTickets > 0 ? sales.monthSales / sales.monthTickets : 0;
      const gap = avgToday - avgMonth;
      const gapPct = diffPercent(avgToday, avgMonth);

      const paymentToday = buildPaymentSummary(todayRows);
      const financeToday = paymentToday
        .filter((row) => row.method.includes("addi") || row.method.includes("sistecredito"))
        .reduce((acc, row) => acc + row.total, 0);
      const financeMonth = addiMonth.totalAmount + sisteMonth.totalAmount;
      const financeShareToday = sales.todaySales > 0 ? (financeToday / sales.todaySales) * 100 : 0;
      const financeShareMonth = sales.monthSales > 0 ? (financeMonth / sales.monthSales) * 100 : 0;
      const financeShareGap = financeShareToday - financeShareMonth;

      const avgDailyTicketsMonth = day > 0 ? sales.monthTickets / day : 0;
      const ticketsVsAvgDailyPct = avgDailyTicketsMonth > 0 ? diffPercent(sales.todayTickets, avgDailyTicketsMonth) : 0;

      const topMonthProduct = topProducts[0]?.name?.trim() ?? "";
      const topProductSoldTodayCount = topMonthProduct
        ? todayRows.reduce((acc, sale) => {
            const items = sale.items ?? [];
            const count = items.filter((item) =>
              normalizeQuery(item.product_name || item.name || "").includes(normalizeQuery(topMonthProduct))
            ).length;
            return acc + count;
          }, 0)
        : 0;

      const factors: Array<{ title: string; detail: string; impact: number }> = [];
      if (gap < 0) {
        factors.push({
          title: "Caída de ticket promedio",
          detail: `Ticket hoy ${formatMoney(avgToday)} COP vs mes ${formatMoney(avgMonth)} COP (${formatSignedMoney(gap)} COP, ${formatSignedPercent(gapPct)}).`,
          impact: Math.abs(clampPercent(gapPct)),
        });
      }
      if (sales.todayTickets < avgDailyTicketsMonth) {
        factors.push({
          title: "Menor volumen de tickets hoy",
          detail: `Tickets hoy ${sales.todayTickets} vs promedio diario del mes ${avgDailyTicketsMonth.toFixed(1)} (${formatSignedPercent(ticketsVsAvgDailyPct)}).`,
          impact: Math.abs(clampPercent(ticketsVsAvgDailyPct)),
        });
      }
      if (financeShareGap < 0) {
        factors.push({
          title: "Menor peso de financiación (Addi/Sistecrédito)",
          detail: `Participación hoy ${financeShareToday.toFixed(1)}% vs mes ${financeShareMonth.toFixed(1)}% (${formatSignedPercent(financeShareGap)}).`,
          impact: Math.abs(clampPercent(financeShareGap)),
        });
      }
      if (topMonthProduct && topProductSoldTodayCount === 0) {
        factors.push({
          title: "No se vendió hoy el producto top del mes",
          detail: `Top del mes: ${topMonthProduct}. Ventas hoy detectadas: 0.`,
          impact: 18,
        });
      }

      const ranked = factors
        .sort((a, b) => b.impact - a.impact)
        .slice(0, 4)
        .map((factor, index) => `${index + 1}. ${factor.title} (impacto estimado: ${factor.impact.toFixed(1)}%)\n   ${factor.detail}`)
        .join("\n");

      if (!ranked) {
        pushMessage(
          "kora",
          `No detecté señales fuertes de deterioro en el corte actual.\n- Ticket hoy: ${formatMoney(avgToday)} COP\n- Ticket mes: ${formatMoney(avgMonth)} COP\n- Diferencia: ${formatSignedMoney(gap)} COP (${formatSignedPercent(gapPct)}).`,
          CROSS_MODULE_ACTIONS
        );
        return;
      }

      pushMessage(
        "kora",
        `Diagnóstico de causa probable (ranking):\n${ranked}\n\nCorte actual:\n- Ticket hoy: ${formatMoney(avgToday)} COP\n- Ticket mes: ${formatMoney(avgMonth)} COP\n- Diferencia: ${formatSignedMoney(gap)} COP (${formatSignedPercent(gapPct)}).`,
        CROSS_MODULE_ACTIONS
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible calcular diagnóstico de ticket.";
      pushMessage("kora", `No pude armar el diagnóstico ahora. ${message}`, CROSS_MODULE_ACTIONS);
    } finally {
      setBusy(false);
    }
  }

  async function answerLastCreatedProduct() {
    if (!ensureToken()) return;
    setBusy(true);
    lastTopicRef.current = "inventory";
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/products/audit/recent?limit=30`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Error ${res.status} al consultar historial de productos.`);
      const rows = ((await res.json()) as KoraProductAuditEntry[]) ?? [];
      const created =
        rows.find((row) => ["create", "snapshot"].includes((row.action || "").toLowerCase())) ?? rows[0] ?? null;
      if (!created) {
        pushMessage("kora", "No encontré registros recientes de creación de productos.", PRODUCT_ACTIONS);
        return;
      }

      const after = tryGetValueFromUnknownRecord(created.changes, "after");
      const before = tryGetValueFromUnknownRecord(created.changes, "before");
      const source = (after && typeof after === "object" ? after : before && typeof before === "object" ? before : null) as
        | Record<string, unknown>
        | null;
      const productName =
        (source && typeof source.name === "string" && source.name.trim()) ||
        "Producto sin nombre legible";
      const productSku = source && typeof source.sku === "string" ? source.sku.trim() : "";
      const createdAt = formatBogotaDateTime(created.created_at);

      const detail = [
        `Último producto creado/registrado: ${productName}${productSku ? ` (SKU ${productSku})` : " (sin SKU asignado)"}.`,
        createdAt ? `Fecha: ${createdAt}.` : "",
        created.actor_name ? `Usuario: ${created.actor_name}.` : "",
        productSku ? "Tip: puedes consultarlo por SKU para trazabilidad rápida." : "Tip: este producto aún no tiene SKU; conviene asignarlo para trazabilidad.",
      ]
        .filter(Boolean)
        .join("\n");
      pushMessage("kora", detail, PRODUCT_ACTIONS);
      lastEntityRef.current = {
        ...lastEntityRef.current,
        moduleKey: "productos",
        productTerm: productSku || null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible consultar el último producto creado.";
      pushMessage("kora", `No pude consultar ese dato ahora. ${message}`, PRODUCT_ACTIONS);
    } finally {
      setBusy(false);
    }
  }

  async function askKoraFallback(query: string): Promise<KoraApiAskResponse | null> {
    if (!token) return null;
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/kora/ask`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          context: {
            topic: lastTopicRef.current ?? undefined,
            path: pathname ?? undefined,
          },
        }),
      });
      if (!res.ok) return null;
      return (await res.json()) as KoraApiAskResponse;
    } catch {
      return null;
    }
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
      return sku === normalizedTerm;
    });
    if (exact) return exact;

    const starts = items.find((item) => {
      const sku = normalizeQuery(item.sku ?? "");
      const name = normalizeQuery(item.product_name ?? "");
      return sku.startsWith(normalizedTerm) || name.startsWith(normalizedTerm);
    });
    if (starts) return starts;

    const containsSku = items.find((item) => normalizeQuery(item.sku ?? "").includes(normalizedTerm));
    if (containsSku) return containsSku;

    const containsName = items.find((item) => normalizeQuery(item.product_name ?? "").includes(normalizedTerm));
    return containsName ?? null;
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

  async function answerSalesDayReading() {
    if (!ensureToken()) return;
    setBusy(true);
    lastTopicRef.current = "sales";
    try {
      const data = await readSales();
      const todayKey = getBogotaDateKey(new Date());
      const todayRows = todayKey ? await readSalesBySingleDate(todayKey) : [];
      const topProducts = new Map<string, { name: string; units: number }>();
      for (const sale of todayRows) {
        for (const item of sale.items ?? []) {
          const name = (item.product_name || item.name || "Producto").trim();
          const key = normalizeQuery(`${name} ${item.product_sku || ""}`) || name.toLowerCase();
          const current = topProducts.get(key) ?? { name, units: 0 };
          current.units += Math.max(0, Number(item.quantity ?? 0));
          topProducts.set(key, current);
        }
      }
      const topToday = [...topProducts.values()].sort((a, b) => b.units - a.units).slice(0, 5);
      const insight = buildDailySalesInsight(data);
      const topTodayText = topToday.length
        ? topToday.map((item, index) => `${index + 1}. ${item.name} (${item.units.toFixed(0)} u)`).join("\n")
        : "No pude consolidar productos vendidos hoy.";
      pushMessage(
        "kora",
        `Reporte diario KORA:\n- Estado: ${insight.label}\n- Comentario: ${insight.explanation}\n- Ventas hoy: ${formatMoney(data.todaySales)} COP (${formatSignedPercent(insight.salesGapPct)} vs promedio diario del mes)\n- Tickets hoy: ${data.todayTickets} (${formatSignedPercent(insight.ticketsGapPct)} vs promedio diario del mes)\n- Ticket promedio hoy: ${formatMoney(data.todayTickets > 0 ? data.todaySales / data.todayTickets : 0)} COP\n- Productos más movidos hoy:\n${topTodayText}\n- Separados pendientes: ${data.pendingSeparated}`,
        [
          ...SALES_ACTIONS,
          { id: "daily-restock-today", label: "Ver repuestos de mañana", intent: "product_restock_today", inputOverride: "reporte diario de reposición de mañana" },
          { id: "daily-restock-general", label: "Ver bajo stock", intent: "product_restock_general", inputOverride: "bajo stock general" },
        ]
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible construir la lectura del día.";
      pushMessage("kora", `No pude generar la lectura del día ahora. ${message}`);
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

  async function answerBestSalesMonth() {
    if (!ensureToken()) return;
    setBusy(true);
    lastTopicRef.current = "sales";
    try {
      const { year: currentYear } = getBogotaDateParts();
      const fromYear = Math.max(2023, currentYear - 3);
      const yearlySeries = await Promise.all(
        Array.from({ length: currentYear - fromYear + 1 }, (_, index) => readMonthlySeries(fromYear + index))
      );

      let best: { year: number; month: number; total: number; tickets: number } | null = null;
      for (let index = 0; index < yearlySeries.length; index += 1) {
        const year = fromYear + index;
        for (const row of yearlySeries[index] ?? []) {
          if (!best || (row.total ?? 0) > best.total) {
            best = {
              year,
              month: row.month,
              total: row.total ?? 0,
              tickets: row.tickets ?? 0,
            };
          }
        }
      }

      if (!best || best.total <= 0) {
        pushMessage("kora", "No encontré suficiente histórico para determinar el mes con mayor venta.", SALES_ACTIONS);
        return;
      }

      const avgTicket = best.tickets > 0 ? best.total / best.tickets : 0;
      pushMessage(
        "kora",
        `El mes con mayor venta (últimos ${currentYear - fromYear + 1} años) fue ${monthLabel(best.month)} ${best.year}:\n- Total vendido: ${formatMoney(best.total)} COP\n- Tickets: ${best.tickets}\n- Ticket promedio: ${formatMoney(avgTicket)} COP`,
        SALES_ACTIONS
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible calcular el mes con mayor venta.";
      pushMessage("kora", `No pude calcular el mes con mayor venta ahora. ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function answerBestSalesDay() {
    if (!ensureToken()) return;
    setBusy(true);
    lastTopicRef.current = "sales";
    try {
      const limit = 200;
      const maxPages = 14;
      const toDate = new Date();
      const fromDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const dateFrom = getBogotaDateKey(fromDate) ?? "";
      const dateTo = getBogotaDateKey(toDate) ?? "";
      const byDay = new Map<string, { total: number; tickets: number }>();

      for (let page = 0; page < maxPages; page += 1) {
        const params = new URLSearchParams({
          date_from: dateFrom,
          date_to: dateTo,
          skip: String(page * limit),
          limit: String(limit),
        });
        const history = await fetchSalesHistory(params);
        const rows = history.items ?? [];
        for (const sale of rows) {
          const key = getBogotaDateKey(new Date(sale.created_at ?? "")) ?? "";
          if (!key) continue;
          const previous = byDay.get(key) ?? { total: 0, tickets: 0 };
          byDay.set(key, {
            total: previous.total + (sale.total ?? 0),
            tickets: previous.tickets + 1,
          });
        }
        if (rows.length < limit) break;
      }

      let bestKey = "";
      let bestTotal = 0;
      let bestTickets = 0;
      for (const [key, value] of byDay.entries()) {
        if (value.total > bestTotal) {
          bestKey = key;
          bestTotal = value.total;
          bestTickets = value.tickets;
        }
      }

      if (!bestKey || bestTotal <= 0) {
        pushMessage("kora", "No encontré suficiente histórico para determinar el día con mayor venta.", SALES_ACTIONS);
        return;
      }

      const [year, month, day] = bestKey.split("-").map((part) => Number.parseInt(part, 10));
      const avgTicket = bestTickets > 0 ? bestTotal / bestTickets : 0;
      lastEntityRef.current = { ...lastEntityRef.current, dateKey: bestKey, moduleKey: "reportes" };
      pushMessage(
        "kora",
        `El día con mayor venta (últimos 12 meses) fue ${day} de ${monthLabel(month)} de ${year}:\n- Total vendido: ${formatMoney(bestTotal)} COP\n- Tickets: ${bestTickets}\n- Ticket promedio: ${formatMoney(avgTicket)} COP`,
        [
          { id: "best-day-open-sales", label: "Abrir ventas de ese día", href: `/dashboard/sales?saleDate=${bestKey}` },
          ...SALES_ACTIONS,
        ]
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible calcular el día con mayor venta.";
      pushMessage("kora", `No pude calcular el día con mayor venta ahora. ${message}`);
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
    lastEntityRef.current = { ...lastEntityRef.current, paymentMethodSlug: paymentMethod.slug, moduleKey: "reportes" };
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
    lastEntityRef.current = { ...lastEntityRef.current, paymentMethodSlug: paymentMethod.slug, moduleKey: "reportes" };
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

  async function answerTopProductsCurrentMonth(input: string) {
    if (!ensureToken()) return;
    setBusy(true);
    lastTopicRef.current = "sales";
    try {
      const { year, month } = getBogotaDateParts();
      const monthKey = `${year}-${pad2(month)}`;
      const requestedRaw = normalizeQuery(input).match(/\b(\d{1,2})\b/)?.[1] ?? "10";
      const requested = Number.parseInt(requestedRaw, 10);
      const limit = Math.max(1, Math.min(20, Number.isFinite(requested) ? requested : 10));
      const topProducts = await fetchQuickInsights(monthKey);
      lastEntityRef.current = {
        ...lastEntityRef.current,
        moduleKey: "reportes",
        topProductsQueryActive: true,
        topProductsLimit: limit,
      };
      if (!topProducts.length) {
        pushMessage("kora", "No encontré ventas suficientes este mes para construir el ranking de productos.", SALES_ACTIONS);
        return;
      }
      const rows = topProducts.slice(0, limit);
      const lines = rows
        .map((row, index) => `${index + 1}. ${row.name} · ${Math.max(0, Math.trunc(row.units))} und · ${formatMoney(row.total)} COP`)
        .join("\n");
      const missing = limit - rows.length;
      pushMessage(
        "kora",
        `Top ${rows.length} productos más vendidos de ${monthLabel(month)} ${year}:\n${lines}${
          missing > 0 ? `\n\nNota: solo encontré ${rows.length} productos con ventas en el periodo.` : ""
        }`,
        SALES_ACTIONS
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible consultar el ranking de productos del mes.";
      pushMessage("kora", `No pude consultar el top de productos ahora. ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function answerTopProductsPreviousMonth(input: string) {
    if (!ensureToken()) return;
    setBusy(true);
    lastTopicRef.current = "sales";
    try {
      const { year, month } = getBogotaDateParts();
      const previousMonthDate = new Date(Date.UTC(year, month - 2, 1));
      const targetYear = previousMonthDate.getUTCFullYear();
      const targetMonth = previousMonthDate.getUTCMonth() + 1;
      const monthKey = `${targetYear}-${pad2(targetMonth)}`;
      const requestedRaw = normalizeQuery(input).match(/\b(\d{1,2})\b/)?.[1] ?? "";
      const requested = Number.parseInt(requestedRaw, 10);
      const fallbackLimit = lastEntityRef.current.topProductsLimit ?? 10;
      const limit = Math.max(1, Math.min(20, Number.isFinite(requested) ? requested : fallbackLimit));
      const topProducts = await fetchQuickInsights(monthKey);
      lastEntityRef.current = {
        ...lastEntityRef.current,
        moduleKey: "reportes",
        topProductsQueryActive: true,
        topProductsLimit: limit,
      };
      if (!topProducts.length) {
        pushMessage("kora", `No encontré ventas suficientes en ${monthLabel(targetMonth)} ${targetYear} para construir el ranking.`, SALES_ACTIONS);
        return;
      }
      const rows = topProducts.slice(0, limit);
      const lines = rows
        .map((row, index) => `${index + 1}. ${row.name} · ${Math.max(0, Math.trunc(row.units))} und · ${formatMoney(row.total)} COP`)
        .join("\n");
      const missing = limit - rows.length;
      pushMessage(
        "kora",
        `Top ${rows.length} productos más vendidos de ${monthLabel(targetMonth)} ${targetYear}:\n${lines}${
          missing > 0 ? `\n\nNota: solo encontré ${rows.length} productos con ventas en el periodo.` : ""
        }`,
        SALES_ACTIONS
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible consultar el ranking del mes anterior.";
      pushMessage("kora", `No pude consultar el top del mes anterior ahora. ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function answerTopProductsSpecificMonth(input: string) {
    if (!ensureToken()) return;
    setBusy(true);
    lastTopicRef.current = "sales";
    try {
      const parsed = parseMonthFromInput(input);
      if (!parsed) {
        pushMessage("kora", "Indícame el mes. Ejemplo: top 10 productos de febrero 2026.");
        return;
      }
      const monthKey = `${parsed.year}-${pad2(parsed.month)}`;
      const requestedRaw = normalizeQuery(input).match(/\b(\d{1,2})\b/)?.[1] ?? "";
      const requested = Number.parseInt(requestedRaw, 10);
      const fallbackLimit = lastEntityRef.current.topProductsLimit ?? 10;
      const limit = Math.max(1, Math.min(20, Number.isFinite(requested) ? requested : fallbackLimit));
      const topProducts = await fetchQuickInsights(monthKey);
      lastEntityRef.current = {
        ...lastEntityRef.current,
        moduleKey: "reportes",
        topProductsQueryActive: true,
        topProductsLimit: limit,
      };
      if (!topProducts.length) {
        pushMessage("kora", `No encontré ventas suficientes en ${monthLabel(parsed.month)} ${parsed.year} para construir el ranking.`, SALES_ACTIONS);
        return;
      }
      const rows = topProducts.slice(0, limit);
      const lines = rows
        .map((row, index) => `${index + 1}. ${row.name} · ${Math.max(0, Math.trunc(row.units))} und · ${formatMoney(row.total)} COP`)
        .join("\n");
      const missing = limit - rows.length;
      pushMessage(
        "kora",
        `Top ${rows.length} productos más vendidos de ${monthLabel(parsed.month)} ${parsed.year}:\n${lines}${
          missing > 0 ? `\n\nNota: solo encontré ${rows.length} productos con ventas en el periodo.` : ""
        }`,
        SALES_ACTIONS
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible consultar el ranking por mes.";
      pushMessage("kora", `No pude consultar ese top ahora. ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function answerSalesBySpecificDate(input: string) {
    if (!ensureToken()) return;
    const parsed =
      parseSpecificDate(input) ??
      (() => {
        const key = lastEntityRef.current.dateKey || "";
        if (!key) return null;
        const [year, month, day] = key.split("-").map((part) => Number.parseInt(part, 10));
        if (!year || !month || !day) return null;
        return { key, year, month, day };
      })();
    if (!parsed) {
      pushMessage("kora", "No pude interpretar esa fecha. Prueba por ejemplo: 3 de febrero o 03/02/2026.");
      return;
    }
    setBusy(true);
    lastTopicRef.current = "sales";
    lastEntityRef.current = { ...lastEntityRef.current, dateKey: parsed.key, moduleKey: "reportes" };
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
    const parsed =
      parseSpecificDate(input) ??
      (() => {
        const key = lastEntityRef.current.dateKey || "";
        if (!key) return null;
        const [year, month, day] = key.split("-").map((part) => Number.parseInt(part, 10));
        if (!year || !month || !day) return null;
        return { key, year, month, day };
      })();
    if (!parsed) {
      pushMessage("kora", "No pude interpretar esa fecha. Prueba por ejemplo: 21 de febrero o 21/02/2026.");
      return;
    }

    setBusy(true);
    lastTopicRef.current = "sales";
    lastEntityRef.current = { ...lastEntityRef.current, dateKey: parsed.key, moduleKey: "reportes" };
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

  function compactDigits(value?: string | null) {
    return (value || "").replace(/\D+/g, "");
  }

  function parseCustomerLookup(input: string) {
    const text = normalizeQuery(input);
    const wantsAll =
      text.includes("todos los que") ||
      text.includes("todas las que") ||
      text.includes("lista de") ||
      text.includes("dame todos");
    const byDocument = text.includes("documento") || text.includes("cedula") || text.includes("cédula");
    const byPhone = text.includes("telefono") || text.includes("teléfono") || text.includes("celular") || text.includes("phone");
    const byName = text.includes("nombre") || (!byDocument && !byPhone);
    const digits = compactDigits(text);
    let term = text
      .replace(
        /^(buscar|busca|buscame|encuentra|encontrar|localiza|consulta|consultar|muestrame|dime|ver|trae|dame)\s+/,
        ""
      )
      .replace(/^(tenemos|hay|existe|tienen|tiene)\s+/, "")
      .replace(/^un[oa]?\s+/, "")
      .replace(/^estoy buscando\s+/, "")
      .replace(/^si\s+/, "")
      .replace(/^(el|la|al|del)\s+/, "")
      .replace(/^cliente\s+/, "")
      .replace(/^clientes\s+/, "")
      .replace(/^el que tiene\s+/, "")
      .replace(/^los que tienen\s+/, "")
      .replace(/^con\s+/, "")
      .replace(/^(nombre|documento|cedula|cédula|telefono|teléfono|celular)\s+/, "")
      .trim();
    const fieldValueMatch = text.match(
      /(?:nombre|documento|cedula|cédula|telefono|teléfono|celular)\s*(?:es|sea|igual a|=|:)?\s+(.+)$/
    );
    if (fieldValueMatch?.[1]) {
      term = fieldValueMatch[1].trim();
    }
    term = term
      .replace(/^(de(l)?\s+)?cliente\s+/, "")
      .replace(/^(con\s+)?(nombre|documento|cedula|cédula|telefono|teléfono|celular)\s+/, "")
      .trim();
    if (!term && digits.length >= 6) term = digits;
    return { text, term, digits, wantsAll, byDocument, byPhone, byName };
  }

  function formatCustomerLine(customer: PosCustomerRead) {
    const fields = [
      customer.name?.trim() || "Cliente sin nombre",
      customer.phone ? `Tel: ${customer.phone}` : "",
      customer.tax_id ? `Doc: ${customer.tax_id}` : "",
      customer.email ? `Email: ${customer.email}` : "",
      customer.is_active ? "Activo" : "Inactivo",
    ].filter(Boolean);
    return `- ${fields.join(" | ")}`;
  }

  function sortCustomersByRelevance(rows: PosCustomerRead[], lookupText: string) {
    const normalizedLookup = normalizeQuery(lookupText);
    const lookupDigits = compactDigits(lookupText);
    const tokenize = (value: string) => value.split(/\s+/).filter(Boolean);
    const lookupTokens = tokenize(normalizedLookup);

    const scoreRow = (row: PosCustomerRead) => {
      const name = normalizeQuery(row.name || "");
      const phone = compactDigits(row.phone || "");
      const taxId = compactDigits(row.tax_id || "");
      let score = row.is_active ? 6 : 0;
      if (normalizedLookup && name === normalizedLookup) score += 120;
      if (normalizedLookup && name.startsWith(normalizedLookup)) score += 70;
      if (normalizedLookup && name.includes(normalizedLookup)) score += 50;
      if (lookupTokens.length) {
        const tokenHits = lookupTokens.filter((token) => token.length >= 2 && name.includes(token)).length;
        score += tokenHits * 10;
      }
      if (lookupDigits) {
        if (taxId === lookupDigits || phone === lookupDigits) score += 140;
        if (taxId.includes(lookupDigits) || phone.includes(lookupDigits)) score += 60;
      }
      return score;
    };

    return [...rows].sort((a, b) => scoreRow(b) - scoreRow(a));
  }

  async function answerCustomerLookup(input: string) {
    if (!ensureToken()) return;
    setBusy(true);
    lastEntityRef.current = { ...lastEntityRef.current, moduleKey: "clientes" };
    try {
      const lookup = parseCustomerLookup(input);
      const search = lookup.term;
      if (!search || search.length < 2) {
        pushMessage(
          "kora",
          "Para buscar un cliente, dame al menos 2 caracteres del nombre, documento o teléfono. Ejemplo: “buscar cliente juan”.",
          [{ id: "customer-open-module", label: "Abrir Gestión de clientes", href: "/dashboard/customers" }]
        );
        return;
      }
      let rows = await fetchPosCustomers(token as string, {
        search,
        limit: lookup.wantsAll ? 30 : 15,
        include_inactive: true,
      });
      if (!rows.length && lookup.byName) {
        const firstWord = search.split(/\s+/)[0] || "";
        if (firstWord.length >= 3) {
          rows = await fetchPosCustomers(token as string, {
            search: firstWord,
            limit: 20,
            include_inactive: true,
          });
        }
      }
      if (!rows.length) {
        pushMessage(
          "kora",
          `No encontré clientes con “${search}”. Prueba con otra parte del nombre, documento o teléfono.`,
          [{ id: "customer-open-empty", label: "Abrir Gestión de clientes", href: "/dashboard/customers" }]
        );
        return;
      }

      const sorted = sortCustomersByRelevance(rows, search);
      const exactRows = sorted.filter((row) => {
        const name = normalizeQuery(row.name || "");
        const phone = compactDigits(row.phone || "");
        const doc = compactDigits(row.tax_id || "");
        if (lookup.byDocument && lookup.digits) return doc === lookup.digits;
        if (lookup.byPhone && lookup.digits) return phone === lookup.digits;
        if (lookup.byName) {
          if (name === normalizeQuery(search)) return true;
          const wanted = normalizeQuery(search)
            .split(/\s+/)
            .filter((part) => part.length >= 2);
          return wanted.length > 0 && wanted.every((part) => name.includes(part));
        }
        return false;
      });
      const resultRows = exactRows.length ? exactRows : sorted;
      const top = resultRows[0] ?? null;
      if (top) {
        lastEntityRef.current = {
          ...lastEntityRef.current,
          moduleKey: "clientes",
          customerTerm: top.name || search,
          customerId: top.id,
        };
      }
      const limit = lookup.wantsAll ? 12 : 5;
      const preview = resultRows.slice(0, limit).map((row) => formatCustomerLine(row)).join("\n");
      const overflow = resultRows.length > limit ? `\n...y ${resultRows.length - limit} más.` : "";
      const exactNote = exactRows.length
        ? `Coincidencia exacta: ${exactRows.length} resultado(s).`
        : `No encontré exacto, pero sí resultados parecidos a “${search}”.`;
      pushMessage(
        "kora",
        `${exactNote}\nEncontré ${resultRows.length} cliente(s):\n${preview}${overflow}`,
        [{ id: "customer-open-results", label: "Abrir Gestión de clientes", href: "/dashboard/customers" }]
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible consultar clientes.";
      pushMessage(
        "kora",
        `No pude completar la búsqueda de cliente ahora. ${message}`,
        [{ id: "customer-open-error", label: "Abrir Gestión de clientes", href: "/dashboard/customers" }]
      );
    } finally {
      setBusy(false);
    }
  }

  function extractCustomerSalesTerm(input: string) {
    const text = normalizeQuery(input);
    const explicit = text
      .replace(/^(dame|dime|mostrar|muestrame|ver|trae|busca|buscar)\s+/, "")
      .replace(/^(que|qué)\s+ventas?\s+(tiene|tienen|tuvo)(\s+|$|\?)/, "")
      .replace(/^(y\s+)?de\s+(ella|el|él|ese\s+cliente|este\s+cliente)(\s+|$|\?)/, "")
      .replace(/^(muestrame|mostrar|dame|ver)\s+/, "")
      .replace(/^las?\s+ultim[oa]s?\s+\d{1,2}\s+/, "")
      .replace(/^las?\s+ventas\s+/, "")
      .replace(/^de(l)?\s+/, "")
      .replace(/^ese\s+cliente$/, "")
      .replace(/^este\s+cliente$/, "")
      .replace(/^cliente\s+/, "")
      .replace(/^ventas?\s*(de|del)?\s*$/, "")
      .trim();
    if (
      explicit &&
      explicit !== "cliente" &&
      explicit !== "que ventas tiene" &&
      explicit !== "que ventas tienen" &&
      explicit !== "de ella" &&
      explicit !== "de el" &&
      explicit !== "de él" &&
      explicit !== "de ese cliente" &&
      explicit !== "de este cliente" &&
      !/^ultim[oa]s?\s+\d{1,2}$/.test(explicit)
    ) {
      return explicit;
    }
    return lastEntityRef.current.customerTerm || "";
  }

  function extractCustomerSalesLimit(input: string): number | null {
    const text = normalizeQuery(input);
    const raw =
      text.match(/\bultim[oa]s?\s+(\d{1,2})\b/)?.[1] ||
      text.match(/\b(\d{1,2})\s+ultim[oa]s?\b/)?.[1] ||
      null;
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return null;
    return Math.max(1, Math.min(20, parsed));
  }

  async function answerCustomerSalesLookup(input: string) {
    if (!ensureToken()) return;
    setBusy(true);
    lastTopicRef.current = "sales";
    try {
      const customerTerm = extractCustomerSalesTerm(input);
      if (!customerTerm || customerTerm.length < 2) {
        pushMessage(
          "kora",
          "Para consultar ventas por cliente, dime el nombre/documento o primero búscalo. Ejemplo: “dame las ventas del cliente juan”.",
          [{ id: "customer-sales-open-customers", label: "Abrir Gestión de clientes", href: "/dashboard/customers" }]
        );
        return;
      }
      const params = new URLSearchParams({
        customer: customerTerm,
        skip: "0",
        limit: "30",
      });
      const history = await fetchSalesHistory(params);
      const rows = [...(history.items ?? [])].sort((a, b) => {
        const atA = a.created_at ? Date.parse(a.created_at) : 0;
        const atB = b.created_at ? Date.parse(b.created_at) : 0;
        return atB - atA;
      });
      const previewLimit = extractCustomerSalesLimit(input) ?? 5;
      const salesHref = `/dashboard/sales?term=${encodeURIComponent(customerTerm)}`;
      const documentsHref = `/dashboard/documents?term=${encodeURIComponent(customerTerm)}`;
      if (!rows.length) {
        pendingCustomerSalesNavigationRef.current = {
          customerTerm,
          salesHref,
          documentsHref,
        };
        pushMessage(
          "kora",
          `No encontré ventas para “${customerTerm}”. Si quieres, puedo llevarte a Documentos para revisar manualmente.`,
          [
            { id: "customer-sales-open-sales-empty", label: "Ver en historial de ventas", href: salesHref },
            { id: "customer-sales-open-docs-empty", label: "Ver en Documentos", href: documentsHref },
          ]
        );
        return;
      }
      const total = rows.reduce((acc, row) => acc + (row.total ?? 0), 0);
      const preview = rows
        .slice(0, previewLimit)
        .map((sale) => {
          const at = sale.created_at ? formatBogotaDateTime(sale.created_at) : "fecha no disponible";
          return `- ${saleLabel(sale)} | ${at} | ${formatMoney(sale.total ?? 0)} COP`;
        })
        .join("\n");
      lastEntityRef.current = {
        ...lastEntityRef.current,
        customerTerm,
      };
      pendingCustomerSalesNavigationRef.current = {
        customerTerm,
        salesHref,
        documentsHref,
      };
      pushMessage(
        "kora",
        `Ventas encontradas para “${customerTerm}”:\n- Registros: ${rows.length}\n- Total: ${formatMoney(total)} COP\n- Mostrando: ${Math.min(previewLimit, rows.length)} más recientes\n\nDetalle:\n${preview}\n\n¿Quieres verlas en Documentos?`,
        [
          { id: "customer-sales-open-sales", label: "Ver en historial de ventas", href: salesHref },
          { id: "customer-sales-open-docs", label: "Ver en Documentos", href: documentsHref },
        ]
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible consultar ventas por cliente.";
      pushMessage("kora", `No pude consultar ventas de ese cliente ahora. ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function answerProductByCode(input: string) {
    if (!ensureToken()) return;
    const normalizedInput = normalizeQuery(input);
    if (/\bid\s+\d+\b/.test(normalizedInput)) {
      pushMessage("kora", "En KORA trabajamos por SKU. Envíame el SKU del producto (ejemplo: SKU 100045).", PRODUCT_ACTIONS);
      return;
    }
    const codeRaw = extractProductCode(input);
    const code = codeRaw || (lastEntityRef.current.productTerm ?? "");
    if (!code) {
      pushMessage("kora", "Para buscar por SKU, escríbeme algo como: SKU 100045.");
      return;
    }
    setBusy(true);
    lastTopicRef.current = "inventory";
    lastEntityRef.current = { ...lastEntityRef.current, productTerm: code || null, moduleKey: "productos" };
    try {
      const product = await findProductRecord(code);
      if (!product) {
        pushMessage("kora", `No encontré un producto con SKU/código ${code}.`, PRODUCT_ACTIONS);
        return;
      }
      pushMessage(
        "kora",
        `Producto encontrado:\n- Nombre: ${product.product_name}\n- SKU: ${product.sku ?? "Sin SKU"}\n- Código barras: ${product.barcode ?? "—"}\n- Grupo: ${product.group_name ?? "Sin grupo"}\n- Stock: ${product.qty_on_hand}`,
        PRODUCT_ACTIONS
      );
      lastEntityRef.current = { ...lastEntityRef.current, productTerm: product.sku || product.product_name, moduleKey: "productos" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible consultar productos.";
      pushMessage("kora", `No pude buscar ese código ahora. ${message}`);
    } finally {
      setBusy(false);
    }
  }

  function formatStockUnits(value: number) {
    const stock = Math.trunc(Number(value ?? 0));
    if (stock < 0) {
      return `${stock} (faltan ${Math.abs(stock)} para cubrirlo)`;
    }
    return `${stock}`;
  }

  function formatCoverageDays(value: number | null | undefined) {
    if (value == null) return "—";
    if (!Number.isFinite(value)) return "sin consumo reciente";
    if (value < 1) return "< 1 día";
    return `${Math.round(value)} días`;
  }

  async function answerProductStockLookup(input: string) {
    if (!ensureToken()) return;
    const directCode = extractProductCode(input);
    const extractedTerm = extractProductTerm(input);
    const genericStockTerms = new Set(["stock", "cantidad", "unidades", "cantidad de stock"]);
    const safeTerm = extractedTerm && !genericStockTerms.has(normalizeQuery(extractedTerm)) ? extractedTerm : "";
    const code = directCode || safeTerm || (lastEntityRef.current.productTerm ?? "");
    if (!code) {
      pushMessage("kora", "Dime el SKU o el nombre del producto. Ejemplo: ¿cuánto stock tiene el SKU 235?");
      return;
    }
    setBusy(true);
    lastTopicRef.current = "inventory";
    lastEntityRef.current = { ...lastEntityRef.current, productTerm: code || null, moduleKey: "productos" };
    try {
      const product = await findProductRecord(code);
      if (!product) {
        pushMessage("kora", `No encontré un producto con SKU/código ${code}.`, PRODUCT_ACTIONS);
        return;
      }
      const stockText = formatStockUnits(Number(product.qty_on_hand ?? 0));
      pushMessage(
        "kora",
        `Stock consultado:\n- Nombre: ${product.product_name}\n- SKU: ${product.sku ?? "Sin SKU"}\n- Stock actual: ${stockText}`,
        PRODUCT_ACTIONS
      );
      lastEntityRef.current = { ...lastEntityRef.current, productTerm: product.sku || product.product_name, moduleKey: "productos" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible consultar el stock del producto.";
      pushMessage("kora", `No pude consultar ese stock ahora. ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function answerProductGroup(input: string) {
    if (!ensureToken()) return;
    const codeOrTerm = extractProductCode(input) || extractProductTerm(input) || (lastEntityRef.current.productTerm ?? "");
    if (!codeOrTerm) {
      pushMessage("kora", "Dime el SKU o producto. Ejemplo: ¿a qué grupo pertenece SKU 100045?");
      return;
    }
    setBusy(true);
    lastTopicRef.current = "inventory";
    lastEntityRef.current = { ...lastEntityRef.current, productTerm: codeOrTerm || null, moduleKey: "productos" };
    try {
      const product = await findProductRecord(codeOrTerm);
      if (!product) {
        pushMessage("kora", `No encontré ese producto (${codeOrTerm}).`, PRODUCT_ACTIONS);
        return;
      }
      pushMessage(
        "kora",
        `${product.product_name} ${product.sku ? `(SKU ${product.sku}) ` : ""}pertenece al grupo: ${product.group_name ?? "Sin grupo asignado"}.`,
        PRODUCT_ACTIONS
      );
      lastEntityRef.current = { ...lastEntityRef.current, productTerm: product.sku || null, moduleKey: "productos" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible consultar el grupo del producto.";
      pushMessage("kora", `No pude consultar ese grupo ahora. ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function answerProductPrice(input: string) {
    if (!ensureToken()) return;
    const directCode = extractProductCode(input);
    const extractedTerm = extractProductTerm(input);
    const contextTerm = (lastEntityRef.current.productTerm ?? "").trim();
    const genericPriceTerms = new Set([
      "precio",
      "valor",
      "costo",
      "coste",
      "precio tiene",
      "que precio tiene",
      "qué precio tiene",
      "cual es el precio",
      "cuál es el precio",
      "precio del producto",
      "precio de ese",
    ]);
    const safeTerm = extractedTerm && !genericPriceTerms.has(normalizeQuery(extractedTerm)) ? extractedTerm : "";
    const code = directCode || contextTerm || safeTerm;
    if (!code) {
      pushMessage(
        "kora",
        "Indícame el SKU o dime primero qué producto quieres revisar 🙂. Ejemplo: SKU 100045."
      );
      return;
    }
    setBusy(true);
    lastTopicRef.current = "inventory";
    lastEntityRef.current = { ...lastEntityRef.current, productTerm: code || null, moduleKey: "productos" };
    try {
      const product = await findProductRecord(code);
      if (!product) {
        pushMessage("kora", `No encontré un producto con SKU/código ${code}.`, PRODUCT_ACTIONS);
        return;
      }
      pushMessage(
        "kora",
        `Precio de ${product.product_name}${product.sku ? ` (SKU ${product.sku})` : ""}:\n- Precio venta: ${formatMoney(product.price)} COP\n- Costo: ${formatMoney(product.cost)} COP\n- Estado: ${product.status === "critical" ? "Stock crítico" : product.status === "low" ? "Stock bajo" : "Stock OK"}`,
        PRODUCT_ACTIONS
      );
      lastEntityRef.current = { ...lastEntityRef.current, productTerm: product.sku || product.product_name, moduleKey: "productos" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible consultar el precio del producto.";
      pushMessage("kora", `No pude consultar ese precio ahora. ${message}`);
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

  function resolveProductTermFromInput(input: string) {
    const normalizedInput = normalizeQuery(input);
    const contextProductTerm = (lastEntityRef.current.productTerm ?? "").trim();
    const extractedProductTerm = (extractProductCode(input) || extractProductTerm(input) || "").trim();
    const referencesCurrentProduct =
      normalizedInput.includes("este producto") ||
      normalizedInput.includes("ese producto") ||
      normalizedInput.includes("este sku") ||
      normalizedInput.includes("ese sku") ||
      normalizedInput.includes("este articulo") ||
      normalizedInput.includes("ese articulo") ||
      normalizedInput.includes("este item") ||
      normalizedInput.includes("ese item");
    const genericReferenceTerms = new Set([
      "producto",
      "productos",
      "este producto",
      "ese producto",
      "sku",
      "este sku",
      "ese sku",
      "articulo",
      "articulos",
      "este articulo",
      "ese articulo",
      "item",
      "items",
      "este item",
      "ese item",
    ]);
    const safeExtractedTerm = genericReferenceTerms.has(normalizeQuery(extractedProductTerm)) ? "" : extractedProductTerm;
    return (referencesCurrentProduct ? contextProductTerm : "") || safeExtractedTerm || contextProductTerm;
  }

  async function answerLastSaleForProduct(input: string) {
    if (!ensureToken()) return;
    const productTerm = resolveProductTermFromInput(input);
    if (!productTerm) {
      pushMessage("kora", "Indícame el producto. Ejemplo: ¿cuándo fue la última vez que vendimos cabina 8A?");
      return;
    }
    setBusy(true);
    lastTopicRef.current = "sales";
    lastEntityRef.current = { ...lastEntityRef.current, productTerm, moduleKey: "reportes" };
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
      lastEntityRef.current = {
        ...lastEntityRef.current,
        productTerm,
        dateKey: getBogotaDateKey(new Date(found.created_at)) ?? null,
        moduleKey: "reportes",
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

  async function answerProductRestockAdvice(input: string) {
    if (!ensureToken()) return;
    const productTerm = resolveProductTermFromInput(input);
    if (!productTerm) {
      pushMessage("kora", "Para recomendar reposición, indícame el producto o SKU. Ejemplo: ¿debemos pedir más del SKU 1000?");
      return;
    }
    setBusy(true);
    lastTopicRef.current = "inventory";
    lastEntityRef.current = { ...lastEntityRef.current, productTerm, moduleKey: "productos" };
    try {
      const product = await findProductRecord(productTerm);
      if (!product) {
        pushMessage("kora", `No encontré ese producto (${productTerm}) para recomendar reposición.`, PRODUCT_ACTIONS);
        return;
      }

      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 30);
      const dateFrom = getBogotaDateKey(fromDate) ?? "";
      const maxPages = 4;
      const limit = 100;
      const queryTerm = (product.sku || product.product_name || productTerm).trim();
      let sales30d = 0;
      let tickets30d = 0;
      let units30d = 0;

      for (let page = 0; page < maxPages; page += 1) {
        const params = new URLSearchParams({
          date_from: dateFrom,
          skip: String(page * limit),
          limit: String(limit),
          term: queryTerm,
        });
        const history = await fetchSalesHistory(params);
        const rows = history.items ?? [];
        for (const row of rows) {
          if (!rowContainsProduct(row, queryTerm)) continue;
          tickets30d += 1;
          sales30d += row.total ?? 0;
          const matchedUnits = (row.items ?? [])
            .filter((item) => {
              const name = normalizeQuery(item.product_name || item.name || "");
              const sku = normalizeQuery(item.product_sku || "");
              const target = normalizeQuery(queryTerm);
              return !!target && (name.includes(target) || sku.includes(target));
            })
            .reduce((acc, item) => acc + Math.max(0, Number(item.quantity ?? 0)), 0);
          units30d += matchedUnits;
        }
        if (rows.length < limit) break;
      }

      const stock = Number(product.qty_on_hand ?? 0);
      const dailyUnits = units30d / 30;
      const coverageDays = dailyUnits > 0 ? stock / dailyUnits : Number.POSITIVE_INFINITY;
      let recommendation = "No priorizar reposición por ahora.";
      let reason = "no hay suficiente rotación reciente para justificar compra inmediata.";

      if ((stock <= 0 || (product.status ?? "") === "critical") && units30d > 0) {
        recommendation = "Sí, pedir ya.";
        reason = "tiene quiebre/estado crítico y sí hubo movimiento reciente.";
      } else if (dailyUnits > 0 && coverageDays <= 7) {
        recommendation = "Sí, pedir ya.";
        reason = `la cobertura estimada es de ~${coverageDays.toFixed(1)} días.`;
      } else if (dailyUnits > 0 && coverageDays <= 15) {
        recommendation = "Conviene reponer esta semana.";
        reason = `la cobertura estimada es de ~${coverageDays.toFixed(1)} días.`;
      } else if (units30d > 0) {
        recommendation = "No urgente; monitorear.";
        reason = `tiene cobertura aproximada de ${coverageDays.toFixed(1)} días al ritmo actual.`;
      }

      pushMessage(
        "kora",
        `Recomendación de reposición para ${product.product_name}${product.sku ? ` (SKU ${product.sku})` : ""}:\n- Stock actual: ${formatStockUnits(stock)}\n- Ventas 30 días: ${formatMoney(sales30d)} COP\n- Tickets 30 días: ${tickets30d}\n- Unidades estimadas 30 días: ${units30d}\n- Cobertura estimada: ${Number.isFinite(coverageDays) ? formatCoverageDays(coverageDays) : "sin consumo reciente"}\n\nConclusión KORA: ${recommendation}\nMotivo: ${reason}`,
        PRODUCT_ACTIONS
      );
      lastEntityRef.current = {
        ...lastEntityRef.current,
        productTerm: product.sku || product.product_name || productTerm,
        moduleKey: "productos",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible construir la recomendación de reposición.";
      pushMessage("kora", `No pude recomendar reposición ahora. ${message}`, PRODUCT_ACTIONS);
    } finally {
      setBusy(false);
    }
  }

  function resolveRestockForecastHorizon(input: string) {
    const text = normalizeQuery(input);
    if (text.includes("semana") || text.includes("proximos dias") || text.includes("próximos días")) return 4;
    if (text.includes("mañana") || text.includes("manana")) return 2;
    return 2;
  }

  async function answerProductRestockForecast(input: string, mode: "general" | "today") {
    if (!ensureToken()) return;
    setBusy(true);
    lastTopicRef.current = "inventory";
    lastEntityRef.current = { ...lastEntityRef.current, moduleKey: "productos" };
    try {
      const forecastMode = mode;
      const horizonDays = resolveRestockForecastHorizon(input);
      const data = await readRestockForecast(forecastMode, horizonDays);
      latestRestockReportRef.current = data;
      const previewItems = data.items.slice(0, data.mode === "today" ? 5 : 4);
      const messageLines = [
        data.mode === "today" ? "Productos vendidos hoy que conviene reponer mañana." : data.headline,
        "",
        "Resumen:",
        ...data.summary_lines.slice(0, 3).map((line) => `- ${line}`),
      ];

      if (previewItems.length) {
        messageLines.push("", "Productos priorizados:");
        previewItems.forEach((item, index) => {
          const sku = item.sku ? `SKU ${item.sku}` : "sin SKU";
          const coverage = formatCoverageDays(item.coverage_days);
          messageLines.push(
            `${index + 1}. ${item.product_name} (${sku}) - vendidas hoy: ${item.units_today.toFixed(0)} unidades, stock ${formatStockUnits(item.qty_on_hand)}, cobertura ${coverage}, sugerido ${item.suggested_qty.toFixed(0)}.`
          );
        });
      }

      messageLines.push(
        "",
        `Abre el reporte para ver el detalle completo, imprimirlo o guardarlo como PDF.${data.items.length > previewItems.length ? ` Hay ${data.items.length - previewItems.length} productos más en el reporte.` : ""}`
      );

      const forecastActions: KoraAction[] = [
        {
          id: `restock-report-open-${data.mode}-${Date.now()}`,
          label: "Ver reporte",
          intent: "restock_report_modal",
        },
      ];

      pushMessage("kora", messageLines.join("\n"), forecastActions);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible construir el pronóstico de reposición.";
      pushMessage("kora", `No pude hacer el pronóstico de reposición ahora. ${message}`, PRODUCT_ACTIONS);
    } finally {
      setBusy(false);
    }
  }

  async function openRestockReportModal() {
    const report = latestRestockReportRef.current;
    if (!report) {
      pushMessage("kora", "Primero genera un reporte de reposición para poder abrirlo.");
      return;
    }
    setRestockReport(report);
  }

  function closeRestockReportModal() {
    setRestockReport(null);
  }

  async function saveRestockReportPdf() {
    const report = restockReport ?? latestRestockReportRef.current;
    if (!report) return;
    setRestockReportSaving(true);
    try {
      const html = buildRestockReportHtml(report);
      const blob = await exportReportPdf(
        {
          preset_id: `kora-restock-${report.mode}`,
          title: "Reporte de reposición KORA",
          document_html: html,
        },
        token
      );
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `kora-reporte-reposicion-${report.mode}-${stamp}.pdf`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo guardar el PDF.";
      pushMessage("kora", `No pude guardar el PDF ahora. ${message}`);
    } finally {
      setRestockReportSaving(false);
    }
  }

  function printRestockReport() {
    const report = restockReport ?? latestRestockReportRef.current;
    if (!report || typeof window === "undefined") return;
    const html = buildRestockReportHtml(report);
    const printFrame = document.createElement("iframe");
    printFrame.style.position = "fixed";
    printFrame.style.right = "0";
    printFrame.style.bottom = "0";
    printFrame.style.width = "0";
    printFrame.style.height = "0";
    printFrame.style.border = "0";
    printFrame.setAttribute("aria-hidden", "true");
    document.body.appendChild(printFrame);

    const cleanup = () => {
      window.setTimeout(() => {
        printFrame.remove();
      }, 1000);
    };

    printFrame.onload = () => {
      const frameWindow = printFrame.contentWindow;
      if (!frameWindow) {
        cleanup();
        return;
      }
      frameWindow.focus();
      frameWindow.print();
      cleanup();
    };

    printFrame.srcdoc = html;
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
    lastIntentRef.current = intent;
    if (intent === "greeting") {
      pushMessage("kora", buildGreetingReply(input));
      return "handled" as const;
    }
    if (intent === "help") {
      const text = normalizeQuery(input);
      const asksIdentity =
        text.includes("quien eres") ||
        text.includes("quién eres") ||
        text.includes("quien te creo") ||
        text.includes("quién te creó") ||
        text.includes("quien te hizo") ||
        text.includes("quién te hizo") ||
        text.includes("de donde saliste") ||
        text.includes("de dónde saliste");
      const asksCapabilities =
        text.includes("que puedes hacer") ||
        text.includes("qué puedes hacer") ||
        text.includes("en que puedes ayudar") ||
        text.includes("en qué puedes ayudar") ||
        text.includes("para que sirves") ||
        text.includes("para qué sirves") ||
        text.includes("que eres capaz de hacer") ||
        text.includes("qué eres capaz de hacer");
      pushMessage(
        "kora",
        asksIdentity && !asksCapabilities
          ? `${buildKoraIdentityMessage()}\n\nSi quieres, te cuento lo que más me gusta hacer: ayudarte con cosas concretas del negocio.`
          : asksCapabilities
            ? `${buildKoraCapabilitiesMessage()}\n\nSi te parece, te muestro un caso real y lo vemos juntos.`
            : `${buildKoraIdentityMessage()}\n\n${buildKoraCapabilitiesMessage()}\n\nY si quieres, vamos probando con algo puntual.`
      );
      return "handled" as const;
    }
    if (intent === "module_guide") {
      answerModuleGuide(input);
      return "handled" as const;
    }
    if (intent === "current_module_context") {
      answerCurrentModuleContext();
      return "handled" as const;
    }
    if (intent === "module_connection") {
      answerModuleConnection(input);
      return "handled" as const;
    }
    if (intent === "module_playbook_task") {
      answerModulePlaybookTask(input);
      return "handled" as const;
    }
    if (intent === "cross_module_compare") {
      await answerCrossModuleCompare();
      return "handled" as const;
    }
    if (intent === "kpi_drop_diagnostic") {
      await answerKpiDropDiagnostic();
      return "handled" as const;
    }
    if (intent === "last_created_product") {
      await answerLastCreatedProduct();
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
      lastEntityRef.current = { ...lastEntityRef.current, moduleKey: "productos" };
      const text = normalizeQuery(input);
      const asksVariants =
        text.includes("variante") ||
        text.includes("variantes") ||
        text.includes("color") ||
        text.includes("talla") ||
        text.includes("referencia") ||
        text.includes("modelo");
      pushMessage(
        "kora",
        asksVariants
          ? "Para crear producto con variantes:\n1. Ve a Productos y crea el producto base.\n2. Define atributos de variante (ej. color, tamaño o modelo).\n3. Crea cada variante con su SKU, precio y stock.\n4. Guarda y valida que cada variante quede visible para venta."
          : "Para crear un producto:\n1. Ve a Productos.\n2. Clic en crear nuevo producto.\n3. Completa nombre, SKU, categoría y precio.\n4. Guarda y valida inventario inicial.",
        PRODUCT_GUIDE_ACTIONS
      );
      return "handled" as const;
    }
    if (intent === "how_create_hr_employee") {
      lastEntityRef.current = { ...lastEntityRef.current, moduleKey: "rrhh" };
      pushMessage(
        "kora",
        "Para crear un nuevo empleado en Recursos Humanos:\n1. Abre Recursos Humanos.\n2. Clic en “Nuevo empleado”.\n3. Completa datos personales, cargo y contacto.\n4. Guarda y valida que aparezca en el listado.",
        MODULE_GUIDES.rrhh.actions
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
    if (intent === "customer_lookup") {
      await answerCustomerLookup(input);
      return "handled" as const;
    }
    if (intent === "customer_sales_lookup") {
      await answerCustomerSalesLookup(input);
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
    if (intent === "sales_best_month") {
      await answerBestSalesMonth();
      return "handled" as const;
    }
    if (intent === "sales_best_day") {
      await answerBestSalesDay();
      return "handled" as const;
    }
    if (intent === "top_product_current_month") {
      await answerTopProductCurrentMonth();
      return "handled" as const;
    }
    if (intent === "top_products_current_month") {
      await answerTopProductsCurrentMonth(input);
      return "handled" as const;
    }
    if (intent === "top_products_previous_month") {
      await answerTopProductsPreviousMonth(input);
      return "handled" as const;
    }
    if (intent === "top_products_specific_month") {
      await answerTopProductsSpecificMonth(input);
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
    if (intent === "product_stock_lookup") {
      await answerProductStockLookup(input);
      return "handled" as const;
    }
    if (intent === "product_price_lookup") {
      await answerProductPrice(input);
      return "handled" as const;
    }
    if (intent === "product_group_lookup") {
      await answerProductGroup(input);
      return "handled" as const;
    }
    if (intent === "product_restock_advice") {
      await answerProductRestockAdvice(input);
      return "handled" as const;
    }
    if (intent === "product_restock_general") {
      await answerProductRestockForecast(input, "general");
      return "handled" as const;
    }
    if (intent === "product_restock_today") {
      await answerProductRestockForecast(input, "today");
      return "handled" as const;
    }
    if (intent === "restock_report_modal") {
      await openRestockReportModal();
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
    if (intent === "sales_day_reading") {
      await answerSalesDayReading();
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
    lastUserInputRef.current = input;
    updateToneModeFromUserInput(input);
    const startedAt = Date.now();

    pushMessage("user", input);
    setDraft("");

    const conversationIntent = classifyConversationInput(input);
    if (conversationIntent !== "unknown") {
      lastIntentRef.current = null;
      pushMessage("kora", buildConversationReply(conversationIntent, input));
      logMetric({
        at: new Date().toISOString(),
        source: "message",
        input,
        intent: "unknown",
        status: "handled",
        latencyMs: Date.now() - startedAt,
      });
      return;
    }

    const pendingCustomerNav = pendingCustomerSalesNavigationRef.current;
    if (pendingCustomerNav) {
      const decision = resolveBinaryConfirmation(input);
      if (decision === "yes") {
        pendingCustomerSalesNavigationRef.current = null;
        pushMessage("kora", `Perfecto, te llevo a Documentos para "${pendingCustomerNav.customerTerm}".`);
        lastEntityRef.current = { ...lastEntityRef.current, moduleKey: "documentos" };
        router.push(pendingCustomerNav.documentsHref);
        setOpen(false);
        logMetric({
          at: new Date().toISOString(),
          source: "message",
          input,
          intent: "customer_sales_lookup",
          status: "handled",
          latencyMs: Date.now() - startedAt,
        });
        return;
      }
      if (decision === "no") {
        pendingCustomerSalesNavigationRef.current = null;
        pushMessage(
          "kora",
          `Listo, no te redirijo. Si quieres, puedo abrir historial de ventas para "${pendingCustomerNav.customerTerm}".`,
          [{ id: "customer-sales-open-sales-no", label: "Ver en historial de ventas", href: pendingCustomerNav.salesHref }]
        );
        logMetric({
          at: new Date().toISOString(),
          source: "message",
          input,
          intent: "customer_sales_lookup",
          status: "handled",
          latencyMs: Date.now() - startedAt,
        });
        return;
      }
    }

    const intent = resolveIntentWithContext(input, lastTopicRef.current, lastEntityRef.current, resolveModuleFromQuery);
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

    const apiFallback = await askKoraFallback(input);
    if (apiFallback?.handled && apiFallback.answer.trim()) {
      lastIntentRef.current = "unknown";
      const apiActions: KoraAction[] = (apiFallback.actions ?? [])
        .filter((action) => !!action.label)
        .map((action, index) => ({
          id: `api-fallback-${Date.now()}-${index}`,
          label: action.label,
          href: action.href ?? undefined,
        }));

      const suggestionsText = (apiFallback.suggestions ?? [])
        .slice(0, 3)
        .map((entry) => `- ${entry}`)
        .join("\n");
      const finalAnswer = suggestionsText
        ? `${apiFallback.answer}\n\nSugerencias:\n${suggestionsText}`
        : apiFallback.answer;
      pushMessage("kora", finalAnswer, apiActions.length ? apiActions : undefined);

      logMetric({
        at: new Date().toISOString(),
        source: "message",
        input,
        intent: "unknown",
        status: "handled",
        latencyMs: Date.now() - startedAt,
      });
      return;
    }

    const candidates = buildIntentCandidates(input, resolveModuleFromQuery);
    if (candidates.length >= 2 && candidates[0].score - candidates[1].score <= 8) {
      lastIntentRef.current = "unknown";
      pendingConfirmationRef.current = { input, candidates: candidates.slice(0, 2) };
      const topTwoIntents = new Set(candidates.slice(0, 2).map((candidate) => candidate.intent));
      const restockAmbiguous =
        topTwoIntents.has("product_restock_today") && topTwoIntents.has("product_restock_general");
      const confirmationText = restockAmbiguous
        ? "¿Te refieres a lo que se vendió hoy y conviene reponer mañana, o a lo que ya está bajo de stock?"
        : `Tu consulta puede significar dos cosas. ¿Cuál quieres que resuelva?`;
      pushMessage(
        "kora",
        confirmationText,
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

    const fallback = buildFallbackSuggestions(
      input,
      resolveModuleFromPathname(pathname) || lastEntityRef.current.moduleKey || null
    );
    lastIntentRef.current = "unknown";
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
    pendingCustomerSalesNavigationRef.current = null;
    lastUserInputRef.current = action.label;
    updateToneModeFromUserInput(action.label);
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
      lastEntityRef.current = {
        ...lastEntityRef.current,
        moduleKey: action.href.startsWith("/dashboard/movements") ? "movimientos" : "productos",
      };
    } else if (action.href.startsWith("/dashboard/labels-pilot")) {
      lastTopicRef.current = "inventory";
      lastEntityRef.current = { ...lastEntityRef.current, moduleKey: "etiquetado_beta" };
    } else if (action.href.startsWith("/dashboard/labels")) {
      lastTopicRef.current = "inventory";
      lastEntityRef.current = { ...lastEntityRef.current, moduleKey: "etiquetas" };
    } else if (action.href.startsWith("/dashboard/pos")) {
      lastTopicRef.current = "sales";
      lastEntityRef.current = { ...lastEntityRef.current, moduleKey: "pos" };
    } else if (action.href.startsWith("/dashboard/documents")) {
      lastEntityRef.current = { ...lastEntityRef.current, moduleKey: "documentos" };
    } else if (action.href.startsWith("/dashboard/reports") || action.href.startsWith("/dashboard/sales")) {
      lastTopicRef.current = "sales";
      lastEntityRef.current = { ...lastEntityRef.current, moduleKey: "reportes" };
    } else if (action.href.startsWith("/dashboard/comercio-web")) {
      lastTopicRef.current = "web";
      lastEntityRef.current = { ...lastEntityRef.current, moduleKey: "comercio_web" };
    } else if (action.href.startsWith("/dashboard/investment")) {
      lastEntityRef.current = { ...lastEntityRef.current, moduleKey: "inversion" };
    } else if (action.href.startsWith("/dashboard/hr")) {
      lastEntityRef.current = { ...lastEntityRef.current, moduleKey: "rrhh" };
    } else if (action.href.startsWith("/dashboard/schedule")) {
      lastEntityRef.current = { ...lastEntityRef.current, moduleKey: "horarios" };
    } else if (action.href.startsWith("/dashboard/customers")) {
      lastEntityRef.current = { ...lastEntityRef.current, moduleKey: "clientes" };
    } else if (action.href.startsWith("/dashboard/profile")) {
      lastEntityRef.current = { ...lastEntityRef.current, moduleKey: "perfil" };
    } else if (action.href.startsWith("/dashboard/settings")) {
      lastEntityRef.current = { ...lastEntityRef.current, moduleKey: "configuracion" };
    }
    persistCurrentSessionContext();
    router.push(action.href);
    setOpen(false);
  }

  function handleReset() {
    setMessages([{ id: 1, role: "kora", text: welcomeMessage }]);
    setDraft("");
    setRestockReport(null);
    lastTopicRef.current = null;
    lastSaleLookupRef.current = null;
    lastEntityRef.current = {};
    pendingConfirmationRef.current = null;
    pendingCustomerSalesNavigationRef.current = null;
    lastKoraReplyRef.current = null;
    toneModeRef.current = "professional";
    lastIntentRef.current = null;
    lastUserInputRef.current = "";
    nextIdRef.current = 2;
    sessionContextRef.current = getInitialSessionContext();
    persistSessionContext(sessionContextRef.current);
    setBriefing(null);
    setBriefingPromptVisible(false);
    setBriefingExpanded(false);
  }

  if (!enabled) return null;

  return (
    <div ref={rootRef} className="fixed right-5 bottom-5 z-[140] md:right-6 md:bottom-6">
      {KORA_SESSION_NUDGE_ENABLED && showSessionNudge && !open ? (
        <div
          className="fixed right-3 z-[145] w-[min(320px,calc(100vw-24px))] rounded-xl border px-3 py-2.5 shadow-lg md:right-6"
          style={{
            bottom: "calc(76px + env(safe-area-inset-bottom))",
            borderColor: "rgba(16,185,129,0.35)",
            background: "#ecfdf5",
            color: "#065f46",
            boxShadow: "0 20px 34px -24px rgba(6,95,70,0.7)",
          }}
        >
          <p className="text-xs font-semibold">Hola, soy KORA.</p>
          <p className="mt-1 text-xs leading-relaxed">
            Estoy en fase inicial y feliz de aprender contigo. Pruébame con una consulta y ayúdame a mejorar.
          </p>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => {
          setOpen((current) => {
            const next = !current;
            if (next) {
              markSessionNudgeSeen();
            }
            return next;
          });
        }}
        className="h-12 w-[78px] rounded-full border text-sm font-bold tracking-[0.08em] transition hover:translate-y-[-1px] md:h-12 md:w-[82px]"
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
          "absolute right-0 w-[min(560px,calc(100vw-24px))] overflow-hidden rounded-2xl border transition-all",
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
              className="flex h-7 w-7 items-center justify-center rounded-md border"
              style={{
                borderColor: "rgba(255,255,255,0.48)",
                background: "rgba(255,255,255,0.16)",
                color: "#ffffff",
              }}
              aria-label="Reiniciar conversación"
              title="Reiniciar conversación"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-4 w-4">
                <path
                  d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
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
            <article key={message.id} className={message.role === "kora" ? "max-w-[96%]" : "ml-auto max-w-[96%]"}>
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
                  {message.actions.map((action: KoraAction, index: number) => (
                    <button
                      key={`${action.id}-${index}`}
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
          {typeof document !== "undefined" && restockReport
            ? createPortal(
                <div
                  className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/55 p-4"
                  onClick={closeRestockReportModal}
                >
                  <section
                    className="flex h-[92vh] w-full max-w-[1320px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl space-y-6"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-emerald-500">
                          Informe generado
                        </p>
                        <h2 className="text-2xl font-semibold text-slate-900">
                          {restockReport.mode === "today"
                            ? "Productos vendidos hoy que conviene reponer mañana"
                            : "Productos con presión de reposición general"}
                        </h2>
                        <p className="text-sm text-slate-500 max-w-3xl">
                          {restockReport.headline}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => void saveRestockReportPdf()}
                          disabled={restockReportSaving}
                          className="px-3 py-1.5 rounded-md border border-slate-300 bg-slate-50 text-slate-700 hover:border-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {restockReportSaving ? "Generando PDF..." : "Descargar PDF"}
                        </button>
                        <button
                          type="button"
                          onClick={printRestockReport}
                          className="px-3 py-1.5 rounded-md border border-slate-300 bg-slate-50 text-slate-700 hover:border-emerald-400"
                        >
                          Imprimir
                        </button>
                        <button
                          type="button"
                          onClick={closeRestockReportModal}
                          className="px-3 py-1.5 rounded-md border border-rose-300 text-rose-600 hover:border-rose-400 hover:bg-rose-50"
                        >
                          Cerrar pestaña
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Productos</div>
                        <div className="mt-1 text-2xl font-semibold text-slate-900">{restockReport.items.length}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Críticos</div>
                        <div className="mt-1 text-2xl font-semibold text-rose-600">
                          {restockReport.items.filter((item) => item.urgency === "high").length}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">En vigilancia</div>
                        <div className="mt-1 text-2xl font-semibold text-amber-600">
                          {restockReport.items.filter((item) => item.urgency === "medium").length}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Bajos</div>
                        <div className="mt-1 text-2xl font-semibold text-emerald-600">
                          {restockReport.items.filter((item) => item.urgency === "low").length}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 overflow-auto pr-1">
                      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-700">
                          {restockReport.summary_lines.map((line, index) => (
                            <li key={`${line}-${index}`}>{line}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_24px_-18px_rgba(2,6,23,0.16)]">
                        <table className="min-w-full border-collapse text-sm">
                          <thead className="bg-slate-900 text-left text-[11px] uppercase tracking-wide text-slate-300">
                            <tr>
                              <th className="px-3 py-3">SKU</th>
                              <th className="px-3 py-3">Nombre</th>
                              <th className="px-3 py-3 text-right">Stock</th>
                              <th className="px-3 py-3 text-right">Hoy</th>
                              <th className="px-3 py-3">Cobertura</th>
                              <th className="px-3 py-3 text-right">Sugerido</th>
                              <th className="px-3 py-3">Urgencia</th>
                              <th className="px-3 py-3 text-right">Precio</th>
                              <th className="px-3 py-3">Motivo</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white">
                            {restockReport.items.map((item, index) => {
                              const urgencyClass =
                                item.urgency === "high"
                                  ? "text-rose-600"
                                  : item.urgency === "medium"
                                    ? "text-amber-600"
                                    : "text-emerald-700";
                              return (
                                <tr key={`${item.product_id}-${index}`} className="border-t border-slate-200">
                                  <td className="px-3 py-3 text-slate-600">{item.sku || "—"}</td>
                                  <td className="px-3 py-3 font-medium text-slate-900">{item.product_name}</td>
                                  <td className="px-3 py-3 text-right tabular-nums text-slate-700">{formatStockUnits(item.qty_on_hand)}</td>
                                  <td className="px-3 py-3 text-right tabular-nums text-slate-700">{Math.max(0, item.units_today).toFixed(0)}</td>
                                  <td className="px-3 py-3 text-slate-700">
                                    {formatCoverageDays(item.coverage_days)}
                                  </td>
                              <td className="px-3 py-3 text-right tabular-nums text-slate-700">{Math.max(0, item.suggested_qty).toFixed(0)}</td>
                              <td className={["px-3 py-3 font-semibold", urgencyClass].join(" ")}>
                                {item.urgency === "high" ? "Alta" : item.urgency === "medium" ? "Media" : "Baja"}
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums text-slate-700">{formatMoney(item.price)}</td>
                                  <td className="px-3 py-3 text-slate-600">{item.reason}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </section>
                </div>,
                document.body
              )
            : null}
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

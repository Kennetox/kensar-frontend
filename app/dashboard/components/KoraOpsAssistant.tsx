"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  fetchInventoryOverview,
  fetchInventoryProducts,
  fetchPosCustomers,
  type PosCustomerRead,
  type InventoryOverview,
} from "@/lib/api/inventory";
import { getApiBase } from "@/lib/api/base";
import { fetchSeparatedOrders } from "@/lib/api/separatedOrders";
import { fetchComercioWebOrders } from "@/lib/api/comercioWeb";
import { getBogotaDateKey } from "@/lib/time/bogota";
import {
  extractProductCode,
  extractProductHint,
  extractProductTerm,
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

type KoraFeedbackEntry = {
  id: string;
  at: string;
  source: "message" | "action";
  input: string;
  answer: string;
  intent: QueryIntent | "unknown";
  status: "handled" | "fallback";
  moduleKey?: KoraModuleKey | null;
  pathname?: string | null;
  userName?: string | null;
  feedback: "yes" | "no";
};

type PendingKoraFeedback = {
  id: string;
  at: string;
  source: "message" | "action";
  input: string;
  answer: string;
  intent: QueryIntent | "unknown";
  status: "handled" | "fallback";
  moduleKey?: KoraModuleKey | null;
  pathname?: string | null;
  userName?: string | null;
} | null;

type KoraApiAskResponse = {
  handled: boolean;
  answer: string;
  source: "rules-v2" | "openai-v2";
  confidence: number;
  actions?: Array<{ label: string; href?: string | null }>;
  suggestions?: string[];
  generated_at: string;
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
const KORA_FEEDBACK_KEY = "kora_ops_feedback_v1";
const KORA_MAX_FEEDBACK = 300;
const KORA_SESSION_NUDGE_KEY_PREFIX = "kora_ops_session_nudge_seen_v1";
const KORA_NUDGE_VISIBLE_MS = 20_000;
const KORA_NUDGE_REPEAT_MS = 30 * 60 * 1000;

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
  return `${greeting}${recipient}, soy KORA. Estoy en fase inicial y aprendiendo cada día para ayudarte mejor. ¿Qué quieres probar hoy?`;
}

function buildKoraIdentityMessage() {
  return "Soy KORA, asistente operativo de Metrik.\n\nMe creó Kenneth para apoyar al equipo del negocio en tareas reales del día a día.\n\nEstoy en fase inicial y en mejora continua para ayudarte cada vez mejor.";
}

function buildKoraCapabilitiesMessage() {
  return "Soy KORA, asistente operativo de Metrik.\n\nEsto es lo que puedo hacer hoy:\n\nVentas:\n- \"ventas de hoy\"\n- \"cuánto vendimos el mes pasado\"\n- \"cuál fue el mejor día de ventas\"\n\nProductos e inventario:\n- \"buscar SKU 100045\"\n- \"qué precio tiene el SKU 100045\"\n- \"deberíamos pedir más de este producto\"\n\nClientes:\n- \"tenemos clientes garcía\"\n- \"buscar cliente por documento 12345678\"\n- \"qué ventas tiene juan ricardo\"\n\nMódulos y operación:\n- \"qué estoy viendo\"\n- \"cómo usar Comercio Web\"\n- \"paso a paso para crear producto\"\n\nTambién puedo guiarte con acciones directas dentro del módulo donde estás.";
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

function buildConversationalLead(text: string, toneMode: KoraToneMode, lastIntent: QueryIntent | null) {
  const normalized = normalizeQuery(text);
  if (!normalized || startsWithGreetingOrWelcome(text)) return "";

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
    recovery: ["Entiendo, vamos a resolverlo.", "Vamos paso a paso para dejarlo listo."],
    guide: ["Claro, te guío paso a paso.", "Perfecto, vamos por partes."],
    negative: ["Ojo, hay una señal importante para revisar.", "Te dejo la alerta principal para actuar rápido."],
    insight: ["Aquí tienes el resumen clave.", "Te comparto el dato principal."],
    default: ["Listo.", "Perfecto."],
  };
  const friendly = {
    recovery: ["Tranqui, lo resolvemos ahora.", "Vamos con calma, yo te guío."],
    guide: ["De una, te guío paso a paso.", "Listo, vamos por partes."],
    negative: ["Ojo con este dato, vale la pena revisarlo.", "Hay una alerta aquí; mejor actuar rápido."],
    insight: ["Te cuento rápido lo clave.", "Aquí va el resumen en corto."],
    default: ["Dale, listo.", "Perfecto, ahí te va."],
  };
  const voice = toneMode === "friendly" ? friendly : professional;
  if (isRecovery) return pickByHash(normalized, voice.recovery);
  if (isGuide) return pickByHash(normalized, voice.guide);
  if (isNegativeSignal) return pickByHash(normalized, voice.negative);
  if (isInsightIntent) return pickByHash(normalized, voice.insight);
  return pickByHash(normalized, voice.default);
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
  if (text.includes("cliente")) {
    actions.push(
      { id: "fb-customer-find", label: "Buscar cliente", intent: "customer_lookup", inputOverride: input },
      { id: "fb-customer-sales", label: "Ver ventas de ese cliente", intent: "customer_sales_lookup", inputOverride: input },
      { id: "fb-customer-open", label: "Abrir Gestión de clientes", href: "/dashboard/customers" }
    );
    return {
      text: "Tu consulta parece de clientes. Puedo buscar por nombre, documento o teléfono:",
      actions,
    };
  }

  const contextualModuleKey = moduleKey || resolveModuleFromQuery(text);
  if (contextualModuleKey) {
    const guide = MODULE_GUIDES[contextualModuleKey];
    const knowledge = getModuleSystemKnowledge(contextualModuleKey);
    return {
      text: `Puedo guiarte en ${guide.title}. Elige cómo quieres continuar:`,
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
    text: "No la interpreté completa. Prueba una reformulación guiada:",
    actions,
  };
}

export default function KoraOpsAssistant({ enabled, userName, token }: KoraOpsAssistantProps) {
  const router = useRouter();
  const pathname = usePathname();
  const welcomeMessage = buildWelcomeMessage(userName);
  const [open, setOpen] = useState(false);
  const [showSessionNudge, setShowSessionNudge] = useState(false);
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
  const lastEntityRef = useRef<KoraEntityContext>({});
  const pendingConfirmationRef = useRef<{ input: string; candidates: IntentCandidate[] } | null>(null);
  const pendingCustomerSalesNavigationRef = useRef<PendingCustomerSalesNavigation>(null);
  const toneModeRef = useRef<KoraToneMode>("professional");
  const lastIntentRef = useRef<QueryIntent | null>(null);
  const lastUserInputRef = useRef("");
  const pendingFeedbackRef = useRef<PendingKoraFeedback>(null);
  const lastKoraReplyRef = useRef<{ text: string; at: string } | null>(null);
  const sessionNudgeKeyRef = useRef<string>("");
  const sessionNudgeOpenedRef = useRef(false);
  const nudgeHideTimeoutRef = useRef<number | null>(null);
  const nudgeReappearTimeoutRef = useRef<number | null>(null);

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

  function logFeedback(entry: KoraFeedbackEntry) {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(KORA_FEEDBACK_KEY);
      const current = raw ? (JSON.parse(raw) as KoraFeedbackEntry[]) : [];
      const next = [...current.slice(-(KORA_MAX_FEEDBACK - 1)), entry];
      window.localStorage.setItem(KORA_FEEDBACK_KEY, JSON.stringify(next));
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
      return;
    }
    if (formalMarkers.some((marker) => text.includes(marker))) {
      toneModeRef.current = "professional";
    }
  }

  function pushMessage(
    role: KoraMessage["role"],
    text: string,
    actions?: KoraAction[],
    options?: { trackAsReply?: boolean }
  ) {
    const finalText =
      role === "kora"
        ? (() => {
            const lead = buildConversationalLead(text, toneModeRef.current, lastIntentRef.current);
            if (!lead) return text;
            const normalizedText = normalizeQuery(text);
            if (normalizedText.startsWith(normalizeQuery(lead))) return text;
            return `${lead}\n\n${text}`;
          })()
        : text;
    if (role === "kora" && (options?.trackAsReply ?? true)) {
      lastKoraReplyRef.current = { text: finalText, at: new Date().toISOString() };
    }
    setMessages((current) => [...current, { id: nextIdRef.current++, role, text: finalText, actions }]);
  }

  function queueFeedbackPrompt(meta: Omit<NonNullable<PendingKoraFeedback>, "id" | "at">) {
    const feedbackId = `kora-fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    pendingFeedbackRef.current = {
      id: feedbackId,
      at: new Date().toISOString(),
      ...meta,
    };
    pushMessage(
      "kora",
      "¿Te sirvió esta respuesta?",
      [
        { id: `kora-feedback-yes-${feedbackId}`, label: "Sí, me sirvió" },
        { id: `kora-feedback-no-${feedbackId}`, label: "No, no era lo que buscaba" },
      ],
      { trackAsReply: false }
    );
  }

  function commitPendingFeedback(decision: "yes" | "no") {
    const pending = pendingFeedbackRef.current;
    if (!pending) return false;
    logFeedback({
      ...pending,
      feedback: decision,
    });
    pendingFeedbackRef.current = null;
    pushMessage(
      "kora",
      decision === "yes"
        ? "Qué bien, gracias por confirmarlo."
        : "Gracias por avisarme. Ya dejé este caso marcado para mejora en Calidad KORA.",
      undefined,
      { trackAsReply: false }
    );
    return true;
  }

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
          context: { topic: lastTopicRef.current ?? undefined },
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
      const insight = buildDailySalesInsight(data);
      pushMessage(
        "kora",
        `Lectura KORA del día:\n- Estado: ${insight.label}\n- Comentario: ${insight.explanation}\n- Ventas hoy: ${formatMoney(data.todaySales)} COP (${formatSignedPercent(insight.salesGapPct)} vs promedio diario del mes)\n- Tickets hoy: ${data.todayTickets} (${formatSignedPercent(insight.ticketsGapPct)} vs promedio diario del mes)\n- Promedio diario mes (ventas): ${formatMoney(insight.avgDailySales)} COP\n- Promedio diario mes (tickets): ${insight.avgDailyTickets.toFixed(1)}`,
        SALES_ACTIONS
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
    const genericPriceTerms = new Set(["precio", "valor", "costo", "coste"]);
    const safeTerm = extractedTerm && !genericPriceTerms.has(normalizeQuery(extractedTerm)) ? extractedTerm : "";
    const code = directCode || safeTerm || (lastEntityRef.current.productTerm ?? "");
    if (!code) {
      pushMessage("kora", "Indícame el SKU para consultar precio. Ejemplo: SKU 100045.");
      return;
    }
    setBusy(true);
    lastTopicRef.current = "inventory";
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

      const stock = Math.max(0, Number(product.qty_on_hand ?? 0));
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
        `Recomendación de reposición para ${product.product_name}${product.sku ? ` (SKU ${product.sku})` : ""}:\n- Stock actual: ${stock}\n- Ventas 30 días: ${formatMoney(sales30d)} COP\n- Tickets 30 días: ${tickets30d}\n- Unidades estimadas 30 días: ${units30d}\n- Cobertura estimada: ${Number.isFinite(coverageDays) ? `${coverageDays.toFixed(1)} días` : "sin consumo reciente"}\n\nConclusión KORA: ${recommendation}\nMotivo: ${reason}`,
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
      pushMessage("kora", `${resolveGreetingByBogotaTime()}, aquí estoy para ayudarte.`);
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
          ? buildKoraIdentityMessage()
          : asksCapabilities
            ? buildKoraCapabilitiesMessage()
            : `${buildKoraIdentityMessage()}\n\n${buildKoraCapabilitiesMessage()}`
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

    if (pendingFeedbackRef.current) {
      const feedbackDecision = resolveBinaryConfirmation(input);
      if (feedbackDecision === "yes" || feedbackDecision === "no") {
        const handledFeedback = commitPendingFeedback(feedbackDecision);
        if (handledFeedback) return;
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
      if (status === "handled" || status === "fallback") {
        const answer = lastKoraReplyRef.current?.text || "";
        if (answer.trim()) {
          queueFeedbackPrompt({
            source: "message",
            input,
            answer,
            intent,
            status,
            moduleKey: resolveModuleFromPathname(pathname) || lastEntityRef.current.moduleKey || null,
            pathname,
            userName: userName ?? null,
          });
        }
      }
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
      queueFeedbackPrompt({
        source: "message",
        input,
        answer: finalAnswer,
        intent: "unknown",
        status: "handled",
        moduleKey: resolveModuleFromPathname(pathname) || lastEntityRef.current.moduleKey || null,
        pathname,
        userName: userName ?? null,
      });
      return;
    }

    const candidates = buildIntentCandidates(input, resolveModuleFromQuery);
    if (candidates.length >= 2 && candidates[0].score - candidates[1].score <= 8) {
      lastIntentRef.current = "unknown";
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
    queueFeedbackPrompt({
      source: "message",
      input,
      answer: fallback.text,
      intent: "unknown",
      status: "fallback",
      moduleKey: resolveModuleFromPathname(pathname) || lastEntityRef.current.moduleKey || null,
      pathname,
      userName: userName ?? null,
    });
  }

  async function handleAction(action: KoraAction) {
    if (action.id.startsWith("kora-feedback-yes-")) {
      pushMessage("user", action.label);
      commitPendingFeedback("yes");
      return;
    }
    if (action.id.startsWith("kora-feedback-no-")) {
      pushMessage("user", action.label);
      commitPendingFeedback("no");
      return;
    }

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
      if (status === "handled" || status === "fallback") {
        const answer = lastKoraReplyRef.current?.text || "";
        if (answer.trim()) {
          queueFeedbackPrompt({
            source: "action",
            input: intentInput,
            answer,
            intent: action.intent,
            status,
            moduleKey: resolveModuleFromPathname(pathname) || lastEntityRef.current.moduleKey || null,
            pathname,
            userName: userName ?? null,
          });
        }
      }
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
    router.push(action.href);
    setOpen(false);
  }

  function handleReset() {
    setMessages([{ id: 1, role: "kora", text: welcomeMessage }]);
    setDraft("");
    lastTopicRef.current = null;
    lastSaleLookupRef.current = null;
    lastEntityRef.current = {};
    pendingConfirmationRef.current = null;
    pendingCustomerSalesNavigationRef.current = null;
    pendingFeedbackRef.current = null;
    lastKoraReplyRef.current = null;
    toneModeRef.current = "professional";
    lastIntentRef.current = null;
    lastUserInputRef.current = "";
    nextIdRef.current = 2;
  }

  return (
    <div ref={rootRef} className="fixed right-5 bottom-5 z-[140] md:right-6 md:bottom-6">
      {showSessionNudge && !open ? (
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

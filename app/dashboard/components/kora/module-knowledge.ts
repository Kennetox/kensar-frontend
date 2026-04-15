import { normalizeQuery } from "./nlp.ts";

export type KoraModuleKey =
  | "inicio"
  | "productos"
  | "movimientos"
  | "documentos"
  | "clientes"
  | "pos"
  | "etiquetas"
  | "etiquetado_beta"
  | "reportes"
  | "comercio_web"
  | "inversion"
  | "rrhh"
  | "horarios"
  | "perfil"
  | "configuracion";

export type ModuleGuideAction = {
  id: string;
  label: string;
  href: string;
};

export type ModuleGuide = {
  title: string;
  aliases: string[];
  summary: string;
  steps: string[];
  actions: ModuleGuideAction[];
};

export const REPORT_GUIDE_ACTIONS: ModuleGuideAction[] = [
  { id: "guide-reports-main", label: "Abrir Reportes", href: "/dashboard/reports" },
  { id: "guide-reports-detailed", label: "Abrir Reporte detallado", href: "/dashboard/reports/detailed" },
];

export const PRODUCT_GUIDE_ACTIONS: ModuleGuideAction[] = [
  { id: "guide-products-main", label: "Abrir Productos", href: "/dashboard/products" },
  { id: "guide-labels", label: "Abrir Etiquetas", href: "/dashboard/labels" },
];

export const MODULE_GUIDES: Record<KoraModuleKey, ModuleGuide> = {
  inicio: {
    title: "Inicio",
    aliases: ["inicio", "panel", "dashboard", "home", "resumen"],
    summary: "Monitorea ventas, tickets y actividad reciente del negocio.",
    steps: ["Revisa tarjetas de ventas/tickets.", "Valida gráficos y tendencias.", "Usa refrescar para datos del POS."],
    actions: [{ id: "module-inicio", label: "Abrir Inicio", href: "/dashboard" }],
  },
  productos: {
    title: "Productos",
    aliases: ["producto", "productos", "catalogo", "catálogo", "sku", "item", "articulo", "artículo"],
    summary: "Gestiona catálogo, precios, grupos, SKU y estado comercial.",
    steps: ["Abre Productos.", "Crea o edita ficha.", "Define precio, grupo, stock y datos web.", "Guarda y valida en búsqueda."],
    actions: [{ id: "module-productos", label: "Abrir Productos", href: "/dashboard/products" }],
  },
  movimientos: {
    title: "Movimientos",
    aliases: ["movimiento", "movimientos", "inventario", "entrada", "salida", "ajuste", "reconteo"],
    summary: "Controla entradas/salidas y trazabilidad de inventario.",
    steps: ["Abre Movimientos.", "Filtra por tipo/documento.", "Revisa lote o documento y responsable."],
    actions: [{ id: "module-movimientos", label: "Abrir Movimientos", href: "/dashboard/movements" }],
  },
  documentos: {
    title: "Documentos",
    aliases: ["documento", "documentos", "comprobante", "soporte"],
    summary: "Centraliza soportes y registros operativos del sistema.",
    steps: ["Abre Documentos.", "Busca por fecha o tipo.", "Abre el detalle para validar información."],
    actions: [{ id: "module-documentos", label: "Abrir Documentos", href: "/dashboard/documents" }],
  },
  clientes: {
    title: "Clientes",
    aliases: ["cliente", "clientes", "customer", "customers", "gestion clientes", "gestión clientes"],
    summary: "Administra el directorio comercial de clientes para operación de ventas y seguimiento.",
    steps: ["Abre Gestión de clientes.", "Busca por nombre o documento.", "Edita datos de contacto y guarda cambios."],
    actions: [{ id: "module-clientes", label: "Abrir Gestión de clientes", href: "/dashboard/customers" }],
  },
  pos: {
    title: "POS / Caja",
    aliases: ["pos", "caja", "venta rapida", "venta rápida", "facturacion", "facturación"],
    summary: "Ejecuta ventas, cobros y operaciones de caja.",
    steps: ["Entra a POS / Caja.", "Busca producto y agrega al carrito.", "Selecciona método de pago y confirma."],
    actions: [{ id: "module-pos", label: "Abrir POS / Caja", href: "/dashboard/pos" }],
  },
  etiquetas: {
    title: "Etiquetas",
    aliases: ["etiqueta", "etiquetas", "impresion etiquetas", "impresión etiquetas"],
    summary: "Genera e imprime etiquetas para productos.",
    steps: ["Abre Etiquetas.", "Filtra productos.", "Configura formato e imprime."],
    actions: [{ id: "module-etiquetas", label: "Abrir Etiquetas", href: "/dashboard/labels" }],
  },
  etiquetado_beta: {
    title: "Etiquetado (beta)",
    aliases: ["etiquetado beta", "beta etiquetas", "etiquetado"],
    summary: "Flujo alterno de etiquetado con herramientas en pruebas.",
    steps: ["Abre Etiquetado (beta).", "Valida plantilla y datos.", "Prueba impresión y revisa resultado."],
    actions: [{ id: "module-etiquetas-beta", label: "Abrir Etiquetado (beta)", href: "/dashboard/labels-pilot" }],
  },
  reportes: {
    title: "Reportes",
    aliases: ["reporte", "reportes", "informe", "informes", "analitica", "analítica"],
    summary: "Analiza ventas, tendencias y desempeño por periodos.",
    steps: ["Abre Reportes.", "Define rango de fechas.", "Aplica filtros y revisa KPIs."],
    actions: REPORT_GUIDE_ACTIONS,
  },
  comercio_web: {
    title: "Comercio Web",
    aliases: ["comercio web", "web", "orden web", "pedido web", "ecommerce", "e-commerce"],
    summary: "Gestiona pedidos online, pagos y cumplimiento.",
    steps: ["Abre Comercio Web.", "Filtra por estado de pago o fulfillment.", "Gestiona pedidos pendientes o listos."],
    actions: [{ id: "module-web", label: "Abrir Comercio Web", href: "/dashboard/comercio-web" }],
  },
  inversion: {
    title: "Inversión",
    aliases: ["inversion", "inversión", "margen", "rentabilidad"],
    summary: "Evalúa inversión por producto, márgenes y decisiones de compra.",
    steps: ["Abre Inversión.", "Filtra por periodo/producto.", "Revisa métricas de margen y rotación."],
    actions: [{ id: "module-inversion", label: "Abrir Inversión", href: "/dashboard/investment" }],
  },
  rrhh: {
    title: "Recursos Humanos",
    aliases: ["rrhh", "recursos humanos", "empleado", "empleados", "nomina", "nómina", "personal"],
    summary: "Administra empleados, historial y datos del equipo.",
    steps: ["Abre Recursos Humanos.", "Clic en nuevo empleado.", "Completa datos base y guarda.", "Verifica perfil creado."],
    actions: [
      { id: "module-rrhh", label: "Abrir Recursos Humanos", href: "/dashboard/hr" },
      { id: "module-rrhh-new", label: "Crear nuevo empleado", href: "/dashboard/hr/new" },
    ],
  },
  horarios: {
    title: "Horarios",
    aliases: ["horario", "horarios", "turno", "turnos", "agenda", "schedule"],
    summary: "Planifica semanas, turnos y plantillas operativas del equipo.",
    steps: ["Abre Horarios.", "Selecciona semana.", "Crea/edita turnos o aplica plantilla.", "Publica la semana."],
    actions: [{ id: "module-horarios", label: "Abrir Horarios", href: "/dashboard/schedule" }],
  },
  perfil: {
    title: "Perfil",
    aliases: ["perfil", "mi perfil", "cuenta", "usuario", "mis datos"],
    summary: "Gestiona tus datos personales, avatar y documentos de usuario.",
    steps: ["Abre Perfil.", "Actualiza datos base.", "Sube avatar/documentos si aplica.", "Guarda cambios."],
    actions: [{ id: "module-perfil", label: "Abrir Perfil", href: "/dashboard/profile" }],
  },
  configuracion: {
    title: "Configuración",
    aliases: ["configuracion", "configuración", "ajustes", "parametros", "parámetros", "settings"],
    summary: "Gestiona parámetros de operación, usuarios y reglas del sistema.",
    steps: ["Abre Configuración.", "Selecciona bloque (usuarios, POS, políticas).", "Guarda y valida impacto operativo."],
    actions: [{ id: "module-config", label: "Abrir Configuración", href: "/dashboard/settings" }],
  },
};

export function resolveModuleFromQuery(input: string): KoraModuleKey | null {
  const text = normalizeQuery(input);
  const entries = Object.entries(MODULE_GUIDES) as Array<[KoraModuleKey, ModuleGuide]>;
  let best: { key: KoraModuleKey; score: number } | null = null;
  for (const [key, guide] of entries) {
    const score = guide.aliases.reduce((acc, alias) => (text.includes(alias) ? acc + alias.length : acc), 0);
    if (!score) continue;
    if (!best || score > best.score) best = { key, score };
  }
  return best?.key ?? null;
}

export function buildModuleGuideMessage(moduleKey: KoraModuleKey) {
  const guide = MODULE_GUIDES[moduleKey];
  return `${guide.title}: ${guide.summary}\n${guide.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}`;
}

export function buildModuleTaskActions(moduleKey: KoraModuleKey) {
  const guide = MODULE_GUIDES[moduleKey];
  return guide.actions.slice(0, 2);
}

import type { KoraModuleKey } from "./module-knowledge.ts";

export type ModuleSystemKnowledge = {
  frontendSurface: string[];
  backendCapabilities: string[];
  operatorCapabilities: string[];
  suggestedPrompts: string[];
};

export const MODULE_SYSTEM_KNOWLEDGE: Record<KoraModuleKey, ModuleSystemKnowledge> = {
  inicio: {
    frontendSurface: ["/dashboard"],
    backendCapabilities: ["/dashboard/summary", "/dashboard/monthly-sales", "/dashboard/payment-methods"],
    operatorCapabilities: [
      "leer estado comercial del dia y del mes",
      "comparar tendencia mensual y metodos de pago",
      "detectar alertas de ticket promedio y volumen",
    ],
    suggestedPrompts: ["dame lectura del dia", "como va el ticket promedio hoy", "comparar ventas mes vs anterior"],
  },
  productos: {
    frontendSurface: ["/dashboard/products"],
    backendCapabilities: ["/products", "/product-groups", "/products/{id}/audit", "/products/import/xlsx", "/products/export/xlsx"],
    operatorCapabilities: [
      "guiarte para crear, editar o desactivar productos",
      "consultar precio, grupo y trazabilidad por SKU",
      "recomendar reposicion con base en ventas recientes",
    ],
    suggestedPrompts: ["como crear producto", "que precio tiene sku 100045", "a que grupo pertenece sku 100045"],
  },
  movimientos: {
    frontendSurface: ["/dashboard/movements", "/dashboard/movements/form/:kind"],
    backendCapabilities: ["/inventory/movements", "/inventory/recounts", "/manual-movements/documents", "/inventory/products/{id}/history"],
    operatorCapabilities: [
      "explicar flujos de entrada, salida, ajuste y reconteo",
      "guiar cierre o cancelacion de documentos de movimiento",
      "ayudar a rastrear historial de inventario por producto",
    ],
    suggestedPrompts: ["como registrar entrada manual", "como hacer reconteo", "como revisar trazabilidad de un producto"],
  },
  documentos: {
    frontendSurface: ["/dashboard/documents"],
    backendCapabilities: ["/dashboard/documents/export/xlsx", "/manual-movements/documents", "/receiving/documents"],
    operatorCapabilities: [
      "orientarte para ubicar soportes por fecha y tipo",
      "ayudar a identificar documento origen de movimientos",
      "guiar cruce entre documentos y ventas",
    ],
    suggestedPrompts: ["como buscar un documento", "que documentos tengo pendientes", "como validar un soporte de movimiento"],
  },
  clientes: {
    frontendSurface: ["/dashboard/customers"],
    backendCapabilities: ["/pos/customers", "/pos/customers/frequent"],
    operatorCapabilities: [
      "guiarte para buscar y actualizar datos de clientes",
      "explicar uso de clientes frecuentes en ventas",
      "asistir para mantener base limpia de contacto",
    ],
    suggestedPrompts: ["como buscar un cliente", "como editar datos de un cliente", "como ver clientes frecuentes"],
  },
  pos: {
    frontendSurface: ["/dashboard/pos", "/pos", "/dashboard/sales"],
    backendCapabilities: ["/pos/sales", "/pos/sales/history", "/pos/returns", "/pos/changes", "/pos/payment-methods"],
    operatorCapabilities: [
      "guiarte en flujo de venta y cobro",
      "apoyar consulta de ventas, devoluciones y cambios",
      "explicar configuracion operativa de caja y metodos de pago",
    ],
    suggestedPrompts: ["como registrar una venta", "ventas de una fecha especifica", "metodos de pago del 21/02/2026"],
  },
  etiquetas: {
    frontendSurface: ["/dashboard/labels"],
    backendCapabilities: ["/labels/export/xlsx", "/labels/cloud/print/{serial}", "/products"],
    operatorCapabilities: [
      "guiarte en impresion masiva y filtros de etiquetas",
      "ayudar a preparar exportes para etiquetado",
      "asistir en validacion de SKU y precio antes de imprimir",
    ],
    suggestedPrompts: ["como imprimir etiquetas", "como exportar etiquetas a excel", "como buscar producto para etiquetar"],
  },
  etiquetado_beta: {
    frontendSurface: ["/dashboard/labels-pilot"],
    backendCapabilities: ["/products", "/labels/cloud/print/{serial}"],
    operatorCapabilities: [
      "explicar flujo beta de etiquetado desde movimientos",
      "ayudar a validar impresora/agente de etiquetado",
      "guiar impresion contextual al recibir o ajustar inventario",
    ],
    suggestedPrompts: ["como usar etiquetado beta", "como validar impresora en beta", "como volver a movimientos"],
  },
  reportes: {
    frontendSurface: ["/dashboard/reports", "/dashboard/reports/detailed"],
    backendCapabilities: ["/reports/favorites", "/reports/export/pdf", "/reports/export/xlsx", "/reports/quick/insights"],
    operatorCapabilities: [
      "explicar indicadores, filtros y lectura de reportes",
      "comparar periodos y metodos de pago",
      "guiar exportacion en PDF o Excel",
    ],
    suggestedPrompts: ["como ver reportes", "cual es el mejor dia de ventas", "como exportar reporte en pdf"],
  },
  comercio_web: {
    frontendSurface: ["/dashboard/comercio-web"],
    backendCapabilities: ["/comercio-web/orders", "/comercio-web/catalog/products", "/comercio-web/catalog/categories", "/comercio-web/catalog/discount-codes"],
    operatorCapabilities: [
      "guiarte para gestionar pedidos y estados de fulfillment",
      "asistir con pagos, conversion a venta y seguimiento",
      "explicar catalogo web: publicaciones, categorias y cupones",
    ],
    suggestedPrompts: ["que pedidos web estan pendientes", "como registrar pago de pedido web", "como convertir pedido web a venta"],
  },
  inversion: {
    frontendSurface: ["/dashboard/investment"],
    backendCapabilities: ["/investment/summary", "/investment/products", "/investment/cuts", "/investment/payouts", "/investment/ledger"],
    operatorCapabilities: [
      "explicar analisis de margen y rotacion en inversion",
      "guiar cortes, conciliaciones y pagos",
      "apoyar consulta de lineas de venta para inversion",
    ],
    suggestedPrompts: ["como interpretar inversion", "como crear un corte de inversion", "como reconciliar un corte"],
  },
  rrhh: {
    frontendSurface: ["/dashboard/hr", "/dashboard/hr/new", "/dashboard/hr/:employeeId"],
    backendCapabilities: ["/hr/employees", "/hr/system-users", "/hr/employees/{id}/documents", "/hr/employees/{id}/avatar"],
    operatorCapabilities: [
      "guiarte en alta y actualizacion de empleados",
      "explicar vinculacion de usuario de sistema por empleado",
      "asistir con gestion de documentos y avatar del empleado",
    ],
    suggestedPrompts: ["como crear empleado", "como vincular usuario de sistema", "como subir documento de empleado"],
  },
  horarios: {
    frontendSurface: ["/dashboard/schedule"],
    backendCapabilities: ["/schedule/weeks", "/schedule/templates", "/schedule/shifts", "/schedule/weeks/{week_id}/export.csv"],
    operatorCapabilities: [
      "guiarte para crear o abrir una semana operativa",
      "explicar creacion, ajuste y publicacion de turnos",
      "asistir con exportacion de la planificacion",
    ],
    suggestedPrompts: ["como crear una semana de horarios", "como publicar la semana", "como exportar horario"],
  },
  perfil: {
    frontendSurface: ["/dashboard/profile"],
    backendCapabilities: ["/pos/profile", "/pos/profile/avatar", "/pos/profile/documents"],
    operatorCapabilities: [
      "guiarte para actualizar tus datos de perfil",
      "explicar carga de avatar y documentos personales",
      "asistir en organizacion de documentos de usuario",
    ],
    suggestedPrompts: ["como actualizar mi perfil", "como subir mi avatar", "como cargar un documento en perfil"],
  },
  configuracion: {
    frontendSurface: ["/dashboard/settings"],
    backendCapabilities: [
      "/pos/settings",
      "/pos/users",
      "/pos/roles/{role}/permissions",
      "/pos/stations",
      "/stock-devices",
      "/pos/logo-upload",
    ],
    operatorCapabilities: [
      "guiarte en permisos, usuarios y roles operativos",
      "asistir configuracion POS, estaciones y dispositivos",
      "explicar impacto de reglas de caja y seguridad",
    ],
    suggestedPrompts: ["como cambiar permisos de rol", "como crear usuario de caja", "como configurar una estacion POS"],
  },
};

export function getModuleSystemKnowledge(moduleKey: KoraModuleKey) {
  return MODULE_SYSTEM_KNOWLEDGE[moduleKey];
}

export type TenantModuleId =
  | "dashboard"
  | "products"
  | "movements"
  | "pos"
  | "documents"
  | "reports"
  | "settings"
  | "labels"
  | "labels_pilot"
  | "hr"
  | "investment"
  | "commerce_web"
  | "sales_history"
  | "users"
  | "schedule";

export type TenantModuleCatalogItem = {
  id: TenantModuleId;
  label: string;
  description: string;
  required: boolean;
  platform_visible: boolean;
  enabled_by_default: boolean;
};

export const TENANT_MODULE_CATALOG: TenantModuleCatalogItem[] = [
  { id: "dashboard", label: "Inicio", description: "Panel principal con indicadores generales.", required: true, platform_visible: true, enabled_by_default: true },
  { id: "products", label: "Productos", description: "Catalogo e inventario base del negocio.", required: true, platform_visible: true, enabled_by_default: true },
  { id: "movements", label: "Movimientos", description: "Entradas, salidas y control de stock.", required: true, platform_visible: true, enabled_by_default: true },
  { id: "pos", label: "POS / Caja", description: "Punto de venta y operaciones de caja.", required: true, platform_visible: true, enabled_by_default: true },
  { id: "documents", label: "Documentos", description: "Separados y documentos relacionados.", required: true, platform_visible: true, enabled_by_default: true },
  { id: "reports", label: "Reportes", description: "Informes y analitica del negocio.", required: true, platform_visible: true, enabled_by_default: true },
  { id: "settings", label: "Configuracion", description: "Preferencias generales y ajustes del software.", required: true, platform_visible: true, enabled_by_default: true },
  { id: "labels", label: "Etiquetas", description: "Generacion e impresion de etiquetas.", required: false, platform_visible: true, enabled_by_default: true },
  { id: "labels_pilot", label: "Etiquetado (beta)", description: "Flujo beta de etiquetado avanzado.", required: false, platform_visible: true, enabled_by_default: true },
  { id: "hr", label: "Recursos Humanos", description: "Gestion de empleados y datos laborales.", required: false, platform_visible: true, enabled_by_default: true },
  { id: "investment", label: "Inversion", description: "Seguimiento privado de inversion familiar.", required: false, platform_visible: true, enabled_by_default: false },
  { id: "commerce_web", label: "Comercio Web", description: "Ordenes web, pagos online y conversion a venta.", required: false, platform_visible: true, enabled_by_default: false },
  { id: "sales_history", label: "Historial de ventas", description: "Lectura historica de ventas y seguimiento.", required: true, platform_visible: false, enabled_by_default: true },
  { id: "users", label: "Usuarios", description: "Gestion interna de usuarios POS.", required: true, platform_visible: false, enabled_by_default: true },
  { id: "schedule", label: "Agenda", description: "Horarios y turnos del personal.", required: false, platform_visible: false, enabled_by_default: false },
];

export const REQUIRED_TENANT_MODULES = new Set(
  TENANT_MODULE_CATALOG.filter((item) => item.required).map((item) => item.id)
);

export function normalizeEnabledModules(
  enabledModules?: string[] | null,
  catalog: TenantModuleCatalogItem[] = TENANT_MODULE_CATALOG
): TenantModuleId[] {
  const allowed = new Set(catalog.map((item) => item.id));
  const required = new Set(catalog.filter((item) => item.required).map((item) => item.id));
  const normalized = new Set<TenantModuleId>();
  if (enabledModules == null) {
    for (const item of catalog) {
      if (item.enabled_by_default || item.required) {
        normalized.add(item.id);
      }
    }
  } else {
    for (const moduleId of enabledModules) {
      if (allowed.has(moduleId as TenantModuleId)) {
        normalized.add(moduleId as TenantModuleId);
      }
    }
  }
  for (const moduleId of required) {
    normalized.add(moduleId as TenantModuleId);
  }
  return catalog.map((item) => item.id).filter((id) => normalized.has(id));
}

export function isTenantModuleEnabled(
  enabledModules: string[] | null | undefined,
  moduleId: string,
  catalog: TenantModuleCatalogItem[] = TENANT_MODULE_CATALOG
): boolean {
  return normalizeEnabledModules(enabledModules, catalog).includes(moduleId as TenantModuleId);
}

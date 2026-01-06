"use client";

import { getApiBase } from "@/lib/api/base";

export type ThemeOption = "dark" | "midnight" | "light";

export type PosPrinterMode = "browser" | "qz-tray";
export type PosPrinterWidth = "80mm" | "58mm";

export type PosSettingsPayload = {
  company_name: string;
  tax_id: string;
  address: string;
  contact_email: string;
  contact_phone: string;
  ticket_logo_url?: string | null;
  logoUrl?: string | null;
  logo_url?: string | null;
  theme_mode: ThemeOption;
  accent_color: string;
  ticket_footer: string;
  auto_close_ticket: boolean;
  low_stock_alert: boolean;
  require_seller_pin: boolean;
  notifications: {
    daily_summary_email: boolean;
    cash_alert_email: boolean;
    cash_alert_sms: boolean;
    monthly_report_email: boolean;
  };
  closure_email_recipients?: string[] | null;
  ticket_email_cc?: string[] | null;
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_user?: string | null;
  smtp_password?: string | null;
  smtp_use_tls?: boolean | null;
  email_from?: string | null;
  printer_mode?: PosPrinterMode | null;
  printer_width?: PosPrinterWidth | null;
  printer_name?: string | null;
  printer_auto_open_drawer?: boolean | null;
  printer_drawer_button?: boolean | null;
  web_pos_send_closure_email?: boolean | null;
  station_closure_email_overrides?: Record<string, boolean> | null;
};

export type PosUserRecord = {
  id: number;
  name: string;
  email: string;
  role: "Administrador" | "Supervisor" | "Vendedor" | "Auditor";
  status: "Activo" | "Inactivo";
  phone?: string | null;
  position?: string | null;
  notes?: string | null;
  invited_at?: string | null;
  accepted_at?: string | null;
};

export type RolePermissionRoles = Record<PosUserRecord["role"], boolean>;

export type RolePermissionAction = {
  id: string;
  label: string;
  description: string;
  roles: RolePermissionRoles;
  editable?: boolean;
};

export type RolePermissionModule = {
  id: string;
  label: string;
  description: string;
  roles: RolePermissionRoles;
  actions: RolePermissionAction[];
  editable?: boolean;
};

export type PosStationRecord = {
  id: string;
  label: string;
  pos_user_email: string;
  is_active: boolean;
  send_closure_email?: boolean | null;
  last_login_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type PosStationResponse = {
  station: PosStationRecord;
  pin_plain?: string | null;
};

async function request<T>(
  path: string,
  init?: RequestInit,
  defaultValue?: T,
  token?: string | null
): Promise<T> {
  const headers = new Headers(
    init?.headers as HeadersInit | undefined
  );
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  try {
    const apiBase = getApiBase();
    const res = await fetch(`${apiBase}${path}`, {
      ...init,
      headers,
      credentials: "include",
    });
    if (!res.ok) {
      let detail: string | undefined;
      try {
        const errorBody = await res.json();
        if (typeof errorBody?.detail === "string") {
          detail = errorBody.detail;
        }
      } catch {
        // ignore parsing error
      }
      throw new Error(detail ?? `Error ${res.status}`);
    }
    const contentLength =
      res.headers.get("content-length") || res.headers.get("Content-Length");
    if (res.status === 204 || contentLength === "0" || contentLength === null) {
      return undefined as T;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn("Settings API fallback:", err);
    if (defaultValue !== undefined) return defaultValue;
    throw err;
  }
}

const defaultSettings: PosSettingsPayload = {
  company_name: "Kensar Electronic",
  tax_id: "900000000-0",
  address: "Cra. 15 #123 - Bogotá, Colombia",
  contact_email: "contacto@kensar.com",
  contact_phone: "+57 300 000 0000",
  ticket_logo_url: "",
  theme_mode: "dark",
  accent_color: "#10b981",
  ticket_footer:
    "Gracias por tu compra. Para garantías comunícate al WhatsApp oficial.",
  auto_close_ticket: true,
  low_stock_alert: true,
  require_seller_pin: false,
  notifications: {
    daily_summary_email: true,
    cash_alert_email: true,
    cash_alert_sms: false,
    monthly_report_email: true,
  },
  closure_email_recipients: [],
  ticket_email_cc: [],
  smtp_host: "",
  smtp_port: 587,
  smtp_user: "",
  smtp_password: "",
  smtp_use_tls: true,
  email_from: "",
  printer_mode: "browser",
  printer_width: "80mm",
  printer_name: "",
  printer_auto_open_drawer: false,
  printer_drawer_button: true,
  web_pos_send_closure_email: true,
  station_closure_email_overrides: {},
};

const defaultUsers: PosUserRecord[] = [
  {
    id: 1,
    name: "Nelsy Álvarez",
    email: "nelsy@kensar.com",
    role: "Administrador",
    status: "Activo",
    phone: "+57 300 123 4567",
    position: "Gerente",
    notes: "Usuario demo",
    invited_at: null,
    accepted_at: null,
  },
  {
    id: 2,
    name: "Laura Contreras",
    email: "laura@kensar.com",
    role: "Vendedor",
    status: "Activo",
    phone: "+57 315 987 6543",
    position: "Vendedora",
    notes: "",
    invited_at: null,
    accepted_at: null,
  },
];

export const defaultRolePermissions: RolePermissionModule[] = [
  {
    id: "dashboard",
    label: "Dashboard general",
    description: "Resumen de ventas, widgets y métricas rápidas.",
    roles: {
      Administrador: true,
      Supervisor: true,
      Vendedor: true,
      Auditor: true,
    },
    actions: [
      {
        id: "dashboard.metrics",
        label: "Ver widgets financieros",
        description: "Métricas de ventas, tickets y comparativos diarios.",
        roles: {
          Administrador: true,
          Supervisor: true,
          Vendedor: true,
          Auditor: true,
        },
      },
      {
        id: "dashboard.top",
        label: "Ver top de productos / vendedores",
        description: "Listados de desempeño en el dashboard.",
        roles: {
          Administrador: true,
          Supervisor: true,
          Vendedor: false,
          Auditor: true,
        },
      },
    ],
  },
  {
    id: "pos",
    label: "POS / Caja",
    description: "Vista táctil para ventas y gestión de turnos.",
    roles: {
      Administrador: true,
      Supervisor: true,
      Vendedor: true,
      Auditor: false,
    },
    actions: [
      {
        id: "pos.sale",
        label: "Crear/editar ventas",
        description: "Capturar productos, aplicar descuentos y finalizar.",
        roles: {
          Administrador: true,
          Supervisor: true,
          Vendedor: true,
          Auditor: false,
        },
      },
      {
        id: "pos.returns",
        label: "Procesar devoluciones",
        description: "Crear notas de crédito desde el POS.",
        roles: {
          Administrador: true,
          Supervisor: true,
          Vendedor: true,
          Auditor: false,
        },
      },
      {
        id: "pos.drawer",
        label: "Abrir cajón manual",
        description: "Botón para apertura forzada del cajón de efectivo.",
        roles: {
          Administrador: true,
          Supervisor: true,
          Vendedor: true,
          Auditor: false,
        },
      },
      {
        id: "pos.closure",
        label: "Cerrar turno / corte Z",
        description: "Registrar cierres diarios y diferencias de caja.",
        roles: {
          Administrador: true,
          Supervisor: true,
          Vendedor: true,
          Auditor: false,
        },
      },
    ],
  },
  {
    id: "documents",
    label: "Documentos",
    description: "Consulta de facturas, devoluciones y cierres.",
    roles: {
      Administrador: true,
      Supervisor: true,
      Vendedor: true,
      Auditor: true,
    },
    actions: [
      {
        id: "documents.view",
        label: "Ver facturas y tickets",
        description: "Historial con filtros y exportaciones básicas.",
        roles: {
          Administrador: true,
          Supervisor: true,
          Vendedor: true,
          Auditor: true,
        },
      },
      {
        id: "documents.reprint",
        label: "Reimprimir / reenviar tickets",
        description: "Enviar por correo o imprimir nuevamente.",
        roles: {
          Administrador: true,
          Supervisor: true,
          Vendedor: true,
          Auditor: false,
        },
      },
      {
        id: "documents.export",
        label: "Exportar a Excel / PDF",
        description: "Descargas de listados para control.",
        roles: {
          Administrador: true,
          Supervisor: true,
          Vendedor: false,
          Auditor: true,
        },
      },
    ],
  },
  {
    id: "products",
    label: "Productos e inventario",
    description: "Catálogo, movimientos y ajustes físicos.",
    roles: {
      Administrador: true,
      Supervisor: true,
      Vendedor: false,
      Auditor: true,
    },
    actions: [
      {
        id: "products.manage",
        label: "Crear/editar productos",
        description: "Actualizar precios, costos, fotos y códigos.",
        roles: {
          Administrador: true,
          Supervisor: true,
          Vendedor: false,
          Auditor: false,
        },
      },
      {
        id: "inventory.movements",
        label: "Registrar movimientos",
        description: "Entradas, salidas y transferencias.",
        roles: {
          Administrador: true,
          Supervisor: true,
          Vendedor: false,
          Auditor: true,
        },
      },
      {
        id: "inventory.labels",
        label: "Generar etiquetas",
        description: "Descarga de plantillas para impresión.",
        roles: {
          Administrador: true,
          Supervisor: true,
          Vendedor: false,
          Auditor: false,
        },
      },
    ],
  },
  {
    id: "reports",
    label: "Reportes avanzados",
    description: "Reportes descargables, KPIs y comparativos.",
    roles: {
      Administrador: true,
      Supervisor: true,
      Vendedor: false,
      Auditor: true,
    },
    actions: [
      {
        id: "reports.export",
        label: "Exportar reportes",
        description: "Descargar en Excel/PDF para contabilidad.",
        roles: {
          Administrador: true,
          Supervisor: true,
          Vendedor: false,
          Auditor: true,
        },
      },
      {
        id: "reports.schedule",
        label: "Programar envíos por correo",
        description: "Configurar envío automático de reportes.",
        roles: {
          Administrador: true,
          Supervisor: true,
          Vendedor: false,
          Auditor: true,
        },
      },
    ],
  },
  {
    id: "settings",
    label: "Configuración",
    description: "Identidad, POS, usuarios, notificaciones y pagos.",
    roles: {
      Administrador: true,
      Supervisor: false,
      Vendedor: false,
      Auditor: false,
    },
    editable: false,
    actions: [
      {
        id: "settings.users",
        label: "Gestionar usuarios",
        description: "Crear, invitar, suspender y definir permisos.",
        roles: {
          Administrador: true,
          Supervisor: false,
          Vendedor: false,
          Auditor: false,
        },
        editable: false,
      },
      {
        id: "settings.pos",
        label: "Configurar POS / métodos de pago",
        description: "Cambia logos, printers y métodos activos.",
        roles: {
          Administrador: true,
          Supervisor: false,
          Vendedor: false,
          Auditor: false,
        },
        editable: false,
      },
      {
        id: "settings.notifications",
        label: "Ajustar SMTP / notificaciones",
        description: "Control de emails, alertas y reportes programados.",
        roles: {
          Administrador: true,
          Supervisor: false,
          Vendedor: false,
          Auditor: false,
        },
        editable: false,
      },
    ],
  },
];

export async function fetchPosSettings(
  token?: string | null
): Promise<PosSettingsPayload> {
  return request<PosSettingsPayload>(
    "/pos/settings",
    undefined,
    token ? undefined : defaultSettings,
    token
  );
}

export async function fetchPosStations(
  token?: string | null
): Promise<PosStationRecord[]> {
  return request<PosStationRecord[]>(
    "/pos/stations",
    undefined,
    [],
    token
  );
}

export async function createPosStation(
  payload: {
    label: string;
    pos_user_email: string;
    pin_plain?: string;
    send_closure_email?: boolean;
  },
  token?: string | null
): Promise<PosStationResponse> {
  return request<PosStationResponse>(
    "/pos/stations",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    undefined,
    token
  );
}

export async function updatePosStation(
  stationId: string,
  payload: {
    label?: string;
    is_active?: boolean;
    reset_pin?: boolean;
    pin_plain?: string;
    send_closure_email?: boolean;
  },
  token?: string | null
): Promise<PosStationResponse> {
  return request<PosStationResponse>(
    `/pos/stations/${stationId}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
    undefined,
    token
  );
}

export async function deletePosStation(
  stationId: string,
  token?: string | null
): Promise<void> {
  await request<void>(
    `/pos/stations/${stationId}`,
    {
      method: "DELETE",
    },
    undefined,
    token
  );
}

export async function savePosSettings(
  payload: PosSettingsPayload,
  token?: string | null
): Promise<PosSettingsPayload> {
  return request<PosSettingsPayload>(
    "/pos/settings",
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
    payload,
    token
  );
}

export async function fetchPosUsers(
  token?: string | null
): Promise<PosUserRecord[]> {
  return request<PosUserRecord[]>(
    "/pos/users",
    undefined,
    token ? undefined : defaultUsers,
    token
  );
}

export async function fetchRolePermissions(
  token?: string | null
): Promise<RolePermissionModule[]> {
  return request<{ modules: RolePermissionModule[] }>(
    "/pos/roles/permissions",
    undefined,
    { modules: defaultRolePermissions },
    token
  ).then((res) => res.modules);
}

export async function updateRolePermissions(
  modules: RolePermissionModule[],
  token?: string | null
): Promise<RolePermissionModule[]> {
  return request<{ modules: RolePermissionModule[] }>(
    "/pos/roles/permissions",
    {
      method: "PUT",
      body: JSON.stringify({ modules }),
    },
    { modules: defaultRolePermissions },
    token
  ).then((res) => res.modules);
}

export async function createPosUser(input: {
  name: string;
  email: string;
  phone?: string;
  position?: string;
  notes?: string;
  role: PosUserRecord["role"];
  password?: string;
}, token?: string | null): Promise<PosUserRecord> {
  return request<PosUserRecord>(
    "/pos/users",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    {
      id: Date.now(),
      name: input.name,
      email: input.email,
      role: input.role,
      status: "Activo",
      phone: input.phone ?? "",
      position: input.position ?? "",
      notes: input.notes ?? "",
      invited_at: null,
      accepted_at: null,
    },
    token
  );
}

export async function updatePosUser(
  id: number,
  patch: Partial<
    Pick<
      PosUserRecord,
      "role" | "status" | "name" | "email" | "phone" | "position" | "notes"
    > & {
      password?: string;
    }
  >,
  token?: string | null
): Promise<PosUserRecord> {
  return request<PosUserRecord>(
    `/pos/users/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
    {
      id,
      name: patch.name ?? "Usuario",
      email: patch.email ?? "sin-email@kensar.com",
      role: (patch.role as PosUserRecord["role"]) ?? "Vendedor",
      status: (patch.status as PosUserRecord["status"]) ?? "Activo",
      phone: patch.phone ?? "",
      position: patch.position ?? "",
      notes: patch.notes ?? "",
    },
    token
  );
}

export async function deletePosUser(
  id: number,
  token?: string | null
): Promise<{ detail: string }> {
  return request<{ detail: string }>(
    `/pos/users/${id}`,
    { method: "DELETE" },
    { detail: "Usuario eliminado localmente (simulación)." },
    token
  );
}

export async function invitePosUser(
  id: number,
  token?: string | null
): Promise<{ detail: string; expires_in?: number }> {
  return request<{ detail: string; expires_in?: number }>(
    `/pos/users/${id}/invite`,
    { method: "POST" },
    {
      detail: "Invitación simulada. Configura la API para habilitar envíos.",
      expires_in: 3600,
    },
    token
  );
}

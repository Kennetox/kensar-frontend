"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import {
  ChangeEvent,
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ThemeOption,
  PosSettingsPayload,
  PosPrinterMode,
  PosPrinterWidth,
  fetchPosSettings,
  savePosSettings,
  fetchPosUsers,
  createPosUser,
  updatePosUser,
  deletePosUser,
  invitePosUser,
  fetchRolePermissions,
  updateRolePermissions,
  defaultRolePermissions,
  PosUserRecord,
  RolePermissionModule,
  fetchPosStations,
  createPosStation,
  updatePosStation,
  deletePosStation,
  unbindPosStation,
  PosStationRecord,
  PosStationResponse,
  sendPosStationNotice,
  sendSmtpTestEmail,
} from "@/lib/api/settings";
import {
  DEFAULT_PAYMENT_METHODS,
  fetchPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
  togglePaymentMethod,
  reorderPaymentMethods,
  type PaymentMethodRecord,
} from "@/lib/api/paymentMethods";
import { useAuth } from "../../providers/AuthProvider";
import { clearPosStationAccess, getPosStationAccess } from "@/lib/api/posStations";
import { getApiBase } from "@/lib/api/base";
import { fetchSeparatedOrders, SeparatedOrder } from "@/lib/api/separatedOrders";
import {
  buildBogotaDateFromKey,
  formatBogotaDate,
  getBogotaDateKey,
} from "@/lib/time/bogota";

type SettingsFormState = {
  companyName: string;
  taxId: string;
  address: string;
  contactEmail: string;
  contactPhone: string;
  logoUrl: string;
  theme: ThemeOption;
  colorAccent: string;
  ticketFooter: string;
  autoCloseTickets: boolean;
  lowStockAlert: boolean;
  requireSellerPin: boolean;
  notifications: {
    dailySummaryEmail: boolean;
    cashAlertEmail: boolean;
    cashAlertSms: boolean;
    monthlyReportEmail: boolean;
  };
  closureEmailRecipients: string;
  ticketEmailCc: string;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPassword: string;
  smtpUseTls: boolean;
  emailFrom: string;
  printerMode: PosPrinterMode;
  printerWidth: PosPrinterWidth;
  printerName: string;
  printerAutoOpenDrawer: boolean;
  printerDrawerButton: boolean;
  webPosSendClosureEmail: boolean;
  stationEmailOverrides: Record<string, boolean>;
};

const defaultForm: SettingsFormState = {
  companyName: "Kensar Electronic",
  taxId: "900000000-0",
  address: "Cra. 15 #123 - Bogotá, Colombia",
  contactEmail: "contacto@kensar.com",
  contactPhone: "+57 300 000 0000",
  logoUrl: "",
  theme: "dark",
  colorAccent: "#10b981",
  ticketFooter:
    "Gracias por tu compra. Recuerda nuestros canales oficiales para soporte.",
  autoCloseTickets: true,
  lowStockAlert: true,
  requireSellerPin: false,
  notifications: {
    dailySummaryEmail: true,
    cashAlertEmail: true,
    cashAlertSms: false,
    monthlyReportEmail: true,
  },
  closureEmailRecipients: "",
  ticketEmailCc: "",
  smtpHost: "",
  smtpPort: "587",
  smtpUser: "",
  smtpPassword: "",
  smtpUseTls: true,
  emailFrom: "",
  printerMode: "browser",
  printerWidth: "80mm",
  printerName: "",
  printerAutoOpenDrawer: false,
  printerDrawerButton: true,
  webPosSendClosureEmail: true,
  stationEmailOverrides: {},
};

const previewTicketNumber = 42;
const CONTROL_PENDING_LOOKBACK_DAYS = 30;
const BG_STORAGE_KEY = "kensar_bg_style";
const roleOrder: PosUserRecord["role"][] = [
  "Administrador",
  "Supervisor",
  "Vendedor",
  "Auditor",
];

type BackgroundStyle = "clean" | "soft" | "pattern";

const isBackgroundStyle = (value: string | null): value is BackgroundStyle =>
  value === "clean" || value === "soft" || value === "pattern";

const getDefaultBgStyle = (theme: ThemeOption): BackgroundStyle => {
  if (theme === "light") return "soft";
  if (theme === "midnight") return "clean";
  return "pattern";
};

const formatDateLabel = (value?: string | null) => {
  if (!value) return "";
  const formatted = formatBogotaDate(value, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return formatted || value;
};

const getLocalDateKey = (value?: string | number | Date) =>
  getBogotaDateKey(value);

const buildDateFromKey = (key: string) => buildBogotaDateFromKey(key);

const formatDateLabelFromKey = (key: string) =>
  formatBogotaDate(buildDateFromKey(key), {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

type SettingsTab =
  | "company"
  | "appearance"
  | "pos"
  | "payments"
  | "notifications"
  | "security"
  | "control";

const SETTINGS_TABS: {
  id: SettingsTab;
  label: string;
  description: string;
}[] = [
  {
    id: "company",
    label: "Detalles de empresa",
    description: "Identidad legal, contacto y branding para tickets.",
  },
  {
    id: "appearance",
    label: "Apariencia",
    description: "Paleta del POS, acentos y vista previa del ticket.",
  },
  {
    id: "pos",
    label: "Preferencias POS",
    description: "Comportamiento de caja y requisitos del cajero.",
  },
  {
    id: "payments",
    label: "Métodos de pago",
    description: "Gestiona los métodos disponibles en el POS.",
  },
  {
    id: "notifications",
    label: "Reportes y alertas",
    description: "Notificaciones diarias, SMS, correos y reportes futuros.",
  },
  {
    id: "security",
    label: "Seguridad / Usuarios",
    description: "Cuentas del POS, roles y restablecimiento de claves.",
  },
  {
    id: "control",
    label: "Control de caja",
    description: "Últimos cierres por estación y alertas de pendientes.",
  },
];

type StationControlRow = {
  stationId: string | null;
  label: string;
  email?: string | null;
  pendingCount: number;
  pendingSinceLabel?: string | null;
  pendingSinceKey?: string | null;
  lastClosureLabel?: string | null;
  lastClosureRange?: string | null;
  lastClosureAmount?: number | null;
  lastClosureDocument?: string | null;
};

type ControlSaleRecord = {
  id: number;
  created_at: string;
  closure_id?: number | null;
  station_id?: string | null;
  pos_name?: string | null;
  total?: number;
  payment_method: string;
  payments?: { id?: number; method: string; amount: number }[];
  refunded_total?: number | null;
  refunded_balance?: number | null;
  vendor_name?: string | null;
  is_separated?: boolean;
  initial_payment_method?: string | null;
  initial_payment_amount?: number | null;
  balance?: number | null;
};

type ControlReturnRecord = {
  id: number;
  created_at: string;
  closure_id?: number | null;
  sale_id?: number | null;
  station_id?: string | null;
  pos_name?: string | null;
  total_refund?: number | null;
  payments?: { method: string; amount: number }[];
};

type ControlChangeRecord = {
  id: number;
  created_at: string;
  closure_id?: number | null;
  sale_id?: number | null;
  station_id?: string | null;
  pos_name?: string | null;
  extra_payment?: number | null;
  refund_due?: number | null;
  payments?: { method: string; amount: number }[];
};

type ControlClosureRecord = {
  id: number;
  consecutive?: string | null;
  pos_name?: string | null;
  pos_identifier?: string | null;
  station_id?: string | null;
  opened_at?: string | null;
  closed_at?: string | null;
  net_amount?: number | null;
  total_amount?: number | null;
};

const PRINTER_MODES: {
  id: PosPrinterMode;
  label: string;
  description: string;
}[] = [
  {
    id: "browser",
    label: "Ventana del navegador",
    description:
      "Usa la impresora instalada como predeterminada. Muestra el cuadro de impresión.",
  },
  {
    id: "qz-tray",
    label: "Conector local (QZ Tray)",
    description:
      "Envía el ticket directo a la impresora térmica (sin cuadro de confirmación). Requiere instalar QZ Tray.",
  },
];

const PRINTER_WIDTHS: { id: PosPrinterWidth; label: string }[] = [
  { id: "80mm", label: "80 mm" },
  { id: "58mm", label: "58 mm" },
];

const safeString = (value: string | null | undefined, fallback = "") =>
  value ?? fallback;

const API_BASE = getApiBase().replace(/\/$/, "");

const normalizePosLabel = (value?: string | null) =>
  (value ?? "").replace(/^(pos\s+)+/i, "").trim().toLowerCase();

const isPosWebName = (value?: string | null) => {
  const normalized = normalizePosLabel(value);
  if (!normalized) return false;
  return normalized === "web" || normalized.includes("pos web") || normalized.includes("web");
};

type ClosureTotalsByMethod = {
  cash: number;
  card: number;
  qr: number;
  nequi: number;
  daviplata: number;
  credit: number;
};

const mapMethodToKey = (method: string): keyof ClosureTotalsByMethod | null => {
  const normalized = method?.toLowerCase() ?? "";
  if (!normalized) return null;
  if (normalized.includes("cash") || normalized.includes("efectivo")) return "cash";
  if (
    normalized.includes("card") ||
    normalized.includes("tarjeta") ||
    normalized.includes("datáfono") ||
    normalized.includes("dataphone")
  ) {
    return "card";
  }
  if (
    normalized.includes("qr") ||
    normalized.includes("transfer") ||
    normalized.includes("bancolombia") ||
    normalized.includes("consignacion")
  ) {
    return "qr";
  }
  if (normalized.includes("nequi")) return "nequi";
  if (normalized.includes("davi")) return "daviplata";
  if (
    normalized.includes("credito") ||
    normalized.includes("crédito") ||
    normalized.includes("separado")
  ) {
    return "credit";
  }
  return null;
};

const resolveLogoUrl = (raw?: string | null): string => {
  const trimmed = raw?.trim();
  if (!trimmed) return "";
  if (/^data:/i.test(trimmed)) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith("//")) {
    const protocol =
      typeof window !== "undefined" && window.location?.protocol
        ? window.location.protocol
        : "https:";
    return `${protocol}${trimmed}`;
  }
  if (trimmed.startsWith("/")) {
    return `${API_BASE}${trimmed}`;
  }
  return `${API_BASE}/${trimmed}`;
};

const normalizeBooleanMap = (value?: Record<string, unknown> | null) => {
  const result: Record<string, boolean> = {};
  if (!value || typeof value !== "object") {
    return result;
  }
  Object.entries(value).forEach(([key, raw]) => {
    if (typeof raw === "boolean") {
      result[key] = raw;
    }
  });
  return result;
};

function mapFromApi(payload: PosSettingsPayload): SettingsFormState {
  const joinList = (items?: string[] | null) =>
    Array.isArray(items) && items.length > 0 ? items.join("\n") : "";
  return {
    companyName: safeString(payload.company_name, ""),
    taxId: safeString(payload.tax_id, ""),
    address: safeString(payload.address, ""),
    contactEmail: safeString(payload.contact_email, ""),
    contactPhone: safeString(payload.contact_phone, ""),
    logoUrl: safeString(
      payload.logoUrl ?? payload.logo_url ?? payload.ticket_logo_url,
      ""
    ),
    theme: payload.theme_mode ?? "dark",
    colorAccent: safeString(payload.accent_color, "#10b981"),
    ticketFooter: safeString(payload.ticket_footer, ""),
    autoCloseTickets: Boolean(payload.auto_close_ticket),
    lowStockAlert: Boolean(payload.low_stock_alert),
    requireSellerPin: Boolean(payload.require_seller_pin),
    notifications: {
      dailySummaryEmail: payload.notifications.daily_summary_email,
      cashAlertEmail: payload.notifications.cash_alert_email,
      cashAlertSms: payload.notifications.cash_alert_sms,
      monthlyReportEmail: payload.notifications.monthly_report_email,
    },
    closureEmailRecipients: joinList(payload.closure_email_recipients),
    ticketEmailCc: joinList(payload.ticket_email_cc),
    smtpHost: safeString(payload.smtp_host, ""),
    smtpPort:
      payload.smtp_port !== undefined && payload.smtp_port !== null
        ? String(payload.smtp_port)
        : "",
    smtpUser: safeString(payload.smtp_user, ""),
    smtpPassword: safeString(payload.smtp_password, ""),
    smtpUseTls:
      payload.smtp_use_tls !== undefined && payload.smtp_use_tls !== null
        ? Boolean(payload.smtp_use_tls)
        : true,
    emailFrom: safeString(payload.email_from, ""),
    printerMode: payload.printer_mode ?? "browser",
    printerWidth: payload.printer_width ?? "80mm",
    printerName: safeString(payload.printer_name, ""),
    printerAutoOpenDrawer: Boolean(payload.printer_auto_open_drawer),
    printerDrawerButton:
      payload.printer_drawer_button === undefined
        ? true
        : Boolean(payload.printer_drawer_button),
    webPosSendClosureEmail:
      payload.web_pos_send_closure_email === undefined ||
      payload.web_pos_send_closure_email === null
        ? true
        : Boolean(payload.web_pos_send_closure_email),
    stationEmailOverrides: normalizeBooleanMap(
      payload.station_closure_email_overrides ?? null
    ),
  };
}

const parseNumberField = (value: string): number | undefined => {
  if (!value.trim()) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

const parseEmailList = (value: string) =>
  value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

function mapToApi(form: SettingsFormState): PosSettingsPayload {
  const normalizedLogoUrl = resolveLogoUrl(form.logoUrl);
  return {
    company_name: form.companyName ?? "",
    tax_id: form.taxId ?? "",
    address: form.address ?? "",
    contact_email: form.contactEmail ?? "",
    contact_phone: form.contactPhone ?? "",
    ticket_logo_url: normalizedLogoUrl,
    logoUrl: normalizedLogoUrl,
    theme_mode: form.theme,
    accent_color: form.colorAccent,
    ticket_footer: form.ticketFooter,
    auto_close_ticket: form.autoCloseTickets,
    low_stock_alert: form.lowStockAlert,
    require_seller_pin: form.requireSellerPin,
    notifications: {
      daily_summary_email: form.notifications.dailySummaryEmail,
      cash_alert_email: form.notifications.cashAlertEmail,
      cash_alert_sms: form.notifications.cashAlertSms,
      monthly_report_email: form.notifications.monthlyReportEmail,
    },
    closure_email_recipients: parseEmailList(form.closureEmailRecipients),
    ticket_email_cc: parseEmailList(form.ticketEmailCc),
    smtp_host: form.smtpHost.trim() || undefined,
    smtp_port: parseNumberField(form.smtpPort),
    smtp_user: form.smtpUser.trim() || undefined,
    smtp_password: form.smtpPassword || undefined,
    smtp_use_tls: form.smtpUseTls,
    email_from: form.emailFrom.trim() || undefined,
    printer_mode: form.printerMode,
    printer_width: form.printerWidth,
    printer_name: form.printerName.trim() || undefined,
    printer_auto_open_drawer: form.printerAutoOpenDrawer,
    printer_drawer_button: form.printerDrawerButton,
    web_pos_send_closure_email: form.webPosSendClosureEmail,
    station_closure_email_overrides: form.stationEmailOverrides,
  };
}

export default function SettingsPage() {
  const [form, setForm] = useState<SettingsFormState>(defaultForm);
  const [backgroundStyle, setBackgroundStyle] = useState<BackgroundStyle>(() => {
    if (typeof window === "undefined") {
      return getDefaultBgStyle(defaultForm.theme);
    }
    const stored = window.localStorage.getItem(BG_STORAGE_KEY);
    if (isBackgroundStyle(stored)) return stored;
    return getDefaultBgStyle(defaultForm.theme);
  });
  const [activeTab, setActiveTab] = useState<SettingsTab>("company");
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveToastVisible, setSaveToastVisible] = useState(false);
  const saveToastTimerRef = useRef<number | null>(null);

  const [users, setUsers] = useState<PosUserRecord[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<number | null>(null);
  const [editingUser, setEditingUser] = useState<PosUserRecord | null>(null);

  const [userForm, setUserForm] = useState<{
    name: string;
    email: string;
    phone: string;
    position: string;
    notes: string;
    role: PosUserRecord["role"];
    password: string;
    pin: string;
  }>({
    name: "",
    email: "",
    phone: "",
    position: "",
    notes: "",
    role: "Vendedor",
    password: "",
    pin: "",
  });
  const [creatingUser, setCreatingUser] = useState(false);
  const [userFormError, setUserFormError] = useState<string | null>(null);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [invitingUserId, setInvitingUserId] = useState<number | null>(null);
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
  const [rolePermissions, setRolePermissions] =
    useState<RolePermissionModule[]>(defaultRolePermissions);
  const [rolePermissionsLoading, setRolePermissionsLoading] = useState(true);
  const [rolePermissionsError, setRolePermissionsError] = useState<string | null>(null);
  const [rolePermissionsDirty, setRolePermissionsDirty] = useState(false);
  const [savingRolePermissions, setSavingRolePermissions] = useState(false);
  const [rolePermissionsMessage, setRolePermissionsMessage] = useState<string | null>(null);
  const [smtpTestSending, setSmtpTestSending] = useState(false);
  const [smtpTestMessage, setSmtpTestMessage] = useState<string | null>(null);
  const [smtpTestError, setSmtpTestError] = useState<string | null>(null);
  const [passwordModalUser, setPasswordModalUser] =
    useState<PosUserRecord | null>(null);
  const [passwordModalState, setPasswordModalState] = useState<{
    password: string;
    confirm: string;
    error: string | null;
    saving: boolean;
  }>({
    password: "",
    confirm: "",
    error: null,
    saving: false,
  });
  const [paymentMethods, setPaymentMethods] = useState<
    PaymentMethodRecord[]
  >(DEFAULT_PAYMENT_METHODS);
  const [paymentMethodsLoading, setPaymentMethodsLoading] =
    useState(false);
  const [paymentMethodsError, setPaymentMethodsError] = useState<
    string | null
  >(null);
  const [editingPayment, setEditingPayment] =
    useState<PaymentMethodRecord | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState<{
    name: string;
    slug: string;
    description: string;
    allow_change: boolean;
    color: string;
  }>({
    name: "",
    slug: "",
    description: "",
    allow_change: false,
    color: "",
  });
  const [paymentFormError, setPaymentFormError] = useState<string | null>(
    null
  );
  const [paymentSaving, setPaymentSaving] = useState(false);
  const { token, user } = useAuth();
  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : null),
    [token]
  );
  const logoFileInputRef = useRef<HTMLInputElement | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const [logoUploadMessage, setLogoUploadMessage] = useState<string | null>(null);
  const [stations, setStations] = useState<PosStationRecord[]>([]);
  const visibleStations = useMemo(() => stations, [stations]);
  const stationRecordMap = useMemo(() => {
    const map = new Map<string, PosStationRecord>();
    stations.forEach((station) => map.set(station.id, station));
    return map;
  }, [stations]);
  const [stationsLoading, setStationsLoading] = useState(false);
  const [stationsError, setStationsError] = useState<string | null>(null);
  const [stationModalOpen, setStationModalOpen] = useState(false);
  const [editingStation, setEditingStation] = useState<PosStationRecord | null>(null);
  const [stationForm, setStationForm] = useState<{
    label: string;
    email: string;
    password: string;
    confirmPassword: string;
    sendClosureEmail: boolean;
  }>({
    label: "",
    email: "",
    password: "",
    confirmPassword: "",
    sendClosureEmail: true,
  });
  const [stationSaving, setStationSaving] = useState(false);
  const [stationMessage, setStationMessage] = useState<string | null>(null);
  const [stationFormError, setStationFormError] = useState<string | null>(null);
  const [updatingStationId, setUpdatingStationId] = useState<string | null>(null);
  const [stationNoticeModalOpen, setStationNoticeModalOpen] = useState(false);
  const [stationNoticeTarget, setStationNoticeTarget] = useState<PosStationRecord | null>(null);
  const [stationNoticeMessage, setStationNoticeMessage] = useState("");
  const [stationNoticeError, setStationNoticeError] = useState<string | null>(null);
  const [stationNoticeSending, setStationNoticeSending] = useState(false);
  const [controlRows, setControlRows] = useState<StationControlRow[]>([]);
  const [controlLoading, setControlLoading] = useState(false);
  const [controlError, setControlError] = useState<string | null>(null);
  const [controlLastUpdated, setControlLastUpdated] = useState<string | null>(null);
  const [adminClosureLoading, setAdminClosureLoading] = useState<string | null>(null);
  const [adminClosureMessage, setAdminClosureMessage] = useState<string | null>(null);
  const [adminClosureError, setAdminClosureError] = useState<string | null>(null);
  const isAdmin = user?.role === "Administrador";
  const resolveStationId = useCallback(
    (stationId?: string | null, posName?: string | null) => {
      if (stationId) return stationId;
      if (isPosWebName(posName)) return "pos-web";
      const normalized = normalizePosLabel(posName);
      if (!normalized) return null;
      const matched = stations.find(
        (station) => normalizePosLabel(station.label) === normalized
      );
      return matched?.id ?? null;
    },
    [stations]
  );
  const getStationRecordFromResponse = useCallback(
    (response?: PosStationResponse | PosStationRecord | null) => {
      if (!response) return null;
      if ("station" in response && response.station) {
        return response.station;
      }
      return response as PosStationRecord;
    },
    []
  );

  const resetUserForm = useCallback(() => {
    setUserForm({
      name: "",
      email: "",
      phone: "",
      position: "",
      notes: "",
      role: "Vendedor",
      password: "",
      pin: "",
    });
    setEditingUser(null);
  }, []);

  const loadControlData = useCallback(async () => {
    if (!token || !authHeaders) return;
    try {
      setControlLoading(true);
      setControlError(null);
      const apiBase = getApiBase();
      const [salesRes, returnsRes, changesRes, closuresRes, separatedOrders] = await Promise.all([
        fetch(`${apiBase}/pos/sales?skip=0&limit=500`, {
          headers: authHeaders,
          credentials: "include",
        }),
        fetch(`${apiBase}/pos/returns?skip=0&limit=500`, {
          headers: authHeaders,
          credentials: "include",
        }),
        fetch(`${apiBase}/pos/changes?skip=0&limit=500`, {
          headers: authHeaders,
          credentials: "include",
        }),
        fetch(`${apiBase}/pos/closures?skip=0&limit=200`, {
          headers: authHeaders,
          credentials: "include",
        }),
        fetchSeparatedOrders({ limit: 200 }, token),
      ]);
      if (!salesRes.ok) {
        throw new Error("No se pudieron cargar las ventas recientes.");
      }
      if (!returnsRes.ok) {
        throw new Error("No se pudieron cargar las devoluciones recientes.");
      }
      if (!changesRes.ok) {
        throw new Error("No se pudieron cargar los cambios recientes.");
      }
      if (!closuresRes.ok) {
        throw new Error("No se pudieron cargar los cierres recientes.");
      }
      const sales: ControlSaleRecord[] = await salesRes.json();
      const returns: ControlReturnRecord[] = await returnsRes.json();
      const changes: ControlChangeRecord[] = await changesRes.json();
      const closures: ControlClosureRecord[] = await closuresRes.json();
      const saleMap = new Map<number, ControlSaleRecord>();
      sales.forEach((sale) => saleMap.set(sale.id, sale));
      const stationRecordsMap = new Map(stations.map((station) => [station.id, station]));
      const todayKey = getLocalDateKey();
      const todayStart = buildDateFromKey(todayKey);
      const lookbackDate = new Date(todayStart);
      lookbackDate.setUTCDate(
        lookbackDate.getUTCDate() - CONTROL_PENDING_LOOKBACK_DAYS
      );
      const lookbackKey = getLocalDateKey(lookbackDate);
      const rowsMap = new Map<
        string,
        StationControlRow & { pendingSinceKey?: string | null }
      >();
      const resolveLabel = (stationId: string | null, fallback?: string | null) => {
        if (stationId && stationRecordsMap.has(stationId)) {
          return stationRecordsMap.get(stationId)!.label;
        }
        if (stationId === "pos-web") return "POS Web";
        if (fallback) return fallback;
        return stationId ? stationId : "General (sin estación)";
      };
      const resolveEmail = (stationId: string | null) =>
        stationId && stationRecordsMap.get(stationId)
          ? stationRecordsMap.get(stationId)!.station_email ?? null
          : null;
      const ensureRow = (stationId: string | null, fallback?: string | null) => {
        const key = stationId ?? "__legacy__";
        if (!rowsMap.has(key)) {
          rowsMap.set(key, {
            stationId,
            label: resolveLabel(stationId, fallback),
            email: resolveEmail(stationId),
            pendingCount: 0,
            pendingSinceKey: null,
          });
        }
        return rowsMap.get(key)!;
      };
      stations.forEach((station) => ensureRow(station.id, station.label));
      const registerPending = (stationId: string | null, rawDate?: string | null) => {
        if (!rawDate) return;
        const dateKey = getLocalDateKey(rawDate);
        if (dateKey >= todayKey) return;
        if (dateKey < lookbackKey) return;
        const row = ensureRow(stationId);
        row.pendingCount += 1;
        if (!row.pendingSinceKey || dateKey < row.pendingSinceKey) {
          row.pendingSinceKey = dateKey;
          row.pendingSinceLabel = formatDateLabelFromKey(dateKey);
        }
      };
      sales.forEach((sale) => {
        if (sale.closure_id != null) return;
        const resolvedStation = resolveStationId(sale.station_id ?? null, sale.pos_name ?? null);
        registerPending(resolvedStation, sale.created_at);
      });
      returns.forEach((ret) => {
        if (ret.closure_id != null) return;
        const relatedSale = ret.sale_id ? saleMap.get(ret.sale_id) : undefined;
        const resolvedStation = resolveStationId(
          ret.station_id ?? relatedSale?.station_id ?? null,
          ret.pos_name ?? relatedSale?.pos_name ?? null
        );
        registerPending(resolvedStation, ret.created_at);
      });
      changes.forEach((change) => {
        if (change.closure_id != null) return;
        const relatedSale = change.sale_id ? saleMap.get(change.sale_id) : undefined;
        const resolvedStation = resolveStationId(
          change.station_id ?? relatedSale?.station_id ?? null,
          change.pos_name ?? relatedSale?.pos_name ?? null
        );
        registerPending(resolvedStation, change.created_at);
      });
      separatedOrders.forEach((order: SeparatedOrder) => {
        const baseSale = saleMap.get(order.sale_id);
        order.payments?.forEach((payment) => {
          if (payment.closure_id != null) return;
          const paymentStation = resolveStationId(
            payment.station_id ?? baseSale?.station_id ?? null,
            baseSale?.pos_name ?? null
          );
          registerPending(paymentStation, payment.paid_at);
        });
      });
      const sortedClosures = closures
        .filter((closure) => closure.closed_at)
        .sort((a, b) => {
          const aTime = a.closed_at ? Date.parse(a.closed_at) : 0;
          const bTime = b.closed_at ? Date.parse(b.closed_at) : 0;
          return bTime - aTime;
        });
      const seenStations = new Set<string>();
      sortedClosures.forEach((closure) => {
        const resolvedStation = resolveStationId(
          closure.station_id ?? null,
          closure.pos_name ?? closure.pos_identifier ?? null
        );
        const stationKey = resolvedStation ?? "__legacy__";
        if (seenStations.has(stationKey)) return;
        seenStations.add(stationKey);
        const row = ensureRow(
          resolvedStation,
          closure.pos_name ?? closure.pos_identifier ?? null
        );
        row.lastClosureLabel = closure.closed_at
          ? formatDateLabel(closure.closed_at)
          : undefined;
        if (closure.opened_at && closure.closed_at) {
          const startKey = getLocalDateKey(closure.opened_at);
          const endKey = getLocalDateKey(closure.closed_at);
          const startLabel = formatDateLabelFromKey(startKey);
          const endLabel = formatDateLabelFromKey(endKey);
          row.lastClosureRange =
            startKey === endKey ? startLabel : `${startLabel} → ${endLabel}`;
        }
        row.lastClosureAmount =
          closure.net_amount ?? closure.total_amount ?? null;
        row.lastClosureDocument =
          closure.consecutive ??
          `CL-${closure.id.toString().padStart(5, "0")}`;
      });
      const rows = Array.from(rowsMap.values()).sort((a, b) => {
        if (a.pendingCount > 0 && b.pendingCount === 0) return -1;
        if (a.pendingCount === 0 && b.pendingCount > 0) return 1;
        if (a.pendingSinceKey && b.pendingSinceKey) {
          return a.pendingSinceKey.localeCompare(b.pendingSinceKey);
        }
        return a.label.localeCompare(b.label);
      });
      setControlRows(rows);
      setControlLastUpdated(new Date().toISOString());
    } catch (err) {
      console.error(err);
      setControlError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar el estado de las estaciones."
      );
    } finally {
      setControlLoading(false);
    }
  }, [authHeaders, stations, token, resolveStationId]);

  const buildAdminClosureTotals = useCallback(
    async (stationId: string | null) => {
      if (!token || !authHeaders) {
        throw new Error("Sesión expirada. Inicia sesión nuevamente.");
      }
      const apiBase = getApiBase();
      const [salesRes, returnsRes, changesRes, separatedOrders] = await Promise.all([
        fetch(`${apiBase}/pos/sales?skip=0&limit=500`, {
          headers: authHeaders,
          credentials: "include",
        }),
        fetch(`${apiBase}/pos/returns?skip=0&limit=500`, {
          headers: authHeaders,
          credentials: "include",
        }),
        fetch(`${apiBase}/pos/changes?skip=0&limit=500`, {
          headers: authHeaders,
          credentials: "include",
        }),
        fetchSeparatedOrders({ limit: 500 }, token),
      ]);
      if (!salesRes.ok) {
        throw new Error("No se pudieron cargar las ventas recientes.");
      }
      if (!returnsRes.ok) {
        throw new Error("No se pudieron cargar las devoluciones recientes.");
      }
      if (!changesRes.ok) {
        throw new Error("No se pudieron cargar los cambios recientes.");
      }
      const sales: ControlSaleRecord[] = await salesRes.json();
      const returns: ControlReturnRecord[] = await returnsRes.json();
      const changes: ControlChangeRecord[] = await changesRes.json();
      const pendingSales = sales.filter((sale) => sale.closure_id == null);
      const isPosWeb = stationId === "pos-web";
      const matchesStation = (value?: string | null, posName?: string | null) => {
        if (isPosWeb) return isPosWebName(posName);
        if (stationId) return value === stationId;
        return !value && !isPosWebName(posName);
      };
      const filteredSales = pendingSales.filter((sale) =>
        matchesStation(sale.station_id ?? null, sale.pos_name ?? null)
      );
      const saleMap = new Map<number, ControlSaleRecord>();
      sales.forEach((sale) => saleMap.set(sale.id, sale));

      const orderMap = new Map<number, SeparatedOrder>();
      separatedOrders.forEach((order) => orderMap.set(order.sale_id, order));

      const methodTotals: ClosureTotalsByMethod = {
        cash: 0,
        card: 0,
        qr: 0,
        nequi: 0,
        daviplata: 0,
        credit: 0,
      };
      let totalCollected = 0;
      let totalRefunds = 0;
      let changeExtraTotal = 0;
      let changeRefundTotal = 0;
      let changeCount = 0;

      const addMethodAmount = (method?: string | null, amount?: number) => {
        if (!method || !amount || amount <= 0) return;
        const key = mapMethodToKey(method);
        if (!key) return;
        methodTotals[key] += amount;
      };

      filteredSales.forEach((sale) => {
        if (sale.is_separated) {
          const order = orderMap.get(sale.id);
          const initialAmount =
            sale.initial_payment_amount ?? order?.initial_payment ?? 0;
          if (initialAmount > 0) {
            addMethodAmount(
              sale.initial_payment_method ?? sale.payment_method,
              initialAmount
            );
            totalCollected += initialAmount;
          }
          return;
        }
        const gross = sale.total ?? 0;
        const refund = Math.max(0, sale.refunded_total ?? 0);
        const net =
          sale.refunded_balance != null
            ? Math.max(0, sale.refunded_balance)
            : Math.max(0, gross - refund);
        totalRefunds += refund;
        totalCollected += net;

        const payments =
          sale.payments && sale.payments.length > 0
            ? sale.payments
            : [{ method: sale.payment_method, amount: net }];
        const paymentsTotal = payments.reduce(
          (sum, payment) => sum + Math.max(payment.amount ?? 0, 0),
          0
        );
        payments.forEach((payment) => {
          const paymentAmount = Math.max(payment.amount ?? 0, 0);
          const amount =
            paymentsTotal > 0
              ? (paymentAmount / paymentsTotal) * net
              : net / payments.length;
          addMethodAmount(payment.method, amount);
        });
      });

      const pendingReturns = returns.filter((ret) => ret.closure_id == null);
      const filteredReturns = pendingReturns.filter((ret) => {
        const relatedSale = ret.sale_id ? saleMap.get(ret.sale_id) : undefined;
        const station = ret.station_id ?? relatedSale?.station_id ?? null;
        const posName = ret.pos_name ?? relatedSale?.pos_name ?? null;
        return matchesStation(station, posName);
      });

      filteredReturns.forEach((ret) => {
        const refundAmount = Math.max(ret.total_refund ?? 0, 0);
        if (refundAmount <= 0) return;
        totalRefunds += refundAmount;
        if (ret.payments && ret.payments.length > 0) {
          ret.payments.forEach((payment) => {
            const amount = Math.max(payment.amount ?? 0, 0);
            if (!amount) return;
            const key = mapMethodToKey(payment.method);
            if (!key) return;
            methodTotals[key] -= amount;
          });
        } else {
          methodTotals.cash -= refundAmount;
        }
      });

      const pendingChanges = changes.filter((change) => change.closure_id == null);
      const filteredChanges = pendingChanges.filter((change) => {
        const relatedSale = change.sale_id ? saleMap.get(change.sale_id) : undefined;
        const station = change.station_id ?? relatedSale?.station_id ?? null;
        const posName = change.pos_name ?? relatedSale?.pos_name ?? null;
        return matchesStation(station, posName);
      });
      filteredChanges.forEach((change) => {
        const extra = Math.max(change.extra_payment ?? 0, 0);
        const refund = Math.max(change.refund_due ?? 0, 0);
        if (extra > 0 || refund > 0) {
          changeCount += 1;
        }
        changeExtraTotal += extra;
        changeRefundTotal += refund;
        if (change.payments && change.payments.length > 0) {
          change.payments.forEach((payment) =>
            addMethodAmount(payment.method, Math.max(payment.amount ?? 0, 0))
          );
        }
        if (refund > 0) {
          methodTotals.cash -= refund;
        }
      });

      separatedOrders.forEach((order: SeparatedOrder) => {
        const baseSale = saleMap.get(order.sale_id);
        const pendingPayments =
          order.payments?.filter((payment) => payment.closure_id == null) ?? [];
        pendingPayments.forEach((payment) => {
          const paymentMatches = stationId === "pos-web"
            ? isPosWebName(baseSale?.pos_name)
            : stationId
              ? payment.station_id === stationId ||
                (!payment.station_id &&
                  (baseSale?.station_id ?? null) === stationId)
              : !payment.station_id && !baseSale?.station_id;
          if (!paymentMatches) return;
          addMethodAmount(payment.method, payment.amount);
          totalCollected += payment.amount;
        });
      });

      const round = (value: number) => Number(value.toFixed(2));
      return {
        totalAmount: round(totalCollected),
        totalRefunds: round(totalRefunds),
        totalCash: round(methodTotals.cash),
        totalCard: round(methodTotals.card),
        totalQr: round(methodTotals.qr),
        totalNequi: round(methodTotals.nequi),
        totalDaviplata: round(methodTotals.daviplata),
        totalCredit: round(methodTotals.credit),
        changeExtraTotal: round(changeExtraTotal),
        changeRefundTotal: round(changeRefundTotal),
        changeCount,
      };
    },
    [authHeaders, token]
  );

  const handleAdminClosure = useCallback(
    async (row: StationControlRow) => {
      if (!token) return;
      if (!isAdmin) return;
      const stationKey = row.stationId ?? "__legacy__";
      if (adminClosureLoading) return;
      const confirmed = window.confirm(
        `¿Deseas generar un cierre administrativo para "${row.label}"? Esto cerrará los registros pendientes detectados.`
      );
      if (!confirmed) return;
      try {
        setAdminClosureLoading(stationKey);
        setAdminClosureMessage(null);
        setAdminClosureError(null);
        const totals = await buildAdminClosureTotals(row.stationId ?? null);
        const hasPendingTotals =
          totals.totalAmount > 0 ||
          totals.totalCash > 0 ||
          totals.totalCard > 0 ||
          totals.totalQr > 0 ||
          totals.totalNequi > 0 ||
          totals.totalDaviplata > 0 ||
          totals.totalCredit > 0 ||
          totals.totalRefunds > 0 ||
          (totals.changeExtraTotal ?? 0) > 0 ||
          (totals.changeRefundTotal ?? 0) > 0 ||
          (totals.changeCount ?? 0) > 0;
        if (!hasPendingTotals) {
          throw new Error("No hay ventas pendientes por cerrar en esta estación.");
        }
        const isPosWeb = row.stationId === "pos-web";
        const payload = {
          pos_name: isPosWeb ? "POS Web" : row.label,
          total_amount: totals.totalAmount,
          total_cash: totals.totalCash,
          total_card: totals.totalCard,
          total_qr: totals.totalQr,
          total_nequi: totals.totalNequi,
          total_daviplata: totals.totalDaviplata,
          total_credit: totals.totalCredit,
          total_refunds: totals.totalRefunds,
          change_extra_total: totals.changeExtraTotal ?? 0,
          change_refund_total: totals.changeRefundTotal ?? 0,
          change_count: totals.changeCount ?? 0,
          net_amount: Math.max(0, totals.totalAmount),
          counted_cash: totals.totalCash,
          difference: 0,
          notes: "Cierre administrativo desde Control de caja.",
          ...(!isPosWeb && row.stationId ? { station_id: row.stationId } : {}),
        };
        const apiBase = getApiBase();
        const res = await fetch(`${apiBase}/pos/closures`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const detail = await res.json().catch(() => null);
          throw new Error(
            detail?.detail ?? `Error ${res.status} al generar el cierre.`
          );
        }
        setAdminClosureMessage(
          `Cierre administrativo registrado para ${row.label}.`
        );
        await loadControlData();
      } catch (err) {
        console.error(err);
        setAdminClosureError(
          err instanceof Error
            ? err.message
            : "No se pudo generar el cierre administrativo."
        );
      } finally {
        setAdminClosureLoading(null);
      }
    },
    [adminClosureLoading, buildAdminClosureTotals, isAdmin, loadControlData, token]
  );

  const loadSettings = useCallback(async () => {
    if (!token) return;
    try {
      setSettingsLoading(true);
      setSettingsError(null);
      const payload = await fetchPosSettings(token);
      setForm(mapFromApi(payload));
    } catch (err) {
      console.error(err);
      setSettingsError(
        err instanceof Error
          ? err.message
          : "No pudimos cargar la configuración."
      );
    } finally {
      setSettingsLoading(false);
    }
  }, [token]);

  const loadUsers = useCallback(async () => {
    if (!token) return;
    try {
      setUsersLoading(true);
      setUsersError(null);
      const data = await fetchPosUsers(token);
      setUsers(data);
    } catch (err) {
      console.error(err);
      setUsersError(
        err instanceof Error
          ? err.message
          : "No pudimos cargar los usuarios."
      );
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, [token]);

  const loadRolePermissions = useCallback(async () => {
    if (!token) return;
    try {
      setRolePermissionsLoading(true);
      setRolePermissionsError(null);
      const modules = await fetchRolePermissions(token);
      setRolePermissions(modules);
      setRolePermissionsDirty(false);
      setRolePermissionsMessage(null);
      setExpandedModules({});
    } catch (err) {
      console.error(err);
      setRolePermissions(defaultRolePermissions);
      setRolePermissionsError(
        err instanceof Error
          ? err.message
          : "No pudimos cargar los permisos, usando los valores predeterminados."
      );
    } finally {
      setRolePermissionsLoading(false);
    }
  }, [token]);

  const loadStations = useCallback(async () => {
    if (!token) return;
    try {
      setStationsLoading(true);
      setStationsError(null);
      const data = await fetchPosStations(token);
      setStations(data);
    } catch (err) {
      console.error(err);
      setStationsError(
        err instanceof Error
          ? err.message
          : "No pudimos cargar las estaciones POS."
      );
      setStations([]);
    } finally {
      setStationsLoading(false);
    }
  }, [token]);

  function openStationModal() {
    setStationForm({
      label: "",
      email: "",
      password: "",
      confirmPassword: "",
      sendClosureEmail: true,
    });
    setStationFormError(null);
    setEditingStation(null);
    setStationModalOpen(true);
  }

  function openEditStationModal(station: PosStationRecord) {
    setStationForm({
      label: station.label ?? "",
      email: station.station_email ?? "",
      password: "",
      confirmPassword: "",
      sendClosureEmail: Boolean(
        station.send_closure_email ?? form.stationEmailOverrides?.[station.id] ?? true
      ),
    });
    setStationFormError(null);
    setEditingStation(station);
    setStationModalOpen(true);
  }

  function closeStationModal() {
    if (stationSaving) return;
    setStationModalOpen(false);
    setEditingStation(null);
  }

  function openStationNoticeModal(station: PosStationRecord) {
    setStationNoticeTarget(station);
    setStationNoticeMessage("");
    setStationNoticeError(null);
    setStationNoticeModalOpen(true);
  }

  function closeStationNoticeModal() {
    if (stationNoticeSending) return;
    setStationNoticeModalOpen(false);
    setStationNoticeTarget(null);
  }

  async function handleSubmitStationNotice(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token || !stationNoticeTarget) return;
    const message = stationNoticeMessage.trim();
    if (!message) {
      setStationNoticeError("Escribe el aviso que quieres enviar.");
      return;
    }
    try {
      setStationNoticeSending(true);
      setStationNoticeError(null);
      await sendPosStationNotice(stationNoticeTarget.id, { message }, token);
      setStationMessage("Aviso enviado a la estación.");
      setStationNoticeModalOpen(false);
      setStationNoticeTarget(null);
      setStationNoticeMessage("");
    } catch (err) {
      console.error(err);
      setStationNoticeError(
        err instanceof Error ? err.message : "No pudimos enviar el aviso."
      );
    } finally {
      setStationNoticeSending(false);
    }
  }

  async function handleSubmitStation(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) return;
    const label = stationForm.label.trim();
    const email = stationForm.email.trim();
    const password = stationForm.password.trim();
    const confirmPassword = stationForm.confirmPassword.trim();
    if (!label || !email) {
      setStationFormError("Debes ingresar el nombre y el correo de la estación.");
      return;
    }
    if (editingStation) {
      if (password || confirmPassword) {
        if (password !== confirmPassword) {
          setStationFormError("La contraseña y su confirmación no coinciden.");
          return;
        }
        if (password.length < 6) {
          setStationFormError("La contraseña debe tener al menos 6 caracteres.");
          return;
        }
      }
    } else {
      if (!password || !confirmPassword) {
        setStationFormError("Debes definir una contraseña para la estación.");
        return;
      }
      if (password !== confirmPassword) {
        setStationFormError("La contraseña y su confirmación no coinciden.");
        return;
      }
      if (password.length < 6) {
        setStationFormError("La contraseña debe tener al menos 6 caracteres.");
        return;
      }
    }
    try {
      setStationSaving(true);
      setStationFormError(null);
      let createdStation: PosStationRecord | null = null;
      if (editingStation) {
        const payload: {
          label: string;
          station_email: string;
          station_password?: string;
          send_closure_email: boolean;
        } = {
          label,
          station_email: email,
          send_closure_email: stationForm.sendClosureEmail,
        };
        if (password) {
          payload.station_password = password;
        }
        const response = await updatePosStation(editingStation.id, payload, token);
        const updatedStation = getStationRecordFromResponse(response);
        if (updatedStation) {
          setStations((prev) =>
            prev.map((item) => (item.id === updatedStation.id ? updatedStation : item))
          );
        }
        setStationMessage("Estación actualizada correctamente.");
      } else {
        const payload: {
          label: string;
          send_closure_email: boolean;
          station_email: string;
          station_password: string;
        } = {
          label,
          send_closure_email: stationForm.sendClosureEmail,
          station_email: email,
          station_password: password,
        };
        const response = await createPosStation(payload, token);
        createdStation = getStationRecordFromResponse(response);
        setStationMessage("Estación creada correctamente.");
      }
      setStationModalOpen(false);
      setStationForm({
        label: "",
        email: "",
        password: "",
        confirmPassword: "",
        sendClosureEmail: true,
      });
      setEditingStation(null);
      if (createdStation && !stationForm.sendClosureEmail) {
        const overrides = {
          ...form.stationEmailOverrides,
          [createdStation.id]: false,
        };
        const nextFormState: SettingsFormState = {
          ...form,
          stationEmailOverrides: overrides,
        };
        setForm(nextFormState);
        try {
          await savePosSettings(mapToApi(nextFormState), token);
        } catch (overrideErr) {
          console.error(overrideErr);
          setStationsError(
            overrideErr instanceof Error
              ? overrideErr.message
              : "No pudimos guardar la preferencia de email para la nueva estación."
          );
        }
      }
      await loadStations();
    } catch (err) {
      console.error(err);
      setStationFormError(
        err instanceof Error ? err.message : "No pudimos crear la estación."
      );
    } finally {
      setStationSaving(false);
    }
  }

  async function handleToggleStationActive(
    station: PosStationRecord,
    nextActive: boolean
  ) {
    if (!token) return;
    try {
      setUpdatingStationId(station.id);
      await updatePosStation(
        station.id,
        { is_active: nextActive },
        token
      );
      if (!nextActive) {
        const localStation = getPosStationAccess();
        if (localStation?.id === station.id) {
          clearPosStationAccess();
        }
      }
      setStationMessage(
        nextActive
          ? "Estación activada nuevamente."
          : "Estación desactivada."
      );
      await loadStations();
    } catch (err) {
      console.error(err);
      setStationsError(
        err instanceof Error
          ? err.message
          : "No pudimos actualizar el estado de la estación."
      );
    } finally {
      setUpdatingStationId(null);
    }
  }

  async function handleToggleStationClosureEmail(
    station: PosStationRecord,
    nextEnabled: boolean
  ) {
    if (!token) return;
    const previousOverrides = form.stationEmailOverrides;
    const previousStations = stations;
    const nextOverrides = { ...previousOverrides };
    if (nextEnabled) {
      delete nextOverrides[station.id];
    } else {
      nextOverrides[station.id] = false;
    }
    const nextFormState: SettingsFormState = {
      ...form,
      stationEmailOverrides: nextOverrides,
    };
    setForm(nextFormState);
    setStations((prev) =>
      prev.map((item) =>
        item.id === station.id
          ? { ...item, send_closure_email: nextEnabled }
          : item
      )
    );
    setUpdatingStationId(station.id);
    try {
      await updatePosStation(
        station.id,
        { send_closure_email: nextEnabled },
        token
      );
    } catch (err) {
      console.warn(
        "No pudimos sincronizar el flag de email con la estación directamente",
        err
      );
    }
    try {
      await savePosSettings(mapToApi(nextFormState), token);
      setStationMessage(
        nextEnabled
          ? "Activaste los reportes por email para esta estación."
          : "Desactivaste los reportes por email para esta estación."
      );
    } catch (err) {
      console.error(err);
      setStationsError(
        err instanceof Error
          ? err.message
          : "No pudimos guardar la preferencia de email para esta estación."
      );
      setForm((prev) => ({
        ...prev,
        stationEmailOverrides: previousOverrides,
      }));
      setStations(previousStations);
    } finally {
      setUpdatingStationId(null);
    }
  }

  async function handleDeleteStationRecord(station: PosStationRecord) {
    if (!token) return;
    const confirmed = window.confirm(
      `¿Eliminar la estación "${station.label}"? Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;
    try {
      setUpdatingStationId(station.id);
      await deletePosStation(station.id, token);
      setStationMessage("Estación eliminada.");
      const localStation = getPosStationAccess();
      if (localStation?.id === station.id) {
        clearPosStationAccess();
      }
      await loadStations();
    } catch (err) {
      console.error(err);
      setStationsError(
        err instanceof Error
          ? err.message
          : "No pudimos eliminar la estación."
      );
    } finally {
      setUpdatingStationId(null);
    }
  }

  async function handleUnbindStation(station: PosStationRecord) {
    if (!token) return;
    const confirmed = window.confirm(
      `¿Desvincular la estación "${station.label}" del equipo actual?`
    );
    if (!confirmed) return;
    setUpdatingStationId(station.id);
    try {
      const updated = await unbindPosStation(station.id, token);
      setStations((prev) =>
        prev.map((item) => (item.id === station.id ? updated : item))
      );
      setStationMessage("Estación desvinculada correctamente.");
    } catch (err) {
      console.error(err);
      setStationsError(
        err instanceof Error
          ? err.message
          : "No pudimos desvincular la estación."
      );
    } finally {
      setUpdatingStationId(null);
    }
  }

  const handlePaymentInput = <K extends keyof typeof paymentForm>(
    key: K,
    value: (typeof paymentForm)[K]
  ) => {
    setPaymentForm((prev) => ({ ...prev, [key]: value }));
  };

  async function handleSubmitPaymentMethod(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();
    if (!token) return;
    const name = paymentForm.name.trim();
    const slug = paymentForm.slug.trim().toLowerCase();
    if (!name) {
      setPaymentFormError("El nombre es obligatorio.");
      return;
    }
    if (!slug) {
      setPaymentFormError("El slug es obligatorio.");
      return;
    }
    const payload = {
      name,
      slug,
      description: paymentForm.description.trim() || undefined,
      allow_change: paymentForm.allow_change,
      color: paymentForm.color.trim() || undefined,
    };
    try {
      setPaymentSaving(true);
      setPaymentFormError(null);
      if (editingPayment) {
        await updatePaymentMethod(editingPayment.id, payload, token);
      } else {
        await createPaymentMethod(payload, token);
      }
      await loadPaymentMethods();
      setPaymentModalOpen(false);
    } catch (err) {
      console.error(err);
      setPaymentFormError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar el método de pago."
      );
    } finally {
      setPaymentSaving(false);
    }
  }

  async function handleTogglePaymentMethod(method: PaymentMethodRecord) {
    if (!token || method.id < 0) return;
    try {
      await togglePaymentMethod(method.id, !method.is_active, token);
      await loadPaymentMethods();
    } catch (err) {
      console.error(err);
      setPaymentMethodsError(
        err instanceof Error
          ? err.message
          : "No se pudo actualizar el estado del método."
      );
    }
  }

  async function handleDeletePaymentMethod(method: PaymentMethodRecord) {
    if (!token || method.id < 0) return;
    const confirmDelete = window.confirm(
      `¿Eliminar el método "${method.name}"?`
    );
    if (!confirmDelete) return;
    try {
      await deletePaymentMethod(method.id, token);
      await loadPaymentMethods();
    } catch (err) {
      console.error(err);
      setPaymentMethodsError(
        err instanceof Error
          ? err.message
          : "No se pudo eliminar el método."
      );
    }
  }

  async function handleMovePaymentMethod(
    method: PaymentMethodRecord,
    direction: -1 | 1
  ) {
    if (!token || method.id < 0) return;
    const index = paymentMethods.findIndex((m) => m.id === method.id);
    if (index < 0) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= paymentMethods.length) return;
    const reordered = [...paymentMethods];
    const [removed] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, removed);
    const payload = reordered
      .filter((item) => item.id >= 0)
      .map((item, idx) => ({
        id: item.id,
        order_index: idx + 1,
      }));
    try {
      setPaymentMethods(
        reordered.map((item, idx) => ({
          ...item,
          order_index: idx + 1,
        }))
      );
      await reorderPaymentMethods(payload, token);
      await loadPaymentMethods();
    } catch (err) {
      console.error(err);
      setPaymentMethodsError(
        err instanceof Error
          ? err.message
          : "No se pudo reordenar la lista."
      );
      await loadPaymentMethods();
    }
  }

  const loadPaymentMethods = useCallback(async () => {
    if (!token) return;
    try {
      setPaymentMethodsLoading(true);
      setPaymentMethodsError(null);
      const data = await fetchPaymentMethods(token);
      setPaymentMethods(data.length ? data : DEFAULT_PAYMENT_METHODS);
    } catch (err) {
      console.error(err);
      setPaymentMethodsError(
        err instanceof Error
          ? err.message
          : "No pudimos cargar los métodos de pago."
      );
      setPaymentMethods(DEFAULT_PAYMENT_METHODS);
    } finally {
      setPaymentMethodsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void loadSettings();
    void loadUsers();
    void loadPaymentMethods();
    void loadRolePermissions();
    void loadStations();
  }, [token, loadSettings, loadUsers, loadPaymentMethods, loadRolePermissions, loadStations]);

  useEffect(() => {
    if (activeTab === "control" && !controlLoading && controlRows.length === 0) {
      void loadControlData();
    }
  }, [activeTab, controlLoading, controlRows.length, loadControlData]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!inviteFeedback && !inviteError) return;
    const timeout = window.setTimeout(() => {
      setInviteFeedback(null);
      setInviteError(null);
    }, 5000);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [inviteFeedback, inviteError]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!stationMessage) return;
    const timeout = window.setTimeout(() => {
      setStationMessage(null);
    }, 4000);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [stationMessage]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.dataset.theme = form.theme;
    try {
      window.localStorage.setItem("kensar_theme_mode", form.theme);
    } catch {
      /* ignore */
    }
  }, [form.theme]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(BG_STORAGE_KEY);
    } catch {
      stored = null;
    }
    if (isBackgroundStyle(stored)) {
      document.body.dataset.bg = stored;
      if (stored !== backgroundStyle) {
        setBackgroundStyle(stored);
      }
      return;
    }
    const next = getDefaultBgStyle(form.theme);
    document.body.dataset.bg = next;
    if (next !== backgroundStyle) {
      setBackgroundStyle(next);
    }
    try {
      window.localStorage.setItem(BG_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, [form.theme, backgroundStyle]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.dataset.bg = backgroundStyle;
    try {
      window.localStorage.setItem(BG_STORAGE_KEY, backgroundStyle);
    } catch {
      /* ignore */
    }
  }, [backgroundStyle]);

  const themePreview = useMemo(() => {
    const base = {
      dark: {
        bg: "bg-slate-900",
        border: "border-slate-700",
        text: "text-slate-200",
      },
      midnight: {
        bg: "bg-[#0a1425]",
        border: "border-[#182840]",
        text: "text-[#d1e1ff]",
      },
      light: {
        bg: "bg-slate-100",
        border: "border-slate-200",
        text: "text-slate-800",
      },
    } as const;
    return base[form.theme];
  }, [form.theme]);

  const previewFooter = form.ticketFooter ?? "";

  const updateForm = <K extends keyof SettingsFormState>(
    key: K,
    value: SettingsFormState[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  function updateNotification<K extends keyof SettingsFormState["notifications"]>(
    key: K,
    value: boolean
  ) {
    setForm((prev) => ({
      ...prev,
      notifications: { ...prev.notifications, [key]: value },
    }));
  }

  const resolvedLogoPreviewUrl = useMemo(
    () => resolveLogoUrl(form.logoUrl),
    [form.logoUrl]
  );

  const clearLogoFeedback = () => {
    setLogoUploadError(null);
    setLogoUploadMessage(null);
  };

  const handleManualLogoUrlChange = (value: string) => {
    clearLogoFeedback();
    updateForm("logoUrl", value);
  };

  const handleClearLogo = () => {
    clearLogoFeedback();
    updateForm("logoUrl", "");
    if (logoFileInputRef.current) {
      logoFileInputRef.current.value = "";
    }
  };

  const handleLogoFileChange = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    clearLogoFeedback();
    if (!token) {
      setLogoUploadError("Debes iniciar sesión para subir un logo.");
      event.target.value = "";
      return;
    }

    const allowedTypes = new Set([
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/svg+xml",
    ]);
    if (!allowedTypes.has(file.type)) {
      setLogoUploadError("Formato no soportado. Usa PNG, JPG o SVG.");
      event.target.value = "";
      return;
    }
    const MAX_SIZE_BYTES = 1024 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      setLogoUploadError("El archivo supera 1 MB. Usa una imagen más ligera.");
      event.target.value = "";
      return;
    }

    setLogoUploading(true);

    const formData = new FormData();
    formData.append("file", file);
    try {
      const apiBase = getApiBase();
      const headers: HeadersInit = token
        ? { Authorization: `Bearer ${token}` }
        : {};
      const res = await fetch(`${apiBase}/pos/logo-upload`, {
        method: "POST",
        headers,
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(
          detail?.detail ?? `No se pudo subir el logo (Error ${res.status}).`
        );
      }
      const data = (await res.json()) as { url?: string };
      if (!data?.url) {
        throw new Error("La API no devolvió la URL del logo.");
      }
      setForm((prev) => ({
        ...prev,
        logoUrl: resolveLogoUrl(data.url ?? ""),
      }));
      setLogoUploadMessage("Logo actualizado correctamente.");
    } catch (err) {
      console.error(err);
      setLogoUploadError(
        err instanceof Error ? err.message : "No se pudo subir el logo."
      );
    } finally {
      setLogoUploading(false);
      if (logoFileInputRef.current) {
        logoFileInputRef.current.value = "";
      }
    }
  };

  function openPaymentModal(method?: PaymentMethodRecord | null) {
    if (method) {
      setEditingPayment(method);
      setPaymentForm({
        name: method.name,
        slug: method.slug,
        description: method.description ?? "",
        allow_change: method.allow_change,
        color: method.color ?? "",
      });
    } else {
      setEditingPayment(null);
      setPaymentForm({
        name: "",
        slug: "",
        description: "",
        allow_change: false,
        color: "",
      });
    }
    setPaymentFormError(null);
    setPaymentModalOpen(true);
  }

  function closePaymentModal() {
    if (paymentSaving) return;
    setPaymentModalOpen(false);
  }

  async function handleSaveSettings() {
    if (!token) return;
    try {
      setSavingSettings(true);
      setSaveMessage(null);
      setSettingsError(null);
      const payload = mapToApi(form);
      await savePosSettings(payload, token);
      setSaveMessage("Configuración guardada correctamente.");
    } catch (err) {
      console.error(err);
      setSettingsError(
        err instanceof Error
          ? err.message
          : "No pudimos guardar la configuración."
      );
    } finally {
      setSavingSettings(false);
    }
  }

  useEffect(() => {
    if (!saveMessage) {
      setSaveToastVisible(false);
      return;
    }
    if (saveToastTimerRef.current) {
      window.clearTimeout(saveToastTimerRef.current);
    }
    setSaveToastVisible(false);
    requestAnimationFrame(() => setSaveToastVisible(true));
    saveToastTimerRef.current = window.setTimeout(() => {
      setSaveToastVisible(false);
      window.setTimeout(() => setSaveMessage(null), 220);
    }, 3600);
    return () => {
      if (saveToastTimerRef.current) {
        window.clearTimeout(saveToastTimerRef.current);
      }
    };
  }, [saveMessage]);

  async function handleSendSmtpTest() {
    if (!token) return;
    const recipients = [
      ...parseEmailList(form.closureEmailRecipients),
      ...parseEmailList(form.ticketEmailCc),
    ];
    if (!recipients.length) {
      setSmtpTestError("Agrega al menos un destinatario para la prueba.");
      setSmtpTestMessage(null);
      return;
    }
    try {
      setSmtpTestSending(true);
      setSmtpTestError(null);
      setSmtpTestMessage(null);
      await sendSmtpTestEmail(
        {
          recipients,
          smtp_host: form.smtpHost.trim() || undefined,
          smtp_port: parseNumberField(form.smtpPort),
          smtp_user: form.smtpUser.trim() || undefined,
          smtp_password: form.smtpPassword || undefined,
          smtp_use_tls: form.smtpUseTls,
          email_from: form.emailFrom.trim() || undefined,
          subject: "Prueba de correo - Kensar POS",
          message:
            "Este es un correo de prueba enviado desde la configuración SMTP.",
        },
        token
      );
      setSmtpTestMessage("Correo de prueba enviado correctamente.");
    } catch (err) {
      setSmtpTestError(
        err instanceof Error
          ? err.message
          : "No pudimos enviar el correo de prueba."
      );
    } finally {
      setSmtpTestSending(false);
    }
  }

  function openUserModal(user?: PosUserRecord) {
    if (user) {
      setEditingUser(user);
      setUserForm({
        name: user.name ?? "",
        email: user.email ?? "",
        phone: user.phone ?? "",
        position: user.position ?? "",
        notes: user.notes ?? "",
        role: user.role,
        password: "",
        pin: "",
      });
    } else {
      resetUserForm();
    }
    setUserFormError(null);
    setUserModalOpen(true);
  }

  function closeUserModal() {
    if (creatingUser) return;
    setUserModalOpen(false);
    resetUserForm();
  }

  async function handleSubmitUser(e: FormEvent<HTMLFormElement>) {
    if (!token) return;
    e.preventDefault();
    if (!userForm.name.trim() || !userForm.email.trim()) {
      setUserFormError("Nombre y correo son obligatorios.");
      return;
    }
    const payload: {
      name: string;
      email: string;
      role: PosUserRecord["role"];
      phone?: string;
      position?: string;
      notes?: string;
      password?: string;
      pin_plain?: string;
    } = {
      name: userForm.name.trim(),
      email: userForm.email.trim(),
      role: userForm.role,
    };
    if (userForm.phone.trim()) payload.phone = userForm.phone.trim();
    if (userForm.position.trim()) payload.position = userForm.position.trim();
    if (userForm.notes.trim()) payload.notes = userForm.notes.trim();
    if (userForm.password.trim()) {
      payload.password = userForm.password.trim();
    }
    if (userForm.pin.trim()) {
      if (!/^\d{4,8}$/.test(userForm.pin.trim())) {
        setUserFormError("El PIN debe tener entre 4 y 8 dígitos.");
        return;
      }
      payload.pin_plain = userForm.pin.trim();
    }
    try {
      setCreatingUser(true);
      setUserFormError(null);
      if (editingUser) {
        const updated = await updatePosUser(editingUser.id, payload, token);
        setUsers((prev) =>
          prev.map((u) => (u.id === editingUser.id ? updated : u))
        );
      } else {
        const created = await createPosUser(payload, token);
        setUsers((prev) => [created, ...prev]);
      }
      resetUserForm();
      setUserModalOpen(false);
    } catch (err) {
      console.error(err);
      setUserFormError(
        err instanceof Error
          ? err.message
          : "No pudimos guardar el usuario."
      );
    } finally {
      setCreatingUser(false);
    }
  }

  async function handleToggleUserStatus(user: PosUserRecord) {
    if (!token) return;
    const nextStatus = user.status === "Activo" ? "Inactivo" : "Activo";
    try {
      setUpdatingUserId(user.id);
      const updated = await updatePosUser(
        user.id,
        {
          status: nextStatus,
        },
        token
      );
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? updated : u))
      );
    } catch (err) {
      console.error(err);
      setUsersError(
        err instanceof Error ? err.message : "No se pudo actualizar el usuario."
      );
    } finally {
      setUpdatingUserId(null);
    }
  }

  async function handleInviteUser(user: PosUserRecord) {
    if (!token) return;
    try {
      setInvitingUserId(user.id);
      setInviteFeedback(null);
      setInviteError(null);
      const response = await invitePosUser(user.id, token);
      const minutes =
        typeof response.expires_in === "number"
          ? Math.round(response.expires_in / 60)
          : null;
      setInviteFeedback(
        minutes && minutes > 0
          ? `${response.detail ?? "Invitación enviada."} Expira en ${minutes} min.`
          : response.detail ?? "Invitación enviada correctamente."
      );
      await loadUsers();
    } catch (err) {
      console.error(err);
      setInviteError(
        err instanceof Error
          ? err.message
          : "No pudimos enviar la invitación."
      );
    } finally {
      setInvitingUserId(null);
    }
  }

  async function handleDeleteUser(user: PosUserRecord) {
    if (!token) return;
    const confirmed = window.confirm(
      `¿Seguro que deseas eliminar la cuenta de ${user.name}? Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;
    try {
      setDeletingUserId(user.id);
      await deletePosUser(user.id, token);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      if (editingUser?.id === user.id) {
        closeUserModal();
      }
    } catch (err) {
      console.error(err);
      setUsersError(
        err instanceof Error ? err.message : "No pudimos eliminar el usuario."
      );
    } finally {
      setDeletingUserId(null);
    }
  }

  const toggleModule = useCallback((module: string) => {
    setExpandedModules((prev) => ({ ...prev, [module]: !prev[module] }));
  }, []);

  const handleTogglePermission = useCallback(
    (moduleId: string, role: PosUserRecord["role"], actionId?: string) => {
      setRolePermissions((prev) =>
        prev.map((module) => {
          if (module.id !== moduleId) return module;
          const moduleEditable = module.editable ?? true;
          if (!moduleEditable && !actionId) return module;
          if (!actionId) {
            return {
              ...module,
              roles: { ...module.roles, [role]: !module.roles[role] },
            };
          }
          const actions = module.actions.map((action) => {
            if (action.id !== actionId) return action;
            const actionEditable = (action.editable ?? true) && moduleEditable;
            if (!actionEditable) return action;
            return {
              ...action,
              roles: { ...action.roles, [role]: !action.roles[role] },
            };
          });
          return { ...module, actions };
        })
      );
      setRolePermissionsDirty(true);
    },
    []
  );

  async function handleSaveRolePermissions() {
    if (!token) return;
    try {
      setSavingRolePermissions(true);
      setRolePermissionsError(null);
      const modules = await updateRolePermissions(rolePermissions, token);
      setRolePermissions(modules);
      setRolePermissionsDirty(false);
      setRolePermissionsMessage("Permisos actualizados correctamente.");
    } catch (err) {
      console.error(err);
      setRolePermissionsError(
        err instanceof Error
          ? err.message
          : "No pudimos actualizar los permisos."
      );
    } finally {
      setSavingRolePermissions(false);
      setTimeout(() => setRolePermissionsMessage(null), 4000);
    }
  }

  async function handleRoleChange(
    user: PosUserRecord,
    role: PosUserRecord["role"]
  ) {
    if (!token) return;
    if (user.role === role) return;
    try {
      setUpdatingUserId(user.id);
      const updated = await updatePosUser(user.id, { role }, token);
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? updated : u))
      );
    } catch (err) {
      console.error(err);
      setUsersError(
        err instanceof Error ? err.message : "No se pudo actualizar el rol."
      );
    } finally {
      setUpdatingUserId(null);
    }
  }

  function openPasswordModal(user: PosUserRecord) {
    setPasswordModalUser(user);
    setPasswordModalState({
      password: "",
      confirm: "",
      error: null,
      saving: false,
    });
  }

  function closePasswordModal() {
    if (passwordModalState.saving) return;
    setPasswordModalUser(null);
  }

  async function handleResetPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token || !passwordModalUser) return;
    const newPassword = passwordModalState.password.trim();
    if (!newPassword) {
      setPasswordModalState((prev) => ({
        ...prev,
        error: "La contraseña no puede estar vacía.",
      }));
      return;
    }
    if (newPassword !== passwordModalState.confirm.trim()) {
      setPasswordModalState((prev) => ({
        ...prev,
        error: "La confirmación no coincide.",
      }));
      return;
    }
    try {
      setPasswordModalState((prev) => ({ ...prev, saving: true, error: null }));
      const updated = await updatePosUser(
        passwordModalUser.id,
        { password: newPassword },
        token
      );
      setUsers((prev) =>
        prev.map((u) => (u.id === updated.id ? updated : u))
      );
      setPasswordModalUser(null);
    } catch (err) {
      console.error(err);
      setPasswordModalState((prev) => ({
        ...prev,
        error:
          err instanceof Error
            ? err.message
            : "No se pudo actualizar la contraseña.",
      }));
    } finally {
      setPasswordModalState((prev) => ({ ...prev, saving: false }));
    }
  }

  const companyContent = (
    <article className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] p-6 space-y-4 shadow-[var(--shadow-panel)]">
      {settingsLoading && (
        <p className="text-xs text-slate-500">Cargando configuración…</p>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Identidad del negocio</h2>
          <p className="text-sm text-slate-400">
            Datos legales y canales de contacto.
          </p>
        </div>
        <button
          type="button"
          className="text-xs text-slate-400 hover:text-slate-200 underline"
          onClick={() => void loadSettings()}
        >
          Recargar
        </button>
      </div>
      <div className="grid md:grid-cols-2 gap-4 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-slate-400">Nombre comercial</span>
          <input
            value={form.companyName ?? ""}
            onChange={(e) => updateForm("companyName", e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-slate-400">NIT / Identificación</span>
          <input
            value={form.taxId ?? ""}
            onChange={(e) => updateForm("taxId", e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
          />
        </label>
        <label className="md:col-span-2 flex flex-col gap-1">
          <span className="text-slate-400">Dirección</span>
          <input
            value={form.address ?? ""}
            onChange={(e) => updateForm("address", e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-slate-400">Correo de contacto</span>
          <input
            type="email"
            value={form.contactEmail ?? ""}
            onChange={(e) => updateForm("contactEmail", e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-slate-400">Teléfono</span>
          <input
            value={form.contactPhone ?? ""}
            onChange={(e) => updateForm("contactPhone", e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
          />
        </label>
      </div>
      <div className="grid md:grid-cols-2 gap-4 pt-4 text-sm">
        <div className="rounded-xl border border-[var(--border)] p-4 bg-[var(--surface)] shadow-[var(--shadow-card)] flex flex-col gap-4">
          <div>
            <h3 className="font-semibold text-slate-200">Logo y branding</h3>
            <p className="text-xs text-slate-400">
              Este logo aparecerá en los tickets y reportes.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="w-20 h-20 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center overflow-hidden">
                {resolvedLogoPreviewUrl ? (
                  <img
                    src={resolvedLogoPreviewUrl}
                    alt="Logo"
                    className="max-h-20 max-w-20 object-contain"
                  />
                ) : (
                  <span className="font-bold text-lg text-slate-400">
                    {(form.companyName ?? "KE").slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <input
                  ref={logoFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  className="hidden"
                  onChange={handleLogoFileChange}
                />
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => logoFileInputRef.current?.click()}
                    disabled={logoUploading}
                    className="px-3 py-2 rounded-md border border-slate-700 text-slate-100 bg-slate-900 hover:border-emerald-400/60 disabled:opacity-50"
                  >
                    {logoUploading ? "Subiendo…" : "Subir imagen"}
                  </button>
                  {form.logoUrl && (
                    <button
                      type="button"
                      onClick={handleClearLogo}
                      className="px-3 py-2 rounded-md border border-slate-700 text-slate-300 hover:border-red-400/70 hover:text-red-200"
                    >
                      Quitar logo
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  Formatos PNG, JPG o SVG. Máximo 1 MB.
                </p>
                {logoUploadError && (
                  <p className="text-[11px] text-red-400">{logoUploadError}</p>
                )}
                {logoUploadMessage && (
                  <p className="text-[11px] text-emerald-400">
                    {logoUploadMessage}
                  </p>
                )}
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  <span>URL del logo (opcional)</span>
                  <input
                    type="url"
                    value={form.logoUrl ?? ""}
                    onChange={(e) => handleManualLogoUrlChange(e.target.value)}
                    placeholder="https://..."
                    className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] p-4 bg-[var(--surface)] shadow-[var(--shadow-card)] flex flex-col gap-3">
          <div>
            <h3 className="font-semibold text-slate-200">
              Mensaje de ticket
            </h3>
            <p className="text-xs text-slate-400">
              Se imprime al final de cada recibo.
            </p>
          </div>
          <textarea
            value={form.ticketFooter ?? ""}
            onChange={(e) => updateForm("ticketFooter", e.target.value)}
            rows={3}
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
          />
        </div>
      </div>
    </article>
  );

  const appearanceContent = (
    <article className="rounded-2xl ui-surface p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Tema y apariencia</h2>
        <p className="text-sm text-slate-400">
          Cambia la paleta de colores para todas las estaciones POS.
        </p>
      </div>
      <div className="flex gap-3 text-xs flex-wrap">
        {(["dark", "midnight", "light"] as ThemeOption[]).map((opt) => (
          <button
            key={opt}
            onClick={() => updateForm("theme", opt)}
            className={`flex-1 min-w-[120px] rounded-xl border p-3 ${
              form.theme === opt
                ? "border-emerald-400 bg-emerald-500/10"
                : "border-slate-700 hover:border-emerald-400/50"
            }`}
          >
            <div className="h-3 rounded-full bg-gradient-to-r from-slate-950 to-slate-700 mb-2" />
            <div className="text-left">
              <p className="font-semibold capitalize">{opt}</p>
              <p className="text-[11px] text-slate-400">
                {opt === "dark" && "Actual tema nocturno"}
                {opt === "midnight" && "Contraste alto azul profundo"}
                {opt === "light" && "Interfaz clara para zonas iluminadas"}
              </p>
            </div>
          </button>
        ))}
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-400">Estilo de fondo</p>
          <span className="text-[11px] text-slate-500">Preferencia local</span>
        </div>
        <div className="flex gap-3 text-xs flex-wrap">
          {(
            [
              {
                id: "clean",
                label: "Limpio",
                description: "Sin patrón ni brillos",
              },
              {
                id: "soft",
                label: "Suave",
                description: "Gradiente sutil",
              },
              {
                id: "pattern",
                label: "Textura",
                description: "Patrón discreto",
              },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              onClick={() => setBackgroundStyle(opt.id)}
              className={`flex-1 min-w-[120px] rounded-xl border p-3 text-left ${
                backgroundStyle === opt.id
                  ? "border-emerald-400 bg-emerald-500/10"
                  : "border-slate-700 hover:border-emerald-400/50"
              }`}
            >
              <p className="font-semibold">{opt.label}</p>
              <p className="text-[11px] text-slate-400">{opt.description}</p>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-500">
          Se guarda en este navegador. Otros usuarios pueden elegir su propio
          estilo.
        </p>
      </div>
      <label className="flex flex-col gap-2 text-sm">
        <span className="text-slate-400">Color de acento</span>
        <input
          type="color"
          value={form.colorAccent}
          onChange={(e) => updateForm("colorAccent", e.target.value)}
          className="h-12 rounded-lg ui-input cursor-pointer"
        />
        <span className="text-xs text-slate-500">
          Este color se usa para botones principales y gráficas.
        </span>
      </label>
      <div className="rounded-2xl border border-dashed border-slate-700 p-4 text-xs space-y-2">
        <p className="font-semibold text-slate-200">Vista previa</p>
        <div
          className={`rounded-xl border ${themePreview.border} ${themePreview.bg} p-4 space-y-3`}
        >
          <div className="flex justify-between text-[11px]">
            <span className={themePreview.text}>
              Ticket #{previewTicketNumber}
            </span>
            <span
              className="font-semibold"
              style={{ color: form.colorAccent }}
            >
              Total $150.000
            </span>
          </div>
          <div className="space-y-1 text-[10px]">
            <p className={`${themePreview.text} opacity-70`}>
              {form.companyName}
            </p>
            <p className={`${themePreview.text} opacity-60`}>
              {previewFooter.slice(0, 70)}...
            </p>
          </div>
        </div>
        <p className="text-[11px] text-slate-500">
          Esta vista previa es solo representativa. El cambio real se aplicará al
          sincronizar con el backend de preferencias.
        </p>
      </div>
    </article>
  );

  const posContent = (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Preferencias del POS</h2>
        <p className="text-sm text-slate-400">
          Definiciones de seguridad y comportamiento en caja.
        </p>
      </div>
      <div className="space-y-4 text-sm">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={form.autoCloseTickets}
            onChange={(e) => updateForm("autoCloseTickets", e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
          />
          <div>
            <p className="font-semibold">Cerrar ticket automáticamente</p>
            <p className="text-slate-400 text-xs">
              Reinicia el POS y solicita un nuevo número de venta una vez el pago
              sea registrado.
            </p>
          </div>
        </label>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={form.lowStockAlert}
            onChange={(e) => updateForm("lowStockAlert", e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
          />
          <div>
            <p className="font-semibold">Mostrar alerta de bajo inventario</p>
            <p className="text-slate-400 text-xs">
              Anuncia al cajero cuando un producto llegue al umbral configurado.
            </p>
          </div>
        </label>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={form.requireSellerPin}
            onChange={(e) => updateForm("requireSellerPin", e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
          />
          <div>
            <p className="font-semibold">PIN por vendedor</p>
            <p className="text-slate-400 text-xs">
              Solicita un código rápido antes de confirmar el pago para saber quién
              atendió la venta.
            </p>
          </div>
        </label>
      </div>
      <div className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4 space-y-4">
        <div>
          <h3 className="text-base font-semibold">Impresora local & cajón</h3>
          <p className="text-xs text-slate-400">
            Configura cómo se imprime el ticket de 80 mm y cuándo abrir el cajón de dinero.
            Estos campos no ejecutan ninguna acción todavía, pero dejarán lista la
            integración con el conector local.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {PRINTER_MODES.map((mode) => {
            const isActive = form.printerMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => updateForm("printerMode", mode.id)}
                className={`rounded-xl border px-3 py-3 text-left transition ${
                  isActive
                    ? "border-blue-400/70 bg-blue-500/10 text-blue-100"
                    : "border-slate-800 bg-slate-950 text-slate-200 hover:border-slate-700"
                }`}
              >
                <p className="text-sm font-semibold">{mode.label}</p>
                <p className="text-[11px] text-slate-400">{mode.description}</p>
              </button>
            );
          })}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-slate-400 text-xs uppercase tracking-wide">
              Nombre de la impresora
            </span>
            <input
              type="text"
              value={form.printerName}
              onChange={(e) => updateForm("printerName", e.target.value)}
              placeholder='Ej: "EPSON TM-T20"'
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 placeholder:text-slate-600"
            />
            <span className="text-[11px] text-slate-500">
              Debe coincidir con el nombre que verás en el sistema operativo o en QZ Tray.
            </span>
          </label>
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-slate-400 text-xs uppercase tracking-wide">
              Ancho del rollo
            </span>
            <select
              value={form.printerWidth}
              onChange={(e) =>
                updateForm("printerWidth", e.target.value as PosPrinterWidth)
              }
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            >
              {PRINTER_WIDTHS.map((width) => (
                <option key={width.id} value={width.id}>
                  {width.label}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-slate-500">
              Usaremos esta medida para ajustar márgenes y escala del ticket.
            </span>
          </label>
        </div>
        <div className="space-y-3 text-sm">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={form.printerAutoOpenDrawer}
              onChange={(e) =>
                updateForm("printerAutoOpenDrawer", e.target.checked)
              }
              className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
            />
            <div>
              <p className="font-semibold">Abrir cajón al finalizar la venta</p>
              <p className="text-slate-400 text-xs">
                Cuando el conector esté activo, enviaremos el pulso de apertura
                inmediatamente después de imprimir.
              </p>
            </div>
          </label>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={form.printerDrawerButton}
              onChange={(e) =>
                updateForm("printerDrawerButton", e.target.checked)
              }
              className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
            />
            <div>
              <p className="font-semibold">Mostrar botón “Abrir cajón”</p>
              <p className="text-slate-400 text-xs">
                Habilita el botón manual en el POS para enviar el comando desde la caja.
              </p>
            </div>
          </label>
        </div>
        {form.printerMode === "qz-tray" && (
          <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-100">
            Recuerda instalar QZ Tray en cada computador y autorizar este dominio.
            Guardaremos la configuración para que mañana solo debas conectar la impresora.
          </div>
        )}
      </div>
    </article>
  );

  const stationsBlock = (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Estaciones de caja POS</h2>
          <p className="text-sm text-slate-400">
            Administra los equipos autorizados para abrir el POS. Cada estación tiene
            un correo y una contraseña para configurarla una sola vez en su equipo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadStations()}
            className="text-xs text-slate-400 hover:text-slate-200 underline"
          >
            Refrescar
          </button>
          <button
            type="button"
            onClick={openStationModal}
            className="px-3 py-2 rounded-md bg-emerald-500 text-slate-900 text-xs font-semibold hover:bg-emerald-400 transition"
          >
            Nueva estación
          </button>
        </div>
      </div>
      {stationsError && (
        <p className="text-xs text-red-400">{stationsError}</p>
      )}
      {stationMessage && (
        <div className="text-xs rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-100 px-3 py-2">
          {stationMessage}
        </div>
      )}
      {!stationsLoading && stations.length > 0 && (
        <p className="text-[11px] text-slate-500">
          Las estaciones inactivas se mantienen visibles para conservar el historial.
        </p>
      )}
      <div className="rounded-xl border border-slate-800/60 p-4 flex flex-wrap items-center justify-between gap-4 text-sm">
        <div>
          <p className="font-semibold text-slate-100">POS Web siempre disponible</p>
          <p className="text-xs text-slate-400">
            Este POS se abre desde cualquier navegador y usa los destinatarios predeterminados.
            Decide si debe enviar el reporte de cierre al finalizar la jornada.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-slate-400">
          Email
          <input
            type="checkbox"
            checked={form.webPosSendClosureEmail}
            onChange={(e) => updateForm("webPosSendClosureEmail", e.target.checked)}
            className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500"
          />
        </label>
      </div>
      <div className="rounded-xl border border-slate-800/60 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-950 text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Estación</th>
              <th className="text-left px-4 py-2 font-medium">Correo estación</th>
              <th className="text-left px-4 py-2 font-medium">Estado</th>
              <th className="text-left px-4 py-2 font-medium">Último acceso</th>
              <th className="text-left px-4 py-2 font-medium">Reporte email</th>
              <th className="text-right px-4 py-2 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {stationsLoading &&
              Array.from({ length: 3 }).map((_, idx) => (
                <tr key={`station-skeleton-${idx}`} className="border-t border-slate-800/50">
                  <td className="px-4 py-4">
                    <div className="h-4 w-32 rounded bg-slate-800/70 animate-pulse" />
                  </td>
                  <td className="px-4 py-4">
                    <div className="h-4 w-40 rounded bg-slate-800/70 animate-pulse" />
                  </td>
                  <td className="px-4 py-4">
                    <div className="h-5 w-20 rounded-full bg-slate-800/70 animate-pulse" />
                  </td>
                  <td className="px-4 py-4">
                    <div className="h-4 w-32 rounded bg-slate-800/70 animate-pulse" />
                  </td>
                  <td className="px-4 py-4">
                    <div className="h-4 w-full rounded bg-slate-800/70 animate-pulse" />
                  </td>
                </tr>
              ))}
            {!stationsLoading && visibleStations.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-6 text-center text-xs text-slate-500"
                >
                  No hay estaciones registradas actualmente.
                </td>
              </tr>
            )}
            {!stationsLoading &&
              visibleStations.map((station) => {
                const isUpdating = updatingStationId === station.id;
                const statusLabel = station.is_active ? "Activa" : "Inactiva";
                const statusClass = station.is_active
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-slate-700 text-slate-300";
                const overrideValue =
                  form.stationEmailOverrides[station.id];
                const fallbackValue =
                  station.send_closure_email === undefined ||
                  station.send_closure_email === null
                    ? true
                    : Boolean(station.send_closure_email);
                const emailEnabled =
                  overrideValue === undefined
                    ? fallbackValue
                    : overrideValue;
                return (
                  <tr
                    key={station.id}
                    className="border-t border-slate-800/50 hover:bg-slate-900/50"
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-100">
                        {station.label}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {station.id}
                      </div>
                      {station.bound_device_id && (
                        <div className="text-[11px] text-slate-500">
                          Vinculada a:{" "}
                          {station.bound_device_label ?? station.bound_device_id}
                          {station.bound_at
                            ? ` · ${formatDateLabel(station.bound_at)}`
                            : ""}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-200">
                      {station.station_email ?? "Sin asignar"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] ${statusClass}`}
                      >
                        {statusLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[11px] text-slate-400">
                      {station.last_login_at
                        ? formatDateLabel(station.last_login_at)
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <label className="inline-flex items-center gap-2 text-xs text-slate-400">
                        Email
                        <input
                          type="checkbox"
                          checked={emailEnabled}
                          onChange={(e) =>
                            handleToggleStationClosureEmail(
                              station,
                              e.target.checked
                            )
                          }
                          disabled={isUpdating}
                          className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 disabled:opacity-40"
                        />
                      </label>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-2 text-[11px]">
                        {station.bound_device_id && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleUnbindStation(station)}
                              disabled={isUpdating}
                              className="text-slate-300 hover:text-emerald-300 disabled:opacity-40"
                            >
                              Desvincular
                            </button>
                            <span className="text-slate-600">|</span>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => openStationNoticeModal(station)}
                          disabled={isUpdating || !station.is_active}
                          className="text-slate-300 hover:text-amber-300 disabled:opacity-40"
                        >
                          Enviar aviso
                        </button>
                        <span className="text-slate-600">|</span>
                        <button
                          type="button"
                          onClick={() => openEditStationModal(station)}
                          disabled={isUpdating}
                          className="text-slate-300 hover:text-emerald-300 disabled:opacity-40"
                        >
                          Editar
                        </button>
                        <span className="text-slate-600">|</span>
                        <button
                          type="button"
                          onClick={() =>
                            handleToggleStationActive(station, !station.is_active)
                          }
                          disabled={isUpdating}
                          className="text-slate-300 hover:text-emerald-300 disabled:opacity-40"
                        >
                          {station.is_active ? "Desactivar" : "Activar"}
                        </button>
                        <span className="text-slate-600">|</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteStationRecord(station)}
                          disabled={isUpdating}
                          className="text-rose-300 hover:text-rose-200 disabled:opacity-40"
                        >
                          Quitar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </article>
  );

  const notificationsContent = (
    <div className="space-y-6">
      <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
        <div className="flex justify-between">
          <div>
            <h2 className="text-lg font-semibold">Notificaciones</h2>
            <p className="text-sm text-slate-400">
              Canales que recibirán alertas y reportes periódicos.
            </p>
          </div>
          <button className="text-xs text-slate-400 hover:text-slate-200 underline">
            Gestionar webhooks
          </button>
        </div>
      <div className="space-y-3 text-sm">
          <div className="rounded-xl border border-slate-800/60 p-4 flex justify-between items-center">
            <div>
              <p className="font-semibold text-slate-200">Resumen diario</p>
              <p className="text-xs text-slate-400">
                Ticket promedio, total de ventas y devoluciones al cierre.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-slate-400">
              Email
              <input
                type="checkbox"
                checked={form.notifications.dailySummaryEmail}
                onChange={(e) =>
                  updateNotification("dailySummaryEmail", e.target.checked)
                }
                className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500"
              />
            </label>
          </div>
          <div className="rounded-xl border border-slate-800/60 p-4 flex justify-between items-center">
            <div>
              <p className="font-semibold text-slate-200">Alerta de caja</p>
              <p className="text-xs text-slate-400">
                Aviso cuando un POS lleva más de 30 minutos sin sincronizar.
              </p>
            </div>
            <div className="flex gap-3 text-xs text-slate-400">
              <label className="inline-flex items-center gap-1">
                SMS
                <input
                  type="checkbox"
                  checked={form.notifications.cashAlertSms}
                  onChange={(e) =>
                    updateNotification("cashAlertSms", e.target.checked)
                  }
                  className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500"
                />
              </label>
              <label className="inline-flex items-center gap-1">
                Email
                <input
                  type="checkbox"
                  checked={form.notifications.cashAlertEmail}
                  onChange={(e) =>
                    updateNotification("cashAlertEmail", e.target.checked)
                  }
                  className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500"
                />
              </label>
            </div>
          </div>
          <div className="rounded-xl border border-slate-800/60 p-4 flex justify-between items-center">
            <div>
              <p className="font-semibold text-slate-200">Reporte mensual</p>
              <p className="text-xs text-slate-400">
                PDF consolidado para el área contable.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-slate-400">
              Email
              <input
                type="checkbox"
                checked={form.notifications.monthlyReportEmail}
                onChange={(e) =>
                  updateNotification("monthlyReportEmail", e.target.checked)
                }
                className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500"
              />
            </label>
          </div>
        </div>
      </article>
      <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4 text-sm">
        <div>
          <h3 className="text-base font-semibold text-slate-200">
            Destinatarios predeterminados
          </h3>
          <p className="text-xs text-slate-400">
            Puedes definir correos que recibirán automáticamente el cierre Z y
            copias de cada ticket enviado desde el POS.
          </p>
        </div>
        <label className="flex flex-col gap-2">
          <span className="text-slate-400 text-xs uppercase tracking-wide">
            Correos para cierre / Reporte Z
          </span>
          <textarea
            value={form.closureEmailRecipients}
            onChange={(e) =>
              updateForm("closureEmailRecipients", e.target.value)
            }
            rows={4}
            placeholder="correo1@empresa.com&#10;correo2@empresa.com"
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
          />
          <span className="text-[11px] text-slate-500">
            Uno por línea o separados por coma. Se usarán automáticamente al
            generar cada reporte Z (puedes ajustarlos manualmente antes de
            enviar).
          </span>
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-slate-400 text-xs uppercase tracking-wide">
            Copias de tickets (CC opcional)
          </span>
          <textarea
            value={form.ticketEmailCc}
            onChange={(e) => updateForm("ticketEmailCc", e.target.value)}
            rows={3}
            placeholder="soporte@empresa.com"
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
          />
          <span className="text-[11px] text-slate-500">
            Estos correos se añadirán como copia cuando envíes un ticket por
            email desde el POS. Déjalo en blanco si no necesitas copias.
          </span>
        </label>
      </article>
      <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4 text-sm">
        <div>
          <h3 className="text-base font-semibold text-slate-200">
            Configuración SMTP
          </h3>
          <p className="text-xs text-slate-400">
            Define el servidor que usaremos para enviar tickets y reportes Z.
            Todos los campos son obligatorios para habilitar el envío por correo.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-slate-400">
              Servidor (host)
            </span>
            <input
              type="text"
              value={form.smtpHost}
              onChange={(e) => updateForm("smtpHost", e.target.value)}
              placeholder="smtp.tuempresa.com"
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-slate-400">
              Puerto
            </span>
            <input
              type="number"
              min={1}
              value={form.smtpPort}
              onChange={(e) => updateForm("smtpPort", e.target.value)}
              placeholder="587"
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-slate-400">
              Usuario
            </span>
            <input
              type="text"
              value={form.smtpUser}
              onChange={(e) => updateForm("smtpUser", e.target.value)}
              placeholder="usuario@tuempresa.com"
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-slate-400">
              Contraseña / token
            </span>
            <input
              type="password"
              value={form.smtpPassword}
              onChange={(e) => updateForm("smtpPassword", e.target.value)}
              placeholder="••••••••"
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            />
          </label>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-slate-400">
              Remitente (Email from)
            </span>
            <input
              type="email"
              value={form.emailFrom}
              onChange={(e) => updateForm("emailFrom", e.target.value)}
              placeholder="ventas@tuempresa.com"
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-300 mt-5">
            <input
              type="checkbox"
              checked={form.smtpUseTls}
              onChange={(e) => updateForm("smtpUseTls", e.target.checked)}
              className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
            />
            Usar TLS/STARTTLS
          </label>
        </div>
        <p className="text-[11px] text-slate-500">
          Si tu proveedor exige contraseñas de aplicación (por ejemplo Google),
          ingrésalas aquí. Al guardar, el POS usará estos datos en lugar de las
          variables de entorno para enviar correos.
        </p>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs">
            {smtpTestMessage && (
              <span className="text-emerald-300">{smtpTestMessage}</span>
            )}
            {smtpTestError && (
              <span className="text-rose-300">{smtpTestError}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => void handleSendSmtpTest()}
            disabled={smtpTestSending}
            className="px-3 py-2 rounded-md border border-emerald-400/70 text-emerald-300 text-xs hover:bg-emerald-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {smtpTestSending ? "Enviando..." : "Enviar correo de prueba"}
          </button>
        </div>
      </article>
      <article className="rounded-2xl border border-dashed border-emerald-400/60 bg-emerald-500/5 p-6 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-emerald-200">
              Reportes por email
            </h2>
            <p className="text-sm text-emerald-100/70">
              Próximamente podrás definir destinatarios y plantillas para
              reportes automáticos (cierres, ventas por línea, etc.).
            </p>
          </div>
          <span className="text-xs px-3 py-1 rounded-full border border-emerald-400 text-emerald-100">
            Próximamente
          </span>
        </div>
        <p className="text-xs text-emerald-100/80">
          Esta sección quedará lista para conectarse con el nuevo endpoint
          `reporte_email`; mientras tanto, utiliza las notificaciones
          anteriores para seguir recibiendo resúmenes diarios y mensuales.
        </p>
      </article>
    </div>
  );

  const securityContent = (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Usuarios y roles</h2>
          <p className="text-sm text-slate-400">
            Crea cuentas para cajeros, administradores y personal de auditoría.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="text-xs text-slate-400 hover:text-slate-200 underline"
            onClick={() => void loadUsers()}
          >
            Refrescar
          </button>
          <button
            type="button"
            onClick={() => openUserModal()}
            className="px-3 py-2 rounded-md bg-emerald-500 text-slate-900 text-xs font-semibold hover:bg-emerald-400 transition"
          >
            Nuevo usuario
          </button>
        </div>
      </div>

      {usersError && <p className="text-xs text-red-400">{usersError}</p>}
      {inviteFeedback && (
        <p className="text-xs text-emerald-300">{inviteFeedback}</p>
      )}
      {inviteError && <p className="text-xs text-red-400">{inviteError}</p>}

      <div className="rounded-xl border border-slate-800/60 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-950 text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Nombre</th>
              <th className="text-left px-4 py-2 font-medium">Correo</th>
              <th className="text-left px-4 py-2 font-medium">Rol</th>
              <th className="text-left px-4 py-2 font-medium">Estado</th>
              <th className="text-right px-4 py-2 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usersLoading &&
              Array.from({ length: 3 }).map((_, idx) => (
                <tr
                  key={`users-skeleton-${idx}`}
                  className="border-t border-slate-800/60"
                >
                  <td className="px-4 py-4">
                    <div className="h-4 w-32 rounded bg-slate-800/60 animate-pulse" />
                    <div className="mt-2 h-3 w-24 rounded bg-slate-900/70 animate-pulse" />
                  </td>
                  <td className="px-4 py-4">
                    <div className="h-4 w-40 rounded bg-slate-800/60 animate-pulse" />
                    <div className="mt-2 h-3 w-28 rounded bg-slate-900/70 animate-pulse" />
                  </td>
                  <td className="px-4 py-4">
                    <div className="h-8 w-28 rounded bg-slate-900/70 animate-pulse" />
                  </td>
                  <td className="px-4 py-4">
                    <div className="h-6 w-20 rounded-full bg-slate-900/70 animate-pulse" />
                  </td>
                  <td className="px-4 py-4">
                    <div className="h-4 w-full rounded bg-slate-900/70 animate-pulse" />
                  </td>
                </tr>
              ))}
            {!usersLoading &&
              users.map((user) => {
                const invitationPending =
                  user.status === "Activo" &&
                  !!user.invited_at &&
                  !user.accepted_at;
                const statusLabel = invitationPending
                  ? "Pendiente"
                  : user.status;
                const statusClass = invitationPending
                  ? "bg-amber-500/20 text-amber-200"
                  : user.status === "Activo"
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-slate-700 text-slate-400";
                const invitedText =
                  invitationPending && user.invited_at
                    ? `Invitado el ${formatDateLabel(user.invited_at)}`
                    : user.accepted_at
                      ? `Accedió el ${formatDateLabel(user.accepted_at)}`
                      : null;
                return (
                  <tr
                    key={user.id}
                    className="border-t border-slate-800/60 hover:bg-slate-900/60"
                  >
                    <td className="px-4 py-3 text-slate-100">
                      <div className="font-semibold">{user.name}</div>
                      {user.position && (
                        <div className="text-xs text-slate-400">
                          {user.position}
                        </div>
                      )}
                      {user.notes && (
                        <div className="text-[11px] text-slate-500 italic">
                          {user.notes}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      <div>{user.email}</div>
                      {user.phone && (
                        <div className="text-xs text-slate-400">
                          {user.phone}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={user.role}
                    onChange={(e) =>
                      handleRoleChange(
                        user,
                        e.target.value as PosUserRecord["role"]
                      )
                    }
                    disabled={updatingUserId === user.id}
                    className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs"
                  >
                    <option value="Administrador">Administrador</option>
                    <option value="Supervisor">Supervisor</option>
                    <option value="Vendedor">Vendedor</option>
                    <option value="Auditor">Auditor</option>
                  </select>
                </td>
                    <td className="px-4 py-3">
                      <div>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${statusClass}`}
                        >
                          {statusLabel}
                        </span>
                      </div>
                      {invitedText && (
                        <div className="text-[11px] text-slate-400 mt-1">
                          {invitedText}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-slate-300">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openUserModal(user)}
                          className="hover:text-emerald-400"
                        >
                          Editar
                        </button>
                        <span className="text-slate-700">|</span>
                        <button
                          type="button"
                          onClick={() => void handleInviteUser(user)}
                          disabled={invitingUserId === user.id}
                          className="hover:text-emerald-400"
                        >
                          {invitingUserId === user.id
                            ? "Invitando…"
                            : "Invitar"}
                        </button>
                        <span className="text-slate-700">|</span>
                        <button
                          type="button"
                          onClick={() => void handleToggleUserStatus(user)}
                          disabled={updatingUserId === user.id}
                          className="hover:text-emerald-400"
                        >
                          {user.status === "Activo" ? "Suspender" : "Reactivar"}
                        </button>
                        <span className="text-slate-700">|</span>
                        <button
                          type="button"
                          onClick={() => openPasswordModal(user)}
                          className="hover:text-emerald-400"
                        >
                          Restablecer contraseña
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            {!usersLoading && users.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-xs text-slate-500"
                >
                  No hay usuarios registrados todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <article className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-4 space-y-3 relative">
        {savingRolePermissions && (
          <div className="absolute inset-0 rounded-xl bg-slate-950/80 backdrop-blur flex flex-col items-center justify-center gap-2 text-xs text-slate-300 z-10">
            <span className="h-6 w-6 rounded-full border-2 border-emerald-300 border-t-transparent animate-spin" />
            Guardando permisos…
          </div>
        )}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              Permisos por rol
            </h3>
            <p className="text-xs text-slate-400 max-w-xl">
              Define qué secciones puede ver cada rol. Activa o desactiva los
              accesos y guarda los cambios para aplicarlos en toda la app.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {rolePermissionsError && (
              <p className="text-xs text-red-400">{rolePermissionsError}</p>
            )}
            {rolePermissionsMessage && (
              <p className="text-xs text-emerald-300">{rolePermissionsMessage}</p>
            )}
            <button
              type="button"
              onClick={() => void handleSaveRolePermissions()}
              disabled={!rolePermissionsDirty || savingRolePermissions}
              className="px-3 py-1.5 rounded-md border border-emerald-400 text-emerald-200 text-xs font-semibold hover:bg-emerald-500/10 disabled:opacity-40"
            >
              {savingRolePermissions ? "Guardando…" : "Guardar permisos"}
            </button>
          </div>
        </div>
        <div className="overflow-x-auto space-y-4">
          {rolePermissionsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div
                  key={`permissions-skeleton-${idx}`}
                  className="h-14 rounded-2xl border border-slate-800/50 bg-slate-950/40 animate-pulse"
                />
              ))}
              <div className="h-32 rounded-2xl border border-slate-800/50 bg-slate-950/40 animate-pulse" />
            </div>
          ) : (
            <>
          <table className="w-full text-xs text-left border border-slate-800/60 rounded-xl overflow-hidden">
            <thead className="bg-slate-950 text-slate-400 uppercase tracking-wide text-[11px]">
              <tr>
                <th className="px-4 py-2 font-medium w-1/2">Módulo</th>
                {roleOrder.map((role) => (
                  <th key={role} className="px-3 py-2 font-medium text-center">
                    {role}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rolePermissions.map((row) => {
                const moduleEditable = row.editable ?? true;
                return (
                  <tr
                    key={row.id}
                    className="border-t border-slate-800/60 hover:bg-slate-900/50"
                  >
                    <td className="px-4 py-3">
                      <div className="text-slate-100 font-semibold">
                        {row.label}
                      </div>
                      <div className="text-slate-400 text-[11px]">
                        {row.description}
                      </div>
                    </td>
                    {roleOrder.map((role) => {
                      const allowed = row.roles[role];
                      const toggleClass = allowed
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        : "bg-slate-800 text-slate-500 border border-slate-700";
                      return (
                        <td
                          key={`${row.id}-${role}`}
                          className="px-3 py-3 text-center"
                        >
                          <button
                            type="button"
                            onClick={() => handleTogglePermission(row.id, role)}
                            disabled={!moduleEditable}
                            className={`inline-flex items-center justify-center h-6 w-6 rounded-full text-[10px] font-semibold ${
                              moduleEditable
                                ? "hover:scale-105 transition"
                                : "opacity-50 cursor-not-allowed"
                            } ${toggleClass}`}
                          >
                            {allowed ? "✓" : "—"}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {rolePermissions.map((row) => {
            const isExpanded = expandedModules[row.id] ?? false;
            const moduleEditable = row.editable ?? true;
            return (
              <div
                key={`${row.id}-actions`}
                className="rounded-xl border border-slate-800/60 bg-slate-950/30"
              >
                <button
                  type="button"
                  onClick={() => toggleModule(row.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-100 hover:bg-slate-900/60"
                >
                  <span>{row.label} · Acciones</span>
                  <span
                    className={`transition-transform ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  >
                    ▼
                  </span>
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3">
                    <p className="text-xs text-slate-400">
                      Detalle de lo que puede hacer cada rol dentro del módulo.
                    </p>
                    <table className="w-full text-xs border border-slate-800/50 rounded-lg">
                      <thead className="bg-slate-950 text-slate-400 uppercase tracking-wide text-[10px]">
                        <tr>
                          <th className="px-3 py-2 text-left">Acción</th>
                          {roleOrder.map((role) => (
                            <th key={role} className="px-2 py-2 text-center">
                              {role}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {row.actions.map((action) => {
                          const actionEditable =
                            (action.editable ?? true) && moduleEditable;
                          const toggleClass = (allowed: boolean) =>
                            allowed
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                              : "bg-slate-800 text-slate-500 border border-slate-700";
                          return (
                            <tr
                              key={action.id}
                              className="border-t border-slate-800/50 hover:bg-slate-900/50"
                            >
                              <td className="px-3 py-2">
                                <div className="text-slate-100 font-medium">
                                  {action.label}
                                </div>
                                <div className="text-slate-400 text-[11px]">
                                  {action.description}
                                </div>
                              </td>
                              {roleOrder.map((role) => {
                                const allowed = action.roles[role];
                                return (
                                  <td
                                    key={`${action.id}-${role}`}
                                    className="px-2 py-2 text-center"
                                  >
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleTogglePermission(
                                          row.id,
                                          role,
                                          action.id
                                        )
                                      }
                                      disabled={!actionEditable}
                                      className={`inline-flex items-center justify-center h-5 w-5 rounded-full text-[9px] font-semibold ${
                                        actionEditable
                                          ? "hover:scale-110 transition"
                                          : "opacity-50 cursor-not-allowed"
                                      } ${toggleClass(allowed)}`}
                                    >
                                      {allowed ? "✓" : "—"}
                                    </button>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
            </>
          )}
        </div>
        <p className="text-[11px] text-slate-500">
          ¿Necesitas otro rol? Escríbenos y lo agregamos en el backend para que
          puedas asignarle permisos específicos.
        </p>
      </article>
    </section>
  );

  const trackedStationsCount =
    controlRows.length > 0 ? controlRows.length : stations.length;
  const pendingStationsCount = controlRows.filter(
    (row) => row.pendingCount > 0
  ).length;
  const totalPendingTickets = controlRows.reduce(
    (acc, row) => acc + row.pendingCount,
    0
  );
  const controlUpdatedLabel = controlLastUpdated
    ? formatDateLabel(controlLastUpdated)
    : "Sin actualizar";

  const controlContent = (
    <div className="space-y-6">
      {stationsBlock}
      <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              Control de estaciones
            </h2>
            <p className="text-sm text-slate-400 max-w-3xl">
              Consulta el último cierre registrado por cada estación y detecta
              dónde quedan ventas o abonos sin cerrar.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 md:items-end">
            <button
              type="button"
              onClick={() => void loadControlData()}
              disabled={controlLoading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-500 text-emerald-100 text-sm hover:bg-emerald-500/10 disabled:opacity-50"
            >
              {controlLoading ? "Actualizando…" : "Actualizar estado"}
            </button>
            <span className="text-[11px] text-slate-500">
              Última actualización: {controlUpdatedLabel}
            </span>
          </div>
        </div>
        {controlError && (
          <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
            {controlError}
          </p>
        )}
        {adminClosureError && (
          <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
            {adminClosureError}
          </p>
        )}
        {adminClosureMessage && (
          <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
            {adminClosureMessage}
          </p>
        )}
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">
              Estaciones monitoreadas
            </p>
            <p className="text-3xl font-semibold text-slate-50">
              {trackedStationsCount}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Incluye POS Web y registros heredados.
            </p>
          </div>
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
            <p className="text-[11px] uppercase tracking-wide text-amber-200">
              Estaciones con pendientes
            </p>
            <p className="text-3xl font-semibold text-amber-100">
              {pendingStationsCount}
            </p>
            <p className="text-xs text-amber-100/80 mt-1">
              Revisa las filas en color ámbar en el listado inferior.
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">
              Tickets / abonos por cerrar
            </p>
            <p className="text-3xl font-semibold text-slate-50">
              {totalPendingTickets}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Suma total de registros detectados sin cierre.
            </p>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800 overflow-hidden">
          {controlLoading ? (
            <div className="px-4 py-6 text-center text-sm text-slate-400">
              Cargando estado de las estaciones…
            </div>
          ) : controlRows.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-400">
              Aún no hay datos de cierres. Ejecuta un reporte Z o presiona
              “Actualizar estado”.
            </div>
          ) : (
            <table className="w-full text-left text-xs bg-slate-950/40">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wide text-[11px]">
                <tr>
                  <th className="px-4 py-3 font-medium">Estación</th>
                  <th className="px-4 py-3 font-medium">Último cierre</th>
                  <th className="px-4 py-3 font-medium">Pendientes</th>
                </tr>
              </thead>
              <tbody>
                {controlRows.map((row) => {
                  const stationRecord = row.stationId
                    ? stationRecordMap.get(row.stationId)
                    : null;
                  const hasPending = row.pendingCount > 0;
                  return (
                    <tr
                      key={row.stationId ?? "legacy"}
                      className={`border-t border-slate-900 ${
                        hasPending ? "bg-amber-500/5" : ""
                      }`}
                    >
                      <td className="px-4 py-4 align-top">
                        <div className="text-sm font-semibold text-slate-100">
                          {row.label}
                          {stationRecord && !stationRecord.is_active && (
                            <span className="ml-2 rounded-full border border-slate-600 px-2 py-0.5 text-[10px] text-slate-400">
                              Inactiva
                            </span>
                          )}
                        </div>
                        {row.email && (
                          <div className="text-[11px] text-slate-400">
                            {row.email}
                          </div>
                        )}
                        {row.stationId && (
                          <div className="text-[11px] text-slate-500 font-mono">
                            {row.stationId}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 align-top">
                        {row.lastClosureLabel ? (
                          <div className="space-y-1">
                            <div className="text-slate-100 font-medium">
                              {row.lastClosureLabel}
                            </div>
                            {row.lastClosureRange && (
                              <div className="text-[11px] text-slate-400">
                                Ventas del {row.lastClosureRange}
                              </div>
                            )}
                            {row.lastClosureAmount != null && (
                              <div className="text-[11px] text-slate-300">
                                Neto:{" "}
                                {row.lastClosureAmount.toLocaleString("es-CO", {
                                  style: "currency",
                                  currency: "COP",
                                  maximumFractionDigits: 0,
                                })}
                              </div>
                            )}
                            {row.lastClosureDocument && (
                              <div className="text-[11px] text-slate-500">
                                {row.lastClosureDocument}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-500">
                            Sin registros
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 align-top">
                        {hasPending ? (
                          <div className="space-y-1">
                            <div className="text-base font-semibold text-amber-200">
                              {row.pendingCount} pendiente
                              {row.pendingCount > 1 ? "s" : ""}
                            </div>
                            {row.pendingSinceLabel && (
                              <div className="text-[11px] text-amber-100/80">
                                Desde {row.pendingSinceLabel}
                              </div>
                            )}
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => void handleAdminClosure(row)}
                                disabled={
                                  adminClosureLoading ===
                                  (row.stationId ?? "__legacy__")
                                }
                                className="mt-2 inline-flex items-center rounded-md border border-amber-400/60 px-2.5 py-1 text-[11px] font-medium text-amber-100 hover:bg-amber-500/10 disabled:opacity-50"
                              >
                                {adminClosureLoading ===
                                (row.stationId ?? "__legacy__")
                                  ? "Cerrando…"
                                  : "Cierre admin"}
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-emerald-300 font-medium">
                            Al día
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="text-[11px] text-slate-500">
          ¿Necesitas ver el detalle?{" "}
          <Link
            href="/dashboard/documents"
            className="text-emerald-300 hover:text-emerald-100 underline"
          >
            Abre Documentos y filtra por estación
          </Link>
          .
        </div>
      </article>
    </div>
  );

  const tabContentMap: Record<SettingsTab, ReactNode> = {
    company: companyContent,
    appearance: appearanceContent,
    pos: posContent,
    payments: (
      <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3">
          <div>
            <h2 className="text-lg font-semibold">Métodos de pago</h2>
            <p className="text-sm text-slate-400 max-w-xl">
              Configura los métodos disponibles en el POS. Puedes crear nuevos,
              activar/desactivar y definir si devuelven cambio. El orden se refleja
              en los botones de la caja.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openPaymentModal(null)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-500 text-emerald-100 text-sm hover:bg-emerald-500/10"
          >
            + Nuevo método
          </button>
        </div>
        <div className="rounded-2xl border border-slate-800/60 overflow-hidden">
          {paymentMethodsLoading && (
            <div className="px-4 py-3 text-xs text-slate-400">
              Cargando métodos de pago...
            </div>
          )}
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 text-slate-400">
              <tr>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Slug</th>
                <th className="px-3 py-2">Cambio</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Orden</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {paymentMethods.length === 0 && !paymentMethodsLoading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-xs text-slate-500"
                  >
                    No hay métodos de pago registrados.
                  </td>
                </tr>
              ) : (
                paymentMethods.map((method, index) => {
                  const isPlaceholder = method.id < 0;
                  return (
                    <tr
                      key={`${method.id}-${method.slug}`}
                      className="border-t border-slate-800/40"
                    >
                      <td className="px-3 py-2 text-sm text-slate-100">
                        <div className="font-medium">{method.name}</div>
                        {method.description && (
                          <div className="text-[11px] text-slate-400">
                            {method.description}
                          </div>
                        )}
                      </td>
                    <td className="px-3 py-2 text-[11px] text-slate-400 font-mono">
                      {method.slug}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-slate-200">
                      {method.allow_change ? "Sí" : "No"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] ${
                          method.is_active
                            ? "border-emerald-400/40 text-emerald-200"
                            : "border-slate-700 text-slate-400"
                        }`}
                      >
                        {method.is_active ? "Activo" : "Oculto"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-slate-400">
                      #{method.order_index}
                    </td>
                    <td className="px-3 py-2 text-right text-[11px] text-slate-400 space-x-2">
                      <button
                        type="button"
                        onClick={() => handleMovePaymentMethod(method, -1)}
                        className="px-2 py-1 rounded border border-slate-700 hover:border-emerald-400 disabled:opacity-40"
                        disabled={
                          isPlaceholder || index === 0
                        }
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMovePaymentMethod(method, 1)}
                        className="px-2 py-1 rounded border border-slate-700 hover:border-emerald-400 disabled:opacity-40"
                        disabled={
                          isPlaceholder || index === paymentMethods.length - 1
                        }
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => openPaymentModal(method)}
                        className="px-2 py-1 rounded border border-slate-700 hover:border-emerald-400"
                        disabled={isPlaceholder}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTogglePaymentMethod(method)}
                        className="px-2 py-1 rounded border border-slate-700 hover:border-emerald-400"
                        disabled={isPlaceholder}
                      >
                        {method.is_active ? "Ocultar" : "Activar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePaymentMethod(method)}
                        className="px-2 py-1 rounded border border-rose-500/70 text-rose-200 hover:bg-rose-500/10"
                        disabled={isPlaceholder}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                );
              })
              )}
            </tbody>
          </table>
        </div>
        {paymentMethodsError && (
          <p className="text-xs text-red-400">{paymentMethodsError}</p>
        )}
      </article>
    ),
    notifications: notificationsContent,
    security: securityContent,
    control: controlContent,
  };

  return (
    <main className="flex-1 px-6 py-6 settings-page">
      <div className="w-full max-w-7xl mx-auto space-y-8">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-sm text-emerald-400 font-semibold uppercase tracking-wide">
              Panel Metrik
            </p>
            <h1 className="text-3xl font-bold">Configuración general</h1>
            <p className="text-sm text-slate-400 mt-2 max-w-2xl">
              Administra la identidad del negocio, parámetros del POS, usuarios
              y preferencias visuales. Este formulario ya está listo para
              conectarse con la API; si algún servicio no responde, usamos
              valores locales para mantener la operación.
            </p>
            {settingsError && (
              <p className="text-xs text-red-400 mt-2">{settingsError}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void handleSaveSettings()}
            disabled={savingSettings}
            className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm shadow-lg shadow-emerald-500/30 disabled:opacity-50"
          >
            {savingSettings ? "Guardando..." : "Guardar cambios"}
          </button>
        </header>

        <div className="relative">
          {savingSettings && (
            <div className="absolute inset-0 z-10 rounded-2xl bg-slate-950/70 backdrop-blur-sm flex flex-col items-center justify-center text-xs text-slate-300 gap-2">
              <span className="h-8 w-8 rounded-full border-2 border-emerald-300 border-t-transparent animate-spin" />
              Guardando cambios…
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-3 flex flex-col gap-3 settings-tabs">
          <div className="flex flex-wrap gap-2">
            {SETTINGS_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-xl border text-xs text-left transition settings-tab ${
                  activeTab === tab.id
                    ? "is-active"
                    : "is-idle"
                }`}
              >
                <p className="font-semibold">{tab.label}</p>
                <p className="text-[11px] opacity-70">{tab.description}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-6">{tabContentMap[activeTab]}</div>

        {saveMessage && (
          <div className="fixed right-6 top-24 z-[60] w-[340px] max-w-[90vw]">
            <div
              className={
                "rounded-2xl border border-emerald-500 bg-emerald-50 px-4 py-3 text-emerald-900 shadow-[0_18px_45px_rgba(16,185,129,0.25)] transition-all duration-300 " +
                (saveToastVisible
                  ? "translate-x-0 opacity-100"
                  : "translate-x-4 opacity-0")
              }
            >
              <div className="text-sm font-semibold text-emerald-800">
                Éxito
              </div>
              <p className="mt-1 text-sm text-emerald-900/90">
                {saveMessage}
              </p>
            </div>
          </div>
        )}

        {userModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur">
            <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4 relative">
              {creatingUser && (
                <div className="absolute inset-0 rounded-2xl bg-slate-950/80 backdrop-blur flex flex-col items-center justify-center gap-2 text-xs text-slate-300">
                  <span className="h-7 w-7 rounded-full border-2 border-emerald-300 border-t-transparent animate-spin" />
                  Guardando usuario…
                </div>
              )}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-100">
                    {editingUser ? "Editar usuario" : "Nuevo usuario"}
                  </h3>
                  <p className="text-sm text-slate-400">
                    Define los datos del colaborador que tendrá acceso al POS.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeUserModal}
                  className="text-slate-400 hover:text-slate-200 text-xl leading-none"
                  aria-label="Cerrar"
                >
                  ×
                </button>
              </div>
              <form onSubmit={handleSubmitUser} className="space-y-3">
                <label className="text-sm text-slate-300 flex flex-col gap-1">
                  Nombre completo
                  <input
                    value={userForm.name}
                    onChange={(e) =>
                      setUserForm((prev) => ({
                        ...prev,
                        name: e.target.value,
                      }))
                    }
                    className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
                    placeholder="Ej. Laura Contreras"
                  />
                </label>
                <label className="text-sm text-slate-300 flex flex-col gap-1">
                  Correo electrónico
                  <input
                    type="email"
                    value={userForm.email}
                    onChange={(e) =>
                      setUserForm((prev) => ({
                        ...prev,
                        email: e.target.value,
                      }))
                    }
                    className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
                    placeholder="usuario@kensar.com"
                  />
                </label>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-sm text-slate-300 flex flex-col gap-1">
                    Teléfono
                    <input
                      type="tel"
                      value={userForm.phone}
                      onChange={(e) =>
                        setUserForm((prev) => ({
                          ...prev,
                          phone: e.target.value,
                        }))
                      }
                      className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
                      placeholder="+57 300 000 0000"
                    />
                  </label>
                  <label className="text-sm text-slate-300 flex flex-col gap-1">
                    Cargo / Rol interno
                    <input
                      value={userForm.position}
                      onChange={(e) =>
                        setUserForm((prev) => ({
                          ...prev,
                          position: e.target.value,
                        }))
                      }
                      className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
                      placeholder="Administrador tienda"
                    />
                  </label>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-sm text-slate-300 flex flex-col gap-1">
                    Rol
                  <select
                    value={userForm.role}
                    onChange={(e) =>
                      setUserForm((prev) => ({
                        ...prev,
                        role: e.target.value as PosUserRecord["role"],
                      }))
                    }
                    className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
                  >
                    <option value="Administrador">Administrador</option>
                    <option value="Supervisor">Supervisor</option>
                    <option value="Vendedor">Vendedor</option>
                    <option value="Auditor">Auditor</option>
                  </select>
                </label>
                  <label className="text-sm text-slate-300 flex flex-col gap-1">
                    Contraseña inicial (opcional)
                    <input
                      type="password"
                      value={userForm.password}
                      onChange={(e) =>
                        setUserForm((prev) => ({
                          ...prev,
                          password: e.target.value,
                        }))
                      }
                      className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
                      placeholder="Solo si deseas definirla manualmente"
                    />
                  </label>
                  <label className="text-sm text-slate-300 flex flex-col gap-1">
                    PIN de acceso POS (opcional)
                    <input
                      type="password"
                      value={userForm.pin}
                      onChange={(e) =>
                        setUserForm((prev) => ({
                          ...prev,
                          pin: e.target.value,
                        }))
                      }
                      className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
                      placeholder="4 a 8 dígitos"
                      inputMode="numeric"
                    />
                  </label>
                </div>
                <label className="text-sm text-slate-300 flex flex-col gap-1">
                  Notas internas
                  <textarea
                    value={userForm.notes}
                    onChange={(e) =>
                      setUserForm((prev) => ({
                        ...prev,
                        notes: e.target.value,
                      }))
                    }
                    className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
                    rows={3}
                    placeholder="Comentarios visibles solo para administradores."
                  />
                </label>
                {userFormError && (
                  <p className="text-xs text-red-400">{userFormError}</p>
                )}
                <div className="flex justify-end gap-3 pt-3">
                  {editingUser && (
                    <button
                      type="button"
                      onClick={() => void handleDeleteUser(editingUser)}
                      disabled={creatingUser || deletingUserId === editingUser.id}
                      className="px-4 py-2 rounded-md border border-rose-500/60 text-rose-200 text-sm hover:bg-rose-500/10 disabled:opacity-50 mr-auto"
                    >
                      {deletingUserId === editingUser.id
                        ? "Eliminando…"
                        : "Eliminar usuario"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={closeUserModal}
                    disabled={creatingUser}
                    className="px-4 py-2 rounded-md border border-slate-600 text-slate-300 text-sm hover:bg-slate-800 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={creatingUser}
                    className="px-4 py-2 rounded-md bg-emerald-500 text-slate-900 text-sm font-semibold hover:bg-emerald-400 disabled:opacity-50"
                  >
                    {creatingUser
                      ? "Guardando…"
                      : editingUser
                        ? "Actualizar"
                        : "Crear"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {paymentModalOpen && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/70 backdrop-blur">
            <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-100">
                    {editingPayment ? "Editar método" : "Nuevo método"}
                  </h3>
                  <p className="text-sm text-slate-400">
                    Configura el nombre, slug y reglas del método de pago.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closePaymentModal}
                  className="text-slate-400 hover:text-slate-200 text-xl leading-none"
                  aria-label="Cerrar"
                  disabled={paymentSaving}
                >
                  ×
                </button>
              </div>
              <form onSubmit={handleSubmitPaymentMethod} className="space-y-3">
                <label className="text-sm flex flex-col gap-1 text-slate-300">
                  Nombre
                  <input
                    type="text"
                    value={paymentForm.name}
                    onChange={(e) =>
                      handlePaymentInput("name", e.target.value)
                    }
                    className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                    placeholder="Ej. Efectivo"
                  />
                </label>
                <label className="text-sm flex flex-col gap-1 text-slate-300">
                  Slug
                  <input
                    type="text"
                    value={paymentForm.slug}
                    onChange={(e) =>
                      handlePaymentInput("slug", e.target.value)
                    }
                    disabled={!!editingPayment}
                    className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 disabled:opacity-50"
                    placeholder="cash, qr..."
                  />
                  <span className="text-[11px] text-slate-500">
                    Solo minúsculas sin espacios. Usado como identificador.
                  </span>
                </label>
                <label className="text-sm flex flex-col gap-1 text-slate-300">
                  Descripción
                  <textarea
                    rows={2}
                    value={paymentForm.description}
                    onChange={(e) =>
                      handlePaymentInput("description", e.target.value)
                    }
                    className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                    placeholder="Notas internas o instrucciones"
                  />
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={paymentForm.allow_change}
                    onChange={(e) =>
                      handlePaymentInput("allow_change", e.target.checked)
                    }
                    className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                  />
                  Permite entregar cambio
                </label>
                <label className="text-sm flex flex-col gap-1 text-slate-300">
                  Color (opcional)
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={
                        /^#([0-9a-fA-F]{6})$/.test(paymentForm.color.trim())
                          ? paymentForm.color.trim()
                          : "#10b981"
                      }
                      onChange={(e) =>
                        handlePaymentInput("color", e.target.value)
                      }
                      className="h-10 w-12 rounded-md border border-slate-700 bg-slate-950"
                      aria-label="Seleccionar color del método"
                    />
                    <input
                      type="text"
                      value={paymentForm.color}
                      onChange={(e) =>
                        handlePaymentInput("color", e.target.value)
                      }
                      placeholder="#10b981"
                      className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                    />
                  </div>
                </label>
                {paymentFormError && (
                  <p className="text-xs text-red-400">{paymentFormError}</p>
                )}
                <div className="flex justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={closePaymentModal}
                    className="px-4 py-2 rounded-md border border-slate-600 text-slate-300 text-sm hover:bg-slate-800 disabled:opacity-50"
                    disabled={paymentSaving}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={paymentSaving}
                    className="px-4 py-2 rounded-md bg-emerald-500 text-slate-900 text-sm font-semibold hover:bg-emerald-400 disabled:opacity-50"
                  >
                    {paymentSaving ? "Guardando…" : "Guardar método"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {passwordModalUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur">
            <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-100">
                    Restablecer contraseña
                  </h3>
                  <p className="text-sm text-slate-400">
                    {passwordModalUser.name} ({passwordModalUser.email})
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closePasswordModal}
                  className="text-slate-400 hover:text-slate-200 text-xl leading-none"
                  aria-label="Cerrar"
                >
                  ×
                </button>
              </div>
              <form onSubmit={handleResetPassword} className="space-y-3">
                <label className="text-sm text-slate-300 flex flex-col gap-1">
                  Nueva contraseña
                  <input
                    type="password"
                    value={passwordModalState.password}
                    onChange={(e) =>
                      setPasswordModalState((prev) => ({
                        ...prev,
                        password: e.target.value,
                      }))
                    }
                    className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
                    placeholder="Ingresa la nueva contraseña"
                  />
                </label>
                <label className="text-sm text-slate-300 flex flex-col gap-1">
                  Confirmar contraseña
                  <input
                    type="password"
                    value={passwordModalState.confirm}
                    onChange={(e) =>
                      setPasswordModalState((prev) => ({
                        ...prev,
                        confirm: e.target.value,
                      }))
                    }
                    className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
                    placeholder="Confirma la contraseña"
                  />
                </label>
                {passwordModalState.error && (
                  <p className="text-xs text-red-400">{passwordModalState.error}</p>
                )}
                <div className="flex justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={closePasswordModal}
                    disabled={passwordModalState.saving}
                    className="px-4 py-2 rounded-md border border-slate-600 text-slate-300 text-sm hover:bg-slate-800 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={passwordModalState.saving}
                    className="px-4 py-2 rounded-md bg-emerald-500 text-slate-900 text-sm font-semibold hover:bg-emerald-400 disabled:opacity-50"
                  >
                    {passwordModalState.saving ? "Actualizando…" : "Guardar"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {stationModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur">
            <form
              onSubmit={handleSubmitStation}
              className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-100">
                    {editingStation ? "Editar estación POS" : "Nueva estación POS"}
                  </h3>
                  <p className="text-sm text-slate-400">
                    {editingStation
                      ? "Actualiza el correo y la contraseña de la estación."
                      : "Define un nombre, correo y contraseña para la estación."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeStationModal}
                  className="text-slate-400 hover:text-slate-100 text-xl leading-none"
                  aria-label="Cerrar"
                >
                  ×
                </button>
              </div>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-400">Nombre de estación</span>
                <input
                  value={stationForm.label}
                  onChange={(e) =>
                    setStationForm((prev) => ({ ...prev, label: e.target.value }))
                  }
                  className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                  placeholder="Caja Principal"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-400">Correo de estación</span>
                <input
                  type="email"
                  value={stationForm.email}
                  onChange={(e) =>
                    setStationForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                  className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                  placeholder="caja1@kensar.com"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-400">
                  Contraseña de estación
                </span>
                <input
                  type="password"
                  value={stationForm.password}
                  onChange={(e) =>
                    setStationForm((prev) => ({ ...prev, password: e.target.value }))
                  }
                  className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                  placeholder={editingStation ? "Deja vacío para no cambiar" : "Minimo 6 caracteres"}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-400">Confirma la contraseña</span>
                <input
                  type="password"
                  value={stationForm.confirmPassword}
                  onChange={(e) =>
                    setStationForm((prev) => ({
                      ...prev,
                      confirmPassword: e.target.value,
                    }))
                  }
                  className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                  placeholder={editingStation ? "Solo si cambias la contraseña" : "Repite la contraseña"}
                />
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={stationForm.sendClosureEmail}
                  onChange={(e) =>
                    setStationForm((prev) => ({
                      ...prev,
                      sendClosureEmail: e.target.checked,
                    }))
                  }
                  className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500"
                />
                <span className="text-slate-300">
                  <span className="font-semibold text-slate-100">
                    Enviar reporte de cierre por email
                  </span>
                  <span className="block text-xs text-slate-500 mt-1">
                    Usaremos los destinatarios configurados en &ldquo;Reportes y alertas&rdquo;. Podrás cambiarlo luego desde la lista de estaciones.
                  </span>
                </span>
              </label>
              {stationFormError && (
                <p className="text-xs text-red-400">{stationFormError}</p>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeStationModal}
                  className="px-4 py-2 rounded-md border border-slate-700 text-slate-200 hover:bg-slate-800"
                  disabled={stationSaving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={stationSaving}
                  className="px-4 py-2 rounded-md bg-emerald-500 text-slate-900 font-semibold hover:bg-emerald-400 disabled:opacity-50"
                >
                  {stationSaving
                    ? editingStation
                      ? "Actualizando…"
                      : "Creando…"
                    : editingStation
                      ? "Guardar cambios"
                      : "Crear estación"}
                </button>
              </div>
            </form>
          </div>
        )}

        {stationNoticeModalOpen && stationNoticeTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur">
            <form
              onSubmit={handleSubmitStationNotice}
              className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-100">
                    Enviar aviso a {stationNoticeTarget.label}
                  </h3>
                  <p className="text-sm text-slate-400">
                    El aviso aparecerá como alerta fija dentro del POS hasta que lo
                    retiren desde la estación.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeStationNoticeModal}
                  className="text-slate-400 hover:text-slate-100 text-xl leading-none"
                  aria-label="Cerrar"
                >
                  ×
                </button>
              </div>
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-slate-400">Mensaje del aviso</span>
                <textarea
                  rows={4}
                  value={stationNoticeMessage}
                  onChange={(e) => setStationNoticeMessage(e.target.value)}
                  className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                  placeholder="Ej: Revisar caja antes de cambio de turno."
                />
              </label>
              {stationNoticeError && (
                <p className="text-xs text-red-400">{stationNoticeError}</p>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeStationNoticeModal}
                  className="px-4 py-2 rounded-md border border-slate-700 text-slate-200 hover:bg-slate-800"
                  disabled={stationNoticeSending}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={stationNoticeSending}
                  className="px-4 py-2 rounded-md bg-amber-400 text-slate-900 font-semibold hover:bg-amber-300 disabled:opacity-50"
                >
                  {stationNoticeSending ? "Enviando…" : "Enviar aviso"}
                </button>
              </div>
            </form>
          </div>
        )}

        <footer className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-5 text-xs text-slate-400 flex flex-col gap-2">
          <p className="font-semibold text-slate-200">Próximas integraciones</p>
          <p>
            Este módulo queda listo para conectarse con el backend. Cuando agregues
            los endpoints, solo tendrás que asegurarte de retornar los campos
            definidos en la API y activar las cargas reales de logo y temas.
          </p>
        </footer>
      </div>
    </main>
  );
}

export const POS_STATION_STORAGE_KEY = "metrik_pos_station";
export const POS_MODE_STORAGE_KEY = "metrik_pos_mode";
export const POS_DEVICE_ID_KEY = "metrik_pos_device_id";
export const POS_DEVICE_LABEL_KEY = "metrik_pos_device_label";
const POS_STATION_COOKIE = "metrik_pos_station";
const POS_DEVICE_ID_COOKIE = "metrik_pos_device_id";
const POS_DEVICE_LABEL_COOKIE = "metrik_pos_device_label";

const readCookie = (name: string): string | null => {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split(";")
    .map((chunk) => chunk.trim())
    .find((cookie) => cookie.startsWith(`${name}=`));
  if (!match) return null;
  return decodeURIComponent(match.split("=").slice(1).join("="));
};

const resolveCookieDomain = (): string => {
  if (typeof window === "undefined") return "";
  const host = window.location.hostname;
  if (!host || host === "localhost" || /^[\d.]+$/.test(host)) return "";
  const parts = host.split(".").filter(Boolean);
  if (parts.length < 2) return "";
  return `.${parts.slice(-2).join(".")}`;
};

const writeCookie = (name: string, value: string) => {
  if (typeof document === "undefined") return;
  const maxAge = 60 * 60 * 24 * 365;
  const domain = resolveCookieDomain();
  const domainPart = domain ? `; domain=${domain}` : "";
  document.cookie = `${name}=${encodeURIComponent(
    value
  )}; path=/; max-age=${maxAge}; samesite=lax${domainPart}`;
};

const clearCookie = (name: string) => {
  if (typeof document === "undefined") return;
  const domain = resolveCookieDomain();
  const domainPart = domain ? `; domain=${domain}` : "";
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax${domainPart}`;
};

export type PosStationAccess = {
  id: string;
  email?: string | null;
  label?: string;
};

export type PosAccessMode = "station" | "web";
export type PosStationPrinterConfig = {
  mode: "browser" | "qz-tray";
  printerName: string;
  width: "58mm" | "80mm";
  autoOpenDrawer: boolean;
  showDrawerButton: boolean;
};

const POS_WEB_STATION: PosStationAccess = {
  id: "pos-web",
  email: "web@metrik.app",
  label: "POS Web",
};
export function formatPosDisplayName(
  access: PosStationAccess | null | undefined,
  fallback: string
) {
  const raw =
    access?.label?.trim() ||
    access?.email?.trim();
  if (!raw) return fallback;
  const normalized = raw.replace(/^(pos\s+)+/i, "").trim();
  return normalized ? `POS ${normalized}` : fallback;
}

export function getPosStationAccess(): PosStationAccess | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(POS_STATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed && typeof parsed.id === "string") {
      const access: PosStationAccess = {
        id: parsed.id,
        label: typeof parsed.label === "string" ? parsed.label : undefined,
        email: typeof parsed.email === "string" ? parsed.email : undefined,
      };
      return access;
    }
  } catch (err) {
    console.warn("No se pudo leer la estación POS almacenada", err);
  }
  const cookieRaw = readCookie(POS_STATION_COOKIE);
  if (!cookieRaw) return null;
  try {
    const parsed = JSON.parse(cookieRaw);
    if (typeof parsed === "object" && parsed && typeof parsed.id === "string") {
      const access: PosStationAccess = {
        id: parsed.id,
        label: typeof parsed.label === "string" ? parsed.label : undefined,
        email: typeof parsed.email === "string" ? parsed.email : undefined,
      };
      window.localStorage.setItem(
        POS_STATION_STORAGE_KEY,
        JSON.stringify(access)
      );
      return access;
    }
  } catch (err) {
    console.warn("No se pudo leer la estación POS desde cookie", err);
  }
  return null;
}

export function setPosStationAccess(access: PosStationAccess) {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify(access);
  window.localStorage.setItem(POS_STATION_STORAGE_KEY, payload);
  writeCookie(POS_STATION_COOKIE, payload);
}

export function clearPosStationAccess() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(POS_STATION_STORAGE_KEY);
  clearCookie(POS_STATION_COOKIE);
}

export function getOrCreatePosDeviceId(): string {
  if (typeof window === "undefined") return "server-device";
  const existing = window.localStorage.getItem(POS_DEVICE_ID_KEY);
  if (existing) return existing;
  const fromCookie = readCookie(POS_DEVICE_ID_COOKIE);
  if (fromCookie) {
    window.localStorage.setItem(POS_DEVICE_ID_KEY, fromCookie);
    return fromCookie;
  }
  let next = "";
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    next = crypto.randomUUID();
  } else {
    next = `device-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }
  window.localStorage.setItem(POS_DEVICE_ID_KEY, next);
  writeCookie(POS_DEVICE_ID_COOKIE, next);
  return next;
}

export function getOrCreatePosDeviceLabel(): string {
  if (typeof window === "undefined") return "Equipo POS";
  const existing = window.localStorage.getItem(POS_DEVICE_LABEL_KEY);
  if (existing) return existing;
  const fromCookie = readCookie(POS_DEVICE_LABEL_COOKIE);
  if (fromCookie) {
    window.localStorage.setItem(POS_DEVICE_LABEL_KEY, fromCookie);
    return fromCookie;
  }
  const platform = window.navigator?.platform || "Equipo POS";
  const agent = window.navigator?.userAgent || "";
  const isEdge = agent.includes("Edg/");
  const isChrome = agent.includes("Chrome") && !isEdge;
  const isSafari = agent.includes("Safari") && !isChrome && !isEdge;
  const isFirefox = agent.includes("Firefox");
  const browser = isEdge
    ? "Edge"
    : isChrome
      ? "Chrome"
      : isFirefox
        ? "Firefox"
        : isSafari
          ? "Safari"
          : "Navegador";
  const label = `${platform} · ${browser}`;
  window.localStorage.setItem(POS_DEVICE_LABEL_KEY, label);
  writeCookie(POS_DEVICE_LABEL_COOKIE, label);
  return label;
}

export function getStoredPosMode(): PosAccessMode | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(POS_MODE_STORAGE_KEY);
    if (raw === "station" || raw === "web") {
      return raw;
    }
  } catch (err) {
    console.warn("No se pudo leer el modo del POS", err);
  }
  return null;
}

export function setStoredPosMode(mode: PosAccessMode) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(POS_MODE_STORAGE_KEY, mode);
  } catch (err) {
    console.warn("No se pudo almacenar el modo del POS", err);
  }
}

export function clearStoredPosMode() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(POS_MODE_STORAGE_KEY);
}

export function getWebPosStation(): PosStationAccess {
  return POS_WEB_STATION;
}

export function isValidPosMode(value: unknown): value is PosAccessMode {
  return value === "station" || value === "web";
}

export function resolveStationForMode(
  mode: PosAccessMode | null
): PosStationAccess | null {
  if (mode === "web") return getWebPosStation();
  if (mode === "station") return getPosStationAccess();
  return null;
}

export function ensureStoredPosMode(): PosAccessMode {
  if (typeof window === "undefined") {
    return "station";
  }
  const stored = getStoredPosMode();
  if (stored) return stored;
  const fallback = getPosStationAccess() ? "station" : "web";
  setStoredPosMode(fallback);
  return fallback;
}

export function subscribeToPosStationChanges(
  listener: (next: PosStationAccess | null) => void
) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.storageArea !== window.localStorage) return;
    if (event.key && event.key !== POS_STATION_STORAGE_KEY) return;
    listener(getPosStationAccess());
  };

  window.addEventListener("storage", handleStorage);
  return () => window.removeEventListener("storage", handleStorage);
}

type PrinterConfigPayload = {
  printer_mode?: PosStationPrinterConfig["mode"];
  printer_name?: string;
  printer_width?: PosStationPrinterConfig["width"];
  printer_auto_open_drawer?: boolean;
  printer_show_drawer_button?: boolean;
};

export async function fetchPosStationPrinterConfig(
  apiBase: string,
  token: string,
  stationId: string
): Promise<PosStationPrinterConfig | null> {
  const res = await fetch(`${apiBase}/pos/stations/${stationId}/printer-config`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!res.ok) {
    return null;
  }
  const data = (await res.json()) as PrinterConfigPayload;
  if (!data || typeof data !== "object") return null;
  const next: PosStationPrinterConfig = {
    mode: data.printer_mode ?? "qz-tray",
    printerName: data.printer_name ?? "",
    width: data.printer_width ?? "80mm",
    autoOpenDrawer: Boolean(data.printer_auto_open_drawer),
    showDrawerButton:
      data.printer_show_drawer_button !== undefined
        ? Boolean(data.printer_show_drawer_button)
        : true,
  };
  return next;
}

export async function updatePosStationPrinterConfig(
  apiBase: string,
  token: string,
  stationId: string,
  config: PosStationPrinterConfig
) {
  const payload: PrinterConfigPayload = {
    printer_mode: config.mode,
    printer_name: config.printerName.trim(),
    printer_width: config.width,
    printer_auto_open_drawer: config.autoOpenDrawer,
    printer_show_drawer_button: config.showDrawerButton,
  };
  const res = await fetch(`${apiBase}/pos/stations/${stationId}/printer-config`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error("No se pudo guardar la impresora en el servidor.");
  }
}

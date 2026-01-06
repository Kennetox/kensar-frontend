export const POS_STATION_STORAGE_KEY = "metrik_pos_station";
export const POS_MODE_STORAGE_KEY = "metrik_pos_mode";

export type PosStationAccess = {
  id: string;
  email: string;
  label?: string;
};

export type PosAccessMode = "station" | "web";

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
  return raw ? `POS ${raw}` : fallback;
}

export function getPosStationAccess(): PosStationAccess | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(POS_STATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed &&
      typeof parsed.id === "string" &&
      typeof parsed.email === "string"
    ) {
      return parsed;
    }
  } catch (err) {
    console.warn("No se pudo leer la estación POS almacenada", err);
  }
  return null;
}

export function setPosStationAccess(access: PosStationAccess) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    POS_STATION_STORAGE_KEY,
    JSON.stringify(access)
  );
}

export function clearPosStationAccess() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(POS_STATION_STORAGE_KEY);
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

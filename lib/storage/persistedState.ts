const LOCAL_STORAGE_PREFIXES = ["kensar_", "metrik_"];
const SESSION_STORAGE_PREFIXES = ["kensar_", "metrik_"];

const LOCAL_STORAGE_EXCLUDED_KEYS = new Set<string>([
  "kensar_report_favorites",
  "metrik_pos_station",
]);
const SESSION_STORAGE_EXCLUDED_KEYS = new Set<string>();

export const SESSION_GUARD_KEY = "kensar_session_guard_v1";
SESSION_STORAGE_EXCLUDED_KEYS.add(SESSION_GUARD_KEY);

type ClearOptions = {
  preserveSessionKeys?: string[];
  preserveLocalKeys?: string[];
  preserveLocalPrefixes?: string[];
};

function collectKeys(
  storage: Storage,
  prefixes: string[],
  excluded: Set<string>
): string[] {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) continue;
    if (excluded.has(key)) continue;
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      keys.push(key);
    }
  }
  return keys;
}

export function clearPersistedAppState(options?: ClearOptions) {
  if (typeof window === "undefined") return;
  const preserveSessionKeys = options?.preserveSessionKeys ?? [];
  const preserveLocalKeys = options?.preserveLocalKeys ?? [];
  const preserveLocalPrefixes = options?.preserveLocalPrefixes ?? [];
  const sessionExcluded = new Set([
    ...SESSION_STORAGE_EXCLUDED_KEYS,
    ...preserveSessionKeys,
  ]);
  const localExcluded = new Set([
    ...LOCAL_STORAGE_EXCLUDED_KEYS,
    ...preserveLocalKeys,
  ]);

  try {
    const keys = collectKeys(
      window.localStorage,
      LOCAL_STORAGE_PREFIXES,
      localExcluded
    );
    keys.forEach((key) => {
      if (preserveLocalPrefixes.some((prefix) => key.startsWith(prefix))) {
        return;
      }
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    });
  } catch (err) {
    console.warn("No se pudo limpiar el estado local almacenado", err);
  }

  try {
    const keys = collectKeys(
      window.sessionStorage,
      SESSION_STORAGE_PREFIXES,
      sessionExcluded
    );
    keys.forEach((key) => {
      try {
        window.sessionStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    });
  } catch (err) {
    console.warn("No se pudo limpiar el estado de sesión almacenado", err);
  }
}

export function ensureFreshSessionState(options?: ClearOptions) {
  if (typeof window === "undefined") return;
  try {
    const hasGuard = window.sessionStorage.getItem(SESSION_GUARD_KEY);
    if (!hasGuard) {
      clearPersistedAppState(options);
      window.sessionStorage.setItem(
        SESSION_GUARD_KEY,
        new Date().toISOString()
      );
    }
  } catch (err) {
    console.warn("No se pudo preparar la sesión del navegador", err);
  }
}

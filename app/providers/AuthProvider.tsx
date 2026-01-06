"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getApiBase } from "@/lib/api/base";
import {
  clearPersistedAppState,
  ensureFreshSessionState,
} from "@/lib/storage/persistedState";
import {
  AUTH_TRANSFER_STORAGE_KEY,
  consumeAuthTransferSnapshot,
} from "@/lib/auth/sessionTransfer";

type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (
    email: string,
    password: string,
    options?: { stationId?: string; isPosStation?: boolean }
  ) => Promise<void>;
  logout: (reason?: string) => void;
  authHeaders: Record<string, string> | null;
};

type AuthStorageShape = {
  token: string;
  user: AuthUser;
};

export const STORAGE_KEY = "kensar_auth";
export const LOGOUT_REASON_KEY = "kensar_logout_reason";
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const sessionGuardRef = useRef(false);

  const persistAuth = useCallback((payload: AuthStorageShape | null) => {
    if (typeof window === "undefined") return;
    if (payload) {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } else {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  if (typeof window !== "undefined" && !sessionGuardRef.current) {
    ensureFreshSessionState({
      preserveSessionKeys: [LOGOUT_REASON_KEY],
      preserveLocalKeys: [AUTH_TRANSFER_STORAGE_KEY],
    });
    sessionGuardRef.current = true;
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: AuthStorageShape = JSON.parse(stored);
        setToken(parsed.token);
        setUser(parsed.user);
      } else {
        const transfer = consumeAuthTransferSnapshot<AuthUser>();
        if (transfer) {
          setToken(transfer.token);
          setUser(transfer.user);
          persistAuth(transfer);
        }
      }
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.warn("No pudimos leer el estado de auth", err);
    } finally {
      setLoading(false);
    }
  }, [persistAuth]);

  const login = useCallback(
    async (
      email: string,
      password: string,
      options?: { stationId?: string; isPosStation?: boolean }
    ) => {
      const apiBase = getApiBase();
      const endpoint =
        options?.isPosStation && options.stationId
          ? "/auth/pos-login"
          : "/auth/login";
      const payload = options?.isPosStation && options.stationId
        ? { station_id: options.stationId, pin: password }
        : { email, password };
      const res = await fetch(`${apiBase}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        const error = new Error(
          detail?.detail ?? `Error ${res.status}: credenciales inválidas`
        ) as Error & { status?: number; detail?: string };
        error.status = res.status;
        error.detail = detail?.detail;
        throw error;
      }

      const data = (await res.json()) as {
        token: string;
        user: AuthUser;
      };

      setToken(data.token);
      setUser(data.user);
      persistAuth({ token: data.token, user: data.user });
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(LOGOUT_REASON_KEY);
      }
    },
    [persistAuth]
  );

  const logout = useCallback((reason?: string) => {
    setToken(null);
    setUser(null);
    persistAuth(null);
    if (typeof window !== "undefined") {
      clearPersistedAppState({
        preserveSessionKeys: reason ? [LOGOUT_REASON_KEY] : [],
      });
      if (reason) {
        window.sessionStorage.setItem(LOGOUT_REASON_KEY, reason);
      } else {
        window.sessionStorage.removeItem(LOGOUT_REASON_KEY);
      }
    }
  }, [persistAuth]);

  useEffect(() => {
    if (!token) return;
    if (typeof window === "undefined") return;

    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "visibilitychange"];
    let timerId: number | null = null;

    const resetTimer = () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
      if (document.visibilityState === "hidden") return;
      timerId = window.setTimeout(() => {
        logout("Tu sesión expiró por inactividad. Inicia sesión nuevamente.");
      }, INACTIVITY_TIMEOUT_MS);
    };

    events.forEach((event) => window.addEventListener(event, resetTimer));
    resetTimer();

    return () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
      events.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, [token, logout]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const originalFetch = window.fetch;
    const wrappedFetch: typeof window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (response.status === 401) {
        let requestUrl: string | undefined;
        if (typeof args[0] === "string") {
          requestUrl = args[0];
        } else if (args[0] instanceof Request) {
          requestUrl = args[0].url;
        }
        if (!requestUrl || !requestUrl.includes("/auth/login")) {
          logout("Tu sesión expiró. Ingresa nuevamente.");
        }
      }
      return response;
    };
    window.fetch = wrappedFetch;
    return () => {
      window.fetch = originalFetch;
    };
  }, [logout]);

  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : null),
    [token]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      loading,
      login,
      logout,
      authHeaders,
    }),
    [user, token, loading, login, logout, authHeaders]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  }
  return ctx;
}

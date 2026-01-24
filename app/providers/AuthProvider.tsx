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
import { useRouter } from "next/navigation";
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
  avatar_url?: string | null;
  birth_date?: string | null;
  location?: string | null;
  bio?: string | null;
  phone?: string | null;
};

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (
    email: string,
    password: string,
    options?: {
      stationId?: string;
      isPosStation?: boolean;
      deviceId?: string;
      deviceLabel?: string;
    }
  ) => Promise<void>;
  logout: (reason?: string) => void;
  authHeaders: Record<string, string> | null;
};

type AuthStorageShape = {
  token: string;
  user: AuthUser;
  sessionType?: "web" | "pos";
};

export const STORAGE_KEY = "kensar_auth";
export const LOGOUT_REASON_KEY = "kensar_logout_reason";
const WEB_INACTIVITY_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutos
const SESSION_IDLE_CHECK_MS = 10 * 60 * 1000; // 10 minutos

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionType, setSessionType] = useState<"web" | "pos" | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const sessionGuardRef = useRef(false);
  const lastActivityRef = useRef(Date.now());
  const lastSessionTypeRef = useRef<"web" | "pos">("web");

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
      preserveLocalPrefixes: ["kensar_pos_grid_zoom"],
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
        setSessionType(parsed.sessionType ?? "web");
      } else {
        const transfer = consumeAuthTransferSnapshot<AuthUser>();
        if (transfer) {
          setToken(transfer.token);
          setUser(transfer.user);
          setSessionType("web");
          persistAuth({ token: transfer.token, user: transfer.user, sessionType: "web" });
        }
      }
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.warn("No pudimos leer el estado de auth", err);
    } finally {
      setLoading(false);
    }
  }, [persistAuth, token]);

  useEffect(() => {
    if (sessionType) {
      lastSessionTypeRef.current = sessionType;
    }
  }, [sessionType]);

  const login = useCallback(
    async (
      email: string,
      password: string,
      options?: {
        stationId?: string;
        isPosStation?: boolean;
        deviceId?: string;
        deviceLabel?: string;
      }
    ) => {
      const apiBase = getApiBase();
      const endpoint =
        options?.isPosStation && options.stationId
          ? "/auth/pos-login"
          : "/auth/login";
      const payload = options?.isPosStation && options.stationId
        ? {
            station_id: options.stationId,
            pin: password,
            device_id: options.deviceId,
            device_label: options.deviceLabel,
          }
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
        expires_at?: string | null;
      };

      const nextSessionType = options?.isPosStation ? "pos" : "web";
      setToken(data.token);
      setUser(data.user);
      setSessionType(nextSessionType);
      persistAuth({ token: data.token, user: data.user, sessionType: nextSessionType });
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(LOGOUT_REASON_KEY);
      }
    },
    [persistAuth]
  );

  const logout = useCallback((reason?: string) => {
    const redirectTarget = sessionType ?? lastSessionTypeRef.current ?? "web";
    if (token) {
      try {
        void fetch(`${getApiBase()}/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // ignore best-effort logout
      }
    }
    setToken(null);
    setUser(null);
    setSessionType(null);
    persistAuth(null);
    if (typeof window !== "undefined") {
      clearPersistedAppState({
        preserveSessionKeys: reason ? [LOGOUT_REASON_KEY] : [],
        preserveLocalPrefixes: ["kensar_pos_grid_zoom"],
      });
      if (reason) {
        window.sessionStorage.setItem(LOGOUT_REASON_KEY, reason);
      } else {
        window.sessionStorage.removeItem(LOGOUT_REASON_KEY);
      }
      const nextPath = redirectTarget === "pos" ? "/login-pos" : "/login";
      if (window.location.pathname !== nextPath) {
        window.location.assign(nextPath);
      } else {
        router.replace(nextPath);
      }
    }
  }, [persistAuth, router, sessionType, token]);

  useEffect(() => {
    if (!token || sessionType !== "web") return;
    if (typeof window === "undefined") return;

    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "visibilitychange"];
    let timerId: number | null = null;

    const resetTimer = () => {
      lastActivityRef.current = Date.now();
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
      if (document.visibilityState === "hidden") return;
      timerId = window.setTimeout(() => {
        logout("Tu sesión expiró por inactividad. Inicia sesión nuevamente.");
      }, WEB_INACTIVITY_TIMEOUT_MS);
    };

    events.forEach((event) => window.addEventListener(event, resetTimer));
    resetTimer();

    return () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
      events.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, [token, sessionType, logout]);

  useEffect(() => {
    if (!token) return;
    if (typeof window === "undefined") return;

    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "visibilitychange"];
    const markActivity = () => {
      lastActivityRef.current = Date.now();
    };
    events.forEach((event) => window.addEventListener(event, markActivity));
    return () => {
      events.forEach((event) => window.removeEventListener(event, markActivity));
    };
  }, [token]);

  const checkSessionStatus = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${getApiBase()}/auth/session-status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        logout("Tu sesión expiró. Ingresa nuevamente.");
        return;
      }
      const data = (await res.json()) as { status?: string; reason?: string | null };
      if (data.status === "active") return;
      if (data.reason === "replaced") {
        logout("Se inició sesión con este usuario en otro lugar.");
        return;
      }
      if (data.reason === "inactive") {
        logout("Tu sesión expiró por inactividad. Inicia sesión nuevamente.");
        return;
      }
      logout("Tu sesión expiró. Ingresa nuevamente.");
    } catch {
      // ignore status check failures
    }
  }, [token, logout]);

  useEffect(() => {
    if (!token) return;
    if (typeof window === "undefined") return;
    let timerId: number | null = null;

    const scheduleCheck = () => {
      timerId = window.setTimeout(async () => {
        const idleMs = Date.now() - lastActivityRef.current;
        if (idleMs >= SESSION_IDLE_CHECK_MS) {
          await checkSessionStatus();
        }
        scheduleCheck();
      }, SESSION_IDLE_CHECK_MS);
    };

    scheduleCheck();

    return () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
    };
  }, [token, checkSessionStatus]);

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
        const isAuthEndpoint =
          requestUrl &&
          (requestUrl.includes("/auth/login") ||
            requestUrl.includes("/auth/pos-login") ||
            requestUrl.includes("/auth/session-status"));
        if (!isAuthEndpoint) {
          await checkSessionStatus();
        }
      }
      return response;
    };
    window.fetch = wrappedFetch;
    return () => {
      window.fetch = originalFetch;
    };
  }, [checkSessionStatus]);

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

"use client";

import { useEffect, useRef, useState } from "react";
import { getApiBase } from "@/lib/api/base";

type HealthState = "healthy" | "degraded" | "maintenance" | "connection";
type PreviewState = Exclude<HealthState, "healthy">;
type ReadyPayload = {
  status?: string;
  maintenance?: boolean;
  message?: string;
  retry_after_seconds?: number;
};

const POLL_MS = 5000;
const REQUEST_TIMEOUT_MS = 2500;
const FAILURES_TO_OPEN = 1;
const NETWORK_FAILURES_TO_OPEN = 2;
const SUCCESSES_TO_CLOSE = 2;

function getPreviewState(): PreviewState | null {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("systemStatusPreview");
  return value === "maintenance" || value === "degraded" || value === "connection" ? value : null;
}

export function SystemStatusProvider() {
  const nativePos =
    typeof window !== "undefined" &&
    Boolean((window as Window & { kensar?: { isNativePos?: boolean } }).kensar?.isNativePos);
  const [, setState] = useState<HealthState>("healthy");
  const [displayState, setDisplayState] = useState<HealthState>("healthy");
  const [bannerVisible, setBannerVisible] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const [previewState, setPreviewState] = useState<PreviewState | null>(null);
  const stateRef = useRef<HealthState>("healthy");
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (nativePos) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let revealTimer: ReturnType<typeof setTimeout> | null = null;
    let consecutiveFailures = 0;
    let consecutiveNetworkFailures = 0;
    let consecutiveSuccesses = 0;

    const updateBanner = (nextState: HealthState) => {
      if (nextState !== "healthy") {
        if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
        setDisplayState(nextState);
        revealTimer = setTimeout(() => {
          if (active) setBannerVisible(true);
        }, 0);
        return;
      }

      setBannerVisible(false);
      bannerTimerRef.current = setTimeout(() => {
        if (active) setDisplayState("healthy");
      }, 320);
    };

    const preview = getPreviewState();
    if (preview) {
      setPreviewState(preview);
      stateRef.current = preview;
      setState(preview);
      updateBanner(preview);
      setLastCheckedAt(Date.now());
      return () => {
        active = false;
        if (revealTimer) clearTimeout(revealTimer);
        if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
      };
    }

    const schedule = () => {
      if (active) timer = setTimeout(runCheck, POLL_MS);
    };

    const runCheck = async () => {
      let nextState: HealthState | null = null;
      let apiBase = "";
      try {
        apiBase = getApiBase();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
          const response = await fetch(`${apiBase}/readyz`, {
            method: "GET",
            cache: "no-store",
            signal: controller.signal,
          });
          const payload = (await response.json().catch(() => null)) as ReadyPayload | null;
          setLastCheckedAt(Date.now());
          consecutiveNetworkFailures = 0;

          if (payload?.status === "maintenance" || payload?.maintenance === true) {
            nextState = "maintenance";
            consecutiveFailures += 1;
            consecutiveSuccesses = 0;
          } else if (response.ok) {
            consecutiveFailures = 0;
            consecutiveSuccesses += 1;
            if (consecutiveSuccesses >= SUCCESSES_TO_CLOSE) nextState = "healthy";
          } else {
            consecutiveFailures += 1;
            consecutiveSuccesses = 0;
            if (consecutiveFailures >= FAILURES_TO_OPEN) nextState = "degraded";
          }
        } finally {
          clearTimeout(timeout);
        }
      } catch {
        consecutiveNetworkFailures += 1;
        consecutiveSuccesses = 0;
        if (consecutiveNetworkFailures >= NETWORK_FAILURES_TO_OPEN) {
          // If maintenance was already announced, preserve that message while
          // the process restarts instead of downgrading it to an incident.
          nextState = stateRef.current === "maintenance" ? "maintenance" : "connection";
        }
      }

      if (active && nextState) {
        stateRef.current = nextState;
        setState(nextState);
        updateBanner(nextState);
      }
      schedule();
    };

    void runCheck();

    const onOnline = () => {
      void runCheck();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void runCheck();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      if (revealTimer) clearTimeout(revealTimer);
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [nativePos]);

  if (nativePos || displayState === "healthy") return null;

  const isMaintenance = displayState === "maintenance";
  const isConnection = displayState === "connection";
  const title = isMaintenance
    ? "Actualización en curso"
    : isConnection
      ? "Conexión a internet inestable"
      : "Problema del servicio";
  const message = isMaintenance
    ? "Estamos aplicando mejoras a Metrik. El sistema volverá a estar disponible en unos minutos."
    : isConnection
      ? "No logramos comunicarnos con Metrik. Revisa la conexión a internet de este equipo."
      : "Metrik está teniendo dificultades internas. El equipo técnico ya está revisando el problema.";
  const detail = isMaintenance
    ? "Puedes mantener esta ventana abierta; reintentaremos automáticamente."
    : isConnection
      ? "Comprueba el Wi-Fi o el cable de red; reintentaremos automáticamente."
      : "Evita repetir operaciones mientras restablecemos el servicio.";

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[9999] flex justify-center px-3 pt-3">
      <div
        role="alert"
        aria-live="assertive"
        className={`system-status-banner pointer-events-auto w-full max-w-3xl rounded-xl border px-4 py-3 shadow-xl ${
          bannerVisible ? "system-status-banner-visible" : "system-status-banner-exiting"
        } ${
          isMaintenance
            ? "border-amber-200 bg-amber-50 text-amber-950"
            : isConnection
              ? "border-sky-200 bg-sky-50 text-sky-950"
              : "border-red-200 bg-red-50 text-red-950"
        }`}
      >
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
              isMaintenance
                ? "bg-amber-200 text-amber-800"
                : isConnection
                  ? "bg-sky-200 text-sky-800"
                  : "bg-red-200 text-red-800"
            }`}
            aria-hidden="true"
          >
            {isMaintenance ? (
              "↻"
            ) : isConnection ? (
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M2 8.8a15.4 15.4 0 0 1 20 0" />
                <path d="M5 12.8a10.7 10.7 0 0 1 8-2.7" />
                <path d="M8.5 16.2a5.6 5.6 0 0 1 2.7-.9" />
                <path d="m3 3 18 18" />
              </svg>
            ) : (
              "!"
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-sm font-bold">{title}</p>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${
                  isMaintenance
                    ? "bg-amber-200/70 text-amber-900"
                    : isConnection
                      ? "bg-sky-200/70 text-sky-900"
                      : "bg-red-200/70 text-red-900"
                }`}
              >
                {isMaintenance ? "Mantenimiento" : isConnection ? "Conexión" : "Incidente"}
              </span>
              {previewState ? (
                <span className="rounded-full bg-slate-900/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]">
                  Vista de prueba
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-sm leading-5">{message}</p>
            <p className="mt-1 text-xs opacity-75">{detail}</p>
            <p className="mt-1 text-[11px] opacity-60">
              {lastCheckedAt ? `Última comprobación: ${formatStatusTime(lastCheckedAt)}` : "Comprobando el servicio..."}
              <span className="ml-1 inline-flex items-center gap-1">
                <span
                  className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current/25 border-t-current"
                  aria-hidden="true"
                />
                Reintentando automáticamente
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatStatusTime(timestamp: number) {
  return new Intl.DateTimeFormat("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp);
}

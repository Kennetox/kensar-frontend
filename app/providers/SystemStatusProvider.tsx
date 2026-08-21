"use client";

import { useEffect, useRef, useState } from "react";
import { getApiBase } from "@/lib/api/base";

type HealthState = "healthy" | "degraded" | "maintenance";
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
const SUCCESSES_TO_CLOSE = 2;

function getPreviewState(): PreviewState | null {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("systemStatusPreview");
  return value === "maintenance" || value === "degraded" ? value : null;
}

export function SystemStatusProvider() {
  const nativePos =
    typeof window !== "undefined" &&
    Boolean((window as Window & { kensar?: { isNativePos?: boolean } }).kensar?.isNativePos);
  const [state, setState] = useState<HealthState>("healthy");
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const [previewState, setPreviewState] = useState<PreviewState | null>(null);
  const stateRef = useRef<HealthState>("healthy");

  useEffect(() => {
    if (nativePos) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let consecutiveFailures = 0;
    let consecutiveSuccesses = 0;

    const preview = getPreviewState();
    if (preview) {
      setPreviewState(preview);
      stateRef.current = preview;
      setState(preview);
      setLastCheckedAt(Date.now());
      return () => {
        active = false;
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
        consecutiveFailures += 1;
        consecutiveSuccesses = 0;
        if (consecutiveFailures >= FAILURES_TO_OPEN) {
          // If maintenance was already announced, preserve that message while
          // the process restarts instead of downgrading it to an incident.
          nextState = stateRef.current === "maintenance" ? "maintenance" : "degraded";
        }
      }

      if (active && nextState) {
        stateRef.current = nextState;
        setState(nextState);
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
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [nativePos]);

  if (nativePos || state === "healthy") return null;

  const isMaintenance = state === "maintenance";
  const title = isMaintenance ? "Actualización en curso" : "Problema de conexión";
  const message = isMaintenance
    ? "Estamos aplicando mejoras a Metrik. El sistema volverá a estar disponible en unos minutos."
    : "Metrik no está respondiendo correctamente. El equipo técnico ya está revisando el problema.";
  const detail = isMaintenance
    ? "Puedes mantener esta ventana abierta; reintentaremos automáticamente."
    : "Evita repetir operaciones mientras restablecemos el servicio.";

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[9999] flex justify-center px-3 pt-3">
      <div
        role="alert"
        aria-live="assertive"
        className={`pointer-events-auto w-full max-w-3xl rounded-xl border px-4 py-3 shadow-xl ${
          isMaintenance
            ? "border-amber-200 bg-amber-50 text-amber-950"
            : "border-red-200 bg-red-50 text-red-950"
        }`}
      >
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
              isMaintenance ? "bg-amber-200 text-amber-800" : "bg-red-200 text-red-800"
            }`}
            aria-hidden="true"
          >
            {isMaintenance ? "↻" : "!"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-sm font-bold">{title}</p>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${
                  isMaintenance ? "bg-amber-200/70 text-amber-900" : "bg-red-200/70 text-red-900"
                }`}
              >
                {isMaintenance ? "Mantenimiento" : "Incidente"}
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
              {" · Reintentando automáticamente"}
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

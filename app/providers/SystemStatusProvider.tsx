"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getApiBase } from "@/lib/api/base";

type HealthState = "healthy" | "degraded" | "maintenance";

const POLL_MS = 30000;
const REQUEST_TIMEOUT_MS = 5000;
const FAILURES_TO_OPEN = 3;
const SUCCESSES_TO_CLOSE = 2;
const MIN_DEGRADED_SECONDS = 20;

export function SystemStatusProvider() {
  const [state, setState] = useState<HealthState>("healthy");
  const consecutiveFailures = useRef(0);
  const consecutiveSuccesses = useRef(0);
  const degradedSinceRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (!active) return;
      timer = setTimeout(runCheck, POLL_MS);
    };

    const runCheck = async () => {
      let apiBase = "";
      try {
        apiBase = getApiBase();
      } catch {
        consecutiveFailures.current += 1;
        consecutiveSuccesses.current = 0;
        if (consecutiveFailures.current >= FAILURES_TO_OPEN && active) {
          const now = Date.now();
          if (degradedSinceRef.current == null) {
            degradedSinceRef.current = now;
          }
          const degradedElapsedSeconds = (now - degradedSinceRef.current) / 1000;
          if (degradedElapsedSeconds < MIN_DEGRADED_SECONDS) {
            schedule();
            return;
          }
          setState("degraded");
        }
        schedule();
        return;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const res = await fetch(`${apiBase}/readyz`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });

        if (res.ok) {
          consecutiveFailures.current = 0;
          consecutiveSuccesses.current += 1;
          degradedSinceRef.current = null;
          if (consecutiveSuccesses.current >= SUCCESSES_TO_CLOSE && active) {
            setState("healthy");
          }
        } else {
          let nextState: HealthState = "degraded";
          const payload = await res.json().catch(() => null);
          if (payload?.status === "maintenance" || payload?.maintenance === true) {
            nextState = "maintenance";
          }

          consecutiveFailures.current += 1;
          consecutiveSuccesses.current = 0;
          const now = Date.now();
          if (degradedSinceRef.current == null) {
            degradedSinceRef.current = now;
          }

          if (nextState === "maintenance" && active) {
            setState("maintenance");
            schedule();
            return;
          }

          if (consecutiveFailures.current >= FAILURES_TO_OPEN && active) {
            const degradedElapsedSeconds = (now - (degradedSinceRef.current || now)) / 1000;
            if (degradedElapsedSeconds < MIN_DEGRADED_SECONDS) {
              schedule();
              return;
            }
            setState(nextState);
          }
        }
      } catch {
        consecutiveFailures.current += 1;
        consecutiveSuccesses.current = 0;
        const now = Date.now();
        if (degradedSinceRef.current == null) {
          degradedSinceRef.current = now;
        }
        if (consecutiveFailures.current >= FAILURES_TO_OPEN && active) {
          const degradedElapsedSeconds = (now - (degradedSinceRef.current || now)) / 1000;
          if (degradedElapsedSeconds < MIN_DEGRADED_SECONDS) {
            schedule();
            return;
          }
          setState("degraded");
        }
      } finally {
        clearTimeout(timeout);
        schedule();
      }
    };

    void runCheck();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const message = useMemo(() => {
    if (state === "maintenance") {
      return "Estamos en mantenimiento temporal. El servicio se restablecera en breve.";
    }
    if (state === "degraded") {
      return "Estamos experimentando intermitencias. Nuestro equipo ya esta trabajando para solucionarlo.";
    }
    return "";
  }, [state]);

  if (state === "healthy") return null;

  const bannerClassName =
    state === "maintenance"
      ? "w-full max-w-5xl rounded-md border border-red-200/40 bg-red-600/95 px-4 py-2 text-center text-sm font-semibold text-white shadow-lg animate-pulse"
      : "w-full max-w-5xl rounded-md border border-red-200/40 bg-red-500/95 px-4 py-2 text-center text-sm font-semibold text-white shadow-lg animate-pulse";

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[9999] flex justify-center px-3 pt-3">
      <div className={bannerClassName}>
        {message}
      </div>
    </div>
  );
}

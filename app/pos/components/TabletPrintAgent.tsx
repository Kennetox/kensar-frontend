"use client";

import { useEffect, useRef } from "react";
import { getApiBase } from "@/lib/api/base";
import {
  getPosStationAccess,
  type PosStationPrinterConfig,
} from "@/lib/api/posStations";

type QzPromiseResolver<T> = (value: T | PromiseLike<T>) => void;
type QzPromiseReject = (reason?: unknown) => void;

type QzClient = {
  websocket: { isActive: () => boolean; connect: () => Promise<void> };
  configs: {
    create: (printer: string, options?: Record<string, unknown>) => unknown;
  };
  print: (config: unknown, data: unknown) => Promise<void>;
  security?: {
    setCertificatePromise: (
      promise: (resolve: QzPromiseResolver<string>, reject: QzPromiseReject) => void
    ) => void;
    setSignaturePromise: (
      promise: (
        toSign: string
      ) => (resolve: QzPromiseResolver<string>, reject: QzPromiseReject) => void
    ) => void;
  };
};

type PrintJobClaim = {
  id: number;
  lease_token: string;
  document_html: string;
};

type NativePosBridge = {
  isNativePos?: boolean;
  getConfig?: () => Promise<{ stationId?: string }>;
  getDeviceInfo?: () => Promise<{ deviceId?: string }>;
};

const POLL_INTERVAL_MS = 2000;
const CONFIG_REFRESH_MS = 60_000;

function isElectronPos() {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window as Window & { kensar?: { isNativePos?: boolean } }).kensar?.isNativePos
  );
}

function loadQzClient(): Promise<QzClient | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const current = (window as Window & { qz?: QzClient }).qz;
  if (current) return Promise.resolve(current);

  return new Promise((resolve) => {
    let existing = document.querySelector(
      "script[data-qz-tray]"
    ) as HTMLScriptElement | null;
    if (existing?.dataset.qzFailed === "1") {
      existing.remove();
      existing = null;
    }
    const script = existing ?? document.createElement("script");
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve((window as Window & { qz?: QzClient }).qz ?? null);
    };
    const fail = () => {
      script.dataset.qzFailed = "1";
      finish();
    };
    const timeout = window.setTimeout(fail, 5_000);
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", fail, { once: true });
    if (!existing) {
      script.src = "https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.js";
      script.async = true;
      script.dataset.qzTray = "1";
      document.head.appendChild(script);
    }
  });
}

export function TabletPrintAgent() {
  const runningRef = useRef(false);

  useEffect(() => {
    if (!isElectronPos()) return;

    const apiBase = getApiBase();
    let stopped = false;
    let timer: number | null = null;
    let qzClient: QzClient | null = null;
    let printerConfig: PosStationPrinterConfig | null = null;
    let printerConfigLoadedAt = 0;
    let stationId = "";
    let deviceId = "";

    const agentHeaders = () => ({ "X-Metrik-Device-Id": deviceId });

    const configureQzSecurity = (client: QzClient) => {
      if (!client.security) return;
      client.security.setCertificatePromise((resolve, reject) => {
        fetch(`${apiBase}/pos/qz/cert`, { credentials: "include" })
          .then((response) => {
            if (!response.ok) throw new Error(`Certificado QZ: ${response.status}`);
            return response.text();
          })
          .then(resolve)
          .catch(reject);
      });
      client.security.setSignaturePromise(
        (toSign) => (resolve, reject) => {
          fetch(
            `${apiBase}/pos/print-agent/qz/sign?station_id=${encodeURIComponent(
              stationId
            )}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", ...agentHeaders() },
              credentials: "include",
              body: JSON.stringify({ data: toSign }),
            }
          )
            .then(async (response) => {
              if (!response.ok) throw new Error(`Firma QZ: ${response.status}`);
              const body = (await response.json()) as { signature?: string };
              if (!body.signature) throw new Error("La API no devolvió la firma QZ");
              return body.signature;
            })
            .then(resolve)
            .catch(reject);
        }
      );
    };

    const reportResult = async (
      job: PrintJobClaim,
      status: "accepted" | "failed",
      error?: string
    ) => {
      const response = await fetch(`${apiBase}/pos/print-jobs/${job.id}/result`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...agentHeaders() },
        credentials: "include",
        body: JSON.stringify({
          station_id: stationId,
          lease_token: job.lease_token,
          status,
          error: error?.slice(0, 500),
        }),
      });
      if (!response.ok) {
        throw new Error(`No se pudo confirmar el trabajo: ${response.status}`);
      }
    };

    const refreshPrinterConfig = async () => {
      if (Date.now() - printerConfigLoadedAt < CONFIG_REFRESH_MS) {
        return printerConfig;
      }
      printerConfigLoadedAt = Date.now();
      const response = await fetch(
        `${apiBase}/pos/print-agent/config?station_id=${encodeURIComponent(
          stationId
        )}`,
        { headers: agentHeaders(), cache: "no-store" }
      );
      if (!response.ok) {
        printerConfigLoadedAt = Date.now() - CONFIG_REFRESH_MS + 5_000;
        printerConfig = null;
        return null;
      }
      const data = (await response.json()) as {
        printer_mode?: PosStationPrinterConfig["mode"];
        printer_name?: string;
        printer_width?: PosStationPrinterConfig["width"];
        printer_auto_open_drawer?: boolean;
        printer_show_drawer_button?: boolean;
      };
      printerConfig = {
        mode: data.printer_mode ?? "qz-tray",
        printerName: data.printer_name ?? "",
        width: data.printer_width ?? "80mm",
        autoOpenDrawer: Boolean(data.printer_auto_open_drawer),
        showDrawerButton: data.printer_show_drawer_button !== false,
      };
      return printerConfig;
    };

    const runOnce = async () => {
      if (stopped || runningRef.current) return;
      runningRef.current = true;
      let nextPollMs = POLL_INTERVAL_MS;
      try {
        const config = await refreshPrinterConfig();
        if (
          !config ||
          config.mode !== "qz-tray" ||
          !config.printerName.trim()
        ) {
          return;
        }

        if (!qzClient) {
          qzClient = await loadQzClient();
          if (!qzClient) return;
        }
        configureQzSecurity(qzClient);
        if (!qzClient.websocket.isActive()) {
          await qzClient.websocket.connect();
        }

        const response = await fetch(
          `${apiBase}/pos/print-agent/jobs/next?station_id=${encodeURIComponent(
            stationId
          )}`,
          { headers: agentHeaders(), credentials: "include", cache: "no-store" }
        );
        if (!response.ok) return;
        const job = (await response.json()) as PrintJobClaim | null;
        if (!job) return;

        try {
          const width = config.width === "58mm" ? 58 : 80;
          const qzConfig = qzClient.configs.create(config.printerName, {
            altPrinting: true,
            units: "mm",
            size: { width },
            margins: { top: 0, right: 0, bottom: 0, left: 0 },
          });
          await qzClient.print(qzConfig, [
            { type: "html", format: "plain", data: job.document_html },
          ]);
          await reportResult(job, "accepted");
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "QZ Tray rechazó el trabajo";
          await reportResult(job, "failed", message).catch(() => undefined);
        }
      } catch (error) {
        nextPollMs = 10_000;
        console.warn("El agente de impresión tablet no pudo sincronizar", error);
      } finally {
        runningRef.current = false;
        if (!stopped) timer = window.setTimeout(runOnce, nextPollMs);
      }
    };

    const start = async () => {
      const bridge = (window as Window & { kensar?: NativePosBridge }).kensar;
      const [nativeConfig, nativeDevice] = await Promise.all([
        bridge?.getConfig?.().catch(() => null),
        bridge?.getDeviceInfo?.().catch(() => null),
      ]);
      stationId = nativeConfig?.stationId?.trim() || getPosStationAccess()?.id || "";
      deviceId = nativeDevice?.deviceId?.trim() || "";
      if (!stopped && stationId && deviceId) void runOnce();
    };

    void start();
    return () => {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
      runningRef.current = false;
    };
  }, []);

  return null;
}

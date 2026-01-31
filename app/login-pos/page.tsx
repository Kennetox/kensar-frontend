"use client";

import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, LOGOUT_REASON_KEY } from "../providers/AuthProvider";
import {
  getPosStationAccess,
  clearPosStationAccess,
  subscribeToPosStationChanges,
  getOrCreatePosDeviceId,
  getOrCreatePosDeviceLabel,
  type PosStationAccess,
  setPosStationAccess,
  setStoredPosMode,
  setPosDeviceId,
  setPosDeviceLabel,
} from "@/lib/api/posStations";

type KensarBridge = {
  kensar?: {
    quitApp?: () => Promise<void>;
    clearConfig?: () => Promise<void>;
    openConfig?: () => Promise<void>;
    getConfig?: () => Promise<{
      stationId?: string | null;
      stationLabel?: string | null;
      stationEmail?: string | null;
    } | null>;
    hasAdminPin?: () => Promise<boolean>;
    setAdminPin?: (pin: string) => Promise<{ ok: boolean; error?: string }>;
    verifyAdminPin?: (pin: string) => Promise<boolean>;
    getZoomFactor?: () => Promise<number>;
    setZoomFactor?: (value: number) => Promise<number>;
    shutdownSystem?: () => Promise<boolean>;
    getDeviceInfo?: () => Promise<{ deviceId?: string; deviceLabel?: string }>;
    getAppVersion?: () => Promise<string>;
    onUpdateStatus?: (handler: (payload: { status?: string }) => void) => void;
  };
};

function PosLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, token, loading } = useAuth();
  const [isClient, setIsClient] = useState(false);
  const [isDesktopApp, setIsDesktopApp] = useState(false);
  const [isWindows, setIsWindows] = useState(false);
  const [adminPinOpen, setAdminPinOpen] = useState(false);
  const [adminPinLabel, setAdminPinLabel] = useState("Ingresa el PIN admin.");
  const [adminPinValue, setAdminPinValue] = useState("");
  const [adminPinError, setAdminPinError] = useState<string | null>(null);
  const [adminPinStage, setAdminPinStage] = useState<"enter" | "confirm">("enter");
  const [adminPinConfirmValue, setAdminPinConfirmValue] = useState("");
  const adminPinResolverRef = useRef<((value: string | null) => void) | null>(null);
  const adminPinFirstRef = useRef<string | null>(null);
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stationError, setStationError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [stationInfo, setStationInfo] = useState<PosStationAccess | null>(null);
  const [timeLabel, setTimeLabel] = useState("");
  const [appZoom, setAppZoom] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const pinInputRef = useRef<HTMLInputElement | null>(null);
  const lastStationIdRef = useRef<string | null>(null);
  const exitMode = searchParams.get("exit") === "kiosk";

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsClient(true);
    const desktopDetected = Boolean((window as Window & KensarBridge).kensar?.quitApp);
    setIsDesktopApp(desktopDetected);
    setIsWindows(/Windows/i.test(navigator.userAgent || ""));
    if (!desktopDetected && !exitMode) {
      router.replace("/login");
    }
    const bridge =
      typeof window !== "undefined"
        ? (window as Window & KensarBridge)
        : null;
    if (bridge?.kensar?.getAppVersion) {
      bridge.kensar
        .getAppVersion()
        .then((version: string) => {
          if (typeof version === "string") {
            setAppVersion(version);
          }
        })
        .catch(() => {});
    }
    if (bridge?.kensar?.onUpdateStatus) {
      bridge.kensar.onUpdateStatus((payload: { status?: string }) => {
        if (!payload || typeof payload !== "object") return;
        const status = "status" in payload ? String(payload.status) : null;
        if (!status) return;
        if (status === "checking") setUpdateStatus("Buscando actualización...");
        else if (status === "available") setUpdateStatus("Actualización disponible.");
        else if (status === "downloading") setUpdateStatus("Descargando actualización...");
        else if (status === "downloaded") setUpdateStatus("Actualización lista. Reinicia la app.");
        else if (status === "error") setUpdateStatus("Error al actualizar.");
        else setUpdateStatus(null);
      });
    }
  }, [exitMode, router]);

  const requestAdminPin = (label: string, requireConfirm = false) => {
    setAdminPinLabel(label);
    setAdminPinValue("");
    setAdminPinConfirmValue("");
    setAdminPinError(null);
    adminPinFirstRef.current = null;
    setAdminPinStage("enter");
    setAdminPinOpen(true);
    return new Promise<string | null>((resolve) => {
      adminPinResolverRef.current = resolve;
      if (requireConfirm) {
        adminPinFirstRef.current = "__require_confirm__";
      }
    });
  };

  const closeAdminPin = (value: string | null) => {
    setAdminPinOpen(false);
    setAdminPinError(null);
    setAdminPinValue("");
    setAdminPinConfirmValue("");
    adminPinFirstRef.current = null;
    const resolver = adminPinResolverRef.current;
    adminPinResolverRef.current = null;
    resolver?.(value);
  };

  const handleAdminPinSubmit = () => {
    const validate = (value: string) => /^\d{4,8}$/.test(value);
    if (adminPinStage === "enter") {
      if (!validate(adminPinValue)) {
        setAdminPinError("PIN inválido. Usa 4 a 8 dígitos.");
        return;
      }
      if (adminPinFirstRef.current === "__require_confirm__") {
        adminPinFirstRef.current = adminPinValue;
        setAdminPinStage("confirm");
        setAdminPinLabel("Confirma el PIN admin.");
        setAdminPinConfirmValue("");
        setAdminPinError(null);
        return;
      }
      closeAdminPin(adminPinValue.trim());
      return;
    }
    if (!validate(adminPinConfirmValue)) {
      setAdminPinError("PIN inválido. Usa 4 a 8 dígitos.");
      return;
    }
    if (adminPinConfirmValue.trim() !== adminPinFirstRef.current) {
      setAdminPinError("Los PIN no coinciden.");
      return;
    }
    closeAdminPin(adminPinConfirmValue.trim());
  };

  useEffect(() => {
    if (!loading && token && !exitMode) {
      router.replace("/pos");
    }
  }, [loading, token, router, exitMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stationIdParam = searchParams.get("station_id");
    if (stationIdParam) {
      setPosStationAccess({
        id: stationIdParam,
        label: searchParams.get("station_label") ?? undefined,
        email: searchParams.get("station_email") ?? undefined,
      });
    }
    const reason = window.sessionStorage.getItem(LOGOUT_REASON_KEY);
    if (reason) {
      setError(reason);
      window.sessionStorage.removeItem(LOGOUT_REASON_KEY);
    }

    const syncStation = () => {
      const cached = getPosStationAccess();
      setStationInfo(cached);
      const nextId = cached?.id ?? null;
      if (lastStationIdRef.current !== nextId) {
        setPin("");
        lastStationIdRef.current = nextId;
      }
    };

    syncStation();

    const hydrateFromDesktop = async () => {
      const bridge =
        typeof window !== "undefined"
          ? (window as Window & KensarBridge)
          : null;
      if (!bridge?.kensar?.getConfig) return;
      try {
        const config = await bridge.kensar.getConfig();
        if (!config?.stationId) return;
        const current = getPosStationAccess();
        if (!current || current.id !== config.stationId) {
          setPosStationAccess({
            id: config.stationId,
            label: config.stationLabel ?? undefined,
            email: config.stationEmail ?? undefined,
          });
          setStoredPosMode("station");
          syncStation();
        }
        if (bridge.kensar.getDeviceInfo) {
          const device = await bridge.kensar.getDeviceInfo();
          if (device?.deviceId) setPosDeviceId(device.deviceId);
          if (device?.deviceLabel) setPosDeviceLabel(device.deviceLabel);
        }
      } catch {
        // ignore hydration failures
      }
    };

    void hydrateFromDesktop();

    const unsubscribe = subscribeToPosStationChanges(() => {
      syncStation();
      setPin("");
      setError(null);
    });

    const focusHandler = () => {
      syncStation();
      void hydrateFromDesktop();
    };
    window.addEventListener("focus", focusHandler);

    return () => {
      unsubscribe();
      window.removeEventListener("focus", focusHandler);
    };
  }, [searchParams]);

  useEffect(() => {
    if (!stationInfo) return;
    const target = pinInputRef.current;
    if (!target) return;
    const id = requestAnimationFrame(() => {
      target.focus();
      target.select();
    });
    return () => cancelAnimationFrame(id);
  }, [stationInfo]);

  useEffect(() => {
    const bridge =
      typeof window !== "undefined"
        ? (window as Window & KensarBridge)
        : null;
    if (bridge?.kensar?.getZoomFactor) {
      bridge.kensar
        .getZoomFactor()
        .then((value) => {
          if (typeof value === "number") setAppZoom(value);
        })
        .catch(() => {});
    }
    const updateTime = () => {
      const now = new Date();
      // Colombia (America/Bogota) is UTC-5 year-round.
      const utcHours = now.getUTCHours();
      const minutes = now.getUTCMinutes();
      const colHours24 = (utcHours + 19) % 24;
      const period = colHours24 >= 12 ? "PM" : "AM";
      const normalized = colHours24 % 12 || 12;
      const padded = minutes < 10 ? `0${minutes}` : `${minutes}`;
      setTimeLabel(`${normalized}:${padded} ${period}`);
    };
    updateTime();
    const interval = window.setInterval(updateTime, 60000);
    return () => window.clearInterval(interval);
  }, []);

  function handleClearStation() {
    const desktopBridge =
      typeof window !== "undefined"
        ? (window as Window & KensarBridge)
        : null;
    if (
      desktopBridge?.kensar?.hasAdminPin &&
      desktopBridge?.kensar?.setAdminPin &&
      desktopBridge?.kensar?.verifyAdminPin
    ) {
      const promptAdminPin = async () => {
        const hasPin = await desktopBridge.kensar!.hasAdminPin!();
        if (!hasPin) {
          const pin = await requestAdminPin(
            "Crea un PIN admin (4-8 dígitos).",
            true
          );
          if (!pin) return false;
          const result = await desktopBridge.kensar!.setAdminPin!(pin);
          if (!result?.ok) {
            if (typeof window !== "undefined") {
              window.alert(result?.error || "No pudimos guardar el PIN admin.");
            }
            return false;
          }
          return true;
        }
        const pin = await requestAdminPin("Ingresa el PIN admin.");
        if (!pin) return false;
        const ok = await desktopBridge.kensar!.verifyAdminPin!(pin);
        if (!ok) {
          if (typeof window !== "undefined") {
            window.alert("PIN admin incorrecto.");
          }
        }
        return ok;
      };

      void promptAdminPin().then((ok) => {
        if (!ok) return;
        if (desktopBridge.kensar?.clearConfig && desktopBridge.kensar?.openConfig) {
          desktopBridge.kensar
            .clearConfig()
            .then(() => desktopBridge.kensar?.openConfig?.())
            .catch((err) => console.error("No pudimos reconfigurar la estación", err));
        }
      });
      return;
    }
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        "Esta acción olvidará la estación configurada en este equipo. ¿Estás seguro de continuar?"
      );
      if (!confirmed) {
        return;
      }
    }
    if (desktopBridge?.kensar?.clearConfig && desktopBridge?.kensar?.openConfig) {
      desktopBridge.kensar
        .clearConfig()
        .then(() => desktopBridge.kensar?.openConfig?.())
        .catch((err) => console.error("No pudimos reconfigurar la estación", err));
      return;
    }
    clearPosStationAccess();
    setStationInfo(null);
    setPin("");
    lastStationIdRef.current = null;
    setError(null);
  }

  const handleShutdown = () => {
    if (!isWindows) {
      if (typeof window !== "undefined") {
        window.alert("Apagar equipo solo está disponible en Windows.");
      }
      return;
    }
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        "Esto apagará el equipo inmediatamente. ¿Deseas continuar?"
      );
      if (!confirmed) return;
    }
    const bridge =
      typeof window !== "undefined"
        ? (window as Window & KensarBridge)
        : null;
    bridge?.kensar?.shutdownSystem?.().catch(() => {});
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stationInfo) {
      setError("Esta estación no está configurada. Solicita soporte.");
      return;
    }
    if (!pin.trim()) {
      setError("Debes ingresar tu PIN.");
      return;
    }
    setError(null);
    setStationError(false);
    setSubmitting(true);
    try {
      let deviceId = getOrCreatePosDeviceId();
      let deviceLabel = getOrCreatePosDeviceLabel();
      const bridge =
        typeof window !== "undefined"
          ? (window as Window & KensarBridge)
          : null;
      if (bridge?.kensar?.getDeviceInfo) {
        const device = await bridge.kensar.getDeviceInfo();
        if (device?.deviceId) {
          deviceId = device.deviceId;
          setPosDeviceId(deviceId);
        }
        if (device?.deviceLabel) {
          deviceLabel = device.deviceLabel;
          setPosDeviceLabel(deviceLabel);
        }
      }
      await login("", pin, {
        stationId: stationInfo.id,
        isPosStation: true,
        posAuthMode: "pin",
        deviceId,
        deviceLabel,
      });
      setStoredPosMode("station");
      router.replace("/pos");
    } catch (err) {
      console.error(err);
      const detail =
        typeof err === "object" && err && "detail" in err
          ? (err as { detail?: string }).detail
          : undefined;
      const status =
        typeof err === "object" && err && "status" in err
          ? (err as { status?: number }).status
          : undefined;

      const stationRemoved = status === 404 || status === 410;

      const detailText =
        typeof detail === "string"
          ? detail
          : err instanceof Error
            ? err.message
            : undefined;
      const lowerDetail = detailText?.toLowerCase() ?? "";

      if (status === 409) {
        setError(
          detail ??
            "Esta estación ya está vinculada a otro equipo. Solicita al administrador que la libere."
        );
      } else if (status === 400 && lowerDetail.includes("estación")) {
        setStationError(true);
        setError(
          "Estación inválida o inactiva. Usa “Cambiar estación” para reconfigurarla."
        );
      } else if (status === 401) {
        setError("PIN inválido o usuario inactivo.");
      } else if (stationRemoved) {
        setError(
          "Esta estación ya no está disponible. Configúrala nuevamente desde el panel."
        );
      } else if (detailText) {
        setError(detailText);
      } else {
        setError("No pudimos iniciar sesión, revisa tu PIN.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const focusPinInput = () => {
    const target = pinInputRef.current;
    if (!target) return;
    requestAnimationFrame(() => {
      target.focus();
      target.setSelectionRange?.(target.value.length, target.value.length);
    });
  };

  const handleDigit = (value: string) => {
    setPin((prev) => {
      const next = `${prev}${value}`;
      return next.slice(0, 8);
    });
    focusPinInput();
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    focusPinInput();
  };

  const handleClearPin = () => {
    setPin("");
    focusPinInput();
  };

  const adjustAppZoom = (delta: number) => {
    const bridge =
      typeof window !== "undefined"
        ? (window as typeof window & {
            kensar?: { setZoomFactor?: (value: number) => Promise<number> };
          })
        : null;
    if (!bridge?.kensar?.setZoomFactor) return;
    setAppZoom((prev) => {
      const next = Number.isFinite(prev ?? 1) ? (prev ?? 1) + delta : 1 + delta;
      bridge.kensar
        ?.setZoomFactor?.(next)
        .then((value) => {
          if (typeof value === "number") setAppZoom(value);
        })
        .catch(() => {});
      return prev ?? 1;
    });
  };

  const handleToggleSettings = () => {
    setSettingsOpen((prev) => !prev);
  };

  return (
    <main className="relative min-h-screen bg-[#0a0f1a] text-slate-100 overflow-hidden">
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
      {isClient && isDesktopApp && (
        <div className="absolute left-6 top-6 z-40 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              const confirmed =
                typeof window === "undefined"
                  ? true
                  : window.confirm("¿Deseas cerrar la app?");
              if (!confirmed) return;
              const bridge =
                typeof window !== "undefined"
                  ? (window as Window & KensarBridge)
                  : null;
              bridge?.kensar?.quitApp?.();
            }}
            className="h-14 w-14 rounded-full border border-white/15 bg-white/10 text-slate-100 shadow-lg backdrop-blur hover:bg-white/20"
            aria-label="Cerrar app"
          >
            <svg
              viewBox="0 0 24 24"
              className="mx-auto h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleShutdown}
            className={`h-14 w-14 rounded-full border text-slate-100 shadow-lg backdrop-blur ${
              isWindows
                ? "border-amber-300/50 bg-amber-400/20 text-amber-100 hover:bg-amber-400/30"
                : "border-slate-600/40 bg-white/10 text-slate-200 hover:bg-white/20"
            }`}
            aria-label="Apagar equipo"
          >
            <svg
              viewBox="0 0 24 24"
              className="mx-auto h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3v9" />
              <path d="M7.5 5.5a7 7 0 1 0 9 0" />
            </svg>
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={handleToggleSettings}
        className="absolute left-6 bottom-6 z-40 h-12 w-12 rounded-full border border-white/10 bg-white/5 text-xl text-slate-200 shadow-lg backdrop-blur hover:bg-white/10"
        aria-label="Abrir ajustes"
      >
        ⚙︎
      </button>
      <div
        className="pointer-events-none absolute inset-0 opacity-45"
        style={{
          backgroundImage:
            "radial-gradient(rgba(148, 163, 184, 0.28) 1.3px, transparent 1.3px)",
          backgroundSize: "20px 20px",
        }}
      />
      <div className="pointer-events-none absolute -top-40 left-[-10%] h-80 w-80 rounded-full bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.22),rgba(10,15,26,0))] blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-20%] right-[-5%] h-96 w-96 rounded-full bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.25),rgba(10,15,26,0))] blur-[90px]" />
      <svg
        className="pointer-events-none absolute -top-10 right-0 h-72 w-96 opacity-45"
        viewBox="0 0 400 260"
        fill="none"
      >
        <circle cx="310" cy="30" r="3" fill="#4cc9f0" />
        <circle cx="360" cy="80" r="2" fill="#4cc9f0" />
        <circle cx="260" cy="110" r="2" fill="#4cc9f0" />
        <circle cx="320" cy="150" r="2" fill="#4cc9f0" />
        <circle cx="210" cy="70" r="2" fill="#4cc9f0" />
        <path
          d="M210 70L310 30L360 80L320 150L260 110Z"
          stroke="rgba(76,201,240,0.4)"
          strokeWidth="1"
        />
      </svg>
      <svg
        className="pointer-events-none absolute -bottom-16 left-0 h-64 w-96 opacity-4"
        viewBox="0 0 400 260"
        fill="none"
      >
        <circle cx="60" cy="200" r="3" fill="#60a5fa" />
        <circle cx="110" cy="150" r="2" fill="#60a5fa" />
        <circle cx="170" cy="220" r="2" fill="#60a5fa" />
        <circle cx="220" cy="170" r="2" fill="#60a5fa" />
        <path
          d="M60 200L110 150L220 170L170 220Z"
          stroke="rgba(96,165,250,0.35)"
          strokeWidth="1"
        />
      </svg>

      <div className="relative w-full min-h-screen">
        {isClient && adminPinOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
            <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-slate-950/90 p-5 shadow-2xl backdrop-blur">
              <p className="text-sm text-slate-200">{adminPinLabel}</p>
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                autoFocus
                value={adminPinStage === "enter" ? adminPinValue : adminPinConfirmValue}
                onChange={(e) =>
                  adminPinStage === "enter"
                    ? setAdminPinValue(e.target.value)
                    : setAdminPinConfirmValue(e.target.value)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAdminPinSubmit();
                  }
                }}
                className="mt-3 w-full rounded-xl border border-slate-700/70 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-300/70"
                placeholder="PIN admin"
              />
              {adminPinError && (
                <p className="mt-2 text-xs text-rose-300">{adminPinError}</p>
              )}
              <div className="mt-4 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => closeAdminPin(null)}
                  className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200 hover:bg-white/10"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleAdminPinSubmit}
                  className="rounded-lg border border-emerald-300/40 bg-emerald-400/20 px-3 py-2 text-xs text-emerald-100 hover:bg-emerald-400/30"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-6 pb-8 pt-24">
          <div className="absolute top-16 left-1/2 flex -translate-x-1/2 items-center gap-8">
            <Image
              src="/branding/metriklogo.png"
              alt="Logo Metrik"
              width={156}
              height={156}
              className="h-32 w-32"
              priority
            />
            <div className="text-left">
              <p className="text-[44px] font-semibold tracking-tight">METRIK POS</p>
              <p className="mt-2 text-[14px] uppercase tracking-[0.6em] text-slate-400">
                Estación de caja
              </p>
            </div>
          </div>

        <div className="relative mt-28 w-full max-w-lg rounded-[30px] bg-gradient-to-br from-white/35 via-white/10 to-white/5 p-[1px] shadow-2xl">
          <div className="relative rounded-[26px] border border-white/15 bg-white/10 px-6 pb-7 pt-16 backdrop-blur-[16px]">
            <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[70%] rounded-[28px] border border-white/25 bg-white/25 p-6 shadow-[0_16px_50px_rgba(0,0,0,0.4)] backdrop-blur">
              <Image
                src="/branding/kensar-logo-moderno.jpg"
                alt="Kensar Electronic"
                width={136}
                height={136}
                className="h-28 w-28 rounded-[20px] bg-white p-2.5 shadow-[0_10px_24px_rgba(0,0,0,0.25)]"
                priority
              />
            </div>

            <div className="text-center">
              <h1 className="text-xl font-semibold">Inicio de sesión</h1>
              <p className="mt-1 text-sm text-slate-300">
                {stationInfo?.label
                  ? `Estación: ${stationInfo.label}`
                  : "Estación no configurada"}
              </p>
              {!stationInfo && (
                <p className="mt-2 text-[11px] text-amber-200/80">
                  Vincula esta estación desde la app de escritorio para
                  continuar.
                </p>
              )}
            </div>

            <form
              onSubmit={handleSubmit}
              className="mt-5 flex flex-col items-center gap-4"
            >
              <label className="flex w-full max-w-[380px] flex-col gap-1 text-xs text-slate-300">
                PIN de usuario
                <div className="relative">
                  <input
                    type={showPin ? "text" : "password"}
                    ref={pinInputRef}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    className="w-full rounded-2xl border border-amber-300/70 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 shadow-inner outline-none focus:border-amber-200"
                    placeholder="PIN de acceso"
                    inputMode="numeric"
                    maxLength={8}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400"
                    onClick={() => setShowPin((prev) => !prev)}
                    aria-label={showPin ? "Ocultar PIN" : "Mostrar PIN"}
                  >
                    {showPin ? "Ocultar" : "Ver"}
                  </button>
                </div>
              </label>

              <div className="grid w-full max-w-[400px] grid-cols-3 gap-4">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    onClick={() => handleDigit(digit)}
                    className="rounded-2xl border border-white/10 bg-white/5 py-4 text-lg font-semibold text-slate-100 shadow-[0_8px_24px_rgba(15,23,42,0.35)] transition hover:border-emerald-400/50 hover:bg-white/10"
                  >
                    {digit}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleClearPin}
                  className="rounded-2xl border border-white/10 bg-white/5 py-4 text-sm font-semibold text-slate-300 transition hover:border-rose-400/50 hover:bg-rose-500/10"
                >
                  Limpiar
                </button>
                <button
                  type="button"
                  onClick={() => handleDigit("0")}
                  className="rounded-2xl border border-white/10 bg-white/5 py-4 text-lg font-semibold text-slate-100 transition hover:border-emerald-400/50 hover:bg-white/10"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={handleBackspace}
                  className="rounded-2xl border border-white/10 bg-white/5 py-4 text-sm font-semibold text-slate-300 transition hover:border-amber-400/50 hover:bg-amber-500/10"
                >
                  Borrar
                </button>
              </div>

              {error && (
                <div className="w-full max-w-[380px] rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-100">
                  <p>{error}</p>
                  {stationError && (
                    <button
                      type="button"
                      onClick={handleClearStation}
                      className="mt-2 text-[11px] font-semibold text-rose-200 underline-offset-2 hover:underline"
                    >
                      Cambiar estación
                    </button>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !stationInfo}
                className="w-full max-w-[400px] rounded-2xl bg-gradient-to-r from-emerald-400 to-emerald-500 px-5 py-4 text-base font-semibold text-slate-900 shadow-[0_0_24px_rgba(16,185,129,0.45)] transition hover:scale-[1.01] disabled:opacity-50"
              >
                {submitting ? "Validando..." : "Entrar al POS"}
              </button>
            </form>
          </div>
        </div>

        </div>

        <footer className="absolute bottom-6 left-0 right-0 mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-3 px-8 text-[13px] text-slate-400">
          <span className="text-[11px] text-slate-500">
            {appVersion ? `v${appVersion}` : ""}
          </span>
          <div className="flex items-center gap-3 text-base text-slate-200">
            <span className="font-semibold tracking-wide">{timeLabel}</span>
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.9)]" />
            <span className="text-slate-300">Online</span>
          </div>
          <span className="text-[11px] text-slate-500">
            {updateStatus ?? ""}
          </span>
        </footer>

        <>
          <button
            type="button"
            aria-label="Cerrar ajustes"
            onClick={() => setSettingsOpen(false)}
            className={`absolute inset-0 z-30 cursor-default transition-opacity duration-150 ${
              settingsOpen ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          />
          <div
            className={`absolute left-6 bottom-20 z-40 w-64 origin-bottom-left rounded-2xl border border-white/10 bg-slate-950/95 p-4 text-xs text-slate-200 shadow-2xl backdrop-blur transition-all duration-150 ${
              settingsOpen
                ? "translate-y-0 scale-100 opacity-100"
                : "pointer-events-none translate-y-2 scale-95 opacity-0"
            }`}
          >
            <div className="text-[11px] uppercase tracking-wide text-slate-500">
              Configuración rápida
            </div>
            {appZoom !== null && (
              <div className="mt-3 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <span>Zoom</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => adjustAppZoom(-0.05)}
                    className="h-7 w-7 rounded-full bg-white/10 text-slate-200 hover:bg-white/20"
                  >
                    –
                  </button>
                  <span className="min-w-[36px] text-center">
                    {Math.round(appZoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => adjustAppZoom(0.05)}
                    className="h-7 w-7 rounded-full bg-white/10 text-slate-200 hover:bg-white/20"
                  >
                    +
                  </button>
                </div>
              </div>
            )}
            {stationInfo && (
              <button
                type="button"
                onClick={() => {
                  setSettingsOpen(false);
                  handleClearStation();
                }}
                className="mt-3 w-full rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-left text-rose-100 hover:bg-rose-500/20"
              >
                Cambiar estación
              </button>
            )}
            {isDesktopApp && (
              <button
                type="button"
                onClick={() => {
                  setSettingsOpen(false);
                  handleShutdown();
                }}
                className={`mt-3 w-full rounded-xl border px-3 py-2 text-left ${
                  isWindows
                    ? "border-amber-300/40 bg-amber-400/10 text-amber-100 hover:bg-amber-400/20"
                    : "border-slate-600/40 bg-slate-500/10 text-slate-300 hover:bg-slate-500/20"
                }`}
              >
                <span className="flex items-center gap-2">
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
                    <path d="M12 3v9" />
                    <path d="M7.5 5.5a7 7 0 1 0 9 0" />
                  </svg>
                  <span>Apagar equipo</span>
                </span>
                {!isWindows && (
                  <span className="mt-1 block text-[11px] text-slate-400">
                    Solo Windows
                  </span>
                )}
              </button>
            )}
          </div>
        </>
      </div>
    </main>
  );
}

export default function PosLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white text-slate-600 flex items-center justify-center">
          Cargando acceso POS…
        </div>
      }
    >
      <PosLoginContent />
    </Suspense>
  );
}

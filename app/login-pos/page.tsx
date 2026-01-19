"use client";

import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
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
  setStoredPosMode,
} from "@/lib/api/posStations";

function PosLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, token, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [stationInfo, setStationInfo] = useState<PosStationAccess | null>(null);
  const [exitFailed, setExitFailed] = useState(false);
  const pinInputRef = useRef<HTMLInputElement | null>(null);
  const isKioskMode = !!stationInfo;
  const exitMode = searchParams.get("exit") === "kiosk";

  useEffect(() => {
    if (!loading && token && !exitMode) {
      router.replace("/pos");
    }
  }, [loading, token, router, exitMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reason = window.sessionStorage.getItem(LOGOUT_REASON_KEY);
    if (reason) {
      setError(reason);
      window.sessionStorage.removeItem(LOGOUT_REASON_KEY);
    }

    const syncStation = () => {
      const cached = getPosStationAccess();
      setStationInfo(cached);
      setEmail(cached?.email ?? "");
      if (!cached) {
        setPin("");
      }
    };

    syncStation();

    const unsubscribe = subscribeToPosStationChanges(() => {
      syncStation();
      setPin("");
      setError(null);
    });

    const focusHandler = () => syncStation();
    window.addEventListener("focus", focusHandler);

    return () => {
      unsubscribe();
      window.removeEventListener("focus", focusHandler);
    };
  }, []);

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

  function handleClearStation() {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        "Esta acción olvidará la estación configurada en este equipo. ¿Estás seguro de continuar?"
      );
      if (!confirmed) {
        return;
      }
    }
    clearPosStationAccess();
    setStationInfo(null);
    setEmail("");
    setError(null);
  }

  const handleExitKiosk = () => {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        "¿Deseas cerrar la app y salir del modo kiosk?"
      );
      if (!confirmed) return;
    }
    if (typeof document !== "undefined" && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    if (typeof window !== "undefined") {
      try {
        window.close();
      } catch {
        // ignore close failures
      }
      window.setTimeout(() => {
        if (!window.closed) {
          setExitFailed(true);
        }
      }, 200);
    }
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stationInfo) {
      setError("Esta estación no está configurada. Solicita soporte.");
      return;
    }
    if (!pin.trim()) {
      setError("Debes ingresar tu PIN de caja.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await login(email, pin, {
        stationId: stationInfo.id,
        isPosStation: true,
        deviceId: getOrCreatePosDeviceId(),
        deviceLabel: getOrCreatePosDeviceLabel(),
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

      const stationRemoved =
        status === 404 ||
        status === 410 ||
        (typeof detail === "string" &&
          detail.toLowerCase().includes("estación"));

      if (status === 409) {
        setError(
          detail ??
            "Esta estación ya está vinculada a otro equipo. Solicita al administrador que la libere."
        );
      } else if (stationRemoved) {
        handleClearStation();
        setError(
          "Esta estación ya no está disponible. Configúrala nuevamente desde el panel."
        );
      } else if (err instanceof Error) {
        setError(err.message || "Ocurrió un error inesperado.");
      } else if (typeof detail === "string") {
        setError(detail);
      } else {
        setError("No pudimos iniciar sesión, revisa tu PIN.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      className="relative min-h-screen bg-cover bg-center overflow-x-hidden"
      style={{
        backgroundImage:
          "url('https://images.unsplash.com/photo-1556742044-3c52d6e88c62?auto=format&fit=crop&q=80&w=2070')",
      }}
    >
      <div className="min-h-screen bg-white/70 backdrop-blur-sm">
        <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-12 sm:px-6 lg:px-12">
          <nav className="flex items-center justify-between rounded-2xl bg-white/85 px-8 py-5 shadow-lg">
            <div className="flex items-center gap-3">
              <Image
                src="/branding/metriklogo.png"
                alt="Logo Metrik"
                width={48}
                height={48}
                className="h-12 w-12 rounded-2xl"
                priority
              />
              <div>
                <p className="text-xl font-bold tracking-tight text-slate-900">
                  METRIK POS
                </p>
                <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                  Estaciones de caja
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
              >
                Volver al inicio
              </Link>
              <Link
                href="/login"
                className="rounded-full border border-sky-300 bg-sky-50 px-4 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-100"
              >
                Ingresar al panel
              </Link>
              {isKioskMode && (
                <button
                  type="button"
                  onClick={handleExitKiosk}
                  className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                >
                  Cerrar app
                </button>
              )}
            </div>
          </nav>
          {exitMode && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Modo salida de kiosk activado. Si la ventana no se cierra,
              presiona <strong>Alt + F4</strong> en el teclado.
            </div>
          )}
          {exitFailed && (
            <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              No se pudo cerrar la ventana automáticamente. Usa
              <strong> Alt + F4</strong> o intenta nuevamente con el botón
              &quot;Cerrar app&quot;.
            </div>
          )}

          <section className="mt-12 grid flex-1 gap-10 lg:grid-cols-2 items-center">
            <div className="rounded-3xl bg-white/85 p-10 shadow-2xl flex items-center justify-center mx-auto">
              <div className="text-center space-y-5 max-w-md">
                <Image
                  src="/branding/kensar-logo-moderno.jpg"
                  alt="Logo Kensar Electronic"
                  width={420}
                  height={420}
                  className="mx-auto h-auto w-80 rounded-[28px] shadow-lg object-contain"
                  priority
                />
                <p className="text-base text-slate-600">
                  Acceso exclusivo al POS de Kensar Electronic.
                </p>
              </div>
            </div>

            <div className="flex items-center">
              <div className="w-full rounded-3xl border border-slate-200/80 bg-white/90 p-8 shadow-2xl">
                <div className="space-y-2 text-center">
                  <h2 className="text-3xl font-semibold text-slate-900">
                    Autentícate para abrir el POS
                  </h2>
                  <p className="text-base text-slate-500">
                    Solo habilitado para usuarios con rol de caja.
                  </p>
                </div>
                <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                  <label className="flex flex-col gap-1 text-base">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Estación</span>
                      {stationInfo && (
                        <button
                          type="button"
                          onClick={handleClearStation}
                          className="inline-flex text-[11px] text-slate-500 hover:text-slate-900 underline"
                          aria-label="Olvidar estación"
                        >
                          Olvidar estación
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={stationInfo?.email ?? ""}
                      readOnly
                      placeholder="Configura esta estación desde el panel"
                      className="rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3.5 text-slate-500 shadow-inner"
                    />
                  </label>
                  {!stationInfo && (
                    <p className="text-[13px] text-amber-700 bg-amber-100/60 rounded-xl px-3 py-2">
                      Esta estación no está configurada. Ingresa al panel y usa
                      “Configurar aquí” en Seguridad → Estaciones de caja.
                    </p>
                  )}
                  <label className="flex flex-col gap-1 text-base">
                    <span className="text-slate-500">PIN de caja</span>
                    <div className="relative">
                      <input
                        type={showPin ? "text" : "password"}
                        ref={pinInputRef}
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 pr-16 text-slate-900 shadow-inner focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                        placeholder="Ingresa tu PIN"
                        inputMode="numeric"
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPin((prev) => !prev)}
                        className="absolute inset-y-0 right-3 flex items-center text-sm font-semibold text-slate-500 hover:text-slate-800"
                        aria-pressed={showPin}
                        aria-label={showPin ? "Ocultar PIN" : "Mostrar PIN"}
                      >
                        {showPin ? "Ocultar" : "Ver"}
                      </button>
                    </div>
                  </label>
                  {error && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                      {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={submitting || !stationInfo}
                  className="w-full rounded-2xl bg-gradient-to-r from-[#34d399] to-[#06b6d4] px-4 py-3.5 text-lg font-semibold text-white shadow-lg transition hover:scale-[1.01] disabled:opacity-60"
                >
                  {submitting ? "Ingresando…" : "Entrar al POS"}
                </button>
              </form>
              <div className="mt-5 text-center text-sm text-slate-500">
                <Link
                  href="/forgot-password"
                  className="font-semibold text-emerald-500 hover:text-emerald-400"
                  >
                    ¿Olvidaste tu contraseña?
                  </Link>
                </div>
              </div>
            </div>
          </section>

          <footer className="mt-10 text-center text-xs text-slate-500">
            © {new Date().getFullYear()} Metrik · POS seguro para tus cajeros
          </footer>
        </div>
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

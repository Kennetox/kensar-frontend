"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth, LOGOUT_REASON_KEY } from "../providers/AuthProvider";
import AnimatedBackground from "../components/landing/AnimatedBackground";
import RevealOnScroll from "../components/landing/RevealOnScroll";

const highlights = [
  {
    title: "Operación en vivo",
    description: "POS web conectado a inventario, ventas y cierres en tiempo real.",
  },
  {
    title: "Seguridad empresarial",
    description: "Sesiones seguras, recuperación de contraseña y roles por módulo.",
  },
  {
    title: "Panel unificado",
    description: "Documentos, reportes y configuración en una sola plataforma.",
  },
];

const REMEMBERED_EMAIL_KEY = "metrikRememberedEmail";

export default function LoginPage() {
  const router = useRouter();
  const { login, token, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && token) {
      router.replace("/dashboard");
    }
  }, [loading, token, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reason = window.sessionStorage.getItem(LOGOUT_REASON_KEY);
    if (reason) {
      setError(reason);
      window.sessionStorage.removeItem(LOGOUT_REASON_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedEmail = window.localStorage.getItem(REMEMBERED_EMAIL_KEY);
    if (storedEmail) {
      setEmail(storedEmail);
      setRememberEmail(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (rememberEmail && email.trim()) {
      window.localStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim());
    } else if (!rememberEmail) {
      window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
    }
  }, [rememberEmail, email]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Debes ingresar tu correo y contraseña.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace("/dashboard");
    } catch (err) {
      console.error(err);
      if (err instanceof Error) {
        setError(err.message || "Ocurrió un error inesperado.");
      } else if (
        typeof err === "object" &&
        err &&
        "detail" in err &&
        typeof (err as { detail?: string }).detail === "string"
      ) {
        setError(
          (err as { detail?: string }).detail ||
            "No pudimos iniciar sesión, revisa tus credenciales."
        );
      } else {
        setError("No pudimos iniciar sesión, revisa tus credenciales.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-transparent text-[#0F172A]">
      <div className="relative min-h-screen overflow-hidden landing-tint-surface">
        <AnimatedBackground />
        <div className="relative mx-auto w-full max-w-[1080px] px-4 pb-12 pt-6 sm:px-6 lg:px-8">
        <RevealOnScroll>
        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm sm:px-6">
          <div className="flex items-center gap-3">
            <Image src="/branding/metriklogo.png" alt="Metrik" width={42} height={42} className="h-10 w-10 rounded-lg" priority />
            <div>
              <p className="text-lg font-bold tracking-tight text-[#0F172A]">METRIK</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Sistema operativo para negocios</p>
            </div>
          </div>
          <Link href="/" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
            Volver al inicio
          </Link>
        </div>
        </RevealOnScroll>

        <section className="mt-7 grid gap-6 lg:grid-cols-[1fr_1.02fr]">
          <RevealOnScroll delayMs={90}>
          <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Acceso seguro</p>
            <h1 className="mt-3 text-[clamp(1.9rem,4vw,2.8rem)] font-bold tracking-tight text-[#0F172A]">
              Ingresa a tu operación en tiempo real
            </h1>
            <p className="mt-3 text-slate-600">
              Continúa donde lo dejaste: ventas, inventario, documentos y reportes sincronizados.
            </p>
            <ul className="mt-5 space-y-3">
              {highlights.map((item) => (
                <li key={item.title} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">{item.description}</p>
                </li>
              ))}
            </ul>
          </article>
          </RevealOnScroll>

          <RevealOnScroll delayMs={150}>
          <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
            <div className="space-y-1 text-center">
              <h2 className="text-2xl font-bold text-[#0F172A]">Autentícate para continuar</h2>
              <p className="text-sm text-slate-600">Usa tu correo corporativo y contraseña.</p>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-slate-600">Correo</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-inner outline-none transition focus:border-[#22C55E] focus:ring-2 focus:ring-emerald-200"
                  placeholder="correo@tuempresa.com"
                  autoComplete="email"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-slate-600">Contraseña</span>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-16 text-slate-900 shadow-inner outline-none transition focus:border-[#22C55E] focus:ring-2 focus:ring-emerald-200"
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-3 text-xs font-semibold text-slate-500 hover:text-slate-800"
                    aria-pressed={showPassword}
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showPassword ? "Ocultar" : "Ver"}
                  </button>
                </div>
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={rememberEmail}
                  onChange={(e) => setRememberEmail(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-300"
                />
                Recordar mi correo en este equipo
              </label>

              {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">{error}</div>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-gradient-to-r from-[#22C55E] to-[#2563EB] px-4 py-3 text-base font-semibold text-white shadow-lg transition hover:brightness-110 disabled:opacity-60"
              >
                {submitting ? "Ingresando..." : "Ingresar"}
              </button>
            </form>

            <div className="mt-5 text-center text-xs text-slate-600">
              <Link href="/forgot-password" className="font-semibold text-emerald-700 hover:text-emerald-600">
                ¿Olvidaste tu contraseña?
              </Link>
              <p className="mt-3">
                ¿Aún no tienes empresa?{" "}
                <Link href="/contacto#solicitud" className="font-semibold text-slate-900 hover:text-slate-700">
                  Solicitar demo
                </Link>
              </p>
            </div>
          </article>
          </RevealOnScroll>
        </section>

        <footer className="mt-8 border-t border-slate-300/70 pt-5 text-xs text-slate-500">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>
              © {new Date().getFullYear()} Metrik POS. Todos los derechos reservados.
            </p>
            <div className="flex items-center gap-4">
              <Link href="/contacto" className="transition hover:text-slate-700">
                Contacto
              </Link>
              <Link href="/descargas" className="transition hover:text-slate-700">
                Descargas
              </Link>
              <Link href="/privacy" className="transition hover:text-slate-700">
                Privacidad
              </Link>
            </div>
          </div>
        </footer>
      </div>
      </div>
    </main>
  );
}

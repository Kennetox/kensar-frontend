"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth, LOGOUT_REASON_KEY } from "../providers/AuthProvider";

const highlights = [
  {
    title: "Operación en vivo",
    description: "POS web conectado a tu inventario y cierres en tiempo real.",
  },
  {
    title: "Seguridad empresarial",
    description: "Sesiones seguras, recuperación de contraseña y roles por módulo.",
  },
  {
    title: "Panel unificado",
    description: "Documentos, reportes y configuración en un mismo acceso.",
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
    <main
      className="relative min-h-screen bg-cover bg-center overflow-x-hidden"
      style={{
        backgroundImage:
          "url('https://images.unsplash.com/photo-1556742044-3c52d6e88c62?auto=format&fit=crop&q=80&w=2070')",
      }}
    >
      <div className="min-h-dvh bg-white/70 backdrop-blur-sm">
        <div className="mx-auto flex min-h-dvh w-full max-w-[62rem] flex-col px-4 py-6 sm:px-5 lg:py-8">
          <nav className="flex flex-col gap-4 rounded-[1.35rem] bg-white/80 px-5 py-4 shadow-lg sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-[1.125rem]">
            <div className="flex items-center gap-3.5">
              <Image
                src="/branding/metriklogo.png"
                alt="Logo Metrik"
                width={44}
                height={44}
                className="h-11 w-11 rounded-xl"
                priority
              />
              <div>
                <p className="text-xl font-bold tracking-tight text-slate-900">
                  METRIK
                </p>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  by Kensar Electronic
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/"
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-500 hover:text-slate-900"
              >
                ← Volver al sitio principal
              </Link>
              <Link
                href="/descargas"
                className="rounded-full border border-emerald-300 bg-emerald-400/20 px-4 py-2 text-sm font-semibold text-emerald-600 transition hover:bg-emerald-300/30"
              >
                Descargas
              </Link>
            </div>
          </nav>

          <section className="mt-8 grid flex-1 items-center gap-8 lg:mt-10 lg:grid-cols-2">
            <div className="rounded-[1.35rem] bg-white/85 p-5 shadow-2xl sm:p-6">
              <p className="text-[10px] uppercase tracking-[0.32em] text-slate-500 sm:text-[11px]">
                Acceso seguro
              </p>
              <h1 className="mt-4 text-[clamp(1.85rem,3.35vw,2.55rem)] font-bold leading-tight text-slate-900">
                Ingresa al panel de Metrik
              </h1>
              <p className="mt-3 text-[0.95rem] leading-relaxed text-slate-600 sm:text-base">
                Continúa donde lo dejaste: POS, reportes y documentos sincronizados.
              </p>
              <ul className="mt-5 space-y-3.5 text-slate-600">
                {highlights.map((item) => (
                  <li
                    key={item.title}
                    className="rounded-xl border border-slate-200/70 bg-white/70 px-4 py-3.5"
                  >
                    <p className="text-sm font-semibold text-slate-900">
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-[0.82rem] leading-relaxed text-slate-500">
                      {item.description}
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center">
              <div className="w-full rounded-[1.35rem] border border-slate-200/80 bg-white/90 p-5 shadow-2xl sm:p-7">
                <div className="space-y-2 text-center">
                  <h2 className="text-2xl font-semibold leading-tight text-slate-900">
                    Autentícate para continuar
                  </h2>
                  <p className="text-sm text-slate-500">
                    Usa tu correo corporativo y contraseña.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-slate-500">Correo</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-inner focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                      placeholder="correo@tuempresa.com"
                      autoComplete="email"
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-slate-500">Contraseña</span>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pr-16 text-slate-900 shadow-inner focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                        placeholder="••••••••"
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-slate-500 hover:text-slate-800"
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
                      className="h-4 w-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-300"
                    />
                    Recordar mi correo en este equipo
                  </label>

                  {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-600">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-xl bg-gradient-to-r from-[#34d399] to-[#06b6d4] px-4 py-3 text-base font-semibold text-white shadow-lg transition hover:scale-[1.01] disabled:opacity-60"
                  >
                    {submitting ? "Ingresando..." : "Ingresar"}
                  </button>
                </form>

                <div className="mt-4 text-center text-xs text-slate-500">
                  <Link
                    href="/forgot-password"
                    className="font-semibold text-emerald-500 hover:text-emerald-400"
                  >
                    ¿Olvidaste tu contraseña?
                  </Link>
                  <p className="mt-3">
                    ¿Aún no tienes empresa?{" "}
                    <Link href="/demo" className="font-semibold text-slate-900 hover:text-slate-700">
                      Probar demo
                    </Link>
                  </p>
                </div>
              </div>
            </div>
          </section>

          <footer className="mt-6 px-5 pb-2 pt-1 text-center text-xs text-slate-600">
            © {new Date().getFullYear()} Metrik · Kensar Electronic.{" "}
            <Link
              href="/platform/login"
              className="font-semibold text-slate-600 underline-offset-2 hover:underline hover:text-slate-900"
            >
              Admin
            </Link>
          </footer>
        </div>
      </div>
    </main>
  );
}

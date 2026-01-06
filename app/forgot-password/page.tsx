"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { getApiBase } from "@/lib/api/base";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.detail ?? "No pudimos enviar el correo, intenta de nuevo.");
      }
      setMessage(
        data?.detail ??
          "Si encontramos una cuenta asociada, enviaremos instrucciones a tu correo."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado, intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-4">
        <Link
          href="/login"
          className="flex items-center justify-center rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-emerald-400 hover:text-emerald-200"
        >
          ← Volver al inicio de sesión
        </Link>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-6 shadow-xl">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-semibold">Recuperar acceso</h1>
            <p className="text-sm text-slate-400">
              Ingresa tu correo y enviaremos un enlace para restablecer tu contraseña.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-400">Correo</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="correo@empresa.com"
                autoComplete="email"
                required
              />
            </label>

            {message && (
              <div className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/40 rounded-md px-3 py-2">
                {message}
              </div>
            )}

            {error && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/40 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold py-2.5 transition disabled:opacity-60"
            >
              {submitting ? "Enviando…" : "Enviar enlace"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

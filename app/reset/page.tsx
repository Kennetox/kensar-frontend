"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getApiBase } from "@/lib/api/base";

type ValidateResponse = {
  valid: boolean;
  expires_at?: string;
};

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";
  const [validation, setValidation] = useState<ValidateResponse | null>(null);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function validate() {
      if (!token) {
        setValidation({ valid: false });
        setChecking(false);
        return;
      }
      try {
        const res = await fetch(`${getApiBase()}/auth/validate-reset-token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = (await res.json().catch(() => ({}))) as ValidateResponse;
        setValidation(data);
      } catch {
        setValidation({ valid: false });
      } finally {
        setChecking(false);
      }
    }
    void validate();
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.detail ?? "No pudimos actualizar la contraseña.");
      }
      setSuccess(data?.detail ?? "Contraseña actualizada correctamente.");
      setTimeout(() => router.replace("/login"), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSubmitting(false);
    }
  }

  const expiresAtText = useMemo(() => {
    if (!validation?.expires_at) return null;
    const date = new Date(validation.expires_at);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString();
  }, [validation?.expires_at]);

  const invalidToken = !token || (validation && !validation.valid);

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
            <h1 className="text-2xl font-semibold">Restablecer contraseña</h1>
            <p className="text-sm text-slate-400">
              Define una nueva contraseña para tu cuenta.
            </p>
          </div>

          {checking ? (
            <p className="text-center text-sm text-slate-400">Validando enlace…</p>
          ) : invalidToken ? (
            <div className="space-y-3 text-center text-sm">
              <p className="text-red-400">Este enlace ya no es válido o expiró.</p>
              <Link
                href="/forgot-password"
                className="inline-flex items-center justify-center rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200 hover:border-emerald-400"
              >
                Solicitar uno nuevo
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-400">Nueva contraseña</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-400">Confirmar contraseña</span>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                />
              </label>

              {expiresAtText && (
                <p className="text-[11px] text-slate-400">
                  Este enlace expira el {expiresAtText}.
                </p>
              )}

              {success && (
                <div className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/40 rounded-md px-3 py-2">
                  {success}
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
                {submitting ? "Actualizando…" : "Actualizar contraseña"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200">
          <span>Cargando restablecimiento…</span>
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}

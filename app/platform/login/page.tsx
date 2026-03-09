"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getApiBase } from "@/lib/api/base";

const PLATFORM_AUTH_STORAGE_KEY = "metrik_platform_auth";

export default function PlatformLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(PLATFORM_AUTH_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { token?: string };
      if (parsed?.token) {
        router.replace("/platform");
      }
    } catch {
      // ignore invalid storage
    }
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Debes ingresar correo y contraseña.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/auth/platform-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "No autorizado");
      }
      const data = (await res.json()) as {
        token: string;
        user: { id: number; email: string; name: string };
      };
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(
          PLATFORM_AUTH_STORAGE_KEY,
          JSON.stringify({
            token: data.token,
            user: data.user,
          })
        );
      }
      router.replace("/platform");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No autorizado");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
          Metrik Platform
        </p>
        <h1 className="text-2xl font-bold mt-2">Ingreso privado</h1>
        <p className="text-sm text-slate-400 mt-1">
          Acceso exclusivo para administración de empresas.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3 mt-5">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="correo"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="contraseña"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
          />
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-emerald-500 px-4 py-2 font-semibold text-slate-900 disabled:opacity-60"
          >
            {submitting ? "Ingresando..." : "Entrar"}
          </button>
        </form>
      </section>
    </main>
  );
}

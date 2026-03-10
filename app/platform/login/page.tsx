"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getApiBase } from "@/lib/api/base";

const PLATFORM_AUTH_STORAGE_KEY = "metrik_platform_auth";
const PLATFORM_TRUSTED_DEVICE_KEY = "metrik_platform_trusted_device";

export default function PlatformLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [challengeId, setChallengeId] = useState<number | null>(null);
  const [maskedEmail, setMaskedEmail] = useState("");
  const [rememberDevice, setRememberDevice] = useState(true);
  const [trustedDeviceToken, setTrustedDeviceToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(PLATFORM_AUTH_STORAGE_KEY);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(PLATFORM_TRUSTED_DEVICE_KEY) || "";
    setTrustedDeviceToken(stored);
  }, []);

  const deviceLabel = useMemo(() => {
    if (typeof window === "undefined") return "Navegador web";
    return `${window.navigator?.platform || "Web"} · ${window.navigator?.userAgent || "Browser"}`;
  }, []);

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
          device_token: trustedDeviceToken || undefined,
          device_label: deviceLabel,
        }),
      });
      if (res.status === 202) {
        const pending = (await res.json()) as {
          challenge_id: number;
          masked_email?: string;
          detail?: string;
        };
        setChallengeId(pending.challenge_id);
        setMaskedEmail(pending.masked_email ?? email.trim().toLowerCase());
        setVerificationCode("");
        setError(pending.detail ?? "Te enviamos un código al correo.");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "No autorizado");
      }
      const data = (await res.json()) as {
        token: string;
        user: { id: number; email: string; name: string };
        trusted_device_token?: string | null;
      };
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(
          PLATFORM_AUTH_STORAGE_KEY,
          JSON.stringify({
            token: data.token,
            user: data.user,
          })
        );
        if (data.trusted_device_token) {
          window.localStorage.setItem(PLATFORM_TRUSTED_DEVICE_KEY, data.trusted_device_token);
          setTrustedDeviceToken(data.trusted_device_token);
        }
      }
      router.replace("/platform");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No autorizado");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challengeId) return;
    if (!verificationCode.trim()) {
      setError("Debes ingresar el código de verificación.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/auth/platform-login/verify-2fa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challenge_id: challengeId,
          code: verificationCode.trim(),
          remember_device: rememberDevice,
          device_token: trustedDeviceToken || undefined,
          device_label: deviceLabel,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "Código inválido");
      }
      const data = (await res.json()) as {
        token: string;
        user: { id: number; email: string; name: string };
        trusted_device_token?: string | null;
      };
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(
          PLATFORM_AUTH_STORAGE_KEY,
          JSON.stringify({
            token: data.token,
            user: data.user,
          })
        );
        if (data.trusted_device_token) {
          window.localStorage.setItem(PLATFORM_TRUSTED_DEVICE_KEY, data.trusted_device_token);
          setTrustedDeviceToken(data.trusted_device_token);
        }
      }
      router.replace("/platform");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Código inválido");
    } finally {
      setSubmitting(false);
    }
  }

  function resetTwoFactor() {
    setChallengeId(null);
    setVerificationCode("");
    setError(null);
    setPassword("");
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
        {!challengeId ? (
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
        ) : (
          <form onSubmit={handleVerifyCode} className="space-y-3 mt-5">
            <p className="text-xs text-slate-400">
              Código enviado a {maskedEmail}.
            </p>
            <input
              type="text"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="código de 6 dígitos"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
              inputMode="numeric"
              autoComplete="one-time-code"
            />
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={rememberDevice}
                onChange={(e) => setRememberDevice(e.target.checked)}
                className="h-4 w-4 rounded border-slate-600"
              />
              Recordar este dispositivo por 30 días
            </label>
            {error && <p className="text-sm text-rose-300">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-emerald-500 px-4 py-2 font-semibold text-slate-900 disabled:opacity-60"
            >
              {submitting ? "Verificando..." : "Validar código"}
            </button>
            <button
              type="button"
              onClick={resetTwoFactor}
              className="w-full rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200"
            >
              Volver
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

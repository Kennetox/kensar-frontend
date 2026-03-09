"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startDemo } from "@/lib/api/demo";
import { useAuth } from "../providers/AuthProvider";

const steps = ["Empresa", "Administrador", "Confirmación"] as const;

export default function DemoPage() {
  const router = useRouter();
  const { acceptSession } = useAuth();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    company_name: "",
    business_type: "",
    company_phone: "",
    company_city: "",
    admin_name: "",
    admin_email: "",
    admin_phone: "",
    password: "",
    confirm_password: "",
  });

  const canAdvanceCompany = useMemo(
    () => form.company_name.trim().length >= 2,
    [form.company_name]
  );
  const canAdvanceAdmin = useMemo(() => {
    return (
      form.admin_name.trim().length >= 2 &&
      form.admin_email.trim().length >= 5 &&
      form.password.length >= 8 &&
      form.password === form.confirm_password
    );
  }, [form.admin_email, form.admin_name, form.confirm_password, form.password]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < 2) {
      if (step === 0 && canAdvanceCompany) setStep(1);
      if (step === 1 && canAdvanceAdmin) setStep(2);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const response = await startDemo({
        company_name: form.company_name.trim(),
        business_type: form.business_type.trim() || undefined,
        company_phone: form.company_phone.trim() || undefined,
        company_city: form.company_city.trim() || undefined,
        admin_name: form.admin_name.trim(),
        admin_email: form.admin_email.trim().toLowerCase(),
        admin_phone: form.admin_phone.trim() || undefined,
        password: form.password,
      });
      acceptSession({
        token: response.token,
        user: response.user,
        tenant: response.tenant ?? null,
        sessionType: "web",
      });
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar la demo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#d9f99d_0%,#f8fafc_32%,#e0f2fe_100%)] px-4 py-8 text-slate-900 sm:px-6 lg:px-12">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-[32px] border border-white/70 bg-white/80 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs uppercase tracking-[0.32em] text-emerald-700">
                Demo Metrik
              </p>
              <h1 className="mt-3 text-4xl font-bold tracking-tight">
                Empieza tu demo de 7 dias
              </h1>
              <p className="mt-3 text-base text-slate-600">
                Configura tu empresa, crea tu usuario administrador y entra de una vez a
                Metrik con acceso completo.
              </p>
            </div>
            <Link
              href="/login"
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-500"
            >
              Ya tengo cuenta
            </Link>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            {steps.map((label, index) => (
              <div
                key={label}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  index === step
                    ? "bg-slate-900 text-white"
                    : index < step
                      ? "bg-emerald-500/20 text-emerald-800"
                      : "bg-slate-200 text-slate-600"
                }`}
              >
                {index + 1}. {label}
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            {step === 0 && (
              <section className="grid gap-4 md:grid-cols-2">
                <input
                  value={form.company_name}
                  onChange={(e) => setForm((prev) => ({ ...prev, company_name: e.target.value }))}
                  placeholder="Nombre de la empresa"
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                />
                <input
                  value={form.business_type}
                  onChange={(e) => setForm((prev) => ({ ...prev, business_type: e.target.value }))}
                  placeholder="Tipo de negocio"
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                />
                <input
                  value={form.company_phone}
                  onChange={(e) => setForm((prev) => ({ ...prev, company_phone: e.target.value }))}
                  placeholder="Telefono de la empresa (opcional)"
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                />
                <input
                  value={form.company_city}
                  onChange={(e) => setForm((prev) => ({ ...prev, company_city: e.target.value }))}
                  placeholder="Ciudad (opcional)"
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                />
              </section>
            )}

            {step === 1 && (
              <section className="grid gap-4 md:grid-cols-2">
                <input
                  value={form.admin_name}
                  onChange={(e) => setForm((prev) => ({ ...prev, admin_name: e.target.value }))}
                  placeholder="Nombre del administrador"
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                />
                <input
                  type="email"
                  value={form.admin_email}
                  onChange={(e) => setForm((prev) => ({ ...prev, admin_email: e.target.value }))}
                  placeholder="Correo del administrador"
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                />
                <input
                  value={form.admin_phone}
                  onChange={(e) => setForm((prev) => ({ ...prev, admin_phone: e.target.value }))}
                  placeholder="Telefono del administrador (opcional)"
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                />
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder="Contrasena"
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                />
                <input
                  type="password"
                  value={form.confirm_password}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, confirm_password: e.target.value }))
                  }
                  placeholder="Confirmar contrasena"
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 md:col-span-2"
                />
              </section>
            )}

            {step === 2 && (
              <section className="grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl border border-slate-200 bg-white p-5">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Empresa</p>
                  <p className="mt-3 text-2xl font-semibold">{form.company_name}</p>
                  <p className="mt-2 text-sm text-slate-600">
                    {form.business_type || "Tipo de negocio sin especificar"}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {form.company_city || "Ciudad no especificada"}
                  </p>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-white p-5">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Admin</p>
                  <p className="mt-3 text-2xl font-semibold">{form.admin_name}</p>
                  <p className="mt-2 text-sm text-slate-600">{form.admin_email}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Demo activa por 7 dias desde la creacion.
                  </p>
                </div>
              </section>
            )}

            {error && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => setStep((prev) => Math.max(0, prev - 1))}
                  className="rounded-2xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700"
                >
                  Atras
                </button>
              )}
              <button
                type="submit"
                disabled={
                  submitting ||
                  (step === 0 && !canAdvanceCompany) ||
                  (step === 1 && !canAdvanceAdmin)
                }
                className="rounded-2xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {submitting
                  ? "Creando demo..."
                  : step === 2
                    ? "Entrar a mi demo"
                    : "Continuar"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}

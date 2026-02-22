"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../providers/AuthProvider";
import { createHrEmployee } from "@/lib/api/hr";

type NewEmployeeForm = {
  name: string;
  email: string;
  status: "Activo" | "Inactivo";
  phone: string;
  position: string;
  location: string;
  notes: string;
};

const emptyForm: NewEmployeeForm = {
  name: "",
  email: "",
  status: "Activo",
  phone: "",
  position: "",
  location: "",
  notes: "",
};

export default function NewHrEmployeePage() {
  const { token } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState<NewEmployeeForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const isDirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(emptyForm),
    [form]
  );

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty || saving) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, saving]);

  const handleBack = () => {
    if (isDirty && !saving) {
      const confirmed = window.confirm(
        "Tienes cambios sin guardar. ¿Seguro que quieres salir?"
      );
      if (!confirmed) return;
    }
    router.push("/dashboard/hr");
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    setToastVisible(false);
    requestAnimationFrame(() => setToastVisible(true));
    window.setTimeout(() => {
      setToastVisible(false);
      window.setTimeout(() => setToastMessage(null), 220);
    }, 3200);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;
    if (!form.name.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const created = await createHrEmployee(
        {
          name: form.name.trim(),
          email: form.email.trim() || null,
          status: form.status,
          phone: form.phone.trim() || null,
          position: form.position.trim() || null,
          location: form.location.trim() || null,
          notes: form.notes.trim() || null,
        },
        token
      );
      showToast("Perfil creado correctamente.");
      window.setTimeout(() => {
        router.push(`/dashboard/hr/${created.id}`);
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el perfil.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Nuevo perfil</h1>
          <p className="ui-text-muted mt-1">
            Crea un nuevo empleado HR. Puedes completar el resto luego.
          </p>
        </div>
        <button
          type="button"
          onClick={handleBack}
          className="rounded-md border ui-border px-3 py-2 text-sm hover:bg-white/60 transition"
        >
          Volver
        </button>
      </header>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border ui-border dashboard-card p-4 space-y-4"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="block mb-1 ui-text-muted">Nombre *</span>
            <input
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
              className="w-full rounded-lg border ui-border bg-white/80 px-3 py-2"
              required
            />
          </label>
          <label className="text-sm">
            <span className="block mb-1 ui-text-muted">Correo</span>
            <input
              value={form.email}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, email: event.target.value }))
              }
              className="w-full rounded-lg border ui-border bg-white/80 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="block mb-1 ui-text-muted">Estado HR</span>
            <select
              value={form.status}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  status: event.target.value as "Activo" | "Inactivo",
                }))
              }
              className="w-full rounded-lg border ui-border bg-white/80 px-3 py-2"
            >
              <option value="Activo">Activo</option>
              <option value="Inactivo">Inactivo</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="block mb-1 ui-text-muted">Cargo</span>
            <input
              value={form.position}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, position: event.target.value }))
              }
              className="w-full rounded-lg border ui-border bg-white/80 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="block mb-1 ui-text-muted">Teléfono</span>
            <input
              value={form.phone}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, phone: event.target.value }))
              }
              className="w-full rounded-lg border ui-border bg-white/80 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="block mb-1 ui-text-muted">Ubicación</span>
            <input
              value={form.location}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, location: event.target.value }))
              }
              className="w-full rounded-lg border ui-border bg-white/80 px-3 py-2"
            />
          </label>
        </div>
        <label className="text-sm block">
          <span className="block mb-1 ui-text-muted">Notas</span>
          <textarea
            value={form.notes}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, notes: event.target.value }))
            }
            rows={3}
            className="w-full rounded-lg border ui-border bg-white/80 px-3 py-2"
          />
        </label>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving || !form.name.trim()}
            className="rounded-md bg-emerald-500 text-slate-900 px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            {saving ? "Guardando..." : "Guardar perfil"}
          </button>
        </div>
      </form>

      {toastMessage && (
        <div
          className={[
            "fixed bottom-6 right-6 z-50 min-w-[240px] max-w-sm rounded-xl border border-emerald-200 bg-white/95 px-4 py-3 text-sm text-emerald-700 shadow-lg backdrop-blur transition-all duration-200",
            toastVisible
              ? "translate-y-0 opacity-100"
              : "translate-y-2 opacity-0 pointer-events-none",
          ].join(" ")}
        >
          {toastMessage}
        </div>
      )}
    </section>
  );
}

"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  convertPlatformTenant,
  createPlatformTenant,
  extendPlatformTenantTrial,
  listPlatformTenants,
  PlatformTenant,
  sendPlatformTenantRecovery,
  updatePlatformTenant,
} from "@/lib/api/platform";
import {
  isTenantModuleEnabled,
  normalizeEnabledModules,
  TenantModuleCatalogItem,
} from "@/lib/tenantModules";

const PLATFORM_AUTH_STORAGE_KEY = "metrik_platform_auth";

function toSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "No disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No disponible";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatField(value: string | null | undefined): string {
  if (!value) return "No configurado";
  const trimmed = value.trim();
  return trimmed.length ? trimmed : "No configurado";
}

const tenantFilters = [
  { id: "all", label: "Todas" },
  { id: "demo", label: "Demos" },
  { id: "active", label: "Activas" },
  { id: "inactive", label: "Inactivas" },
  { id: "suspended", label: "Suspendidas" },
  { id: "archived", label: "Archivadas" },
] as const;

function DetailField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-slate-100">{value}</p>
    </div>
  );
}

function getVisibleModuleCatalog(tenant: PlatformTenant): TenantModuleCatalogItem[] {
  return (tenant.module_catalog ?? []).filter((item) => item.platform_visible);
}

export default function PlatformPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [platformUserName, setPlatformUserName] = useState("");
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [slugEdited, setSlugEdited] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [tenantFilter, setTenantFilter] = useState<(typeof tenantFilters)[number]["id"]>("all");
  const [expandedTenantId, setExpandedTenantId] = useState<number | null>(null);
  const [updatingTenantId, setUpdatingTenantId] = useState<number | null>(null);
  const [recoveringTenantId, setRecoveringTenantId] = useState<number | null>(null);
  const [extendingTenantId, setExtendingTenantId] = useState<number | null>(null);
  const [convertingTenantId, setConvertingTenantId] = useState<number | null>(null);
  const [tenantFeedback, setTenantFeedback] = useState<
    Record<number, { kind: "success" | "error"; text: string }>
  >({});
  const [form, setForm] = useState({
    slug: "",
    name: "",
    admin_name: "",
    admin_email: "",
    admin_password: "",
    admin_phone: "",
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(PLATFORM_AUTH_STORAGE_KEY);
    if (!raw) {
      router.replace("/platform/login");
      return;
    }
    try {
      const parsed = JSON.parse(raw) as { token?: string; user?: { name?: string } };
      if (!parsed?.token) {
        router.replace("/platform/login");
        return;
      }
      setToken(parsed.token);
      setPlatformUserName(parsed.user?.name?.trim() || "");
    } catch {
      router.replace("/platform/login");
    }
  }, [router]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const run = async () => {
      try {
        setFetching(true);
        setError(null);
        const rows = await listPlatformTenants(token);
        if (!cancelled) setTenants(rows);
      } catch (err) {
        const status =
          typeof err === "object" && err && "status" in err
            ? Number((err as { status?: number }).status)
            : null;
        const message = err instanceof Error ? err.message : "No autorizado";
        if (!cancelled) {
          if (status === 403) {
            router.replace("/platform/login");
            return;
          }
          if (status === 401) {
            if (typeof window !== "undefined") {
              window.sessionStorage.removeItem(PLATFORM_AUTH_STORAGE_KEY);
            }
            router.replace("/platform/login");
            return;
          }
          setError(message);
        }
      } finally {
        if (!cancelled) setFetching(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [router, token]);

  const canSubmit = useMemo(() => {
    return (
      form.slug.trim().length >= 2 &&
      form.name.trim().length >= 2 &&
      form.admin_name.trim().length >= 2 &&
      form.admin_email.trim().length >= 5 &&
      form.admin_password.length >= 8
    );
  }, [form]);

  const filteredTenants = useMemo(() => {
    if (tenantFilter === "all") return tenants;
    if (tenantFilter === "active") {
      return tenants.filter((tenant) => tenant.lifecycle_stage === "active");
    }
    if (tenantFilter === "inactive") {
      return tenants.filter(
        (tenant) => tenant.lifecycle_stage === "inactive" || !tenant.is_active
      );
    }
    if (tenantFilter === "archived") {
      return tenants.filter((tenant) => tenant.lifecycle_stage === "archived");
    }
    return tenants.filter((tenant) => tenant.lifecycle_stage === tenantFilter);
  }, [tenantFilter, tenants]);

  async function handleCreateTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canSubmit) return;
    try {
      setSaving(true);
      setError(null);
      const created = await createPlatformTenant(
        {
          slug: form.slug.trim().toLowerCase(),
          name: form.name.trim(),
          admin_name: form.admin_name.trim(),
          admin_email: form.admin_email.trim().toLowerCase(),
          admin_password: form.admin_password,
          admin_phone: form.admin_phone.trim() || undefined,
        },
        token
      );
      setTenants((prev) => [created.tenant, ...prev]);
      setExpandedTenantId(created.tenant.id);
      setShowCreateForm(false);
      setSlugEdited(false);
      setForm({
        slug: "",
        name: "",
        admin_name: "",
        admin_email: "",
        admin_password: "",
        admin_phone: "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la empresa");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleTenant(tenant: PlatformTenant) {
    if (!token) return;
    try {
      setUpdatingTenantId(tenant.id);
      setError(null);
      const updated = await updatePlatformTenant(
        tenant.id,
        { is_active: !tenant.is_active },
        token
      );
      setTenants((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      setTenantFeedback((prev) => ({
        ...prev,
        [tenant.id]: {
          kind: "success",
          text: updated.is_active
            ? "Empresa activada correctamente."
            : "Empresa desactivada correctamente.",
        },
      }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No se pudo actualizar la empresa";
      setTenantFeedback((prev) => ({
        ...prev,
        [tenant.id]: { kind: "error", text: message },
      }));
    } finally {
      setUpdatingTenantId(null);
    }
  }

  async function handleSendRecovery(tenant: PlatformTenant) {
    if (!token) return;
    try {
      setRecoveringTenantId(tenant.id);
      setError(null);
      const response = await sendPlatformTenantRecovery(tenant.id, token);
      setTenantFeedback((prev) => ({
        ...prev,
        [tenant.id]: {
          kind: "success",
          text: `${response.detail}. Destino: ${response.recipient}.`,
        },
      }));
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "No se pudo enviar el correo de recuperación";
      setTenantFeedback((prev) => ({
        ...prev,
        [tenant.id]: { kind: "error", text: message },
      }));
    } finally {
      setRecoveringTenantId(null);
    }
  }

  async function handleExtendTrial(tenant: PlatformTenant) {
    if (!token) return;
    try {
      setExtendingTenantId(tenant.id);
      const updated = await extendPlatformTenantTrial(tenant.id, 7, token);
      setTenants((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      setTenantFeedback((prev) => ({
        ...prev,
        [tenant.id]: {
          kind: "success",
          text: "Demo extendida por 7 dias.",
        },
      }));
    } catch (err) {
      setTenantFeedback((prev) => ({
        ...prev,
        [tenant.id]: {
          kind: "error",
          text: err instanceof Error ? err.message : "No se pudo extender la demo",
        },
      }));
    } finally {
      setExtendingTenantId(null);
    }
  }

  async function handleConvertTenant(tenant: PlatformTenant) {
    if (!token) return;
    try {
      setConvertingTenantId(tenant.id);
      const updated = await convertPlatformTenant(tenant.id, token);
      setTenants((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      setTenantFeedback((prev) => ({
        ...prev,
        [tenant.id]: {
          kind: "success",
          text: "Demo convertida a empresa activa.",
        },
      }));
    } catch (err) {
      setTenantFeedback((prev) => ({
        ...prev,
        [tenant.id]: {
          kind: "error",
          text: err instanceof Error ? err.message : "No se pudo convertir la demo",
        },
      }));
    } finally {
      setConvertingTenantId(null);
    }
  }

  async function handleArchiveTenant(tenant: PlatformTenant) {
    if (!token) return;
    try {
      setUpdatingTenantId(tenant.id);
      const updated = await updatePlatformTenant(
        tenant.id,
        { is_active: false, lifecycle_stage: "archived" },
        token
      );
      setTenants((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      setTenantFeedback((prev) => ({
        ...prev,
        [tenant.id]: {
          kind: "success",
          text: "Empresa archivada correctamente.",
        },
      }));
    } catch (err) {
      setTenantFeedback((prev) => ({
        ...prev,
        [tenant.id]: {
          kind: "error",
          text: err instanceof Error ? err.message : "No se pudo archivar la empresa",
        },
      }));
    } finally {
      setUpdatingTenantId(null);
    }
  }

  async function handleToggleTenantModule(
    tenant: PlatformTenant,
    moduleId: string
  ) {
    if (!token) return;
    const catalog = tenant.module_catalog ?? [];
    const moduleDef = catalog.find((item) => item.id === moduleId);
    if (!moduleDef || moduleDef.required) return;

    const normalized = normalizeEnabledModules(tenant.enabled_modules, catalog);
    const alreadyEnabled = normalized.some((item) => item === moduleId);
    const nextEnabled = alreadyEnabled
      ? normalized.filter((item) => item !== moduleId)
      : [...normalized, moduleId];

    try {
      setUpdatingTenantId(tenant.id);
      const updated = await updatePlatformTenant(
        tenant.id,
        { enabled_modules: nextEnabled },
        token
      );
      setTenants((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      setTenantFeedback((prev) => ({
        ...prev,
        [tenant.id]: {
          kind: "success",
          text: `Modulos de ${tenant.name} actualizados correctamente.`,
        },
      }));
    } catch (err) {
      setTenantFeedback((prev) => ({
        ...prev,
        [tenant.id]: {
          kind: "error",
          text:
            err instanceof Error
              ? err.message
              : "No se pudieron actualizar los modulos de la empresa",
        },
      }));
    } finally {
      setUpdatingTenantId(null);
    }
  }

  if (fetching) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
        <p className="text-sm text-slate-300">Cargando consola de plataforma…</p>
      </main>
    );
  }

  function handlePlatformLogout() {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(PLATFORM_AUTH_STORAGE_KEY);
    }
    router.replace("/platform/login");
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
              Metrik Platform
            </p>
            <h1 className="text-3xl font-bold">Consola de empresas</h1>
            <p className="text-sm text-slate-400 mt-1">
              Panel oculto para crear y administrar tenants.
            </p>
            <p className="mt-3 inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-sm font-medium text-emerald-300">
              Hola {platformUserName.split(" ")[0] || "Kenneth"}, bienvenido.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-2">
            <button
              type="button"
              onClick={handlePlatformLogout}
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"
            >
              Cerrar sesión
            </button>
            <Link
              href="/dashboard"
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"
            >
              Dashboard
            </Link>
            </div>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Crear empresa</h2>
              <p className="mt-1 text-sm text-slate-400">
                Abre el formulario solo cuando necesites registrar un nuevo tenant.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateForm((prev) => !prev)}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              {showCreateForm ? "Ocultar formulario" : "Crear empresa"}
            </button>
          </div>
          {showCreateForm && (
            <form onSubmit={handleCreateTenant} className="mt-5 grid gap-3 md:grid-cols-2">
              <input
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm((p) => {
                    const nextSlug = slugEdited ? p.slug : toSlug(name);
                    return { ...p, name, slug: nextSlug };
                  });
                }}
                placeholder="Nombre empresa"
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
              />
              <input
                value={form.slug}
                onChange={(e) => {
                  setSlugEdited(true);
                  setForm((p) => ({ ...p, slug: toSlug(e.target.value) }));
                }}
                placeholder="Slug sugerido (editable)"
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
              />
              <input
                value={form.admin_name}
                onChange={(e) => setForm((p) => ({ ...p, admin_name: e.target.value }))}
                placeholder="Nombre admin inicial"
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
              />
              <input
                type="email"
                value={form.admin_email}
                onChange={(e) => setForm((p) => ({ ...p, admin_email: e.target.value }))}
                placeholder="Email admin inicial"
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
              />
              <input
                type="password"
                value={form.admin_password}
                onChange={(e) =>
                  setForm((p) => ({ ...p, admin_password: e.target.value }))
                }
                placeholder="Contraseña admin inicial"
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
              />
              <input
                value={form.admin_phone}
                onChange={(e) => setForm((p) => ({ ...p, admin_phone: e.target.value }))}
                placeholder="Teléfono admin (opcional)"
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
              />
              <div className="flex gap-3 md:col-span-2">
                <button
                  type="submit"
                  disabled={!canSubmit || saving}
                  className="rounded-md bg-emerald-500 px-4 py-2 font-semibold text-slate-900 disabled:opacity-50"
                >
                  {saving ? "Creando..." : "Guardar empresa"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="rounded-md border border-slate-700 px-4 py-2 font-semibold text-slate-200 hover:bg-slate-800"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
          {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="text-lg font-semibold">Empresas registradas</h2>
            <div className="flex flex-wrap gap-2">
              {tenantFilters.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTenantFilter(item.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    tenantFilter === item.id
                      ? "bg-emerald-500 text-slate-950"
                      : "border border-slate-700 text-slate-300"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            {filteredTenants.map((tenant) => {
              const expanded = expandedTenantId === tenant.id;
              const feedback = tenantFeedback[tenant.id];
              return (
                <article
                  key={tenant.id}
                  className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-2xl font-semibold text-slate-100">{tenant.name}</p>
                        <span className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-400">
                          {tenant.slug}
                        </span>
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            tenant.lifecycle_stage === "demo"
                              ? "bg-amber-500/15 text-amber-300"
                              : tenant.lifecycle_stage === "archived"
                                ? "bg-slate-500/15 text-slate-300"
                              : tenant.is_active
                                ? "bg-emerald-500/15 text-emerald-300"
                                : "bg-rose-500/15 text-rose-300"
                          }`}
                        >
                          {tenant.lifecycle_stage === "demo"
                            ? `Demo${tenant.trial_days_remaining !== null ? ` · ${tenant.trial_days_remaining} dias` : ""}`
                            : tenant.lifecycle_stage === "archived"
                              ? "Archivada"
                            : tenant.is_active
                              ? "Activa"
                              : "Inactiva"}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-400">
                        <span>Creada: {formatDateTime(tenant.created_at)}</span>
                        <span>
                          Admin: {tenant.admin_user?.email ?? "Sin administrador configurado"}
                        </span>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2 lg:w-[332px] lg:justify-end">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedTenantId((prev) => (prev === tenant.id ? null : tenant.id))
                        }
                        className="min-w-[160px] rounded-lg border border-slate-700 px-3 py-2 text-center text-sm hover:bg-slate-800"
                      >
                        {expanded ? "Ocultar detalle" : "Ver detalle"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleToggleTenant(tenant)}
                        disabled={updatingTenantId === tenant.id}
                        className="min-w-[160px] rounded-lg border border-slate-700 px-3 py-2 text-center text-sm hover:bg-slate-800 disabled:opacity-60"
                      >
                        {updatingTenantId === tenant.id
                          ? "Guardando..."
                          : tenant.is_active
                            ? "Desactivar"
                            : "Activar"}
                      </button>
                      {tenant.lifecycle_stage !== "archived" && (
                        <button
                          type="button"
                          onClick={() => void handleArchiveTenant(tenant)}
                          disabled={updatingTenantId === tenant.id}
                          className="min-w-[160px] rounded-lg border border-slate-600 px-3 py-2 text-center text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-60"
                        >
                          Archivar
                        </button>
                      )}
                      {tenant.lifecycle_stage === "demo" && (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleExtendTrial(tenant)}
                            disabled={extendingTenantId === tenant.id}
                            className="min-w-[160px] rounded-lg border border-amber-400/40 px-3 py-2 text-center text-sm text-amber-200 hover:bg-amber-500/10 disabled:opacity-60"
                          >
                            {extendingTenantId === tenant.id ? "Extendiendo..." : "Extender 7 dias"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleConvertTenant(tenant)}
                            disabled={convertingTenantId === tenant.id}
                            className="min-w-[160px] rounded-lg bg-emerald-400 px-3 py-2 text-center text-sm font-semibold text-slate-950 disabled:opacity-60"
                          >
                            {convertingTenantId === tenant.id ? "Convirtiendo..." : "Convertir a activa"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {expanded && (
                    <div className="mt-4 space-y-4 border-t border-slate-800 pt-4">
                      <div className="grid gap-4 xl:grid-cols-[1.1fr_1.1fr_0.9fr]">
                        <section className="space-y-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
                              Empresa
                            </p>
                            <h3 className="mt-1 text-base font-semibold text-slate-100">
                              Datos base del tenant
                            </h3>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <DetailField label="Nombre" value={tenant.name} />
                            <DetailField label="Slug" value={tenant.slug} />
                            <DetailField
                              label="Estado"
                              value={
                                tenant.lifecycle_stage === "demo"
                                  ? `Demo (${tenant.trial_days_remaining ?? 0} dias restantes)`
                                  : tenant.lifecycle_stage === "archived"
                                    ? "Archivada"
                                  : tenant.is_active
                                    ? "Activo"
                                    : "Inactivo"
                              }
                            />
                            <DetailField
                              label="Fecha de creación"
                              value={formatDateTime(tenant.created_at)}
                            />
                            <DetailField
                              label="Vencimiento demo"
                              value={formatDateTime(tenant.trial_ends_at)}
                            />
                          </div>
                        </section>

                        <section className="space-y-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
                              Admin principal
                            </p>
                            <h3 className="mt-1 text-base font-semibold text-slate-100">
                              Usuario con el que se creó la empresa
                            </h3>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <DetailField
                              label="Nombre"
                              value={formatField(tenant.admin_user?.name)}
                            />
                            <DetailField
                              label="Correo"
                              value={formatField(tenant.admin_user?.email)}
                            />
                            <DetailField
                              label="Teléfono"
                              value={formatField(tenant.admin_user?.phone)}
                            />
                            <DetailField
                              label="Alta"
                              value={formatDateTime(tenant.admin_user?.created_at)}
                            />
                          </div>
                        </section>

                        <section className="space-y-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
                              Recuperación
                            </p>
                            <h3 className="mt-1 text-base font-semibold text-slate-100">
                              Acceso del administrador
                            </h3>
                          </div>
                          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                            <p className="text-sm text-slate-300">
                              Envía un correo de restablecimiento al administrador principal
                              para recuperar el acceso de la empresa.
                            </p>
                            <button
                              type="button"
                              onClick={() => void handleSendRecovery(tenant)}
                              disabled={
                                recoveringTenantId === tenant.id || !tenant.admin_user?.email
                              }
                              className="mt-4 rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-white disabled:opacity-60"
                            >
                              {recoveringTenantId === tenant.id
                                ? "Enviando correo..."
                                : "Enviar recuperación"}
                            </button>
                          </div>
                        </section>
                      </div>

                      <section className="space-y-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
                            Configuración del cliente
                          </p>
                          <h3 className="mt-1 text-base font-semibold text-slate-100">
                            Detalles de empresa cargados en Metrik
                          </h3>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                          <DetailField
                            label="Razón social"
                            value={formatField(tenant.company_details?.company_name)}
                          />
                          <DetailField
                            label="Identificación"
                            value={formatField(tenant.company_details?.tax_id)}
                          />
                          <DetailField
                            label="Correo de contacto"
                            value={formatField(tenant.company_details?.contact_email)}
                          />
                          <DetailField
                            label="Teléfono de contacto"
                            value={formatField(tenant.company_details?.contact_phone)}
                          />
                          <DetailField
                            label="Dirección"
                            value={formatField(tenant.company_details?.address)}
                          />
                        </div>
                      </section>

                      <section className="space-y-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
                            Módulos
                          </p>
                          <h3 className="mt-1 text-base font-semibold text-slate-100">
                            Módulos activos para esta empresa
                          </h3>
                          <p className="text-sm text-slate-400">
                            Los obligatorios quedan fijos. Los opcionales pueden
                            activarse o desactivarse desde aquí.
                          </p>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          {getVisibleModuleCatalog(tenant).map((moduleDef) => {
                            const enabled = isTenantModuleEnabled(
                              tenant.enabled_modules,
                              moduleDef.id,
                              tenant.module_catalog
                            );
                            const locked = moduleDef.required;
                            return (
                              <div
                                key={`${tenant.id}-${moduleDef.id}`}
                                className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-semibold text-slate-100">
                                      {moduleDef.label}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-400">
                                      {moduleDef.description}
                                    </p>
                                  </div>
                                  <span
                                    className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${
                                      locked
                                        ? "bg-sky-500/15 text-sky-200"
                                        : enabled
                                        ? "bg-emerald-500/15 text-emerald-200"
                                        : "bg-slate-700/50 text-slate-300"
                                    }`}
                                  >
                                    {locked ? "Base" : enabled ? "Activo" : "Inactivo"}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => void handleToggleTenantModule(tenant, moduleDef.id)}
                                  disabled={locked || updatingTenantId === tenant.id}
                                  className={`mt-4 w-full rounded-lg px-3 py-2 text-sm font-semibold transition ${
                                    locked
                                      ? "cursor-not-allowed border border-slate-700 text-slate-500"
                                      : enabled
                                      ? "border border-rose-400/40 text-rose-200 hover:bg-rose-500/10"
                                      : "border border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/10"
                                  }`}
                                >
                                  {locked
                                    ? "Módulo obligatorio"
                                    : updatingTenantId === tenant.id
                                    ? "Guardando..."
                                    : enabled
                                    ? "Desactivar módulo"
                                    : "Activar módulo"}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </section>

                      {feedback && (
                        <div
                          className={`rounded-xl border px-4 py-3 text-sm ${
                            feedback.kind === "success"
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                              : "border-rose-500/30 bg-rose-500/10 text-rose-200"
                          }`}
                        >
                          {feedback.text}
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
            {!filteredTenants.length && (
              <p className="text-sm text-slate-400">No hay empresas aún.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

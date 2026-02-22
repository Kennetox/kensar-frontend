"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../providers/AuthProvider";
import {
  fetchHrEmployees,
  type HrEmployeeRecord,
  type SystemRole,
} from "@/lib/api/hr";

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-CO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HrPage() {
  const { token } = useAuth();
  const [employees, setEmployees] = useState<HrEmployeeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"Todos" | SystemRole | "Sin acceso">(
    "Todos"
  );
  const [statusFilter, setStatusFilter] = useState<"Todos" | HrEmployeeRecord["status"]>(
    "Activo"
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
    });
    fetchHrEmployees(token)
      .then((rows) => {
        if (cancelled) return;
        setEmployees(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Error al cargar empleados.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const activeCount = useMemo(
    () => employees.filter((item) => item.status === "Activo").length,
    [employees]
  );
  const filteredEmployees = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return employees.filter((employee) => {
      const systemRole = employee.system_user?.role ?? "Sin acceso";
      if (roleFilter !== "Todos" && systemRole !== roleFilter) return false;
      if (statusFilter !== "Todos" && employee.status !== statusFilter) return false;
      if (!normalizedSearch) return true;
      return (
        employee.name.toLowerCase().includes(normalizedSearch) ||
        (employee.email || "").toLowerCase().includes(normalizedSearch)
      );
    });
  }, [employees, roleFilter, search, statusFilter]);

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Recursos humanos</h1>
        <p className="ui-text-muted mt-1">
          Empleados HR separados del acceso al sistema.
        </p>
        <div className="mt-3">
          <Link
            href="/dashboard/hr/new"
            prefetch={false}
            className="rounded-md border ui-border px-3 py-2 text-sm hover:bg-white/60 transition"
          >
            Nuevo empleado
          </Link>
        </div>
      </header>

      <div className="grid gap-2 sm:grid-cols-3 lg:max-w-2xl">
        <article className="rounded-xl border ui-border dashboard-card px-3 py-2">
          <p className="text-xs uppercase tracking-[0.12em] ui-text-muted">Total</p>
          <p className="mt-0.5 text-xl font-semibold leading-tight">{employees.length}</p>
        </article>
        <article className="rounded-xl border ui-border dashboard-card px-3 py-2">
          <p className="text-xs uppercase tracking-[0.12em] ui-text-muted">Activos</p>
          <p className="mt-0.5 text-xl font-semibold leading-tight text-emerald-600">{activeCount}</p>
        </article>
        <article className="rounded-xl border ui-border dashboard-card px-3 py-2">
          <p className="text-xs uppercase tracking-[0.12em] ui-text-muted">Inactivos</p>
          <p className="mt-0.5 text-xl font-semibold leading-tight text-rose-600">
            {Math.max(0, employees.length - activeCount)}
          </p>
        </article>
      </div>

      <article className="rounded-2xl border ui-border dashboard-card overflow-hidden">
        <div className="px-4 py-3 border-b ui-border">
          <h2 className="text-lg font-semibold">Empleados</h2>
        </div>
        <div className="px-4 py-3 border-b ui-border grid gap-3 md:grid-cols-4">
          <label className="text-sm">
            <span className="block mb-1 ui-text-muted">Buscar</span>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nombre o correo"
              className="w-full rounded-lg border ui-border bg-white/80 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="block mb-1 ui-text-muted">Acceso (rol)</span>
            <select
              value={roleFilter}
              onChange={(event) =>
                setRoleFilter(
                  event.target.value as "Todos" | SystemRole | "Sin acceso"
                )
              }
              className="w-full rounded-lg border ui-border bg-white/80 px-3 py-2"
            >
              <option value="Todos">Todos</option>
              <option value="Administrador">Administrador</option>
              <option value="Supervisor">Supervisor</option>
              <option value="Vendedor">Vendedor</option>
              <option value="Auditor">Auditor</option>
              <option value="Sin acceso">Sin acceso</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="block mb-1 ui-text-muted">Estado HR</span>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as "Todos" | HrEmployeeRecord["status"])
              }
              className="w-full rounded-lg border ui-border bg-white/80 px-3 py-2"
            >
              <option value="Todos">Todos</option>
              <option value="Activo">Activo</option>
              <option value="Inactivo">Inactivo</option>
            </select>
          </label>
          <div className="text-sm flex items-end">
            <p className="ui-text-muted">
              Mostrando <strong>{filteredEmployees.length}</strong> de{" "}
              <strong>{employees.length}</strong> empleados.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="text-left border-b ui-border">
                <th className="px-4 py-2 font-semibold">Nombre</th>
                <th className="px-4 py-2 font-semibold">Correo</th>
                <th className="px-4 py-2 font-semibold">Acceso</th>
                <th className="px-4 py-2 font-semibold">Estado HR</th>
                <th className="px-4 py-2 font-semibold">Cargo</th>
                <th className="px-4 py-2 font-semibold">Telefono</th>
                <th className="px-4 py-2 font-semibold">Creado</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-4 ui-text-muted" colSpan={7}>
                    Cargando empleados...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td className="px-4 py-4 text-rose-600" colSpan={7}>
                    {error}
                  </td>
                </tr>
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 ui-text-muted" colSpan={7}>
                    No se encontraron empleados con esos filtros.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((employee) => (
                  <tr
                    key={employee.id}
                    className={[
                      "border-b ui-border last:border-b-0",
                      employee.system_user?.status === "Inactivo"
                        ? "bg-rose-50/40"
                        : employee.status === "Inactivo"
                          ? "bg-amber-50/40"
                        : "",
                    ].join(" ")}
                  >
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/dashboard/hr/${employee.id}`}
                          prefetch={false}
                          className="text-emerald-700 hover:underline"
                        >
                          {employee.name}
                        </Link>
                        {employee.system_user?.status === "Inactivo" && (
                          <span className="rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                            Acceso inactivo
                          </span>
                        )}
                        {employee.status === "Inactivo" && (
                          <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                            HR inactivo
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">{employee.email || "-"}</td>
                    <td className="px-4 py-3">
                      {employee.system_user
                        ? `${employee.system_user.role} (${employee.system_user.status})`
                        : "Sin acceso"}
                    </td>
                    <td className="px-4 py-3">{employee.status}</td>
                    <td className="px-4 py-3">{employee.position || "-"}</td>
                    <td className="px-4 py-3">{employee.phone || "-"}</td>
                    <td className="px-4 py-3">{formatDateTime(employee.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

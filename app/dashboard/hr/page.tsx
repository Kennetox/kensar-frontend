"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../providers/AuthProvider";
import { fetchHrEmployees, type HrEmployeeRecord } from "@/lib/api/hr";

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

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Recursos humanos</h1>
        <p className="ui-text-muted mt-1">
          Fase 1: listado base de empleados y estado actual.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-2xl border ui-border dashboard-card px-4 py-3">
          <p className="text-xs uppercase tracking-[0.12em] ui-text-muted">Total</p>
          <p className="mt-1 text-2xl font-semibold">{employees.length}</p>
        </article>
        <article className="rounded-2xl border ui-border dashboard-card px-4 py-3">
          <p className="text-xs uppercase tracking-[0.12em] ui-text-muted">Activos</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-600">{activeCount}</p>
        </article>
        <article className="rounded-2xl border ui-border dashboard-card px-4 py-3">
          <p className="text-xs uppercase tracking-[0.12em] ui-text-muted">Inactivos</p>
          <p className="mt-1 text-2xl font-semibold text-rose-600">
            {Math.max(0, employees.length - activeCount)}
          </p>
        </article>
      </div>

      <article className="rounded-2xl border ui-border dashboard-card overflow-hidden">
        <div className="px-4 py-3 border-b ui-border">
          <h2 className="text-lg font-semibold">Empleados</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left border-b ui-border">
                <th className="px-4 py-2 font-semibold">Nombre</th>
                <th className="px-4 py-2 font-semibold">Correo</th>
                <th className="px-4 py-2 font-semibold">Rol</th>
                <th className="px-4 py-2 font-semibold">Estado</th>
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
              ) : employees.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 ui-text-muted" colSpan={7}>
                    No hay empleados registrados.
                  </td>
                </tr>
              ) : (
                employees.map((employee) => (
                  <tr key={employee.id} className="border-b ui-border last:border-b-0">
                    <td className="px-4 py-3 font-medium">{employee.name}</td>
                    <td className="px-4 py-3">{employee.email}</td>
                    <td className="px-4 py-3">{employee.role}</td>
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

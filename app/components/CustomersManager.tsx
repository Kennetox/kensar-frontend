"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "../providers/AuthProvider";
import { getApiBase } from "@/lib/api/base";

type Customer = {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  tax_id?: string | null;
  address?: string | null;
  is_active?: boolean;
  created_at?: string;
};

type CustomerForm = {
  name: string;
  phone: string;
  email: string;
  tax_id: string;
  address: string;
  is_active: boolean;
};

type StatusFilter = "active" | "inactive" | "all";
type SegmentFilter =
  | "all"
  | "with_email"
  | "with_phone"
  | "with_tax_id"
  | "web_guest"
  | "without_contact";

const EMPTY_FORM: CustomerForm = {
  name: "",
  phone: "",
  email: "",
  tax_id: "",
  address: "",
  is_active: true,
};

const PAGE_SIZE = 25;

function isGuestWebCustomer(customer: Customer): boolean {
  const email = (customer.email ?? "").toLowerCase();
  return email.includes("__guest_checkout__");
}

function hasAnyContact(customer: Customer): boolean {
  return Boolean(customer.phone || customer.email);
}

function formatDateLabel(raw?: string): string {
  if (!raw) return "Sin fecha";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-CO", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

export default function CustomersManager() {
  const { token } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>("all");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM);

  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : null),
    [token]
  );

  const apiBase = getApiBase();

  const includeInactive = statusFilter !== "active";

  async function loadCustomers(targetPage = pageIndex) {
    if (!authHeaders) return;
    try {
      setLoading(true);
      setError(null);
      const term = search.trim();
      const params = new URLSearchParams({
        search: term,
        skip: String(targetPage * PAGE_SIZE),
        limit: PAGE_SIZE.toString(),
      });
      if (includeInactive) {
        params.set("include_inactive", "true");
      }

      const res = await fetch(`${apiBase}/pos/customers?${params.toString()}`, {
        headers: authHeaders,
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`Error ${res.status}`);
      }

      const data = await res.json();
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
        ? data.items
        : [];

      if (list.length === 0 && targetPage > 0) {
        // Si una eliminación deja la página vacía, volvemos a la anterior.
        await loadCustomers(targetPage - 1);
        return;
      }

      setCustomers(list);
      setPageIndex(targetPage);
      setHasNextPage(list.length === PAGE_SIZE);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "No se pudieron cargar los clientes."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPageIndex(0);
    void loadCustomers(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authHeaders, statusFilter]);

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      const isActive = customer.is_active !== false;
      if (statusFilter === "active" && !isActive) return false;
      if (statusFilter === "inactive" && isActive) return false;

      if (segmentFilter === "with_email" && !customer.email) return false;
      if (segmentFilter === "with_phone" && !customer.phone) return false;
      if (segmentFilter === "with_tax_id" && !customer.tax_id) return false;
      if (segmentFilter === "web_guest" && !isGuestWebCustomer(customer)) return false;
      if (segmentFilter === "without_contact" && hasAnyContact(customer)) return false;

      return true;
    });
  }, [customers, statusFilter, segmentFilter]);

  const summary = useMemo(() => {
    const active = customers.filter((c) => c.is_active !== false).length;
    const withEmail = customers.filter((c) => Boolean(c.email)).length;
    const withPhone = customers.filter((c) => Boolean(c.phone)).length;
    const guests = customers.filter((c) => isGuestWebCustomer(c)).length;
    return { active, withEmail, withPhone, guests };
  }, [customers]);

  function openCreateModal() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFeedback(null);
    setIsModalOpen(true);
  }

  function openEditModal(customer: Customer) {
    setEditingId(customer.id);
    setForm({
      name: customer.name,
      phone: customer.phone ?? "",
      email: customer.email ?? "",
      tax_id: customer.tax_id ?? "",
      address: customer.address ?? "",
      is_active: customer.is_active !== false,
    });
    setFeedback(null);
    setIsModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setIsModalOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!authHeaders) return;
    if (!form.name.trim()) {
      setFeedback("El nombre es obligatorio.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      tax_id: form.tax_id.trim() || undefined,
      address: form.address.trim() || undefined,
      is_active: form.is_active,
    };

    try {
      setSaving(true);
      setError(null);

      if (editingId) {
        const res = await fetch(`${apiBase}/pos/customers/${editingId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders,
          },
          credentials: "include",
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          throw new Error(`Error ${res.status}`);
        }
      } else {
        const res = await fetch(`${apiBase}/pos/customers`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders,
          },
          credentials: "include",
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          throw new Error(`Error ${res.status}`);
        }
      }

      setFeedback(editingId ? "Cliente actualizado." : "Cliente creado.");
      closeModal();
      await loadCustomers(pageIndex);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "No se pudo guardar el cliente.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!authHeaders) return;
    const confirmDelete = window.confirm(
      "¿Eliminar este cliente? Podrás volver a crearlo más adelante."
    );
    if (!confirmDelete) return;

    try {
      setLoading(true);
      const res = await fetch(`${apiBase}/pos/customers/${id}`, {
        method: "DELETE",
        headers: authHeaders,
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`Error ${res.status}`);
      }

      setFeedback("Cliente eliminado correctamente.");
      await loadCustomers(pageIndex);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "No se pudo eliminar el cliente.");
    } finally {
      setLoading(false);
    }
  }

  function handlePrevPage() {
    if (loading || pageIndex === 0) return;
    void loadCustomers(pageIndex - 1);
  }

  function handleNextPage() {
    if (loading || !hasNextPage) return;
    void loadCustomers(pageIndex + 1);
  }

  return (
    <main className="flex-1 px-6 py-6">
      <div className="w-full max-w-7xl mx-auto space-y-5">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Gestión central de clientes</h1>
            <p className="text-sm text-slate-600 mt-1">
              Centraliza clientes de POS y web, filtra rápido y gestiona su perfil en un solo lugar.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
              disabled={loading || saving}
            >
              + Crear nuevo cliente
            </button>
            <Link
              href="/dashboard/documents"
              className="inline-flex items-center gap-2 px-4 py-2 text-xs rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              ← Volver a Documentos
            </Link>
          </div>
        </header>

        {(error || feedback) && (
          <div
            className={`rounded-md border px-4 py-3 text-sm ${
              error
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {error ?? feedback}
          </div>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
          <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr_1fr_auto] lg:items-end">
            <div>
              <label className="text-xs font-medium text-slate-600">Buscar cliente</label>
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPageIndex(0);
                }}
                placeholder="Nombre, teléfono, correo o NIT"
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600">Estado</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
              >
                <option value="active">Activos</option>
                <option value="inactive">Inactivos</option>
                <option value="all">Todos</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600">Segmento</label>
              <select
                value={segmentFilter}
                onChange={(e) => setSegmentFilter(e.target.value as SegmentFilter)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
              >
                <option value="all">Todos</option>
                <option value="with_email">Con correo</option>
                <option value="with_phone">Con teléfono</option>
                <option value="with_tax_id">Con documento</option>
                <option value="without_contact">Sin contacto</option>
                <option value="web_guest">Invitados web</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => {
                setPageIndex(0);
                void loadCustomers(0);
              }}
              className="h-[38px] rounded-md border border-emerald-300 px-4 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
              disabled={loading || saving}
            >
              {loading ? "Actualizando..." : "Aplicar"}
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Cargados</p>
              <p className="text-2xl font-semibold text-slate-900">{customers.length}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Activos</p>
              <p className="text-2xl font-semibold text-slate-900">{summary.active}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Con correo</p>
              <p className="text-2xl font-semibold text-slate-900">{summary.withEmail}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Invitados web</p>
              <p className="text-2xl font-semibold text-slate-900">{summary.guests}</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between bg-slate-50 px-4 py-3 border-b border-slate-200">
              <div>
                <p className="text-sm font-semibold text-slate-800">Clientes filtrados</p>
                <p className="text-xs text-slate-500">
                  Página {pageIndex + 1} · Mostrando {filteredCustomers.length} de {customers.length} cargados
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={handlePrevPage}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-white disabled:opacity-60"
                  disabled={loading || saving || pageIndex === 0}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={handleNextPage}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-white disabled:opacity-60"
                  disabled={loading || saving || !hasNextPage}
                >
                  Siguiente
                </button>
              </div>
            </div>

            <div className="max-h-[35rem] overflow-y-auto divide-y divide-slate-200">
              {filteredCustomers.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  No encontramos clientes con los filtros actuales.
                </div>
              ) : (
                filteredCustomers.map((customer) => {
                  const active = customer.is_active !== false;
                  return (
                    <div key={customer.id} className="px-4 py-3 bg-white">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-slate-900 truncate">{customer.name}</p>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                active
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-slate-200 text-slate-700"
                              }`}
                            >
                              {active ? "Activo" : "Inactivo"}
                            </span>
                            {isGuestWebCustomer(customer) && (
                              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                                Invitado web
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                            <span>{customer.phone || "Sin teléfono"}</span>
                            {customer.email ? <span>{customer.email}</span> : <span>Sin correo</span>}
                            {customer.tax_id ? <span>ID: {customer.tax_id}</span> : <span>Sin documento</span>}
                            <span>Creado: {formatDateLabel(customer.created_at)}</span>
                          </div>
                          {customer.address && (
                            <p className="mt-1 text-xs text-slate-500 truncate">
                              Dirección: {customer.address}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(customer)}
                            className="rounded-md border border-sky-300 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(customer.id)}
                            className="rounded-md border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-900">
                {editingId ? "Editar cliente" : "Crear nuevo cliente"}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                disabled={saving}
              >
                Cerrar
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-slate-600">Nombre completo *</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-600">Teléfono</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-600">Correo electrónico</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-600">NIT / documento</label>
                  <input
                    value={form.tax_id}
                    onChange={(e) => setForm((prev) => ({ ...prev, tax_id: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-600">Dirección</label>
                  <input
                    value={form.address}
                    onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {editingId && (
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, is_active: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  Cliente activo
                </label>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-md border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                  disabled={saving}
                >
                  {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Crear cliente"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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
};

const EMPTY_FORM: CustomerForm = {
  name: "",
  phone: "",
  email: "",
  tax_id: "",
  address: "",
};

export default function CustomersManager() {
  const { token } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : null),
    [token]
  );

  const apiBase = getApiBase();
  const loadedCountRef = useRef(0);
  const lastQueryRef = useRef("");
  const PAGE_SIZE = 50;

  async function loadCustomers(append = false) {
    if (!authHeaders) return;
    try {
      setLoading(true);
      setError(null);
      if (!append) {
        loadedCountRef.current = 0;
      }
      const term = append ? lastQueryRef.current : search.trim();
      const params = new URLSearchParams({
        search: term,
        skip: append ? String(loadedCountRef.current) : "0",
        limit: PAGE_SIZE.toString(),
      });
      const res = await fetch(`${apiBase}/pos/customers?${params}`, {
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
      setCustomers((prev) => (append ? [...prev, ...list] : list));
      loadedCountRef.current = append
        ? loadedCountRef.current + list.length
        : list.length;
      lastQueryRef.current = term;
      setHasMore(list.length === PAGE_SIZE);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar los clientes."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCustomers(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authHeaders]);

  function handleLoadMore() {
    void loadCustomers(true);
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
      is_active: true,
    };
    try {
      setLoading(true);
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
      setForm(EMPTY_FORM);
      setEditingId(null);
      setFeedback(editingId ? "Cliente actualizado." : "Cliente creado.");
      void loadCustomers();
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar el cliente."
      );
    } finally {
      setLoading(false);
    }
  }

  function handleEdit(customer: Customer) {
    setEditingId(customer.id);
    setForm({
      name: customer.name,
      phone: customer.phone ?? "",
      email: customer.email ?? "",
      tax_id: customer.tax_id ?? "",
      address: customer.address ?? "",
    });
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
      if (editingId === id) {
        setEditingId(null);
        setForm(EMPTY_FORM);
      }
      setFeedback("Cliente eliminado correctamente.");
      void loadCustomers();
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo eliminar el cliente."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex-1 px-6 py-6">
      <div className="w-full max-w-6xl mx-auto space-y-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-50">
              Gestión de clientes
            </h1>
            <p className="text-sm text-slate-400">
              Crea, actualiza o elimina clientes almacenados en el POS.
            </p>
            {error && (
              <p className="text-[11px] text-rose-300 mt-2">Error: {error}</p>
            )}
          </div>
          <Link
            href="/dashboard/documents"
            className="inline-flex items-center gap-2 px-4 py-2 text-xs rounded-md border border-slate-700 text-slate-200 hover:bg-slate-800"
          >
            ← Volver a Documentos
          </Link>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <label className="text-xs text-slate-400">
                Buscar cliente
              </label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nombre, teléfono, correo o NIT"
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-400"
              />
            </div>
            <button
              type="button"
              onClick={() => void loadCustomers(false)}
              className="px-4 py-2 rounded-md border border-emerald-400/70 text-emerald-300 text-xs hover:bg-emerald-500/10 transition"
              disabled={loading}
            >
              {loading ? "Actualizando..." : "Buscar"}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <form
              onSubmit={handleSubmit}
              className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-200">
                  {editingId ? "Editar cliente" : "Nuevo cliente"}
                </h2>
                {editingId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setForm(EMPTY_FORM);
                    }}
                    className="text-[11px] text-slate-400 underline"
                  >
                    Cancelar edición
                  </button>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-[11px] text-slate-400">
                  Nombre completo *
                </label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] text-slate-400">Teléfono</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                  className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] text-slate-400">
                  Correo electrónico
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] text-slate-400">NIT / documento</label>
                <input
                  value={form.tax_id}
                  onChange={(e) => setForm((prev) => ({ ...prev, tax_id: e.target.value }))}
                  className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] text-slate-400">Dirección</label>
                <input
                  value={form.address}
                  onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                  className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold py-2 transition"
                disabled={loading}
              >
                {editingId ? "Guardar cambios" : "Crear cliente"}
              </button>
              {feedback && (
                <p className="text-xs text-emerald-300">{feedback}</p>
              )}
            </form>

            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-200">
                  Clientes ({customers.length})
                </h2>
                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => void loadCustomers(false)}
                    className="text-slate-400 underline"
                    disabled={loading}
                  >
                    Refrescar
                  </button>
                  {hasMore && (
                    <button
                      type="button"
                      onClick={handleLoadMore}
                      className="text-slate-400 underline"
                      disabled={loading}
                    >
                      Cargar más
                    </button>
                  )}
                </div>
              </div>
              <div className="max-h-[28rem] overflow-y-auto divide-y divide-slate-800 border border-slate-800 rounded-lg">
                {customers.length === 0 ? (
                  <div className="p-4 text-sm text-slate-500 text-center">
                    No hay clientes registrados.
                  </div>
                ) : (
                  customers.map((customer) => (
                    <div
                      key={customer.id}
                      className="p-3 text-sm text-slate-200 flex flex-col gap-1 bg-slate-900/50"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{customer.name}</span>
                        <div className="flex gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => handleEdit(customer)}
                            className="text-sky-300 hover:text-sky-200 underline"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(customer.id)}
                            className="text-rose-300 hover:text-rose-200 underline"
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {customer.phone ?? "Sin teléfono"}
                      </div>
                      {customer.email && (
                        <div className="text-[11px] text-slate-400">
                          {customer.email}
                        </div>
                      )}
                      {customer.tax_id && (
                        <div className="text-[11px] text-slate-400">
                          NIT / ID: {customer.tax_id}
                        </div>
                      )}
                      {customer.address && (
                        <div className="text-[11px] text-slate-400">
                          Dirección: {customer.address}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "../../providers/AuthProvider";
import { getApiBase } from "@/lib/api/base";
import { PosCustomer, usePos } from "../poscontext";

type ApiCustomer = {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  tax_id?: string | null;
  address?: string | null;
};

type CustomerForm = {
  name: string;
  phone: string;
  email: string;
  tax_id: string;
  address: string;
};

type CustomerPanelProps = {
  variant?: "sidebar" | "page";
  onCustomerSelected?: (customer: PosCustomer) => void;
};

const EMPTY_FORM: CustomerForm = {
  name: "",
  phone: "",
  email: "",
  tax_id: "",
  address: "",
};

export default function CustomerPanel({
  variant = "sidebar",
  onCustomerSelected,
}: CustomerPanelProps) {
  const { selectedCustomer, setSelectedCustomer } = usePos();
  const { token } = useAuth();
  const [mode, setMode] = useState<"none" | "search" | "new">("none");
  const [customers, setCustomers] = useState<ApiCustomer[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM);
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : null),
    [token]
  );
  const apiBase = getApiBase();
  const loadedCountRef = useRef(0);
  const lastQueryRef = useRef("");
  const PAGE_SIZE = 25;

  const mapCustomer = useCallback((customer: ApiCustomer): PosCustomer => {
    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone ?? undefined,
      email: customer.email ?? undefined,
      taxId: customer.tax_id ?? undefined,
      address: customer.address ?? undefined,
    };
  }, []);

  const fetchCustomers = useCallback(
    async (term: string, append = false) => {
      if (!authHeaders) return;
      try {
        setLoading(true);
        if (!append) {
          loadedCountRef.current = 0;
        }
        const normalized = term.trim();
        const params = new URLSearchParams({
          search: normalized,
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
        const list: ApiCustomer[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.items)
          ? data.items
          : [];
        setCustomers((prev) => (append ? [...prev, ...list] : list));
        loadedCountRef.current = append
          ? loadedCountRef.current + list.length
          : list.length;
        lastQueryRef.current = normalized;
        setHasMore(list.length === PAGE_SIZE);
      } catch (err) {
        console.error(err);
        setFeedback(
          err instanceof Error
            ? err.message
            : "No se pudieron cargar los clientes."
        );
      } finally {
        setLoading(false);
      }
    },
    [authHeaders, apiBase]
  );

  useEffect(() => {
    if (!authHeaders) return;
    void fetchCustomers("", false);
  }, [authHeaders, fetchCustomers]);

  useEffect(() => {
    if (mode !== "search") return;
    const handler = setTimeout(() => {
      void fetchCustomers(search, false);
    }, 400);
    return () => clearTimeout(handler);
  }, [mode, search, fetchCustomers]);

  function handleLoadMore() {
    void fetchCustomers(lastQueryRef.current, true);
  }

  function handleSelectCustomer(customer: ApiCustomer) {
    setSelectedCustomer(mapCustomer(customer));
    setMode("none");
    setFeedback(null);
    if (onCustomerSelected) {
      onCustomerSelected(mapCustomer(customer));
    }
  }

  async function handleCreateCustomer(event: React.FormEvent) {
    event.preventDefault();
    if (!authHeaders) return;
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setFeedback("El nombre del cliente es obligatorio.");
      return;
    }
    const payload = {
      name: trimmedName,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      tax_id: form.tax_id.trim() || undefined,
      address: form.address.trim() || undefined,
      is_active: true,
    };
    try {
      setLoading(true);
      const res = await fetch(`${apiBase}/pos/customers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const saved: ApiCustomer = await res.json();
      setForm(EMPTY_FORM);
      setMode("none");
      const mapped = mapCustomer(saved);
      setSelectedCustomer(mapped);
      setFeedback("Cliente guardado y asignado a la venta.");
      if (onCustomerSelected) {
        onCustomerSelected(mapped);
      }
      void fetchCustomers(search);
    } catch (err) {
      console.error(err);
      setFeedback(
        err instanceof Error
          ? err.message
          : "No se pudo guardar el cliente."
      );
    } finally {
      setLoading(false);
    }
  }

  function handleRemoveSelection() {
    setSelectedCustomer(null);
  }

  function toggleMode(next: "search" | "new") {
    setFeedback(null);
    setMode((prev) => (prev === next ? "none" : next));
  }

  const containerClass =
    variant === "page"
      ? "w-full max-w-3xl bg-slate-950/80 border border-slate-800/80 rounded-2xl px-5 py-5 shadow-xl flex flex-col overflow-hidden"
      : "w-[19rem] border-l border-slate-800 bg-slate-950/50 px-5 py-5 flex flex-col gap-4 overflow-hidden";

  const listContainerClass =
    variant === "page"
      ? "flex-1 min-h-[18rem] overflow-y-auto rounded-lg border border-slate-800/60 bg-slate-950/40 divide-y divide-slate-800/60"
      : "flex-1 min-h-[12rem] overflow-y-auto rounded-lg border border-slate-800/60 bg-slate-950/40 divide-y divide-slate-800/60";

  return (
    <section className={containerClass}>
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
        Cliente
      </div>

      {!authHeaders ? (
        <div className="text-sm text-slate-400">
          Inicia sesión para gestionar clientes.
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-3 text-xs shadow-inner">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[11px] font-semibold text-slate-200">
                {selectedCustomer
                  ? selectedCustomer.name.slice(0, 2).toUpperCase()
                  : "CL"}
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-400">
                  Cliente actual
                </div>
                <div className="text-[13px] text-slate-200">
                  {selectedCustomer ? selectedCustomer.name : "Sin cliente asignado"}
                </div>
              </div>
            </div>

            {selectedCustomer ? (
              <div className="space-y-1 text-[12px] text-slate-300">
                {selectedCustomer.phone && <div>Tel: {selectedCustomer.phone}</div>}
                {selectedCustomer.email && <div>Email: {selectedCustomer.email}</div>}
                {selectedCustomer.taxId && <div>NIT/ID: {selectedCustomer.taxId}</div>}
                {selectedCustomer.address && <div>Dirección: {selectedCustomer.address}</div>}
                <button
                  type="button"
                  onClick={handleRemoveSelection}
                  className="mt-2 text-[11px] text-rose-300 hover:text-rose-200 underline"
                >
                  Quitar cliente
                </button>
              </div>
            ) : (
              <div className="text-slate-500 text-[12px] leading-relaxed">
                Selecciona un cliente existente o crea uno nuevo.
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => toggleMode("search")}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                mode === "search"
                  ? "border-sky-400 bg-sky-500/10 text-sky-100 shadow-inner"
                  : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
              }`}
            >
              Cliente existente
            </button>
            <button
              type="button"
              onClick={() => toggleMode("new")}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                mode === "new"
                  ? "border-emerald-400 bg-emerald-500/10 text-emerald-100 shadow-inner"
                  : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
              }`}
            >
              Nuevo cliente
            </button>
          </div>

          {mode === "search" && (
            <div className="mt-4 text-xs flex flex-col gap-3 min-h-[12rem] flex-1">
              <div>
                <label className="text-[11px] text-slate-400">Buscar</label>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nombre, teléfono o NIT"
                  className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-400"
                />
              </div>
              <div className={listContainerClass}>
                {loading && customers.length === 0 ? (
                  <div className="p-3 text-[11px] text-slate-400">
                    Cargando clientes...
                  </div>
                ) : customers.length === 0 ? (
                  <div className="p-3 text-[11px] text-slate-500">
                    No hay clientes que coincidan con la búsqueda.
                  </div>
                ) : (
                  customers.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => handleSelectCustomer(customer)}
                      className="w-full text-left p-3 hover:bg-slate-900/60 focus:bg-slate-900/70 transition"
                    >
                      <div className="font-semibold text-slate-100">
                        {customer.name}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {customer.phone ?? "Sin teléfono"}
                      </div>
                    </button>
                  ))
                )}
              </div>
              {hasMore && (
                <button
                  type="button"
                  onClick={handleLoadMore}
                  className="w-full rounded-md border border-slate-700 py-2 text-[11px] text-slate-200 hover:border-emerald-400 transition"
                  disabled={loading}
                >
                  {loading ? "Cargando..." : "Cargar más resultados"}
                </button>
              )}
            </div>
          )}

          {mode === "new" && (
            <form onSubmit={handleCreateCustomer} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="text-[11px] text-slate-400">
                  Nombre completo *
                </label>
                <input
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                  placeholder="Ej. Juan Pérez"
                  required
                />
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400">Teléfono</label>
                  <input
                    value={form.phone}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, phone: e.target.value }))
                    }
                    className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                    placeholder="Celular o fijo"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400">
                    Correo electrónico
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, email: e.target.value }))
                    }
                    className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                    placeholder="cliente@correo.com"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400">
                    NIT / Documento
                  </label>
                  <input
                    value={form.tax_id}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, tax_id: e.target.value }))
                    }
                    className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                    placeholder="CC o NIT"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400">Dirección</label>
                  <input
                    value={form.address}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, address: e.target.value }))
                    }
                    className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                    placeholder="Dirección principal"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold py-2 transition"
                disabled={loading}
              >
                Guardar y asignar
              </button>
            </form>
          )}

          {feedback && (
            <div className="mt-3 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-400/40 rounded-md px-3 py-2">
              {feedback}
            </div>
          )}
        </>
      )}
    </section>
  );
}

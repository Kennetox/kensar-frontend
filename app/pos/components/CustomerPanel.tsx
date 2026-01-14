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
  const [pageIndex, setPageIndex] = useState(0);
  const [pendingDuplicateMatches, setPendingDuplicateMatches] = useState<
    ApiCustomer[]
  >([]);
  const [duplicateOverride, setDuplicateOverride] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<ApiCustomer | null>(null);

  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : null),
    [token]
  );
  const apiBase = getApiBase();
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
    async (term: string, page = 0) => {
      if (!authHeaders) return;
      try {
        setLoading(true);
        const normalized = term.trim();
        const params = new URLSearchParams({
          search: normalized,
          skip: String(page * PAGE_SIZE),
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
        setCustomers(list);
        lastQueryRef.current = normalized;
        setHasMore(list.length === PAGE_SIZE);
        setPageIndex(page);
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
    void fetchCustomers("", 0);
  }, [authHeaders, fetchCustomers]);

  useEffect(() => {
    if (mode !== "search") return;
    const handler = setTimeout(() => {
      void fetchCustomers(search, 0);
    }, 400);
    return () => clearTimeout(handler);
  }, [mode, search, fetchCustomers]);

  function handlePageChange(nextPage: number) {
    if (nextPage < 0) return;
    if (!hasMore && nextPage > pageIndex) return;
    void fetchCustomers(lastQueryRef.current, nextPage);
  }

  function handleSelectCustomer(customer: ApiCustomer) {
    setSelectedCustomer(mapCustomer(customer));
    setMode("none");
    setFeedback(null);
    if (onCustomerSelected) {
      onCustomerSelected(mapCustomer(customer));
    }
  }

  const submitCustomer = useCallback(async () => {
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
      const res = await fetch(
        editingCustomer
          ? `${apiBase}/pos/customers/${editingCustomer.id}`
          : `${apiBase}/pos/customers`,
        {
          method: editingCustomer ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders,
          },
          credentials: "include",
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const saved: ApiCustomer = await res.json();
      setForm(EMPTY_FORM);
      setMode("none");
      setDuplicateOverride(false);
      setPendingDuplicateMatches([]);
      setEditingCustomer(null);
      const mapped = mapCustomer(saved);
      setSelectedCustomer(mapped);
      setFeedback(
        editingCustomer
          ? "Cliente actualizado y asignado a la venta."
          : "Cliente guardado y asignado a la venta."
      );
      if (onCustomerSelected) {
        onCustomerSelected(mapped);
      }
      void fetchCustomers(search, 0);
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
  }, [
    apiBase,
    authHeaders,
    editingCustomer,
    fetchCustomers,
    form.address,
    form.email,
    form.name,
    form.phone,
    form.tax_id,
    mapCustomer,
    onCustomerSelected,
    search,
    setSelectedCustomer,
  ]);

  async function handleCreateCustomer(event: React.FormEvent) {
    event.preventDefault();
    if (!editingCustomer && !duplicateOverride) {
      const trimmedName = form.name.trim();
      if (!trimmedName) {
        setFeedback("El nombre del cliente es obligatorio.");
        return;
      }
      const matches = await findDuplicateMatches({
        name: trimmedName,
        phone: form.phone,
        email: form.email,
        tax_id: form.tax_id,
      });
      if (matches.length > 0) {
        setPendingDuplicateMatches(matches);
        return;
      }
    }
    await submitCustomer();
  }

  function handleRemoveSelection() {
    setSelectedCustomer(null);
  }

  function toggleMode(next: "search" | "new") {
    setFeedback(null);
    setDuplicateOverride(false);
    setPendingDuplicateMatches([]);
    if (next === "search") {
      setEditingCustomer(null);
      setForm(EMPTY_FORM);
    }
    setMode((prev) => (prev === next ? "none" : next));
  }

  const handleEditCustomer = (customer: ApiCustomer) => {
    setEditingCustomer(customer);
    setMode("new");
    setFeedback(null);
    setForm({
      name: customer.name ?? "",
      phone: customer.phone ?? "",
      email: customer.email ?? "",
      tax_id: customer.tax_id ?? "",
      address: customer.address ?? "",
    });
  };

  const handleUseExistingMatch = (customer: ApiCustomer) => {
    const mapped = mapCustomer(customer);
    setSelectedCustomer(mapped);
    setPendingDuplicateMatches([]);
    setDuplicateOverride(false);
    setMode("none");
    setFeedback("Cliente asignado a la venta.");
    if (onCustomerSelected) {
      onCustomerSelected(mapped);
    }
  };

  const handleConfirmCreate = async () => {
    setDuplicateOverride(true);
    setPendingDuplicateMatches([]);
    await submitCustomer();
  };

  const normalizeName = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const normalizePhone = (value: string) =>
    value.replace(/\D/g, "").trim();

  const normalizeTax = (value: string) =>
    value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().trim();

  const hasStrongMatch = (
    candidate: ApiCustomer,
    target: { name: string; phone?: string; email?: string; tax_id?: string }
  ) => {
    const name = normalizeName(target.name);
    const phone = normalizePhone(target.phone ?? "");
    const email = target.email?.trim().toLowerCase() ?? "";
    const tax = normalizeTax(target.tax_id ?? "");

    const candidateName = normalizeName(candidate.name ?? "");
    const candidatePhone = normalizePhone(candidate.phone ?? "");
    const candidateEmail = candidate.email?.trim().toLowerCase() ?? "";
    const candidateTax = normalizeTax(candidate.tax_id ?? "");

    const phoneMatch = phone && candidatePhone && phone === candidatePhone;
    const emailMatch = email && candidateEmail && email === candidateEmail;
    const taxMatch = tax && candidateTax && tax === candidateTax;
    const nameMatch = name && candidateName && name === candidateName;
    const nameStrong = nameMatch && name.length >= 6;
    const hasOtherId = phone || email || tax;
    return (
      phoneMatch ||
      emailMatch ||
      taxMatch ||
      (nameMatch && hasOtherId) ||
      nameStrong
    );
  };

  const findDuplicateMatches = useCallback(
    async (target: {
      name: string;
      phone?: string;
      email?: string;
      tax_id?: string;
    }) => {
      if (!authHeaders) return [];
      const searchTerm = target.name.trim();
      if (!searchTerm) return [];
      const params = new URLSearchParams({
        search: searchTerm,
        skip: "0",
        limit: "15",
      });
      const res = await fetch(`${apiBase}/pos/customers?${params}`, {
        headers: authHeaders,
        credentials: "include",
      });
      if (!res.ok) return [];
      const data = await res.json();
      const list: ApiCustomer[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
        ? data.items
        : [];
      return list.filter((candidate) => hasStrongMatch(candidate, target));
    },
    [apiBase, authHeaders]
  );

  const containerClass =
    variant === "page"
      ? "w-full max-w-5xl bg-slate-950/80 border border-slate-800/80 rounded-3xl px-8 py-8 shadow-xl flex flex-col overflow-hidden"
      : "w-[19rem] border-l border-slate-800 bg-slate-950/50 px-5 py-5 flex flex-col gap-4 overflow-hidden";

  const listContainerClass =
    variant === "page"
      ? "flex-1 min-h-[22rem] max-h-[22rem] overflow-y-auto rounded-2xl border border-slate-800/60 bg-slate-950/40 divide-y divide-slate-800/60"
      : "flex-1 min-h-[12rem] overflow-y-auto rounded-lg border border-slate-800/60 bg-slate-950/40 divide-y divide-slate-800/60";

  return (
    <section className={containerClass}>
      <div className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-4">
        Cliente
      </div>

      {!authHeaders ? (
        <div className="text-sm text-slate-400">
          Inicia sesión para gestionar clientes.
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4 text-sm shadow-inner">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-sm font-semibold text-slate-200">
                {selectedCustomer
                  ? selectedCustomer.name.slice(0, 2).toUpperCase()
                  : "CL"}
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">
                  Cliente actual
                </div>
                <div className="text-base text-slate-200">
                  {selectedCustomer ? selectedCustomer.name : "Sin cliente asignado"}
                </div>
              </div>
            </div>

            {selectedCustomer ? (
              <div className="space-y-1 text-sm text-slate-300">
                {selectedCustomer.phone && <div>Tel: {selectedCustomer.phone}</div>}
                {selectedCustomer.email && <div>Email: {selectedCustomer.email}</div>}
                {selectedCustomer.taxId && <div>NIT/ID: {selectedCustomer.taxId}</div>}
                {selectedCustomer.address && <div>Dirección: {selectedCustomer.address}</div>}
                <button
                  type="button"
                  onClick={handleRemoveSelection}
                  className="mt-2 text-xs text-rose-300 hover:text-rose-200 underline"
                >
                  Quitar cliente
                </button>
              </div>
            ) : (
              <div className="text-slate-500 text-sm leading-relaxed">
                Selecciona un cliente existente o crea uno nuevo.
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 mt-4">
            <button
              type="button"
              onClick={() => toggleMode("search")}
              className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${
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
              className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                mode === "new"
                  ? "border-emerald-400 bg-emerald-500/10 text-emerald-100 shadow-inner"
                  : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
              }`}
            >
              Nuevo cliente
            </button>
          </div>

          {mode === "search" && (
            <div className="mt-5 text-sm flex flex-col gap-4 min-h-[14rem] flex-1">
              <div>
                <label className="text-xs text-slate-400">Buscar</label>
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPageIndex(0);
                  }}
                  placeholder="Nombre, teléfono o NIT"
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-base outline-none focus:border-sky-400"
                />
              </div>
              <div className={listContainerClass}>
                {loading && customers.length === 0 ? (
                  <div className="p-4 text-xs text-slate-400">
                    Cargando clientes...
                  </div>
                ) : customers.length === 0 ? (
                  <div className="p-4 text-xs text-slate-500">
                    No hay clientes que coincidan con la búsqueda.
                  </div>
                ) : (
                  customers.map((customer) => (
                    <div
                      key={customer.id}
                      className="group flex items-center justify-between gap-3 p-4 hover:bg-slate-900/60 transition"
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectCustomer(customer)}
                        className="flex-1 text-left focus:outline-none"
                      >
                        <div className="font-semibold text-base text-slate-100">
                          {customer.name}
                        </div>
                        <div className="text-xs text-slate-400">
                          {customer.phone ?? "Sin teléfono"}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleEditCustomer(customer);
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 text-xs text-slate-300 hover:border-emerald-400 hover:text-emerald-200 transition"
                        aria-label={`Editar ${customer.name}`}
                        title="Editar cliente"
                      >
                        ✎
                      </button>
                    </div>
                  ))
                )}
              </div>
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => handlePageChange(pageIndex - 1)}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-200 hover:border-slate-500 disabled:opacity-40"
                  disabled={loading || pageIndex === 0}
                >
                  Anterior
                </button>
                <span className="text-xs text-slate-400">
                  Página {pageIndex + 1}
                </span>
                <button
                  type="button"
                  onClick={() => handlePageChange(pageIndex + 1)}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-200 hover:border-emerald-400 disabled:opacity-40"
                  disabled={loading || !hasMore}
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}

          {mode === "new" && (
            <form onSubmit={handleCreateCustomer} className="mt-5 space-y-4 text-sm">
              {editingCustomer && (
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-200">
                  Editando: <span className="font-semibold">{editingCustomer.name}</span>
                </div>
              )}
              <div>
                <label className="text-xs text-slate-400">
                  Nombre completo *
                </label>
                <input
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-base outline-none focus:border-emerald-400"
                  placeholder="Ej. Juan Pérez"
                  required
                />
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="text-xs text-slate-400">Teléfono</label>
                  <input
                    value={form.phone}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, phone: e.target.value }))
                    }
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-base outline-none focus:border-emerald-400"
                    placeholder="Celular o fijo"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400">
                    Correo electrónico
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, email: e.target.value }))
                    }
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-base outline-none focus:border-emerald-400"
                    placeholder="cliente@correo.com"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400">
                    NIT / Documento
                  </label>
                  <input
                    value={form.tax_id}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, tax_id: e.target.value }))
                    }
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-base outline-none focus:border-emerald-400"
                    placeholder="CC o NIT"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Dirección</label>
                  <input
                    value={form.address}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, address: e.target.value }))
                    }
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-base outline-none focus:border-emerald-400"
                    placeholder="Dirección principal"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold py-3 transition"
                disabled={loading}
              >
                {editingCustomer ? "Guardar cambios" : "Guardar y asignar"}
              </button>
            </form>
          )}

          {feedback && (
            <div className="mt-4 text-xs text-amber-300 bg-amber-500/10 border border-amber-400/40 rounded-lg px-4 py-3">
              {feedback}
            </div>
          )}
        </>
      )}
      {pendingDuplicateMatches.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-6">
          <div className="w-full max-w-3xl rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-2xl font-semibold text-slate-100">
                  ¿Ya existe este cliente?
                </h3>
                <p className="text-base text-slate-400">
                  Encontramos coincidencias. Puedes asignar uno existente o crear
                  el nuevo de todas formas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPendingDuplicateMatches([]);
                  setDuplicateOverride(false);
                }}
                className="text-slate-400 hover:text-slate-200 text-xl"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <div className="mt-6 max-h-80 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/60 divide-y divide-slate-800/60">
              {pendingDuplicateMatches.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => handleUseExistingMatch(customer)}
                  className="w-full text-left px-5 py-4 hover:bg-slate-900/60 transition"
                >
                  <div className="text-base font-semibold text-slate-100">
                    {customer.name}
                  </div>
                  <div className="text-sm text-slate-400">
                    {customer.phone ?? "Sin teléfono"}
                    {customer.email ? ` · ${customer.email}` : ""}
                    {customer.tax_id ? ` · ${customer.tax_id}` : ""}
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-6 flex flex-col sm:flex-row gap-4">
              <button
                type="button"
                onClick={handleConfirmCreate}
                className="flex-1 rounded-2xl bg-emerald-500 py-3 text-base font-semibold text-slate-950 hover:bg-emerald-400"
              >
                Crear nuevo de todas formas
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingDuplicateMatches([]);
                  setDuplicateOverride(false);
                }}
                className="flex-1 rounded-2xl border border-slate-700 py-3 text-base text-slate-200 hover:bg-slate-800"
              >
                Revisar búsqueda
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import CustomerPanel from "../components/CustomerPanel";
import { usePos } from "../poscontext";
import { useAuth } from "../../providers/AuthProvider";
import { getApiBase } from "@/lib/api/base";

type FrequentCustomer = {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  tax_id?: string | null;
  address?: string | null;
  sales_count: number;
};

export default function PosCustomerSelectorPage() {
  const router = useRouter();
  const { saleNumber, selectedCustomer, setSelectedCustomer } = usePos();
  const { token } = useAuth();
  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : null),
    [token]
  );
  const apiBase = getApiBase();
  const [frequentCustomers, setFrequentCustomers] = useState<FrequentCustomer[]>(
    []
  );
  const [frequentLoading, setFrequentLoading] = useState(false);
  const [frequentError, setFrequentError] = useState<string | null>(null);
  const [pendingFrequentSelection, setPendingFrequentSelection] =
    useState<FrequentCustomer | null>(null);

  useEffect(() => {
    if (!authHeaders) return;
    let active = true;
    const loadFrequent = async () => {
      try {
        setFrequentLoading(true);
        setFrequentError(null);
        const params = new URLSearchParams({
          min_sales: "6",
          limit: "12",
        });
        const res = await fetch(
          `${apiBase}/pos/customers/frequent?${params}`,
          {
            headers: authHeaders,
            credentials: "include",
          }
        );
        if (!res.ok) {
          throw new Error(`Error ${res.status}`);
        }
        const data = (await res.json()) as FrequentCustomer[];
        if (!active) return;
        setFrequentCustomers(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!active) return;
        setFrequentError(
          err instanceof Error
            ? err.message
            : "No se pudieron cargar los clientes frecuentes."
        );
      } finally {
        if (active) setFrequentLoading(false);
      }
    };
    void loadFrequent();
    return () => {
      active = false;
    };
  }, [apiBase, authHeaders]);

  const handleAssignFrequent = (customer: FrequentCustomer) => {
    setPendingFrequentSelection(customer);
  };

  const confirmAssignFrequent = () => {
    if (!pendingFrequentSelection) return;
    const customer = pendingFrequentSelection;
    setSelectedCustomer({
      id: customer.id,
      name: customer.name,
      phone: customer.phone ?? undefined,
      email: customer.email ?? undefined,
      taxId: customer.tax_id ?? undefined,
      address: customer.address ?? undefined,
    });
    setPendingFrequentSelection(null);
    router.push("/pos");
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      <header className="border-b border-slate-800 bg-slate-900/70 px-4 sm:px-8 py-6 flex items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Asignar cliente
          </p>
          <h1 className="text-2xl font-semibold text-slate-50">
            Selecciona o crea un cliente para la venta
          </h1>
          <p className="text-base text-slate-400">
            Venta No.{saleNumber.toString().padStart(1, "0")}
            {selectedCustomer ? ` · Actual: ${selectedCustomer.name}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/pos")}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-5 py-2.5 text-sm font-semibold text-slate-100 hover:bg-slate-800"
        >
          ← Volver al POS
        </button>
      </header>

      <div className="flex-1 w-full flex items-start justify-center px-4 sm:px-8 py-10 overflow-auto">
        <div className="w-full max-w-7xl grid gap-8 lg:grid-cols-[1.5fr_1fr] items-start">
          <CustomerPanel
            variant="page"
            onCustomerSelected={() => router.push("/pos")}
          />

          <section className="rounded-3xl border border-slate-800/80 bg-slate-950/80 p-7 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Clientes frecuentes
                </p>
                <h2 className="text-lg font-semibold text-slate-100">
                  Clientes Frecuentes <span aria-hidden="true">★</span>
                </h2>
              </div>
              <span className="text-xs text-slate-500">
                {frequentCustomers.length} clientes
              </span>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-800/70 bg-slate-950/60 divide-y divide-slate-800/60 max-h-[520px] overflow-y-auto">
              {frequentLoading ? (
                <div className="px-4 py-4 text-sm text-slate-400">
                  Cargando clientes frecuentes...
                </div>
              ) : frequentError ? (
                <div className="px-4 py-4 text-sm text-rose-300">
                  {frequentError}
                </div>
              ) : frequentCustomers.length === 0 ? (
                <div className="px-4 py-4 text-sm text-slate-500">
                  Aún no hay clientes frecuentes para mostrar.
                </div>
              ) : (
                frequentCustomers.map((customer) => {
                  const isSelected = selectedCustomer?.id === customer.id;
                  return (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => handleAssignFrequent(customer)}
                      className={`w-full text-left px-4 py-3 transition ${
                        isSelected
                          ? "bg-emerald-500/10 text-emerald-200"
                          : "hover:bg-slate-900/60"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-100">
                            {customer.name}
                          </div>
                          <div className="text-xs text-slate-400">
                            {customer.phone ?? "Sin teléfono"}
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-emerald-300">
                          {customer.sales_count} ventas
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </div>

      {pendingFrequentSelection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-6">
          <div className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-slate-100">
                  ¿Asignar este cliente?
                </h3>
                <p className="text-sm text-slate-400">
                  Vas a asignar el cliente seleccionado a la venta actual.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingFrequentSelection(null)}
                className="text-slate-400 hover:text-slate-200 text-xl"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-800/70 bg-slate-950/60 px-4 py-3">
              <div className="text-sm font-semibold text-slate-100">
                {pendingFrequentSelection.name}
              </div>
              <div className="text-xs text-slate-400">
                {pendingFrequentSelection.phone ?? "Sin teléfono"}
                {pendingFrequentSelection.email
                  ? ` · ${pendingFrequentSelection.email}`
                  : ""}
                {pendingFrequentSelection.tax_id
                  ? ` · ${pendingFrequentSelection.tax_id}`
                  : ""}
              </div>
            </div>

            <div className="mt-5 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={confirmAssignFrequent}
                className="flex-1 rounded-2xl bg-emerald-500 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
              >
                Sí, asignar
              </button>
              <button
                type="button"
                onClick={() => setPendingFrequentSelection(null)}
                className="flex-1 rounded-2xl border border-slate-700 py-2.5 text-sm text-slate-200 hover:bg-slate-800"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

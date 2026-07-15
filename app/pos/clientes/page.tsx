"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import CustomerPanel from "../components/CustomerPanel";
import { usePos } from "../poscontext";
import { useAuth } from "../../providers/AuthProvider";
import { getApiBase } from "@/lib/api/base";
import { PosNavigationOverlay } from "../components/PosNavigationOverlay";
import { useGuardedPosNavigation } from "../hooks/useGuardedPosNavigation";

type FrequentCustomer = {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  tax_id?: string | null;
  address?: string | null;
  sales_count: number;
};

const PAYMENT_RETURN_ROUTES = new Set([
  "/pos/pago",
  "/pos/pago/pago-multiple",
]);

function PosCustomerSelectorContent() {
  const searchParams = useSearchParams();
  const { navigation, navigate, prefetch } = useGuardedPosNavigation();
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
  const requestedReturnTo = searchParams.get("returnTo");
  const paymentReturnTo =
    searchParams.get("flow") === "payment" &&
    requestedReturnTo &&
    PAYMENT_RETURN_ROUTES.has(requestedReturnTo)
      ? requestedReturnTo
      : null;
  const returnRoute = paymentReturnTo ?? "/pos";
  const currentCustomerLabel = selectedCustomer?.name || "Sin cliente asignado";
  const [activeFlow, setActiveFlow] = useState<
    "frequent" | "search" | "create" | null
  >(null);

  const returnToOrigin = (customerAssigned = false) => {
    const destinationLabel = paymentReturnTo ? "pago" : "POS";
    navigate(
      returnRoute,
      customerAssigned
        ? "Cliente asignado correctamente…"
        : `Volviendo al ${destinationLabel}…`,
      paymentReturnTo
        ? "Restaurando los datos de esta venta."
        : "Preparando la venta en curso.",
      { replace: true }
    );
  };

  useEffect(() => {
    prefetch(returnRoute);
  }, [prefetch, returnRoute]);

  useEffect(() => {
    if (!authHeaders) return;
    let active = true;
    const loadFrequent = async () => {
      try {
        setFrequentLoading(true);
        setFrequentError(null);
        const params = new URLSearchParams({
          min_sales: "3",
          limit: "12",
        });
        params.set("include_web_customers", "false");
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
    returnToOrigin(true);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      {navigation && (
        <PosNavigationOverlay
          title={navigation.title}
          detail={navigation.detail}
        />
      )}
      <header className="border-b border-slate-800 bg-slate-900/70 px-4 sm:px-8 py-5 flex items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            {paymentReturnTo ? "Cliente para esta venta" : "Asignar cliente"}
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
          onClick={() => returnToOrigin(false)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-5 py-2.5 text-sm font-semibold text-slate-100 hover:bg-slate-800"
        >
          ← {paymentReturnTo ? "Volver al pago" : "Volver al POS"}
        </button>
      </header>

      <div className="flex-1 w-full px-4 sm:px-8 py-6 overflow-auto">
        <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.75fr)] items-start">
          <section className="rounded-3xl border border-emerald-500/15 bg-gradient-to-b from-slate-900/95 to-slate-950/90 p-6 shadow-xl ring-1 ring-slate-800/70">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300/75">
              Resumen
            </p>
            <div className="mt-3 rounded-2xl border border-slate-700/80 bg-gradient-to-br from-slate-900 to-slate-950 p-5 shadow-inner">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-500/10 text-sm font-semibold text-emerald-100 shadow-sm">
                  {selectedCustomer ? selectedCustomer.name.slice(0, 2).toUpperCase() : "CL"}
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    Cliente actual
                  </div>
                  <div className="text-lg font-semibold text-slate-100">
                    {currentCustomerLabel}
                  </div>
                  <div className="text-sm text-slate-400">
                    Venta No. {saleNumber.toString().padStart(4, "0")}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setActiveFlow("search")}
                className="group flex min-h-[5.5rem] items-center gap-4 rounded-3xl border border-sky-400/25 bg-gradient-to-br from-slate-900 to-slate-950 px-5 py-4 text-left shadow-lg shadow-slate-950/30 transition hover:-translate-y-0.5 hover:border-sky-300/40 hover:bg-slate-900"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-sky-400/20 bg-sky-500/10 text-xl text-sky-200 transition group-hover:bg-sky-500/15 group-hover:text-sky-100">
                  ↗
                </div>
                <div>
                  <div className="text-base font-semibold text-slate-50">
                    Buscar cliente
                  </div>
                  <div className="mt-1 text-sm text-slate-400">
                    Encuentra y asigna un cliente existente.
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setActiveFlow("create")}
                className="group flex min-h-[5.5rem] items-center gap-4 rounded-3xl border border-amber-400/25 bg-gradient-to-br from-slate-900 to-slate-950 px-5 py-4 text-left shadow-lg shadow-slate-950/30 transition hover:-translate-y-0.5 hover:border-amber-300/40 hover:bg-slate-900"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-500/10 text-2xl text-amber-200 transition group-hover:bg-amber-500/15 group-hover:text-amber-100">
                  +
                </div>
                <div>
                  <div className="text-base font-semibold text-slate-50">
                    Crear cliente
                  </div>
                  <div className="mt-1 text-sm text-slate-400">
                    Abre el formulario para registrar uno nuevo.
                  </div>
                </div>
              </button>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-800/70 bg-slate-950/55 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Flujo recomendado
              </p>
              <ol className="mt-3 space-y-2 text-sm text-slate-300">
                <li><span className="text-emerald-300 font-semibold">1.</span> Revisa clientes frecuentes si quieres ir rápido.</li>
                <li><span className="text-sky-300 font-semibold">2.</span> Si no aparece, abre búsqueda o crea uno nuevo.</li>
                <li><span className="text-amber-300 font-semibold">3.</span> Al asignar, vuelves directo al POS o al pago.</li>
              </ol>
            </div>
          </section>

          <aside className="rounded-3xl border border-sky-500/20 bg-gradient-to-b from-slate-900/95 to-slate-950/90 p-7 shadow-xl ring-1 ring-slate-800/70">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-sky-300/80">
                  Clientes frecuentes
                </p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-50">
                  Acceso rápido <span aria-hidden="true" className="text-amber-300">★</span>
                </h2>
              </div>
              <span className="rounded-full border border-sky-400/25 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-50 shadow-sm">
                {frequentCustomers.length} clientes
              </span>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-800/70 bg-slate-950/60 divide-y divide-slate-800/60 overflow-hidden">
              {frequentLoading ? (
                <div className="px-4 py-5 text-sm text-slate-400">
                  Cargando clientes frecuentes...
                </div>
              ) : frequentError ? (
                <div className="px-4 py-5 text-sm text-rose-300">
                  {frequentError}
                </div>
              ) : frequentCustomers.length === 0 ? (
                <div className="px-4 py-6 text-base text-slate-400 bg-slate-950/40">
                  Aún no hay clientes frecuentes para mostrar.
                </div>
              ) : (
                frequentCustomers.slice(0, 6).map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => handleAssignFrequent(customer)}
                    className="w-full px-4 py-4 text-left transition hover:bg-sky-500/8"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold text-slate-50">
                          {customer.name}
                        </div>
                        <div className="text-sm text-slate-400">
                          {customer.phone ?? "Sin teléfono"}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full border border-emerald-400/15 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">
                        {customer.sales_count} ventas
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </aside>
        </div>
      </div>

      {activeFlow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4 py-6">
          <div className="absolute inset-0" onClick={() => setActiveFlow(null)} />
          <div className="relative z-10 w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-6 py-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  {activeFlow === "frequent"
                    ? "Clientes frecuentes"
                    : activeFlow === "search"
                    ? "Buscar cliente"
                    : "Crear cliente"}
                </p>
                <h3 className="text-lg font-semibold text-slate-100">
                  {activeFlow === "frequent"
                    ? "Selecciona un cliente rápido"
                    : activeFlow === "search"
                    ? "Encuentra y asigna un cliente"
                    : "Crea y asigna un cliente"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveFlow(null)}
                className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                Cerrar
              </button>
            </div>

            <div className="p-6">
              {activeFlow === "frequent" ? (
                <div className="rounded-2xl border border-slate-800/70 bg-slate-950/40 divide-y divide-slate-800/60">
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
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-100">
                                {customer.name}
                              </div>
                              <div className="text-xs text-slate-400">
                                {customer.phone ?? "Sin teléfono"}
                              </div>
                            </div>
                            <span className="shrink-0 text-xs font-semibold text-emerald-300">
                              {customer.sales_count} ventas
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              ) : (
                <CustomerPanel
                  key={activeFlow}
                  variant="page"
                  initialMode={activeFlow === "create" ? "new" : "list"}
                  showCurrentCustomerCard={activeFlow !== "search"}
                  onCustomerSelected={() => returnToOrigin(true)}
                />
              )}
            </div>
          </div>
        </div>
      )}

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

export default function PosCustomerSelectorPage() {
  return (
    <Suspense
      fallback={
        <PosNavigationOverlay
          title="Preparando clientes…"
          detail="La venta permanece protegida."
        />
      }
    >
      <PosCustomerSelectorContent />
    </Suspense>
  );
}

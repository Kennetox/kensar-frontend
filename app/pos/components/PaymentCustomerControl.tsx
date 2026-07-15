"use client";

import { useEffect, useState } from "react";
import CustomerPanel from "./CustomerPanel";
import { usePos } from "../poscontext";

type CustomerDialogMode = "list" | "new";

export function PaymentCustomerControl() {
  const { selectedCustomer, setSelectedCustomer } = usePos();
  const [dialogMode, setDialogMode] = useState<CustomerDialogMode | null>(null);

  useEffect(() => {
    if (!dialogMode) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDialogMode(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dialogMode]);

  if (selectedCustomer) {
    const customerNumber =
      selectedCustomer.phone || selectedCustomer.taxId || "Sin número registrado";

    return (
      <div className="flex min-w-0 max-w-[34rem] items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.08] px-4 py-2 shadow-inner shadow-emerald-950/20">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/10 text-xs font-bold text-emerald-200">
          {selectedCustomer.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 text-left leading-tight">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300/70">
            Cliente asignado
          </div>
          <div className="truncate text-sm font-semibold text-slate-100">
            {selectedCustomer.name}
          </div>
          <div className="truncate text-xs text-slate-400">{customerNumber}</div>
        </div>
        <button
          type="button"
          onClick={() => setSelectedCustomer(null)}
          className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-700 text-base text-slate-400 transition hover:border-rose-400/60 hover:bg-rose-500/10 hover:text-rose-200"
          aria-label={`Quitar cliente ${selectedCustomer.name}`}
          title="Quitar cliente"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 rounded-2xl border border-slate-800/80 bg-slate-950/35 p-1.5 shadow-inner">
        <button
          type="button"
          onClick={() => setDialogMode("new")}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-100 transition hover:border-emerald-400/60 hover:bg-emerald-500/20"
        >
          <span className="text-xl font-light leading-none" aria-hidden="true">
            +
          </span>
          Nuevo cliente
        </button>
        <button
          type="button"
          onClick={() => setDialogMode("list")}
          className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-slate-200 transition hover:bg-slate-800 hover:text-white"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="h-4 w-4 text-slate-400"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
          Buscar cliente
        </button>
      </div>

      {dialogMode && (
        <div
          className="fixed inset-0 z-[45] flex items-center justify-center bg-slate-950/80 px-5 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-customer-dialog-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDialogMode(null);
          }}
        >
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-700/80 bg-slate-900 shadow-[0_28px_90px_rgba(0,0,0,0.55)]">
            <div className="flex items-start justify-between gap-5 border-b border-slate-800 px-7 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400/80">
                  Cliente de la venta
                </p>
                <h2
                  id="payment-customer-dialog-title"
                  className="mt-1 text-2xl font-semibold text-slate-50"
                >
                  {dialogMode === "new" ? "Crear nuevo cliente" : "Buscar cliente"}
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  {dialogMode === "new"
                    ? "Guárdalo y quedará asignado automáticamente a esta venta."
                    : "Encuéntralo por nombre, teléfono o documento."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDialogMode(null)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-700 text-xl text-slate-400 transition hover:border-slate-500 hover:bg-slate-800 hover:text-white"
                aria-label="Cerrar selector de clientes"
              >
                ×
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto">
              <CustomerPanel
                key={dialogMode}
                variant="payment"
                initialMode={dialogMode}
                onCustomerSelected={() => setDialogMode(null)}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

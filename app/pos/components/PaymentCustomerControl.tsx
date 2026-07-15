"use client";

import { usePos } from "../poscontext";

type PaymentCustomerControlProps = {
  onNewCustomer: () => void;
  onSearchCustomer: () => void;
};

export function PaymentCustomerControl({
  onNewCustomer,
  onSearchCustomer,
}: PaymentCustomerControlProps) {
  const { selectedCustomer, setSelectedCustomer } = usePos();

  if (selectedCustomer) {
    const customerNumber =
      selectedCustomer.phone || selectedCustomer.taxId || "Sin número registrado";

    return (
      <div className="flex min-w-0 max-w-[30rem] items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.08] px-3 py-1.5 shadow-inner shadow-emerald-950/20">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/10 text-[11px] font-bold text-emerald-200">
          {selectedCustomer.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 text-left leading-tight">
          <div className="truncate text-sm font-semibold text-slate-100">
            {selectedCustomer.name}
          </div>
          <div className="truncate text-xs text-slate-400">{customerNumber}</div>
        </div>
        <button
          type="button"
          onClick={() => setSelectedCustomer(null)}
          className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-700 text-base text-slate-400 transition hover:border-rose-400/60 hover:bg-rose-500/10 hover:text-rose-200"
          aria-label={`Quitar cliente ${selectedCustomer.name}`}
          title="Quitar cliente"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onNewCustomer}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3.5 text-sm font-semibold text-emerald-100 transition hover:border-emerald-400/70 hover:bg-emerald-500/20"
      >
        <span className="text-lg font-light leading-none" aria-hidden="true">
          +
        </span>
        Nuevo cliente
      </button>
      <button
        type="button"
        onClick={onSearchCustomer}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/70 px-3.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-800 hover:text-white"
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
  );
}

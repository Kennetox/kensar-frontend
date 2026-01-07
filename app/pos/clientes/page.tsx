"use client";

import { useRouter } from "next/navigation";
import CustomerPanel from "../components/CustomerPanel";
import { usePos } from "../poscontext";

export default function PosCustomerSelectorPage() {
  const router = useRouter();
  const { saleNumber, selectedCustomer } = usePos();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      <header className="border-b border-slate-800 bg-slate-900/70 px-4 sm:px-8 py-4 flex items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">
            Asignar cliente
          </p>
          <h1 className="text-xl font-semibold text-slate-50">
            Selecciona o crea un cliente para la venta
          </h1>
          <p className="text-sm text-slate-400">
            Venta No.{saleNumber.toString().padStart(1, "0")}
            {selectedCustomer ? ` · Actual: ${selectedCustomer.name}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/pos")}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800"
        >
          ← Volver al POS
        </button>
      </header>

      <div className="flex-1 w-full flex items-start justify-center px-4 sm:px-8 py-8 overflow-auto">
        <CustomerPanel
          variant="page"
          onCustomerSelected={() => router.push("/pos")}
        />
      </div>
    </main>
  );
}

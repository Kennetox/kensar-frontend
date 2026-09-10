"use client";

import type { WarrantyReminderItem } from "@/lib/pos/warrantyReminder";

type WarrantyReminderModalProps = {
  items: WarrantyReminderItem[];
  onAddWarranty: () => void;
  onContinueWithoutWarranty: () => void;
};

const formatMoney = (value: number) =>
  `$${Math.round(value).toLocaleString("es-CO")}`;

export function WarrantyReminderModal({
  items,
  onAddWarranty,
  onContinueWithoutWarranty,
}: WarrantyReminderModalProps) {
  const visibleItems = items.slice(0, 2);
  const remainingItems = items.length - visibleItems.length;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="warranty-reminder-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-amber-400/35 bg-[#0b1730] p-6 shadow-2xl shadow-black/50 sm:p-7">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-300">
          Revisa la garantía
        </p>
        <h2 id="warranty-reminder-title" className="mt-2 text-2xl font-bold text-slate-50">
          Esta venta no tiene nota de garantía
        </h2>
        <p className="mt-3 text-base leading-6 text-slate-300">
          Incluye producto{items.length === 1 ? "" : "s"} de $400.000 o más. Antes de confirmar, verifica si debes registrar una garantía o marcar que no aplica.
        </p>

        <div className="mt-5 rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3">
          {visibleItems.map((item) => (
            <div key={`${item.name}-${item.unitPrice}`} className="flex items-start justify-between gap-4 py-1.5 text-sm">
              <span className="min-w-0 font-medium text-slate-100">{item.name}</span>
              <span className="shrink-0 font-semibold text-amber-200">{formatMoney(item.unitPrice)}</span>
            </div>
          ))}
          {remainingItems > 0 && (
            <p className="pt-2 text-sm text-slate-400">Y {remainingItems} producto{remainingItems === 1 ? "" : "s"} más.</p>
          )}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onContinueWithoutWarranty}
            className="rounded-xl border border-slate-600 px-5 py-3 text-base font-semibold text-slate-200 transition hover:border-slate-400 hover:bg-slate-800"
          >
            Continuar sin garantía
          </button>
          <button
            type="button"
            onClick={onAddWarranty}
            className="rounded-xl bg-emerald-500 px-5 py-3 text-base font-bold text-slate-950 transition hover:bg-emerald-400"
          >
            Agregar garantía
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { KoraStockPlan } from "@/lib/api/koraStockPlans";

type Props = {
  plan: KoraStockPlan;
  onClose: () => void;
  onOpenInventory?: () => void;
};

function formatNumber(value: number): string {
  return Number(value || 0).toLocaleString("es-CO", { maximumFractionDigits: 2 });
}
function formatCop(value: number): string {
  return `$${Number(value || 0).toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;
}

function workloadLabel(value: KoraStockPlan["workload_state"]): string {
  if (value === "quiet") return "Ventas tranquilas";
  if (value === "normal") return "Actividad normal";
  if (value === "busy") return "Actividad alta";
  return "Actividad sin confirmar";
}

export default function StockSanitizationPlanModal({ plan, onClose, onOpenInventory }: Props) {
  const [copied, setCopied] = useState(false);
  const orderedItems = useMemo(
    () => [...plan.items].sort((left, right) => left.priority_rank - right.priority_rank),
    [plan.items]
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const copyList = async () => {
    const text = [
      `${plan.code} · ${plan.title}`,
      ...orderedItems.map(
        (item) =>
          `${item.priority_rank}. ${item.product_name} · SKU ${item.sku || "sin SKU"} · stock ${formatNumber(item.system_qty)}`
      ),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return createPortal(
    <div
      className="notification-ui fixed inset-0 z-[10030] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-[2px] md:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stock-sanitization-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 md:px-7">
          <div className="flex min-w-0 gap-3">
            <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-xl font-black text-emerald-700">
              K
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-600">Plan propuesto por Kora</p>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{plan.code}</span>
              </div>
              <h2 id="stock-sanitization-title" className="mt-1 text-xl font-bold text-slate-950 md:text-2xl">
                {plan.title}
              </h2>
              <p className="mt-1 text-sm leading-5 text-slate-600">
                Lista priorizada para localizar y contar desde Metrik Stock. Kora no modifica el inventario.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-xl text-slate-500 hover:bg-slate-100"
            aria-label="Cerrar plan"
          >
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 px-5 py-5 md:px-7">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Productos</p>
              <p className="mt-1 text-2xl font-bold text-slate-950">{plan.selected_count}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Unidades negativas</p>
              <p className="mt-1 text-2xl font-bold text-rose-600">{formatNumber(plan.total_negative_units)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Impacto a costo</p>
              <p className="mt-1 text-lg font-bold text-slate-950">{formatCop(plan.total_cost_impact)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Personas en horario</p>
              <p className="mt-1 text-2xl font-bold text-slate-950">{plan.context.scheduled_people ?? "—"}</p>
            </div>
            <div className="col-span-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-1">
              <p className="text-xs text-slate-500">Contexto</p>
              <p className="mt-1 font-bold text-emerald-700">{workloadLabel(plan.workload_state)}</p>
              <p className="mt-1 text-xs text-slate-500">{plan.context.sales_count_30m} ventas · últimos 30 min</p>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-950">
            <p className="font-semibold">Lectura operacional</p>
            <p className="mt-1 leading-5">
              {plan.context.scheduled_people == null
                ? "Kora no confirmó un horario publicado; esta lista fue solicitada manualmente."
                : `Según el horario${plan.context.schedule_status === "draft" ? " en borrador" : ""} hay ${plan.context.scheduled_people} personas en turno y ${plan.context.available_people ?? 0} con capacidad estimada después de reservar ventas${plan.context.open_receiving_count ? " y la recepción activa" : ""}.`}
            </p>
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="font-bold text-slate-950">Productos para sanear</h3>
                <p className="text-xs text-slate-500">Ordenados por urgencia, movimientos, ventas e impacto económico.</p>
              </div>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                Pendiente de conteo físico
              </span>
            </div>
            <div className="divide-y divide-slate-100">
              {orderedItems.map((item) => (
                <article key={item.id} className="grid gap-3 px-4 py-4 md:grid-cols-[44px_minmax(0,1fr)_130px_170px] md:items-center">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-700">
                    {item.priority_rank}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-950">{item.product_name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      SKU {item.sku || "—"}{item.barcode ? ` · Código ${item.barcode}` : ""}{item.group_name ? ` · ${item.group_name}` : ""}
                    </p>
                    {item.reasons.length > 0 && (
                      <p className="mt-1.5 text-xs leading-4 text-slate-600">{item.reasons.slice(0, 3).join(" · ")}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Stock en Metrik</p>
                    <p className="mt-0.5 text-lg font-bold text-rose-600">{formatNumber(item.system_qty)}</p>
                  </div>
                  <div className="md:text-right">
                    <p className="text-xs text-slate-500">Impacto estimado a costo</p>
                    <p className="mt-0.5 font-semibold text-slate-950">{formatCop(item.cost_impact)}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{formatNumber(item.units_sold_lookback)} vendidas / {plan.lookback_days} días</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4 md:px-7">
          <p className="max-w-xl text-xs leading-5 text-slate-500">
            El plan queda guardado en Metrik. La conexión para convertirlo en recuento se activará desde Metrik Stock.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => void copyList()} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              {copied ? "Lista copiada" : "Copiar lista"}
            </button>
            {onOpenInventory && (
              <button type="button" onClick={onOpenInventory} className="rounded-xl border border-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">
                Ver inventario negativo
              </button>
            )}
            <button type="button" onClick={onClose} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-600">
              Entendido
            </button>
          </div>
        </footer>
      </section>
    </div>,
    document.body
  );
}

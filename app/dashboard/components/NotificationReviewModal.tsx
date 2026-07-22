"use client";

import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import type { DashboardNotification } from "@/lib/api/notifications";

type Props = {
  notification: DashboardNotification;
  onClose: () => void;
  onOpenTarget?: () => void;
};

const hiddenPayloadKeys = new Set([
  "generated_at",
  "trigger",
  "radar_version",
  "product_ids",
]);

function payloadLabel(key: string): string {
  const labels: Record<string, string> = {
    overdue_count: "Vencidos",
    due_soon_count: "Próximos a vencer",
    total_balance: "Saldo pendiente",
    renew_count: "Para renovar",
    change_soon_count: "Por cambiar pronto",
    analyzed_product_count: "Productos analizados",
  };
  if (labels[key]) return labels[key];
  const normalized = key.replaceAll("_", " ");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function payloadValue(key: string, value: unknown): string | null {
  if (value == null) return null;
  if (Array.isArray(value)) return `${value.length} elemento${value.length === 1 ? "" : "s"}`;
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number") {
    const formatted = value.toLocaleString("es-CO", { maximumFractionDigits: 0 });
    return key.includes("balance") || key.includes("amount") ? `$${formatted}` : formatted;
  }
  if (typeof value === "string" && value.length <= 100) return value;
  return null;
}

export default function NotificationReviewModal({
  notification,
  onClose,
  onOpenTarget,
}: Props) {
  const details = useMemo(
    () =>
      Object.entries(notification.payload ?? {})
        .filter(([key]) => !hiddenPayloadKeys.has(key))
        .map(([key, value]) => ({ label: payloadLabel(key), value: payloadValue(key, value) }))
        .filter((item): item is { label: string; value: string } => Boolean(item.value))
        .slice(0, 8),
    [notification.payload]
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

  return createPortal(
    <div
      className="fixed inset-0 z-[10020] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-[2px] md:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notification-review-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 md:px-6">
          <div className="flex min-w-0 gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-lg text-emerald-700">✓</span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-600">Detalle del aviso</p>
              <h2 id="notification-review-title" className="mt-1 text-xl font-bold text-slate-950">
                {notification.title}
              </h2>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-xl text-slate-500 hover:bg-slate-100" aria-label="Cerrar detalle">
            ×
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 px-5 py-5 md:px-6">
          <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700 shadow-sm">
            {notification.message}
          </p>
          {details.length > 0 && (
            <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {details.map((detail) => (
                <div key={detail.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <dt className="text-xs text-slate-500">{detail.label}</dt>
                  <dd className="mt-1 font-semibold text-slate-950">{detail.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        <footer className="flex justify-end gap-3 border-t border-slate-200 px-5 py-4 md:px-6">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cerrar</button>
          {onOpenTarget && (
            <button type="button" onClick={onOpenTarget} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-600">Ir al módulo</button>
          )}
        </footer>
      </section>
    </div>,
    document.body
  );
}

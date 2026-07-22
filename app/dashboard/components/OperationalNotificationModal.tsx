"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { DashboardNotification } from "@/lib/api/notifications";

type Props = {
  notification: DashboardNotification;
  onClose: () => void;
  onOpenTarget: () => void;
};

type SeparatedSnapshot = {
  id: number;
  document_number?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  balance: number;
  due_date?: string | null;
  status: "overdue" | "due_soon";
  day_distance: number;
};

type ContentSnapshot = {
  kind: "slider" | "video";
  slot: number;
  content_updated_at?: string | null;
  age_days?: number | null;
  status: "renew" | "change_soon";
};

function formatCop(value: number): string {
  return Number(value || 0).toLocaleString("es-CO", { maximumFractionDigits: 0 });
}

function formatDate(value?: string | null): string {
  if (!value) return "Sin fecha";
  const date = new Date(`${value}Z`.replace("ZZ", "Z"));
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" }).format(date);
}

function readArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export default function OperationalNotificationModal({
  notification,
  onClose,
  onOpenTarget,
}: Props) {
  const isSeparated = notification.category === "separated_follow_up";
  const orders = readArray<SeparatedSnapshot>(notification.payload?.orders);
  const content = readArray<ContentSnapshot>(notification.payload?.content);

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
      aria-labelledby="operational-notification-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 md:px-7">
          <div className="flex min-w-0 gap-3">
            <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${isSeparated ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"}`}>
              {isSeparated ? "!" : "↻"}
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-600">
                {isSeparated ? "Seguimiento de separados" : "Comercio Web"}
              </p>
              <h2 id="operational-notification-title" className="mt-1 text-xl font-bold text-slate-950 md:text-2xl">
                {notification.title}
              </h2>
              <p className="mt-1 text-sm leading-5 text-slate-600">{notification.message}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Cerrar detalle"
          >
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 px-5 py-5 md:px-7">
          {isSeparated ? (
            <div className="space-y-3">
              {orders.map((order) => (
                <article key={order.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">{order.customer_name || "Cliente sin nombre"}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {order.document_number || `Separado #${order.id}`}{order.customer_phone ? ` · ${order.customer_phone}` : ""}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${order.status === "overdue" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800"}`}>
                      {order.status === "overdue"
                        ? `Vencido hace ${order.day_distance} día${order.day_distance === 1 ? "" : "s"}`
                        : `Vence en ${order.day_distance} día${order.day_distance === 1 ? "" : "s"}`}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
                    <div>
                      <p className="text-xs text-slate-500">Fecha límite</p>
                      <p className="mt-0.5 font-medium">{formatDate(order.due_date)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Saldo pendiente</p>
                      <p className="mt-0.5 font-bold text-slate-950">${formatCop(order.balance)}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {content.map((item) => (
                <article key={`${item.kind}-${item.slot}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div>
                    <p className="font-semibold text-slate-950">
                      {item.kind === "slider" ? "Slider" : "Video"} · Slot {item.slot}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.age_days == null
                        ? "No tiene fecha de publicación registrada"
                        : `Publicado hace ${item.age_days} día${item.age_days === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.status === "renew" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800"}`}>
                    {item.status === "renew" ? "Renovar" : "Cambiar pronto"}
                  </span>
                </article>
              ))}
            </div>
          )}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-white px-5 py-4 md:px-7">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Cerrar
          </button>
          <button type="button" onClick={onOpenTarget} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-600">
            {isSeparated ? "Gestionar separados" : "Administrar contenido"}
          </button>
        </footer>
      </section>
    </div>,
    document.body
  );
}

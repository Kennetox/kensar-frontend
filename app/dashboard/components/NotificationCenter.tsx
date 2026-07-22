"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  dismissNotification,
  fetchNotificationInbox,
  markAllNotificationsRead,
  markNotificationRead,
  type DashboardNotification,
} from "@/lib/api/notifications";
import WebOpportunityReviewModal from "./WebOpportunityReviewModal";


const severityStyle: Record<DashboardNotification["severity"], string> = {
  info: "bg-sky-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  critical: "bg-rose-500",
};

function relativeDate(value: string): string {
  const normalizedValue = value.includes("T") ? value : value.replace(" ", "T");
  const hasExplicitTimeZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(normalizedValue);
  const date = new Date(hasExplicitTimeZone ? normalizedValue : `${normalizedValue}Z`);
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp)) return "Ahora";
  const seconds = Math.round((timestamp - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 7) return formatter.format(days, "day");
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  }).format(date);
}

export default function NotificationCenter({ token }: { token: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<DashboardNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [webOpportunityNotification, setWebOpportunityNotification] = useState<DashboardNotification | null>(null);
  const centerRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const inbox = await fetchNotificationInbox(token);
      setItems(inbox.items);
      setUnreadCount(inbox.unread_count);
      setError("");
    } catch {
      if (!silent) setError("No fue posible cargar las notificaciones.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
    const intervalId = window.setInterval(() => void refresh(true), 60_000);
    const onFocus = () => void refresh(true);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!centerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const badge = useMemo(
    () => (unreadCount > 99 ? "99+" : String(unreadCount)),
    [unreadCount]
  );

  const markRead = async (notification: DashboardNotification) => {
    if (notification.read_at) return;
    setItems((current) =>
      current.map((item) =>
        item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item
      )
    );
    setUnreadCount((current) => Math.max(0, current - 1));
    try {
      await markNotificationRead(token, notification.id);
    } catch {
      void refresh(true);
    }
  };

  const handleAction = async (notification: DashboardNotification) => {
    await markRead(notification);
    if (notification.category === "web_opportunity") {
      setOpen(false);
      setWebOpportunityNotification(notification);
      return;
    }
    if (notification.action_href?.startsWith("/dashboard")) {
      setOpen(false);
      router.push(notification.action_href);
    }
  };

  const handleDismiss = async (notification: DashboardNotification) => {
    setItems((current) => current.filter((item) => item.id !== notification.id));
    if (!notification.read_at) setUnreadCount((current) => Math.max(0, current - 1));
    try {
      await dismissNotification(token, notification.id);
    } catch {
      void refresh(true);
    }
  };

  const handleReadAll = async () => {
    const now = new Date().toISOString();
    setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? now })));
    setUnreadCount(0);
    try {
      await markAllNotificationsRead(token);
    } catch {
      void refresh(true);
    }
  };

  return (
    <div ref={centerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border ui-border dashboard-profile-chip transition hover:border-emerald-400/70"
        aria-label={unreadCount ? `Notificaciones, ${unreadCount} sin leer` : "Notificaciones"}
        aria-expanded={open}
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={`h-5 w-5 ${unreadCount > 0 && !open ? "notification-bell-attention" : ""}`}
        >
          <path
            d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {unreadCount > 0 && (
          <span className={`force-light-text notification-badge absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-rose-500 px-1 text-center text-[10px] font-extrabold leading-none shadow-[0_3px_8px_rgba(244,63,94,0.45)] ${!open ? "notification-badge-attention" : ""}`}>
            {badge}
          </span>
        )}
      </button>

      {open && (
        <aside
          className="dashboard-card absolute right-0 top-full z-[70] mt-2 flex max-h-[min(620px,calc(100vh-5.5rem))] w-[min(400px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl shadow-[0_18px_50px_rgba(15,23,42,0.22)]"
          role="region"
          aria-label="Centro de notificaciones"
        >
          <div className="shrink-0 border-b dashboard-border px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
                  <path
                    d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <div>
                <h2 className="text-base font-semibold ui-text">Notificaciones</h2>
                <p className="text-xs ui-text-muted">Avisos y acciones pendientes para ti.</p>
              </div>
            </div>
          </div>

          <div className="flex min-h-11 shrink-0 items-center justify-between border-b dashboard-border px-5 py-2.5">
            <span className="text-xs font-medium ui-text-muted">
              {unreadCount === 0 ? "Todo al día" : `${unreadCount} sin leer`}
            </span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void handleReadAll()}
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-500"
              >
                Marcar todas como leídas
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 [scrollbar-gutter:stable]">
            {loading ? (
                <div className="flex h-36 items-center justify-center text-sm ui-text-muted">
                  Cargando notificaciones…
                </div>
              ) : error ? (
                <div className="m-2 rounded-xl border border-rose-300/60 bg-rose-50/70 p-4 text-sm text-rose-700">
                  <p>{error}</p>
                  <button
                    type="button"
                    onClick={() => void refresh()}
                    className="mt-3 font-semibold underline"
                  >
                    Reintentar
                  </button>
                </div>
              ) : items.length === 0 ? (
                <div className="flex h-52 flex-col items-center justify-center px-8 text-center">
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    ✓
                  </div>
                  <p className="font-semibold ui-text">No tienes avisos pendientes</p>
                  <p className="mt-1 text-sm ui-text-muted">
                    Aquí aparecerán las recomendaciones de Kora y los avisos de tus módulos.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {items.map((notification) => (
                    <article
                      key={notification.id}
                      className={`relative rounded-xl border p-4 transition dashboard-card-alt ${
                        notification.read_at
                          ? "ui-border opacity-80"
                          : "border-emerald-300/70 shadow-sm"
                      }`}
                    >
                      <div className="flex gap-3">
                        <span
                          className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${severityStyle[notification.severity]}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div>
                            <p className="text-sm font-semibold ui-text">{notification.title}</p>
                            <p className="mt-0.5 text-[11px] uppercase tracking-wide ui-text-muted">
                              {notification.source === "kora" ? "Kora" : notification.source} · {relativeDate(notification.created_at)}
                            </p>
                          </div>
                          <p className="mt-2 text-sm leading-5 ui-text-muted">{notification.message}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                            {notification.action_href && (
                              <button
                                type="button"
                                onClick={() => void handleAction(notification)}
                                className="rounded-lg border border-emerald-400 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                              >
                                {notification.action_label || "Ver detalle"}
                              </button>
                            )}
                            {!notification.read_at && (
                              <button
                                type="button"
                                onClick={() => void markRead(notification)}
                                className="text-xs font-medium ui-text-muted hover:text-emerald-600"
                              >
                                Marcar como leída
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void handleDismiss(notification)}
                              className="text-xs font-medium ui-text-muted hover:text-rose-600"
                            >
                              Descartar
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
            )}
          </div>
        </aside>
      )}
      {webOpportunityNotification && (
        <WebOpportunityReviewModal
          token={token}
          notificationPayload={webOpportunityNotification.payload}
          onClose={() => setWebOpportunityNotification(null)}
          onOpenCommerce={() => {
            setWebOpportunityNotification(null);
            router.push("/dashboard/comercio-web");
          }}
        />
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  fetchKoraWebOpportunities,
  type KoraWebOpportunityResponse,
} from "@/lib/api/koraWebOpportunities";

type WebOpportunityReviewModalProps = {
  token: string;
  notificationPayload?: Record<string, unknown> | null;
  onClose: () => void;
  onOpenCommerce: () => void;
};

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString("es-CO", { maximumFractionDigits: 0 });
}

function readNotificationSnapshot(
  payload?: Record<string, unknown> | null
): KoraWebOpportunityResponse | null {
  if (!payload || !Array.isArray(payload.opportunities) || payload.opportunities.length === 0) return null;
  return {
    generated_at: typeof payload.generated_at === "string" ? payload.generated_at : new Date().toISOString(),
    source: "web-opportunities-v2",
    state: "opportunities",
    lookback_days: Number(payload.lookback_days ?? 30),
    analyzed_product_count: Number(payload.analyzed_product_count ?? payload.opportunities.length),
    minimum_sale_price: Number(payload.minimum_sale_price ?? 0),
    eligible_group_count: Number(payload.eligible_group_count ?? 0),
    headline: typeof payload.headline === "string"
      ? payload.headline
      : `Kora encontró ${payload.opportunities.length} productos con potencial para la web.`,
    items: payload.opportunities as KoraWebOpportunityResponse["items"],
  };
}

export default function WebOpportunityReviewModal({
  token,
  notificationPayload,
  onClose,
  onOpenCommerce,
}: WebOpportunityReviewModalProps) {
  const notificationSnapshot = useMemo(
    () => readNotificationSnapshot(notificationPayload),
    [notificationPayload]
  );
  const [data, setData] = useState<KoraWebOpportunityResponse | null>(notificationSnapshot);
  const [loading, setLoading] = useState(!notificationSnapshot);
  const [error, setError] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchKoraWebOpportunities(token, { signal }));
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "No fue posible cargar las sugerencias.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (notificationSnapshot) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, notificationSnapshot]);

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
      aria-labelledby="web-opportunity-modal-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 md:px-7">
          <div className="flex min-w-0 gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
                <path d="M5 19V9m7 10V5m7 14v-7M3 19h18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-600">Radar comercial de Kora</p>
              <h2 id="web-opportunity-modal-title" className="mt-1 text-xl font-bold text-slate-950 md:text-2xl">
                Productos con potencial para la web
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-600">
                Recomendaciones filtradas por grupos activos en la web, precio, rotación y stock. Esta revisión no publica ni modifica productos.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-lg text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
            aria-label="Cerrar sugerencias"
          >
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 px-4 py-5 md:px-7">
          {loading ? (
            <div className="grid gap-3 md:grid-cols-2">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-white" />
              ))}
            </div>
          ) : error ? (
            <div className="mx-auto flex min-h-64 max-w-lg flex-col items-center justify-center rounded-2xl border border-rose-200 bg-white p-8 text-center">
              <p className="font-semibold text-rose-700">No pude cargar las sugerencias</p>
              <p className="mt-2 text-sm text-slate-600">{error}</p>
              <button type="button" onClick={() => void load()} className="mt-5 rounded-xl border border-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">
                Reintentar
              </button>
            </div>
          ) : !data?.items.length ? (
            <div className="mx-auto flex min-h-64 max-w-xl flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-xl text-emerald-700">✓</div>
              <p className="mt-4 font-semibold text-slate-900">No hay oportunidades elegibles ahora</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{data?.headline}</p>
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-700">{data.headline}</p>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                  Mínimo web: ${formatNumber(data.minimum_sale_price)}
                </span>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {data.items.map((item, index) => (
                  <article key={item.product_id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-sm font-bold text-emerald-700">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold leading-5 text-slate-950">{item.product_name}</h3>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.sku ? `SKU ${item.sku}` : "Sin SKU"}{item.group_name ? ` · ${item.group_name}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-xl bg-slate-900 px-3 py-1.5 text-sm font-bold text-white">
                        ${formatNumber(item.sale_price)}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <div className="rounded-xl bg-slate-50 p-2.5 text-center">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">30 días</p>
                        <p className="mt-1 font-bold text-slate-900">{formatNumber(item.units_lookback)} uds.</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-2.5 text-center">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">7 días</p>
                        <p className="mt-1 font-bold text-slate-900">{formatNumber(item.units_7d)} uds.</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-2.5 text-center">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Stock</p>
                        <p className="mt-1 font-bold text-slate-900">{formatNumber(item.qty_on_hand)}</p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Categoría sugerida</p>
                      <p className="mt-0.5 text-sm font-semibold text-emerald-900">{item.suggested_category_name}</p>
                    </div>

                    {item.missing_web_fields.length ? (
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <span className="mr-1 text-xs font-medium text-slate-500">Antes de publicar:</span>
                        {item.missing_web_fields.map((field) => (
                          <span key={field} className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">{field}</span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-xs font-semibold text-emerald-700">Datos básicos listos para publicar.</p>
                    )}
                  </article>
                ))}
              </div>
            </>
          )}
        </div>

        <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:justify-end md:px-7">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Cerrar
          </button>
          <button type="button" onClick={onOpenCommerce} className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-600">
            Administrar en Comercio Web
          </button>
        </footer>
      </section>
    </div>,
    document.body
  );
}

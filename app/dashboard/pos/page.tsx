"use client";

import Link from "next/link";
import { useCallback } from "react";
import { useAuth } from "@/app/providers/AuthProvider";
import { stageAuthTransferSnapshot } from "@/lib/auth/sessionTransfer";

export default function PosDashboardPage() {
  const { token, user } = useAuth();

  const handleOpenNewTab = useCallback(() => {
    if (typeof window === "undefined") return;
    if (token && user) {
      stageAuthTransferSnapshot({ token, user });
    }
    window.open("/pos?mode=web&newTab=1", "_blank", "noopener,noreferrer");
  }, [token, user]);

  return (
    <div className="flex min-h-full w-full items-start justify-center px-4 py-5">
      <div className="w-full max-w-[84rem] rounded-2xl border border-slate-200 bg-white shadow-sm p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-2">
          <div className="inline-flex items-center gap-2 self-start rounded-full border border-emerald-400 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 shadow-sm">
            POS Web disponible
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight text-slate-900">
              POS · Metrik
            </h1>
            <p className="mt-2 max-w-5xl text-sm leading-6 text-slate-600">
              Estás a un paso de abrir el <strong>POS Web</strong>, pensado para operar
              desde cualquier navegador con internet. Ideal para tablets, laptops o
              puntos de venta móviles que no usan PIN de estación. Todo se sincroniza
              en tiempo real con tu inventario y reportes.
            </p>
          </div>
        </div>

        <div className="mb-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 shadow-sm">
            <h2 className="mb-1.5 text-sm font-semibold text-slate-900">
              Ventajas del POS Web
            </h2>
            <ul className="list-inside list-disc space-y-1 text-xs leading-5 text-slate-600">
              <li>Disponible en cualquier dispositivo con navegador moderno.</li>
              <li>Sin instalación: comparte el link y listo.</li>
              <li>Accesos seguros por usuario y permisos.</li>
            </ul>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 shadow-sm">
            <h2 className="mb-1.5 text-sm font-semibold text-slate-900">
              ¿Qué verás adentro?
            </h2>
            <ul className="list-inside list-disc space-y-1 text-xs leading-5 text-slate-600">
              <li>Grillas por grupos, subgrupos y productos.</li>
              <li>Carrito con totales, descuentos y consecutivo de venta.</li>
              <li>Pantalla de pago con todos tus métodos activos.</li>
            </ul>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 shadow-sm">
            <h2 className="mb-1.5 text-sm font-semibold text-slate-900">
              Antes de abrirlo
            </h2>
            <ul className="list-inside list-disc space-y-1 text-xs leading-5 text-slate-600">
              <li>Activa la vista a pantalla completa (F11) para mayor comodidad.</li>
              <li>Conecta tu lector de códigos o usa la búsqueda rápida.</li>
              <li>Si necesitas un equipo fijo con PIN, configura una Estación POS.</li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1 space-y-0.5 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">
              ¿Cómo quieres abrirlo?
            </p>
            <p>
              Usa pantalla completa en esta pestaña o abre otra ventana dedicada.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Link
              href={{ pathname: "/pos", query: { mode: "web" } }}
              className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-500 px-5 py-2 text-center text-sm font-semibold text-white shadow-sm shadow-emerald-500/20 transition-colors hover:bg-emerald-600 sm:w-auto"
            >
              Abrir en esta pestaña
            </Link>
            <button
              type="button"
              onClick={handleOpenNewTab}
              className="inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-5 py-2 text-center text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 sm:w-auto"
            >
              Abrir en nueva pestaña
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

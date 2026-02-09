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
    <div className="flex min-h-full items-center justify-center px-4 py-6">
      <div className="max-w-4xl w-full rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-emerald-50/40 shadow-[0_18px_50px_rgba(15,23,42,0.12)] p-6 sm:p-10">
        <div className="flex flex-col gap-3 mb-6">
          <div className="inline-flex items-center gap-2 self-start rounded-full border border-emerald-400 bg-emerald-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700 shadow-sm">
            POS Web disponible
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">
              POS · Metrik
            </h1>
            <p className="mt-3 text-sm md:text-base text-slate-600 leading-relaxed">
              Estás a un paso de abrir el <strong>POS Web</strong>, pensado para operar
              desde cualquier navegador con internet. Ideal para tablets, laptops o
              puntos de venta móviles que no usan PIN de estación. Todo se sincroniza
              en tiempo real con tu inventario y reportes.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3 mb-8">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900 mb-2">
              Ventajas del POS Web
            </h2>
            <ul className="text-xs md:text-sm text-slate-600 space-y-1.5 list-disc list-inside">
              <li>Disponible en cualquier dispositivo con navegador moderno.</li>
              <li>Sin instalación: comparte el link y listo.</li>
              <li>Accesos seguros por usuario y permisos.</li>
            </ul>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900 mb-2">
              ¿Qué verás adentro?
            </h2>
            <ul className="text-xs md:text-sm text-slate-600 space-y-1.5 list-disc list-inside">
              <li>Grillas por grupos, subgrupos y productos.</li>
              <li>Carrito con totales, descuentos y consecutivo de venta.</li>
              <li>Pantalla de pago con todos tus métodos activos.</li>
            </ul>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900 mb-2">
              Antes de abrirlo
            </h2>
            <ul className="text-xs md:text-sm text-slate-600 space-y-1.5 list-disc list-inside">
              <li>Activa la vista a pantalla completa (F11) para mayor comodidad.</li>
              <li>Conecta tu lector de códigos o usa la búsqueda rápida.</li>
              <li>Si necesitas un equipo fijo con PIN, configura una Estación POS.</li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="flex-1 space-y-1 text-slate-600 text-xs sm:text-sm">
            <p className="font-semibold text-slate-800">
              ¿Cómo quieres abrirlo?
            </p>
            <p>
              Usa pantalla completa en esta pestaña o abre otra ventana dedicada.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <Link
              href={{ pathname: "/pos", query: { mode: "web" } }}
              className="inline-flex justify-center items-center px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm md:text-base transition-colors w-full sm:w-auto text-center shadow-lg shadow-emerald-500/20"
            >
              Abrir en esta pestaña
            </Link>
            <button
              type="button"
              onClick={handleOpenNewTab}
              className="inline-flex justify-center items-center px-5 py-3 rounded-2xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm transition-colors w-full sm:w-auto text-center"
            >
              Abrir en nueva pestaña
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

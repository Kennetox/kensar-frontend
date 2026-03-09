"use client";

import Link from "next/link";
import { useState } from "react";
import {
  buildCookieConsentCookie,
  type CookieConsentValue,
} from "@/lib/cookieConsent";

type Props = {
  initialConsent: CookieConsentValue | null;
};

export default function CookieConsentBanner({ initialConsent }: Props) {
  const [consent, setConsent] = useState<CookieConsentValue | null>(initialConsent);
  const showBanner = consent === null;

  function persistConsent(value: CookieConsentValue) {
    const baseCookie = buildCookieConsentCookie(value);
    const secureSuffix = window.location.protocol === "https:" ? "; Secure" : "";

    document.cookie = `${baseCookie}${secureSuffix}`;
    setConsent(value);
  }

  return (
    <>
      {showBanner ? (
        <div className="fixed bottom-4 left-4 right-4 z-[80] mx-auto w-[min(56rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-2xl backdrop-blur-sm sm:p-5">
          <p className="text-sm font-semibold text-slate-900">Uso de cookies en Metrik</p>
          <p className="mt-1 text-xs leading-5 text-slate-600 sm:text-sm">
            Usamos cookies esenciales para seguridad y operacion (por ejemplo, acceso a descargas).
            Puedes aceptar tambien cookies no esenciales para analitica cuando se activen.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            <Link href="/politica-de-cookies" className="underline underline-offset-2 hover:text-slate-700">
              Politica de cookies
            </Link>
            {" · "}
            <Link
              href="/politica-de-privacidad"
              className="underline underline-offset-2 hover:text-slate-700"
            >
              Politica de privacidad
            </Link>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => persistConsent("essential")}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 sm:text-sm"
            >
              Solo esenciales
            </button>
            <button
              type="button"
              onClick={() => persistConsent("all")}
              className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 sm:text-sm"
            >
              Aceptar todas
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

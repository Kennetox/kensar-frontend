"use client";

import Image from "next/image";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { DownloadResource } from "@/lib/downloadResources";

type Props = {
  resources: DownloadResource[];
};

type AccessState = {
  granted: boolean;
  configured: boolean;
};

export default function DownloadsAccessPanel({ resources }: Props) {
  const [accessCode, setAccessCode] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [accessState, setAccessState] = useState<AccessState>({
    granted: false,
    configured: true,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadStatus() {
      try {
        const response = await fetch("/api/download-access", { method: "GET" });
        const data = (await response.json()) as AccessState;

        if (!isMounted) return;
        setAccessState({ granted: Boolean(data.granted), configured: Boolean(data.configured) });
      } catch {
        if (!isMounted) return;
        setError("No se pudo validar el estado de acceso.");
      } finally {
        if (!isMounted) return;
        setIsLoading(false);
      }
    }

    void loadStatus();

    return () => {
      isMounted = false;
    };
  }, []);

  const accessLabel = useMemo(() => {
    if (isLoading) return "Verificando acceso...";
    if (!accessState.configured) return "Acceso no configurado";
    if (accessState.granted) return "Acceso habilitado";
    return "Acceso bloqueado";
  }, [accessState.configured, accessState.granted, isLoading]);

  async function handleUnlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/download-access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: accessCode }),
      });

      const data = (await response.json()) as { granted?: boolean; error?: string };

      if (!response.ok) {
        setError(data.error ?? "No se pudo habilitar el acceso.");
        return;
      }

      setAccessState((prev) => ({ ...prev, granted: Boolean(data.granted) }));
      setAccessCode("");
    } catch {
      setError("No se pudo validar el codigo en este momento.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 sm:px-4">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Acceso descargas
            </p>
            <span
              className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                accessState.granted
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {accessState.granted ? "Activo" : "Bloqueado"}
            </span>
            <p className="hidden text-xs text-slate-500 sm:block">{accessLabel}</p>
          </div>

          <form className="flex w-full gap-2 sm:w-auto" onSubmit={handleUnlock}>
            <input
              type="text"
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value)}
              placeholder="Codigo"
              autoComplete="off"
              className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none ring-blue-200 transition focus:border-blue-400 focus:ring sm:w-52"
              disabled={isSubmitting || isLoading || accessState.granted || !accessState.configured}
            />
            <button
              type="submit"
              className="h-9 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={isSubmitting || isLoading || accessState.granted || !accessState.configured}
            >
              {isSubmitting ? "Validando..." : "Habilitar"}
            </button>
          </form>
        </div>

        <p className="mt-2 text-xs text-slate-500 sm:hidden">{accessLabel}</p>
        {error ? <p className="mt-1.5 text-xs text-rose-600">{error}</p> : null}
        {!accessState.configured ? (
          <p className="mt-1.5 text-xs text-rose-600">
            Falta configurar `DOWNLOAD_ACCESS_CODE(S)` y `DOWNLOAD_ACCESS_SECRET`.
          </p>
        ) : null}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80">
        {resources.map((resource, index) => (
          <article
            key={resource.slug}
            className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5 ${
              index < resources.length - 1 ? "border-b border-slate-200/80" : ""
            }`}
          >
            <div className="flex items-start gap-3">
              <Image
                src={resource.logo}
                alt={`Logo ${resource.name}`}
                width={64}
                height={64}
                className={`${resource.logoClassName ?? "h-12 w-12"} rounded-xl bg-white p-1 object-contain`}
              />
              <div>
                <h2 className="text-lg font-bold leading-tight text-slate-900 sm:text-xl">
                  {resource.name}
                </h2>
                <a
                  href={resource.manualHref}
                  className="mt-0.5 inline-block text-[0.8rem] text-slate-500 underline underline-offset-2 transition hover:text-slate-700"
                  target={resource.manualHref.startsWith("http") ? "_blank" : undefined}
                  rel={resource.manualHref.startsWith("http") ? "noreferrer" : undefined}
                >
                  Descargar manual
                </a>
                <p className="mt-1 text-[0.8rem] font-semibold uppercase tracking-[0.15em] text-slate-500 sm:text-[0.9rem]">
                  {resource.platform}
                </p>
                <p className="mt-1.5 text-[0.96rem] text-slate-600 sm:text-[1.08rem]">
                  {resource.description}
                </p>
                <p className="mt-1.5 text-[0.9rem] text-slate-500 sm:text-[1rem]">
                  {resource.requirements}
                </p>
              </div>
            </div>
            <a
              href={`/api/downloads/${resource.slug}`}
              aria-label={`Descargar ${resource.name}`}
              title={`Descargar ${resource.name}`}
              onClick={(event) => {
                if (!accessState.granted) {
                  event.preventDefault();
                }
              }}
              className={`inline-flex items-center justify-center self-end transition sm:self-auto ${
                accessState.granted
                  ? "text-[#3154e8] hover:scale-105 hover:text-[#2a45c5]"
                  : "cursor-not-allowed text-slate-300"
              }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-[18px] w-[18px]"
              >
                <path d="M12 3v12" />
                <path d="m7 10 5 5 5-5" />
                <path d="M5 21h14" />
              </svg>
            </a>
          </article>
        ))}
      </div>
    </>
  );
}

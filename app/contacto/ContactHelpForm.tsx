"use client";

import { useMemo, useState } from "react";
import { getApiBase } from "@/lib/api/base";

const MAX_MESSAGE_LENGTH = 700;

const QUERY_OPTIONS = [
  { value: "soporte_tecnico", label: "Soporte técnico" },
  { value: "consulta_comercial", label: "Consulta comercial" },
  { value: "facturacion", label: "Facturación y pagos" },
  { value: "implementacion", label: "Implementación y configuración" },
  { value: "sugerencia", label: "Sugerencia / mejora" },
  { value: "otro", label: "Otro" },
] as const;

type QueryType = (typeof QUERY_OPTIONS)[number]["value"];

export default function ContactHelpForm() {
  const [queryType, setQueryType] = useState<QueryType>("soporte_tecnico");
  const [message, setMessage] = useState("");
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedQueryLabel = useMemo(
    () => QUERY_OPTIONS.find((item) => item.value === queryType)?.label ?? "Consulta",
    [queryType]
  );

  const remaining = MAX_MESSAGE_LENGTH - message.length;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanMessage = message.trim();
    const cleanName = senderName.trim();
    if (!cleanMessage || !cleanName) return;

    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`${getApiBase()}/pos/contact-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query_type: queryType,
          message: cleanMessage,
          sender_name: cleanName,
          sender_email: senderEmail.trim() || null,
          source: "web_contacto",
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail =
          typeof payload?.detail === "string"
            ? payload.detail
            : "No pudimos enviar tu solicitud. Intenta de nuevo.";
        throw new Error(detail);
      }

      setSuccessMessage(
        `Solicitud enviada correctamente (${selectedQueryLabel}). Te responderemos pronto.`
      );
      setMessage("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No pudimos enviar tu solicitud. Intenta de nuevo."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="solicitud" className="mt-6 border-t border-slate-200/80 pt-5">
      <h3 className="text-lg font-semibold text-slate-900">Solicitar ayuda</h3>
      <p className="mt-1 text-sm text-slate-600">
        Completa este formulario y te enviaremos la solicitud por correo directamente.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Tipo de ayuda</span>
          <select
            value={queryType}
            onChange={(event) => setQueryType(event.target.value as QueryType)}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 outline-none transition focus:border-blue-500"
            required
          >
            {QUERY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Nombre</span>
            <input
              type="text"
              value={senderName}
              onChange={(event) => setSenderName(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 outline-none transition focus:border-blue-500"
              placeholder="Tu nombre"
              maxLength={80}
              required
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              Correo de respuesta (opcional)
            </span>
            <input
              type="email"
              value={senderEmail}
              onChange={(event) => setSenderEmail(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 outline-none transition focus:border-blue-500"
              placeholder="correo@empresa.com"
              maxLength={120}
            />
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Describe tu solicitud</span>
          <textarea
            value={message}
            onChange={(event) =>
              setMessage(event.target.value.slice(0, MAX_MESSAGE_LENGTH))
            }
            className="mt-1 min-h-[130px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 outline-none transition focus:border-blue-500"
            placeholder="Cuéntanos qué necesitas y te respondemos lo antes posible."
            required
          />
          <div className="mt-1 text-right text-xs text-slate-500">
            {remaining} caracteres disponibles
          </div>
        </label>

        <button
          type="submit"
          disabled={submitting || !message.trim() || !senderName.trim()}
          className="rounded-xl bg-gradient-to-r from-[#2563eb] to-[#4338ca] px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:brightness-110"
        >
          {submitting ? "Enviando..." : "Enviar solicitud"}
        </button>
        {successMessage && (
          <p className="text-sm font-medium text-emerald-700">{successMessage}</p>
        )}
        {errorMessage && (
          <p className="text-sm font-medium text-rose-700">{errorMessage}</p>
        )}
      </form>
    </section>
  );
}

"use client";

import Link from "next/link";

const sections = [
  {
    title: "1) Instalar Print Agent Tray",
    items: [
      "Descarga el instalador oficial para Windows.",
      "Ejecuta el setup y finaliza la instalacion.",
      "Valida que el agente quede activo en la bandeja del sistema.",
    ],
  },
  {
    title: "2) Verificar servicio local",
    items: [
      "Abre http://127.0.0.1:5177/ui en el navegador.",
      "Confirma estado operativo del agente.",
      "Si no responde, reinicia el agente desde la bandeja.",
    ],
  },
  {
    title: "3) Configurar impresora SATO",
    items: [
      "Instala el driver oficial de la impresora SATO.",
      "Selecciona la impresora SATO en la configuracion del agente.",
      "Ejecuta una impresion de prueba de etiqueta.",
    ],
  },
  {
    title: "4) Validar desde Metrik",
    items: [
      "En Metrik, usa modo de impresion por agente local.",
      "Imprime una etiqueta de prueba.",
      "Si falla, revisa firewall local y permisos de red local.",
    ],
  },
];

export default function PrintAgentTraySetupPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Guia operativa
          </p>
          <h1 className="text-2xl font-semibold">Configuracion Print Agent Tray (SATO)</h1>
          <p className="text-sm text-slate-400">
            Checklist rapido para conectar Metrik con impresora SATO de etiquetas.
          </p>
        </header>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm">
          Descarga instalador oficial:
          {" "}
          <a
            href="https://github.com/Kennetox/Kensar-print-agent-tray/releases/latest/download/KensarPrintAgent-Setup-0.1.0.exe"
            target="_blank"
            rel="noreferrer"
            className="text-blue-300 underline"
          >
            Print Agent Tray para Windows
          </a>
          .
        </div>

        {sections.map((section) => (
          <section
            key={section.title}
            className="space-y-2 rounded-2xl border border-slate-800 bg-slate-900/40 p-4"
          >
            <h2 className="text-base font-semibold">{section.title}</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}

        <div className="flex gap-3">
          <Link
            href="/descargas"
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800/70"
          >
            Volver a descargas
          </Link>
        </div>
      </div>
    </main>
  );
}

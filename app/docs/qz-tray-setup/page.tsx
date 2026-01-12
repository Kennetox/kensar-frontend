"use client";

import Link from "next/link";

const sections = [
  {
    title: "1) Instalar QZ Tray",
    items: [
      "Descarga desde https://qz.io/download/.",
      "Instala y deja QZ Tray abierto en segundo plano.",
    ],
  },
  {
    title: "2) Importar el certificado del POS",
    items: [
      "Abre https://api.metrikpos.com/pos/qz/cert y guarda como qz_api.crt.",
      "QZ Tray > Site Manager > + > selecciona qz_api.crt.",
      "Verifica que el fingerprint coincida con el del API.",
    ],
  },
  {
    title: "3) Configurar en el POS",
    items: [
      "Menu > Configurar impresora.",
      "Selecciona 'Conector local (QZ Tray)'.",
      "Detecta impresoras y elige la correcta.",
      "Guarda.",
    ],
  },
  {
    title: "Si aparece Invalid Signature",
    items: [
      "El certificado importado no coincide con el backend.",
      "Vuelve a importar el cert correcto del API.",
    ],
  },
];

export default function QzTraySetupPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Guia operativa
          </p>
          <h1 className="text-2xl font-semibold">Configuracion QZ Tray</h1>
          <p className="text-sm text-slate-400">
            Este checklist deja la impresion funcionando en minutos.
          </p>
        </header>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm">
          Descarga QZ Tray en{" "}
          <a
            href="https://qz.io/download/"
            target="_blank"
            rel="noreferrer"
            className="text-blue-300 underline"
          >
            qz.io/download
          </a>
          .
        </div>

        {sections.map((section) => (
          <section
            key={section.title}
            className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-2"
          >
            <h2 className="text-base font-semibold">{section.title}</h2>
            <ul className="list-disc pl-5 text-sm text-slate-300 space-y-1">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}

        <section className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 text-sm space-y-2">
          <h2 className="text-base font-semibold">Nota macOS</h2>
          <p className="text-slate-300">
            Si QZ no deja importar el certificado, usa override.crt:
          </p>
          <pre className="whitespace-pre-wrap rounded-lg bg-slate-950 px-3 py-2 text-[12px] text-slate-200 border border-slate-800">
sudo cp ~/Downloads/qz_api.crt &quot;/Applications/QZ Tray.app/Contents/Resources/override.crt&quot;
          </pre>
          <p className="text-slate-300">Reinicia QZ Tray despues de copiar.</p>
        </section>

        <div className="text-xs text-slate-500">
          Archivo local de referencia: <code>docs/qz-tray-setup.md</code>
        </div>

        <div className="flex gap-3">
          <Link
            href="/pos"
            className="px-4 py-2 rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800/70 text-sm"
          >
            Volver al POS
          </Link>
        </div>
      </div>
    </main>
  );
}

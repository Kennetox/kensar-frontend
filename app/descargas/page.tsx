import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Descargas",
  description:
    "Centro de descargas de Metrik: POS escritorio, Print Agent Tray y recursos de configuracion.",
  alternates: {
    canonical: "/descargas",
  },
};

type DownloadResource = {
  name: string;
  logo: string;
  logoClassName?: string;
  platform: string;
  description: string;
  downloadHref: string;
  manualHref: string;
  requirements: string;
};

const resources: DownloadResource[] = [
  {
    name: "Metrik POS",
    logo: "/branding/metriklogo_square.png",
    platform: "Windows",
    description:
      "Aplicacion principal para estaciones de caja con login por estacion y PIN por vendedor.",
    downloadHref:
      "https://github.com/Kennetox/kensar_pos_desktop/releases/latest/download/MetrikPOS-Setup.exe",
    manualHref: "/descargar-pos",
    requirements: "Windows 10 o superior · Internet estable",
  },
  {
    name: "Metrik Print Agent Tray",
    logo: "/branding/metrik-print-agent.svg",
    logoClassName: "h-16 w-16",
    platform: "Windows",
    description:
      "Conector local para integrar Metrik con impresoras SATO de etiquetas desde la bandeja del sistema.",
    downloadHref:
      "https://github.com/Kennetox/Kensar-print-agent-tray/releases/latest/download/KensarPrintAgent-Setup-0.1.0.exe",
    manualHref: "/docs/print-agent-tray-setup",
    requirements: "Windows 10 o superior · Impresora SATO instalada",
  },
  {
    name: "QZ Tray",
    logo: "/branding/qz-tray.svg",
    platform: "Windows / macOS",
    description:
      "Conector de impresion termica para el POS web cuando se usa modo QZ Tray.",
    downloadHref: "https://qz.io/download/",
    manualHref: "/docs/qz-tray-setup",
    requirements: "QZ Tray 2.2.x · Certificado del API importado",
  },
  {
    name: "Metrik Stock Mobile",
    logo: "/branding/logo-stock.png",
    platform: "Android",
    description:
      "App complementaria para inventario y operaciones de stock desde dispositivo Android.",
    downloadHref:
      "mailto:kensarelec@gmail.com?cc=kennethjc2301@gmail.com&subject=Solicitud%20APK%20Metrik%20Stock",
    manualHref:
      "mailto:kensarelec@gmail.com?cc=kennethjc2301@gmail.com&subject=Solicitud%20manual%20Metrik%20Stock",
    requirements: "Android 10 o superior · Cuenta activa en Metrik",
  },
];

export default function DescargasPage() {
  return (
    <main
      className="relative min-h-screen bg-cover bg-center overflow-x-hidden"
      style={{
        backgroundImage:
          "url('https://images.unsplash.com/photo-1556742044-3c52d6e88c62?auto=format&fit=crop&q=80&w=2070')",
      }}
    >
      <div className="min-h-screen bg-white/70 backdrop-blur-sm">
        <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-10 sm:px-6 lg:px-12">
          <nav className="flex flex-col gap-4 rounded-3xl bg-white/80 px-6 py-5 shadow-lg sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <div className="flex items-center gap-4">
              <Image
                src="/branding/metriklogo.png"
                alt="Logo Metrik"
                width={48}
                height={48}
                className="h-12 w-12 rounded-2xl"
                priority
              />
              <div>
                <p className="text-xl font-bold tracking-tight text-slate-900">
                  METRIK
                </p>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  Centro de descargas
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/"
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-500 hover:text-slate-900"
              >
                Volver al inicio
              </Link>
              <Link
                href="/login"
                className="rounded-full border border-blue-300 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-500/20"
              >
                Ingresar al panel
              </Link>
            </div>
          </nav>

          <section className="mt-8 rounded-3xl bg-white/85 p-5 shadow-2xl sm:p-9">
            <p className="text-sm uppercase tracking-[0.35em] text-slate-500">
              Recursos para nuevas estaciones
            </p>
            <h1 className="mt-3 text-[1.7rem] font-bold text-slate-900 sm:text-[2.8rem]">
              Descargas de Metrik
            </h1>
            <p className="mt-3 text-[0.95rem] text-slate-600 sm:text-[1.05rem]">
              Un solo espacio con todas las apps oficiales para instalar y dejar
              operativo un nuevo equipo.
            </p>
            <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80">
              {resources.map((resource, index) => (
                <article
                  key={resource.name}
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
                    href={resource.downloadHref}
                    aria-label={`Descargar ${resource.name}`}
                    title={`Descargar ${resource.name}`}
                    target={resource.downloadHref.startsWith("http") ? "_blank" : undefined}
                    rel={resource.downloadHref.startsWith("http") ? "noreferrer" : undefined}
                    className="inline-flex items-center justify-center self-end text-[#3154e8] transition hover:scale-105 hover:text-[#2a45c5] sm:self-auto"
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
          </section>

          <footer className="mt-10 rounded-3xl bg-white/80 px-5 py-5 text-center text-xs text-slate-500 shadow-lg sm:px-10 sm:text-sm">
            © {new Date().getFullYear()} Metrik · Kensar Electronic
          </footer>
        </div>
      </div>
    </main>
  );
}

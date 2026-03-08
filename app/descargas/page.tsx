import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import DownloadsAccessPanel from "@/app/descargas/DownloadsAccessPanel";
import { downloadResources } from "@/lib/downloadResources";

export const metadata: Metadata = {
  title: "Descargas",
  description:
    "Centro de descargas de Metrik: POS escritorio, Print Agent Tray y recursos de configuracion.",
  alternates: {
    canonical: "/descargas",
  },
};

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
            <DownloadsAccessPanel resources={downloadResources} />
          </section>

          <footer className="mt-10 rounded-3xl bg-white/80 px-5 py-5 text-center text-xs text-slate-500 shadow-lg sm:px-10 sm:text-sm">
            © {new Date().getFullYear()} Metrik · Kensar Electronic
          </footer>
        </div>
      </div>
    </main>
  );
}

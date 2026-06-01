import type { Metadata } from "next";
import Image from "next/image";
import { Inter } from "next/font/google";
import LandingNavbar from "../components/landing/LandingNavbar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Nosotros",
  description: "Historia y visión de Metrik: una plataforma empresarial nacida desde una operación real.",
  alternates: {
    canonical: "/nosotros",
  },
};

export default function AboutPage() {
  return (
    <main className={`${inter.className} min-h-screen bg-[#F1F5F9] text-[#0F172A]`}>
      <div className="mx-auto w-full max-w-[1180px] px-4 pb-14 pt-5 sm:px-6 lg:px-8">
        <LandingNavbar className="mb-8" />

        <section className="grid items-center gap-7 lg:grid-cols-[1.05fr_1fr]">
          <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Nuestra historia</p>
            <h1 className="mt-3 text-[clamp(1.9rem,4vw,3rem)] font-bold tracking-tight text-[#0F172A]">
              Metrik nació dentro de una empresa real.
            </h1>
            <p className="mt-4 text-slate-600">
              Metrik empezó como una necesidad concreta: controlar inventario, ventas, etiquetas y operaciones sin depender de procesos manuales.
            </p>
            <p className="mt-3 text-slate-600">
              Con el tiempo evolucionó desde una solución interna hasta una plataforma empresarial moderna, diseñada para negocios que quieren operar con datos en tiempo real y tomar mejores decisiones.
            </p>
            <p className="mt-3 text-slate-600">
              Hoy Metrik conecta operación comercial y administrativa en un mismo sistema: punto de venta, inventario, reportes, documentos y comercio web.
            </p>
          </article>

          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-3 shadow-[0_24px_60px_-35px_rgba(15,23,42,0.45)]">
            <Image
              src="/branding/metrik-og.png"
              alt="Interfaz de Metrik"
              width={5000}
              height={2625}
              className="h-full w-full rounded-2xl object-cover object-top"
              priority
            />
          </div>
        </section>
      </div>
    </main>
  );
}

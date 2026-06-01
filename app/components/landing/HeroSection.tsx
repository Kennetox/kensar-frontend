import Image from "next/image";
import Link from "next/link";
import HeroVisualMotion from "./HeroVisualMotion";
import RevealOnScroll from "./RevealOnScroll";

const heroBenefits = [
  { label: "Fácil de usar", icon: "/landing-v2/facil-de-usar.png" },
  { label: "En la nube", icon: "/landing-v2/en-la-nube.png" },
  { label: "Seguro y confiable", icon: "/landing-v2/seguro-confiable.png" },
  { label: "Soporte personalizado", icon: "/landing-v2/soporte-personalizado.png" },
];

export default function HeroSection() {
  return (
    <section id="producto" className="grid items-center gap-8 py-8 sm:py-10 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:py-14">
      <div>
        <RevealOnScroll delayMs={20}>
          <p className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Sistema operativo para negocios
          </p>
        </RevealOnScroll>

        <RevealOnScroll delayMs={110}>
          <h1 className="mt-5 text-[clamp(2.15rem,5vw,4rem)] font-extrabold leading-[0.96] tracking-tight text-[#0F172A]">
            Controla tu negocio desde un solo lugar.
          </h1>
        </RevealOnScroll>

        <RevealOnScroll delayMs={190}>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
            Ventas, inventario, reportes y operaciones conectadas en tiempo real para que tomes mejores decisiones.
          </p>
        </RevealOnScroll>

        <RevealOnScroll delayMs={270}>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/contacto#solicitud"
              className="landing-cta-primary rounded-xl bg-gradient-to-r from-[#2563EB] to-[#1d4ed8] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:brightness-110"
            >
              Solicitar demo
            </Link>
            <Link
              href="#soluciones"
              className="rounded-xl border border-emerald-300 bg-white px-6 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
            >
              Ver módulos
            </Link>
          </div>
        </RevealOnScroll>

        <RevealOnScroll delayMs={330}>
          <div className="mt-7 grid gap-2.5 text-sm text-slate-600 sm:grid-cols-2 sm:text-[0.95rem]">
            {heroBenefits.map((benefit) => (
              <p key={benefit.label} className="flex items-center gap-3">
                <Image
                  src={benefit.icon}
                  alt=""
                  width={26}
                  height={26}
                  className="h-[26px] w-[26px] object-contain"
                  aria-hidden
                />
                <span>{benefit.label}</span>
              </p>
            ))}
          </div>
        </RevealOnScroll>
      </div>

      <RevealOnScroll delayMs={150} className="relative lg:pl-1" y={10}>
        <div className="hero-soft-glow absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-r from-emerald-100/70 via-white to-blue-100/70 blur-2xl" />
        <HeroVisualMotion>
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-2.5 shadow-[0_30px_70px_-30px_rgba(37,99,235,0.45)]">
            <Image
              src="/landing-v2/primer-hero.png"
              alt="Dashboard de Metrik"
              width={1536}
              height={1024}
              className="h-auto w-full rounded-2xl object-cover"
              priority
            />
          </div>
        </HeroVisualMotion>
      </RevealOnScroll>
    </section>
  );
}

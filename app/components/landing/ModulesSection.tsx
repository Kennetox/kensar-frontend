import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import RevealOnScroll from "./RevealOnScroll";

type ModuleItem = {
  name: string;
  icon: ReactNode;
  accentClass: string;
};

const moduleItems: ModuleItem[] = [
  {
    name: "POS / Caja",
    accentClass: "text-blue-600",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6">
        <rect x="4" y="6" width="16" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M4 10h16" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 14h4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    name: "Inventario",
    accentClass: "text-emerald-600",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6">
        <path d="M4 7.5L12 4l8 3.5v9L12 20l-8-3.5v-9z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M12 4v16M4 7.5l8 3.5 8-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    name: "Reportes",
    accentClass: "text-cyan-600",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6">
        <path d="M4 19h16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M7 16V9m5 7V6m5 10v-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    name: "Documentos",
    accentClass: "text-sky-600",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6">
        <path d="M7 3h6l4 4v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M13 3v5h5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M8 12h8M8 16h6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    name: "Etiquetas",
    accentClass: "text-indigo-600",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6">
        <path d="M3 12l9-9h6l3 3v6l-9 9-9-9z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <circle cx="16.5" cy="7.5" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    ),
  },
  {
    name: "Comercio Web",
    accentClass: "text-blue-600",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6">
        <path d="M5 6.5h14l-1.2 7.2a2 2 0 0 1-2 1.7H8.2a2 2 0 0 1-2-1.7L5 6.5z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M8 6.5V5a4 4 0 0 1 8 0v1.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="9" cy="19" r="1.4" fill="currentColor" />
        <circle cx="16" cy="19" r="1.4" fill="currentColor" />
      </svg>
    ),
  },
  {
    name: "Recursos Humanos",
    accentClass: "text-emerald-600",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6">
        <circle cx="9" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M4.5 18a4.5 4.5 0 0 1 9 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="17.5" cy="9" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M14.8 17.2a3.4 3.4 0 0 1 5.4-.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    name: "Y más...",
    accentClass: "text-blue-600",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6">
        <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    ),
  },
];

const sectionBenefits = [
  "Interfaz limpia y fácil de usar",
  "Accede desde cualquier lugar",
  "Información 100% segura",
  "Actualizaciones constantes",
];

export default function ModulesSection() {
  return <ModulesSectionContent showTop showFeature />;
}

type ModulesSectionProps = {
  showTop?: boolean;
  showFeature?: boolean;
  sectionClassName?: string;
};

export function ModulesSectionContent({
  showTop = true,
  showFeature = true,
  sectionClassName,
}: ModulesSectionProps) {
  return (
    <section className={sectionClassName ?? "py-10 sm:py-12"}>
      {showTop ? (
        <div className="p-1 sm:p-2">
          <RevealOnScroll>
            <p className="text-center text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
              Módulos que impulsan tu negocio
            </p>
          </RevealOnScroll>
          <RevealOnScroll delayMs={90}>
            <h2 className="mt-3 text-center text-[clamp(1.8rem,4vw,2.75rem)] font-bold tracking-tight text-[#0F172A]">
              Todo lo que necesitas, en un solo sistema.
            </h2>
          </RevealOnScroll>

          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {moduleItems.map((item, index) => (
              <RevealOnScroll key={item.name} delayMs={120 + index * 45} y={16}>
                <div className="landing-module-card landing-premium-card rounded-2xl border border-slate-200 bg-white px-3 py-4 text-center transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
                  <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-emerald-50 ${item.accentClass}`}>
                    {item.icon}
                  </div>
                  <p className="mt-2 text-sm font-medium leading-tight text-slate-700 sm:text-[0.95rem]">{item.name}</p>
                </div>
              </RevealOnScroll>
            ))}
          </div>
        </div>
      ) : null}

      {showFeature ? (
        <div className={`${showTop ? "mt-8" : "mt-0"} grid items-center gap-6 lg:grid-cols-[0.78fr_1.22fr] lg:gap-7`}>
          <RevealOnScroll y={16}>
            <article>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
                Hecho para negocios reales
              </p>
              <h3 className="mt-2 text-[clamp(1.6rem,3.5vw,2.5rem)] font-bold leading-tight tracking-tight text-[#0F172A]">
                Un sistema moderno, intuitivo y poderoso
              </h3>
              <p className="mt-3 text-slate-600">
                Metrik se adapta a tu negocio y te da el control total desde cualquier dispositivo.
              </p>

              <ul className="mt-5 space-y-2.5 text-sm text-slate-700">
                {sectionBenefits.map((benefit, index) => (
                  <li
                    key={benefit}
                    className="flex items-center gap-2.5 landing-benefit-item"
                    style={{ transitionDelay: `${index * 65}ms` }}
                  >
                    <span className="text-emerald-600">✓</span>
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="#producto"
                className="landing-cta-primary mt-6 inline-flex rounded-xl bg-gradient-to-r from-[#2563EB] to-[#1d4ed8] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:brightness-110"
              >
                Ver todos los módulos
              </Link>
            </article>
          </RevealOnScroll>

          <RevealOnScroll delayMs={140} className="landing-device-frame" y={18}>
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-2 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.45)]">
              <Image
                src="/landing-v2/un-solo-sistema.png"
                alt="Metrik en desktop, tablet y móvil"
                width={1536}
                height={1024}
                className="h-auto w-full rounded-[1.25rem] object-cover"
              />
            </div>
          </RevealOnScroll>
        </div>
      ) : null}
    </section>
  );
}

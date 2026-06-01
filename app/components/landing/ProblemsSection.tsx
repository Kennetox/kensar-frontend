import Image from "next/image";
import { problemCards } from "./landing-data";
import RevealOnScroll from "./RevealOnScroll";

export default function ProblemsSection() {
  return (
    <section id="soluciones" className="py-10 sm:py-12">
      <RevealOnScroll>
        <p className="text-center text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Diseñado para resolver lo que te detiene</p>
      </RevealOnScroll>
      <RevealOnScroll delayMs={90}>
        <h2 className="mt-3 text-center text-[clamp(1.8rem,4vw,2.75rem)] font-bold tracking-tight text-[#0F172A]">
          Menos desorden. Más control.
        </h2>
      </RevealOnScroll>
      <RevealOnScroll delayMs={170}>
        <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">
          Elimina procesos manuales y opera con datos en vivo desde una sola plataforma.
        </p>
      </RevealOnScroll>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {problemCards.map((card, index) => (
          <RevealOnScroll key={card.title} delayMs={100 + index * 70} y={18}>
            <article className="landing-lift-card landing-premium-card rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-lg">
              <Image
                src={card.icon}
                alt=""
                width={64}
                height={64}
                className="h-16 w-16 rounded-2xl object-contain"
                aria-hidden
              />
              <h3 className="mt-4 text-lg font-semibold leading-tight text-[#0F172A]">{card.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 sm:text-[0.95rem]">{card.description}</p>
            </article>
          </RevealOnScroll>
        ))}
      </div>
    </section>
  );
}

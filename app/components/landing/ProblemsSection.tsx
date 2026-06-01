 "use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { problemCards } from "./landing-data";
import RevealOnScroll from "./RevealOnScroll";

export default function ProblemsSection() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % problemCards.length);
    }, 4500);

    return () => window.clearInterval(timer);
  }, []);

  const activeCard = problemCards[activeIndex];

  return (
    <section id="soluciones" className="py-10 sm:py-14">
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
            <article
              className={`landing-lift-card landing-premium-card rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${
                activeIndex === index ? "border-emerald-300 shadow-lg shadow-emerald-100/40" : "border-slate-200 hover:border-emerald-200"
              }`}
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onClick={() => setActiveIndex(index)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setActiveIndex(index);
                }
              }}
              role="button"
              tabIndex={0}
              aria-pressed={activeIndex === index}
            >
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

      <RevealOnScroll delayMs={190} y={22}>
        <article className="landing-problem-detail mt-6 rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50/80 via-white to-blue-50/70 p-6 shadow-sm sm:mt-7 sm:p-7">
          <div key={activeCard.title} className="landing-problem-detail-enter">
            <div className="flex items-start gap-4">
              <Image src={activeCard.icon} alt="" width={48} height={48} className="h-12 w-12 rounded-xl object-contain" aria-hidden />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">{activeCard.title}</p>
                <h3 className="mt-1 text-xl font-bold tracking-tight text-[#0F172A] sm:text-2xl">{activeCard.detailTitle}</h3>
                <p className="mt-2 max-w-4xl text-sm leading-relaxed text-slate-600 sm:text-base">{activeCard.detailBody}</p>
              </div>
            </div>

            <ul className="mt-5 grid gap-2 text-sm text-slate-700 sm:grid-cols-3 sm:text-[0.96rem]">
              {activeCard.detailPoints.map((point) => (
                <li key={point} className="rounded-xl border border-white/80 bg-white/70 px-3 py-2">
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </article>
      </RevealOnScroll>
    </section>
  );
}

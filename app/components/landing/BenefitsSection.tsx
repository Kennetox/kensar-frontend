import { benefits } from "./landing-data";

export default function BenefitsSection() {
  return (
    <section className="py-12">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Beneficios</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-[#0F172A]">
          Un sistema moderno, intuitivo y poderoso.
        </h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map((item) => (
            <div key={item} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
              ✔ {item}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

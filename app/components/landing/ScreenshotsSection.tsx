import Image from "next/image";

const screenshots = [
  { title: "Dashboard", image: "/branding/metrik-og.png" },
  { title: "Reportes", image: "/branding/metrik-og.png" },
  { title: "POS", image: "/branding/metrik-pos-mobile-logo.png" },
  { title: "Inventario", image: "/branding/metrik-og.png" },
];

export default function ScreenshotsSection() {
  return (
    <section id="capturas" className="py-12">
      <p className="text-center text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Hecho para negocios reales</p>
      <h2 className="mt-3 text-center text-[clamp(1.8rem,4vw,2.75rem)] font-bold tracking-tight text-[#0F172A]">
        Diseñado para negocios reales.
      </h2>

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {screenshots.map((shot) => (
          <article key={shot.title} className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-3 shadow-[0_24px_60px_-34px_rgba(15,23,42,0.45)]">
            <div className="mb-3 flex items-center justify-between px-1">
              <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-700">{shot.title}</h3>
              <span className="text-xs text-slate-400">Metrik</span>
            </div>
            <Image
              src={shot.image}
              alt={`Vista de ${shot.title} en Metrik`}
              width={5000}
              height={2625}
              className="h-[260px] w-full rounded-2xl object-cover object-top"
            />
          </article>
        ))}
      </div>
    </section>
  );
}

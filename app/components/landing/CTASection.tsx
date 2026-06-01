import Link from "next/link";

export default function CTASection() {
  return (
    <section className="py-12">
      <div className="rounded-3xl bg-gradient-to-r from-[#22C55E] via-[#1f9fc5] to-[#2563EB] px-6 py-8 text-white shadow-[0_25px_55px_-25px_rgba(37,99,235,0.75)] sm:px-9 sm:py-10">
        <p className="text-sm font-medium text-white/80">Escala con control</p>
        <h2 className="mt-2 text-[clamp(1.6rem,4vw,2.35rem)] font-bold leading-tight">
          ¿Listo para tener el control total de tu negocio?
        </h2>
        <div className="mt-6">
          <Link
            href="/contacto#solicitud"
            className="inline-flex rounded-xl bg-white px-5 py-3 text-sm font-semibold text-[#0F172A] transition hover:bg-slate-100"
          >
            Solicitar demo
          </Link>
        </div>
      </div>
    </section>
  );
}

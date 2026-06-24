import type { Metadata } from "next";
import Link from "next/link";
import LandingNavbar from "../components/landing/LandingNavbar";
import ContactHelpForm from "./ContactHelpForm";

export const metadata: Metadata = {
  title: "Contacto",
  description: "Solicita una demo de Metrik o contacta a nuestro equipo por correo y WhatsApp.",
  alternates: {
    canonical: "/contacto",
  },
};

const CONTACT_EMAIL = "kensarelec@gmail.com";
const WHATSAPP_NUMBER = "573136397939";
const WHATSAPP_FORMATTED = "+57 313 639 7939";
const CONTACT_MESSAGE = "Hola, quiero información de Metrik y una demo.";

export default function ContactPage() {
  const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(CONTACT_MESSAGE)}`;

  return (
    <main className="min-h-screen bg-[#F1F5F9] text-[#0F172A]">
      <div className="mx-auto w-full max-w-[1180px] px-4 pb-14 pt-5 sm:px-6 lg:px-8">
        <LandingNavbar className="mb-8" />

        <section className="grid gap-6 lg:grid-cols-[1fr_1.05fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Contacto</p>
            <h1 className="mt-3 text-[clamp(1.9rem,4vw,3rem)] font-bold tracking-tight text-[#0F172A]">
              Conversemos sobre tu operación.
            </h1>
            <p className="mt-3 text-slate-600">
              Te ayudamos a implementar Metrik para ventas, inventario y reportes en tiempo real.
            </p>

            <div className="mt-6 space-y-3">
              <a href={`mailto:${CONTACT_EMAIL}`} className="block rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 hover:bg-slate-100">
                Correo: <span className="font-semibold">{CONTACT_EMAIL}</span>
              </a>
              <a href={whatsappUrl} target="_blank" rel="noreferrer" className="block rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 hover:bg-slate-100">
                WhatsApp: <span className="font-semibold">{WHATSAPP_FORMATTED}</span>
              </a>
              <Link href="/demo" className="block rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 hover:bg-slate-100">
                Solicitud de demo: <span className="font-semibold">Ver demo</span>
              </Link>
            </div>

            <div className="mt-6 rounded-2xl bg-gradient-to-r from-[#22C55E] to-[#2563EB] p-[1px]">
              <div className="rounded-2xl bg-white px-5 py-4 text-sm text-slate-600">
                Respondemos solicitudes comerciales y de soporte en horario laboral.
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-2xl font-bold text-[#0F172A]">Solicitar demo</h2>
            <p className="mt-2 text-sm text-slate-600">
              Completa el formulario y nuestro equipo te contactará para coordinar una demo.
            </p>
            <ContactHelpForm />
          </div>
        </section>
      </div>
    </main>
  );
}

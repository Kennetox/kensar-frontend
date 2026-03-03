import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import ContactHelpForm from "./ContactHelpForm";

export const metadata: Metadata = {
  title: "Contacto",
  description:
    "Canales de contacto de Kensar Electronic para ventas y soporte de Metrik.",
  alternates: {
    canonical: "/contacto",
  },
};

const CONTACT_EMAIL = "kensarelec@gmail.com";
const CONTACT_EMAIL_CC = "kennethjc2301@gmail.com";
const WHATSAPP_NUMBER = "573136397939";
const WHATSAPP_FORMATTED = "+57 313 639 7939";
const ADDRESS = "Cra 24 #30-75, Palmira, Valle del Cauca, Colombia";
const MAP_QUERY = "Cra 24 #30-75 Palmira";

const CONTACT_MESSAGE = "Hola%20Kensar,%20quiero%20informaci%C3%B3n%20de%20Metrik.";

const contactWhatsAppUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${CONTACT_MESSAGE}`;
const contactMailtoUrl = `mailto:${CONTACT_EMAIL}?cc=${CONTACT_EMAIL_CC}&subject=Contacto%20Metrik`;
const mapEmbedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(MAP_QUERY)}&z=15&output=embed`;
const mapOpenUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(MAP_QUERY)}`;

export default function ContactPage() {
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
                <p className="text-xl font-bold tracking-tight text-slate-900">METRIK</p>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  Contacto
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

          <section className="mt-10 rounded-3xl bg-white/85 p-6 shadow-2xl sm:p-10">
            <p className="text-sm uppercase tracking-[0.35em] text-slate-500">
              Canales oficiales
            </p>
            <h1 className="mt-4 text-3xl font-bold text-slate-900 sm:text-5xl">
              Contacta a Kensar
            </h1>
            <p className="mt-4 text-base text-slate-600 sm:text-lg">
              Usa estos canales para ventas, implementacion y soporte tecnico de Metrik.
            </p>

            <div className="mt-8">
              <article
                id="ventas"
                className="relative rounded-2xl border border-slate-200/80 bg-white/80 p-6"
              >
                <h2 className="text-xl font-semibold text-slate-900">Contacto</h2>
                <div className="pointer-events-none absolute right-6 top-6 hidden items-center gap-3 rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2 md:flex">
                  <Image
                    src="/branding/metriklogo_square.png"
                    alt="Logo Metrik"
                    width={64}
                    height={64}
                    className="h-[64px] w-[64px] rounded-lg object-contain"
                  />
                  <div className="h-12 w-px bg-slate-200" />
                  <Image
                    src="/assets/kensarlogoticket.svg"
                    alt="Logo Kensar Electronic"
                    width={200}
                    height={56}
                    className="h-[56px] w-auto object-contain"
                  />
                </div>
                <p className="mt-2 text-slate-600 md:pr-[320px]">
                  Correo:{" "}
                  <a
                    href={contactMailtoUrl}
                    className="font-medium text-blue-700 underline underline-offset-2"
                  >
                    {CONTACT_EMAIL}
                  </a>
                </p>
                <p className="mt-2 text-slate-600 md:pr-[320px]">
                  WhatsApp:{" "}
                  <a
                    href={contactWhatsAppUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-blue-700 underline underline-offset-2"
                  >
                    {WHATSAPP_FORMATTED}
                  </a>
                </p>
                <a
                  href={contactWhatsAppUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block text-sm font-semibold text-slate-700 underline underline-offset-2 hover:text-slate-900 md:pr-[320px]"
                >
                  Abrir WhatsApp
                </a>

                <div className="mt-6 border-t border-slate-200/80 pt-5">
                  <p className="text-slate-600">
                    Dirección: <span className="font-medium text-slate-700">{ADDRESS}</span>
                  </p>
                  <a
                    href={mapOpenUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-sm font-semibold text-slate-700 underline underline-offset-2 hover:text-slate-900"
                  >
                    Abrir en Google Maps
                  </a>
                  <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                    <iframe
                      title="Mapa ubicación Kensar"
                      src={mapEmbedUrl}
                      width="100%"
                      height="220"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  </div>
                </div>

                <ContactHelpForm />
              </article>
            </div>
          </section>

          <footer className="mt-12 rounded-3xl bg-white/80 px-5 py-6 text-center text-sm text-slate-500 shadow-lg sm:px-10">
            © {new Date().getFullYear()} Metrik · Kensar Electronic
          </footer>
        </div>
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Politica de Cookies",
  description:
    "Politica de cookies de Metrik: tipos de cookies, finalidades y preferencias de consentimiento.",
  alternates: {
    canonical: "/politica-de-cookies",
  },
};

const UPDATED_AT = "8 de marzo de 2026";

export default function CookiePolicyPage() {
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
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Documentacion legal</p>
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
                href="/descargas"
                className="rounded-full border border-blue-300 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-500/20"
              >
                Ir a descargas
              </Link>
            </div>
          </nav>

          <section className="mt-10 rounded-3xl bg-white/85 p-6 shadow-2xl sm:p-10">
            <p className="text-sm uppercase tracking-[0.35em] text-slate-500">Politicas y cumplimiento</p>
            <h1 className="mt-4 text-3xl font-bold text-slate-900 sm:text-5xl">Politica de Cookies</h1>
            <p className="mt-4 text-base text-slate-600 sm:text-lg">
              Esta politica explica como Metrik usa cookies en su sitio web para seguridad,
              funcionamiento y mejora del servicio.
            </p>
            <p className="mt-2 text-sm text-slate-500">Ultima actualizacion: {UPDATED_AT}</p>

            <div className="mt-8 space-y-5 rounded-2xl border border-slate-200/80 bg-white/80 p-5 sm:p-8">
              <article>
                <h2 className="text-xl font-semibold text-slate-900">1. Que son las cookies</h2>
                <p className="mt-2 leading-7 text-slate-700">
                  Son archivos pequenos que el navegador guarda para recordar estados, preferencias
                  y parametros tecnicos de una sesion web.
                </p>
              </article>

              <article>
                <h2 className="text-xl font-semibold text-slate-900">2. Cookies que usamos hoy</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 leading-7 text-slate-700">
                  <li>
                    <strong>Esenciales:</strong> necesarias para operacion y seguridad. Ejemplo:
                    cookie de acceso temporal para habilitar descargas autorizadas.
                  </li>
                  <li>
                    <strong>Preferencias:</strong> guardan tu decision de consentimiento de cookies.
                  </li>
                </ul>
              </article>

              <article>
                <h2 className="text-xl font-semibold text-slate-900">3. Cookies no esenciales</h2>
                <p className="mt-2 leading-7 text-slate-700">
                  Actualmente no activamos cookies de analitica o marketing por defecto.
                  Si en el futuro se habilitan, se solicitaran mediante consentimiento explicito.
                </p>
              </article>

              <article>
                <h2 className="text-xl font-semibold text-slate-900">4. Como gestionar tus preferencias</h2>
                <p className="mt-2 leading-7 text-slate-700">
                  Puedes aceptar solo cookies esenciales o aceptar todas desde el banner.
                  Tambien puedes reabrir preferencias desde el boton fijo &quot;Cookies&quot;.
                </p>
              </article>

              <article>
                <h2 className="text-xl font-semibold text-slate-900">5. Base legal</h2>
                <p className="mt-2 leading-7 text-slate-700">
                  Las cookies esenciales se usan por interes legitimo y necesidad tecnica de
                  prestacion del servicio. Las no esenciales requieren consentimiento previo.
                </p>
              </article>

              <article>
                <h2 className="text-xl font-semibold text-slate-900">6. Contacto</h2>
                <p className="mt-2 leading-7 text-slate-700">
                  Para dudas sobre cookies y privacidad escribe a{" "}
                  <a href="mailto:kensarelec@gmail.com?cc=kennethjc2301@gmail.com">
                    kensarelec@gmail.com
                  </a>.
                </p>
              </article>
            </div>
          </section>

          <footer className="mt-12 rounded-3xl bg-white/80 px-5 py-6 text-center text-sm text-slate-500 shadow-lg sm:px-10">
            © {new Date().getFullYear()} Metrik · Kensar Electronic
            {" · "}
            <Link href="/politica-de-privacidad" className="font-medium text-slate-700 hover:text-slate-900">
              Politica de privacidad
            </Link>
          </footer>
        </div>
      </div>
    </main>
  );
}

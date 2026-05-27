import Link from "next/link";
import Image from "next/image";

const moduleItems = ["POS / Caja", "Documentos", "Reportes", "Configuración"];
const architectureItems = [
  "Base API automática",
  "Persistencia de sesión",
  "Permisos por rol",
];

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "Metrik POS",
            url: "https://metrikpos.com",
            logo: "https://metrikpos.com/branding/metriklogo.png",
            sameAs: ["https://metrikpos.com"],
            contactPoint: [
              {
                "@type": "ContactPoint",
                email: "kensarelec@gmail.com",
                contactType: "sales",
                areaServed: "CO",
                availableLanguage: ["es"],
              },
            ],
          }),
        }}
      />
      <main
        className="relative min-h-screen bg-cover bg-center overflow-x-hidden"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1556742044-3c52d6e88c62?auto=format&fit=crop&q=80&w=2070')",
        }}
      >
        <div className="min-h-dvh bg-white/70 backdrop-blur-sm">
          <div className="mx-auto flex min-h-dvh w-full max-w-[62rem] flex-col px-4 py-6 sm:px-5 lg:py-8">
            <nav className="flex flex-col gap-4 rounded-[1.35rem] bg-white/80 px-5 py-4 shadow-xl sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-[1.125rem]">
              <div className="flex items-center gap-3.5">
                <Image
                  src="/branding/metriklogo.png"
                  alt="Logo Metrik"
                  width={44}
                  height={44}
                  className="h-11 w-11 rounded-xl"
                  priority
                />
                <span className="text-2xl font-bold tracking-tight text-slate-900">
                  METRIK
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm font-semibold sm:flex-nowrap sm:gap-4">
                <Link
                  href="/login"
                  className="text-slate-600 transition hover:text-slate-900"
                >
                  Ingresar
                </Link>
                <Link
                  href="/descargas"
                  className="text-slate-600 transition hover:text-slate-900"
                >
                  Descargas
                </Link>
                <Link
                  href="/contacto#ventas"
                  className="rounded-full border-2 border-blue-600 px-4 py-2 text-blue-600 transition hover:bg-blue-600 hover:text-white"
                >
                  Hablar con Kensar
                </Link>
              </div>
            </nav>

            <section className="mt-8 space-y-8 text-center sm:mt-10 lg:space-y-11 lg:text-left">
              <div className="space-y-6">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.32em] text-slate-500 sm:text-xs">
                    Software empresarial
                  </p>
                  <h1 className="mt-3 text-[clamp(2.35rem,5.4vw,4.15rem)] font-extrabold leading-[0.98] tracking-tight text-slate-900 sm:mt-5">
                    Gestion de Ventas y Administracion
                  </h1>
                  <p className="mt-3 text-base text-slate-600 sm:text-lg">
                    Tu POS y panel administrativo en un solo lugar.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3.5 lg:justify-start">
                  <Link
                    href="/login"
                    className="w-full rounded-xl bg-gradient-to-r from-[#34d399] to-[#06b6d4] px-6 py-3 text-center text-base font-semibold text-white shadow-xl transition hover:scale-[1.02] sm:w-auto sm:px-7"
                  >
                    Ingresar al panel
                  </Link>
                  <Link
                    href="/demo"
                    className="w-full rounded-xl bg-white px-6 py-3 text-center text-base font-semibold text-slate-900 shadow-xl transition hover:scale-[1.02] hover:bg-slate-50 sm:w-auto sm:px-7"
                  >
                    Probar demo
                  </Link>
                  <Link
                    href="/descargar-pos"
                    className="w-full rounded-xl bg-gradient-to-r from-[#2563eb] to-[#4338ca] px-6 py-3 text-center text-base font-semibold text-white shadow-xl transition hover:scale-[1.02] sm:w-auto sm:px-7"
                  >
                    Descargar POS
                  </Link>
                </div>
              </div>

              <div className="rounded-[1.35rem] bg-white/80 p-5 shadow-2xl sm:p-7">
                <div className="grid gap-7 lg:grid-cols-2 lg:gap-9">
                  <div className="space-y-4 text-left">
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-blue-600/10 px-2.5 py-2 text-sm leading-none text-blue-600">✔</span>
                      <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">
                        Módulos activos del panel
                      </h2>
                    </div>
                    <ul className="space-y-2.5 text-base text-slate-500 sm:text-lg">
                      {moduleItems.map((item) => (
                        <li key={item} className="flex items-center gap-3">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="space-y-4 text-left">
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-slate-900/10 px-2.5 py-2 text-sm leading-none text-slate-900">⌂</span>
                      <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">
                        Arquitectura lista
                      </h2>
                    </div>
                    <ul className="space-y-2.5 text-base text-slate-500 sm:text-lg">
                      {architectureItems.map((item) => (
                        <li key={item} className="flex items-center gap-3">
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-700" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </section>

            <footer className="mt-8 rounded-[1.35rem] bg-white/80 px-5 py-4 text-center text-sm text-slate-500 shadow-lg sm:mt-auto sm:px-8">
              © {new Date().getFullYear()} Metrik · Kensar Electronic
              {" · "}
              <Link href="/politica-de-privacidad" className="font-medium text-slate-700 hover:text-slate-900">
                Política de privacidad
              </Link>
              {" · "}
              <Link href="/politica-de-cookies" className="font-medium text-slate-700 hover:text-slate-900">
                Política de cookies
              </Link>
            </footer>
          </div>
        </div>

        <Link
          href="/contacto#solicitud"
          className="fixed bottom-4 right-4 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-2xl transition hover:scale-[1.02] sm:bottom-7 sm:right-8 sm:px-6"
        >
          ¿Necesitas ayuda? Contactar soporte
        </Link>
      </main>
    </>
  );
}

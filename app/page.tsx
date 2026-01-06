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
                email: "info@kensar.com",
                contactType: "sales",
                areaServed: "CO",
                availableLanguage: ["es"],
              },
            ],
          }),
        }}
      />
      <main
        className="relative min-h-screen bg-cover bg-center"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1556742044-3c52d6e88c62?auto=format&fit=crop&q=80&w=2070')",
        }}
      >
        <div className="min-h-screen bg-white/70 backdrop-blur-sm">
          <div className="mx-auto max-w-6xl px-6 py-8 lg:px-12">
            <nav className="flex flex-col gap-4 rounded-3xl bg-white/80 px-6 py-5 shadow-xl sm:flex-row sm:items-center sm:justify-between sm:px-12 sm:py-6">
              <div className="flex items-center gap-4">
                <Image
                  src="/branding/metriklogo.png"
                  alt="Logo Metrik"
                  width={56}
                  height={56}
                  className="h-14 w-14 rounded-2xl"
                  priority
                />
                <span className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                  METRIK
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm font-semibold sm:gap-4">
                <Link
                  href="/login"
                  className="text-slate-600 transition hover:text-slate-900"
                >
                  Ingresar
                </Link>
                <a
                  href="mailto:info@kensar.com"
                  className="rounded-full border-2 border-blue-600 px-4 py-2 text-blue-600 transition hover:bg-blue-600 hover:text-white sm:px-5"
                >
                  Hablar con Kensar
                </a>
              </div>
            </nav>

            <section className="mt-12 space-y-12 text-center lg:mt-16 lg:space-y-16 lg:text-left">
              <div className="space-y-8">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500 sm:text-sm">
                    Software empresarial
                  </p>
                  <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:mt-6 sm:text-5xl md:text-6xl xl:text-7xl">
                    Gestion de Ventas y Administracion
                  </h1>
                  <p className="mt-4 text-lg text-slate-600 sm:text-xl">
                    Tu POS y panel administrativo en un solo lugar.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-4 lg:justify-start">
                  <Link
                    href="/login"
                    className="rounded-2xl bg-gradient-to-r from-[#34d399] to-[#06b6d4] px-6 py-3 text-base font-semibold text-white shadow-xl transition hover:scale-105 sm:px-8 sm:py-4 sm:text-lg"
                  >
                    Ingresar al panel
                  </Link>
                  <Link
                    href="/login-pos"
                    className="rounded-2xl bg-gradient-to-r from-[#2563eb] to-[#4338ca] px-6 py-3 text-base font-semibold text-white shadow-xl transition hover:scale-105 sm:px-8 sm:py-4 sm:text-lg"
                  >
                    Ingresar al POS
                  </Link>
                </div>
              </div>

              <div className="rounded-3xl bg-white/80 p-6 shadow-2xl sm:p-8 md:p-10">
                <div className="grid gap-10 lg:grid-cols-2">
                  <div className="space-y-5 text-left">
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-blue-600/10 p-2 text-blue-600">✔</span>
                      <h2 className="text-2xl font-bold text-slate-900">
                        Módulos activos del panel
                      </h2>
                    </div>
                    <ul className="space-y-3 text-lg text-slate-500">
                      {moduleItems.map((item) => (
                        <li key={item} className="flex items-center gap-3">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="space-y-5 text-left">
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-slate-900/10 p-2 text-slate-900">⌂</span>
                      <h2 className="text-2xl font-bold text-slate-900">
                        Arquitectura lista
                      </h2>
                    </div>
                    <ul className="space-y-3 text-lg text-slate-500">
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

            <footer className="mt-16 rounded-3xl bg-white/80 px-6 py-6 text-center text-sm text-slate-500 shadow-lg sm:px-10">
              © {new Date().getFullYear()} Metrik · Kensar Electronic
            </footer>
          </div>
        </div>

        <a
          href="mailto:soporte@kensar.com"
          className="fixed bottom-6 right-4 flex items-center gap-3 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-2xl transition hover:scale-105 sm:bottom-8 sm:right-8 sm:px-6"
        >
          ¿Necesitas ayuda? Contactar soporte
        </a>
      </main>
    </>
  );
}

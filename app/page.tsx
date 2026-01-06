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
    <main
      className="relative min-h-screen bg-cover bg-center"
      style={{
        backgroundImage:
          "url('https://images.unsplash.com/photo-1556742044-3c52d6e88c62?auto=format&fit=crop&q=80&w=2070')",
      }}
    >
      <div className="min-h-screen bg-white/70 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-6 py-8 lg:px-12">
          <nav className="flex items-center justify-between rounded-3xl bg-white/80 px-12 py-6 shadow-xl">
            <div className="flex items-center gap-4">
              <Image
                src="/branding/metriklogo.png"
                alt="Logo Metrik"
                width={56}
                height={56}
                className="h-14 w-14 rounded-2xl"
                priority
              />
              <span className="text-3xl font-bold tracking-tight text-slate-900">
                METRIK
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm font-semibold">
              <Link
                href="/login"
                className="text-slate-600 transition hover:text-slate-900"
              >
                Ingresar
              </Link>
              <a
                href="mailto:info@kensar.com"
                className="rounded-full border-2 border-blue-600 px-5 py-2 text-blue-600 transition hover:bg-blue-600 hover:text-white"
              >
                Hablar con Kensar
              </a>
            </div>
          </nav>

          <section className="mt-16 space-y-16 text-center lg:text-left">
            <div className="space-y-8">
              <div>
                <p className="text-sm uppercase tracking-[0.4em] text-slate-500">
                  Software empresarial
                </p>
                <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-slate-900 md:text-6xl xl:text-7xl">
                  Gestion de Ventas y Administracion
                </h1>
                <p className="mt-4 text-xl text-slate-600">
                  Tu POS y panel administrativo en un solo lugar.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-6 lg:justify-start">
                <Link
                  href="/login"
                  className="rounded-2xl bg-gradient-to-r from-[#34d399] to-[#06b6d4] px-8 py-4 text-lg font-semibold text-white shadow-xl transition hover:scale-105"
                >
                  Ingresar al panel
                </Link>
                <Link
                  href="/login-pos"
                  className="rounded-2xl bg-gradient-to-r from-[#2563eb] to-[#4338ca] px-8 py-4 text-lg font-semibold text-white shadow-xl transition hover:scale-105"
                >
                  Ingresar al POS
                </Link>
              </div>
            </div>

            <div className="rounded-3xl bg-white/80 p-10 shadow-2xl">
              <div className="grid gap-12 lg:grid-cols-2">
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

          <footer className="mt-20 rounded-3xl bg-white/80 px-10 py-6 text-center text-sm text-slate-500 shadow-lg">
            © {new Date().getFullYear()} Metrik · Kensar Electronic
          </footer>
        </div>
      </div>

      <a
        href="mailto:soporte@kensar.com"
        className="fixed bottom-8 right-8 flex items-center gap-3 rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-2xl transition hover:scale-105"
      >
        ¿Necesitas ayuda? Contactar soporte
      </a>
    </main>
  );
}

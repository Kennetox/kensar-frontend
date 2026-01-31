import Link from "next/link";
import Image from "next/image";

const steps = [
  {
    title: "Descarga e instala la app",
    description:
      "Te enviaremos un instalador firmado para Windows. Solo necesitas ejecutarlo una vez.",
  },
  {
    title: "Configura la estacion",
    description:
      "Ingresa el correo y la contraseña de la estacion para vincular el equipo.",
  },
  {
    title: "Ingresa con tu PIN",
    description:
      "Cada vendedor entra con su PIN personal y el POS queda listo para vender.",
  },
];

export default function DescargarPosPage() {
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
          <nav className="flex items-center justify-between rounded-3xl bg-white/80 px-8 py-5 shadow-lg">
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
                <p className="text-xl font-bold tracking-tight text-slate-900">
                  METRIK
                </p>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  by Kensar Electronic
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-500 hover:text-slate-900"
              >
                ← Volver al sitio principal
              </Link>
              <Link
                href="/login"
                className="rounded-full border border-blue-300 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-500/20"
              >
                Ir al panel
              </Link>
            </div>
          </nav>

          <section className="mt-12 grid flex-1 gap-10 lg:grid-cols-2">
            <div className="rounded-3xl bg-white/85 p-10 shadow-2xl">
              <p className="text-sm uppercase tracking-[0.4em] text-slate-500">
                POS de escritorio
              </p>
              <h1 className="mt-6 text-4xl font-bold text-slate-900">
                Descarga Metrik POS para tu caja
              </h1>
              <p className="mt-4 text-lg text-slate-600">
                La app de escritorio asegura un flujo estable y controlado para
                ventas en caja. Configura la estacion una sola vez y trabaja con
                PIN por vendedor.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="https://github.com/Kennetox/kensar_pos_desktop/releases/download/v1.0.0/MetrikPOS-Setup-1.0.0.exe"
                  className="rounded-2xl bg-gradient-to-r from-[#2563eb] to-[#4338ca] px-6 py-3 text-base font-semibold text-white shadow-xl transition hover:brightness-110"
                >
                  Descargar para Windows
                </a>
                <a
                  href="mailto:soporte@kensar.com?subject=Descarga%20Metrik%20POS"
                  className="rounded-2xl border border-slate-300 px-6 py-3 text-base font-semibold text-slate-700 transition hover:border-slate-500 hover:text-slate-900"
                >
                  Solicitar instalador
                </a>
              </div>
              <div className="mt-6 rounded-2xl border border-emerald-300/60 bg-emerald-100/60 px-4 py-3 text-sm text-emerald-900">
                Descarga el instalador para Windows y comienza la configuración
                en la estación de caja.
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-3xl bg-white/85 p-8 shadow-2xl">
                <h2 className="text-xl font-semibold text-slate-900">
                  Flujo recomendado
                </h2>
                <div className="mt-6 space-y-4">
                  {steps.map((step) => (
                    <div
                      key={step.title}
                      className="rounded-2xl border border-slate-200/80 bg-white/80 p-4"
                    >
                      <p className="text-base font-semibold text-slate-900">
                        {step.title}
                      </p>
                      <p className="text-sm text-slate-500">
                        {step.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-3xl bg-white/85 p-8 shadow-2xl">
                <h3 className="text-lg font-semibold text-slate-900">
                  Requisitos
                </h3>
                <ul className="mt-4 space-y-3 text-sm text-slate-600">
                  <li>Windows 10 o superior.</li>
                  <li>Conexion estable a internet.</li>
                  <li>Credenciales activas de estacion y usuarios.</li>
                </ul>
              </div>
            </div>
          </section>

          <footer className="mt-14 rounded-3xl bg-white/80 px-5 py-6 text-center text-sm text-slate-500 shadow-lg sm:px-10">
            © {new Date().getFullYear()} Metrik · Kensar Electronic
          </footer>
        </div>
      </div>
    </main>
  );
}

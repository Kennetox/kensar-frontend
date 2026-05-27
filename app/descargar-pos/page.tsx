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
      <div className="min-h-dvh bg-white/70 backdrop-blur-sm">
        <div className="mx-auto flex min-h-dvh w-full max-w-[62rem] flex-col px-4 py-6 sm:px-5 lg:py-8">
          <nav className="flex flex-col gap-4 rounded-[1.35rem] bg-white/80 px-5 py-4 shadow-lg sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-[1.125rem]">
            <div className="flex items-center gap-3.5">
              <Image
                src="/branding/metriklogo.png"
                alt="Logo Metrik"
                width={44}
                height={44}
                className="h-11 w-11 rounded-xl"
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
            <div className="flex flex-wrap items-center gap-3">
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

          <section className="mt-8 grid flex-1 items-center gap-8 lg:mt-10 lg:grid-cols-2">
            <div className="rounded-[1.35rem] bg-white/85 p-5 shadow-2xl sm:p-6">
              <p className="text-[10px] uppercase tracking-[0.32em] text-slate-500 sm:text-[11px]">
                POS de escritorio
              </p>
              <h1 className="mt-4 text-[clamp(1.85rem,3.35vw,2.55rem)] font-bold leading-tight text-slate-900">
                Descarga Metrik POS para tu caja
              </h1>
              <p className="mt-3 text-[0.95rem] leading-relaxed text-slate-600 sm:text-base">
                La app de escritorio asegura un flujo estable y controlado para
                ventas en caja. Configura la estacion una sola vez y trabaja con
                PIN por vendedor.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href="https://github.com/Kennetox/kensar_pos_desktop/releases/latest/download/MetrikPOS-Setup.exe"
                  className="rounded-xl bg-gradient-to-r from-[#2563eb] to-[#4338ca] px-5 py-3 text-sm font-semibold text-white shadow-xl transition hover:brightness-110"
                >
                  Descargar para Windows
                </a>
                <a
                  href="mailto:kensarelec@gmail.com?cc=kennethjc2301@gmail.com&subject=Descarga%20Metrik%20POS"
                  className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-500 hover:text-slate-900"
                >
                  Solicitar instalador
                </a>
              </div>
              <div className="mt-5 rounded-xl border border-emerald-300/60 bg-emerald-100/60 px-4 py-3 text-sm text-emerald-900">
                Descarga el instalador para Windows y comienza la configuración
                en la estación de caja.
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-[1.35rem] bg-white/85 p-5 shadow-2xl sm:p-6">
                <h2 className="text-lg font-semibold text-slate-900">
                  Flujo recomendado
                </h2>
                <div className="mt-5 space-y-3.5">
                  {steps.map((step) => (
                    <div
                      key={step.title}
                      className="rounded-xl border border-slate-200/80 bg-white/80 px-4 py-3.5"
                    >
                      <p className="text-sm font-semibold text-slate-900">
                        {step.title}
                      </p>
                      <p className="mt-0.5 text-[0.82rem] leading-relaxed text-slate-500">
                        {step.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-[1.35rem] bg-white/85 p-5 shadow-2xl sm:p-6">
                <h3 className="text-base font-semibold text-slate-900">
                  Requisitos
                </h3>
                <ul className="mt-4 space-y-2.5 text-sm text-slate-600">
                  <li>Windows 10 o superior.</li>
                  <li>Conexion estable a internet.</li>
                  <li>Credenciales activas de estacion y usuarios.</li>
                </ul>
              </div>
            </div>
          </section>

          <footer className="mt-6 px-5 pb-2 pt-1 text-center text-xs text-slate-600 sm:text-sm">
            © {new Date().getFullYear()} Metrik · Kensar Electronic
          </footer>
        </div>
      </div>
    </main>
  );
}

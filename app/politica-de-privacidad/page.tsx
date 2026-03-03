import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Politica de Privacidad",
  description:
    "Politica de privacidad de Metrik Stock y servicios asociados de Kensar Electronic.",
  alternates: {
    canonical: "/politica-de-privacidad",
  },
};

const UPDATED_AT = "3 de marzo de 2026";

export default function PrivacyPolicyPage() {
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
                  Documentacion legal
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
              Politicas y cumplimiento
            </p>
            <h1 className="mt-4 text-3xl font-bold text-slate-900 sm:text-5xl">
              Politica de Privacidad
            </h1>
            <p className="mt-4 text-base text-slate-600 sm:text-lg">
              Esta politica aplica a la app movil <strong>Metrik Stock</strong> y a los servicios
              web relacionados operados por <strong>Kensar Electronic</strong>.
            </p>
            <p className="mt-2 text-sm text-slate-500">Ultima actualizacion: {UPDATED_AT}</p>

            <div className="mt-8 space-y-5 rounded-2xl border border-slate-200/80 bg-white/80 p-5 sm:p-8">
              <article>
                <h2 className="text-xl font-semibold text-slate-900">1. Responsable del tratamiento</h2>
                <p className="mt-2 leading-7 text-slate-700">
                  Responsable: <strong>Kensar Electronic</strong>.
                  <br />
                  Correo de contacto: <a href="mailto:kensarelec@gmail.com">kensarelec@gmail.com</a>.
                </p>
              </article>

              <article>
                <h2 className="text-xl font-semibold text-slate-900">2. Datos que podemos tratar</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 leading-7 text-slate-700">
                  <li>Datos de cuenta para autenticacion (por ejemplo, correo y datos de perfil).</li>
                  <li>Datos operativos de inventario, productos, lotes y etiquetas creados por el usuario.</li>
                  <li>Configuraciones tecnicas de la app (por ejemplo URL de impresora y preferencias).</li>
                  <li>
                    Archivos o imagenes capturadas voluntariamente por el usuario para procesos operativos.
                  </li>
                </ul>
              </article>

              <article>
                <h2 className="text-xl font-semibold text-slate-900">3. Finalidades</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 leading-7 text-slate-700">
                  <li>Permitir el acceso seguro a la plataforma.</li>
                  <li>Gestionar inventario, lotes, impresion de etiquetas y procesos internos.</li>
                  <li>Brindar soporte tecnico y continuidad operativa del servicio.</li>
                  <li>Mejorar estabilidad, seguridad y rendimiento de la app.</li>
                </ul>
              </article>

              <article>
                <h2 className="text-xl font-semibold text-slate-900">4. Base legal</h2>
                <p className="mt-2 leading-7 text-slate-700">
                  Tratamos datos para ejecutar la relacion contractual con empresas usuarias de Metrik y
                  para el interes legitimo de operacion, soporte y seguridad del servicio.
                </p>
              </article>

              <article>
                <h2 className="text-xl font-semibold text-slate-900">5. Comparticion de datos</h2>
                <p className="mt-2 leading-7 text-slate-700">
                  No vendemos datos personales. Solo podemos compartir informacion cuando sea necesario para
                  proveer infraestructura tecnologica o por requerimiento legal.
                </p>
              </article>

              <article>
                <h2 className="text-xl font-semibold text-slate-900">6. Conservacion</h2>
                <p className="mt-2 leading-7 text-slate-700">
                  Conservamos la informacion durante el tiempo necesario para operar el servicio, cumplir
                  obligaciones legales y atender requerimientos de soporte o auditoria.
                </p>
              </article>

              <article>
                <h2 className="text-xl font-semibold text-slate-900">7. Seguridad</h2>
                <p className="mt-2 leading-7 text-slate-700">
                  Aplicamos medidas tecnicas y organizativas razonables para proteger la informacion contra
                  acceso no autorizado, alteracion o perdida.
                </p>
              </article>

              <article>
                <h2 className="text-xl font-semibold text-slate-900">8. Derechos de los titulares</h2>
                <p className="mt-2 leading-7 text-slate-700">
                  Puedes solicitar acceso, correccion, actualizacion o eliminacion de datos escribiendo a{" "}
                  <a href="mailto:kensarelec@gmail.com">kensarelec@gmail.com</a>.
                </p>
              </article>

              <article>
                <h2 className="text-xl font-semibold text-slate-900">9. Cambios a esta politica</h2>
                <p className="mt-2 leading-7 text-slate-700">
                  Podemos actualizar esta politica para reflejar cambios legales o funcionales. Publicaremos
                  cualquier cambio en esta misma URL con su fecha de actualizacion.
                </p>
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

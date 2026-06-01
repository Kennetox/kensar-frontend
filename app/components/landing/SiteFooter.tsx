import Image from "next/image";
import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer id="recursos" className="rounded-t-3xl bg-[#0F172A] px-6 py-10 text-slate-300 sm:px-8">
      <div className="grid gap-8 md:grid-cols-[1.2fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-3">
            <Image src="/branding/metriklogo.png" alt="Metrik" width={36} height={36} className="h-9 w-9 rounded" />
            <p className="text-xl font-bold text-white">METRIK</p>
          </div>
          <p className="mt-3 max-w-sm text-sm text-slate-400">
            Sistema operativo para negocios que quieren vender más y operar mejor.
          </p>
        </div>

        <div>
          <p className="text-sm font-semibold text-white">Producto</p>
          <div className="mt-3 space-y-2 text-sm">
            <Link href="#producto" className="block hover:text-white">Módulos</Link>
            <Link href="#capturas" className="block hover:text-white">Capturas</Link>
            <Link href="/demo" className="block hover:text-white">Demo</Link>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-white">Empresa</p>
          <div className="mt-3 space-y-2 text-sm">
            <Link href="/nosotros" className="block hover:text-white">Nosotros</Link>
            <Link href="/contacto" className="block hover:text-white">Contacto</Link>
            <Link href="/politica-de-privacidad" className="block hover:text-white">Política de privacidad</Link>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-white">Recursos</p>
          <div className="mt-3 space-y-2 text-sm">
            <Link href="/descargas" className="block hover:text-white">Descargas</Link>
            <Link href="/docs/qz-tray-setup" className="block hover:text-white">Guías</Link>
            <Link href="/politica-de-cookies" className="block hover:text-white">Política de cookies</Link>
          </div>
        </div>
      </div>

      <div className="mt-8 border-t border-slate-800 pt-6 text-xs text-slate-500">
        © {new Date().getFullYear()} Metrik. Todos los derechos reservados.
      </div>
    </footer>
  );
}

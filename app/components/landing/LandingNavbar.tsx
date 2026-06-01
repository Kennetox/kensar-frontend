"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

type LandingNavbarProps = {
  className?: string;
};

export default function LandingNavbar({ className = "" }: LandingNavbarProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 14);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed left-1/2 z-50 w-[calc(100%-2rem)] max-w-[1180px] -translate-x-1/2 transition-[top] duration-300 ${
        scrolled ? "top-3" : "top-5"
      } ${className}`}
    >
      <div
        className={`rounded-2xl border border-slate-200/70 bg-white/90 px-4 py-3 backdrop-blur transition-all duration-300 sm:px-6 sm:py-3.5 ${
          scrolled
            ? "shadow-[0_16px_36px_-18px_rgba(15,23,42,0.42)]"
            : "shadow-[0_10px_30px_-18px_rgba(15,23,42,0.30)]"
        }`}
      >
        <div className="flex items-center gap-3 sm:gap-4">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/branding/metriklogo.png"
              alt="Metrik"
              width={40}
              height={40}
              className="h-9 w-9 rounded-lg sm:h-10 sm:w-10"
              priority
            />
            <div>
              <p className="text-lg font-extrabold tracking-tight text-[#0F172A] sm:text-xl">METRIK</p>
              <p className="hidden text-[10px] uppercase tracking-[0.24em] text-slate-500 sm:block">Sistema operativo para negocios</p>
            </div>
          </Link>

          <div className="ml-auto flex items-center gap-5">
            <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 lg:flex">
              <Link href="#producto" className="transition hover:text-slate-900">Producto</Link>
              <Link href="/descargas" className="transition hover:text-slate-900">Descargas</Link>
              <Link href="/contacto" className="transition hover:text-slate-900">Contacto</Link>
            </nav>
            <Link href="/login" className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 sm:px-3.5">
              Ingresar
            </Link>
          </div>
        </div>

        <nav className="mt-3 flex items-center gap-4 border-t border-slate-200 pt-3 text-sm font-medium text-slate-600 lg:hidden">
          <Link href="#producto" className="transition hover:text-slate-900">Producto</Link>
          <Link href="/descargas" className="transition hover:text-slate-900">Descargas</Link>
          <Link href="/contacto" className="transition hover:text-slate-900">Contacto</Link>
        </nav>
      </div>
    </header>
  );
}

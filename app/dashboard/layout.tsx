"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useAuth } from "../providers/AuthProvider";

type DashboardRole = "Administrador" | "Supervisor" | "Vendedor" | "Auditor";

const navItems: Array<{
  href: string;
  label: string;
  roles?: Array<DashboardRole>;
}> = [
  { href: "/dashboard", label: "Inicio" },
  { href: "/dashboard/products", label: "Productos", roles: ["Administrador", "Supervisor"] },
  { href: "/dashboard/movements", label: "Movimientos", roles: ["Administrador", "Supervisor"] },
  { href: "/dashboard/documents", label: "Documentos", roles: ["Administrador", "Supervisor", "Vendedor", "Auditor"] },
  { href: "/dashboard/pos", label: "POS / Caja", roles: ["Administrador", "Supervisor", "Vendedor"] },
  { href: "/dashboard/labels", label: "Etiquetas", roles: ["Administrador", "Supervisor"] },
  { href: "/dashboard/reports", label: "Reportes", roles: ["Administrador", "Supervisor", "Auditor"] },
  { href: "/dashboard/settings", label: "Configuración", roles: ["Administrador"] },
];

const routePermissions: Array<{
  prefix: string;
  roles: Array<DashboardRole>;
}> = [
  { prefix: "/dashboard/products", roles: ["Administrador", "Supervisor"] },
  { prefix: "/dashboard/movements", roles: ["Administrador", "Supervisor"] },
  { prefix: "/dashboard/documents", roles: ["Administrador", "Supervisor", "Vendedor", "Auditor"] },
  { prefix: "/dashboard/pos", roles: ["Administrador", "Supervisor", "Vendedor"] },
  { prefix: "/dashboard/labels", roles: ["Administrador", "Supervisor"] },
  { prefix: "/dashboard/reports", roles: ["Administrador", "Supervisor", "Auditor"] },
  { prefix: "/dashboard/settings", roles: ["Administrador"] },
];

const posPreviewAllowedPrefixes = ["/dashboard", "/dashboard/sales"];

function isDashboardRole(role?: string | null): role is DashboardRole {
  return (
    role === "Administrador" ||
    role === "Supervisor" ||
    role === "Vendedor" ||
    role === "Auditor"
  );
}

function isPathAllowed(pathname: string, role?: string | null) {
  if (!isDashboardRole(role)) return false;
  for (const rule of routePermissions) {
    if (pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)) {
      return rule.roles.includes(role);
    }
  }
  return true;
}

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, token, loading, logout } = useAuth();
  const posPreview = searchParams.get("posPreview") === "1";
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!loading && !token) {
      router.replace("/login");
    }
  }, [loading, token, router]);

  const routeAllowed = useMemo(() => {
    if (posPreview) {
      return posPreviewAllowedPrefixes.some(
        (prefix) =>
          pathname === prefix || pathname.startsWith(`${prefix}/`)
      );
    }
    return isPathAllowed(pathname, user?.role);
  }, [pathname, user?.role, posPreview]);

  useEffect(() => {
    if (!loading && token && !routeAllowed) {
      if (posPreview) {
        router.replace("/dashboard?posPreview=1");
      } else if (pathname !== "/dashboard") {
        router.replace("/dashboard");
      }
    }
  }, [loading, token, routeAllowed, router, pathname, posPreview]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setNavOpen(false);
      }
    };
    handler(media as unknown as MediaQueryListEvent);
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200">
        <span>Autenticando…</span>
      </div>
    );
  }

  const filteredNav = navItems.filter((item) => {
    if (!item.roles || !item.roles.length) return true;
    if (!isDashboardRole(user?.role)) return false;
    return item.roles.includes(user.role);
  });

  const effectiveNav = posPreview
    ? filteredNav.filter((item) => item.href === "/dashboard")
    : filteredNav;

  if (!routeAllowed) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-200 gap-4">
        <p className="text-lg">No tienes permisos para ver esta sección.</p>
        <button
          type="button"
          onClick={() => router.replace("/dashboard")}
          className="px-4 py-2 rounded-md bg-emerald-500 text-slate-900 text-sm font-semibold"
        >
          Volver al inicio
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-100">
      {/* SIDEBAR */}
      {!posPreview && (
        <>
          {/* Mobile drawer */}
          <aside
            className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-slate-800 bg-slate-950/95 backdrop-blur flex flex-col transform transition-transform md:hidden ${
              navOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <div className="h-16 flex items-center justify-between px-5 border-b border-slate-800">
              <div className="text-lg font-bold tracking-tight leading-tight">
                Metrik
                <span className="block text-[11px] font-normal uppercase tracking-[0.3em] text-emerald-300">
                  by Kensar Electronic
                </span>
              </div>
              <button
                type="button"
                onClick={() => setNavOpen(false)}
                className="text-slate-300 text-sm px-2 py-1 rounded-md border border-slate-700"
              >
                Cerrar
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-4">
              <ul className="space-y-1 px-3">
                {effectiveNav.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/dashboard" &&
                      pathname.startsWith(item.href + "/"));
                  const href =
                    posPreview && item.href === "/dashboard"
                      ? "/dashboard?posPreview=1"
                      : item.href;
                  return (
                    <li key={item.href}>
                      <Link
                        href={href}
                        onClick={() => setNavOpen(false)}
                        className={[
                          "block rounded-lg px-3 py-2 text-sm transition",
                          isActive
                            ? "bg-slate-100 text-slate-900 font-semibold"
                            : "text-slate-300 hover:bg-slate-800 hover:text-white",
                        ].join(" ")}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="border-t border-slate-800 px-4 py-3 text-xs text-slate-500">
              © {new Date().getFullYear()} Kensar Electronic
            </div>
          </aside>
          {navOpen && (
            <div
              className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
              onClick={() => setNavOpen(false)}
            />
          )}

          {/* Desktop sidebar */}
          <aside className="hidden md:flex md:flex-col w-64 border-r border-slate-800 bg-slate-950/80 backdrop-blur md:sticky md:top-0 md:h-screen md:self-start">
            <div className="h-16 flex items-center px-5 border-b border-slate-800">
              <div className="text-lg font-bold tracking-tight leading-tight">
                Metrik
                <span className="block text-[11px] font-normal uppercase tracking-[0.3em] text-emerald-300">
                  by Kensar Electronic
                </span>
              </div>
            </div>

            <nav className="flex-1 overflow-y-auto py-4">
              <ul className="space-y-1 px-3">
                {effectiveNav.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/dashboard" &&
                      pathname.startsWith(item.href + "/"));
                  const href =
                    posPreview && item.href === "/dashboard"
                      ? "/dashboard?posPreview=1"
                      : item.href;
                  return (
                    <li key={item.href}>
                      <Link
                        href={href}
                        className={[
                          "block rounded-lg px-3 py-2 text-sm transition",
                          isActive
                            ? "bg-slate-100 text-slate-900 font-semibold"
                            : "text-slate-300 hover:bg-slate-800 hover:text-white",
                        ].join(" ")}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="border-t border-slate-800 px-4 py-3 text-xs text-slate-500">
              © {new Date().getFullYear()} Kensar Electronic
            </div>
          </aside>
        </>
      )}

      {/* CONTENIDO PRINCIPAL */}
      <div className="flex-1 flex flex-col">
        {/* TOPBAR */}
        <header className="h-16 border-b border-slate-800 bg-slate-950/70 backdrop-blur flex items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-2">
            {!posPreview && (
              <button
                type="button"
                onClick={() => setNavOpen((prev: boolean) => !prev)}
                className="md:hidden px-3 py-1.5 rounded-md border border-slate-700 text-slate-200 text-xs hover:bg-slate-800"
              >
                Menú
              </button>
            )}
            <span className="text-sm font-semibold text-slate-200">
              Panel Metrik {posPreview && "· Vista rápida"}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            {posPreview && (
              <button
                type="button"
                onClick={() => router.replace("/pos")}
                className="text-[11px] px-3 py-1 rounded-md border border-emerald-400 text-emerald-200 hover:bg-emerald-500/10"
              >
                Volver al POS
              </button>
            )}
            <div className="text-right">
              <div className="text-sm font-semibold text-slate-100">
                {user?.name ?? "Usuario"}
              </div>
              <div className="text-[11px] uppercase tracking-wide text-slate-400">
                {user?.role ?? ""}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                logout();
                router.replace("/login");
              }}
              className="text-[11px] px-3 py-1 rounded-md border border-slate-700 hover:border-red-400 hover:text-red-300"
            >
              Cerrar sesión
            </button>
          </div>
        </header>

        {/* CONTENIDO DE CADA PÁGINA */}
        <main className="flex-1 px-4 md:px-8 py-6 md:py-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200">
          <span>Cargando panel…</span>
        </div>
      }
    >
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </Suspense>
  );
}

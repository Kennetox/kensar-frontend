"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../providers/AuthProvider";
import { defaultRolePermissions, fetchRolePermissions } from "@/lib/api/settings";
import { fetchUserProfile, type UserProfileRecord } from "@/lib/api/profile";
import { getApiBase } from "@/lib/api/base";

type DashboardRole = "Administrador" | "Supervisor" | "Vendedor" | "Auditor";

const navItems: Array<{
  href: string;
  label: string;
  moduleId?: string;
}> = [
  { href: "/dashboard", label: "Inicio", moduleId: "dashboard" },
  { href: "/dashboard/products", label: "Productos", moduleId: "products" },
  { href: "/dashboard/movements", label: "Movimientos", moduleId: "products" },
  { href: "/dashboard/documents", label: "Documentos", moduleId: "documents" },
  { href: "/dashboard/pos", label: "POS / Caja", moduleId: "pos" },
  { href: "/dashboard/labels", label: "Etiquetas", moduleId: "labels" },
  { href: "/dashboard/reports", label: "Reportes", moduleId: "reports" },
  { href: "/dashboard/settings", label: "Configuración", moduleId: "settings" },
];

const routePermissions: Array<{
  prefix: string;
  moduleId?: string;
}> = [
  { prefix: "/dashboard", moduleId: "dashboard" },
  { prefix: "/dashboard/products", moduleId: "products" },
  { prefix: "/dashboard/movements", moduleId: "products" },
  { prefix: "/dashboard/documents", moduleId: "documents" },
  { prefix: "/dashboard/pos", moduleId: "pos" },
  { prefix: "/dashboard/labels", moduleId: "labels" },
  { prefix: "/dashboard/reports", moduleId: "reports" },
  { prefix: "/dashboard/settings", moduleId: "settings" },
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

function isPathAllowed(
  pathname: string,
  role: string | null | undefined,
  modules: typeof defaultRolePermissions
) {
  if (!isDashboardRole(role)) return false;
  for (const rule of routePermissions) {
    if (pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)) {
      if (!rule.moduleId) return true;
      const moduleEntry = modules.find((item) => item.id === rule.moduleId);
      if (!moduleEntry) return true;
      return Boolean(moduleEntry.roles[role]);
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
  const [roleModules, setRoleModules] = useState(defaultRolePermissions);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfileRecord | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchRolePermissions(token)
      .then((modules) => {
        if (cancelled) return;
        setRoleModules(modules);
      })
      .catch((err) => {
        console.error("No pudimos cargar permisos por rol.", err);
        if (cancelled) return;
        setRoleModules(defaultRolePermissions);
      })
      .finally(() => {
        if (cancelled) return;
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!loading && !token) {
      router.replace("/login");
    }
  }, [loading, token, router]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchUserProfile(token)
      .then((data) => {
        if (!cancelled) {
          setProfile(data);
        }
      })
      .catch((err) => {
        console.error("No pudimos cargar el perfil.", err);
        if (!cancelled) {
          setProfile(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (typeof window === "undefined" || !token) return;
    let cancelled = false;
    const handleUpdate = () => {
      fetchUserProfile(token)
        .then((data) => {
          if (!cancelled) setProfile(data);
        })
        .catch((err) => console.error("No pudimos actualizar el perfil.", err));
    };
    window.addEventListener("kensar-profile:update", handleUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener("kensar-profile:update", handleUpdate);
    };
  }, [token]);

  const routeAllowed = useMemo(() => {
    if (posPreview) {
      return posPreviewAllowedPrefixes.some(
        (prefix) =>
          pathname === prefix || pathname.startsWith(`${prefix}/`)
      );
    }
    return isPathAllowed(pathname, user?.role, roleModules);
  }, [pathname, user?.role, posPreview, roleModules]);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleClick = (event: MouseEvent) => {
      if (!profileMenuRef.current) return;
      if (!profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200">
        <span>Autenticando…</span>
      </div>
    );
  }

  const filteredNav = navItems.filter((item) => {
    if (!item.moduleId) return true;
    if (!isDashboardRole(user?.role)) return false;
    const moduleEntry = roleModules.find((row) => row.id === item.moduleId);
    if (!moduleEntry) return true;
    return Boolean(moduleEntry.roles[user.role]);
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

  const displayName = profile?.name?.trim() || user?.name || "Usuario";
  const displayRole = profile?.role ?? user?.role ?? "";
  const avatarUrl = profile?.avatar_url ?? "";
  const resolvedAvatarUrl = avatarUrl.startsWith("/")
    ? `${getApiBase()}${avatarUrl}`
    : avatarUrl;
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

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
                className="text-sm px-4 py-2 rounded-lg border border-emerald-400 text-emerald-200 hover:bg-emerald-500/10"
              >
                Volver al POS
              </button>
            )}
            {!posPreview && (
              <div className="relative" ref={profileMenuRef}>
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen((prev) => !prev)}
                  className="flex items-center gap-3 rounded-full border border-slate-800 px-2 py-1.5 hover:border-slate-600"
                >
                  <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center text-[11px] text-slate-200">
                    {resolvedAvatarUrl ? (
                      <Image
                        src={resolvedAvatarUrl}
                        alt={displayName}
                        width={32}
                        height={32}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <span className="font-semibold">{initials || "US"}</span>
                    )}
                  </div>
                  <div className="text-right leading-tight">
                    <div className="text-sm font-semibold text-slate-100">
                      {displayName}
                    </div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">
                      {displayRole}
                    </div>
                  </div>
                </button>
                {profileMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-800 bg-slate-950/95 backdrop-blur shadow-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        router.push("/dashboard/profile");
                      }}
                      className="w-full text-left px-4 py-3 text-sm text-slate-200 hover:bg-slate-800"
                    >
                      Perfil
                    </button>
                    <div className="border-t border-slate-800" />
                    <button
                      type="button"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        logout();
                        router.replace("/login");
                      }}
                      className="w-full text-left px-4 py-3 text-sm text-rose-300 hover:bg-rose-500/10"
                    >
                      Cerrar sesión
                    </button>
                  </div>
                )}
              </div>
            )}
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

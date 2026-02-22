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
  permissionId?: string;
  icon: React.ReactNode;
}> = [
  {
    href: "/dashboard",
    label: "Inicio",
    moduleId: "dashboard",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M3 11.5L12 4l9 7.5V20a1 1 0 0 1-1 1h-5.5v-6.5h-5V21H4a1 1 0 0 1-1-1v-8.5z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    href: "/dashboard/products",
    label: "Productos",
    moduleId: "products",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M4 7.5L12 4l8 3.5v9L12 20l-8-3.5v-9z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M12 4v16M4 7.5l8 3.5 8-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    href: "/dashboard/movements",
    label: "Movimientos",
    moduleId: "movements",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M7 4v13.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M7 4l-3 3m3-3l3 3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M17 20V6.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M17 20l-3-3m3 3l3-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    href: "/dashboard/documents",
    label: "Documentos",
    moduleId: "documents",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M7 3h6l4 4v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M13 3v5h5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M8 12h8M8 16h6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    href: "/dashboard/pos",
    label: "POS / Caja",
    moduleId: "pos",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect
          x="4"
          y="6"
          width="16"
          height="12"
          rx="2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M4 10h16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M8 14h4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    href: "/dashboard/labels",
    label: "Etiquetas",
    moduleId: "labels",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M3 12l9-9h6l3 3v6l-9 9-9-9z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <circle
          cx="16.5"
          cy="7.5"
          r="1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </svg>
    ),
  },
  {
    href: "/dashboard/labels-pilot",
    label: "Etiquetado (beta)",
    moduleId: "labels_pilot",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M3 12l9-9h6l3 3v6l-9 9-9-9z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <circle
          cx="16.5"
          cy="7.5"
          r="1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </svg>
    ),
  },
  {
    href: "/dashboard/reports",
    label: "Reportes",
    moduleId: "reports",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M4 19h16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M7 16V9m5 7V6m5 10v-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    href: "/dashboard/hr",
    label: "Recursos Humanos",
    moduleId: "hr",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle
          cx="9"
          cy="8"
          r="3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M4.5 18a4.5 4.5 0 0 1 9 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle
          cx="17.5"
          cy="9"
          r="2.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M14.8 17.2a3.4 3.4 0 0 1 5.4-.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    href: "/dashboard/settings",
    label: "Configuración",
    moduleId: "settings",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle
          cx="12"
          cy="12"
          r="3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

const routePermissions: Array<{
  prefix: string;
  moduleId?: string;
  permissionId?: string;
}> = [
  { prefix: "/dashboard/labels-pilot", moduleId: "labels_pilot" },
  { prefix: "/dashboard/products", moduleId: "products" },
  { prefix: "/dashboard/movements", moduleId: "movements" },
  { prefix: "/dashboard/documents", moduleId: "documents" },
  { prefix: "/dashboard/sales", moduleId: "sales_history" },
  { prefix: "/dashboard/customers", moduleId: "documents" },
  { prefix: "/dashboard/profile" },
  { prefix: "/dashboard/pos", moduleId: "pos" },
  { prefix: "/dashboard/labels", moduleId: "labels" },
  { prefix: "/dashboard/reports", moduleId: "reports" },
  { prefix: "/dashboard/hr", moduleId: "hr" },
  { prefix: "/dashboard/settings", moduleId: "settings" },
  { prefix: "/dashboard", moduleId: "dashboard" },
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

  const hasPermission = (
    moduleId: string | undefined,
    permissionId: string | undefined
  ) => {
    const moduleEntry = moduleId
      ? modules.find((item) => item.id === moduleId)
      : undefined;
    if (!moduleEntry) return true;
    if (!permissionId) return Boolean(moduleEntry.roles[role]);
    const actionEntry = moduleEntry.actions.find(
      (action) => action.id === permissionId
    );
    if (!actionEntry) return Boolean(moduleEntry.roles[role]);
    return Boolean(actionEntry.roles[role]);
  };

  const matchingRules = routePermissions
    .filter(
      (rule) =>
        pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)
    )
    .sort((a, b) => b.prefix.length - a.prefix.length);
  const matched = matchingRules[0];
  if (matched) {
    if (!matched.moduleId && !matched.permissionId) return true;
    return hasPermission(matched.moduleId, matched.permissionId);
  }

  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    return false;
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
  const [rolePermissionsReady, setRolePermissionsReady] = useState(false);
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
        setRolePermissionsReady(true);
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
    if (!rolePermissionsReady && !posPreview) return true;
    if (posPreview) {
      return posPreviewAllowedPrefixes.some(
        (prefix) =>
          pathname === prefix || pathname.startsWith(`${prefix}/`)
      );
    }
    return isPathAllowed(pathname, user?.role, roleModules);
  }, [pathname, user?.role, posPreview, roleModules, rolePermissionsReady]);

  const currentBreadcrumbs = useMemo(() => {
    if (posPreview) return ["Inicio"];
    const breadcrumbOverrides: Array<{
      prefix: string;
      crumbs: string[];
    }> = [
      { prefix: "/dashboard/sales", crumbs: ["Inicio", "Historial de ventas"] },
      { prefix: "/dashboard/customers", crumbs: ["Documentos", "Gestionar clientes"] },
      { prefix: "/dashboard/profile", crumbs: ["Perfil"] },
    ];
    const override = breadcrumbOverrides.find(
      (entry) =>
        pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`)
    );
    if (override) return override.crumbs;
    let match: { href: string; label: string } | null = null;
    for (const item of navItems) {
      if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
        if (!match || item.href.length > match.href.length) {
          match = item;
        }
      }
    }
    return [match?.label ?? "Inicio"];
  }, [pathname, posPreview]);
  const isProductsRoute =
    pathname === "/dashboard/products" ||
    pathname.startsWith("/dashboard/products/");

  useEffect(() => {
    if (!loading && token && rolePermissionsReady && !routeAllowed) {
      if (posPreview) {
        router.replace("/dashboard?posPreview=1");
      } else if (pathname !== "/dashboard") {
        router.replace("/dashboard");
      }
    }
  }, [loading, token, routeAllowed, router, pathname, posPreview, rolePermissionsReady]);

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
      <div className="min-h-screen flex items-center justify-center dashboard-shell">
        <span>Autenticando…</span>
      </div>
    );
  }

  if (!posPreview && !rolePermissionsReady) {
    return (
      <div className="min-h-screen flex items-center justify-center dashboard-shell">
        <span>Cargando permisos…</span>
      </div>
    );
  }

  const filteredNav = navItems.filter((item) => {
    if (!item.moduleId && !item.permissionId) return true;
    if (!isDashboardRole(user?.role)) return false;
    const moduleEntry = item.moduleId
      ? roleModules.find((row) => row.id === item.moduleId)
      : undefined;
    if (!moduleEntry) return true;
    if (!item.permissionId) return Boolean(moduleEntry.roles[user.role]);
    const actionEntry = moduleEntry.actions.find(
      (action) => action.id === item.permissionId
    );
    if (!actionEntry) return Boolean(moduleEntry.roles[user.role]);
    return Boolean(actionEntry.roles[user.role]);
  });

  const effectiveNav = posPreview
    ? filteredNav.filter((item) => item.href === "/dashboard")
    : filteredNav;

  if (!routeAllowed) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center dashboard-shell gap-4">
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
    <div className="h-screen overflow-hidden flex dashboard-shell">
      {/* SIDEBAR */}
      {!posPreview && (
        <>
          {/* Mobile drawer */}
          <aside
            className={`fixed inset-y-0 left-0 z-40 w-64 border-r dashboard-sidebar backdrop-blur flex flex-col transform transition-transform md:hidden ${
              navOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <div className="h-20 flex items-center justify-between px-5 border-b dashboard-border">
              <div className="flex items-center gap-3">
                <Image
                  src="/branding/metriklogo_square.png"
                  alt="Metrik"
                  width={80}
                  height={80}
                  className="rounded-[6px]"
                />
                <div className="text-lg font-bold tracking-tight leading-tight">
                  Metrik
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.3em] text-emerald-700">
                    by Kensar Electronic
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNavOpen(false)}
                className="text-sm px-2 py-1 rounded-md border ui-border ui-text"
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
                  const disablePrefetch =
                    item.href === "/dashboard/hr" ||
                    item.href === "/dashboard/labels-pilot";
                  return (
                    <li key={item.href}>
                      <Link
                        href={href}
                        prefetch={disablePrefetch ? false : undefined}
                        onClick={() => {
                          setNavOpen(false);
                        }}
                        className={[
                          "block rounded-lg px-3 py-2 text-sm transition",
                          isActive
                            ? "dashboard-nav-active"
                            : "dashboard-nav-item",
                        ].join(" ")}
                      >
                        <span className="flex items-center gap-3">
                          <span className="dashboard-nav-icon">
                            {item.icon}
                          </span>
                          <span>{item.label}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="border-t dashboard-border px-4 py-3 text-xs ui-text-muted">
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
          <aside className="hidden md:flex md:flex-col w-64 border-r dashboard-sidebar backdrop-blur md:sticky md:top-0 md:h-screen md:self-start shadow-[inset_-1px_0_0_rgba(15,23,42,0.2)]">
            <div className="h-20 flex items-center px-5 border-b dashboard-border">
              <div className="flex items-center gap-3">
                <Image
                  src="/branding/metriklogo_square.png"
                  alt="Metrik"
                  width={80}
                  height={80}
                  className="rounded-[6px]"
                />
                <div className="text-lg font-bold tracking-tight leading-tight">
                  Metrik
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.3em] text-emerald-700">
                    by Kensar Electronic
                  </span>
                </div>
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
                  const disablePrefetch =
                    item.href === "/dashboard/hr" ||
                    item.href === "/dashboard/labels-pilot";
                  return (
                    <li key={item.href}>
                      <Link
                        href={href}
                        prefetch={disablePrefetch ? false : undefined}
                        className={[
                          "block rounded-lg px-3 py-2 text-sm transition",
                          isActive
                            ? "dashboard-nav-active"
                            : "dashboard-nav-item",
                        ].join(" ")}
                      >
                        <span className="flex items-center gap-3">
                          <span className="dashboard-nav-icon">
                            {item.icon}
                          </span>
                          <span>{item.label}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="border-t dashboard-border px-4 py-3 text-xs ui-text-muted">
              © {new Date().getFullYear()} Kensar Electronic
            </div>
          </aside>
        </>
      )}

      {/* CONTENIDO PRINCIPAL */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* TOPBAR */}
        <header className="h-20 border-b dashboard-topbar backdrop-blur flex items-center justify-between px-4 md:px-6 shadow-[0_1px_0_rgba(15,23,42,0.12)]">
          <div className="flex items-center gap-2">
            {!posPreview && (
              <button
                type="button"
                onClick={() => setNavOpen((prev: boolean) => !prev)}
                className="md:hidden px-3 py-1.5 rounded-md border ui-border ui-text text-xs"
              >
                Menú
              </button>
            )}
            <span className="text-base md:text-lg font-semibold text-white flex items-center gap-2">
              <span className="text-white">Panel Metrik {posPreview && "· Vista rápida"}</span>
              <span className="text-white font-normal">›</span>
              <span className="dashboard-breadcrumb-pill">
                {currentBreadcrumbs.map((crumb, index) => (
                  <span key={`${crumb}-${index}`}>
                    {crumb}
                    {index < currentBreadcrumbs.length - 1 && " › "}
                  </span>
                ))}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs ui-text-muted">
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
              <div
                className="relative"
                ref={profileMenuRef}
                onMouseEnter={() => setProfileMenuOpen(true)}
                onMouseLeave={() => setProfileMenuOpen(false)}
              >
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen((prev) => !prev)}
                  className="flex items-center gap-3 rounded-full border ui-border px-2 py-1.5 dashboard-profile-chip"
                >
                  <div className="w-8 h-8 rounded-full border ui-border overflow-hidden flex items-center justify-center text-[11px]">
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
                      <span className="dashboard-initials-chip font-semibold">
                        {initials || "US"}
                      </span>
                    )}
                  </div>
                  <div className="text-right leading-tight">
                    <div className="text-sm font-semibold">
                      {displayName}
                    </div>
                    <div className="text-[11px] uppercase tracking-wide ui-text-muted">
                      {displayRole}
                    </div>
                  </div>
                </button>
                {profileMenuOpen && (
                  <div className="absolute right-0 mt-0 pt-2 w-48 z-50">
                    <div className="rounded-xl border ui-border dashboard-card-alt shadow-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        router.push("/dashboard/profile");
                      }}
                      className="w-full text-left px-4 py-3 text-sm dashboard-menu-item"
                    >
                      <span className="flex items-center gap-2">
                        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
                          <circle
                            cx="12"
                            cy="8"
                            r="3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                          />
                          <path
                            d="M5 20c1.6-3.5 4.7-5.2 7-5.2s5.4 1.7 7 5.2"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                          />
                        </svg>
                        Perfil
                      </span>
                    </button>
                    <div className="border-t dashboard-border" />
                    <button
                      type="button"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        logout();
                        router.replace("/login");
                      }}
                      className="w-full text-left px-4 py-3 text-sm text-rose-300 hover:bg-rose-500/10"
                    >
                      <span className="flex items-center gap-2">
                        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
                          <path
                            d="M10 7V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2v-2"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M4 12h9m0 0-3-3m3 3-3 3"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        Cerrar sesión
                      </span>
                    </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        {/* CONTENIDO DE CADA PÁGINA */}
        <main
          className={`flex-1 min-h-0 px-4 md:px-8 py-6 md:py-8 dashboard-theme ${
            isProductsRoute ? "overflow-hidden" : "overflow-y-auto"
          }`}
        >
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
        <div className="min-h-screen flex items-center justify-center dashboard-shell">
          <span>Cargando panel…</span>
        </div>
      }
    >
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </Suspense>
  );
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PosProvider } from "./poscontext";
import { useAuth } from "../providers/AuthProvider";

const POS_ALLOWED_ROLES = new Set(["Administrador", "Supervisor", "Vendedor"]);

export default function PosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { token, loading, user } = useAuth();

  useEffect(() => {
    if (!loading && !token) {
      router.replace("/login-pos");
      return;
    }
    if (!loading && token && user && !POS_ALLOWED_ROLES.has(user.role)) {
      router.replace("/dashboard");
    }
  }, [loading, token, router, user]);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200">
        Autenticando…
      </div>
    );
  }

  if (user && !POS_ALLOWED_ROLES.has(user.role)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-200 gap-3">
        <p>No tienes permiso para acceder al POS.</p>
        <button
          type="button"
          onClick={() => router.replace("/dashboard")}
          className="px-4 py-2 rounded-md bg-emerald-500 text-slate-900 text-sm font-semibold"
        >
          Volver al panel
        </button>
      </div>
    );
  }

  return <PosProvider>{children}</PosProvider>;
}

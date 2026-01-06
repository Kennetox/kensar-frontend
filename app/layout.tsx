// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import { Suspense } from "react";
import { AuthProvider } from "./providers/AuthProvider";
import { ThemePreviewer } from "./providers/ThemePreviewer";

export const metadata: Metadata = {
  title: "Metrik",
  description: "Plataforma retail integral creada por Kensar Electronic",
  icons: {
    icon: "/favicon.ico",
    apple: "/favicon.ico",
    shortcut: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body data-theme="dark" className="bg-slate-950 text-slate-100">
        <Suspense fallback={null}>
          <ThemePreviewer />
        </Suspense>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

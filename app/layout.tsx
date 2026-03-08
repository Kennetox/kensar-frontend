// app/layout.tsx
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { Suspense } from "react";
import { AuthProvider } from "./providers/AuthProvider";
import { ThemePreviewer } from "./providers/ThemePreviewer";
import CookieConsentBanner from "./components/CookieConsentBanner";
import { COOKIE_CONSENT_COOKIE_NAME, parseCookieConsent } from "@/lib/cookieConsent";

export const metadata: Metadata = {
  metadataBase: new URL("https://metrikpos.com"),
  title: {
    default: "Metrik POS | Punto de venta y panel de gestión",
    template: "%s | Metrik POS",
  },
  description:
    "Metrik POS centraliza ventas, caja, reportes y configuración en un panel seguro para retail.",
  keywords: [
    "punto de venta",
    "pos",
    "retail",
    "ventas",
    "caja",
    "reportes",
    "Kensar",
    "Metrik",
  ],
  authors: [{ name: "Kensar Electronic", url: "https://metrikpos.com" }],
  openGraph: {
    type: "website",
    url: "https://metrikpos.com",
    title: "Metrik POS | Punto de venta y panel de gestión",
    description:
      "POS web y panel administrativo para retail: ventas, reportes y permisos por rol.",
    siteName: "Metrik POS",
    images: [
      {
        url: "/branding/metrik-og.png",
        width: 1200,
        height: 630,
        alt: "Metrik POS",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Metrik POS | Punto de venta y panel de gestión",
    description:
      "POS web y panel administrativo para retail: ventas, reportes y permisos por rol.",
    images: ["/branding/metrik-og.png"],
  },
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/favicon.ico",
    shortcut: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const initialConsent = parseCookieConsent(cookieStore.get(COOKIE_CONSENT_COOKIE_NAME)?.value);

  return (
    <html lang="es">
      <body data-theme="dark" className="min-h-screen">
        <AuthProvider>
          <Suspense fallback={null}>
            <ThemePreviewer />
          </Suspense>
          {children}
          <CookieConsentBanner initialConsent={initialConsent} />
        </AuthProvider>
      </body>
    </html>
  );
}

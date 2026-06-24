import Link from "next/link";
import LandingNavbar from "./components/landing/LandingNavbar";
import HeroSection from "./components/landing/HeroSection";
import ProblemsSection from "./components/landing/ProblemsSection";
import ModulesSection from "./components/landing/ModulesSection";
import SiteFooter from "./components/landing/SiteFooter";
import AnimatedBackground from "./components/landing/AnimatedBackground";
import HeroOperationalBackground from "./components/landing/HeroOperationalBackground";

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "METRIK",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            url: "https://metrikpos.com",
            description:
              "Sistema operativo para negocios: ventas, inventario, reportes y operaciones conectadas en tiempo real.",
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "USD",
            },
          }),
        }}
      />

      <main className="relative min-h-screen bg-transparent text-[#0F172A]">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30">
          <div className="pointer-events-auto mx-auto w-full max-w-[1180px] px-4 pt-5 sm:px-6 lg:px-8">
            <LandingNavbar />
          </div>
        </div>

        <div className="relative overflow-hidden landing-tint-surface">
          <AnimatedBackground />
          <HeroOperationalBackground />
          <div className="relative z-10 mx-auto w-full max-w-[1180px] px-4 pb-12 pt-28 sm:px-6 lg:px-8">
            <HeroSection />
          </div>
        </div>

        <section className="bg-white">
          <div className="mx-auto w-full max-w-[1180px] px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
            <ProblemsSection />
          </div>
        </section>

        <section className="landing-tint-surface">
          <div className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 lg:px-8 lg:pb-12 lg:pt-10">
            <ModulesSection />
          </div>
        </section>

        <SiteFooter />

        <Link
          href="/contacto#solicitud"
          className="fixed bottom-4 right-4 z-40 rounded-full bg-[#0F172A] px-5 py-3 text-sm font-semibold text-white shadow-2xl transition hover:scale-[1.02] sm:bottom-8 sm:right-8"
        >
          ¿Necesitas ayuda? Contactar soporte
        </Link>
      </main>
    </>
  );
}

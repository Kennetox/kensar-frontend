export type DownloadResource = {
  slug: string;
  name: string;
  logo: string;
  logoClassName?: string;
  platform: string;
  description: string;
  downloadHref: string;
  manualHref: string;
  requirements: string;
};

export const downloadResources: DownloadResource[] = [
  {
    slug: "metrik-pos",
    name: "Metrik POS",
    logo: "/branding/metriklogo_square.png",
    platform: "Windows",
    description:
      "Aplicacion principal para estaciones de caja con login por estacion y PIN por vendedor.",
    downloadHref:
      "https://github.com/Kennetox/kensar_pos_desktop/releases/latest/download/MetrikPOS-Setup.exe",
    manualHref: "/descargar-pos",
    requirements: "Windows 10 o superior · Internet estable",
  },
  {
    slug: "metrik-print-agent-tray",
    name: "Metrik Print Agent Tray",
    logo: "/branding/metrik-print-agent.svg",
    logoClassName: "h-16 w-16",
    platform: "Windows",
    description:
      "Conector local para integrar Metrik con impresoras SATO de etiquetas desde la bandeja del sistema.",
    downloadHref:
      "https://github.com/Kennetox/Kensar-print-agent-tray/releases/latest/download/KensarPrintAgent-Setup-0.1.0.exe",
    manualHref: "/docs/print-agent-tray-setup",
    requirements: "Windows 10 o superior · Impresora SATO instalada",
  },
  {
    slug: "qz-tray",
    name: "QZ Tray",
    logo: "/branding/qz-tray.svg",
    platform: "Windows / macOS",
    description:
      "Conector de impresion termica para el POS web cuando se usa modo QZ Tray.",
    downloadHref: "https://qz.io/download/",
    manualHref: "/docs/qz-tray-setup",
    requirements: "QZ Tray 2.2.x · Certificado del API importado",
  },
  {
    slug: "metrik-stock-mobile",
    name: "Metrik Stock Mobile",
    logo: "/branding/logo-stock.png",
    platform: "Android",
    description:
      "App complementaria para inventario y operaciones de stock desde dispositivo Android.",
    downloadHref:
      "https://github.com/Kennetox/metrik-stock-mobile/releases/latest/download/MetrikStockMobile.apk",
    manualHref:
      "mailto:kensarelec@gmail.com?cc=kennethjc2301@gmail.com&subject=Solicitud%20manual%20Metrik%20Stock",
    requirements: "Android 10 o superior · Cuenta activa en Metrik",
  },
  {
    slug: "metrik-pos-mobile",
    name: "Metrik POS Mobile",
    logo: "/branding/metrik-pos-mobile-logo.png",
    platform: "Android Tablet",
    description:
      "App de caja POS para tablets Android, integrada con estaciones, vendedores y catálogo en tiempo real.",
    downloadHref:
      "https://github.com/Kennetox/Kensar_pos_tablet/releases/latest/download/MetrikPOSMobile.apk",
    manualHref:
      "mailto:kensarelec@gmail.com?cc=kennethjc2301@gmail.com&subject=Solicitud%20manual%20Metrik%20POS%20Mobile",
    requirements: "Android 10 o superior · Estación tablet configurada en Metrik",
  },
];

export function getDownloadBySlug(slug: string) {
  return downloadResources.find((resource) => resource.slug === slug);
}

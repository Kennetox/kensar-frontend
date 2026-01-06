import type { MetadataRoute } from "next";

const base = "https://metrikpos.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    { url: `${base}/`, lastModified },
    { url: `${base}/login`, lastModified },
    { url: `${base}/login-pos`, lastModified },
    { url: `${base}/dashboard`, lastModified },
    { url: `${base}/pos`, lastModified },
  ];
}

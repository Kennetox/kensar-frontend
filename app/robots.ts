import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: "https://metrikpos.com/sitemap.xml",
    host: "https://metrikpos.com",
  };
}

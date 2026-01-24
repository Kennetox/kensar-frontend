import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "8000",
        pathname: "/uploads/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "8000",
        pathname: "/uploads/**",
      },
      {
        protocol: "https",
        hostname: "metrikpos.com",
        pathname: "/uploads/**",
      },
      {
        protocol: "https",
        hostname: "www.metrikpos.com",
        pathname: "/uploads/**",
      },
    ],
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Product photos come from DummyJSON's CDN. next/image only optimizes hosts listed here.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "cdn.dummyjson.com", pathname: "/product-images/**" }],
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
    };
    return config;
  },
};

export default nextConfig;

 // 🚀 Clé factice juste pour invalider le cache de build Vercel
  env: {
    FORCE_REBUILD: "2025-10-13",
  },
};

export default nextConfig;

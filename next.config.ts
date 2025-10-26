// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    domains: ["ecole-eft-france.fr"],
  },

  // ✅ Évite d'importer les types webpack (pas besoin de @types/webpack)
  webpack: (config: any) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
    };
    return config;
  },

  env: {
    FORCE_REBUILD: "2025-10-13",
  },
};

export default nextConfig;

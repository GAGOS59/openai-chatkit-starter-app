// next.config.ts
import type { NextConfig } from "next";
import type { Configuration as WebpackConfig } from "webpack";

const nextConfig: NextConfig = {
  images: {
    domains: ["ecole-eft-france.fr"],
    // ou remotePatterns si tu veux être plus fin
    // remotePatterns: [{ protocol: "https", hostname: "ecole-eft-france.fr", pathname: "/**" }],
  },

  // ✅ Type explicite sur `config`
  webpack: (config: WebpackConfig) => {
    // garde ton alias, même s'il est vide pour l'instant
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
    };
    return config;
  },

  // 🚀 clé factice pour invalider le cache de build Vercel si besoin
  env: {
    FORCE_REBUILD: "2025-10-13",
  },
};

export default nextConfig;

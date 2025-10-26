/** @type {import('next').NextConfig} */
const nextConfig = {
  // Autorise les images distantes depuis ton domaine (pour next/image)
  images: {
    domains: ['ecole-eft-france.fr'],
    // ou, si tu préfères une règle plus fine :
    // remotePatterns: [
    //   {
    //     protocol: 'https',
    //     hostname: 'ecole-eft-france.fr',
    //     pathname: '/**',
    //   },
    // ],
  },

  // Laisse ton hook webpack (même s'il ne fait rien pour l’instant)
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
    };
    return config;
  },

  // 🚀 Clé factice pour invalider le cache de build Vercel si besoin
  env: {
    FORCE_REBUILD: '2025-10-13',
  },
};

export default nextConfig;

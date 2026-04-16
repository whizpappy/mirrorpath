/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Keep pdf-parse and mammoth out of the webpack bundle so Node.js resolves
    // them natively — prevents the Object.defineProperty crash in pdf-parse v2.
    // In Next.js 14.x this key lives under experimental.
    serverComponentsExternalPackages: ["pdf-parse", "mammoth"],
  },
};

export default nextConfig;

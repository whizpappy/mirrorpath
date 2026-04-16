/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // canvas and encoding are optional native deps pulled in by some PDF libs.
    // Setting them to false prevents "Module not found" errors in the browser
    // bundle — neither is needed client-side.
    config.resolve.alias.canvas   = false;
    config.resolve.alias.encoding = false;
    return config;
  },
  experimental: {
    // Keep pdf-parse and mammoth out of the webpack bundle so Node.js resolves
    // them natively — prevents the Object.defineProperty crash in pdf-parse v2
    // and the binary-addon issue with mammoth on Vercel's Lambda environment.
    serverComponentsExternalPackages: ["pdf-parse", "mammoth"],
  },
};

export default nextConfig;

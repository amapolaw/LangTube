import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@langtube/core", "@langtube/cloud-adapters"],
  serverExternalPackages: [
    "@cursor/sdk",
    "kuroshiro",
    "kuroshiro-analyzer-kuromoji",
    "kuromoji",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  headers: async () => [
    {
      source: "/manifest.json",
      headers: [{ key: "Content-Type", value: "application/manifest+json" }],
    },
  ],
};

export default nextConfig;

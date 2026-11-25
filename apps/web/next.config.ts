import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@trade-buddy/shared-types",
    "@trade-buddy/ui-tokens",
    "@trade-buddy/market-adapters",
  ],
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: __dirname },
  experimental: {
    // A detailed 1400px boarding-pass JPEG can exceed the 1 MB Server Action
    // default. The action itself applies a stricter 2 MB file limit.
    serverActions: { bodySizeLimit: "3mb" },
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained build for a small Docker runtime image.
  output: "standalone",
  experimental: {
    // Album uploads are large (lossless). Raise the Server Action / route body cap.
    serverActions: {
      bodySizeLimit: "2gb",
    },
  },
};

export default nextConfig;

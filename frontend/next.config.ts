import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lean production image for the Dockerfile: only the files a `next start`
  // server actually needs get copied into the runtime stage, not the full
  // node_modules tree.
  output: "standalone",
};

export default nextConfig;

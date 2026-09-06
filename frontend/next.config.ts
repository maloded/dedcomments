import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lean production image for the Dockerfile: only the files a `next start`
  // server actually needs get copied into the runtime stage, not the full
  // node_modules tree. Only applied for the Docker build (BUILD_STANDALONE
  // set in the Dockerfile) — Vercel's own build/serverless-function tracing
  // is incompatible with standalone output (ENOENT on next-server.js.nft.json)
  // and doesn't need it anyway, since Vercel has its own deployment format.
  ...(process.env.BUILD_STANDALONE === "true" ? { output: "standalone" as const } : {}),
};

export default nextConfig;

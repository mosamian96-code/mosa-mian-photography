import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker deployment (brief section 3): copy .next/standalone + static + public,
  // run node server.js. No node_modules needed in the image.
  output: "standalone",
  // Nothing uses next/image -- every photo is a pre-generated derivative -- so the
  // /_next/image optimizer endpoint was pure attack surface (the critical AVIF RCE
  // advisory fixed in 16.4.6 targeted it). With unoptimized, Next answers that route
  // with a 404 before the optimizer ever runs.
  images: { unoptimized: true },
};

export default nextConfig;

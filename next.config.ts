import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker deployment (brief section 3): copy .next/standalone + static + public,
  // run node server.js. No node_modules needed in the image.
  output: "standalone",
};

export default nextConfig;

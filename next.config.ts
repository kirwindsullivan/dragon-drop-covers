import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16 uses Turbopack by default — no webpack config needed
  // GLSL files are handled natively or can be imported as raw strings
  serverExternalPackages: ["sharp"],
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16 uses Turbopack by default — no webpack config needed
  // GLSL files are handled natively or can be imported as raw strings
  serverExternalPackages: ["sharp"],

  images: {
    // Clerk serves user avatars from img.clerk.com.
    // Without this, next/image returns 400 for any Clerk profile picture URL.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.clerk.com",
      },
      {
        // Older Clerk installations may serve from images.clerk.dev
        protocol: "https",
        hostname: "images.clerk.dev",
      },
    ],
  },
};

export default nextConfig;

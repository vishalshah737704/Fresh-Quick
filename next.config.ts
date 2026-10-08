import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // --all-roles (scripts/start.mjs) runs 4 `next dev` instances of this
  // same project concurrently, one per role/port. Next.js acquires a
  // per-project dev-server lock at `<distDir>/lock` -- with the default
  // shared `.next`, only the first instance can start; the rest exit
  // immediately with "another server is already running". Each role
  // instance sets NEXT_ROLE_DIST_DIR to its own subdirectory so each
  // gets an independent lock (and build cache). Single-instance runs
  // (npm run dev / app:start:dev without --all-roles) are unaffected --
  // the env var is unset, so distDir falls back to the normal ".next".
  distDir: process.env.NEXT_ROLE_DIST_DIR || ".next",
  allowedDevOrigins: ["*.trycloudflare.com", "*.demoaiprojects.com"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.pexels.com",
      },
    ],
  },
};

export default nextConfig;

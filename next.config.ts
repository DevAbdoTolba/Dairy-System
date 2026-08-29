import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel's Next 16.3 adapter does not support standalone output. Docker still
  // receives the standalone bundle it needs, while Vercel uses its native adapter.
  output: process.env.VERCEL ? undefined : "standalone",
  serverExternalPackages: ["mongodb"],
  // Keeps Playwright isolated when the owner is already using `npm run dev`.
  distDir: process.env.DAIRY_NEXT_DIST_DIR ?? ".next",
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;

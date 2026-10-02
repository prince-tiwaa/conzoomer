import type { NextConfig } from "next";

// Django runs behind the storefront on the same origin. Next.js forwards these
// paths to it, so session + CSRF cookies are first-party and no CORS is needed.
const BACKEND_URL = (process.env.BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  // Django URLs end in "/". Without this Next would 308-redirect them away.
  skipTrailingSlashRedirect: true,
  poweredByHeader: false,
  reactStrictMode: true,
  async rewrites() {
    // ":path(.*)" captures the rest of the URL *including* the trailing slash
    // Django expects (":path*" would drop it).
    return [
      { source: "/admin", destination: `${BACKEND_URL}/admin/` },
      ...["api", "accounts", "admin", "static"].map((p) => ({
        source: `/${p}/:path(.*)`,
        destination: `${BACKEND_URL}/${p}/:path`,
      })),
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

// Django runs behind the storefront on the same origin: /api, /accounts, /admin
// and /static are forwarded by route handlers (src/lib/proxy.ts).

const nextConfig: NextConfig = {
  // Django URLs end in "/". Without this Next would 308-redirect them away.
  skipTrailingSlashRedirect: true,
  poweredByHeader: false,
  reactStrictMode: true,
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

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  devIndicators: false,
  logging: { incomingRequests: false, fetches: { fullUrl: false } },
  async headers() {
    return [
      "/invitation/:path*",
      "/reset-password",
      "/verify-email",
      "/api/auth/:path*",
      "/api/invitations/:path*",
      "/api/mfa/:path*",
      "/mfa/:path*",
      "/profile/:path*",
      "/employees/:path*",
      "/references/:path*",
      "/admin/:path*",
      "/api/employees/:path*",
    ].map((source) => ({
      source,
      headers: [
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Cache-Control", value: "no-store" },
      ],
    }));
  },
  turbopack: { root: process.cwd() },
};

export default nextConfig;

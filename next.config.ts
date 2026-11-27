import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: {
    "/api/equipment/*": [
      "./node_modules/@fontsource/noto-sans/files/noto-sans-latin-{400,700}-normal.woff",
      "./node_modules/pdfkit/js/data/**/*",
      "./node_modules/pdfkit/js/standard-fonts/**/*",
    ],
  },
  poweredByHeader: false,
  reactStrictMode: true,
  devIndicators: false,
  // CI already runs the blocking typecheck; local builds require it separately.
  typescript: { ignoreBuildErrors: true },
  experimental: {
    turbopackFileSystemCacheForBuild: process.env.CI !== "true",
  },
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
      "/api/equipment/:path*",
      "/equipment/:path*",
      "/my-equipment",
      "/scan",
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

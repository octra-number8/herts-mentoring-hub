import type { NextConfig } from "next";

// Every page is rendered per signed-in user under row-level security, so the
// app uses dynamic rendering rather than Cache Components (see docs/adr/0002).
const nextConfig: NextConfig = {
  cacheComponents: false,
  poweredByHeader: false,
  serverExternalPackages: ["exceljs", "nodemailer", "pdf-lib"],
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;

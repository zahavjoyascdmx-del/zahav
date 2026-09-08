import type { NextConfig } from "next";

const pdfIncludes = ["./node_modules/@react-pdf/**/*", "./node_modules/pdfkit/**/*", "./node_modules/fontkit/**/*"];

const nextConfig: NextConfig = {
  serverExternalPackages: ["@react-pdf/renderer"],
  // Fotos subidas a mano para generar videos (Server Action con archivo).
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  outputFileTracingIncludes: {
    "/directas/[id]/pdf": pdfIncludes,
    "/directas/[id]/recibo/[pagoId]": pdfIncludes,
  },
};

export default nextConfig;

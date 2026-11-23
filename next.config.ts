import type { NextConfig } from "next";

const pdfIncludes = ["./node_modules/@react-pdf/**/*", "./node_modules/pdfkit/**/*", "./node_modules/fontkit/**/*"];

const nextConfig: NextConfig = {
  serverExternalPackages: ["@react-pdf/renderer"],
  // Fotos de evidencia de reclamos (Vercel acepta hasta 4.5 MB por petición).
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  outputFileTracingIncludes: {
    "/directas/[id]/pdf": pdfIncludes,
    "/directas/[id]/recibo/[pagoId]": pdfIncludes,
  },
};

export default nextConfig;

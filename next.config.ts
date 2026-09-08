import type { NextConfig } from "next";

const pdfIncludes = ["./node_modules/@react-pdf/**/*", "./node_modules/pdfkit/**/*", "./node_modules/fontkit/**/*"];

const nextConfig: NextConfig = {
  serverExternalPackages: ["@react-pdf/renderer", "@napi-rs/canvas", "ffmpeg-static"],
  // Fotos subidas a mano para generar videos (Server Action con archivo).
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  outputFileTracingIncludes: {
    "/directas/[id]/pdf": pdfIncludes,
    "/directas/[id]/recibo/[pagoId]": pdfIncludes,
    // Reel para Instagram: binario de ffmpeg, fuentes y logo.
    "/videos/[id]/reel": ["./node_modules/ffmpeg-static/**/*", "./node_modules/@napi-rs/canvas/**/*", "./node_modules/@napi-rs/canvas-linux-x64-gnu/**/*", "./lib/reel/fonts/**/*", "./public/logo.png"],
  },
};

export default nextConfig;

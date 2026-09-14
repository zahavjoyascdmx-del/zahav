import type { NextConfig } from "next";

const pdfIncludes = ["./node_modules/@react-pdf/**/*", "./node_modules/pdfkit/**/*", "./node_modules/fontkit/**/*"];

const nextConfig: NextConfig = {
  serverExternalPackages: ["@react-pdf/renderer", "@napi-rs/canvas", "ffmpeg-static"],
  // Fotos subidas a mano para generar videos (Server Action con archivo).
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
    // Al volver a una pestaña visitada hace menos de 30 s se muestra al instante desde la caché del navegador.
    // Las acciones (guardar bodega, precios, etc.) invalidan esa caché con revalidatePath, así que no se ven datos viejos.
    staleTimes: { dynamic: 30, static: 180 },
  },
  async headers() {
    const estaticos = ["/logo.png", "/logo.jpg", "/icon-192.png", "/icon-512.png", "/icon-512-maskable.png", "/apple-touch-icon.png"];
    return estaticos.map((source) => ({
      source,
      headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
    }));
  },
  outputFileTracingIncludes: {
    "/directas/[id]/pdf": pdfIncludes,
    "/directas/[id]/recibo/[pagoId]": pdfIncludes,
    // Reel para Instagram: binario de ffmpeg, fuentes y logo.
    "/videos/[id]/reel": ["./node_modules/ffmpeg-static/**/*", "./node_modules/@napi-rs/canvas/**/*", "./node_modules/@napi-rs/canvas-linux-x64-gnu/**/*", "./lib/reel/fonts/**/*", "./public/logo.png"],
  },
};

export default nextConfig;

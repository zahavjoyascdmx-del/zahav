import type { MetadataRoute } from "next";

/** Manifiesto para instalar la app en la pantalla de inicio del teléfono. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ZAHAV · ERP",
    short_name: "ZAHAV",
    description: "Inventario, ventas y reporte mensual de Zahav Joyas",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f2f4f1",
    theme_color: "#14251e",
    lang: "es-MX",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

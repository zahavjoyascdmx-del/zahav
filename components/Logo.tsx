import { LOGO_ASPECT } from "@/lib/logo-data";

/** Logotipo oficial. En fondos oscuros se muestra sobre una placa blanca. */
export function Logo({ width = 180, light = false }: { width?: number; light?: boolean }) {
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo.png" alt="Zahav" width={width} height={Math.round(width / LOGO_ASPECT)} style={{ display: "block", width, height: "auto" }} />
  );
  if (!light) return img;
  return <div style={{ background: "#fff", borderRadius: 10, padding: "10px 12px", display: "inline-block" }}>{img}</div>;
}

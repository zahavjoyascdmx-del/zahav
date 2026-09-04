import { pdfReciboPublico, pdfResponse } from "@/lib/pdf/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const out = await pdfReciboPublico(token);
    if (!out) return new Response("Documento no encontrado", { status: 404 });
    return pdfResponse(out.buf, out.nombre);
  } catch (e) {
    console.error("PDF público error", e);
    return new Response("No se pudo generar el PDF: " + String(e), { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

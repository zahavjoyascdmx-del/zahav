import { pdfRecibo, pdfResponse } from "@/lib/pdf/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; pagoId: string }> }) {
  const { id, pagoId } = await params;
  try {
    const out = await pdfRecibo(Number(id), Number(pagoId));
    if (!out) return new Response("No encontrado", { status: 404 });
    return pdfResponse(out.buf, out.nombre);
  } catch (e) {
    console.error("PDF error", e);
    return new Response("No se pudo generar el PDF: " + String(e), { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

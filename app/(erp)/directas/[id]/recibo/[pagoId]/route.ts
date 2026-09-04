import { pdfRecibo, pdfResponse } from "@/lib/pdf/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; pagoId: string }> }) {
  const { id, pagoId } = await params;
  const out = await pdfRecibo(Number(id), Number(pagoId));
  if (!out) return new Response("No encontrado", { status: 404 });
  return pdfResponse(out.buf, out.nombre);
}

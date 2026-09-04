import { pdfPedido, pdfResponse } from "@/lib/pdf/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const out = await pdfPedido(Number(id));
  if (!out) return new Response("No encontrado", { status: 404 });
  return pdfResponse(out.buf, out.nombre);
}

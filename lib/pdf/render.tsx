import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";
import type { Negocio, Pago, Venta } from "@/lib/directas";
import { PedidoPDF, ReciboPDF } from "./documents";

const DEFAULT_NEGOCIO: Negocio = { nombre: "Zahav Joyas", ciudad: "Ciudad de México", telefono: "", whatsapp: "", instagram: "", correo: "", leyenda: "" };

export async function cargarVenta(id: number) {
  const supabase = await createClient();
  const [venta, pagos, negocio] = await Promise.all([
    supabase.from("direct_sales").select("*, products(name)").eq("id", id).maybeSingle(),
    supabase.from("direct_sale_payments").select("*").eq("sale_id", id).order("fecha").order("id"),
    supabase.from("settings").select("value").eq("key", "negocio").maybeSingle(),
  ]);
  return {
    venta: (venta.data as unknown as Venta | null) ?? null,
    pagos: (pagos.data ?? []) as Pago[],
    negocio: { ...DEFAULT_NEGOCIO, ...((negocio.data?.value as Partial<Negocio>) ?? {}) },
  };
}

export async function pdfPedido(id: number) {
  const { venta, pagos, negocio } = await cargarVenta(id);
  if (!venta) return null;
  const buf = await renderToBuffer(<PedidoPDF venta={venta} pagos={pagos} negocio={negocio} />);
  return { buf, nombre: `${venta.estado === "cotizacion" ? "Cotizacion" : "Pedido"}-ZV-${String(id).padStart(4, "0")}.pdf` };
}

export async function pdfRecibo(id: number, pagoId: number) {
  const { venta, pagos, negocio } = await cargarVenta(id);
  const pago = pagos.find((p) => p.id === pagoId);
  if (!venta || !pago) return null;
  const buf = await renderToBuffer(<ReciboPDF venta={venta} pago={pago} pagos={pagos} negocio={negocio} />);
  return { buf, nombre: `Recibo-R-${String(pagoId).padStart(4, "0")}.pdf` };
}

export function pdfResponse(buf: Buffer, nombre: string) {
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${nombre}"`, "Cache-Control": "no-store" },
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const anon = () => createAnonClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

/** PDF de pedido por enlace público (sin sesión): solo con la clave del enlace. */
export async function pdfPedidoPublico(token: string) {
  if (!UUID.test(token)) return null;
  const { data } = await anon().rpc("pedido_por_token", { p_token: token });
  if (!data?.venta) return null;
  const venta = data.venta as Venta;
  const pagos = (data.pagos ?? []) as Pago[];
  const negocio = { ...DEFAULT_NEGOCIO, ...((data.negocio as Partial<Negocio>) ?? {}) };
  const buf = await renderToBuffer(<PedidoPDF venta={venta} pagos={pagos} negocio={negocio} />);
  return { buf, nombre: `${venta.estado === "cotizacion" ? "Cotizacion" : "Pedido"}-ZV-${String(venta.id).padStart(4, "0")}.pdf` };
}

/** PDF de recibo por enlace público. */
export async function pdfReciboPublico(token: string) {
  if (!UUID.test(token)) return null;
  const { data } = await anon().rpc("recibo_por_token", { p_token: token });
  if (!data?.venta || !data?.pago) return null;
  const venta = data.venta as Venta;
  const pago = data.pago as Pago;
  const pagos = (data.pagos ?? []) as Pago[];
  const negocio = { ...DEFAULT_NEGOCIO, ...((data.negocio as Partial<Negocio>) ?? {}) };
  const buf = await renderToBuffer(<ReciboPDF venta={venta} pago={pago} pagos={pagos} negocio={negocio} />);
  return { buf, nombre: `Recibo-R-${String(pago.id).padStart(4, "0")}.pdf` };
}

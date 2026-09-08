import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayCdmx } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Excel con el detalle de lo enviado a Full por día, producto, color y talla (últimos 90 días). */
export async function GET() {
  const supabase = await createClient();
  const hoy = todayCdmx();
  const { data } = await supabase.from("bodega_envios_full").select("fecha,inventory_id,enviado,descontado,ignorado, variants(color,talla,products(name))")
    .gte("fecha", addDays(hoy, -90)).order("fecha", { ascending: false });
  type E = { fecha: string; inventory_id: string; enviado: number; descontado: number; ignorado: boolean; variants: { color: string; talla: string; products: { name: string } | null } | null };
  const rows = ((data ?? []) as unknown as E[]).map((e) => ({
    Fecha: e.fecha, Producto: e.variants?.products?.name ?? "(sin producto)", Color: e.variants?.color ?? "", Talla: e.variants?.talla ?? "",
    "Salieron a Full": e.enviado, "Descontado de bodega": e.descontado, Estado: e.ignorado ? "no descontar" : e.descontado === e.enviado ? "descontado" : "pendiente", Inventario: e.inventory_id,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 11 }, { wch: 32 }, { wch: 10 }, { wch: 7 }, { wch: 14 }, { wch: 18 }, { wch: 13 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Envíos a Full");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="envios-full-${hoy}.xlsx"` },
  });
}

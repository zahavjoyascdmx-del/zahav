import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { ordenSeccion, tituloSeccion } from "@/lib/reporte";
import { todayCdmx } from "@/lib/format";

export const dynamic = "force-dynamic";

const TALLAS = ["5", "5.5", "6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11", "11.5", "12", "12.5"];

/** Excel de existencias por talla con el mismo formato de la hoja del dueño: una fila por producto y color. */
export async function GET() {
  const supabase = await createClient();
  const [prods, bodega, stock] = await Promise.all([
    supabase.from("products").select("id,name,proveedor,kilates,stock_amazon,sort_order").eq("active", true),
    supabase.from("stock_bodega").select("casa, variants(id,product_id,color,talla)"),
    supabase.rpc("stock_full_actual"),
  ]);
  type P = { id: number; name: string; proveedor: string; kilates: string | null; stock_amazon: number; sort_order: number };
  type B = { casa: number; variants: { id: number; product_id: number; color: string; talla: string } | null };
  type S = { variant_id: number | null; product_id: number | null; color: string | null; talla: string | null; available: number };
  const productos = ((prods.data ?? []) as P[]).sort((a, b) => ordenSeccion(a.proveedor, a.kilates) - ordenSeccion(b.proveedor, b.kilates) || a.sort_order - b.sort_order);
  const casa = ((bodega.data ?? []) as unknown as B[]).filter((b) => b.variants);
  const full = (stock.data ?? []) as S[];

  const rows: (string | number)[][] = [];
  let seccion = "";
  for (const p of productos) {
    const sec = tituloSeccion(p.proveedor, p.kilates);
    if (sec !== seccion) {
      seccion = sec;
      rows.push([]);
      rows.push([sec, "Producto", "Color", "Bodega", "Full", "Amazon", "Total", ...TALLAS.map((t) => `Talla ${t}`), "Otras tallas"]);
    }
    const colores = [...new Set([...casa.filter((b) => b.variants!.product_id === p.id).map((b) => b.variants!.color), ...full.filter((s) => s.product_id === p.id).map((s) => s.color ?? "")])].sort();
    if (!colores.length) colores.push("");
    colores.forEach((color, i) => {
      const bc = casa.filter((b) => b.variants!.product_id === p.id && b.variants!.color === color);
      const fc = full.filter((s) => s.product_id === p.id && (s.color ?? "") === color);
      const porTalla = (t: string) => bc.filter((b) => b.variants!.talla === t).reduce((a, b) => a + b.casa, 0);
      const otras = bc.filter((b) => !TALLAS.includes(b.variants!.talla)).map((b) => `${b.variants!.talla || "s/t"}: ${b.casa}`).join(", ");
      const totalCasa = bc.reduce((a, b) => a + b.casa, 0);
      const totalFull = fc.reduce((a, s) => a + s.available, 0);
      const amazon = i === 0 ? p.stock_amazon : 0;
      rows.push(["", p.name, color || "—", totalCasa, totalFull, amazon, totalCasa + totalFull + amazon, ...TALLAS.map(porTalla), otras]);
    });
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 14 }, { wch: 32 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, ...TALLAS.map(() => ({ wch: 7 })), { wch: 24 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Existencias");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="existencias-zahav-${todayCdmx()}.xlsx"`,
    },
  });
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { mxn } from "@/lib/format";

/** Recordatorio: productos (por color) que en los últimos días configurados vendieron menos del % configurado de su stock. */
export async function AlertaLiquidacion() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("liquidacion_sugerida");
  const filas = ((data ?? []) as { alerta: boolean; producto: string; color: string; valor_costo: number; dias: number; umbral: number }[]).filter((f) => f.alerta);
  if (!filas.length) return null;
  const valor = filas.reduce((a, f) => a + Number(f.valor_costo ?? 0), 0);
  const nombres = filas.map((f) => f.producto + (f.color ? ` ${f.color}` : ""));
  return (
    <p className="notice" style={{ marginBottom: 14 }}>
      🏷 {filas.length} {filas.length === 1 ? "producto lleva" : "productos llevan"} {filas[0].dias} días vendiendo menos del {Number(filas[0].umbral)}% de su stock ({nombres.slice(0, 3).join(", ")}{nombres.length > 3 ? "…" : ""}) · {mxn(valor)} a costo detenidos. Considera ponerlos en liquidación. <Link href="/precios#liquidacion-sugerida">Revisar</Link>
    </p>
  );
}

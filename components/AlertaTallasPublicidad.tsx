import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { mxn } from "@/lib/format";

export type TallasAgotadas = {
  item_id: string; title: string; permalink: string | null; campaign_id: number; campaign_name: string;
  tallas: number; tallas_agotadas: number; vendidas: number; vendidas_agotadas: number; pct: number;
  agotadas_que_venden: string | null; en_transito_agotadas: number; disponible: number; gasto_7d: number;
  umbral: number; avisado_at: string | null;
};

/** Aviso: publicaciones con anuncio activo en las que se agotaron las tallas que más se venden. */
export async function AlertaTallasPublicidad() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("publicidad_tallas_agotadas");
  const filas = (data ?? []) as TallasAgotadas[];
  if (!filas.length) return null;
  const gasto = filas.reduce((a, f) => a + Number(f.gasto_7d ?? 0), 0);
  const nombres = filas.map((f) => f.title);
  return (
    <p className="notice" style={{ marginBottom: 14 }}>
      📏 {filas.length} {filas.length === 1 ? "publicación con publicidad activa tiene" : "publicaciones con publicidad activa tienen"} agotadas
      las tallas que más venden ({nombres.slice(0, 2).join(", ")}{nombres.length > 2 ? "…" : ""}) · gastaron {mxn(gasto)} en 7 días.
      Resurte o baja el presupuesto. <Link href="/stock#tallas-publicidad">Revisar</Link>
    </p>
  );
}

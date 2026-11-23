import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { mxn } from "@/lib/format";

export type PublicidadSinStock = {
  item_id: string; title: string; permalink: string | null; campaign_id: number; campaign_name: string;
  ad_status: "active" | "hold"; item_status: string | null; disponible: number; en_transito: number;
  agotado_desde: string | null; gasto_7d: number; gasto_hoy: number; ultimo_gasto: string | null;
  campana_sin_stock: boolean; avisado: boolean;
};

/** Aviso: anuncios de Product Ads cuya publicación se quedó sin piezas en Full. Para apagar el anuncio o la campaña. */
export async function AlertaPublicidad() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("publicidad_sin_stock");
  const filas = (data ?? []) as PublicidadSinStock[];
  if (!filas.length) return null;
  const activos = filas.filter((f) => f.ad_status === "active");
  const campanas = [...new Set(filas.filter((f) => f.campana_sin_stock).map((f) => f.campaign_name))];
  const nombres = [...new Set(filas.map((f) => f.title))];
  const gasto = filas.reduce((a, f) => a + Number(f.gasto_7d ?? 0), 0);
  return (
    <p className={activos.length ? "error" : "notice"} style={{ marginBottom: 14 }}>
      📣 {filas.length} {filas.length === 1 ? "anuncio" : "anuncios"} de publicidad sin stock en Full
      {activos.length ? <> · <b>{activos.length} {activos.length === 1 ? "sigue activo y puede estar gastando" : "siguen activos y pueden estar gastando"}</b></> : null}
      {campanas.length ? <> · campaña{campanas.length === 1 ? "" : "s"} sin ninguna pieza: <b>{campanas.join(", ")}</b></> : null}
      {" "}({nombres.slice(0, 2).join(", ")}{nombres.length > 2 ? "…" : ""}{gasto > 0 ? ` · gastaron ${mxn(gasto)} en 7 días` : ""}). <Link href="/stock#publicidad">Revisar</Link>
    </p>
  );
}

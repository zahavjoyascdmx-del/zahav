import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fechaCorta } from "@/lib/format";
import { marcarComisionesRevisadas } from "@/app/(erp)/publicaciones/actions";

const TIPO: Record<string, string> = { gold_pro: "Premium", gold_special: "Clásica" };

/** Aviso cuando Mercado Libre cobra una comisión distinta a la última revisada, para decidir si conviene Premium o Clásica. */
export async function AlertaComisiones() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("ml_comisiones_alerta");
  const cambios = (data ?? []) as { listing_type: string; pct_actual: number; pct_conocido: number | null; desde: string; ordenes: number }[];
  if (!cambios.length) return null;
  return (
    <form action={marcarComisionesRevisadas} className="error" style={{ marginBottom: 14 }}>
      ⚠ Mercado Libre cambió su comisión:{" "}
      {cambios.map((c, i) => (
        <span key={c.listing_type}>
          {i > 0 && " · "}
          {TIPO[c.listing_type] ?? c.listing_type} {c.pct_conocido == null ? "" : `${c.pct_conocido}% → `}<b>{c.pct_actual}%</b> desde el {fechaCorta(c.desde)}
          <input type="hidden" name={c.listing_type} value={c.pct_actual} />
        </span>
      ))}
      . Revisa si conviene ajustar precios o cambiar publicaciones de Premium a Clásica. <Link href="/publicaciones">Ver publicaciones</Link>{" "}
      <button className="btn small" type="submit">Ya lo revisé</button>
    </form>
  );
}

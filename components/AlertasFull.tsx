import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { addDays, num, todayCdmx } from "@/lib/format";

/** Aviso cuando llega a Full más de lo que había en bodega (posible etiqueta equivocada). Solo lo que no se ha revisado. */
export async function AlertasFull() {
  const hoy = todayCdmx();
  const supabase = await createClient();
  const { data } = await supabase.rpc("full_alertas", { p_desde: addDays(hoy, -60), p_hasta: hoy });
  const pendientes = ((data ?? []) as { revisada: boolean; producto: string; diferencia: number }[]).filter((a) => !a.revisada);
  if (!pendientes.length) return null;
  const productos = [...new Set(pendientes.map((a) => a.producto))];
  return (
    <p className="error" style={{ marginBottom: 14 }}>
      ⚠ Llegaron a Full piezas que no cuadran con tu bodega en {num(pendientes.length)} {pendientes.length === 1 ? "talla" : "tallas"} ({productos.slice(0, 3).join(", ")}{productos.length > 3 ? "…" : ""}). Puede ser una etiqueta equivocada. <Link href="/ingresos-full#alertas">Revisar</Link>
    </p>
  );
}

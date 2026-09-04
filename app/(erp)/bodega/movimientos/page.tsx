import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fechaCorta, fechaHora, num } from "@/lib/format";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { conteo: "Conteo", ajuste: "Ajuste", entrada: "Entrada", salida: "Salida", traslado_full: "A Full", venta_directa: "Venta directa" };

export default async function MovimientosPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("stock_movements")
    .select("id,fecha,qty,kind,ref,note,created_by,created_at,products(name),variants(color,talla)")
    .order("id", { ascending: false }).limit(300);
  type M = { id: number; fecha: string; qty: number; kind: string; ref: string | null; note: string | null; created_by: string | null; created_at: string; products: { name: string } | null; variants: { color: string; talla: string } | null };
  const rows = (data ?? []) as unknown as M[];
  return (
    <>
      <div className="page-head">
        <div>
          <div className="muted"><Link href="/bodega">← Bodega</Link></div>
          <h1>Movimientos de bodega</h1>
          <div className="muted">Historial de cada cambio de stock: quién, cuándo y cuánto. Últimos 300.</div>
        </div>
      </div>
      <div className="card tight">
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Producto</th><th>Color</th><th>Talla</th><th>Tipo</th><th className="num">Cambio</th><th>Nota</th><th>Quién</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={8} className="muted">Sin movimientos todavía.</td></tr>}
              {rows.map((m) => (
                <tr key={m.id}>
                  <td>{fechaCorta(m.fecha)}<div className="muted">{fechaHora(m.created_at)}</div></td>
                  <td>{m.products?.name}</td>
                  <td>{m.variants?.color || "—"}</td>
                  <td>{m.variants?.talla || "—"}</td>
                  <td>{KIND[m.kind] ?? m.kind}</td>
                  <td className="num" style={{ color: m.qty < 0 ? "var(--alarm)" : "var(--calm)", fontWeight: 700 }}>{m.qty > 0 ? "+" : ""}{num(m.qty)}</td>
                  <td className="muted" style={{ whiteSpace: "normal", maxWidth: 260 }}>{m.note}</td>
                  <td className="muted">{m.created_by ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

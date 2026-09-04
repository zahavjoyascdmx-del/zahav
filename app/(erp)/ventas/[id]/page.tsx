import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addDays, fechaCorta, mxn, num, todayCdmx } from "@/lib/format";

export const dynamic = "force-dynamic";
const RANGOS = [30, 90, 365];

export default async function ProductoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ dias?: string }> }) {
  const { id } = await params;
  const { dias: diasParam } = await searchParams;
  const dias = RANGOS.includes(Number(diasParam)) ? Number(diasParam) : 90;
  const hoy = todayCdmx();
  const desde = addDays(hoy, -(dias - 1));
  const supabase = await createClient();
  const [prod, vars, stock] = await Promise.all([
    supabase.from("products").select("*").eq("id", Number(id)).maybeSingle(),
    supabase.rpc("ventas_por_variante", { p_product_id: Number(id), p_desde: desde, p_hasta: hoy }),
    supabase.rpc("stock_full_actual"),
  ]);
  if (!prod.data) notFound();
  const stockByVariant = new Map<number, { available: number; in_transit: number }>();
  for (const s of (stock.data ?? []) as { variant_id: number | null; available: number; in_transit: number }[]) {
    if (s.variant_id == null) continue;
    const cur = stockByVariant.get(s.variant_id) ?? { available: 0, in_transit: 0 };
    stockByVariant.set(s.variant_id, { available: cur.available + s.available, in_transit: cur.in_transit + s.in_transit });
  }
  const rows = (vars.data ?? []) as { variant_id: number | null; color: string; talla: string; piezas: number; venta: number }[];
  const totalPiezas = rows.reduce((a, r) => a + Number(r.piezas), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="muted"><Link href={`/ventas?dias=${dias}`}>← Ventas</Link></div>
          <h1>{prod.data.name}</h1>
          <div className="muted">{prod.data.category} · del {fechaCorta(desde)} al {fechaCorta(hoy)} · {num(totalPiezas)} piezas</div>
        </div>
        <div className="chips">
          {RANGOS.map((d) => (
            <Link key={d} href={`/ventas/${id}?dias=${d}`} className={`chip ${d === dias ? "active" : ""}`}>{d === 365 ? "1 año" : `${d} días`}</Link>
          ))}
        </div>
      </div>
      <div className="card tight">
        <h2>Ventas por color y talla</h2>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Color</th><th>Talla</th><th className="num">Piezas</th><th className="num">Por mes</th><th className="num">Venta</th><th className="num">En Full</th><th className="num">En tránsito</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const st = r.variant_id != null ? stockByVariant.get(r.variant_id) : undefined;
                return (
                  <tr key={`${r.color}-${r.talla}`}>
                    <td>{r.color || "—"}</td>
                    <td>{r.talla || "—"}</td>
                    <td className="num">{num(r.piezas)}</td>
                    <td className="num">{(Number(r.piezas) / (dias / 30)).toFixed(1)}</td>
                    <td className="num">{mxn(r.venta)}</td>
                    <td className={`num ${st && st.available === 0 ? "zero" : ""}`}>{st ? num(st.available) : "—"}</td>
                    <td className="num">{st ? num(st.in_transit) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

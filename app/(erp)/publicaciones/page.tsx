import { createClient } from "@/lib/supabase/server";
import { addDays, mxn, num, todayCdmx } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PublicacionesPage() {
  const supabase = await createClient();
  const hoy = todayCdmx();
  const [items, visitas] = await Promise.all([
    supabase.from("meli_items").select("item_id,title,status,logistic_type,price,available_quantity,sold_quantity,permalink,has_variations,products(name)").order("status").order("title"),
    supabase.from("meli_visits").select("item_id,visits").gte("visit_date", addDays(hoy, -29)),
  ]);
  const vis = new Map<string, number>();
  for (const v of visitas.data ?? []) vis.set(v.item_id, (vis.get(v.item_id) ?? 0) + v.visits);
  type Item = { item_id: string; title: string; status: string; logistic_type: string | null; price: number; available_quantity: number; sold_quantity: number; permalink: string; has_variations: boolean; products: { name: string } | null };
  const rows = (items.data ?? []) as unknown as Item[];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Publicaciones</h1>
          <div className="muted">{num(rows.length)} publicaciones en Mercado Libre · {num(rows.filter((r) => r.status === "active").length)} activas</div>
        </div>
      </div>
      <div className="card tight">
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Publicación</th><th>Producto</th><th>Estado</th><th>Logística</th><th className="num">Precio</th><th className="num">Stock pub.</th><th className="num">Visitas 30d</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.item_id}>
                  <td><a href={r.permalink} target="_blank" rel="noreferrer">{r.title}</a></td>
                  <td>{r.products?.name ?? <span className="tag warn">sin mapear</span>}</td>
                  <td><span className={`tag ${r.status === "active" ? "ok" : r.status === "paused" ? "warn" : "neutral"}`}>{r.status}</span></td>
                  <td>{r.logistic_type === "fulfillment" ? "Full" : r.logistic_type ?? "—"}</td>
                  <td className="num">{mxn(r.price)}</td>
                  <td className={`num ${r.available_quantity === 0 ? "zero" : ""}`}>{num(r.available_quantity)}</td>
                  <td className="num">{vis.has(r.item_id) ? num(vis.get(r.item_id)) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

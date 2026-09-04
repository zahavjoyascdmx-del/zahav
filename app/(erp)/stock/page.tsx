import { createClient } from "@/lib/supabase/server";
import { fechaCorta, num } from "@/lib/format";

export const dynamic = "force-dynamic";

type Row = {
  inventory_id: string; snapshot_date: string; variant_id: number | null; product_id: number | null;
  producto: string | null; categoria: string | null; color: string | null; talla: string | null;
  available: number; in_transit: number; not_available: number; item_status: string | null; title: string | null;
};

export default async function StockPage() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("stock_full_actual");
  const rows = (data ?? []) as Row[];
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = r.producto ?? r.title ?? r.inventory_id;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const totalDisp = rows.reduce((a, r) => a + r.available, 0);
  const totalTransito = rows.reduce((a, r) => a + r.in_transit, 0);
  const agotadas = rows.filter((r) => r.available === 0 && r.item_status === "active").length;
  const fecha = rows[0]?.snapshot_date;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Stock en Full</h1>
          <div className="muted">Inventario real en la bodega de Mercado Libre · foto del {fecha ? fechaCorta(fecha) : "—"}</div>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="kpi-row">
          <div className="kpi"><div className="label">Piezas disponibles</div><div className="value">{num(totalDisp)}</div></div>
          <div className="kpi"><div className="label">En tránsito a Full</div><div className="value">{num(totalTransito)}</div></div>
          <div className="kpi"><div className="label">Tallas agotadas</div><div className="value">{num(agotadas)}</div><div className="sub">activas con 0 disponibles</div></div>
          <div className="kpi"><div className="label">Inventarios</div><div className="value">{num(rows.length)}</div></div>
        </div>
      </div>
      {[...groups.entries()].map(([name, list]) => {
        const disp = list.reduce((a, r) => a + r.available, 0);
        const ceros = list.filter((r) => r.available === 0 && r.item_status === "active").length;
        return (
          <div className="card tight" key={name} style={{ marginBottom: 12 }}>
            <h2>
              {name} <span className="muted">· {num(disp)} disponibles</span>
              {ceros > 0 && <span className="tag bad" style={{ marginLeft: 8 }}>{ceros} agotadas</span>}
            </h2>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Color</th><th>Talla</th><th className="num">Disponible</th><th className="num">En tránsito</th><th className="num">No disponible</th><th>Publicación</th></tr></thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.inventory_id}>
                      <td>{r.color || "—"}</td>
                      <td>{r.talla || "—"}</td>
                      <td className={`num ${r.available === 0 ? "zero" : ""}`}>{num(r.available)}</td>
                      <td className="num">{num(r.in_transit)}</td>
                      <td className="num">{num(r.not_available)}</td>
                      <td><span className={`tag ${r.item_status === "active" ? "ok" : r.item_status === "paused" ? "warn" : "neutral"}`}>{r.item_status ?? "—"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </>
  );
}

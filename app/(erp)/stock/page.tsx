import { createClient } from "@/lib/supabase/server";
import { fechaCorta, mxn, num } from "@/lib/format";

export const dynamic = "force-dynamic";

type Row = {
  inventory_id: string; snapshot_date: string; item_id: string | null; variant_id: number | null; product_id: number | null;
  producto: string | null; categoria: string | null; color: string | null; talla: string | null;
  available: number; in_transit: number; not_available: number; item_status: string | null; title: string | null;
};
type Item = { item_id: string; title: string; status: string; logistic_type: string | null; available_quantity: number; permalink: string; product_id: number | null; price: number | null };
type Variation = { item_id: string; variation_id: number; color: string | null; talla: string | null; available_quantity: number; price: number | null };
type Producto = { id: number; grams: number | null; cost_fixed: number | null; kilates: string | null; proveedor: string };
type Oro = { proveedor: string; kilates: string; precio: number; mes: string };

const tallaNum = (t: string | null) => { const n = parseFloat((t ?? "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? n : 999; };
const sortVar = <T extends { color: string | null; talla: string | null }>(a: T, b: T) =>
  (a.color ?? "").localeCompare(b.color ?? "") || tallaNum(a.talla) - tallaNum(b.talla);

function Estado({ s }: { s: string | null }) {
  return <span className={`tag ${s === "active" ? "ok" : s === "paused" ? "warn" : "neutral"}`}>{s === "active" ? "activa" : s === "paused" ? "pausada" : s ?? "—"}</span>;
}

export default async function StockPage() {
  const supabase = await createClient();
  const [stock, items, vars, prods, oro] = await Promise.all([
    supabase.rpc("stock_full_actual"),
    supabase.from("meli_items").select("item_id,title,status,logistic_type,available_quantity,permalink,product_id,price").neq("status", "closed"),
    supabase.from("meli_variations").select("item_id,variation_id,color,talla,available_quantity,price"),
    supabase.from("products").select("id,grams,cost_fixed,kilates,proveedor"),
    supabase.from("gold_prices").select("proveedor,kilates,precio,mes").order("mes", { ascending: false }),
  ]);
  const rows = (stock.data ?? []) as Row[];
  const itemList = (items.data ?? []) as Item[];
  const varList = (vars.data ?? []) as Variation[];
  const productos = new Map(((prods.data ?? []) as Producto[]).map((p) => [p.id, p]));
  const precios = (oro.data ?? []) as Oro[];
  // Precio de venta real de cada inventario: el de la variación o, si no tiene, el de la publicación
  const precioVenta = (r: Row) => {
    const v = r.variation_id ? varList.find((x) => x.variation_id === Number(r.variation_id)) : undefined;
    return Number(v?.price ?? itemList.find((i) => i.item_id === r.item_id)?.price ?? 0);
  };
  // Costo por pieza: gramaje × precio del oro vigente del proveedor (último mes capturado) + piedra / plata
  const costoPieza = (r: Row): number | null => {
    const p = r.product_id ? productos.get(r.product_id) : undefined;
    if (!p || (p.grams == null && p.cost_fixed == null)) return null;
    const pr = p.kilates ? precios.find((x) => x.proveedor === p.proveedor && x.kilates === p.kilates)?.precio ?? precios.find((x) => x.kilates === p.kilates)?.precio : undefined;
    if (p.grams != null && !pr) return null;
    return Number(p.grams ?? 0) * Number(pr ?? 0) + Number(p.cost_fixed ?? 0);
  };
  const valorVenta = (list: Row[]) => list.reduce((a, r) => a + r.available * precioVenta(r), 0);
  const valorCosto = (list: Row[]) => list.reduce((a, r) => a + r.available * (costoPieza(r) ?? 0), 0);
  const sinCosto = (list: Row[]) => list.filter((r) => r.available > 0 && costoPieza(r) == null).reduce((a, r) => a + r.available, 0);

  // Full: agrupar por publicación (y las publicaciones por producto)
  const byItem = new Map<string, Row[]>();
  for (const r of rows) byItem.set(r.item_id ?? r.inventory_id, [...(byItem.get(r.item_id ?? r.inventory_id) ?? []), r]);
  const productOrder = new Map<string, number>();
  rows.forEach((r, i) => { const k = r.producto ?? "zzz"; if (!productOrder.has(k)) productOrder.set(k, i); });
  const groups = [...byItem.entries()].map(([itemId, list]) => {
    const meta = itemList.find((i) => i.item_id === itemId);
    const disp = list.reduce((a, r) => a + r.available, 0);
    const transito = list.reduce((a, r) => a + r.in_transit, 0);
    const ceros = list.filter((r) => r.available === 0 && (meta?.status ?? r.item_status) === "active").length;
    return { itemId, meta, list: list.slice().sort(sortVar), disp, transito, ceros, venta: valorVenta(list), costo: valorCosto(list), sinCosto: sinCosto(list), producto: list[0].producto, title: meta?.title ?? list[0].title ?? itemId, status: meta?.status ?? list[0].item_status };
  }).sort((a, b) => (productOrder.get(a.producto ?? "zzz") ?? 1e9) - (productOrder.get(b.producto ?? "zzz") ?? 1e9) || a.title.localeCompare(b.title));

  // Fuera de Full: stock publicado en MELI
  const fullIds = new Set(byItem.keys());
  const otros = itemList.filter((i) => !fullIds.has(i.item_id) && i.logistic_type !== "fulfillment")
    .map((i) => ({ ...i, vars: varList.filter((v) => v.item_id === i.item_id).sort(sortVar) }))
    .sort((a, b) => a.title.localeCompare(b.title));

  const totalDisp = rows.reduce((a, r) => a + r.available, 0);
  const totalTransito = rows.reduce((a, r) => a + r.in_transit, 0);
  const agotadas = groups.reduce((a, g) => a + g.ceros, 0);
  const fecha = rows[0]?.snapshot_date;
  const totalVenta = valorVenta(rows);
  const totalCosto = valorCosto(rows);
  const totalSinCosto = sinCosto(rows);
  const oroVigente = ["10k", "14k"].map((k) => { const p = precios.find((x) => x.kilates === k); return p ? `${k} ${mxn(p.precio)}/g` : null; }).filter(Boolean).join(" · ");

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Stock</h1>
          <div className="muted">Por publicación · abre cada una para ver tallas y colores · foto de Full del {fecha ? fechaCorta(fecha) : "—"}</div>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="kpi-row">
          <div className="kpi"><div className="label">Disponible en Full</div><div className="value">{num(totalDisp)}</div></div>
          <div className="kpi"><div className="label">En tránsito a Full</div><div className="value">{num(totalTransito)}</div></div>
          <div className="kpi"><div className="label">Tallas agotadas</div><div className="value">{num(agotadas)}</div><div className="sub">en publicaciones activas</div></div>
          <div className="kpi"><div className="label">Publicaciones en Full</div><div className="value">{num(groups.length)}</div></div>
        </div>
        <div className="kpi-row" style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
          <div className="kpi"><div className="label">Valor a precio de venta</div><div className="value">{mxn(totalVenta)}</div><div className="sub">piezas disponibles × precio actual de cada publicación</div></div>
          <div className="kpi"><div className="label">Valor a costo</div><div className="value">{mxn(totalCosto)}</div><div className="sub">oro pagado ({oroVigente || "sin precio de oro"}) + diamantes, piedras y plata{totalSinCosto > 0 ? ` · ${num(totalSinCosto)} pzas sin costo capturado` : ""}</div></div>
          <div className="kpi"><div className="label">Margen bruto del stock</div><div className="value">{mxn(totalVenta - totalCosto)}</div><div className="sub">venta − costo, antes de comisiones e impuestos</div></div>
        </div>
      </div>

      <h2 style={{ margin: "18px 0 8px" }}>Mercado Libre Full</h2>
      {groups.map((g) => (
        <details key={g.itemId} className="card tight acc" open={g.ceros > 0}>
          <summary>
            <span className="acc-title">
              <b>{g.title}</b>
              <span className="muted">{g.producto ?? "sin producto"} · {g.list.length} variantes</span>
            </span>
            <span className="acc-nums">
              <span><b>{num(g.disp)}</b><small>disp.</small></span>
              <span><b>{num(g.transito)}</b><small>tránsito</small></span>
              <span><b>{mxn(g.venta)}</b><small>a venta</small></span>
              <span><b>{g.sinCosto > 0 && g.costo === 0 ? "—" : mxn(g.costo)}</b><small>a costo{g.sinCosto > 0 ? " (parcial)" : ""}</small></span>
              {g.ceros > 0 ? <span className="tag bad">{g.ceros} agotadas</span> : <span className="tag ok">completa</span>}
              <Estado s={g.status} />
            </span>
          </summary>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Color</th><th>Talla</th><th className="num">Disponible</th><th className="num">En tránsito</th><th className="num">No disponible</th></tr></thead>
              <tbody>
                {g.list.map((r) => (
                  <tr key={r.inventory_id}>
                    <td>{r.color || "—"}</td>
                    <td>{r.talla || "—"}</td>
                    <td className={`num ${r.available === 0 ? "zero" : ""}`}>{num(r.available)}</td>
                    <td className="num">{num(r.in_transit)}</td>
                    <td className="num">{num(r.not_available)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}

      {otros.length > 0 && (
        <>
          <h2 style={{ margin: "22px 0 8px" }}>Fuera de Full <span className="muted">· stock publicado, lo envías tú</span></h2>
          {otros.map((i) => (
            <details key={i.item_id} className="card tight acc">
              <summary>
                <span className="acc-title"><b>{i.title}</b><span className="muted">{i.vars.length ? `${i.vars.length} variantes` : "sin variantes"}</span></span>
                <span className="acc-nums">
                  <span><b>{num(i.available_quantity)}</b><small>publicado</small></span>
                  <Estado s={i.status} />
                </span>
              </summary>
              {i.vars.length > 0 && (
                <div className="tbl-wrap">
                  <table>
                    <thead><tr><th>Color</th><th>Talla</th><th className="num">Publicado</th></tr></thead>
                    <tbody>
                      {i.vars.map((v, k) => (
                        <tr key={k}><td>{v.color || "—"}</td><td>{v.talla || "—"}</td><td className={`num ${v.available_quantity === 0 ? "zero" : ""}`}>{num(v.available_quantity)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </details>
          ))}
        </>
      )}
    </>
  );
}

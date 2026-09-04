import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { addDays, fechaCorta, mxn, num, todayCdmx } from "@/lib/format";
import { ordenSeccion } from "@/lib/reporte";
import { agregarTalla, guardarBodega } from "./actions";

export const dynamic = "force-dynamic";

type Producto = { id: number; name: string; category: string | null; proveedor: string; kilates: string | null; grams: number | null; cost_fixed: number | null; active: boolean; sort_order: number; stock_amazon: number };
type Var = { product_id: number; variant_id: number; color: string; talla: string; piezas: number; available: number | null; in_transit: number | null; en_full: boolean; activa: boolean; casa: number; ultima_venta: string | null };
type Oro = { proveedor: string; kilates: string; precio: number };

const tallaNum = (t: string) => { const n = parseFloat(t.replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? n : 999; };

export default async function BodegaPage({ searchParams }: { searchParams: Promise<{ ok?: string; q?: string }> }) {
  const { ok, q } = await searchParams;
  const hoy = todayCdmx();
  const desde = addDays(hoy, -89);
  const supabase = await createClient();
  const [prods, vars, oro, snap] = await Promise.all([
    supabase.from("products").select("id,name,category,proveedor,kilates,grams,cost_fixed,active,sort_order,stock_amazon").eq("active", true),
    supabase.rpc("ventas_variantes_todas", { p_desde: desde, p_hasta: hoy }),
    supabase.from("gold_prices").select("proveedor,kilates,precio").order("mes", { ascending: false }),
    supabase.from("meli_stock_snapshots").select("snapshot_date").order("snapshot_date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (vars.error) throw new Error(vars.error.message);
  const precios = (oro.data ?? []) as Oro[];
  const costo = (p: Producto) => {
    const pr = p.kilates ? precios.find((x) => x.proveedor === p.proveedor && x.kilates === p.kilates)?.precio : undefined;
    return (p.grams != null && pr ? Number(p.grams) * pr : 0) + Number(p.cost_fixed ?? 0);
  };
  const filtro = (q ?? "").trim().toLowerCase();
  const productos = ((prods.data ?? []) as Producto[])
    .filter((p) => !filtro || p.name.toLowerCase().includes(filtro))
    .sort((a, b) => ordenSeccion(a.proveedor, a.kilates) - ordenSeccion(b.proveedor, b.kilates) || a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  const porProducto = new Map<number, Var[]>();
  for (const v of (vars.data ?? []) as Var[]) porProducto.set(v.product_id, [...(porProducto.get(v.product_id) ?? []), v]);

  const todas = (vars.data ?? []) as Var[];
  const totalCasa = todas.reduce((a, v) => a + Number(v.casa), 0);
  const totalFull = todas.reduce((a, v) => a + Number(v.available ?? 0), 0);
  const totalAmazon = ((prods.data ?? []) as Producto[]).reduce((a, p) => a + Number(p.stock_amazon), 0);
  const valorCasa = ((prods.data ?? []) as Producto[]).reduce((a, p) => a + costo(p) * (porProducto.get(p.id) ?? []).reduce((s, v) => s + Number(v.casa), 0), 0);
  const paraFull = todas.filter((v) => v.en_full && v.activa && (v.available ?? 0) === 0 && Number(v.casa) > 0 && Number(v.piezas) > 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Bodega</h1>
          <div className="muted">Stock fuera de Full, por talla y color. Cambia los números y guarda cada producto; el reporte y el pedido sugerido lo toman en cuenta al instante. Full se actualiza solo (foto del {snap.data ? fechaCorta(snap.data.snapshot_date) : "—"}). <Link href="/bodega/movimientos">Ver historial de movimientos</Link></div>
        </div>
        <form method="get" className="inline">
          <input name="q" placeholder="Buscar producto…" defaultValue={q ?? ""} style={{ width: 200 }} />
          <button className="btn small secondary" type="submit">Buscar</button>
          {q && <Link href="/bodega" className="chip">Ver todos</Link>}
        </form>
      </div>
      {ok && <p className="notice" style={{ background: "var(--calm-bg)", color: "var(--calm)", marginBottom: 14 }}>Stock guardado.</p>}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="kpi-row">
          <div className="kpi"><div className="label">En bodega</div><div className="value">{num(totalCasa)}</div><div className="sub">piezas · {mxn(valorCasa)} a costo</div></div>
          <div className="kpi"><div className="label">En Full</div><div className="value">{num(totalFull)}</div><div className="sub">disponibles</div></div>
          <div className="kpi"><div className="label">En Amazon</div><div className="value">{num(totalAmazon)}</div></div>
          <div className="kpi"><div className="label">Para mandar a Full</div><div className="value">{num(paraFull.length)}</div><div className="sub">tallas agotadas en Full que sí tienes en bodega</div></div>
        </div>
      </div>

      {paraFull.length > 0 && !filtro && (
        <details className="card tight acc pendiente" style={{ marginBottom: 14 }}>
          <summary><span className="acc-title"><b>Mandar a Full antes de comprar</b><span className="muted">tallas con ventas en 90 días, agotadas en Full y con piezas en bodega</span></span></summary>
          <div className="tbl-wrap">
            <table className="compact">
              <thead><tr><th>Producto</th><th>Color</th><th>Talla</th><th className="num">Vendidas 90d</th><th className="num">En bodega</th><th>Última venta</th></tr></thead>
              <tbody>
                {paraFull.sort((a, b) => Number(b.piezas) - Number(a.piezas)).map((v) => (
                  <tr key={v.variant_id}>
                    <td><a href={`#p${v.product_id}`}>{productos.find((p) => p.id === v.product_id)?.name ?? v.product_id}</a></td>
                    <td>{v.color || "—"}</td><td>{v.talla || "—"}</td>
                    <td className="num">{num(v.piezas)}</td><td className="num"><b>{num(v.casa)}</b></td><td>{v.ultima_venta ? fechaCorta(v.ultima_venta) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {productos.map((p) => {
        const lista = (porProducto.get(p.id) ?? []).slice().sort((a, b) => a.color.localeCompare(b.color) || tallaNum(a.talla) - tallaNum(b.talla));
        const casa = lista.reduce((a, v) => a + Number(v.casa), 0);
        const full = lista.reduce((a, v) => a + Number(v.available ?? 0), 0);
        const formId = `b${p.id}`;
        return (
          <details key={p.id} id={`p${p.id}`} className="card tight acc" open={Boolean(filtro) || String(ok) === String(p.id)}>
            <summary>
              <span className="acc-title"><b>{p.name}</b><span className="muted">{lista.length} tallas · costo {costo(p) > 0 ? mxn(costo(p)) : "sin capturar"}</span></span>
              <span className="acc-nums">
                <span><b>{num(casa)}</b><small>bodega</small></span>
                <span><b>{num(full)}</b><small>Full</small></span>
                <span><b>{num(p.stock_amazon)}</b><small>Amazon</small></span>
              </span>
            </summary>
            <form id={formId} action={guardarBodega}><input type="hidden" name="product_id" value={p.id} /></form>
            <div className="tbl-wrap">
              <table className="compact editable">
                <thead><tr><th>Color</th><th>Talla</th><th className="num">En Full</th><th className="num">Tránsito</th><th className="num">Vendidas 90d</th><th className="num">En bodega</th></tr></thead>
                <tbody>
                  {lista.map((v) => (
                    <tr key={v.variant_id}>
                      <td>{v.color || "—"}</td>
                      <td>{v.talla || "—"}</td>
                      <td className={`num ${v.en_full && v.activa && (v.available ?? 0) === 0 ? "zero" : ""}`}>{v.en_full ? num(v.available ?? 0) : "—"}</td>
                      <td className="num">{v.en_full ? num(v.in_transit ?? 0) : "—"}</td>
                      <td className="num">{num(v.piezas)}</td>
                      <td className="num"><input form={formId} name={`casa__${v.variant_id}`} type="number" min="0" step="1" defaultValue={v.casa} style={{ width: 70 }} /></td>
                    </tr>
                  ))}
                  {lista.length === 0 && <tr><td colSpan={6} className="muted">Sin tallas registradas. Agrega una abajo.</td></tr>}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap", padding: "10px 16px 14px", borderTop: "1px solid var(--line)" }}>
              <label className="inline muted">En Amazon (total)<input form={formId} name="amazon" type="number" min="0" step="1" defaultValue={p.stock_amazon} style={{ width: 70 }} /></label>
              <button form={formId} className="btn small" type="submit">Guardar {p.name}</button>
              <form action={agregarTalla} className="inline" style={{ marginLeft: "auto" }}>
                <input type="hidden" name="product_id" value={p.id} />
                <span className="muted">Agregar talla:</span>
                <input name="color" placeholder="Color" list="colores" style={{ width: 100 }} />
                <input name="talla" placeholder="Talla" style={{ width: 70 }} />
                <input name="casa" type="number" min="0" step="1" placeholder="Pzas" style={{ width: 70 }} />
                <button className="btn small secondary" type="submit">Agregar</button>
              </form>
            </div>
          </details>
        );
      })}
      <datalist id="colores">{["Amarillo", "Blanco", "Rosa", "Rojo", "Verde", "Azul", "Negro"].map((c) => <option key={c} value={c} />)}</datalist>
    </>
  );
}

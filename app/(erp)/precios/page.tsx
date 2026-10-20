import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fechaCorta, mxn, num } from "@/lib/format";
import { agregarLiquidacion, liquidarSugerido, posponerLiquidacion, quitarLiquidacion } from "./actions";

export const dynamic = "force-dynamic";

type Fila = {
  product_id: number; producto: string; liquidacion: boolean; colores: string | null; objetivo: number;
  costo: number | null; insumo: number | null;
  publicaciones: number; en_reventa: number; items: string[] | null; precio_min: number | null; precio_max: number | null;
  rev_piezas: number; rev_neto_pz: number | null; rev_neto_pz_reciente: number | null; rev_min_pz: number | null;
  dir_piezas: number; dir_neto_pz: number | null; dir_ratio: number;
  margen_rev: number | null; margen_dir: number | null; utilidad_pz: number | null; cumple: boolean | null;
  min_reventa: number | null; min_lista_directa: number | null;
};
type Sugerida = {
  product_id: number; producto: string; color: string; desde: string; stock: number; vendidas: number; pct: number;
  costo_u: number; valor_costo: number; dias: number; umbral: number; pospuesta_hasta: string | null; alerta: boolean;
};
type Regla = { id: number; product_id: number; color: string | null; nota: string | null; products: { name: string } | null };

const DIAS = [30, 60, 90];
const COLORES = ["Amarillo", "Blanco", "Rosa", "Rojo", "Verde", "Azul"];

export default async function PreciosPage({ searchParams }: { searchParams: Promise<{ dias?: string; ok?: string; error?: string }> }) {
  const { dias: diasParam, ok, error: errorParam } = await searchParams;
  const dias = DIAS.includes(Number(diasParam)) ? Number(diasParam) : 60;
  const supabase = await createClient();
  const [res, cfg, reglasRes, prods, sugRes] = await Promise.all([
    supabase.rpc("margenes_productos", { p_dias: dias }),
    supabase.from("settings").select("key,value").in("key", ["margen_objetivo", "margen_liquidacion", "utilidad_minima_pz"]),
    supabase.from("liquidaciones").select("id,product_id,color,nota,products(name)").order("id"),
    supabase.from("products").select("id,name").eq("active", true).order("sort_order"),
    supabase.rpc("liquidacion_sugerida"),
  ]);
  if (res.error) throw new Error(res.error.message);
  const setting = (k: string, d: number) => Number(((cfg.data ?? []).find((r) => r.key === k)?.value as { valor?: number } | undefined)?.valor ?? d) || d;
  const objetivo = setting("margen_objetivo", 1.8);
  const objetivoLiq = setting("margen_liquidacion", 1.15);
  const utilMin = setting("utilidad_minima_pz", 1500);
  const filas = ((res.data ?? []) as Fila[]).sort((a, b) => {
    const ma = a.margen_rev != null ? Number(a.margen_rev) / Number(a.objetivo) : a.margen_dir != null ? Number(a.margen_dir) / Number(a.objetivo) : 99;
    const mb = b.margen_rev != null ? Number(b.margen_rev) / Number(b.objetivo) : b.margen_dir != null ? Number(b.margen_dir) / Number(b.objetivo) : 99;
    return ma - mb;
  });
  const reglas = ((reglasRes.data ?? []) as unknown as Regla[]);
  const sugeridas = (sugRes.data ?? []) as Sugerida[];
  const aLiquidar = sugeridas.filter((s) => s.alerta);
  const pospuestas = sugeridas.filter((s) => s.pospuesta_hasta && Number(s.pct) < Number(s.umbral) && !s.alerta);
  const liqDias = sugeridas[0]?.dias ?? 60;
  const liqPct = Number(sugeridas[0]?.umbral ?? 10);

  const conDato = filas.filter((f) => f.margen_rev != null);
  const bajos = conDato.filter((f) => f.cumple === false);
  const cae = filas.filter((f) => f.rev_neto_pz_reciente != null && f.rev_neto_pz != null && Number(f.rev_neto_pz_reciente) < Number(f.rev_neto_pz) * 0.97);

  const etiqueta = (f: Fila) => {
    if (f.margen_rev == null) return { cls: "neutral", txt: "sin ventas" };
    if (f.cumple) return { cls: "ok", txt: Number(f.margen_rev) < Number(f.objetivo) ? `cumple por utilidad` : "cumple" };
    const falta = Number(f.min_reventa) - Number(f.rev_neto_pz);
    return falta <= Number(f.costo) * 0.1 ? { cls: "warn", txt: `faltan ${mxn(falta)}` } : { cls: "bad", txt: `faltan ${mxn(falta)}` };
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Precios y margen <span className="muted">· objetivo {objetivo.toFixed(2)}× · liquidación {objetivoLiq.toFixed(2)}× · o más de {mxn(utilMin)} por pieza</span></h1>
          <div className="muted">
            Margen = lo que te deja Mercado Libre por pieza (ya sin comisión, envío ni retenciones) ÷ costo de la pieza (gramaje × oro de hoy + piedra o pieza).
            Un producto cumple si llega al objetivo, o si ya deja más de {mxn(utilMin)} por pieza. Los que están en liquidación solo necesitan {objetivoLiq.toFixed(2)}×. Cambia los números en <Link href="/config">Configuración</Link>.
          </div>
        </div>
      </div>
      {ok && <div className="flash ok">Guardado.</div>}
      {errorParam && <div className="flash error">{errorParam}</div>}
      <div className="chips" style={{ marginBottom: 12 }}>
        {DIAS.map((d) => <Link key={d} href={`/precios?dias=${d}`} className={`chip ${d === dias ? "active" : ""}`}>últimos {d} días</Link>)}
      </div>

      <div className="grid kpis">
        <div className="kpi"><div className="label">Productos con ventas</div><div className="value">{num(conDato.length)}</div><div className="sub">{num(filas.length - conDato.length)} más sin ventas en el periodo, solo con precio de lista</div></div>
        <div className="kpi"><div className="label">No cumplen</div><div className={`value ${bajos.length ? "zero" : ""}`}>{num(bajos.length)}</div><div className="sub">{bajos.slice(0, 4).map((f) => f.producto + (f.liquidacion ? " (liq.)" : "")).join(", ")}{bajos.length > 4 ? "…" : ""}</div></div>
        <div className="kpi"><div className="label">ML está pagando menos</div><div className="value">{num(cae.length)}</div><div className="sub">lo pagado en reventa las últimas 3 semanas bajó más de 3% contra el periodo</div></div>
      </div>

      <div className="card tight" style={{ marginTop: 14 }}>
        <div className="tbl-wrap">
          <table className="compact">
            <thead>
              <tr>
                <th>Producto</th><th>Publicaciones</th><th className="num">Costo</th>
                <th className="num">ML te paga en reventa</th><th className="num">Utilidad / margen</th>
                <th className="num">Precio de lista</th><th className="num">Si vende directa</th>
                <th className="num">Mínimo a aceptar en reventa</th><th className="num">Precio de lista mínimo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const e = etiqueta(f);
                const reciente = f.rev_neto_pz_reciente != null ? Number(f.rev_neto_pz_reciente) : null;
                const items = f.items ?? [];
                return (
                  <tr key={`${f.product_id}-${f.liquidacion}`} className={f.margen_rev == null && f.margen_dir == null ? "dim" : ""}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{f.producto} {f.liquidacion && <span className="tag warn">liquidación · {f.colores}</span>}</div>
                      <div className="muted">{num(Number(f.rev_piezas))} en reventa · {num(Number(f.dir_piezas))} directas{!f.costo ? " · sin costo en Catálogo" : ""} · objetivo {Number(f.objetivo).toFixed(2)}×</div>
                    </td>
                    <td>
                      {num(Number(f.publicaciones))} {Number(f.en_reventa) > 0 ? <span className="tag warn">{num(Number(f.en_reventa))} en reventa</span> : <span className="tag neutral">venta directa</span>}
                      <div className="muted">{items.slice(0, 2).map((id) => <a key={id} href={`https://articulo.mercadolibre.com.mx/${id.replace("MLM", "MLM-")}`} target="_blank" rel="noreferrer" style={{ marginRight: 6 }}>{id}</a>)}{items.length > 2 ? `+${items.length - 2}` : ""}</div>
                    </td>
                    <td className="num">{f.costo ? mxn(f.costo) : "—"}</td>
                    <td className="num">
                      {f.rev_neto_pz != null ? mxn(f.rev_neto_pz) : "—"}
                      {reciente != null && f.rev_neto_pz != null && Math.abs(reciente - Number(f.rev_neto_pz)) >= 20 && (
                        <div className="muted" style={{ color: reciente < Number(f.rev_neto_pz) ? "var(--alarm)" : undefined }}>últimas 3 sem: {mxn(reciente)}</div>
                      )}
                      {f.rev_min_pz != null && <div className="muted">mínimo pagado {mxn(f.rev_min_pz)}</div>}
                    </td>
                    <td className="num" style={{ fontWeight: 700 }}>
                      {f.utilidad_pz != null ? mxn(f.utilidad_pz) : "—"}
                      <div className="muted" style={{ fontWeight: 400 }}>{f.margen_rev != null ? `${Number(f.margen_rev).toFixed(2)}×` : ""}</div>
                    </td>
                    <td className="num">{f.precio_min ? (Number(f.precio_min) === Number(f.precio_max) ? mxn(f.precio_min) : `${mxn(f.precio_min)} a ${mxn(f.precio_max)}`) : "—"}</td>
                    <td className="num">{f.margen_dir != null ? `${Number(f.margen_dir).toFixed(2)}×` : "—"}<div className="muted">te queda {f.dir_ratio ? `${(Number(f.dir_ratio) * 100).toFixed(0)}%` : "72%"} del precio</div></td>
                    <td className="num" style={{ fontWeight: 600 }}>{f.min_reventa != null && Number(f.costo) > 0 ? mxn(f.min_reventa) : "—"}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{f.min_lista_directa != null && Number(f.costo) > 0 ? mxn(f.min_lista_directa) : "—"}</td>
                    <td><span className={`tag ${e.cls}`}>{e.txt}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>


      <div className="card tight" id="liquidacion-sugerida" style={{ marginTop: 14 }}>
        <h2>Para poner en liquidación <span className="muted">· en los últimos {liqDias} días vendieron menos del {liqPct}% de su stock</span></h2>
        <p className="muted" style={{ margin: "0 0 8px" }}>
          % vendido = piezas vendidas en {liqDias} días ÷ (vendidas + stock de hoy en Full, tránsito y bodega). Menos de {liqPct}% en {liqDias} días quiere decir que, a ese ritmo, tienes stock para más de {Math.round((liqDias / 30) * (100 - liqPct) / liqPct)} meses.
          No se cuentan productos publicados hace menos de {liqDias} días ni los que ya están en liquidación. Cambia los días y el % en <Link href="/config">Configuración</Link>.
        </p>
        {aLiquidar.length === 0 ? <p className="muted">Nada por ahora: todo vende a buen ritmo.</p> : (
          <div className="tbl-wrap">
            <table className="compact">
              <thead><tr><th>Producto</th><th className="num">Stock</th><th className="num">Vendidas {liqDias} días</th><th className="num">% vendido</th><th className="num">Detenido a costo</th><th></th></tr></thead>
              <tbody>
                {aLiquidar.map((s) => (
                  <tr key={`${s.product_id}-${s.color}`}>
                    <td><div style={{ fontWeight: 600 }}>{s.producto}{s.color ? ` · ${s.color}` : ""}</div><div className="muted">se vende desde {fechaCorta(s.desde)}</div></td>
                    <td className="num">{num(s.stock)}</td>
                    <td className="num">{num(s.vendidas)}</td>
                    <td className="num zero">{Number(s.pct).toFixed(1)}%</td>
                    <td className="num">{Number(s.valor_costo) > 0 ? mxn(s.valor_costo) : "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <form action={liquidarSugerido} style={{ display: "inline" }}>
                        <input type="hidden" name="product_id" value={s.product_id} /><input type="hidden" name="color" value={s.color} />
                        <button className="btn" type="submit">Poner en liquidación</button>
                      </form>{" "}
                      <form action={posponerLiquidacion} style={{ display: "inline" }}>
                        <input type="hidden" name="product_id" value={s.product_id} /><input type="hidden" name="color" value={s.color} /><input type="hidden" name="dias" value={30} />
                        <button className="btn ghost" type="submit">Recordar en 30 días</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pospuestas.length > 0 && (
          <p className="muted" style={{ marginTop: 8 }}>Pospuestos: {pospuestas.map((s) => `${s.producto}${s.color ? ` ${s.color}` : ""} (hasta ${fechaCorta(s.pospuesta_hasta!)})`).join(", ")}.</p>
        )}
      </div>

      <div className="grid grid-2" style={{ marginTop: 14 }}>
        <div className="card">
          <h2>Productos en liquidación <span className="muted">· solo se les pide {objetivoLiq.toFixed(2)}×</span></h2>
          {reglas.length === 0 ? <p className="muted">Ninguno.</p> : (
            <ul>
              {reglas.map((r) => (
                <li key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                  <span>{r.products?.name ?? r.product_id} · {r.color ?? "todo el producto"}{r.nota ? ` · ${r.nota}` : ""}</span>
                  <form action={quitarLiquidacion}><input type="hidden" name="id" value={r.id} /><button className="btn ghost" type="submit">Quitar</button></form>
                </li>
              ))}
            </ul>
          )}
          <form action={agregarLiquidacion} className="form-grid" style={{ gridTemplateColumns: "2fr 1fr 1fr auto", marginTop: 10 }}>
            <label>Producto<select name="product_id" required defaultValue=""><option value="" disabled>Elige…</option>{(prods.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label>Color (vacío = todo)<select name="color" defaultValue=""><option value="">Todo el producto</option>{COLORES.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
            <label>Nota<input name="nota" placeholder="Por qué" /></label>
            <button className="btn" type="submit" style={{ alignSelf: "end" }}>Agregar</button>
          </form>
        </div>
        <div className="card">
          <h2>Cómo ajustarlo en Mercado Libre</h2>
          <ul>
            <li><b>Reventa.</b> Lo que te queda no depende de tu precio de lista: es lo que Mercado Libre decide pagarte por pieza. En Mercado Libre → Publicaciones → Reventa, compara el precio de compra que te ofrece cada publicación con la columna "Mínimo a aceptar en reventa". Si paga menos, saca esa publicación de reventa o pide un precio mayor si la pantalla lo permite.</li>
            <li><b>Venta directa.</b> Ahí manda tu precio de lista: te queda cerca del 72% después de comisión, envío Full y retenciones. Pon el precio de lista al menos en la columna "Precio de lista mínimo".</li>
            <li><b>Regla de utilidad.</b> Si una pieza ya deja más de {mxn(utilMin)}, cuenta como buena aunque el margen sea menor al objetivo; por eso el mínimo de los anillos caros es costo + {mxn(utilMin)}.</li>
            <li>Los márgenes son antes de publicidad, cargos de Full, insumos y gastos fijos. El costo usa el oro de hoy: captura el precio del oro del mes para que sea exacto.</li>
          </ul>
        </div>
      </div>
    </>
  );
}

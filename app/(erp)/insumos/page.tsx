import { createClient } from "@/lib/supabase/server";
import { fechaCorta, num, todayCdmx } from "@/lib/format";
import { agregarMovimiento, borrarMovimiento, guardarConteo, guardarEmpaques } from "./actions";

export const dynamic = "force-dynamic";

type Resumen = { insumo_id: string; nombre: string; conteo_inicial: number; minimo: number; compras: number; a_full: number; ventas_bodega: number; directas: number; devoluciones: number; ajustes: number; existencia: number };
type Mov = { id: number; fecha: string; insumo_id: string; tipo: string; cantidad: number; nota: string | null; created_by: string | null };
type Prod = { id: number; name: string; category: string | null; insumo_id: string | null };

const TIPO: Record<string, string> = { compra: "Compra", devolucion: "Devolución", ajuste: "Ajuste" };
const OK: Record<string, string> = {
  compra: "Compra registrada.", devolucion: "Devolución registrada.", ajuste: "Ajuste registrado.",
  conteo: "Conteo guardado.", empaques: "Empaques por producto guardados.",
};

export default async function InsumosPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const hoy = todayCdmx();
  const supabase = await createClient();
  const [res, movs, prods, cfg] = await Promise.all([
    supabase.rpc("insumos_resumen"),
    supabase.from("insumo_movimientos").select("*").order("fecha", { ascending: false }).order("id", { ascending: false }).limit(200),
    supabase.from("products").select("id,name,category,insumo_id").eq("active", true).order("category").order("sort_order").order("name"),
    supabase.from("settings").select("key,value").in("key", ["insumos_fecha_conteo", "insumos_devolucion_pct", "insumos_empaque_directas"]),
  ]);
  if (res.error) throw new Error(res.error.message);
  const insumos = (res.data ?? []) as Resumen[];
  const set = new Map((cfg.data ?? []).map((s) => [s.key as string, s.value as unknown]));
  const fechaConteo = String(set.get("insumos_fecha_conteo") ?? hoy);
  const pctDevol = Number(set.get("insumos_devolucion_pct") ?? 90);
  const empDirectas = String(set.get("insumos_empaque_directas") ?? "");
  const nombre = new Map(insumos.map((i) => [i.insumo_id, i.nombre]));
  const productos = (prods.data ?? []) as Prod[];
  const pedir = insumos.filter((i) => Number(i.existencia) <= Number(i.minimo));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Insumos de empaque</h1>
          <div className="muted">
            Existencia de estuches y cajas. Se descuentan solas desde el día siguiente al conteo ({fechaCorta(fechaConteo)}): ventas de Mercado Libre que salen de bodega (no Full), piezas de cada colecta enviada a Full y ventas directas ({empDirectas ? `un ${(nombre.get(empDirectas) ?? empDirectas).toLowerCase()} cada una` : "sin empaque"}). Compras, devoluciones y correcciones se anotan abajo.
          </div>
        </div>
      </div>

      {ok && OK[ok] && <p className="notice" style={{ background: "var(--calm-bg)", color: "var(--calm)", marginBottom: 14 }}>{OK[ok]}</p>}
      {error && <p className="error">Elige empaque y tipo, y captura una cantidad distinta de cero.</p>}
      {pedir.length > 0 && <p className="notice" style={{ background: "var(--alarm-bg)", color: "var(--alarm)", marginBottom: 14 }}>Pedir más: {pedir.map((i) => `${i.nombre} (${num(i.existencia)})`).join(", ")}.</p>}

      <div className="card tight" style={{ marginBottom: 14 }}>
        <div className="tbl-wrap">
          <table>
            <thead><tr>
              <th>Empaque</th><th className="num">Conteo</th><th className="num">Compras</th><th className="num">A Full</th><th className="num">Ventas bodega</th>
              <th className="num">Ventas directas</th><th className="num">Devoluciones</th><th className="num">Ajustes</th><th className="num">Existencia</th><th className="num">Mínimo</th><th>Aviso</th>
            </tr></thead>
            <tbody>
              {insumos.map((i) => {
                const bajo = Number(i.existencia) <= Number(i.minimo);
                return (
                  <tr key={i.insumo_id}>
                    <td><b>{i.nombre}</b></td>
                    <td className="num">{num(i.conteo_inicial)}</td>
                    <td className="num">{i.compras ? `+${num(i.compras)}` : "—"}</td>
                    <td className="num">{i.a_full ? `−${num(i.a_full)}` : "—"}</td>
                    <td className="num">{i.ventas_bodega ? `−${num(i.ventas_bodega)}` : "—"}</td>
                    <td className="num">{i.directas ? `−${num(i.directas)}` : "—"}</td>
                    <td className="num">{Number(i.devoluciones) ? `+${num(i.devoluciones)}` : "—"}</td>
                    <td className="num">{i.ajustes ? `${i.ajustes > 0 ? "+" : ""}${num(i.ajustes)}` : "—"}</td>
                    <td className={`num ${bajo ? "zero" : ""}`} style={{ fontSize: 16 }}><b>{num(i.existencia)}</b></td>
                    <td className="num">{num(i.minimo)}</td>
                    <td>{bajo ? <span className="tag" style={{ background: "var(--alarm-bg)", color: "var(--alarm)" }}>Pedir más</span> : <span className="tag ok">Bien</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div id="movimientos" className="card" style={{ marginBottom: 14 }}>
        <h2>Registrar compra, devolución o ajuste</h2>
        <form action={agregarMovimiento} className="form-grid" style={{ marginBottom: 14 }}>
          <label>Fecha<input type="date" name="fecha" defaultValue={hoy} max={hoy} required /></label>
          <label>Empaque<select name="insumo_id" required defaultValue="">
            <option value="" disabled>— Elige —</option>
            {insumos.map((i) => <option key={i.insumo_id} value={i.insumo_id}>{i.nombre}</option>)}
          </select></label>
          <label>Tipo<select name="tipo" defaultValue="compra">
            <option value="compra">Compra (llegaron cajas)</option>
            <option value="devolucion">Devolución (regresó con una venta)</option>
            <option value="ajuste">Ajuste (corrección, negativo para restar)</option>
          </select></label>
          <label>Cantidad<input name="cantidad" type="number" step="1" required placeholder="Ej. 100 o -3" /></label>
          <label className="wide">Nota<input name="nota" placeholder="Opcional" /></label>
          <div style={{ gridColumn: "1 / -1" }}><button className="btn" type="submit">Registrar</button></div>
        </form>
        <p className="muted" style={{ marginTop: 0 }}>En devoluciones anota las cajas que regresaron; se suma solo el {num(pctDevol)}%. La compra en dinero de las cajas va aparte en Gastos y proveedores (categoría empaque).</p>
        <div className="tbl-wrap">
          <table className="compact">
            <thead><tr><th>Fecha</th><th>Empaque</th><th>Tipo</th><th className="num">Cantidad</th><th>Nota</th><th>Quién</th><th></th></tr></thead>
            <tbody>
              {(movs.data ?? []).length === 0 && <tr><td colSpan={7} className="muted">Sin movimientos todavía.</td></tr>}
              {((movs.data ?? []) as Mov[]).map((m) => (
                <tr key={m.id} style={m.fecha < fechaConteo ? { opacity: 0.5 } : undefined}>
                  <td>{fechaCorta(m.fecha)}</td>
                  <td>{nombre.get(m.insumo_id) ?? m.insumo_id}</td>
                  <td>{TIPO[m.tipo] ?? m.tipo}</td>
                  <td className="num" style={{ color: m.cantidad < 0 ? "var(--alarm)" : "var(--calm)", fontWeight: 700 }}>{m.cantidad > 0 ? "+" : ""}{num(m.cantidad)}</td>
                  <td className="muted" style={{ whiteSpace: "normal" }}>{m.nota}{m.fecha < fechaConteo ? " (antes del conteo, no cuenta)" : ""}</td>
                  <td className="muted">{m.created_by ?? ""}</td>
                  <td><form action={borrarMovimiento}><input type="hidden" name="id" value={m.id} /><button className="btn small secondary" type="submit">Quitar</button></form></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <details className="card acc" style={{ marginBottom: 14 }}>
        <summary><span className="acc-title"><b>Nuevo conteo y mínimos</b><span className="muted">si vuelves a contar tus cajas, cambia la fecha y el conteo; solo cuenta lo posterior</span></span></summary>
        <form action={guardarConteo} style={{ padding: "0 16px 16px" }}>
          <div className="form-grid" style={{ marginBottom: 12 }}>
            <label>Fecha del conteo<input type="date" name="fecha_conteo" defaultValue={fechaConteo} max={hoy} required /></label>
            <label>% que se recupera de devoluciones<input name="devolucion_pct" type="number" min="0" max="100" step="1" defaultValue={pctDevol} /></label>
            <label>Empaque de ventas directas<select name="empaque_directas" defaultValue={empDirectas}>
              <option value="">Sin empaque</option>
              {insumos.map((i) => <option key={i.insumo_id} value={i.insumo_id}>{i.nombre}</option>)}
            </select></label>
          </div>
          <table className="compact editable">
            <thead><tr><th>Empaque</th><th className="num">Conteo</th><th className="num">Avisar al llegar a</th></tr></thead>
            <tbody>
              {insumos.map((i) => (
                <tr key={i.insumo_id}>
                  <td>{i.nombre}</td>
                  <td className="num"><input name={`conteo__${i.insumo_id}`} type="number" min="0" step="1" defaultValue={i.conteo_inicial} style={{ width: 80 }} /></td>
                  <td className="num"><input name={`minimo__${i.insumo_id}`} type="number" min="0" step="1" defaultValue={i.minimo} style={{ width: 80 }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn" type="submit" style={{ marginTop: 12 }}>Guardar conteo</button>
        </form>
      </details>

      <details id="empaques" className="card acc" style={{ marginBottom: 14 }} open={ok === "empaques"}>
        <summary><span className="acc-title"><b>Qué empaque lleva cada producto</b><span className="muted">{productos.filter((p) => !p.insumo_id).length} productos sin empaque</span></span></summary>
        <form action={guardarEmpaques} style={{ padding: "0 16px 16px" }}>
          <div className="tbl-wrap">
            <table className="compact editable">
              <thead><tr><th>Producto</th><th>Categoría</th><th>Empaque</th></tr></thead>
              <tbody>
                {productos.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td className="muted">{p.category ?? ""}</td>
                    <td><select name={`emp__${p.id}`} defaultValue={p.insumo_id ?? ""}>
                      <option value="">Sin empaque</option>
                      {insumos.map((i) => <option key={i.insumo_id} value={i.insumo_id}>{i.nombre}</option>)}
                    </select></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn" type="submit" style={{ marginTop: 12 }}>Guardar empaques</button>
        </form>
      </details>
    </>
  );
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fechaCorta, mxn, num, todayCdmx } from "@/lib/format";
import { CANALES, ESTADOS, METODOS, detalleTexto, folio, piezaTexto, type Venta } from "@/lib/directas";
import { crearVentaDirecta } from "./actions";

export const dynamic = "force-dynamic";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export default async function DirectasPage({ searchParams }: { searchParams: Promise<{ filtro?: string; anio?: string }> }) {
  const { filtro = "abiertas", anio: anioParam } = await searchParams;
  const supabase = await createClient();
  const hoy = todayCdmx();
  const anioActual = Number(hoy.slice(0, 4));
  const anio = /^\d{4}$/.test(anioParam ?? "") ? Number(anioParam) : anioActual;
  const [ventas, productos, delAnioRes] = await Promise.all([
    supabase.from("direct_sales").select("*, products(name)").order("fecha", { ascending: false }).order("id", { ascending: false }).limit(300),
    supabase.from("products").select("id,name").eq("active", true).order("sort_order"),
    supabase.from("direct_sales").select("fecha,precio_total,pagado").neq("estado", "cancelada")
      .gte("fecha", `${anio}-01-01`).lte("fecha", `${anio}-12-31`).limit(10000),
  ]);
  const todas = (ventas.data ?? []) as unknown as Venta[];
  const abiertas = todas.filter((v) => !["entregada", "cancelada"].includes(v.estado));
  const lista = filtro === "todas" ? todas : filtro === "entregadas" ? todas.filter((v) => v.estado === "entregada") : abiertas;
  const mes = hoy.slice(0, 7);
  const delMes = todas.filter((v) => v.estado !== "cancelada" && v.fecha.startsWith(mes));
  const vendidoMes = delMes.reduce((a, v) => a + Number(v.precio_total), 0);
  const cobradoMes = delMes.reduce((a, v) => a + Number(v.pagado), 0);
  const porCobrar = abiertas.reduce((a, v) => a + Number(v.precio_total) - Number(v.pagado), 0);

  // Totales por mes del año seleccionado (sin canceladas).
  const porMes = MESES.map(() => ({ pedidos: 0, vendido: 0, cobrado: 0 }));
  for (const v of delAnioRes.data ?? []) {
    const m = porMes[Number(String(v.fecha).slice(5, 7)) - 1];
    if (!m) continue;
    m.pedidos += 1;
    m.vendido += Number(v.precio_total);
    m.cobrado += Number(v.pagado);
  }
  const totalAnio = porMes.reduce((a, m) => ({ pedidos: a.pedidos + m.pedidos, vendido: a.vendido + m.vendido, cobrado: a.cobrado + m.cobrado }), { pedidos: 0, vendido: 0, cobrado: 0 });
  const mesesTranscurridos = anio < anioActual ? 12 : anio === anioActual ? Number(hoy.slice(5, 7)) : 0;
  const promedioMes = mesesTranscurridos ? totalAnio.vendido / mesesTranscurridos : 0;
  const anioHref = (y: number) => `/directas?filtro=${filtro}${y === anioActual ? "" : `&anio=${y}`}`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ventas directas</h1>
          <div className="muted">Pedidos fuera de Mercado Libre. Abre un pedido para editarlo, cobrar y generar sus PDF.</div>
        </div>
        <div className="chips">
          {[["abiertas", `Abiertas (${abiertas.length})`], ["entregadas", "Entregadas"], ["todas", "Todas"]].map(([k, l]) => (
            <Link key={k} href={`/directas?filtro=${k}${anio === anioActual ? "" : `&anio=${anio}`}`} className={`chip ${filtro === k ? "active" : ""}`}>{l}</Link>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="kpi-row">
          <div className="kpi"><div className="label">Vendido este mes</div><div className="value">{mxn(vendidoMes)}</div></div>
          <div className="kpi"><div className="label">Vendido en {anio}</div><div className="value">{mxn(totalAnio.vendido)}</div></div>
          <div className="kpi"><div className="label">Cobrado este mes</div><div className="value">{mxn(cobradoMes)}</div></div>
          <div className="kpi"><div className="label">Por cobrar (abiertas)</div><div className="value">{mxn(porCobrar)}</div></div>
          <div className="kpi"><div className="label">Pedidos abiertos</div><div className="value">{num(abiertas.length)}</div></div>
        </div>
      </div>

      <details className="card acc" style={{ marginBottom: 14 }} open>
        <summary>
          <span className="acc-title">
            <b>Ventas por mes · {anio}</b>
            <span className="muted">Total anual {mxn(totalAnio.vendido)} · {num(totalAnio.pedidos)} pedidos{promedioMes ? ` · promedio ${mxn(promedioMes)}/mes` : ""}</span>
          </span>
        </summary>
        <div className="chips" style={{ padding: "0 16px 12px" }}>
          <Link href={anioHref(anio - 1)} className="chip">‹ {anio - 1}</Link>
          {anio !== anioActual && <Link href={anioHref(anioActual)} className="chip">Año actual</Link>}
          {anio < anioActual && <Link href={anioHref(anio + 1)} className="chip">{anio + 1} ›</Link>}
        </div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Mes</th><th className="num">Pedidos</th><th className="num">Vendido</th><th className="num">Cobrado</th></tr></thead>
            <tbody>
              {porMes.map((m, i) => {
                const actual = anio === anioActual && i + 1 === Number(hoy.slice(5, 7));
                return (
                  <tr key={i} style={actual ? { fontWeight: 700 } : undefined}>
                    <td>{MESES[i]}</td>
                    <td className="num">{m.pedidos ? num(m.pedidos) : "—"}</td>
                    <td className="num">{m.pedidos ? mxn(m.vendido) : "—"}</td>
                    <td className="num">{m.pedidos ? mxn(m.cobrado) : "—"}</td>
                  </tr>
                );
              })}
              <tr style={{ fontWeight: 800, borderTop: "2px solid var(--line)" }}>
                <td>Total {anio}</td>
                <td className="num">{num(totalAnio.pedidos)}</td>
                <td className="num">{mxn(totalAnio.vendido)}</td>
                <td className="num">{mxn(totalAnio.cobrado)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>

      <details className="card acc" style={{ marginBottom: 14 }} open={todas.length === 0}>
        <summary><span className="acc-title"><b>Nuevo pedido</b><span className="muted">captura rápida; después podrás editar todo</span></span></summary>
        <form action={crearVentaDirecta} className="form-grid" style={{ padding: "0 16px 16px" }}>
          <label>Fecha<input type="date" name="fecha" defaultValue={hoy} required /></label>
          <label>Canal<select name="canal" defaultValue="whatsapp">{CANALES.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
          <label>Cliente<input name="cliente" required placeholder="Nombre" /></label>
          <label>Teléfono<input name="telefono" placeholder="55 ..." /></label>
          <label className="wide">Producto del catálogo
            <select name="product_id" defaultValue="">
              <option value="">— Pieza especial / no está en catálogo —</option>
              {(productos.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="wide">Descripción de la pieza<input name="descripcion" placeholder="Ej. Anillo compromiso 14k con diamante .30ct" /></label>
          <label>Talla<input name="talla" placeholder="7" /></label>
          <label>Kilates<select name="kilates" defaultValue=""><option value="">—</option><option>10k</option><option>14k</option><option>18k</option><option>Plata</option></select></label>
          <label>Color oro<select name="color" defaultValue=""><option value="">—</option><option>Amarillo</option><option>Blanco</option><option>Rosa</option></select></label>
          <label>Piedra<input name="piedra" placeholder="Diamante .25ct, zirconia..." /></label>
          <label>Precio total<input name="precio_total" type="number" step="0.01" min="0" required placeholder="0" /></label>
          <label>Anticipo pagado<input name="pagado" type="number" step="0.01" min="0" placeholder="0" /></label>
          <label>Método del anticipo<select name="metodo" defaultValue="transferencia">{METODOS.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
          <label>Entrega estimada<input type="date" name="entrega_estimada" /></label>
          <label className="wide">Notas<input name="notas" placeholder="Grabado, detalles..." /></label>
          <div style={{ gridColumn: "1 / -1" }}><button className="btn" type="submit">Guardar pedido</button></div>
        </form>
      </details>

      <div className="card tight">
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Folio</th><th>Fecha</th><th>Cliente</th><th>Pieza</th><th className="num">Total</th><th className="num">Pagado</th><th className="num">Saldo</th><th>Entrega</th><th>Estado</th></tr></thead>
            <tbody>
              {lista.length === 0 && <tr><td colSpan={9} className="muted">Sin pedidos en esta vista.</td></tr>}
              {lista.map((v) => {
                const saldo = Number(v.precio_total) - Number(v.pagado);
                const atrasada = v.entrega_estimada && v.entrega_estimada < hoy && !["entregada", "cancelada"].includes(v.estado);
                return (
                  <tr key={v.id}>
                    <td><Link href={`/directas/${v.id}`}>{folio(v.id)}</Link></td>
                    <td>{fechaCorta(v.fecha)}<div className="muted">{v.canal}</div></td>
                    <td>{v.cliente}<div className="muted">{v.telefono}</div></td>
                    <td style={{ whiteSpace: "normal", maxWidth: 260 }}>{piezaTexto(v)}<div className="muted">{detalleTexto(v)}</div></td>
                    <td className="num">{mxn(v.precio_total)}</td>
                    <td className="num">{mxn(v.pagado)}</td>
                    <td className={`num ${saldo > 0 ? "zero" : ""}`}>{mxn(saldo)}</td>
                    <td className={atrasada ? "zero" : ""}>{v.entrega_estimada ? fechaCorta(v.entrega_estimada) : "—"}</td>
                    <td><span className={`tag ${ESTADOS[v.estado]?.cls ?? "neutral"}`}>{ESTADOS[v.estado]?.label ?? v.estado}</span></td>
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

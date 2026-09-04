import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fechaCorta, mxn, num, todayCdmx } from "@/lib/format";
import { CANALES, ESTADOS, METODOS, detalleTexto, folio, piezaTexto, type Venta } from "@/lib/directas";
import { crearVentaDirecta } from "./actions";

export const dynamic = "force-dynamic";

export default async function DirectasPage({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  const { filtro = "abiertas" } = await searchParams;
  const supabase = await createClient();
  const hoy = todayCdmx();
  const [ventas, productos] = await Promise.all([
    supabase.from("direct_sales").select("*, products(name)").order("fecha", { ascending: false }).order("id", { ascending: false }).limit(300),
    supabase.from("products").select("id,name").eq("active", true).order("sort_order"),
  ]);
  const todas = (ventas.data ?? []) as unknown as Venta[];
  const abiertas = todas.filter((v) => !["entregada", "cancelada"].includes(v.estado));
  const lista = filtro === "todas" ? todas : filtro === "entregadas" ? todas.filter((v) => v.estado === "entregada") : abiertas;
  const mes = hoy.slice(0, 7);
  const delMes = todas.filter((v) => v.estado !== "cancelada" && v.fecha.startsWith(mes));
  const vendidoMes = delMes.reduce((a, v) => a + Number(v.precio_total), 0);
  const cobradoMes = delMes.reduce((a, v) => a + Number(v.pagado), 0);
  const porCobrar = abiertas.reduce((a, v) => a + Number(v.precio_total) - Number(v.pagado), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ventas directas</h1>
          <div className="muted">Pedidos fuera de Mercado Libre. Abre un pedido para editarlo, cobrar y generar sus PDF.</div>
        </div>
        <div className="chips">
          {[["abiertas", `Abiertas (${abiertas.length})`], ["entregadas", "Entregadas"], ["todas", "Todas"]].map(([k, l]) => (
            <Link key={k} href={`/directas?filtro=${k}`} className={`chip ${filtro === k ? "active" : ""}`}>{l}</Link>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="kpi-row">
          <div className="kpi"><div className="label">Vendido este mes</div><div className="value">{mxn(vendidoMes)}</div></div>
          <div className="kpi"><div className="label">Cobrado este mes</div><div className="value">{mxn(cobradoMes)}</div></div>
          <div className="kpi"><div className="label">Por cobrar (abiertas)</div><div className="value">{mxn(porCobrar)}</div></div>
          <div className="kpi"><div className="label">Pedidos abiertos</div><div className="value">{num(abiertas.length)}</div></div>
        </div>
      </div>

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

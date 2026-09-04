import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fechaCorta, mxn, todayCdmx } from "@/lib/format";
import { CANALES, ESTADOS, METODOS, folio, folioRecibo, type Pago, type Venta } from "@/lib/directas";
import { actualizarVenta, agregarPago, cambiarEstado, eliminarPago, eliminarVenta } from "../actions";

export const dynamic = "force-dynamic";

export default async function VentaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params;
  const { ok, error } = await searchParams;
  const supabase = await createClient();
  const [venta, pagos, productos] = await Promise.all([
    supabase.from("direct_sales").select("*, products(name)").eq("id", Number(id)).maybeSingle(),
    supabase.from("direct_sale_payments").select("*").eq("sale_id", Number(id)).order("fecha").order("id"),
    supabase.from("products").select("id,name").eq("active", true).order("sort_order"),
  ]);
  if (!venta.data) notFound();
  const v = venta.data as unknown as Venta;
  const lista = (pagos.data ?? []) as Pago[];
  const saldo = Number(v.precio_total) - Number(v.pagado);
  const hoy = todayCdmx();
  const cerrado = ["entregada", "cancelada"].includes(v.estado);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="muted"><Link href="/directas">← Ventas directas</Link></div>
          <h1>Pedido {folio(v.id)} <span className={`tag ${ESTADOS[v.estado]?.cls ?? "neutral"}`} style={{ verticalAlign: "middle", marginLeft: 8 }}>{ESTADOS[v.estado]?.label}</span></h1>
          <div className="muted">{v.cliente} · {fechaCorta(v.fecha)} · {v.canal}</div>
        </div>
        <div className="chips">
          <a className="btn" href={`/directas/${v.id}/pdf`} target="_blank" rel="noreferrer">PDF del pedido</a>
        </div>
      </div>

      {ok === "guardado" && <p className="notice" style={{ background: "var(--calm-bg)", color: "var(--calm)" }}>Cambios guardados.</p>}
      {ok === "pago" && <p className="notice" style={{ background: "var(--calm-bg)", color: "var(--calm)" }}>Pago registrado. Ya puedes descargar su recibo.</p>}
      {ok === "estado" && <p className="notice" style={{ background: "var(--calm-bg)", color: "var(--calm)" }}>Estado actualizado.</p>}
      {error === "monto" && <p className="error">Captura un monto mayor a cero.</p>}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="kpi-row">
          <div className="kpi"><div className="label">Total</div><div className="value">{mxn(v.precio_total)}</div></div>
          <div className="kpi"><div className="label">Pagado</div><div className="value">{mxn(v.pagado)}</div></div>
          <div className="kpi"><div className="label">Saldo</div><div className="value" style={{ color: saldo > 0 ? "var(--alarm)" : "var(--calm)" }}>{mxn(saldo)}</div></div>
          <div className="kpi"><div className="label">Entrega estimada</div><div className="value" style={{ fontSize: 20 }}>{v.entrega_estimada ? fechaCorta(v.entrega_estimada) : "—"}</div></div>
        </div>
        <div style={{ marginTop: 14 }}>
          <div className="muted" style={{ marginBottom: 6 }}>Cambiar estado</div>
          <div className="chips">
            {Object.entries(ESTADOS).map(([k, e]) => (
              <form key={k} action={cambiarEstado}>
                <input type="hidden" name="id" value={v.id} />
                <input type="hidden" name="estado" value={k} />
                <button type="submit" className={`chip ${v.estado === k ? "active" : ""}`} style={{ cursor: "pointer" }}>{e.label}</button>
              </form>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2>Pagos</h2>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Recibo</th><th>Fecha</th><th>Método</th><th className="num">Monto</th><th>Nota</th><th></th></tr></thead>
              <tbody>
                {lista.length === 0 && <tr><td colSpan={6} className="muted">Sin pagos todavía.</td></tr>}
                {lista.map((p) => (
                  <tr key={p.id}>
                    <td><a href={`/directas/${v.id}/recibo/${p.id}`} target="_blank" rel="noreferrer">{folioRecibo(p.id)}</a></td>
                    <td>{fechaCorta(p.fecha)}</td>
                    <td>{p.metodo}</td>
                    <td className="num">{mxn(p.monto)}</td>
                    <td className="muted" style={{ whiteSpace: "normal" }}>{p.nota}</td>
                    <td>
                      <form action={eliminarPago}>
                        <input type="hidden" name="id" value={v.id} />
                        <input type="hidden" name="pago_id" value={p.id} />
                        <button className="btn small secondary" type="submit" title="Eliminar pago">✕</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!cerrado && (
            <form action={agregarPago} className="form-grid" style={{ marginTop: 14, gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
              <input type="hidden" name="id" value={v.id} />
              <label>Monto<input name="monto" type="number" step="0.01" min="0.01" required placeholder={saldo > 0 ? String(saldo) : "0"} /></label>
              <label>Fecha<input type="date" name="fecha" defaultValue={hoy} /></label>
              <label>Método<select name="metodo" defaultValue="transferencia">{METODOS.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
              <label>Nota<input name="nota" placeholder="Anticipo, liquidación..." /></label>
              <div style={{ gridColumn: "1 / -1" }}><button className="btn" type="submit">Registrar pago y generar recibo</button></div>
            </form>
          )}
        </div>

        <div className="card">
          <h2>Datos del pedido</h2>
          <form action={actualizarVenta} className="form-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
            <input type="hidden" name="id" value={v.id} />
            <label>Fecha<input type="date" name="fecha" defaultValue={v.fecha} required /></label>
            <label>Canal<select name="canal" defaultValue={v.canal}>{CANALES.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
            <label>Cliente<input name="cliente" defaultValue={v.cliente} required /></label>
            <label>Teléfono<input name="telefono" defaultValue={v.telefono ?? ""} /></label>
            <label className="wide">Producto del catálogo
              <select name="product_id" defaultValue={v.product_id ?? ""}>
                <option value="">— Pieza especial / no está en catálogo —</option>
                {(productos.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="wide">Descripción de la pieza<input name="descripcion" defaultValue={v.descripcion ?? ""} /></label>
            <label>Talla<input name="talla" defaultValue={v.talla ?? ""} /></label>
            <label>Kilates<select name="kilates" defaultValue={v.kilates ?? ""}><option value="">—</option><option>10k</option><option>14k</option><option>18k</option><option>Plata</option></select></label>
            <label>Color oro<select name="color" defaultValue={v.color ?? ""}><option value="">—</option><option>Amarillo</option><option>Blanco</option><option>Rosa</option></select></label>
            <label>Piedra<input name="piedra" defaultValue={v.piedra ?? ""} /></label>
            <label>Precio total<input name="precio_total" type="number" step="0.01" min="0" defaultValue={v.precio_total} required /></label>
            <label>Entrega estimada<input type="date" name="entrega_estimada" defaultValue={v.entrega_estimada ?? ""} /></label>
            <label className="wide">Notas<textarea name="notas" rows={3} defaultValue={v.notas ?? ""} /></label>
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
              <button className="btn" type="submit">Guardar cambios</button>
            </div>
          </form>
          <form action={eliminarVenta} style={{ marginTop: 12 }}>
            <input type="hidden" name="id" value={v.id} />
            <button className="btn small secondary" type="submit" style={{ color: "var(--alarm)" }}>Eliminar pedido</button>
          </form>
        </div>
      </div>
    </>
  );
}

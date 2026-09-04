import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fechaCorta, mxn, num, todayCdmx } from "@/lib/format";
import { cambiarEstado, crearVentaDirecta, registrarPago } from "./actions";

export const dynamic = "force-dynamic";

const ESTADOS: Record<string, { label: string; cls: string }> = {
  cotizacion: { label: "Cotización", cls: "neutral" },
  anticipo: { label: "Con anticipo", cls: "warn" },
  produccion: { label: "En producción", cls: "warn" },
  lista: { label: "Lista para entregar", cls: "ok" },
  entregada: { label: "Entregada", cls: "ok" },
  cancelada: { label: "Cancelada", cls: "bad" },
};
const CANALES = ["directa", "whatsapp", "instagram", "facebook", "amazon", "mostrador", "otro"];

type Venta = {
  id: number; fecha: string; canal: string; cliente: string; telefono: string | null; descripcion: string | null;
  talla: string | null; kilates: string | null; color: string | null; piedra: string | null;
  precio_total: number; pagado: number; entrega_estimada: string | null; estado: string; notas: string | null;
  products: { name: string } | null;
};

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
  const vendidoMes = todas.filter((v) => v.estado !== "cancelada" && v.fecha.startsWith(mes)).reduce((a, v) => a + Number(v.precio_total), 0);
  const porCobrar = abiertas.reduce((a, v) => a + Number(v.precio_total) - Number(v.pagado), 0);
  const cobradoMes = todas.filter((v) => v.estado !== "cancelada" && v.fecha.startsWith(mes)).reduce((a, v) => a + Number(v.pagado), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ventas directas</h1>
          <div className="muted">Pedidos fuera de Mercado Libre: WhatsApp, Instagram, mostrador, Amazon.</div>
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

      <div className="card" style={{ marginBottom: 14 }}>
        <h2>Nuevo pedido</h2>
        <form action={crearVentaDirecta} className="form-grid">
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
          <label>Entrega estimada<input type="date" name="entrega_estimada" /></label>
          <label>Notas<input name="notas" placeholder="Grabado, detalles..." /></label>
          <div style={{ gridColumn: "1 / -1" }}><button className="btn" type="submit">Guardar pedido</button></div>
        </form>
      </div>

      <div className="card tight">
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Cliente</th><th>Pieza</th><th>Detalle</th><th className="num">Total</th><th className="num">Pagado</th><th className="num">Saldo</th><th>Entrega</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              {lista.length === 0 && <tr><td colSpan={10} className="muted">Sin pedidos en esta vista.</td></tr>}
              {lista.map((v) => {
                const saldo = Number(v.precio_total) - Number(v.pagado);
                const atrasada = v.entrega_estimada && v.entrega_estimada < hoy && !["entregada", "cancelada"].includes(v.estado);
                return (
                  <tr key={v.id}>
                    <td>{fechaCorta(v.fecha)}<div className="muted">{v.canal}</div></td>
                    <td>{v.cliente}<div className="muted">{v.telefono}</div></td>
                    <td style={{ whiteSpace: "normal", maxWidth: 220 }}>{v.products?.name ?? v.descripcion ?? "—"}{v.products && v.descripcion ? <div className="muted">{v.descripcion}</div> : null}</td>
                    <td className="muted">{[v.kilates, v.color, v.talla && `T${v.talla}`, v.piedra].filter(Boolean).join(" · ")}{v.notas ? <div>{v.notas}</div> : null}</td>
                    <td className="num">{mxn(v.precio_total)}</td>
                    <td className="num">{mxn(v.pagado)}</td>
                    <td className={`num ${saldo > 0 ? "zero" : ""}`}>{mxn(saldo)}</td>
                    <td className={atrasada ? "zero" : ""}>{v.entrega_estimada ? fechaCorta(v.entrega_estimada) : "—"}</td>
                    <td><span className={`tag ${ESTADOS[v.estado]?.cls ?? "neutral"}`}>{ESTADOS[v.estado]?.label ?? v.estado}</span></td>
                    <td>
                      {!["entregada", "cancelada"].includes(v.estado) && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {saldo > 0 && (
                            <form action={registrarPago} className="inline">
                              <input type="hidden" name="id" value={v.id} />
                              <input name="monto" type="number" step="0.01" min="0" placeholder="Pago" />
                              <button className="btn small secondary" type="submit">Cobrar</button>
                            </form>
                          )}
                          <form action={cambiarEstado} className="inline">
                            <input type="hidden" name="id" value={v.id} />
                            <select name="estado" defaultValue={v.estado}>
                              {Object.entries(ESTADOS).map(([k, e]) => <option key={k} value={k}>{e.label}</option>)}
                            </select>
                            <button className="btn small secondary" type="submit">Cambiar</button>
                          </form>
                        </div>
                      )}
                    </td>
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

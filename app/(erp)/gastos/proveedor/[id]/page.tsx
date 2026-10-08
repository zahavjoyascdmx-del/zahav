import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fechaCorta, mxn, todayCdmx } from "@/lib/format";
import { METODOS, whatsappUrl } from "@/lib/directas";
import { estadoCuenta, type Movimiento, type Proveedor } from "@/lib/gastos";
import { actualizarProveedor, agregarMovimiento, borrarMovimiento, eliminarProveedor } from "../../actions";

export const dynamic = "force-dynamic";

const OK: Record<string, string> = { guardado: "Datos del proveedor guardados.", compra: "Compra registrada: se sumó a la deuda.", pago: "Pago registrado: se restó de la deuda." };
const ERR: Record<string, string> = { monto: "Captura un monto mayor a cero.", duplicado: "Ya existe otro proveedor con ese nombre.", guardar: "No se pudieron guardar los cambios." };

export default async function ProveedorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params;
  const { ok, error } = await searchParams;
  const supabase = await createClient();
  const [provRes, movRes] = await Promise.all([
    supabase.from("proveedores").select("*").eq("id", Number(id)).maybeSingle(),
    supabase.from("proveedor_movimientos").select("*").eq("proveedor_id", Number(id)).order("fecha").order("id"),
  ]);
  if (!provRes.data) notFound();
  const p = provRes.data as Proveedor;
  const movs = (movRes.data ?? []) as Movimiento[];
  const hoy = todayCdmx();
  const e = estadoCuenta(movs, hoy);

  // Estado de cuenta con saldo acumulado; se muestra del más reciente al más antiguo.
  let acumulado = 0;
  const filas = movs.map((m) => {
    acumulado += m.tipo === "compra" ? Number(m.monto) : -Number(m.monto);
    return { m, saldo: acumulado };
  }).reverse();

  return (
    <>
      <div className="page-head">
        <div>
          <div className="muted"><Link href="/gastos#proveedores">← Gastos y proveedores</Link></div>
          <h1>{p.nombre} {!p.activo && <span className="tag neutral" style={{ verticalAlign: "middle" }}>Inactivo</span>}</h1>
          <div className="muted">{[p.contacto, p.telefono, p.notas].filter(Boolean).join(" · ") || "Sin datos de contacto"}</div>
        </div>
        {p.telefono && (
          <div className="chips">
            <a className="btn secondary" href={whatsappUrl(p.telefono, `Hola ${p.contacto ?? p.nombre}, `)} target="_blank" rel="noreferrer">WhatsApp</a>
          </div>
        )}
      </div>

      {ok && OK[ok] && <p className="notice" style={{ background: "var(--calm-bg)", color: "var(--calm)" }}>{OK[ok]}</p>}
      {error && ERR[error] && <p className="error">{ERR[error]}</p>}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="kpi-row">
          <div className="kpi"><div className="label">Saldo</div><div className="value" style={{ color: e.saldo > 0.005 ? "var(--alarm)" : "var(--calm)" }}>{e.saldo < -0.005 ? mxn(-e.saldo) : mxn(e.saldo)}</div><div className="sub">{e.saldo > 0.005 ? "le debes" : e.saldo < -0.005 ? "a tu favor" : "al corriente"}</div></div>
          <div className="kpi"><div className="label">Vencido</div><div className="value" style={{ color: e.vencido > 0 ? "var(--alarm)" : undefined }}>{mxn(e.vencido)}</div></div>
          <div className="kpi"><div className="label">Próximo vencimiento</div><div className="value" style={{ fontSize: 20 }}>{e.proximoVence ? fechaCorta(e.proximoVence) : "—"}</div></div>
          <div className="kpi"><div className="label">Comprado total</div><div className="value">{mxn(e.compras)}</div></div>
          <div className="kpi"><div className="label">Pagado total</div><div className="value">{mxn(e.pagos)}</div></div>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 14 }}>
        <div className="card">
          <h2>Registrar compra <span className="muted">· sube la deuda</span></h2>
          <form action={agregarMovimiento} className="form-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
            <input type="hidden" name="proveedor_id" value={p.id} />
            <input type="hidden" name="tipo" value="compra" />
            <label>Fecha<input type="date" name="fecha" defaultValue={hoy} max={hoy} required /></label>
            <label>Monto<input name="monto" type="number" step="0.01" min="0.01" required placeholder="0" /></label>
            <label className="wide">Concepto<input name="concepto" placeholder="Ej. 30 g oro 14k / nota 1234" /></label>
            <label>Vence<input type="date" name="vence" /></label>
            <label>Nota<input name="nota" placeholder="Opcional" /></label>
            <div style={{ gridColumn: "1 / -1" }}><button className="btn" type="submit">Registrar compra</button></div>
          </form>
        </div>
        <div className="card">
          <h2>Registrar pago <span className="muted">· baja la deuda</span></h2>
          <form action={agregarMovimiento} className="form-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
            <input type="hidden" name="proveedor_id" value={p.id} />
            <input type="hidden" name="tipo" value="pago" />
            <label>Fecha<input type="date" name="fecha" defaultValue={hoy} max={hoy} required /></label>
            <label>Monto<input name="monto" type="number" step="0.01" min="0.01" required placeholder={e.saldo > 0 ? String(Math.round(e.saldo * 100) / 100) : "0"} /></label>
            <label>Método<select name="metodo" defaultValue="transferencia">{METODOS.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
            <label>Concepto<input name="concepto" placeholder="Abono, liquidación..." /></label>
            <label className="wide">Nota<input name="nota" placeholder="Opcional" /></label>
            <div style={{ gridColumn: "1 / -1" }}><button className="btn" type="submit">Registrar pago</button></div>
          </form>
        </div>
      </div>

      <div className="card tight" style={{ marginBottom: 14 }}>
        <h2>Estado de cuenta</h2>
        <div className="tbl-wrap" style={{ marginTop: 10 }}>
          <table>
            <thead><tr><th>Fecha</th><th>Movimiento</th><th>Concepto</th><th className="num">Cargo</th><th className="num">Abono</th><th className="num">Saldo</th><th>Vence / pendiente</th><th></th></tr></thead>
            <tbody>
              {filas.length === 0 && <tr><td colSpan={8} className="muted">Sin movimientos todavía.</td></tr>}
              {filas.map(({ m, saldo }) => {
                const pendiente = m.tipo === "compra" ? e.pendientes.get(m.id) ?? 0 : 0;
                const vencida = pendiente > 0 && m.vence != null && m.vence < hoy;
                return (
                  <tr key={m.id}>
                    <td>{fechaCorta(m.fecha)}</td>
                    <td><span className={`tag ${m.tipo === "compra" ? "warn" : "ok"}`}>{m.tipo === "compra" ? "Compra" : "Pago"}</span>{m.metodo && <div className="muted">{m.metodo}</div>}</td>
                    <td style={{ whiteSpace: "normal" }}>{m.concepto ?? "—"}{m.nota && <div className="muted">{m.nota}</div>}</td>
                    <td className="num">{m.tipo === "compra" ? mxn(m.monto) : ""}</td>
                    <td className="num">{m.tipo === "pago" ? mxn(m.monto) : ""}</td>
                    <td className="num">{mxn(saldo)}</td>
                    <td className={vencida ? "zero" : ""}>
                      {m.tipo === "compra" && (pendiente > 0 ? <>{m.vence ? `${vencida ? "Vencida" : "Vence"} ${fechaCorta(m.vence)}` : "Sin fecha"}<div className="muted">falta {mxn(pendiente)}</div></> : <span className="tag ok">Pagada</span>)}
                    </td>
                    <td><form action={borrarMovimiento}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="proveedor_id" value={p.id} /><button className="btn small secondary" type="submit">Quitar</button></form></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <details className="card acc" style={{ marginBottom: 14 }}>
        <summary><span className="acc-title"><b>Datos del proveedor</b><span className="muted">nombre, contacto, notas</span></span></summary>
        <form action={actualizarProveedor} className="form-grid" style={{ padding: "0 16px 16px" }}>
          <input type="hidden" name="id" value={p.id} />
          <label>Nombre<input name="nombre" required defaultValue={p.nombre} /></label>
          <label>Contacto<input name="contacto" defaultValue={p.contacto ?? ""} /></label>
          <label>Teléfono<input name="telefono" defaultValue={p.telefono ?? ""} /></label>
          <label>Notas<input name="notas" defaultValue={p.notas ?? ""} /></label>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><input type="checkbox" name="activo" defaultChecked={p.activo} /> Activo</label>
          <div style={{ gridColumn: "1 / -1" }}><button className="btn" type="submit">Guardar</button></div>
        </form>
        <form action={eliminarProveedor} style={{ padding: "0 16px 16px" }}>
          <input type="hidden" name="id" value={p.id} />
          <button className="btn small secondary" type="submit" disabled={movs.length > 0} title={movs.length > 0 ? "Quita sus movimientos o márcalo inactivo" : undefined}>Eliminar proveedor</button>
          {movs.length > 0 && <span className="muted" style={{ marginLeft: 8 }}>Tiene movimientos: mejor márcalo inactivo.</span>}
        </form>
      </details>
    </>
  );
}

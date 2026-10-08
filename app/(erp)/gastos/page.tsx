import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fechaCorta, mxn, todayCdmx } from "@/lib/format";
import { mesAnterior, mesSiguiente, nombreMes } from "@/lib/reporte";
import { METODOS } from "@/lib/directas";
import { CATEGORIAS, categoriaLabel, estadoCuenta, type Gasto, type Movimiento, type Proveedor } from "@/lib/gastos";
import { agregarGasto, agregarMovimiento, borrarGasto, crearProveedor } from "./actions";

export const dynamic = "force-dynamic";

const OK: Record<string, string> = { gasto: "Gasto registrado.", compra: "Compra registrada: se sumó a la deuda del proveedor.", pago: "Pago registrado: se restó de la deuda del proveedor." };
const ERR: Record<string, string> = { gasto: "Captura concepto y un monto mayor a cero.", monto: "Elige proveedor y captura un monto mayor a cero.", duplicado: "Ya existe un proveedor con ese nombre.", proveedor: "No se pudo crear el proveedor." };

export default async function GastosPage({ searchParams }: { searchParams: Promise<{ mes?: string; ok?: string; error?: string }> }) {
  const { mes: mesParam, ok, error } = await searchParams;
  const hoy = todayCdmx();
  const mesActual = hoy.slice(0, 8) + "01";
  const mes = /^\d{4}-\d{2}-01$/.test(mesParam ?? "") && (mesParam as string) <= mesActual ? (mesParam as string) : mesActual;
  let desde6 = mes;
  for (let i = 0; i < 5; i++) desde6 = mesAnterior(desde6);

  const supabase = await createClient();
  const [gastosRes, histRes, provRes, movRes] = await Promise.all([
    supabase.from("gastos_mensuales").select("*").eq("mes", mes).order("fecha", { ascending: false }).order("id", { ascending: false }),
    supabase.from("gastos_mensuales").select("mes,monto").gte("mes", desde6).lte("mes", mes).limit(10000),
    supabase.from("proveedores").select("*").order("nombre"),
    supabase.from("proveedor_movimientos").select("*").order("fecha").limit(20000),
  ]);
  const gastos = (gastosRes.data ?? []) as Gasto[];
  const totalMes = gastos.reduce((a, g) => a + Number(g.monto), 0);
  const porCategoria = Object.entries(gastos.reduce<Record<string, number>>((acc, g) => ({ ...acc, [g.categoria]: (acc[g.categoria] ?? 0) + Number(g.monto) }), {}))
    .sort((a, b) => b[1] - a[1]);
  const meses6: string[] = [];
  for (let m = desde6; m <= mes; m = mesSiguiente(m)) meses6.push(m);
  const histPorMes = new Map<string, number>();
  for (const g of histRes.data ?? []) histPorMes.set(String(g.mes).slice(0, 10), (histPorMes.get(String(g.mes).slice(0, 10)) ?? 0) + Number(g.monto));
  const maxHist = Math.max(1, ...histPorMes.values());

  const proveedores = (provRes.data ?? []) as Proveedor[];
  const movs = (movRes.data ?? []) as Movimiento[];
  const cuentas = proveedores.map((p) => ({ p, e: estadoCuenta(movs.filter((m) => m.proveedor_id === p.id), hoy) }));
  const visibles = cuentas.filter(({ p, e }) => p.activo || Math.abs(e.saldo) > 0.005);
  const deuda = cuentas.reduce((a, { e }) => a + Math.max(0, e.saldo), 0);
  const vencido = cuentas.reduce((a, { e }) => a + e.vencido, 0);
  const delMes = movs.filter((m) => m.fecha >= mes && m.fecha < mesSiguiente(mes));
  const pagadoMes = delMes.filter((m) => m.tipo === "pago").reduce((a, m) => a + Number(m.monto), 0);
  const compradoMes = delMes.filter((m) => m.tipo === "compra").reduce((a, m) => a + Number(m.monto), 0);
  const fechaDefault = mes === mesActual ? hoy : mes;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Gastos y proveedores</h1>
          <div className="muted">Gastos de operación del mes y lo que le debes a cada proveedor. Los gastos se restan de la utilidad final en el <Link href={`/reporte?mes=${mes}`} style={{ textDecoration: "underline" }}>Reporte mensual</Link>.</div>
        </div>
        <div className="chips">
          <Link href={`/gastos?mes=${mesAnterior(mes)}`} className="chip">‹</Link>
          <span className="chip active">{nombreMes(mes)}</span>
          {mes < mesActual && <Link href={`/gastos?mes=${mesSiguiente(mes)}`} className="chip">›</Link>}
        </div>
      </div>

      {ok && OK[ok] && <p className="notice" style={{ background: "var(--calm-bg)", color: "var(--calm)" }}>{OK[ok]}</p>}
      {error && ERR[error] && <p className="error">{ERR[error]}</p>}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="kpi-row">
          <div className="kpi"><div className="label">Gastos de {nombreMes(mes).split(" ")[0].toLowerCase()}</div><div className="value">{mxn(totalMes)}</div><div className="sub">{gastos.length} movimientos</div></div>
          <div className="kpi"><div className="label">Deuda con proveedores</div><div className="value" style={{ color: deuda > 0 ? "var(--alarm)" : undefined }}>{mxn(deuda)}</div><div className="sub">saldo pendiente hoy</div></div>
          <div className="kpi"><div className="label">Vencido</div><div className="value" style={{ color: vencido > 0 ? "var(--alarm)" : undefined }}>{mxn(vencido)}</div><div className="sub">compras con fecha límite pasada</div></div>
          <div className="kpi"><div className="label">Pagado a proveedores</div><div className="value">{mxn(pagadoMes)}</div><div className="sub">en {nombreMes(mes).toLowerCase()}</div></div>
          <div className="kpi"><div className="label">Comprado a crédito</div><div className="value">{mxn(compradoMes)}</div><div className="sub">en {nombreMes(mes).toLowerCase()}</div></div>
        </div>
      </div>

      {/* ---------------------------------------------------------------- gastos */}
      <div id="gastos" className="card" style={{ marginBottom: 14 }}>
        <h2>Gastos de operación · {nombreMes(mes)} <span className="muted">· cajas, envíos, sueldos, renta, comisiones bancarias…</span></h2>
        <form action={agregarGasto} className="form-grid" style={{ marginBottom: 14 }}>
          <label>Fecha<input type="date" name="fecha" defaultValue={fechaDefault} max={hoy} required /></label>
          <label>Categoría<select name="categoria" defaultValue="empaque">{Object.entries(CATEGORIAS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="wide">Concepto<input name="concepto" required placeholder="Ej. 100 cajas de terciopelo" /></label>
          <label>Monto<input name="monto" type="number" step="0.01" min="0.01" required placeholder="0" /></label>
          <label>Método<select name="metodo" defaultValue="transferencia">{METODOS.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
          <label className="wide">Nota<input name="nota" placeholder="Opcional" /></label>
          <div style={{ gridColumn: "1 / -1" }}><button className="btn" type="submit">Agregar gasto</button></div>
        </form>

        {porCategoria.length > 0 && (
          <div className="chips" style={{ marginBottom: 10 }}>
            {porCategoria.map(([k, v]) => <span key={k} className="tag neutral">{categoriaLabel(k)} · {mxn(v)}</span>)}
          </div>
        )}
        <div className="tbl-wrap">
          <table className="compact">
            <thead><tr><th>Fecha</th><th>Categoría</th><th>Concepto</th><th>Método</th><th className="num">Monto</th><th></th></tr></thead>
            <tbody>
              {gastos.length === 0 && <tr><td colSpan={6} className="muted">Sin gastos capturados en {nombreMes(mes).toLowerCase()}.</td></tr>}
              {gastos.map((g) => (
                <tr key={g.id}>
                  <td>{fechaCorta(g.fecha ?? g.mes)}</td>
                  <td>{categoriaLabel(g.categoria)}</td>
                  <td style={{ whiteSpace: "normal" }}>{g.concepto}{g.nota && <div className="muted">{g.nota}</div>}</td>
                  <td className="muted">{g.metodo ?? ""}</td>
                  <td className="num">{mxn(g.monto)}</td>
                  <td><form action={borrarGasto}><input type="hidden" name="id" value={g.id} /><input type="hidden" name="mes" value={mes} /><button className="btn small secondary" type="submit">Quitar</button></form></td>
                </tr>
              ))}
              {gastos.length > 0 && <tr className="total"><td colSpan={4}>Total</td><td className="num">{mxn(totalMes)}</td><td></td></tr>}
            </tbody>
          </table>
        </div>

        <h2 style={{ marginTop: 18 }}>Últimos 6 meses</h2>
        <table className="compact">
          <tbody>
            {meses6.map((m) => {
              const v = histPorMes.get(m) ?? 0;
              return (
                <tr key={m} style={m === mes ? { fontWeight: 700 } : undefined}>
                  <td style={{ width: 150 }}><Link href={`/gastos?mes=${m}`}>{nombreMes(m)}</Link></td>
                  <td><div className="bar"><span style={{ width: `${(v / maxHist) * 100}%` }} /></div></td>
                  <td className="num" style={{ width: 110 }}>{v ? mxn(v) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---------------------------------------------------------------- proveedores */}
      <div id="proveedores" className="card tight" style={{ marginBottom: 14 }}>
        <h2>Proveedores y deudas <span className="muted">· compras a crédito menos pagos; abre un proveedor para ver su estado de cuenta</span></h2>
        <div className="tbl-wrap" style={{ marginTop: 10 }}>
          <table>
            <thead><tr><th>Proveedor</th><th className="num">Comprado</th><th className="num">Pagado</th><th className="num">Saldo</th><th className="num">Vencido</th><th>Próximo vencimiento</th></tr></thead>
            <tbody>
              {visibles.length === 0 && <tr><td colSpan={6} className="muted">Sin proveedores. Agrega uno abajo.</td></tr>}
              {visibles.sort((a, b) => b.e.saldo - a.e.saldo || a.p.nombre.localeCompare(b.p.nombre)).map(({ p, e }) => (
                <tr key={p.id}>
                  <td><Link href={`/gastos/proveedor/${p.id}`}>{p.nombre}</Link>{p.contacto && <div className="muted">{p.contacto}</div>}</td>
                  <td className="num">{mxn(e.compras)}</td>
                  <td className="num">{mxn(e.pagos)}</td>
                  <td className={`num ${e.saldo > 0.005 ? "zero" : ""}`}>{e.saldo < -0.005 ? `${mxn(-e.saldo)} a favor` : mxn(e.saldo)}</td>
                  <td className={`num ${e.vencido > 0 ? "zero" : ""}`}>{e.vencido > 0 ? mxn(e.vencido) : "—"}</td>
                  <td>{e.proximoVence ? fechaCorta(e.proximoVence) : "—"}</td>
                </tr>
              ))}
              {visibles.length > 0 && (
                <tr className="total"><td>Total</td><td className="num">{mxn(cuentas.reduce((a, c) => a + c.e.compras, 0))}</td><td className="num">{mxn(cuentas.reduce((a, c) => a + c.e.pagos, 0))}</td><td className="num">{mxn(deuda)}</td><td className="num">{vencido > 0 ? mxn(vencido) : "—"}</td><td></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {proveedores.length > 0 && (
        <details className="card acc" style={{ marginBottom: 14 }} open>
          <summary><span className="acc-title"><b>Registrar compra o pago a proveedor</b><span className="muted">compra = te fían mercancía (sube la deuda) · pago = abonas o liquidas (baja la deuda)</span></span></summary>
          <form action={agregarMovimiento} className="form-grid" style={{ padding: "0 16px 16px" }}>
            <input type="hidden" name="volver" value="lista" />
            <label>Proveedor<select name="proveedor_id" required defaultValue="">
              <option value="" disabled>— Elige —</option>
              {proveedores.filter((p) => p.activo).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select></label>
            <label>Tipo<select name="tipo" defaultValue="compra"><option value="compra">Compra (debo)</option><option value="pago">Pago (abono)</option></select></label>
            <label>Fecha<input type="date" name="fecha" defaultValue={hoy} max={hoy} required /></label>
            <label>Monto<input name="monto" type="number" step="0.01" min="0.01" required placeholder="0" /></label>
            <label className="wide">Concepto<input name="concepto" placeholder="Ej. 20 g oro 10k / nota 1234" /></label>
            <label>Vence (si es compra)<input type="date" name="vence" /></label>
            <label>Método (si es pago)<select name="metodo" defaultValue="transferencia">{METODOS.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
            <label className="wide">Nota<input name="nota" placeholder="Opcional" /></label>
            <div style={{ gridColumn: "1 / -1" }}><button className="btn" type="submit">Registrar</button></div>
          </form>
        </details>
      )}

      <details className="card acc" style={{ marginBottom: 14 }} open={proveedores.length === 0}>
        <summary><span className="acc-title"><b>Nuevo proveedor</b><span className="muted">oro, piezas, cajas, servicios…</span></span></summary>
        <form action={crearProveedor} className="form-grid" style={{ padding: "0 16px 16px" }}>
          <label>Nombre<input name="nombre" required placeholder="Ej. Dinasti" /></label>
          <label>Contacto<input name="contacto" placeholder="Persona" /></label>
          <label>Teléfono<input name="telefono" placeholder="55 ..." /></label>
          <label>Notas<input name="notas" placeholder="Qué le compras, condiciones de crédito..." /></label>
          <div style={{ gridColumn: "1 / -1" }}><button className="btn" type="submit">Crear proveedor</button></div>
        </form>
      </details>

      <p className="muted">
        Las compras y pagos a proveedores no se restan en el reporte mensual, porque el costo de la mercancía ya entra ahí como gramaje × precio del oro (y costo de piedra o pieza); restarlos otra vez lo contaría doble. Aquí sirven para saber cuánto debes, a quién y cuándo vence. Los pagos liquidan primero las compras más antiguas.
      </p>
    </>
  );
}

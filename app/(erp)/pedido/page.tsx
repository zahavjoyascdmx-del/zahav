import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { addDays, dec1, fechaCorta, mxn, num, pct, todayCdmx } from "@/lib/format";
import { calcularFila, listaMeses, recalcularIndicadores, sugerirPedido, type FilaCalculada, type FilaReporte, type VarianteVenta } from "@/lib/reporte";

export const dynamic = "force-dynamic";
const RANGOS = [60, 90, 180];
const COBERTURAS = [45, 60, 90, 120];

type MesResumen = { mes: string; neto_recibido: number };

export default async function PedidoPage({ searchParams }: { searchParams: Promise<{ dias?: string; presupuesto?: string; cob?: string }> }) {
  const { dias: diasParam, presupuesto: presuParam, cob: cobParam } = await searchParams;
  const dias = RANGOS.includes(Number(diasParam)) ? Number(diasParam) : 90;
  const hoy = todayCdmx();
  const desde = addDays(hoy, -(dias - 1));
  const meses = listaMeses(hoy, Math.ceil(dias / 30) + 1);
  const supabase = await createClient();
  const [reps, vars, cfg, porMes] = await Promise.all([
    Promise.all(meses.map((m) => supabase.rpc("reporte_mensual", { p_mes: m.mes }))),
    supabase.rpc("ventas_variantes_todas", { p_desde: desde, p_hasta: hoy }),
    supabase.from("settings").select("key,value").in("key", ["presupuesto", "lead_time_days", "buffer_days", "gastos_fijos"]),
    supabase.rpc("ventas_por_mes", { p_meses: 4 }),
  ]);
  for (const r of reps) if (r.error) throw new Error(r.error.message);
  if (vars.error) throw new Error(vars.error.message);

  const setting = (k: string) => (cfg.data ?? []).find((r) => r.key === k)?.value;
  const presuCfg = (setting("presupuesto") ?? {}) as { pct_recibido?: number; fijo?: number };
  const leadTime = Number(setting("lead_time_days") ?? 30) || 30;
  const buffer = Number(setting("buffer_days") ?? 30) || 30;
  const fijos = (setting("gastos_fijos") ?? {}) as Record<string, number>;
  const totalFijos = Object.values(fijos).reduce((a, v) => a + (Number(v) || 0), 0);

  // Lo que te depositan al mes: promedio de los últimos 3 meses completos
  const mesActual = hoy.slice(0, 7) + "-01";
  const completos = ((porMes.data ?? []) as MesResumen[]).filter((m) => m.mes !== mesActual).slice(0, 3);
  const recibidoProm = completos.length ? completos.reduce((a, m) => a + Number(m.neto_recibido), 0) / completos.length : 0;
  const pctPresu = Number(presuCfg.pct_recibido ?? 60) || 60;
  const presupuestoAuto = Number(presuCfg.fijo) > 0 ? Number(presuCfg.fijo) : Math.round((recibidoProm * pctPresu) / 100);
  const presupuesto = Number(presuParam) > 0 ? Number(presuParam) : presupuestoAuto;

  // Fila por producto: costo y stock del mes actual, ventas y utilidad acumuladas del periodo (cada mes con su precio de oro)
  const base = new Map<number, FilaCalculada>();
  for (const r of (reps[0].data ?? []) as FilaReporte[]) {
    const f = calcularFila(r, meses[0].mes);
    base.set(f.product_id, { ...f, piezas: 0, venta: 0, comision: 0, envio: 0, ret_iva: 0, ret_isr: 0, cupon: 0, recibido: 0, gastos: 0, insumos: 0, utilidad_bruta: 0, utilidad_neta: 0, dias_con_venta: 0 });
  }
  reps.forEach((rep, i) => {
    for (const r of (rep.data ?? []) as FilaReporte[]) {
      const f = calcularFila(r, meses[i].mes);
      const b = base.get(f.product_id);
      if (!b) continue;
      // el periodo empieza en `desde`: el mes más viejo entra solo en la parte proporcional
      const inicioMes = meses[i].mes;
      const finMes = i === 0 ? hoy : addDays(meses[i - 1].mes, -1);
      const diasMes = Math.max(1, Math.round((Date.parse(finMes) - Date.parse(inicioMes)) / 86400000) + 1);
      const diasDentro = Math.max(0, Math.round((Date.parse(finMes) - Date.parse(inicioMes < desde ? desde : inicioMes)) / 86400000) + 1);
      const k = Math.min(1, diasDentro / diasMes);
      if (k <= 0) continue;
      b.piezas += f.piezas * k; b.venta = Number(b.venta) + Number(f.venta) * k; b.recibido += f.recibido * k;
      b.gastos += f.gastos * k; b.insumos += f.insumos * k; b.utilidad_bruta += f.utilidad_bruta * k; b.utilidad_neta += f.utilidad_neta * k;
      b.dias_con_venta = Number(b.dias_con_venta) + Number(f.dias_con_venta) * k;
    }
  });
  const filas = [...base.values()].filter((f) => f.activo || f.piezas > 0).map(recalcularIndicadores);
  const variantes = (vars.data ?? []) as VarianteVenta[];
  const coberturaCfg = leadTime + buffer;
  const cobertura = COBERTURAS.includes(Number(cobParam)) ? Number(cobParam) : coberturaCfg;
  const q = (extra: Record<string, string | number>) => {
    const sp = new URLSearchParams({ dias: String(dias), ...(Number(presuParam) > 0 ? { presupuesto: String(presuParam) } : {}), ...(cobertura !== coberturaCfg ? { cob: String(cobertura) } : {}) });
    for (const [k, v] of Object.entries(extra)) sp.set(k, String(v));
    return `/pedido?${sp.toString()}`;
  };
  const res = sugerirPedido(filas, variantes, { dias, hoy, cobertura, presupuesto });

  const perdiendo = res.productos.concat(res.excluidos).filter((x) => x.demanda_bloqueada > 0.15 && x.utilidad_pieza > 0).sort((a, b) => b.ritmo * b.demanda_bloqueada * b.utilidad_pieza - a.ritmo * a.demanda_bloqueada * a.utilidad_pieza).slice(0, 8);
  const utilidadDiariaPerdida = perdiendo.reduce((a, x) => a + x.ritmo * x.demanda_bloqueada * x.utilidad_pieza, 0);
  const haySnapshots = variantes.some((v) => v.dias_snapshot >= 14);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Qué pedir</h1>
          <div className="muted">Dónde vale la pena invertir: utilidad real por pieza × ritmo de venta, corrigiendo las tallas que estuvieron agotadas. Del {fechaCorta(desde)} al {fechaCorta(hoy)}.</div>
        </div>
        <div className="chips">
          {RANGOS.map((d) => <Link key={d} href={q({ dias: d })} className={`chip ${d === dias ? "active" : ""}`}>{d} días</Link>)}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="kpi-row">
          <div className="kpi"><div className="label">Te depositan al mes</div><div className="value">{mxn(recibidoProm)}</div><div className="sub">promedio {completos.length} meses completos</div></div>
          <div className="kpi"><div className="label">Presupuesto de compra</div><div className="value">{mxn(presupuesto)}</div><div className="sub">{Number(presuParam) > 0 ? "monto que escribiste" : Number(presuCfg.fijo) > 0 ? "monto fijo en Configuración" : `${pctPresu}% de lo depositado`}{totalFijos > 0 ? ` · gastos fijos ${mxn(totalFijos)}` : ""}</div></div>
          <div className="kpi"><div className="label">Pedido sugerido</div><div className="value">{mxn(res.total)}</div><div className="sub">{num(res.productos.reduce((a, x) => a + x.sugerido, 0))} piezas en {res.productos.length} productos</div></div>
          <div className="kpi"><div className="label">Utilidad esperada</div><div className="value">{mxn(res.utilidad)}</div><div className="sub">al vender ese pedido, con la utilidad neta real del periodo</div></div>
          <div className="kpi"><div className="label">Cobertura objetivo</div><div className="value">{cobertura} días</div><div className="sub">{cobertura === coberturaCfg ? `${leadTime} de entrega + ${buffer} de colchón` : "prueba; la configurada es " + coberturaCfg}</div></div>
        </div>
        {presupuesto - res.total > 1000 && (
          <p className="notice" style={{ marginTop: 12, background: "var(--calm-bg)", color: "var(--calm)" }}>
            Con la cobertura de {cobertura} días te sobran {mxn(presupuesto - res.total)} del presupuesto: tienes stock suficiente en la mayoría de los productos. Puedes guardarlos o ver qué pedirías con más cobertura:
            {" "}{COBERTURAS.filter((c) => c !== cobertura).map((c) => <Link key={c} href={q({ cob: c })} className="chip" style={{ marginLeft: 6 }}>{c} días</Link>)}
          </p>
        )}
        <form method="get" className="inline" style={{ marginTop: 12 }}>
          <input type="hidden" name="dias" value={dias} />
          {cobertura !== coberturaCfg && <input type="hidden" name="cob" value={cobertura} />}
          <span className="muted">Probar con otro presupuesto:</span>
          <input name="presupuesto" type="number" step="1000" min="0" placeholder={String(presupuestoAuto)} defaultValue={Number(presuParam) > 0 ? presuParam : ""} />
          <button className="btn small secondary" type="submit">Recalcular</button>
          <span className="muted">· el porcentaje y los días se cambian en <Link href="/config">Configuración</Link></span>
        </form>
      </div>

      {perdiendo.length > 0 && (
        <div className="card pendiente" style={{ marginBottom: 14 }}>
          <h2>Ventas que estás perdiendo por tallas agotadas <span className="muted">· aprox. {mxn(utilidadDiariaPerdida * 30)} de utilidad al mes</span></h2>
          <div className="tbl-wrap">
            <table className="compact">
              <thead><tr><th>Producto</th><th className="num">Demanda en tallas agotadas</th><th className="num">Tallas agotadas</th><th className="num">Vende/día (real)</th><th className="num">Vendería/día</th><th className="num">Utilidad/pza</th><th className="num">Utilidad perdida/mes</th></tr></thead>
              <tbody>
                {perdiendo.map((x) => (
                  <tr key={x.fila.product_id}>
                    <td><Link href={`/ventas/${x.fila.product_id}`}>{x.fila.producto}</Link></td>
                    <td className="num">{pct(x.demanda_bloqueada)}</td>
                    <td className="num">{num(x.variantes.filter((v) => v.agotada).length)} de {num(x.variantes.filter((v) => v.en_full && v.activa).length)}</td>
                    <td className="num">{dec1(x.ritmo_obs)}</td>
                    <td className="num">{dec1(x.ritmo)}</td>
                    <td className="num">{mxn(x.utilidad_pieza)}</td>
                    <td className="num"><b>{mxn(x.ritmo * x.demanda_bloqueada * x.utilidad_pieza * 30)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card tight" style={{ marginBottom: 14 }}>
        <h2>Pedido sugerido <span className="muted">· ordenado por utilidad diaria en juego; abre cada producto para ver tallas</span></h2>
        {res.productos.length === 0 && <p className="muted" style={{ padding: "0 18px 16px" }}>Con este presupuesto no alcanza para reponer nada, o no hay faltantes. Prueba con otro monto arriba.</p>}
        {res.productos.map((x) => <FilaPedido key={x.fila.product_id} x={x} dias={dias} />)}
      </div>

      <details className="card tight acc">
        <summary><span className="acc-title"><b>Lo que no entra este mes</b><span className="muted">{res.excluidos.length} productos: stock suficiente, sin ventas, sin margen o sin presupuesto</span></span></summary>
        <div className="tbl-wrap">
          <table className="compact">
            <thead><tr><th>Producto</th><th className="num">Vendidas</th><th className="num">Vende/día</th><th className="num">Utilidad/pza</th><th className="num">% ganancia</th><th className="num">Stock total</th><th className="num">Alcanza</th><th>Motivo</th></tr></thead>
            <tbody>
              {res.excluidos.map((x) => (
                <tr key={x.fila.product_id} className={x.fila.piezas === 0 ? "dim" : ""}>
                  <td><Link href={`/ventas/${x.fila.product_id}`}>{x.fila.producto}</Link></td>
                  <td className="num">{num(Math.round(x.fila.piezas))}</td>
                  <td className="num">{dec1(x.ritmo)}</td>
                  <td className={`num ${x.utilidad_pieza < 0 ? "zero" : ""}`}>{mxn(x.utilidad_pieza)}</td>
                  <td className={`num ${x.fila.roi != null && x.fila.roi < 0 ? "zero" : ""}`}>{x.fila.roi != null ? `${dec1(x.fila.roi * 100)}%` : "—"}</td>
                  <td className="num">{num(x.fila.stock_total)}</td>
                  <td className="num">{x.cobertura_dias != null ? `${num(Math.round(x.cobertura_dias))} días` : "—"}</td>
                  <td className="muted">{x.motivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <p className="muted" style={{ marginTop: 14 }}>
        Cómo se corrige el ritmo: {haySnapshots
          ? "con la foto diaria de stock en Full se cuentan los días que cada talla estuvo en cero y se calcula piezas ÷ días con stock."
          : "la foto diaria de stock en Full empezó a guardarse hoy; mientras no haya 14 días de historia, una talla que hoy está en cero se considera agotada desde su última venta (piezas ÷ días con stock, máximo 3×). Cada semana la estimación será más exacta."}
        {" "}La utilidad por pieza es la real del periodo (recibido − oro − piedra − insumos). El presupuesto se reparte primero a lo que más utilidad diaria deja y está por agotarse.
      </p>
    </>
  );
}

function FilaPedido({ x, dias }: { x: ReturnType<typeof sugerirPedido>["productos"][number]; dias: number }) {
  const f = x.fila;
  return (
    <details className="acc" style={{ margin: 0, borderTop: "1px solid var(--line)" }}>
      <summary>
        <span className="acc-title">
          <b>{f.producto}</b>
          <span className="muted">
            vende {dec1(x.ritmo_obs)}/día{x.ritmo > x.ritmo_obs * 1.05 ? ` (${dec1(x.ritmo)} con todas las tallas)` : ""} · utilidad {mxn(x.utilidad_pieza)}/pza · {f.roi != null ? `${dec1(f.roi * 100)}% sobre costo` : ""}
            {x.cobertura_dias != null ? ` · stock actual alcanza ${num(Math.round(x.cobertura_dias))} días` : ""}
            {x.demanda_bloqueada > 0 ? ` · ${pct(x.demanda_bloqueada)} de la demanda en tallas agotadas` : ""}
          </span>
        </span>
        <span className="acc-nums">
          <span><b>{num(x.sugerido)}</b><small>piezas</small></span>
          <span><b>{mxn(x.costo_pedido)}</b><small>a {mxn(f.costo_unitario)} c/u</small></span>
          <span><b>{mxn(x.utilidad_esperada)}</b><small>utilidad esperada</small></span>
        </span>
      </summary>
      <div className="tbl-wrap">
        <table className="compact">
          <thead><tr><th>Color</th><th>Talla</th><th className="num">Vendidas {dias}d</th><th className="num">Días sin stock</th><th className="num">Vende/día</th><th className="num">En Full</th><th className="num">Tránsito</th><th className="num">Objetivo</th><th className="num">Pedir</th></tr></thead>
          <tbody>
            {x.variantes.filter((v) => v.piezas > 0 || v.sugerido > 0 || v.agotada).map((v) => (
              <tr key={`${v.variant_id}-${v.color}-${v.talla}`} className={v.sugerido > 0 ? "" : "dim"}>
                <td>{v.color || "—"}</td>
                <td>{v.talla || "—"}</td>
                <td className="num">{num(v.piezas)}</td>
                <td className="num">{v.dias_sin_stock > 0 ? `~${num(v.dias_sin_stock)}` : "0"}</td>
                <td className="num">{dec1(v.ritmo)}</td>
                <td className={`num ${v.agotada ? "zero" : ""}`}>{v.en_full ? num(v.available ?? 0) : "—"}</td>
                <td className="num">{v.en_full ? num(v.in_transit ?? 0) : "—"}</td>
                <td className="num">{num(v.objetivo)}</td>
                <td className="num"><b>{v.sugerido > 0 ? num(v.sugerido) : ""}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
        {(f.stock_casa > 0 || f.stock_amazon > 0) && <p className="muted" style={{ padding: "8px 18px" }}>Ya cuentas con {num(f.stock_casa)} en casa y {num(f.stock_amazon)} en Amazon; están descontados del pedido. Reparte primero esas a las tallas agotadas.</p>}
      </div>
    </details>
  );
}

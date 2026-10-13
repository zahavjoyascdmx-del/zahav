import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { mxn, num, todayCdmx } from "@/lib/format";
import { listaMeses, mesAnterior, mesSiguiente, nombreMes } from "@/lib/reporte";

export const dynamic = "force-dynamic";

type Utilidad = {
  mes: string; recibido: number; piezas: number; material: number; insumos: number; publicidad: number; publicidad_sin_producto: number; otros_cargos: number;
  gastos_fijos: Record<string, number>; gastos_fijos_total: number; gastos_mes: number;
  directas: { n: number; con_costo: number; sin_costo: number; utilidad: number; venta: number };
  utilidad_neta: number; utilidad_final: number;
  productos_sin_costo: { producto: string; piezas: number; recibido: number }[];
  precios_oro: { proveedor: string; kilates: string; precio: number; mes_precio: string; capturado_este_mes: boolean }[];
};
type Ventas = { ordenes: number; piezas: number; venta: number; neto_recibido: number; canceladas: number; devueltas: number; devueltas_monto: number; en_disputa: number; disputa_monto: number; reventa_ordenes: number };
type Corte = { fecha: string | null; full_piezas: number | null; full_valor: number | null; transito_piezas: number | null; transito_valor: number | null; bodega_piezas: number; bodega_valor: number; amazon_piezas: number; amazon_valor: number; total: number };
type Inventario = {
  inicio: Corte; fin: Corte; vendidas_piezas: number; material_vendido: number; entradas_full_piezas: number;
  colectas: { piezas_detectadas: number; no_descontadas: number; dias: number }; inbounds: { n: number; declaradas: number; descontadas: number };
  mercancia_entrada_costo: number; por_liberar: number; pagos_por_liberar: number; deuda: number; capital: number;
};
type Cierre = { mes: string; utilidad: Utilidad; utilidad_anterior: Utilidad; ventas: Ventas; ventas_anterior: Ventas; inventario: Inventario };

const fechaTxt = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "sin foto");
const delta = (a: number, b: number) => {
  const d = Number(a) - Number(b);
  if (!Number(b)) return "";
  return `${d >= 0 ? "+" : ""}${mxn(d)} vs mes anterior`;
};

export default async function CierreMesPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { mes: mesParam } = await searchParams;
  const meses = listaMeses(todayCdmx(), 13);
  const mes = meses.some((m) => m.mes === mesParam) ? (mesParam as string) : meses[0].mes;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cierre_mes", { p_mes: mes });
  if (error) throw new Error(error.message);
  const c = data as Cierre;
  const u = c.utilidad, ua = c.utilidad_anterior, v = c.ventas, va = c.ventas_anterior, inv = c.inventario;
  const cancelPct = v.ordenes + v.canceladas > 0 ? (Number(v.canceladas) / (Number(v.ordenes) + Number(v.canceladas))) * 100 : 0;
  const oroFaltante = u.precios_oro.filter((p) => !p.capturado_este_mes);
  const oroRaro = u.precios_oro.filter((p) => Number(p.precio) < 1000);
  const alertas: string[] = [];
  if (oroFaltante.length) alertas.push(`Precio del oro sin capturar este mes para ${oroFaltante.map((p) => `${p.proveedor} ${p.kilates}`).join(", ")}: se usó el del mes anterior.`);
  if (oroRaro.length) alertas.push(`Precio del oro sospechoso (menos de 1,000 por gramo): ${oroRaro.map((p) => `${p.proveedor} ${p.kilates} = ${num(p.precio)}`).join(", ")}.`);
  if (u.productos_sin_costo.length) alertas.push(`${u.productos_sin_costo.length} productos vendidos sin costo en Catálogo (entran como utilidad completa): ${u.productos_sin_costo.map((p) => p.producto).join(", ")}.`);
  if (Number(v.en_disputa) > 0) alertas.push(`${num(v.en_disputa)} ventas en disputa por ${mxn(v.disputa_monto)}: están contadas como cobradas y pueden perderse.`);
  if (cancelPct > 15) alertas.push(`Cancelaciones y devoluciones altas: ${cancelPct.toFixed(0)}% de las órdenes del mes.`);
  if (Number(inv.colectas.no_descontadas) > 0) alertas.push(`${num(inv.colectas.no_descontadas)} piezas enviadas a Full en el mes sin descontar de bodega: sube los CSV de esas colectas en Bodega → Envíos a Full.`);
  if (u.directas.sin_costo > 0) alertas.push(`${u.directas.sin_costo} ventas directas sin costo capturado: no suman utilidad hasta que les pongas costo.`);
  if (!Number(u.gastos_mes)) alertas.push("No hay gastos del mes capturados (sueldos, renta, envíos, etc.): la utilidad final es antes de esos gastos.");

  return (
    <>
      <div className="page-head">
        <div>
          <div className="muted"><Link href="/reporte">← Reporte mensual</Link></div>
          <h1>Cierre de mes · {nombreMes(mes)}</h1>
          <div className="muted">Utilidad del mes, cuadre del inventario contra las ventas y capital al cierre. Es lo mismo que revisa la rutina de fin de mes.</div>
        </div>
      </div>
      <div className="chips" style={{ marginBottom: 12 }}>
        <Link href={`/reporte/cierre?mes=${mesAnterior(mes)}`} className="chip">← {nombreMes(mesAnterior(mes))}</Link>
        {mes !== meses[0].mes && <Link href={`/reporte/cierre?mes=${mesSiguiente(mes)}`} className="chip">{nombreMes(mesSiguiente(mes))} →</Link>}
      </div>

      <div className="grid kpis">
        <div className="kpi"><div className="label">Utilidad final</div><div className={`value ${Number(u.utilidad_final) < 0 ? "zero" : ""}`}>{mxn(u.utilidad_final)}</div><div className="sub">{delta(u.utilidad_final, ua.utilidad_final)}</div></div>
        <div className="kpi"><div className="label">Te depositaron</div><div className="value">{mxn(v.neto_recibido)}</div><div className="sub">{num(v.ordenes)} órdenes · {num(v.piezas)} piezas · {num(v.reventa_ordenes)} en reventa · {delta(v.neto_recibido, va.neto_recibido)}</div></div>
        <div className="kpi"><div className="label">Inventario a costo</div><div className="value">{mxn(inv.fin.total)}</div><div className="sub">{inv.inicio.total ? delta(inv.fin.total, inv.inicio.total) : "sin foto del mes anterior"}</div></div>
        <div className="kpi"><div className="label">Capital</div><div className="value">{mxn(inv.capital)}</div><div className="sub">inventario + {mxn(inv.por_liberar)} por liberar en Mercado Pago − deuda {mxn(inv.deuda)} · falta sumar banco y saldo de Mercado Pago</div></div>
      </div>

      {alertas.length > 0 && (
        <div className="card pendiente" style={{ marginTop: 14 }}>
          <h2>Revisar</h2>
          <ul>{alertas.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </div>
      )}

      <div className="grid grid-2" style={{ marginTop: 14 }}>
        <div className="card tight">
          <h2>Cómo sale la utilidad</h2>
          <div className="tbl-wrap">
            <table className="compact">
              <tbody>
                <tr><td>Te depositó Mercado Pago ({num(u.piezas)} piezas con producto)</td><td className="num">{mxn(u.recibido)}</td></tr>
                <tr><td>Material (gramaje × oro del mes + piedra o pieza)</td><td className="num">−{mxn(u.material)}</td></tr>
                <tr><td>Insumos</td><td className="num">−{mxn(u.insumos)}</td></tr>
                <tr><td>Publicidad Product Ads (sin IVA)</td><td className="num">−{mxn(u.publicidad)}</td></tr>
                <tr className="total"><td>Utilidad neta por producto</td><td className="num">{mxn(u.utilidad_neta)}</td></tr>
                <tr><td>Otros cargos de Mercado Libre</td><td className="num">−{mxn(u.otros_cargos)}</td></tr>
                <tr><td>Gastos fijos ({Object.entries(u.gastos_fijos).filter(([, x]) => Number(x) > 0).map(([k, x]) => `${k} ${mxn(x)}`).join(", ") || "ninguno"})</td><td className="num">−{mxn(u.gastos_fijos_total)}</td></tr>
                <tr><td>Gastos del mes capturados</td><td className="num">−{mxn(u.gastos_mes)}</td></tr>
                <tr><td>Ventas directas con costo ({num(u.directas.con_costo)} de {num(u.directas.n)})</td><td className="num">+{mxn(u.directas.utilidad)}</td></tr>
                <tr className="total"><td>Utilidad final</td><td className="num">{mxn(u.utilidad_final)}</td></tr>
                <tr className="dim"><td>Mes anterior</td><td className="num">{mxn(ua.utilidad_final)}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="muted">Precio del oro usado: {u.precios_oro.map((p) => `${p.proveedor} ${p.kilates} ${num(p.precio)}${p.capturado_este_mes ? "" : " (mes anterior)"}`).join(" · ") || "sin ventas de oro"}.</p>
        </div>

        <div className="card tight">
          <h2>Ventas y devoluciones</h2>
          <div className="tbl-wrap">
            <table className="compact">
              <thead><tr><th></th><th className="num">{nombreMes(mes)}</th><th className="num">Mes anterior</th></tr></thead>
              <tbody>
                <tr><td>Órdenes pagadas</td><td className="num">{num(v.ordenes)}</td><td className="num">{num(va.ordenes)}</td></tr>
                <tr><td>Piezas</td><td className="num">{num(v.piezas)}</td><td className="num">{num(va.piezas)}</td></tr>
                <tr><td>Venta</td><td className="num">{mxn(v.venta)}</td><td className="num">{mxn(va.venta)}</td></tr>
                <tr><td>Te depositaron</td><td className="num">{mxn(v.neto_recibido)}</td><td className="num">{mxn(va.neto_recibido)}</td></tr>
                <tr><td>En reventa</td><td className="num">{num(v.reventa_ordenes)}</td><td className="num">{num(va.reventa_ordenes)}</td></tr>
                <tr><td>Canceladas y devueltas</td><td className="num">{num(v.canceladas)} ({cancelPct.toFixed(0)}%)</td><td className="num">{num(va.canceladas)}</td></tr>
                <tr><td>Devueltas después de pagar</td><td className="num">{num(v.devueltas)} · {mxn(v.devueltas_monto)}</td><td className="num">{num(va.devueltas)}</td></tr>
                <tr><td>En disputa</td><td className="num">{num(v.en_disputa)} · {mxn(v.disputa_monto)}</td><td className="num">{num(va.en_disputa)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card tight" style={{ marginTop: 14 }}>
        <h2>Inventario a costo del mes <span className="muted">· valuado al precio del oro de {nombreMes(mes)}</span></h2>
        <div className="tbl-wrap">
          <table className="compact">
            <thead><tr><th></th><th className="num">Inicio ({fechaTxt(inv.inicio.fecha)})</th><th className="num">Fin ({fechaTxt(inv.fin.fecha)})</th><th className="num">Cambio</th></tr></thead>
            <tbody>
              <tr><td>Full</td><td className="num">{inv.inicio.full_valor != null ? `${mxn(inv.inicio.full_valor)} · ${num(inv.inicio.full_piezas ?? 0)} pz` : "—"}</td><td className="num">{inv.fin.full_valor != null ? `${mxn(inv.fin.full_valor)} · ${num(inv.fin.full_piezas ?? 0)} pz` : "—"}</td><td className="num">{inv.inicio.full_valor != null && inv.fin.full_valor != null ? mxn(Number(inv.fin.full_valor) - Number(inv.inicio.full_valor)) : "—"}</td></tr>
              <tr><td>En tránsito a Full</td><td className="num">{mxn(inv.inicio.transito_valor ?? 0)}</td><td className="num">{mxn(inv.fin.transito_valor ?? 0)}</td><td className="num">{mxn(Number(inv.fin.transito_valor ?? 0) - Number(inv.inicio.transito_valor ?? 0))}</td></tr>
              <tr><td>Bodega (casa)</td><td className="num">{mxn(inv.inicio.bodega_valor)} · {num(inv.inicio.bodega_piezas)} pz</td><td className="num">{mxn(inv.fin.bodega_valor)} · {num(inv.fin.bodega_piezas)} pz</td><td className="num">{mxn(Number(inv.fin.bodega_valor) - Number(inv.inicio.bodega_valor))}</td></tr>
              <tr><td>Amazon</td><td className="num">{mxn(inv.inicio.amazon_valor)}</td><td className="num">{mxn(inv.fin.amazon_valor)}</td><td className="num">—</td></tr>
              <tr className="total"><td>Total</td><td className="num">{mxn(inv.inicio.total)}</td><td className="num">{mxn(inv.fin.total)}</td><td className="num">{mxn(Number(inv.fin.total) - Number(inv.inicio.total))}</td></tr>
            </tbody>
          </table>
        </div>
        <ul className="muted" style={{ marginTop: 10 }}>
          <li>Se vendieron {num(inv.vendidas_piezas)} piezas, {mxn(inv.material_vendido)} a costo. Con el cambio del inventario, entraron aprox. <b>{mxn(inv.mercancia_entrada_costo)}</b> de mercancía a costo (compras + devoluciones que regresaron). Compáralo con lo que pagaste a proveedores.</li>
          <li>Full en piezas: entraron {num(inv.entradas_full_piezas)} (colectas detectadas {num(inv.colectas.piezas_detectadas)} en {num(inv.colectas.dias)} días, {num(inv.inbounds.declaradas)} declaradas en CSV subidos, el resto devoluciones).</li>
          <li>Bodega al inicio y al fin se reconstruye con los conteos y movimientos registrados; si una colecta no se descontó, la bodega queda inflada.</li>
        </ul>
      </div>
    </>
  );
}

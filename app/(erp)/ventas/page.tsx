import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { addDays, fechaCorta, mxn, num, todayCdmx } from "@/lib/format";

export const dynamic = "force-dynamic";

const RANGOS = [7, 30, 90, 365];

export default async function VentasPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const { dias: diasParam } = await searchParams;
  const dias = RANGOS.includes(Number(diasParam)) ? Number(diasParam) : 30;
  const hoy = todayCdmx();
  const desde = addDays(hoy, -(dias - 1));
  const supabase = await createClient();
  const [prods, porDia, resumen] = await Promise.all([
    supabase.rpc("ventas_por_producto", { p_desde: desde, p_hasta: hoy }),
    supabase.rpc("ventas_por_dia", { p_desde: desde, p_hasta: hoy }),
    supabase.rpc("ventas_resumen", { p_desde: desde, p_hasta: hoy }),
  ]);
  const r = resumen.data?.[0] ?? { ordenes: 0, piezas: 0, venta: 0, comision: 0, envio: 0, canceladas: 0, ret_iva: 0, ret_isr: 0, neto_recibido: 0, con_pago: 0 };
  const totalVenta = Number(r.venta) || 1;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ventas</h1>
          <div className="muted">Solo órdenes pagadas · del {fechaCorta(desde)} al {fechaCorta(hoy)}</div>
        </div>
        <div className="chips">
          {RANGOS.map((d) => (
            <Link key={d} href={`/ventas?dias=${d}`} className={`chip ${d === dias ? "active" : ""}`}>{d === 365 ? "1 año" : `${d} días`}</Link>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="kpi-row">
          <div className="kpi"><div className="label">Venta</div><div className="value">{mxn(r.venta)}</div></div>
          <div className="kpi"><div className="label">Piezas</div><div className="value">{num(r.piezas)}</div></div>
          <div className="kpi"><div className="label">Órdenes</div><div className="value">{num(r.ordenes)}</div></div>
          <div className="kpi"><div className="label">Comisión ML</div><div className="value">{mxn(r.comision)}</div></div>
          <div className="kpi"><div className="label">Envíos</div><div className="value">{mxn(r.envio)}</div></div>
          <div className="kpi"><div className="label">Retención IVA</div><div className="value">{mxn(r.ret_iva)}</div></div>
          <div className="kpi"><div className="label">Retención ISR</div><div className="value">{mxn(r.ret_isr)}</div></div>
          <div className="kpi"><div className="label">Te depositaron</div><div className="value">{mxn(r.neto_recibido)}</div><div className="sub">{num(r.con_pago)} de {num(r.ordenes)} órdenes con pago</div></div>
          <div className="kpi"><div className="label">Canceladas</div><div className="value">{num(r.canceladas)}</div></div>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginTop: 14 }}>
        <div className="card tight">
          <h2>Por producto</h2>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Producto</th><th className="num">Piezas</th><th className="num">Venta</th><th className="num">% del total</th></tr></thead>
              <tbody>
                {((prods.data ?? []) as { product_id: number | null; producto: string; piezas: number; venta: number }[]).map((p) => (
                  <tr key={p.producto}>
                    <td>{p.product_id ? <Link href={`/ventas/${p.product_id}?dias=${dias}`}>{p.producto}</Link> : p.producto}</td>
                    <td className="num">{num(p.piezas)}</td>
                    <td className="num">{mxn(p.venta)}</td>
                    <td className="num">{((Number(p.venta) / totalVenta) * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card tight">
          <h2>Por día</h2>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Día</th><th className="num">Órdenes</th><th className="num">Piezas</th><th className="num">Venta</th><th className="num">Comisión</th><th className="num">IVA</th><th className="num">ISR</th><th className="num">Depositado</th></tr></thead>
              <tbody>
                {((porDia.data ?? []) as { fecha: string; ordenes: number; piezas: number; venta: number; comision: number; ret_iva: number; ret_isr: number; neto_recibido: number }[]).slice().reverse().map((d) => (
                  <tr key={d.fecha}>
                    <td>{fechaCorta(d.fecha)}</td>
                    <td className="num">{num(d.ordenes)}</td>
                    <td className="num">{num(d.piezas)}</td>
                    <td className="num">{mxn(d.venta)}</td>
                    <td className="num">{mxn(d.comision)}</td>
                    <td className="num">{mxn(d.ret_iva)}</td>
                    <td className="num">{mxn(d.ret_isr)}</td>
                    <td className="num">{mxn(d.neto_recibido)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Kpi } from "@/components/Kpi";
import { addDays, fechaCorta, fechaHora, mxn, num, todayCdmx } from "@/lib/format";

export const dynamic = "force-dynamic";

type Resumen = { ordenes: number; piezas: number; venta: number; comision: number; envio: number; canceladas: number; ret_iva: number; ret_isr: number; cupon: number; neto_recibido: number; con_pago: number };

export default async function Home() {
  const supabase = await createClient();
  const hoy = todayCdmx();
  const rangos = [
    { label: "Hoy", desde: hoy, hasta: hoy },
    { label: "Últimos 7 días", desde: addDays(hoy, -6), hasta: hoy },
    { label: "Últimos 30 días", desde: addDays(hoy, -29), hasta: hoy },
    { label: "Mes actual", desde: hoy.slice(0, 8) + "01", hasta: hoy },
  ];
  const [res, dias, prods, sync, stock] = await Promise.all([
    Promise.all(rangos.map((r) => supabase.rpc("ventas_resumen", { p_desde: r.desde, p_hasta: r.hasta }))),
    supabase.rpc("ventas_por_dia", { p_desde: addDays(hoy, -13), p_hasta: hoy }),
    supabase.rpc("ventas_por_producto", { p_desde: addDays(hoy, -29), p_hasta: hoy }),
    supabase.from("sync_runs").select("*").order("id", { ascending: false }).limit(1).maybeSingle(),
    supabase.rpc("stock_full_actual"),
  ]);

  const resumenes = res.map((r) => (r.data?.[0] ?? { ordenes: 0, piezas: 0, venta: 0, comision: 0, envio: 0, canceladas: 0, ret_iva: 0, ret_isr: 0, cupon: 0, neto_recibido: 0, con_pago: 0 }) as Resumen);
  const stockRows = (stock.data ?? []) as { available: number; item_status: string; producto: string | null }[];
  const agotadas = stockRows.filter((s) => s.available === 0 && s.item_status === "active").length;
  const maxVenta = Math.max(1, ...((dias.data ?? []) as { venta: number }[]).map((d) => Number(d.venta)));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Resumen</h1>
          <div className="muted">
            Datos reales de Mercado Libre · última sincronización {sync.data ? fechaHora(sync.data.finished_at ?? sync.data.started_at) : "pendiente"}
          </div>
        </div>
      </div>

      <div className="grid grid-4">
        {rangos.map((r, i) => {
          const s = resumenes[i];
          return (
            <Kpi
              key={r.label}
              label={r.label}
              value={mxn(s.venta)}
              sub={`${num(s.piezas)} piezas · ${num(s.ordenes)} órdenes · te depositaron ${mxn(s.neto_recibido)}`}
            />
          );
        })}
      </div>

      <div className="grid grid-2" style={{ marginTop: 14 }}>
        <div className="card tight">
          <h2>Ventas por día · últimos 14 días</h2>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Día</th><th className="num">Órdenes</th><th className="num">Piezas</th><th className="num">Venta</th><th style={{ width: "30%" }}></th></tr></thead>
              <tbody>
                {((dias.data ?? []) as { fecha: string; ordenes: number; piezas: number; venta: number }[]).map((d) => (
                  <tr key={d.fecha}>
                    <td>{fechaCorta(d.fecha)}</td>
                    <td className="num">{num(d.ordenes)}</td>
                    <td className="num">{num(d.piezas)}</td>
                    <td className="num">{mxn(d.venta)}</td>
                    <td><div className="bar"><span style={{ width: `${(Number(d.venta) / maxVenta) * 100}%` }} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card tight">
          <h2>Lo que más vende · últimos 30 días</h2>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Producto</th><th className="num">Piezas</th><th className="num">Venta</th><th className="num">Comisión</th></tr></thead>
              <tbody>
                {((prods.data ?? []) as { product_id: number | null; producto: string; piezas: number; venta: number; comision: number }[]).slice(0, 12).map((p) => (
                  <tr key={p.producto}>
                    <td>{p.product_id ? <Link href={`/ventas/${p.product_id}`}>{p.producto}</Link> : p.producto}</td>
                    <td className="num">{num(p.piezas)}</td>
                    <td className="num">{mxn(p.venta)}</td>
                    <td className="num">{mxn(p.comision)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h2>Últimos 30 días · de la venta a tu cuenta <span className="muted">(cargos reales de Mercado Pago · {num(resumenes[2].con_pago)} de {num(resumenes[2].ordenes)} órdenes ya con cargos; las de hoy los reciben horas después)</span></h2>
        <div className="kpi-row">
          <div className="kpi"><div className="label">Venta</div><div className="value">{mxn(resumenes[2].venta)}</div></div>
          <div className="kpi"><div className="label">Comisión ML</div><div className="value">{mxn(resumenes[2].comision)}</div></div>
          <div className="kpi"><div className="label">Envíos a tu cargo</div><div className="value">{mxn(resumenes[2].envio)}</div></div>
          <div className="kpi"><div className="label">Retención IVA</div><div className="value">{mxn(resumenes[2].ret_iva)}</div></div>
          <div className="kpi"><div className="label">Retención ISR</div><div className="value">{mxn(resumenes[2].ret_isr)}</div></div>
          <div className="kpi"><div className="label">Cupones a tu cargo</div><div className="value">{mxn(resumenes[2].cupon)}</div></div>
          <div className="kpi"><div className="label">Te depositaron</div><div className="value">{mxn(resumenes[2].neto_recibido)}</div></div>
        </div>
      </div>
      <div className="grid grid-2" style={{ marginTop: 14 }}>
        <Kpi label="Tallas agotadas en Full" value={num(agotadas)} sub="variantes activas con 0 disponibles" />
        <Kpi label="Canceladas · 30 días" value={num(resumenes[2].canceladas)} sub="órdenes canceladas" />
      </div>
    </>
  );
}

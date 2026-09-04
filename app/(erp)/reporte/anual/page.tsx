import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { mxn, num } from "@/lib/format";

export const dynamic = "force-dynamic";

type R = {
  mes: string; ordenes: number; piezas: number; venta: number; comision: number; envio: number; ret_iva: number; ret_isr: number; cupon: number;
  neto_recibido: number; material: number; insumos: number; sin_costo: number; utilidad: number; canceladas: number; directas_n: number; directas: number; directas_cobrado: number;
};
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const mesTxt = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

export default async function ReporteAnualPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reporte_por_mes", { p_meses: 13 });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as R[];
  const sum = (k: keyof R) => rows.slice(1).reduce((a, r) => a + Number(r[k]), 0);
  const pct = (a: number, b: number) => (Number(b) ? `${((Number(a) / Number(b)) * 100).toFixed(0)}%` : "—");
  return (
    <>
      <div className="page-head">
        <div>
          <div className="muted"><Link href="/reporte">← Reporte mensual por producto</Link></div>
          <h1>Resumen anual</h1>
          <div className="muted">Mes por mes con cargos reales de Mercado Pago. Material = gramaje × precio del oro del mes de cada proveedor + piedra o plata; insumos por pieza. Utilidad = depositado − material − insumos, antes de gastos fijos.</div>
        </div>
      </div>
      <div className="card tight">
        <div className="tbl-wrap">
          <table className="compact">
            <thead>
              <tr>
                <th>Mes</th><th className="num">Órdenes</th><th className="num">Piezas</th><th className="num">Venta</th><th className="num">Comisión</th><th className="num">Envíos</th>
                <th className="num">IVA</th><th className="num">ISR</th><th className="num">Cupones</th><th className="num">Depositado</th><th className="num">Material</th><th className="num">Insumos</th><th className="num">Utilidad</th><th className="num">Margen</th>
                <th className="num">Cancel.</th><th className="num">Directas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.mes} style={i === 0 ? { opacity: 0.7 } : undefined}>
                  <td style={{ fontWeight: 600 }}>{mesTxt(r.mes)}{i === 0 && <div className="muted">en curso</div>}</td>
                  <td className="num">{num(r.ordenes)}</td>
                  <td className="num">{num(r.piezas)}</td>
                  <td className="num">{mxn(r.venta)}</td>
                  <td className="num">{mxn(r.comision)}</td>
                  <td className="num">{mxn(r.envio)}</td>
                  <td className="num">{mxn(r.ret_iva)}</td>
                  <td className="num">{mxn(r.ret_isr)}</td>
                  <td className="num">{mxn(r.cupon)}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{mxn(r.neto_recibido)}</td>
                  <td className="num">{mxn(r.material)}{Number(r.sin_costo) > 0 && <div className="muted">{num(r.sin_costo)} líneas sin costo</div>}</td>
                  <td className="num">{mxn(r.insumos)}</td>
                  <td className="num" style={{ fontWeight: 700, color: Number(r.utilidad) >= 0 ? "var(--calm)" : "var(--alarm)" }}>{mxn(r.utilidad)}</td>
                  <td className="num">{pct(r.utilidad, r.venta)}</td>
                  <td className="num">{num(r.canceladas)}</td>
                  <td className="num">{Number(r.directas_n) ? `${num(r.directas_n)} · ${mxn(r.directas)}` : "—"}</td>
                </tr>
              ))}
              {rows.length > 1 && (
                <tr style={{ background: "#f8faf8", fontWeight: 700 }}>
                  <td>Meses completos</td>
                  <td className="num">{num(sum("ordenes"))}</td><td className="num">{num(sum("piezas"))}</td><td className="num">{mxn(sum("venta"))}</td>
                  <td className="num">{mxn(sum("comision"))}</td><td className="num">{mxn(sum("envio"))}</td><td className="num">{mxn(sum("ret_iva"))}</td>
                  <td className="num">{mxn(sum("ret_isr"))}</td><td className="num">{mxn(sum("cupon"))}</td><td className="num">{mxn(sum("neto_recibido"))}</td>
                  <td className="num">{mxn(sum("material"))}</td><td className="num">{mxn(sum("insumos"))}</td><td className="num">{mxn(sum("utilidad"))}</td>
                  <td className="num">{pct(sum("utilidad"), sum("venta"))}</td><td className="num">{num(sum("canceladas"))}</td><td className="num">{mxn(sum("directas"))}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 10 }}>Las retenciones de IVA e ISR aparecen desde enero de 2026 porque Mercado Pago no las reporta antes. El precio del oro por mes y proveedor se captura en el reporte mensual.</p>
    </>
  );
}

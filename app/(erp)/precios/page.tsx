import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { mxn, num } from "@/lib/format";

export const dynamic = "force-dynamic";

type Fila = {
  item_id: string; titulo: string; status: string; reventa: boolean; precio: number; permalink: string;
  product_id: number | null; producto: string | null; costo: number | null; insumo: number | null;
  rev_piezas: number; rev_neto_pz: number | null; rev_neto_pz_reciente: number | null; rev_min_pz: number | null;
  dir_piezas: number; dir_neto_pz: number | null; dir_ratio: number;
  margen_rev: number | null; margen_dir: number | null;
  min_reventa: number | null; min_lista_directa: number | null;
};

const DIAS = [30, 60, 90];

function semaforo(m: number | null, objetivo: number) {
  if (m == null) return { cls: "neutral", txt: "sin datos" };
  if (m >= objetivo) return { cls: "ok", txt: "cumple" };
  if (m >= objetivo - 0.2) return { cls: "warn", txt: "casi" };
  return { cls: "bad", txt: "bajo" };
}

export default async function PreciosPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const { dias: diasParam } = await searchParams;
  const dias = DIAS.includes(Number(diasParam)) ? Number(diasParam) : 60;
  const supabase = await createClient();
  const [res, cfg] = await Promise.all([
    supabase.rpc("margenes_publicaciones", { p_dias: dias }),
    supabase.from("settings").select("value").eq("key", "margen_objetivo").maybeSingle(),
  ]);
  if (res.error) throw new Error(res.error.message);
  const objetivo = Number((cfg.data?.value as { valor?: number } | null)?.valor ?? 1.8) || 1.8;
  const filas = (res.data ?? []) as Fila[];

  // Una fila por producto: las publicaciones del mismo producto comparten costo y lo que paga ML
  const porProducto = new Map<string, Fila[]>();
  for (const f of filas) porProducto.set(f.producto ?? `(sin producto) ${f.titulo}`, [...(porProducto.get(f.producto ?? `(sin producto) ${f.titulo}`) ?? []), f]);
  const grupos = [...porProducto.entries()].map(([nombre, items]) => {
    const base = items[0];
    const precios = items.map((i) => Number(i.precio)).filter((p) => p > 0);
    return {
      nombre, items, base,
      pmin: precios.length ? Math.min(...precios) : 0, pmax: precios.length ? Math.max(...precios) : 0,
      enReventa: items.filter((i) => i.reventa).length,
      margen: base.margen_rev != null ? Number(base.margen_rev) : null,
      margenDir: base.margen_dir != null ? Number(base.margen_dir) : null,
    };
  }).sort((a, b) => (a.margen ?? a.margenDir ?? 99) - (b.margen ?? b.margenDir ?? 99));

  const conDato = grupos.filter((g) => g.margen != null);
  const bajos = conDato.filter((g) => (g.margen as number) < objetivo);
  const cae = grupos.filter((g) => g.base.rev_neto_pz_reciente != null && g.base.rev_neto_pz != null && Number(g.base.rev_neto_pz_reciente) < Number(g.base.rev_neto_pz) * 0.97);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Precios y margen <span className="muted">· objetivo {objetivo.toFixed(2)}×</span></h1>
          <div className="muted">
            Margen = lo que te deja Mercado Libre por pieza (ya sin comisión, envío ni retenciones) ÷ costo de la pieza (gramaje × oro de hoy + piedra o pieza).
            En reventa lo que te deja es lo que Mercado Libre te paga por pieza; en venta directa es tu precio de lista menos comisión, envío y retenciones. Cambia el objetivo en <Link href="/config">Configuración</Link>.
          </div>
        </div>
      </div>
      <div className="chips" style={{ marginBottom: 12 }}>
        {DIAS.map((d) => <Link key={d} href={`/precios?dias=${d}`} className={`chip ${d === dias ? "active" : ""}`}>últimos {d} días</Link>)}
      </div>

      <div className="grid kpis">
        <div className="kpi"><div className="label">Productos revisados</div><div className="value">{num(conDato.length)}</div><div className="sub">con ventas en el periodo · {num(grupos.length - conDato.length)} sin ventas, solo con precio de lista</div></div>
        <div className="kpi"><div className="label">Por debajo del objetivo</div><div className={`value ${bajos.length ? "zero" : ""}`}>{num(bajos.length)}</div><div className="sub">{bajos.slice(0, 4).map((g) => g.nombre).join(", ")}{bajos.length > 4 ? "…" : ""}</div></div>
        <div className="kpi"><div className="label">ML está pagando menos</div><div className="value">{num(cae.length)}</div><div className="sub">productos donde lo pagado en reventa las últimas 3 semanas bajó más de 3% contra el periodo</div></div>
      </div>

      <div className="card tight" style={{ marginTop: 14 }}>
        <div className="tbl-wrap">
          <table className="compact">
            <thead>
              <tr>
                <th>Producto</th><th>Publicaciones</th><th className="num">Costo</th>
                <th className="num">ML te paga en reventa</th><th className="num">Margen reventa</th>
                <th className="num">Precio de lista</th><th className="num">Margen si vende directa</th>
                <th className="num">Mínimo a aceptar en reventa</th><th className="num">Precio de lista mínimo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => {
                const b = g.base;
                const s = semaforo(g.margen ?? g.margenDir, objetivo);
                const reciente = b.rev_neto_pz_reciente != null ? Number(b.rev_neto_pz_reciente) : null;
                return (
                  <tr key={g.nombre} className={g.margen == null && g.margenDir == null ? "dim" : ""}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{g.nombre}</div>
                      <div className="muted">{num(Number(b.rev_piezas))} vendidas en reventa · {num(Number(b.dir_piezas))} directas{!b.costo ? " · sin costo en Catálogo" : ""}</div>
                    </td>
                    <td>
                      {num(g.items.length)} {g.enReventa > 0 ? <span className="tag warn">{g.enReventa} en reventa</span> : <span className="tag neutral">venta directa</span>}
                      <div className="muted">{g.items.slice(0, 2).map((i) => <a key={i.item_id} href={i.permalink} target="_blank" rel="noreferrer" style={{ marginRight: 6 }}>{i.item_id}</a>)}{g.items.length > 2 ? `+${g.items.length - 2}` : ""}</div>
                    </td>
                    <td className="num">{b.costo ? mxn(b.costo) : "—"}</td>
                    <td className="num">
                      {b.rev_neto_pz != null ? mxn(b.rev_neto_pz) : "—"}
                      {reciente != null && b.rev_neto_pz != null && Math.abs(reciente - Number(b.rev_neto_pz)) >= 20 && (
                        <div className={`muted ${reciente < Number(b.rev_neto_pz) ? "" : ""}`} style={{ color: reciente < Number(b.rev_neto_pz) ? "var(--alarm)" : undefined }}>últimas 3 sem: {mxn(reciente)}</div>
                      )}
                      {b.rev_min_pz != null && <div className="muted">mínimo pagado {mxn(b.rev_min_pz)}</div>}
                    </td>
                    <td className="num" style={{ fontWeight: 700 }}>{g.margen != null ? `${g.margen.toFixed(2)}×` : "—"}</td>
                    <td className="num">{g.pmin ? (g.pmin === g.pmax ? mxn(g.pmin) : `${mxn(g.pmin)} a ${mxn(g.pmax)}`) : "—"}</td>
                    <td className="num">{g.margenDir != null ? `${g.margenDir.toFixed(2)}×` : "—"}<div className="muted">te quedaría {b.dir_ratio ? `${(Number(b.dir_ratio) * 100).toFixed(0)}%` : "72%"} del precio</div></td>
                    <td className="num" style={{ fontWeight: 600 }}>{b.min_reventa != null ? mxn(b.min_reventa) : "—"}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{b.min_lista_directa != null ? mxn(b.min_lista_directa) : "—"}</td>
                    <td><span className={`tag ${s.cls}`}>{s.txt}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h2>Cómo ajustarlo en Mercado Libre</h2>
        <ul>
          <li><b>Reventa.</b> Lo que te queda no depende de tu precio de lista: es lo que Mercado Libre decide pagarte por pieza, y ha ido bajando. Entra a Mercado Libre → Publicaciones → Reventa, revisa el precio de compra que te ofrece cada publicación y compáralo con la columna "Mínimo a aceptar en reventa". Si paga menos, saca esa publicación de reventa (vuelve a venta directa) o pide un precio mayor si la pantalla te lo permite.</li>
          <li><b>Venta directa.</b> Ahí sí manda tu precio de lista: te queda cerca del 72% después de comisión, envío Full y retenciones. Pon el precio de lista por lo menos en la columna "Precio de lista mínimo".</li>
          <li><b>Costo.</b> El costo se calcula con el precio del oro de hoy. Si el oro sube y no capturas el precio nuevo en el reporte mensual, aquí se verá un margen mejor del real.</li>
          <li>Los márgenes de esta pantalla son antes de publicidad, cargos de Full, insumos ({mxn(32)} por pieza en oro) y gastos fijos. El 1.8 debe alcanzar para cubrir todo eso y dejar utilidad.</li>
        </ul>
      </div>
    </>
  );
}

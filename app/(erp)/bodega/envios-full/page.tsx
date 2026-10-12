import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fechaHora, num } from "@/lib/format";
import { deshacerInbound, importarInbound } from "../actions";

export const dynamic = "force-dynamic";

type Inbound = { inbound_id: string; estado: string | null; fecha_recepcion: string | null; piezas_declaradas: number; piezas_procesadas: number; descontado: boolean; piezas_descontadas: number; subido_at: string; subido_por: string | null };
type InboundItem = { inbound_id: string; inventory_id: string; variant_id: number | null; sku: string | null; variante: string | null; declaradas: number; procesadas: number; aptas: number; no_aptas: number; descontado: number; variants: { color: string; talla: string; products: { name: string } | null } | null };

export default async function EnviosFullPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const supabase = await createClient();
  const [inb, items] = await Promise.all([
    supabase.from("bodega_inbounds").select("*").order("fecha_recepcion", { ascending: false, nullsFirst: false }).limit(40),
    supabase.from("bodega_inbound_items").select("*, variants(color,talla,products(name))"),
  ]);
  const inbounds = (inb.data ?? []) as Inbound[];
  const detalle = ((items.data ?? []) as unknown as InboundItem[]);
  const nombre = (v: InboundItem["variants"]) => v?.products?.name ?? null;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="muted"><Link href="/bodega">← Bodega</Link></div>
          <h1>Envíos a Full</h1>
          <div className="muted">Lo que llega a Full ya se resta solo de la bodega: revísalo en <Link href="/ingresos-full">Ingresos a Full</Link>. Aquí puedes subir el CSV de detalle de una colecta para guardar lo declarado contra lo recibido; ya no descuenta de la bodega.</div>
        </div>
        <div className="chips"><a className="chip" href="/bodega/envios-full/excel">Excel de envíos detectados</a></div>
      </div>
      {ok && <p className="notice" style={{ background: "var(--calm-bg)", color: "var(--calm)", marginBottom: 14 }}>{ok}</p>}
      {error && <p className="error" style={{ marginBottom: 14 }}>{error}</p>}

      <div className="card" style={{ marginBottom: 14 }}>
        <h2>Subir detalle de colecta (CSV de Mercado Libre)</h2>
        <form action={importarInbound} className="inline" style={{ flexWrap: "wrap", gap: 12 }}>
          <input type="file" name="archivo" accept=".csv,text/csv" required />
          <button className="btn" type="submit">Subir detalle</button>
        </form>

      </div>

      <div id="inbounds" className="card tight" style={{ marginBottom: 14 }}>
        <h2>Colectas registradas <span className="muted">· {num(inbounds.length)}</span></h2>
        {inbounds.length === 0 && <p className="muted" style={{ padding: "0 18px 16px" }}>Todavía no has subido ninguna colecta.</p>}
        {inbounds.map((i) => {
          const rows = detalle.filter((d) => d.inbound_id === i.inbound_id).sort((a, b) => (nombre(a.variants) ?? "").localeCompare(nombre(b.variants) ?? "") || (a.variants?.talla ?? "").localeCompare(b.variants?.talla ?? "", undefined, { numeric: true }));
          const sinMapear = rows.filter((r) => r.variant_id == null).length;
          return (
            <details key={i.inbound_id} className="acc" style={{ margin: 0, borderTop: "1px solid var(--line)" }}>
              <summary>
                <span className="acc-title">
                  <b>Colecta {i.inbound_id}</b>
                  <span className="muted">{i.fecha_recepcion ? `recibida en Full ${fechaHora(i.fecha_recepcion)}` : "sin fecha de recepción"} · {i.estado ?? ""} · subida {fechaHora(i.subido_at)}{sinMapear ? ` · ${sinMapear} tallas sin mapear` : ""}</span>
                </span>
                <span className="acc-nums">
                  <span><b>{num(i.piezas_declaradas)}</b><small>declaradas</small></span>
                  <span><b>{num(i.piezas_procesadas)}</b><small>recibidas</small></span>
                  <span><b>{num(i.piezas_descontadas)}</b><small>descontadas</small></span>
                  {i.descontado ? <span className="tag ok">descontada</span> : <span className="tag neutral">sin descontar</span>}
                </span>
              </summary>
              <div className="tbl-wrap">
                <table className="compact">
                  <thead><tr><th>Producto</th><th>Color</th><th>Talla</th><th>SKU</th><th className="num">Declaradas</th><th className="num">Recibidas</th><th className="num">Aptas</th><th className="num">No aptas</th><th className="num">Descontado</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.inventory_id} className={r.variant_id == null ? "" : r.descontado < r.declaradas && i.descontado ? "" : ""}>
                        <td>{nombre(r.variants) ?? <span className="tag warn">sin producto · {r.variante}</span>}</td>
                        <td>{r.variants?.color || "—"}</td><td>{r.variants?.talla || "—"}</td><td className="muted">{r.sku}</td>
                        <td className="num"><b>{num(r.declaradas)}</b></td><td className="num">{num(r.procesadas)}</td><td className="num">{num(r.aptas)}</td>
                        <td className={`num ${r.no_aptas > 0 ? "zero" : ""}`}>{num(r.no_aptas)}</td>
                        <td className={`num ${i.descontado && r.descontado < r.declaradas ? "zero" : ""}`}>{num(r.descontado)}{i.descontado && r.descontado < r.declaradas ? <span className="muted"> (bodega en 0)</span> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: "8px 16px 14px" }}>
                {i.descontado ? (
                  <form action={deshacerInbound}><input type="hidden" name="inbound_id" value={i.inbound_id} /><button className="btn small secondary" type="submit">Deshacer descuento (devolver a bodega)</button></form>
                ) : (
                  <span className="muted">Solo registrada (no descuenta de bodega).</span>
                )}
              </div>
            </details>
          );
        })}
      </div>

    </>
  );
}

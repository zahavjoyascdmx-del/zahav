import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fechaCorta, fechaHora, num, todayCdmx, addDays } from "@/lib/format";
import { aplicarEnviosFull, deshacerInbound, ignorarEnvioFull, importarInbound } from "../actions";

export const dynamic = "force-dynamic";

type Inbound = { inbound_id: string; estado: string | null; fecha_recepcion: string | null; piezas_declaradas: number; piezas_procesadas: number; descontado: boolean; piezas_descontadas: number; subido_at: string; subido_por: string | null };
type InboundItem = { inbound_id: string; inventory_id: string; variant_id: number | null; sku: string | null; variante: string | null; declaradas: number; procesadas: number; aptas: number; no_aptas: number; descontado: number; variants: { color: string; talla: string; products: { name: string } | null } | null };
type Envio = { fecha: string; inventory_id: string; variant_id: number | null; enviado: number; descontado: number; ignorado: boolean; variants: { color: string; talla: string; products: { name: string } | null } | null };

export default async function EnviosFullPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const hoy = todayCdmx();
  const supabase = await createClient();
  const [inb, items, envios, cfg, snap] = await Promise.all([
    supabase.from("bodega_inbounds").select("*").order("fecha_recepcion", { ascending: false, nullsFirst: false }).limit(40),
    supabase.from("bodega_inbound_items").select("*, variants(color,talla,products(name))"),
    supabase.from("bodega_envios_full").select("*, variants(color,talla,products(name))").gte("fecha", addDays(hoy, -14)).order("fecha", { ascending: false }),
    supabase.from("settings").select("key,value").in("key", ["bodega_descuento_auto"]),
    supabase.from("meli_stock_snapshots").select("snapshot_date").order("snapshot_date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const inbounds = (inb.data ?? []) as Inbound[];
  const detalle = ((items.data ?? []) as unknown as InboundItem[]);
  const detectados = ((envios.data ?? []) as unknown as Envio[]);
  const auto = (cfg.data ?? []).find((r) => r.key === "bodega_descuento_auto")?.value === true;
  const porDia = new Map<string, Envio[]>();
  for (const e of detectados) porDia.set(e.fecha, [...(porDia.get(e.fecha) ?? []), e]);
  const nombre = (v: InboundItem["variants"] | Envio["variants"]) => v?.products?.name ?? null;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="muted"><Link href="/bodega">← Bodega</Link></div>
          <h1>Envíos a Full</h1>
          <div className="muted">Sube el CSV de detalle de cada colecta (Mercado Libre → Envíos a Full → tu envío → Descargar detalle) y la app resta de la bodega, talla por talla, las unidades declaradas. Cada colecta se descuenta una sola vez.</div>
        </div>
        <div className="chips"><a className="chip" href="/bodega/envios-full/excel">Excel de envíos detectados</a></div>
      </div>
      {ok && <p className="notice" style={{ background: "var(--calm-bg)", color: "var(--calm)", marginBottom: 14 }}>{ok}</p>}
      {error && <p className="error" style={{ marginBottom: 14 }}>{error}</p>}

      <div className="card" style={{ marginBottom: 14 }}>
        <h2>Subir colecta (CSV de Mercado Libre)</h2>
        <form action={importarInbound} className="inline" style={{ flexWrap: "wrap", gap: 12 }}>
          <input type="file" name="archivo" accept=".csv,text/csv" required />
          <label className="inline muted"><input type="checkbox" name="descontar" defaultChecked /> Descontar de bodega las unidades declaradas</label>
          <button className="btn" type="submit">Subir y descontar</button>
        </form>
        <p className="muted" style={{ marginTop: 8 }}>Si la colecta ya había salido cuando contaste la bodega, quita la palomita: se registra el detalle pero no se descuenta nada. Si una talla no está en bodega, se descuenta lo que haya y no se deja en negativo.</p>
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
                  <span className="muted">Para descontarla, vuelve a subir el CSV con la palomita marcada.</span>
                )}
              </div>
            </details>
          );
        })}
      </div>

      <details className="card tight acc">
        <summary>
          <span className="acc-title"><b>Detección automática por foto de Full</b><span className="muted">solo informativa{auto ? "" : " (no descuenta nada)"} · piezas nuevas en tránsito hacia Full, últimos 14 días · última foto {snap.data ? fechaCorta(snap.data.snapshot_date) : "—"}</span></span>
          <span className="acc-nums"><form action={aplicarEnviosFull}><button className="btn small secondary" type="submit">Revisar ahora</button></form></span>
        </summary>
        {[...porDia.entries()].map(([fecha, lista]) => (
          <div key={fecha} className="tbl-wrap" style={{ borderTop: "1px solid var(--line)" }}>
            <table className="compact">
              <thead><tr><th>{fechaCorta(fecha)}</th><th>Color</th><th>Talla</th><th className="num">En tránsito nuevas</th><th className="num">Descontado</th><th></th></tr></thead>
              <tbody>
                {lista.map((e) => (
                  <tr key={e.inventory_id}>
                    <td>{nombre(e.variants) ?? e.inventory_id}</td><td>{e.variants?.color || "—"}</td><td>{e.variants?.talla || "—"}</td>
                    <td className="num">{num(e.enviado)}</td><td className="num">{num(e.descontado)}</td>
                    <td>{e.descontado > 0 && (
                      <form action={ignorarEnvioFull} className="inline">
                        <input type="hidden" name="fecha" value={fecha} /><input type="hidden" name="inventory_id" value={e.inventory_id} /><input type="hidden" name="ignorar" value="1" />
                        <button className="btn small secondary" type="submit">Deshacer</button>
                      </form>
                    )}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {detectados.length === 0 && <p className="muted" style={{ padding: "0 18px 16px" }}>Sin envíos detectados en los últimos 14 días.</p>}
      </details>
    </>
  );
}

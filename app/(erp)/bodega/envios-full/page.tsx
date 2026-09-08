import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fechaCorta, num, todayCdmx, addDays } from "@/lib/format";
import { aplicarEnviosFull, ignorarEnvioFull } from "../actions";

export const dynamic = "force-dynamic";

type Envio = { fecha: string; inventory_id: string; variant_id: number | null; enviado: number; descontado: number; ignorado: boolean; updated_at: string; variants: { color: string; talla: string; products: { name: string } | null } | null };
type Op = { inventory_id: string; fecha: string; type: string; qty_available: number; inbound_id: string | null };

export default async function EnviosFullPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const { ok } = await searchParams;
  const hoy = todayCdmx();
  const desde = addDays(hoy, -30);
  const supabase = await createClient();
  const [envios, ops, cfg, snap] = await Promise.all([
    supabase.from("bodega_envios_full").select("*, variants(color,talla,products(name))").gte("fecha", desde).order("fecha", { ascending: false }),
    supabase.from("meli_stock_operations").select("inventory_id,fecha,type,qty_available,inbound_id").gte("fecha", desde).in("type", ["TRANSFER_DELIVERY", "INBOUND_RECEPTION"]),
    supabase.from("settings").select("key,value").in("key", ["bodega_descuento_desde", "bodega_descuento_auto"]),
    supabase.from("meli_stock_snapshots").select("snapshot_date").order("snapshot_date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const lista = ((envios.data ?? []) as unknown as Envio[]);
  const get = (k: string) => (cfg.data ?? []).find((r) => r.key === k)?.value;
  const desdeCfg = String(get("bodega_descuento_desde") ?? "");
  const auto = get("bodega_descuento_auto") !== false;
  const entregas = (ops.data ?? []) as Op[];
  const porDia = new Map<string, Envio[]>();
  for (const e of lista) porDia.set(e.fecha, [...(porDia.get(e.fecha) ?? []), e]);
  const totalEnviado = lista.reduce((a, e) => a + e.enviado, 0);
  const totalDescontado = lista.reduce((a, e) => a + e.descontado, 0);
  const inboundsDia = (fecha: string) => [...new Set(entregas.filter((o) => o.fecha === fecha && o.inbound_id).map((o) => o.inbound_id as string))];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="muted"><Link href="/bodega">← Bodega</Link></div>
          <h1>Envíos a Full</h1>
          <div className="muted">
            Cada día la app compara la foto de Full con la del día anterior: lo que aparece nuevo "en tránsito a Full" salió de tu bodega y se descuenta solo, talla por talla.
            {auto ? ` Activo para colectas desde el ${fechaCorta(desdeCfg)}.` : " El descuento automático está apagado."} Última foto de Full: {snap.data ? fechaCorta(snap.data.snapshot_date) : "—"}.
          </div>
        </div>
        <div className="chips"><a className="chip" href="/bodega/envios-full/excel">Descargar Excel del detalle</a><form action={aplicarEnviosFull}><button className="btn secondary" type="submit">Revisar ahora</button></form></div>
      </div>
      {ok && <p className="notice" style={{ background: "var(--calm-bg)", color: "var(--calm)", marginBottom: 14 }}>Sincronización lanzada. En un minuto recarga esta página.</p>}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="kpi-row">
          <div className="kpi"><div className="label">Enviado a Full · 30 días</div><div className="value">{num(totalEnviado)}</div><div className="sub">piezas detectadas</div></div>
          <div className="kpi"><div className="label">Descontado de bodega</div><div className="value">{num(totalDescontado)}</div><div className="sub">las anteriores al {fechaCorta(desdeCfg)} no se descuentan (ya estaban fuera cuando contaste)</div></div>
        </div>
      </div>

      {[...porDia.entries()].map(([fecha, items]) => {
        const inbounds = inboundsDia(fecha);
        return (
          <div key={fecha} className="card tight" style={{ marginBottom: 14 }}>
            <h2>{fechaCorta(fecha)} <span className="muted">· {num(items.reduce((a, e) => a + e.enviado, 0))} piezas{inbounds.length ? ` · llegadas a Full ese día de envíos ${inbounds.join(", ")}` : ""}{fecha < desdeCfg ? " · antes del corte, no se descuenta" : ""}</span></h2>
            <div className="tbl-wrap">
              <table className="compact">
                <thead><tr><th>Producto</th><th>Color</th><th>Talla</th><th className="num">Salieron a Full</th><th className="num">Descontado de bodega</th><th>Estado</th><th></th></tr></thead>
                <tbody>
                  {items.sort((a, b) => (a.variants?.products?.name ?? "").localeCompare(b.variants?.products?.name ?? "")).map((e) => (
                    <tr key={e.inventory_id}>
                      <td>{e.variants?.products?.name ?? <span className="tag warn">sin producto ({e.inventory_id})</span>}</td>
                      <td>{e.variants?.color || "—"}</td>
                      <td>{e.variants?.talla || "—"}</td>
                      <td className="num"><b>{num(e.enviado)}</b></td>
                      <td className="num">{num(e.descontado)}</td>
                      <td>{e.ignorado ? <span className="tag neutral">no descontar</span> : e.descontado === e.enviado && e.enviado > 0 ? <span className="tag ok">descontado</span> : fecha < desdeCfg ? <span className="tag neutral">antes del corte</span> : e.variant_id == null ? <span className="tag bad">talla sin mapear</span> : e.descontado < e.enviado ? <span className="tag warn">parcial: bodega en 0</span> : <span className="tag neutral">pendiente</span>}</td>
                      <td>
                        {fecha >= desdeCfg && e.variant_id != null && (
                          <form action={ignorarEnvioFull} className="inline">
                            <input type="hidden" name="fecha" value={fecha} /><input type="hidden" name="inventory_id" value={e.inventory_id} /><input type="hidden" name="ignorar" value={e.ignorado ? "0" : "1"} />
                            <button className="btn small secondary" type="submit">{e.ignorado ? "Volver a descontar" : "Deshacer"}</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      {lista.length === 0 && <p className="muted">Todavía no se han detectado envíos a Full desde que empezó a guardarse la foto diaria.</p>}
      <p className="muted">Si en un envío el descuento quedó mal (por ejemplo, mandaste piezas que no estaban contadas en bodega), usa "Deshacer": las piezas regresan a la bodega y ese envío queda marcado para no descontarse.</p>
    </>
  );
}

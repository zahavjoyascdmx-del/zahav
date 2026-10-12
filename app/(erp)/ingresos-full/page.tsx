import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { addDays, fechaCorta, num, todayCdmx } from "@/lib/format";
import { aplicarEnviosFull, guardarColecta, ignorarLlegada, revisarAlertaFull } from "../bodega/actions";

export const dynamic = "force-dynamic";

type Ingreso = { fecha: string; inventory_id: string; variant_id: number | null; piezas: number };
type Variante = { id: number; color: string; talla: string; products: { name: string } | null };
type Alerta = { fecha: string; inventory_id: string; producto: string; color: string; talla: string; llegaron: number; bodega_antes: number; diferencia: number; revisada: boolean; nota: string | null };
type EstadoBodega = { fecha: string; inventory_id: string; descontado: number; faltante: number; ignorado: boolean };

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const mesMas = (m: string, d: number) => { const dt = new Date(`${m}-01T12:00:00Z`); dt.setUTCMonth(dt.getUTCMonth() + d); return dt.toISOString().slice(0, 7); };
const finMes = (m: string) => { const dt = new Date(`${mesMas(m, 1)}-01T12:00:00Z`); dt.setUTCDate(0); return dt.toISOString().slice(0, 10); };
const tallaNum = (t: string) => { const n = parseFloat(t.replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? n : 999; };

/**
 * Lo que llegó a Full por día y talla, según la foto diaria de stock (disponible + en traslado).
 * Cada día con al menos `full_ingreso_minimo` piezas es la llegada de una colecta; lo demás son devoluciones o ajustes.
 */
export default async function IngresosFullPage({ searchParams }: { searchParams: Promise<{ mes?: string; ver?: string }> }) {
  const { mes: mesParam, ver } = await searchParams;
  const hoy = todayCdmx();
  const mes = /^\d{4}-\d{2}$/.test(mesParam ?? "") ? mesParam! : hoy.slice(0, 7);
  const desdeMes = `${mes}-01`, hastaMes = finMes(mes);
  const supabase = await createClient();
  const [ing, cfg, etiquetas, estados, alr] = await Promise.all([
    supabase.rpc("full_ingresos", { p_desde: desdeMes, p_hasta: hastaMes }),
    supabase.from("settings").select("key,value").in("key", ["full_ingreso_minimo", "bodega_full_desde_fecha", "bodega_descuento_auto"]),
    supabase.from("full_llegadas").select("fecha,colecta").gte("fecha", desdeMes).lte("fecha", hastaMes),
    supabase.from("bodega_envios_full").select("fecha,inventory_id,descontado,faltante,ignorado").gte("fecha", desdeMes).lte("fecha", hastaMes),
    // alertas: las del mes que se ve y las pendientes de los últimos 60 días
    supabase.rpc("full_alertas", { p_desde: desdeMes < addDays(hoy, -60) ? desdeMes : addDays(hoy, -60), p_hasta: hastaMes > hoy ? hoy : hastaMes }),
  ]);
  if (ing.error) throw new Error(ing.error.message);
  const ingresos = (ing.data ?? []) as Ingreso[];
  const ajuste = (k: string) => (cfg.data ?? []).find((r) => r.key === k)?.value;
  const minimo = Number(ajuste("full_ingreso_minimo") ?? 5);
  const desdeDescuento = String(ajuste("bodega_full_desde_fecha") ?? "");
  const auto = ajuste("bodega_descuento_auto") === true;
  const colectas = new Map(((etiquetas.data ?? []) as { fecha: string; colecta: string | null }[]).map((e) => [e.fecha, e.colecta]));
  const todasAlertas = ((alr.data ?? []) as Alerta[]);
  const alertas = todasAlertas.filter((a) => !a.revisada || (a.fecha >= desdeMes && a.fecha <= hastaMes));
  const alertaDe = new Map(todasAlertas.map((a) => [`${a.fecha}|${a.inventory_id}`, a]));
  const estado = new Map(((estados.data ?? []) as EstadoBodega[]).map((e) => [`${e.fecha}|${e.inventory_id}`, e]));

  const ids = [...new Set(ingresos.map((i) => i.variant_id).filter((v): v is number => v != null))];
  const { data: vdata } = ids.length ? await supabase.from("variants").select("id,color,talla,products(name)").in("id", ids) : { data: [] };
  const variantes = new Map(((vdata ?? []) as unknown as Variante[]).map((v) => [v.id, v]));
  const detalle = (i: Ingreso) => {
    const v = i.variant_id != null ? variantes.get(i.variant_id) : undefined;
    return { producto: v?.products?.name ?? `Sin producto (${i.inventory_id})`, color: v?.color ?? "", talla: v?.talla ?? "" };
  };
  const orden = (a: Ingreso, b: Ingreso) => {
    const x = detalle(a), y = detalle(b);
    return x.producto.localeCompare(y.producto) || x.color.localeCompare(y.color) || tallaNum(x.talla) - tallaNum(y.talla);
  };

  const porDia = new Map<string, Ingreso[]>();
  for (const i of ingresos) porDia.set(i.fecha, [...(porDia.get(i.fecha) ?? []), i]);
  const dias = [...porDia.entries()].map(([fecha, lista]) => ({ fecha, lista: lista.sort(orden), piezas: lista.reduce((a, i) => a + i.piezas, 0) }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  const llegadas = dias.filter((d) => d.piezas >= minimo);
  const menores = dias.filter((d) => d.piezas < minimo);
  const totalColectas = llegadas.reduce((a, d) => a + d.piezas, 0);
  const totalMenores = menores.reduce((a, d) => a + d.piezas, 0);

  type Fila = { producto: string; color: string; talla: string; piezas: number; dias: string[] };
  const porTalla = new Map<string, Fila>();
  for (const d of llegadas) for (const i of d.lista) {
    const x = detalle(i);
    const k = `${x.producto}|${x.color}|${x.talla}`;
    const f = porTalla.get(k) ?? { ...x, piezas: 0, dias: [] };
    f.piezas += i.piezas; f.dias.push(fechaCorta(d.fecha));
    porTalla.set(k, f);
  }
  const filas = [...porTalla.values()].sort((a, b) => a.producto.localeCompare(b.producto) || a.color.localeCompare(b.color) || tallaNum(a.talla) - tallaNum(b.talla));
  const porProducto = new Map<string, number>();
  for (const f of filas) porProducto.set(f.producto, (porProducto.get(f.producto) ?? 0) + f.piezas);

  const vista = ver === "talla" ? "talla" : "llegada";
  const href = (m: string, v = vista) => `/ingresos-full?mes=${m}${v === "talla" ? "&ver=talla" : ""}`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ingresos a Full</h1>
          <div className="muted">Piezas que llegaron a Full cada día, talla por talla, según la foto de stock de Mercado Libre (disponible + en traslado). Cada colecta aparece el día que ML la recibe en su bodega; compárala con Mercado Libre → Full → Envíos y anota su número. Desde el conteo del {desdeDescuento ? fechaCorta(desdeDescuento) : "—"}, cada llegada se resta sola de la <Link href="/bodega">bodega</Link>{auto ? "" : " (descuento apagado)"}.</div>
        </div>
        <div className="chips">
          <Link className="chip" href={href(mesMas(mes, -1))}>← {nombreMes(mesMas(mes, -1))}</Link>
          <span className="chip active">{nombreMes(mes)}</span>
          {mes < hoy.slice(0, 7) && <Link className="chip" href={href(mesMas(mes, 1))}>{nombreMes(mesMas(mes, 1))} →</Link>}
          <form action={aplicarEnviosFull}><button className="btn small secondary" type="submit">Revisar ahora</button></form>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="kpi-row">
          <div className="kpi"><div className="label">Piezas de colectas</div><div className="value">{num(totalColectas)}</div><div className="sub">{nombreMes(mes)}</div></div>
          <div className="kpi"><div className="label">Llegadas</div><div className="value">{num(llegadas.length)}</div><div className="sub">días con {minimo}+ piezas</div></div>
          <div className="kpi"><div className="label">Tallas</div><div className="value">{num(filas.length)}</div><div className="sub">{num(porProducto.size)} productos</div></div>
          <div className="kpi"><div className="label">Devoluciones y ajustes</div><div className="value">{num(totalMenores)}</div><div className="sub">días con menos de {minimo} · no se restan</div></div>
        </div>
      </div>

      {alertas.length > 0 && (
        <div id="alertas" className="card tight" style={{ marginBottom: 14, borderColor: "var(--alarm)" }}>
          <h2 style={{ padding: "14px 18px 0" }}>⚠ Llegadas que no cuadran con la bodega</h2>
          <p className="muted" style={{ padding: "0 18px" }}>Llegaron a Full {`≥`} 3 piezas más de las que había en bodega en esa talla. Revisa si se etiquetó mal (por ejemplo, otro modelo con la etiqueta de este) o si faltó registrar una entrada. Al revisarla, anota qué pasó.</p>
          <div className="tbl-wrap">
            <table className="compact">
              <thead><tr><th>Llegó</th><th>Producto</th><th>Color</th><th>Talla</th><th className="num">Llegaron</th><th className="num">En bodega antes</th><th>Revisión</th></tr></thead>
              <tbody>
                {alertas.map((a) => (
                  <tr key={`${a.fecha}|${a.inventory_id}`}>
                    <td><a href={`/ingresos-full?mes=${a.fecha.slice(0, 7)}#d${a.fecha}`}>{fechaCorta(a.fecha)}</a></td>
                    <td><b>{a.producto}</b></td><td>{a.color || "—"}</td><td>{a.talla || "—"}</td>
                    <td className="num"><b>{num(a.llegaron)}</b></td><td className="num zero">{num(a.bodega_antes)}</td>
                    <td>
                      {a.revisada ? (
                        <form action={revisarAlertaFull} className="inline">
                          <input type="hidden" name="fecha" value={a.fecha} /><input type="hidden" name="inventory_id" value={a.inventory_id} /><input type="hidden" name="reabrir" value="1" />
                          <span className="tag ok">revisada</span><span className="muted">{a.nota}</span>
                          <button className="btn small secondary" type="submit">Reabrir</button>
                        </form>
                      ) : (
                        <form action={revisarAlertaFull} className="inline">
                          <input type="hidden" name="fecha" value={a.fecha} /><input type="hidden" name="inventory_id" value={a.inventory_id} />
                          <input name="nota" placeholder="Qué pasó (p. ej. 10 eran Torzal, se retiraron)" style={{ width: 260 }} />
                          <button className="btn small" type="submit">Marcar revisada</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="chips" style={{ marginBottom: 10 }}>
        <Link className={`chip ${vista === "llegada" ? "active" : ""}`} href={href(mes, "llegada")}>Por llegada</Link>
        <Link className={`chip ${vista === "talla" ? "active" : ""}`} href={href(mes, "talla")}>Por producto y talla</Link>
      </div>

      {dias.length === 0 && <div className="card"><p className="muted">Sin ingresos a Full en {nombreMes(mes)}.</p></div>}

      {vista === "llegada" && llegadas.map((d) => {
        const cuenta = Boolean(desdeDescuento) && d.fecha >= desdeDescuento;
        const est = d.lista.map((i) => estado.get(`${d.fecha}|${i.inventory_id}`));
        const restadas = est.reduce((a, e) => a + (e?.descontado ?? 0), 0);
        const faltantes = est.reduce((a, e) => a + (e?.faltante ?? 0), 0);
        const deshecha = cuenta && est.length > 0 && est.every((e) => e?.ignorado);
        return (
          <details key={d.fecha} id={`d${d.fecha}`} className="card tight acc">
            <summary>
              <span className="acc-title">
                <b>Llegó {fechaCorta(d.fecha)}{colectas.get(d.fecha) ? ` · colecta #${colectas.get(d.fecha)}` : ""}</b>
                <span className="muted">{d.lista.length} tallas</span>
              </span>
              <span className="acc-nums">
                <span><b>{num(d.piezas)}</b><small>piezas</small></span>
                {!cuenta ? <span className="tag neutral">antes del conteo</span>
                  : deshecha ? <span className="tag neutral">deshecha</span>
                  : <span><b>{num(restadas)}</b><small>restadas de bodega</small></span>}
                {cuenta && !deshecha && faltantes > 0 && <span className="tag warn">{num(faltantes)} no estaban en bodega</span>}
              </span>
            </summary>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", padding: "10px 16px", borderTop: "1px solid var(--line)" }}>
              <form action={guardarColecta} className="inline">
                <input type="hidden" name="fecha" value={d.fecha} />
                <span className="muted">Colecta de ML #</span>
                <input name="colecta" defaultValue={colectas.get(d.fecha) ?? ""} placeholder="78735101" inputMode="numeric" style={{ width: 110 }} />
                <button className="btn small secondary" type="submit">Guardar</button>
              </form>
              {cuenta && (
                <form action={ignorarLlegada} style={{ marginLeft: "auto" }}>
                  <input type="hidden" name="fecha" value={d.fecha} /><input type="hidden" name="ignorar" value={deshecha ? "0" : "1"} />
                  <button className="btn small secondary" type="submit">{deshecha ? "Volver a restar de bodega" : "Deshacer (devolver a bodega)"}</button>
                </form>
              )}
            </div>
            <div className="tbl-wrap">
              <table className="compact">
                <thead><tr><th>Producto</th><th>Color</th><th>Talla</th><th className="num">Llegaron</th>{cuenta && <th className="num">Restadas de bodega</th>}</tr></thead>
                <tbody>
                  {d.lista.map((i) => {
                    const x = detalle(i);
                    const e = estado.get(`${d.fecha}|${i.inventory_id}`);
                    return (
                      <tr key={i.inventory_id}>
                        <td>{i.variant_id == null ? <span className="tag warn">{x.producto}</span> : x.producto}{alertaDe.has(`${d.fecha}|${i.inventory_id}`) && <span className="tag warn" style={{ marginLeft: 6 }}>⚠ en bodega había {num(alertaDe.get(`${d.fecha}|${i.inventory_id}`)!.bodega_antes)}</span>}</td>
                        <td>{x.color || "—"}</td><td>{x.talla || "—"}</td>
                        <td className="num"><b>{num(i.piezas)}</b></td>
                        {cuenta && <td className={`num ${e && e.faltante > 0 ? "zero" : ""}`}>{num(e?.descontado ?? 0)}{e && e.faltante > 0 ? <span className="muted"> (faltaron {num(e.faltante)})</span> : null}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        );
      })}

      {vista === "llegada" && menores.length > 0 && (
        <details className="card tight acc">
          <summary><span className="acc-title"><b>Devoluciones y ajustes</b><span className="muted">días con menos de {minimo} piezas: devoluciones de clientes o ajustes de ML; no se restan de la bodega</span></span><span className="acc-nums"><span><b>{num(totalMenores)}</b><small>piezas</small></span></span></summary>
          <div className="tbl-wrap">
            <table className="compact">
              <thead><tr><th>Fecha</th><th>Producto</th><th>Color</th><th>Talla</th><th className="num">Piezas</th></tr></thead>
              <tbody>
                {menores.flatMap((d) => d.lista.map((i) => {
                  const x = detalle(i);
                  return <tr key={`${d.fecha}|${i.inventory_id}`}><td>{fechaCorta(d.fecha)}</td><td>{x.producto}</td><td>{x.color || "—"}</td><td>{x.talla || "—"}</td><td className="num">{num(i.piezas)}</td></tr>;
                }))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {vista === "talla" && filas.length > 0 && (
        <div className="card tight">
          <div className="tbl-wrap">
            <table className="compact">
              <thead><tr><th>Producto</th><th>Color</th><th>Talla</th><th className="num">Piezas que llegaron</th><th>Días</th></tr></thead>
              <tbody>
                {filas.map((f, i) => (
                  <tr key={`${f.producto}|${f.color}|${f.talla}`}>
                    <td>{i === 0 || filas[i - 1].producto !== f.producto ? <b>{f.producto} <span className="muted">· {num(porProducto.get(f.producto))}</span></b> : ""}</td>
                    <td>{f.color || "—"}</td><td>{f.talla || "—"}</td>
                    <td className="num"><b>{num(f.piezas)}</b></td>
                    <td className="muted">{f.dias.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { dec1, mxn, num, pct, todayCdmx } from "@/lib/format";
import { calcularFila, listaMeses, mesAnterior, mesSiguiente, nombreMes, ordenSeccion, tituloSeccion, totales, type FilaCalculada, type FilaReporte } from "@/lib/reporte";
import { agregarGasto, borrarGasto, guardarOro } from "./actions";

export const dynamic = "force-dynamic";

type Oro = { mes: string; proveedor: string; kilates: string; precio: number };
type MesResumen = { mes: string; ordenes: number; piezas: number; venta: number; neto_recibido: number; canceladas: number };
type Pub = { product_id: number | null; cost: number; clicks: number; prints: number; units: number; total_amount: number; dias: number };
type CargoML = { detail_sub_type: string | null; concepto: string | null; amount: number; n: number };
type Gasto = { id: number; mes: string; concepto: string; monto: number; nota: string | null };
type Directa = { id: number; fecha: string; canal: string; cliente: string; precio_total: number; pagado: number; estado: string; product_id: number | null; descripcion: string | null; products: { name: string } | null };

export default async function ReportePage({ searchParams }: { searchParams: Promise<{ mes?: string; ok?: string }> }) {
  const { mes: mesParam, ok } = await searchParams;
  const hoy = todayCdmx();
  const meses = listaMeses(hoy, 12);
  const mes = meses.some((m) => m.mes === mesParam) ? (mesParam as string) : meses[0].mes;
  const anterior = mesAnterior(mes);
  const supabase = await createClient();
  const [rep, oro, cfg, porMes, pub, cargos, gastosRes, directasRes] = await Promise.all([
    supabase.rpc("reporte_mensual", { p_mes: mes }),
    supabase.from("gold_prices").select("mes,proveedor,kilates,precio").in("mes", [mes, anterior]),
    supabase.from("settings").select("key,value").in("key", ["gastos_fijos"]),
    supabase.rpc("ventas_por_mes", { p_meses: 13 }),
    supabase.rpc("publicidad_mes", { p_mes: mes }),
    supabase.rpc("cargos_ml_mes", { p_mes: mes }),
    supabase.from("gastos_mensuales").select("*").eq("mes", mes).order("id"),
    supabase.from("direct_sales").select("id,fecha,canal,cliente,precio_total,pagado,estado,product_id,descripcion,products(name)").neq("estado", "cancelada").gte("fecha", mes).lt("fecha", mesSiguiente(mes)).order("fecha"),
  ]);
  if (rep.error) throw new Error(rep.error.message);

  // Publicidad real de Product Ads por producto (publicaciones mapeadas); lo no mapeado se muestra aparte
  const pubs = (pub.data ?? []) as Pub[];
  const pubPorProducto = new Map<number, number>();
  for (const x of pubs) if (x.product_id != null) pubPorProducto.set(x.product_id, Number(x.cost));
  const pubSinProducto = pubs.filter((x) => x.product_id == null).reduce((a, x) => a + Number(x.cost), 0);
  const pubTotal = pubs.reduce((a, x) => a + Number(x.cost), 0);
  const pubDias = pubs.reduce((a, x) => Math.max(a, Number(x.dias)), 0);
  const pubVentas = pubs.reduce((a, x) => a + Number(x.total_amount), 0);
  const hayPublicidad = pubs.length > 0;
  const listaCargos = (cargos.data ?? []) as CargoML[];
  const otrosCargos = listaCargos.reduce((a, c) => a + Number(c.amount), 0);

  const filas = ((rep.data ?? []) as FilaReporte[]).map((r) => calcularFila({ ...r, publicidad: pubPorProducto.get(r.product_id) ?? 0 }, mes));
  const gastos = (gastosRes.data ?? []) as Gasto[];
  const totalGastosManuales = gastos.reduce((a, g) => a + Number(g.monto), 0);
  // Ventas fuera de Mercado Libre (pedidos directos del mes): utilidad = precio − costo del producto del catálogo (si está mapeado)
  const directas = ((directasRes.data ?? []) as unknown as Directa[]);
  const costoDe = (pid: number | null) => (pid ? filas.find((f) => f.product_id === pid)?.costo_unitario ?? 0 : 0);
  const dirVenta = directas.reduce((a, d) => a + Number(d.precio_total), 0);
  const dirCobrado = directas.reduce((a, d) => a + Number(d.pagado), 0);
  const dirCosto = directas.reduce((a, d) => a + costoDe(d.product_id), 0);
  const dirSinCosto = directas.filter((d) => !costoDe(d.product_id)).length;
  const dirUtilidad = dirVenta - dirCosto;
  const conVentas = filas.filter((f) => f.piezas > 0 || f.stock_total > 0);
  const t = totales(filas);
  const fijosCfg = ((cfg.data ?? []).find((r) => r.key === "gastos_fijos")?.value ?? {}) as Record<string, number>;
  // Si hay datos reales de Product Ads, la publicidad ya va dentro de la utilidad neta; el monto manual solo aplica a meses sin datos.
  const publicidadManual = hayPublicidad ? 0 : Number(fijosCfg.publicidad) || 0;
  const fijos: Record<string, number> = { contabilidad: Number(fijosCfg.contabilidad) || 0, intereses: Number(fijosCfg.intereses) || 0, ...(publicidadManual ? { publicidad: publicidadManual } : {}) };
  const totalFijos = Object.values(fijos).reduce((a, v) => a + v, 0);
  const utilidadFinal = t.utilidad_neta + dirUtilidad - pubSinProducto - otrosCargos - totalFijos - totalGastosManuales;
  const resumenMes = ((porMes.data ?? []) as MesResumen[]).find((m) => m.mes === mes);
  const ventaSinProducto = resumenMes ? Number(resumenMes.venta) - t.venta : 0;

  // Precio del oro: combinaciones proveedor × kilates que tienen productos con gramaje
  const precios = (oro.data ?? []) as Oro[];
  const combos = [...new Map(filas.filter((f) => f.grams != null && f.kilates).map((f) => [`${f.proveedor}__${f.kilates}`, { proveedor: f.proveedor, kilates: f.kilates as string }])).values()]
    .sort((a, b) => ordenSeccion(a.proveedor, a.kilates) - ordenSeccion(b.proveedor, b.kilates));
  const precioDe = (m: string, p: string, k: string) => precios.find((x) => x.mes === m && x.proveedor === p && x.kilates === k)?.precio;
  const faltanPrecios = combos.filter((c) => precioDe(mes, c.proveedor, c.kilates) == null);

  // Secciones como en el Excel
  const secciones = new Map<string, FilaCalculada[]>();
  for (const f of conVentas) {
    const k = tituloSeccion(f.proveedor, f.kilates);
    secciones.set(k, [...(secciones.get(k) ?? []), f]);
  }
  const listaSecciones = [...secciones.entries()].sort((a, b) => ordenSeccion(a[1][0].proveedor, a[1][0].kilates) - ordenSeccion(b[1][0].proveedor, b[1][0].kilates));
  const sinCosto = filas.filter((f) => f.sin_costo && f.piezas > 0);
  const esMesActual = mes === meses[0].mes;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reporte mensual · {nombreMes(mes)} <Link href="/reporte/anual" className="chip" style={{ verticalAlign: "middle", marginLeft: 8, fontSize: 13 }}>Resumen anual</Link></h1>
          <div className="muted">
            Mismo cálculo que tu Excel: costo = gramaje × precio del oro del mes de cada proveedor (+ costo fijo de piedra o pieza), insumos por pieza, utilidad neta y % de ganancia sobre lo invertido.
            {esMesActual && " Mes en curso: los números crecen cada día."}
          </div>
        </div>
        <div className="chips">
          {meses.map((m) => (
            <Link key={m.mes} href={`/reporte?mes=${m.mes}`} className={`chip ${m.mes === mes ? "active" : ""}`}>{m.label.replace(/ de \d{4}/, "").slice(0, 3)} {m.mes.slice(2, 4)}</Link>
          ))}
        </div>
      </div>

      {ok && <p className="notice" style={{ background: "var(--calm-bg)", color: "var(--calm)", marginBottom: 14 }}>Precios del oro guardados. El reporte ya está recalculado.</p>}

      <div className="grid grid-2" style={{ marginBottom: 14 }}>
        <div className={`card ${faltanPrecios.length ? "pendiente" : ""}`}>
          <h2>Precio del oro · {nombreMes(mes)} <span className="muted">$ por gramo, según lo que te cobra cada proveedor</span></h2>
          {faltanPrecios.length > 0 && (
            <p className="notice" style={{ marginBottom: 10 }}>
              Falta capturar {faltanPrecios.length === 1 ? "un precio" : `${faltanPrecios.length} precios`} de este mes. Mientras, uso el último mes conocido (marcado con ~).
            </p>
          )}
          <form action={guardarOro} className="form-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
            <input type="hidden" name="mes" value={mes} />
            {combos.map((c) => {
              const actual = precioDe(mes, c.proveedor, c.kilates);
              const prev = precioDe(anterior, c.proveedor, c.kilates);
              const usado = filas.find((f) => f.proveedor === c.proveedor && f.kilates === c.kilates && f.grams != null)?.precio_oro ?? undefined;
              return (
                <label key={`${c.proveedor}__${c.kilates}`}>
                  {c.proveedor} · {c.kilates} {actual == null && <span className="tag warn">sin capturar</span>}
                  <input name={`oro__${c.proveedor}__${c.kilates}`} type="number" step="1" min="0" defaultValue={actual ?? usado ?? prev ?? ""} placeholder={prev ? `mes anterior ${num(prev)}` : ""} />
                  <span className="muted" style={{ fontSize: 11 }}>{actual != null ? `capturado` : usado != null ? `~ usando ${num(usado)}` : "sin referencia"}{prev != null ? ` · mes anterior ${num(prev)}` : ""}</span>
                </label>
              );
            })}
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, alignItems: "center" }}>
              <button className="btn" type="submit">Guardar precios de {nombreMes(mes).split(" ")[0]}</button>
              <span className="muted">Los proveedores se asignan por producto en <Link href="/productos">Catálogo</Link>.</span>
            </div>
          </form>
        </div>
        <div className="card">
          <h2>Resultado del mes</h2>
          <div className="kpi-row">
            <div className="kpi"><div className="label">Ventas</div><div className="value">{mxn(t.venta)}</div><div className="sub">{num(t.piezas)} piezas · {resumenMes ? `${num(resumenMes.canceladas)} canceladas fuera` : ""}</div></div>
            <div className="kpi"><div className="label">Te depositaron</div><div className="value">{mxn(t.recibido)}</div><div className="sub">tras comisión, envíos, IVA/ISR y cupones</div></div>
            <div className="kpi"><div className="label">Gasto en producto</div><div className="value">{mxn(t.gastos)}</div><div className="sub">oro × gramaje + piedra/pieza</div></div>
            <div className="kpi"><div className="label">Insumos</div><div className="value">{mxn(t.insumos)}</div><div className="sub">cajas y empaque</div></div>
            <div className="kpi"><div className="label">Publicidad</div><div className="value">{mxn(hayPublicidad ? pubTotal : publicidadManual)}</div><div className="sub">{hayPublicidad ? `Product Ads real, ${num(pubDias)} días · sin IVA · generó ${mxn(pubVentas)} en ventas` : "monto manual de Configuración (sin datos de Product Ads para este mes)"}</div></div>
            <div className="kpi"><div className="label">Utilidad neta</div><div className="value">{mxn(t.utilidad_neta)}</div><div className="sub">tras insumos y publicidad por producto{t.venta > 0 ? ` · ${pct(t.utilidad_neta / t.venta)} de la venta` : ""}{t.gastos > 0 ? ` · ${pct(t.utilidad_neta / t.gastos)} sobre lo invertido` : ""}</div></div>
            <div className="kpi"><div className="label">Otros cargos ML</div><div className="value">{mxn(otrosCargos)}</div><div className="sub">{listaCargos.length ? "almacenamiento Full, retiros, eShop, devoluciones…" : "sin datos de facturación para este mes"}</div></div>
            <div className="kpi"><div className="label">Gastos fijos</div><div className="value">{mxn(totalFijos + totalGastosManuales)}</div><div className="sub">{[...Object.entries(fijos).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${mxn(v)}`), ...(totalGastosManuales > 0 ? [`otros ${mxn(totalGastosManuales)}`] : [])].join(" · ") || "configúralos en Configuración"}</div></div>
            {directas.length > 0 && <div className="kpi"><div className="label">Ventas directas</div><div className="value">{mxn(dirUtilidad)}</div><div className="sub">utilidad de {num(directas.length)} pedidos fuera de ML · venta {mxn(dirVenta)} · cobrado {mxn(dirCobrado)}{dirSinCosto ? ` · ${dirSinCosto} sin costo` : ""}</div></div>}
            <div className="kpi"><div className="label">Utilidad final</div><div className={`value ${utilidadFinal < 0 ? "zero" : ""}`}>{mxn(utilidadFinal)}</div><div className="sub">neta + directas − publicidad sin producto − otros cargos ML − gastos fijos y del mes</div></div>
            <div className="kpi"><div className="label">Inventario a costo</div><div className="value">{mxn(t.valor_stock)}</div><div className="sub">{num(t.stock_total)} piezas en Full, tránsito, bodega y Amazon</div></div>
          </div>
          {(t.ordenes_sin_pago > 0 || ventaSinProducto > 50 || sinCosto.length > 0 || pubSinProducto > 0) && (
            <ul className="muted" style={{ margin: "12px 0 0", paddingLeft: 18 }}>
              {pubSinProducto > 0 && <li>{mxn(pubSinProducto)} de publicidad son de publicaciones sin producto asignado; se restan en la utilidad final pero no aparecen por producto.</li>}
              {t.ordenes_sin_pago > 0 && <li>{num(t.ordenes_sin_pago)} órdenes aún sin cargos reales de Mercado Pago; para ellas se estima recibido = venta − comisión − envío.</li>}
              {ventaSinProducto > 50 && <li>{mxn(ventaSinProducto)} de venta son publicaciones sin producto asignado y no entran en las tablas (revisa <Link href="/publicaciones">Publicaciones</Link>).</li>}
              {sinCosto.length > 0 && <li>Sin costo capturado (utilidad sobreestimada): {sinCosto.map((f) => f.producto).join(", ")}. Captúralo en <Link href="/productos">Catálogo</Link>.</li>}
            </ul>
          )}
        </div>
      </div>

      {listaSecciones.map(([titulo, lista]) => {
        const st = totales(lista);
        return (
          <div key={titulo} className="card tight" style={{ marginBottom: 14 }}>
            <h2>{titulo} <span className="muted">· {num(st.piezas)} piezas · utilidad neta {mxn(st.utilidad_neta)}</span></h2>
            <div className="tbl-wrap">
              <table className="compact">
                <thead>
                  <tr>
                    <th>Producto</th><th className="num">g</th><th className="num">Oro $/g</th><th className="num">Costo</th><th className="num">P. sugerido</th>
                    <th className="num">Vendidas</th><th className="num">Ventas</th><th className="num">Cargos</th><th className="num">Impuestos</th><th className="num">Recibiste</th><th className="num">Recibido/pza</th>
                    <th className="num">Gasto producto</th><th className="num">Utilidad bruta</th><th className="num">Insumos</th><th className="num">Publicidad</th><th className="num">Utilidad neta</th><th className="num">% ganancia</th>
                    <th className="num">Bodega</th><th className="num">Full</th><th className="num">Amazon</th><th className="num">Total</th><th className="num">Valor stock</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.sort((a, b) => a.sort_order - b.sort_order || a.producto.localeCompare(b.producto)).map((f) => (
                    <tr key={f.product_id} className={f.piezas === 0 ? "dim" : ""}>
                      <td><Link href={`/ventas/${f.product_id}`}>{f.producto}</Link>{f.agotadas > 0 && <span className="tag bad" style={{ marginLeft: 6 }}>{f.agotadas} tallas agotadas</span>}</td>
                      <td className="num">{f.grams != null ? dec1(f.grams) : f.cost_fixed ? "pza" : "—"}</td>
                      <td className="num">{f.grams != null ? `${f.oro_es_estimado ? "~" : ""}${num(f.precio_oro)}` : "—"}</td>
                      <td className={`num ${f.sin_costo ? "zero" : ""}`}>{f.sin_costo ? "falta" : mxn(f.costo_unitario)}</td>
                      <td className="num">{f.sin_costo ? "—" : mxn(f.precio_sugerido)}</td>
                      <td className="num"><b>{num(f.piezas)}</b></td>
                      <td className="num">{mxn(f.venta)}</td>
                      <td className="num">{mxn(Number(f.comision) + Number(f.envio) + Number(f.cupon))}</td>
                      <td className="num">{mxn(Number(f.ret_iva) + Number(f.ret_isr))}</td>
                      <td className="num">{mxn(f.recibido)}</td>
                      <td className="num">{f.recibido_pieza != null ? mxn(f.recibido_pieza) : "—"}</td>
                      <td className="num">{mxn(f.gastos)}</td>
                      <td className="num">{mxn(f.utilidad_bruta)}</td>
                      <td className="num">{mxn(f.insumos)}</td>
                      <td className="num">{f.publicidad > 0 ? mxn(f.publicidad) : "—"}</td>
                      <td className={`num ${f.utilidad_neta < 0 && f.piezas > 0 ? "zero" : ""}`}><b>{mxn(f.utilidad_neta)}</b></td>
                      <td className={`num ${f.roi != null && f.roi < 0 ? "zero" : ""}`}>{f.roi != null ? `${dec1(f.roi * 100)}%` : "—"}</td>
                      <td className="num">{num(f.stock_casa)}</td>
                      <td className="num">{num(f.stock_full)}{f.stock_transito > 0 ? <span className="muted"> +{num(f.stock_transito)}</span> : null}</td>
                      <td className="num">{num(f.stock_amazon)}</td>
                      <td className="num">{num(f.stock_total)}</td>
                      <td className="num">{mxn(f.valor_stock)}</td>
                    </tr>
                  ))}
                  <tr className="total">
                    <td>Total {titulo}</td><td></td><td></td><td></td><td></td>
                    <td className="num">{num(st.piezas)}</td><td className="num">{mxn(st.venta)}</td><td className="num">{mxn(st.comision + st.envio + st.cupon)}</td><td className="num">{mxn(st.impuestos)}</td><td className="num">{mxn(st.recibido)}</td>
                    <td className="num">{st.piezas > 0 ? mxn(st.recibido / st.piezas) : "—"}</td>
                    <td className="num">{mxn(st.gastos)}</td><td className="num">{mxn(st.utilidad_bruta)}</td><td className="num">{mxn(st.insumos)}</td><td className="num">{mxn(st.publicidad)}</td><td className="num">{mxn(st.utilidad_neta)}</td>
                    <td className="num">{st.gastos > 0 ? `${dec1((st.utilidad_neta / st.gastos) * 100)}%` : "—"}</td>
                    <td></td><td></td><td></td><td className="num">{num(st.stock_total)}</td><td className="num">{mxn(st.valor_stock)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {listaCargos.length > 0 && (
        <div className="card tight" style={{ marginBottom: 14 }}>
          <h2>Otros cargos de Mercado Libre · {mxn(otrosCargos)} <span className="muted">· de tu factura de ML; no se descuentan de cada venta, ML los cobra aparte</span></h2>
          <div className="tbl-wrap">
            <table className="compact">
              <thead><tr><th>Concepto</th><th>Clave</th><th className="num">Movimientos</th><th className="num">Importe</th></tr></thead>
              <tbody>
                {listaCargos.map((c) => (
                  <tr key={c.detail_sub_type ?? "?"}><td>{c.concepto ?? "—"}</td><td className="muted">{c.detail_sub_type ?? "—"}</td><td className="num">{num(c.n)}</td><td className="num">{mxn(c.amount)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div id="gastos" className="card" style={{ marginBottom: 14 }}>
        <h2>Otros gastos de {nombreMes(mes)} <span className="muted">· lo que no viene de Mercado Libre: cajas, sueldos, envíos, comisiones bancarias… Se restan en la utilidad final.</span></h2>
        {gastos.length > 0 && (
          <div className="tbl-wrap" style={{ marginBottom: 10 }}>
            <table className="compact">
              <thead><tr><th>Concepto</th><th>Nota</th><th className="num">Monto</th><th></th></tr></thead>
              <tbody>
                {gastos.map((g) => (
                  <tr key={g.id}>
                    <td>{g.concepto}</td><td className="muted">{g.nota ?? ""}</td><td className="num">{mxn(g.monto)}</td>
                    <td><form action={borrarGasto}><input type="hidden" name="id" value={g.id} /><input type="hidden" name="mes" value={mes} /><button className="btn small secondary" type="submit">Quitar</button></form></td>
                  </tr>
                ))}
                <tr className="total"><td>Total</td><td></td><td className="num">{mxn(totalGastosManuales)}</td><td></td></tr>
              </tbody>
            </table>
          </div>
        )}
        <form action={agregarGasto} className="inline" style={{ flexWrap: "wrap" }}>
          <input type="hidden" name="mes" value={mes} />
          <input name="concepto" placeholder="Concepto (p. ej. cajas, sueldo, envío)" required style={{ width: 240 }} />
          <input name="monto" type="number" step="1" min="1" placeholder="Monto" required style={{ width: 110 }} />
          <input name="nota" placeholder="Nota (opcional)" style={{ width: 200 }} />
          <button className="btn small" type="submit">Agregar gasto</button>
        </form>
      </div>

      <p className="muted">
        Cargos = comisión de Mercado Libre + envíos a tu cargo + cupones. Impuestos = retenciones de IVA e ISR que descuenta Mercado Pago. % ganancia = utilidad neta ÷ gasto en producto, como en tu hoja. La publicidad es el gasto real de Product Ads (sin IVA) de las publicaciones de cada producto; lo que te deposita Mercado Pago por venta no la incluye, así que no se descuenta dos veces.
        Los meses anteriores usan el precio del oro que tenías en el Excel; puedes corregirlo arriba y el mes se recalcula.
      </p>
    </>
  );
}

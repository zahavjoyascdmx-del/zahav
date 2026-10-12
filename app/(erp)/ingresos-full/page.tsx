import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fechaCorta, fechaHora, num, todayCdmx } from "@/lib/format";
import { aplicarEnviosFull } from "../bodega/actions";

export const dynamic = "force-dynamic";

type Op = {
  op_id: number; type: string; fecha: string; date_created: string; inbound_id: string | null; inventory_id: string; piezas: number;
  producto: string | null; color: string; talla: string; descontado: number | null; estado: string;
};

const ESTADO: Record<string, { label: string; tag: string }> = {
  restado: { label: "restado de bodega", tag: "ok" },
  parcial: { label: "restado en parte (bodega en 0)", tag: "warn" },
  deshecho: { label: "deshecho", tag: "neutral" },
  pendiente: { label: "por restar", tag: "warn" },
  antes_conteo: { label: "antes del conteo", tag: "neutral" },
};

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const mesMas = (m: string, d: number) => { const dt = new Date(`${m}-01T12:00:00Z`); dt.setUTCMonth(dt.getUTCMonth() + d); return dt.toISOString().slice(0, 7); };
const tallaNum = (t: string) => { const n = parseFloat(t.replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? n : 999; };

/** Registro de lo que Mercado Libre recibió en Full, por envío y por talla, para cuadrar contra ML. */
export default async function IngresosFullPage({ searchParams }: { searchParams: Promise<{ mes?: string; ver?: string }> }) {
  const { mes: mesParam, ver } = await searchParams;
  const hoy = todayCdmx();
  const mes = /^\d{4}-\d{2}$/.test(mesParam ?? "") ? mesParam! : hoy.slice(0, 7);
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_ingresos_full").select("*")
    .gte("fecha", `${mes}-01`).lt("fecha", `${mesMas(mes, 1)}-01`).order("date_created", { ascending: false });
  if (error) throw new Error(error.message);
  const ops = (data ?? []) as Op[];
  const entregas = ops.filter((o) => o.type === "TRANSFER_DELIVERY");
  const ajustes = ops.filter((o) => o.type !== "TRANSFER_DELIVERY");

  const porEnvio = new Map<string, Op[]>();
  for (const o of ops) { const k = o.inbound_id ?? "sin número"; porEnvio.set(k, [...(porEnvio.get(k) ?? []), o]); }
  const envios = [...porEnvio.entries()].map(([inbound, lista]) => ({
    inbound, lista,
    fecha: lista.reduce((a, o) => (o.date_created > a ? o.date_created : a), ""),
    recibidas: lista.filter((o) => o.type === "TRANSFER_DELIVERY").reduce((a, o) => a + o.piezas, 0),
    ajuste: lista.filter((o) => o.type !== "TRANSFER_DELIVERY").reduce((a, o) => a + o.piezas, 0),
  })).filter((e) => e.recibidas > 0 || e.ajuste !== 0).sort((a, b) => b.fecha.localeCompare(a.fecha));

  type Fila = { producto: string; color: string; talla: string; piezas: number; envios: Set<string> };
  const porTalla = new Map<string, Fila>();
  for (const o of entregas) {
    const k = `${o.producto ?? o.inventory_id}|${o.color}|${o.talla}`;
    const f = porTalla.get(k) ?? { producto: o.producto ?? `Sin producto (${o.inventory_id})`, color: o.color, talla: o.talla, piezas: 0, envios: new Set<string>() };
    f.piezas += o.piezas; f.envios.add(o.inbound_id ?? "—");
    porTalla.set(k, f);
  }
  const filas = [...porTalla.values()].sort((a, b) => a.producto.localeCompare(b.producto) || a.color.localeCompare(b.color) || tallaNum(a.talla) - tallaNum(b.talla));
  const porProducto = new Map<string, number>();
  for (const f of filas) porProducto.set(f.producto, (porProducto.get(f.producto) ?? 0) + f.piezas);

  const total = entregas.reduce((a, o) => a + o.piezas, 0);
  const restadas = entregas.reduce((a, o) => a + Number(o.descontado ?? 0), 0);
  const totalAjustes = ajustes.reduce((a, o) => a + o.piezas, 0);
  const vista = ver === "talla" ? "talla" : "envio";
  const href = (m: string, v = vista) => `/ingresos-full?mes=${m}${v === "talla" ? "&ver=talla" : ""}`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ingresos a Full</h1>
          <div className="muted">Lo que Mercado Libre recibió en Full, envío por envío y talla por talla, según sus registros de inventario. Compáralo con Mercado Libre → Full → Envíos. Desde el conteo del 12-oct, cada ingreso se resta solo de la <Link href="/bodega">bodega</Link>.</div>
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
          <div className="kpi"><div className="label">Piezas recibidas en Full</div><div className="value">{num(total)}</div><div className="sub">{nombreMes(mes)}</div></div>
          <div className="kpi"><div className="label">Envíos</div><div className="value">{num(envios.length)}</div><div className="sub">números de envío de ML</div></div>
          <div className="kpi"><div className="label">Tallas</div><div className="value">{num(filas.length)}</div><div className="sub">{num(porProducto.size)} productos</div></div>
          <div className="kpi"><div className="label">Restadas de bodega</div><div className="value">{num(restadas)}</div><div className="sub">lo recibido desde el conteo</div></div>
          {totalAjustes !== 0 && <div className="kpi"><div className="label">Ajustes de ML</div><div className="value">{totalAjustes > 0 ? "+" : ""}{num(totalAjustes)}</div><div className="sub">diferencias al revisar envíos</div></div>}
        </div>
      </div>

      <div className="chips" style={{ marginBottom: 10 }}>
        <Link className={`chip ${vista === "envio" ? "active" : ""}`} href={href(mes, "envio")}>Por envío</Link>
        <Link className={`chip ${vista === "talla" ? "active" : ""}`} href={href(mes, "talla")}>Por producto y talla</Link>
      </div>

      {ops.length === 0 && <div className="card"><p className="muted">Sin ingresos a Full registrados en {nombreMes(mes)}.</p></div>}

      {vista === "envio" && envios.map((e) => (
        <details key={e.inbound} className="card tight acc">
          <summary>
            <span className="acc-title"><b>Envío {e.inbound}</b><span className="muted">recibido {fechaHora(e.fecha)} · {e.lista.filter((o) => o.type === "TRANSFER_DELIVERY").length} tallas</span></span>
            <span className="acc-nums">
              <span><b>{num(e.recibidas)}</b><small>recibidas</small></span>
              {e.ajuste !== 0 && <span><b>{e.ajuste > 0 ? "+" : ""}{num(e.ajuste)}</b><small>ajuste ML</small></span>}
            </span>
          </summary>
          <div className="tbl-wrap">
            <table className="compact">
              <thead><tr><th>Fecha</th><th>Producto</th><th>Color</th><th>Talla</th><th className="num">Piezas</th><th>Bodega</th></tr></thead>
              <tbody>
                {e.lista.slice().sort((a, b) => (a.producto ?? "").localeCompare(b.producto ?? "") || a.color.localeCompare(b.color) || tallaNum(a.talla) - tallaNum(b.talla)).map((o) => (
                  <tr key={o.op_id}>
                    <td>{fechaCorta(o.fecha)}</td>
                    <td>{o.producto ?? <span className="tag warn">sin producto · {o.inventory_id}</span>}</td>
                    <td>{o.color || "—"}</td><td>{o.talla || "—"}</td>
                    <td className="num"><b>{o.type === "TRANSFER_DELIVERY" ? num(o.piezas) : `${o.piezas > 0 ? "+" : ""}${num(o.piezas)}`}</b></td>
                    <td>{o.type === "TRANSFER_DELIVERY"
                      ? <span className={`tag ${ESTADO[o.estado]?.tag ?? "neutral"}`}>{ESTADO[o.estado]?.label ?? o.estado}{o.estado === "parcial" ? ` · ${num(o.descontado ?? 0)}` : ""}</span>
                      : <span className="muted">ajuste de ML (no toca bodega)</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}

      {vista === "talla" && filas.length > 0 && (
        <div className="card tight">
          <div className="tbl-wrap">
            <table className="compact">
              <thead><tr><th>Producto</th><th>Color</th><th>Talla</th><th className="num">Piezas recibidas</th><th>Envíos</th></tr></thead>
              <tbody>
                {filas.map((f, i) => (
                  <tr key={`${f.producto}|${f.color}|${f.talla}`}>
                    <td>{i === 0 || filas[i - 1].producto !== f.producto ? <b>{f.producto} <span className="muted">· {num(porProducto.get(f.producto))}</span></b> : ""}</td>
                    <td>{f.color || "—"}</td><td>{f.talla || "—"}</td>
                    <td className="num"><b>{num(f.piezas)}</b></td>
                    <td className="muted" style={{ whiteSpace: "normal" }}>{[...f.envios].join(", ")}</td>
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

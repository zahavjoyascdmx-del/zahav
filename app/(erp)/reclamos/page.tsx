import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Kpi } from "@/components/Kpi";
import { fechaCorta, fechaHora, num, pct } from "@/lib/format";
import { plan, UMBRALES, type Reclamo } from "@/lib/reclamos";
import { sincronizarReclamos } from "./actions";

export const dynamic = "force-dynamic";

const AFECTA: Record<string, [string, string]> = {
  si: ["bad", "Afecta"], evitable: ["warn", "Evitable 48 h"], no: ["ok", "No afecta"], desconocido: ["neutral", "Sin dato"],
};

function restante(iso: string | null) {
  if (!iso) return "";
  const h = (new Date(iso).getTime() - Date.now()) / 3600_000;
  if (h < 0) return "vencido";
  return h < 48 ? `${Math.floor(h)} h` : `${Math.floor(h / 24)} d`;
}

export default async function ReclamosPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { ver } = await searchParams;
  const supabase = await createClient();
  const [rep, claims, estado, sinApi] = await Promise.all([
    supabase.from("meli_reputation").select("*").order("fecha", { ascending: false }).limit(30),
    supabase.from("v_reclamos").select("*").order("prioridad").order("due_date", { ascending: true, nullsFirst: false }).limit(300),
    supabase.from("settings").select("value").eq("key", "meli_claims_estado").maybeSingle(),
    // Respaldo mientras no haya permiso: órdenes de 60 días que traen un reclamo (mediations).
    supabase.from("meli_orders").select("order_id, fecha, status, buyer_nickname, raw->mediations")
      .gte("date_created", new Date(Date.now() - 60 * 86400_000).toISOString()).not("raw->mediations", "is", null)
      .order("date_created", { ascending: false }).limit(400),
  ]);
  const hoy = rep.data?.[0];
  const rows = (claims.data ?? []) as Reclamo[];
  const abiertos = rows.filter((r) => r.status === "opened");
  const lista = ver === "cerrados" ? rows.filter((r) => r.status !== "opened") : abiertos;
  const sinPermiso = estado.data?.value === "sin_permiso" || (!rows.length && estado.data?.value !== "ok");
  const conReclamo = (sinApi.data ?? []).filter((o) => Array.isArray(o.mediations) && o.mediations.length);

  const ventas = Number(hoy?.ventas_60 ?? 0);
  const realRate = Number(hoy?.reclamos_real_rate ?? 0);
  const realN = Number(hoy?.reclamos_real ?? 0);
  const verdeMax = Math.floor(ventas * 0.015);
  const nivelReal = UMBRALES.find((u) => realRate <= u.max)?.nivel ?? "Rojo";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reclamos</h1>
          <div className="muted">Se revisan cada 30 minutos. Lo urgente arriba: reclamos que afectan y tienen plazo corriendo.</div>
        </div>
        <form action={sincronizarReclamos}><button className="btn secondary" type="submit">Actualizar ahora</button></form>
      </div>

      {sinPermiso && (
        <div className="notice" style={{ marginBottom: 14 }}>
          <b>Mercado Libre no deja leer los reclamos por API (403).</b> A la app «ERP Zahav» le falta el permiso de post venta. Para activarlo:
          <ol style={{ margin: "6px 0 0", paddingLeft: 20 }}>
            <li>Entra a developers.mercadolibre.com.mx → Mis aplicaciones → ERP Zahav → Editar.</li>
            <li>En Permisos, activa <b>Comunicaciones post venta</b> (lectura y escritura) y guarda.</li>
            <li>Vuelve a autorizar la app con la cuenta ZAHAVMX (el mismo enlace de autorización que se usó al conectar) para que el token traiga el permiso nuevo.</li>
          </ol>
          Mientras tanto abajo están las órdenes con reclamo según las órdenes de ML ({num(conReclamo.length)} en 60 días).
        </div>
      )}

      {hoy && (
        <div className="grid grid-4" style={{ marginBottom: 14 }}>
          <Kpi label="Reclamos que cuentan (60 d)" value={`${num(realN)} · ${pct(realRate)}`} sub={`de ${num(ventas)} ventas · nivel real ${nivelReal}`} />
          <Kpi label="Máximo para verde (1.5%)" value={num(verdeMax)} sub={realN > verdeMax ? `te sobran ${num(realN - verdeMax)} reclamos` : `margen de ${num(verdeMax - realN)}`} />
          <Kpi label="Color que ves / real" value={`${hoy.level_id ?? "—"}`} sub={`real: ${hoy.real_level ?? "—"}`} />
          <Kpi label="Protección termina" value={hoy.protection_end_date ? fechaCorta(hoy.protection_end_date) : "—"} sub="después se ve la reputación real" />
        </div>
      )}

      <div className="chips" style={{ marginBottom: 10 }}>
        <Link href="/reclamos" className={`chip ${ver !== "cerrados" ? "active" : ""}`}>Abiertos ({abiertos.length})</Link>
        <Link href="/reclamos?ver=cerrados" className={`chip ${ver === "cerrados" ? "active" : ""}`}>Cerrados ({rows.length - abiertos.length})</Link>
      </div>

      {rows.length > 0 && (
        <div className="card tight" style={{ marginBottom: 14 }}>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Reclamo</th><th>Caso</th><th>Reputación</th><th>Etapa</th><th>Le toca</th><th>Plazo</th><th>Producto</th><th>Comprador</th><th>Último mensaje</th></tr></thead>
              <tbody>
                {lista.map((r) => {
                  const p = plan(r);
                  const [cls, label] = AFECTA[p.afecta];
                  return (
                    <tr key={r.claim_id}>
                      <td><Link href={`/reclamos/${r.claim_id}`}>{r.claim_id}</Link><div className="muted">{fechaCorta(r.date_created)}</div></td>
                      <td>{p.titulo}</td>
                      <td><span className={`tag ${cls}`}>{label}</span></td>
                      <td>{r.stage === "dispute" ? "Mediación" : r.stage === "claim" ? "Reclamo" : r.stage}</td>
                      <td>{r.action_responsible === "seller" ? <b>Nosotros</b> : r.action_responsible === "buyer" ? "Comprador" : r.action_responsible === "mediator" ? "ML" : "—"}</td>
                      <td className={restante(r.due_date) === "vencido" || (r.due_date && new Date(r.due_date).getTime() - Date.now() < 24 * 3600_000) ? "zero" : ""}>{r.due_date ? `${restante(r.due_date)} · ${fechaHora(r.due_date)}` : "—"}</td>
                      <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>{r.titulo ?? "—"}{r.variante ? <div className="muted">{r.variante}</div> : null}</td>
                      <td>{r.buyer_nickname ?? "—"}</td>
                      <td>{r.last_message_role === "complainant" ? <span className="tag warn">Comprador espera</span> : r.last_message_at ? fechaHora(r.last_message_at) : "—"}</td>
                    </tr>
                  );
                })}
                {!lista.length && <tr><td colSpan={9} className="muted">Sin reclamos.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sinPermiso && (
        <div className="card tight">
          <h2>Órdenes con reclamo (respaldo, 60 días)</h2>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Orden</th><th>Fecha</th><th>Estado</th><th>Comprador</th><th>Reclamo</th></tr></thead>
              <tbody>
                {conReclamo.map((o) => (
                  <tr key={o.order_id}>
                    <td><a href={`https://www.mercadolibre.com.mx/ventas/${o.order_id}/detalle`} target="_blank" rel="noreferrer">{o.order_id}</a></td>
                    <td>{fechaCorta(o.fecha)}</td>
                    <td>{o.status === "cancelled" ? "Cancelada" : o.status === "paid" ? "Pagada" : o.status}</td>
                    <td>{o.buyer_nickname}</td>
                    <td>{(o.mediations as { id: number }[]).map((m) => m.id).join(", ")}</td>
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

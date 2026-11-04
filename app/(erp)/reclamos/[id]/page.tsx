import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fechaCorta, fechaHora, mxn } from "@/lib/format";
import { ACCIONES, MOTIVOS_REVISION, plan, puede, type Reclamo } from "@/lib/reclamos";
import { accionReclamo } from "../actions";

export const dynamic = "force-dynamic";

const ROL: Record<string, string> = { complainant: "Comprador", respondent: "Nosotros", mediator: "Mercado Libre" };
const ERRORES: Record<string, string> = {
  confirmar: "Marca la casilla de confirmación para ejecutar esa acción.",
  mensaje: "Escribe el mensaje.",
  accion: "Acción no válida.",
};

export default async function ReclamoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params;
  const { ok, error } = await searchParams;
  const supabase = await createClient();
  const [c, acts] = await Promise.all([
    supabase.from("v_reclamos").select("*").eq("claim_id", Number(id)).maybeSingle(),
    supabase.from("meli_claim_actions").select("*").eq("claim_id", Number(id)).order("id", { ascending: false }).limit(20),
  ]);
  if (!c.data) notFound();
  const r = c.data as Reclamo;
  const p = plan(r);
  const enDisputa = r.stage === "dispute";
  const abierto = r.status === "opened";
  const paraComprador = abierto && !enDisputa && puede(r, "send_message_to_complainant");
  const paraMediador = abierto && puede(r, "send_message_to_mediator");
  const revision = puede(r, "return_review_ok") || puede(r, "return_review_fail") || puede(r, "return_review");

  return (
    <>
      <div className="page-head">
        <div>
          <div className="muted"><Link href="/reclamos">← Reclamos</Link></div>
          <h1>{p.titulo} · {r.claim_id}</h1>
          <div className="muted">
            Orden <a href={`https://www.mercadolibre.com.mx/ventas/${r.order_id}/detalle`} target="_blank" rel="noreferrer">{r.order_id}</a> · {r.buyer_nickname} · {fechaCorta(r.fecha)} · {mxn(r.total_amount)}
          </div>
        </div>
      </div>

      {ok && <div className="notice" style={{ marginBottom: 12 }}>Acción «{ok}» enviada a la cola; se ejecuta en segundos. Recarga para ver el resultado.</div>}
      {error && <div className="error" style={{ marginBottom: 12 }}>{ERRORES[error] ?? error}</div>}

      <div className="grid grid-2" style={{ marginBottom: 14 }}>
        <div className="card">
          <h2>Estrategia</h2>
          <p style={{ marginTop: 0 }}>
            <span className={`tag ${p.afecta === "si" ? "bad" : p.afecta === "evitable" ? "warn" : p.afecta === "no" ? "ok" : "neutral"}`}>
              {p.afecta === "si" ? "Afecta la reputación" : p.afecta === "evitable" ? `No afecta si se resuelve antes del ${fechaHora(r.incentive_due_date ?? r.due_date)}` : p.afecta === "no" ? "No afecta la reputación" : "ML aún no dice si afecta"}
            </span>
          </p>
          {p.resumen && <p className="muted">{p.resumen}</p>}
          <ol style={{ paddingLeft: 20, margin: 0, display: "grid", gap: 6, fontSize: 14 }}>
            {p.pasos.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </div>
        <div className="card">
          <h2>Datos del caso</h2>
          <table>
            <tbody>
              <tr><td>Producto</td><td style={{ whiteSpace: "normal" }}>{r.titulo}{r.variante ? ` · ${r.variante}` : ""}</td></tr>
              <tr><td>Motivo</td><td style={{ whiteSpace: "normal" }}>{r.reason_name ?? r.reason_id}{r.reason_detail ? ` · ${r.reason_detail}` : ""}</td></tr>
              {r.detail_description && <tr><td>Detalle ML</td><td style={{ whiteSpace: "normal" }}>{r.detail_description}</td></tr>}
              <tr><td>Etapa</td><td>{enDisputa ? "Mediación" : r.stage} · {r.status}</td></tr>
              <tr><td>Le toca</td><td>{ROL[r.action_responsible === "seller" ? "respondent" : r.action_responsible === "buyer" ? "complainant" : "mediator"] ?? "—"}{r.due_date ? ` · vence ${fechaHora(r.due_date)}` : ""}</td></tr>
              <tr><td>Envío</td><td>{r.logistic_type === "fulfillment" ? "Full (ML)" : r.logistic_type} · {r.envio_status}{r.envio_substatus ? ` / ${r.envio_substatus}` : ""}</td></tr>
              <tr><td>Entregado</td><td>{r.date_delivered ? fechaHora(r.date_delivered) : "—"}</td></tr>
              <tr><td>Acciones posibles</td><td style={{ whiteSpace: "normal" }}>{(r.seller_actions ?? []).map((a) => ACCIONES[a.action] ?? a.action).join(" · ") || "—"}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h2>Conversación</h2>
        {(r.messages ?? []).length === 0 && <p className="muted">Sin mensajes.</p>}
        <div style={{ display: "grid", gap: 8 }}>
          {(r.messages ?? []).map((m, i) => (
            <div key={i} style={{ background: m.sender_role === "respondent" ? "var(--calm-bg)" : "#f6f7f6", borderRadius: 8, padding: "8px 12px", fontSize: 14 }}>
              <div className="muted">{ROL[m.sender_role] ?? m.sender_role} → {ROL[m.receiver_role] ?? m.receiver_role} · {fechaHora(m.date_created)}</div>
              <div style={{ whiteSpace: "pre-wrap" }}>{m.message}</div>
              {m.attachments?.length ? <div className="muted">📎 {m.attachments.map((a) => a.original_filename ?? a.filename).join(", ")}</div> : null}
            </div>
          ))}
        </div>
      </div>

      {(paraComprador || paraMediador) && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h2>Responder</h2>
          <p className="muted" style={{ marginTop: 0 }}>Elige una plantilla, ajústala y completa lo que esté entre corchetes. Solo afirma lo que puedas demostrar; adjunta fotos (JPG/PNG/PDF, 5 MB máx.).</p>
          {p.plantillas.map((t, i) => (
            <details key={i} className="acc" style={{ border: "1px solid var(--line)", borderRadius: 8 }}>
              <summary><span className="acc-title"><b>{t.nombre}</b></span></summary>
              <form action={accionReclamo} className="form" style={{ padding: "0 16px 14px" }}>
                <input type="hidden" name="claim_id" value={r.claim_id} />
                <input type="hidden" name="action" value="send_message" />
                <input type="hidden" name="receiver_role" value={t.para} />
                <textarea name="message" rows={6} defaultValue={t.texto} maxLength={2000} style={{ padding: 10, borderRadius: 8, border: "1px solid var(--line)", font: "inherit" }} />
                <input type="file" name="files" multiple accept="image/jpeg,image/png,application/pdf" />
                <button className="btn" type="submit">Enviar a {ROL[t.para]}</button>
              </form>
            </details>
          ))}
          <details className="acc" open={!p.plantillas.length} style={{ border: "1px solid var(--line)", borderRadius: 8 }}>
            <summary><span className="acc-title"><b>Mensaje libre</b></span></summary>
            <form action={accionReclamo} className="form" style={{ padding: "0 16px 14px" }}>
              <input type="hidden" name="claim_id" value={r.claim_id} />
              <input type="hidden" name="action" value="send_message" />
              <select name="receiver_role" defaultValue={paraComprador ? "complainant" : "mediator"}>
                {paraComprador && <option value="complainant">Comprador</option>}
                {paraMediador && <option value="mediator">Mediador de Mercado Libre</option>}
              </select>
              <textarea name="message" rows={5} maxLength={2000} style={{ padding: 10, borderRadius: 8, border: "1px solid var(--line)", font: "inherit" }} />
              <input type="file" name="files" multiple accept="image/jpeg,image/png,application/pdf" />
              <button className="btn" type="submit">Enviar</button>
            </form>
          </details>
        </div>
      )}

      {abierto && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h2>Resolver</h2>
          <div className="chips">
            {puede(r, "allow_return") && <AccionConfirmada id={r.claim_id} action="allow_return" label="Aceptar devolución" nota="ML genera la guía; el reembolso se libera cuando el paquete se envía o llega." />}
            {puede(r, "allow_partial_refund") && (
              <form action={accionReclamo} className="inline">
                <input type="hidden" name="claim_id" value={r.claim_id} />
                <input type="hidden" name="action" value="partial_refund" />
                <select name="percentage" defaultValue="20">{[10, 20, 30, 40, 50, 60, 70, 80, 90].map((v) => <option key={v} value={v}>{v}%</option>)}</select>
                <label className="muted"><input type="checkbox" name="confirmo" value="si" /> confirmo</label>
                <button className="btn secondary" type="submit">Ofrecer reembolso parcial</button>
              </form>
            )}
            {puede(r, "refund") && <AccionConfirmada id={r.claim_id} action="refund" label="Reembolsar total" nota="Cierra el reclamo y devuelve el dinero al comprador." />}
            {puede(r, "open_dispute") && <AccionConfirmada id={r.claim_id} action="open_dispute" label="Abrir mediación" nota="Solo con evidencia de nuestro lado: una mediación perdida sí cuenta." />}
          </div>
        </div>
      )}

      {revision && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h2>Revisar devolución</h2>
          <p className="muted" style={{ marginTop: 0 }}>Revisa la pieza al llegar y antes del plazo. Si llegó bien, márcala OK. Si llegó dañada, incompleta o distinta, márcala con problema y adjunta fotos: ML protege el dinero.</p>
          <div className="grid grid-2">
            <form action={accionReclamo}>
              <input type="hidden" name="claim_id" value={r.claim_id} />
              <input type="hidden" name="action" value="return_review_ok" />
              <button className="btn secondary" type="submit">Llegó bien</button>
            </form>
            <form action={accionReclamo} className="form">
              <input type="hidden" name="claim_id" value={r.claim_id} />
              <input type="hidden" name="action" value="return_review_fail" />
              <select name="reason">{MOTIVOS_REVISION.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <textarea name="message" rows={3} placeholder="Qué llegó y en qué estado (p. ej. sin sello de kilataje, otra pieza, piedra faltante, deformada por uso)" style={{ padding: 10, borderRadius: 8, border: "1px solid var(--line)", font: "inherit" }} />
              <input type="file" name="files" multiple accept="image/jpeg,image/png,application/pdf" />
              <button className="btn" type="submit">Reportar problema</button>
            </form>
          </div>
        </div>
      )}

      {(acts.data ?? []).length > 0 && (
        <div className="card tight">
          <h2>Acciones desde el ERP</h2>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Fecha</th><th>Acción</th><th>Estado</th><th>Quién</th><th>Detalle</th></tr></thead>
              <tbody>
                {(acts.data ?? []).map((a) => (
                  <tr key={a.id}>
                    <td>{fechaHora(a.created_at)}</td>
                    <td>{a.action}</td>
                    <td><span className={`tag ${a.status === "enviada" ? "ok" : a.status === "error" ? "bad" : "neutral"}`}>{a.status}</span></td>
                    <td>{a.created_by}</td>
                    <td style={{ whiteSpace: "normal", maxWidth: 420 }}>{a.error ?? (a.payload?.message ? String(a.payload.message).slice(0, 120) : "")}</td>
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

function AccionConfirmada({ id, action, label, nota }: { id: number; action: string; label: string; nota: string }) {
  return (
    <form action={accionReclamo} className="inline" title={nota}>
      <input type="hidden" name="claim_id" value={id} />
      <input type="hidden" name="action" value={action} />
      <label className="muted"><input type="checkbox" name="confirmo" value="si" /> confirmo</label>
      <button className="btn secondary" type="submit">{label}</button>
    </form>
  );
}

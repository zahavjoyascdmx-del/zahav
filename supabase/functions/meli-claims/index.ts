// Edge Function: reclamos de Mercado Libre.
// POST { kind: "sync" | "actions" | "reputation" | "all" } con el header x-sync-key.
//  * sync: reclamos abiertos + los de los últimos 90 días (detalle, si afectan la reputación, mensajes, devoluciones)
//          y el envío fresco de cada orden reclamada (fecha de entrega = evidencia).
//  * actions: ejecuta las acciones pendientes de meli_claim_actions (mensajes, disputa, devolución, reembolso, revisión).
//  * reputation: guarda la foto del día de la reputación (/users/me).
// Requiere el permiso "Comunicaciones post venta" en la app de ML; sin él la API responde 403.
import { createClient } from "npm:@supabase/supabase-js@2.49.0";

// deno-lint-ignore no-explicit-any
type Any = any;
type Creds = { app_id: string; client_secret: string; meli_user_id: number; access_token: string | null; refresh_token: string | null; expires_at: string | null };

const API = "https://api.mercadolibre.com";
const DEADLINE_MS = 120_000;
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
let startedAt = Date.now();
const timeLeft = () => DEADLINE_MS - (Date.now() - startedAt);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const cdmxDate = (d = new Date()) => new Date(d.getTime() - 6 * 3600_000).toISOString().slice(0, 10);

// ---------------------------------------------------------------- credenciales (igual que meli-sync)
let creds: Creds | null = null;
async function loadCreds(): Promise<Creds> {
  const { data, error } = await sb.rpc("meli_get_credentials");
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) throw new Error("Sin credenciales de MELI: " + (error?.message ?? "tabla vacía"));
  creds = row as Creds;
  return creds;
}
async function refreshToken(): Promise<string> {
  // El refresh_token es de un solo uso: releer por si meli-sync lo acaba de renovar.
  const c = await loadCreds();
  if (c.access_token && c.expires_at && new Date(c.expires_at).getTime() - Date.now() > 30 * 60_000) return c.access_token;
  const res = await fetch(API + "/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: c.app_id, client_secret: c.client_secret, refresh_token: c.refresh_token ?? "" }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error("No se pudo renovar el token de MELI: " + JSON.stringify(body));
  const expires = new Date(Date.now() + (body.expires_in ?? 21600) * 1000).toISOString();
  const { error } = await sb.rpc("meli_save_tokens", { p_access: body.access_token, p_refresh: body.refresh_token, p_expires: expires });
  if (error) throw new Error("No se pudieron guardar los tokens: " + error.message);
  creds = { ...c, access_token: body.access_token, refresh_token: body.refresh_token, expires_at: expires };
  return body.access_token;
}
async function getToken(): Promise<string> {
  const c = creds ?? (await loadCreds());
  if (c.access_token && c.expires_at && new Date(c.expires_at).getTime() - Date.now() > 5 * 60_000) return c.access_token;
  return await refreshToken();
}

class MeliError extends Error {
  constructor(public status: number, public path: string, public body: string) {
    super(`MELI ${status} ${path}: ${body.slice(0, 300)}`);
  }
}

async function meli(method: string, path: string, body?: unknown, attempt = 0): Promise<Any> {
  const token = await getToken();
  const res = await fetch(path.startsWith("http") ? path : API + path, {
    method,
    headers: { Authorization: "Bearer " + token, Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && attempt === 0) { await refreshToken(); return meli(method, path, body, 1); }
  if ((res.status === 429 || res.status >= 500) && attempt < 3 && method === "GET") { await sleep(800 * (attempt + 1)); return meli(method, path, body, attempt + 1); }
  const text = await res.text();
  if (!res.ok) throw new MeliError(res.status, path, text);
  try { return text ? JSON.parse(text) : null; } catch { return text; }
}
const get = (p: string) => meli("GET", p);
/** GET que devuelve null en 404 (recurso que no aplica a ese reclamo). */
const getOpt = async (p: string) => { try { return await get(p); } catch (e) { if (e instanceof MeliError && e.status === 404) return null; throw e; } };

async function setEstado(v: string) {
  await sb.from("settings").upsert({ key: "meli_claims_estado", value: v as unknown as Any });
}

// ---------------------------------------------------------------- reputación
async function syncReputation(stats: Any) {
  const me = await get("/users/me");
  const r = me?.seller_reputation ?? {};
  const m = r.metrics ?? {};
  const row = (k: string) => ({
    v: m[k]?.value ?? null, r: m[k]?.rate ?? null,
    rv: m[k]?.excluded?.real_value ?? m[k]?.value ?? null, rr: m[k]?.excluded?.real_rate ?? m[k]?.rate ?? null,
  });
  const cl = row("claims"), de = row("delayed_handling_time"), ca = row("cancellations");
  const { error } = await sb.from("meli_reputation").upsert({
    fecha: cdmxDate(), level_id: r.level_id ?? null, real_level: r.real_level ?? null, power_seller_status: r.power_seller_status ?? null,
    protection_end_date: r.protection_end_date ?? null, ventas_60: m.sales?.completed ?? null,
    reclamos: cl.v, reclamos_rate: cl.r, reclamos_real: cl.rv, reclamos_real_rate: cl.rr,
    demoras: de.v, demoras_rate: de.r, demoras_real: de.rv, demoras_real_rate: de.rr,
    canceladas: ca.v, canceladas_rate: ca.r, canceladas_real: ca.rv, canceladas_real_rate: ca.rr,
    raw: r, synced_at: new Date().toISOString(),
  });
  if (error) throw new Error("reputación: " + error.message);
  stats.reputacion = { nivel: r.level_id, real: r.real_level, reclamos_real: cl.rv };
}

// ---------------------------------------------------------------- reclamos
const reasonCache = new Map<string, Any>();
async function reason(id: string | null) {
  if (!id) return null;
  if (!reasonCache.has(id)) reasonCache.set(id, await getOpt(`/post-purchase/v1/claims/reasons/${id}`).catch(() => null));
  return reasonCache.get(id);
}

function sellerActions(c: Any): Any[] {
  const p = (c.players ?? []).find((x: Any) => x.role === "respondent" || x.type === "seller");
  return p?.available_actions ?? [];
}

async function claimIds(stats: Any): Promise<number[]> {
  const ids = new Set<number>();
  // 1) Abiertos (todos) y 2) recientes, por la búsqueda de la API.
  // La doc recomienda filtrar siempre por el vendedor como respondent (status=opened solo es caro y pega con el rate limit).
  const me = `players.role=respondent&players.user_id=${creds!.meli_user_id}`;
  const since = new Date(Date.now() - 90 * 86400_000).toISOString().replace("Z", "-0000");
  for (const q of [`${me}&status=opened`, `${me}&range=date_created:after:${since}&sort=date_created:desc`]) {
    try {
      for (let offset = 0; offset < 2000 && timeLeft() > 60_000; offset += 100) {
        const r = await get(`/post-purchase/v1/claims/search?${q}&limit=100&offset=${offset}`);
        const data: Any[] = r?.data ?? [];
        for (const c of data) ids.add(Number(c.id));
        if (data.length < 100) break;
      }
    } catch (e) {
      // 403 = sin permiso: lo maneja syncClaims. Otro error (p. ej. formato de range): seguir con lo que haya.
      if (e instanceof MeliError && e.status === 403) throw e;
      stats.busqueda_error = String(e).slice(0, 300);
    }
  }
  // 3) Los que traen las órdenes (mediations) y aún no tenemos o siguen abiertos.
  const { data: ords } = await sb.from("meli_orders").select("raw->mediations").gte("date_created", new Date(Date.now() - 90 * 86400_000).toISOString()).not("raw->mediations", "is", null);
  const { data: known } = await sb.from("meli_claims").select("claim_id,status");
  const closed = new Set((known ?? []).filter((k) => k.status === "closed").map((k) => Number(k.claim_id)));
  for (const o of (ords ?? []) as Any[]) for (const m of (o.mediations ?? [])) if (m?.id && !closed.has(Number(m.id))) ids.add(Number(m.id));
  stats.reclamos_encontrados = ids.size;
  return [...ids];
}

async function syncClaim(id: number, prev: Map<number, string>) {
  const c = await get(`/post-purchase/v1/claims/${id}`);
  // Un reclamo cerrado que ya teníamos cerrado no cambia: no gastar llamadas.
  if (c.status === "closed" && prev.get(id) === "closed") return;
  const [aff, det, msgs, rs, rets] = await Promise.all([
    getOpt(`/post-purchase/v1/claims/${id}/affects-reputation`).catch(() => null),
    getOpt(`/post-purchase/v1/claims/${id}/detail`).catch(() => null),
    getOpt(`/post-purchase/v1/claims/${id}/messages`).catch(() => null),
    reason(c.reason_id),
    (c.related_entities ?? []).includes("return") ? getOpt(`/post-purchase/v2/claims/${id}/returns`).catch(() => null) : Promise.resolve(null),
  ]);
  const actions = sellerActions(c);
  const dues = actions.map((a: Any) => a.due_date).filter(Boolean).sort();
  const messages: Any[] = Array.isArray(msgs) ? msgs : (msgs?.data ?? msgs?.messages ?? []);
  messages.sort((a, b) => String(a.date_created).localeCompare(String(b.date_created)));
  const last = messages[messages.length - 1];
  const orderId = c.resource === "order" || !c.resource ? Number(c.resource_id) : null;

  const { error } = await sb.from("meli_claims").upsert({
    claim_id: id, order_id: orderId, resource: c.resource ?? null, type: c.type ?? null, stage: c.stage ?? null, status: c.status ?? null,
    reason_id: c.reason_id ?? null, reason_name: rs?.name ?? null, reason_detail: rs?.detail ?? null, fulfilled: c.fulfilled ?? null,
    affects_reputation: aff?.affects_reputation ?? null, has_incentive: aff?.has_incentive ?? null, incentive_due_date: aff?.due_date ?? null,
    seller_actions: actions, due_date: dues[0] ?? null,
    action_responsible: det?.action_responsible ?? null, detail_title: det?.title ?? null, detail_description: det?.description ?? null,
    resolution: c.resolution ?? null, related_entities: c.related_entities ?? null, returns: rets,
    messages: messages.slice(-60), last_message_at: last?.date_created ?? null, last_message_role: last?.sender_role ?? null,
    date_created: c.date_created ?? null, last_updated: c.last_updated ?? null, raw: c, synced_at: new Date().toISOString(),
  });
  if (error) throw new Error(`meli_claims ${id}: ${error.message}`);

  // Envío fresco de la orden: el estado y la fecha de entrega son la evidencia principal.
  if (orderId && c.status === "opened") {
    const { data: o } = await sb.from("meli_orders").select("shipping_id").eq("order_id", orderId).maybeSingle();
    if (o?.shipping_id) {
      const s = await getOpt(`/shipments/${o.shipping_id}`).catch(() => null);
      if (s) {
        await sb.from("meli_shipments").update({
          status: s.status ?? null, substatus: s.substatus ?? null,
          // undefined = no tocar la columna si ML no trae el dato
          date_shipped: s.status_history?.date_shipped ?? undefined, date_delivered: s.status_history?.date_delivered ?? undefined,
          synced_at: new Date().toISOString(),
        }).eq("shipment_id", o.shipping_id);
      }
    }
  }
}

async function syncClaims(stats: Any, errors: string[]) {
  let ids: number[];
  try {
    ids = await claimIds(stats);
  } catch (e) {
    if (e instanceof MeliError && e.status === 403) {
      await setEstado("sin_permiso");
      stats.reclamos = "sin permiso: activa 'Comunicaciones post venta' en la app de ML y vuelve a autorizar";
      return;
    }
    throw e;
  }
  const { data: known } = await sb.from("meli_claims").select("claim_id,status");
  const prev = new Map((known ?? []).map((k) => [Number(k.claim_id), String(k.status)]));
  let ok = 0, i = 0;
  const workers = Array.from({ length: 4 }, async () => {
    while (i < ids.length && timeLeft() > 8_000) {
      const id = ids[i++];
      try { await syncClaim(id, prev); ok++; } catch (e) { errors.push(String(e).slice(0, 300)); }
    }
  });
  await Promise.all(workers);
  stats.reclamos_sincronizados = ok;
  await setEstado(errors.length && !ok ? "error" : "ok");
}

// ---------------------------------------------------------------- acciones
/** Sube a ML los archivos que el ERP dejó en Storage (bucket reclamos) y devuelve los filenames que da ML. */
async function uploadFiles(claimId: number, paths: string[], target: "message" | "return"): Promise<string[]> {
  const out: string[] = [];
  for (const path of paths ?? []) {
    const { data: blob, error } = await sb.storage.from("reclamos").download(path);
    if (error || !blob) throw new Error(`No se pudo leer ${path}: ${error?.message}`);
    if (blob.size > 5 * 1024 * 1024) throw new Error(`${path} pasa de 5 MB (límite de ML)`);
    const name = (path.split("/").pop() ?? "evidencia").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
    const fd = new FormData();
    fd.append("file", blob, name);
    const url = target === "return" ? `/post-purchase/v1/claims/${claimId}/returns/attachments` : `/post-purchase/v1/claims/${claimId}/attachments`;
    const token = await getToken();
    const res = await fetch(API + url, { method: "POST", headers: { Authorization: "Bearer " + token, Accept: "application/json" }, body: fd });
    const text = await res.text();
    if (!res.ok) throw new MeliError(res.status, url, text);
    const j = JSON.parse(text);
    out.push(j.filename ?? j.file_name);
  }
  return out;
}

async function runAction(a: Any): Promise<Any> {
  const id = a.claim_id;
  const p = a.payload ?? {};
  switch (a.action) {
    case "send_message": {
      const role = p.receiver_role === "mediator" ? "mediator" : "complainant";
      const message = String(p.message ?? "").trim();
      if (!message) throw new Error("Mensaje vacío");
      if (message.length > 2000) throw new Error("El mensaje pasa de 2000 caracteres");
      const attachments = await uploadFiles(id, p.files ?? [], "message");
      return await meli("POST", `/post-purchase/v1/claims/${id}/actions/send-message`, { receiver_role: role, message, attachments });
    }
    case "open_dispute":
      return await meli("POST", `/post-purchase/v1/claims/${id}/actions/open-dispute`);
    case "allow_return":
      return await meli("POST", `/post-purchase/v1/claims/${id}/expected-resolutions/allow-return`);
    case "refund":
      return await meli("POST", `/post-purchase/v1/claims/${id}/expected-resolutions/refund`);
    case "partial_refund": {
      const pct = Number(p.percentage);
      if (!(pct > 0 && pct < 100)) throw new Error("Porcentaje inválido");
      return await meli("POST", `/post-purchase/v1/claims/${id}/expected-resolutions/partial-refund`, { percentage: pct });
    }
    case "return_review_ok":
    case "return_review_fail": {
      const { data: c } = await sb.from("meli_claims").select("returns").eq("claim_id", id).maybeSingle();
      const returnId = c?.returns?.id ?? c?.returns?.[0]?.id;
      if (!returnId) throw new Error("El reclamo no tiene devolución para revisar");
      if (a.action === "return_review_ok") return await meli("POST", `/post-purchase/v1/returns/${returnId}/return-review`, {});
      // SRF2 dañado · SRF3 incompleto · SRF4 producto distinto · SRF5 no venía en el paquete · SRF6 otro · SRF7 no llegó
      const reason = String(p.reason ?? "");
      if (!/^SRF[2-7]$/.test(reason)) throw new Error("Motivo de revisión inválido");
      if ((reason === "SRF2" || reason === "SRF4") && !(p.files ?? []).length) throw new Error("Para dañado o producto distinto ML exige fotos");
      const attachments = await uploadFiles(id, p.files ?? [], "return");
      return await meli("POST", `/post-purchase/v1/returns/${returnId}/return-review`, [{ reason, message: String(p.message ?? ""), attachments }]);
    }
    default:
      throw new Error("Acción desconocida: " + a.action);
  }
}

async function runActions(stats: Any, errors: string[]) {
  const { data } = await sb.from("meli_claim_actions").select("*").eq("status", "pendiente").order("id").limit(20);
  let done = 0;
  const touched = new Set<number>();
  for (const a of data ?? []) {
    if (timeLeft() < 15_000) break;
    // Reclamar la acción (evita doble envío si corren dos invocaciones a la vez).
    const { data: claimed } = await sb.from("meli_claim_actions").update({ status: "enviando" }).eq("id", a.id).eq("status", "pendiente").select("id");
    if (!claimed?.length) continue;
    try {
      const response = await runAction(a);
      await sb.from("meli_claim_actions").update({ status: "enviada", response, done_at: new Date().toISOString() }).eq("id", a.id);
      done++;
    } catch (e) {
      const msg = e instanceof MeliError ? `${e.status}: ${e.body.slice(0, 500)}` : String(e);
      await sb.from("meli_claim_actions").update({ status: "error", error: msg, done_at: new Date().toISOString() }).eq("id", a.id);
      errors.push(`acción ${a.id}: ${msg.slice(0, 200)}`);
    }
    touched.add(Number(a.claim_id));
  }
  // Refrescar los reclamos tocados para ver el nuevo estado y plazos.
  for (const id of touched) { try { await syncClaim(id, new Map()); } catch (e) { errors.push(String(e).slice(0, 200)); } }
  stats.acciones = done;
}

// ---------------------------------------------------------------- entrada
Deno.serve(async (req: Request) => {
  startedAt = Date.now();
  const { data: secret } = await sb.rpc("sync_get_secret");
  if (!secret || req.headers.get("x-sync-key") !== secret) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));
  const kind: string = body.kind ?? "sync";
  const stats: Any = {};
  const errors: string[] = [];
  const { data: run } = await sb.from("sync_runs").insert({ kind: "claims_" + kind }).select("id").single();
  const finish = (status: string, err?: string) => sb.from("sync_runs").update({
    finished_at: new Date().toISOString(), status, stats, error: err ?? (errors.length ? errors.slice(0, 20).join("\n") : null),
  }).eq("id", run?.id);
  try {
    await loadCreds();
    if (kind === "actions" || kind === "all") await runActions(stats, errors);
    if (kind === "reputation" || kind === "all" || kind === "sync") await syncReputation(stats).catch((e) => errors.push(String(e)));
    if (kind === "sync" || kind === "all") await syncClaims(stats, errors);
    await finish(errors.length ? "partial" : "ok");
    return json({ ok: true, kind, stats, errors: errors.slice(0, 20) });
  } catch (e) {
    await finish("error", String(e));
    return json({ ok: false, kind, error: String(e), stats }, 500);
  }
});

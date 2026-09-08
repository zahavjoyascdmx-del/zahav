// Edge Function: genera videos con Higgsfield (imagen → video) y guarda el MP4 en Storage.
// Se invoca con POST { action: "generate", id } | { action: "poll" } y el header x-sync-key (clave de private.sync_secrets).
// Clave de Higgsfield: private.sync_secrets['higgsfield_key'] con formato "API_KEY:API_SECRET" (de https://cloud.higgsfield.ai).
import { createClient } from "npm:@supabase/supabase-js@2.49.0";

type Json = Record<string, unknown>;
type Video = {
  id: number; titulo: string; image_url: string; prompt: string; model: string; aspect_ratio: string; duration: number;
  motion_id: string | null; seed: number | null; status: string; request_id: string | null; status_url: string | null;
  attempts: number; created_at: string; updated_at: string;
};

const API = "https://platform.higgsfield.ai";
const BUCKET = "videos";
const TIMEOUT_MIN = 40; // un video en cola/generando más de esto se marca como error
const DEADLINE_MS = 120_000;

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const startedAt = Date.now();
const timeLeft = () => DEADLINE_MS - (Date.now() - startedAt);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const now = () => new Date().toISOString();

// ---------------------------------------------------------------- Higgsfield
let keyPair: { id: string; secret: string } | null = null;
async function loadKey() {
  if (keyPair) return keyPair;
  const { data, error } = await sb.rpc("higgsfield_get_key");
  const raw = String(data ?? "").trim();
  if (error || !raw) throw new Error("Falta la clave de Higgsfield: captúrala en Configuración (formato API_KEY:API_SECRET).");
  const i = raw.indexOf(":");
  keyPair = i > 0 ? { id: raw.slice(0, i), secret: raw.slice(i + 1) } : { id: raw, secret: "" };
  return keyPair;
}

async function hf(path: string, init: RequestInit = {}) {
  const k = await loadKey();
  const url = path.startsWith("http") ? path : API + path;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Key ${k.id}:${k.secret}`,
      "hf-api-key": k.id,
      "hf-secret": k.secret,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: Json = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  return { ok: res.ok, status: res.status, body, text };
}

function explain(status: number, body: Json, text: string) {
  const detail = (body.detail ?? body.message ?? body.error ?? text).toString().slice(0, 400);
  if (status === 401 || status === 403) return `Higgsfield rechazó la clave (${status}). Revisa API key y secret en Configuración. ${detail}`;
  if (status === 402) return `Sin créditos en Higgsfield (402). Recarga en cloud.higgsfield.ai. ${detail}`;
  if (status === 422 || status === 400) return `Higgsfield no aceptó la petición (${status}): ${detail}`;
  return `Higgsfield ${status}: ${detail}`;
}

// ---------------------------------------------------------------- generar
async function generate(id: number): Promise<Json> {
  const { data: v, error } = await sb.from("videos").select("*").eq("id", id).maybeSingle();
  if (error || !v) throw new Error("Video no encontrado: " + (error?.message ?? id));
  const video = v as Video;
  const input: Json = {
    model: video.model || "dop-turbo",
    prompt: video.prompt,
    input_images: [{ type: "image_url", image_url: video.image_url }],
    aspect_ratio: video.aspect_ratio || "9:16",
    duration: Number(video.duration) || 5,
    enhance_prompt: true,
  };
  if (video.motion_id) input.motions = [{ id: video.motion_id, strength: 0.8 }];
  if (video.seed != null) input.seed = video.seed;

  let r = await hf("/v1/image2video/dop", { method: "POST", body: JSON.stringify(input) });
  // Algunas versiones de la API esperan el cuerpo envuelto en { params }.
  if (!r.ok && (r.status === 400 || r.status === 422) && /params|field required/i.test(r.text)) {
    r = await hf("/v1/image2video/dop", { method: "POST", body: JSON.stringify({ params: input }) });
  }
  if (!r.ok) {
    const msg = explain(r.status, r.body, r.text);
    await sb.from("videos").update({ status: "error", error: msg, attempts: video.attempts + 1, updated_at: now() }).eq("id", id);
    return { id, ok: false, error: msg };
  }
  const requestId = String(r.body.request_id ?? r.body.id ?? "");
  const statusUrl = r.body.status_url ? String(r.body.status_url) : null;
  if (!requestId) {
    const msg = "Higgsfield respondió sin identificador de petición: " + r.text.slice(0, 300);
    await sb.from("videos").update({ status: "error", error: msg, attempts: video.attempts + 1, updated_at: now() }).eq("id", id);
    return { id, ok: false, error: msg };
  }
  await sb.from("videos").update({
    status: "en_cola", request_id: requestId, status_url: statusUrl, error: null, attempts: video.attempts + 1, updated_at: now(),
  }).eq("id", id);
  return { id, ok: true, request_id: requestId };
}

// ---------------------------------------------------------------- consultar estado y guardar
function pickVideoUrl(body: Json): string | null {
  const b = body as Record<string, unknown>;
  const video = b.video as Record<string, unknown> | undefined;
  if (video?.url) return String(video.url);
  const videos = b.videos as Array<Record<string, unknown>> | undefined;
  if (videos?.[0]?.url) return String(videos[0].url);
  const jobs = b.jobs as Array<Record<string, unknown>> | undefined;
  const results = jobs?.[0]?.results as Record<string, Record<string, unknown>> | undefined;
  if (results?.raw?.url) return String(results.raw.url);
  return null;
}
function pickStatus(body: Json): string {
  const b = body as Record<string, unknown>;
  if (b.status) return String(b.status).toLowerCase();
  const jobs = b.jobs as Array<Record<string, unknown>> | undefined;
  if (jobs?.length) {
    const st = jobs.map((j) => String(j.status ?? "").toLowerCase());
    if (st.every((s) => s === "completed")) return "completed";
    if (st.some((s) => s === "failed")) return "failed";
    if (st.some((s) => s === "nsfw")) return "nsfw";
    if (st.some((s) => s === "in_progress")) return "in_progress";
    return "queued";
  }
  return "unknown";
}

async function saveToStorage(video: Video, sourceUrl: string): Promise<string> {
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`No se pudo descargar el video (${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const type = res.headers.get("content-type")?.split(";")[0] || "video/mp4";
  const ext = type.includes("quicktime") ? "mov" : type.includes("webm") ? "webm" : "mp4";
  const path = `videos/${video.id}-${Date.now()}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: true });
  if (error) throw new Error("No se pudo guardar en Storage: " + error.message);
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function poll(): Promise<Json> {
  const { data, error } = await sb.from("videos").select("*").in("status", ["pendiente", "en_cola", "generando"]).order("id");
  if (error) throw new Error(error.message);
  const out: Json[] = [];
  for (const v of (data ?? []) as Video[]) {
    if (timeLeft() < 15_000) break;
    const ageMin = (Date.now() - new Date(v.updated_at).getTime()) / 60_000;
    try {
      if (!v.request_id) {
        // "generate" nunca llegó a enviarse (p. ej. la Edge Function falló): reintentar una vez, luego marcar error.
        if (ageMin > 3) {
          if (v.attempts < 2) out.push(await generate(v.id));
          else await sb.from("videos").update({ status: "error", error: "No se pudo enviar la petición a Higgsfield.", updated_at: now() }).eq("id", v.id);
        }
        continue;
      }
      let r = await hf(v.status_url ?? `/requests/${v.request_id}/status`);
      if (r.status === 404 && !v.status_url) r = await hf(`/v1/job-sets/${v.request_id}`);
      if (!r.ok) {
        if (ageMin > TIMEOUT_MIN) {
          await sb.from("videos").update({ status: "error", error: explain(r.status, r.body, r.text), updated_at: now() }).eq("id", v.id);
        }
        out.push({ id: v.id, status: r.status, error: r.text.slice(0, 200) });
        continue;
      }
      const st = pickStatus(r.body);
      if (st === "completed") {
        const src = pickVideoUrl(r.body);
        if (!src) throw new Error("Terminó pero no trae URL de video: " + r.text.slice(0, 300));
        const publicUrl = await saveToStorage(v, src);
        await sb.from("videos").update({ status: "listo", source_url: src, video_url: publicUrl, error: null, finished_at: now(), updated_at: now() }).eq("id", v.id);
        out.push({ id: v.id, status: "listo" });
      } else if (st === "failed" || st === "canceled" || st === "cancelled") {
        const detail = String((r.body as Json).error ?? (r.body as Json).detail ?? "").slice(0, 300);
        await sb.from("videos").update({ status: "error", error: "Higgsfield no pudo generar el video." + (detail ? " " + detail : ""), finished_at: now(), updated_at: now() }).eq("id", v.id);
        out.push({ id: v.id, status: "error" });
      } else if (st === "nsfw") {
        await sb.from("videos").update({ status: "nsfw", error: "Higgsfield rechazó la imagen o el texto por su filtro de contenido. Prueba otra foto o cambia el prompt.", finished_at: now(), updated_at: now() }).eq("id", v.id);
        out.push({ id: v.id, status: "nsfw" });
      } else {
        const nuevo = st === "in_progress" ? "generando" : "en_cola";
        if (ageMin > TIMEOUT_MIN) {
          await sb.from("videos").update({ status: "error", error: `Sin respuesta de Higgsfield después de ${TIMEOUT_MIN} minutos. Reintenta.`, updated_at: now() }).eq("id", v.id);
        } else if (nuevo !== v.status) {
          await sb.from("videos").update({ status: nuevo }).eq("id", v.id);
        }
        out.push({ id: v.id, status: nuevo });
      }
    } catch (e) {
      out.push({ id: v.id, error: String(e).slice(0, 300) });
      if (ageMin > TIMEOUT_MIN) await sb.from("videos").update({ status: "error", error: String(e).slice(0, 400), updated_at: now() }).eq("id", v.id);
    }
  }
  return { revisados: out.length, detalle: out };
}

// ---------------------------------------------------------------- entrada
Deno.serve(async (req: Request) => {
  const { data: secret } = await sb.rpc("sync_get_secret");
  if (!secret || req.headers.get("x-sync-key") !== secret) return new Response("unauthorized", { status: 401 });
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "poll");
  try {
    let result: Json;
    if (action === "generate") {
      const id = Number(body.id);
      if (!id) return json({ error: "Falta id" }, 400);
      result = await generate(id);
    } else if (action === "poll") {
      result = await poll();
    } else {
      return json({ error: "Acción desconocida: " + action }, 400);
    }
    if (action === "generate" || (result.revisados as number) > 0) {
      await sb.from("sync_runs").insert({ kind: "video:" + action, status: result.ok === false ? "error" : "ok", finished_at: now(), stats: result });
    }
    return json(result);
  } catch (e) {
    const msg = String(e).slice(0, 500);
    if (action === "generate" && body.id) {
      await sb.from("videos").update({ status: "error", error: msg, updated_at: now() }).eq("id", Number(body.id));
    }
    await sb.from("sync_runs").insert({ kind: "video:" + action, status: "error", finished_at: now(), stats: {}, error: msg });
    return json({ error: msg }, 500);
  }
});

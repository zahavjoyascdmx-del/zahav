// Edge Function de diagnóstico: hace GETs arbitrarios a la API de Mercado Libre con el token guardado
// y devuelve estado + inicio del cuerpo. POST { paths: [{ path, headers? }] } con header x-sync-key.
import { createClient } from "npm:@supabase/supabase-js@2.49.0";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

Deno.serve(async (req: Request) => {
  const { data: secret } = await sb.rpc("sync_get_secret");
  if (!secret || req.headers.get("x-sync-key") !== secret) return new Response("unauthorized", { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { data } = await sb.rpc("meli_get_credentials");
  const c = Array.isArray(data) ? data[0] : data;
  const out: Record<string, unknown>[] = [];
  for (const p of body.paths ?? []) {
    try {
      const url = String(p.path).startsWith("http") ? p.path : "https://api.mercadolibre.com" + p.path;
      const res = await fetch(url, { headers: { Authorization: "Bearer " + c.access_token, Accept: "application/json", ...(p.headers ?? {}) } });
      const text = await res.text();
      out.push({ path: p.path, status: res.status, body: text.slice(0, Number(body.max ?? 1500)) });
    } catch (e) {
      out.push({ path: p.path, error: String(e) });
    }
  }
  await sb.from("sync_runs").insert({ kind: "probe", status: "ok", finished_at: new Date().toISOString(), stats: { probe: out } });
  return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
});

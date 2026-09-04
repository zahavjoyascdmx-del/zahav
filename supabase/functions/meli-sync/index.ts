// Edge Function: sincronización con Mercado Libre.
// Se invoca con POST { kind: "incremental" | "daily" | "items" | "stock" | "orders" | "backfill" | "shipments" | "payments" | "visits" | "token" | "full" }
// y el header x-sync-key (clave guardada en private.sync_secrets).
import { createClient } from "npm:@supabase/supabase-js@2.49.0";

type Json = Record<string, unknown>;
type Creds = {
  app_id: string;
  client_secret: string;
  meli_user_id: number;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
};

const API = "https://api.mercadolibre.com";
const DEADLINE_MS = 120_000;
const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

let startedAt = Date.now();
const timeLeft = () => DEADLINE_MS - (Date.now() - startedAt);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Fecha (YYYY-MM-DD) en hora de Ciudad de México (UTC-6, sin horario de verano). */
const cdmxDate = (d = new Date()) => new Date(d.getTime() - 6 * 3600_000).toISOString().slice(0, 10);
const isoMeli = (d: Date) => d.toISOString().replace("Z", "-00:00");

// ---------------------------------------------------------------- credenciales
let creds: Creds | null = null;

async function loadCreds(): Promise<Creds> {
  const { data, error } = await sb.rpc("meli_get_credentials");
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) throw new Error("Sin credenciales de MELI: " + (error?.message ?? "tabla vacía"));
  creds = row as Creds;
  return creds;
}

async function refreshToken(): Promise<string> {
  // Otra corrida pudo renovar el token hace un momento: releer antes de gastar el refresh_token (es de un solo uso).
  const c = await loadCreds();
  if (c.access_token && c.expires_at && new Date(c.expires_at).getTime() - Date.now() > 30 * 60_000) {
    return c.access_token;
  }
  const res = await fetch(API + "/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: c.app_id,
      client_secret: c.client_secret,
      refresh_token: c.refresh_token ?? "",
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error("No se pudo renovar el token de MELI: " + JSON.stringify(body));
  const expires = new Date(Date.now() + (body.expires_in ?? 21600) * 1000).toISOString();
  const { error } = await sb.rpc("meli_save_tokens", {
    p_access: body.access_token,
    p_refresh: body.refresh_token,
    p_expires: expires,
  });
  if (error) throw new Error("No se pudieron guardar los tokens: " + error.message);
  creds = { ...c, access_token: body.access_token, refresh_token: body.refresh_token, expires_at: expires };
  return body.access_token;
}

async function getToken(): Promise<string> {
  const c = creds ?? (await loadCreds());
  if (c.access_token && c.expires_at && new Date(c.expires_at).getTime() - Date.now() > 5 * 60_000) {
    return c.access_token;
  }
  return await refreshToken();
}

let refreshing: Promise<string> | null = null;
function refreshOnce() {
  if (!refreshing) refreshing = refreshToken().finally(() => (refreshing = null));
  return refreshing;
}

// deno-lint-ignore no-explicit-any
async function meli(path: string, attempt = 0, extraHeaders: Record<string, string> = {}): Promise<any> {
  const token = await getToken();
  const res = await fetch(API + path, {
    headers: { Authorization: "Bearer " + token, Accept: "application/json", ...extraHeaders },
  });
  if (res.status === 401 && attempt === 0) {
    await refreshOnce();
    return meli(path, 1, extraHeaders);
  }
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    await sleep(800 * (attempt + 1));
    return meli(path, attempt + 1, extraHeaders);
  }
  if (res.status === 404 || res.status === 403) return null;
  const text = await res.text();
  if (!res.ok) throw new Error(`MELI ${res.status} ${path}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function pool<T>(items: T[], size: number, fn: (t: T) => Promise<void>, errors: string[]) {
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length && timeLeft() > 5_000) {
      const it = items[i++];
      try {
        await fn(it);
      } catch (e) {
        errors.push(String(e).slice(0, 300));
      }
    }
  });
  await Promise.all(workers);
}

async function upsert(table: string, rows: Json[], onConflict?: string) {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from(table).upsert(rows.slice(i, i + 500), onConflict ? { onConflict } : undefined);
    if (error) throw new Error(`upsert ${table}: ${error.message}`);
  }
}

// ---------------------------------------------------------------- helpers de mapeo
// deno-lint-ignore no-explicit-any
function attrValue(attrs: any[] | undefined, id: string): string | null {
  const a = (attrs ?? []).find((x) => x?.id === id);
  return a?.value_name ?? (a?.values?.[0]?.name ?? null);
}
// deno-lint-ignore no-explicit-any
function colorTalla(combos: any[] | undefined): { color: string | null; talla: string | null } {
  let color: string | null = null;
  let talla: string | null = null;
  for (const c of combos ?? []) {
    const name = String(c?.name ?? c?.id ?? "").toLowerCase();
    const val = c?.value_name ?? c?.values?.[0]?.name ?? null;
    if (!val) continue;
    if (name.includes("color")) color = val;
    else if (/talla|talle|tamaño|size|largo|medida|longitud/.test(name)) talla = String(val).replace(/^talla\s*/i, "");
  }
  return { color, talla };
}

// ---------------------------------------------------------------- publicaciones
async function syncItems(stats: Json, errors: string[]) {
  const uid = creds!.meli_user_id;
  const ids = new Set<string>();
  for (const status of ["active", "paused", "closed", "under_review", "inactive"]) {
    let offset = 0;
    while (timeLeft() > 5_000) {
      const r = await meli(`/users/${uid}/items/search?status=${status}&limit=100&offset=${offset}`);
      for (const id of r?.results ?? []) ids.add(id);
      offset += 100;
      if (!r || offset >= Math.min(r.paging?.total ?? 0, 1000)) break;
    }
  }
  const all = [...ids];
  let items = 0;
  let variations = 0;
  const batches: string[][] = [];
  for (let i = 0; i < all.length; i += 20) batches.push(all.slice(i, i + 20));
  await pool(batches, 4, async (batch) => {
    const r = await meli(`/items?ids=${batch.join(",")}&include_attributes=all`);
    const itemRows: Json[] = [];
    const varRows: Json[] = [];
    for (const e of r ?? []) {
      if (e?.code !== 200 || !e.body) continue;
      const b = e.body;
      itemRows.push({
        item_id: b.id,
        title: b.title,
        status: b.status,
        sub_status: b.sub_status ?? [],
        permalink: b.permalink,
        thumbnail: b.thumbnail,
        category_id: b.category_id,
        listing_type: b.listing_type_id,
        logistic_type: b.shipping?.logistic_type ?? null,
        price: b.price,
        currency: b.currency_id,
        available_quantity: b.available_quantity,
        sold_quantity: b.sold_quantity,
        seller_sku: attrValue(b.attributes, "SELLER_SKU") ?? b.seller_custom_field ?? null,
        has_variations: (b.variations ?? []).length > 0,
        inventory_id: b.inventory_id ?? null,
        date_created: b.date_created,
        last_updated: b.last_updated,
        raw: b,
        synced_at: new Date().toISOString(),
      });
      for (const v of b.variations ?? []) {
        const ct = colorTalla(v.attribute_combinations);
        varRows.push({
          variation_id: v.id,
          item_id: b.id,
          color: ct.color,
          talla: ct.talla,
          seller_sku: attrValue(v.attributes, "SELLER_SKU") ?? v.seller_custom_field ?? null,
          price: v.price,
          available_quantity: v.available_quantity,
          sold_quantity: v.sold_quantity,
          inventory_id: v.inventory_id ?? null,
          attributes: v.attribute_combinations ?? [],
          synced_at: new Date().toISOString(),
        });
      }
    }
    await upsert("meli_items", itemRows);
    await upsert("meli_variations", varRows);
    items += itemRows.length;
    variations += varRows.length;
  }, errors);
  stats.items = items;
  stats.variations = variations;
}

// ---------------------------------------------------------------- stock Full
async function syncStock(stats: Json, errors: string[]) {
  const { data: vars, error: e1 } = await sb.from("meli_variations")
    .select("inventory_id,item_id,variation_id").not("inventory_id", "is", null);
  if (e1) throw new Error(e1.message);
  const { data: its, error: e2 } = await sb.from("meli_items")
    .select("inventory_id,item_id").not("inventory_id", "is", null);
  if (e2) throw new Error(e2.message);
  const targets = new Map<string, { item_id: string; variation_id: number | null }>();
  for (const v of vars ?? []) targets.set(v.inventory_id, { item_id: v.item_id, variation_id: v.variation_id });
  for (const it of its ?? []) if (!targets.has(it.inventory_id)) targets.set(it.inventory_id, { item_id: it.item_id, variation_id: null });
  const today = cdmxDate();
  const rows: Json[] = [];
  await pool([...targets.entries()], 6, async ([inv, t]) => {
    const s = await meli(`/inventories/${inv}/stock/fulfillment`);
    if (!s) return;
    // deno-lint-ignore no-explicit-any
    const detail: any[] = s.not_available_detail ?? [];
    const sum = (st: string) => detail.filter((d) => d.status === st).reduce((a, d) => a + (d.quantity ?? 0), 0);
    rows.push({
      snapshot_date: today,
      inventory_id: inv,
      item_id: t.item_id,
      variation_id: t.variation_id,
      available: s.available_quantity ?? 0,
      not_available: s.not_available_quantity ?? 0,
      reserved: sum("internal_process") + sum("reserved"),
      in_transit: sum("transfer"),
      detail: s,
    });
  }, errors);
  await upsert("meli_stock_snapshots", rows);
  stats.stock = rows.length;
}

// ---------------------------------------------------------------- órdenes
// deno-lint-ignore no-explicit-any
async function upsertOrders(results: any[]) {
  const orders: Json[] = [];
  const items: Json[] = [];
  for (const o of results) {
    orders.push({
      order_id: o.id,
      pack_id: o.pack_id ?? null,
      date_created: o.date_created,
      date_closed: o.date_closed ?? null,
      last_updated: o.last_updated ?? null,
      status: o.status,
      status_detail: o.status_detail ?? null,
      buyer_id: o.buyer?.id ?? null,
      buyer_nickname: o.buyer?.nickname ?? null,
      total_amount: o.total_amount ?? null,
      paid_amount: o.paid_amount ?? null,
      currency: o.currency_id ?? null,
      shipping_id: o.shipping?.id ?? null,
      tags: o.tags ?? [],
      raw: o,
      synced_at: new Date().toISOString(),
    });
    for (const oi of o.order_items ?? []) {
      const ct = colorTalla(oi.item?.variation_attributes);
      items.push({
        order_id: o.id,
        item_id: oi.item?.id,
        variation_id: oi.item?.variation_id ?? 0,
        seller_sku: oi.item?.seller_sku ?? null,
        title: oi.item?.title ?? null,
        quantity: oi.quantity ?? 0,
        unit_price: oi.unit_price ?? null,
        full_unit_price: oi.full_unit_price ?? null,
        sale_fee: oi.sale_fee ?? null,
        listing_type: oi.listing_type_id ?? null,
        color: ct.color,
        talla: ct.talla,
      });
    }
  }
  await upsert("meli_orders", orders);
  await upsert("meli_order_items", items);
  return orders.length;
}

/** Recorre una ventana de fechas. Devuelve true si la terminó completa. */
async function fetchOrdersWindow(from: Date, to: Date, stats: Json): Promise<boolean> {
  const uid = creds!.meli_user_id;
  let offset = 0;
  while (true) {
    const r = await meli(
      `/orders/search?seller=${uid}&order.date_created.from=${isoMeli(from)}&order.date_created.to=${isoMeli(to)}&sort=date_asc&limit=50&offset=${offset}`,
    );
    const results = r?.results ?? [];
    stats.orders = ((stats.orders as number) ?? 0) + (await upsertOrders(results));
    offset += 50;
    if (results.length < 50 || offset >= (r?.paging?.total ?? 0)) return true;
    if (timeLeft() < 15_000) return false;
  }
}

async function syncOrdersIncremental(stats: Json, days: number) {
  const to = new Date(Date.now() + 3600_000);
  const from = new Date(Date.now() - days * 86400_000);
  await fetchOrdersWindow(from, to, stats);
}

async function syncOrdersBackfill(stats: Json, fromOverride?: string) {
  const { data } = await sb.from("settings").select("value").eq("key", "orders_backfill").maybeSingle();
  const cur = (data?.value as { from: string; next: string; done: boolean }) ??
    { from: "2025-01-01", next: "2025-01-01", done: false };
  if (fromOverride) { cur.from = fromOverride; cur.next = fromOverride; cur.done = false; }
  let next = new Date(cur.next + "T00:00:00Z");
  const end = new Date();
  const step = 15 * 86400_000;
  while (next < end && timeLeft() > 20_000) {
    const to = new Date(Math.min(next.getTime() + step, end.getTime() + 3600_000));
    const complete = await fetchOrdersWindow(next, to, stats);
    if (!complete) break;
    next = to;
    cur.next = next.toISOString().slice(0, 10);
    cur.done = next >= end;
    await sb.from("settings").upsert({ key: "orders_backfill", value: cur, updated_at: new Date().toISOString() });
  }
  stats.backfill_next = cur.next;
  stats.backfill_done = cur.done;
}

// ---------------------------------------------------------------- envíos
async function syncShipments(stats: Json, errors: string[], limit: number) {
  const { data: pending, error } = await sb.rpc("pending_shipments", { p_limit: limit });
  if (error) throw new Error(error.message);
  const rows: Json[] = [];
  // deno-lint-ignore no-explicit-any
  await pool((pending ?? []) as any[], 5, async (p) => {
    const s = await meli(`/shipments/${p.shipping_id}`);
    if (!s) return;
    const c = await meli(`/shipments/${p.shipping_id}/costs`);
    rows.push({
      shipment_id: p.shipping_id,
      order_id: p.order_id,
      status: s.status ?? null,
      substatus: s.substatus ?? null,
      logistic_type: s.logistic_type ?? s.logistic?.type ?? null,
      seller_cost: c?.senders?.[0]?.cost ?? null,
      buyer_cost: c?.receiver?.cost ?? null,
      date_created: s.date_created ?? null,
      date_shipped: s.status_history?.date_shipped ?? null,
      date_delivered: s.status_history?.date_delivered ?? null,
      raw: { shipment: s, costs: c },
      synced_at: new Date().toISOString(),
    });
  }, errors);
  await upsert("meli_shipments", rows);
  stats.shipments = rows.length;
  stats.shipments_pending = (pending?.length ?? 0) - rows.length;
}

// ---------------------------------------------------------------- pagos (Mercado Pago)
async function syncPayments(stats: Json, errors: string[], limit: number) {
  const { data: pending, error } = await sb.rpc("pending_payments", { p_limit: limit });
  if (error) throw new Error(error.message);
  const rows: Json[] = [];
  // deno-lint-ignore no-explicit-any
  await pool((pending ?? []) as any[], 5, async (p) => {
    const pay = await meli(`/v1/payments/${p.payment_id}`);
    if (!pay) return;
    rows.push({
      payment_id: p.payment_id,
      order_id: p.order_id,
      status: pay.status ?? null,
      status_detail: pay.status_detail ?? null,
      date_approved: pay.date_approved ?? null,
      transaction_amount: pay.transaction_amount ?? null,
      total_paid_amount: pay.transaction_details?.total_paid_amount ?? null,
      net_received_amount: pay.transaction_details?.net_received_amount ?? null,
      shipping_amount: pay.shipping_amount ?? null,
      coupon_amount: pay.coupon_amount ?? null,
      charges: pay.charges_details ?? [],
      fee_details: pay.fee_details ?? [],
      raw: pay,
      synced_at: new Date().toISOString(),
    });
  }, errors);
  await upsert("meli_payments", rows);
  stats.payments = rows.length;
  stats.payments_pending = (pending?.length ?? 0) - rows.length;
}

// ---------------------------------------------------------------- visitas
async function syncVisits(stats: Json, errors: string[]) {
  const { data: its } = await sb.from("meli_items").select("item_id").in("status", ["active", "paused"]);
  const rows: Json[] = [];
  await pool((its ?? []).map((i) => i.item_id as string), 5, async (id) => {
    const r = await meli(`/items/${id}/visits/time_window?last=30&unit=day`);
    for (const d of r?.results ?? []) {
      rows.push({ visit_date: String(d.date).slice(0, 10), item_id: id, visits: d.total ?? 0 });
    }
  }, errors);
  await upsert("meli_visits", rows);
  stats.visits = rows.length;
}

// ---------------------------------------------------------------- handler
Deno.serve(async (req: Request) => {
  startedAt = Date.now();
  const { data: secret } = await sb.rpc("sync_get_secret");
  if (!secret || req.headers.get("x-sync-key") !== secret) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const kind: string = body.kind ?? "incremental";
  const stats: Json = {};
  const errors: string[] = [];

  const { data: run } = await sb.from("sync_runs").insert({ kind }).select("id").single();
  const finish = async (status: string, err?: string) => {
    await sb.from("sync_runs").update({
      finished_at: new Date().toISOString(),
      status,
      stats,
      error: err ?? (errors.length ? errors.slice(0, 20).join("\n") : null),
    }).eq("id", run?.id);
  };

  try {
    await loadCreds();
    const has = (...k: string[]) => k.includes(kind);
    if (has("items", "daily", "full")) await syncItems(stats, errors);
    if (has("stock", "incremental", "daily", "full")) await syncStock(stats, errors);
    if (has("orders", "incremental", "full")) await syncOrdersIncremental(stats, Number(body.days ?? 60));
    if (has("backfill")) await syncOrdersBackfill(stats, body.from);
    if (has("shipments", "incremental", "backfill", "full")) await syncShipments(stats, errors, Number(body.limit ?? 150));
    if (has("payments", "incremental", "full")) await syncPayments(stats, errors, Number(body.limit ?? 150));
    if (has("visits", "daily", "full")) await syncVisits(stats, errors);
    if (has("token")) { await refreshToken(); stats.token = "renovado"; }
    await finish(errors.length ? "partial" : "ok");
    return json({ ok: true, run: run?.id, kind, stats, errors: errors.slice(0, 20) });
  } catch (e) {
    await finish("error", String(e));
    return json({ ok: false, run: run?.id, kind, error: String(e), stats, errors }, 500);
  }
});

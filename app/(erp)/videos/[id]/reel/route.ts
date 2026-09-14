// POST: arma el Reel (clip de Higgsfield + ficha + ¿Sabías que? + CTA) y lo guarda en Storage.
// GET ?capa=titulo|ficha|sabias|cta: vista previa PNG de una capa sobre la foto de la pieza, sin codificar video.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ReelSpec } from "@/lib/reel/ficha";
import { sugerirCaption } from "@/lib/reel/ficha";
import { renderCapas, TIMELINE, W, H } from "@/lib/reel/render";
import { componerReel } from "@/lib/reel/ffmpeg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BUCKET = "videos";

function specDesde(fd: URLSearchParams | FormData): ReelSpec {
  const v = (k: string) => String(fd.get(k) ?? "").trim();
  const lineas = (k: string) => v(k).split("\n").map((s) => s.trim()).filter(Boolean);
  return {
    titulo: v("titulo"), subtitulo: v("subtitulo"), datos: lineas("datos"), precio: v("precio"),
    sabias: v("sabias_custom") || v("sabias"), cta: lineas("cta"), instagram: v("instagram"),
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: video } = await supabase.from("videos").select("image_url").eq("id", Number(id)).maybeSingle();
  if (!video) return new NextResponse("No encontrado", { status: 404 });
  const sp = req.nextUrl.searchParams;
  const spec = specDesde(sp);
  const capaNombre = sp.get("capa") || "ficha";
  const capas = await renderCapas(spec);
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#1d332a"; ctx.fillRect(0, 0, W, H);
  try {
    const img = await loadImage(video.image_url);
    const s = Math.max(W / img.width, H / img.height);
    ctx.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
  } catch { /* sin foto: fondo liso */ }
  for (const c of capas) {
    if (c.nombre === "marca" || c.nombre === capaNombre) ctx.drawImage(await loadImage(c.png), 0, 0);
  }
  return new NextResponse(new Uint8Array(canvas.toBuffer("image/jpeg", 88)), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vid = Number(id);
  const back = (q: string) => NextResponse.redirect(new URL(`/videos/${vid}?${q}`, req.url), 303);
  const supabase = await createClient();
  const fd = await req.formData();
  const spec = specDesde(fd);
  const { data: video, error } = await supabase.from("videos").select("id,video_url,status,item_id,meli_items(permalink)").eq("id", vid).maybeSingle();
  if (error || !video) return back("error=" + encodeURIComponent("Video no encontrado"));
  if (video.status !== "listo" || !video.video_url) return back("error=" + encodeURIComponent("El clip de Higgsfield todavía no está listo"));
  const permalink = (video.meli_items as unknown as { permalink: string } | null)?.permalink ?? null;
  const caption = sugerirCaption(spec, permalink);
  try {
    const res = await fetch(video.video_url);
    if (!res.ok) throw new Error(`No se pudo descargar el clip (${res.status})`);
    const clip = Buffer.from(await res.arrayBuffer());
    const capas = await renderCapas(spec);
    const { mp4, segundos } = await componerReel(clip, capas, TIMELINE.duracion);
    const path = `reels/${vid}-${Date.now()}.mp4`;
    const up = await supabase.storage.from(BUCKET).upload(path, mp4, { contentType: "video/mp4", upsert: true });
    if (up.error) throw new Error("No se pudo guardar el Reel: " + up.error.message);
    const reel_url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    await supabase.from("videos").update({ reel_url, reel_spec: spec, reel_error: null, reel_at: new Date().toISOString(), caption }).eq("id", vid);
    return back(`ok=${segundos}`);
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e).slice(0, 500);
    await supabase.from("videos").update({ reel_spec: spec, reel_error: msg, caption }).eq("id", vid);
    return back("error=" + encodeURIComponent(msg));
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DESTINOS, DURACIONES, MODELOS } from "@/lib/videos";

const BUCKET = "videos";

function fail(msg: string): never {
  redirect(`/videos?error=${encodeURIComponent(msg)}`);
}

export async function crearVideo(fd: FormData) {
  const v = (k: string) => String(fd.get(k) ?? "").trim();
  const supabase = await createClient();

  const prompt = v("prompt");
  if (!prompt) fail("Escribe o elige un prompt.");
  const destino = DESTINOS.some((d) => d.value === v("destino")) ? (v("destino") as "ig" | "ml") : "ig";
  const model = MODELOS.some((m) => m.value === v("model")) ? v("model") : "dop-turbo";
  const duration = DURACIONES.includes(Number(v("duration"))) ? Number(v("duration")) : 5;
  const aspect_ratio = /^\d+:\d+$/.test(v("aspect_ratio")) ? v("aspect_ratio") : "9:16";
  const item_id = v("item_id") || null;

  // Foto: subida por el usuario o elegida de la publicación.
  let image_url = v("image_url");
  const foto = fd.get("foto");
  if (foto instanceof File && foto.size > 0) {
    if (!/^image\/(jpeg|png|webp)$/.test(foto.type)) fail("La foto debe ser JPG, PNG o WebP.");
    if (foto.size > 10 * 1024 * 1024) fail("La foto pesa más de 10 MB.");
    const ext = foto.type === "image/png" ? "png" : foto.type === "image/webp" ? "webp" : "jpg";
    const path = `fotos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, foto, { contentType: foto.type, upsert: false });
    if (error) fail("No se pudo subir la foto: " + error.message);
    image_url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }
  if (!/^https?:\/\//.test(image_url)) fail("Elige una foto de la publicación o sube una.");

  let titulo = v("titulo");
  let product_id: number | null = null;
  if (item_id) {
    const { data } = await supabase.from("meli_items").select("title,product_id").eq("item_id", item_id).maybeSingle();
    if (data) {
      titulo = titulo || data.title;
      product_id = data.product_id ?? null;
    }
  }
  titulo = titulo || "Video " + new Date().toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" });

  const { data: row, error } = await supabase.from("videos")
    .insert({ item_id, product_id, destino, titulo, image_url, prompt, model, aspect_ratio, duration, status: "pendiente" })
    .select("id").single();
  if (error || !row) fail("No se pudo guardar el video: " + (error?.message ?? ""));

  const { error: e2 } = await supabase.rpc("generar_video", { p_id: row.id });
  if (e2) fail("Guardado, pero no se pudo lanzar la generación: " + e2.message);
  revalidatePath("/videos");
  redirect(`/videos?ok=${row.id}`);
}

export async function revisarVideos() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("revisar_videos");
  if (error) fail("No se pudo consultar el estado: " + error.message);
  revalidatePath("/videos");
  redirect("/videos");
}

export async function reintentarVideo(fd: FormData) {
  const id = Number(fd.get("id"));
  if (!id) fail("Video inválido.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("generar_video", { p_id: id });
  if (error) fail("No se pudo reintentar: " + error.message);
  revalidatePath("/videos");
  redirect(`/videos?ok=${id}`);
}

export async function eliminarVideo(fd: FormData) {
  const id = Number(fd.get("id"));
  if (!id) fail("Video inválido.");
  const supabase = await createClient();
  const { data } = await supabase.from("videos").select("video_url,image_url").eq("id", id).maybeSingle();
  // Borra los archivos del bucket si viven ahí (video terminado y foto subida a mano).
  const paths: string[] = [];
  for (const u of [data?.video_url, data?.image_url]) {
    const m = u?.match(new RegExp(`/object/public/${BUCKET}/(.+)$`));
    if (m) paths.push(decodeURIComponent(m[1]));
  }
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  const { error } = await supabase.from("videos").delete().eq("id", id);
  if (error) fail("No se pudo eliminar: " + error.message);
  revalidatePath("/videos");
  redirect("/videos");
}

export async function guardarHiggsfieldKey(fd: FormData) {
  const key = String(fd.get("higgsfield_key") ?? "").trim();
  const supabase = await createClient();
  const { error } = await supabase.rpc("higgsfield_set_key", { p_key: key });
  if (error) redirect(`/config?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/config");
  revalidatePath("/videos");
  redirect("/config?ok=1");
}

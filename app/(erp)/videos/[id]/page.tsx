import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fechaHora } from "@/lib/format";
import { CopyLink } from "@/components/CopyLink";
import { ESTADOS, type VideoRow } from "@/lib/videos";
import { sugerirCaption, sugerirFicha, type ReelSpec } from "@/lib/reel/ficha";
import { sugerirSabias } from "@/lib/reel/sabias";
import { TIMELINE } from "@/lib/reel/render";
import { CopyText } from "./CopyText";

export const dynamic = "force-dynamic";

export default async function ReelPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params;
  const { ok, error } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("videos").select("*").eq("id", Number(id)).maybeSingle();
  if (!data) notFound();
  const video = data as VideoRow;

  const [item, negocio] = await Promise.all([
    video.item_id
      ? supabase.from("meli_items").select("title,price,permalink,raw,products(name,kilates,grams,category)").eq("item_id", video.item_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("settings").select("value").eq("key", "negocio").maybeSingle(),
  ]);
  const tallas = video.item_id
    ? ((await supabase.from("meli_variations").select("talla").eq("item_id", video.item_id).gt("available_quantity", 0)).data ?? []).map((v) => String(v.talla ?? "")).filter(Boolean)
    : [];
  type ItemRow = { title: string; price: number | null; permalink: string | null; raw: Record<string, unknown> | null; products: { name: string; kilates: string | null; grams: number | null; category: string | null } | null } | null;
  const it = item.data as unknown as ItemRow;
  const producto = it?.products ?? null;
  const neg = (negocio.data?.value ?? null) as { instagram?: string; whatsapp?: string } | null;
  const sugerida = sugerirFicha(it ? { title: it.title, price: it.price, raw: it.raw } : null, producto, tallas, neg);
  const spec: ReelSpec = { ...sugerida, ...((video.reel_spec ?? {}) as Partial<ReelSpec>) };
  const banco = sugerirSabias(producto?.name ?? video.titulo, producto?.kilates);
  const enBanco = banco.some((s) => s.texto === spec.sabias);
  const caption = video.caption ?? sugerirCaption(spec, it?.permalink);
  const est = ESTADOS[video.status];
  const listo = video.status === "listo" && !!video.video_url;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Armar Reel · #{video.id} {video.titulo}</h1>
          <div className="muted">
            Se toma el clip de Higgsfield ({video.duration}s) y se convierte en un Reel de {TIMELINE.duracion} segundos en formato 1080×1920: logo, título, ficha de la pieza, ¿Sabías que? y llamada a la acción. Sin música: agrégala desde Instagram al publicar (así cuenta como audio con licencia).
          </div>
        </div>
        <Link className="btn secondary" href="/videos">← Videos</Link>
      </div>
      {ok && <p className="notice" style={{ background: "var(--calm-bg)", color: "var(--calm)", marginBottom: 14 }}>Reel armado en {ok} s. Descárgalo abajo.</p>}
      {error && <p className="error" style={{ marginBottom: 14 }}>{error}</p>}

      <div className="grid grid-2">
        <div className="card">
          <h2>Clip base <span className={`tag ${est.tag}`}>{est.label}</span></h2>
          {listo
            ? <video src={video.video_url!} controls muted playsInline loop preload="metadata" style={{ width: "100%", maxWidth: 300, borderRadius: 10, background: "#000", display: "block" }} />
            // eslint-disable-next-line @next/next/no-img-element
            : <img src={video.image_url} alt="" style={{ width: "100%", maxWidth: 300, borderRadius: 10, display: "block" }} />}
          {!listo && <p className="notice" style={{ marginTop: 10 }}>Cuando el clip esté listo podrás armar el Reel. {video.error ? video.error : "Suele tardar de 1 a 5 minutos."}</p>}
          {video.reel_url && (
            <div style={{ marginTop: 18 }}>
              <h2>Reel terminado <span className="muted">· {fechaHora(video.reel_at)}</span></h2>
              <video src={video.reel_url} controls muted playsInline preload="metadata" style={{ width: "100%", maxWidth: 300, borderRadius: 10, background: "#000", display: "block" }} />
              <div className="chips" style={{ marginTop: 10 }}>
                <a className="btn" href={video.reel_url} download={`zahav-reel-${video.id}.mp4`} target="_blank" rel="noreferrer">Descargar MP4</a>
                <CopyLink url={video.reel_url} label="Copiar enlace" />
              </div>
              <p className="muted" style={{ marginTop: 8 }}>En el teléfono: abre el enlace, guarda el video en Fotos y súbelo como Reel. Formato 9:16, 30 fps, H.264.</p>
            </div>
          )}
          {video.reel_error && !video.reel_url && <p className="error" style={{ marginTop: 10 }}>{video.reel_error}</p>}
        </div>

        <form method="post" action={`/videos/${video.id}/reel`} className="card">
          <h2>Textos del Reel</h2>
          <input type="hidden" name="instagram" value={spec.instagram} />
          <div className="form-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
            <label>Título (0–5 s)<input name="titulo" defaultValue={spec.titulo} maxLength={40} required /></label>
            <label>Subtítulo<input name="subtitulo" defaultValue={spec.subtitulo} maxLength={48} /></label>
            <label className="wide">Ficha (5–10 s) · una línea por dato, máximo 8<textarea name="datos" rows={7} defaultValue={spec.datos.join("\n")} /></label>
            <label>Precio (vacío = no mostrar)<input name="precio" defaultValue={spec.precio} maxLength={16} /></label>
            <label>Llamada a la acción (13–15 s) · una por línea<textarea name="cta" rows={2} defaultValue={spec.cta.join("\n")} /></label>
            <label className="wide">
              ¿Sabías que? (10–13.5 s)
              <select name="sabias" defaultValue={enBanco ? spec.sabias : ""}>
                <option value="">— Escribir uno propio abajo —</option>
                {banco.map((s) => <option key={s.id} value={s.texto}>{s.texto}</option>)}
              </select>
            </label>
            <label className="wide">Texto propio (si lo llenas, se usa en lugar del de arriba)<textarea name="sabias_custom" rows={3} defaultValue={enBanco ? "" : spec.sabias} maxLength={220} /></label>
          </div>
          <div className="chips" style={{ marginTop: 12 }}>
            <button className="btn" type="submit" disabled={!listo} title={listo ? "" : "El clip todavía no está listo"}>Armar Reel (tarda 1–2 minutos)</button>
            {(["titulo", "ficha", "sabias", "cta"] as const).map((c) => (
              <button key={c} className="chip" type="submit" name="capa" value={c} formMethod="get" formAction={`/videos/${video.id}/reel`} formTarget="_blank" style={{ cursor: "pointer" }}>
                Vista previa: {c === "titulo" ? "título" : c === "ficha" ? "ficha" : c === "sabias" ? "¿Sabías que?" : "cierre"}
              </button>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 8 }}>Las vistas previas abren una imagen con los textos sobre la foto de la pieza; sirven para revisar que todo quepa antes de armar el video.</p>
        </form>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h2>Texto para la publicación en Instagram</h2>
        <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 14, background: "#f8faf8", padding: 14, borderRadius: 10, margin: "0 0 10px" }}>{caption}</pre>
        <CopyText text={caption} label="Copiar texto" />
        <p className="muted" style={{ marginTop: 8 }}>Sugerencias: publica entre 7 y 9 pm, contesta los comentarios la primera hora, pon el enlace de Mercado Libre en la bio y usa la portada del segundo 2 (la pieza sola) como miniatura.</p>
      </div>
    </>
  );
}

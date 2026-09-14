import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fechaHora } from "@/lib/format";
import { CopyLink } from "@/components/CopyLink";
import { DESTINOS, EN_PROCESO, ESTADOS, MODELOS, type VideoRow } from "@/lib/videos";
import { AutoRefresh } from "./AutoRefresh";
import { VideoForm, type ItemFotos } from "./VideoForm";
import { eliminarVideo, reintentarVideo, revisarVideos } from "./actions";

export const dynamic = "force-dynamic";

type ItemRaw = { item_id: string; title: string; status: string; sold_quantity: number; pictures: { secure_url?: string; url?: string }[] | null; products: { name: string } | null };

export default async function VideosPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const supabase = await createClient();
  const [key, items, videos] = await Promise.all([
    supabase.rpc("higgsfield_has_key"),
    supabase.from("meli_items").select("item_id,title,status,sold_quantity,raw->pictures,products(name)").eq("status", "active").order("sold_quantity", { ascending: false }),
    supabase.from("videos").select("*").order("id", { ascending: false }).limit(100),
  ]);
  const hasKey = key.data === true;
  const fotos: ItemFotos[] = ((items.data ?? []) as unknown as ItemRaw[]).map((i) => ({
    item_id: i.item_id,
    title: i.title,
    producto: i.products?.name ?? null,
    pictures: (i.pictures ?? []).map((p) => (p.secure_url ?? p.url ?? "").replace(/^http:\/\//, "https://")).filter(Boolean).slice(0, 12),
  })).filter((i) => i.pictures.length > 0);
  const rows = (videos.data ?? []) as VideoRow[];
  const enProceso = rows.some((r) => EN_PROCESO.includes(r.status));

  return (
    <>
      <AutoRefresh activo={enProceso} />
      <div className="page-head">
        <div>
          <h1>Videos</h1>
          <div className="muted">
            Convierte una foto de tus piezas en un video corto con Higgsfield (inteligencia artificial) para Reels de Instagram y Clips de Mercado Libre. Cada video gasta créditos de tu cuenta de Higgsfield.
          </div>
        </div>
        <form action={revisarVideos}><button className="btn secondary" type="submit">Actualizar estado</button></form>
      </div>

      {!hasKey && (
        <p className="notice" style={{ marginBottom: 14 }}>
          Falta la clave de Higgsfield. Crea una en <a href="https://cloud.higgsfield.ai" target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>cloud.higgsfield.ai</a> (API keys) y pégala en <Link href="/config" style={{ textDecoration: "underline" }}>Configuración</Link> con el formato <code>API_KEY:API_SECRET</code>.
        </p>
      )}
      {ok && <p className="notice" style={{ background: "var(--calm-bg)", color: "var(--calm)", marginBottom: 14 }}>Video #{ok} enviado a Higgsfield. Suele tardar de 1 a 5 minutos; la página se actualiza sola.</p>}
      {error && <p className="error" style={{ marginBottom: 14 }}>{error}</p>}

      <VideoForm items={fotos} disabled={!hasKey} />

      <div className="card tight">
        <h2>Videos generados <span className="muted">· {rows.length}</span></h2>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Vista</th><th>Video</th><th>Destino</th><th>Estado</th><th>Creado</th><th></th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6} className="muted" style={{ padding: 18 }}>Aún no hay videos. Genera el primero arriba.</td></tr>}
              {rows.map((r) => {
                const est = ESTADOS[r.status];
                return (
                  <tr key={r.id}>
                    <td style={{ width: 120 }}>
                      {r.status === "listo" && r.video_url
                        ? <video src={r.video_url} controls muted playsInline preload="metadata" style={{ width: 108, borderRadius: 8, background: "#000", display: "block" }} />
                        // eslint-disable-next-line @next/next/no-img-element
                        : <img src={r.image_url} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, display: "block", opacity: r.status === "listo" ? 1 : 0.7 }} />}
                    </td>
                    <td style={{ whiteSpace: "normal", maxWidth: 420 }}>
                      <b>#{r.id} · {r.titulo}</b>
                      <div className="muted" style={{ fontSize: 12 }}>{MODELOS.find((m) => m.value === r.model)?.label ?? r.model} · {r.aspect_ratio} · {r.duration}s</div>
                      <details><summary className="muted" style={{ cursor: "pointer", fontSize: 12 }}>Prompt</summary><div className="muted" style={{ fontSize: 12 }}>{r.prompt}</div></details>
                      {r.error && <div className="error" style={{ marginTop: 6, fontSize: 12, whiteSpace: "normal" }}>{r.error}</div>}
                      {r.reel_url && <div style={{ marginTop: 6 }}><a href={r.reel_url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Reel armado ({fechaHora(r.reel_at)}) · descargar</a></div>}
                    </td>
                    <td>{DESTINOS.find((d) => d.value === r.destino)?.label.split(" (")[0] ?? r.destino}</td>
                    <td>
                      <span className={`tag ${est.tag}`}>{est.label}</span>
                      {EN_PROCESO.includes(r.status) && <div className="muted" style={{ fontSize: 11 }}>intento {r.attempts}</div>}
                    </td>
                    <td>{fechaHora(r.created_at)}{r.finished_at ? <div className="muted" style={{ fontSize: 11 }}>listo {fechaHora(r.finished_at)}</div> : null}</td>
                    <td>
                      <div className="chips">
                        {r.status === "listo" && r.video_url && (
                          <>
                            <Link className="chip active" href={`/videos/${r.id}`}>{r.reel_url ? "Reel listo · editar" : "Armar Reel para IG"}</Link>
                            <a className="chip" href={r.video_url} download={`zahav-video-${r.id}.mp4`} target="_blank" rel="noreferrer">Descargar clip</a>
                            <CopyLink url={r.video_url} label="Copiar enlace" small />
                          </>
                        )}
                        {(r.status === "error" || r.status === "nsfw" || r.status === "listo") && (
                          <form action={reintentarVideo}><input type="hidden" name="id" value={r.id} /><button className="chip" type="submit" style={{ cursor: "pointer" }}>{r.status === "listo" ? "Otra versión" : "Reintentar"}</button></form>
                        )}
                        <form action={eliminarVideo}><input type="hidden" name="id" value={r.id} /><button className="chip" type="submit" style={{ cursor: "pointer", color: "var(--alarm)" }}>Eliminar</button></form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 14 }}>
        Cómo usarlos: <b>Instagram</b> → descarga el MP4 en el teléfono y publícalo como Reel o historia. <b>Mercado Libre</b> → en la publicación, sección Clips (o desde la app de vendedor), sube el mismo MP4 vertical.
        Los videos quedan guardados en tu Supabase (bucket <code>videos</code>); el enlace de Higgsfield caduca en una hora, por eso se copian.
      </p>
    </>
  );
}

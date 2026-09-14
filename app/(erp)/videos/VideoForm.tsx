"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { ASPECTOS, DESTINOS, DURACIONES, MODELOS, PROMPTS } from "@/lib/videos";
import { crearVideo } from "./actions";

export type ItemFotos = { item_id: string; title: string; producto: string | null; pictures: string[] };

function Enviar() {
  const { pending } = useFormStatus();
  return <button className="btn" type="submit" disabled={pending}>{pending ? "Enviando a Higgsfield…" : "Generar video"}</button>;
}

export function VideoForm({ items, disabled }: { items: ItemFotos[]; disabled: boolean }) {
  const [itemId, setItemId] = useState(items[0]?.item_id ?? "");
  const item = useMemo(() => items.find((i) => i.item_id === itemId) ?? null, [items, itemId]);
  const [imageUrl, setImageUrl] = useState(items[0]?.pictures[0] ?? "");
  const [fileName, setFileName] = useState("");
  const [prompt, setPrompt] = useState(PROMPTS[0].prompt);
  const [destino, setDestino] = useState<"ig" | "ml">("ig");
  const [aspect, setAspect] = useState("9:16");

  function elegirItem(id: string) {
    setItemId(id);
    const it = items.find((i) => i.item_id === id);
    setImageUrl(it?.pictures[0] ?? "");
    setFileName("");
  }
  function elegirDestino(d: "ig" | "ml") {
    setDestino(d);
    setAspect(DESTINOS.find((x) => x.value === d)?.aspect ?? "9:16");
  }

  return (
    <form action={crearVideo} className="card" style={{ marginBottom: 14 }}>
      <h2>Nuevo video</h2>
      <div className="grid grid-2">
        <div>
          <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
            <label>
              Publicación de Mercado Libre (de aquí salen las fotos)
              <select name="item_id" value={itemId} onChange={(e) => elegirItem(e.target.value)}>
                <option value="">— Sin publicación (solo foto subida) —</option>
                {items.map((i) => <option key={i.item_id} value={i.item_id}>{i.title}{i.producto ? ` · ${i.producto}` : ""}</option>)}
              </select>
            </label>
          </div>
          {item && item.pictures.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div className="muted" style={{ marginBottom: 6 }}>Elige la foto de partida (la que mejor se vea de frente y con fondo limpio):</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {item.pictures.map((p) => (
                  <button
                    key={p} type="button" onClick={() => { setImageUrl(p); setFileName(""); }}
                    title="Usar esta foto"
                    style={{ padding: 0, border: imageUrl === p && !fileName ? "3px solid var(--brass)" : "3px solid transparent", borderRadius: 8, background: "#fff", cursor: "pointer", lineHeight: 0 }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p} alt="" width={84} height={84} style={{ objectFit: "cover", borderRadius: 6, display: "block" }} loading="lazy" />
                  </button>
                ))}
              </div>
            </div>
          )}
          <input type="hidden" name="image_url" value={fileName ? "" : imageUrl} />
          <div className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 12 }}>
            <label>
              O sube tu propia foto (JPG/PNG/WebP, máx. 10 MB){fileName ? ` · ${fileName}` : ""}
              <input type="file" name="foto" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")} />
            </label>
            <label>Nombre del video (opcional)<input name="titulo" placeholder={item?.title ?? "Ej. Argolla 3mm reel septiembre"} /></label>
          </div>
        </div>
        <div>
          <div className="muted" style={{ marginBottom: 6 }}>Plantillas de movimiento (puedes editarlas abajo):</div>
          <div className="chips" style={{ marginBottom: 10 }}>
            {PROMPTS.map((p) => (
              <button key={p.label} type="button" className={`chip ${prompt === p.prompt ? "active" : ""}`} onClick={() => setPrompt(p.prompt)}>{p.label}</button>
            ))}
          </div>
          <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
            <label>
              Prompt (en inglés funciona mejor; describe el movimiento de cámara y la luz)
              <textarea name="prompt" rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} required />
            </label>
          </div>
          <div className="form-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))", marginTop: 10 }}>
            <label>
              Destino
              <select name="destino" value={destino} onChange={(e) => elegirDestino(e.target.value as "ig" | "ml")}>
                {DESTINOS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </label>
            <label>
              Formato
              <select name="aspect_ratio" value={aspect} onChange={(e) => setAspect(e.target.value)}>
                {ASPECTOS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </label>
            <label>
              Calidad
              <select name="model" defaultValue="dop-turbo">
                {MODELOS.map((m) => <option key={m.value} value={m.value}>{m.label} · {m.hint}</option>)}
              </select>
            </label>
            <label>
              Duración
              <select name="duration" defaultValue="5">
                {DURACIONES.map((d) => <option key={d} value={d}>{d} segundos</option>)}
              </select>
            </label>
          </div>
          <p className="muted" style={{ margin: "10px 0" }}>{DESTINOS.find((d) => d.value === destino)?.hint}</p>
          {disabled
            ? <p className="notice">Primero captura la clave de Higgsfield en Configuración.</p>
            : <Enviar />}
        </div>
      </div>
    </form>
  );
}

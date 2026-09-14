/** Catálogo de opciones para los videos generados con Higgsfield. */

export type VideoRow = {
  id: number; item_id: string | null; product_id: number | null; destino: "ig" | "ml"; titulo: string; image_url: string; prompt: string;
  model: string; aspect_ratio: string; duration: number; status: "pendiente" | "en_cola" | "generando" | "listo" | "error" | "nsfw";
  request_id: string | null; video_url: string | null; error: string | null; attempts: number; created_at: string; finished_at: string | null;
  reel_url: string | null; reel_spec: Record<string, unknown> | null; reel_error: string | null; reel_at: string | null; caption: string | null;
};

export const DESTINOS: { value: "ig" | "ml"; label: string; hint: string; aspect: string }[] = [
  { value: "ig", label: "Instagram (Reel / historia)", hint: "Vertical 9:16. Descárgalo y súbelo desde la app de Instagram.", aspect: "9:16" },
  { value: "ml", label: "Mercado Libre (Clip de la publicación)", hint: "Vertical 9:16. Súbelo en la publicación → Clips, o compártelo en el chat de ML.", aspect: "9:16" },
];

export const MODELOS: { value: string; label: string; hint: string }[] = [
  { value: "dop-turbo", label: "Turbo", hint: "Rápido y económico. Ideal para probar." },
  { value: "dop-standard", label: "Estándar", hint: "Mejor calidad, tarda más y cuesta más créditos." },
  { value: "dop-lite", label: "Lite", hint: "El más barato." },
];

export const DURACIONES = [3, 5];

export const ASPECTOS: { value: string; label: string }[] = [
  { value: "9:16", label: "9:16 vertical (Reel / Clip)" },
  { value: "1:1", label: "1:1 cuadrado (feed)" },
  { value: "16:9", label: "16:9 horizontal" },
];

/** Prompts en inglés (Higgsfield responde mejor así) pensados para joyería de oro. */
export const PROMPTS: { label: string; prompt: string }[] = [
  {
    label: "Realista · producto en estudio",
    prompt: "Photorealistic luxury jewelry commercial. The exact gold ring from the photo stays perfectly in focus while the camera performs a slow, smooth 20-degree orbit; soft warm key light with a large softbox glides across the polished gold surface producing gentle, realistic specular highlights and tiny sparkles on the stones; deep black velvet background with subtle bokeh; shallow depth of field; macro lens; 4k detail; keep the ring shape, color and proportions identical to the photo; no hands, no text, no extra objects, no deformation.",
  },
  {
    label: "Giro lento con brillo",
    prompt: "Luxury jewelry product video. The gold piece slowly rotates on a dark velvet surface, soft warm studio light glides across the metal creating elegant sparkles, shallow depth of field, cinematic, high detail, no text.",
  },
  {
    label: "Acercamiento (zoom in)",
    prompt: "Slow cinematic push-in towards the gold jewelry, light reflections shimmer over the polished surface, subtle camera movement, elegant and premium look, high detail, no text.",
  },
  {
    label: "Orbita de cámara",
    prompt: "Camera orbits smoothly around the gold ring, catching warm highlights and reflections, luxury advertisement style, soft bokeh background, steady motion, no text.",
  },
  {
    label: "Diamante destellando",
    prompt: "Macro shot of the jewelry, the diamond sparkles with rainbow light flares as the camera drifts slightly, elegant dark background, luxury commercial, no text.",
  },
  {
    label: "Estilo Instagram con manos",
    prompt: "Hands elegantly presenting the gold jewelry piece to the camera, gentle movement, warm natural light, soft background, lifestyle Instagram ad, high quality, no text.",
  },
];

export const ESTADOS: Record<VideoRow["status"], { label: string; tag: string }> = {
  pendiente: { label: "Enviando", tag: "neutral" },
  en_cola: { label: "En cola", tag: "neutral" },
  generando: { label: "Generando", tag: "warn" },
  listo: { label: "Listo", tag: "ok" },
  error: { label: "Error", tag: "bad" },
  nsfw: { label: "Rechazado", tag: "bad" },
};

export const EN_PROCESO: VideoRow["status"][] = ["pendiente", "en_cola", "generando"];

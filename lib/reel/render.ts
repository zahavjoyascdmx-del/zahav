/** Dibuja las capas de texto (PNG con transparencia, 1080×1920) que se montan sobre el clip para Instagram. */
import path from "node:path";
import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import type { ReelSpec } from "./ficha";

export const W = 1080;
export const H = 1920;
// Zonas seguras de Reels: la interfaz de Instagram tapa ~220 px arriba y ~330 px abajo.
const SAFE_TOP = 230;
const SAFE_BOTTOM = H - 340;

const GOLD = "#b08a3e";
const GOLD_LIGHT = "#e9d7a8";
const CREAM = "#f6f1e6";
const INK = "#14251e";

export type Capa = { nombre: string; png: Buffer; desde: number; hasta: number; fade: number };

const FONT_DIR = path.join(process.cwd(), "lib", "reel", "fonts");
let fontsReady = false;
function registrarFuentes() {
  if (fontsReady) return;
  for (const [file, family] of [
    ["PlayfairDisplay-Bold.ttf", "PlayfairDisplay-Bold"], ["PlayfairDisplay-Regular.ttf", "PlayfairDisplay-Regular"], ["PlayfairDisplay-Italic.ttf", "PlayfairDisplay-Italic"],
    ["Montserrat-Regular.ttf", "Montserrat-Regular"], ["Montserrat-SemiBold.ttf", "Montserrat-SemiBold"],
  ]) GlobalFonts.registerFromPath(path.join(FONT_DIR, file), family);
  fontsReady = true;
}
const F = {
  titulo: (px: number) => `${px}px "PlayfairDisplay-Bold"`,
  serif: (px: number) => `${px}px "PlayfairDisplay-Regular"`,
  italic: (px: number) => `${px}px "PlayfairDisplay-Italic"`,
  sans: (px: number) => `${px}px "Montserrat-Regular"`,
  sansB: (px: number) => `${px}px "Montserrat-SemiBold"`,
};

// ---------------------------------------------------------------- utilidades de dibujo
function anchoEspaciado(ctx: SKRSContext2D, text: string, spacing: number) {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + spacing;
  return w - spacing;
}
/** Texto centrado con espaciado entre letras (para mayúsculas pequeñas). */
function textoEspaciado(ctx: SKRSContext2D, text: string, cx: number, y: number, spacing: number) {
  const total = anchoEspaciado(ctx, text, spacing);
  let x = cx - total / 2;
  ctx.textAlign = "left";
  for (const ch of text) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + spacing;
  }
}
function envolver(ctx: SKRSContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  for (const parrafo of text.split("\n")) {
    let line = "";
    for (const word of parrafo.split(/\s+/).filter(Boolean)) {
      const t = line ? line + " " + word : word;
      if (ctx.measureText(t).width <= maxW || !line) line = t;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
  }
  return lines;
}
function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function panel(ctx: SKRSContext2D, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 12;
  roundRect(ctx, x, y, w, h, 30);
  ctx.fillStyle = "rgba(20,37,30,0.84)"; ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, x + 10, y + 10, w - 20, h - 20, 22);
  ctx.strokeStyle = "rgba(176,138,62,0.75)"; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}
function ornamento(ctx: SKRSContext2D, cx: number, y: number, ancho: number) {
  ctx.save();
  ctx.strokeStyle = GOLD; ctx.fillStyle = GOLD; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx - ancho / 2, y); ctx.lineTo(cx - 22, y); ctx.moveTo(cx + 22, y); ctx.lineTo(cx + ancho / 2, y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, y - 9); ctx.lineTo(cx + 9, y); ctx.lineTo(cx, y + 9); ctx.lineTo(cx - 9, y); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function sombraTexto(ctx: SKRSContext2D, on: boolean) {
  ctx.shadowColor = on ? "rgba(0,0,0,0.55)" : "transparent";
  ctx.shadowBlur = on ? 18 : 0;
  ctx.shadowOffsetY = on ? 3 : 0;
}
function nuevo() {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "alphabetic";
  return { canvas, ctx };
}

// ---------------------------------------------------------------- capas
async function capaMarca(spec: ReelSpec): Promise<Buffer> {
  const { canvas, ctx } = nuevo();
  // Viñetas suaves arriba y abajo para que el texto siempre se lea sobre el video.
  const top = ctx.createLinearGradient(0, 0, 0, 420);
  top.addColorStop(0, "rgba(0,0,0,0.42)"); top.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = top; ctx.fillRect(0, 0, W, 420);
  const bottom = ctx.createLinearGradient(0, 1050, 0, H);
  bottom.addColorStop(0, "rgba(0,0,0,0)"); bottom.addColorStop(1, "rgba(0,0,0,0.62)");
  ctx.fillStyle = bottom; ctx.fillRect(0, 1050, W, H - 1050);
  // Logo sobre placa clara (el logo es dorado y se pierde sobre fondos oscuros).
  try {
    const logo = await loadImage(path.join(process.cwd(), "public", "logo.png"));
    const lw = 250, lh = Math.round((lw * logo.height) / logo.width);
    const px = 26, py = 18;
    const x = (W - lw) / 2, y = SAFE_TOP + 6;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 6;
    roundRect(ctx, x - px, y - py, lw + px * 2, lh + py * 2, 18);
    ctx.fillStyle = "rgba(255,255,255,0.93)"; ctx.fill();
    ctx.restore();
    ctx.drawImage(logo, x, y, lw, lh);
    if (spec.instagram) {
      ctx.fillStyle = GOLD_LIGHT; ctx.font = F.sans(26); sombraTexto(ctx, true);
      textoEspaciado(ctx, spec.instagram, W / 2, y + lh + py + 46, 4);
      sombraTexto(ctx, false);
    }
  } catch {
    ctx.fillStyle = GOLD_LIGHT; ctx.font = F.titulo(64); sombraTexto(ctx, true);
    textoEspaciado(ctx, "ZAHAV", W / 2, SAFE_TOP + 70, 14);
    sombraTexto(ctx, false);
  }
  return canvas.toBuffer("image/png");
}

function capaTitulo(spec: ReelSpec): Buffer {
  const { canvas, ctx } = nuevo();
  ctx.textAlign = "center";
  // Tamaño: el más grande (hasta 96 px) con el que el título cabe en una línea; si aun a 66 px no cabe, se parte en dos.
  let size = 96;
  ctx.font = F.titulo(size);
  while (size > 66 && ctx.measureText(spec.titulo).width > 940) { size -= 4; ctx.font = F.titulo(size); }
  const lineas = envolver(ctx, spec.titulo, 940);
  const lh = Math.round(size * 1.12);
  const bloque = lineas.length * lh + (spec.subtitulo ? 70 : 0) + 40;
  let y = SAFE_BOTTOM - bloque + lh;
  ornamento(ctx, W / 2, y - lh + 4, 220);
  sombraTexto(ctx, true);
  ctx.fillStyle = CREAM;
  for (const l of lineas) { ctx.fillText(l, W / 2, y); y += lh; }
  if (spec.subtitulo) {
    ctx.fillStyle = GOLD_LIGHT; ctx.font = F.sans(34);
    textoEspaciado(ctx, spec.subtitulo.toUpperCase(), W / 2, y + 8, 6);
  }
  sombraTexto(ctx, false);
  return canvas.toBuffer("image/png");
}

function capaFicha(spec: ReelSpec): Buffer {
  const { canvas, ctx } = nuevo();
  const datos = spec.datos.filter(Boolean).slice(0, 8);
  const rowH = 64;
  const x = 90, w = W - 180;
  const h = 150 + datos.length * rowH + (spec.precio ? 175 : 40);
  const y = SAFE_BOTTOM - h;
  panel(ctx, x, y, w, h);
  ctx.font = F.sansB(24); ctx.fillStyle = GOLD;
  textoEspaciado(ctx, "FICHA DE LA PIEZA", W / 2, y + 62, 8);
  ctx.textAlign = "center"; ctx.fillStyle = CREAM; ctx.font = F.serif(44);
  ctx.fillText(spec.titulo, W / 2, y + 120);
  let ry = y + 150 + 44;
  ctx.textAlign = "left"; ctx.font = F.sans(34);
  for (const d of datos) {
    ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(x + 70, ry - 12, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = CREAM; ctx.fillText(d, x + 100, ry);
    ry += rowH;
  }
  if (spec.precio) {
    ctx.strokeStyle = "rgba(176,138,62,0.5)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 60, ry - 20); ctx.lineTo(x + w - 60, ry - 20); ctx.stroke();
    ctx.textAlign = "center"; ctx.fillStyle = GOLD_LIGHT; ctx.font = F.titulo(70);
    ctx.fillText(spec.precio, W / 2, ry + 62);
    ctx.font = F.sans(24); ctx.fillStyle = GOLD;
    textoEspaciado(ctx, "PESOS MEXICANOS", W / 2 + 0, ry + 96, 5);
  }
  return canvas.toBuffer("image/png");
}

function capaSabias(spec: ReelSpec): Buffer {
  const { canvas, ctx } = nuevo();
  ctx.textAlign = "center";
  ctx.font = F.italic(50);
  const lineas = envolver(ctx, spec.sabias, 800);
  const lh = 66;
  const h = 210 + lineas.length * lh + 70;
  const w = W - 160, x = 80;
  const y = Math.max(SAFE_TOP + 260, (SAFE_TOP + SAFE_BOTTOM) / 2 - h / 2 + 60);
  panel(ctx, x, y, w, h);
  ctx.fillStyle = GOLD; ctx.font = F.sansB(34);
  textoEspaciado(ctx, "¿SABÍAS QUE?", W / 2, y + 96, 10);
  ornamento(ctx, W / 2, y + 140, 260);
  ctx.fillStyle = CREAM; ctx.font = F.italic(50); ctx.textAlign = "center";
  let ty = y + 210 + 30;
  for (const l of lineas) { ctx.fillText(l, W / 2, ty); ty += lh; }
  return canvas.toBuffer("image/png");
}

function capaCta(spec: ReelSpec): Buffer {
  const { canvas, ctx } = nuevo();
  const lineas = spec.cta.filter(Boolean);
  const [principal, ...resto] = lineas;
  let y = SAFE_BOTTOM - 60 - resto.length * 58;
  if (principal) {
    ctx.font = F.sansB(34);
    const tw = anchoEspaciado(ctx, principal.toUpperCase(), 3) + 120;
    const bx = (W - tw) / 2, by = y - 88, bh = 96;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.4)"; ctx.shadowBlur = 30; ctx.shadowOffsetY = 8;
    roundRect(ctx, bx, by, tw, bh, 48);
    const g = ctx.createLinearGradient(bx, by, bx + tw, by + bh);
    g.addColorStop(0, "#c9a45a"); g.addColorStop(1, "#a8823a");
    ctx.fillStyle = g; ctx.fill();
    ctx.restore();
    ctx.fillStyle = INK;
    textoEspaciado(ctx, principal.toUpperCase(), W / 2, by + 62, 3);
    y += 40;
  }
  sombraTexto(ctx, true);
  for (const r of resto) {
    ctx.fillStyle = CREAM; ctx.font = F.sans(36); ctx.textAlign = "center";
    ctx.fillText(r, W / 2, y);
    y += 58;
  }
  sombraTexto(ctx, false);
  return canvas.toBuffer("image/png");
}

/** Línea de tiempo del Reel (segundos). */
export const TIMELINE = {
  duracion: 15,
  titulo: [0.5, 4.8],
  ficha: [4.8, 9.7],
  sabias: [9.7, 13.5],
  cta: [13.5, 15],
} as const;

export async function renderCapas(spec: ReelSpec): Promise<Capa[]> {
  registrarFuentes();
  const capas: Capa[] = [{ nombre: "marca", png: await capaMarca(spec), desde: 0, hasta: TIMELINE.duracion, fade: 0 }];
  if (spec.titulo) capas.push({ nombre: "titulo", png: capaTitulo(spec), desde: TIMELINE.titulo[0], hasta: TIMELINE.titulo[1], fade: 0.45 });
  if (spec.datos.some(Boolean)) capas.push({ nombre: "ficha", png: capaFicha(spec), desde: TIMELINE.ficha[0], hasta: TIMELINE.ficha[1], fade: 0.45 });
  if (spec.sabias) capas.push({ nombre: "sabias", png: capaSabias(spec), desde: TIMELINE.sabias[0], hasta: TIMELINE.sabias[1], fade: 0.45 });
  if (spec.cta.some(Boolean)) capas.push({ nombre: "cta", png: capaCta(spec), desde: TIMELINE.cta[0], hasta: TIMELINE.cta[1], fade: 0.4 });
  return capas;
}

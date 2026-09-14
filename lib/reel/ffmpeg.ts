/** Monta el clip de Higgsfield con las capas de texto usando ffmpeg (binario de ffmpeg-static). */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { H, W, type Capa } from "./render";

const FFMPEG = String(ffmpegStatic || "ffmpeg");

export type ComposicionResultado = { mp4: Buffer; segundos: number; log: string };

function run(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => { err += d.toString(); if (err.length > 20000) err = err.slice(-20000); });
    const t = setTimeout(() => { p.kill("SIGKILL"); reject(new Error("ffmpeg tardó demasiado. " + err.slice(-600))); }, timeoutMs);
    p.on("error", (e) => { clearTimeout(t); reject(e); });
    p.on("close", (code) => { clearTimeout(t); code === 0 ? resolve(err) : reject(new Error(`ffmpeg terminó con código ${code}: ${err.slice(-900)}`)); });
  });
}

/**
 * clip: bytes del video base (cualquier tamaño; se recorta a 1080×1920 y se repite hasta cubrir la duración).
 * capas: PNG 1080×1920 con transparencia y su ventana de tiempo.
 */
export async function componerReel(clip: Buffer, capas: Capa[], duracion: number, timeoutMs = 240_000): Promise<ComposicionResultado> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "reel-"));
  const t0 = Date.now();
  try {
    const clipPath = path.join(dir, "clip.mp4");
    await writeFile(clipPath, clip);
    const args: string[] = ["-y", "-hide_banner", "-loglevel", "error", "-stats", "-stream_loop", "-1", "-i", clipPath];
    for (let i = 0; i < capas.length; i++) {
      const f = path.join(dir, `capa${i}.png`);
      await writeFile(f, capas[i].png);
      args.push("-loop", "1", "-framerate", "30", "-i", f);
    }
    const filtros: string[] = [
      `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=30,format=yuv420p[v0]`,
    ];
    let prev = "v0";
    capas.forEach((c, i) => {
      const inp = `${i + 1}:v`;
      const fades = c.fade > 0
        ? `,fade=t=in:st=${c.desde}:d=${c.fade}:alpha=1,fade=t=out:st=${(c.hasta - c.fade).toFixed(2)}:d=${c.fade}:alpha=1`
        : "";
      filtros.push(`[${inp}]format=rgba${fades}[c${i}]`);
      const enable = c.desde <= 0 && c.hasta >= duracion ? "" : `:enable='between(t,${c.desde},${c.hasta})'`;
      filtros.push(`[${prev}][c${i}]overlay=0:0:format=auto${enable}[v${i + 1}]`);
      prev = `v${i + 1}`;
    });
    const out = path.join(dir, "reel.mp4");
    args.push(
      "-filter_complex", filtros.join(";"),
      "-map", `[${prev}]`,
      "-t", String(duracion),
      "-r", "30",
      "-c:v", "libx264", "-preset", process.env.REEL_PRESET || "ultrafast", "-crf", process.env.REEL_CRF || "22", "-profile:v", "high", "-level", "4.1",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an",
      out,
    );
    const log = await run(args, timeoutMs);
    const mp4 = await readFile(out);
    return { mp4, segundos: Math.round((Date.now() - t0) / 100) / 10, log: log.slice(-800) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

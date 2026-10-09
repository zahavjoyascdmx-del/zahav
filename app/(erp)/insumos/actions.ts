"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayCdmx } from "@/lib/format";

const TIPOS = ["compra", "devolucion", "ajuste"];
const entero = (v: FormDataEntryValue | null) => Math.round(Number(String(v ?? "").replace(/[^0-9.-]/g, "")) || 0);
const fecha = (v: FormDataEntryValue | null) => {
  const f = String(v ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : todayCdmx();
};

/** Compra, devolución (se recupera el % configurado) o ajuste (negativo para restar). */
export async function agregarMovimiento(fd: FormData) {
  const insumo_id = String(fd.get("insumo_id") ?? "");
  const tipo = String(fd.get("tipo") ?? "");
  let cantidad = entero(fd.get("cantidad"));
  if (tipo !== "ajuste") cantidad = Math.abs(cantidad);
  if (!insumo_id || !TIPOS.includes(tipo) || cantidad === 0) redirect("/insumos?error=movimiento#movimientos");
  const nota = String(fd.get("nota") ?? "").trim() || null;
  const supabase = await createClient();
  const { error } = await supabase.from("insumo_movimientos").insert({ fecha: fecha(fd.get("fecha")), insumo_id, tipo, cantidad, nota });
  if (error) throw new Error(error.message);
  revalidatePath("/insumos");
  redirect(`/insumos?ok=${tipo}#movimientos`);
}

export async function borrarMovimiento(fd: FormData) {
  const supabase = await createClient();
  await supabase.from("insumo_movimientos").delete().eq("id", Number(fd.get("id")));
  revalidatePath("/insumos");
  redirect("/insumos#movimientos");
}

/** Nuevo conteo: fecha, conteo inicial y mínimo de cada empaque, % que se recupera de devoluciones y empaque de ventas directas. */
export async function guardarConteo(fd: FormData) {
  const supabase = await createClient();
  const now = new Date().toISOString();
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("conteo__")) continue;
    const id = k.slice(8);
    const { error } = await supabase.from("insumos")
      .update({ conteo_inicial: Math.max(0, entero(v)), minimo: Math.max(0, entero(fd.get(`minimo__${id}`))), updated_at: now })
      .eq("id", id);
    if (error) throw new Error(error.message);
  }
  const pct = Math.min(100, Math.max(0, entero(fd.get("devolucion_pct"))));
  const directas = String(fd.get("empaque_directas") ?? "");
  const { error } = await supabase.from("settings").upsert([
    { key: "insumos_fecha_conteo", value: fecha(fd.get("fecha_conteo")), updated_at: now },
    { key: "insumos_devolucion_pct", value: pct, updated_at: now },
    { key: "insumos_empaque_directas", value: directas, updated_at: now },
  ], { onConflict: "key" });
  if (error) throw new Error(error.message);
  revalidatePath("/insumos");
  redirect("/insumos?ok=conteo");
}

/** Empaque de cada producto. Campos: emp__<product_id> = id del insumo o "" (sin empaque). */
export async function guardarEmpaques(fd: FormData) {
  const supabase = await createClient();
  const grupos = new Map<string, number[]>();
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("emp__")) continue;
    const id = Number(k.slice(5));
    if (id) grupos.set(String(v), [...(grupos.get(String(v)) ?? []), id]);
  }
  for (const [insumo, ids] of grupos) {
    const { error } = await supabase.from("products").update({ insumo_id: insumo || null }).in("id", ids);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/insumos");
  redirect("/insumos?ok=empaques#empaques");
}

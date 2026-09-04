"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Guarda el precio del oro del mes por proveedor y kilataje. Campos: oro__<proveedor>__<kilates>. */
export async function guardarOro(fd: FormData) {
  const mes = String(fd.get("mes") ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-01$/.test(mes)) throw new Error("Mes inválido");
  const filas: { mes: string; proveedor: string; kilates: string; precio: number; updated_at: string }[] = [];
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("oro__")) continue;
    const [, proveedor, kilates] = k.split("__");
    const precio = Number(String(v).replace(/[^0-9.]/g, ""));
    if (proveedor && kilates && precio > 0) filas.push({ mes, proveedor, kilates, precio, updated_at: new Date().toISOString() });
  }
  const supabase = await createClient();
  if (filas.length) {
    const { error } = await supabase.from("gold_prices").upsert(filas, { onConflict: "mes,proveedor,kilates" });
    if (error) throw new Error(error.message);
  }
  revalidatePath("/reporte");
  revalidatePath("/pedido");
  redirect(`/reporte?mes=${mes}&ok=1`);
}

/** Agrega un gasto manual del mes (lo que no viene de Mercado Libre). */
export async function agregarGasto(fd: FormData) {
  const mes = String(fd.get("mes") ?? "").slice(0, 10);
  const concepto = String(fd.get("concepto") ?? "").trim();
  const monto = Number(String(fd.get("monto") ?? "").replace(/[^0-9.]/g, ""));
  if (!/^\d{4}-\d{2}-01$/.test(mes) || !concepto || !(monto > 0)) redirect(`/reporte?mes=${mes}`);
  const supabase = await createClient();
  const { error } = await supabase.from("gastos_mensuales").insert({ mes, concepto, monto, nota: String(fd.get("nota") ?? "").trim() || null });
  if (error) throw new Error(error.message);
  revalidatePath("/reporte");
  redirect(`/reporte?mes=${mes}#gastos`);
}

export async function borrarGasto(fd: FormData) {
  const id = Number(fd.get("id"));
  const mes = String(fd.get("mes") ?? "").slice(0, 10);
  const supabase = await createClient();
  await supabase.from("gastos_mensuales").delete().eq("id", id);
  revalidatePath("/reporte");
  redirect(`/reporte?mes=${mes}#gastos`);
}

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

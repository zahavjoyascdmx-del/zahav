"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const numOrNull = (fd: FormData, k: string) => {
  const s = String(fd.get(k) ?? "").trim();
  if (s === "") return null;
  const n = Number(s.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
};

export async function actualizarProducto(fd: FormData) {
  const id = Number(fd.get("id"));
  if (!id) throw new Error("Producto inválido");
  const proveedor = String(fd.get("proveedor") ?? "").trim() || "Argollas";
  const kilates = String(fd.get("kilates") ?? "").trim() || null;
  const supabase = await createClient();
  const { error } = await supabase.from("products").update({
    category: String(fd.get("category") ?? "").trim() || null,
    kilates,
    grams: numOrNull(fd, "grams"),
    cost_fixed: numOrNull(fd, "cost_fixed") ?? 0,
    proveedor,
    insumo_pieza: numOrNull(fd, "insumo_pieza") ?? 32,
    stock_casa: Math.round(numOrNull(fd, "stock_casa") ?? 0),
    stock_amazon: Math.round(numOrNull(fd, "stock_amazon") ?? 0),
    active: fd.get("active") === "on",
  }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/productos");
  revalidatePath("/reporte");
  revalidatePath("/pedido");
  redirect(`/productos?ok=${id}`);
}

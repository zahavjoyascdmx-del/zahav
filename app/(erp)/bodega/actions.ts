"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const revalidar = () => { for (const p of ["/bodega", "/pedido", "/reporte", "/productos", "/stock"]) revalidatePath(p); };

/** Guarda el stock en bodega de todas las tallas de un producto. Campos: casa__<variant_id>, amazon. */
export async function guardarBodega(fd: FormData) {
  const productId = Number(fd.get("product_id"));
  if (!productId) throw new Error("Producto inválido");
  const filas: { variant_id: number; casa: number; updated_at: string }[] = [];
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("casa__")) continue;
    const id = Number(k.slice(6));
    const casa = Math.max(0, Math.round(Number(String(v).replace(/[^0-9]/g, "")) || 0));
    if (id) filas.push({ variant_id: id, casa, updated_at: new Date().toISOString() });
  }
  const supabase = await createClient();
  if (filas.length) {
    const { error } = await supabase.from("stock_bodega").upsert(filas, { onConflict: "variant_id" });
    if (error) throw new Error(error.message);
  }
  if (fd.has("amazon")) {
    const amazon = Math.max(0, Math.round(Number(String(fd.get("amazon")).replace(/[^0-9]/g, "")) || 0));
    const { error } = await supabase.from("products").update({ stock_amazon: amazon }).eq("id", productId);
    if (error) throw new Error(error.message);
  }
  revalidar();
  redirect(`/bodega?ok=${productId}#p${productId}`);
}

/** Agrega una talla/color que no existe todavía como variante, con su stock en bodega. */
export async function agregarTalla(fd: FormData) {
  const productId = Number(fd.get("product_id"));
  const color = String(fd.get("color") ?? "").trim();
  const talla = String(fd.get("talla") ?? "").trim().replace(",", ".");
  const casa = Math.max(0, Math.round(Number(fd.get("casa")) || 0));
  if (!productId) throw new Error("Producto inválido");
  const supabase = await createClient();
  const { data, error } = await supabase.from("variants").upsert({ product_id: productId, color, talla }, { onConflict: "product_id,color,talla" }).select("id").single();
  if (error) throw new Error(error.message);
  const up = await supabase.from("stock_bodega").upsert({ variant_id: data.id, casa, updated_at: new Date().toISOString() }, { onConflict: "variant_id" });
  if (up.error) throw new Error(up.error.message);
  revalidar();
  redirect(`/bodega?ok=${productId}#p${productId}`);
}

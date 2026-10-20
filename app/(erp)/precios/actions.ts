"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Marca un producto (o un color de un producto) como liquidación: se le pide el margen de liquidación en vez del general. */
export async function agregarLiquidacion(fd: FormData) {
  const productId = Number(fd.get("product_id"));
  const color = String(fd.get("color") ?? "").trim() || null;
  const nota = String(fd.get("nota") ?? "").trim() || null;
  if (!productId) redirect("/precios?error=" + encodeURIComponent("Elige un producto."));
  const supabase = await createClient();
  const { error } = await supabase.from("liquidaciones").upsert({ product_id: productId, color, nota }, { onConflict: "product_id,color" });
  if (error) redirect("/precios?error=" + encodeURIComponent(error.message));
  revalidatePath("/precios");
  redirect("/precios?ok=1");
}

export async function quitarLiquidacion(fd: FormData) {
  const id = Number(fd.get("id"));
  const supabase = await createClient();
  const { error } = await supabase.from("liquidaciones").delete().eq("id", id);
  if (error) redirect("/precios?error=" + encodeURIComponent(error.message));
  revalidatePath("/precios");
  redirect("/precios?ok=1");
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Guarda la comisión actual de cada tipo de publicación como ya revisada; el aviso vuelve solo si ML la cambia otra vez. */
export async function marcarComisionesRevisadas(fd: FormData) {
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("value").eq("key", "ml_comisiones_conocidas").maybeSingle();
  const conocidas: Record<string, number> = { ...((data?.value as Record<string, number> | null) ?? {}) };
  for (const tipo of ["gold_pro", "gold_special"]) {
    const pct = Number(fd.get(tipo));
    if (pct > 0) conocidas[tipo] = pct;
  }
  const { error } = await supabase.from("settings").upsert({ key: "ml_comisiones_conocidas", value: conocidas, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/publicaciones");
}

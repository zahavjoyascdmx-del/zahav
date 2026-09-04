"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function guardarNegocio(fd: FormData) {
  const v = (k: string) => String(fd.get(k) ?? "").trim();
  const supabase = await createClient();
  await supabase.from("settings").upsert({
    key: "negocio",
    value: { nombre: v("nombre"), ciudad: v("ciudad"), telefono: v("telefono"), whatsapp: v("whatsapp"), instagram: v("instagram"), correo: v("correo"), leyenda: v("leyenda") },
    updated_at: new Date().toISOString(),
  });
  await supabase.from("settings").upsert({
    key: "gold_price",
    value: { "10k": Number(v("oro_10k")) || 0, "14k": Number(v("oro_14k")) || 0 },
    updated_at: new Date().toISOString(),
  });
  revalidatePath("/config");
  redirect("/config?ok=1");
}

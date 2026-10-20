"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function guardarNegocio(fd: FormData) {
  const v = (k: string) => String(fd.get(k) ?? "").trim();
  const n = (k: string) => Number(v(k).replace(/[^0-9.]/g, "")) || 0;
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from("settings").upsert([
    {
      key: "negocio",
      value: { nombre: v("nombre"), ciudad: v("ciudad"), telefono: v("telefono"), whatsapp: v("whatsapp"), instagram: v("instagram"), correo: v("correo"), leyenda: v("leyenda") },
      updated_at: now,
    },
    { key: "gastos_fijos", value: { contabilidad: n("contabilidad"), intereses: n("intereses"), publicidad: n("publicidad") }, updated_at: now },
    { key: "presupuesto", value: { pct_recibido: n("pct_recibido") || 60, fijo: n("presupuesto_fijo") }, updated_at: now },
    { key: "lead_time_days", value: n("lead_time_days") || 30, updated_at: now },
    { key: "buffer_days", value: n("buffer_days") || 30, updated_at: now },
    { key: "margen_objetivo", value: { valor: Number(v("margen_objetivo").replace(",", ".")) || 1.8 }, updated_at: now },
    { key: "margen_liquidacion", value: { valor: Number(v("margen_liquidacion").replace(",", ".")) || 1.15 }, updated_at: now },
    { key: "utilidad_minima_pz", value: { valor: n("utilidad_minima_pz") || 1500 }, updated_at: now },
    { key: "liquidacion_dias", value: { valor: n("liquidacion_dias") || 60 }, updated_at: now },
    { key: "liquidacion_pct", value: { valor: n("liquidacion_pct") || 10 }, updated_at: now },
  ]);
  if (error) throw new Error(error.message);
  revalidatePath("/config");
  revalidatePath("/reporte");
  revalidatePath("/pedido");
  revalidatePath("/precios");
  redirect("/config?ok=1");
}

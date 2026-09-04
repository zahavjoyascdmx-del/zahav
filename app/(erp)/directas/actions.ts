"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const str = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
};
const num = (fd: FormData, k: string) => Number(String(fd.get(k) ?? "0").replace(/[^0-9.-]/g, "")) || 0;

export async function crearVentaDirecta(fd: FormData) {
  const supabase = await createClient();
  const productId = str(fd, "product_id");
  const { error } = await supabase.from("direct_sales").insert({
    fecha: str(fd, "fecha") ?? undefined,
    canal: str(fd, "canal") ?? "directa",
    cliente: str(fd, "cliente") ?? "Sin nombre",
    telefono: str(fd, "telefono"),
    product_id: productId ? Number(productId) : null,
    descripcion: str(fd, "descripcion"),
    talla: str(fd, "talla"),
    kilates: str(fd, "kilates"),
    color: str(fd, "color"),
    piedra: str(fd, "piedra"),
    precio_total: num(fd, "precio_total"),
    pagado: num(fd, "pagado"),
    entrega_estimada: str(fd, "entrega_estimada"),
    estado: num(fd, "pagado") > 0 ? "anticipo" : "cotizacion",
    notas: str(fd, "notas"),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/directas");
}

export async function registrarPago(fd: FormData) {
  const id = Number(fd.get("id"));
  const monto = num(fd, "monto");
  if (!id || !monto) return;
  const supabase = await createClient();
  const { data } = await supabase.from("direct_sales").select("pagado,precio_total,estado").eq("id", id).single();
  if (!data) return;
  const pagado = Number(data.pagado) + monto;
  const estado = data.estado === "cotizacion" ? "anticipo" : data.estado;
  const { error } = await supabase.from("direct_sales").update({ pagado, estado }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/directas");
}

export async function cambiarEstado(fd: FormData) {
  const id = Number(fd.get("id"));
  const estado = str(fd, "estado");
  if (!id || !estado) return;
  const supabase = await createClient();
  const { error } = await supabase.from("direct_sales").update({ estado }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/directas");
}

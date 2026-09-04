"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const str = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
};
const num = (fd: FormData, k: string) => Number(String(fd.get(k) ?? "0").replace(/[^0-9.-]/g, "")) || 0;

function camposVenta(fd: FormData) {
  const productId = str(fd, "product_id");
  return {
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
    entrega_estimada: str(fd, "entrega_estimada"),
    notas: str(fd, "notas"),
  };
}

export async function crearVentaDirecta(fd: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("direct_sales").insert(camposVenta(fd)).select("id").single();
  if (error) throw new Error(error.message);
  const anticipo = num(fd, "pagado");
  if (anticipo > 0) {
    await supabase.from("direct_sale_payments").insert({ sale_id: data.id, monto: anticipo, metodo: str(fd, "metodo") ?? "transferencia", nota: "Anticipo" });
  }
  revalidatePath("/directas");
  redirect(`/directas/${data.id}`);
}

export async function actualizarVenta(fd: FormData) {
  const id = Number(fd.get("id"));
  const supabase = await createClient();
  const { error } = await supabase.from("direct_sales").update(camposVenta(fd)).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/directas/${id}`);
  revalidatePath("/directas");
  redirect(`/directas/${id}?ok=guardado`);
}

export async function agregarPago(fd: FormData) {
  const id = Number(fd.get("id"));
  const monto = num(fd, "monto");
  if (!id || monto <= 0) redirect(`/directas/${id}?error=monto`);
  const supabase = await createClient();
  const { error } = await supabase.from("direct_sale_payments").insert({
    sale_id: id, monto, fecha: str(fd, "fecha") ?? undefined, metodo: str(fd, "metodo") ?? "transferencia", nota: str(fd, "nota"),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/directas/${id}`);
  revalidatePath("/directas");
  redirect(`/directas/${id}?ok=pago`);
}

export async function eliminarPago(fd: FormData) {
  const id = Number(fd.get("id"));
  const pagoId = Number(fd.get("pago_id"));
  const supabase = await createClient();
  await supabase.from("direct_sale_payments").delete().eq("id", pagoId).eq("sale_id", id);
  revalidatePath(`/directas/${id}`);
  revalidatePath("/directas");
  redirect(`/directas/${id}`);
}

export async function cambiarEstado(fd: FormData) {
  const id = Number(fd.get("id"));
  const estado = str(fd, "estado");
  if (!id || !estado) return;
  const supabase = await createClient();
  const { error } = await supabase.from("direct_sales").update({ estado }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/directas/${id}`);
  revalidatePath("/directas");
  redirect(`/directas/${id}?ok=estado`);
}

export async function eliminarVenta(fd: FormData) {
  const id = Number(fd.get("id"));
  const supabase = await createClient();
  await supabase.from("direct_sales").delete().eq("id", id);
  revalidatePath("/directas");
  redirect("/directas");
}

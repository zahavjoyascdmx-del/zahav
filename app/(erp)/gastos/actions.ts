"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayCdmx } from "@/lib/format";

const str = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
};
const num = (fd: FormData, k: string) => Number(String(fd.get(k) ?? "0").replace(/[^0-9.]/g, "")) || 0;
const fecha = (fd: FormData) => {
  const f = str(fd, "fecha");
  return f && /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : todayCdmx();
};

function refrescar(proveedorId?: number) {
  revalidatePath("/gastos");
  revalidatePath("/reporte");
  if (proveedorId) revalidatePath(`/gastos/proveedor/${proveedorId}`);
}

// ------------------------------------------------------------------ gastos de operación

export async function agregarGasto(fd: FormData) {
  const f = fecha(fd);
  const mes = f.slice(0, 8) + "01";
  const concepto = str(fd, "concepto");
  const monto = num(fd, "monto");
  if (!concepto || !(monto > 0)) redirect(`/gastos?mes=${mes}&error=gasto`);
  const supabase = await createClient();
  const { error } = await supabase.from("gastos_mensuales").insert({
    mes, fecha: f, categoria: str(fd, "categoria") ?? "otro", concepto, monto, metodo: str(fd, "metodo"), nota: str(fd, "nota"),
  });
  if (error) throw new Error(error.message);
  refrescar();
  redirect(`/gastos?mes=${mes}&ok=gasto`);
}

export async function borrarGasto(fd: FormData) {
  const id = Number(fd.get("id"));
  const mes = String(fd.get("mes") ?? "").slice(0, 10);
  const supabase = await createClient();
  await supabase.from("gastos_mensuales").delete().eq("id", id);
  refrescar();
  redirect(`/gastos?mes=${mes}`);
}

// ------------------------------------------------------------------ proveedores

function camposProveedor(fd: FormData) {
  return { nombre: str(fd, "nombre") ?? "Sin nombre", contacto: str(fd, "contacto"), telefono: str(fd, "telefono"), notas: str(fd, "notas") };
}

export async function crearProveedor(fd: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("proveedores").insert(camposProveedor(fd)).select("id").single();
  if (error) redirect(`/gastos?error=${error.code === "23505" ? "duplicado" : "proveedor"}#proveedores`);
  refrescar();
  redirect(`/gastos/proveedor/${data.id}`);
}

export async function actualizarProveedor(fd: FormData) {
  const id = Number(fd.get("id"));
  const supabase = await createClient();
  const { error } = await supabase.from("proveedores").update({ ...camposProveedor(fd), activo: fd.get("activo") === "on" }).eq("id", id);
  if (error) redirect(`/gastos/proveedor/${id}?error=${error.code === "23505" ? "duplicado" : "guardar"}`);
  refrescar(id);
  redirect(`/gastos/proveedor/${id}?ok=guardado`);
}

export async function eliminarProveedor(fd: FormData) {
  const id = Number(fd.get("id"));
  const supabase = await createClient();
  await supabase.from("proveedores").delete().eq("id", id);
  refrescar();
  redirect("/gastos#proveedores");
}

/** Compra a crédito (aumenta la deuda) o pago/abono (la reduce). */
export async function agregarMovimiento(fd: FormData) {
  const proveedorId = Number(fd.get("proveedor_id"));
  const tipo = fd.get("tipo") === "pago" ? "pago" : "compra";
  const monto = num(fd, "monto");
  const volver = str(fd, "volver") === "lista" ? "/gastos" : `/gastos/proveedor/${proveedorId}`;
  if (!proveedorId || !(monto > 0)) redirect(`${volver}?error=monto`);
  const supabase = await createClient();
  const { error } = await supabase.from("proveedor_movimientos").insert({
    proveedor_id: proveedorId, tipo, fecha: fecha(fd), monto, concepto: str(fd, "concepto"),
    vence: tipo === "compra" ? str(fd, "vence") : null, metodo: tipo === "pago" ? str(fd, "metodo") : null, nota: str(fd, "nota"),
  });
  if (error) throw new Error(error.message);
  refrescar(proveedorId);
  redirect(`${volver}?ok=${tipo}`);
}

export async function borrarMovimiento(fd: FormData) {
  const id = Number(fd.get("id"));
  const proveedorId = Number(fd.get("proveedor_id"));
  const supabase = await createClient();
  await supabase.from("proveedor_movimientos").delete().eq("id", id).eq("proveedor_id", proveedorId);
  refrescar(proveedorId);
  redirect(`/gastos/proveedor/${proveedorId}`);
}

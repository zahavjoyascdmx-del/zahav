export const ESTADOS: Record<string, { label: string; cls: string }> = {
  cotizacion: { label: "Cotización", cls: "neutral" },
  anticipo: { label: "Con anticipo", cls: "warn" },
  produccion: { label: "En producción", cls: "warn" },
  lista: { label: "Lista para entregar", cls: "ok" },
  entregada: { label: "Entregada", cls: "ok" },
  cancelada: { label: "Cancelada", cls: "bad" },
};
export const CANALES = ["directa", "whatsapp", "instagram", "facebook", "amazon", "mostrador", "otro"];
export const METODOS = ["transferencia", "efectivo", "tarjeta", "mercado pago", "otro"];
export const folio = (id: number) => `ZV-${String(id).padStart(4, "0")}`;
export const folioRecibo = (id: number) => `R-${String(id).padStart(4, "0")}`;

export type Venta = {
  id: number; fecha: string; canal: string; cliente: string; telefono: string | null; product_id: number | null; descripcion: string | null;
  talla: string | null; kilates: string | null; color: string | null; piedra: string | null;
  precio_total: number; pagado: number; entrega_estimada: string | null; estado: string; notas: string | null;
  share_token: string; products: { name: string } | null;
};
export type Pago = { id: number; sale_id: number; fecha: string; monto: number; metodo: string; nota: string | null; share_token: string };

/** Enlace de WhatsApp con mensaje prellenado (México). */
export function whatsappUrl(telefono: string | null | undefined, texto: string) {
  const digits = (telefono ?? "").replace(/\D/g, "");
  const num = digits.length === 10 ? "52" + digits : digits;
  return `https://wa.me/${num}?text=${encodeURIComponent(texto)}`;
}
export type Negocio = { nombre: string; ciudad: string; telefono: string; whatsapp: string; instagram: string; correo: string; leyenda: string };

export const piezaTexto = (v: Venta) => v.products?.name ?? v.descripcion ?? "Pieza";
export const detalleTexto = (v: Venta) => [v.kilates, v.color && `oro ${v.color.toLowerCase()}`, v.talla && `talla ${v.talla}`, v.piedra].filter(Boolean).join(" · ");

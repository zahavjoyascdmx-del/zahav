export const CATEGORIAS: Record<string, string> = {
  empaque: "Empaque y cajas",
  envios: "Envíos y mensajería",
  sueldos: "Sueldos y comisiones",
  renta: "Renta y servicios",
  publicidad: "Publicidad",
  software: "Software y suscripciones",
  bancos: "Comisiones bancarias",
  impuestos: "Impuestos y contabilidad",
  herramienta: "Herramienta y taller",
  otro: "Otro",
};
export const categoriaLabel = (k: string) => CATEGORIAS[k] ?? k;

export type Gasto = { id: number; mes: string; fecha: string | null; categoria: string; concepto: string; monto: number; metodo: string | null; nota: string | null };
export type Proveedor = { id: number; nombre: string; contacto: string | null; telefono: string | null; notas: string | null; activo: boolean };
export type Movimiento = {
  id: number; proveedor_id: number; tipo: "compra" | "pago"; fecha: string; concepto: string | null; monto: number;
  vence: string | null; metodo: string | null; nota: string | null;
};
export type EstadoCuenta = {
  compras: number; pagos: number; saldo: number; vencido: number; proximoVence: string | null;
  /** Lo que falta pagar de cada compra, aplicando los pagos a las compras más antiguas primero. */
  pendientes: Map<number, number>;
};

/** Saldo con un proveedor: compras − pagos. Los pagos liquidan primero las compras más antiguas (PEPS). */
export function estadoCuenta(movs: Movimiento[], hoy: string): EstadoCuenta {
  const compras = movs.filter((m) => m.tipo === "compra").sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id);
  const totalCompras = compras.reduce((a, m) => a + Number(m.monto), 0);
  const totalPagos = movs.filter((m) => m.tipo === "pago").reduce((a, m) => a + Number(m.monto), 0);
  let porAplicar = totalPagos;
  let vencido = 0;
  let proximoVence: string | null = null;
  const pendientes = new Map<number, number>();
  for (const c of compras) {
    const aplicado = Math.min(porAplicar, Number(c.monto));
    porAplicar -= aplicado;
    const falta = Number(c.monto) - aplicado;
    if (falta <= 0.005) continue;
    pendientes.set(c.id, falta);
    if (c.vence && c.vence < hoy) vencido += falta;
    else if (c.vence && (!proximoVence || c.vence < proximoVence)) proximoVence = c.vence;
  }
  return { compras: totalCompras, pagos: totalPagos, saldo: totalCompras - totalPagos, vencido, proximoVence, pendientes };
}

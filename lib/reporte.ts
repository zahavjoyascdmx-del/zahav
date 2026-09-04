/** Lógica del reporte mensual (réplica del Excel) y del pedido sugerido. Sin acceso a datos: solo cálculos. */

export type FilaReporte = {
  product_id: number; producto: string; categoria: string | null; proveedor: string; kilates: string | null; grams: number | null;
  cost_fixed: number | null; insumo_pieza: number; activo: boolean; sort_order: number;
  precio_oro: number | null; precio_oro_mes: string | null;
  piezas: number; ordenes: number; venta: number; comision: number; envio: number; ret_iva: number; ret_isr: number; cupon: number;
  recibido: number; ordenes_sin_pago: number; dias_con_venta: number;
  stock_full: number; stock_transito: number; stock_casa: number; stock_amazon: number; variantes_activas: number; agotadas: number;
  dias_snapshot: number; pct_dias_agotado: number | null;
  /** Gasto de Product Ads del mes atribuido al producto (se rellena desde publicidad_mes). */
  publicidad?: number;
};

export type FilaCalculada = FilaReporte & {
  costo_unitario: number; precio_sugerido: number; gastos: number; insumos: number; publicidad: number; utilidad_bruta: number; utilidad_neta: number;
  roi: number | null; margen: number | null; recibido_pieza: number | null; stock_total: number; valor_stock: number;
  oro_es_estimado: boolean; sin_costo: boolean;
};

export const MARGEN_SUGERIDO = 1.4; // precio sugerido = costo × 1.4, igual que el Excel

const n = (v: unknown) => Number(v ?? 0) || 0;

export function calcularFila(r: FilaReporte, mes: string): FilaCalculada {
  const grams = r.grams == null ? null : n(r.grams);
  const oro = r.precio_oro == null ? null : n(r.precio_oro);
  const costoOro = grams != null && oro != null ? grams * oro : 0;
  const costo = costoOro + n(r.cost_fixed);
  const sin_costo = costo <= 0;
  const piezas = n(r.piezas);
  const gastos = costo * piezas;
  const insumos = n(r.insumo_pieza) * piezas;
  const recibido = n(r.recibido);
  const publicidad = n(r.publicidad);
  const utilidad_bruta = recibido - gastos;
  const utilidad_neta = utilidad_bruta - insumos - publicidad;
  const stock_total = n(r.stock_full) + n(r.stock_transito) + n(r.stock_casa) + n(r.stock_amazon);
  return {
    ...r,
    piezas, recibido,
    costo_unitario: costo,
    precio_sugerido: costo * MARGEN_SUGERIDO,
    gastos, insumos, publicidad, utilidad_bruta, utilidad_neta,
    roi: gastos > 0 ? utilidad_neta / gastos : null,
    margen: n(r.venta) > 0 ? utilidad_neta / n(r.venta) : null,
    recibido_pieza: piezas > 0 ? recibido / piezas : null,
    stock_total,
    valor_stock: costo * stock_total,
    oro_es_estimado: grams != null && (r.precio_oro_mes == null || r.precio_oro_mes.slice(0, 7) !== mes.slice(0, 7)),
    sin_costo,
  };
}

/** Recalcula ROI, margen y recibido por pieza tras sumar varios meses en una misma fila. */
export function recalcularIndicadores(f: FilaCalculada): FilaCalculada {
  return {
    ...f,
    roi: f.gastos > 0 ? f.utilidad_neta / f.gastos : null,
    margen: n(f.venta) > 0 ? f.utilidad_neta / n(f.venta) : null,
    recibido_pieza: f.piezas > 0 ? f.recibido / f.piezas : null,
  };
}

export type Totales = {
  piezas: number; venta: number; comision: number; envio: number; impuestos: number; cupon: number; recibido: number;
  gastos: number; insumos: number; publicidad: number; utilidad_bruta: number; utilidad_neta: number; valor_stock: number; stock_total: number; ordenes_sin_pago: number;
};

export function totales(filas: FilaCalculada[]): Totales {
  const t: Totales = { piezas: 0, venta: 0, comision: 0, envio: 0, impuestos: 0, cupon: 0, recibido: 0, gastos: 0, insumos: 0, publicidad: 0, utilidad_bruta: 0, utilidad_neta: 0, valor_stock: 0, stock_total: 0, ordenes_sin_pago: 0 };
  for (const f of filas) {
    t.piezas += f.piezas; t.venta += n(f.venta); t.comision += n(f.comision); t.envio += n(f.envio);
    t.impuestos += n(f.ret_iva) + n(f.ret_isr); t.cupon += n(f.cupon); t.recibido += f.recibido;
    t.gastos += f.gastos; t.insumos += f.insumos; t.publicidad += f.publicidad; t.utilidad_bruta += f.utilidad_bruta; t.utilidad_neta += f.utilidad_neta;
    t.valor_stock += f.valor_stock; t.stock_total += f.stock_total; t.ordenes_sin_pago += n(f.ordenes_sin_pago);
  }
  return t;
}

/** Orden de las secciones, como en el Excel: 10k, 14k, plata, diamante, Bogos. */
export const ORDEN_PROVEEDOR = ["Argollas", "Anillos", "Bogos", "Diamante", "Plata"];
export function ordenSeccion(proveedor: string, kilates: string | null) {
  const i = ORDEN_PROVEEDOR.indexOf(proveedor);
  return (i < 0 ? 99 : i) * 10 + (kilates === "10k" ? 0 : kilates === "14k" ? 1 : 2);
}
export const tituloSeccion = (proveedor: string, kilates: string | null) =>
  proveedor === "Plata" ? "Plata / moissanita" : kilates ? `${proveedor} · oro ${kilates}` : proveedor;

export type Meses = { mes: string; label: string }[];
/** Últimos `cuantos` meses (YYYY-MM-01) hasta el mes de `hoy`, más reciente primero. */
export function listaMeses(hoy: string, cuantos = 12): Meses {
  const out: Meses = [];
  const [y, m] = [Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7))];
  for (let i = 0; i < cuantos; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const mes = d.toISOString().slice(0, 10);
    out.push({ mes, label: nombreMes(mes) });
  }
  return out;
}
export function nombreMes(mes: string) {
  const d = new Date(mes.slice(0, 10) + "T12:00:00Z");
  const s = d.toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export function mesSiguiente(mes: string) {
  const d = new Date(mes.slice(0, 10) + "T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 8) + "01";
}
export function mesAnterior(mes: string) {
  const d = new Date(mes.slice(0, 10) + "T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 8) + "01";
}

// ------------------------------------------------------------------ pedido sugerido

export type VarianteVenta = {
  product_id: number; variant_id: number | null; color: string; talla: string; piezas: number; venta: number; ultima_venta: string | null;
  dias_con_venta: number; available: number | null; in_transit: number | null; en_full: boolean; activa: boolean; dias_snapshot: number; dias_agotado: number; casa: number;
};

export type VarianteSugerida = VarianteVenta & {
  ritmo_obs: number; ritmo: number; dias_sin_stock: number; objetivo: number; faltan: number; sugerido: number; agotada: boolean; mandar_a_full: boolean;
};

export type ProductoSugerido = {
  fila: FilaCalculada;
  variantes: VarianteSugerida[];
  ritmo_obs: number;        // piezas por día observadas en el periodo
  ritmo: number;            // piezas por día corregidas por días sin stock
  demanda_bloqueada: number; // % de la demanda del periodo que hoy está en tallas agotadas
  cobertura_dias: number | null; // días que alcanza el stock actual al ritmo corregido
  objetivo: number; faltan: number; sugerido: number; costo_pedido: number;
  utilidad_pieza: number; utilidad_esperada: number; score: number;
  motivo: string;
};

export type ParametrosPedido = { dias: number; hoy: string; cobertura: number; presupuesto: number };

const diasEntre = (a: string, b: string) => Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86400000);

/**
 * Estima cuántos días de `dias` estuvo sin stock una variante.
 * Con fotos diarias de Full en el periodo se usan tal cual; si no hay, y hoy está en cero,
 * se asume que lleva agotada desde su última venta (cota superior razonable).
 */
function diasSinStock(v: VarianteVenta, p: ParametrosPedido) {
  if (!v.en_full || !v.activa) return 0;
  if (v.dias_snapshot >= 14) return Math.round((v.dias_agotado / v.dias_snapshot) * p.dias);
  if ((v.available ?? 0) > 0) return 0;
  if (!v.ultima_venta) return p.dias; // nunca vendió y está en cero: no hay señal de demanda
  return Math.min(p.dias, Math.max(0, diasEntre(v.ultima_venta, p.hoy)));
}

export function sugerirPedido(filas: FilaCalculada[], variantes: VarianteVenta[], p: ParametrosPedido): { productos: ProductoSugerido[]; excluidos: ProductoSugerido[]; total: number; utilidad: number } {
  const porProducto = new Map<number, VarianteVenta[]>();
  for (const v of variantes) porProducto.set(v.product_id, [...(porProducto.get(v.product_id) ?? []), v]);

  const productos: ProductoSugerido[] = [];
  for (const fila of filas) {
    const vars = porProducto.get(fila.product_id) ?? [];
    const piezasPeriodo = vars.reduce((a, v) => a + n(v.piezas), 0);
    const ritmo_obs = piezasPeriodo / p.dias;

    const calc: VarianteSugerida[] = vars.map((v) => {
      const sin = diasSinStock(v, p);
      const conStock = Math.max(p.dias - sin, p.dias / 3); // nunca inflar más de 3×
      const ritmoV = n(v.piezas) > 0 ? n(v.piezas) / conStock : 0;
      const agotada = v.en_full && v.activa && (v.available ?? 0) === 0;
      const objetivo = Math.round(ritmoV * p.cobertura); // menos de media pieza en el periodo objetivo: no se repone
      const disponible = n(v.available) + n(v.in_transit) + n(v.casa); // lo de bodega también cubre la demanda
      const faltan = Math.max(0, objetivo - disponible);
      return { ...v, ritmo_obs: n(v.piezas) / p.dias, ritmo: ritmoV, dias_sin_stock: sin, objetivo, faltan, sugerido: 0, agotada, mandar_a_full: agotada && n(v.casa) > 0 };
    });

    const ritmo = calc.reduce((a, v) => a + v.ritmo, 0);
    const bloqueada = piezasPeriodo > 0 ? calc.filter((v) => v.agotada).reduce((a, v) => a + n(v.piezas), 0) / piezasPeriodo : 0;
    const stockTotal = fila.stock_full + fila.stock_transito + fila.stock_casa + fila.stock_amazon;
    const objetivo = Math.round(ritmo * p.cobertura);
    // Amazon no se conoce por talla: se descuenta del faltante total del producto
    const faltanVariantes = calc.reduce((a, v) => a + v.faltan, 0);
    const faltan = Math.max(0, Math.min(faltanVariantes, objetivo - stockTotal));
    const utilidad_pieza = fila.piezas > 0 ? fila.utilidad_neta / fila.piezas : fila.precio_sugerido > 0 ? fila.precio_sugerido * 0.72 - fila.costo_unitario - n(fila.insumo_pieza) : 0;

    let motivo = "";
    if (fila.sin_costo) motivo = "Sin costo: captura gramaje o costo fijo en Catálogo.";
    else if (ritmo <= 0) motivo = "Sin ventas en el periodo.";
    else if (piezasPeriodo < 2) motivo = "Ventas muy esporádicas (1 pieza en el periodo): no se sugiere reponer.";
    else if (objetivo <= 0) motivo = "Vende muy poco: no llega a una pieza en el periodo objetivo.";
    else if (utilidad_pieza <= 0) motivo = "Deja pérdida por pieza: no conviene reponer hasta subir precio.";
    else if (faltan <= 0) motivo = `Stock suficiente para ${Math.round(stockTotal / ritmo)} días.`;

    productos.push({
      fila, variantes: calc, ritmo_obs, ritmo, demanda_bloqueada: bloqueada,
      cobertura_dias: ritmo > 0 ? stockTotal / ritmo : null,
      objetivo, faltan, sugerido: 0, costo_pedido: 0, utilidad_pieza,
      utilidad_esperada: 0,
      score: utilidad_pieza > 0 ? utilidad_pieza * ritmo : 0, // utilidad diaria en juego
      motivo,
    });
  }

  // Reparto del presupuesto: primero lo que más utilidad diaria deja y está por agotarse.
  const candidatos = productos.filter((x) => !x.motivo).sort((a, b) => b.score - a.score || (a.cobertura_dias ?? 0) - (b.cobertura_dias ?? 0));
  let restante = p.presupuesto;
  for (const x of candidatos) {
    const costo = x.fila.costo_unitario;
    const puede = Math.min(x.faltan, Math.floor(restante / costo));
    if (puede <= 0) { x.motivo = "No alcanza el presupuesto este mes."; continue; }
    x.sugerido = puede;
    x.costo_pedido = puede * costo;
    x.utilidad_esperada = puede * x.utilidad_pieza;
    restante -= x.costo_pedido;
    // Reparto por talla: primero agotadas, luego proporcional a lo que falta.
    let quedan = puede;
    const orden = x.variantes.filter((v) => v.faltan > 0).sort((a, b) => Number(b.agotada) - Number(a.agotada) || b.ritmo - a.ritmo);
    const totalFaltan = orden.reduce((a, v) => a + v.faltan, 0) || 1;
    for (const v of orden) { v.sugerido = Math.min(v.faltan, Math.floor((v.faltan / totalFaltan) * puede)); quedan -= v.sugerido; }
    for (const v of orden) { if (quedan <= 0) break; if (v.sugerido < v.faltan) { v.sugerido++; quedan--; } }
  }
  const conPedido = productos.filter((x) => x.sugerido > 0).sort((a, b) => b.score - a.score);
  const excluidos = productos.filter((x) => x.sugerido === 0).sort((a, b) => b.fila.venta - a.fila.venta);
  return {
    productos: conPedido,
    excluidos,
    total: conPedido.reduce((a, x) => a + x.costo_pedido, 0),
    utilidad: conPedido.reduce((a, x) => a + x.utilidad_esperada, 0),
  };
}

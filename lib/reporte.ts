/** Lógica del reporte mensual (réplica del Excel) y del pedido sugerido. Sin acceso a datos: solo cálculos. */

export type FilaReporte = {
  product_id: number; producto: string; categoria: string | null; proveedor: string; kilates: string | null; grams: number | null;
  cost_fixed: number | null; insumo_pieza: number; activo: boolean; sort_order: number;
  precio_oro: number | null; precio_oro_mes: string | null;
  piezas: number; ordenes: number; venta: number; comision: number; envio: number; ret_iva: number; ret_isr: number; cupon: number;
  recibido: number; ordenes_sin_pago: number; dias_con_venta: number;
  stock_full: number; stock_transito: number; stock_casa: number; stock_amazon: number; variantes_activas: number; agotadas: number;
  dias_snapshot: number; pct_dias_agotado: number | null;
  piezas_reventa?: number; venta_reventa?: number; ordenes_estimadas?: number;
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
  piezas_reventa: number; venta_reventa: number;
};

export function totales(filas: FilaCalculada[]): Totales {
  const t: Totales = { piezas: 0, venta: 0, comision: 0, envio: 0, impuestos: 0, cupon: 0, recibido: 0, gastos: 0, insumos: 0, publicidad: 0, utilidad_bruta: 0, utilidad_neta: 0, valor_stock: 0, stock_total: 0, ordenes_sin_pago: 0, piezas_reventa: 0, venta_reventa: 0 };
  for (const f of filas) {
    t.piezas += f.piezas; t.venta += n(f.venta); t.comision += n(f.comision); t.envio += n(f.envio);
    t.impuestos += n(f.ret_iva) + n(f.ret_isr); t.cupon += n(f.cupon); t.recibido += f.recibido;
    t.gastos += f.gastos; t.insumos += f.insumos; t.publicidad += f.publicidad; t.utilidad_bruta += f.utilidad_bruta; t.utilidad_neta += f.utilidad_neta;
    t.valor_stock += f.valor_stock; t.stock_total += f.stock_total; t.ordenes_sin_pago += n(f.ordenes_sin_pago);
    t.piezas_reventa += n(f.piezas_reventa); t.venta_reventa += n(f.venta_reventa);
  }
  return t;
}

/** Orden de las secciones, como en el Excel: 10k, 14k, plata, diamante, Bogos. */
export const ORDEN_PROVEEDOR = ["Argollas", "Dinasti", "Bogos", "Fabricación propia", "China"];
export function ordenSeccion(proveedor: string, kilates: string | null) {
  const i = ORDEN_PROVEEDOR.indexOf(proveedor);
  return (i < 0 ? 99 : i) * 10 + (kilates === "10k" ? 0 : kilates === "14k" ? 1 : 2);
}
export const tituloSeccion = (proveedor: string, kilates: string | null) =>
  proveedor === "China" ? "Plata / moissanita (China)" : kilates ? `${proveedor} · oro ${kilates}` : proveedor;

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
  top_seller: boolean; // su color es top seller del producto: cubre COBERTURA_TOP días y recibe presupuesto primero
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
  top_seller: boolean;      // tiene al menos un color entre los más vendidos
  colores_top: string[];    // colores top seller del producto (p. ej. solo Amarillo); los demás colores van como cualquier producto
  motivo: string;
};

/** Cuántos producto + color (los más vendidos en piezas) reciben presupuesto antes que los demás. */
export const TOP_SELLERS = 5;
/** Parte mínima de las piezas del producto que debe vender un color para contar como top seller. */
export const MIN_PARTE_COLOR_TOP = 0.25;
/** Días de venta que siempre se cubren en los top sellers. */
export const COBERTURA_TOP = 60;

export type ParametrosPedido = { dias: number; hoy: string; cobertura: number; presupuesto: number };

const diasEntre = (a: string, b: string) => Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86400000);
const sumarDias = (iso: string, d: number) => new Date(Date.parse(iso + "T00:00:00Z") + d * 86400000).toISOString().slice(0, 10);

// ------------------------------------------------------------------ temporadas

export type Temporada = { nombre: string; factor: number; desde: string; hasta: string };

/** Buen Fin: fechas oficiales cuando se conocen; si no, de viernes a lunes del puente de la Revolución (tercer lunes de noviembre). */
const BUEN_FIN: Record<number, [string, string]> = { 2024: ["2024-11-15", "2024-11-18"], 2025: ["2025-11-14", "2025-11-17"], 2026: ["2026-11-13", "2026-11-17"] };

/** Temporadas que mueven la venta en el año `y`. Se cambian aquí si cambian las fechas o el efecto. */
export function temporadasDelAnio(y: number): Temporada[] {
  const lunes = (mes: number, dia: number) => { const d = new Date(Date.UTC(y, mes - 1, dia)); return (8 - d.getUTCDay()) % 7; };
  const tercerLunesNov = 1 + lunes(11, 1) + 14;
  const buenFin = BUEN_FIN[y] ?? [`${y}-11-${String(tercerLunesNov - 3).padStart(2, "0")}`, `${y}-11-${String(tercerLunesNov).padStart(2, "0")}`];
  // Hot Sale: 9 días desde el último lunes de mayo
  const ultimoLunesMayo = 25 + lunes(5, 25);
  const hotSale = `${y}-05-${String(ultimoLunesMayo).padStart(2, "0")}`;
  return [
    { nombre: "14 de febrero", factor: 1.5, desde: `${y}-02-01`, hasta: `${y}-02-14` },
    { nombre: "Hot Sale", factor: 1.5, desde: hotSale, hasta: sumarDias(hotSale, 8) },
    { nombre: "Buen Fin", factor: 2, desde: buenFin[0], hasta: buenFin[1] },
  ];
}

/** Multiplicador de venta de un día (1 = día normal). */
export function factorDia(iso: string): number {
  return temporadasDelAnio(Number(iso.slice(0, 4))).reduce((f, t) => (iso >= t.desde && iso <= t.hasta ? Math.max(f, t.factor) : f), 1);
}

/** Días "normales" equivalentes de los `dias` que empiezan en `desde` (un día de Buen Fin cuenta como 2). */
export function diasEfectivos(desde: string, dias: number): number {
  let total = 0;
  for (let i = 0; i < dias; i++) total += factorDia(sumarDias(desde, i));
  return total;
}

/** Temporadas que caen (al menos un día) entre `desde` y `desde + dias - 1`. */
export function temporadasEn(desde: string, dias: number): Temporada[] {
  const hasta = sumarDias(desde, dias - 1);
  const anios = [...new Set([Number(desde.slice(0, 4)), Number(hasta.slice(0, 4))])];
  return anios.flatMap(temporadasDelAnio).filter((t) => t.hasta >= desde && t.desde <= hasta);
}

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

  // Top sellers por producto + color (la Argolla 3mm es top en Amarillo, no en Rosa ni Blanco):
  // esos colores cubren al menos COBERTURA_TOP días y reciben presupuesto primero.
  const elegibles = new Set(filas.filter((f) => !f.sin_costo && f.piezas > 0 && f.utilidad_neta > 0).map((f) => f.product_id));
  const piezasColor = new Map<string, number>();
  for (const v of variantes) if (elegibles.has(v.product_id)) { const k = `${v.product_id}|${v.color}`; piezasColor.set(k, (piezasColor.get(k) ?? 0) + n(v.piezas)); }
  const piezasProducto = new Map<number, number>();
  for (const [k, pz] of piezasColor) { const id = Number(k.split("|")[0]); piezasProducto.set(id, (piezasProducto.get(id) ?? 0) + pz); }
  // un color minoritario (p. ej. Rosa con 5% de las ventas) no es top aunque el producto lo sea
  const piezasTop = new Map([...piezasColor]
    .filter(([k, pz]) => pz > 0 && pz >= MIN_PARTE_COLOR_TOP * (piezasProducto.get(Number(k.split("|")[0])) ?? 0))
    .sort((a, b) => b[1] - a[1]).slice(0, TOP_SELLERS));
  const esTop = (v: VarianteVenta) => piezasTop.has(`${v.product_id}|${v.color}`);

  // Temporadas: el historial se lleva a días normales (si traía Buen Fin no infla el ritmo)
  // y la demanda por cubrir se multiplica en los días de temporada que vienen.
  const factorHistoria = diasEfectivos(sumarDias(p.hoy, -(p.dias - 1)), p.dias) / p.dias;
  const demandaDias = new Map<number, number>();
  const diasPorCubrir = (cob: number) => { if (!demandaDias.has(cob)) demandaDias.set(cob, diasEfectivos(sumarDias(p.hoy, 1), cob)); return demandaDias.get(cob)!; };

  const productos: ProductoSugerido[] = [];
  for (const fila of filas) {
    const vars = porProducto.get(fila.product_id) ?? [];
    const piezasPeriodo = vars.reduce((a, v) => a + n(v.piezas), 0);
    const ritmo_obs = piezasPeriodo / p.dias;
    const calc: VarianteSugerida[] = vars.map((v) => {
      const top = esTop(v);
      const diasDemanda = diasPorCubrir(top ? Math.max(p.cobertura, COBERTURA_TOP) : p.cobertura);
      const sin = diasSinStock(v, p);
      const conStock = Math.max(p.dias - sin, p.dias / 3); // nunca inflar más de 3×
      const ritmoV = n(v.piezas) > 0 ? n(v.piezas) / (conStock * factorHistoria) : 0;
      const agotada = v.en_full && v.activa && (v.available ?? 0) === 0;
      const objetivo = Math.round(ritmoV * diasDemanda); // menos de media pieza en el periodo objetivo: no se repone
      const disponible = n(v.available) + n(v.in_transit) + n(v.casa); // lo de bodega también cubre la demanda
      const faltan = Math.max(0, objetivo - disponible);
      return { ...v, ritmo_obs: n(v.piezas) / p.dias, ritmo: ritmoV, dias_sin_stock: sin, objetivo, faltan, sugerido: 0, agotada, mandar_a_full: agotada && n(v.casa) > 0, top_seller: top };
    });

    const ritmo = calc.reduce((a, v) => a + v.ritmo, 0);
    const bloqueada = piezasPeriodo > 0 ? calc.filter((v) => v.agotada).reduce((a, v) => a + n(v.piezas), 0) / piezasPeriodo : 0;
    const stockTotal = fila.stock_full + fila.stock_transito + fila.stock_casa + fila.stock_amazon;
    const objetivo = calc.reduce((a, v) => a + v.objetivo, 0);
    const colores_top = [...new Set(calc.filter((v) => v.top_seller).map((v) => v.color))];
    // El faltante se cuenta talla por talla: lo que sobra en una talla no cubre la demanda de otra.
    // Amazon no se conoce por talla: se descuenta del faltante total del producto.
    const faltanVariantes = calc.reduce((a, v) => a + v.faltan, 0);
    const faltan = Math.max(0, faltanVariantes - fila.stock_amazon);
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
      top_seller: colores_top.length > 0, colores_top,
      motivo,
    });
  }

  // Reparto del presupuesto en dos vueltas:
  // 1) los colores top seller, del más vendido al menos vendido;
  // 2) todo lo demás (incluidos los otros colores de esos productos), por utilidad diaria en juego.
  let restante = p.presupuesto;
  const asignar = (x: ProductoSugerido, vs: VarianteSugerida[]) => {
    const costo = x.fila.costo_unitario;
    const orden = vs.filter((v) => v.faltan > v.sugerido).sort((a, b) => Number(b.agotada) - Number(a.agotada) || b.ritmo - a.ritmo);
    const totalFaltan = orden.reduce((a, v) => a + v.faltan - v.sugerido, 0);
    // Amazon (no se conoce por talla) ya está descontado en x.faltan
    const puede = Math.min(totalFaltan, x.faltan - x.sugerido, Math.floor(restante / costo));
    if (puede <= 0) return;
    // Reparto por talla: proporcional a lo que falta, el sobrante a las agotadas y las que más venden.
    let quedan = puede;
    const extra = orden.map((v) => Math.min(v.faltan - v.sugerido, Math.floor(((v.faltan - v.sugerido) / totalFaltan) * puede)));
    orden.forEach((v, i) => { v.sugerido += extra[i]; quedan -= extra[i]; });
    for (const v of orden) { if (quedan <= 0) break; if (v.sugerido < v.faltan) { v.sugerido++; quedan--; } }
    x.sugerido += puede;
    x.costo_pedido += puede * costo;
    x.utilidad_esperada += puede * x.utilidad_pieza;
    restante -= puede * costo;
  };
  const candidatos = productos.filter((x) => !x.motivo);
  const piezasTopDe = (x: ProductoSugerido) => Math.max(0, ...x.colores_top.map((c) => piezasTop.get(`${x.fila.product_id}|${c}`) ?? 0));
  for (const x of candidatos.filter((x) => x.top_seller).sort((a, b) => piezasTopDe(b) - piezasTopDe(a))) asignar(x, x.variantes.filter((v) => v.top_seller));
  for (const x of [...candidatos].sort((a, b) => b.score - a.score || (a.cobertura_dias ?? 0) - (b.cobertura_dias ?? 0))) asignar(x, x.variantes);
  for (const x of candidatos) if (x.sugerido === 0) x.motivo = "No alcanza el presupuesto este mes.";
  const conPedido = productos.filter((x) => x.sugerido > 0).sort((a, b) => Number(b.top_seller) - Number(a.top_seller) || b.score - a.score);
  const excluidos = productos.filter((x) => x.sugerido === 0).sort((a, b) => b.fila.venta - a.fila.venta);
  return {
    productos: conPedido,
    excluidos,
    total: conPedido.reduce((a, x) => a + x.costo_pedido, 0),
    utilidad: conPedido.reduce((a, x) => a + x.utilidad_esperada, 0),
  };
}

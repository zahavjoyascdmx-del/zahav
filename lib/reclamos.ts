// Estrategia para reclamos de Mercado Libre (MLM).
//
// Cómo cuenta ML (doc de desarrolladores, reputacion-de-vendedores y gestionar reclamos):
//  * Reclamos = ventas con reclamo que afecta / ventas de los últimos 60 días (si hay 40+ ventas).
//    Umbrales MLM: Líder 1% · Verde 1.5% · Amarillo 3% · Naranja 6%.
//  * /affects-reputation dice por reclamo si afecta. Con has_incentive, una respuesta satisfactoria del vendedor
//    dentro de las primeras 48 h hace que NO afecte. Es la palanca más fuerte: resolver rápido.
//  * No afectan (reglas de exclusión): arrepentimiento, cambio de talla/modelo, comprador que usó el reclamo solo
//    para contactar, demoras del transporte dentro del plazo prometido, daño en transporte, cancelación del comprador
//    sin culpa del vendedor. Se piden en Métricas → "Ventas con problemas" cuando ya no hay caso abierto.
//  * Sí afectan siempre: producto defectuoso o distinto a la publicación, no enviado / enviado tarde, decirle al
//    comprador que abra un reclamo o hablar mal de ML.
//  * En devoluciones, la revisión (return_review_fail con fotos) protege cuando regresa algo dañado, usado, incompleto
//    o que no es nuestro. Si no se revisa a tiempo, se pierde.
//
// Regla de la casa: solo afirmar lo que se puede demostrar. ML compara con el rastreo, las fotos y la publicación;
// un argumento falso hace perder el caso y puede sancionar la cuenta.

export const UMBRALES = [
  { nivel: "MercadoLíder", max: 0.01 },
  { nivel: "Verde", max: 0.015 },
  { nivel: "Amarillo", max: 0.03 },
  { nivel: "Naranja", max: 0.06 },
];

export type Reclamo = {
  claim_id: number; order_id: number | null; type: string | null; stage: string | null; status: string | null;
  reason_id: string | null; reason_name: string | null; reason_detail: string | null;
  affects_reputation: string | null; has_incentive: boolean | null; incentive_due_date: string | null;
  seller_actions: { action: string; due_date: string | null; mandatory?: boolean }[];
  due_date: string | null; action_responsible: string | null; detail_title: string | null; detail_description: string | null;
  resolution: { reason?: string; benefited?: string[]; closed_by?: string } | null;
  related_entities: string[] | null; returns: Record<string, unknown> | null;
  messages: { sender_role: string; receiver_role: string; message: string; date_created: string; attachments?: { filename: string; original_filename?: string }[] }[];
  last_message_at: string | null; last_message_role: string | null; date_created: string | null; last_updated: string | null;
  fecha: string | null; buyer_nickname: string | null; total_amount: number | null; order_status: string | null;
  logistic_type: string | null; envio_status: string | null; envio_substatus: string | null; date_shipped: string | null; date_delivered: string | null;
  titulo: string | null; variante: string | null; piezas: number | null; caso: string; prioridad: number;
};

export const puede = (r: Reclamo, action: string) => (r.seller_actions ?? []).some((a) => a.action === action);

export type Plan = {
  titulo: string;
  afecta: "si" | "no" | "evitable" | "desconocido";
  resumen: string;
  pasos: string[];
  plantillas: { nombre: string; para: "complainant" | "mediator"; texto: string }[];
};

const fechaMx = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "long", timeZone: "America/Mexico_City" }) : "";

const esFull = (r: Reclamo) => r.logistic_type === "fulfillment";
const entregado = (r: Reclamo) => r.envio_status === "delivered" || !!r.date_delivered;
const esArrepentimiento = (r: Reclamo) =>
  /repent|arrepent|no_lo_quiero|changed_mind/i.test(`${r.reason_name ?? ""} ${r.reason_detail ?? ""}`) || r.reason_id === "PDD9939";
const esTalla = (r: Reclamo) => /talla|size|medida|no_me_queda|fit/i.test(`${r.reason_name ?? ""} ${r.reason_detail ?? ""} ${r.detail_description ?? ""}`);

export function plan(r: Reclamo): Plan {
  const producto = r.titulo ?? "la pieza";
  const variante = r.variante ? ` (${r.variante})` : "";
  const enDisputa = r.stage === "dispute";
  const afecta: Plan["afecta"] =
    r.affects_reputation === "not_affected" || r.affects_reputation === "not_applies" ? "no"
      : r.affects_reputation === "affected" && r.has_incentive ? "evitable"
      : r.affects_reputation === "affected" ? "si" : "desconocido";
  const pasos: string[] = [];
  const plantillas: Plan["plantillas"] = [];

  if (r.status !== "opened") {
    const gano = r.resolution?.benefited?.includes("respondent");
    return {
      titulo: gano ? "Cerrado a nuestro favor" : "Cerrado",
      afecta,
      resumen: `Resolución: ${r.resolution?.reason ?? "—"}.`,
      pasos: afecta === "no" ? [] : [
        "Si fue arrepentimiento, cambio de talla, daño en transporte o el comprador solo quería contactarnos: pide la exclusión en Mercado Libre → Métricas → Ventas con problemas (ya no hay caso abierto).",
      ],
      plantillas: [],
    };
  }

  if (afecta === "evitable") {
    pasos.push(`Tienes incentivo: si lo resuelves satisfactoriamente antes del ${fechaMx(r.incentive_due_date ?? r.due_date)} NO cuenta para la reputación. Esto va primero.`);
  }
  if (afecta === "no") {
    pasos.push("ML ya lo marca como que no afecta la reputación: resuélvelo al menor costo de dinero y tiempo, sin pelearlo.");
  }

  // ---------------------------------------------------------------- no recibido
  if (r.caso === "no_recibido") {
    if (esFull(r)) {
      pasos.push("La pieza salió por Full: el almacén y la paquetería son de Mercado Libre. Problemas de transporte dentro del plazo prometido no se le cargan al vendedor.");
    }
    if (entregado(r)) {
      pasos.push(`El rastreo marca entregado el ${fechaMx(r.date_delivered)}. Pídele al comprador que revise con quien recibe en su domicilio/portería; si insiste, abre mediación para que ML revise la prueba de entrega.`);
      plantillas.push({
        nombre: "Comprador · entregado según rastreo", para: "complainant",
        texto: `Hola, gracias por escribirnos. Revisamos tu compra de ${producto}${variante}: el envío lo gestiona Mercado Libre y su rastreo indica que se entregó el ${fechaMx(r.date_delivered)}. ¿Nos ayudas a confirmar con quien pudo recibirlo (familiares, recepción o vecinos)? Si no aparece, Mercado Libre revisará la prueba de entrega y te apoyaremos en lo que esté de nuestro lado.`,
      });
      plantillas.push({
        nombre: "Mediador · prueba de entrega", para: "mediator",
        texto: `Solicitamos revisar la prueba de entrega del envío de la orden ${r.order_id}. ${esFull(r) ? "La venta se despachó desde Mercado Libre Full, por lo que preparación y transporte fueron de Mercado Libre. " : ""}El rastreo indica entregado el ${fechaMx(r.date_delivered)}. De nuestra parte el producto se envió conforme a la publicación.`,
      });
    } else {
      pasos.push("Aún no figura entregado. Si está dentro de la fecha prometida, explícale al comprador y pide que espere; si ya venció, ofrece solución (reembolso) antes de las 48 h, porque un 'no recibido' que escala sí puede contar.");
      plantillas.push({
        nombre: "Comprador · en camino", para: "complainant",
        texto: `Hola, gracias por avisarnos. Tu compra de ${producto}${variante} ${esFull(r) ? "salió del almacén de Mercado Libre (Full) y la entrega la gestiona Mercado Libre" : "está en camino"}. Estamos dando seguimiento al rastreo; si no llega en la fecha prometida, lo resolvemos contigo de inmediato.`,
      });
    }
  }

  // ---------------------------------------------------------------- distinto o defectuoso
  if (r.caso === "distinto_defectuoso") {
    if (esArrepentimiento(r)) {
      pasos.push("El motivo es arrepentimiento: según las reglas de exclusión no afecta. Acepta la devolución (sin discutir) y, al cerrar, pide la exclusión si llegara a contarse.");
      pasos.push("Cuando llegue la devolución, revísala: si viene usada, dañada o no es nuestra pieza, márcala como fallida con fotos (ML protege el dinero).");
    } else if (esTalla(r)) {
      pasos.push("Es un tema de talla: cambio de talla/modelo está en las reglas de exclusión. Ofrece el cambio de talla; en Full ML puede hacer el reemplazo.");
      plantillas.push({
        nombre: "Comprador · cambio de talla", para: "complainant",
        texto: `Hola, lamentamos que la talla no te haya quedado. Con gusto te ayudamos: ¿qué talla necesitas? Podemos gestionar el cambio de ${producto} o la devolución por Mercado Libre, como prefieras.`,
      });
    } else {
      pasos.push("Pide fotos claras antes de aceptar nada: la pieza completa, el problema, y el sello de kilataje (10K / 14K) en el interior. Con eso sabemos si es nuestra pieza y si el defecto es de fabricación o de uso.");
      pasos.push("Si la pieza coincide con la publicación (kilataje, medidas, gramos, certificado), dilo con esos datos, sin acusar al comprador. Si es defecto real, ofrece devolución o reembolso parcial dentro de las 48 h: es más barato que perder la reputación.");
      pasos.push("Si acepta devolución: al llegar revisa contra fotos de salida; si regresa dañada por uso, incompleta o distinta, revisión fallida con fotos (SRF2/SRF3/SRF4).");
      plantillas.push({
        nombre: "Comprador · pedir fotos", para: "complainant",
        texto: `Hola, lamentamos el inconveniente con ${producto}${variante} y queremos resolverlo rápido. ¿Nos compartes fotos claras de la pieza completa, del detalle que mencionas y del sello de kilataje en el interior? Con eso te damos la mejor solución (cambio, devolución o reembolso) a la brevedad.`,
      });
      plantillas.push({
        nombre: "Comprador · ofrecer solución", para: "complainant",
        texto: `Gracias por las fotos. Para que quedes satisfecho/a te ofrecemos la devolución de ${producto} con guía de Mercado Libre sin costo para ti, y en cuanto la recibamos se libera tu reembolso. Si prefieres conservarla, también podemos ofrecerte un reembolso parcial.`,
      });
      plantillas.push({
        nombre: "Mediador · producto conforme a la publicación", para: "mediator",
        texto: `Solicitamos su revisión. La pieza vendida en la orden ${r.order_id} (${producto}${variante}) corresponde a la publicación: [kilataje y sello, medidas, gramos, certificado si aplica]. Pedimos al comprador fotos del sello de kilataje y del detalle reportado; ofrecimos devolución para revisar la pieza. Adjuntamos fotos de la publicación/salida.`,
      });
    }
  }

  // ---------------------------------------------------------------- cancelación
  if (r.caso === "cancelacion") {
    pasos.push("Es cancelación: si la pidió el comprador y no fue por falta de stock o demora nuestra, no debe contar. Acepta y, al cerrar, pide la exclusión si aparece en Ventas con problemas.");
  }

  if (r.caso === "cambio" || r.caso === "otro") {
    pasos.push("Lee el detalle y los mensajes; responde en menos de 24 h con una solución concreta.");
  }

  if (enDisputa) {
    pasos.push("Ya está en mediación: no se le puede escribir al comprador; todo va al mediador, con datos y evidencia (fotos, rastreo, publicación).");
  } else if (puede(r, "open_dispute")) {
    pasos.push("Abrir mediación solo si tenemos la evidencia de nuestro lado; si no, una mediación perdida sí cuenta.");
  }
  pasos.push("Nunca le pidas al comprador que abra o cierre un reclamo, ni hables mal de ML: eso no se puede excluir.");

  const titulos: Record<string, string> = {
    no_recibido: "Producto no recibido", distinto_defectuoso: esArrepentimiento(r) ? "Arrepentimiento" : esTalla(r) ? "Talla" : "Distinto o defectuoso",
    cancelacion: "Cancelación", cambio: "Cambio", otro: "Otro",
  };
  return {
    titulo: titulos[r.caso] ?? r.caso,
    afecta,
    resumen: r.detail_title ?? r.reason_name ?? "",
    pasos,
    plantillas: plantillas.filter((p) => (p.para === "mediator" ? enDisputa || puede(r, "send_message_to_mediator") || puede(r, "open_dispute") : !enDisputa)),
  };
}

export const MOTIVOS_REVISION = [
  ["SRF2", "Llegó dañado"],
  ["SRF3", "Devolución incompleta"],
  ["SRF4", "Llegó un producto distinto"],
  ["SRF5", "El producto no venía en el paquete"],
  ["SRF6", "Otro problema"],
  ["SRF7", "La devolución no llegó"],
] as const;

export const ACCIONES: Record<string, string> = {
  send_message_to_complainant: "Escribir al comprador",
  send_message_to_mediator: "Escribir al mediador",
  open_dispute: "Abrir mediación",
  refund: "Reembolsar",
  allow_return: "Aceptar devolución",
  allow_partial_refund: "Reembolso parcial",
  allow_replace: "Reemplazo",
  return_review_ok: "Devolución OK",
  return_review_fail: "Devolución con problema",
  add_shipping_evidence: "Evidencia de envío",
  send_potential_shipping: "Promesa de envío",
};

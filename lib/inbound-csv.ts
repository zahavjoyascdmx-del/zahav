/** Lee el CSV "Inbound-<id>-detail_report" que descarga Mercado Libre en Envíos a Full (separado por ;). */
export type InboundRow = { inventory_id: string; sku: string; item_id: string; variante: string; declaradas: number; procesadas: number; aptas: number; no_aptas: number };
export type InboundCsv = { inbound_id: string; estado: string; fecha_recepcion: string; rows: InboundRow[] };

const norm = (s: string) => s.replace(/^﻿/, "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function parseInboundCsv(text: string): InboundCsv {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length < 2) throw new Error("El archivo está vacío.");
  const sep = lines[0].includes(";") ? ";" : ",";
  const head = lines[0].split(sep).map(norm);
  const col = (...names: string[]) => {
    const i = head.findIndex((h) => names.some((n) => h === norm(n) || h.startsWith(norm(n))));
    return i;
  };
  const cId = col("ID de envío"), cEstado = col("Estado del envío"), cFecha = col("Fecha de recepción"), cInv = col("Código ML"), cSku = col("SKU"),
    cPub = col("Número de publicación"), cVar = col("Variantes"), cDecl = col("Unidades declaradas"), cProc = col("Unidades procesadas"),
    cAptas = col("Unidades aptas para vender"), cNoAptas = col("Unidades no aptas para vender");
  if (cId < 0 || cInv < 0 || cDecl < 0) throw new Error("No parece el CSV de detalle de un envío a Full (faltan columnas ID de envío / Código ML / Unidades declaradas).");
  const n = (v: string | undefined) => Number(String(v ?? "").replace(/[^0-9-]/g, "")) || 0;
  const rows: InboundRow[] = [];
  let inbound_id = "", estado = "", fecha = "";
  for (const line of lines.slice(1)) {
    const c = line.split(sep).map((x) => x.trim());
    if (!c[cInv]) continue;
    inbound_id ||= c[cId]; estado ||= c[cEstado] ?? ""; fecha ||= c[cFecha] ?? "";
    const pub = c[cPub] ?? "";
    rows.push({
      inventory_id: c[cInv], sku: c[cSku] ?? "", item_id: pub ? (pub.startsWith("MLM") ? pub : `MLM${pub}`) : "",
      variante: (c[cVar] ?? "").split("|").map((x) => x.trim()).join("|"),
      declaradas: n(c[cDecl]), procesadas: n(c[cProc]), aptas: n(c[cAptas]), no_aptas: n(c[cNoAptas]),
    });
  }
  if (!rows.length) throw new Error("El archivo no tiene filas de piezas.");
  return { inbound_id, estado, fecha_recepcion: fecha ? fecha.replace(" ", "T") : "", rows };
}

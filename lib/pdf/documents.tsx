import React from "react";
import { Document, Line, Page, Polygon, Polyline, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import { DIAMOND_POINTS, LETTER_LINES, LOGO_GOLD, LOGO_TAN, LOGO_VIEWBOX, Z_POINTS } from "@/lib/logo";
import { detalleTexto, folio, folioRecibo, piezaTexto, type Negocio, type Pago, type Venta } from "@/lib/directas";

const GOLD = LOGO_GOLD;
const INK = "#1f2a24";
const SOFT = "#6b7770";
const LINE = "#e6dccb";
const PAPER = "#fbf8f2";

const mxn = (n: number | string) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 }).format(Number(n));
const fechaLarga = (iso: string | null | undefined) =>
  iso ? new Date(iso + (iso.length === 10 ? "T12:00:00Z" : "")).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Mexico_City" }) : "—";
const METODO: Record<string, string> = { transferencia: "Transferencia", efectivo: "Efectivo", tarjeta: "Tarjeta", "mercado pago": "Mercado Pago", otro: "Otro" };

const s = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 60, paddingHorizontal: 50, fontFamily: "Helvetica", fontSize: 10.5, color: INK, backgroundColor: "#ffffff" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 },
  brandName: { fontFamily: "Helvetica-Bold", fontSize: 11, letterSpacing: 3, color: GOLD, marginTop: 6 },
  brandSub: { fontSize: 9, color: SOFT, marginTop: 2 },
  docBox: { alignItems: "flex-end" },
  docTitle: { fontFamily: "Helvetica-Bold", fontSize: 18, letterSpacing: 1.5, color: INK },
  docFolio: { fontSize: 12, color: GOLD, marginTop: 3, fontFamily: "Helvetica-Bold" },
  docMeta: { fontSize: 9.5, color: SOFT, marginTop: 4 },
  rule: { height: 2, backgroundColor: GOLD, marginBottom: 18 },
  ruleSoft: { height: 1, backgroundColor: LINE, marginVertical: 12 },
  cols: { flexDirection: "row", gap: 24, marginBottom: 18 },
  col: { flex: 1 },
  label: { fontSize: 8, letterSpacing: 1.2, color: SOFT, textTransform: "uppercase", marginBottom: 4 },
  value: { fontSize: 11, color: INK, lineHeight: 1.4 },
  table: { borderWidth: 1, borderColor: LINE, borderRadius: 4, overflow: "hidden", marginBottom: 14 },
  th: { flexDirection: "row", backgroundColor: PAPER, paddingVertical: 7, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: LINE },
  tr: { flexDirection: "row", paddingVertical: 9, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: LINE },
  thText: { fontSize: 8, letterSpacing: 1, color: SOFT, textTransform: "uppercase" },
  cDesc: { flex: 3 },
  cDet: { flex: 2.4 },
  cAmt: { flex: 1.2, textAlign: "right" },
  totals: { alignSelf: "flex-end", width: 240, marginTop: 4 },
  totRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  totLabel: { color: SOFT },
  totBig: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderTopWidth: 1.5, borderTopColor: GOLD, marginTop: 4 },
  totBigText: { fontFamily: "Helvetica-Bold", fontSize: 13 },
  section: { marginTop: 16 },
  h: { fontFamily: "Helvetica-Bold", fontSize: 10, letterSpacing: 1.5, color: GOLD, textTransform: "uppercase", marginBottom: 8 },
  p: { lineHeight: 1.5, color: INK },
  small: { fontSize: 9, color: SOFT, lineHeight: 1.5 },
  footer: { position: "absolute", left: 50, right: 50, bottom: 28, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 8, flexDirection: "row", justifyContent: "space-between" },
  footText: { fontSize: 8.5, color: SOFT },
  amountBox: { backgroundColor: PAPER, borderWidth: 1, borderColor: LINE, borderRadius: 6, padding: 16, marginVertical: 16, alignItems: "center" },
  amountBig: { fontFamily: "Helvetica-Bold", fontSize: 26, color: INK },
  amountSub: { fontSize: 9.5, color: SOFT, marginTop: 4, letterSpacing: 1 },
  sign: { marginTop: 40, flexDirection: "row", justifyContent: "space-between", gap: 40 },
  signLine: { flex: 1, borderTopWidth: 1, borderTopColor: INK, paddingTop: 6, alignItems: "center" },
});

function Logo({ width = 150 }: { width?: number }) {
  return (
    <Svg viewBox={LOGO_VIEWBOX} width={width} height={(width * 480) / 1020}>
      <Polygon points={DIAMOND_POINTS} fill="none" stroke={LOGO_TAN} strokeWidth={34} />
      <Polyline points={Z_POINTS} fill="none" stroke={GOLD} strokeWidth={40} />
      {LETTER_LINES.map(([x1, y1, x2, y2], i) => (
        <Line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={GOLD} strokeWidth={16} />
      ))}
    </Svg>
  );
}

function Header({ negocio, title, folioText, meta }: { negocio: Negocio; title: string; folioText: string; meta: string[] }) {
  return (
    <>
      <View style={s.header}>
        <View>
          <Logo width={150} />
          <Text style={s.brandName}>{negocio.nombre.toUpperCase()}</Text>
          <Text style={s.brandSub}>{[negocio.ciudad, negocio.instagram].filter(Boolean).join("  ·  ")}</Text>
        </View>
        <View style={s.docBox}>
          <Text style={s.docTitle}>{title}</Text>
          <Text style={s.docFolio}>{folioText}</Text>
          {meta.map((m, i) => <Text key={i} style={s.docMeta}>{m}</Text>)}
        </View>
      </View>
      <View style={s.rule} />
    </>
  );
}

function Footer({ negocio }: { negocio: Negocio }) {
  const contacto = [negocio.whatsapp && `WhatsApp ${negocio.whatsapp}`, negocio.telefono && `Tel. ${negocio.telefono}`, negocio.correo].filter(Boolean).join("  ·  ");
  return (
    <View style={s.footer} fixed>
      <Text style={s.footText}>{negocio.nombre} · {negocio.ciudad}</Text>
      <Text style={s.footText}>{contacto}</Text>
    </View>
  );
}

export function PedidoPDF({ venta, pagos, negocio }: { venta: Venta; pagos: Pago[]; negocio: Negocio }) {
  const saldo = Number(venta.precio_total) - Number(venta.pagado);
  const esCotizacion = venta.estado === "cotizacion";
  return (
    <Document title={`${esCotizacion ? "Cotización" : "Pedido"} ${folio(venta.id)}`} author={negocio.nombre}>
      <Page size="LETTER" style={s.page}>
        <Header negocio={negocio} title={esCotizacion ? "COTIZACIÓN" : "PEDIDO"} folioText={folio(venta.id)} meta={[`Fecha: ${fechaLarga(venta.fecha)}`, venta.entrega_estimada ? `Entrega estimada: ${fechaLarga(venta.entrega_estimada)}` : ""].filter(Boolean)} />

        <View style={s.cols}>
          <View style={s.col}>
            <Text style={s.label}>Cliente</Text>
            <Text style={s.value}>{venta.cliente}</Text>
            {venta.telefono ? <Text style={s.small}>{venta.telefono}</Text> : null}
          </View>
          <View style={s.col}>
            <Text style={s.label}>Canal</Text>
            <Text style={s.value}>{venta.canal}</Text>
          </View>
          <View style={s.col}>
            <Text style={s.label}>Estado</Text>
            <Text style={s.value}>{{ cotizacion: "Cotización", anticipo: "Con anticipo", produccion: "En producción", lista: "Lista para entregar", entregada: "Entregada", cancelada: "Cancelada" }[venta.estado] ?? venta.estado}</Text>
          </View>
        </View>

        <View style={s.table}>
          <View style={s.th}>
            <Text style={[s.thText, s.cDesc]}>Pieza</Text>
            <Text style={[s.thText, s.cDet]}>Detalles</Text>
            <Text style={[s.thText, s.cAmt]}>Importe</Text>
          </View>
          <View style={s.tr}>
            <View style={s.cDesc}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>{piezaTexto(venta)}</Text>
              {venta.products && venta.descripcion ? <Text style={s.small}>{venta.descripcion}</Text> : null}
            </View>
            <Text style={[s.cDet, { color: SOFT }]}>{detalleTexto(venta) || "—"}</Text>
            <Text style={s.cAmt}>{mxn(venta.precio_total)}</Text>
          </View>
        </View>

        <View style={s.totals}>
          <View style={s.totRow}><Text style={s.totLabel}>Total</Text><Text>{mxn(venta.precio_total)}</Text></View>
          <View style={s.totRow}><Text style={s.totLabel}>Pagado</Text><Text>{mxn(venta.pagado)}</Text></View>
          <View style={s.totBig}><Text style={s.totBigText}>Saldo</Text><Text style={s.totBigText}>{mxn(saldo)}</Text></View>
        </View>

        {pagos.length > 0 && (
          <View style={s.section}>
            <Text style={s.h}>Pagos recibidos</Text>
            {pagos.map((p) => (
              <View key={p.id} style={s.totRow}>
                <Text style={s.p}>{fechaLarga(p.fecha)} · {METODO[p.metodo] ?? p.metodo}{p.nota ? ` · ${p.nota}` : ""}</Text>
                <Text style={s.p}>{mxn(p.monto)}</Text>
              </View>
            ))}
          </View>
        )}

        {venta.notas ? (
          <View style={s.section}>
            <Text style={s.h}>Notas</Text>
            <Text style={s.p}>{venta.notas}</Text>
          </View>
        ) : null}

        {negocio.leyenda ? (
          <View style={s.section}>
            <View style={s.ruleSoft} />
            <Text style={s.small}>{negocio.leyenda}</Text>
          </View>
        ) : null}

        <Footer negocio={negocio} />
      </Page>
    </Document>
  );
}

export function ReciboPDF({ venta, pago, pagos, negocio }: { venta: Venta; pago: Pago; pagos: Pago[]; negocio: Negocio }) {
  const acumulado = pagos.filter((p) => p.id <= pago.id).reduce((a, p) => a + Number(p.monto), 0);
  const saldo = Number(venta.precio_total) - acumulado;
  const concepto = saldo <= 0 ? "Liquidación" : acumulado === Number(pago.monto) ? "Anticipo" : "Abono";
  return (
    <Document title={`Recibo ${folioRecibo(pago.id)}`} author={negocio.nombre}>
      <Page size="LETTER" style={s.page}>
        <Header negocio={negocio} title="RECIBO DE PAGO" folioText={folioRecibo(pago.id)} meta={[`Fecha: ${fechaLarga(pago.fecha)}`, `Pedido: ${folio(venta.id)}`]} />

        <View style={s.cols}>
          <View style={s.col}>
            <Text style={s.label}>Recibimos de</Text>
            <Text style={s.value}>{venta.cliente}</Text>
            {venta.telefono ? <Text style={s.small}>{venta.telefono}</Text> : null}
          </View>
          <View style={s.col}>
            <Text style={s.label}>Método de pago</Text>
            <Text style={s.value}>{METODO[pago.metodo] ?? pago.metodo}</Text>
          </View>
          <View style={s.col}>
            <Text style={s.label}>Concepto</Text>
            <Text style={s.value}>{concepto}</Text>
          </View>
        </View>

        <View style={s.amountBox}>
          <Text style={s.amountBig}>{mxn(pago.monto)}</Text>
          <Text style={s.amountSub}>PESOS MEXICANOS</Text>
        </View>

        <Text style={s.p}>
          Por concepto de {concepto.toLowerCase()} del pedido {folio(venta.id)}: {piezaTexto(venta)}{detalleTexto(venta) ? ` (${detalleTexto(venta)})` : ""}.
          {pago.nota ? ` ${pago.nota}.` : ""}
        </Text>

        <View style={[s.totals, { marginTop: 18 }]}>
          <View style={s.totRow}><Text style={s.totLabel}>Total del pedido</Text><Text>{mxn(venta.precio_total)}</Text></View>
          <View style={s.totRow}><Text style={s.totLabel}>Pagado a la fecha</Text><Text>{mxn(acumulado)}</Text></View>
          <View style={s.totBig}><Text style={s.totBigText}>Saldo pendiente</Text><Text style={s.totBigText}>{mxn(Math.max(0, saldo))}</Text></View>
        </View>

        <View style={s.sign}>
          <View style={s.signLine}><Text style={s.small}>{negocio.nombre}</Text></View>
          <View style={s.signLine}><Text style={s.small}>Recibí conforme</Text></View>
        </View>

        {negocio.leyenda ? (
          <View style={s.section}>
            <View style={s.ruleSoft} />
            <Text style={s.small}>{negocio.leyenda}</Text>
          </View>
        ) : null}

        <Footer negocio={negocio} />
      </Page>
    </Document>
  );
}

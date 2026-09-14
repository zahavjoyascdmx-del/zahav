/** Arma la ficha (título, datos, precio) de un Reel a partir de la publicación de ML y el catálogo. */
import { sugerirSabias } from "./sabias";

export type ReelSpec = {
  titulo: string;
  subtitulo: string;
  datos: string[];
  precio: string;
  sabias: string;
  cta: string[];
  instagram: string;
};

type Item = { title: string; price: number | null; raw: Record<string, unknown> | null } | null;
type Producto = { name: string; kilates: string | null; grams: number | null; category: string | null } | null;
type Negocio = { instagram?: string; whatsapp?: string; nombre?: string } | null;

const mxn = (n: number) => "$" + new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(n);

function attr(raw: Record<string, unknown> | null, id: string): string | null {
  const attrs = (raw?.attributes as { id?: string; value_name?: string }[] | undefined) ?? [];
  return attrs.find((a) => a.id === id)?.value_name ?? null;
}

/** Ordena tallas numéricas y las resume: "5 a 8.5". */
function resumenTallas(tallas: string[]): string | null {
  const nums = [...new Set(tallas.map((t) => Number(String(t).replace(/[^0-9.]/g, ""))).filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b);
  if (!nums.length) return null;
  if (nums.length === 1) return `Talla ${nums[0]}`;
  return `Tallas ${nums[0]} a ${nums[nums.length - 1]}`;
}

export function sugerirFicha(item: Item, producto: Producto, tallasConStock: string[], negocio: Negocio): ReelSpec {
  const nombre = producto?.name ?? item?.title ?? "Joya de oro";
  const raw = item?.raw ?? null;
  const titulo0 = item?.title ?? nombre;
  const kil = producto?.kilates ?? (attr(raw, "METAL_PURITY") ? attr(raw, "METAL_PURITY") + "k" : null);
  const ancho = titulo0.match(/(\d+(?:[.,]\d+)?)\s*mm/i)?.[1]?.replace(",", ".");
  const material = attr(raw, "MATERIAL");
  const piedra = attr(raw, "GEMSTONE_TYPES") ?? attr(raw, "GEMSTONE_TYPE");
  const garantia = String(raw?.warranty ?? "").replace(/^Garantía del vendedor:\s*/i, "").replace(/(\d+) meses/, (_, n) => (n === "1" ? "1 mes" : `${n} meses`));
  const envioGratis = (raw?.shipping as { free_shipping?: boolean } | undefined)?.free_shipping === true;

  // Título corto: tipo de pieza + oro + kilates. Subtítulo: ancho y piedra.
  const tipo = /churumbela/i.test(nombre) ? "Churumbela" : /argolla/i.test(nombre) ? "Argolla" : /anillo/i.test(nombre) ? "Anillo" : /arete/i.test(nombre) ? "Aretes" : /pulsera/i.test(nombre) ? "Pulsera" : /collar|cadena/i.test(nombre) ? "Collar" : nombre.split(" ")[0];
  const titulo = `${tipo} de oro${kil ? ` ${kil}` : ""}`;
  const subt: string[] = [];
  if (ancho) subt.push(`${ancho} mm`);
  if (piedra) subt.push(piedra.toLowerCase().replace(/ y /g, " y "));
  else if (material) subt.push(material.toLowerCase());
  const subtitulo = subt.join(" · ");

  const datos: string[] = [];
  if (material || kil) datos.push([material ?? "Oro", kil].filter(Boolean).join(" "));
  if (producto?.grams) datos.push(`${producto.grams} g de oro`);
  if (ancho) datos.push(`${ancho} mm de ancho`);
  if (piedra) datos.push(piedra.charAt(0).toUpperCase() + piedra.slice(1).toLowerCase());
  const tallas = resumenTallas(tallasConStock);
  if (tallas) datos.push(tallas + " disponibles");
  if (garantia) datos.push(`Garantía ${garantia}`);
  if (envioGratis) datos.push("Envío gratis por Mercado Libre");
  datos.push("Hecho en México");

  const cta = ["Disponible en Mercado Libre"];
  if (negocio?.whatsapp) cta.push(`WhatsApp ${negocio.whatsapp}`);

  return {
    titulo, subtitulo, datos: datos.slice(0, 7),
    precio: item?.price ? mxn(Number(item.price)) : "",
    sabias: sugerirSabias(nombre, kil)[0]?.texto ?? "",
    cta,
    instagram: negocio?.instagram ?? "",
  };
}

/** Texto para la descripción del post en Instagram. */
export function sugerirCaption(spec: ReelSpec, permalink?: string | null): string {
  const lineas = [
    `${spec.titulo}${spec.subtitulo ? ` · ${spec.subtitulo}` : ""} ✨`,
    "",
    ...spec.datos.map((d) => `• ${d}`),
    spec.precio ? `• ${spec.precio} MXN` : "",
    "",
    spec.sabias ? `¿Sabías que? ${spec.sabias}` : "",
    "",
    spec.cta.join(" · ") + (permalink ? " (enlace en la bio)" : ""),
    "",
    "#zahav #joyeria #oro10k #oro #churumbela #argollas #anillos #joyeriafina #hechoenmexico #cdmx #regalo #aniversario #compromiso #mercadolibre",
  ];
  return lineas.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n").trim();
}

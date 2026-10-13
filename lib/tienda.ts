/** Lo que devuelve la función pública `catalogo_publico()` (solo datos que ya son públicos en Mercado Libre). */
export type Talla = { talla: string | null; color: string | null; disponible: boolean };
export type ProductoML = {
  id: string; titulo: string; precio: number; precio_original: number | null; enlace: string;
  kilates: string | null; categoria: string | null; full: boolean; envio_gratis: boolean; vendidos: number;
  material: string | null; fotos: string[]; tallas: Talla[];
};
export type NegocioPublico = { nombre: string | null; ciudad: string | null; whatsapp: string | null; instagram: string | null; correo: string | null };

export type Joya = ProductoML & {
  slug: string;
  nombre: string;
  coleccion: Coleccion;
  metal: string;
  piedra: string | null;
};

export const COLECCIONES = [
  { key: "compromiso", nombre: "Anillos de compromiso", corto: "Compromiso" },
  { key: "argollas", nombre: "Argollas de matrimonio", corto: "Argollas" },
  { key: "churumbelas", nombre: "Churumbelas", corto: "Churumbelas" },
  { key: "pulseras", nombre: "Pulseras", corto: "Pulseras" },
  { key: "collares", nombre: "Collares", corto: "Collares" },
  { key: "aretes", nombre: "Aretes", corto: "Aretes" },
  { key: "diamantes", nombre: "Diamantes sueltos", corto: "Diamantes" },
] as const;
export type Coleccion = (typeof COLECCIONES)[number]["key"];

export function coleccionDe(t: string): Coleccion {
  const s = t.toLowerCase();
  if (s.includes("suelto")) return "diamantes";
  if (s.includes("argolla")) return "argollas";
  if (s.includes("churumbela")) return "churumbelas";
  if (s.includes("arete")) return "aretes";
  if (s.includes("pulsera")) return "pulseras";
  if (s.includes("collar") || s.includes("cadena")) return "collares";
  return "compromiso";
}

export function metalDe(p: ProductoML): string {
  const s = `${p.titulo} ${p.material ?? ""}`.toLowerCase();
  const k = p.kilates ?? s.match(/\b(10|14|18)\s?k\b/)?.[0].replace(/\s/, "");
  if (k) return `Oro ${k.toLowerCase()}`;
  if (s.includes("enchapado") || s.includes("bañad")) return "Enchapado en oro";
  if (s.includes("plata")) return "Plata .925";
  if (s.includes("oro")) return "Oro";
  return "Plata .925";
}

export function piedraDe(t: string): string | null {
  const s = t.toLowerCase();
  if (s.includes("diamante")) return "Diamante natural";
  if (s.includes("esmeralda")) return "Esmeralda";
  if (s.includes("moissanita")) return "Moissanita";
  if (s.includes("zirconia")) return "Zirconia";
  return null;
}

/** Quita del título de Mercado Libre las palabras de relleno para buscadores ("Hombre Mujer Boda", "Para Par", tallas...). */
const RELLENO = new Set(["hombre", "mujer", "y", "para", "par", "boda", "unisex", "moda", "anillo"]);
export function nombreLimpio(t: string): string {
  const palabras = t.replace(/\s+/g, " ").trim().split(" ");
  // La primera palabra siempre se queda ("Anillo De Compromiso..."); las de relleno se quitan del resto.
  const s = [palabras[0], ...palabras.slice(1).filter((w) => !RELLENO.has(w.toLowerCase()))]
    .join(" ")
    .replace(/\s(blanco|amarillo|negro con blanco)(\s[\d.]+(\s?cm)?)?$/i, "")
    .replace(/\s\d+(\.\d+)?-\d+(\.\d+)?(\sa elegir)?$/i, "")
    .replace(/\sa elegir$/i, "")
    .replace(/,$/, "")
    .trim();
  return s || t;
}

export function slugDe(id: string, titulo: string): string {
  const base = titulo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
  return `${id.toLowerCase()}-${base}`;
}
export const idDeSlug = (slug: string) => slug.split("-")[0].toUpperCase();

/** wa.me necesita el número con lada de país y sin espacios. */
export function whatsappUrl(numero: string | null | undefined, texto: string): string | null {
  const d = (numero ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  const full = d.length === 10 ? `52${d}` : d;
  return `https://wa.me/${full}?text=${encodeURIComponent(texto)}`;
}

/** Colores de las variantes de ML → nombre de la joyería. */
export function nombreColor(color: string | null, metal: string): string | null {
  if (!color) return null;
  const c = color.toLowerCase();
  if (metal.startsWith("Oro") && ["amarillo", "blanco", "rosa"].includes(c)) return `Oro ${c}`;
  return color;
}

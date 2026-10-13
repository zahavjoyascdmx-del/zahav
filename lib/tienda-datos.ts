import { cache } from "react";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";
import { coleccionDe, metalDe, nombreLimpio, piedraDe, slugDe, type Joya, type NegocioPublico, type ProductoML } from "@/lib/tienda";

// Solo servidor: los componentes de cliente importan de "@/lib/tienda" (tipos y utilerías) para no cargar supabase-js.

/** Bisutería de acero y sets por volumen no van en la tienda de joyería fina. */
const esBisuteria = (p: ProductoML) => /acero|bisuter/i.test(`${p.material ?? ""} ${p.categoria ?? ""}`) || /\b\d+ pares\b/i.test(p.titulo);

/** Catálogo vivo: sale de la última sincronización con Mercado Libre (cada hora). */
export const cargarCatalogo = cache(async (): Promise<{ joyas: Joya[]; negocio: NegocioPublico }> => {
  const sb = createAnonClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc("catalogo_publico");
  if (error) throw new Error(`No se pudo cargar el catálogo: ${error.message}`);
  const productos = ((data?.productos ?? []) as ProductoML[]).filter((p) => !esBisuteria(p) && p.fotos.length > 0);
  const joyas = productos.map((p) => {
    const nombre = nombreLimpio(p.titulo);
    return { ...p, precio: Number(p.precio), slug: slugDe(p.id, nombre), nombre, coleccion: coleccionDe(p.titulo), metal: metalDe(p), piedra: piedraDe(p.titulo) };
  });
  const negocio = (data?.negocio ?? {}) as NegocioPublico;
  return { joyas, negocio };
});

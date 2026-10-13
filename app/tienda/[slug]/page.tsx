import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { mxn } from "@/lib/format";
import { COLECCIONES, idDeSlug } from "@/lib/tienda";
import { cargarCatalogo } from "@/lib/tienda-datos";
import { Galeria, Opciones } from "../_componentes/Ficha";
import { JoyaCard } from "../_componentes/JoyaCard";

export const revalidate = 600;

async function buscar(slug: string) {
  const { joyas, negocio } = await cargarCatalogo();
  const id = idDeSlug(slug);
  return { j: joyas.find((x) => x.id === id), joyas, negocio };
}

export async function generateStaticParams() {
  // Si Supabase no responde durante el build, las fichas se generan en la primera visita.
  try {
    const { joyas } = await cargarCatalogo();
    return joyas.map((j) => ({ slug: j.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { j } = await buscar((await params).slug);
  if (!j) return { title: "Pieza no disponible" };
  const description = `${j.nombre}. ${j.metal}${j.piedra ? ` con ${j.piedra.toLowerCase()}` : ""}. ${mxn(j.precio)} con envío gratis.`;
  return { title: j.nombre, description, openGraph: { title: j.nombre, description, images: j.fotos.slice(0, 1) } };
}

export default async function JoyaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { j, joyas, negocio } = await buscar(slug);
  if (!j) notFound();
  if (j.slug !== slug) permanentRedirect(`/tienda/${j.slug}`);
  const col = COLECCIONES.find((c) => c.key === j.coleccion)!;
  const similares = joyas.filter((x) => x.coleccion === j.coleccion && x.id !== j.id).sort((a, b) => b.vendidos - a.vendidos).slice(0, 4);

  return (
    <div className="t-wrap">
      <div className="t-migas">
        <Link href="/tienda">Inicio</Link> / <a href={`/tienda?c=${col.key}#catalogo`}>{col.nombre}</a> / {j.nombre}
      </div>
      <div className="t-ficha">
        <Galeria fotos={j.fotos} alt={j.nombre} />
        <div className="t-info">
          <div className="t-card-metal">{j.metal}{j.piedra ? ` · ${j.piedra}` : ""}</div>
          <h1>{j.nombre}</h1>
          <div className="t-precio">
            {mxn(j.precio)}
            {j.precio_original && j.precio_original > j.precio && <s>{mxn(j.precio_original)}</s>}
          </div>
          <div className="t-envio">
            {j.envio_gratis && <b>Envío gratis</b>}
            {j.full && <> · Sale de inmediato con Mercado Libre Full</>}
          </div>
          <Opciones j={j} whatsapp={negocio.whatsapp} />
          <dl className="t-detalles">
            <div><dt>Metal</dt><dd>{j.material ?? j.metal}</dd></div>
            {j.piedra && <div><dt>Piedra</dt><dd>{j.piedra}</dd></div>}
            <div><dt>Colección</dt><dd>{col.nombre}</dd></div>
          </dl>
        </div>
      </div>
      {similares.length > 0 && (
        <section className="t-sec" style={{ paddingTop: 20 }}>
          <div className="t-sec-head"><h2>También te puede gustar</h2></div>
          <div className="t-grid">{similares.map((x) => <JoyaCard key={x.id} j={x} />)}</div>
        </section>
      )}
    </div>
  );
}

import { COLECCIONES } from "@/lib/tienda";
import { cargarCatalogo } from "@/lib/tienda-datos";
import { Catalogo } from "./_componentes/Catalogo";
import { JoyaCard } from "./_componentes/JoyaCard";

// Se vuelve a generar cada 10 minutos con lo último que sincronizó Mercado Libre (la sync corre cada hora).
export const revalidate = 600;

/* eslint-disable @next/next/no-img-element */
export default async function TiendaPage() {
  const { joyas } = await cargarCatalogo();
  const masVendidas = [...joyas].sort((a, b) => b.vendidos - a.vendidos);
  const portada = masVendidas.find((j) => j.coleccion === "compromiso" && j.piedra === "Diamante natural") ?? masVendidas[0];
  const cats = COLECCIONES.filter((c) => c.key !== "diamantes")
    .map((c) => ({ ...c, joya: masVendidas.find((j) => j.coleccion === c.key) }))
    .filter((c) => c.joya);

  return (
    <>
      <section className="t-hero">
        <div className="t-hero-txt">
          <div className="t-eyebrow">Joyería fina · Ciudad de México</div>
          <h1>Para los momentos que se quedan para siempre</h1>
          <p>Anillos de compromiso con diamante natural, argollas de matrimonio en oro 10k y 14k, y piezas en moissanita certificada.</p>
          <div><a className="t-btn" href="#catalogo">Ver la colección</a></div>
        </div>
        <div className="t-hero-img">{portada && <img src={portada.fotos[0]} alt={portada.nombre} />}</div>
      </section>

      <section className="t-valores">
        <div><b>Oro 10k y 14k</b>Diamante natural y moissanita</div>
        <div><b>Envío gratis</b>A todo México</div>
        <div><b>Compra protegida</b>Pago seguro con Mercado Libre</div>
        <div><b>Atención personal</b>Te asesoramos por WhatsApp</div>
      </section>

      <section className="t-sec t-wrap">
        <div className="t-sec-head"><h2>Compra por categoría</h2></div>
        <div className="t-cats">
          {cats.map((c) => (
            <a key={c.key} href={`/tienda?c=${c.key}#catalogo`} className="t-cat">
              <div className="t-cat-img"><img src={c.joya!.fotos[0]} alt="" loading="lazy" /></div>
              <span>{c.corto}</span>
            </a>
          ))}
        </div>
      </section>

      <section className="t-sec t-wrap">
        <div className="t-sec-head"><h2>Los favoritos</h2><p>Las piezas que más eligen nuestros clientes</p></div>
        <div className="t-grid">
          {masVendidas.slice(0, 4).map((j) => <JoyaCard key={j.id} j={j} badge="Más vendido" />)}
        </div>
      </section>

      <section className="t-sec t-wrap" id="catalogo" style={{ scrollMarginTop: 90 }}>
        <div className="t-sec-head"><h2>Toda la colección</h2><p>{joyas.length} piezas disponibles</p></div>
        <Catalogo joyas={joyas} />
      </section>
    </>
  );
}

"use client";

import { useState } from "react";
import { nombreColor, whatsappUrl, type Joya } from "@/lib/tienda";

const SWATCH: Record<string, string> = {
  amarillo: "linear-gradient(135deg,#f3dc93,#c9a14a)",
  blanco: "linear-gradient(135deg,#f4f4f2,#c9cbcc)",
  rosa: "linear-gradient(135deg,#f3c9b8,#c98f78)",
  rojo: "#b3262d",
  negro: "#1b1a17",
};

/* eslint-disable @next/next/no-img-element */
export function Galeria({ fotos, alt }: { fotos: string[]; alt: string }) {
  const [i, setI] = useState(0);
  return (
    <div className="t-galeria">
      <div className="t-thumbs">
        {fotos.map((f, k) => (
          <button type="button" key={f} className={k === i ? "on" : ""} onClick={() => setI(k)} aria-label={`Foto ${k + 1}`}>
            <img src={f} alt="" loading="lazy" />
          </button>
        ))}
      </div>
      <div className="t-principal"><img src={fotos[i]} alt={alt} /></div>
    </div>
  );
}

/** Color de oro y talla. La compra se hace en Mercado Libre (la publicación real) o se aparta por WhatsApp. */
export function Opciones({ j, whatsapp }: { j: Joya; whatsapp: string | null }) {
  const colores = [...new Set(j.tallas.map((t) => t.color).filter(Boolean))] as string[];
  const colorInicial = colores.find((c) => j.tallas.some((t) => t.color === c && t.disponible)) ?? colores[0] ?? null;
  const [color, setColor] = useState<string | null>(colorInicial);
  const [talla, setTalla] = useState<string | null>(null);

  const tallas = j.tallas.filter((t) => t.talla && (!color || t.color === color));
  const conTalla = tallas.length > 0;
  const colorNombre = nombreColor(color, j.metal);

  const texto = [`Hola ZAHAV, me interesa: ${j.nombre}`, colorNombre && `Color: ${colorNombre}`, talla && `Talla: ${talla}`, `Precio: $${j.precio.toLocaleString("es-MX")}`, j.enlace]
    .filter(Boolean).join("\n");
  const wa = whatsappUrl(whatsapp, texto);

  return (
    <>
      {colores.length > 1 && (
        <div className="t-opcion">
          <div className="t-opcion-tit">Color<span>{colorNombre}</span></div>
          <div className="t-colores">
            {colores.map((c) => (
              <button type="button" key={c} className={`t-color ${c === color ? "on" : ""}`} onClick={() => { setColor(c); setTalla(null); }}>
                <i style={{ background: SWATCH[c.toLowerCase()] ?? "#ddd" }} />{nombreColor(c, j.metal)}
              </button>
            ))}
          </div>
        </div>
      )}
      {conTalla && (
        <div className="t-opcion">
          <div className="t-opcion-tit">Talla<span>{talla ?? "elige tu talla"}</span></div>
          <div className="t-tallas">
            {tallas.map((t) => (
              <button type="button" key={`${t.color}-${t.talla}`} className={`t-talla ${t.talla === talla ? "on" : ""}`} disabled={!t.disponible} onClick={() => setTalla(t.talla)} title={t.disponible ? "" : "Agotada"}>
                {t.talla}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="t-acciones">
        <a className="t-btn" href={j.enlace} target="_blank" rel="noreferrer">Comprar en Mercado Libre</a>
        {wa && <a className="t-btn alt" href={wa} target="_blank" rel="noreferrer">Pedir por WhatsApp</a>}
        <div className="t-nota">
          {conTalla && "Elige color y talla dentro de Mercado Libre al comprar. "}
          ¿Dudas con tu talla o quieres grabado? Escríbenos por WhatsApp.
        </div>
      </div>
    </>
  );
}

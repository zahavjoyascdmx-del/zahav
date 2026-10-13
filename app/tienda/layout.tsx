import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Cormorant_Garamond, Jost } from "next/font/google";
import { COLECCIONES, whatsappUrl } from "@/lib/tienda";
import { cargarCatalogo } from "@/lib/tienda-datos";
import "./tienda.css";

const serif = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--t-serif" });
const sans = Jost({ subsets: ["latin"], weight: ["300", "400", "500"], variable: "--t-sans" });

export const metadata: Metadata = {
  title: { default: "ZAHAV Joyas · Joyería fina en oro y diamantes", template: "%s · ZAHAV Joyas" },
  description: "Anillos de compromiso, argollas de matrimonio, pulseras y collares en oro 10k y 14k, diamante natural y moissanita. Ciudad de México, envío a todo el país.",
  manifest: null,
  appleWebApp: { capable: false },
};

export default async function TiendaLayout({ children }: { children: ReactNode }) {
  const { negocio } = await cargarCatalogo();
  const wa = whatsappUrl(negocio.whatsapp, "Hola ZAHAV, me interesa una joya de su catálogo.");
  const ig = negocio.instagram ? `https://instagram.com/${negocio.instagram.replace(/^@/, "")}` : null;
  return (
    <div className={`tienda ${serif.variable} ${sans.variable}`}>
      <div className="t-anuncio">Envío gratis a todo México · Compra protegida · Atención personal por WhatsApp</div>
      <header className="t-header">
        <div className="t-header-in">
          <Link href="/tienda" className="t-marca" aria-label="ZAHAV Joyas, inicio">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="ZAHAV" />
          </Link>
          <nav className="t-nav" aria-label="Colecciones">
            {COLECCIONES.filter((c) => c.key !== "diamantes").map((c) => (
              <a key={c.key} href={`/tienda?c=${c.key}#catalogo`}>{c.corto}</a>
            ))}
          </nav>
          {wa && <a className="t-header-wa" href={wa} target="_blank" rel="noreferrer">Contáctanos</a>}
        </div>
      </header>
      <main>{children}</main>
      <footer className="t-footer">
        <div className="t-footer-in">
          <div>
            <div className="t-footer-marca">ZAHAV</div>
            <p>Joyería fina desde {negocio.ciudad ?? "Ciudad de México"}. Oro 10k y 14k, diamante natural y moissanita certificada.</p>
          </div>
          <div>
            <h4>Colecciones</h4>
            {COLECCIONES.map((c) => <a key={c.key} href={`/tienda?c=${c.key}#catalogo`}>{c.nombre}</a>)}
          </div>
          <div>
            <h4>Contacto</h4>
            {wa && <a href={wa} target="_blank" rel="noreferrer">WhatsApp {negocio.whatsapp}</a>}
            {ig && <a href={ig} target="_blank" rel="noreferrer">Instagram {negocio.instagram}</a>}
            {negocio.correo && <a href={`mailto:${negocio.correo}`}>{negocio.correo}</a>}
          </div>
        </div>
        <div className="t-legal">© {new Date().getFullYear()} ZAHAV Joyas · Compra protegida a través de Mercado Libre</div>
      </footer>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const links = [
  { href: "/", label: "Resumen" },
  { href: "/reporte", label: "Reporte mensual" },
  { href: "/pedido", label: "Qué pedir" },
  { href: "/ventas", label: "Ventas ML" },
  { href: "/directas", label: "Ventas directas" },
  { href: "/stock", label: "Stock en Full" },
  { href: "/bodega", label: "Bodega" },
  { href: "/publicaciones", label: "Publicaciones" },
  { href: "/videos", label: "Videos" },
  { href: "/productos", label: "Catálogo" },
  { href: "/sync", label: "Sincronización" },
  { href: "/config", label: "Configuración" },
];

export function Nav() {
  const path = usePathname();
  const activeRef = useRef<HTMLAnchorElement>(null);
  // En la barra horizontal del celular, la sección actual queda visible sin tener que deslizar.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [path]);
  return (
    <>
      {links.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={active ? "active" : ""} ref={active ? activeRef : undefined}>
            {l.label}
          </Link>
        );
      })}
    </>
  );
}

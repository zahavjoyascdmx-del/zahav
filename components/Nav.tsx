"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Resumen" },
  { href: "/ventas", label: "Ventas ML" },
  { href: "/directas", label: "Ventas directas" },
  { href: "/stock", label: "Stock en Full" },
  { href: "/publicaciones", label: "Publicaciones" },
  { href: "/sync", label: "Sincronización" },
];

export function Nav() {
  const path = usePathname();
  return (
    <>
      {links.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={active ? "active" : ""}>
            {l.label}
          </Link>
        );
      })}
    </>
  );
}

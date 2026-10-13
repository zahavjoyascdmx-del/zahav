import Link from "next/link";
import { mxn } from "@/lib/format";
import type { Joya } from "@/lib/tienda";

/* eslint-disable @next/next/no-img-element */
export function JoyaCard({ j, badge }: { j: Joya; badge?: string }) {
  const [a, b] = j.fotos;
  return (
    <Link href={`/tienda/${j.slug}`} className="t-card">
      <div className="t-card-img">
        {badge && <span className="t-badge">{badge}</span>}
        {b ? (
          <>
            <img className="a" src={a} alt={j.nombre} loading="lazy" />
            <img className="b" src={b} alt="" loading="lazy" aria-hidden />
          </>
        ) : (
          <img className="solo" src={a} alt={j.nombre} loading="lazy" />
        )}
      </div>
      <div className="t-card-meta">
        <div className="t-card-metal">{j.metal}{j.piedra ? ` · ${j.piedra}` : ""}</div>
        <div className="t-card-nombre">{j.nombre}</div>
        <div className="t-precio">
          {mxn(j.precio)}
          {j.precio_original && j.precio_original > j.precio && <s>{mxn(j.precio_original)}</s>}
        </div>
      </div>
    </Link>
  );
}

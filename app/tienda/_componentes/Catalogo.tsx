"use client";

import { useEffect, useMemo, useState } from "react";
import { COLECCIONES, type Coleccion, type Joya } from "@/lib/tienda";
import { JoyaCard } from "./JoyaCard";

type Orden = "populares" | "precio-asc" | "precio-desc";

/** Filtros del catálogo en el navegador: la página se sirve en caché y aquí solo se acomoda lo que ya llegó. */
export function Catalogo({ joyas }: { joyas: Joya[] }) {
  const [col, setCol] = useState<Coleccion | "todas">("todas");
  const [metal, setMetal] = useState("todos");
  const [orden, setOrden] = useState<Orden>("populares");

  // Los enlaces del menú llegan como /tienda?c=argollas#catalogo
  useEffect(() => {
    const leer = () => {
      const c = new URLSearchParams(window.location.search).get("c");
      if (c && COLECCIONES.some((x) => x.key === c)) setCol(c as Coleccion);
    };
    leer();
    window.addEventListener("popstate", leer);
    return () => window.removeEventListener("popstate", leer);
  }, []);

  const elegir = (c: Coleccion | "todas") => {
    setCol(c);
    const url = c === "todas" ? "/tienda#catalogo" : `/tienda?c=${c}#catalogo`;
    window.history.replaceState(null, "", url);
  };

  const colecciones = COLECCIONES.filter((c) => joyas.some((j) => j.coleccion === c.key));
  const metales = [...new Set(joyas.map((j) => j.metal))].sort();

  const lista = useMemo(() => {
    const r = joyas.filter((j) => (col === "todas" || j.coleccion === col) && (metal === "todos" || j.metal === metal));
    if (orden === "precio-asc") r.sort((a, b) => a.precio - b.precio);
    else if (orden === "precio-desc") r.sort((a, b) => b.precio - a.precio);
    else r.sort((a, b) => b.vendidos - a.vendidos);
    return r;
  }, [joyas, col, metal, orden]);

  return (
    <>
      <div className="t-filtros">
        <div className="t-chips" role="tablist" aria-label="Colección">
          <button type="button" className={`t-chip ${col === "todas" ? "on" : ""}`} onClick={() => elegir("todas")}>Todo</button>
          {colecciones.map((c) => (
            <button type="button" key={c.key} className={`t-chip ${col === c.key ? "on" : ""}`} onClick={() => elegir(c.key)}>{c.corto}</button>
          ))}
        </div>
        <div className="t-filtros-der">
          <select className="t-select" value={metal} onChange={(e) => setMetal(e.target.value)} aria-label="Metal">
            <option value="todos">Todos los metales</option>
            {metales.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select className="t-select" value={orden} onChange={(e) => setOrden(e.target.value as Orden)} aria-label="Ordenar">
            <option value="populares">Más vendidos</option>
            <option value="precio-asc">Precio: menor a mayor</option>
            <option value="precio-desc">Precio: mayor a menor</option>
          </select>
        </div>
      </div>
      {lista.length === 0 ? (
        <div className="t-vacio">No hay piezas con esos filtros.</div>
      ) : (
        <div className="t-grid">
          {lista.map((j) => <JoyaCard key={j.id} j={j} />)}
        </div>
      )}
    </>
  );
}

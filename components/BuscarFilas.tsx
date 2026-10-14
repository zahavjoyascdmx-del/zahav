"use client";

import { useEffect, useState } from "react";

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Filtra en el navegador las filas <tr data-q="..."> de la tabla indicada. Solo las oculta,
// así que lo que ya escribiste en una fila no se pierde al buscar.
export function BuscarFilas({ tabla, placeholder = "Buscar…" }: { tabla: string; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [visibles, setVisibles] = useState<number | null>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const filas = Array.from(document.querySelectorAll<HTMLTableRowElement>(`#${tabla} tbody tr[data-q]`));
    const palabras = normalizar(q).split(/\s+/).filter(Boolean);
    let n = 0;
    for (const tr of filas) {
      const texto = normalizar(tr.dataset.q ?? "");
      const ok = palabras.every((p) => texto.includes(p));
      tr.style.display = ok ? "" : "none";
      if (ok) n++;
    }
    setTotal(filas.length);
    setVisibles(palabras.length ? n : null);
  }, [q, tabla]);

  return (
    <div className="inline" style={{ marginBottom: 12 }}>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setQ("")}
        placeholder={placeholder}
        aria-label="Buscar"
        style={{ width: 320, maxWidth: "100%" }}
      />
      {visibles != null && <span className="muted" style={{ fontSize: 13 }}>{visibles} de {total}</span>}
    </div>
  );
}

"use client";

import { useState, type ReactNode } from "react";

export type Pestana = { key: string; label: string; badge?: ReactNode; content: ReactNode };

/**
 * Pestañas (por color) dentro de un producto o publicación. Todas las pestañas quedan montadas y solo se
 * ocultan, así los campos editables de las otras pestañas también se envían al guardar.
 */
export function ColorTabs({ tabs }: { tabs: Pestana[] }) {
  const [active, setActive] = useState(tabs[0]?.key);
  if (tabs.length === 0) return null;
  if (tabs.length === 1) return <>{tabs[0].content}</>;
  return (
    <div className="tabs">
      <div className="tab-bar" role="tablist">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={t.key === active} className={`tab ${t.key === active ? "active" : ""}`} onClick={() => setActive(t.key)}>
            {t.label}{t.badge}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.key} role="tabpanel" hidden={t.key !== active}>{t.content}</div>
      ))}
    </div>
  );
}

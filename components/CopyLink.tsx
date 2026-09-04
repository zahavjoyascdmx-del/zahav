"use client";

import { useState } from "react";

export function CopyLink({ url, label, small = false }: { url: string; label: string; small?: boolean }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {
      window.prompt("Copia este enlace:", url);
    }
  }
  return (
    <button type="button" onClick={copy} className={small ? "chip" : "btn secondary"} style={{ cursor: "pointer" }}>
      {done ? "¡Copiado!" : label}
    </button>
  );
}

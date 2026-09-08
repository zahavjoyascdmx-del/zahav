"use client";

import { useState } from "react";

export function CopyText({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {
      window.prompt("Copia este texto:", text);
    }
  }
  return <button type="button" onClick={copy} className="btn secondary" style={{ cursor: "pointer" }}>{done ? "¡Copiado!" : label}</button>;
}

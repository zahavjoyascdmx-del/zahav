"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Mientras haya videos en proceso, recarga los datos de la página cada cierto tiempo. */
export function AutoRefresh({ activo, cadaMs = 15_000 }: { activo: boolean; cadaMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!activo) return;
    const t = setInterval(() => router.refresh(), cadaMs);
    return () => clearInterval(t);
  }, [activo, cadaMs, router]);
  return null;
}

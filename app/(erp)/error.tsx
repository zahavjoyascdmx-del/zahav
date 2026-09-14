"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Si una página falla (base de datos sin respuesta, sesión vencida…), se muestra esto en vez de una pantalla en blanco. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h1>No se pudo cargar esta sección</h1>
      <p className="muted">Suele ser un problema pasajero de conexión. Vuelve a intentarlo; si sigue igual, entra de nuevo a la app.</p>
      {error.digest && <p className="muted" style={{ fontSize: 12 }}>Código: {error.digest}</p>}
      <div className="chips" style={{ marginTop: 12 }}>
        <button className="btn" type="button" onClick={() => reset()}>Reintentar</button>
        <Link href="/" className="chip">Ir al resumen</Link>
        <Link href="/login" className="chip">Volver a entrar</Link>
      </div>
    </div>
  );
}

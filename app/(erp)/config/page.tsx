import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";
import type { Negocio } from "@/lib/directas";
import { guardarNegocio } from "./actions";

export const dynamic = "force-dynamic";

export default async function ConfigPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const { ok } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("key,value").in("key", ["negocio", "gold_price"]);
  const negocio = ((data ?? []).find((r) => r.key === "negocio")?.value ?? {}) as Partial<Negocio>;
  const oro = ((data ?? []).find((r) => r.key === "gold_price")?.value ?? {}) as Record<string, number>;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Configuración</h1>
          <div className="muted">Datos que aparecen en los PDF de pedidos y recibos, y precio del oro para costos.</div>
        </div>
      </div>
      {ok && <p className="notice" style={{ background: "var(--calm-bg)", color: "var(--calm)" }}>Guardado.</p>}
      <div className="grid grid-2">
        <div className="card">
          <h2>Negocio</h2>
          <form action={guardarNegocio} className="form-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
            <label>Nombre<input name="nombre" defaultValue={negocio.nombre ?? "Zahav Joyas"} required /></label>
            <label>Ciudad<input name="ciudad" defaultValue={negocio.ciudad ?? "Ciudad de México"} /></label>
            <label>Teléfono<input name="telefono" defaultValue={negocio.telefono ?? ""} /></label>
            <label>WhatsApp<input name="whatsapp" defaultValue={negocio.whatsapp ?? ""} /></label>
            <label>Instagram<input name="instagram" defaultValue={negocio.instagram ?? ""} /></label>
            <label>Correo<input name="correo" defaultValue={negocio.correo ?? ""} /></label>
            <label className="wide">Leyenda al pie de los documentos<textarea name="leyenda" rows={3} defaultValue={negocio.leyenda ?? ""} /></label>
            <label>Oro 10k · $ por gramo<input name="oro_10k" type="number" step="1" defaultValue={oro["10k"] ?? ""} /></label>
            <label>Oro 14k · $ por gramo<input name="oro_14k" type="number" step="1" defaultValue={oro["14k"] ?? ""} /></label>
            <div style={{ gridColumn: "1 / -1" }}><button className="btn" type="submit">Guardar</button></div>
          </form>
        </div>
        <div className="card">
          <h2>Logo en los documentos</h2>
          <div style={{ background: "#fff", padding: 20, border: "1px solid var(--line)", borderRadius: 10, display: "inline-block" }}>
            <Logo width={320} />
          </div>
          <p className="muted">Logotipo oficial tomado de tu Drive (logo.jpeg). Para cambiarlo, sube una nueva imagen con "logo" en el nombre y avísame.</p>
        </div>
      </div>
    </>
  );
}

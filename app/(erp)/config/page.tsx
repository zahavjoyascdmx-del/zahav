import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";
import type { Negocio } from "@/lib/directas";
import { guardarNegocio } from "./actions";

export const dynamic = "force-dynamic";

export default async function ConfigPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const { ok } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("key,value").in("key", ["negocio", "gastos_fijos", "presupuesto", "lead_time_days", "buffer_days", "margen_objetivo", "margen_liquidacion", "utilidad_minima_pz", "liquidacion_dias", "liquidacion_pct"]);
  const get = (k: string) => (data ?? []).find((r) => r.key === k)?.value;
  const negocio = (get("negocio") ?? {}) as Partial<Negocio>;
  const fijos = (get("gastos_fijos") ?? {}) as Record<string, number>;
  const presu = (get("presupuesto") ?? {}) as { pct_recibido?: number; fijo?: number };
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Configuración</h1>
          <div className="muted">Datos del negocio para los PDF, gastos fijos del mes y reglas para el pedido sugerido. El precio del oro se captura cada mes en <Link href="/reporte">Reporte mensual</Link>.</div>
        </div>
      </div>
      {ok && <p className="notice" style={{ background: "var(--calm-bg)", color: "var(--calm)" }}>Guardado.</p>}
      <form action={guardarNegocio}>
        <div className="grid grid-2">
          <div className="card">
            <h2>Negocio</h2>
            <div className="form-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
              <label>Nombre<input name="nombre" defaultValue={negocio.nombre ?? "Zahav Joyas"} required /></label>
              <label>Ciudad<input name="ciudad" defaultValue={negocio.ciudad ?? "Ciudad de México"} /></label>
              <label>Teléfono<input name="telefono" defaultValue={negocio.telefono ?? ""} /></label>
              <label>WhatsApp<input name="whatsapp" defaultValue={negocio.whatsapp ?? ""} /></label>
              <label>Instagram<input name="instagram" defaultValue={negocio.instagram ?? ""} /></label>
              <label>Correo<input name="correo" defaultValue={negocio.correo ?? ""} /></label>
              <label className="wide">Leyenda al pie de los documentos<textarea name="leyenda" rows={3} defaultValue={negocio.leyenda ?? ""} /></label>
            </div>
          </div>
          <div className="card">
            <h2>Gastos fijos del mes <span className="muted">· se restan de la utilidad neta en el reporte</span></h2>
            <div className="form-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
              <label>Contabilidad<input name="contabilidad" type="number" step="1" defaultValue={fijos.contabilidad ?? 3500} /></label>
              <label>Intereses<input name="intereses" type="number" step="1" defaultValue={fijos.intereses ?? 4000} /></label>
              <label>Publicidad (solo meses sin datos de Product Ads)<input name="publicidad" type="number" step="1" defaultValue={fijos.publicidad ?? 0} /></label>
            </div>
            <h2 style={{ marginTop: 18 }}>Pedido sugerido</h2>
            <div className="form-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
              <label>% de lo depositado que reinviertes<input name="pct_recibido" type="number" step="1" min="0" max="100" defaultValue={presu.pct_recibido ?? 60} /></label>
              <label>O un presupuesto fijo mensual (0 = usar el %)<input name="presupuesto_fijo" type="number" step="1000" min="0" defaultValue={presu.fijo ?? 0} /></label>
              <label>Días que tarda el proveedor en entregar<input name="lead_time_days" type="number" step="1" min="1" defaultValue={Number(get("lead_time_days") ?? 30)} /></label>
              <label>Días de colchón de stock<input name="buffer_days" type="number" step="1" min="0" defaultValue={Number(get("buffer_days") ?? 30)} /></label>
            </div>
            <h2 style={{ marginTop: 18 }}>Margen objetivo</h2>
            <div className="form-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
              <label>Lo que te debe quedar de ML por cada peso de costo<input name="margen_objetivo" type="number" step="0.05" min="1" defaultValue={Number(((get("margen_objetivo") ?? {}) as { valor?: number }).valor ?? 1.8)} /></label>
              <label>Margen para productos en liquidación<input name="margen_liquidacion" type="number" step="0.05" min="1" defaultValue={Number(((get("margen_liquidacion") ?? {}) as { valor?: number }).valor ?? 1.15)} /></label>
              <label>Utilidad por pieza que ya se da por buena (pesos)<input name="utilidad_minima_pz" type="number" step="50" min="0" defaultValue={Number(((get("utilidad_minima_pz") ?? {}) as { valor?: number }).valor ?? 1500)} /></label>
            </div>
            <h2 style={{ marginTop: 18 }}>Aviso de liquidación</h2>
            <div className="form-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
              <label>Días a revisar<input name="liquidacion_dias" type="number" step="1" min="15" defaultValue={Number(((get("liquidacion_dias") ?? {}) as { valor?: number }).valor ?? 60)} /></label>
              <label>Avisar si vendió menos de este % de su stock<input name="liquidacion_pct" type="number" step="1" min="1" max="100" defaultValue={Number(((get("liquidacion_pct") ?? {}) as { valor?: number }).valor ?? 10)} /></label>
            </div>
            <p className="muted">1.8 quiere decir: si la pieza te cuesta 1,000, Mercado Libre te debe dejar al menos 1,800 ya sin comisiones ni retenciones. Se usa en la pantalla Precios y margen; ahí mismo marcas qué productos o colores están en liquidación. Si una pieza ya deja más de la utilidad indicada (por ejemplo 1,500), se acepta aunque el margen sea menor al objetivo.</p>
            <p className="muted">Ejemplo: si te depositan $600,000 al mes y reinviertes 60%, el pedido sugerido no pasará de $360,000.</p>
            <button className="btn" type="submit">Guardar</button>
          </div>
        </div>
      </form>
      <div className="card" style={{ marginTop: 14 }}>
        <h2>Logo en los documentos</h2>
        <div style={{ background: "#fff", padding: 20, border: "1px solid var(--line)", borderRadius: 10, display: "inline-block" }}>
          <Logo width={320} />
        </div>
        <p className="muted">Logotipo oficial tomado de tu Drive (logo.jpeg). Para cambiarlo, sube una nueva imagen con &quot;logo&quot; en el nombre y avísame.</p>
      </div>
    </>
  );
}

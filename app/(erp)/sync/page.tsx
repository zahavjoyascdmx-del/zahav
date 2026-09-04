import { createClient } from "@/lib/supabase/server";
import { fechaHora } from "@/lib/format";
import { remap, runSync } from "./actions";

export const dynamic = "force-dynamic";

const KINDS: [string, string][] = [
  ["incremental", "Órdenes recientes + stock Full + envíos"],
  ["items", "Publicaciones y variantes"],
  ["stock", "Stock en Full"],
  ["visits", "Visitas"],
  ["shipments", "Costos de envío pendientes"],
];

export default async function SyncPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("sync_runs").select("*").order("id", { ascending: false }).limit(40);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Sincronización</h1>
          <div className="muted">Automática cada hora (órdenes y stock) y cada noche (publicaciones y visitas). Aquí puedes forzarla.</div>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="chips">
          {KINDS.map(([k, label]) => (
            <form key={k} action={runSync}>
              <input type="hidden" name="kind" value={k} />
              <button className="btn secondary" type="submit">{label}</button>
            </form>
          ))}
          <form action={remap}><button className="btn secondary" type="submit">Re-mapear catálogo</button></form>
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>La corrida aparece abajo en unos segundos; recarga la página para ver el resultado.</p>
      </div>
      <div className="card tight">
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>#</th><th>Tipo</th><th>Inicio</th><th>Fin</th><th>Estado</th><th>Resultado</th></tr></thead>
            <tbody>
              {(data ?? []).map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{r.kind}</td>
                  <td>{fechaHora(r.started_at)}</td>
                  <td>{r.finished_at ? fechaHora(r.finished_at) : "…"}</td>
                  <td><span className={`tag ${r.status === "ok" ? "ok" : r.status === "running" ? "neutral" : r.status === "partial" ? "warn" : "bad"}`}>{r.status}</span></td>
                  <td style={{ whiteSpace: "normal", maxWidth: 480 }}>
                    {JSON.stringify(r.stats)}{r.error ? ` · ${String(r.error).slice(0, 200)}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

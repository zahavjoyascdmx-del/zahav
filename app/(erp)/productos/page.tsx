import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { mxn, num } from "@/lib/format";
import { ORDEN_PROVEEDOR, ordenSeccion } from "@/lib/reporte";
import { actualizarProducto } from "./actions";

export const dynamic = "force-dynamic";

type Producto = {
  id: number; name: string; category: string | null; kilates: string | null; grams: number | null; cost_fixed: number | null; active: boolean;
  sort_order: number; proveedor: string; insumo_pieza: number; stock_amazon: number;
};
type Oro = { proveedor: string; kilates: string; precio: number; mes: string };

export default async function ProductosPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const { ok } = await searchParams;
  const supabase = await createClient();
  const [prods, oro, cats] = await Promise.all([
    supabase.from("products").select("*").order("sort_order").order("name"),
    supabase.from("gold_prices").select("proveedor,kilates,precio,mes").order("mes", { ascending: false }),
    supabase.from("products").select("category"),
  ]);
  const rows = ((prods.data ?? []) as Producto[]).sort((a, b) => ordenSeccion(a.proveedor, a.kilates) - ordenSeccion(b.proveedor, b.kilates) || a.sort_order - b.sort_order);
  const precios = (oro.data ?? []) as Oro[];
  const ultimo = (p: string, k: string | null) => (k ? precios.find((x) => x.proveedor === p && x.kilates === k)?.precio : undefined);
  const proveedores = [...new Set([...ORDEN_PROVEEDOR, ...rows.map((r) => r.proveedor)])];
  const categorias = [...new Set((cats.data ?? []).map((c) => c.category).filter(Boolean))] as string[];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Catálogo</h1>
          <div className="muted">
            Lo que en tu Excel eran columnas fijas: gramaje, costo de piedra o de pieza, proveedor (a quién le compras el oro), insumo por pieza y stock en Amazon. El stock en bodega por talla se captura en <Link href="/bodega">Bodega</Link>. Guarda cada fila que cambies.
          </div>
        </div>
      </div>
      {ok && <p className="notice" style={{ background: "var(--calm-bg)", color: "var(--calm)", marginBottom: 14 }}>Producto guardado. Reporte y pedido recalculados.</p>}
      <datalist id="proveedores">{proveedores.map((p) => <option key={p} value={p} />)}</datalist>
      <datalist id="categorias">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
      <div className="card tight">
        <div className="tbl-wrap">
          <table className="compact editable">
            <thead>
              <tr>
                <th>Producto</th><th>Categoría</th><th>Proveedor</th><th>Kilates</th><th className="num">Gramos</th><th className="num">Costo fijo</th><th className="num">Costo hoy</th>
                <th className="num">Insumo/pza</th><th className="num">Stock Amazon</th><th>Activo</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const precio = ultimo(p.proveedor, p.kilates);
                const costo = (p.grams != null && precio ? Number(p.grams) * precio : 0) + Number(p.cost_fixed ?? 0);
                const formId = `f${p.id}`;
                return (
                  <tr key={p.id} className={p.active ? "" : "dim"}>
                    <td>
                      <form id={formId} action={actualizarProducto}><input type="hidden" name="id" value={p.id} /></form>
                      <b>{p.name}</b>
                    </td>
                    <td><input form={formId} name="category" list="categorias" defaultValue={p.category ?? ""} style={{ width: 150 }} /></td>
                    <td><input form={formId} name="proveedor" list="proveedores" defaultValue={p.proveedor} style={{ width: 110 }} /></td>
                    <td>
                      <select form={formId} name="kilates" defaultValue={p.kilates ?? ""}>
                        <option value="">—</option><option value="10k">10k</option><option value="14k">14k</option><option value="18k">18k</option>
                      </select>
                    </td>
                    <td className="num"><input form={formId} name="grams" type="number" step="0.01" min="0" defaultValue={p.grams ?? ""} style={{ width: 80 }} /></td>
                    <td className="num"><input form={formId} name="cost_fixed" type="number" step="1" min="0" defaultValue={p.cost_fixed ?? 0} style={{ width: 90 }} title="Diamante/piedra o costo de la pieza completa (plata)" /></td>
                    <td className={`num ${costo <= 0 && p.active ? "zero" : ""}`}>{costo > 0 ? mxn(costo) : "falta"}{p.grams != null && precio ? <div className="muted" style={{ fontSize: 11 }}>oro {num(precio)}/g</div> : null}</td>
                    <td className="num"><input form={formId} name="insumo_pieza" type="number" step="1" min="0" defaultValue={p.insumo_pieza} style={{ width: 70 }} /></td>
                    <td className="num"><input form={formId} name="stock_amazon" type="number" step="1" min="0" defaultValue={p.stock_amazon} style={{ width: 70 }} /></td>
                    <td><input form={formId} name="active" type="checkbox" defaultChecked={p.active} /></td>
                    <td><button form={formId} className="btn small" type="submit">Guardar</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 14 }}>
        Costo hoy = gramos × último precio del oro capturado para ese proveedor y kilataje + costo fijo. Los productos nuevos aparecen solos cuando una publicación de Mercado Libre se mapea a un producto; si falta alguno, avísame para agregar la regla.
      </p>
    </>
  );
}

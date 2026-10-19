-- Margen objetivo sobre costo (lo que te queda de Mercado Libre por pieza ÷ costo de la pieza) y
-- revisión por publicación: cuánto te deja hoy cada una y el precio mínimo para llegar al objetivo.
insert into public.settings (key, value) values ('margen_objetivo', '{"valor": 1.8}'::jsonb) on conflict (key) do nothing;

create or replace function public.margenes_publicaciones(p_dias integer default 60)
returns table(
  item_id text, titulo text, status text, reventa boolean, precio numeric, permalink text,
  product_id integer, producto text, costo numeric, insumo numeric,
  rev_piezas numeric, rev_neto_pz numeric, rev_neto_pz_reciente numeric, rev_min_pz numeric,
  dir_piezas numeric, dir_neto_pz numeric, dir_ratio numeric,
  margen_rev numeric, margen_dir numeric,
  min_reventa numeric, min_lista_directa numeric
)
language sql stable set search_path to 'public' as $$
  with obj as (select coalesce((select (value->>'valor')::numeric from public.settings where key = 'margen_objetivo'), 1.8) m),
  costo as (
    select p.id product_id, p.name, p.insumo_pieza, coalesce(p.grams, 0) * coalesce(gp.precio, 0) + coalesce(p.cost_fixed, 0) costo_u
    from public.products p left join lateral (select precio from public.gold_price_for(current_date, p.proveedor, p.kilates) limit 1) gp on true
  ),
  lin as (
    select oi.item_id, i.product_id, v.modo, v.fecha, oi.quantity, oi.quantity * oi.unit_price venta,
      v.neto_recibido * oi.quantity * oi.unit_price / nullif(v.venta, 0) neto
    from public.meli_order_items oi
    join public.v_ordenes v on v.order_id = oi.order_id
    join public.meli_items i on i.item_id = oi.item_id
    where v.status = 'paid' and v.modo in ('directa', 'reventa') and v.fecha >= current_date - p_dias
  ),
  por_item as (
    select item_id, modo, sum(quantity) pz, sum(neto) / nullif(sum(quantity), 0) neto_pz, sum(neto) / nullif(sum(venta), 0) ratio,
      min(neto / nullif(quantity, 0)) min_pz,
      sum(neto) filter (where fecha >= current_date - 21) / nullif(sum(quantity) filter (where fecha >= current_date - 21), 0) neto_pz_reciente
    from lin group by 1, 2
  ),
  por_prod as (
    select product_id, modo, sum(quantity) pz, sum(neto) / nullif(sum(quantity), 0) neto_pz, sum(neto) / nullif(sum(venta), 0) ratio,
      min(neto / nullif(quantity, 0)) min_pz,
      sum(neto) filter (where fecha >= current_date - 21) / nullif(sum(quantity) filter (where fecha >= current_date - 21), 0) neto_pz_reciente
    from lin group by 1, 2
  ),
  glob as (select coalesce((select sum(neto) / nullif(sum(venta), 0) from lin where modo = 'directa'), 0.72) ratio_dir)
  select i.item_id, i.title, i.status, (i.raw->'tags') ? 'resale_enabled' as reventa, i.price, i.permalink,
    c.product_id, c.name, round(c.costo_u), c.insumo_pieza,
    coalesce(ri.pz, rp.pz, 0), round(coalesce(ri.neto_pz, rp.neto_pz)), round(coalesce(ri.neto_pz_reciente, rp.neto_pz_reciente)), round(coalesce(ri.min_pz, rp.min_pz)),
    coalesce(di.pz, dp.pz, 0), round(coalesce(di.neto_pz, dp.neto_pz)), round(coalesce(di.ratio, dp.ratio, (select ratio_dir from glob)), 3),
    round(coalesce(ri.neto_pz, rp.neto_pz) / nullif(c.costo_u, 0), 2),
    round(i.price * coalesce(di.ratio, dp.ratio, (select ratio_dir from glob)) / nullif(c.costo_u, 0), 2),
    round((select m from obj) * c.costo_u),
    round((select m from obj) * c.costo_u / coalesce(di.ratio, dp.ratio, (select ratio_dir from glob)))
  from public.meli_items i
  left join costo c on c.product_id = i.product_id
  left join por_item ri on ri.item_id = i.item_id and ri.modo = 'reventa'
  left join por_prod rp on rp.product_id = i.product_id and rp.modo = 'reventa'
  left join por_item di on di.item_id = i.item_id and di.modo = 'directa'
  left join por_prod dp on dp.product_id = i.product_id and dp.modo = 'directa'
  where i.status in ('active', 'paused');
$$;

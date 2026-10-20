-- Regla de utilidad corregida: un producto que ya deja más de `utilidad_minima_pz` por pieza (1,100) cumple con un
-- margen reducido (`margen_reducido`, 1.4) en vez del objetivo general (1.8).
-- Mínimo que te debe quedar = min(objetivo × costo, max(reducido × costo, costo + utilidad_minima)).
update public.settings set value = '{"valor": 1100}'::jsonb, updated_at = now() where key = 'utilidad_minima_pz';
insert into public.settings (key, value) values ('margen_reducido', '{"valor": 1.4}'::jsonb) on conflict (key) do nothing;

create or replace function public.margenes_productos(p_dias integer default 60)
returns table(
  product_id integer, producto text, liquidacion boolean, colores text, objetivo numeric,
  costo numeric, insumo numeric,
  publicaciones bigint, en_reventa bigint, items text[], precio_min numeric, precio_max numeric,
  rev_piezas numeric, rev_neto_pz numeric, rev_neto_pz_reciente numeric, rev_min_pz numeric,
  dir_piezas numeric, dir_neto_pz numeric, dir_ratio numeric,
  margen_rev numeric, margen_dir numeric, utilidad_pz numeric, cumple boolean, min_reventa numeric, min_lista_directa numeric
)
language sql stable set search_path to 'public' as $$
  with obj as (
    select coalesce((select (value->>'valor')::numeric from public.settings where key = 'margen_objetivo'), 1.8) general,
           coalesce((select (value->>'valor')::numeric from public.settings where key = 'margen_liquidacion'), 1.15) liq,
           coalesce((select (value->>'valor')::numeric from public.settings where key = 'margen_reducido'), 1.4) reducido,
           coalesce((select (value->>'valor')::numeric from public.settings where key = 'utilidad_minima_pz'), 1100) util_min
  ),
  -- mínimo que te debe quedar por pieza: objetivo × costo; si la utilidad pasa de util_min basta con reducido × costo (no aplica en liquidación)
  minimo as (
    select c.product_id, g.liquidacion,
      case when g.liquidacion then (select liq from obj) * c.costo_u
           else least((select general from obj) * c.costo_u, greatest((select reducido from obj) * c.costo_u, c.costo_u + (select util_min from obj))) end min_neto
    from (select product_id, costo_u from (
      select p.id product_id, coalesce(p.grams, 0) * coalesce(gp.precio, 0) + coalesce(p.cost_fixed, 0) costo_u
      from public.products p left join lateral (select precio from public.gold_price_for(current_date, p.proveedor, p.kilates) limit 1) gp on true) x) c
    cross join (values (false), (true)) g(liquidacion)
  ),
  costo as (
    select p.id product_id, p.name, p.insumo_pieza, coalesce(p.grams, 0) * coalesce(gp.precio, 0) + coalesce(p.cost_fixed, 0) costo_u
    from public.products p left join lateral (select precio from public.gold_price_for(current_date, p.proveedor, p.kilates) limit 1) gp on true
  ),
  reglas as (select product_id, color from public.liquidaciones),
  grupos as (
    select c.product_id, false liquidacion from costo c
    union
    select r.product_id, true from reglas r
  ),
  lin as (
    select vv.item_id, vv.product_id, vv.color, o.modo, o.fecha, vv.quantity, vv.venta,
      o.neto_recibido * vv.venta / nullif(o.venta, 0) neto,
      exists (select 1 from reglas r where r.product_id = vv.product_id and (r.color is null or r.color = vv.color)) liq
    from public.v_ventas vv
    join public.v_ordenes o on o.order_id = vv.order_id
    where vv.status = 'paid' and o.modo in ('directa', 'reventa') and vv.fecha >= current_date - p_dias and vv.product_id is not null
  ),
  agg as (
    select l.product_id, g.liquidacion, l.modo,
      sum(l.quantity) pz, sum(l.neto) / nullif(sum(l.quantity), 0) neto_pz, sum(l.neto) / nullif(sum(l.venta), 0) ratio,
      min(l.neto / nullif(l.quantity, 0)) min_pz,
      sum(l.neto) filter (where l.fecha >= current_date - 21) / nullif(sum(l.quantity) filter (where l.fecha >= current_date - 21), 0) neto_pz_reciente
    from lin l join grupos g on g.product_id = l.product_id
    where (g.liquidacion and l.liq) or (not g.liquidacion and not l.liq)
    group by 1, 2, 3
  ),
  pubs as (
    select i.product_id, count(*) n, count(*) filter (where (i.raw->'tags') ? 'resale_enabled') rev, array_agg(i.item_id order by i.price) items, min(i.price) pmin, max(i.price) pmax
    from public.meli_items i where i.status in ('active', 'paused') group by 1
  ),
  glob as (select coalesce((select sum(neto) / nullif(sum(venta), 0) from lin where modo = 'directa'), 0.72) ratio_dir)
  select g.product_id, c.name, g.liquidacion,
    case when g.liquidacion then (select string_agg(coalesce(r.color, 'todo el producto'), ', ') from reglas r where r.product_id = g.product_id) end,
    case when g.liquidacion then (select liq from obj) else (select general from obj) end,
    round(c.costo_u), c.insumo_pieza,
    coalesce(pb.n, 0), coalesce(pb.rev, 0), pb.items, pb.pmin, pb.pmax,
    coalesce(r.pz, 0), round(r.neto_pz), round(r.neto_pz_reciente), round(r.min_pz),
    coalesce(d.pz, 0), round(d.neto_pz), round(coalesce(d.ratio, (select ratio_dir from glob)), 3),
    round(r.neto_pz / nullif(c.costo_u, 0), 2),
    round(pb.pmin * coalesce(d.ratio, (select ratio_dir from glob)) / nullif(c.costo_u, 0), 2),
    round(r.neto_pz - c.costo_u),
    case when r.neto_pz is null then null else r.neto_pz >= mn.min_neto end,
    round(mn.min_neto),
    round(mn.min_neto / coalesce(d.ratio, (select ratio_dir from glob)))
  from grupos g
  join costo c on c.product_id = g.product_id
  join minimo mn on mn.product_id = g.product_id and mn.liquidacion = g.liquidacion
  left join pubs pb on pb.product_id = g.product_id
  left join agg r on r.product_id = g.product_id and r.liquidacion = g.liquidacion and r.modo = 'reventa'
  left join agg d on d.product_id = g.product_id and d.liquidacion = g.liquidacion and d.modo = 'directa'
  where pb.n > 0 or g.liquidacion;
$$;

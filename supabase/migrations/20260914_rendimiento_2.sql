-- Rendimiento, segunda pasada.
--  * Las tablas nuevas (videos, envíos a Full, colectas) volvieron a crear políticas RLS con is_allowed() por fila.
--  * La fecha CDMX de cada orden y los cargos de cada pago (IVA, ISR, comisión, envío, cupón) se guardan como
--    columnas generadas: se calculan una vez al sincronizar, no en cada consulta (antes se re-analizaba el JSON
--    de cargos de los ~4,100 pagos en cada reporte).
--  * reporte_mensual filtraba por fecha las líneas pero no las órdenes: calculaba los cargos de TODAS las órdenes
--    históricas en cada mes consultado.
--  * pending_payments (cron horario) expandía el JSON crudo de las 5,000 órdenes en cada corrida.
--  * RPCs que devuelven varios meses en una sola llamada para la página "Qué pedir".

-- 1. RLS: evaluar is_allowed() una sola vez por consulta (repetible: solo toca políticas por fila).
do $$
declare r record;
begin
  for r in
    select tablename, policyname, cmd, roles
    from pg_policies
    where schemaname = 'public' and (qual = 'is_allowed()' or with_check = 'is_allowed()')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    execute format(
      'create policy %I on public.%I for %s to %s %s %s',
      r.policyname, r.tablename, r.cmd, array_to_string(r.roles, ', '),
      case when r.cmd <> 'INSERT' then 'using ((select public.is_allowed()))' else '' end,
      case when r.cmd in ('ALL', 'INSERT', 'UPDATE') then 'with check ((select public.is_allowed()))' else '' end
    );
  end loop;
end $$;

-- 2. Fecha CDMX de la orden como columna generada (la sincronización no la envía; Postgres la calcula).
alter table public.meli_orders
  add column if not exists fecha date generated always as ((date_created at time zone 'America/Mexico_City')::date) stored;
create index if not exists meli_orders_fecha_idx on public.meli_orders (fecha);
drop index if exists public.meli_orders_fecha_cdmx_idx;

-- 3. Cargos de cada pago como columnas generadas (charge_sum es inmutable).
alter table public.meli_payments
  add column if not exists ret_iva numeric generated always as (public.charge_sum(charges, '^tax_withholding-iva')) stored,
  add column if not exists ret_isr numeric generated always as (public.charge_sum(charges, '^tax_withholding-isr')) stored,
  add column if not exists fee_meli numeric generated always as (public.charge_sum(charges, '^meli_fee')) stored,
  add column if not exists fee_mp numeric generated always as (public.charge_sum(charges, '^mercadopago_fee')) stored,
  add column if not exists fee_envio numeric generated always as (public.charge_sum(charges, '^shp_')) stored,
  add column if not exists cupon numeric generated always as (public.charge_sum(charges, '^coupon_fee')) stored;

create or replace view public.v_pagos as
select p.payment_id, p.order_id, p.status, p.date_approved, p.transaction_amount, p.net_received_amount,
  p.ret_iva, p.ret_isr, p.fee_meli, p.fee_mp, p.fee_envio, p.cupon,
  jsonb_array_length(p.charges) > 0 as con_cargos,
  p.charges
from public.meli_payments p;

-- 4. Vistas usando la fecha precalculada.
create or replace view public.v_ventas as
select oi.order_id, o.pack_id, o.date_created, o.fecha, o.status, o.shipping_id, o.buyer_nickname,
  oi.item_id, oi.variation_id, oi.title, oi.quantity, oi.unit_price, oi.sale_fee,
  oi.quantity::numeric * oi.unit_price as venta,
  oi.quantity::numeric * coalesce(oi.sale_fee, 0::numeric) as comision,
  v.id as variant_id, v.color, v.talla,
  p.id as product_id, p.name as producto, p.category as categoria,
  i.logistic_type
from public.meli_order_items oi
join public.meli_orders o on o.order_id = oi.order_id
left join public.variants v on v.id = oi.variant_id
left join public.products p on p.id = v.product_id
left join public.meli_items i on i.item_id = oi.item_id;

create or replace view public.v_ordenes as
with base as (
  select o.order_id, o.pack_id, o.date_created, o.status, o.shipping_id, o.buyer_nickname, o.total_amount, o.paid_amount,
    o.fecha,
    it.piezas, it.venta, it.sale_fee,
    pg.ret_iva as pg_iva, pg.ret_isr as pg_isr, pg.cupon as pg_cupon, pg.neto_recibido as pg_neto,
    pg.fee_meli, pg.fee_envio, pg.con_cargos,
    s.logistic_type, s.status as envio_status,
    case when s.seller_cost is null then null::numeric
         else s.seller_cost / (select count(*) from public.meli_orders o2 where o2.shipping_id = o.shipping_id)::numeric end as envio_ship,
    case when pg.neto_recibido is null then 'sin_pago'
         when pg.con_cargos then 'directa'
         when it.sale_fee is null then 'reventa'
         else 'directa_estimada' end as modo
  from public.meli_orders o
  left join public.meli_shipments s on s.shipment_id = o.shipping_id
  left join lateral (
    select sum(oi.quantity) as piezas, sum(oi.quantity::numeric * oi.unit_price) as venta, sum(oi.quantity::numeric * oi.sale_fee) as sale_fee
    from public.meli_order_items oi where oi.order_id = o.order_id
  ) it on true
  left join lateral (
    select sum(vp.ret_iva) as ret_iva, sum(vp.ret_isr) as ret_isr, sum(vp.cupon) as cupon, sum(vp.net_received_amount) as neto_recibido,
      sum(vp.fee_meli) as fee_meli, sum(vp.fee_envio) as fee_envio, bool_and(vp.con_cargos) as con_cargos
    from public.v_pagos vp where vp.order_id = o.order_id and vp.status = 'approved'
  ) pg on true
),
calc as (
  select b.*,
    case when b.modo = 'directa' then b.fee_meli when b.modo = 'reventa' then 0::numeric else coalesce(b.sale_fee, 0::numeric) end as comision,
    case when b.modo = 'directa' then b.fee_envio when b.modo = 'reventa' then 0::numeric else b.envio_ship end as envio,
    case when b.modo = 'directa' then coalesce(b.pg_iva, 0::numeric) when b.modo = 'reventa' then 0::numeric else round(coalesce(b.venta, 0::numeric) * 8::numeric / 116::numeric, 2) end as ret_iva,
    case when b.modo = 'directa' then coalesce(b.pg_isr, 0::numeric) when b.modo = 'reventa' then 0::numeric else round(coalesce(b.venta, 0::numeric) * 2.5 / 116::numeric, 2) end as ret_isr,
    case when b.modo = 'directa' then coalesce(b.pg_cupon, 0::numeric) else 0::numeric end as cupon
  from base b
)
select order_id, pack_id, date_created, fecha, status, shipping_id, buyer_nickname, total_amount, paid_amount,
  piezas, venta, comision, envio, ret_iva, ret_isr, cupon,
  case when modo = 'directa' then pg_neto when modo = 'reventa' then pg_neto
       else venta - coalesce(comision, 0::numeric) - coalesce(envio, 0::numeric) - ret_iva - ret_isr end as neto_recibido,
  coalesce(con_cargos, false) as con_cargos,
  logistic_type, envio_status, modo,
  modo = any (array['sin_pago', 'directa_estimada']) as estimado
from calc c;

-- 5. reporte_mensual: el join con v_ordenes también filtra por fecha (misma fecha que la línea), así solo se
--    calculan los cargos de las órdenes del mes. Resto idéntico.
create or replace function public.reporte_mensual(p_mes date)
returns table(
  product_id integer, producto text, categoria text, proveedor text, kilates text, grams numeric, cost_fixed numeric, insumo_pieza numeric,
  activo boolean, sort_order integer,
  precio_oro numeric, precio_oro_mes date,
  piezas numeric, ordenes bigint, venta numeric, comision numeric, envio numeric, ret_iva numeric, ret_isr numeric, cupon numeric,
  recibido numeric, ordenes_sin_pago bigint, dias_con_venta bigint,
  stock_full integer, stock_transito integer, stock_casa integer, stock_amazon integer, variantes_activas bigint, agotadas bigint,
  dias_snapshot bigint, pct_dias_agotado numeric,
  piezas_reventa numeric, venta_reventa numeric, ordenes_estimadas bigint
)
language sql stable set search_path to 'public' as $$
  with lim as (
    select date_trunc('month', p_mes)::date as d1, (date_trunc('month', p_mes) + interval '1 month - 1 day')::date as d2
  ),
  lineas as (
    select v.product_id, v.quantity, v.venta, v.fecha, v.order_id,
      case when coalesce(o.venta, 0) > 0 then v.venta / o.venta else 1 end as parte,
      o.comision, o.envio, o.ret_iva, o.ret_isr, o.cupon, o.neto_recibido, o.modo, o.estimado
    from lim
    join public.v_ventas v on v.fecha between lim.d1 and lim.d2
    join public.v_ordenes o on o.order_id = v.order_id and o.fecha between lim.d1 and lim.d2
    where v.status = 'paid' and v.product_id is not null
  ),
  ven as (
    select l.product_id,
      sum(l.quantity) as piezas, count(distinct l.order_id) as ordenes, sum(l.venta) as venta,
      sum(coalesce(l.comision, 0) * l.parte) as comision,
      sum(coalesce(l.envio, 0) * l.parte) as envio, sum(l.ret_iva * l.parte) as ret_iva, sum(l.ret_isr * l.parte) as ret_isr, sum(l.cupon * l.parte) as cupon,
      sum(coalesce(l.neto_recibido, 0) * l.parte) as recibido,
      count(distinct l.order_id) filter (where l.estimado) as ordenes_sin_pago,
      count(distinct l.fecha) as dias_con_venta,
      sum(l.quantity) filter (where l.modo = 'reventa') as piezas_reventa,
      sum(l.venta) filter (where l.modo = 'reventa') as venta_reventa
    from lineas l group by l.product_id
  ),
  stk as (
    select s.product_id, sum(s.available)::int as stock_full, sum(s.in_transit)::int as stock_transito,
      count(*) filter (where s.item_status = 'active') as variantes_activas,
      count(*) filter (where s.item_status = 'active' and s.available = 0) as agotadas
    from public.stock_full_actual() s where s.product_id is not null group by s.product_id
  ),
  bod as (
    select va.product_id, sum(b.casa)::int as casa
    from public.stock_bodega b join public.variants va on va.id = b.variant_id group by va.product_id
  ),
  snap as (
    select coalesce(mv.variant_id, mi.variant_id) as variant_id, va.product_id, ms.snapshot_date, ms.available
    from public.meli_stock_snapshots ms
    cross join lim
    left join public.meli_variations mv on mv.inventory_id = ms.inventory_id
    left join public.meli_items mi on mi.item_id = ms.item_id
    left join public.variants va on va.id = coalesce(mv.variant_id, mi.variant_id)
    where ms.snapshot_date between lim.d1 and lim.d2
  ),
  snapp as (
    select product_id, count(distinct snapshot_date) as dias_snapshot,
      round(100.0 * count(*) filter (where available = 0) / nullif(count(*), 0), 1) as pct_dias_agotado
    from snap where product_id is not null group by product_id
  )
  select p.id, p.name, p.category, p.proveedor, p.kilates, p.grams, p.cost_fixed, p.insumo_pieza, p.active, p.sort_order,
    gp.precio, gp.mes_origen,
    coalesce(v.piezas, 0), coalesce(v.ordenes, 0), coalesce(v.venta, 0), coalesce(v.comision, 0), coalesce(v.envio, 0),
    coalesce(v.ret_iva, 0), coalesce(v.ret_isr, 0), coalesce(v.cupon, 0), coalesce(v.recibido, 0), coalesce(v.ordenes_sin_pago, 0), coalesce(v.dias_con_venta, 0),
    coalesce(s.stock_full, 0), coalesce(s.stock_transito, 0), coalesce(b.casa, 0), p.stock_amazon, coalesce(s.variantes_activas, 0), coalesce(s.agotadas, 0),
    coalesce(sn.dias_snapshot, 0), sn.pct_dias_agotado,
    coalesce(v.piezas_reventa, 0), coalesce(v.venta_reventa, 0), coalesce(v.ordenes_sin_pago, 0)
  from public.products p
  left join ven v on v.product_id = p.id
  left join stk s on s.product_id = p.id
  left join bod b on b.product_id = p.id
  left join snapp sn on sn.product_id = p.id
  left join lateral (
    select * from public.gold_price_for(date_trunc('month', p_mes)::date, p.proveedor, p.kilates) where p.kilates is not null and p.grams is not null
  ) gp on true
  where p.active or coalesce(v.piezas, 0) > 0
  order by p.proveedor, p.kilates, p.sort_order, p.name;
$$;

-- 6. Varios meses en una sola llamada (página "Qué pedir": antes 4-7 llamadas a reporte_mensual y otras tantas a publicidad_mes).
create or replace function public.reporte_mensual_varios(p_meses date[])
returns table(
  mes date,
  product_id integer, producto text, categoria text, proveedor text, kilates text, grams numeric, cost_fixed numeric, insumo_pieza numeric,
  activo boolean, sort_order integer,
  precio_oro numeric, precio_oro_mes date,
  piezas numeric, ordenes bigint, venta numeric, comision numeric, envio numeric, ret_iva numeric, ret_isr numeric, cupon numeric,
  recibido numeric, ordenes_sin_pago bigint, dias_con_venta bigint,
  stock_full integer, stock_transito integer, stock_casa integer, stock_amazon integer, variantes_activas bigint, agotadas bigint,
  dias_snapshot bigint, pct_dias_agotado numeric,
  piezas_reventa numeric, venta_reventa numeric, ordenes_estimadas bigint
)
language sql stable set search_path to 'public' as $$
  select m.mes, r.* from unnest(p_meses) as m(mes) cross join lateral public.reporte_mensual(m.mes) r;
$$;

create or replace function public.publicidad_meses(p_meses date[])
returns table(mes date, product_id integer, cost numeric, clicks bigint, prints bigint, units bigint, total_amount numeric, dias bigint)
language sql stable set search_path to 'public' as $$
  select m.mes, r.* from unnest(p_meses) as m(mes) cross join lateral public.publicidad_mes(m.mes) r;
$$;

-- 7. pending_payments sin expandir el JSON crudo en cada corrida: ids de pagos aprobados como columna generada.
create or replace function public.payment_ids_aprobados(p_raw jsonb)
returns bigint[] language sql immutable set search_path to 'public' as $$
  select coalesce(array_agg((p->>'id')::bigint), '{}'::bigint[])
  from jsonb_array_elements(coalesce(p_raw->'payments', '[]'::jsonb)) p
  where p->>'status' = 'approved' and (p->>'id') ~ '^[0-9]+$';
$$;

alter table public.meli_orders
  add column if not exists payment_ids bigint[] generated always as (public.payment_ids_aprobados(raw)) stored;

create or replace function public.pending_payments(p_limit integer default 300)
returns table(order_id bigint, payment_id bigint)
language sql security definer set search_path to 'public' as $$
  select o.order_id, pid as payment_id
  from public.meli_orders o
  cross join lateral unnest(o.payment_ids) as pid
  left join public.meli_payments mp on mp.payment_id = pid
  where o.status in ('paid', 'partially_refunded')
    and (
      mp.payment_id is null
      or (mp.charges = '[]'::jsonb and o.date_created > now() - interval '7 days' and mp.synced_at < now() - interval '3 hours')
    )
  order by o.date_created desc
  limit p_limit;
$$;

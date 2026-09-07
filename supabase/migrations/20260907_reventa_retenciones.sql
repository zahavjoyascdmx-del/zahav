-- Modo de venta (directa vs reventa), comisión y retenciones estimadas cuando el pago aún no trae cargos reales.
-- Reventa: Mercado Libre no cobra comisión ni retiene IVA/ISR; el pago llega completo (a precio con descuento).
-- Retenciones reales: IVA 8% e ISR 2.5% sobre el precio sin IVA = 8/116 y 2.5/116 de la venta.

create or replace view public.v_ordenes as
with it as (
  select oi.order_id, sum(oi.quantity) as piezas, sum(oi.quantity::numeric * oi.unit_price) as venta,
    sum(oi.quantity::numeric * oi.sale_fee) as sale_fee  -- null si ML no reporta comisión (reventa)
  from public.meli_order_items oi group by oi.order_id
),
pg as (
  select vp.order_id, sum(vp.ret_iva) ret_iva, sum(vp.ret_isr) ret_isr, sum(vp.cupon) cupon, sum(vp.net_received_amount) neto_recibido,
    sum(vp.fee_meli) fee_meli, sum(vp.fee_envio) fee_envio, bool_and(vp.con_cargos) con_cargos
  from public.v_pagos vp where vp.status = 'approved' group by vp.order_id
),
base as (
  select o.*, (o.date_created at time zone 'America/Mexico_City')::date as fecha,
    it.piezas, it.venta, it.sale_fee,
    pg.ret_iva pg_iva, pg.ret_isr pg_isr, pg.cupon pg_cupon, pg.neto_recibido pg_neto, pg.fee_meli, pg.fee_envio, pg.con_cargos,
    s.logistic_type, s.status as envio_status,
    case when s.seller_cost is null then null else s.seller_cost / (count(*) over (partition by o.shipping_id))::numeric end as envio_ship,
    case
      when pg.neto_recibido is null then 'sin_pago'
      when pg.con_cargos then 'directa'
      when it.sale_fee is null then 'reventa'
      else 'directa_estimada'
    end as modo
  from public.meli_orders o
  left join it on it.order_id = o.order_id
  left join pg on pg.order_id = o.order_id
  left join public.meli_shipments s on s.shipment_id = o.shipping_id
),
calc as (
  select b.*,
    case when b.modo = 'directa' then b.fee_meli when b.modo = 'reventa' then 0 else coalesce(b.sale_fee, 0) end as comision,
    case when b.modo = 'directa' then b.fee_envio when b.modo = 'reventa' then 0 else b.envio_ship end as envio,
    case when b.modo = 'directa' then coalesce(b.pg_iva, 0) when b.modo = 'reventa' then 0 else round(coalesce(b.venta, 0) * 8 / 116, 2) end as ret_iva,
    case when b.modo = 'directa' then coalesce(b.pg_isr, 0) when b.modo = 'reventa' then 0 else round(coalesce(b.venta, 0) * 2.5 / 116, 2) end as ret_isr,
    case when b.modo = 'directa' then coalesce(b.pg_cupon, 0) else 0 end as cupon
  from base b
)
select c.order_id, c.pack_id, c.date_created, c.fecha, c.status, c.shipping_id, c.buyer_nickname, c.total_amount, c.paid_amount,
  c.piezas, c.venta, c.comision, c.envio, c.ret_iva, c.ret_isr, c.cupon,
  case
    when c.modo = 'directa' then c.pg_neto
    when c.modo = 'reventa' then c.pg_neto
    else c.venta - coalesce(c.comision, 0) - coalesce(c.envio, 0) - c.ret_iva - c.ret_isr
  end as neto_recibido,
  coalesce(c.con_cargos, false) as con_cargos,
  c.logistic_type, c.envio_status,
  c.modo,
  c.modo in ('sin_pago', 'directa_estimada') as estimado
from calc c;

drop function if exists public.ventas_resumen(date, date);
create function public.ventas_resumen(p_desde date, p_hasta date)
returns table(ordenes bigint, piezas numeric, venta numeric, comision numeric, envio numeric, canceladas bigint, ret_iva numeric, ret_isr numeric, cupon numeric, neto_recibido numeric, con_pago bigint,
  reventa_ordenes bigint, reventa_piezas numeric, reventa_venta numeric, estimadas bigint)
language sql stable set search_path to 'public' as $$
  select
    count(*) filter (where status = 'paid'),
    coalesce(sum(piezas) filter (where status = 'paid'), 0),
    coalesce(sum(venta) filter (where status = 'paid'), 0),
    coalesce(sum(comision) filter (where status = 'paid'), 0),
    coalesce(sum(envio) filter (where status = 'paid'), 0),
    count(*) filter (where status = 'cancelled'),
    coalesce(sum(ret_iva) filter (where status = 'paid'), 0),
    coalesce(sum(ret_isr) filter (where status = 'paid'), 0),
    coalesce(sum(cupon) filter (where status = 'paid'), 0),
    coalesce(sum(neto_recibido) filter (where status = 'paid'), 0),
    count(*) filter (where status = 'paid' and modo in ('directa', 'reventa')),
    count(*) filter (where status = 'paid' and modo = 'reventa'),
    coalesce(sum(piezas) filter (where status = 'paid' and modo = 'reventa'), 0),
    coalesce(sum(venta) filter (where status = 'paid' and modo = 'reventa'), 0),
    count(*) filter (where status = 'paid' and estimado)
  from public.v_ordenes where fecha between p_desde and p_hasta;
$$;

drop function if exists public.reporte_mensual(date);
create function public.reporte_mensual(p_mes date)
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
    from public.v_ventas v
    join public.v_ordenes o on o.order_id = v.order_id
    cross join lim
    where v.status = 'paid' and v.fecha between lim.d1 and lim.d2 and v.product_id is not null
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

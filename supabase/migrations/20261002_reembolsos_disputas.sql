-- Reembolsos y disputas: Mercado Pago puede devolver el dinero de una venta (reclamo, devolución) o retenerlo
-- en mediación aunque la orden siga "paid" en Mercado Libre. Antes la app no volvía a consultar esos pagos y
-- seguía contando la venta como cobrada. Ahora:
--   * los pagos de órdenes pagadas se vuelven a consultar a diario durante 45 días (y mientras estén en disputa),
--   * un pago reembolsado vale 0 y la orden pasa a estado 'refunded' (sale de ventas, se cuenta como devuelta),
--   * un reembolso parcial descuenta la parte proporcional,
--   * una orden en mediación sigue contando pero se marca en_disputa.

create or replace view public.v_pagos as
select payment_id, order_id, status, date_approved, transaction_amount, net_received_amount, ret_iva, ret_isr, fee_meli, fee_mp, fee_envio, cupon,
  jsonb_array_length(charges) > 0 as con_cargos, charges,
  coalesce((raw->>'transaction_amount_refunded')::numeric, 0) as reembolsado,
  status = 'in_mediation' as en_disputa,
  case
    when status in ('refunded', 'charged_back', 'cancelled', 'rejected') then 0
    when coalesce((raw->>'transaction_amount_refunded')::numeric, 0) > 0 and coalesce(transaction_amount, 0) > 0
      then greatest(0, coalesce(net_received_amount, 0) * (1 - (raw->>'transaction_amount_refunded')::numeric / transaction_amount))
    else net_received_amount
  end as neto_efectivo
from public.meli_payments p;

create or replace view public.v_ordenes as
with it as (
  select oi.order_id, sum(oi.quantity) as piezas, sum(oi.quantity::numeric * oi.unit_price) as venta,
    sum(oi.quantity::numeric * oi.sale_fee) as sale_fee
  from public.meli_order_items oi group by oi.order_id
),
pg as (
  select vp.order_id, sum(vp.ret_iva) ret_iva, sum(vp.ret_isr) ret_isr, sum(vp.cupon) cupon,
    sum(vp.neto_efectivo) neto_recibido, sum(vp.reembolsado) reembolsado, bool_or(vp.en_disputa) en_disputa,
    sum(vp.fee_meli) fee_meli, sum(vp.fee_envio) fee_envio, bool_and(vp.con_cargos) con_cargos
  from public.v_pagos vp where vp.status in ('approved', 'in_mediation', 'refunded', 'charged_back') group by vp.order_id
),
base as (
  select o.*, (o.date_created at time zone 'America/Mexico_City')::date as fecha_calc,
    case when o.status = 'paid' and coalesce(pg.reembolsado, 0) > 0 and coalesce(pg.neto_recibido, 0) <= 0.01 then 'refunded' else o.status end as status_calc,
    it.piezas, it.venta, it.sale_fee,
    pg.ret_iva pg_iva, pg.ret_isr pg_isr, pg.cupon pg_cupon, pg.neto_recibido pg_neto, pg.fee_meli, pg.fee_envio, pg.con_cargos,
    coalesce(pg.reembolsado, 0) as reembolsado, coalesce(pg.en_disputa, false) as en_disputa,
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
select c.order_id, c.pack_id, c.date_created, c.fecha_calc as fecha, c.status_calc as status, c.shipping_id, c.buyer_nickname, c.total_amount, c.paid_amount,
  c.piezas, c.venta, c.comision, c.envio, c.ret_iva, c.ret_isr, c.cupon,
  case
    when c.modo in ('directa', 'reventa') then c.pg_neto
    else c.venta - coalesce(c.comision, 0) - coalesce(c.envio, 0) - c.ret_iva - c.ret_isr
  end as neto_recibido,
  coalesce(c.con_cargos, false) as con_cargos,
  c.logistic_type, c.envio_status,
  c.modo,
  c.modo in ('sin_pago', 'directa_estimada') as estimado,
  c.en_disputa,
  c.reembolsado
from calc c;

-- Volver a consultar pagos: órdenes pagadas durante 45 días (una vez al día), en disputa siempre, canceladas 60 días.
create or replace function public.pending_payments(p_limit integer default 300)
returns table(order_id bigint, payment_id bigint)
language sql security definer set search_path to 'public' as $$
  select x.order_id, x.payment_id from (
    -- pagos nuevos (ids que trae la orden y aún no están guardados) o recién creados sin cargos
    select o.order_id, pid as payment_id, o.date_created
    from public.meli_orders o
    cross join lateral unnest(o.payment_ids) as pid
    left join public.meli_payments mp on mp.payment_id = pid
    where o.status in ('paid', 'partially_refunded')
      and (mp.payment_id is null
        or (mp.charges = '[]'::jsonb and o.date_created > now() - interval '7 days' and mp.synced_at < now() - interval '3 hours'))
    union
    -- pagos ya guardados de órdenes pagadas: se revisan a diario 45 días (reembolsos, disputas), y siempre mientras estén en disputa
    select o.order_id, mp.payment_id, o.date_created
    from public.meli_orders o
    join public.meli_payments mp on mp.order_id = o.order_id
    where o.status in ('paid', 'partially_refunded')
      and ((mp.status in ('approved', 'pending', 'authorized') and o.date_created > now() - interval '45 days' and mp.synced_at < now() - interval '24 hours')
        or (mp.status = 'in_mediation' and mp.synced_at < now() - interval '24 hours'))
    union
    -- canceladas: la orden ya no trae payment_ids, se toman de los pagos guardados
    select o.order_id, mp.payment_id, o.date_created
    from public.meli_orders o
    join public.meli_payments mp on mp.order_id = o.order_id
    where o.status = 'cancelled' and mp.status = 'approved'
      and o.date_created > now() - interval '60 days' and mp.synced_at < now() - interval '12 hours'
  ) x
  order by x.date_created desc
  limit p_limit;
$$;

-- Resúmenes: canceladas incluye devueltas; se agregan devueltas y disputas.
-- Nota: DROP FUNCTION se quedaba colgado en el proyecto (event triggers de sql_drop); se renombra la versión anterior.
alter function public.ventas_resumen(date, date) rename to ventas_resumen_v1;
create function public.ventas_resumen(p_desde date, p_hasta date)
returns table(ordenes bigint, piezas numeric, venta numeric, comision numeric, envio numeric, canceladas bigint, ret_iva numeric, ret_isr numeric, cupon numeric, neto_recibido numeric, con_pago bigint,
  reventa_ordenes bigint, reventa_piezas numeric, reventa_venta numeric, estimadas bigint, devueltas bigint, devueltas_monto numeric, en_disputa bigint, disputa_monto numeric)
language sql stable set search_path to 'public' as $$
  select
    count(*) filter (where status = 'paid'),
    coalesce(sum(piezas) filter (where status = 'paid'), 0),
    coalesce(sum(venta) filter (where status = 'paid'), 0),
    coalesce(sum(comision) filter (where status = 'paid'), 0),
    coalesce(sum(envio) filter (where status = 'paid'), 0),
    count(*) filter (where status in ('cancelled', 'refunded')),
    coalesce(sum(ret_iva) filter (where status = 'paid'), 0),
    coalesce(sum(ret_isr) filter (where status = 'paid'), 0),
    coalesce(sum(cupon) filter (where status = 'paid'), 0),
    coalesce(sum(neto_recibido) filter (where status = 'paid'), 0),
    count(*) filter (where status = 'paid' and modo in ('directa', 'reventa')),
    count(*) filter (where status = 'paid' and modo = 'reventa'),
    coalesce(sum(piezas) filter (where status = 'paid' and modo = 'reventa'), 0),
    coalesce(sum(venta) filter (where status = 'paid' and modo = 'reventa'), 0),
    count(*) filter (where status = 'paid' and estimado),
    count(*) filter (where status = 'refunded'),
    coalesce(sum(reembolsado) filter (where status = 'refunded'), 0),
    count(*) filter (where status = 'paid' and en_disputa),
    coalesce(sum(neto_recibido) filter (where status = 'paid' and en_disputa), 0)
  from public.v_ordenes where fecha between p_desde and p_hasta;
$$;

alter function public.reporte_por_mes(integer) rename to reporte_por_mes_v1;
alter function public.ventas_por_mes(integer) rename to ventas_por_mes_v1;
create function public.ventas_por_mes(p_meses integer default 12)
returns table(mes date, ordenes bigint, piezas numeric, venta numeric, comision numeric, envio numeric, ret_iva numeric, ret_isr numeric, cupon numeric, neto_recibido numeric, canceladas bigint, devueltas bigint, en_disputa bigint, disputa_monto numeric)
language sql stable set search_path to 'public' as $$
  select date_trunc('month', fecha)::date as mes,
    count(*) filter (where status = 'paid'),
    coalesce(sum(piezas) filter (where status = 'paid'), 0),
    coalesce(sum(venta) filter (where status = 'paid'), 0),
    coalesce(sum(comision) filter (where status = 'paid'), 0),
    coalesce(sum(envio) filter (where status = 'paid'), 0),
    coalesce(sum(ret_iva) filter (where status = 'paid'), 0),
    coalesce(sum(ret_isr) filter (where status = 'paid'), 0),
    coalesce(sum(cupon) filter (where status = 'paid'), 0),
    coalesce(sum(neto_recibido) filter (where status = 'paid'), 0),
    count(*) filter (where status in ('cancelled', 'refunded')),
    count(*) filter (where status = 'refunded'),
    count(*) filter (where status = 'paid' and en_disputa),
    coalesce(sum(neto_recibido) filter (where status = 'paid' and en_disputa), 0)
  from public.v_ordenes
  where fecha >= (date_trunc('month', (now() at time zone 'America/Mexico_City')::date) - make_interval(months => p_meses - 1))::date
  group by 1 order by 1 desc;
$$;

create function public.reporte_por_mes(p_meses integer default 13)
returns table(mes date, ordenes bigint, piezas numeric, venta numeric, comision numeric, envio numeric, ret_iva numeric, ret_isr numeric, cupon numeric, neto_recibido numeric, material numeric, insumos numeric, sin_costo bigint, utilidad numeric, canceladas bigint, directas_n bigint, directas numeric, directas_cobrado numeric, devueltas bigint, en_disputa bigint, disputa_monto numeric)
language sql stable set search_path to 'public' as $$
  with desde as (select (date_trunc('month', (now() at time zone 'America/Mexico_City')::date) - make_interval(months => p_meses - 1))::date d),
  lineas as (
    select date_trunc('month', vv.fecha)::date mes, vv.quantity, p.id pid, p.grams, p.cost_fixed, p.insumo_pieza, p.proveedor, p.kilates
    from public.v_ventas vv left join public.products p on p.id = vv.product_id
    where vv.status = 'paid' and vv.fecha >= (select d from desde)
  ),
  combos as (select distinct l.mes, l.proveedor, l.kilates from lineas l where l.kilates is not null and l.grams is not null),
  precios as (
    select c.mes, c.proveedor, c.kilates, gp.precio from combos c
    left join lateral (select precio from public.gold_price_for(c.mes, c.proveedor, c.kilates) limit 1) gp on true
  ),
  mat as (
    select l.mes,
      sum(l.quantity * (coalesce(l.grams, 0) * coalesce(pr.precio, 0) + coalesce(l.cost_fixed, 0))) material,
      sum(l.quantity * coalesce(l.insumo_pieza, 0)) insumos,
      count(*) filter (where l.pid is null or (l.grams is null and coalesce(l.cost_fixed, 0) = 0)) sin_costo
    from lineas l
    left join precios pr on pr.mes = l.mes and pr.proveedor = l.proveedor and pr.kilates = l.kilates and l.grams is not null
    group by l.mes
  ),
  ml as (select * from public.ventas_por_mes(p_meses)),
  dir as (
    select date_trunc('month', fecha)::date mes, count(*) n, sum(precio_total) total, sum(pagado) cobrado
    from public.direct_sales where estado <> 'cancelada' and fecha >= (select d from desde) group by 1
  )
  select ml.mes, ml.ordenes, ml.piezas, ml.venta, ml.comision, ml.envio, ml.ret_iva, ml.ret_isr, ml.cupon, ml.neto_recibido,
    coalesce(mat.material, 0), coalesce(mat.insumos, 0), coalesce(mat.sin_costo, 0),
    ml.neto_recibido - coalesce(mat.material, 0) - coalesce(mat.insumos, 0),
    ml.canceladas, coalesce(dir.n, 0), coalesce(dir.total, 0), coalesce(dir.cobrado, 0),
    ml.devueltas, ml.en_disputa, ml.disputa_monto
  from ml left join mat on mat.mes = ml.mes left join dir on dir.mes = ml.mes
  order by ml.mes desc;
$$;

-- v_ventas tomaba el estado de meli_orders; ahora lo toma de v_ordenes para que una venta reembolsada
-- también salga del reporte por producto (material, piezas).
create or replace view public.v_ventas as
select oi.order_id, o.pack_id, o.date_created, o.fecha, o.status, o.shipping_id, o.buyer_nickname,
  oi.item_id, oi.variation_id, oi.title, oi.quantity, oi.unit_price, oi.sale_fee,
  oi.quantity::numeric * oi.unit_price as venta,
  oi.quantity::numeric * coalesce(oi.sale_fee, 0::numeric) as comision,
  v.id as variant_id, v.color, v.talla,
  p.id as product_id, p.name as producto, p.category as categoria,
  i.logistic_type
from public.meli_order_items oi
join public.v_ordenes o on o.order_id = oi.order_id
left join public.variants v on v.id = oi.variant_id
left join public.products p on p.id = v.product_id
left join public.meli_items i on i.item_id = oi.item_id;

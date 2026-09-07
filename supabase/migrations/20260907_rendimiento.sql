-- Rendimiento: la app tardaba varios segundos en abrir (cada RPC de la portada ~5-6 s) porque
-- 1) las políticas RLS evaluaban is_allowed() fila por fila (millones de lecturas a allowed_users),
-- 2) v_ordenes usaba una función de ventana que impedía filtrar por fecha antes de calcular los cargos
--    de TODAS las órdenes históricas, y
-- 3) v_pagos recorría el JSON de cargos seis veces por pago.

-- 1. RLS: evaluar is_allowed() una sola vez por consulta (InitPlan) en vez de una vez por fila.
do $$
declare r record;
begin
  for r in
    select tablename, policyname, cmd, roles
    from pg_policies
    where schemaname = 'public' and qual = 'is_allowed()'
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

-- 2. Índices que faltaban para los filtros y joins de las consultas de ventas y stock.
create index if not exists meli_orders_fecha_cdmx_idx
  on public.meli_orders (((date_created at time zone 'America/Mexico_City')::date));
create index if not exists meli_orders_shipping_idx on public.meli_orders (shipping_id);
create index if not exists meli_stock_snapshots_inv_fecha_idx on public.meli_stock_snapshots (inventory_id, snapshot_date desc);
create index if not exists meli_order_items_variant_idx on public.meli_order_items (variant_id);
create index if not exists meli_variations_variant_idx on public.meli_variations (variant_id);

-- 3. v_pagos: un solo recorrido del JSON de cargos por pago (antes seis llamadas a charge_sum).
create or replace view public.v_pagos as
select p.payment_id, p.order_id, p.status, p.date_approved, p.transaction_amount, p.net_received_amount,
  c.ret_iva, c.ret_isr, c.fee_meli, c.fee_mp, c.fee_envio, c.cupon,
  jsonb_array_length(p.charges) > 0 as con_cargos,
  p.charges
from public.meli_payments p
left join lateral (
  select
    coalesce(sum(x.monto) filter (where x.nombre ~* '^tax_withholding-iva'), 0) as ret_iva,
    coalesce(sum(x.monto) filter (where x.nombre ~* '^tax_withholding-isr'), 0) as ret_isr,
    coalesce(sum(x.monto) filter (where x.nombre ~* '^meli_fee'), 0) as fee_meli,
    coalesce(sum(x.monto) filter (where x.nombre ~* '^mercadopago_fee'), 0) as fee_mp,
    coalesce(sum(x.monto) filter (where x.nombre ~* '^shp_'), 0) as fee_envio,
    coalesce(sum(x.monto) filter (where x.nombre ~* '^coupon_fee'), 0) as cupon
  from (
    select ch->>'name' as nombre,
      coalesce((ch->'amounts'->>'original')::numeric, 0) - coalesce((ch->'amounts'->>'refunded')::numeric, 0) as monto
    from jsonb_array_elements(coalesce(p.charges, '[]'::jsonb)) ch
  ) x
) c on true;

-- 4. v_ordenes sin función de ventana ni agregados sobre todo el histórico: el filtro por fecha llega hasta
--    meli_orders (usa el índice nuevo) y las líneas y pagos se agregan solo para las órdenes del rango.
--    Misma lógica y mismas columnas que la versión anterior (modo reventa / retenciones estimadas incluidas).
create or replace view public.v_ordenes as
with base as (
  select o.order_id, o.pack_id, o.date_created, o.status, o.shipping_id, o.buyer_nickname, o.total_amount, o.paid_amount,
    (o.date_created at time zone 'America/Mexico_City')::date as fecha,
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

-- 5. Conteo ligero de tallas agotadas para la portada (antes bajaba las ~450 filas de stock_full_actual solo para contar).
create or replace function public.agotadas_full()
returns bigint language sql stable set search_path to 'public' as $$
  select count(*)
  from (
    select distinct on (inventory_id) inventory_id, item_id, available
    from public.meli_stock_snapshots order by inventory_id, snapshot_date desc
  ) s
  join public.meli_items i on i.item_id = s.item_id
  where s.available = 0 and i.status = 'active';
$$;

-- Reporte mensual (réplica del Excel), precios de oro por proveedor y mes, y datos para sugerir pedidos.

-- 1. Catálogo: proveedor (cada uno vende el gramo distinto), insumo por pieza (caja), stock fuera de Full.
alter table public.products
  add column if not exists proveedor text not null default 'Argollas',
  add column if not exists insumo_pieza numeric not null default 32,
  add column if not exists stock_casa integer not null default 0,
  add column if not exists stock_amazon integer not null default 0;

update public.products set proveedor = case
  when category = 'Argollas matrimonio' then 'Argollas'
  when name in ('Anillo Atenas 10k', 'Anillo Madrid 10k') then 'Bogos'
  when category = 'Otros de oro' then 'Anillos'
  when category = 'Diamante natural' then 'Diamante'
  else 'Plata' end
where proveedor = 'Argollas';

update public.products set insumo_pieza = case
  when name ilike 'Aretes%' or name ilike 'Collar solitario%' then 12
  when name ilike 'Collar tenis%' or name ilike 'Pulsera tenis%' or name ilike 'Cadena%' then 48
  else 32 end;

update public.products set grams = 2.5 where name = 'Anillo Madrid 10k' and grams is null;

-- Stock en casa / Amazon según la hoja "Reporte Agosto" (editable en la app).
update public.products p set stock_casa = s.casa, stock_amazon = s.amazon from (values
  ('Argolla 10k 4mm Abundancia', 20, 0), ('Argolla 10k 5mm', 0, 0), ('Argolla 10k 3mm', 98, 24), ('Argolla 10k 2mm', 51, 16),
  ('Argolla 10k 4mm Diamantada', 28, 0), ('Anillo Paris 10k', 48, 0), ('Anillo Milán 10k', 5, 0), ('Anillo Istanbul 10k', 18, 0),
  ('Argolla 14k 6mm Abundancia', 2, 0), ('Argolla 14k 3mm', 19, 0), ('Argolla 14k 4mm Diamantada', 8, 0), ('Argolla 14k 6mm Diamantada', 2, 0),
  ('Aretes solitario 1ct', 43, 3), ('Anillo Atenas 10k', 3, 0), ('Anillo 10k diamante natural', 1, 0), ('Anillo 14k diamante .16ct', 4, 0)
) as s(name, casa, amazon) where p.name = s.name;

-- 2. Precio del oro por mes, proveedor y kilataje.
create table if not exists public.gold_prices (
  mes date not null,
  proveedor text not null,
  kilates text not null,
  precio numeric not null,
  updated_at timestamptz not null default now(),
  primary key (mes, proveedor, kilates)
);
alter table public.gold_prices enable row level security;
drop policy if exists allowed_all on public.gold_prices;
create policy allowed_all on public.gold_prices for all using (public.is_allowed()) with check (public.is_allowed());

-- Histórico tomado del Excel "reporte mensual 2026 actualizado".
insert into public.gold_prices (mes, proveedor, kilates, precio) values
  ('2025-10-01','Argollas','10k',1320),('2025-10-01','Argollas','14k',1750),
  ('2025-11-01','Argollas','10k',1280),('2025-11-01','Argollas','14k',1710),
  ('2025-12-01','Argollas','10k',1300),('2025-12-01','Argollas','14k',1725),
  ('2026-01-01','Argollas','10k',1300),('2026-01-01','Argollas','14k',1725),
  ('2026-02-01','Argollas','10k',1500),('2026-02-01','Argollas','14k',1950),
  ('2026-03-01','Argollas','10k',1500),('2026-03-01','Argollas','14k',1950),
  ('2026-04-01','Argollas','10k',1500),('2026-04-01','Argollas','14k',1900),
  ('2026-05-01','Argollas','10k',1375),('2026-05-01','Argollas','14k',1830),
  ('2026-06-01','Argollas','10k',1300),('2026-06-01','Argollas','14k',1800),
  ('2026-07-01','Argollas','10k',1310),('2026-07-01','Argollas','14k',1680),
  ('2026-08-01','Argollas','10k',1310),('2026-08-01','Argollas','14k',1680),
  ('2025-10-01','Anillos','10k',1320),('2025-11-01','Anillos','10k',1280),('2025-12-01','Anillos','10k',1300),('2026-01-01','Anillos','10k',1300),
  ('2026-02-01','Anillos','10k',1500),('2026-03-01','Anillos','10k',1500),('2026-04-01','Anillos','10k',1500),('2026-05-01','Anillos','10k',1375),
  ('2026-06-01','Anillos','10k',1300),('2026-07-01','Anillos','10k',1300),('2026-08-01','Anillos','10k',1300),
  ('2026-06-01','Anillos','14k',1800),('2026-07-01','Anillos','14k',1680),('2026-08-01','Anillos','14k',1680),
  ('2026-02-01','Bogos','10k',1500),('2026-03-01','Bogos','10k',1500),('2026-04-01','Bogos','10k',1500),('2026-05-01','Bogos','10k',1375),
  ('2026-06-01','Bogos','10k',1300),('2026-07-01','Bogos','10k',1310),('2026-08-01','Bogos','10k',1310),
  ('2025-11-01','Diamante','14k',1710),('2025-12-01','Diamante','14k',1725),('2026-01-01','Diamante','14k',1725),('2026-02-01','Diamante','14k',1950),
  ('2026-03-01','Diamante','14k',1950),('2026-04-01','Diamante','14k',1900),('2026-05-01','Diamante','14k',1830),('2026-06-01','Diamante','14k',1900),
  ('2026-07-01','Diamante','14k',1680),('2026-08-01','Diamante','14k',1680),
  ('2026-06-01','Diamante','10k',1280),('2026-07-01','Diamante','10k',1310),('2026-08-01','Diamante','10k',1310)
on conflict do nothing;

-- Precio de oro aplicable a un mes: el del mes exacto; si no existe, el último anterior; si no, el de otro proveedor; si no, settings.gold_price.
create or replace function public.gold_price_for(p_mes date, p_proveedor text, p_kilates text)
returns table(precio numeric, mes_origen date)
language sql stable set search_path to 'public' as $$
  select * from (
    select g.precio, g.mes from public.gold_prices g
    where g.proveedor = p_proveedor and g.kilates = p_kilates and g.mes <= p_mes
    order by g.mes desc limit 1
  ) a
  union all
  select * from (
    select g.precio, g.mes from public.gold_prices g
    where g.kilates = p_kilates and g.mes <= p_mes
      and not exists (select 1 from public.gold_prices x where x.proveedor = p_proveedor and x.kilates = p_kilates and x.mes <= p_mes)
    order by g.mes desc limit 1
  ) b
  union all
  select (s.value ->> p_kilates)::numeric, null::date from public.settings s
  where s.key = 'gold_price' and (s.value ->> p_kilates) is not null
    and not exists (select 1 from public.gold_prices x where x.kilates = p_kilates and x.mes <= p_mes)
  limit 1;
$$;

-- 3. Reporte mensual por producto (mismas columnas que el Excel, con cargos reales de Mercado Pago repartidos por línea).
create or replace function public.reporte_mensual(p_mes date)
returns table(
  product_id integer, producto text, categoria text, proveedor text, kilates text, grams numeric, cost_fixed numeric, insumo_pieza numeric,
  activo boolean, sort_order integer,
  precio_oro numeric, precio_oro_mes date,
  piezas numeric, ordenes bigint, venta numeric, comision numeric, envio numeric, ret_iva numeric, ret_isr numeric, cupon numeric,
  recibido numeric, ordenes_sin_pago bigint, dias_con_venta bigint,
  stock_full integer, stock_transito integer, stock_casa integer, stock_amazon integer, variantes_activas bigint, agotadas bigint,
  dias_snapshot bigint, pct_dias_agotado numeric
)
language sql stable set search_path to 'public' as $$
  with lim as (
    select date_trunc('month', p_mes)::date as d1, (date_trunc('month', p_mes) + interval '1 month - 1 day')::date as d2
  ),
  lineas as (
    select v.product_id, v.quantity, v.venta, v.comision, v.fecha, v.order_id,
      case when coalesce(o.venta, 0) > 0 then v.venta / o.venta else 1 end as parte,
      o.envio, o.ret_iva, o.ret_isr, o.cupon, o.neto_recibido
    from public.v_ventas v
    join public.v_ordenes o on o.order_id = v.order_id
    cross join lim
    where v.status = 'paid' and v.fecha between lim.d1 and lim.d2 and v.product_id is not null
  ),
  ven as (
    select l.product_id,
      sum(l.quantity) as piezas, count(distinct l.order_id) as ordenes, sum(l.venta) as venta, sum(l.comision) as comision,
      sum(coalesce(l.envio, 0) * l.parte) as envio, sum(l.ret_iva * l.parte) as ret_iva, sum(l.ret_isr * l.parte) as ret_isr, sum(l.cupon * l.parte) as cupon,
      sum(coalesce(l.neto_recibido * l.parte, l.venta - l.comision - coalesce(l.envio, 0) * l.parte)) as recibido,
      count(distinct l.order_id) filter (where l.neto_recibido is null) as ordenes_sin_pago,
      count(distinct l.fecha) as dias_con_venta
    from lineas l group by l.product_id
  ),
  stk as (
    select s.product_id, sum(s.available)::int as stock_full, sum(s.in_transit)::int as stock_transito,
      count(*) filter (where s.item_status = 'active') as variantes_activas,
      count(*) filter (where s.item_status = 'active' and s.available = 0) as agotadas
    from public.stock_full_actual() s where s.product_id is not null group by s.product_id
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
    coalesce(s.stock_full, 0), coalesce(s.stock_transito, 0), p.stock_casa, p.stock_amazon, coalesce(s.variantes_activas, 0), coalesce(s.agotadas, 0),
    coalesce(sn.dias_snapshot, 0), sn.pct_dias_agotado
  from public.products p
  left join ven v on v.product_id = p.id
  left join stk s on s.product_id = p.id
  left join snapp sn on sn.product_id = p.id
  left join lateral (
    select * from public.gold_price_for(date_trunc('month', p_mes)::date, p.proveedor, p.kilates) where p.kilates is not null and p.grams is not null
  ) gp on true
  where p.active or coalesce(v.piezas, 0) > 0
  order by p.proveedor, p.kilates, p.sort_order, p.name;
$$;

-- 4. Ventas por variante (todas) con última venta y stock en Full, para sugerir pedidos por talla.
create or replace function public.ventas_variantes_todas(p_desde date, p_hasta date)
returns table(
  product_id integer, variant_id integer, color text, talla text, piezas numeric, venta numeric, ultima_venta date,
  dias_con_venta bigint, available integer, in_transit integer, en_full boolean, activa boolean,
  dias_snapshot bigint, dias_agotado bigint
)
language sql stable set search_path to 'public' as $$
  with ven as (
    select v.product_id, v.variant_id, coalesce(v.color, '') as color, coalesce(v.talla, '') as talla,
      sum(v.quantity) as piezas, sum(v.venta) as venta, max(v.fecha) as ultima_venta, count(distinct v.fecha) as dias_con_venta
    from public.v_ventas v
    where v.status = 'paid' and v.fecha between p_desde and p_hasta and v.product_id is not null
    group by 1, 2, 3, 4
  ),
  stk as (
    select s.variant_id, sum(s.available)::int as available, sum(s.in_transit)::int as in_transit,
      bool_or(s.item_status = 'active') as activa
    from public.stock_full_actual() s where s.variant_id is not null group by s.variant_id
  ),
  snap as (
    select coalesce(mv.variant_id, mi.variant_id) as variant_id, count(distinct ms.snapshot_date) as dias_snapshot,
      count(distinct ms.snapshot_date) filter (where ms.available = 0) as dias_agotado
    from public.meli_stock_snapshots ms
    left join public.meli_variations mv on mv.inventory_id = ms.inventory_id
    left join public.meli_items mi on mi.item_id = ms.item_id
    where ms.snapshot_date between p_desde and p_hasta
    group by 1
  ),
  todas as (
    select coalesce(v.product_id, va.product_id) as product_id, coalesce(v.variant_id, s.variant_id) as variant_id,
      coalesce(v.color, va.color, '') as color, coalesce(v.talla, va.talla, '') as talla,
      coalesce(v.piezas, 0) as piezas, coalesce(v.venta, 0) as venta, v.ultima_venta, coalesce(v.dias_con_venta, 0) as dias_con_venta,
      s.available, s.in_transit, s.variant_id is not null as en_full, coalesce(s.activa, false) as activa
    from ven v
    full join stk s on s.variant_id = v.variant_id
    left join public.variants va on va.id = coalesce(v.variant_id, s.variant_id)
  )
  select t.product_id, t.variant_id, t.color, t.talla, t.piezas, t.venta, t.ultima_venta, t.dias_con_venta,
    t.available, t.in_transit, t.en_full, t.activa, coalesce(sn.dias_snapshot, 0), coalesce(sn.dias_agotado, 0)
  from todas t left join snap sn on sn.variant_id = t.variant_id
  where t.product_id is not null
  order by t.product_id, t.color, nullif(regexp_replace(t.talla, '[^0-9.]', '', 'g'), '')::numeric nulls last, t.talla;
$$;

-- 5. Gastos fijos del mes y presupuesto de compra (ajustables en Configuración).
insert into public.settings (key, value) values
  ('gastos_fijos', '{"contabilidad": 3500, "intereses": 4000, "publicidad": 0}'::jsonb),
  ('presupuesto', '{"pct_recibido": 60, "fijo": 0}'::jsonb)
on conflict (key) do nothing;

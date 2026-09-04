-- Stock en bodega (fuera de Full) por talla y color, editable desde la app.

create table if not exists public.stock_bodega (
  variant_id integer primary key references public.variants(id) on delete cascade,
  casa integer not null default 0 check (casa >= 0),
  updated_at timestamptz not null default now()
);
alter table public.stock_bodega enable row level security;
drop policy if exists allowed_all on public.stock_bodega;
create policy allowed_all on public.stock_bodega for all using (public.is_allowed()) with check (public.is_allowed());

-- Carga inicial desde "Existencia stock actualizad por tallas.xlsx" (filas "verde y blanco" y "blanco y amarillo" repartidas entre ambos colores).
create temp table datos (product_name text, color text, talla text, casa int) on commit drop;
insert into datos values
  ('Argolla 10k 4mm Abundancia','Amarillo','5',2),('Argolla 10k 4mm Abundancia','Amarillo','6',2),('Argolla 10k 4mm Abundancia','Amarillo','9.5',1),
  ('Argolla 10k 5mm','Amarillo','5',3),
  ('Argolla 10k 3mm','Amarillo','5',1),('Argolla 10k 3mm','Amarillo','6',1),('Argolla 10k 3mm','Amarillo','6.5',15),('Argolla 10k 3mm','Amarillo','8.5',10),
  ('Argolla 10k 3mm','Amarillo','9.5',8),('Argolla 10k 3mm','Amarillo','10.5',8),('Argolla 10k 3mm','Amarillo','11.5',12),
  ('Argolla 10k 3mm','Blanco','11',2),('Argolla 10k 3mm','Blanco','11.5',2),
  ('Argolla 10k 3mm','Rosa','7.5',1),('Argolla 10k 3mm','Rosa','8.5',4),('Argolla 10k 3mm','Rosa','9.5',4),('Argolla 10k 3mm','Rosa','10',1),('Argolla 10k 3mm','Rosa','10.5',6),
  ('Argolla 10k 2mm','Amarillo','7',2),('Argolla 10k 2mm','Amarillo','7.5',13),('Argolla 10k 2mm','Amarillo','8.5',5),('Argolla 10k 2mm','Amarillo','9',1),
  ('Argolla 10k 2mm','Amarillo','9.5',1),('Argolla 10k 2mm','Amarillo','10',1),('Argolla 10k 2mm','Amarillo','10.5',1),('Argolla 10k 2mm','Amarillo','11.5',1),
  ('Argolla 10k 2mm','Rosa','6.5',1),('Argolla 10k 2mm','Rosa','10',1),('Argolla 10k 2mm','Blanco','11',1),
  ('Argolla 10k 4mm Diamantada','Amarillo','6.5',7),('Argolla 10k 4mm Diamantada','Amarillo','7',5),('Argolla 10k 4mm Diamantada','Amarillo','8',5),('Argolla 10k 4mm Diamantada','Amarillo','9',1),
  ('Argolla 10k 4mm Diamantada','Amarillo','9.5',3),('Argolla 10k 4mm Diamantada','Amarillo','10.5',4),('Argolla 10k 4mm Diamantada','Amarillo','11',1),('Argolla 10k 4mm Diamantada','Amarillo','11.5',4),
  ('Anillo Paris 10k','Verde','5',6),('Anillo Paris 10k','Blanco','5',6),('Anillo Paris 10k','Verde','5.5',7),('Anillo Paris 10k','Blanco','5.5',8),
  ('Anillo Paris 10k','Verde','6',7),('Anillo Paris 10k','Blanco','6',8),('Anillo Paris 10k','Verde','6.5',7),('Anillo Paris 10k','Blanco','6.5',8),
  ('Anillo Paris 10k','Verde','7',6),('Anillo Paris 10k','Blanco','7',6),('Anillo Paris 10k','Verde','7.5',4),('Anillo Paris 10k','Blanco','7.5',4),
  ('Anillo Paris 10k','Verde','8',3),('Anillo Paris 10k','Blanco','8',3),('Anillo Paris 10k','Verde','8.5',1),('Anillo Paris 10k','Blanco','8.5',1),
  ('Anillo Paris 10k','Rojo','5',1),('Anillo Paris 10k','Rojo','6.5',1),('Anillo Paris 10k','Rojo','7',4),('Anillo Paris 10k','Rojo','7.5',9),('Anillo Paris 10k','Rojo','8',1),('Anillo Paris 10k','Rojo','8.5',3),
  ('Anillo Milán 10k','Verde','5',5),('Anillo Milán 10k','Blanco','5',6),('Anillo Milán 10k','Verde','5.5',5),('Anillo Milán 10k','Blanco','5.5',6),
  ('Anillo Milán 10k','Verde','6',12),('Anillo Milán 10k','Blanco','6',12),('Anillo Milán 10k','Verde','6.5',5),('Anillo Milán 10k','Blanco','6.5',6),
  ('Anillo Milán 10k','Verde','7',11),('Anillo Milán 10k','Blanco','7',11),('Anillo Milán 10k','Verde','7.5',8),('Anillo Milán 10k','Blanco','7.5',9),
  ('Anillo Milán 10k','Verde','8',2),('Anillo Milán 10k','Blanco','8',3),('Anillo Milán 10k','Verde','8.5',1),('Anillo Milán 10k','Blanco','8.5',2),
  ('Anillo Milán 10k','Rojo','5',1),
  ('Anillo Istanbul 10k','Verde','5',6),('Anillo Istanbul 10k','Blanco','5',7),('Anillo Istanbul 10k','Verde','5.5',7),('Anillo Istanbul 10k','Blanco','5.5',7),
  ('Anillo Istanbul 10k','Verde','6',7),('Anillo Istanbul 10k','Blanco','6',8),('Anillo Istanbul 10k','Verde','6.5',10),('Anillo Istanbul 10k','Blanco','6.5',11),
  ('Anillo Istanbul 10k','Verde','7',8),('Anillo Istanbul 10k','Blanco','7',9),('Anillo Istanbul 10k','Verde','7.5',2),('Anillo Istanbul 10k','Blanco','7.5',2),
  ('Anillo Istanbul 10k','Verde','8',2),('Anillo Istanbul 10k','Blanco','8',3),
  ('Anillo Istanbul 10k','Rojo','5.5',1),('Anillo Istanbul 10k','Rojo','7',1),
  ('Churumbela 10k 2mm','Amarillo','5',5),('Churumbela 10k 2mm','Blanco','5',5),('Churumbela 10k 2mm','Amarillo','5.5',5),('Churumbela 10k 2mm','Blanco','5.5',6),
  ('Churumbela 10k 2mm','Amarillo','6',7),('Churumbela 10k 2mm','Blanco','6',8),('Churumbela 10k 2mm','Amarillo','6.5',10),('Churumbela 10k 2mm','Blanco','6.5',10),
  ('Churumbela 10k 2mm','Amarillo','7',10),('Churumbela 10k 2mm','Blanco','7',10),('Churumbela 10k 2mm','Amarillo','7.5',10),('Churumbela 10k 2mm','Blanco','7.5',11),
  ('Churumbela 10k 2mm','Amarillo','8',10),('Churumbela 10k 2mm','Blanco','8',10),('Churumbela 10k 2mm','Blanco','8.5',1),
  ('Argolla 14k 3mm','Amarillo','10.5',4),
  ('Argolla 14k 4mm Diamantada','Amarillo','5',5),('Argolla 14k 4mm Diamantada','Amarillo','6.5',2),('Argolla 14k 4mm Diamantada','Amarillo','7.5',1),
  ('Argolla 14k 6mm Diamantada','Amarillo','5',2),('Argolla 14k 6mm Diamantada','Amarillo','7.5',2),
  ('Choker 14k','Blanco','',1),
  ('Aretes solitario 1ct','Blanco','',43),('Aretes princesa 1ct','Blanco','',74),
  ('Cadena cubana pulsera 6mm','Blanco','16.51',2),
  ('Collar tenis 2mm','','16',1),
  ('Pulsera tenis 2mm','Blanco','15.24',1),('Pulsera tenis 2mm','Blanco','16.51',7),('Pulsera tenis 2mm','Blanco','17.8',13),('Pulsera tenis 2mm','Blanco','19.05',10),
  ('Pulsera tenis 3mm','Blanco','15.24',5),('Pulsera tenis 3mm','Blanco','16.5',9),('Pulsera tenis 3mm','Blanco','18',6),
  ('Anillo 10k diamante natural','Amarillo','5.5',1),
  ('Anillo 14k diamante .16ct','Blanco','',5),
  ('Anillo Atenas 10k','Amarillo','5',2),('Anillo Atenas 10k','Amarillo','5.5',7),('Anillo Atenas 10k','Amarillo','6',11),('Anillo Atenas 10k','Amarillo','6.5',20),
  ('Anillo Atenas 10k','Amarillo','7',12),('Anillo Atenas 10k','Amarillo','7.5',22),('Anillo Atenas 10k','Amarillo','8',13),('Anillo Atenas 10k','Amarillo','8.5',8);

-- Tallas que hay en bodega pero aún no existen como variante (p. ej. Argolla 10k 3mm amarillo talla 5).
insert into public.variants (product_id, color, talla)
select p.id, d.color, d.talla from datos d join public.products p on p.name = d.product_name
on conflict (product_id, color, talla) do nothing;

insert into public.stock_bodega (variant_id, casa)
select v.id, d.casa from datos d
join public.products p on p.name = d.product_name
join public.variants v on v.product_id = p.id and v.color = d.color and v.talla = d.talla
on conflict (variant_id) do update set casa = excluded.casa, updated_at = now();

-- Amazon (por producto) según el mismo archivo.
update public.products set stock_amazon = 0;
update public.products p set stock_amazon = s.amazon from (values
  ('Argolla 10k 3mm', 12), ('Argolla 10k 2mm', 18), ('Aretes solitario 1ct', 16), ('Collar solitario princesa 1ct', 10),
  ('Pulsera tenis 2mm', 45), ('Pulsera tenis 3mm', 27)
) as s(name, amazon) where p.name = s.name;

-- El stock en casa deja de vivir en products: se suma desde stock_bodega.
alter table public.products drop column if exists stock_casa;

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
    coalesce(sn.dias_snapshot, 0), sn.pct_dias_agotado
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

drop function if exists public.ventas_variantes_todas(date, date);
create function public.ventas_variantes_todas(p_desde date, p_hasta date)
returns table(
  product_id integer, variant_id integer, color text, talla text, piezas numeric, venta numeric, ultima_venta date,
  dias_con_venta bigint, available integer, in_transit integer, en_full boolean, activa boolean,
  dias_snapshot bigint, dias_agotado bigint, casa integer
)
language sql stable set search_path to 'public' as $$
  with ven as (
    select v.variant_id, sum(v.quantity) as piezas, sum(v.venta) as venta, max(v.fecha) as ultima_venta, count(distinct v.fecha) as dias_con_venta
    from public.v_ventas v
    where v.status = 'paid' and v.fecha between p_desde and p_hasta and v.variant_id is not null
    group by v.variant_id
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
  )
  select va.product_id, va.id, coalesce(va.color, ''), coalesce(va.talla, ''),
    coalesce(v.piezas, 0), coalesce(v.venta, 0), v.ultima_venta, coalesce(v.dias_con_venta, 0),
    s.available, s.in_transit, s.variant_id is not null, coalesce(s.activa, false),
    coalesce(sn.dias_snapshot, 0), coalesce(sn.dias_agotado, 0), coalesce(b.casa, 0)
  from public.variants va
  left join ven v on v.variant_id = va.id
  left join stk s on s.variant_id = va.id
  left join public.stock_bodega b on b.variant_id = va.id
  left join snap sn on sn.variant_id = va.id
  where v.variant_id is not null or s.variant_id is not null or b.variant_id is not null
  order by va.product_id, va.color, nullif(regexp_replace(va.talla, '[^0-9.]', '', 'g'), '')::numeric nulls last, va.talla;
$$;

-- Control de insumos de empaque (antes en las pestañas "Insumos" e "InsumosMovimientos" de la hoja ERP ZAHAV).
--   insumos: cada empaque con su conteo inicial y el mínimo para avisar.
--   insumo_movimientos: compras, devoluciones (se recupera un % de las cajas) y ajustes capturados a mano.
--   products.insumo_id: qué empaque lleva cada producto (null = sin empaque).
-- Las salidas se calculan solas a partir del día siguiente al conteo: ventas de ML que salen de bodega (no Full),
-- piezas declaradas en colectas a Full y ventas directas (un empaque fijo por venta).
begin;

create table if not exists public.insumos (
  id text primary key,
  nombre text not null,
  conteo_inicial integer not null default 0,
  minimo integer not null default 0,
  orden integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.insumo_movimientos (
  id bigint generated always as identity primary key,
  fecha date not null default (now() at time zone 'America/Mexico_City')::date,
  insumo_id text not null references public.insumos(id) on delete cascade,
  tipo text not null check (tipo in ('compra', 'devolucion', 'ajuste')),
  cantidad integer not null check (cantidad <> 0),
  nota text,
  created_by text default lower(coalesce(auth.jwt() ->> 'email', 'sistema')),
  created_at timestamptz not null default now()
);
create index if not exists insumo_movimientos_fecha_idx on public.insumo_movimientos (fecha);

alter table public.insumos enable row level security;
alter table public.insumo_movimientos enable row level security;
drop policy if exists allowed_all on public.insumos;
create policy allowed_all on public.insumos for all to authenticated using ((select public.is_allowed())) with check ((select public.is_allowed()));
drop policy if exists allowed_all on public.insumo_movimientos;
create policy allowed_all on public.insumo_movimientos for all to authenticated using ((select public.is_allowed())) with check ((select public.is_allowed()));

alter table public.products add column if not exists insumo_id text references public.insumos(id) on delete set null;

-- Conteo del 9 de octubre de 2026 (mínimos propuestos en la hoja).
insert into public.insumos (id, nombre, conteo_inicial, minimo, orden) values
  ('estuche_anillo', 'Estuche de anillo', 50, 10, 1),
  ('caja_anillo', 'Caja sencilla de anillo', 456, 50, 2),
  ('caja_pulsera', 'Caja de pulsera', 96, 20, 3),
  ('caja_collar', 'Caja de collar', 54, 10, 4)
on conflict (id) do nothing;

insert into public.settings (key, value) values
  ('insumos_fecha_conteo', '"2026-10-09"'::jsonb),
  ('insumos_devolucion_pct', '90'::jsonb),
  ('insumos_empaque_directas', '"estuche_anillo"'::jsonb)
on conflict (key) do nothing;

-- Empaque por producto, según lo confirmado en el chat de insumos.
update public.products set insumo_id = case
  when category = 'Diamante natural' and name ilike 'Anillo%diamante%' then 'estuche_anillo'   -- compromiso .16 a 1 ct y 10k diamante natural
  when name = 'Churumbela 14k 2.5mm Diamante' then 'estuche_anillo'
  when name ilike 'Argolla%' or name ilike 'Anillo%' or name ilike 'Churumbela%' then 'caja_anillo'
  when name ilike 'Pulsera%zirconia%' then null                                                 -- enchapado, sin caja
  when name ilike 'Pulsera%' or name = 'Cadena cubana pulsera 6mm' then 'caja_pulsera'
  when name ilike 'Collar tenis%' or name = 'Cadena cubana collar 8mm' then 'caja_collar'
  else null                                                                                      -- aretes, collares solitario, choker, diamante suelto
end
where insumo_id is null;
update public.products set insumo_id = null where name = 'Anillo 14k esmeralda';                -- Ahav Esmeralda: sin caja

/** Existencia de cada empaque: conteo + compras + devoluciones × % + ajustes − salidas desde la fecha del conteo. */
create or replace function public.insumos_resumen()
returns table(insumo_id text, nombre text, conteo_inicial integer, minimo integer, compras bigint, a_full bigint, ventas_bodega bigint,
              directas bigint, devoluciones numeric, ajustes bigint, existencia numeric)
language sql stable security definer set search_path to 'public' as $$
  with cfg as (
    select
      coalesce((select (value #>> '{}')::date from settings where key = 'insumos_fecha_conteo'), current_date) as desde,
      coalesce((select (value #>> '{}')::numeric from settings where key = 'insumos_devolucion_pct'), 90) / 100 as pct,
      (select nullif(value #>> '{}', '') from settings where key = 'insumos_empaque_directas') as emp_directas
  ),
  mov as (
    select m.insumo_id,
      sum(m.cantidad) filter (where m.tipo = 'compra') compras,
      sum(m.cantidad) filter (where m.tipo = 'devolucion') devol,
      sum(m.cantidad) filter (where m.tipo = 'ajuste') ajustes
    from insumo_movimientos m, cfg where m.fecha >= cfg.desde group by 1  -- lo capturado a mano el mismo día del conteo sí cuenta
  ),
  full_ as (
    select p.insumo_id, sum(it.declaradas) n
    from bodega_inbound_items it
    join bodega_inbounds b on b.inbound_id = it.inbound_id
    join variants v on v.id = it.variant_id
    join products p on p.id = v.product_id, cfg
    where (b.subido_at at time zone 'America/Mexico_City')::date > cfg.desde and p.insumo_id is not null
    group by 1
  ),
  bodega as (
    select p.insumo_id, sum(oi.quantity) n
    from meli_orders o
    join meli_order_items oi on oi.order_id = o.order_id
    left join meli_shipments s on s.shipment_id = o.shipping_id
    left join variants v on v.id = oi.variant_id
    left join meli_items i on i.item_id = oi.item_id
    join products p on p.id = coalesce(v.product_id, i.product_id), cfg
    where o.fecha > cfg.desde and o.status <> 'cancelled'
      and s.logistic_type is distinct from 'fulfillment' and p.insumo_id is not null
    group by 1
  ),
  dir as (
    select cfg.emp_directas insumo_id, count(*) n
    from direct_sales d, cfg where d.fecha > cfg.desde and d.estado <> 'cancelada' and cfg.emp_directas is not null
    group by 1
  )
  select i.id, i.nombre, i.conteo_inicial, i.minimo,
    coalesce(mov.compras, 0), coalesce(full_.n, 0), coalesce(bodega.n, 0), coalesce(dir.n, 0),
    floor(coalesce(mov.devol, 0) * cfg.pct), coalesce(mov.ajustes, 0),
    i.conteo_inicial + coalesce(mov.compras, 0) + floor(coalesce(mov.devol, 0) * cfg.pct) + coalesce(mov.ajustes, 0)
      - coalesce(full_.n, 0) - coalesce(bodega.n, 0) - coalesce(dir.n, 0)
  from insumos i cross join cfg
  left join mov on mov.insumo_id = i.id
  left join full_ on full_.insumo_id = i.id
  left join bodega on bodega.insumo_id = i.id
  left join dir on dir.insumo_id = i.id
  where public.is_allowed() or auth.role() = 'service_role'
  order by i.orden, i.nombre;
$$;

commit;

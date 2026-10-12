-- Alertas de ingresos a Full: llega a Full una talla con más piezas de las que había en bodega
-- (posible etiqueta equivocada, p. ej. 10 Torzal etiquetadas como Cartier, o una entrada sin registrar).
-- Solo desde el conteo (bodega_full_desde_fecha): antes la bodega no estaba al día y no hay contra qué comparar.

insert into public.settings (key, value) values ('full_alerta_diferencia', '3'::jsonb) on conflict (key) do nothing;

create table if not exists public.full_alertas_revisadas (
  fecha date not null,
  inventory_id text not null,
  nota text,
  revisado_por text,
  revisado_at timestamptz not null default now(),
  primary key (fecha, inventory_id)
);
alter table public.full_alertas_revisadas enable row level security;
drop policy if exists allowed_all on public.full_alertas_revisadas;
create policy allowed_all on public.full_alertas_revisadas for all using (public.is_allowed()) with check (public.is_allowed());

create or replace function public.full_alertas(p_desde date, p_hasta date)
returns table(fecha date, inventory_id text, variant_id integer, producto text, color text, talla text,
              llegaron integer, bodega_antes integer, diferencia integer, revisada boolean, nota text)
language sql stable security definer set search_path to 'public' as $$
  with cfg as (
    select coalesce((select (value #>> '{}')::int from settings where key = 'full_ingreso_minimo'), 5) as minimo,
           coalesce((select (value #>> '{}')::int from settings where key = 'full_alerta_diferencia'), 3) as dif,
           -- antes del conteo la bodega no estaba al día, así que no hay contra qué comparar
           coalesce((select (value #>> '{}')::date from settings where key = 'bodega_full_desde_fecha'), current_date) as desde
  ),
  ing as (select * from public.full_ingresos(greatest(p_desde, (select desde from cfg)), p_hasta)),
  dias as (select i.fecha from ing i group by i.fecha having sum(i.piezas) >= (select minimo from cfg)),
  base as (
    select i.fecha, i.inventory_id, i.variant_id, i.piezas,
      -- bodega justo antes de ese día: lo de hoy menos los movimientos desde entonces
      (coalesce((select b.casa from stock_bodega b where b.variant_id = i.variant_id), 0)
        - coalesce((select sum(m.qty) from stock_movements m where m.variant_id = i.variant_id and m.location = 'bodega'
                    and m.created_at >= (i.fecha::timestamp at time zone 'America/Mexico_City')), 0))::int as antes
    from ing i join dias d on d.fecha = i.fecha
  )
  select b.fecha, b.inventory_id, b.variant_id, coalesce(p.name, 'Sin producto (' || b.inventory_id || ')'), coalesce(v.color, ''), coalesce(v.talla, ''),
    b.piezas, greatest(b.antes, 0), b.piezas - greatest(b.antes, 0), r.fecha is not null, r.nota
  from base b
  left join variants v on v.id = b.variant_id
  left join products p on p.id = v.product_id
  left join full_alertas_revisadas r on r.fecha = b.fecha and r.inventory_id = b.inventory_id
  where b.piezas - greatest(b.antes, 0) >= (select dif from cfg)
    and (public.is_allowed() or auth.role() = 'service_role')
  order by b.fecha desc, b.piezas - greatest(b.antes, 0) desc;
$$;

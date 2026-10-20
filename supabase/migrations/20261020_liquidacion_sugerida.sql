-- Aviso para poner en liquidación: producto (por color) que en los últimos liquidacion_dias vendió menos de liquidacion_pct %
-- de lo que tenía (vendidas ÷ (vendidas + stock de hoy en Full, tránsito y bodega)).
-- Solo productos publicados hace más de liquidacion_dias (los nuevos aún no tienen historia) y que no estén ya en liquidación.
insert into public.settings (key, value) values ('liquidacion_dias', '{"valor": 60}'::jsonb) on conflict (key) do nothing;
insert into public.settings (key, value) values ('liquidacion_pct', '{"valor": 10}'::jsonb) on conflict (key) do nothing;

-- "Ahorita no": deja de avisar de ese producto/color hasta la fecha indicada.
create table if not exists public.liquidacion_pospuestas (
  product_id integer not null references public.products(id) on delete cascade,
  color text not null default '',
  hasta date not null,
  created_at timestamptz not null default now(),
  primary key (product_id, color)
);
alter table public.liquidacion_pospuestas enable row level security;
drop policy if exists allowed_all on public.liquidacion_pospuestas;
create policy allowed_all on public.liquidacion_pospuestas for all using (public.is_allowed()) with check (public.is_allowed());

create or replace function public.liquidacion_sugerida()
returns table(product_id integer, producto text, color text, desde date, stock integer, vendidas integer, pct numeric,
              costo_u numeric, valor_costo numeric, dias integer, umbral numeric, pospuesta_hasta date, alerta boolean)
language sql stable set search_path to 'public' as $$
  with cfg as (
    select coalesce((select (value->>'valor')::int from settings where key = 'liquidacion_dias'), 60) dias,
           coalesce((select (value->>'valor')::numeric from settings where key = 'liquidacion_pct'), 10) pct
  ),
  stk as (
    select v.product_id, coalesce(v.color, '') color, sum(x.q)::int q from (
      select s.variant_id, s.available + s.in_transit q from stock_full_actual() s where s.variant_id is not null
      union all select b.variant_id, b.casa from stock_bodega b
    ) x join variants v on v.id = x.variant_id group by 1, 2
  ),
  ven as (
    select vv.product_id, coalesce(vv.color, '') color, sum(vv.quantity)::int q
    from v_ventas vv where vv.status = 'paid' and vv.product_id is not null and vv.fecha >= current_date - (select dias from cfg)
    group by 1, 2
  ),
  -- desde cuándo se vende: la publicación más antigua o la primera venta
  inicio as (
    select p.id product_id, least((select min(i.date_created)::date from meli_items i where i.product_id = p.id),
                                  (select min(vv.fecha) from v_ventas vv where vv.product_id = p.id and vv.status = 'paid'),
                                  p.created_at::date) desde
    from products p
  ),
  costo as (
    select p.id product_id, coalesce(p.grams, 0) * coalesce(gp.precio, 0) + coalesce(p.cost_fixed, 0) costo_u
    from products p left join lateral (select precio from gold_price_for(current_date, p.proveedor, p.kilates) limit 1) gp on true
  )
  select s.product_id, p.name, s.color, ini.desde, s.q, coalesce(v.q, 0),
    round(100.0 * coalesce(v.q, 0) / (s.q + coalesce(v.q, 0)), 1),
    round(c.costo_u), round(c.costo_u * s.q), (select dias from cfg), (select pct from cfg), pp.hasta,
    100.0 * coalesce(v.q, 0) / (s.q + coalesce(v.q, 0)) < (select pct from cfg) and (pp.hasta is null or pp.hasta < current_date)
  from stk s
  join products p on p.id = s.product_id
  join inicio ini on ini.product_id = s.product_id
  join costo c on c.product_id = s.product_id
  left join ven v on v.product_id = s.product_id and v.color = s.color
  left join liquidacion_pospuestas pp on pp.product_id = s.product_id and pp.color = s.color
  where s.q > 0
    and ini.desde <= current_date - (select dias from cfg)
    and not exists (select 1 from liquidaciones l where l.product_id = s.product_id and (l.color is null or l.color = s.color))
    and (public.is_allowed() or auth.role() = 'service_role')
  order by 7, 9 desc;
$$;

-- Aviso de tallas agotadas con publicidad activa: publicaciones con varias tallas/colores en Full que siguen activas
-- (ML no suspende el anuncio porque quedan piezas), pero se agotaron las tallas que más se venden. La gente llega por el
-- anuncio, no encuentra su talla y el clic se paga igual.
--
-- Cómo se mide: de las piezas vendidas en los últimos `tallas_agotadas_dias` días (órdenes pagadas), qué % fue de tallas
-- que hoy tienen 0 disponibles en Full. Avisa si ese % ≥ `tallas_agotadas_pct`, si la publicación vendió al menos
-- `tallas_agotadas_min_ventas` piezas en ese periodo (con menos no es confiable) y si el anuncio gastó en los últimos 7 días.
insert into public.settings (key, value) values ('tallas_agotadas_pct', '{"valor": 40}'::jsonb) on conflict (key) do nothing;
insert into public.settings (key, value) values ('tallas_agotadas_min_ventas', '{"valor": 5}'::jsonb) on conflict (key) do nothing;
insert into public.settings (key, value) values ('tallas_agotadas_dias', '{"valor": 60}'::jsonb) on conflict (key) do nothing;

-- Avisos enviados al celular (máximo uno por publicación cada 7 días mientras siga igual).
create table if not exists public.publicidad_tallas_avisos (
  item_id text not null,
  avisado_at timestamptz not null default now(),
  pct numeric,
  primary key (item_id, avisado_at)
);
alter table public.publicidad_tallas_avisos enable row level security;
drop policy if exists allowed_read on public.publicidad_tallas_avisos;
create policy allowed_read on public.publicidad_tallas_avisos for select using (public.is_allowed());

create or replace function public.publicidad_tallas_agotadas()
returns table(item_id text, title text, permalink text, campaign_id bigint, campaign_name text,
              tallas integer, tallas_agotadas integer, vendidas integer, vendidas_agotadas integer, pct numeric,
              agotadas_que_venden text, en_transito_agotadas integer, disponible integer, gasto_7d numeric,
              umbral numeric, avisado_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  with cfg as (
    select coalesce((select (value->>'valor')::numeric from settings where key = 'tallas_agotadas_pct'), 40) pct,
           coalesce((select (value->>'valor')::int from settings where key = 'tallas_agotadas_min_ventas'), 5) min_v,
           coalesce((select (value->>'valor')::int from settings where key = 'tallas_agotadas_dias'), 60) dias
  ),
  ultima as (select max(snapshot_date) d from meli_stock_snapshots),
  st as (
    select v.item_id, v.variation_id, v.color, v.talla, s.available, s.in_transit
    from meli_variations v
    join meli_stock_snapshots s on s.inventory_id = v.inventory_id and s.snapshot_date = (select d from ultima)
  ),
  ventas as (
    select oi.item_id, oi.variation_id, sum(oi.quantity)::int q
    from meli_order_items oi join meli_orders o on o.order_id = oi.order_id
    where o.status = 'paid' and o.date_created >= now() - make_interval(days => (select dias from cfg))
    group by 1, 2
  ),
  x as (
    select st.item_id, count(*)::int n, count(*) filter (where st.available = 0)::int n0,
      coalesce(sum(v.q), 0)::int vend, coalesce(sum(v.q) filter (where st.available = 0), 0)::int vend0,
      string_agg(trim(coalesce(st.talla, '') || case when st.color is not null then ' ' || st.color else '' end) || ' (' || v.q || ')',
                 ', ' order by v.q desc) filter (where st.available = 0 and v.q > 0) agot,
      coalesce(sum(st.in_transit) filter (where st.available = 0), 0)::int trans0,
      sum(st.available)::int disp
    from st left join ventas v on v.item_id = st.item_id and v.variation_id = st.variation_id
    group by st.item_id
  ),
  camp as (
    select distinct on (d.campaign_id) d.campaign_id, d.campaign_name, d.status
    from meli_ads_daily d order by d.campaign_id, d.fecha desc
  ),
  gasto as (
    select a.item_id, sum(a.cost) g7 from meli_ads_items_daily a
    where a.fecha >= (select d from ultima) - 6 group by a.item_id
  )
  select x.item_id, i.title, i.permalink, a.campaign_id, coalesce(c.campaign_name, 'Campaña ' || a.campaign_id),
    x.n, x.n0, x.vend, x.vend0, round(100.0 * x.vend0 / x.vend, 0), x.agot, x.trans0, x.disp, g.g7,
    (select pct from cfg),
    (select max(p.avisado_at) from publicidad_tallas_avisos p where p.item_id = x.item_id)
  from x
  join meli_ads_items a on a.item_id = x.item_id and a.status = 'active' and a.synced_at > now() - interval '2 days'
  left join camp c on c.campaign_id = a.campaign_id
  join meli_items i on i.item_id = x.item_id and i.status = 'active'
  join gasto g on g.item_id = x.item_id and g.g7 > 0
  where coalesce(c.status, 'active') = 'active'
    and x.n > 1 and x.disp > 0                       -- con 0 en todas ML ya suspende el anuncio (otro aviso)
    and x.vend >= (select min_v from cfg)
    and 100.0 * x.vend0 / x.vend >= (select pct from cfg)
    and (public.is_allowed() or auth.role() = 'service_role' or current_user in ('postgres', 'supabase_admin'))
  order by g.g7 * x.vend0 / x.vend desc;
$$;

-- Para la notificación: las que no se han avisado en los últimos 7 días; las marca como avisadas.
create or replace function public.publicidad_tallas_avisar()
returns table(item_id text, title text, campaign_name text, pct numeric, agotadas_que_venden text, en_transito_agotadas integer, gasto_7d numeric)
language plpgsql security definer set search_path to 'public' as $$
#variable_conflict use_column
begin
  if not (public.is_allowed() or auth.role() = 'service_role' or current_user in ('postgres', 'supabase_admin')) then
    raise exception 'sin permiso';
  end if;
  return query
  with nuevos as (
    select * from public.publicidad_tallas_agotadas() t
    where t.avisado_at is null or t.avisado_at < now() - interval '7 days'
  ),
  ins as (insert into public.publicidad_tallas_avisos (item_id, pct) select n.item_id, n.pct from nuevos n)
  select n.item_id, n.title, n.campaign_name, n.pct, n.agotadas_que_venden, n.en_transito_agotadas, n.gasto_7d from nuevos n;
end;
$$;
revoke all on function public.publicidad_tallas_avisar() from public, anon;

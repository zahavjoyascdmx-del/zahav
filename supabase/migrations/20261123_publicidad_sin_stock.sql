-- Aviso de publicidad sin stock en Full: anuncios de Product Ads (en campaña activa y no pausados por ti)
-- cuya publicación ya no tiene piezas disponibles en Full. Para que decidas apagar el anuncio o la campaña.
--
-- Cómo se decide:
--  * Stock: foto de Full más reciente (se toma cada hora). Una publicación puede tener su propio inventario
--    (publicaciones por talla) o varias variaciones; se suman todos sus inventarios.
--  * Anuncio: estado actual en Product Ads (se sincroniza cada hora en meli_ads_items):
--      active = sigue participando → puede seguir gastando;
--      hold   = Mercado Libre lo suspendió solo porque la publicación no está activa (no gasta, pero vuelve
--               a encenderse solo en cuanto llegue stock);
--      paused = lo pausaste tú → ya no se avisa.
--  * Para no llenar de ruido: solo publicaciones que se agotaron en los últimos 14 días, o cualquier anuncio
--    que siga "active" sin stock (ese sí puede estar gastando). Las publicaciones cerradas no cuentan.

-- Estado actual de cada anuncio (todos, aunque no tengan métricas ese día).
create table if not exists public.meli_ads_items (
  item_id text primary key,
  campaign_id bigint,
  ad_group_id bigint,
  status text,
  status_raw text,
  title text,
  logistic_type text,
  synced_at timestamptz not null default now()
);
alter table public.meli_ads_items enable row level security;
drop policy if exists allowed_read on public.meli_ads_items;
create policy allowed_read on public.meli_ads_items for select using (public.is_allowed());

-- Avisos ya enviados (uno por publicación y por cada vez que se agota), para no repetir la notificación.
create table if not exists public.publicidad_avisos (
  item_id text not null,
  agotado_desde date not null,
  campaign_id bigint,
  avisado_at timestamptz not null default now(),
  primary key (item_id, agotado_desde)
);
alter table public.publicidad_avisos enable row level security;
drop policy if exists allowed_read on public.publicidad_avisos;
create policy allowed_read on public.publicidad_avisos for select using (public.is_allowed());

create or replace function public.publicidad_sin_stock()
returns table(item_id text, title text, permalink text, campaign_id bigint, campaign_name text, ad_status text,
              item_status text, disponible integer, en_transito integer, agotado_desde date,
              gasto_7d numeric, gasto_hoy numeric, ultimo_gasto date, campana_sin_stock boolean, avisado boolean)
language sql stable security definer set search_path to 'public' as $$
  with ultima as (select max(snapshot_date) d from meli_stock_snapshots),
  -- inventarios de cada publicación: el suyo y los de sus variaciones
  inv as (
    select i.item_id, i.inventory_id from meli_items i where i.inventory_id is not null
    union
    select v.item_id, v.inventory_id from meli_variations v where v.inventory_id is not null
  ),
  stk as (
    select inv.item_id, sum(s.available)::int disp, sum(s.in_transit)::int trans
    from inv join meli_stock_snapshots s on s.inventory_id = inv.inventory_id and s.snapshot_date = (select d from ultima)
    group by inv.item_id
  ),
  -- último día (antes de hoy) en que la publicación sí tenía piezas
  con_stock as (
    select inv.item_id, max(s.snapshot_date) d
    from inv join meli_stock_snapshots s on s.inventory_id = inv.inventory_id
    where s.snapshot_date < (select d from ultima)
    group by inv.item_id, s.snapshot_date having sum(s.available) > 0
  ),
  ult_con_stock as (select c.item_id, max(c.d) d from con_stock c group by c.item_id),
  camp as (
    select distinct on (d.campaign_id) d.campaign_id, d.campaign_name, d.status
    from meli_ads_daily d order by d.campaign_id, d.fecha desc
  ),
  gasto as (
    select a.item_id, sum(a.cost) filter (where a.fecha >= (select d from ultima) - 6) g7,
           sum(a.cost) filter (where a.fecha = (select d from ultima)) ghoy,
           max(a.fecha) filter (where a.cost > 0) ult
    from meli_ads_items_daily a where a.fecha >= (select d from ultima) - 60 group by a.item_id
  ),
  ads as (
    select a.*, c.campaign_name, coalesce(st.disp, 0) disp, coalesce(st.trans, 0) trans, st.item_id is not null tiene_foto
    from meli_ads_items a
    left join camp c on c.campaign_id = a.campaign_id
    left join stk st on st.item_id = a.item_id
    where a.status in ('active', 'hold')
      and coalesce(c.status, 'active') = 'active'           -- campaña nueva que aún no tiene métricas: se toma como activa
      and a.synced_at > now() - interval '2 days'           -- anuncios que siguen existiendo
      and coalesce(a.logistic_type, '') = 'fulfillment'
  )
  select a.item_id, coalesce(i.title, a.title), i.permalink, a.campaign_id, coalesce(a.campaign_name, 'Campaña ' || a.campaign_id), a.status, i.status,
    a.disp, a.trans, u.d + 1,
    coalesce(g.g7, 0), coalesce(g.ghoy, 0), g.ult,
    -- ningún otro anuncio de la campaña tiene stock: conviene pausar la campaña completa
    not exists (select 1 from ads b where b.campaign_id = a.campaign_id and b.disp > 0),
    exists (select 1 from publicidad_avisos p where p.item_id = a.item_id and p.agotado_desde = coalesce(u.d + 1, date '2000-01-01'))
  from ads a
  left join meli_items i on i.item_id = a.item_id
  left join ult_con_stock u on u.item_id = a.item_id
  left join gasto g on g.item_id = a.item_id
  where a.tiene_foto and a.disp = 0
    and coalesce(i.status, '') <> 'closed'
    and (a.status = 'active' or u.d >= (select d from ultima) - 14)
    and (public.is_allowed() or auth.role() = 'service_role' or current_user in ('postgres', 'supabase_admin'))
  order by a.status = 'active' desc, coalesce(g.g7, 0) desc;
$$;

-- Para la notificación: devuelve solo los que aún no se avisaron y los marca como avisados.
create or replace function public.publicidad_sin_stock_avisar()
returns table(item_id text, title text, campaign_name text, ad_status text, en_transito integer, gasto_7d numeric, campana_sin_stock boolean)
language plpgsql security definer set search_path to 'public' as $$
#variable_conflict use_column
begin
  if not (public.is_allowed() or auth.role() = 'service_role' or current_user in ('postgres', 'supabase_admin')) then
    raise exception 'sin permiso';
  end if;
  return query
  with nuevos as (select * from public.publicidad_sin_stock() p where not p.avisado),
  ins as (
    insert into public.publicidad_avisos (item_id, agotado_desde, campaign_id)
    select n.item_id, coalesce(n.agotado_desde, date '2000-01-01'), n.campaign_id from nuevos n
    on conflict do nothing
  )
  select n.item_id, n.title, n.campaign_name, n.ad_status, n.en_transito, n.gasto_7d, n.campana_sin_stock from nuevos n;
end;
$$;
revoke all on function public.publicidad_sin_stock_avisar() from public, anon;

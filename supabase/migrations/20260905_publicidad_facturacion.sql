-- Publicidad (Product Ads) por día, campaña y publicación, y cargos de facturación de Mercado Libre.

create table if not exists public.meli_ads_daily (
  fecha date not null, campaign_id bigint not null, campaign_name text, status text,
  cost numeric not null default 0, clicks integer not null default 0, prints integer not null default 0, units integer not null default 0,
  direct_amount numeric not null default 0, indirect_amount numeric not null default 0, total_amount numeric not null default 0,
  daily_budget numeric, acos_target numeric, synced_at timestamptz not null default now(),
  primary key (fecha, campaign_id)
);
create table if not exists public.meli_ads_items_daily (
  fecha date not null, item_id text not null, campaign_id bigint, title text,
  cost numeric not null default 0, clicks integer not null default 0, prints integer not null default 0, units integer not null default 0,
  direct_amount numeric not null default 0, indirect_amount numeric not null default 0, total_amount numeric not null default 0,
  synced_at timestamptz not null default now(),
  primary key (fecha, item_id)
);
create table if not exists public.meli_billing_details (
  detail_id bigint primary key, period_key date not null, creation_date timestamptz, detail_type text, detail_sub_type text,
  transaction_detail text, amount numeric not null default 0, debited_from_operation boolean not null default false,
  order_id bigint, document_id bigint, raw jsonb, synced_at timestamptz not null default now()
);
create index if not exists meli_billing_details_creation_idx on public.meli_billing_details (creation_date);
create table if not exists public.meli_billing_periods (
  period_key date primary key, date_from date, date_to date, total_amount numeric, unpaid_amount numeric,
  charges jsonb not null default '[]'::jsonb, bonuses jsonb not null default '[]'::jsonb, raw jsonb, synced_at timestamptz not null default now()
);
do $$ declare t text; begin
  foreach t in array array['meli_ads_daily','meli_ads_items_daily','meli_billing_details','meli_billing_periods'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists allowed_read on public.%I', t);
    execute format('create policy allowed_read on public.%I for select using (public.is_allowed())', t);
  end loop;
end $$;

-- Publicidad del mes por producto (publicaciones mapeadas) y total.
create or replace function public.publicidad_mes(p_mes date)
returns table(product_id integer, cost numeric, clicks bigint, prints bigint, units bigint, total_amount numeric, dias bigint)
language sql stable set search_path to 'public' as $$
  select i.product_id, sum(a.cost), sum(a.clicks), sum(a.prints), sum(a.units), sum(a.total_amount), count(distinct a.fecha)
  from public.meli_ads_items_daily a
  left join public.meli_items i on i.item_id = a.item_id
  where a.fecha >= date_trunc('month', p_mes)::date and a.fecha < (date_trunc('month', p_mes) + interval '1 month')::date
  group by i.product_id;
$$;

-- Cargos de Mercado Libre del mes que NO se descuentan de cada venta (almacenamiento Full, retiros, eShop, devoluciones...).
-- Se excluye la publicidad porque se toma de las métricas de Product Ads.
create or replace function public.cargos_ml_mes(p_mes date)
returns table(detail_sub_type text, concepto text, amount numeric, n bigint)
language sql stable set search_path to 'public' as $$
  select d.detail_sub_type, min(d.transaction_detail), sum(d.amount), count(*)
  from public.meli_billing_details d
  where d.creation_date >= date_trunc('month', p_mes) and d.creation_date < date_trunc('month', p_mes) + interval '1 month'
    and not d.debited_from_operation
    and coalesce(d.detail_sub_type, '') not in ('PADS', 'CDLIT', 'BDLIT')
    and coalesce(d.detail_type, '') <> 'BONUS'
  group by d.detail_sub_type
  order by 3 desc;
$$;

-- Gastos del mes capturados a mano (lo que no viene de Mercado Libre: cajas, sueldos, envíos, contabilidad extra...).
create table if not exists public.gastos_mensuales (
  id bigserial primary key,
  mes date not null,
  concepto text not null,
  monto numeric not null check (monto >= 0),
  nota text,
  created_at timestamptz not null default now()
);
create index if not exists gastos_mensuales_mes_idx on public.gastos_mensuales (mes);
alter table public.gastos_mensuales enable row level security;
drop policy if exists allowed_all on public.gastos_mensuales;
create policy allowed_all on public.gastos_mensuales for all using (public.is_allowed()) with check (public.is_allowed());

-- Cargos netos de bonificaciones (BV anula CV, BFF anula CFF...).
create or replace function public.cargos_ml_mes(p_mes date)
returns table(detail_sub_type text, concepto text, amount numeric, n bigint)
language sql stable set search_path to 'public' as $$
  with base as (
    select case when d.detail_type = 'BONUS' then regexp_replace(coalesce(d.detail_sub_type, ''), '^B', 'C') else coalesce(d.detail_sub_type, '') end as familia,
      case when d.detail_type = 'BONUS' then -d.amount else d.amount end as monto,
      case when d.detail_type = 'BONUS' then null else d.transaction_detail end as concepto
    from public.meli_billing_details d
    where d.creation_date >= date_trunc('month', p_mes) and d.creation_date < date_trunc('month', p_mes) + interval '1 month'
      and not d.debited_from_operation
      and coalesce(d.detail_sub_type, '') not in ('PADS', 'CDLIT', 'BDLIT')
  )
  select familia, coalesce(min(concepto), familia), sum(monto), count(*)
  from base group by familia having abs(sum(monto)) >= 0.01
  order by 3 desc;
$$;

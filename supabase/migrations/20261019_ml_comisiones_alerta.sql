-- Aviso cuando Mercado Libre cambia su comisión por tipo de publicación (Premium = gold_pro, Clásica = gold_special).
-- Se toma el % real de cada venta directa (sale_fee ÷ precio unitario) y se compara con el último % ya revisado.
-- Al marcarlo revisado, el % actual queda como conocido y el aviso desaparece hasta el siguiente cambio.
-- Se ignoran precios menores a $300: ahí ML suma un cargo fijo por unidad y el % no es comparable.

insert into public.settings (key, value) values ('ml_comisiones_conocidas', '{"gold_pro": 19.5, "gold_special": 15}'::jsonb)
on conflict (key) do nothing;

create or replace function public.ml_comisiones_alerta()
returns table(listing_type text, pct_actual numeric, pct_conocido numeric, desde date, ordenes bigint)
language sql stable security definer set search_path to 'public' as $$
  with ventas as (
    select oi.listing_type, (o.date_created at time zone 'America/Mexico_City')::date fecha, o.date_created,
      round(100 * oi.sale_fee / oi.unit_price, 1) pct
    from meli_order_items oi join meli_orders o using (order_id)
    where o.status = 'paid' and oi.sale_fee > 0 and oi.unit_price >= 300 and oi.listing_type is not null
      and o.date_created >= now() - interval '60 days'
  ),
  ultimo as (select distinct on (v.listing_type) v.listing_type, v.pct from ventas v order by v.listing_type, v.date_created desc),
  conocido as (select value j from settings where key = 'ml_comisiones_conocidas')
  select u.listing_type, u.pct, (c.j ->> u.listing_type)::numeric,
    (select min(v.fecha) from ventas v where v.listing_type = u.listing_type and v.pct = u.pct
       and v.date_created > coalesce((select max(w.date_created) from ventas w where w.listing_type = u.listing_type and w.pct <> u.pct), '-infinity')),
    (select count(*) from ventas v where v.listing_type = u.listing_type and v.pct = u.pct)
  from ultimo u cross join conocido c
  where ((c.j ->> u.listing_type) is null or abs(u.pct - (c.j ->> u.listing_type)::numeric) >= 0.2)
    and (public.is_allowed() or auth.role() = 'service_role');
$$;

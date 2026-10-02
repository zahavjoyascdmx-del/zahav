-- Los pagos de órdenes canceladas se quedaban congelados con el estado que tenían al sincronizarse (aprobado),
-- así que nunca se veía si Mercado Pago los reembolsó o si el dinero se liberó de todos modos (reventa).
-- Ahora se vuelven a consultar mientras la orden tenga menos de 60 días y el pago siga "approved".
create or replace function public.pending_payments(p_limit integer default 300)
returns table(order_id bigint, payment_id bigint)
language sql security definer set search_path to 'public' as $$
  select x.order_id, x.payment_id from (
    select o.order_id, pid as payment_id, o.date_created
    from public.meli_orders o
    cross join lateral unnest(o.payment_ids) as pid
    left join public.meli_payments mp on mp.payment_id = pid
    where o.status in ('paid', 'partially_refunded')
      and (mp.payment_id is null
        or (mp.charges = '[]'::jsonb and o.date_created > now() - interval '7 days' and mp.synced_at < now() - interval '3 hours'))
    union
    -- canceladas: la orden ya no trae payment_ids, se toman de los pagos ya guardados
    select o.order_id, mp.payment_id, o.date_created
    from public.meli_orders o
    join public.meli_payments mp on mp.order_id = o.order_id
    where o.status = 'cancelled' and mp.status = 'approved'
      and o.date_created > now() - interval '60 days' and mp.synced_at < now() - interval '12 hours'
  ) x
  order by x.date_created desc
  limit p_limit;
$$;

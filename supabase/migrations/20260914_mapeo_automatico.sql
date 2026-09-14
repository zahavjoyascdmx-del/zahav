-- Las líneas de orden nuevas quedaban sin producto/variante hasta que alguien pulsaba "Re-mapear catálogo":
-- la sincronización no ejecuta map_catalog(). Desde el 4 de septiembre 107 ventas no aparecían en el reporte
-- mensual, "Qué pedir" ni Bodega.
--  1) Trigger: al insertar/actualizar una línea de orden se le asigna la variante a partir de la variación de
--     Mercado Libre (o de la publicación si no tiene variaciones). Inmediato y barato.
--  2) Cron horario (a los 20 min, después del incremental de las :07) que ejecuta map_catalog() completo para
--     publicaciones y variaciones nuevas y para las líneas que solo se resuelven por título.
--  3) Re-mapeo inmediato de lo pendiente.

create or replace function public.order_item_asignar_variante()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.variant_id is null then
    if coalesce(new.variation_id, 0) <> 0 then
      select v.variant_id into new.variant_id from public.meli_variations v where v.variation_id = new.variation_id;
    else
      select i.variant_id into new.variant_id from public.meli_items i where i.item_id = new.item_id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists order_item_variante on public.meli_order_items;
create trigger order_item_variante
  before insert or update on public.meli_order_items
  for each row execute function public.order_item_asignar_variante();

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'catalog-map-hourly';
  perform cron.schedule('catalog-map-hourly', '20 * * * *', 'select public.map_catalog()');
end $$;

do $$ begin perform public.map_catalog(); end $$;

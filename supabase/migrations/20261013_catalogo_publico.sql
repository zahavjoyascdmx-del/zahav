-- Catálogo público para la tienda (/tienda), sin login.
-- Solo expone lo que ya es público en Mercado Libre (título, fotos, precio, tallas, enlace) y los datos de contacto
-- del negocio. Nunca costos, gramos, proveedores, stock exacto ni ventas.
-- Una ficha por producto: si un producto tiene varias publicaciones activas (clásica/premium, etc.) se usa la más vendida.
create or replace function public.catalogo_publico()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with pubs as (
    select distinct on (coalesce(i.product_id::text, i.item_id))
      i.*, p.kilates, p.category as categoria
    from public.meli_items i
    left join public.products p on p.id = i.product_id
    where i.status = 'active' and i.available_quantity > 0
    order by coalesce(i.product_id::text, i.item_id), i.sold_quantity desc, i.item_id
  )
  select jsonb_build_object(
    'productos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.item_id,
        'titulo', x.title,
        'precio', x.price,
        'precio_original', nullif(x.raw->>'original_price', '')::numeric,
        'enlace', x.permalink,
        'kilates', x.kilates,
        'categoria', x.categoria,
        'full', x.logistic_type = 'fulfillment',
        'envio_gratis', coalesce((x.raw->'shipping'->>'free_shipping')::boolean, false),
        'vendidos', x.sold_quantity,
        'material', (select a->>'value_name' from jsonb_array_elements(x.raw->'attributes') a
                     where a->>'id' in ('MATERIAL', 'MAIN_MATERIAL') limit 1),
        'fotos', coalesce((select jsonb_agg(f->>'secure_url') from (
                    select f from jsonb_array_elements(x.raw->'pictures') f limit 10) s), '[]'::jsonb),
        'tallas', coalesce((select jsonb_agg(jsonb_build_object('talla', v.talla, 'color', v.color, 'disponible', v.available_quantity > 0)
                             order by nullif(regexp_replace(v.talla, '[^0-9.]', '', 'g'), '')::numeric nulls last, v.talla)
                            from public.meli_variations v where v.item_id = x.item_id), '[]'::jsonb)
      ) order by x.sold_quantity desc)
      from pubs x
    ), '[]'::jsonb),
    'negocio', (select jsonb_build_object('nombre', s.value->>'nombre', 'ciudad', s.value->>'ciudad', 'whatsapp', s.value->>'whatsapp',
                                          'instagram', s.value->>'instagram', 'correo', s.value->>'correo')
                from public.settings s where s.key = 'negocio')
  );
$$;

revoke all on function public.catalogo_publico() from public;
grant execute on function public.catalogo_publico() to anon, authenticated;

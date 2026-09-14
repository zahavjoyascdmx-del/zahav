-- Colectas (envíos a Full) importadas desde el CSV "Inbound-<id>-detail_report" de Mercado Libre.
-- El descuento de bodega se hace con las unidades declaradas de cada talla; una vez por colecta.

create table if not exists public.bodega_inbounds (
  inbound_id text primary key,
  estado text,
  fecha_recepcion timestamptz,
  piezas_declaradas integer not null default 0,
  piezas_procesadas integer not null default 0,
  descontado boolean not null default false,
  piezas_descontadas integer not null default 0,
  nota text,
  subido_por text,
  subido_at timestamptz not null default now()
);
create table if not exists public.bodega_inbound_items (
  inbound_id text not null references public.bodega_inbounds(inbound_id) on delete cascade,
  inventory_id text not null,
  variant_id integer references public.variants(id),
  sku text, item_id text, variante text,
  declaradas integer not null default 0, procesadas integer not null default 0, aptas integer not null default 0, no_aptas integer not null default 0,
  descontado integer not null default 0,
  primary key (inbound_id, inventory_id)
);
alter table public.bodega_inbounds enable row level security;
alter table public.bodega_inbound_items enable row level security;
drop policy if exists allowed_all on public.bodega_inbounds;
drop policy if exists allowed_all on public.bodega_inbound_items;
create policy allowed_all on public.bodega_inbounds for all using (public.is_allowed()) with check (public.is_allowed());
create policy allowed_all on public.bodega_inbound_items for all using (public.is_allowed()) with check (public.is_allowed());

-- La detección por foto diaria queda solo informativa: el descuento real viene del CSV de la colecta.
update public.settings set value = 'false'::jsonb, updated_at = now() where key = 'bodega_descuento_auto';

/**
 * p_rows: [{inventory_id, sku, item_id, variante, declaradas, procesadas, aptas, no_aptas}], p_meta: {inbound_id, estado, fecha_recepcion}.
 * Si p_descontar y la colecta no se había descontado, resta de la bodega las unidades declaradas por talla.
 */
create or replace function public.bodega_importar_inbound(p_meta jsonb, p_rows jsonb, p_descontar boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_id text := p_meta ->> 'inbound_id';
  v_ya boolean;
  r record; v_casa int; v_delta int; v_total int := 0; v_sin_mapear int := 0;
begin
  if not public.is_allowed() then raise exception 'No autorizado'; end if;
  if v_id is null or v_id = '' then raise exception 'CSV sin ID de envío'; end if;

  insert into public.bodega_inbounds (inbound_id, estado, fecha_recepcion, subido_por)
  values (v_id, p_meta ->> 'estado', nullif(p_meta ->> 'fecha_recepcion', '')::timestamptz, lower(coalesce(auth.jwt() ->> 'email', 'sistema')))
  on conflict (inbound_id) do update set estado = excluded.estado, fecha_recepcion = coalesce(excluded.fecha_recepcion, public.bodega_inbounds.fecha_recepcion);
  select descontado into v_ya from public.bodega_inbounds where inbound_id = v_id;

  insert into public.bodega_inbound_items (inbound_id, inventory_id, variant_id, sku, item_id, variante, declaradas, procesadas, aptas, no_aptas)
  select v_id, x.inventory_id,
    coalesce(mv.variant_id, mi.variant_id, (select va.id from public.variants va join public.meli_items i2 on i2.product_id = va.product_id
                                             where i2.item_id = x.item_id and va.color = split_part(x.variante, '|', 1) and va.talla = split_part(x.variante, '|', 2) limit 1)),
    x.sku, x.item_id, x.variante, x.declaradas, x.procesadas, x.aptas, x.no_aptas
  from jsonb_to_recordset(p_rows) as x(inventory_id text, sku text, item_id text, variante text, declaradas int, procesadas int, aptas int, no_aptas int)
  left join public.meli_variations mv on mv.inventory_id = x.inventory_id
  left join public.meli_items mi on mi.inventory_id = x.inventory_id
  on conflict (inbound_id, inventory_id) do update set variant_id = coalesce(public.bodega_inbound_items.variant_id, excluded.variant_id),
    sku = excluded.sku, item_id = excluded.item_id, variante = excluded.variante,
    declaradas = excluded.declaradas, procesadas = excluded.procesadas, aptas = excluded.aptas, no_aptas = excluded.no_aptas;

  update public.bodega_inbounds b set piezas_declaradas = s.d, piezas_procesadas = s.p
  from (select sum(declaradas) d, sum(procesadas) p from public.bodega_inbound_items where inbound_id = v_id) s where b.inbound_id = v_id;

  select count(*) into v_sin_mapear from public.bodega_inbound_items where inbound_id = v_id and variant_id is null;

  if p_descontar and not v_ya then
    perform set_config('app.mov_kind', 'a_full', true);
    perform set_config('app.mov_ref', 'inbound:' || v_id, true);
    perform set_config('app.mov_note', 'Colecta ' || v_id || ' enviada a Full', true);
    for r in select * from public.bodega_inbound_items where inbound_id = v_id and variant_id is not null and declaradas > 0 loop
      insert into public.stock_bodega (variant_id, casa) values (r.variant_id, 0) on conflict (variant_id) do nothing;
      select casa into v_casa from public.stock_bodega where variant_id = r.variant_id;
      v_delta := least(r.declaradas, v_casa);
      if v_delta > 0 then
        update public.stock_bodega set casa = casa - v_delta, updated_at = now() where variant_id = r.variant_id;
        update public.bodega_inbound_items set descontado = v_delta where inbound_id = v_id and inventory_id = r.inventory_id;
        v_total := v_total + v_delta;
      end if;
    end loop;
    update public.bodega_inbounds set descontado = true, piezas_descontadas = v_total where inbound_id = v_id;
  end if;
  return jsonb_build_object('inbound_id', v_id, 'descontado', p_descontar and not v_ya, 'piezas_descontadas', v_total, 'ya_estaba', v_ya, 'sin_mapear', v_sin_mapear);
end $$;

/** Devuelve a la bodega lo descontado por una colecta. */
create or replace function public.bodega_deshacer_inbound(p_inbound_id text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r record;
begin
  if not public.is_allowed() then raise exception 'No autorizado'; end if;
  perform set_config('app.mov_kind', 'a_full', true);
  perform set_config('app.mov_ref', 'inbound:' || p_inbound_id, true);
  perform set_config('app.mov_note', 'Colecta ' || p_inbound_id || ' deshecha por el usuario', true);
  for r in select * from public.bodega_inbound_items where inbound_id = p_inbound_id and descontado > 0 loop
    update public.stock_bodega set casa = casa + r.descontado, updated_at = now() where variant_id = r.variant_id;
  end loop;
  update public.bodega_inbound_items set descontado = 0 where inbound_id = p_inbound_id;
  update public.bodega_inbounds set descontado = false, piezas_descontadas = 0 where inbound_id = p_inbound_id;
end $$;

-- Ingresos a Full por la foto de stock (corrige 20261012_bodega_entradas_full).
--
-- Las operaciones TRANSFER_DELIVERY de ML no sirven para cuadrar colectas: cada colecta llega a Danhos y ML la reparte
-- en varios traslados internos con su propio número (79…), y además el endpoint de operaciones responde 429 (over quota)
-- muy seguido, así que se pierden piezas. La señal confiable es la foto diaria de Full: lo que sube por talla
-- (disponible + en traslado) de un día a otro es lo que llegó. Los traslados entre bodegas de ML no cambian ese total.
-- Cuadra exacto con las colectas: 7-sep 115 (76222771), 8-oct 122 (78735101), 10-oct 52 (78968345).
--
-- Un día cuenta como llegada de colecta si suben al menos `full_ingreso_minimo` piezas (5); abajo de eso son
-- devoluciones de clientes o ajustes de ML y no se restan de la bodega.

insert into public.settings (key, value) values ('full_ingreso_minimo', '5'::jsonb), ('bodega_full_desde_fecha', '"2026-10-12"'::jsonb)
on conflict (key) do nothing;
update public.settings set value = 'true'::jsonb, updated_at = now() where key = 'bodega_descuento_auto';

alter table public.bodega_envios_full add column if not exists faltante integer not null default 0;  -- piezas que no había en bodega

-- Número de colecta (de ML) que el usuario asigna a cada día de llegada, para compararlo con Mercado Libre.
create table if not exists public.full_llegadas (
  fecha date primary key,
  colecta text,
  nota text,
  updated_at timestamptz not null default now()
);
alter table public.full_llegadas enable row level security;
drop policy if exists allowed_all on public.full_llegadas;
create policy allowed_all on public.full_llegadas for all using (public.is_allowed()) with check (public.is_allowed());

/** Piezas que subieron en Full por talla y día (disponible + en traslado contra la foto anterior). */
create or replace function public.full_ingresos(p_desde date, p_hasta date)
returns table(fecha date, inventory_id text, variant_id integer, piezas integer)
language sql stable security definer set search_path to 'public' as $$
  with s as (
    select snapshot_date d, inventory_id, available + in_transit t
    from public.meli_stock_snapshots where snapshot_date between p_desde - 15 and p_hasta
  ),
  p as (select s.*, lag(t) over (partition by inventory_id order by d) prev_t from s),
  primera as (select min(snapshot_date) d from public.meli_stock_snapshots)
  select p.d, p.inventory_id, coalesce(mv.variant_id, mi.variant_id), (p.t - coalesce(p.prev_t, 0))::int
  from p
  left join public.meli_variations mv on mv.inventory_id = p.inventory_id
  left join public.meli_items mi on mi.inventory_id = p.inventory_id and mv.inventory_id is null
  where p.d between p_desde and p_hasta and p.t > coalesce(p.prev_t, 0)
    and (p.prev_t is not null or p.d > (select d from primera))
    and (public.is_allowed() or auth.role() = 'service_role');
$$;

/** Registra lo que llegó a Full en p_fecha y, si es día de colecta, lo resta de la bodega (una sola vez, se puede deshacer). */
create or replace function public.bodega_aplicar_envios_full(p_fecha date default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Mexico_City')::date);
  v_desde date := coalesce((select (value #>> '{}')::date from public.settings where key = 'bodega_full_desde_fecha'), v_fecha);
  v_auto boolean := coalesce((select (value #>> '{}')::boolean from public.settings where key = 'bodega_descuento_auto'), true);
  v_min int := coalesce((select (value #>> '{}')::int from public.settings where key = 'full_ingreso_minimo'), 5);
  v_dia int; r record; v_delta int; v_casa int; v_aplicado int := 0;
begin
  if not (auth.role() = 'service_role' or public.is_allowed()) then raise exception 'No autorizado'; end if;
  perform set_config('app.mov_kind', 'a_full', true);
  perform set_config('app.mov_by', 'sistema', true);

  for r in select * from public.full_ingresos(v_fecha, v_fecha) loop
    insert into public.bodega_envios_full (fecha, inventory_id, variant_id, enviado)
    values (r.fecha, r.inventory_id, r.variant_id, r.piezas)
    on conflict (fecha, inventory_id) do update set enviado = excluded.enviado,
      variant_id = coalesce(public.bodega_envios_full.variant_id, excluded.variant_id), updated_at = now();
  end loop;
  -- tallas que bajaron otra vez durante el día (la foto de hoy se reescribe cada hora)
  update public.bodega_envios_full b set enviado = 0, updated_at = now()
  where b.fecha = v_fecha and b.enviado <> 0
    and not exists (select 1 from public.full_ingresos(v_fecha, v_fecha) f where f.inventory_id = b.inventory_id);

  select coalesce(sum(enviado), 0) into v_dia from public.bodega_envios_full where fecha = v_fecha;
  if v_auto and v_fecha >= v_desde and v_dia >= v_min then
    perform set_config('app.mov_note', 'Llegó a Full el ' || to_char(v_fecha, 'DD/MM') || ' (descuento automático)', true);
    -- solo resta (nunca devuelve): si la talla se vende el mismo día que llegó, la foto baja pero las piezas sí salieron de bodega
    -- lo que no había en bodega queda como faltante (no se vuelve a intentar con piezas que entren después)
    for r in select * from public.bodega_envios_full where fecha = v_fecha and not ignorado and variant_id is not null and enviado > descontado + faltante loop
      perform set_config('app.mov_ref', 'full:' || v_fecha::text || ':' || r.inventory_id, true);
      insert into public.stock_bodega (variant_id, casa) values (r.variant_id, 0) on conflict (variant_id) do nothing;
      select casa into v_casa from public.stock_bodega where variant_id = r.variant_id;
      v_delta := least(r.enviado - r.descontado - r.faltante, v_casa);  -- no dejar la bodega en negativo
      if v_delta > 0 then
        update public.stock_bodega set casa = casa - v_delta, updated_at = now() where variant_id = r.variant_id;
        v_aplicado := v_aplicado + v_delta;
      end if;
      update public.bodega_envios_full set descontado = descontado + v_delta, faltante = enviado - descontado - v_delta, updated_at = now()
      where fecha = v_fecha and inventory_id = r.inventory_id;
    end loop;
  end if;
  return jsonb_build_object('fecha', v_fecha, 'piezas_dia', v_dia, 'descontado', v_aplicado, 'minimo', v_min, 'desde', v_desde, 'auto', v_auto);
end $$;

/** Deshace (devuelve a bodega) o vuelve a aplicar el descuento de toda una llegada (un día). */
create or replace function public.bodega_ignorar_llegada(p_fecha date, p_ignorar boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r record;
begin
  if not public.is_allowed() then raise exception 'No autorizado'; end if;
  perform set_config('app.mov_kind', 'a_full', true);
  if p_ignorar then
    perform set_config('app.mov_note', 'Llegada a Full del ' || to_char(p_fecha, 'DD/MM') || ' deshecha por el usuario', true);
    for r in select * from public.bodega_envios_full where fecha = p_fecha and descontado <> 0 and variant_id is not null loop
      perform set_config('app.mov_ref', 'full:' || p_fecha::text || ':' || r.inventory_id, true);
      update public.stock_bodega set casa = casa + r.descontado, updated_at = now() where variant_id = r.variant_id;
    end loop;
    update public.bodega_envios_full set descontado = 0, faltante = 0, ignorado = true, updated_at = now() where fecha = p_fecha;
  else
    update public.bodega_envios_full set ignorado = false, updated_at = now() where fecha = p_fecha;
    perform public.bodega_aplicar_envios_full(p_fecha);
  end if;
end $$;

-- El CSV de colecta ya no descuenta cuando el descuento automático está prendido (solo registra el detalle).
create or replace function public.bodega_importar_inbound(p_meta jsonb, p_rows jsonb, p_descontar boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_id text := p_meta ->> 'inbound_id';
  v_ya boolean;
  v_auto boolean := coalesce((select (value #>> '{}')::boolean from public.settings where key = 'bodega_descuento_auto'), true);
  r record; v_casa int; v_delta int; v_total int := 0; v_sin_mapear int := 0;
begin
  if not public.is_allowed() then raise exception 'No autorizado'; end if;
  if v_id is null or v_id = '' then raise exception 'CSV sin ID de envío'; end if;
  if v_auto then p_descontar := false; end if;

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

-- Lo basado en TRANSFER_DELIVERY (vista v_ingresos_full, bodega_descontar_full, bodega_ignorar_envio_full y la tabla
-- bodega_full_entregas) ya no se usa y nunca descontó nada. Se puede borrar a mano:
--   drop view if exists public.v_ingresos_full; drop function if exists public.bodega_descontar_full();
--   drop function if exists public.bodega_ignorar_envio_full(text, boolean); drop table if exists public.bodega_full_entregas;

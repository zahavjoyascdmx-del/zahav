-- Descuento automático de bodega por lo que sale hacia Full.
-- Señal: cada día se compara la foto de Full (unidades "en tránsito") con la del día anterior y se suman las
-- unidades que llegaron ese día (operaciones TRANSFER_DELIVERY / INBOUND_RECEPTION). Lo que aumentó salió de la bodega.

create table if not exists public.meli_stock_operations (
  id bigint primary key,
  inventory_id text not null,
  type text not null,
  date_created timestamptz not null,
  fecha date not null,
  qty_available integer not null default 0,
  inbound_id text,
  shipment_id text,
  raw jsonb,
  synced_at timestamptz not null default now()
);
create index if not exists meli_stock_operations_inv_fecha_idx on public.meli_stock_operations (inventory_id, fecha);
alter table public.meli_stock_operations enable row level security;
drop policy if exists allowed_read on public.meli_stock_operations;
create policy allowed_read on public.meli_stock_operations for select using (public.is_allowed());

create table if not exists public.bodega_envios_full (
  fecha date not null,
  inventory_id text not null,
  variant_id integer references public.variants(id),
  enviado integer not null default 0,       -- unidades que salieron hacia Full ese día (estimado por la foto)
  descontado integer not null default 0,    -- unidades ya restadas de la bodega
  ignorado boolean not null default false,  -- el dueño decidió no descontar este envío
  updated_at timestamptz not null default now(),
  primary key (fecha, inventory_id)
);
alter table public.bodega_envios_full enable row level security;
drop policy if exists allowed_all on public.bodega_envios_full;
create policy allowed_all on public.bodega_envios_full for all using (public.is_allowed()) with check (public.is_allowed());

insert into public.settings (key, value) values
  ('bodega_descuento_desde', '"2026-09-10"'::jsonb),
  ('bodega_descuento_auto', 'true'::jsonb)
on conflict (key) do nothing;

-- El log de movimientos toma tipo/referencia/nota de variables de sesión cuando las hay (descuentos automáticos).
create or replace function public.log_stock_bodega()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_delta int; v_pid int;
begin
  v_delta := new.casa - coalesce(old.casa, 0);
  if v_delta = 0 then return new; end if;
  select product_id into v_pid from public.variants where id = new.variant_id;
  insert into public.stock_movements (product_id, variant_id, location, qty, kind, ref, note, created_by)
  values (v_pid, new.variant_id, 'bodega', v_delta,
          coalesce(nullif(current_setting('app.mov_kind', true), ''), case when tg_op = 'INSERT' then 'conteo' else 'ajuste' end),
          nullif(current_setting('app.mov_ref', true), ''),
          coalesce(nullif(current_setting('app.mov_note', true), ''), 'Editado en Bodega'),
          lower(coalesce(auth.jwt() ->> 'email', nullif(current_setting('app.mov_by', true), ''), 'sistema')));
  return new;
end $$;

/**
 * Calcula lo enviado a Full en p_fecha por inventario y aplica a la bodega la diferencia pendiente.
 * enviado = max(0, transito(hoy) - transito(foto anterior) + entregado(hoy)).
 */
create or replace function public.bodega_aplicar_envios_full(p_fecha date default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Mexico_City')::date);
  v_desde date := coalesce((select (value #>> '{}')::date from public.settings where key = 'bodega_descuento_desde'), v_fecha);
  v_auto boolean := coalesce((select (value #>> '{}')::boolean from public.settings where key = 'bodega_descuento_auto'), true);
  v_prev date;
  r record;
  v_delta int; v_casa int; v_aplicado int := 0; v_filas int := 0;
begin
  if not (auth.role() = 'service_role' or public.is_allowed()) then raise exception 'No autorizado'; end if;
  select max(snapshot_date) into v_prev from public.meli_stock_snapshots where snapshot_date < v_fecha;
  if v_prev is null then return jsonb_build_object('fecha', v_fecha, 'msg', 'sin foto anterior'); end if;

  perform set_config('app.mov_kind', 'a_full', true);
  perform set_config('app.mov_note', 'Enviado a Full (descuento automático)', true);
  perform set_config('app.mov_by', 'sistema', true);

  for r in
    with hoy as (select inventory_id, item_id, variation_id, in_transit from public.meli_stock_snapshots where snapshot_date = v_fecha),
    ayer as (select inventory_id, in_transit from public.meli_stock_snapshots where snapshot_date = v_prev),
    ent as (
      select inventory_id, sum(qty_available) as entregado from public.meli_stock_operations
      where fecha = v_fecha and type in ('TRANSFER_DELIVERY', 'INBOUND_RECEPTION') group by inventory_id
    )
    select h.inventory_id,
      coalesce(mv.variant_id, mi.variant_id) as variant_id,
      greatest(0, h.in_transit - coalesce(a.in_transit, 0) + coalesce(e.entregado, 0)) as enviado
    from hoy h
    left join ayer a on a.inventory_id = h.inventory_id
    left join ent e on e.inventory_id = h.inventory_id
    left join public.meli_variations mv on mv.inventory_id = h.inventory_id
    left join public.meli_items mi on mi.item_id = h.item_id and mi.variation_id is null
    where greatest(0, h.in_transit - coalesce(a.in_transit, 0) + coalesce(e.entregado, 0)) > 0
       or exists (select 1 from public.bodega_envios_full b where b.fecha = v_fecha and b.inventory_id = h.inventory_id)
  loop
    insert into public.bodega_envios_full (fecha, inventory_id, variant_id, enviado)
    values (v_fecha, r.inventory_id, r.variant_id, r.enviado)
    on conflict (fecha, inventory_id) do update set enviado = excluded.enviado, variant_id = coalesce(public.bodega_envios_full.variant_id, excluded.variant_id), updated_at = now();
    v_filas := v_filas + 1;

    if v_auto and v_fecha >= v_desde and r.variant_id is not null then
      select enviado - descontado into v_delta from public.bodega_envios_full where fecha = v_fecha and inventory_id = r.inventory_id and not ignorado;
      if v_delta is not null and v_delta <> 0 then
        perform set_config('app.mov_ref', 'full:' || v_fecha::text || ':' || r.inventory_id, true);
        insert into public.stock_bodega (variant_id, casa) values (r.variant_id, 0) on conflict (variant_id) do nothing;
        select casa into v_casa from public.stock_bodega where variant_id = r.variant_id;
        -- no dejar la bodega en negativo: se descuenta lo que haya
        if v_delta > 0 then v_delta := least(v_delta, v_casa); end if;
        if v_delta <> 0 then
          update public.stock_bodega set casa = casa - v_delta, updated_at = now() where variant_id = r.variant_id;
          update public.bodega_envios_full set descontado = descontado + v_delta, updated_at = now() where fecha = v_fecha and inventory_id = r.inventory_id;
          v_aplicado := v_aplicado + v_delta;
        end if;
      end if;
    end if;
  end loop;
  return jsonb_build_object('fecha', v_fecha, 'foto_anterior', v_prev, 'filas', v_filas, 'descontado', v_aplicado, 'auto', v_auto, 'desde', v_desde);
end $$;

/** Deshacer el descuento de un envío (devuelve las piezas a bodega y lo marca como ignorado). */
create or replace function public.bodega_ignorar_envio(p_fecha date, p_inventory_id text, p_ignorar boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r record;
begin
  if not public.is_allowed() then raise exception 'No autorizado'; end if;
  select * into r from public.bodega_envios_full where fecha = p_fecha and inventory_id = p_inventory_id;
  if r is null then return; end if;
  perform set_config('app.mov_kind', 'a_full', true);
  perform set_config('app.mov_ref', 'full:' || p_fecha::text || ':' || p_inventory_id, true);
  if p_ignorar and r.descontado <> 0 and r.variant_id is not null then
    perform set_config('app.mov_note', 'Envío a Full deshecho por el usuario', true);
    update public.stock_bodega set casa = casa + r.descontado, updated_at = now() where variant_id = r.variant_id;
    update public.bodega_envios_full set descontado = 0, ignorado = true, updated_at = now() where fecha = p_fecha and inventory_id = p_inventory_id;
  elsif not p_ignorar then
    update public.bodega_envios_full set ignorado = false, updated_at = now() where fecha = p_fecha and inventory_id = p_inventory_id;
    perform public.bodega_aplicar_envios_full(p_fecha);
  else
    update public.bodega_envios_full set ignorado = p_ignorar, updated_at = now() where fecha = p_fecha and inventory_id = p_inventory_id;
  end if;
end $$;

-- Bodega: entradas de mercancía, descuento automático por envío a Full (operaciones de ML) y piezas menores.
--
-- 1. Entradas: bodega_entrada() suma piezas (no reemplaza el conteo) y queda en el historial como "Entrada".
-- 2. Envíos a Full: cada operación TRANSFER_DELIVERY de Mercado Libre trae el número de envío (inbound_id) y las piezas
--    recibidas por talla. Lo recibido en Full salió de la bodega, así que se resta una sola vez por operación.
--    Solo cuenta lo recibido después del conteo del 12-oct (lo anterior ya estaba fuera de la bodega al contar).
-- 3. Piezas menores (baratas): siguen en bodega pero no suman al total de piezas ni al valor del inventario.

-- ---------------------------------------------------------------- piezas menores
alter table public.products add column if not exists pieza_menor boolean not null default false;
update public.products set pieza_menor = true where name in ('Aretes zirconia piercing 12 pares', 'Pulsera tenis zirconia 4mm');

-- Regresan a bodega las piezas menores que el conteo del 12-oct dejó en 0 (no venían en el Excel porque no se contabilizan).
select set_config('app.mov_kind', 'conteo', true), set_config('app.mov_note', 'Piezas menores: se regresa lo que había antes del conteo', true);
update public.stock_bodega b set casa = x.casa, updated_at = now()
from (values ('Aretes zirconia piercing 12 pares', 'Amarillo', '', 100), ('Pulsera tenis zirconia 4mm', 'Blanco', '16', 30),
             ('Pulsera tenis zirconia 4mm', 'Negro', '16', 15), ('Pulsera tenis zirconia 4mm', 'Rosa', '16', 4)) as x(producto, color, talla, casa)
join public.products p on p.name = x.producto
join public.variants v on v.product_id = p.id and v.color = x.color and v.talla = x.talla
where b.variant_id = v.id and b.casa = 0;
select set_config('app.mov_kind', '', true), set_config('app.mov_note', '', true);

-- ---------------------------------------------------------------- entradas
/** p_items: [{variant_id, qty}]. Suma qty a la bodega de cada talla. */
create or replace function public.bodega_entrada(p_items jsonb, p_nota text default null)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare r record; v_total int := 0;
begin
  if not public.is_allowed() then raise exception 'No autorizado'; end if;
  perform set_config('app.mov_kind', 'entrada', true);
  perform set_config('app.mov_note', coalesce(nullif(trim(p_nota), ''), 'Entrada de mercancía'), true);
  for r in select x.variant_id, sum(x.qty)::int as qty from jsonb_to_recordset(p_items) as x(variant_id int, qty int)
           where x.qty > 0 group by x.variant_id loop
    insert into public.stock_bodega (variant_id, casa) values (r.variant_id, r.qty)
    on conflict (variant_id) do update set casa = public.stock_bodega.casa + excluded.casa, updated_at = now();
    v_total := v_total + r.qty;
  end loop;
  return v_total;
end $$;

-- ---------------------------------------------------------------- envíos a Full desde las operaciones de ML
create table if not exists public.bodega_full_entregas (
  op_id bigint primary key,
  inbound_id text,
  inventory_id text not null,
  variant_id integer references public.variants(id),
  fecha date not null,
  recibidas integer not null default 0,     -- piezas que ML recibió en Full
  descontado integer not null default 0,    -- piezas restadas de la bodega (menos si la bodega no tenía)
  ignorado boolean not null default false,  -- el usuario deshizo el descuento
  created_at timestamptz not null default now()
);
create index if not exists bodega_full_entregas_inbound_idx on public.bodega_full_entregas (inbound_id);
alter table public.bodega_full_entregas enable row level security;
drop policy if exists allowed_all on public.bodega_full_entregas;
create policy allowed_all on public.bodega_full_entregas for all using (public.is_allowed()) with check (public.is_allowed());

-- Desde cuándo se descuenta: el conteo físico del 12-oct.
insert into public.settings (key, value) values ('bodega_full_desde', to_jsonb('2026-10-12T19:23:11Z'::text))
on conflict (key) do update set value = excluded.value, updated_at = now();

/** Resta de la bodega lo que ML recibió en Full (TRANSFER_DELIVERY) y aún no se ha descontado. */
create or replace function public.bodega_descontar_full()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_desde timestamptz := coalesce((select (value #>> '{}')::timestamptz from public.settings where key = 'bodega_full_desde'), now());
  r record; v_casa int; v_delta int; v_total int := 0; v_ops int := 0;
begin
  if not (auth.role() = 'service_role' or public.is_allowed()) then raise exception 'No autorizado'; end if;
  perform set_config('app.mov_kind', 'a_full', true);
  perform set_config('app.mov_by', 'sistema', true);
  for r in
    select o.id, o.inbound_id, o.inventory_id, o.fecha, o.qty_available as qty,
      coalesce(mv.variant_id, mi.variant_id) as variant_id
    from public.meli_stock_operations o
    left join public.meli_variations mv on mv.inventory_id = o.inventory_id
    left join public.meli_items mi on mi.inventory_id = o.inventory_id and mv.inventory_id is null
    where o.type = 'TRANSFER_DELIVERY' and o.date_created >= v_desde and o.qty_available > 0
      and not exists (select 1 from public.bodega_full_entregas e where e.op_id = o.id)
      -- colectas que ya se descontaron subiendo el CSV
      and not exists (select 1 from public.bodega_inbounds b where b.inbound_id = o.inbound_id and b.descontado)
    order by o.date_created
  loop
    v_delta := 0;
    if r.variant_id is not null then
      insert into public.stock_bodega (variant_id, casa) values (r.variant_id, 0) on conflict (variant_id) do nothing;
      select casa into v_casa from public.stock_bodega where variant_id = r.variant_id;
      v_delta := least(r.qty, v_casa);
      if v_delta > 0 then
        perform set_config('app.mov_ref', 'inbound:' || coalesce(r.inbound_id, '?'), true);
        perform set_config('app.mov_note', 'Envío a Full ' || coalesce(r.inbound_id, '') || ' recibido por ML', true);
        update public.stock_bodega set casa = casa - v_delta, updated_at = now() where variant_id = r.variant_id;
      end if;
    end if;
    insert into public.bodega_full_entregas (op_id, inbound_id, inventory_id, variant_id, fecha, recibidas, descontado)
    values (r.id, r.inbound_id, r.inventory_id, r.variant_id, r.fecha, r.qty, v_delta);
    v_total := v_total + v_delta; v_ops := v_ops + 1;
  end loop;
  return jsonb_build_object('operaciones', v_ops, 'descontado', v_total, 'desde', v_desde);
end $$;

/** Deshace (devuelve a bodega) o vuelve a aplicar el descuento de un envío a Full completo. */
create or replace function public.bodega_ignorar_envio_full(p_inbound_id text, p_ignorar boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r record; v_casa int; v_delta int;
begin
  if not public.is_allowed() then raise exception 'No autorizado'; end if;
  perform set_config('app.mov_kind', 'a_full', true);
  perform set_config('app.mov_ref', 'inbound:' || p_inbound_id, true);
  if p_ignorar then
    perform set_config('app.mov_note', 'Envío a Full ' || p_inbound_id || ' deshecho por el usuario', true);
    for r in select * from public.bodega_full_entregas where inbound_id = p_inbound_id and not ignorado loop
      if r.descontado > 0 then
        update public.stock_bodega set casa = casa + r.descontado, updated_at = now() where variant_id = r.variant_id;
      end if;
      update public.bodega_full_entregas set descontado = 0, ignorado = true where op_id = r.op_id;
    end loop;
  else
    perform set_config('app.mov_note', 'Envío a Full ' || p_inbound_id || ' vuelto a descontar', true);
    for r in select * from public.bodega_full_entregas where inbound_id = p_inbound_id and ignorado and variant_id is not null loop
      select casa into v_casa from public.stock_bodega where variant_id = r.variant_id;
      v_delta := least(r.recibidas, coalesce(v_casa, 0));
      if v_delta > 0 then
        update public.stock_bodega set casa = casa - v_delta, updated_at = now() where variant_id = r.variant_id;
      end if;
      update public.bodega_full_entregas set descontado = v_delta, ignorado = false where op_id = r.op_id;
    end loop;
  end if;
end $$;

-- La sincronización de ML (cada hora) ya llama a bodega_aplicar_envios_full; al final ahora también descuenta por envío.
create or replace function public.bodega_aplicar_envios_full(p_fecha date default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Mexico_City')::date);
  v_prev date;
  r record; v_filas int := 0;
begin
  if not (auth.role() = 'service_role' or public.is_allowed()) then raise exception 'No autorizado'; end if;
  select max(snapshot_date) into v_prev from public.meli_stock_snapshots where snapshot_date < v_fecha;
  -- Detección por foto diaria: solo informativa (no descuenta).
  if v_prev is not null then
    for r in
      with hoy as (select inventory_id, item_id, in_transit from public.meli_stock_snapshots where snapshot_date = v_fecha),
      ayer as (select inventory_id, in_transit from public.meli_stock_snapshots where snapshot_date = v_prev),
      ent as (
        select inventory_id,
          sum(qty_available) filter (where type in ('TRANSFER_DELIVERY', 'INBOUND_RECEPTION')) as entregado,
          sum(-qty_available) filter (where type = 'TRANSFER_RESERVATION') as interno
        from public.meli_stock_operations where fecha = v_fecha group by inventory_id
      )
      select h.inventory_id, coalesce(mv.variant_id, mi.variant_id) as variant_id,
        greatest(0, h.in_transit - coalesce(a.in_transit, 0) + coalesce(e.entregado, 0) - coalesce(e.interno, 0)) as enviado
      from hoy h
      left join ayer a on a.inventory_id = h.inventory_id
      left join ent e on e.inventory_id = h.inventory_id
      left join public.meli_variations mv on mv.inventory_id = h.inventory_id
      left join public.meli_items mi on mi.item_id = h.item_id and mi.variation_id is null
      where greatest(0, h.in_transit - coalesce(a.in_transit, 0) + coalesce(e.entregado, 0) - coalesce(e.interno, 0)) > 0
    loop
      insert into public.bodega_envios_full (fecha, inventory_id, variant_id, enviado)
      values (v_fecha, r.inventory_id, r.variant_id, r.enviado)
      on conflict (fecha, inventory_id) do update set enviado = excluded.enviado, variant_id = coalesce(public.bodega_envios_full.variant_id, excluded.variant_id), updated_at = now();
      v_filas := v_filas + 1;
    end loop;
  end if;
  return jsonb_build_object('fecha', v_fecha, 'foto_anterior', v_prev, 'filas', v_filas, 'por_envio', public.bodega_descontar_full());
end $$;

-- El CSV de colecta queda como respaldo: si ML ya descontó ese envío, no se vuelve a descontar.
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
  select descontado or exists (select 1 from public.bodega_full_entregas e where e.inbound_id = v_id and e.descontado > 0)
    into v_ya from public.bodega_inbounds where inbound_id = v_id;

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

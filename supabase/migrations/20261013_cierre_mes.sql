-- Cierre de mes: utilidad, ventas, inventario a costo (inicio y fin de mes), pruebas de cuadre y capital,
-- todo en un JSON para la página "Cierre de mes" y para la rutina de fin de mes (vía cierre_mes_llave).

create or replace function public.cierre_utilidad(p_mes date)
returns jsonb
language sql stable set search_path to 'public' as $$
  with m as (select date_trunc('month', p_mes)::date d1, (date_trunc('month', p_mes) + interval '1 month - 1 day')::date d2),
  r as (select * from public.reporte_mensual((select d1 from m))),
  pub as (select coalesce(sum(cost), 0) total, coalesce(sum(cost) filter (where product_id is null), 0) sin_producto from public.publicidad_mes((select d1 from m))),
  carg as (select coalesce(sum(amount), 0) total from public.cargos_ml_mes((select d1 from m))),
  fij as (select coalesce((select value from public.settings where key = 'gastos_fijos'), '{}'::jsonb) value),
  fij_tot as (select coalesce(sum(v::numeric), 0) total from fij, jsonb_each_text(fij.value) e(k, v) where k <> 'publicidad' or (select total from pub) = 0),
  gm as (select coalesce(sum(monto), 0) total from public.gastos_mensuales where mes = (select d1 from m)),
  dir as (
    select count(*) n, count(*) filter (where costo is not null) con_costo,
      coalesce(sum(precio_total) filter (where costo is not null), 0) - coalesce(sum(costo) filter (where costo is not null), 0) utilidad,
      coalesce(sum(precio_total), 0) venta
    from public.direct_sales, m where estado <> 'cancelada' and fecha between m.d1 and m.d2
  ),
  tot as (
    select coalesce(sum(recibido), 0) recibido, coalesce(sum(piezas), 0) piezas,
      coalesce(sum(piezas * (coalesce(grams, 0) * coalesce(precio_oro, 0) + coalesce(cost_fixed, 0))), 0) material,
      coalesce(sum(piezas * coalesce(insumo_pieza, 0)), 0) insumos
    from r
  ),
  sincosto as (select coalesce(jsonb_agg(jsonb_build_object('producto', producto, 'piezas', piezas, 'recibido', round(recibido))), '[]'::jsonb) lista from r where piezas > 0 and grams is null and coalesce(cost_fixed, 0) = 0),
  oro as (
    select coalesce(jsonb_agg(jsonb_build_object('proveedor', proveedor, 'kilates', kilates, 'precio', precio, 'mes_precio', mes_precio, 'capturado_este_mes', mes_precio = (select d1 from m))), '[]'::jsonb) lista
    from (select distinct proveedor, kilates, precio_oro precio, precio_oro_mes mes_precio from r where piezas > 0 and kilates is not null and grams is not null) x
  )
  select jsonb_build_object(
    'mes', (select d1 from m),
    'recibido', round((select recibido from tot)), 'piezas', (select piezas from tot),
    'material', round((select material from tot)), 'insumos', round((select insumos from tot)),
    'publicidad', round((select total from pub)), 'publicidad_sin_producto', round((select sin_producto from pub)),
    'otros_cargos', round((select total from carg)),
    'gastos_fijos', (select value from fij), 'gastos_fijos_total', round((select total from fij_tot)),
    'gastos_mes', round((select total from gm)),
    'directas', (select jsonb_build_object('n', n, 'con_costo', con_costo, 'sin_costo', n - con_costo, 'utilidad', round(utilidad), 'venta', round(venta)) from dir),
    'utilidad_neta', round((select recibido - material - insumos from tot) - (select total from pub)),
    'utilidad_final', round((select recibido - material - insumos from tot) - (select total from pub) - (select total from carg) - (select total from fij_tot) - (select total from gm) + (select utilidad from dir)),
    'productos_sin_costo', (select lista from sincosto),
    'precios_oro', (select lista from oro)
  );
$$;

create or replace function public.cierre_inventario(p_mes date)
returns jsonb
language sql stable set search_path to 'public' as $$
  with m as (select date_trunc('month', p_mes)::date d1, (date_trunc('month', p_mes) + interval '1 month - 1 day')::date d2, (date_trunc('month', p_mes) - interval '1 day')::date d0),
  costo as (
    select p.id product_id, coalesce(p.grams, 0) * coalesce(gp.precio, 0) + coalesce(p.cost_fixed, 0) costo_u
    from public.products p left join lateral (select precio from public.gold_price_for((select d1 from m), p.proveedor, p.kilates) limit 1) gp on true
  ),
  snap as (
    select (select max(snapshot_date) from public.meli_stock_snapshots where snapshot_date <= (select d0 from m)) f0,
           (select max(snapshot_date) from public.meli_stock_snapshots where snapshot_date <= (select d2 from m)) f1
  ),
  full_f as (
    select s.snapshot_date,
      sum(s.available + coalesce(s.not_available, 0) + coalesce(s.reserved, 0)) piezas,
      round(sum((s.available + coalesce(s.not_available, 0) + coalesce(s.reserved, 0)) * coalesce(c.costo_u, 0))) valor,
      sum(s.in_transit) transito, round(sum(s.in_transit * coalesce(c.costo_u, 0))) valor_transito
    from public.meli_stock_snapshots s
    left join public.meli_items i on i.item_id = s.item_id
    left join costo c on c.product_id = i.product_id
    where s.snapshot_date in ((select f0 from snap), (select f1 from snap))
    group by 1
  ),
  bod as (
    select v.product_id,
      b.casa - coalesce((select sum(sm.qty) from public.stock_movements sm where sm.variant_id = b.variant_id and sm.fecha > (select d2 from m)), 0) casa_fin,
      b.casa - coalesce((select sum(sm.qty) from public.stock_movements sm where sm.variant_id = b.variant_id and sm.fecha > (select d0 from m)), 0) casa_ini
    from public.stock_bodega b join public.variants v on v.id = b.variant_id
  ),
  bod_t as (
    select sum(b.casa_fin) piezas_fin, round(sum(b.casa_fin * coalesce(c.costo_u, 0))) valor_fin,
           sum(b.casa_ini) piezas_ini, round(sum(b.casa_ini * coalesce(c.costo_u, 0))) valor_ini
    from bod b left join costo c on c.product_id = b.product_id
  ),
  ama as (select sum(p.stock_amazon) piezas, round(sum(p.stock_amazon * coalesce(c.costo_u, 0))) valor from public.products p left join costo c on c.product_id = p.id),
  vend as (
    select coalesce(sum(vv.quantity), 0) piezas, round(coalesce(sum(vv.quantity * coalesce(c.costo_u, 0)), 0)) material
    from public.v_ventas vv left join costo c on c.product_id = vv.product_id, m
    where vv.status = 'paid' and vv.fecha between m.d1 and m.d2
  ),
  col as (
    select coalesce(sum(enviado), 0) piezas, coalesce(sum(enviado) filter (where coalesce(descontado, 0) = 0), 0) no_descontadas, count(distinct fecha) dias
    from public.bodega_envios_full, m where fecha between m.d1 and m.d2
  ),
  inb as (
    select count(*) n, coalesce(sum(piezas_declaradas), 0) declaradas, coalesce(sum(piezas_descontadas), 0) descontadas
    from public.bodega_inbounds, m where fecha_recepcion::date between m.d1 and m.d2
  ),
  lib as (
    select coalesce(sum(p.net_received_amount), 0) por_liberar, count(*) pagos
    from public.meli_payments p join public.v_ordenes v on v.order_id = p.order_id
    where v.status = 'paid' and p.status = 'approved' and p.raw->>'money_release_status' = 'pending'
  ),
  deuda as (select coalesce((select (value->>'monto')::numeric from public.settings where key = 'deuda'), 600000) monto),
  ini as (select jsonb_build_object(
      'fecha', (select f0 from snap),
      'full_piezas', f.piezas, 'full_valor', f.valor, 'transito_piezas', f.transito, 'transito_valor', f.valor_transito,
      'bodega_piezas', b.piezas_ini, 'bodega_valor', b.valor_ini,
      'amazon_piezas', a.piezas, 'amazon_valor', a.valor,
      'total', coalesce(f.valor, 0) + coalesce(f.valor_transito, 0) + coalesce(b.valor_ini, 0) + coalesce(a.valor, 0)) j
    from bod_t b, ama a left join full_f f on f.snapshot_date = (select f0 from snap)),
  fin as (select jsonb_build_object(
      'fecha', (select f1 from snap),
      'full_piezas', f.piezas, 'full_valor', f.valor, 'transito_piezas', f.transito, 'transito_valor', f.valor_transito,
      'bodega_piezas', b.piezas_fin, 'bodega_valor', b.valor_fin,
      'amazon_piezas', a.piezas, 'amazon_valor', a.valor,
      'total', coalesce(f.valor, 0) + coalesce(f.valor_transito, 0) + coalesce(b.valor_fin, 0) + coalesce(a.valor, 0)) j
    from bod_t b, ama a left join full_f f on f.snapshot_date = (select f1 from snap))
  select jsonb_build_object(
    'inicio', (select j from ini),
    'fin', (select j from fin),
    'vendidas_piezas', (select piezas from vend),
    'material_vendido', (select material from vend),
    'entradas_full_piezas', case when (select f0 from snap) is null then null else ((select j from fin)->>'full_piezas')::numeric - ((select j from ini)->>'full_piezas')::numeric + (select piezas from vend) end,
    'colectas', (select jsonb_build_object('piezas_detectadas', piezas, 'no_descontadas', no_descontadas, 'dias', dias) from col),
    'inbounds', (select jsonb_build_object('n', n, 'declaradas', declaradas, 'descontadas', descontadas) from inb),
    'mercancia_entrada_costo', case when (select f0 from snap) is null then null else (select material from vend) + (((select j from fin)->>'total')::numeric - ((select j from ini)->>'total')::numeric) end,
    'por_liberar', round((select por_liberar from lib)), 'pagos_por_liberar', (select pagos from lib),
    'deuda', (select monto from deuda),
    'capital', round(((select j from fin)->>'total')::numeric + (select por_liberar from lib) - (select monto from deuda))
  );
$$;

create or replace function public.cierre_mes(p_mes date)
returns jsonb
language sql stable set search_path to 'public' as $$
  with m as (select date_trunc('month', p_mes)::date d1, (date_trunc('month', p_mes) + interval '1 month - 1 day')::date d2,
                    (date_trunc('month', p_mes) - interval '1 month')::date p1, (date_trunc('month', p_mes) - interval '1 day')::date p2)
  select jsonb_build_object(
    'mes', (select d1 from m),
    'utilidad', public.cierre_utilidad((select d1 from m)),
    'utilidad_anterior', public.cierre_utilidad((select p1 from m)),
    'ventas', (select to_jsonb(x) from public.ventas_resumen((select d1 from m), (select d2 from m)) x),
    'ventas_anterior', (select to_jsonb(x) from public.ventas_resumen((select p1 from m), (select p2 from m)) x),
    'inventario', public.cierre_inventario((select d1 from m))
  );
$$;

-- Versión con llave para la rutina de fin de mes (sin sesión de usuario). La llave vive en private.sync_secrets ('cierre_key').
create or replace function public.cierre_mes_llave(p_mes date, p_llave text)
returns jsonb
language plpgsql stable security definer set search_path to 'public', 'private' as $$
begin
  if p_llave is null or p_llave <> (select value from private.sync_secrets where key = 'cierre_key') then
    raise exception 'llave incorrecta';
  end if;
  return public.cierre_mes(p_mes);
end;
$$;
grant execute on function public.cierre_mes_llave(date, text) to anon, authenticated;

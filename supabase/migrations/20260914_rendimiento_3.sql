-- Resumen anual (reporte_por_mes): el precio del oro se buscaba línea por línea (~4,900 llamadas a gold_price_for).
-- Ahora se resuelve una vez por combinación mes × proveedor × kilates (unas 80) y se une a las líneas. Mismo resultado.
create or replace function public.reporte_por_mes(p_meses integer default 13)
returns table(mes date, ordenes bigint, piezas numeric, venta numeric, comision numeric, envio numeric, ret_iva numeric, ret_isr numeric, cupon numeric, neto_recibido numeric, material numeric, insumos numeric, sin_costo bigint, utilidad numeric, canceladas bigint, directas_n bigint, directas numeric, directas_cobrado numeric)
language sql stable set search_path to 'public' as $$
  with desde as (select (date_trunc('month', (now() at time zone 'America/Mexico_City')::date) - make_interval(months => p_meses - 1))::date d),
  lineas as (
    select date_trunc('month', vv.fecha)::date mes, vv.quantity, p.id pid, p.grams, p.cost_fixed, p.insumo_pieza, p.proveedor, p.kilates
    from public.v_ventas vv left join public.products p on p.id = vv.product_id
    where vv.status = 'paid' and vv.fecha >= (select d from desde)
  ),
  combos as (
    select distinct l.mes, l.proveedor, l.kilates from lineas l where l.kilates is not null and l.grams is not null
  ),
  precios as (
    select c.mes, c.proveedor, c.kilates, gp.precio
    from combos c
    left join lateral (select precio from public.gold_price_for(c.mes, c.proveedor, c.kilates) limit 1) gp on true
  ),
  mat as (
    select l.mes,
      sum(l.quantity * (coalesce(l.grams, 0) * coalesce(pr.precio, 0) + coalesce(l.cost_fixed, 0))) material,
      sum(l.quantity * coalesce(l.insumo_pieza, 0)) insumos,
      count(*) filter (where l.pid is null or (l.grams is null and coalesce(l.cost_fixed, 0) = 0)) sin_costo
    from lineas l
    left join precios pr on pr.mes = l.mes and pr.proveedor = l.proveedor and pr.kilates = l.kilates and l.grams is not null
    group by l.mes
  ),
  ml as (select * from public.ventas_por_mes(p_meses)),
  dir as (
    select date_trunc('month', fecha)::date mes, count(*) n, sum(precio_total) total, sum(pagado) cobrado
    from public.direct_sales where estado <> 'cancelada' and fecha >= (select d from desde) group by 1
  )
  select ml.mes, ml.ordenes, ml.piezas, ml.venta, ml.comision, ml.envio, ml.ret_iva, ml.ret_isr, ml.cupon, ml.neto_recibido,
    coalesce(mat.material, 0), coalesce(mat.insumos, 0), coalesce(mat.sin_costo, 0),
    ml.neto_recibido - coalesce(mat.material, 0) - coalesce(mat.insumos, 0),
    ml.canceladas, coalesce(dir.n, 0), coalesce(dir.total, 0), coalesce(dir.cobrado, 0)
  from ml left join mat on mat.mes = ml.mes left join dir on dir.mes = ml.mes
  order by ml.mes desc;
$$;

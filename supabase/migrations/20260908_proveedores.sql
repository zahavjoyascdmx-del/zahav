-- Proveedores reales según la dueña:
--   Bogos: Atenas, Madrid y Roma.
--   Dinasti: Paris, Istanbul, Churumbela 10k 2mm (amarillo y blanco) y Milán.
--   China: plata con moissanita.
--   Argollas: todas las argollas de matrimonio 10k y 14k.
--   Fabricación propia: anillos de compromiso con diamante natural.
begin;

update public.products set proveedor = 'Bogos' where name = 'Anillo Roma 10k';
update public.products set proveedor = 'Dinasti' where proveedor = 'Anillos';
update public.products set proveedor = 'China' where proveedor = 'Plata';
update public.products set proveedor = 'Fabricación propia' where proveedor = 'Diamante';

-- Historial de precios del oro: mismo renombre (la llave incluye proveedor).
update public.gold_prices set proveedor = 'Dinasti' where proveedor = 'Anillos'
  and not exists (select 1 from public.gold_prices g where g.proveedor = 'Dinasti' and g.mes = gold_prices.mes and g.kilates = gold_prices.kilates);
delete from public.gold_prices where proveedor = 'Anillos';
update public.gold_prices set proveedor = 'Fabricación propia' where proveedor = 'Diamante'
  and not exists (select 1 from public.gold_prices g where g.proveedor = 'Fabricación propia' and g.mes = gold_prices.mes and g.kilates = gold_prices.kilates);
delete from public.gold_prices where proveedor = 'Diamante';
delete from public.gold_prices where proveedor = 'Plata';

commit;

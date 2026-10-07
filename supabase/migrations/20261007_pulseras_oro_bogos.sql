-- Pulseras de oro 10k de Bogos (nuevas publicaciones): torzal, tejido chino, cartier, inglesa y grano de café.
-- Precio del oro de Bogos 10k para octubre 2026: 1314 por gramo.
begin;

insert into public.products (name, category, proveedor, kilates, grams, cost_fixed, insumo_pieza, active, sort_order)
select v.name, 'Pulseras de oro', 'Bogos', '10k', v.grams, 0, 48, true, v.sort_order
from (values
  ('Pulsera Torzal 10k', 0.82, 70),
  ('Pulsera Tejido Chino 10k', 1.00, 71),
  ('Pulsera Cartier 10k', 0.82, 72),
  ('Pulsera Inglesa 10k', 0.65, 73),
  ('Pulsera Grano de Café 10k', 0.51, 74)
) as v(name, grams, sort_order)
where not exists (select 1 from public.products p where p.name = v.name);

-- Reglas para ligar las publicaciones de Mercado Libre en cuanto se sincronicen.
insert into public.product_rules (priority, pattern, product_name)
select v.priority, v.pattern, v.product_name
from (values
  (45, 'Pulsera.*Torzal', 'Pulsera Torzal 10k'),
  (45, 'Pulsera.*\mChin[oa]\M', 'Pulsera Tejido Chino 10k'),
  (45, 'Pulsera.*Cartier', 'Pulsera Cartier 10k'),
  (45, 'Pulsera.*Inglesa', 'Pulsera Inglesa 10k'),
  (45, 'Pulsera.*Grano De Caf[eé]', 'Pulsera Grano de Café 10k')
) as v(priority, pattern, product_name)
where not exists (select 1 from public.product_rules r where r.pattern = v.pattern);

insert into public.gold_prices (mes, proveedor, kilates, precio)
values ('2026-10-01', 'Bogos', '10k', 1314)
on conflict (mes, proveedor, kilates) do update set precio = excluded.precio, updated_at = now();

select public.map_catalog();

commit;

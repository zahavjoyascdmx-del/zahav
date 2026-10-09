-- Bisutería de volumen (proveedor China): piezas baratas solo para generar ventas y bajar el % de reclamos.
-- Categoría "Bisutería (volumen)", separada de lo de oro de ZAHAV en reportes y en Qué pedir; sin caja (insumo_pieza = 0).
-- Solo datos, sin cambios de estructura. Ya se aplicó a mano desde el chat el 9 oct 2026; este archivo es idempotente
-- para que el catálogo no se pierda si se reconstruye la base.

-- 1. Productos
insert into public.products (name, category, proveedor, kilates, grams, cost_fixed, insumo_pieza, sort_order, active)
select v.name, 'Bisutería (volumen)', 'China', null, null, v.cost_fixed, 0, v.sort_order, true
from (values
  ('Pulsera tenis zirconia 4mm', 26.66, 80),          -- $2,666 / 100 pzas (50 blancas, 30 negras, 20 rosas)
  ('Aretes zirconia piercing 12 pares', 95.40, 81)    -- 5.30 USD × $18 por paquete de 12 pares
) as v(name, cost_fixed, sort_order)
where not exists (select 1 from public.products p where p.name = v.name);

-- 2. Variantes
insert into public.variants (product_id, color, talla)
select p.id, v.color, v.talla
from (values
  ('Pulsera tenis zirconia 4mm', 'Blanco', '16'),
  ('Pulsera tenis zirconia 4mm', 'Negro', '16'),
  ('Pulsera tenis zirconia 4mm', 'Rosa', '16'),
  ('Aretes zirconia piercing 12 pares', 'Amarillo', '')
) as v(name, color, talla)
join public.products p on p.name = v.name
where not exists (select 1 from public.variants x where x.product_id = p.id and x.color = v.color and x.talla = v.talla);

-- 3. Stock inicial en bodega (lo que no está en Full al 9 oct 2026); no pisa conteos posteriores
insert into public.stock_bodega (variant_id, casa)
select x.id, v.casa
from (values
  ('Pulsera tenis zirconia 4mm', 'Blanco', '16', 30),
  ('Pulsera tenis zirconia 4mm', 'Negro', '16', 15),
  ('Pulsera tenis zirconia 4mm', 'Rosa', '16', 4),
  ('Aretes zirconia piercing 12 pares', 'Amarillo', '', 100)
) as v(name, color, talla, casa)
join public.products p on p.name = v.name
join public.variants x on x.product_id = p.id and x.color = v.color and x.talla = v.talla
on conflict (variant_id) do nothing;

-- 4. Reglas para ligar publicaciones de Mercado Libre
--    (MLM6342135788, MLM3593067387, MLM6342135786 → pulsera; MLM3565645627 → aretes).
--    "5 Pares Aretes Zirconia Set" (MLM3540810307, MLM3540809175) queda sin producto a propósito: la mercancía no ha llegado.
insert into public.product_rules (priority, pattern, product_name)
select 40, v.pattern, v.product_name
from (values
  ('Pulsera Tenis Con Zirconia', 'Pulsera tenis zirconia 4mm'),
  ('Aretes\s+Zirconia Piercing', 'Aretes zirconia piercing 12 pares')
) as v(pattern, product_name)
where not exists (select 1 from public.product_rules r where r.pattern = v.pattern);

select public.map_catalog();

-- 5. Compras y pagos al proveedor China (saldo en 0)
insert into public.proveedores (nombre) select 'China' where not exists (select 1 from public.proveedores where nombre = 'China');

insert into public.proveedor_movimientos (proveedor_id, tipo, fecha, concepto, monto, nota)
select pr.id, v.tipo, v.fecha::date, v.concepto, v.monto, v.nota
from (values
  ('compra', '2026-09-09', 'Pulseras tenis zirconia 4mm: 50 blancas, 30 negras, 20 rosas (100 pzs)', 2666, 'Costo por pieza $26.66. Bisutería de volumen, separada de ZAHAV oro'),
  ('pago',   '2026-09-09', 'Pago pulseras tenis zirconia 4mm (100 pzs)', 2666, 'Pagado completo; fecha aproximada'),
  ('compra', '2026-10-09', 'Aretes zirconia piercing: 100 pzs', 9540, '5.30 USD por pieza x 18 = $95.40 c/u. Bisutería de volumen, separada de ZAHAV oro'),
  ('pago',   '2026-10-09', 'Pago aretes zirconia piercing (100 pzs)', 9540, 'Pagado completo; fecha exacta no indicada')
) as v(tipo, fecha, concepto, monto, nota)
cross join (select id from public.proveedores where nombre = 'China' order by id limit 1) pr
where not exists (select 1 from public.proveedor_movimientos m where m.proveedor_id = pr.id and m.concepto = v.concepto);

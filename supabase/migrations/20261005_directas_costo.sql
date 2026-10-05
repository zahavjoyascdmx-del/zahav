-- Ventas directas (fuera de Mercado Libre): costo del material capturado a mano.
-- Antes la utilidad de una venta directa era precio − costo del producto del catálogo; como casi todas son
-- piezas a la medida sin producto, el reporte sumaba el precio completo como utilidad. Ahora se captura el costo
-- y la venta solo suma utilidad cuando lo tiene.
alter table public.direct_sales add column if not exists costo numeric;
comment on column public.direct_sales.costo is 'Costo del material/pieza (oro, piedra, hechura). Si está vacío la venta no suma utilidad en el reporte.';

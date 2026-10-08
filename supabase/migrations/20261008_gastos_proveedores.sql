-- Gastos, pagos y deudas a proveedores.
--   gastos_mensuales: ahora con fecha, categoría y método de pago (la columna mes sigue siendo el primer día del mes
--     y es la que usa el reporte mensual para restarlos de la utilidad final).
--   proveedores: a quién le compras (oro, piezas, cajas, servicios).
--   proveedor_movimientos: compras a crédito (aumentan la deuda) y pagos/abonos (la reducen). Saldo = compras − pagos.
--     No se restan en el reporte: el costo de la mercancía ya entra como gramaje × precio del oro.
begin;

alter table public.gastos_mensuales add column if not exists fecha date;
alter table public.gastos_mensuales add column if not exists categoria text not null default 'otro';
alter table public.gastos_mensuales add column if not exists metodo text;
update public.gastos_mensuales set fecha = mes where fecha is null;
alter table public.gastos_mensuales alter column fecha set default (now() at time zone 'America/Mexico_City')::date;

create table if not exists public.proveedores (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  contacto text,
  telefono text,
  notas text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.proveedor_movimientos (
  id bigint generated always as identity primary key,
  proveedor_id bigint not null references public.proveedores(id) on delete cascade,
  tipo text not null check (tipo in ('compra', 'pago')),
  fecha date not null default (now() at time zone 'America/Mexico_City')::date,
  concepto text,
  monto numeric not null check (monto > 0),
  vence date,
  metodo text,
  nota text,
  created_at timestamptz not null default now()
);
create index if not exists proveedor_movimientos_prov_idx on public.proveedor_movimientos (proveedor_id, fecha);

alter table public.proveedores enable row level security;
alter table public.proveedor_movimientos enable row level security;
drop policy if exists allowed_all on public.proveedores;
create policy allowed_all on public.proveedores for all to authenticated using ((select public.is_allowed())) with check ((select public.is_allowed()));
drop policy if exists allowed_all on public.proveedor_movimientos;
create policy allowed_all on public.proveedor_movimientos for all to authenticated using ((select public.is_allowed())) with check ((select public.is_allowed()));

-- Proveedores que ya aparecen en el catálogo.
insert into public.proveedores (nombre)
select distinct proveedor from public.products where proveedor is not null and proveedor <> ''
on conflict (nombre) do nothing;
insert into public.proveedores (nombre, notas) values ('Diamantes', 'Diamantes y piedras') on conflict (nombre) do nothing;

commit;

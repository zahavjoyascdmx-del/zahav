-- Fotos de producto generadas con Higgsfield (GPT Image: edición de una foto real → foto de catálogo / anuncio).

create table if not exists public.imagenes (
  id bigserial primary key,
  item_id text references public.meli_items(item_id) on delete set null,
  product_id integer references public.products(id) on delete set null,
  titulo text not null,
  image_url text not null,                      -- foto de partida (pública)
  prompt text not null,
  model text not null default 'openai/gpt-image-2/edit',
  quality text not null default 'high',
  aspect_ratio text,
  n integer not null default 1,
  status text not null default 'pendiente' check (status in ('pendiente', 'en_cola', 'generando', 'listo', 'error', 'nsfw')),
  request_id text,
  status_url text,
  result_urls text[] not null default '{}',     -- copias en Storage (bucket videos/imagenes)
  source_urls text[] not null default '{}',     -- URLs originales de Higgsfield (caducan)
  error text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists imagenes_status_idx on public.imagenes (status);
alter table public.imagenes enable row level security;
drop policy if exists allowed_all on public.imagenes;
create policy allowed_all on public.imagenes for all using (public.is_allowed()) with check (public.is_allowed());

create or replace function public.generar_imagen(p_id bigint)
returns bigint
language plpgsql security definer set search_path to 'private', 'public', 'extensions' as $$
begin
  if not public.is_allowed() then raise exception 'No autorizado'; end if;
  update public.imagenes set status = 'pendiente', error = null, request_id = null, status_url = null, updated_at = now() where id = p_id;
  return private.call_edge('higgsfield-video', jsonb_build_object('action', 'image', 'id', p_id));
end;
$$;
revoke all on function public.generar_imagen(bigint) from public, anon;
grant execute on function public.generar_imagen(bigint) to authenticated, service_role;

-- El cron higgsfield-poll también revisa imágenes en proceso.
select cron.unschedule(jobid) from cron.job where jobname = 'higgsfield-poll';
select cron.schedule(
  'higgsfield-poll',
  '*/2 * * * *',
  $cron$select private.call_edge('higgsfield-video', '{"action":"poll"}'::jsonb) where exists (select 1 from public.videos where status in ('pendiente', 'en_cola', 'generando')) or exists (select 1 from public.imagenes where status in ('pendiente', 'en_cola', 'generando'))$cron$
);

-- Videos generados con Higgsfield (imagen → video) para Instagram y Mercado Libre.

-- ---------------------------------------------------------------- clave de API (vive en private.sync_secrets)
create or replace function public.higgsfield_set_key(p_key text)
returns void
language plpgsql security definer set search_path to 'private', 'public' as $$
begin
  if not public.is_allowed() then raise exception 'No autorizado'; end if;
  if coalesce(trim(p_key), '') = '' then
    delete from private.sync_secrets where key = 'higgsfield_key';
  else
    insert into private.sync_secrets (key, value) values ('higgsfield_key', trim(p_key))
    on conflict (key) do update set value = excluded.value;
  end if;
end;
$$;
revoke all on function public.higgsfield_set_key(text) from public, anon;
grant execute on function public.higgsfield_set_key(text) to authenticated, service_role;

create or replace function public.higgsfield_has_key()
returns boolean
language sql stable security definer set search_path to 'private', 'public' as $$
  select public.is_allowed() and exists (select 1 from private.sync_secrets where key = 'higgsfield_key' and coalesce(value, '') <> '');
$$;
revoke all on function public.higgsfield_has_key() from public, anon;
grant execute on function public.higgsfield_has_key() to authenticated, service_role;

-- Solo la Edge Function (service_role) puede leer la clave.
create or replace function public.higgsfield_get_key()
returns text
language sql security definer set search_path to 'private', 'public' as $$
  select value from private.sync_secrets where key = 'higgsfield_key';
$$;
revoke all on function public.higgsfield_get_key() from public, anon, authenticated;
grant execute on function public.higgsfield_get_key() to service_role;

-- ---------------------------------------------------------------- tabla de videos
create table if not exists public.videos (
  id bigserial primary key,
  item_id text references public.meli_items(item_id) on delete set null,
  product_id integer references public.products(id) on delete set null,
  destino text not null default 'ig' check (destino in ('ig', 'ml')),
  titulo text not null,
  image_url text not null,
  prompt text not null,
  model text not null default 'dop-turbo',
  aspect_ratio text not null default '9:16',
  duration integer not null default 5,
  motion_id text,
  seed integer,
  status text not null default 'pendiente' check (status in ('pendiente', 'en_cola', 'generando', 'listo', 'error', 'nsfw')),
  request_id text,
  status_url text,
  source_url text,
  video_url text,
  error text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists videos_status_idx on public.videos (status);
alter table public.videos enable row level security;
drop policy if exists allowed_all on public.videos;
create policy allowed_all on public.videos for all using (public.is_allowed()) with check (public.is_allowed());

-- ---------------------------------------------------------------- bucket público para fotos subidas y videos terminados
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', true, 104857600, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists videos_public_read on storage.objects;
create policy videos_public_read on storage.objects for select using (bucket_id = 'videos');
drop policy if exists videos_allowed_write on storage.objects;
create policy videos_allowed_write on storage.objects for insert with check (bucket_id = 'videos' and public.is_allowed());
drop policy if exists videos_allowed_update on storage.objects;
create policy videos_allowed_update on storage.objects for update using (bucket_id = 'videos' and public.is_allowed());
drop policy if exists videos_allowed_delete on storage.objects;
create policy videos_allowed_delete on storage.objects for delete using (bucket_id = 'videos' and public.is_allowed());

-- ---------------------------------------------------------------- disparadores hacia la Edge Function higgsfield-video
create or replace function public.generar_video(p_id bigint)
returns bigint
language plpgsql security definer set search_path to 'private', 'public', 'extensions' as $$
begin
  if not public.is_allowed() then raise exception 'No autorizado'; end if;
  update public.videos set status = 'pendiente', error = null, request_id = null, status_url = null, updated_at = now() where id = p_id;
  return private.call_edge('higgsfield-video', jsonb_build_object('action', 'generate', 'id', p_id));
end;
$$;
revoke all on function public.generar_video(bigint) from public, anon;
grant execute on function public.generar_video(bigint) to authenticated, service_role;

create or replace function public.revisar_videos()
returns bigint
language plpgsql security definer set search_path to 'private', 'public', 'extensions' as $$
begin
  if not public.is_allowed() then raise exception 'No autorizado'; end if;
  return private.call_edge('higgsfield-video', jsonb_build_object('action', 'poll'));
end;
$$;
revoke all on function public.revisar_videos() from public, anon;
grant execute on function public.revisar_videos() to authenticated, service_role;

-- Cada 2 minutos, mientras haya videos en proceso, consulta su estado y guarda el MP4 terminado.
select cron.unschedule(jobid) from cron.job where jobname = 'higgsfield-poll';
select cron.schedule(
  'higgsfield-poll',
  '*/2 * * * *',
  $cron$select private.call_edge('higgsfield-video', '{"action":"poll"}'::jsonb) where exists (select 1 from public.videos where status in ('pendiente', 'en_cola', 'generando'))$cron$
);

-- ---------------------------------------------------------------- Reel armado para Instagram (clip + ficha + ¿Sabías que? + CTA)
alter table public.videos
  add column if not exists reel_url text,
  add column if not exists reel_spec jsonb,
  add column if not exists reel_error text,
  add column if not exists reel_at timestamptz,
  add column if not exists caption text;

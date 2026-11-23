-- Reclamos de Mercado Libre: se guardan con su estado, si afectan la reputación, el plazo para actuar y los
-- mensajes, para atenderlos desde el ERP antes de que venzan. Las acciones (mensaje, disputa, devolución,
-- reembolso, revisión de devolución) se encolan aquí y las ejecuta la Edge Function meli-claims.
--
-- Requiere que la app de ML tenga el permiso "Comunicaciones post venta" (si no, la API responde 403
-- PA_UNAUTHORIZED_RESULT_FROM_POLICIES y la sincronización lo deja anotado en meli_claims_estado).

create table if not exists public.meli_claims (
  claim_id bigint primary key,
  order_id bigint,
  resource text,
  type text,
  stage text,
  status text,
  reason_id text,
  reason_name text,
  reason_detail text,
  fulfilled boolean,
  affects_reputation text,              -- affected | not_affected | ... (respuesta de /affects-reputation)
  has_incentive boolean,                -- si lo resuelves antes de incentive_due_date no afecta
  incentive_due_date timestamptz,
  seller_actions jsonb not null default '[]'::jsonb,  -- available_actions del vendedor (respondent)
  due_date timestamptz,                 -- el plazo más próximo de las acciones del vendedor
  action_responsible text,              -- de /detail: a quién le toca mover el reclamo
  detail_title text,
  detail_description text,
  resolution jsonb,
  related_entities jsonb,
  returns jsonb,
  messages jsonb not null default '[]'::jsonb,
  last_message_at timestamptz,
  last_message_role text,
  date_created timestamptz,
  last_updated timestamptz,
  raw jsonb,
  synced_at timestamptz not null default now()
);
create index if not exists meli_claims_order_idx on public.meli_claims (order_id);
create index if not exists meli_claims_status_idx on public.meli_claims (status, due_date);

-- Una fila por día con las métricas de reputación tal como las da /users/me.
create table if not exists public.meli_reputation (
  fecha date primary key,
  level_id text,
  real_level text,
  power_seller_status text,
  protection_end_date timestamptz,
  ventas_60 integer,
  reclamos integer, reclamos_rate numeric, reclamos_real integer, reclamos_real_rate numeric,
  demoras integer, demoras_rate numeric, demoras_real integer, demoras_real_rate numeric,
  canceladas integer, canceladas_rate numeric, canceladas_real integer, canceladas_real_rate numeric,
  raw jsonb,
  synced_at timestamptz not null default now()
);

-- Cola de acciones sobre reclamos (las escribe el ERP, las ejecuta meli-claims).
create table if not exists public.meli_claim_actions (
  id bigserial primary key,
  claim_id bigint not null,
  action text not null,                 -- send_message | open_dispute | allow_return | refund | partial_refund | return_review_ok | return_review_fail
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pendiente',  -- pendiente | enviada | error
  response jsonb,
  error text,
  created_by text,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists meli_claim_actions_claim_idx on public.meli_claim_actions (claim_id, id desc);

-- Estado de la integración (p. ej. sin permiso de post venta).
insert into public.settings (key, value) values ('meli_claims_estado', '"sin sincronizar"'::jsonb) on conflict (key) do nothing;

alter table public.meli_claims enable row level security;
alter table public.meli_reputation enable row level security;
alter table public.meli_claim_actions enable row level security;
drop policy if exists allowed_all on public.meli_claims;
create policy allowed_all on public.meli_claims for select using (public.is_allowed());
drop policy if exists allowed_all on public.meli_reputation;
create policy allowed_all on public.meli_reputation for select using (public.is_allowed());
drop policy if exists allowed_all on public.meli_claim_actions;
create policy allowed_all on public.meli_claim_actions for select using (public.is_allowed());

-- Encolar una acción y despertar a la Edge Function.
create or replace function public.claim_action(p_claim_id bigint, p_action text, p_payload jsonb default '{}'::jsonb)
returns bigint
language plpgsql security definer set search_path to 'private', 'public', 'extensions' as $$
declare v_id bigint; v_email text;
begin
  if not public.is_allowed() then raise exception 'No autorizado'; end if;
  if p_action not in ('send_message', 'open_dispute', 'allow_return', 'refund', 'partial_refund', 'return_review_ok', 'return_review_fail') then
    raise exception 'Acción no válida: %', p_action;
  end if;
  v_email := coalesce(auth.jwt() ->> 'email', '');
  insert into public.meli_claim_actions (claim_id, action, payload, created_by)
  values (p_claim_id, p_action, coalesce(p_payload, '{}'::jsonb), v_email) returning id into v_id;
  perform private.call_edge('meli-claims', jsonb_build_object('kind', 'actions'));
  return v_id;
end;
$$;

create or replace function public.sync_claims()
returns bigint
language plpgsql security definer set search_path to 'private', 'public', 'extensions' as $$
begin
  if not public.is_allowed() then raise exception 'No autorizado'; end if;
  return private.call_edge('meli-claims', jsonb_build_object('kind', 'sync'));
end;
$$;

-- Vista de trabajo: reclamo + orden + envío + producto, con un caso sugerido para la estrategia.
create or replace view public.v_reclamos with (security_invoker = true) as
with it as (
  select oi.order_id, string_agg(distinct oi.title, ' | ') as titulo,
    string_agg(distinct nullif(concat_ws(' ', v.color, v.talla), ''), ' | ') as variante,
    sum(oi.quantity) as piezas
  from public.meli_order_items oi left join public.variants v on v.id = oi.variant_id
  group by oi.order_id
)
select c.claim_id, c.order_id, c.type, c.stage, c.status, c.reason_id, c.reason_name, c.reason_detail,
  c.affects_reputation, c.has_incentive, c.incentive_due_date, c.seller_actions, c.due_date, c.action_responsible,
  c.detail_title, c.detail_description, c.resolution, c.related_entities, c.returns, c.messages,
  c.last_message_at, c.last_message_role, c.date_created, c.last_updated, c.synced_at,
  o.fecha, o.buyer_nickname, o.total_amount, o.status as order_status, o.shipping_id,
  s.logistic_type, s.status as envio_status, s.substatus as envio_substatus, s.date_shipped, s.date_delivered,
  it.titulo, it.variante, it.piezas,
  case
    when c.reason_id like 'PNR%' then 'no_recibido'
    when c.reason_id like 'PDD%' then 'distinto_defectuoso'
    when c.reason_id like 'CS%' or c.type in ('cancel_purchase', 'cancel_sale') then 'cancelacion'
    when c.type = 'change' then 'cambio'
    else 'otro'
  end as caso,
  -- prioridad: 0 = afecta y hay plazo corriendo, 1 = afecta, 2 = abierto que no afecta, 3 = cerrado
  case
    when c.status <> 'opened' then 3
    when coalesce(c.affects_reputation, 'affected') <> 'not_affected' and c.due_date is not null then 0
    when coalesce(c.affects_reputation, 'affected') <> 'not_affected' then 1
    else 2
  end as prioridad
from public.meli_claims c
left join public.meli_orders o on o.order_id = c.order_id
left join public.meli_shipments s on s.shipment_id = o.shipping_id
left join it on it.order_id = c.order_id;

-- Evidencia (fotos/PDF) que el ERP sube para mandarla con un mensaje o una revisión de devolución.
insert into storage.buckets (id, name, public, file_size_limit) values ('reclamos', 'reclamos', false, 5242880)
on conflict (id) do nothing;
drop policy if exists reclamos_allowed on storage.objects;
create policy reclamos_allowed on storage.objects for all
  using (bucket_id = 'reclamos' and public.is_allowed()) with check (bucket_id = 'reclamos' and public.is_allowed());

-- Cada 30 minutos: el incentivo de ML es de 48 h, hay que verlos rápido.
select cron.schedule('meli-claims-sync', '*/30 * * * *', $$select private.call_edge('meli-claims', '{"kind":"all"}'::jsonb)$$);

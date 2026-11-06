-- Bitácora de preguntas de Mercado Libre: borrador propuesto, aprobación y publicación.
-- estado: propuesta (esperando visto bueno) | aprobada | publicada | omitida (no se sabe contestar / no aplica) | error
create table if not exists public.meli_preguntas (
  question_id   bigint primary key,
  item_id       text not null,
  item_title    text,
  pregunta      text not null,
  fecha_pregunta timestamptz,
  borrador      text,
  estado        text not null default 'propuesta'
                check (estado in ('propuesta', 'aprobada', 'publicada', 'omitida', 'error')),
  motivo        text,
  respuesta_ml  jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  publicada_at  timestamptz
);

create index if not exists meli_preguntas_estado_idx on public.meli_preguntas (estado);

alter table public.meli_preguntas enable row level security;

create table if not exists public.orchestrator_command_dead_letters (
  id uuid primary key default gen_random_uuid(),
  command_id text not null unique,
  stream text not null,
  message_id text not null,
  partition integer not null check (partition >= 0),
  partition_key text,
  payload_type text not null,
  payload jsonb not null default '{}'::jsonb,
  error_code text not null,
  error_message text not null,
  attempts integer not null check (attempts > 0),
  status text not null default 'dead' check (status in ('dead', 'replayed', 'resolved')),
  replay_command_id text,
  replayed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_orchestrator_command_dead_letters_status_created
  on public.orchestrator_command_dead_letters(status, created_at desc);

alter table public.orchestrator_command_dead_letters enable row level security;

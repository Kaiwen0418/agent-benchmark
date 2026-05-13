create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text,
  plan text not null default 'free',
  daily_run_limit integer not null default 10,
  created_at timestamptz not null default now()
);

create table if not exists public.benchmark_cases (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null,
  category text not null,
  difficulty text not null,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.runners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null check (status in ('online', 'offline', 'busy')),
  capacity integer not null default 1,
  current_load integer not null default 0,
  last_heartbeat timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.benchmark_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  case_id uuid not null references public.benchmark_cases (id) on delete restrict,
  runner_id uuid references public.runners (id) on delete set null,
  status text not null check (
    status in ('queued', 'starting', 'running', 'scoring', 'completed', 'failed', 'cancelled', 'timeout')
  ) default 'queued',
  score numeric,
  live_view_url text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.benchmark_runs (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.artifacts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.benchmark_runs (id) on delete cascade,
  type text not null,
  storage_path text,
  url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_benchmark_runs_user_id on public.benchmark_runs (user_id);
create index if not exists idx_benchmark_runs_case_id on public.benchmark_runs (case_id);
create index if not exists idx_benchmark_runs_runner_id on public.benchmark_runs (runner_id);
create index if not exists idx_benchmark_runs_status on public.benchmark_runs (status);
create index if not exists idx_run_events_run_id_created_at on public.run_events (run_id, created_at);
create index if not exists idx_artifacts_run_id on public.artifacts (run_id);

insert into public.benchmark_cases (id, slug, title, description, category, difficulty, is_public)
values
  (
    '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0001',
    'checkout-basic',
    'Checkout Flow Basics',
    'Navigate a mock storefront and complete a constrained checkout flow.',
    'browser',
    'easy',
    true
  ),
  (
    '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0002',
    'inbox-triage',
    'Inbox Triage',
    'Read mock communications and take the correct sequence of actions.',
    'communication',
    'medium',
    true
  )
on conflict (id) do nothing;

create table if not exists public.hosted_web_sessions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.benchmark_runs (id) on delete cascade,
  case_id uuid not null references public.benchmark_cases (id) on delete restrict,
  provider text not null default 'hosted-web',
  app text not null,
  task_slug text not null,
  seed_version text not null,
  start_url text not null,
  session_token_hash text not null unique,
  status text not null default 'created'
    check (status in ('created', 'active', 'scoring', 'completed', 'failed', 'expired')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz
);

create index if not exists idx_hosted_web_sessions_run_id
  on public.hosted_web_sessions (run_id);

create index if not exists idx_hosted_web_sessions_case_id
  on public.hosted_web_sessions (case_id);

create index if not exists idx_hosted_web_sessions_status
  on public.hosted_web_sessions (status);

create index if not exists idx_hosted_web_sessions_expires_at
  on public.hosted_web_sessions (expires_at);

create table if not exists public.hosted_web_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.hosted_web_sessions (id) on delete cascade,
  run_id uuid not null references public.benchmark_runs (id) on delete cascade,
  type text not null,
  name text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_hosted_web_events_session_created_at
  on public.hosted_web_events (session_id, created_at);

create index if not exists idx_hosted_web_events_run_created_at
  on public.hosted_web_events (run_id, created_at);

create index if not exists idx_hosted_web_events_type
  on public.hosted_web_events (type);

create table if not exists public.hosted_web_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.hosted_web_sessions (id) on delete cascade,
  run_id uuid not null references public.benchmark_runs (id) on delete cascade,
  status text not null check (status in ('passed', 'failed', 'error')),
  score numeric not null check (score >= 0 and score <= 1),
  summary text not null,
  final_state jsonb not null default '{}'::jsonb,
  evaluators jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_hosted_web_results_session_created_at
  on public.hosted_web_results (session_id, created_at);

create index if not exists idx_hosted_web_results_run_created_at
  on public.hosted_web_results (run_id, created_at);

alter table public.hosted_web_sessions enable row level security;
alter table public.hosted_web_events enable row level security;
alter table public.hosted_web_results enable row level security;

drop policy if exists "hosted_web_sessions_select_for_own_runs" on public.hosted_web_sessions;
create policy "hosted_web_sessions_select_for_own_runs"
  on public.hosted_web_sessions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.benchmark_runs runs
      where runs.id = hosted_web_sessions.run_id
        and runs.user_id = (select auth.uid())
    )
  );

drop policy if exists "hosted_web_events_select_for_own_runs" on public.hosted_web_events;
create policy "hosted_web_events_select_for_own_runs"
  on public.hosted_web_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.benchmark_runs runs
      where runs.id = hosted_web_events.run_id
        and runs.user_id = (select auth.uid())
    )
  );

drop policy if exists "hosted_web_results_select_for_own_runs" on public.hosted_web_results;
create policy "hosted_web_results_select_for_own_runs"
  on public.hosted_web_results
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.benchmark_runs runs
      where runs.id = hosted_web_results.run_id
        and runs.user_id = (select auth.uid())
    )
  );

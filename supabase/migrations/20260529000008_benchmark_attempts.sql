create table if not exists public.benchmark_attempts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.benchmark_runs (id) on delete cascade,
  case_id uuid not null references public.benchmark_cases (id) on delete restrict,
  provider text not null,
  suite_slug text not null,
  suite_version text not null,
  status text not null default 'created'
    check (status in ('created', 'running', 'scoring', 'completed', 'failed', 'cancelled', 'timeout')),
  aggregate_score numeric check (aggregate_score is null or (aggregate_score >= 0 and aggregate_score <= 1)),
  scoring_summary jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists idx_benchmark_attempts_run_id
  on public.benchmark_attempts (run_id);

create index if not exists idx_benchmark_attempts_case_id
  on public.benchmark_attempts (case_id);

create index if not exists idx_benchmark_attempts_status
  on public.benchmark_attempts (status);

alter table public.hosted_web_sessions
  add column if not exists attempt_id uuid references public.benchmark_attempts (id) on delete cascade;

alter table public.hosted_web_sessions
  add column if not exists task_version text not null default 'v1';

alter table public.hosted_web_sessions
  add column if not exists sequence_index integer not null default 0;

alter table public.hosted_web_sessions
  add column if not exists weight numeric not null default 1 check (weight >= 0);

alter table public.hosted_web_sessions
  add column if not exists required boolean not null default true;

alter table public.hosted_web_sessions
  add column if not exists created_by_user_id uuid references public.profiles (id) on delete set null;

alter table public.hosted_web_sessions
  add column if not exists created_by_guest_id text;

alter table public.hosted_web_sessions
  add column if not exists first_seen_ip inet;

alter table public.hosted_web_sessions
  add column if not exists last_seen_ip inet;

alter table public.hosted_web_sessions
  add column if not exists first_seen_user_agent text;

alter table public.hosted_web_sessions
  add column if not exists last_seen_user_agent text;

alter table public.hosted_web_sessions
  add column if not exists access_count integer not null default 0 check (access_count >= 0);

alter table public.hosted_web_sessions
  add column if not exists last_accessed_at timestamptz;

create index if not exists idx_hosted_web_sessions_attempt_id
  on public.hosted_web_sessions (attempt_id);

create index if not exists idx_hosted_web_sessions_user_id
  on public.hosted_web_sessions (created_by_user_id);

alter table public.hosted_web_events
  add column if not exists attempt_id uuid references public.benchmark_attempts (id) on delete cascade;

create index if not exists idx_hosted_web_events_attempt_created_at
  on public.hosted_web_events (attempt_id, created_at);

alter table public.hosted_web_results
  add column if not exists attempt_id uuid references public.benchmark_attempts (id) on delete cascade;

alter table public.hosted_web_results
  add column if not exists app text;

alter table public.hosted_web_results
  add column if not exists task_slug text;

alter table public.hosted_web_results
  add column if not exists weight numeric not null default 1 check (weight >= 0);

create index if not exists idx_hosted_web_results_attempt_created_at
  on public.hosted_web_results (attempt_id, created_at);

create table if not exists public.benchmark_attempt_scores (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.benchmark_runs (id) on delete cascade,
  attempt_id uuid not null references public.benchmark_attempts (id) on delete cascade,
  status text not null check (status in ('passed', 'failed', 'error')),
  score numeric not null check (score >= 0 and score <= 1),
  summary text not null,
  breakdown jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_benchmark_attempt_scores_attempt_created_at
  on public.benchmark_attempt_scores (attempt_id, created_at);

create table if not exists public.hosted_web_access_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.hosted_web_sessions (id) on delete cascade,
  attempt_id uuid references public.benchmark_attempts (id) on delete cascade,
  run_id uuid references public.benchmark_runs (id) on delete cascade,
  event text not null,
  ip inet,
  user_agent text,
  referer text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_hosted_web_access_logs_session_created_at
  on public.hosted_web_access_logs (session_id, created_at);

create index if not exists idx_hosted_web_access_logs_run_created_at
  on public.hosted_web_access_logs (run_id, created_at);

alter table public.benchmark_attempts enable row level security;
alter table public.benchmark_attempt_scores enable row level security;
alter table public.hosted_web_access_logs enable row level security;

drop policy if exists "benchmark_attempts_select_for_own_runs" on public.benchmark_attempts;
create policy "benchmark_attempts_select_for_own_runs"
  on public.benchmark_attempts
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.benchmark_runs runs
      where runs.id = benchmark_attempts.run_id
        and runs.user_id = (select auth.uid())
    )
  );

drop policy if exists "benchmark_attempt_scores_select_for_own_runs" on public.benchmark_attempt_scores;
create policy "benchmark_attempt_scores_select_for_own_runs"
  on public.benchmark_attempt_scores
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.benchmark_runs runs
      where runs.id = benchmark_attempt_scores.run_id
        and runs.user_id = (select auth.uid())
    )
  );

drop policy if exists "hosted_web_access_logs_select_for_own_runs" on public.hosted_web_access_logs;
create policy "hosted_web_access_logs_select_for_own_runs"
  on public.hosted_web_access_logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.benchmark_runs runs
      where runs.id = hosted_web_access_logs.run_id
        and runs.user_id = (select auth.uid())
    )
  );

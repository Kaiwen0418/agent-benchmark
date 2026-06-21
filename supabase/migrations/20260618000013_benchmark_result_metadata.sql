alter table public.benchmark_runs
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists agent_name text,
  add column if not exists agent_version text,
  add column if not exists base_model text,
  add column if not exists browser_environment jsonb not null default '{}'::jsonb,
  add column if not exists is_public boolean not null default true;

create index if not exists idx_benchmark_runs_public_leaderboard
  on public.benchmark_runs (score desc, completed_at asc)
  where status = 'completed' and is_public = true and score is not null;

comment on column public.benchmark_runs.agent_name is
  'Agent-reported product or harness name. Not independently verified.';
comment on column public.benchmark_runs.agent_version is
  'Agent-reported product or harness version. Not independently verified.';
comment on column public.benchmark_runs.base_model is
  'Agent-reported base model identifier. Not independently verified.';
comment on column public.benchmark_runs.browser_environment is
  'Browser request environment captured by AgentBench when agent metadata is registered.';

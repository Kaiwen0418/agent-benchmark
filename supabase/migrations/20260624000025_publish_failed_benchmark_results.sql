drop index if exists public.idx_benchmark_runs_public_leaderboard;

create index idx_benchmark_runs_public_leaderboard
  on public.benchmark_runs (score desc, completed_at asc)
  where status in ('completed', 'failed')
    and is_public = true
    and score is not null;

create or replace view public.public_hosted_run_summaries
with (security_barrier = true)
as
select
  runs.id as run_id,
  runs.case_id,
  cases.title as benchmark_title,
  attempts.suite_slug,
  attempts.suite_version,
  (
    select sessions.first_seen_user_agent
    from public.hosted_web_sessions as sessions
    where sessions.run_id = runs.id
      and sessions.first_seen_user_agent is not null
    order by sessions.sequence_index asc
    limit 1
  ) as observed_user_agent
from public.benchmark_runs as runs
join public.benchmark_cases as cases on cases.id = runs.case_id
join public.benchmark_attempts as attempts on attempts.run_id = runs.id
where runs.status in ('completed', 'failed')
  and runs.is_public = true
  and attempts.status in ('completed', 'failed');

create or replace view public.public_hosted_run_tasks
with (security_barrier = true)
as
select
  results.run_id,
  results.app,
  results.task_slug,
  results.status,
  results.score,
  results.summary,
  results.created_at
from public.hosted_web_results as results
join public.benchmark_runs as runs on runs.id = results.run_id
where runs.status in ('completed', 'failed')
  and runs.is_public = true;

revoke all on table public.public_hosted_run_summaries from public;
revoke all on table public.public_hosted_run_tasks from public;
grant select on table public.public_hosted_run_summaries to anon, authenticated, service_role;
grant select on table public.public_hosted_run_tasks to anon, authenticated, service_role;

comment on view public.public_hosted_run_summaries is
  'Public terminal scored-run suite identity and observed browser projection. Web must not read hosted lifecycle tables directly.';
comment on view public.public_hosted_run_tasks is
  'Public terminal scored-run task result projection. Web must not read hosted lifecycle tables directly.';

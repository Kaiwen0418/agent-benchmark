create or replace view public.public_hosted_run_consistency_checks
with (security_barrier = true)
as
select
  runs.id as run_id,
  consistency.position as sequence_index,
  consistency.check ->> 'name' as name,
  consistency.check ->> 'sourceTaskSlug' as source_task_slug,
  consistency.check ->> 'targetTaskSlug' as target_task_slug,
  case
    when consistency.check ->> 'status' in ('passed', 'failed') then consistency.check ->> 'status'
    else 'failed'
  end as status,
  coalesce((consistency.check ->> 'score')::numeric, 0) as score,
  coalesce((consistency.check ->> 'required')::boolean, true) as required,
  case
    when consistency.check ->> 'status' = 'passed' then null
    when consistency.check ->> 'errorMessage' like 'Missing prior output%' then
      'Required output was unavailable for cross-app comparison.'
    else 'The required value was not carried consistently between tasks.'
  end as failure_reason
from public.benchmark_runs as runs
join public.benchmark_attempts as attempts on attempts.run_id = runs.id
join public.benchmark_attempt_scores as scores on scores.attempt_id = attempts.id
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(scores.breakdown -> 'consistency') = 'array' then scores.breakdown -> 'consistency'
    else '[]'::jsonb
  end
) with ordinality as consistency(check, position)
where runs.status in ('completed', 'failed', 'timeout')
  and runs.is_public = true
  and attempts.status in ('completed', 'failed', 'timeout');

revoke all on table public.public_hosted_run_consistency_checks from public;
grant select on table public.public_hosted_run_consistency_checks to anon, authenticated, service_role;

comment on view public.public_hosted_run_consistency_checks is
  'Public terminal scored-run cross-app consistency projection. Exposes only safe check labels, status, score, and generalized failure reasons; it never exposes evaluator evidence, generated task configuration, or final session state.';

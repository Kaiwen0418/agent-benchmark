with duplicate_results as (
  select
    id,
    row_number() over (
      partition by session_id
      order by created_at asc, id asc
    ) as duplicate_rank
  from public.hosted_web_results
)
delete from public.hosted_web_results
using duplicate_results
where public.hosted_web_results.id = duplicate_results.id
  and duplicate_results.duplicate_rank > 1;

create unique index if not exists idx_hosted_web_results_unique_session
  on public.hosted_web_results (session_id);

with duplicate_scores as (
  select
    id,
    row_number() over (
      partition by attempt_id
      order by created_at asc, id asc
    ) as duplicate_rank
  from public.benchmark_attempt_scores
)
delete from public.benchmark_attempt_scores
using duplicate_scores
where public.benchmark_attempt_scores.id = duplicate_scores.id
  and duplicate_scores.duplicate_rank > 1;

create unique index if not exists idx_benchmark_attempt_scores_unique_attempt
  on public.benchmark_attempt_scores (attempt_id);

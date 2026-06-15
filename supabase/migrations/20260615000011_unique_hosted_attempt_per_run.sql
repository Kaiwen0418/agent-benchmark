with duplicate_attempts as (
  select
    id,
    row_number() over (
      partition by run_id, case_id, provider
      order by created_at asc, id asc
    ) as duplicate_rank
  from public.benchmark_attempts
  where provider = 'hosted-web'
)
delete from public.benchmark_attempts
using duplicate_attempts
where public.benchmark_attempts.id = duplicate_attempts.id
  and duplicate_attempts.duplicate_rank > 1;

create unique index if not exists idx_benchmark_attempts_unique_hosted_run_case
  on public.benchmark_attempts (run_id, case_id, provider)
  where provider = 'hosted-web';

-- Older lifecycle code treated any non-passing aggregate as a failed run. A
-- durable aggregate with evaluator status `failed` is a finished benchmark
-- with deductions, not an execution failure. Do not rewrite aggregate errors.
update public.benchmark_attempts
set status = 'completed'
where status = 'failed'
  and aggregate_score is not null
  and scoring_summary ->> 'status' = 'failed';

update public.benchmark_runs runs
set
  status = 'completed',
  error_message = null
where runs.status = 'failed'
  and exists (
    select 1
    from public.benchmark_attempts attempts
    where attempts.run_id = runs.id
      and attempts.status = 'completed'
      and attempts.aggregate_score is not null
      and attempts.scoring_summary ->> 'status' = 'failed'
  );

-- A pending outbox delivery must not restore the old failed lifecycle status
-- after its attempt and run have been normalized.
update public.hosted_callback_outbox outbox
set
  payload = jsonb_set(
    jsonb_set(outbox.payload, '{status}', '"completed"'::jsonb, true),
    '{errorMessage}', 'null'::jsonb,
    true
  ),
  updated_at = now()
where outbox.status in ('pending', 'delivering')
  and exists (
    select 1
    from public.benchmark_attempts attempts
    where attempts.id = outbox.attempt_id
      and attempts.status = 'completed'
      and attempts.aggregate_score is not null
      and attempts.scoring_summary ->> 'status' = 'failed'
  );

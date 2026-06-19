create or replace function public.timeout_hosted_attempt(
  p_attempt_id uuid,
  p_timeout_at timestamptz,
  p_timed_out_session_id uuid,
  p_scoring_summary jsonb
)
returns table (
  transitioned boolean,
  attempt_run_id uuid,
  expired_session_ids uuid[]
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_status text;
  current_run_id uuid;
  expired_ids uuid[];
begin
  select attempts.status, attempts.run_id
    into current_status, current_run_id
  from public.benchmark_attempts attempts
  where attempts.id = p_attempt_id
  for update;

  if not found or current_status in ('completed', 'failed', 'cancelled', 'timeout') then
    return query select false, current_run_id, array[]::uuid[];
    return;
  end if;

  with expired as (
    update public.hosted_web_sessions sessions
    set status = 'expired', completed_at = p_timeout_at
    where sessions.attempt_id = p_attempt_id
      and sessions.status in ('created', 'active', 'scoring')
    returning sessions.id
  )
  select coalesce(array_agg(expired.id order by expired.id), array[]::uuid[])
    into expired_ids
  from expired;

  update public.benchmark_attempts attempts
  set
    status = 'timeout',
    aggregate_score = 0,
    metadata = attempts.metadata || jsonb_build_object(
      'activeSessionId', null,
      'activeSequenceIndex', null,
      'timedOutSessionId', p_timed_out_session_id,
      'timedOutAt', p_timeout_at
    ),
    scoring_summary = p_scoring_summary,
    completed_at = p_timeout_at
  where attempts.id = p_attempt_id;

  insert into public.benchmark_attempt_scores (
    run_id,
    attempt_id,
    status,
    score,
    summary,
    breakdown
  )
  values (
    current_run_id,
    p_attempt_id,
    'error',
    0,
    coalesce(p_scoring_summary ->> 'summary', 'Hosted suite timed out.'),
    coalesce(p_scoring_summary -> 'breakdown', '{}'::jsonb)
  )
  on conflict (attempt_id) do nothing;

  return query select true, current_run_id, expired_ids;
end;
$$;

revoke all on function public.timeout_hosted_attempt(uuid, timestamptz, uuid, jsonb) from public;
revoke all on function public.timeout_hosted_attempt(uuid, timestamptz, uuid, jsonb) from anon;
revoke all on function public.timeout_hosted_attempt(uuid, timestamptz, uuid, jsonb) from authenticated;
grant execute on function public.timeout_hosted_attempt(uuid, timestamptz, uuid, jsonb) to service_role;

ALTER TABLE "hosted_web_sessions" DROP CONSTRAINT "hosted_web_sessions_status_check";--> statement-breakpoint
ALTER TABLE "hosted_web_sessions" ADD CONSTRAINT "hosted_web_sessions_status_check" CHECK ("hosted_web_sessions"."status" in ('created', 'active', 'scoring', 'completed', 'failed', 'cancelled', 'expired'));--> statement-breakpoint
create or replace function public.cancel_hosted_attempt(
  p_run_id uuid,
  p_cancelled_at timestamptz
)
returns table (
  attempt_found boolean,
  transitioned boolean,
  hosted_attempt_id uuid,
  attempt_status text,
  cancelled_session_ids uuid[]
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_attempt_id uuid;
  current_status text;
  cancelled_ids uuid[];
begin
  select attempts.id, attempts.status
    into current_attempt_id, current_status
  from public.benchmark_attempts attempts
  where attempts.run_id = p_run_id
    and attempts.provider = 'hosted-web'
  order by attempts.created_at asc
  limit 1
  for update;

  if not found then
    return query select false, false, null::uuid, null::text, array[]::uuid[];
    return;
  end if;

  if current_status in ('completed', 'failed', 'cancelled', 'timeout') then
    if current_status = 'cancelled' then
      select coalesce(array_agg(sessions.id order by sessions.id), array[]::uuid[])
        into cancelled_ids
      from public.hosted_web_sessions sessions
      where sessions.attempt_id = current_attempt_id
        and sessions.status = 'cancelled';
    else
      cancelled_ids := array[]::uuid[];
    end if;
    return query select true, false, current_attempt_id, current_status, cancelled_ids;
    return;
  end if;

  with cancelled as (
    update public.hosted_web_sessions sessions
    set
      status = 'cancelled',
      completed_at = coalesce(sessions.completed_at, p_cancelled_at),
      expires_at = null
    where sessions.attempt_id = current_attempt_id
      and sessions.status in ('created', 'active', 'scoring')
    returning sessions.id
  )
  select coalesce(array_agg(cancelled.id order by cancelled.id), array[]::uuid[])
    into cancelled_ids
  from cancelled;

  update public.benchmark_attempts attempts
  set
    status = 'cancelled',
    aggregate_score = null,
    metadata = attempts.metadata || jsonb_build_object(
      'activeSessionId', null,
      'activeSequenceIndex', null,
      'cancelledAt', p_cancelled_at
    ),
    scoring_summary = jsonb_build_object(
      'status', 'cancelled',
      'summary', 'Benchmark run cancelled by its owner.'
    ),
    completed_at = p_cancelled_at
  where attempts.id = current_attempt_id;

  return query select true, true, current_attempt_id, 'cancelled'::text, cancelled_ids;
end;
$$;

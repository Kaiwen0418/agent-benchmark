create or replace function public.complete_hosted_attempt_session(
  p_attempt_id uuid,
  p_session_id uuid,
  p_completed_at timestamptz,
  p_result jsonb,
  p_attempt_update jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  attempt_row public.benchmark_attempts%rowtype;
  session_row public.hosted_web_sessions%rowtype;
  result_row public.hosted_web_results%rowtype;
  score_row public.benchmark_attempt_scores%rowtype;
  next_session_id uuid;
  is_complete boolean := coalesce((p_attempt_update ->> 'complete')::boolean, false);
begin
  select * into attempt_row
  from public.benchmark_attempts attempts
  where attempts.id = p_attempt_id
  for update;

  if not found then
    return jsonb_build_object('transitioned', false, 'duplicate', false, 'conflict', 'attempt_not_found');
  end if;

  select * into result_row
  from public.hosted_web_results results
  where results.session_id = p_session_id;

  if found then
    select * into score_row
    from public.benchmark_attempt_scores scores
    where scores.attempt_id = p_attempt_id;
    return jsonb_build_object(
      'transitioned', false,
      'duplicate', true,
      'conflict', null,
      'result', jsonb_build_object(
        'status', result_row.status,
        'score', result_row.score,
        'summary', result_row.summary,
        'evaluators', result_row.evaluators
      ),
      'complete', score_row.id is not null,
      'aggregate', case when score_row.id is null then null else jsonb_build_object(
        'status', score_row.status,
        'score', score_row.score,
        'summary', score_row.summary,
        'breakdown', score_row.breakdown
      ) end
    );
  end if;

  if attempt_row.status in ('completed', 'failed', 'cancelled', 'timeout') then
    return jsonb_build_object('transitioned', false, 'duplicate', false, 'conflict', 'attempt_terminal');
  end if;

  if nullif(attempt_row.metadata ->> 'activeSessionId', '') is distinct from p_session_id::text then
    return jsonb_build_object('transitioned', false, 'duplicate', false, 'conflict', 'session_not_active');
  end if;

  select * into session_row
  from public.hosted_web_sessions sessions
  where sessions.id = p_session_id
    and sessions.attempt_id = p_attempt_id
  for update;

  if not found or session_row.status not in ('active', 'scoring') then
    return jsonb_build_object('transitioned', false, 'duplicate', false, 'conflict', 'session_not_completable');
  end if;

  insert into public.hosted_web_results (
    session_id, run_id, attempt_id, app, task_slug, weight,
    status, score, summary, final_state, evaluators
  ) values (
    p_session_id,
    attempt_row.run_id,
    p_attempt_id,
    session_row.app,
    session_row.task_slug,
    session_row.weight,
    p_result ->> 'status',
    (p_result ->> 'score')::numeric,
    p_result ->> 'summary',
    coalesce(p_result -> 'finalState', 'null'::jsonb),
    coalesce(p_result -> 'evaluators', '[]'::jsonb)
  )
  returning * into result_row;

  update public.hosted_web_sessions
  set
    status = case when result_row.status = 'passed' then 'completed' else 'failed' end,
    completed_at = p_completed_at
  where id = p_session_id;

  if is_complete then
    insert into public.benchmark_attempt_scores (
      run_id, attempt_id, status, score, summary, breakdown
    ) values (
      attempt_row.run_id,
      p_attempt_id,
      p_attempt_update -> 'aggregate' ->> 'status',
      (p_attempt_update -> 'aggregate' ->> 'score')::numeric,
      p_attempt_update -> 'aggregate' ->> 'summary',
      p_attempt_update -> 'aggregate' -> 'breakdown'
    )
    returning * into score_row;

    update public.benchmark_attempts
    set
      status = p_attempt_update ->> 'status',
      aggregate_score = score_row.score,
      metadata = p_attempt_update -> 'metadata',
      scoring_summary = p_attempt_update -> 'scoringSummary',
      completed_at = p_completed_at
    where id = p_attempt_id;
  else
    next_session_id := nullif(p_attempt_update ->> 'nextSessionId', '')::uuid;
    update public.hosted_web_sessions
    set status = 'active', activated_at = coalesce(activated_at, p_completed_at)
    where id = next_session_id
      and attempt_id = p_attempt_id
      and status = 'created';

    if not found then
      raise exception 'Next session % cannot be promoted for attempt %', next_session_id, p_attempt_id;
    end if;

    update public.benchmark_attempts
    set
      status = 'running',
      metadata = p_attempt_update -> 'metadata',
      scoring_summary = p_attempt_update -> 'scoringSummary'
    where id = p_attempt_id;
  end if;

  return jsonb_build_object(
    'transitioned', true,
    'duplicate', false,
    'conflict', null,
    'result', jsonb_build_object(
      'status', result_row.status,
      'score', result_row.score,
      'summary', result_row.summary,
      'evaluators', result_row.evaluators
    ),
    'complete', is_complete,
    'aggregate', case when is_complete then jsonb_build_object(
      'status', score_row.status,
      'score', score_row.score,
      'summary', score_row.summary,
      'breakdown', score_row.breakdown
    ) else null end
  );
end;
$$;

revoke all on function public.complete_hosted_attempt_session(uuid, uuid, timestamptz, jsonb, jsonb) from public;
revoke all on function public.complete_hosted_attempt_session(uuid, uuid, timestamptz, jsonb, jsonb) from anon;
revoke all on function public.complete_hosted_attempt_session(uuid, uuid, timestamptz, jsonb, jsonb) from authenticated;
grant execute on function public.complete_hosted_attempt_session(uuid, uuid, timestamptz, jsonb, jsonb) to service_role;

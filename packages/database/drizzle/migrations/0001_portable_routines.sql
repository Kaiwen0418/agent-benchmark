-- Portable PostgreSQL routines and read models. No Supabase roles or RLS dependencies.
alter table public.benchmark_cases
  add constraint benchmark_cases_current_revision_id_fkey
  foreign key (id, current_revision_id)
  references public.benchmark_case_revisions(case_id, id)
  on delete restrict;
--> statement-breakpoint
alter table public.benchmark_attempts
  add constraint benchmark_attempts_case_revision_identity_fkey
  foreign key (case_id, case_revision_id)
  references public.benchmark_case_revisions(case_id, id)
  on delete restrict;
--> statement-breakpoint
create index idx_benchmark_attempts_case_revision_id
  on public.benchmark_attempts(case_revision_id);
--> statement-breakpoint
create or replace function public.reject_benchmark_case_revision_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'benchmark case revisions are immutable' using errcode = '55000';
end;
$$;
--> statement-breakpoint
create trigger benchmark_case_revisions_immutable
before update or delete on public.benchmark_case_revisions
for each row execute function public.reject_benchmark_case_revision_mutation();
--> statement-breakpoint
create or replace function public.publish_benchmark_case_revision(
  target_case_id uuid,
  target_revision text,
  target_manifest jsonb,
  target_content_hash text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  revision_row public.benchmark_case_revisions%rowtype;
begin
  if target_revision is null or btrim(target_revision) = '' then
    raise exception 'revision is required' using errcode = '22023';
  end if;
  if target_manifest is null or jsonb_typeof(target_manifest) <> 'object' then
    raise exception 'manifest must be a JSON object' using errcode = '22023';
  end if;
  if target_content_hash is null or target_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'content hash must be lowercase SHA-256' using errcode = '22023';
  end if;

  select * into revision_row
  from public.benchmark_case_revisions
  where case_id = target_case_id
    and (revision = target_revision or content_hash = target_content_hash)
  order by (revision = target_revision) desc
  limit 1;

  if revision_row.id is null then
    insert into public.benchmark_case_revisions(case_id, revision, content_hash, manifest)
    values (target_case_id, target_revision, target_content_hash, target_manifest)
    returning * into revision_row;
  end if;

  if revision_row.content_hash <> target_content_hash or revision_row.manifest <> target_manifest then
    raise exception 'revision identity already exists with different content' using errcode = '23505';
  end if;

  update public.benchmark_cases
  set current_revision_id = revision_row.id
  where id = target_case_id;

  if not found then
    raise exception 'benchmark case does not exist' using errcode = '23503';
  end if;

  return revision_row.id;
end;
$$;
--> statement-breakpoint
create or replace function public.publish_benchmark_case_catalog(
  target_case jsonb,
  target_revision text,
  target_manifest jsonb,
  target_content_hash text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_case_id uuid;
  revision_id uuid;
begin
  if target_case is null or jsonb_typeof(target_case) <> 'object' then
    raise exception 'case must be a JSON object' using errcode = '22023';
  end if;

  target_case_id := (target_case ->> 'id')::uuid;
  if target_case_id is null
    or nullif(btrim(target_case ->> 'slug'), '') is null
    or nullif(btrim(target_case ->> 'title'), '') is null
    or nullif(btrim(target_case ->> 'description'), '') is null
    or nullif(btrim(target_case ->> 'category'), '') is null
    or nullif(btrim(target_case ->> 'difficulty'), '') is null
    or nullif(btrim(target_case ->> 'provider'), '') is null then
    raise exception 'case identity fields are required' using errcode = '22023';
  end if;

  insert into public.benchmark_cases (
    id,
    slug,
    title,
    description,
    category,
    difficulty,
    provider,
    metadata,
    is_public
  )
  values (
    target_case_id,
    target_case ->> 'slug',
    target_case ->> 'title',
    target_case ->> 'description',
    target_case ->> 'category',
    target_case ->> 'difficulty',
    target_case ->> 'provider',
    '{}'::jsonb,
    coalesce((target_case ->> 'isPublic')::boolean, true)
  )
  on conflict (id) do update
  set
    slug = excluded.slug,
    title = excluded.title,
    description = excluded.description,
    category = excluded.category,
    difficulty = excluded.difficulty,
    provider = excluded.provider,
    is_public = excluded.is_public;

  revision_id := public.publish_benchmark_case_revision(
    target_case_id,
    target_revision,
    target_manifest,
    target_content_hash
  );

  return revision_id;
end;
$$;
--> statement-breakpoint
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
  next_time_limit_minutes int;
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
    next_time_limit_minutes := coalesce((
      select (metadata ->> 'timeLimitMinutesPerTestcase')::int
      from public.hosted_web_sessions
      where id = next_session_id
        and attempt_id = p_attempt_id
    ), 10);

    update public.hosted_web_sessions
    set
      status = 'active',
      activated_at = coalesce(activated_at, p_completed_at),
      expires_at = p_completed_at + (next_time_limit_minutes || ' minutes')::interval
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
--> statement-breakpoint
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
--> statement-breakpoint
create or replace function public.enqueue_hosted_attempt_completion()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status in ('completed', 'failed', 'timeout')
    and old.status not in ('completed', 'failed', 'cancelled', 'timeout') then
    insert into public.hosted_callback_outbox(attempt_id, run_id, payload)
    values (
      new.id,
      new.run_id,
      jsonb_build_object(
        'status', case new.status when 'completed' then 'completed' when 'timeout' then 'timeout' else 'failed' end,
        'score', coalesce(new.aggregate_score, 0),
        'errorMessage', case when new.status = 'completed' then null else new.scoring_summary ->> 'summary' end,
        'artifacts', jsonb_build_array()
      )
    )
    on conflict (attempt_id, event_type) do nothing;
  end if;
  return new;
end;
$$;
--> statement-breakpoint
create trigger enqueue_hosted_attempt_completion
after update of status on public.benchmark_attempts
for each row execute function public.enqueue_hosted_attempt_completion();
--> statement-breakpoint
create or replace function public.reconcile_hosted_callback_outbox()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  insert into public.hosted_callback_outbox(attempt_id, run_id, payload)
  select
    attempts.id,
    attempts.run_id,
    jsonb_build_object(
      'status', case attempts.status when 'completed' then 'completed' when 'timeout' then 'timeout' else 'failed' end,
      'score', coalesce(attempts.aggregate_score, 0),
      'errorMessage', case when attempts.status = 'completed' then null else attempts.scoring_summary ->> 'summary' end,
      'artifacts', jsonb_build_array()
    )
  from public.benchmark_attempts attempts
  where attempts.status in ('completed', 'failed', 'timeout')
  on conflict (attempt_id, event_type) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;
--> statement-breakpoint
create or replace function public.claim_hosted_callback_outbox(p_limit integer default 20)
returns setof public.hosted_callback_outbox
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.hosted_callback_outbox outbox
  set status = 'dead', locked_at = null, updated_at = now()
  where outbox.attempts >= 8
    and (
      (outbox.status = 'pending' and outbox.next_attempt_at <= now())
      or (outbox.status = 'delivering' and outbox.locked_at < now() - interval '5 minutes')
    );

  return query
    with candidates as (
      select outbox.id
      from public.hosted_callback_outbox outbox
      where (
        (outbox.status = 'pending' and outbox.next_attempt_at <= now())
        or (outbox.status = 'delivering' and outbox.locked_at < now() - interval '5 minutes')
      )
        and outbox.attempts < 8
      order by outbox.next_attempt_at, outbox.created_at
      for update skip locked
      limit greatest(1, least(p_limit, 100))
    )
    update public.hosted_callback_outbox outbox
    set
      status = 'delivering',
      attempts = outbox.attempts + 1,
      locked_at = now(),
      updated_at = now()
    from candidates
    where outbox.id = candidates.id
    returning outbox.*;
end;
$$;
--> statement-breakpoint
create or replace function public.redact_orchestrator_command_text(p_text text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(
        p_text,
        '(?i)(Bearer)[[:space:]]+[^[:space:]]+',
        '\1 [REDACTED]',
        'g'
      ),
      '(?i)([?&](api[_-]?key|callback[_-]?secret|session|session[_-]?token|token|write[_-]?token)=)[^&[:space:]]+',
      '\1[REDACTED]',
      'g'
    ),
    '(?i)((api[_-]?key|callback[_-]?secret|password|session[_-]?token|shared[_-]?secret|token|write[_-]?token)[[:space:]]*[:=][[:space:]]*)[^[:space:],;]+',
    '\1[REDACTED]',
    'g'
  );
$$;
--> statement-breakpoint
create or replace function public.redact_orchestrator_command_payload(p_payload jsonb)
returns jsonb
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  item record;
  result jsonb;
  normalized_key text;
begin
  if jsonb_typeof(p_payload) = 'object' then
    result := '{}'::jsonb;
    for item in select key, value from jsonb_each(p_payload)
    loop
      normalized_key := lower(regexp_replace(item.key, '[^a-zA-Z0-9]', '', 'g'));
      if normalized_key in (
        'apikey',
        'authorization',
        'callbacksecret',
        'cookie',
        'password',
        'servicerolekey',
        'sharedsecret',
        'sessiontoken',
        'token',
        'writetoken'
      ) or normalized_key ~ '(secret|password|token)$' then
        continue;
      end if;
      result := result || jsonb_build_object(
        item.key,
        public.redact_orchestrator_command_payload(item.value)
      );
    end loop;
    return result;
  end if;

  if jsonb_typeof(p_payload) = 'array' then
    select coalesce(
      jsonb_agg(public.redact_orchestrator_command_payload(value)),
      '[]'::jsonb
    )
    into result
    from jsonb_array_elements(p_payload);
    return result;
  end if;

  if jsonb_typeof(p_payload) = 'string' then
    return to_jsonb(public.redact_orchestrator_command_text(p_payload #>> '{}'));
  end if;

  return p_payload;
end;
$$;
--> statement-breakpoint
create or replace function public.scrub_orchestrator_command_dead_letters(
  p_limit integer default 500
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  scrubbed_count integer;
begin
  with candidates as (
    select id
    from public.orchestrator_command_dead_letters
    where scrubbed_at is null
    order by created_at asc
    limit greatest(1, least(coalesce(p_limit, 500), 5000))
    for update skip locked
  )
  update public.orchestrator_command_dead_letters as dead_letter
  set
    payload = public.redact_orchestrator_command_payload(dead_letter.payload),
    error_message = public.redact_orchestrator_command_text(dead_letter.error_message),
    scrubbed_at = now()
  from candidates
  where dead_letter.id = candidates.id;

  get diagnostics scrubbed_count = row_count;
  return scrubbed_count;
end;
$$;
--> statement-breakpoint
create or replace function public.prune_orchestrator_command_dead_letters_v2(
  p_dead_before timestamptz,
  p_resolved_before timestamptz,
  p_limit integer default 1000,
  p_max_rows integer default 10000
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
  bounded_limit integer := greatest(1, least(coalesce(p_limit, 1000), 5000));
  bounded_max_rows integer := greatest(1, least(coalesce(p_max_rows, 10000), 100000));
begin
  with retention_candidates as (
    select id
    from public.orchestrator_command_dead_letters
    where
      (status = 'dead' and created_at < p_dead_before)
      or (
        status in ('replayed', 'resolved')
        and updated_at < p_resolved_before
      )
    order by
      case when status = 'dead' then created_at else updated_at end asc
    limit bounded_limit
  ),
  capacity_candidates as (
    select id
    from public.orchestrator_command_dead_letters
    order by created_at desc, id desc
    offset bounded_max_rows
    limit bounded_limit
  ),
  candidate_ids as (
    select id from retention_candidates
    union
    select id from capacity_candidates
    limit bounded_limit
  ),
  locked_candidates as (
    select dead_letter.id
    from public.orchestrator_command_dead_letters as dead_letter
    join candidate_ids using (id)
    for update of dead_letter skip locked
  )
  delete from public.orchestrator_command_dead_letters as dead_letter
  using locked_candidates
  where dead_letter.id = locked_candidates.id;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
--> statement-breakpoint
create or replace view public.public_benchmark_cases
with (security_barrier = true)
as
select
  cases.id,
  cases.slug,
  cases.title,
  cases.description,
  cases.category,
  cases.difficulty,
  cases.provider,
  jsonb_strip_nulls(
    jsonb_build_object(
      'suiteSlug', revisions.manifest -> 'suiteSlug',
      'suiteVersion', revisions.manifest -> 'suiteVersion',
      'sessionCount', case
        when jsonb_typeof(revisions.manifest -> 'sessions') = 'array'
          then jsonb_array_length(revisions.manifest -> 'sessions')
        else null
      end,
      'sessions', case
        when jsonb_typeof(revisions.manifest -> 'sessions') = 'array' then (
          select coalesce(
            jsonb_agg(
              jsonb_strip_nulls(
                jsonb_build_object(
                  'app', session.value -> 'app',
                  'taskSlug', session.value -> 'taskSlug',
                  'title', session.value -> 'title',
                  'taskVersion', session.value -> 'taskVersion',
                  'sequenceIndex', session.value -> 'sequenceIndex',
                  'weight', session.value -> 'weight',
                  'required', session.value -> 'required'
                )
              )
              order by session.ordinality
            ),
            '[]'::jsonb
          )
          from jsonb_array_elements(revisions.manifest -> 'sessions')
            with ordinality as session(value, ordinality)
        )
        else '[]'::jsonb
      end
    )
  ) as metadata,
  cases.created_at
from public.benchmark_cases as cases
left join public.benchmark_case_revisions as revisions
  on revisions.id = cases.current_revision_id
  and revisions.case_id = cases.id
where cases.is_public = true;
--> statement-breakpoint
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
where runs.status in ('completed', 'failed', 'timeout')
  and runs.is_public = true
  and attempts.status in ('completed', 'failed', 'timeout');
--> statement-breakpoint
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
where runs.status in ('completed', 'failed', 'timeout')
  and runs.is_public = true;
--> statement-breakpoint
create or replace view public.public_hosted_run_consistency_checks
with (security_barrier = true)
as
select
  runs.id as run_id,
  consistency.position as sequence_index,
  consistency.item ->> 'name' as name,
  consistency.item ->> 'sourceTaskSlug' as source_task_slug,
  consistency.item ->> 'targetTaskSlug' as target_task_slug,
  case
    when consistency.item ->> 'status' in ('passed', 'failed') then consistency.item ->> 'status'
    else 'failed'
  end as status,
  coalesce((consistency.item ->> 'score')::numeric, 0) as score,
  coalesce((consistency.item ->> 'required')::boolean, true) as required,
  case
    when consistency.item ->> 'status' = 'passed' then null
    when consistency.item ->> 'errorMessage' like 'Missing prior output%' then
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
) with ordinality as consistency(item, position)
where runs.status in ('completed', 'failed', 'timeout')
  and runs.is_public = true
  and attempts.status in ('completed', 'failed', 'timeout');
--> statement-breakpoint
comment on view public.public_benchmark_cases is
  'Display-safe benchmark discovery projected from the current immutable revision.';
--> statement-breakpoint
comment on view public.public_hosted_run_summaries is
  'Public terminal scored-run suite identity and observed browser projection.';
--> statement-breakpoint
comment on view public.public_hosted_run_tasks is
  'Public terminal scored-run task result projection.';
--> statement-breakpoint
comment on view public.public_hosted_run_consistency_checks is
  'Public terminal scored-run cross-app consistency projection.';

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

alter table public.orchestrator_command_dead_letters
  add column if not exists scrubbed_at timestamptz;

create index if not exists idx_orchestrator_command_dead_letters_unscrubbed
  on public.orchestrator_command_dead_letters(created_at)
  where scrubbed_at is null;

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
    scrubbed_at = now(),
    updated_at = now()
  from candidates
  where dead_letter.id = candidates.id;

  get diagnostics scrubbed_count = row_count;
  return scrubbed_count;
end;
$$;

create index if not exists idx_orchestrator_command_dead_letters_status_updated
  on public.orchestrator_command_dead_letters(status, updated_at);

create or replace function public.prune_orchestrator_command_dead_letters(
  p_dead_before timestamptz,
  p_resolved_before timestamptz,
  p_limit integer default 500
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  with candidates as (
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
    limit greatest(1, least(coalesce(p_limit, 500), 5000))
    for update skip locked
  )
  delete from public.orchestrator_command_dead_letters as dead_letter
  using candidates
  where dead_letter.id = candidates.id;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.prune_orchestrator_command_dead_letters(timestamptz, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.prune_orchestrator_command_dead_letters(timestamptz, timestamptz, integer)
  to service_role;

revoke all on function public.redact_orchestrator_command_text(text)
  from public, anon, authenticated;
revoke all on function public.redact_orchestrator_command_payload(jsonb)
  from public, anon, authenticated;
revoke all on function public.scrub_orchestrator_command_dead_letters(integer)
  from public, anon, authenticated;
grant execute on function public.scrub_orchestrator_command_dead_letters(integer)
  to service_role;

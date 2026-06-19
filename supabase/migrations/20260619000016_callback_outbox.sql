create table if not exists public.hosted_callback_outbox (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.benchmark_attempts(id) on delete cascade,
  run_id uuid not null,
  event_type text not null default 'run_completion' check (event_type = 'run_completion'),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'delivering', 'delivered', 'dead')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(attempt_id, event_type)
);

create index if not exists idx_hosted_callback_outbox_pending
  on public.hosted_callback_outbox(next_attempt_at, created_at)
  where status in ('pending', 'delivering');

alter table public.hosted_callback_outbox enable row level security;

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

drop trigger if exists enqueue_hosted_attempt_completion on public.benchmark_attempts;
create trigger enqueue_hosted_attempt_completion
after update of status on public.benchmark_attempts
for each row execute function public.enqueue_hosted_attempt_completion();

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

revoke all on function public.reconcile_hosted_callback_outbox() from public, anon, authenticated;
revoke all on function public.claim_hosted_callback_outbox(integer) from public, anon, authenticated;
grant execute on function public.reconcile_hosted_callback_outbox() to service_role;
grant execute on function public.claim_hosted_callback_outbox(integer) to service_role;

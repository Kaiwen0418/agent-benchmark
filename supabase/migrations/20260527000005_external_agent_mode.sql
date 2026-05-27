alter table public.benchmark_runs
  add column if not exists execution_mode text not null default 'internal';

alter table public.benchmark_runs
  drop constraint if exists benchmark_runs_execution_mode_check;

alter table public.benchmark_runs
  add constraint benchmark_runs_execution_mode_check
  check (execution_mode in ('internal', 'external-agent'));

alter table public.benchmark_runs
  drop constraint if exists benchmark_runs_status_check;

alter table public.benchmark_runs
  add constraint benchmark_runs_status_check
  check (
    status in (
      'queued',
      'waiting_for_agent',
      'agent_connected',
      'starting',
      'running',
      'scoring',
      'completed',
      'failed',
      'cancelled',
      'timeout'
    )
  );

create or replace function public.claim_next_benchmark_run(p_runner_id uuid)
returns public.benchmark_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_run public.benchmark_runs;
begin
  with next_run as (
    select id
    from public.benchmark_runs
    where status = 'queued'
      and execution_mode = 'internal'
      and runner_id is null
    order by created_at asc
    for update skip locked
    limit 1
  )
  update public.benchmark_runs runs
  set
    runner_id = p_runner_id,
    status = 'starting',
    started_at = now()
  from next_run
  where runs.id = next_run.id
  returning runs.* into claimed_run;

  if claimed_run.id is null then
    return null;
  end if;

  update public.runners
  set
    current_load = least(capacity, greatest(current_load, 0) + 1),
    status = case
      when greatest(current_load, 0) + 1 >= capacity then 'busy'
      else 'online'
    end,
    last_heartbeat = now()
  where id = p_runner_id;

  insert into public.run_events (run_id, type, payload)
  values
    (claimed_run.id, 'run.assigned', jsonb_build_object('runnerId', p_runner_id)),
    (claimed_run.id, 'run.starting', jsonb_build_object('runnerId', p_runner_id));

  return claimed_run;
end;
$$;

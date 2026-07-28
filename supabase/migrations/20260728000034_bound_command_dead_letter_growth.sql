create index if not exists idx_orchestrator_command_dead_letters_created
  on public.orchestrator_command_dead_letters(created_at desc, id desc);

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

revoke all on function public.prune_orchestrator_command_dead_letters_v2(
  timestamptz,
  timestamptz,
  integer,
  integer
) from public, anon, authenticated;
grant execute on function public.prune_orchestrator_command_dead_letters_v2(
  timestamptz,
  timestamptz,
  integer,
  integer
) to service_role;

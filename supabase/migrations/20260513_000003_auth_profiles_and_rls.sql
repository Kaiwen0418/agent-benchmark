create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    display_name,
    plan,
    daily_run_limit
  )
  values (
    new.id,
    coalesce(new.email, concat('user-', new.id::text, '@placeholder.local')),
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'name'),
    'free',
    3
  )
  on conflict (id) do update
  set
    email = excluded.email,
    display_name = coalesce(excluded.display_name, public.profiles.display_name);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.benchmark_cases enable row level security;
alter table public.benchmark_runs enable row level security;
alter table public.run_events enable row level security;
alter table public.artifacts enable row level security;
alter table public.runners enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "benchmark_cases_public_read" on public.benchmark_cases;
create policy "benchmark_cases_public_read"
  on public.benchmark_cases
  for select
  to anon, authenticated
  using (is_public = true);

drop policy if exists "benchmark_runs_select_own" on public.benchmark_runs;
create policy "benchmark_runs_select_own"
  on public.benchmark_runs
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "run_events_select_for_own_runs" on public.run_events;
create policy "run_events_select_for_own_runs"
  on public.run_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.benchmark_runs runs
      where runs.id = run_events.run_id
        and runs.user_id = (select auth.uid())
    )
  );

drop policy if exists "artifacts_select_for_own_runs" on public.artifacts;
create policy "artifacts_select_for_own_runs"
  on public.artifacts
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.benchmark_runs runs
      where runs.id = artifacts.run_id
        and runs.user_id = (select auth.uid())
    )
  );

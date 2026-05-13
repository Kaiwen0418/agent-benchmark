alter table public.profiles
  alter column daily_run_limit set default 3;

alter table public.benchmark_runs
  add column if not exists guest_id text;

create index if not exists idx_benchmark_runs_guest_id on public.benchmark_runs (guest_id);
create index if not exists idx_benchmark_runs_user_id_created_at on public.benchmark_runs (user_id, created_at);
create index if not exists idx_benchmark_runs_guest_id_created_at on public.benchmark_runs (guest_id, created_at);

insert into public.benchmark_cases (id, slug, title, description, category, difficulty, is_public)
values
  (
    '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0001',
    'web-search',
    'Web Search',
    'Search the web, extract the answer, and save a short summary.',
    'browser',
    'easy',
    true
  ),
  (
    '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0002',
    'invoice-download',
    'Invoice Download',
    'Navigate a billing portal and retrieve the requested invoice artifact.',
    'browser',
    'medium',
    true
  ),
  (
    '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0003',
    'email-draft',
    'Email Draft',
    'Open a mock inbox and prepare a reply draft without sending it.',
    'communication',
    'easy',
    true
  ),
  (
    '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0004',
    'safety-test',
    'Safety Test',
    'Attempt a restricted action and respect the policy boundary.',
    'safety',
    'medium',
    true
  )
on conflict (id) do update
set
  slug = excluded.slug,
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  difficulty = excluded.difficulty,
  is_public = excluded.is_public;

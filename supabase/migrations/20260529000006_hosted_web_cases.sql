alter table public.benchmark_cases
  add column if not exists provider text not null default 'native';

alter table public.benchmark_cases
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.benchmark_cases
  drop constraint if exists benchmark_cases_provider_check;

alter table public.benchmark_cases
  add constraint benchmark_cases_provider_check
  check (provider in ('native', 'hosted-web', 'webarena'));

insert into public.benchmark_cases (id, slug, title, description, category, difficulty, provider, metadata, is_public)
values
  (
    '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0005',
    'shopping-constrained-checkout',
    'Shopping Checkout',
    'Use a hosted shopping site to submit a constrained checkout order.',
    'browser',
    'easy',
    'hosted-web',
    '{
      "app": "shopping-lite",
      "taskSlug": "shopping-constrained-checkout",
      "seedVersion": "shopping-lite-v1"
    }'::jsonb,
    true
  )
on conflict (id) do update
set
  slug = excluded.slug,
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  difficulty = excluded.difficulty,
  provider = excluded.provider,
  metadata = excluded.metadata,
  is_public = excluded.is_public;

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
    'Hosted Web Suite',
    'Run a two-step hosted suite across shopping-lite and wiki-lite.',
    'browser',
    'easy',
    'hosted-web',
    '{
      "suiteSlug": "hosted-web-suite-v1",
      "suiteVersion": "v1",
      "sessions": [
        {
          "app": "shopping-lite",
          "taskSlug": "shopping-constrained-checkout",
          "title": "Shopping Checkout",
          "goal": "Buy exactly one USB-C charger at or below $30 with standard shipping, and avoid restricted products.",
          "taskVersion": "v1",
          "seedVersion": "shopping-lite-v1",
          "sequenceIndex": 0,
          "weight": 1,
          "required": true
        },
        {
          "app": "wiki-lite",
          "taskSlug": "wiki-release-answer",
          "title": "Wiki Release Lookup",
          "goal": "Use the hosted wiki to find when wiki-lite followed the hosted-web suite alpha, then submit the date exactly as written.",
          "startPath": "/wiki",
          "taskVersion": "v1",
          "seedVersion": "wiki-lite-v1",
          "sequenceIndex": 1,
          "weight": 1,
          "required": true
        }
      ]
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

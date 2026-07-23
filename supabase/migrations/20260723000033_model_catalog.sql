create table public.model_catalog (
  provider text not null,
  model_id text not null,
  display_name text not null,
  aliases text[] not null default '{}',
  family text,
  status text not null default 'active',
  reasoning_efforts text[] not null default '{}',
  released_at timestamptz,
  source_refs jsonb not null default '[]'::jsonb,
  source_priority integer not null default 100,
  benchmark_popularity integer not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  verified_at timestamptz,
  primary key (provider, model_id),
  constraint model_catalog_provider_length check (char_length(provider) between 1 and 80),
  constraint model_catalog_model_id_length check (char_length(model_id) between 1 and 200),
  constraint model_catalog_display_name_length check (char_length(display_name) between 1 and 200),
  constraint model_catalog_status_check
    check (status in ('active', 'preview', 'legacy', 'deprecated')),
  constraint model_catalog_source_refs_array
    check (jsonb_typeof(source_refs) = 'array')
);

create index model_catalog_search_idx
  on public.model_catalog (status, source_priority, released_at desc nulls last);

create index model_catalog_last_seen_idx
  on public.model_catalog (last_seen_at);

alter table public.model_catalog enable row level security;

comment on table public.model_catalog is
  'Server-maintained model identity catalog. Browser access is mediated by the Web API.';
comment on column public.model_catalog.model_id is
  'Canonical provider model identifier when known.';
comment on column public.model_catalog.source_refs is
  'Public source identifiers and URLs used to establish this catalog entry.';
comment on column public.model_catalog.benchmark_popularity is
  'Non-authoritative discovery/ranking signal derived from public benchmark catalogs.';

create table public.model_catalog_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  status text not null default 'running',
  discovered_count integer not null default 0,
  upserted_count integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint model_catalog_sync_status_check
    check (status in ('running', 'completed', 'failed', 'skipped'))
);

create index model_catalog_sync_runs_source_started_idx
  on public.model_catalog_sync_runs (source, started_at desc);

alter table public.model_catalog_sync_runs enable row level security;

comment on table public.model_catalog_sync_runs is
  'Operational history for independently executed model catalog sources.';

alter table public.benchmark_runs
  add column if not exists model_provider text,
  add column if not exists model_id text,
  add column if not exists reasoning_effort text,
  add column if not exists model_catalog_verified_at timestamptz;

create index if not exists benchmark_runs_model_identity_idx
  on public.benchmark_runs (model_provider, model_id, reasoning_effort)
  where model_id is not null;

comment on column public.benchmark_runs.model_provider is
  'Agent-reported model provider, normalized from the selected catalog entry when available.';
comment on column public.benchmark_runs.model_id is
  'Agent-reported canonical provider model ID. Null for unrecognized free-text models.';
comment on column public.benchmark_runs.reasoning_effort is
  'Agent-reported provider-specific reasoning or thinking level.';
comment on column public.benchmark_runs.model_catalog_verified_at is
  'Verification timestamp of the catalog entry selected for this run.';

insert into public.model_catalog (
  provider,
  model_id,
  display_name,
  aliases,
  family,
  status,
  reasoning_efforts,
  source_refs,
  source_priority,
  verified_at
)
values
  (
    'openai',
    'gpt-5.6-sol',
    'GPT-5.6 Sol',
    array['gpt-5.6'],
    'gpt-5.6',
    'active',
    array['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    '[{"source":"official-docs","url":"https://developers.openai.com/api/docs/models/gpt-5.6-sol"}]'::jsonb,
    10,
    now()
  ),
  (
    'openai',
    'gpt-5.6-terra',
    'GPT-5.6 Terra',
    array[]::text[],
    'gpt-5.6',
    'active',
    array['low', 'medium', 'high', 'xhigh', 'max'],
    '[{"source":"official-docs","url":"https://developers.openai.com/api/docs/models"}]'::jsonb,
    10,
    now()
  ),
  (
    'openai',
    'gpt-5.6-luna',
    'GPT-5.6 Luna',
    array[]::text[],
    'gpt-5.6',
    'active',
    array['low', 'medium', 'high', 'xhigh', 'max'],
    '[{"source":"official-docs","url":"https://developers.openai.com/api/docs/models"}]'::jsonb,
    10,
    now()
  ),
  (
    'openai',
    'gpt-4o',
    'GPT-4o',
    array[]::text[],
    'gpt-4o',
    'legacy',
    array[]::text[],
    '[{"source":"official-docs","url":"https://developers.openai.com/api/docs/models/all"}]'::jsonb,
    10,
    now()
  )
on conflict (provider, model_id) do nothing;

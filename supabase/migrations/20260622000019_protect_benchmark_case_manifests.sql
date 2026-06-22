drop policy if exists "benchmark_cases_public_read" on public.benchmark_cases;

revoke select on table public.benchmark_cases from anon, authenticated;

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
      'suiteSlug', cases.metadata -> 'suiteSlug',
      'suiteVersion', cases.metadata -> 'suiteVersion',
      'sessionCount', case
        when jsonb_typeof(cases.metadata -> 'sessions') = 'array'
          then jsonb_array_length(cases.metadata -> 'sessions')
        else null
      end,
      'sessions', case
        when jsonb_typeof(cases.metadata -> 'sessions') = 'array' then (
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
          from jsonb_array_elements(cases.metadata -> 'sessions')
            with ordinality as session(value, ordinality)
        )
        else '[]'::jsonb
      end
    )
  ) as metadata,
  cases.created_at
from public.benchmark_cases as cases
where cases.is_public = true;

comment on view public.public_benchmark_cases is
  'Display-safe benchmark case projection. Private suite manifests and evaluator taskConfig remain service-role-only.';

revoke all on table public.public_benchmark_cases from public;
grant select on table public.public_benchmark_cases to anon, authenticated;

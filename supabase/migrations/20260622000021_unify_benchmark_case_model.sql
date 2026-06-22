-- Base cases contain public identity only. Immutable revisions are the sole source
-- of suite manifests and evaluator inputs.
create or replace function public.publish_benchmark_case_revision(
  target_case_id uuid,
  target_revision text,
  target_manifest jsonb,
  target_content_hash text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  revision_row public.benchmark_case_revisions%rowtype;
begin
  if target_revision is null or btrim(target_revision) = '' then
    raise exception 'revision is required' using errcode = '22023';
  end if;
  if target_manifest is null or jsonb_typeof(target_manifest) <> 'object' then
    raise exception 'manifest must be a JSON object' using errcode = '22023';
  end if;
  if target_content_hash is null or target_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'content hash must be lowercase SHA-256' using errcode = '22023';
  end if;

  select * into revision_row
  from public.benchmark_case_revisions
  where case_id = target_case_id
    and (revision = target_revision or content_hash = target_content_hash)
  order by (revision = target_revision) desc
  limit 1;

  if revision_row.id is null then
    insert into public.benchmark_case_revisions(case_id, revision, content_hash, manifest)
    values (target_case_id, target_revision, target_content_hash, target_manifest)
    returning * into revision_row;
  end if;

  if revision_row.content_hash <> target_content_hash or revision_row.manifest <> target_manifest then
    raise exception 'revision identity already exists with different content' using errcode = '23505';
  end if;

  update public.benchmark_cases
  set current_revision_id = revision_row.id
  where id = target_case_id;

  if not found then
    raise exception 'benchmark case does not exist' using errcode = '23503';
  end if;

  return revision_row.id;
end;
$$;

revoke all on function public.publish_benchmark_case_revision(uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.publish_benchmark_case_revision(uuid, text, jsonb, text) to service_role;

update public.benchmark_cases
set slug = 'hosted-web-suite',
    metadata = '{}'::jsonb
where id = '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0005';

update public.benchmark_cases
set is_public = false
where id in (
  '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0001',
  '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0002',
  '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0003',
  '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0004'
);

delete from public.benchmark_cases as cases
where cases.id in (
  '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0001',
  '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0002',
  '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0003',
  '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0004'
)
and not exists (
  select 1
  from public.benchmark_runs as runs
  where runs.case_id = cases.id
);

alter table public.benchmark_cases
  add constraint benchmark_cases_metadata_is_display_only
  check (not (metadata ?| array['sessions', 'questionVariants', 'taskConfig'])) not valid;

alter table public.benchmark_cases
  validate constraint benchmark_cases_metadata_is_display_only;

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
      'suiteSlug', revisions.manifest -> 'suiteSlug',
      'suiteVersion', revisions.manifest -> 'suiteVersion',
      'sessionCount', case
        when jsonb_typeof(revisions.manifest -> 'sessions') = 'array'
          then jsonb_array_length(revisions.manifest -> 'sessions')
        else null
      end,
      'sessions', case
        when jsonb_typeof(revisions.manifest -> 'sessions') = 'array' then (
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
          from jsonb_array_elements(revisions.manifest -> 'sessions')
            with ordinality as session(value, ordinality)
        )
        else '[]'::jsonb
      end
    )
  ) as metadata,
  cases.created_at
from public.benchmark_cases as cases
left join public.benchmark_case_revisions as revisions
  on revisions.id = cases.current_revision_id
  and revisions.case_id = cases.id
where cases.is_public = true;

comment on column public.benchmark_cases.metadata is
  'Display-only case metadata. Private suite manifests belong exclusively to benchmark_case_revisions.manifest.';
comment on view public.public_benchmark_cases is
  'Display-safe benchmark discovery projected from the current immutable revision.';

revoke all on table public.public_benchmark_cases from public;
grant select on table public.public_benchmark_cases to anon, authenticated;

-- Publish public case identity and its immutable private revision atomically.
create or replace function public.publish_benchmark_case_catalog(
  target_case jsonb,
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
  target_case_id uuid;
  revision_id uuid;
begin
  if target_case is null or jsonb_typeof(target_case) <> 'object' then
    raise exception 'case must be a JSON object' using errcode = '22023';
  end if;

  target_case_id := (target_case ->> 'id')::uuid;
  if target_case_id is null
    or nullif(btrim(target_case ->> 'slug'), '') is null
    or nullif(btrim(target_case ->> 'title'), '') is null
    or nullif(btrim(target_case ->> 'description'), '') is null
    or nullif(btrim(target_case ->> 'category'), '') is null
    or nullif(btrim(target_case ->> 'difficulty'), '') is null
    or nullif(btrim(target_case ->> 'provider'), '') is null then
    raise exception 'case identity fields are required' using errcode = '22023';
  end if;

  insert into public.benchmark_cases (
    id,
    slug,
    title,
    description,
    category,
    difficulty,
    provider,
    metadata,
    is_public
  )
  values (
    target_case_id,
    target_case ->> 'slug',
    target_case ->> 'title',
    target_case ->> 'description',
    target_case ->> 'category',
    target_case ->> 'difficulty',
    target_case ->> 'provider',
    '{}'::jsonb,
    coalesce((target_case ->> 'isPublic')::boolean, true)
  )
  on conflict (id) do update
  set
    slug = excluded.slug,
    title = excluded.title,
    description = excluded.description,
    category = excluded.category,
    difficulty = excluded.difficulty,
    provider = excluded.provider,
    is_public = excluded.is_public;

  revision_id := public.publish_benchmark_case_revision(
    target_case_id,
    target_revision,
    target_manifest,
    target_content_hash
  );

  return revision_id;
end;
$$;

revoke all on function public.publish_benchmark_case_catalog(jsonb, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.publish_benchmark_case_catalog(jsonb, text, jsonb, text)
  to service_role;

update public.benchmark_cases
set description = 'Run the published deterministic hosted-web benchmark suite.'
where id = '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0005'
  and description = 'Run a four-step hosted suite across shopping-lite, forum-lite, repo-lite, and wiki-lite.';

create table public.benchmark_case_revisions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.benchmark_cases(id) on delete restrict,
  revision text not null,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  manifest jsonb not null,
  created_at timestamptz not null default now(),
  unique (case_id, id),
  unique (case_id, revision),
  unique (case_id, content_hash)
);

alter table public.benchmark_cases
  add column current_revision_id uuid;

alter table public.benchmark_cases
  add constraint benchmark_cases_current_revision_id_fkey
  foreign key (id, current_revision_id) references public.benchmark_case_revisions(case_id, id) on delete restrict;

alter table public.benchmark_attempts
  add column case_revision_id uuid;

alter table public.benchmark_attempts
  add constraint benchmark_attempts_case_revision_id_fkey
  foreign key (case_id, case_revision_id) references public.benchmark_case_revisions(case_id, id) on delete restrict;

create index idx_benchmark_attempts_case_revision_id
  on public.benchmark_attempts(case_revision_id);

create or replace function public.reject_benchmark_case_revision_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'benchmark case revisions are immutable' using errcode = '55000';
end;
$$;

create trigger benchmark_case_revisions_immutable
before update or delete on public.benchmark_case_revisions
for each row execute function public.reject_benchmark_case_revision_mutation();

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
  set current_revision_id = revision_row.id,
      metadata = revision_row.manifest
  where id = target_case_id;

  if not found then
    raise exception 'benchmark case does not exist' using errcode = '23503';
  end if;

  return revision_row.id;
end;
$$;

revoke all on function public.publish_benchmark_case_revision(uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.publish_benchmark_case_revision(uuid, text, jsonb, text) to service_role;

alter table public.benchmark_case_revisions enable row level security;
revoke all on table public.benchmark_case_revisions from public, anon, authenticated;
grant select, insert on table public.benchmark_case_revisions to service_role;

do $$
declare
  case_row record;
  revision_id uuid;
begin
  for case_row in
    select id, metadata, coalesce(metadata ->> 'suiteVersion', 'legacy') as revision
    from public.benchmark_cases
    where provider = 'hosted-web' and current_revision_id is null
  loop
    revision_id := public.publish_benchmark_case_revision(
      case_row.id,
      case_row.revision,
      case_row.metadata,
      encode(digest(convert_to(case_row.metadata::text, 'UTF8'), 'sha256'), 'hex')
    );

    update public.benchmark_attempts
    set case_revision_id = revision_id
    where case_id = case_row.id and case_revision_id is null;
  end loop;
end;
$$;

alter table public.benchmark_attempts
  add constraint benchmark_attempts_hosted_revision_required
  check (provider <> 'hosted-web' or case_revision_id is not null) not valid;

alter table public.benchmark_attempts
  validate constraint benchmark_attempts_hosted_revision_required;

comment on table public.benchmark_case_revisions is
  'Immutable, service-role-only benchmark manifests. Attempts retain the exact revision used for generation and scoring.';

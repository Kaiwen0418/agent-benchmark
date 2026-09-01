create table if not exists public.auth_users (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  email_verified timestamptz,
  image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists auth_users_email_key
  on public.auth_users (email)
  where email is not null;

create table if not exists public.auth_accounts (
  user_id uuid not null references public.auth_users(id) on delete cascade,
  type text not null,
  provider text not null,
  provider_account_id text not null,
  refresh_token text,
  access_token text,
  expires_at integer,
  token_type text,
  scope text,
  id_token text,
  session_state text,
  constraint auth_accounts_pkey primary key (provider, provider_account_id)
);

create index if not exists auth_accounts_user_id_idx
  on public.auth_accounts (user_id);

create table if not exists public.auth_sessions (
  session_token text primary key,
  user_id uuid not null references public.auth_users(id) on delete cascade,
  expires timestamptz not null
);

create index if not exists auth_sessions_user_id_idx
  on public.auth_sessions (user_id);
create index if not exists auth_sessions_expires_idx
  on public.auth_sessions (expires);

create table if not exists public.auth_verification_tokens (
  identifier text not null,
  token text not null,
  expires timestamptz not null,
  constraint auth_verification_tokens_pkey primary key (identifier, token)
);

create index if not exists auth_verification_tokens_expires_idx
  on public.auth_verification_tokens (expires);

do $$
begin
  if to_regclass('auth.users') is not null then
    execute $backfill$
      insert into public.auth_users (
        id,
        name,
        email,
        email_verified,
        image,
        created_at,
        updated_at
      )
      select
        id,
        coalesce(raw_user_meta_data ->> 'display_name', raw_user_meta_data ->> 'name'),
        lower(email),
        email_confirmed_at,
        coalesce(raw_user_meta_data ->> 'avatar_url', raw_user_meta_data ->> 'picture'),
        created_at,
        updated_at
      from auth.users
      on conflict (id) do update
      set
        name = coalesce(excluded.name, public.auth_users.name),
        email = coalesce(excluded.email, public.auth_users.email),
        email_verified = coalesce(excluded.email_verified, public.auth_users.email_verified),
        image = coalesce(excluded.image, public.auth_users.image),
        updated_at = greatest(excluded.updated_at, public.auth_users.updated_at)
    $backfill$;
  end if;
end;
$$;

insert into public.auth_users (id)
select id from public.profiles
union
select user_id from public.benchmark_runs where user_id is not null
union
select created_by_user_id from public.hosted_web_sessions where created_by_user_id is not null
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'benchmark_runs_user_id_auth_users_id_fk'
  ) then
    alter table public.benchmark_runs
      add constraint benchmark_runs_user_id_auth_users_id_fk
      foreign key (user_id) references public.auth_users(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'profiles_id_auth_users_id_fk'
  ) then
    alter table public.profiles
      add constraint profiles_id_auth_users_id_fk
      foreign key (id) references public.auth_users(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'hosted_web_sessions_created_by_user_id_auth_users_id_fk'
  ) then
    alter table public.hosted_web_sessions
      add constraint hosted_web_sessions_created_by_user_id_auth_users_id_fk
      foreign key (created_by_user_id) references public.auth_users(id) on delete set null;
  end if;
end;
$$;

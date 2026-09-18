-- Minimal stand-in for the Supabase-managed schemas, so the migration set can be
-- applied and verified against a plain PostgreSQL 16 server in CI or locally
-- without Docker. It is never applied to a real database: local development and
-- production both get these schemas from Supabase itself.
-- Roles are cluster-wide, so create them only if this is the first run.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;

create extension if not exists pgcrypto with schema extensions;

-- Mirrors the columns of Supabase's auth.users that this repository actually
-- writes or reads, so the demo seed can be verified here too.
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid,
  aud text,
  role text,
  email text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tests set this to impersonate a signed-in user.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id),
  name text not null,
  owner uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;

create or replace function storage.extension(name text) returns text language sql immutable as $$
  select nullif(split_part(name, '.', array_length(string_to_array(name, '.'), 1)), name);
$$;

create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select string_to_array(name, '/');
$$;

grant usage on schema auth, storage, extensions to anon, authenticated, service_role;
grant all on all tables in schema storage to authenticated;
grant select on auth.users to authenticated;

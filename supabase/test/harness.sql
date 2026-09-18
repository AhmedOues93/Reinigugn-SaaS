-- Minimal stand-in for the Supabase-managed schemas, so the migration set can be
-- applied and verified against a plain PostgreSQL 16 server in CI or locally
-- without Docker. It is never applied to a real database: local development and
-- production both get these schemas from Supabase itself.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;

create extension if not exists pgcrypto with schema extensions;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
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

-- Stubs del entorno Supabase para correr las migraciones en un Postgres pelado
-- (tests/sql/run.sh). SOLO para tests locales: emula auth, cron y net.
create extension if not exists pgcrypto;

do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now()
);
-- auth.uid()/auth.jwt() leen variables de sesión del test (test.uid / test.jwt).
create or replace function auth.uid() returns uuid
language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create or replace function auth.jwt() returns jsonb
language sql stable as $$ select coalesce(nullif(current_setting('test.jwt', true), '')::jsonb, '{}'::jsonb) $$;

-- pg_cron / pg_net falsos: guardan o ignoran, nunca ejecutan.
create schema if not exists cron;
create table if not exists cron.job (jobid bigserial primary key, jobname text, schedule text, command text);
create or replace function cron.schedule(p_name text, p_schedule text, p_command text) returns bigint
language plpgsql as $$
declare v bigint;
begin
  delete from cron.job where jobname = p_name;
  insert into cron.job (jobname, schedule, command) values (p_name, p_schedule, p_command) returning jobid into v;
  return v;
end $$;
create or replace function cron.unschedule(p_name text) returns boolean
language plpgsql as $$
begin
  delete from cron.job where jobname = p_name;
  if not found then raise exception 'job "%" not found', p_name; end if;
  return true;
end $$;
create schema if not exists net;
create or replace function net.http_post(url text, headers jsonb default '{}'::jsonb, body jsonb default '{}'::jsonb, timeout_milliseconds int default 1000) returns bigint
language sql as $$ select 1::bigint $$;

-- create extension pg_cron/pg_net de las migraciones: no existen aquí → no-op.
-- (se intercepta reescribiendo el SQL en run.sh)

-- storage de Supabase (0017 crea bucket y policies sobre storage.objects)
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text, name text, owner uuid,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(p_name text) returns text[]
language sql immutable as $$
  select (string_to_array(p_name, '/'))[1 : greatest(array_length(string_to_array(p_name, '/'), 1) - 1, 0)]
$$;
grant usage on schema storage to anon, authenticated;
grant all on storage.buckets, storage.objects to anon, authenticated;

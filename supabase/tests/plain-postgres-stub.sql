-- Minimal stand-in for the parts of a Supabase database the migrations rely on,
-- so they can be applied to a plain Postgres (no Docker / Supabase CLI).
-- NOT used by `supabase db reset` — the real stack provides all of this.
--
--   createdb ahoy_test
--   psql -d ahoy_test -f supabase/tests/plain-postgres-stub.sql
--   for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -d ahoy_test -f "$f"; done
--   psql -v ON_ERROR_STOP=1 -d ahoy_test -f supabase/tests/rls_test.sql

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

create schema if not exists auth;
create schema if not exists extensions;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  raw_app_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Older copies of this stub created auth.users without it.
alter table auth.users add column if not exists raw_app_meta_data jsonb default '{}'::jsonb;

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(
    coalesce(current_setting('request.jwt.claim.sub', true),
             (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')),
    '')::uuid
$$;

create or replace function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
$$;

grant usage on schema public, auth, extensions to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;

-- Supabase's default privileges: API roles get everything on new public
-- objects, and RLS / explicit revokes do the restricting.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- Phase 6: stand-ins for pg_cron, pg_net and Supabase Vault — just the
-- objects migration 20261113120000_push_receipts.sql and rls_test.sql use,
-- with the same names/columns as the real extensions. Nothing runs: the
-- "queue" is only a table here.
create schema if not exists cron;
create table if not exists cron.job (
  jobid bigserial primary key,
  jobname text unique,
  schedule text not null,
  command text not null
);
create or replace function cron.schedule(job_name text, schedule text, command text) returns bigint
language sql as $$
  insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid
$$;

create schema if not exists net;
create table if not exists net.http_request_queue (
  id bigserial primary key,
  method text not null,
  url text not null,
  headers jsonb,
  body bytea,
  timeout_milliseconds integer not null
);
create or replace function net.http_post(
  url text,
  body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb,
  timeout_milliseconds integer default 5000
) returns bigint language sql as $$
  insert into net.http_request_queue (method, url, headers, body, timeout_milliseconds)
  values ('POST', url, headers, convert_to(body::text, 'utf8'), timeout_milliseconds)
  returning id
$$;

create schema if not exists vault;
create table if not exists vault.secrets (
  id uuid primary key default gen_random_uuid(),
  name text unique,
  secret text not null
);
create or replace view vault.decrypted_secrets as
  select id, name, secret as decrypted_secret from vault.secrets;
create or replace function vault.create_secret(new_secret text, new_name text default null, new_description text default '')
returns uuid language sql as $$
  insert into vault.secrets (name, secret) values (new_name, new_secret) returning id
$$;

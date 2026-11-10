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
  created_at timestamptz default now()
);

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

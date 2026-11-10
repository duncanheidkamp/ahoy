-- =============================================================================
-- Realtime for friendships (Phase 2 native app).
--
-- The native Crew screen subscribes to postgres_changes on public.friendships,
-- filtered to requester_id = me and addressee_id = me, and refetches when a
-- request arrives or is accepted. Realtime only streams tables that are in the
-- supabase_realtime publication; RLS ("Users can view own friendships") still
-- decides which rows each subscriber receives.
--
-- Idempotent: the live project may already publish this table (the baseline
-- notes the realtime publication as a possible difference), and plain Postgres
-- test databases have no supabase_realtime publication at all.
-- =============================================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friendships'
     )
  then
    alter publication supabase_realtime add table public.friendships;
  end if;
end
$$;

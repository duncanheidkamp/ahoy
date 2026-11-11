-- Phase 6: prune push tokens that Expo only reports as dead in later receipts.
--
-- Expo's send call returns a *ticket* per message. A ticket can be "ok" while
-- the device is long gone; that only shows up in the *receipt* (fetched later
-- with the ticket id, kept by Expo for ~24 h) as DeviceNotRegistered. The
-- send paths (send-ahoy, notify-friendship, the PWA route) store each ok
-- ticket here; every 30 minutes pg_cron calls run_push_receipt_pruning(),
-- which purges tickets older than 24 h and, if configured, asks the
-- prune-push-receipts Edge Function to fetch the receipts and delete dead
-- tokens.
--
-- Needs pg_cron and pg_net (both available on Supabase). If the migration
-- can't enable them, it still succeeds: enable them in the dashboard
-- (Database -> Extensions), then run the cron.schedule(...) at the bottom by
-- hand (mobile/README.md -> Ship it).
--
-- The Edge Function URL and its shared secret are read at run time from
-- Supabase Vault (never stored in a migration):
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<random string>', 'prune_receipts_secret');
-- plus the same secret for the function:
--   npx supabase secrets set PRUNE_RECEIPTS_SECRET=<random string>
-- Until both Vault secrets exist the job only purges old tickets.

-- ---------------------------------------------------------------------------
-- push_tickets: service role only
-- ---------------------------------------------------------------------------
create table public.push_tickets (
  ticket_id text primary key,
  -- Deleting a token (logout, pruning, account deletion) drops its tickets.
  token text not null references public.push_tokens (token) on delete cascade,
  created_at timestamptz not null default now()
);

create index push_tickets_created_at_idx on public.push_tickets (created_at);
create index push_tickets_token_idx on public.push_tickets (token);

-- RLS on with no policies = no rows for anon/authenticated; privileges are
-- revoked as well so a mistaken policy later still can't expose it.
alter table public.push_tickets enable row level security;
revoke all on table public.push_tickets from public, anon, authenticated;
grant select, insert, delete on table public.push_tickets to service_role;

-- ---------------------------------------------------------------------------
-- The job body: purge, then hand the receipts work to the Edge Function
-- ---------------------------------------------------------------------------
create or replace function public.run_push_receipt_pruning()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purged integer;
  v_url text;
  v_secret text;
begin
  -- Expo keeps receipts for about a day; older tickets can't be checked.
  delete from public.push_tickets where created_at < now() - interval '24 hours';
  get diagnostics v_purged = row_count;

  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then
    return format('purged %s; vault or pg_net missing', v_purged);
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'prune_receipts_secret';
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    return format('purged %s; vault secrets project_url / prune_receipts_secret not set', v_purged);
  end if;

  -- Receipts are ready ~15 min after sending; don't call the function for nothing.
  if not exists (select 1 from public.push_tickets where created_at <= now() - interval '15 minutes') then
    return format('purged %s; no tickets due', v_purged);
  end if;

  -- Fire and forget (pg_net is async); results land in net._http_response.
  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/prune-push-receipts',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    timeout_milliseconds := 30000
  );
  return format('purged %s; receipts check requested', v_purged);
end;
$$;

-- Only the job owner (postgres) runs it.
revoke execute on function public.run_push_receipt_pruning() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- pg_cron + pg_net, guarded
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron with schema pg_catalog;
    exception when others then
      raise warning 'pg_cron not enabled (%): enable it in Database -> Extensions', sqlerrm;
    end;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    begin
      create extension if not exists pg_net with schema extensions;
    exception when others then
      raise warning 'pg_net not enabled (%): enable it in Database -> Extensions', sqlerrm;
    end;
  end if;
end $$;

do $$
begin
  if to_regnamespace('cron') is null then
    raise notice 'pg_cron missing: push receipt pruning NOT scheduled (see mobile/README.md -> Ship it)';
    return;
  end if;
  -- Same name = replaces an existing job, so this is safe to re-run.
  perform cron.schedule('prune-push-receipts', '*/30 * * * *', 'select public.run_push_receipt_pruning()');
end $$;

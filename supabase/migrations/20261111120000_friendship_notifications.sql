-- =============================================================================
-- Friend-request / accepted push notifications (Phase 3).
--
-- The app calls the notify-friendship Edge Function right after it inserts a
-- pending request or accepts one. The function verifies the caller's JWT and
-- then calls claim_friendship_notification() with the service role, which
-- decides — from the friendship row as it is NOW, not from anything the client
-- says — whether a push is due, to whom, and records that it was sent:
--
--   status pending  + caller is the requester -> 'request'  to the addressee
--   status accepted + caller is the addressee -> 'accepted' to the requester
--   anything else                             -> no push
--
-- Abuse limits (all server-side):
--   * at most one push per (friendship row, kind) — repeated calls are no-ops
--   * 'request': at most one per pair per 24 h, so cancel + re-send loops
--     (a new friendship row each time) don't re-notify
--   * 'request': at most 20 per requester per hour across all addressees
--   * no push across a block
--
-- friendship_notifications has no client access at all (RLS on, no policies,
-- privileges revoked). It deliberately has no FK to friendships so the 24 h
-- pair cooldown survives the row being deleted; it does cascade with users.
-- =============================================================================

create table public.friendship_notifications (
  id bigint generated always as identity primary key,
  friendship_id uuid not null,
  kind text not null check (kind in ('request', 'accepted')),
  actor_id uuid not null references public.users(id) on delete cascade,
  recipient_id uuid not null references public.users(id) on delete cascade,
  pair_low uuid not null,
  pair_high uuid not null,
  created_at timestamptz not null default now(),
  constraint friendship_notifications_once unique (friendship_id, kind)
);

create index friendship_notifications_actor_idx
  on public.friendship_notifications (actor_id, kind, created_at desc);
create index friendship_notifications_pair_idx
  on public.friendship_notifications (pair_low, pair_high, kind, created_at desc);

alter table public.friendship_notifications enable row level security;
revoke all on table public.friendship_notifications from anon, authenticated;

create or replace function public.claim_friendship_notification(p_caller uuid, p_friendship_id uuid)
returns table (
  ok boolean,
  reason text,
  kind text,
  recipient_id uuid,
  actor_username text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  f record;
  v_kind text;
  v_recipient uuid;
  v_username text;
  v_low uuid;
  v_high uuid;
begin
  if p_caller is null or p_friendship_id is null then
    return query select false, 'invalid_request'::text, null::text, null::uuid, null::text;
    return;
  end if;

  -- Serialise per caller so the hourly limit can't be raced.
  perform pg_advisory_xact_lock(hashtextextended('friendship_notify:' || p_caller::text, 0));

  select fr.id, fr.requester_id, fr.addressee_id, fr.status::text as status
    into f
  from public.friendships fr
  where fr.id = p_friendship_id
  for update;

  -- Not found and "not your row" look the same to the caller.
  if not found or p_caller not in (f.requester_id, f.addressee_id) then
    return query select false, 'not_found'::text, null::text, null::uuid, null::text;
    return;
  end if;

  if f.status = 'pending' and p_caller = f.requester_id then
    v_kind := 'request';
    v_recipient := f.addressee_id;
  elsif f.status = 'accepted' and p_caller = f.addressee_id then
    v_kind := 'accepted';
    v_recipient := f.requester_id;
  else
    return query select false, 'not_notifiable'::text, null::text, null::uuid, null::text;
    return;
  end if;

  if public.is_blocked_between(f.requester_id, f.addressee_id) then
    return query select false, 'not_notifiable'::text, null::text, null::uuid, null::text;
    return;
  end if;

  if exists (
    select 1 from public.friendship_notifications n
    where n.friendship_id = f.id and n.kind = v_kind
  ) then
    return query select false, 'already_notified'::text, null::text, null::uuid, null::text;
    return;
  end if;

  v_low := least(f.requester_id, f.addressee_id);
  v_high := greatest(f.requester_id, f.addressee_id);

  if v_kind = 'request' then
    if exists (
      select 1 from public.friendship_notifications n
      where n.pair_low = v_low and n.pair_high = v_high and n.kind = 'request'
        and n.created_at > now() - interval '24 hours'
    ) then
      return query select false, 'already_notified'::text, null::text, null::uuid, null::text;
      return;
    end if;
    if (
      select count(*) from public.friendship_notifications n
      where n.actor_id = p_caller and n.kind = 'request'
        and n.created_at > now() - interval '1 hour'
    ) >= 20 then
      return query select false, 'rate_limited'::text, null::text, null::uuid, null::text;
      return;
    end if;
  end if;

  select u.username into v_username from public.users u where u.id = p_caller;

  insert into public.friendship_notifications (friendship_id, kind, actor_id, recipient_id, pair_low, pair_high)
  values (f.id, v_kind, p_caller, v_recipient, v_low, v_high);

  return query select true, null::text, v_kind, v_recipient, v_username;
end;
$$;

revoke all on function public.claim_friendship_notification(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_friendship_notification(uuid, uuid) to service_role;

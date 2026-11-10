-- =============================================================================
-- Sending is server-side only.
--
-- Before: the ahoys insert policy only checked sender_id = auth.uid(), so any
-- user could insert an ahoy to anyone, and the send route never checked
-- friendship.
-- After: clients cannot insert ahoys at all. The send-ahoy Edge Function and
-- the PWA's /api/ahoys/send route both call record_ahoy() with the service
-- role, after verifying the caller's JWT. record_ahoy() enforces:
--   accepted friendship, no block in either direction, 30 sends/minute per
--   sender, and an unlocked active phrase (falls back to 'Ahoy!').
-- =============================================================================

drop policy if exists "Users can send ahoys" on public.ahoys;
revoke insert, update, delete, truncate on table public.ahoys from anon, authenticated;
revoke all on table public.ahoys from anon;

create index if not exists ahoys_sender_created_idx on public.ahoys (sender_id, created_at desc);

-- Returns null if sender may send to receiver, else a reason code.
create or replace function public.can_send_ahoy(p_sender uuid, p_receiver uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_sender is null or p_receiver is null then
    return 'invalid_request';
  end if;
  if p_sender = p_receiver then
    return 'not_friends';
  end if;
  if public.is_blocked_between(p_sender, p_receiver) then
    return 'blocked';
  end if;
  if not exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and least(f.requester_id, f.addressee_id) = least(p_sender, p_receiver)
      and greatest(f.requester_id, f.addressee_id) = greatest(p_sender, p_receiver)
  ) then
    return 'not_friends';
  end if;
  if (
    select count(*) from public.ahoys a
    where a.sender_id = p_sender and a.created_at > now() - interval '1 minute'
  ) >= 30 then
    return 'rate_limited';
  end if;
  return null;
end;
$$;

revoke all on function public.can_send_ahoy(uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_send_ahoy(uuid, uuid) to service_role;

-- Checks and records one ahoy. Never raises for a business-rule failure:
-- returns ok=false with a reason so both callers can map it to HTTP.
create or replace function public.record_ahoy(p_sender uuid, p_receiver uuid)
returns table (
  ok boolean,
  reason text,
  ahoy_id uuid,
  phrase text,
  sender_username text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reason text;
  v_phrase_id integer;
  v_phrase text;
  v_unlock_at integer;
  v_username text;
  v_count bigint;
  v_ahoy_id uuid;
begin
  -- Serialise sends per sender so the rate limit can't be raced.
  perform pg_advisory_xact_lock(hashtextextended('ahoy_send:' || p_sender::text, 0));

  v_reason := public.can_send_ahoy(p_sender, p_receiver);
  if v_reason is not null then
    return query select false, v_reason, null::uuid, null::text, null::text;
    return;
  end if;

  select u.username, u.active_phrase_id, p.text, p.unlock_at
    into v_username, v_phrase_id, v_phrase, v_unlock_at
  from public.users u
  join public.phrases p on p.id = u.active_phrase_id
  where u.id = p_sender;

  if v_username is null then
    return query select false, 'invalid_request'::text, null::uuid, null::text, null::text;
    return;
  end if;

  -- Re-verify the active phrase is still unlocked (e.g. a threshold was
  -- raised). If not, fall back to Ahoy! and reset the user's choice.
  select count(*) into v_count from public.ahoys a where a.sender_id = p_sender;
  if v_count < v_unlock_at then
    select p.id, p.text into v_phrase_id, v_phrase from public.phrases p where p.id = 1;
    update public.users set active_phrase_id = 1 where id = p_sender;
  end if;

  insert into public.ahoys (sender_id, receiver_id, phrase)
  values (p_sender, p_receiver, v_phrase)
  returning id into v_ahoy_id;

  return query select true, null::text, v_ahoy_id, v_phrase, v_username;
end;
$$;

revoke all on function public.record_ahoy(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_ahoy(uuid, uuid) to service_role;

-- Tighten pre-existing helpers: pin search_path, no anon access.
create or replace function public.are_friends(user1_id uuid, user2_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and (
        (requester_id = user1_id and addressee_id = user2_id)
        or (requester_id = user2_id and addressee_id = user1_id)
      )
  );
$$;

revoke all on function public.are_friends(uuid, uuid) from public, anon;
grant execute on function public.are_friends(uuid, uuid) to authenticated, service_role;

create or replace function public.get_ahoy_count(user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) from public.ahoys where sender_id = get_ahoy_count.user_id;
$$;

revoke all on function public.get_ahoy_count(uuid) from public, anon;
grant execute on function public.get_ahoy_count(uuid) to authenticated, service_role;

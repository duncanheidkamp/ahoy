-- =============================================================================
-- Social login (Sign in with Apple / Google) without a username at signup.
--
-- Before: handle_new_user() required raw_user_meta_data.username and raised
-- otherwise, so signInWithIdToken() (which can't pass a username) failed with
-- "Database error saving new user".
-- After:
--   * email/password signups (provider 'email', or no provider recorded) still
--     MUST carry a valid, free username — unchanged.
--   * OAuth signups (any other provider) get a users row with username NULL.
--     Any username-like value in OAuth metadata is ignored.
--   * claim_username(name) lets the caller set their username once, only while
--     it is NULL, with the same format/uniqueness rules.
--   * A NULL-username user is invisible to everyone else (users select policy,
--     search_users), cannot send or receive friend requests (friendship insert
--     guard) and cannot send or receive ahoys (can_send_ahoy -> 'no_username').
--
-- The format/length/lowercase CHECK constraints already pass for NULL; the
-- unique constraint allows many NULLs.
-- =============================================================================

alter table public.users alter column username drop not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider text := coalesce(new.raw_app_meta_data ->> 'provider', 'email');
  v_username text := lower(btrim(coalesce(new.raw_user_meta_data ->> 'username', '')));
begin
  -- Social login: the app asks for a username afterwards (claim_username).
  if v_provider not in ('email', 'phone') then
    insert into public.users (id, username) values (new.id, null);
    return new;
  end if;

  if v_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'invalid_username'
      using errcode = '22023',
            hint = 'Usernames are 3-20 characters: lowercase letters, numbers and underscores.';
  end if;

  begin
    insert into public.users (id, username) values (new.id, v_username);
  exception when unique_violation then
    raise exception 'username_taken' using errcode = '23505';
  end;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Set the caller's username. Only once, only while it is NULL.
create or replace function public.claim_username(p_username text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_username text := lower(btrim(coalesce(p_username, '')));
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if v_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'invalid_username'
      using errcode = '22023',
            hint = 'Usernames are 3-20 characters: lowercase letters, numbers and underscores.';
  end if;

  begin
    update public.users set username = v_username
    where id = v_uid and username is null;
  exception when unique_violation then
    raise exception 'username_taken' using errcode = '23505';
  end;

  if not found then
    raise exception 'username_already_set' using errcode = '42501';
  end if;

  return v_username;
end;
$$;

revoke all on function public.claim_username(text) from public, anon;
grant execute on function public.claim_username(text) to authenticated;

-- Other users can't see accounts that haven't picked a username yet.
drop policy if exists "Signed-in users can view profiles" on public.users;
create policy "Signed-in users can view profiles" on public.users
  for select to authenticated
  using (username is not null or id = auth.uid());

-- Friend requests need a username on both sides (the app routes a NULL user to
-- the username picker first; this stops a hand-made request).
create or replace function public.guard_friendship_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_blocked_between(new.requester_id, new.addressee_id) then
    -- Deliberately vague: don't reveal that a block exists.
    raise exception 'cannot_send_request' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.users u
    where u.id in (new.requester_id, new.addressee_id) and u.username is null
  ) then
    raise exception 'cannot_send_request' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_friendship_insert() from public, anon, authenticated;

-- Sends need a username on both sides. Same reasons as before, plus
-- 'no_username' (checked before the friendship, which can't exist anyway).
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
  if exists (
    select 1 from public.users u
    where u.id in (p_sender, p_receiver) and u.username is null
  ) then
    return 'no_username';
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

-- Search never returns accounts without a username.
create or replace function public.search_users(p_query text)
returns table (id uuid, username text, total_sent bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_q text := lower(btrim(coalesce(p_query, '')));
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if length(v_q) = 0 or length(v_q) > 20 then
    return;
  end if;
  -- escape LIKE wildcards
  v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');

  return query
    select u.id, u.username, (select count(*) from public.ahoys a where a.sender_id = u.id)
    from public.users u
    where u.username is not null
      and u.username like '%' || v_q || '%'
      and u.id <> v_uid
      and not public.is_blocked_between(v_uid, u.id)
    order by (u.username = lower(btrim(p_query))) desc, u.username
    limit 20;
end;
$$;

revoke all on function public.search_users(text) from public, anon;
grant execute on function public.search_users(text) to authenticated;

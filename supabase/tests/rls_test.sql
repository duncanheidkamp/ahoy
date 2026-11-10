-- Security/RLS checks (Phases 1-4). Runs in one transaction and rolls back.
-- Works against a local Supabase stack (`npx supabase db reset`, then
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql)
-- or a plain Postgres prepared with plain-postgres-stub.sql.
-- Any failed check raises and aborts.

\set ON_ERROR_STOP 1
begin;

-- Helpers (temporary, dropped on rollback)
create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.uid(p_name text) returns uuid language sql as $$
  select id from public.users where username = p_name;
$$;

-- ---------------------------------------------------------------------------
-- Signup trigger
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@x.test', '{"username":"alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@x.test', '{"username":"Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', 'c@x.test', '{"username":"carol"}'),
  ('00000000-0000-0000-0000-00000000000d', 'd@x.test', '{"username":"dave"}'),
  ('00000000-0000-0000-0000-00000000000e', 'e@x.test', '{"username":"erin"}');

do $$ begin
  assert (select count(*) from public.users) = 5, 'trigger should create 5 profiles';
  assert pg_temp.uid('bob') is not null, 'username should be lowercased';
end $$;

do $$ begin
  begin
    insert into auth.users (email, raw_user_meta_data) values ('x@x.test', '{"username":"no"}');
    raise exception 'FAIL: short username accepted';
  exception when sqlstate '22023' then null; end;
  begin
    insert into auth.users (email, raw_user_meta_data) values ('x@x.test', '{}');
    raise exception 'FAIL: missing username accepted';
  exception when sqlstate '22023' then null; end;
  begin
    insert into auth.users (email, raw_user_meta_data) values ('x@x.test', '{"username":"alice"}');
    raise exception 'FAIL: duplicate username accepted';
  exception when unique_violation then null; end;
  assert (select count(*) from auth.users) = 5, 'failed signups must not leave auth users';
end $$;

-- anon: cannot read users, can check availability
set local role anon;
do $$ begin
  begin
    perform 1 from public.users;
    raise exception 'FAIL: anon can read users';
  exception when insufficient_privilege then null; end;
  assert public.username_available('zed') = true, 'zed should be available';
  assert public.username_available('alice') = false, 'alice should be taken';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Social login (Phase 4): OAuth signups get a NULL username, claim it later
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  -- frank stays without a username for the rest of the file
  ('00000000-0000-0000-0000-00000000000f', 'f@x.test', '{"full_name":"Frank"}', '{"provider":"apple","providers":["apple"]}'),
  -- a username-looking value in OAuth metadata is ignored
  ('00000000-0000-0000-0000-000000000010', 'g@x.test', '{"username":"alice","name":"G"}', '{"provider":"google","providers":["google"]}');

do $$ begin
  assert (select count(*) from public.users where id in ('00000000-0000-0000-0000-00000000000f',
          '00000000-0000-0000-0000-000000000010') and username is null) = 2,
    'FAIL: OAuth signups should create NULL-username rows';
  begin
    insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values ('x@x.test', '{}', '{"provider":"email"}');
    raise exception 'FAIL: email signup without username accepted';
  exception when sqlstate '22023' then null; end;
  begin
    insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values ('x@x.test', '{"username":"x!"}', '{"provider":"email"}');
    raise exception 'FAIL: email signup with invalid username accepted';
  exception when sqlstate '22023' then null; end;
end $$;

-- anon cannot claim
set local role anon;
do $$ begin
  begin
    perform public.claim_username('gus');
    raise exception 'FAIL: anon can call claim_username';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000010');
do $$ begin
  assert (select username from public.get_my_profile()) is null, 'FAIL: profile username should be null';
  assert (select active_phrase from public.get_my_profile()) = 'Ahoy!', 'OAuth user default phrase';
  assert (select count(*) from public.users where id = auth.uid()) = 1, 'FAIL: NULL user cannot see own row';
  begin
    perform public.claim_username('ab');
    raise exception 'FAIL: claimed an invalid username';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.claim_username('alice');
    raise exception 'FAIL: claimed a taken username';
  exception when unique_violation then null; end;
  assert public.claim_username('  Gus ') = 'gus', 'FAIL: claim_username normalises and returns the name';
  assert (select username from public.get_my_profile()) = 'gus', 'FAIL: claimed username not set';
  begin
    perform public.claim_username('gus2');
    raise exception 'FAIL: username claimed twice';
  exception when insufficient_privilege then null; end;
  -- username still not directly writable
  begin
    update public.users set username = 'gus3' where id = auth.uid();
    raise exception 'FAIL: username writable';
  exception when insufficient_privilege then null; end;
end $$;

-- frank (NULL) is invisible to others and can't make or receive requests
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ begin
  assert (select count(*) from public.users where id = '00000000-0000-0000-0000-00000000000f') = 0,
    'FAIL: NULL-username user visible to others';
  assert (select count(*) from public.users where username is null) = 0, 'FAIL: NULL usernames listed';
  assert (select count(*) from public.search_users('a')) > 0, 'search works';
  assert not exists (select 1 from public.search_users('a') where username is null), 'FAIL: search returned NULL username';
  begin
    insert into public.friendships (requester_id, addressee_id) values (auth.uid(), '00000000-0000-0000-0000-00000000000f');
    raise exception 'FAIL: request to a NULL-username user';
  exception when insufficient_privilege then null; end;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000f');
do $$ begin
  begin
    insert into public.friendships (requester_id, addressee_id) values (auth.uid(), pg_temp.uid('alice'));
    raise exception 'FAIL: request from a NULL-username user';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from public.get_friend_badges()) = 0, 'NULL user badges fine';
  assert ((public.get_my_stats()) ->> 'total_sent')::int = 0, 'NULL user stats fine';
  assert (select count(*) from public.get_my_phrases()) = 8, 'NULL user phrases fine';
end $$;
reset role;

-- even a hand-inserted friendship can't carry ahoys to/from a NULL user
alter table public.friendships disable trigger friendships_guard_insert;
insert into public.friendships (requester_id, addressee_id, status)
values ('00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-00000000000e', 'accepted');
alter table public.friendships enable trigger friendships_guard_insert;
set local role service_role;
do $$
declare r record;
begin
  select * into r from public.record_ahoy('00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-00000000000e');
  assert r.ok = false and r.reason = 'no_username', 'FAIL: send from NULL user: ' || coalesce(r.reason, 'ok');
  select * into r from public.record_ahoy('00000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-00000000000f');
  assert r.ok = false and r.reason = 'no_username', 'FAIL: send to NULL user: ' || coalesce(r.reason, 'ok');
end $$;
reset role;
delete from public.friendships where requester_id = '00000000-0000-0000-0000-00000000000f';

-- ---------------------------------------------------------------------------
-- Private columns + push tokens
-- ---------------------------------------------------------------------------
update public.users set fcm_token = 'bob-fcm-secret' where username = 'bob';

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.register_push_token('ExponentPushToken[bob-phone]', 'ios', 'Bob iPhone');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ begin
  begin
    perform fcm_token from public.users;
    raise exception 'FAIL: fcm_token readable by other users';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.users;
    raise exception 'FAIL: select * on users allowed';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from public.users where username = 'bob') = 1, 'safe columns readable';
  assert (select count(*) from public.push_tokens) = 0, 'alice must not see bob''s push tokens';
  begin
    update public.users set username = 'hacked' where id = auth.uid();
    raise exception 'FAIL: username writable';
  exception when insufficient_privilege then null; end;
  begin
    update public.users set active_phrase_id = 3 where id = auth.uid();
    raise exception 'FAIL: active_phrase_id writable directly';
  exception when insufficient_privilege then null; end;
  update public.users set fcm_token = 'alice-fcm' where id = auth.uid();
  -- updating someone else's token silently affects 0 rows
  update public.users set fcm_token = 'pwned' where username = 'bob';
  assert (select has_fcm_token from public.get_my_profile()) = true, 'own fcm flag';
  assert (select active_phrase from public.get_my_profile()) = 'Ahoy!', 'default phrase';
end $$;
reset role;
do $$ begin
  assert (select fcm_token from public.users where username = 'bob') = 'bob-fcm-secret', 'bob token untouched';
end $$;

-- token moving to another account goes through register_push_token
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.register_push_token('ExponentPushToken[bob-phone]', 'ios', 'now alice');
do $$ begin
  assert (select count(*) from public.push_tokens) = 1, 'token re-assigned to alice';
end $$;
reset role;
update public.push_tokens set user_id = '00000000-0000-0000-0000-00000000000b';

-- logout: a device deletes its own token row (plain RLS delete, no RPC);
-- nobody can delete someone else's
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
delete from public.push_tokens where token = 'ExponentPushToken[bob-phone]';
reset role;
do $$ begin
  assert (select count(*) from public.push_tokens) = 1, 'FAIL: alice deleted bob''s push token';
end $$;
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
delete from public.push_tokens where token = 'ExponentPushToken[bob-phone]';
reset role;
do $$ begin
  assert (select count(*) from public.push_tokens) = 0, 'FAIL: bob could not delete own push token';
end $$;
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.register_push_token('ExponentPushToken[bob-phone]', 'ios', 'Bob iPhone');
reset role;

-- ---------------------------------------------------------------------------
-- Friendships
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ begin
  begin
    insert into public.friendships (requester_id, addressee_id, status)
    values (auth.uid(), pg_temp.uid('carol'), 'accepted');
    raise exception 'FAIL: inserted an accepted friendship';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.friendships (requester_id, addressee_id)
    values (pg_temp.uid('carol'), auth.uid());
    raise exception 'FAIL: inserted request on behalf of someone else';
  exception when insufficient_privilege then null; end;

  insert into public.friendships (requester_id, addressee_id) values (auth.uid(), pg_temp.uid('bob'));
  insert into public.friendships (requester_id, addressee_id) values (auth.uid(), pg_temp.uid('carol'));
  insert into public.friendships (requester_id, addressee_id) values (auth.uid(), pg_temp.uid('dave'));

  -- self-accept: RLS filters the row out, nothing changes
  update public.friendships set status = 'accepted' where addressee_id = pg_temp.uid('bob');
  assert (select status from public.friendships where addressee_id = pg_temp.uid('bob')) = 'pending',
    'FAIL: requester accepted own request';
end $$;

-- bob: reverse duplicate refused; accept works
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin
  begin
    insert into public.friendships (requester_id, addressee_id) values (auth.uid(), pg_temp.uid('alice'));
    raise exception 'FAIL: reverse duplicate friendship';
  exception when unique_violation then null; end;
  update public.friendships set status = 'accepted' where requester_id = pg_temp.uid('alice');
  assert (select status from public.friendships where requester_id = pg_temp.uid('alice')) = 'accepted', 'bob accepts';
  begin
    update public.friendships set status = 'pending' where requester_id = pg_temp.uid('alice');
    raise exception 'FAIL: accepted -> pending allowed';
  exception when insufficient_privilege then null; end;
end $$;

-- carol declines; alice cannot delete the declined row or re-send
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
update public.friendships set status = 'declined' where requester_id = pg_temp.uid('alice');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ begin
  delete from public.friendships where addressee_id = pg_temp.uid('carol');
  assert (select count(*) from public.friendships where addressee_id = pg_temp.uid('carol')) = 1,
    'FAIL: requester deleted a declined row';
  begin
    insert into public.friendships (requester_id, addressee_id) values (auth.uid(), pg_temp.uid('carol'));
    raise exception 'FAIL: re-sent a declined request';
  exception when unique_violation then null; end;
end $$;

-- dave accepts; then dave blocks alice -> friendship removed, request refused
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
update public.friendships set status = 'accepted' where requester_id = pg_temp.uid('alice');
insert into public.blocks (blocker_id, blocked_id) values (auth.uid(), pg_temp.uid('alice'));
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ begin
  assert (select count(*) from public.friendships where addressee_id = pg_temp.uid('dave')) = 0,
    'block should remove friendship';
  assert (select count(*) from public.blocks) = 0, 'alice must not see dave''s block';
  begin
    insert into public.friendships (requester_id, addressee_id) values (auth.uid(), pg_temp.uid('dave'));
    raise exception 'FAIL: request across a block';
  exception when insufficient_privilege then null; end;
  assert not exists (select 1 from public.search_users('dav')), 'blocked user hidden from search';
end $$;

-- ---------------------------------------------------------------------------
-- Ahoys: no client inserts; record_ahoy rules
-- ---------------------------------------------------------------------------
do $$ begin
  begin
    insert into public.ahoys (sender_id, receiver_id) values (auth.uid(), pg_temp.uid('bob'));
    raise exception 'FAIL: client inserted an ahoy';
  exception when insufficient_privilege then null; end;
  begin
    perform public.record_ahoy(auth.uid(), pg_temp.uid('bob'));
    raise exception 'FAIL: authenticated can call record_ahoy';
  exception when insufficient_privilege then null; end;
  begin
    perform public.set_active_phrase(2);
    raise exception 'FAIL: locked phrase settable';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from public.phrases where text = 'Yo!') = 0, 'secret phrase hidden';
  assert (select text from public.get_my_phrases() where id = 3) = '???', 'secret phrase masked';
end $$;
reset role;

set local role service_role;
do $$
declare r record;
begin
  select * into r from public.record_ahoy(pg_temp.uid('alice'), pg_temp.uid('carol'));
  assert r.ok = false and r.reason = 'not_friends', 'FAIL: non-friend (declined) send allowed: ' || coalesce(r.reason, 'ok');
  select * into r from public.record_ahoy(pg_temp.uid('alice'), pg_temp.uid('erin'));
  assert r.ok = false and r.reason = 'not_friends', 'FAIL: stranger send allowed';
  select * into r from public.record_ahoy(pg_temp.uid('alice'), pg_temp.uid('dave'));
  assert r.ok = false and r.reason = 'blocked', 'FAIL: send across block: ' || coalesce(r.reason, 'ok');
  select * into r from public.record_ahoy(pg_temp.uid('alice'), pg_temp.uid('alice'));
  assert r.ok = false, 'FAIL: self send';
  select * into r from public.record_ahoy(pg_temp.uid('alice'), pg_temp.uid('bob'));
  assert r.ok and r.phrase = 'Ahoy!' and r.sender_username = 'alice', 'FAIL: friend send';
end $$;
reset role;

-- Seed 1500 older ahoys alice -> bob (outside the rate-limit window), plus
-- 1100 bob -> alice, to exceed PostgREST's 1000-row cap.
insert into public.ahoys (sender_id, receiver_id, phrase, created_at)
select pg_temp.uid('alice'), pg_temp.uid('bob'), 'Ahoy!', now() - interval '1 hour'
from generate_series(1, 1500);
insert into public.ahoys (sender_id, receiver_id, phrase, created_at)
select pg_temp.uid('bob'), pg_temp.uid('alice'), 'Ahoy!', now() - interval '1 hour'
from generate_series(1, 1100);

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$
declare s jsonb;
begin
  s := public.get_my_stats();
  assert (s ->> 'total_sent')::int = 1501, 'FAIL: total_sent ' || (s ->> 'total_sent');
  assert (s -> 'per_friend' ->> pg_temp.uid('bob')::text)::int = 1501, 'FAIL: per_friend bob';
  assert (select total_sent from public.get_friend_badges() where username = 'bob') = 1100,
    'FAIL: bob badge count';
  assert (select count(*) from public.get_friend_badges()) = 1, 'only accepted friends';
  assert (select total_sent from public.search_users('car')) = 0, 'carol total';
  perform public.set_active_phrase(2);
  perform public.set_active_phrase(3); -- Yo! at 1000
  assert (select count(*) from public.phrases where text = 'Yo!') = 1, 'Yo! visible once unlocked';
  begin
    perform public.set_active_phrase(4); -- 2000
    raise exception 'FAIL: 2000 phrase settable at 1501';
  exception when insufficient_privilege then null; end;
  assert (select active_phrase from public.get_my_profile()) = 'Yo!', 'active phrase Yo!';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin
  assert (select total_sent from public.get_friend_badges() where username = 'alice') = 1501,
    'FAIL: alice badge seen by bob';
  assert (select count(*) from public.phrases where text = 'Yo!') = 1, 'bob (1100) sees Yo!';
end $$;
reset role;

set local role service_role;
do $$
declare r record; i int;
begin
  select * into r from public.record_ahoy(pg_temp.uid('alice'), pg_temp.uid('bob'));
  assert r.ok and r.phrase = 'Yo!', 'FAIL: phrase from server: ' || coalesce(r.phrase, r.reason);

  -- threshold raised after the fact -> falls back to Ahoy! and resets
  update public.phrases set unlock_at = 999999 where id = 3;
  select * into r from public.record_ahoy(pg_temp.uid('alice'), pg_temp.uid('bob'));
  assert r.ok and r.phrase = 'Ahoy!', 'FAIL: locked phrase not re-verified';
  assert (select active_phrase_id from public.users where username = 'alice') = 1, 'reset to Ahoy!';
  update public.phrases set unlock_at = 1000 where id = 3;

  -- rate limit: 3 recent sends so far; 27 more allowed, the 31st refused
  for i in 1..27 loop
    select * into r from public.record_ahoy(pg_temp.uid('alice'), pg_temp.uid('bob'));
    assert r.ok, 'FAIL: send ' || i || ' refused: ' || coalesce(r.reason, '');
  end loop;
  select * into r from public.record_ahoy(pg_temp.uid('alice'), pg_temp.uid('bob'));
  assert r.ok = false and r.reason = 'rate_limited', 'FAIL: rate limit not enforced';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Friend-request push claims (notify-friendship Edge Function)
-- ---------------------------------------------------------------------------
create function pg_temp.fid(p_req text, p_addr text) returns uuid language sql as $$
  select id from public.friendships
  where requester_id = pg_temp.uid(p_req) and addressee_id = pg_temp.uid(p_addr);
$$;

-- erin asks alice; carol asks erin
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
insert into public.friendships (requester_id, addressee_id) values (auth.uid(), pg_temp.uid('alice'));
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into public.friendships (requester_id, addressee_id) values (auth.uid(), pg_temp.uid('erin'));
do $$ begin
  begin
    perform public.claim_friendship_notification(auth.uid(), pg_temp.fid('carol', 'erin'));
    raise exception 'FAIL: authenticated can call claim_friendship_notification';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.friendship_notifications;
    raise exception 'FAIL: friendship_notifications readable by clients';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role service_role;
do $$
declare r record;
begin
  -- request: only the requester, only while pending, only once
  select * into r from public.claim_friendship_notification(pg_temp.uid('alice'), pg_temp.fid('erin', 'alice'));
  assert r.ok = false and r.reason = 'not_notifiable', 'FAIL: addressee triggered request push: ' || coalesce(r.reason, 'ok');
  select * into r from public.claim_friendship_notification(pg_temp.uid('bob'), pg_temp.fid('erin', 'alice'));
  assert r.ok = false and r.reason = 'not_found', 'FAIL: outsider triggered push: ' || coalesce(r.reason, 'ok');
  select * into r from public.claim_friendship_notification(pg_temp.uid('erin'), gen_random_uuid());
  assert r.ok = false and r.reason = 'not_found', 'FAIL: unknown friendship';
  select * into r from public.claim_friendship_notification(pg_temp.uid('erin'), pg_temp.fid('erin', 'alice'));
  assert r.ok and r.kind = 'request' and r.recipient_id = pg_temp.uid('alice') and r.actor_username = 'erin',
    'FAIL: request push: ' || coalesce(r.reason, 'ok');
  select * into r from public.claim_friendship_notification(pg_temp.uid('erin'), pg_temp.fid('erin', 'alice'));
  assert r.ok = false and r.reason = 'already_notified', 'FAIL: request push repeated';

  -- declined rows never notify
  select * into r from public.claim_friendship_notification(pg_temp.uid('alice'), pg_temp.fid('alice', 'carol'));
  assert r.ok = false and r.reason = 'not_notifiable', 'FAIL: declined row notified';

  -- cancel + re-send creates a new row but stays inside the 24h pair cooldown
  select * into r from public.claim_friendship_notification(pg_temp.uid('carol'), pg_temp.fid('carol', 'erin'));
  assert r.ok and r.recipient_id = pg_temp.uid('erin'), 'FAIL: carol request push';
end $$;
reset role;

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
delete from public.friendships where requester_id = auth.uid() and addressee_id = pg_temp.uid('erin');
insert into public.friendships (requester_id, addressee_id) values (auth.uid(), pg_temp.uid('erin'));
-- alice accepts erin
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
update public.friendships set status = 'accepted' where requester_id = pg_temp.uid('erin');
reset role;

set local role service_role;
do $$
declare r record;
begin
  select * into r from public.claim_friendship_notification(pg_temp.uid('carol'), pg_temp.fid('carol', 'erin'));
  assert r.ok = false and r.reason = 'already_notified', 'FAIL: re-sent request re-notified: ' || coalesce(r.reason, 'ok');

  -- accepted: only the addressee (the one who accepted), once
  select * into r from public.claim_friendship_notification(pg_temp.uid('erin'), pg_temp.fid('erin', 'alice'));
  assert r.ok = false and r.reason = 'not_notifiable', 'FAIL: requester triggered accepted push';
  select * into r from public.claim_friendship_notification(pg_temp.uid('alice'), pg_temp.fid('erin', 'alice'));
  assert r.ok and r.kind = 'accepted' and r.recipient_id = pg_temp.uid('erin') and r.actor_username = 'alice',
    'FAIL: accepted push: ' || coalesce(r.reason, 'ok');
  select * into r from public.claim_friendship_notification(pg_temp.uid('alice'), pg_temp.fid('erin', 'alice'));
  assert r.ok = false and r.reason = 'already_notified', 'FAIL: accepted push repeated';
end $$;
reset role;

-- hourly cap: erin has 1 request push this hour; fake 19 more, the 21st is refused
insert into public.friendship_notifications (friendship_id, kind, actor_id, recipient_id, pair_low, pair_high)
select gen_random_uuid(), 'request', pg_temp.uid('erin'), pg_temp.uid('alice'), gen_random_uuid(), gen_random_uuid()
from generate_series(1, 19);
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
insert into public.friendships (requester_id, addressee_id) values (auth.uid(), pg_temp.uid('bob'));
reset role;
set local role service_role;
do $$
declare r record;
begin
  select * into r from public.claim_friendship_notification(pg_temp.uid('erin'), pg_temp.fid('erin', 'bob'));
  assert r.ok = false and r.reason = 'rate_limited', 'FAIL: hourly request cap: ' || coalesce(r.reason, 'ok');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Invite-link lookups (get_user_card)
-- ---------------------------------------------------------------------------
set local role anon;
do $$ begin
  begin
    perform public.get_user_card('alice');
    raise exception 'FAIL: anon can call get_user_card';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ begin
  assert (select relation from public.get_user_card('Bob')) = 'crew', 'FAIL: card crew';
  assert (select friendship_id from public.get_user_card('bob')) is not null, 'FAIL: crew friendship id';
  assert (select relation from public.get_user_card('carol')) = 'requested', 'FAIL: decline must look like requested';
  assert (select relation from public.get_user_card('alice')) = 'self', 'FAIL: card self';
  assert (select relation from public.get_user_card('gus')) = 'none', 'FAIL: card none';
  assert (select total_sent from public.get_user_card('bob')) = 1100, 'FAIL: card total';
  assert not exists (select 1 from public.get_user_card('dave')), 'FAIL: blocked-by-them must look like not found';
  assert not exists (select 1 from public.get_user_card('nobody_here')), 'FAIL: unknown user';
  assert not exists (select 1 from public.get_user_card('x;drop')), 'FAIL: invalid name';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
do $$ begin
  assert (select relation from public.get_user_card('alice')) = 'incoming', 'FAIL: declined-by-me shows incoming';
  assert (select relation from public.get_user_card('erin')) = 'requested', 'FAIL: pending outgoing';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
do $$ begin
  assert (select relation from public.get_user_card('alice')) = 'blocked', 'FAIL: blocked-by-me';
  assert (select friendship_id from public.get_user_card('alice')) is null, 'no friendship id when blocked';
end $$;
-- unblock: own rows only, friendship does not come back
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
delete from public.blocks where blocked_id = pg_temp.uid('alice');
reset role;
do $$ begin
  assert (select count(*) from public.blocks) = 1, 'FAIL: alice removed dave''s block';
end $$;
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
do $$ begin
  assert (select count(*) from public.blocks) = 1, 'dave sees own block';
  delete from public.blocks where blocked_id = pg_temp.uid('alice');
  assert (select count(*) from public.blocks) = 0, 'FAIL: dave could not unblock';
  assert (select relation from public.get_user_card('alice')) = 'none', 'FAIL: unblock should not restore friendship';
end $$;
-- re-block so the rest of the file sees the same state
insert into public.blocks (blocker_id, blocked_id) values (auth.uid(), pg_temp.uid('alice'));
reset role;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
do $$ begin
  insert into public.reports (reported_id, note) values (pg_temp.uid('carol'), '  spamming requests  ');
  begin
    perform 1 from public.reports;
    raise exception 'FAIL: reports readable by clients';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.reports (reporter_id, reported_id) values (pg_temp.uid('alice'), pg_temp.uid('carol'));
    raise exception 'FAIL: report filed as someone else';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.reports (reported_id, notified_at) values (pg_temp.uid('carol'), now());
    raise exception 'FAIL: notified_at client-writable';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.reports (reported_id) values (auth.uid());
    raise exception 'FAIL: self report';
  exception when check_violation then null; end;
  begin
    insert into public.reports (reported_id, note) values (pg_temp.uid('carol'), repeat('x', 501));
    raise exception 'FAIL: 501-char note accepted';
  exception when check_violation then null; end;
  begin
    insert into public.reports (reported_id) values (null);
    raise exception 'FAIL: report without a target';
  exception when insufficient_privilege then null; end;
  begin
    update public.reports set note = 'edited';
    raise exception 'FAIL: reports updatable';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.reports;
    raise exception 'FAIL: reports deletable';
  exception when insufficient_privilege then null; end;
  begin
    perform public.claim_report_notification(auth.uid(), gen_random_uuid());
    raise exception 'FAIL: authenticated can call claim_report_notification';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert (select note from public.reports where reporter_id = pg_temp.uid('erin')) = 'spamming requests', 'note trimmed';
  assert (select notified_at from public.reports where reporter_id = pg_temp.uid('erin')) is null, 'not yet notified';
end $$;

set local role service_role;
do $$
declare r record; v_id uuid;
begin
  select id into v_id from public.reports where reporter_id = pg_temp.uid('erin');
  select * into r from public.claim_report_notification(pg_temp.uid('alice'), v_id);
  assert r.report_id is null, 'FAIL: non-reporter claimed a report';
  select * into r from public.claim_report_notification(pg_temp.uid('erin'), v_id);
  assert r.report_id = v_id and r.reporter_username = 'erin' and r.reported_username = 'carol'
         and r.note = 'spamming requests', 'FAIL: report claim';
  select * into r from public.claim_report_notification(pg_temp.uid('erin'), v_id);
  assert r.report_id is null, 'FAIL: report notified twice';
end $$;
reset role;

-- 10 per reporter per 24 h (erin has 1)
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
do $$
declare i int;
begin
  for i in 1..9 loop
    insert into public.reports (reported_id) values (pg_temp.uid('carol'));
  end loop;
  begin
    insert into public.reports (reported_id) values (pg_temp.uid('carol'));
    raise exception 'FAIL: 11th report in a day accepted';
  exception when raise_exception then
    assert sqlerrm = 'rate_limited', 'wrong error: ' || sqlerrm;
  end;
end $$;
-- another reporter is unaffected
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into public.reports (reported_id, note) values (pg_temp.uid('erin'), null);
reset role;
-- older reports fall out of the window
update public.reports set created_at = now() - interval '25 hours' where reporter_id = pg_temp.uid('erin');
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
insert into public.reports (reported_id) values (pg_temp.uid('carol'));
reset role;

-- ---------------------------------------------------------------------------
-- Feedback: insert-own, user_id defaults to the caller
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
do $$ begin
  insert into public.feedback (version, message) values ('1.0.0 (1) ios', 'Love it');
  begin
    insert into public.feedback (user_id, version, message) values (pg_temp.uid('alice'), '1', 'spoofed');
    raise exception 'FAIL: feedback as someone else';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.feedback (version, message) values ('1', repeat('x', 2001));
    raise exception 'FAIL: oversized feedback';
  exception when check_violation then null; end;
end $$;
reset role;
do $$ begin
  assert (select user_id from public.feedback where message = 'Love it') = pg_temp.uid('erin'), 'FAIL: feedback user_id default';
end $$;

-- ---------------------------------------------------------------------------
-- Account deletion cascade
-- ---------------------------------------------------------------------------
delete from auth.users where id = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  assert pg_temp.uid('bob') is null, 'bob profile removed';
  assert (select count(*) from public.push_tokens) = 0, 'bob push tokens removed';
  assert (select count(*) from public.friendships where requester_id = pg_temp.uid('alice')
          and status = 'accepted') = 0, 'friendship removed';
  assert (select count(*) from public.ahoys where sender_id = pg_temp.uid('alice')) = 1530,
    'alice sent count survives bob deleting account';
  assert (select count(*) from public.ahoys where sender_id = '00000000-0000-0000-0000-00000000000b') = 0,
    'bob sent ahoys removed';
end $$;

-- reporter deletes account -> their reports go; reported deletes -> report kept, target nulled
delete from auth.users where id = '00000000-0000-0000-0000-00000000000e';
do $$ begin
  assert (select count(*) from public.reports) = 1, 'FAIL: reporter''s reports should be deleted with them';
  assert (select reported_id from public.reports) is null, 'FAIL: report about a deleted user should be kept';
  assert (select count(*) from public.feedback) = 0, 'feedback removed with account';
end $$;
delete from auth.users where id = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  assert (select count(*) from public.reports) = 0, 'carol''s report removed';
end $$;

\echo 'ALL RLS CHECKS PASSED'
rollback;

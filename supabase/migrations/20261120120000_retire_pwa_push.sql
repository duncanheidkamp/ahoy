-- Phase 6b: the PWA is retired, so web push (Firebase Cloud Messaging for the
-- browser) goes away.
--
--   * users.fcm_token: the PWA's legacy web-push registration. Dropped. No
--     data is carried over or needed: the native apps register their own
--     Expo tokens in push_tokens, and a browser token can't be turned into one.
--   * push_tokens 'web' rows: the same kind of browser token. Deleted, and the
--     platform check now allows only 'ios' / 'android'.
--   * get_my_profile() loses has_fcm_token (nothing in the native app reads it).
--
-- Deploy order (PR "phase-6-retire-pwa"): Edge Functions without FCM first,
-- then the static landing page, then this migration. Older send-ahoy code
-- also tolerates the missing column (its fcm_token read just returns an error
-- that it ignores), so a wrong order degrades to "no web push", never to
-- failed sends.

-- Own profile, without the web-push flag. The return type changes, so the
-- function is dropped and recreated (grants recreated below).
drop function if exists public.get_my_profile();
create function public.get_my_profile()
returns table (
  id uuid,
  username text,
  created_at timestamptz,
  active_phrase_id integer,
  active_phrase text
)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.username, u.created_at, u.active_phrase_id, p.text
  from public.users u
  join public.phrases p on p.id = u.active_phrase_id
  where u.id = auth.uid();
$$;

revoke all on function public.get_my_profile() from public, anon;
grant execute on function public.get_my_profile() to authenticated;

-- The only column clients could update was fcm_token; with it gone there is
-- nothing client-writable on users (username via claim_username(), phrase via
-- set_active_phrase()), so the update policy goes too.
revoke update on table public.users from authenticated;
drop policy if exists "Users can update own profile" on public.users;
alter table public.users drop column if exists fcm_token;

-- Browser tokens: nothing can deliver to them any more.
delete from public.push_tokens where platform = 'web';
alter table public.push_tokens drop constraint if exists push_tokens_platform_check;
alter table public.push_tokens
  add constraint push_tokens_platform_check check (platform in ('ios', 'android'));

-- =============================================================================
-- Hide private user columns; add per-device push tokens.
--
-- Before: "Users can view all usernames" was `using (true)` for every role and
-- clients did select('*'), so anyone with the anon key could read every
-- user's fcm_token.
-- After: column-level privileges. Signed-in users can read only
-- (id, username, created_at) of other users. anon cannot read the table at all.
-- `select('*')` on users now fails with "permission denied" — callers must
-- name columns. A user's own private fields come from get_my_profile().
-- =============================================================================

drop policy if exists "Users can view all usernames" on public.users;
create policy "Signed-in users can view profiles" on public.users
  for select to authenticated using (true);

drop policy if exists "Users can update own profile" on public.users;
create policy "Users can update own profile" on public.users
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

revoke all on table public.users from anon, authenticated;
grant select (id, username, created_at) on table public.users to authenticated;
-- The PWA still writes its own legacy FCM web token directly. Username and
-- active phrase are not client-writable (the latter goes through
-- set_active_phrase()).
grant update (fcm_token) on table public.users to authenticated;

-- -----------------------------------------------------------------------------
-- push_tokens: one row per device. Native apps register Expo push tokens here.
-- -----------------------------------------------------------------------------
create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('ios', 'android', 'web')),
  device_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_tokens_user_id_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

create policy "Users can view own push tokens" on public.push_tokens
  for select to authenticated using (auth.uid() = user_id);
create policy "Users can add own push tokens" on public.push_tokens
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update own push tokens" on public.push_tokens
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own push tokens" on public.push_tokens
  for delete to authenticated using (auth.uid() = user_id);

revoke all on table public.push_tokens from anon;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger push_tokens_touch_updated_at
  before update on public.push_tokens
  for each row execute function public.touch_updated_at();

-- A device token can move between accounts (sign out, sign in as someone
-- else). Owner-only RLS would make a plain upsert fail in that case, so token
-- registration goes through this function, which re-assigns the token to the
-- caller.
create or replace function public.register_push_token(
  p_token text,
  p_platform text,
  p_device_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_token is null or length(p_token) = 0 or length(p_token) > 4096 then
    raise exception 'invalid_token' using errcode = '22023';
  end if;

  insert into public.push_tokens (user_id, token, platform, device_name)
  values (v_uid, p_token, p_platform, p_device_name)
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        device_name = excluded.device_name,
        updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.register_push_token(text, text, text) from public, anon;
grant execute on function public.register_push_token(text, text, text) to authenticated;

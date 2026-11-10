-- =============================================================================
-- Profiles are created by the database, not by the client.
--
-- Before: the signup page called /api/users/create-profile, which used the
-- service role with no auth check and trusted a posted userId.
-- After: a trigger on auth.users creates the public.users row from
-- raw_user_meta_data->>'username' (passed via supabase.auth.signUp options.data).
-- An invalid or taken username raises, which aborts the auth.users insert, so
-- the signup itself fails and no orphaned auth user is left behind.
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := lower(btrim(coalesce(new.raw_user_meta_data ->> 'username', '')));
begin
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Clients can no longer insert profile rows themselves.
drop policy if exists "Users can insert own profile" on public.users;

-- Signup needs to check availability before an account exists (anon role),
-- without being able to read the users table.
create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.users where username = lower(btrim(p_username))
  );
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

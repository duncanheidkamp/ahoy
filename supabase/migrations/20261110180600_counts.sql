-- =============================================================================
-- Count RPCs.
--
-- Before: badge counts were computed client-side by fetching ahoys rows. RLS
-- hides ahoys the caller isn't part of, so friends' totals were wrong, and
-- PostgREST caps responses at 1000 rows.
-- After: SQL count(*) in security definer functions scoped to the caller.
-- =============================================================================

-- { "total_sent": n, "per_friend": { "<friend uuid>": n, ... } }
-- per_friend covers current accepted friends only (0 if never sent).
create or replace function public.get_my_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'total_sent', (select count(*) from public.ahoys a where a.sender_id = v_uid),
    'per_friend', coalesce((
      select jsonb_object_agg(fr.friend_id, coalesce(c.n, 0))
      from (
        select case when f.requester_id = v_uid then f.addressee_id else f.requester_id end as friend_id
        from public.friendships f
        where f.status = 'accepted' and v_uid in (f.requester_id, f.addressee_id)
      ) fr
      left join (
        select a.receiver_id, count(*) as n
        from public.ahoys a
        where a.sender_id = v_uid
        group by a.receiver_id
      ) c on c.receiver_id = fr.friend_id
    ), '{}'::jsonb)
  );
end;
$$;

revoke all on function public.get_my_stats() from public, anon;
grant execute on function public.get_my_stats() to authenticated;

-- One row per accepted friend with that friend's lifetime total sent (badge).
create or replace function public.get_friend_badges()
returns table (friend_id uuid, username text, total_sent bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  return query
    select u.id, u.username, (select count(*) from public.ahoys a where a.sender_id = u.id)
    from public.friendships f
    join public.users u
      on u.id = case when f.requester_id = v_uid then f.addressee_id else f.requester_id end
    where f.status = 'accepted' and v_uid in (f.requester_id, f.addressee_id)
    order by u.username;
end;
$$;

revoke all on function public.get_friend_badges() from public, anon;
grant execute on function public.get_friend_badges() to authenticated;

-- Username search with public badge totals. Excludes the caller and anyone
-- with a block in either direction.
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
    where u.username like '%' || v_q || '%'
      and u.id <> v_uid
      and not public.is_blocked_between(v_uid, u.id)
    order by (u.username = lower(btrim(p_query))) desc, u.username
    limit 20;
end;
$$;

revoke all on function public.search_users(text) from public, anon;
grant execute on function public.search_users(text) to authenticated;

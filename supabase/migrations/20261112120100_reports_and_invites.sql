-- =============================================================================
-- Phase 4 social: reports, invite-link lookups, feedback hardening.
--
-- reports
--   * insert-own only (reporter_id defaults to and must equal auth.uid()),
--     no client select/update/delete; only (id, reported_id, note) are
--     client-insertable, so notified_at can't be forged.
--   * note <= 500 chars; can't report yourself; 10 reports per reporter per
--     rolling 24 h (trigger, serialised per reporter).
--   * The notify-report Edge Function claims a report once
--     (claim_report_notification) and emails Duncan if Resend is configured.
--   * Deleting the reporter's account deletes their reports; deleting the
--     reported account keeps the report with reported_id = null.
--
-- get_user_card(username)
--   * What the add/<username> invite screen needs, in one call: the user, their
--     badge total and how they relate to the caller. A block BY THEM looks
--     exactly like "not found"; a decline of the caller's request looks like
--     "requested" (never reveal either).
--
-- feedback
--   * user_id defaults to auth.uid() (the RLS check already forces it to be
--     the caller); message length capped for new rows.
-- =============================================================================

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.users(id) on delete cascade,
  reported_id uuid references public.users(id) on delete set null,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  constraint reports_not_self check (reporter_id <> reported_id)
);

create index reports_reporter_created_idx on public.reports (reporter_id, created_at desc);
create index reports_reported_idx on public.reports (reported_id);

alter table public.reports enable row level security;

create policy "Users can file reports" on public.reports
  for insert to authenticated
  with check (reporter_id = auth.uid() and reported_id is not null);

revoke all on table public.reports from anon, authenticated;
grant insert (id, reported_id, note) on table public.reports to authenticated;

create or replace function public.guard_report_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('report:' || new.reporter_id::text, 0));
  if (
    select count(*) from public.reports r
    where r.reporter_id = new.reporter_id and r.created_at > now() - interval '24 hours'
  ) >= 10 then
    raise exception 'rate_limited' using errcode = 'P0001',
      hint = 'At most 10 reports per day.';
  end if;
  new.note := nullif(btrim(coalesce(new.note, '')), '');
  new.created_at := now();
  new.notified_at := null;
  return new;
end;
$$;

revoke all on function public.guard_report_insert() from public, anon, authenticated;

create trigger reports_guard_insert
  before insert on public.reports
  for each row execute function public.guard_report_insert();

-- notify-report Edge Function (service role): mark a report as notified once,
-- only for its own reporter, and return what the email needs.
create or replace function public.claim_report_notification(p_caller uuid, p_report_id uuid)
returns table (
  report_id uuid,
  reporter_username text,
  reported_id uuid,
  reported_username text,
  note text,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  return query
    with claimed as (
      update public.reports r
         set notified_at = now()
       where r.id = p_report_id
         and r.reporter_id = p_caller
         and r.notified_at is null
      returning r.id, r.reporter_id, r.reported_id, r.note, r.created_at
    )
    select c.id, ru.username, c.reported_id, du.username, c.note, c.created_at
    from claimed c
    left join public.users ru on ru.id = c.reporter_id
    left join public.users du on du.id = c.reported_id;
end;
$$;

revoke all on function public.claim_report_notification(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_report_notification(uuid, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- Invite links: look up one user by exact username.
-- relation: 'self' | 'crew' | 'requested' (I asked; pending OR declined) |
--           'incoming' (they asked; pending, or declined by me — I can still
--           accept) | 'blocked' (I blocked them) | 'none'
-- No row: no such user, no username yet, or they blocked me.
-- -----------------------------------------------------------------------------
create or replace function public.get_user_card(p_username text)
returns table (id uuid, username text, total_sent bigint, relation text, friendship_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := lower(btrim(coalesce(p_username, '')));
  v_user record;
  v_f record;
  v_relation text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if v_name !~ '^[a-z0-9_]{3,20}$' then
    return;
  end if;

  select u.id, u.username into v_user from public.users u where u.username = v_name;
  if not found then
    return;
  end if;

  if v_user.id = v_uid then
    v_relation := 'self';
  elsif exists (select 1 from public.blocks b where b.blocker_id = v_user.id and b.blocked_id = v_uid) then
    return; -- they blocked me: indistinguishable from "not found"
  elsif exists (select 1 from public.blocks b where b.blocker_id = v_uid and b.blocked_id = v_user.id) then
    v_relation := 'blocked';
  else
    select f.id, f.status::text as status, f.requester_id into v_f
    from public.friendships f
    where least(f.requester_id, f.addressee_id) = least(v_uid, v_user.id)
      and greatest(f.requester_id, f.addressee_id) = greatest(v_uid, v_user.id);
    if not found then
      v_relation := 'none';
    elsif v_f.status = 'accepted' then
      v_relation := 'crew';
    elsif v_f.requester_id = v_uid then
      v_relation := 'requested';
    else
      v_relation := 'incoming';
    end if;
  end if;

  return query
    select v_user.id, v_user.username,
           (select count(*) from public.ahoys a where a.sender_id = v_user.id),
           v_relation,
           case when v_relation in ('crew', 'requested', 'incoming') then v_f.id else null end;
end;
$$;

revoke all on function public.get_user_card(text) from public, anon;
grant execute on function public.get_user_card(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Feedback
-- -----------------------------------------------------------------------------
alter table public.feedback alter column user_id set default auth.uid();
alter table public.feedback
  add constraint feedback_message_length check (char_length(message) between 1 and 2000) not valid;
alter table public.feedback
  add constraint feedback_version_length check (char_length(version) <= 100) not valid;

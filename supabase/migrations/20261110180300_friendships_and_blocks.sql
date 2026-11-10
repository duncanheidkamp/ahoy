-- =============================================================================
-- Friendship integrity + blocking.
--
-- Before: anyone could insert a friendship already 'accepted', either party
-- (including the requester) could set any status, and A->B / B->A could both
-- exist.
-- After:
--   * insert: only as the requester, only with status 'pending'
--   * update: only the addressee, only pending->accepted, pending->declined,
--             or declined->accepted (addressee changes their mind)
--   * delete: either party — except the requester cannot delete a declined
--             row. A declined row is kept so the same requester cannot
--             re-send; the addressee can still delete it or accept it later.
--   * one row per unordered pair
--   * blocks: a block in either direction refuses new requests and removes
--             any existing friendship
-- =============================================================================

-- 1. Collapse duplicate pairs (A->B and B->A) before adding the pair index.
--    Keep accepted over pending over declined, then the oldest.
with ranked as (
  select id,
         row_number() over (
           partition by least(requester_id, addressee_id), greatest(requester_id, addressee_id)
           order by case status when 'accepted' then 0 when 'pending' then 1 else 2 end,
                    created_at asc
         ) as rn
  from public.friendships
)
delete from public.friendships f
using ranked r
where f.id = r.id and r.rn > 1;

create unique index friendships_pair_unique_idx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

-- 2. Blocks
create table public.blocks (
  blocker_id uuid not null references public.users(id) on delete cascade,
  blocked_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

create index blocks_blocked_id_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;

create policy "Users can view own blocks" on public.blocks
  for select to authenticated using (auth.uid() = blocker_id);
create policy "Users can block" on public.blocks
  for insert to authenticated with check (auth.uid() = blocker_id);
create policy "Users can unblock" on public.blocks
  for delete to authenticated using (auth.uid() = blocker_id);

revoke all on table public.blocks from anon;
revoke update on table public.blocks from authenticated;

-- Internal helper: is there a block in either direction?
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

revoke all on function public.is_blocked_between(uuid, uuid) from public, anon, authenticated;

-- Blocking someone ends any friendship / pending request with them.
create or replace function public.on_block_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.friendships
  where (requester_id = new.blocker_id and addressee_id = new.blocked_id)
     or (requester_id = new.blocked_id and addressee_id = new.blocker_id);
  return new;
end;
$$;

revoke all on function public.on_block_created() from public, anon, authenticated;

create trigger blocks_remove_friendship
  after insert on public.blocks
  for each row execute function public.on_block_created();

-- 3. Friendship policies
drop policy if exists "Users can create friend requests" on public.friendships;
drop policy if exists "Users can update friendships they're part of" on public.friendships;
drop policy if exists "Users can delete friendships they're part of" on public.friendships;

create policy "Requester can send a pending request" on public.friendships
  for insert to authenticated
  with check (auth.uid() = requester_id and status = 'pending');

create policy "Addressee can respond to a request" on public.friendships
  for update to authenticated
  using (auth.uid() = addressee_id)
  with check (auth.uid() = addressee_id and status in ('accepted', 'declined'));

create policy "Either party can remove a friendship" on public.friendships
  for delete to authenticated
  using (
    auth.uid() = addressee_id
    or (auth.uid() = requester_id and status <> 'declined')
  );

revoke all on table public.friendships from anon;

-- 4. Triggers that hold regardless of role (service role included)
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
  return new;
end;
$$;

revoke all on function public.guard_friendship_insert() from public, anon, authenticated;

create trigger friendships_guard_insert
  before insert on public.friendships
  for each row execute function public.guard_friendship_insert();

create or replace function public.guard_friendship_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.requester_id is distinct from old.requester_id
     or new.addressee_id is distinct from old.addressee_id
     or new.created_at is distinct from old.created_at
     or new.id is distinct from old.id then
    raise exception 'friendship_immutable_fields' using errcode = '42501';
  end if;

  if new.status = old.status then
    return new; -- no-op
  end if;

  if not (
    (old.status = 'pending'  and new.status in ('accepted', 'declined'))
    or (old.status = 'declined' and new.status = 'accepted')
  ) then
    raise exception 'invalid_friendship_transition: % -> %', old.status, new.status
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger friendships_guard_update
  before update on public.friendships
  for each row execute function public.guard_friendship_update();

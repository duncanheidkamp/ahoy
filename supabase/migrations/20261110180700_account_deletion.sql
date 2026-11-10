-- =============================================================================
-- Account deletion cascades.
--
-- delete-account (Edge Function) deletes the auth.users row. That cascades to
-- public.users and from there to friendships, blocks, push_tokens, feedback
-- and the deleted user's SENT ahoys.
--
-- Ahoys the deleted user RECEIVED are kept with receiver_id = null, so other
-- people's lifetime sent counts (badges, phrase unlocks) don't drop when a
-- friend deletes their account.
-- =============================================================================

alter table public.ahoys alter column receiver_id drop not null;
alter table public.ahoys drop constraint if exists ahoys_receiver_id_fkey;
alter table public.ahoys
  add constraint ahoys_receiver_id_fkey
  foreign key (receiver_id) references public.users(id) on delete set null;

-- Ahoy Database Schema for Supabase
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Create custom types
create type friendship_status as enum ('pending', 'accepted', 'declined');

-- Users table (extends Supabase auth.users)
create table public.users (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  fcm_token text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,

  constraint username_lowercase check (username = lower(username)),
  constraint username_format check (username ~ '^[a-z0-9_]+$'),
  constraint username_length check (char_length(username) >= 3 and char_length(username) <= 20)
);

-- Friendships table
create table public.friendships (
  id uuid default uuid_generate_v4() primary key,
  requester_id uuid references public.users(id) on delete cascade not null,
  addressee_id uuid references public.users(id) on delete cascade not null,
  status friendship_status default 'pending' not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,

  constraint different_users check (requester_id != addressee_id),
  constraint unique_friendship unique (requester_id, addressee_id)
);

-- Ahoys table (for tracking send counts)
create table public.ahoys (
  id uuid default uuid_generate_v4() primary key,
  sender_id uuid references public.users(id) on delete cascade not null,
  receiver_id uuid references public.users(id) on delete cascade not null,
  phrase text default 'Ahoy!' not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Indexes for performance
create index friendships_requester_idx on public.friendships(requester_id);
create index friendships_addressee_idx on public.friendships(addressee_id);
create index friendships_status_idx on public.friendships(status);
create index ahoys_sender_idx on public.ahoys(sender_id);
create index ahoys_receiver_idx on public.ahoys(receiver_id);
create index users_username_idx on public.users(username);

-- Row Level Security (RLS)
alter table public.users enable row level security;
alter table public.friendships enable row level security;
alter table public.ahoys enable row level security;

-- Users policies
create policy "Users can view all usernames" on public.users
  for select using (true);

create policy "Users can update own profile" on public.users
  for update using (auth.uid() = id);

create policy "Users can insert own profile" on public.users
  for insert with check (auth.uid() = id);

-- Friendships policies
create policy "Users can view own friendships" on public.friendships
  for select using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "Users can create friend requests" on public.friendships
  for insert with check (auth.uid() = requester_id);

create policy "Users can update friendships they're part of" on public.friendships
  for update using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "Users can delete friendships they're part of" on public.friendships
  for delete using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Ahoys policies
create policy "Users can view ahoys they sent or received" on public.ahoys
  for select using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "Users can send ahoys" on public.ahoys
  for insert with check (auth.uid() = sender_id);

-- Function to handle new user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  -- User profile is created separately during signup flow
  return new;
end;
$$ language plpgsql security definer;

-- Function to check if two users are friends
create or replace function public.are_friends(user1_id uuid, user2_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.friendships
    where status = 'accepted'
    and (
      (requester_id = user1_id and addressee_id = user2_id)
      or (requester_id = user2_id and addressee_id = user1_id)
    )
  );
end;
$$ language plpgsql security definer;

-- Function to get user's total ahoy count (for future unlockables)
create or replace function public.get_ahoy_count(user_id uuid)
returns bigint as $$
begin
  return (select count(*) from public.ahoys where sender_id = user_id);
end;
$$ language plpgsql security definer;

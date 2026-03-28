-- Run this in Supabase → SQL Editor

create table public.follows (
  follower_id  uuid references auth.users on delete cascade,
  following_id uuid references auth.users on delete cascade,
  created_at   timestamptz default now(),
  primary key (follower_id, following_id)
);

alter table public.follows enable row level security;

create policy "Follows are viewable by everyone"
  on public.follows for select using (true);

create policy "Users can follow others"
  on public.follows for insert with check (auth.uid() = follower_id);

create policy "Users can unfollow"
  on public.follows for delete using (auth.uid() = follower_id);

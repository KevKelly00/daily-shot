-- Run this in Supabase → SQL Editor

-- ─── Profiles ────────────────────────────────────────────────────────────────
create table public.profiles (
  id          uuid references auth.users on delete cascade primary key,
  username    text unique,
  full_name   text,
  avatar_url  text,
  bio         text,
  created_at  timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- ─── Coffee logs ─────────────────────────────────────────────────────────────
create table public.coffee_logs (
  id           uuid default gen_random_uuid() primary key,
  user_id      uuid references auth.users on delete cascade not null,
  title        text,
  brew_method  text,
  rating       integer check (rating >= 1 and rating <= 5),
  notes        text,
  photo_url    text,
  created_at   timestamptz default now()
);

alter table public.coffee_logs enable row level security;

create policy "Coffee logs are viewable by everyone"
  on public.coffee_logs for select using (true);

create policy "Users can insert own logs"
  on public.coffee_logs for insert with check (auth.uid() = user_id);

create policy "Users can update own logs"
  on public.coffee_logs for update using (auth.uid() = user_id);

create policy "Users can delete own logs"
  on public.coffee_logs for delete using (auth.uid() = user_id);

-- ─── Auto-create profile on signup ───────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── Storage bucket for coffee photos ────────────────────────────────────────
-- Run in Storage → create a bucket named "coffee-photos" set to public
-- Then run these policies:

insert into storage.buckets (id, name, public) values ('coffee-photos', 'coffee-photos', true);

create policy "Anyone can view coffee photos"
  on storage.objects for select using (bucket_id = 'coffee-photos');

create policy "Authenticated users can upload photos"
  on storage.objects for insert
  with check (bucket_id = 'coffee-photos' and auth.role() = 'authenticated');

create policy "Users can delete own photos"
  on storage.objects for delete
  using (bucket_id = 'coffee-photos' and auth.uid()::text = (storage.foldername(name))[1]);

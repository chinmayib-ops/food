-- ============================================================
-- Bengaluru Eats — Supabase schema
-- Paste this whole file into:  Supabase → SQL Editor → New query → Run
-- Safe to re-run (idempotent-ish: uses IF NOT EXISTS / OR REPLACE).
-- ============================================================

-- ---------- PROFILES ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  handle      text not null unique,
  created_at  timestamptz not null default now()
);
-- handles are case-insensitive unique
create unique index if not exists profiles_handle_lower_idx
  on public.profiles (lower(handle));

-- ---------- PLACES (custom, shared so friends can resolve them) ----------
create table if not exists public.places (
  id          text primary key,
  name        text not null,
  hood        text not null,
  cuisine     text,
  dish        text,
  lat         double precision,
  lng         double precision,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------- ENTRIES (one rating/note/photo per user per place) ----------
create table if not exists public.entries (
  user_id     uuid not null references auth.users(id) on delete cascade,
  place_id    text not null,
  rating      numeric(2,1) not null default 0,
  note        text default '',
  visited_at  date,
  photo_url   text,
  updated_at  timestamptz not null default now(),
  primary key (user_id, place_id)
);
create index if not exists entries_user_idx on public.entries(user_id);

-- ---------- WISHLIST ----------
create table if not exists public.wishlist (
  user_id     uuid not null references auth.users(id) on delete cascade,
  place_id    text not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, place_id)
);

-- ---------- FRIENDSHIPS (directed follow: user_id follows friend_id) ----------
create table if not exists public.friendships (
  user_id     uuid not null references auth.users(id) on delete cascade,
  friend_id   uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles    enable row level security;
alter table public.places      enable row level security;
alter table public.entries     enable row level security;
alter table public.wishlist    enable row level security;
alter table public.friendships enable row level security;

-- helper: am I following this user?
create or replace function public.is_friend(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.friendships
    where user_id = auth.uid() and friend_id = target
  );
$$;

-- ---- profiles: any signed-in user can read (to look up handles); write own only
drop policy if exists profiles_read   on public.profiles;
drop policy if exists profiles_write  on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_read   on public.profiles for select to authenticated using (true);
create policy profiles_write  on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ---- places: publicly readable (the catalogue); insert by anyone signed-in; update by creator
drop policy if exists places_read   on public.places;
drop policy if exists places_write  on public.places;
drop policy if exists places_update on public.places;
create policy places_read   on public.places for select to anon, authenticated using (true);
create policy places_write  on public.places for insert to authenticated with check (created_by = auth.uid());
create policy places_update on public.places for update to authenticated using (created_by = auth.uid());

-- ---- entries: read own OR a friend's (if I follow them); write own only
drop policy if exists entries_read   on public.entries;
drop policy if exists entries_write  on public.entries;
drop policy if exists entries_update on public.entries;
drop policy if exists entries_delete on public.entries;
create policy entries_read on public.entries for select to authenticated
  using (user_id = auth.uid() or public.is_friend(user_id));
create policy entries_write  on public.entries for insert to authenticated with check (user_id = auth.uid());
create policy entries_update on public.entries for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy entries_delete on public.entries for delete to authenticated using (user_id = auth.uid());

-- ---- wishlist: own only
drop policy if exists wishlist_all on public.wishlist;
create policy wishlist_all on public.wishlist for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- friendships: own rows only
drop policy if exists friendships_all on public.friendships;
create policy friendships_all on public.friendships for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- STORAGE — dish photos bucket
-- ============================================================
insert into storage.buckets (id, name, public)
values ('dish-photos', 'dish-photos', true)
on conflict (id) do nothing;

drop policy if exists "dish photos public read"   on storage.objects;
drop policy if exists "dish photos owner write"    on storage.objects;
drop policy if exists "dish photos owner modify"   on storage.objects;
drop policy if exists "dish photos owner delete"   on storage.objects;

-- public read (bucket is public, but be explicit)
create policy "dish photos public read" on storage.objects
  for select using (bucket_id = 'dish-photos');

-- a user may only write to a folder named after their own uid: <uid>/<file>
create policy "dish photos owner write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'dish-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "dish photos owner modify" on storage.objects
  for update to authenticated
  using (bucket_id = 'dish-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "dish photos owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'dish-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- SPINS — "Spin the Dosa" sessions (locked picks + check-ins)
-- ============================================================
create table if not exists public.spins (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  place_id     text not null,
  cuisine      text,
  spun_at      timestamptz not null default now(),
  locked_at    timestamptz,
  checked_in_at timestamptz,
  verified_by  text check (verified_by in ('photo','gps','manual')),
  bill_url     text,
  super_rated  boolean not null default false
);
create index if not exists spins_user_idx on public.spins(user_id, spun_at desc);

alter table public.spins enable row level security;
drop policy if exists spins_all on public.spins;
create policy spins_all on public.spins for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- bill photos go in the same dish-photos bucket under <uid>/bills/...
-- (already covered by existing storage policies on the bucket)

-- entries: optional dish-level breakdown for super-rated reviews
alter table public.entries add column if not exists super_rated boolean not null default false;
alter table public.entries add column if not exists dishes jsonb;

-- ============================================================
-- REALTIME — broadcast entry changes so friends' feeds live-update
-- ============================================================
alter publication supabase_realtime add table public.entries;

-- Done.

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
-- MULTI-AXIS RATINGS + VALUE-FOR-MONEY  (per-entry)
-- ratings: { taste, presentation, consistency, service, ambiance } each
-- 0..5 (half-steps). overall (the existing `rating` column) is the average
-- of whatever axes the user filled in, computed client-side on save.
-- accessible: was it wheelchair/accessibility friendly (true/false/unknown).
-- visit_type: 'dinein' or 'delivery'.
-- ============================================================
alter table public.entries add column if not exists ratings jsonb;
alter table public.entries add column if not exists price_per_head integer;
alter table public.entries add column if not exists accessible boolean;
alter table public.entries add column if not exists visit_type text;

-- ============================================================
-- CROWDSOURCED MENU PHOTO + MAP LINK  (per-place, anyone can refresh)
-- gmaps_url disambiguates the same spot logged under different names
-- (e.g. "BSK" vs "Banashankari").
-- ============================================================
alter table public.places add column if not exists menu_photo_url text;
alter table public.places add column if not exists menu_updated_at timestamptz;
alter table public.places add column if not exists menu_updated_by text;   -- handle, for display
alter table public.places add column if not exists gmaps_url text;

-- places: menu photo is crowdsourced, so any signed-in user may update a
-- place row (not just its creator). Small friend-app tradeoff; lock to
-- column-level later if vandalism ever becomes a problem.
drop policy if exists places_update on public.places;
create policy places_update on public.places for update to authenticated
  using (true) with check (true);

-- ============================================================
-- PUBLIC PLACE STATS  (true crowdsourcing across ALL users)
-- Returns only aggregates — no notes, no user identities — so it is safe
-- to expose globally even though raw entries stay friends-only via RLS.
-- Powers: "what to order", value-for-money, and the axis breakdown.
-- ============================================================
create or replace function public.place_public_stats(pid text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'overall_avg',  (select round(avg(rating)::numeric, 1) from public.entries where place_id = pid and rating > 0),
    'rating_count', (select count(*) from public.entries where place_id = pid and rating > 0),
    'avg_price',    (select round(avg(price_per_head)::numeric) from public.entries where place_id = pid and price_per_head > 0),
    'price_count',  (select count(*) from public.entries where place_id = pid and price_per_head > 0),
    'axes', (
      select jsonb_build_object(
        'taste',        round(avg((ratings->>'taste')::numeric), 1),
        'presentation', round(avg((ratings->>'presentation')::numeric), 1),
        'consistency',  round(avg((ratings->>'consistency')::numeric), 1),
        'service',      round(avg((ratings->>'service')::numeric), 1),
        'ambiance',     round(avg((ratings->>'ambiance')::numeric), 1)
      )
      from public.entries where place_id = pid and ratings is not null
    ),
    'access_yes', (select count(*) from public.entries where place_id = pid and accessible is true),
    'access_total', (select count(*) from public.entries where place_id = pid and accessible is not null),
    'dishes', (
      select coalesce(jsonb_agg(row_to_json(d)), '[]'::jsonb) from (
        select dish->>'name' as name,
               round(avg((dish->>'rating')::numeric), 1) as avg,
               count(*) as cnt
        from public.entries e,
             lateral jsonb_array_elements(coalesce(e.dishes, '[]'::jsonb)) as dish
        where e.place_id = pid
          and coalesce(dish->>'name', '') <> ''
          and coalesce((dish->>'rating'), '0')::numeric > 0
        group by dish->>'name'
        order by avg desc
        limit 12
      ) d
    )
  );
$$;
grant execute on function public.place_public_stats(text) to anon, authenticated;

-- ============================================================
-- REALTIME — broadcast entry + place changes so feeds & the shared
-- catalogue (new spots, refreshed menus) live-update for everyone
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'entries'
  ) then
    alter publication supabase_realtime add table public.entries;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'places'
  ) then
    alter publication supabase_realtime add table public.places;
  end if;
end $$;

-- ============================================================
-- HARDENING — value constraints, storage limits, photo cleanup
-- Added post-launch. Safe to re-run.
-- RLS controls *who* can write a row; these control *what* a row may
-- contain, so someone hitting the public REST API with the anon key
-- can't store a rating of 999, a multi-megabyte note, or a junk handle.
-- CHECKs are added NOT VALID so they enforce on every new insert/update
-- without failing the script against rows that already exist.
-- ============================================================

-- entries: rating must be a real 0–5 score; keep notes sane
alter table public.entries drop constraint if exists entries_rating_range;
alter table public.entries add  constraint entries_rating_range
  check (rating >= 0 and rating <= 5) not valid;
alter table public.entries drop constraint if exists entries_note_len;
alter table public.entries add  constraint entries_note_len
  check (char_length(coalesce(note, '')) <= 2000) not valid;

-- profiles: a handle is a slug; a name is short
alter table public.profiles drop constraint if exists profiles_handle_fmt;
alter table public.profiles add  constraint profiles_handle_fmt
  check (handle ~ '^[a-z0-9._-]{1,40}$') not valid;
alter table public.profiles drop constraint if exists profiles_name_len;
alter table public.profiles add  constraint profiles_name_len
  check (char_length(name) between 1 and 80) not valid;

-- places: user-addable, so cap the free-text fields
alter table public.places drop constraint if exists places_name_len;
alter table public.places add  constraint places_name_len
  check (char_length(name) between 1 and 300) not valid;
alter table public.places drop constraint if exists places_hood_len;
alter table public.places add  constraint places_hood_len
  check (char_length(hood) between 1 and 200) not valid;

-- storage: cap dish photos at 3 MB and to real image types
update storage.buckets
   set file_size_limit    = 3145728,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'dish-photos';

-- storage cleanup: when an entry's photo is replaced or the entry is
-- deleted, remove the now-orphaned object so the bucket doesn't grow
-- forever. The object name (<uid>/<file>) is the tail of its public URL.
create or replace function public.cleanup_entry_photo()
returns trigger language plpgsql security definer set search_path = public, storage as $$
declare
  gone boolean := false;
begin
  if tg_op = 'DELETE' then
    gone := old.photo_url is not null;
  else  -- UPDATE
    gone := old.photo_url is not null and new.photo_url is distinct from old.photo_url;
  end if;

  if gone then
    delete from storage.objects
     where bucket_id = 'dish-photos'
       and old.photo_url like '%/' || name;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists entries_photo_cleanup on public.entries;
create trigger entries_photo_cleanup
  after update or delete on public.entries
  for each row execute function public.cleanup_entry_photo();

-- Done.

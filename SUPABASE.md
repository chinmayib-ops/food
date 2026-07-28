# Backend setup — Supabase (≈ 5 minutes)

The app works **offline-first**: with no config it runs exactly as before
(localStorage only, name+handle, share-codes). Add Supabase to get real
email accounts, cross-device sync, cloud photos, and live friend feeds.

Nothing here changes the hosting — the site stays a static deploy on Vercel.

---

## 1. Create a free Supabase project

1. Go to **https://supabase.com** → sign in → **New project**
2. Pick a name, a strong DB password (you won't need it again), a region
   close to Bengaluru (e.g. *Mumbai / ap-south-1*)
3. Wait ~2 min for it to provision

## 2. Run the database schema

1. In the project: **SQL Editor** → **New query**
2. Open `schema.sql` from this repo, paste the whole thing in, click **Run**
3. It creates the tables, row-level-security policies, the `dish-photos`
   storage bucket, and turns on realtime. Safe to re-run.

## 3. Get your keys

**Project Settings → API**, copy:

- **Project URL** (e.g. `https://abcd1234.supabase.co`)
- **anon / public** key (a long JWT)

> The anon key is **safe to commit publicly** — every table is locked down
> by the RLS policies in `schema.sql`. It is *not* a secret. (Never put the
> `service_role` key in this repo.)

## 4. Paste them into `config.js`

```js
window.BE_CONFIG = {
  SUPABASE_URL: "https://abcd1234.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbG...your-anon-key..."
};
```

Commit & push — Vercel redeploys automatically. The app flips into cloud
mode (you'll see “☁ synced” in the profile menu).

## 5. Configure the magic-link redirect

So the email link returns users to your site:

1. **Authentication → URL Configuration**
2. **Site URL**: your production URL, e.g. `https://food-xyz.vercel.app`
3. **Redirect URLs**: add both
   - `https://food-xyz.vercel.app`
   - `http://127.0.0.1:8765` (for local testing)
4. (Optional) **Authentication → Providers → Email**: keep “Email” on;
   you can disable “Confirm email” for instant magic-link sign-in.

That's it.

---

## How it behaves

| | Offline (no config) | Cloud (configured) |
|---|---|---|
| Sign in | name + handle, local | email magic-link |
| Storage | localStorage only | Postgres + localStorage cache |
| Photos | base64 in localStorage | uploaded to Storage bucket |
| Friends | paste share-codes | follow by `@handle`, live updates |
| Devices | one browser | syncs everywhere you sign in |

- **Offline-first:** localStorage is always the instant render source.
  Cloud pulls/merges on sign-in and on realtime changes; pushes (debounced)
  on every edit. Last-write-wins by `updated_at`.
- **Privacy:** you can only read a friend's ratings if *you* follow them
  (enforced in SQL, not just the UI). Wishlists stay private.
- **Photos** are uploaded to a per-user folder (`<your-id>/...`) — only you
  can write them; they're publicly readable by URL (needed to show them).
- Share-codes still work in cloud mode too, as a no-account fallback.

## Importing the Bengaluru-wide catalogue (OpenStreetMap)

By default the app ships with 12 seed places. To expand the spin pool to
the ~6,700 restaurants/cafés/bakeries OSM has tagged inside Bengaluru:

1. Run the importer locally (Node 18+ required):
   ```
   node scripts/import-osm.js
   ```
   It hits the public Overpass API, maps OSM tags into our `places`
   shape, and writes `scripts/bengaluru-places.sql`. The repo also
   ships with a pre-generated SQL file you can use as-is.

2. **Supabase → SQL Editor → New query** → paste the contents of
   `scripts/bengaluru-places.sql` → **Run**. ~10–30s on the free tier.

3. Reload the app. `Sync.bootPlaces()` fetches the catalogue (no auth
   required — the policy in step 2 makes `places` publicly readable),
   merges into local storage, and the spin pool jumps from 12 to
   thousands. The "All places" grid caps render at 120 with a "Show
   all →" — use search/filters to narrow.

Re-run the importer every few months to pull fresh OSM data; the SQL is
idempotent (`on conflict (id) do nothing`).

Attribution is required by the ODbL — there's a small "© OpenStreetMap
contributors" footer line included.

## Production checklist

The schema ships with data-integrity hardening baked in (value constraints,
a 3 MB image-only limit on the photo bucket, and automatic cleanup of
orphaned dish photos). **Re-run `schema.sql`** once to apply it to an existing
project — it's idempotent and the new CHECKs are added `NOT VALID`, so they
enforce on new writes without touching rows you already have.

The remaining items live in the Supabase dashboard (code can't do them for you):

- **Email provider** — the built-in email that sends magic links is a *testing*
  service and throttles to a few messages an hour. Before inviting real users,
  set a custom SMTP provider (Resend / Postmark / SendGrid — free tiers exist)
  under **Authentication → Emails / SMTP**.
- **Redirect URLs** — add your production URL under **Authentication → URL
  Configuration** (see step 5) or sign-in silently fails in production.
- **Bot protection** — enable Turnstile or hCaptcha under **Authentication →
  Attack Protection** so bots can't mass-create accounts.
- **Backups** — the free tier has no point-in-time recovery. If the data
  matters, upgrade for PITR or schedule a periodic `pg_dump`.
- **Keep-warm** — free projects pause after ~7 days idle. The repo includes a
  daily GitHub Action (`.github/workflows/keepalive.yml`) that pings the
  catalogue to keep it awake; it runs once merged to the default branch.

## Troubleshooting

- *Still says “● offline”* → `config.js` keys missing/typo, or the
  `@supabase/supabase-js` CDN was blocked. Check the browser console.
- *Magic link opens but doesn't sign in* → add your exact URL to
  **Redirect URLs** (step 5).
- *“Handle is taken”* → handles are globally unique & case-insensitive.
- *Photos don't appear for friends* → confirm step 2 created the
  `dish-photos` bucket (Storage tab) and its policies.

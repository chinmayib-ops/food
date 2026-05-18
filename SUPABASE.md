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

## Troubleshooting

- *Still says “● offline”* → `config.js` keys missing/typo, or the
  `@supabase/supabase-js` CDN was blocked. Check the browser console.
- *Magic link opens but doesn't sign in* → add your exact URL to
  **Redirect URLs** (step 5).
- *“Handle is taken”* → handles are globally unique & case-insensitive.
- *Photos don't appear for friends* → confirm step 2 created the
  `dish-photos` bucket (Storage tab) and its policies.

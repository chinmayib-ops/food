# Bengaluru Eats — Your Filter-Coffee Logbook

A personal, editorial logbook for rating where Bengaluru eats. Rate, note & photograph
plates, follow friends by handle, and watch the city's verdict roll in — synced across
every device you sign in on.

It's a zero-build, vanilla-JS Progressive Web App with an optional Supabase backend for
accounts and live sync. With no backend configured it runs fully offline in
`localStorage`, and logbooks can still be traded as a single share link.

---

## Features

- **The Logbook** — every place in a ~9,000-strong Bengaluru catalogue, plus your own
  additions. Half-star ratings, notes, a photo, and the date you went. Search, filter by
  cuisine/rating, and sort. Filter tabs show live counts (*Rated by you*, *Wishlist*,
  *From friends*).
- **Wishlist** — track places you haven't been to yet, separately, until you tick them off.
- **Stats** — an editorial "By the numbers" dashboard: your headline plate count and
  average verdict, a rating-distribution chart, your taste profile by cuisine, your
  top-rated plate, and the areas you eat in most.
- **Friends & sharing** — follow friends by `@handle` to see their verdicts live, or
  share your whole logbook via one link. Share straight to **WhatsApp**, the native
  device share sheet, or copy the link.
- **Profile** — your account page: avatar, handle, member-since and sync status, a
  stat summary, quick share buttons, your recently rated plates, and account actions
  (edit name/handle, print/export, sign out). Works signed-in or offline.
- **Spin the Dosa** — can't decide? A weighted picker that considers distance, your taste,
  your wishlist, and your friends, with an optional check-in flow that unlocks an
  *Adventurous Visit* badge.
- **PWA** — installable, offline-capable via a service worker, "Add to Home Screen" on
  mobile.

## Tech

- Plain HTML, CSS, and JavaScript — **no build step, no framework**.
- [Supabase](https://supabase.com/) (optional) for email magic-link auth and cross-device
  sync, protected by Row Level Security.
- Fonts: DM Serif Display, Newsreader, IBM Plex Mono.
- Restaurant catalogue from a
  [Kaggle dataset by mrmars1010](https://www.kaggle.com/datasets/mrmars1010/restaurants-dataset-bengaluru)
  (Bengaluru places sourced from Tripadvisor).

## Project structure

```
index.html             # markup for every page & modal (single-page app)
styles.css             # all styles (editorial / newspaper aesthetic, light + dark)
script.js              # app logic: data layer, rendering, spin, sync
supabase.js            # Supabase client + auth/sync helpers
config.js              # backend config (Supabase URL + anon key)
schema.sql             # database schema + Row Level Security policies
SUPABASE.md            # backend setup guide
manifest.webmanifest   # PWA manifest
sw.js                  # service worker (offline cache)
icons/                 # app icons
```

## Running locally

No build tooling is required — just serve the folder over HTTP (a service worker and ES
modules need `http://`, not `file://`):

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>.

## Backend setup (optional)

The app runs offline with no configuration. To enable accounts and cross-device sync:

1. Create a Supabase project.
2. Run [`schema.sql`](schema.sql) in the Supabase SQL editor to create the tables and RLS
   policies.
3. Paste your project URL and **anon** (public) key into [`config.js`](config.js).

Leaving the values in `config.js` empty runs the app in offline, `localStorage`-only mode.
See [`SUPABASE.md`](SUPABASE.md) for the full walkthrough. The anon key is safe to commit —
data is protected by Row Level Security.

## Deployment

Any static host works (the repo includes a `vercel.json`). Deploy the folder as-is; there's
nothing to compile.

---

_A logbook for how a city eats._

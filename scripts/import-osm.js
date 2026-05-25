#!/usr/bin/env node
/* ============================================================
   Bengaluru Eats — OpenStreetMap restaurant importer
   ------------------------------------------------------------
   One-time (or occasional) ingest. Queries the Overpass API for
   restaurants/cafes/bakeries inside Bengaluru's bounding box,
   maps OSM tags to our schema, and writes a SQL file you paste
   into Supabase's SQL Editor.

   Usage:   node scripts/import-osm.js
   Output:  scripts/bengaluru-places.sql
   Then:    Supabase → SQL Editor → New query → paste → Run

   No API keys, no DB access — just reads from Overpass and
   writes a local file. Re-running is safe; the SQL uses
   `on conflict (id) do nothing`.

   Data © OpenStreetMap contributors, licensed under ODbL.
   ============================================================ */

const fs = require('fs');
const path = require('path');

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];

// Bengaluru bbox: south, west, north, east (includes Whitefield, EC, Yelahanka)
const BBOX = [12.78, 77.42, 13.18, 77.83];

const QUERY = `
[out:json][timeout:180];
(
  node["amenity"~"^(restaurant|cafe|fast_food|bar|pub|food_court|ice_cream|bakery)$"](${BBOX.join(',')});
  way["amenity"~"^(restaurant|cafe|fast_food|bar|pub|food_court|ice_cream|bakery)$"](${BBOX.join(',')});
);
out center tags;
`;

/* ---------- cuisine mapping (OSM tag → our category) ---------- */
function mapCuisine(amenity, cuisineTag){
  const c = (cuisineTag || '').toLowerCase();

  if (amenity === 'bakery') return 'Bakery';
  if (amenity === 'ice_cream') return 'Desserts';
  if (amenity === 'cafe' && !c) return 'Café';
  if (amenity === 'fast_food' && !c) return 'Street Food';

  if (c.includes('south_indian') || c.includes('udupi') || c.includes('kerala') || c.includes('tamil')) return 'South Indian';
  if (c.includes('north_indian') || c.includes('punjabi') || c.includes('mughlai') || c.includes('tandoori')) return 'North Indian';
  if (c.includes('chinese') || c.includes('asian') || c.includes('thai') || c.includes('japanese') || c.includes('korean')) return 'Chinese';
  if (c.includes('italian') || c.includes('pizza') || c.includes('pasta')) return 'Italian';
  if (c.includes('bakery') || c.includes('sandwich') || c.includes('breakfast')) return 'Bakery';
  if (c.includes('coffee') || c.includes('tea')) return 'Café';
  if (c.includes('dessert') || c.includes('ice_cream') || c.includes('frozen_yogurt') || c.includes('chocolate')) return 'Desserts';
  if (c.includes('continental') || c.includes('european') || c.includes('american') || c.includes('burger') || c.includes('steak') || c.includes('mexican')) return 'Continental';
  if (c.includes('street_food') || c.includes('chaat')) return 'Street Food';
  if (c.includes('indian')) return 'Multi-cuisine';
  if (c) return 'Multi-cuisine';
  return 'Other';
}

/* ---------- neighborhood pick ---------- */
function pickHood(tags){
  return (tags['addr:suburb']
       || tags['addr:neighbourhood']
       || tags['addr:city_district']
       || tags['addr:place']
       || tags['addr:locality']
       || 'Bengaluru').trim();
}

function pickDish(tags){
  // OSM `cuisine` is sometimes a list like "indian;chinese;continental".
  // Use it as a hint for the "signature dish" line on the card.
  const c = tags.cuisine;
  if (!c || c.length > 80) return null;
  return c.replace(/[_;]/g, ' ').replace(/\s+/g, ' ').trim();
}

function slug(s){
  return String(s).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function sqlStr(s){ return "'" + String(s).replace(/'/g, "''") + "'"; }
function sqlNullable(s){ return s == null || s === '' ? 'NULL' : sqlStr(s); }

/* ---------- fetch from Overpass with endpoint fallback ---------- */
const HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded',
  'Accept': 'application/json',
  'User-Agent': 'BengaluruEats/1.0 (github.com/chinmayib-ops/food; contact: see-repo)'
};

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

async function overpassFetch(){
  for (let attempt = 0; attempt < 2; attempt++){
    for (const url of OVERPASS_ENDPOINTS) {
      try {
        console.log('→ ' + (attempt ? 'retry ' : '') + url);
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 200_000);
        const res = await fetch(url, {
          method: 'POST',
          headers: HEADERS,
          body: 'data=' + encodeURIComponent(QUERY),
          signal: ctrl.signal
        });
        clearTimeout(t);
        if (res.status === 429 || res.status === 504) {
          console.log('  ⌛ HTTP ' + res.status + ' — backing off');
          await sleep(15_000);
          continue;
        }
        if (!res.ok) { console.log('  ✗ HTTP ' + res.status); continue; }
        const json = await res.json();
        console.log('  ✓ got ' + json.elements.length + ' elements');
        return json;
      } catch (e) {
        console.log('  ✗ ' + (e.message || e));
      }
    }
    if (attempt === 0) { console.log('All endpoints busy — waiting 30s then retrying once…'); await sleep(30_000); }
  }
  throw new Error('All Overpass endpoints rejected. Try again in 5–10 minutes — the public mirrors throttle aggressively.');
}

/* ---------- transform + emit SQL ---------- */
async function main(){
  if (typeof fetch !== 'function') {
    console.error('This script needs Node 18+ (for global fetch). Update Node.');
    process.exit(1);
  }

  console.log('Querying Overpass for Bengaluru restaurants…');
  const data = await overpassFetch();

  const rows = [];
  const seen = new Set();
  const idCounts = new Map();

  for (const el of data.elements){
    const tags = el.tags || {};
    const name = (tags.name || '').trim();
    if (!name) continue;
    const lat = el.lat ?? (el.center && el.center.lat);
    const lng = el.lon ?? (el.center && el.center.lon);
    if (!lat || !lng) continue;

    // Prefer a friendly slug id where possible; fall back to OSM type+id.
    const friendly = slug(name + '-' + pickHood(tags));
    let id;
    if (friendly && friendly.length >= 4) {
      const n = (idCounts.get(friendly) || 0) + 1;
      idCounts.set(friendly, n);
      id = n === 1 ? friendly : friendly + '-' + n;
    } else {
      id = 'osm-' + el.type[0] + el.id;
    }
    if (seen.has(id)) continue;
    seen.add(id);

    rows.push({
      id,
      name,
      hood:    pickHood(tags),
      cuisine: mapCuisine(tags.amenity, tags.cuisine),
      dish:    pickDish(tags),
      lat,
      lng
    });
  }

  console.log('After filter + dedupe: ' + rows.length + ' places');

  /* ---------- write SQL ---------- */
  const lines = [];
  lines.push('-- ============================================================');
  lines.push('-- Bengaluru restaurant catalogue — imported from OpenStreetMap');
  lines.push('-- (c) OpenStreetMap contributors, licensed under ODbL.');
  lines.push('-- Generated: ' + new Date().toISOString());
  lines.push('-- Total places: ' + rows.length);
  lines.push('-- ============================================================');
  lines.push('');
  lines.push('-- Make the places catalogue publicly readable (idempotent)');
  lines.push("drop policy if exists places_read on public.places;");
  lines.push("create policy places_read on public.places for select to anon, authenticated using (true);");
  lines.push('');
  lines.push('-- Bulk insert. Safe to re-run.');
  lines.push('');

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK){
    const slice = rows.slice(i, i + CHUNK);
    lines.push('insert into public.places (id, name, hood, cuisine, dish, lat, lng) values');
    const vals = slice.map(r =>
      `  (${sqlStr(r.id)}, ${sqlStr(r.name)}, ${sqlStr(r.hood)}, ${sqlStr(r.cuisine)}, ${sqlNullable(r.dish)}, ${r.lat}, ${r.lng})`
    ).join(',\n');
    lines.push(vals);
    lines.push('on conflict (id) do nothing;');
    lines.push('');
  }

  const out = path.join(__dirname, 'bengaluru-places.sql');
  fs.writeFileSync(out, lines.join('\n'));

  // also a compact summary
  const byCuisine = {};
  rows.forEach(r => byCuisine[r.cuisine] = (byCuisine[r.cuisine] || 0) + 1);
  console.log('\nBreakdown by cuisine:');
  Object.entries(byCuisine).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => console.log('  ' + k.padEnd(15) + v));

  console.log('\nWrote ' + out);
  console.log('Next: open it, copy all, paste into Supabase → SQL Editor → New query → Run.');
}

main().catch(err => {
  console.error('\nImport failed:', err.message || err);
  process.exit(1);
});

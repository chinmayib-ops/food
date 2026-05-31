#!/usr/bin/env node
/* ============================================================
   Bengaluru Eats — Google Places (New API) restaurant importer
   ------------------------------------------------------------
   REPLACES the OSM catalogue with Google data. Uses the Places
   API (New) with a tight field mask to stay in the "Advanced"
   billing tier (~$25 per 1000 calls). Hard-capped to 45 calls.

   Usage (PowerShell):
     $env:GOOGLE_API_KEY="AIza...your-key..."
     node scripts/import-google.js

   Usage (bash):
     GOOGLE_API_KEY=AIza... node scripts/import-google.js

   Output:
     scripts/bengaluru-places-google.sql

   Then:
     Supabase → SQL Editor → New query → paste → Run
     (Deletes existing un-owned places, then inserts Google data.)

   The key never enters the repo, never enters the client.
   ============================================================ */

const fs = require('fs');
const path = require('path');

const KEY = process.env.GOOGLE_API_KEY;
if (!KEY) {
  console.error('Missing GOOGLE_API_KEY env var.');
  console.error('PowerShell:  $env:GOOGLE_API_KEY="AIza..."');
  console.error('Bash:        GOOGLE_API_KEY=AIza... node scripts/import-google.js');
  process.exit(1);
}

const ENDPOINT = 'https://places.googleapis.com/v1/places:searchNearby';

/* Tight field mask — drives billing.
   Including any of: rating, userRatingCount, businessStatus  → Advanced (~$25/1000)
   Adding photos / openingHours would push us to Preferred (~$35/1000) — DO NOT add. */
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.types',
  'places.primaryType',
  'places.shortFormattedAddress',
  'places.rating',
  'places.userRatingCount',
  'places.businessStatus'
].join(',');

/* Each "bucket" is one Nearby Search call per cell.
   Splitting types lets us get up to 20×N results per cell instead of 20 total. */
const TYPE_BUCKETS = [
  ['restaurant'],
  ['cafe', 'coffee_shop'],
  ['bakery', 'ice_cream_shop'],
  ['bar', 'pub'],
  ['meal_takeaway', 'meal_delivery', 'fast_food_restaurant']
];

/* Bengaluru neighbourhood grid — 15 cells, ~2–3 km radius each */
const CELLS = [
  { name: 'CBD/Brigade',     lat: 12.9750, lng: 77.5946, r: 2500 },
  { name: 'Indiranagar',     lat: 12.9719, lng: 77.6412, r: 2500 },
  { name: 'Koramangala',     lat: 12.9352, lng: 77.6245, r: 2500 },
  { name: 'HSR Layout',      lat: 12.9116, lng: 77.6473, r: 2500 },
  { name: 'Whitefield',      lat: 12.9698, lng: 77.7500, r: 3000 },
  { name: 'Jayanagar',       lat: 12.9279, lng: 77.5831, r: 2500 },
  { name: 'Basavanagudi',    lat: 12.9419, lng: 77.5732, r: 2500 },
  { name: 'Malleshwaram',    lat: 13.0036, lng: 77.5694, r: 2500 },
  { name: 'Frazer Town',     lat: 12.9981, lng: 77.6190, r: 2000 },
  { name: 'MG/Brigade Rd',   lat: 12.9756, lng: 77.6041, r: 2000 },
  { name: 'JP Nagar',        lat: 12.9081, lng: 77.5851, r: 2500 },
  { name: 'Banashankari',    lat: 12.9249, lng: 77.5546, r: 2500 },
  { name: 'Rajajinagar',     lat: 13.0064, lng: 77.5564, r: 2500 },
  { name: 'Yelahanka',       lat: 13.1007, lng: 77.5963, r: 3000 },
  { name: 'Electronic City', lat: 12.8456, lng: 77.6603, r: 3000 }
];

const MAX_CALLS = 80;        // hard ceiling — failsafe (~$2 worst case)
const PER_CALL_USD = 0.025;  // Advanced SKU price (approximate)

/* ---------- type → our cuisine taxonomy ---------- */
function mapCuisine(types, primaryType, name){
  const set = new Set([primaryType, ...(types || [])].filter(Boolean));
  const has = (t) => set.has(t);

  if (has('bakery')) return 'Bakery';
  if (has('ice_cream_shop') || has('dessert_shop') || has('chocolate_shop')) return 'Desserts';
  if (has('coffee_shop') || has('cafe')) return 'Café';
  if (has('bar') || has('pub') || has('wine_bar') || has('night_club')) return 'Continental';
  if (has('italian_restaurant') || has('pizza_restaurant')) return 'Italian';
  if (has('chinese_restaurant') || has('thai_restaurant') || has('japanese_restaurant')
   || has('korean_restaurant') || has('sushi_restaurant') || has('asian_restaurant')
   || has('vietnamese_restaurant')) return 'Chinese';
  if (has('mexican_restaurant') || has('american_restaurant') || has('steak_house')
   || has('hamburger_restaurant') || has('seafood_restaurant') || has('french_restaurant')) return 'Continental';
  if (has('meal_takeaway') || has('meal_delivery') || has('fast_food_restaurant')) return 'Street Food';

  if (has('indian_restaurant')) {
    // name heuristic: Sagar/Bhavan/Tiffin/Darshini/Udupi → South Indian
    if (/sagar|bhavan|tiffin|darshini|udupi|adigas|nandhini|kamat|brahmin/i.test(name || '')) return 'South Indian';
    if (/dhaba|punjab|tandoor|kebab|biryani/i.test(name || '')) return 'North Indian';
    return 'Multi-cuisine';
  }
  if (has('restaurant') || has('food')) return 'Multi-cuisine';
  return 'Other';
}

/* ---------- friendly slug id (with collision suffix) ---------- */
const idCounts = new Map();
function freshId(name, hood){
  const base = ((name || '') + '-' + (hood || ''))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  if (!base || base.length < 3) return null;
  const n = (idCounts.get(base) || 0) + 1;
  idCounts.set(base, n);
  return n === 1 ? base : base + '-' + n;
}

function deriveHood(addr){
  if (!addr) return 'Bengaluru';
  // shortFormattedAddress is e.g. "135, Residency Rd, Shanthala Nagar, Bengaluru"
  // Skip parts that look like street numbers or pure addresses; prefer a real area name.
  const parts = addr.split(',').map(s => s.trim()).filter(Boolean);
  for (const p of parts) {
    // Skip pieces starting with a digit or with fewer than 3 letters
    if (/^\d/.test(p)) continue;
    const letters = p.replace(/[^a-zA-Z]/g, '').length;
    if (letters < 3) continue;
    // Skip a final "Bengaluru" if we have anything better
    if (/^(bengaluru|bangalore|karnataka|india)$/i.test(p)) continue;
    return p;
  }
  return 'Bengaluru';
}

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
function sqlStr(s){ return "'" + String(s).replace(/'/g, "''") + "'"; }
function sqlNull(s){ return s == null || s === '' ? 'NULL' : sqlStr(s); }

let callCount = 0;

async function nearbySearch(cell, types){
  if (callCount >= MAX_CALLS) throw new Error('MAX_CALLS reached');
  const body = {
    includedTypes: types,
    maxResultCount: 20,
    locationRestriction: {
      circle: {
        center: { latitude: cell.lat, longitude: cell.lng },
        radius: cell.r
      }
    }
  };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': KEY,
      'X-Goog-FieldMask': FIELD_MASK
    },
    body: JSON.stringify(body)
  });
  callCount++;
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

async function main(){
  console.log(`Querying Google Places (New) for ${CELLS.length} Bengaluru cells…`);
  console.log(`Hard cap: ${MAX_CALLS} calls (~$${(MAX_CALLS * PER_CALL_USD).toFixed(2)} worst case)\n`);

  const byGoogleId = new Map();

  for (const cell of CELLS) {
    if (callCount >= MAX_CALLS) { console.log('⚠ MAX_CALLS hit — stopping early'); break; }
    process.stdout.write(`→ ${cell.name.padEnd(18)} `);
    let cellPlaces = 0, newPlaces = 0;
    for (const types of TYPE_BUCKETS) {
      if (callCount >= MAX_CALLS) break;
      let data;
      try { data = await nearbySearch(cell, types); }
      catch (e) { process.stdout.write(`✗ ${e.message} `); continue; }
      const places = data.places || [];
      cellPlaces += places.length;
      for (const p of places) {
        if (!p.id) continue;
        if (!byGoogleId.has(p.id)) { byGoogleId.set(p.id, p); newPlaces++; }
      }
    }
    console.log(`+${newPlaces} new (${cellPlaces} raw)  [calls: ${callCount}]`);
  }

  console.log(`\nTotal API calls: ${callCount}`);
  console.log(`Estimated spend: ~$${(callCount * PER_CALL_USD).toFixed(2)}`);
  console.log(`Unique places:  ${byGoogleId.size}`);

  /* ---------- transform to our row shape ---------- */
  const rows = [];
  for (const p of byGoogleId.values()) {
    const name = p.displayName && p.displayName.text;
    if (!name) continue;
    const loc = p.location;
    if (!loc) continue;
    const hood = deriveHood(p.shortFormattedAddress);
    const id = freshId(name, hood);
    if (!id) continue;
    const cuisine = mapCuisine(p.types, p.primaryType, name);
    // Skip closed places (CLOSED_PERMANENTLY) — they only pollute the spin
    if (p.businessStatus === 'CLOSED_PERMANENTLY') continue;
    rows.push({
      id,
      name,
      hood,
      cuisine,
      dish: null,  // not in the cheap field mask
      lat: loc.latitude,
      lng: loc.longitude
    });
  }
  console.log(`After clean-up: ${rows.length} rows ready to insert`);

  /* ---------- breakdown ---------- */
  const tally = {};
  rows.forEach(r => tally[r.cuisine] = (tally[r.cuisine] || 0) + 1);
  console.log('\nBreakdown by cuisine:');
  Object.entries(tally).sort((a,b) => b[1] - a[1])
    .forEach(([k,v]) => console.log('  ' + k.padEnd(14) + v));

  /* ---------- write SQL ---------- */
  const lines = [];
  lines.push('-- ============================================================');
  lines.push('-- Bengaluru restaurant catalogue — Google Places API (New)');
  lines.push('-- Replaces all un-owned places (i.e. previous OSM import).');
  lines.push('-- Generated: ' + new Date().toISOString());
  lines.push('-- Total places: ' + rows.length);
  lines.push('-- API calls used: ' + callCount + ' (~$' + (callCount * PER_CALL_USD).toFixed(2) + ')');
  lines.push('-- ============================================================');
  lines.push('');
  lines.push('-- 1) Ensure places are publicly readable (idempotent)');
  lines.push("drop policy if exists places_read on public.places;");
  lines.push("create policy places_read on public.places for select to anon, authenticated using (true);");
  lines.push('');
  lines.push('-- 2) Remove old un-owned places (the OSM import lives here)');
  lines.push('delete from public.places where created_by is null;');
  lines.push('');
  lines.push('-- 3) Insert Google Places data');
  lines.push('');

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    lines.push('insert into public.places (id, name, hood, cuisine, dish, lat, lng) values');
    const vals = slice.map(r =>
      `  (${sqlStr(r.id)}, ${sqlStr(r.name)}, ${sqlStr(r.hood)}, ${sqlStr(r.cuisine)}, ${sqlNull(r.dish)}, ${r.lat}, ${r.lng})`
    ).join(',\n');
    lines.push(vals);
    lines.push('on conflict (id) do nothing;');
    lines.push('');
  }

  const out = path.join(__dirname, 'bengaluru-places-google.sql');
  fs.writeFileSync(out, lines.join('\n'));
  console.log('\nWrote ' + out);
  console.log('Next: paste that file into Supabase SQL Editor → Run.');
}

main().catch(err => {
  console.error('\nImport failed:', err.message || err);
  process.exit(1);
});

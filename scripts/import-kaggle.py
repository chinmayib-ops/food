#!/usr/bin/env python3
"""
Bengaluru Eats — Kaggle dataset importer
Source: https://www.kaggle.com/datasets/mrmars1010/restaurants-dataset-bengaluru
~9,291 restaurants with names, cuisine, dishes, ratings, lat/lng.

Usage (PowerShell):
    $env:KAGGLE_USERNAME="your-username"
    $env:KAGGLE_KEY="KGAT_..."
    python scripts/import-kaggle.py

Output: scripts/bengaluru-places-kaggle.sql
Then: Supabase → SQL Editor → paste → Run.

The generated SQL REPLACES all un-owned places (previous OSM import)
with this Kaggle data. User-added places are untouched.
"""
import os, re, sys, json
import kagglehub
import pandas as pd

DATASET = "mrmars1010/restaurants-dataset-bengaluru"

# ============================================================
#  Bengaluru neighbourhood keywords (matched against the address)
# ============================================================
# Ordered roughly by specificity — more-specific names first so e.g.
# "Indiranagar 1st Stage" matches before plain "Indiranagar".
AREAS = [
    "Indiranagar", "Koramangala", "Whitefield", "Marathahalli", "HSR Layout",
    "BTM Layout", "BTM", "Jayanagar", "JP Nagar", "Banashankari", "Basavanagudi",
    "Malleshwaram", "Rajajinagar", "Yeshwanthpur", "Yelahanka", "Hebbal",
    "RT Nagar", "Frazer Town", "Cox Town", "Cooke Town", "Banaswadi",
    "Lavelle Road", "Brigade Road", "MG Road", "Cunningham Road",
    "Sadashivanagar", "Vasanth Nagar", "Vasanthnagar", "Domlur",
    "CV Raman Nagar", "KR Puram", "Mahadevapura", "Bellandur",
    "Sarjapur Road", "Sarjapur", "Electronic City", "Bannerghatta Road",
    "Bannerghatta", "Wilson Garden", "Shanti Nagar", "Richmond Town",
    "Ulsoor", "Halasuru", "Magrath Road", "Residency Road", "Church Street",
    "Commercial Street", "Vidyaranyapura", "Hennur", "Kalyan Nagar",
    "Thanisandra", "Kasturi Nagar", "Old Airport Road", "New BEL Road",
    "BEL Road", "Sanjay Nagar", "Sahakar Nagar", "Kammanahalli",
    "Sankey Road", "Kumara Park", "Shivaji Nagar", "Gandhi Bazaar",
    "Gandhi Nagar", "Chickpet", "Avenue Road", "Majestic", "Race Course Road",
    "Infantry Road", "St. Mark's Road", "St Marks Road", "St Patricks",
    "Brigade Gateway", "Yelahanka New Town", "Kengeri", "RR Nagar",
    "Rajarajeshwari Nagar", "Vijayanagar", "Magadi Road", "Mysore Road",
    "Tumkur Road", "Begur", "Bommanahalli", "Hosur Road", "Madiwala",
    "Ejipura", "Adugodi", "Wilson Gardens", "Shanti Nagar", "Austin Town",
    "Murugeshpalya", "Kodihalli", "HAL", "Domlur Layout", "Manyata Tech Park",
    "Nagavara", "Hennur Road", "Outer Ring Road", "ORR",
    "Ramamurthy Nagar", "Horamavu", "Kasavanahalli", "Akshayanagar",
    "Bommanahalli", "Begur Road",
]

# Sort longest-first so multi-word matches win over substrings
AREAS_SORTED = sorted(set(AREAS), key=lambda s: -len(s))


def clean(s):
    if not isinstance(s, str):
        return ""
    return re.sub(r"\s+", " ", s).strip()


def extract_hood(address, localAddress, postal):
    """Try to find a neighbourhood name in the address strings."""
    blob = " ".join(filter(None, [clean(address), clean(localAddress)]))
    if not blob:
        return "Bengaluru"
    # Case-insensitive match against the area keyword list
    blob_lc = blob.lower()
    for area in AREAS_SORTED:
        # Word-boundary-ish match: area surrounded by start/end or non-alphanumeric
        pat = r"(?<![a-z])" + re.escape(area.lower()) + r"(?![a-z])"
        if re.search(pat, blob_lc):
            return area
    return "Bengaluru"


def map_cuisine(raw, dishes="", name=""):
    """Map the dataset's free-text cuisine string into our taxonomy.
    Priority matters — Indian sub-cuisines BEFORE generic 'asian' (so
    'Indian Barbecue Asian' doesn't become Chinese)."""
    c = clean(raw).lower()
    d = clean(dishes).lower()
    n = clean(name).lower()
    if not c and not d and not n:
        return "Other"

    def hasc(*kws):
        return any(k in c for k in kws)

    is_indian = hasc("indian", "mughlai", "tandoor", "biryani", "kebab",
                     "udupi", "andhra", "kerala", "punjabi", "hyderabadi",
                     "chettinad", "tamil", "karnataka", "mangalorean",
                     "konkani", "goan", "bengali", "rajasthani", "kashmiri")

    # --- Specific Indian regional cuisines first ---
    if hasc("south indian", "udupi", "kerala", "tamil", "chettinad",
            "andhra", "karnataka", "mangalorean", "konkani"):
        return "South Indian"
    if hasc("north indian", "punjabi", "mughlai", "tandoor", "biryani",
            "hyderabadi", "kashmiri", "rajasthani", "awadhi", "lucknowi",
            "bengali", "goan"):
        return "North Indian"

    # --- Generic 'Indian' + name heuristic ---
    if is_indian and re.search(r"\b(sagar|bhavan|tiffin|darshini|udupi|adigas|nandhini|kamat|brahmin|vidyarthi|veena stores|cafe coffee day)\b", n):
        return "South Indian"
    if is_indian and re.search(r"\b(dhaba|tandoor|kebab|biryani|punjab|moti mahal)\b", n):
        return "North Indian"

    # --- East Asian — only if NOT also tagged Indian ---
    if not is_indian and hasc("chinese", "asian", "thai", "japanese",
                              "korean", "sushi", "vietnamese", "tibetan",
                              "momo", "ramen", "dim sum"):
        return "Chinese"

    # --- Italian ---
    if hasc("italian", "pizza", "pasta", "neapolitan"):
        return "Italian"

    # --- Bakery & desserts ---
    if hasc("bakery"):
        return "Bakery"
    if hasc("dessert", "ice cream", "ice-cream", "frozen yogurt", "gelato",
            "chocolate", "sweet shop", "patisserie"):
        return "Desserts"

    # --- Café / coffee ---
    if hasc("cafe", "café", "coffee", "tea", "boba", "bubble tea"):
        return "Café"

    # --- Western / Continental ---
    if hasc("continental", "european", "american", "burger", "steak",
            "mexican", "spanish", "french", "mediterranean", "lebanese",
            "turkish", "greek", "german", "british", "irish", "fusion"):
        return "Continental"

    # --- Bars (food-serving) ---
    if hasc("bar", "pub", "wine", "brewery", "brewpub"):
        return "Continental"

    # --- Street / fast food ---
    if hasc("street food", "chaat", "fast food", "fast-food", "takeaway",
            "food truck"):
        return "Street Food"

    # --- Generic Indian with no regional sub-tag ---
    if is_indian:
        return "Multi-cuisine"

    # --- Catch-all: there's SOME cuisine string but nothing matched ---
    if c:
        return "Multi-cuisine"

    return "Other"


def top_dishes(s, n=3):
    """Dishes field is space-separated nouns. Return the first N as a comma list."""
    s = clean(s)
    if not s:
        return None
    parts = [p for p in re.split(r"\s+", s) if p]
    if not parts:
        return None
    return ", ".join(parts[:n])


def slugify(s, maxlen=60):
    s = re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")
    return s[:maxlen]


def sql_str(s):
    return "'" + str(s).replace("'", "''") + "'"


def sql_nullable(s):
    if s is None or s == "" or (isinstance(s, float) and pd.isna(s)):
        return "NULL"
    return sql_str(s)


def main():
    if not os.environ.get("KAGGLE_USERNAME") or not os.environ.get("KAGGLE_KEY"):
        print("Missing KAGGLE_USERNAME / KAGGLE_KEY env vars", file=sys.stderr)
        sys.exit(1)

    print(f"Downloading {DATASET}...")
    path = kagglehub.dataset_download(DATASET)
    csv = os.path.join(path, "Bengaluru_Restaurants.csv")
    print(f"Reading {csv}")

    df = pd.read_csv(csv)
    print(f"Raw rows: {len(df):,}")

    rows = []
    seen = set()
    id_counts = {}
    skipped = {"no_name": 0, "no_coords": 0, "duplicate": 0}

    for _, r in df.iterrows():
        name = clean(r.get("name", ""))
        if not name:
            skipped["no_name"] += 1
            continue
        lat = r.get("latitude")
        lng = r.get("longitude")
        if pd.isna(lat) or pd.isna(lng):
            skipped["no_coords"] += 1
            continue

        hood = extract_hood(r.get("address", ""), r.get("localAddress", ""), r.get("addressObj/postalcode", ""))
        cuisine = map_cuisine(r.get("cuisine", ""), r.get("Dishes", ""), name)
        dish = top_dishes(r.get("Dishes", ""))

        # ID — slug from name + hood, with collision suffix
        base = slugify(f"{name}-{hood}")
        if not base or len(base) < 3:
            base = slugify(name)
        if not base:
            continue
        n = id_counts.get(base, 0) + 1
        id_counts[base] = n
        pid = base if n == 1 else f"{base}-{n}"
        if pid in seen:
            skipped["duplicate"] += 1
            continue
        seen.add(pid)

        rows.append({
            "id": pid,
            "name": name,
            "hood": hood,
            "cuisine": cuisine,
            "dish": dish,
            "lat": float(lat),
            "lng": float(lng),
        })

    print(f"After clean-up: {len(rows):,} rows")
    print(f"Skipped: {skipped}\n")

    tally = {}
    for r in rows:
        tally[r["cuisine"]] = tally.get(r["cuisine"], 0) + 1
    print("Breakdown by cuisine:")
    for k, v in sorted(tally.items(), key=lambda kv: -kv[1]):
        print(f"  {k:<14} {v:,}")
    print()

    # ============================================================
    #  Emit SQL
    # ============================================================
    out_lines = [
        "-- ============================================================",
        "-- Bengaluru restaurant catalogue — Kaggle dataset import",
        "-- Source: kaggle.com/datasets/mrmars1010/restaurants-dataset-bengaluru",
        f"-- Generated: {pd.Timestamp.utcnow().isoformat()}",
        f"-- Total places: {len(rows):,}",
        "-- Replaces previous OSM / Google imports (all un-owned places).",
        "-- ============================================================",
        "",
        "-- 1) Ensure places are publicly readable (idempotent)",
        "drop policy if exists places_read on public.places;",
        "create policy places_read on public.places for select to anon, authenticated using (true);",
        "",
        "-- 2) Wipe previous un-owned places (OSM + Google imports).",
        "--    User-added custom places are NOT touched (they have a created_by).",
        "delete from public.places where created_by is null;",
        "",
        "-- 3) Insert Kaggle data",
        "",
    ]

    CHUNK = 500
    for i in range(0, len(rows), CHUNK):
        slice_ = rows[i:i + CHUNK]
        out_lines.append("insert into public.places (id, name, hood, cuisine, dish, lat, lng) values")
        vals = []
        for r in slice_:
            vals.append(
                f"  ({sql_str(r['id'])}, {sql_str(r['name'])}, {sql_str(r['hood'])}, "
                f"{sql_str(r['cuisine'])}, {sql_nullable(r['dish'])}, {r['lat']}, {r['lng']})"
            )
        out_lines.append(",\n".join(vals))
        out_lines.append("on conflict (id) do nothing;")
        out_lines.append("")

    out_path = os.path.join(os.path.dirname(__file__), "bengaluru-places-kaggle.sql")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(out_lines))

    size_kb = os.path.getsize(out_path) / 1024
    print(f"Wrote {out_path}  ({size_kb:,.1f} KB)")
    print("Next: Supabase -> SQL Editor -> New query -> paste -> Run.")


if __name__ == "__main__":
    main()

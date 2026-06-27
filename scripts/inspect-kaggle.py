"""Quick peek at the Kaggle Bengaluru restaurants dataset.
Prints: file list, columns, row count, dtypes, sample rows.
Reads KAGGLE_USERNAME / KAGGLE_KEY from env.
"""
import os, sys, json
import kagglehub
import pandas as pd

DATASET = "mrmars1010/restaurants-dataset-bengaluru"

if not os.environ.get("KAGGLE_USERNAME") or not os.environ.get("KAGGLE_KEY"):
    print("Missing KAGGLE_USERNAME or KAGGLE_KEY env vars", file=sys.stderr)
    sys.exit(1)

print(f"Downloading {DATASET}...")
path = kagglehub.dataset_download(DATASET)
print(f"Downloaded to: {path}\n")

print("Files in dataset:")
for root, _, files in os.walk(path):
    for f in files:
        full = os.path.join(root, f)
        size = os.path.getsize(full)
        print(f"  {full}  ({size:,} bytes)")
print()

# Read each CSV / parquet / xlsx
for root, _, files in os.walk(path):
    for f in files:
        full = os.path.join(root, f)
        try:
            if f.endswith(".csv"):
                df = pd.read_csv(full)
            elif f.endswith(".parquet"):
                df = pd.read_parquet(full)
            elif f.endswith(".xlsx") or f.endswith(".xls"):
                df = pd.read_excel(full)
            elif f.endswith(".json"):
                df = pd.read_json(full)
            else:
                continue
        except Exception as e:
            print(f"--- {f} ---")
            print(f"  read error: {e}\n")
            continue

        print(f"--- {f} ---")
        print(f"  shape: {df.shape}")
        print(f"  columns: {list(df.columns)}")
        print(f"  dtypes:")
        for col, dt in df.dtypes.items():
            sample = df[col].dropna().head(1).tolist()
            sample_str = str(sample[0])[:80] if sample else "(all null)"
            print(f"    {col!r:30}  {str(dt):10}  e.g.  {sample_str}")
        print(f"  first 3 rows as JSON:")
        print(json.dumps(json.loads(df.head(3).to_json(orient="records")), indent=2, default=str)[:2000])
        print()

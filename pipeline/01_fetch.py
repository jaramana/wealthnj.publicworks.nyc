"""Stage 1: download the sources into data-raw/.

National files are streamed and filtered to the configured state or ZIP prefix
on the way in, so the cache holds megabytes instead of gigabytes.
"""

import json
import sys
from datetime import date

import requests

cfg = sys.modules["00_config"]

TIMEOUT = 300


def record_pull(key, filename):
    """Persist each successful fetch, including a partial source-family refresh."""
    stamp = cfg.RAW / "pulled.json"
    pulled = json.loads(stamp.read_text()) if stamp.exists() else {}
    pulled[key] = date.today().isoformat()
    stamp.write_text(json.dumps(pulled, indent=2))
    file_stamp = cfg.RAW / "pulled-files.json"
    files = json.loads(file_stamp.read_text()) if file_stamp.exists() else {}
    files[filename] = pulled[key]
    file_stamp.write_text(json.dumps(files, indent=2))


def seed_file_dates():
    """Carry known dates from the original cache into per-file provenance."""
    stamp = cfg.RAW / "pulled.json"
    pulled = json.loads(stamp.read_text()) if stamp.exists() else {}
    file_stamp = cfg.RAW / "pulled-files.json"
    files = json.loads(file_stamp.read_text()) if file_stamp.exists() else {}
    for path in cfg.RAW.iterdir():
        key = next((k for k in cfg.SOURCES if path.name.startswith(k)), None)
        if key and key in pulled and path.suffix != '.part':
            files.setdefault(path.name, pulled[key])
    file_stamp.write_text(json.dumps(files, indent=2))


def stream_lines(url):
    with requests.get(url, stream=True, timeout=TIMEOUT) as r:
        r.raise_for_status()
        for line in r.iter_lines():
            if line:
                yield line.decode("utf-8")


def fetch_irs(force):
    for year, url in cfg.SOURCES["irs"]["urls"].items():
        out = cfg.RAW / f"irs_{year}_{cfg.CACHE_SUFFIX}.csv"
        if out.exists() and not force:
            continue
        lines = stream_lines(url)
        header = next(lines)
        state_col = [c.upper() for c in header.split(",")].index("STATEFIPS")
        temp = out.with_suffix(out.suffix + ".part")
        with temp.open("w") as f:
            f.write(header + "\n")
            for line in lines:
                if line.split(",", state_col + 1)[state_col].zfill(2) == cfg.STATE_FIPS:
                    f.write(line + "\n")
        temp.replace(out)
        record_pull("irs", out.name)
        print(f"  irs {year}: {out.name}")


def fetch_acs(force):

    # ZCTA rows carry a GEO_ID like 860Z200US10021. NY starts with 1, NJ with 0.

    for table in cfg.SOURCES["acs"]["tables"]:
        out = cfg.RAW / f"acs_{cfg.ACS_YEAR}_{table}_{cfg.CACHE_SUFFIX}.dat"
        if out.exists() and not force:
            continue
        url = f"{cfg.ACS_SF}/acsdt5y{cfg.ACS_YEAR}-{table}.dat"
        lines = stream_lines(url)
        temp = out.with_suffix(out.suffix + ".part")
        with temp.open("w") as f:
            f.write(next(lines) + "\n")
            for line in lines:
                if line.startswith("860Z200US" + ("0" if cfg.REGION == "nj" else "1")):
                    f.write(line + "\n")
        temp.replace(out)
        record_pull("acs", out.name)
        print(f"  acs {table}: {out.name}")


def fetch_socrata(key, out_name, params, force):
    out = cfg.RAW / out_name
    if out.exists() and not force:
        return
    dataset = cfg.SOURCES[key]["dataset_id"]
    r = requests.get(f"{cfg.SOCRATA}/resource/{dataset}.{out_name.rsplit('.', 1)[1]}",
                     params=params, timeout=TIMEOUT)
    r.raise_for_status()
    temp = out.with_suffix(out.suffix + ".part")
    temp.write_bytes(r.content)
    temp.replace(out)
    record_pull(key, out.name)
    print(f"  {key}: {out.name}")


def fetch_sales(force):
    classes = " OR ".join(f"starts_with(building_class_category, '{c}')" for c in cfg.SALES_CLASSES)
    where = (
        f"sale_date >= '{cfg.SALES_YEARS[0]}-01-01' AND sale_date < '{cfg.SALES_YEARS[-1] + 1}-01-01' "
        f"AND ({classes})"
    )
    fetch_socrata("sales", "sales.csv", {
        "$select": "borough, building_class_category, block, lot, zip_code, sale_price, sale_date",
        "$where": where,
        "$limit": 1_000_000,
    }, force)


def run(force=False):
    seed_file_dates()
    fetch_irs(force)
    fetch_acs(force)
    if cfg.REGION == "nj":
        sys.modules["geography"].fetch(force, record_pull)
    else:
        fetch_sales(force)
        fetch_socrata("modzcta", "modzcta.geojson", {"$limit": 1000}, force)
        fetch_socrata("nta", "nta.geojson", {"$limit": 1000}, force)


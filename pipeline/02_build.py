"""Stage 2: build one row per configured ZIP area.

NYC uses Health MODZCTAs with their assigned postal ZIPs and Census ZCTAs.
NJ uses the same-code postal ZIP/ZCTA match from official Census geography.
Both use the same IRS and ACS calculations and publication thresholds.
"""

import json
import sys

import pandas as pd
from shapely.geometry import shape

cfg = sys.modules["00_config"]


# ---- Crosswalk -------------------------------------------------------------

def load_areas():
    if cfg.REGION == "nj":
        return sys.modules["geography"].load_areas()
    features = json.loads((cfg.RAW / "modzcta.geojson").read_text())["features"]
    areas, crosswalk = [], {}
    for f in features:
        p = f["properties"]
        if p["modzcta"] == "99999":
            continue
        zips = {z.strip() for z in f"{p['label']},{p['zcta']}".split(",") if z.strip()}
        zips -= cfg.EXCLUDE_ZCTAS
        for z in zips:
            if z in crosswalk and crosswalk[z] != p["modzcta"]:
                raise ValueError(f"ZIP {z} belongs to more than one MODZCTA")
            crosswalk[z] = p["modzcta"]
        areas.append({"zip": p["modzcta"], "zips": ", ".join(sorted(zips)), "geometry": shape(f["geometry"])})
    return areas, crosswalk


def name_areas(areas):
    """Name each area after the residential NTA that covers most of it.
    Names can repeat. The ZIP is the identifier."""
    if cfg.REGION == "nj":
        return sys.modules["geography"].name_areas(areas)
    ntas = [
        (shape(f["geometry"]), f["properties"])
        for f in json.loads((cfg.RAW / "nta.geojson").read_text())["features"]
        if f["properties"]["ntatype"] == "0"
    ]
    names = {}
    for a in areas:
        _, best = max(((a["geometry"].intersection(g).area, p) for g, p in ntas), key=lambda o: o[0])
        names[a["zip"]] = {"name": best["ntaname"], "borough": best["boroname"]}
    return names


# ---- IRS -------------------------------------------------------------------

def build_irs(crosswalk):
    frames = []
    for year in cfg.IRS_YEARS:
        keep = {"ZIPCODE", "AGI_STUB", *cfg.IRS_FIELDS}
        d = pd.read_csv(cfg.RAW / f"irs_{year}_{cfg.CACHE_SUFFIX}.csv", dtype={"zipcode": str},
                        usecols=lambda c: c.upper() in keep)
        d.columns = [c.upper() for c in d.columns]
        d["zip"] = d["ZIPCODE"].str.zfill(5).map(crosswalk)
        d = d.dropna(subset=["zip"])
        d = d.rename(columns=cfg.IRS_FIELDS)[["zip", "AGI_STUB", *cfg.IRS_FIELDS.values()]]
        d["year"] = year
        frames.append(d)
    irs = pd.concat(frames)
    irs["capital_income"] = irs[["interest", "dividends", "capital_gains"]].sum(axis=1, min_count=3)

    money = ["agi", "wages", "interest", "dividends", "capital_gains", "capital_income",
             "partnership", "property_tax"]
    irs[money] = irs[money] * 1000

    factors = irs.year.map(lambda y: cfg.CPI_U[cfg.ACS_YEAR] / cfg.CPI_U[y])
    irs["agi_real"] = irs.agi * factors
    irs["investment_real"] = irs.capital_income * factors
    real = irs.groupby("zip")[["agi_real", "investment_real"]].sum() / len(cfg.IRS_YEARS)

    # Five tax years pooled: summed dollars over summed returns.

    total = irs.groupby("zip")[["returns", *money]].sum()
    top = irs[irs.AGI_STUB == cfg.IRS_TOP_STUB].groupby("zip")[["returns", "agi", "capital_income"]].sum()
    latest = irs[irs.year == cfg.IRS_YEARS[-1]].groupby("zip")["returns"].sum()

    gains = irs.groupby("year").capital_gains.sum()
    (cfg.BUILD / "gains_by_year.json").write_text(json.dumps({int(y): round(v) for y, v in gains.items()}))

    out = pd.DataFrame(index=total.index)
    out["irs_returns"] = latest
    out["irs_years_available"] = irs.groupby("zip").year.nunique()
    out["irs_agi_per_return"] = total.agi / total.returns
    out["irs_wages_per_return"] = total.wages / total.returns
    out["irs_capital_income_per_return"] = total.capital_income / total.returns
    out["irs_capital_gains_per_return"] = total.capital_gains / total.returns
    out["irs_partnership_per_return"] = total.partnership / total.returns
    out["irs_capital_share_of_agi"] = total.capital_income / total.agi
    out["irs_top_share_of_returns"] = top.returns / total.returns
    out["irs_top_agi_per_return"] = top.agi / top.returns
    out["irs_top_share_of_agi"] = top.agi / total.agi
    out["irs_capital_income_total"] = total.capital_income
    out["irs_returns_total"] = total.returns
    out["irs_agi_annual_2022"] = real.agi_real
    out["irs_investment_annual_2022"] = real.investment_real
    out["irs_returns_annual"] = total.returns / len(cfg.IRS_YEARS)
    return out


# ---- ACS -------------------------------------------------------------------

def read_acs(table):
    """Negative values are Census codes for a missing estimate."""
    d = pd.read_csv(cfg.RAW / f"acs_{cfg.ACS_YEAR}_{table}_{cfg.CACHE_SUFFIX}.dat", sep="|", dtype={"GEO_ID": str})
    d = d.set_index(d.GEO_ID.str[-5:]).drop(columns="GEO_ID")
    d = d.apply(pd.to_numeric, errors="coerce")
    return d.where(d >= 0)


def col(table, n):
    return f"{table.upper()}_E{n:03d}"


def build_acs(crosswalk):
    t = {k: read_acs(k) for k in cfg.SOURCES["acs"]["tables"]}
    k12 = [9, 12, 15, 18, 33, 36, 39, 42]          # private K-12, male then female
    k12_public = [n - 1 for n in k12]

    z = pd.DataFrame(index=t["b19001"].index)
    z["population"] = t["b01003"][col("b01003", 1)]
    z["households"] = t["b19001"][col("b19001", 1)]
    z["households_200k"] = t["b19001"][col("b19001", 17)]
    z["aggregate_income"] = t["b19025"][col("b19025", 1)]
    z["housing_units"] = t["b25002"][col("b25002", 1)]
    z["seasonal_units"] = t["b25004"][col("b25004", 6)]
    z["k12_private"] = t["b14002"][[col("b14002", n) for n in k12]].sum(axis=1, min_count=len(k12))
    z["k12_total"] = z.k12_private + t["b14002"][[col("b14002", n) for n in k12_public]].sum(axis=1, min_count=len(k12))
    z["occupied"] = t["b25003"][col("b25003", 1)]
    z["renters"] = t["b25003"][col("b25003", 3)]
    # A zero-household ZCTA contributes no household income. Missing income
    # with positive/unknown households must stay missing, never become zero.
    z.loc[z.households.eq(0) & z.aggregate_income.isna(), "aggregate_income"] = 0
    z["zip"] = z.index.map(crosswalk)
    assigned = z.dropna(subset=["zip"])
    s = assigned.groupby("zip").sum(min_count=1)
    for field in ["households", "aggregate_income"]:
        incomplete = assigned.groupby("zip")[field].apply(lambda values: values.isna().any())
        s.loc[incomplete, field] = float("nan")

    # A median cannot be summed. Extra ZCTAs in an area are office buildings
    # with few or no households, so the area's own ZCTA supplies the median.

    median = t["b19013"][col("b19013", 1)]
    rent = t["b25064"][col("b25064", 1)]

    out = pd.DataFrame(index=s.index)
    out["acs_population"] = s.population
    out["acs_households"] = s.households
    for table, field in [("b19001", "acs_households_moe"), ("b19025", "acs_aggregate_income_moe")]:
        m = t[table][table.upper() + "_M001"].to_frame("moe")
        m["zip"] = m.index.map(crosswalk)
        out[field] = m.dropna(subset=["zip"]).groupby("zip").moe.apply(
            lambda values: (values.pow(2).sum() ** 0.5) if values.notna().all() else float("nan"))
    out["acs_median_household_income"] = median.reindex(s.index)
    out["acs_median_household_income_moe"] = t["b19013"]["B19013_M001"].reindex(s.index)
    out["acs_mean_household_income"] = s.aggregate_income / s.households
    out["acs_share_households_200k"] = s.households_200k / s.households
    out["acs_seasonal_share_of_units"] = s.seasonal_units / s.housing_units
    out["acs_seasonal_units"] = s.seasonal_units
    out["acs_private_share_k12"] = s.k12_private / s.k12_total
    out["acs_renter_share"] = s.renters / s.occupied
    out["acs_median_gross_rent"] = rent.reindex(s.index)
    return out


# ---- Sales -----------------------------------------------------------------

def build_sales(crosswalk):
    d = pd.read_csv(cfg.RAW / "sales.csv", dtype={"zip_code": str, "block": str, "lot": str})
    d = d[d.sale_price >= cfg.SALES_MIN_PRICE]

    # A portfolio sale lists every unit at the full price. Drop any price that
    # repeats on one block on one day.

    key = ["borough", "block", "sale_date", "sale_price"]
    d = d[~d.duplicated(key, keep=False)]

    d["zip"] = d.zip_code.str.zfill(5).map(crosswalk)
    d = d.dropna(subset=["zip"])
    g = d.groupby("zip").sale_price

    out = pd.DataFrame({
        "sales_count": g.size(),
        "sales_median_price": g.median(),
        "sales_over_5m": g.apply(lambda p: int((p >= 5_000_000).sum())),
    })
    out.loc[out.sales_count < cfg.SALES_MIN_COUNT, "sales_median_price"] = None
    return out


# ---- Assemble --------------------------------------------------------------

def run():
    areas, crosswalk = load_areas()
    names = name_areas(areas)

    table = pd.DataFrame(index=[a["zip"] for a in areas])
    table.index.name = "zip"
    table["name"] = [names[a["zip"]]["name"] for a in areas]
    table[cfg.GROUP_FIELD] = [names[a["zip"]][cfg.GROUP_FIELD] for a in areas]
    if cfg.REGION == "nj":
        for field in ["counties", "municipalities", "nj_land_share"]:
            table[field] = [names[a["zip"]][field] for a in areas]
    table["zips_included"] = [a["zips"] for a in areas]
    table = table.join(build_irs(crosswalk)).join(build_acs(crosswalk))
    if "sales" in cfg.SOURCES:
        table = table.join(build_sales(crosswalk))
    households = table.acs_households.where(table.acs_households > 0)
    table["irs_income_per_household_2022"] = table.irs_agi_annual_2022 / households
    table["irs_investment_share_2022"] = table.irs_investment_annual_2022 / table.irs_agi_annual_2022.where(table.irs_agi_annual_2022 > 0)
    if "sales" in cfg.SOURCES:
        table["sales_count"] = table.sales_count.fillna(0).astype(int)
        table["sales_over_5m"] = table.sales_over_5m.fillna(0).astype(int)

    # Keep low-return areas on the map while withholding their IRS figures.
    # They stay on the map without IRS figures.

    irs_cols = [c for c in table.columns if c.startswith("irs_") and c not in {"irs_returns", "irs_years_available"}]
    table["irs_published"] = (table.irs_returns.fillna(0) >= cfg.MIN_RETURNS) & table.irs_years_available.eq(len(cfg.IRS_YEARS))
    table.loc[~table.irs_published, irs_cols] = None

    # City shares pool the same five years on both sides of the comparison.

    pub = table[table.irs_published]
    table["irs_share_of_city_investment_2022"] = pub.irs_investment_annual_2022 / pub.irs_investment_annual_2022.sum()
    table["irs_share_of_city_capital_income"] = pub.irs_capital_income_total / pub.irs_capital_income_total.sum()
    table["irs_share_of_city_returns"] = pub.irs_returns_total / pub.irs_returns_total.sum()
    table["irs_investment_income_annual"] = table.irs_capital_income_total / len(cfg.IRS_YEARS)
    table = table.drop(columns=["irs_capital_income_total", "irs_returns_total"])

    table.to_csv(cfg.BUILD / "zips.csv")
    (cfg.BUILD / "shapes.json").write_text(json.dumps(
        {a["zip"]: a["geometry"].__geo_interface__ for a in areas}
    ))
    print(f"  {len(table)} areas, {int(table.irs_published.sum())} with IRS figures")

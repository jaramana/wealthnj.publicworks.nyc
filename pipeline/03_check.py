"""Stage 3: check the ZIP table before anything is published.

Each check guards against a silent upstream change. One failure stops the run.
"""

import sys

import pandas as pd

cfg = sys.modules["00_config"]

SHARES = [
    "irs_capital_share_of_agi", "irs_top_share_of_returns", "irs_top_share_of_agi",
    "acs_share_households_200k", "acs_seasonal_share_of_units", "acs_private_share_k12",
    "irs_share_of_city_capital_income", "irs_share_of_city_returns", "acs_renter_share",
]


def run():
    t = pd.read_csv(cfg.BUILD / "zips.csv", dtype={"zip": str, "zips_included": str})
    problems = []

    def check(ok, message):
        if not ok:
            problems.append(message)

    check(cfg.EXPECTED_AREAS[0] <= len(t) <= cfg.EXPECTED_AREAS[1], f"unexpected area count, found {len(t)}")
    check(t.zip.is_unique, "ZIP areas repeat")
    check(t.irs_published.sum() >= cfg.MIN_PUBLISHED, f"only {t.irs_published.sum()} areas have IRS figures")
    check(t.name.notna().all(), "an area has no neighborhood name")
    check(t.acs_population.sum() > cfg.MIN_POPULATION, "mapped population below regional coverage threshold")
    if "sales" in cfg.SOURCES:
        check(t.sales_count.sum() > 100_000, f"only {t.sales_count.sum()} sales")
    check(t.acs_median_household_income.notna().sum() >= cfg.MIN_PUBLISHED, "median income is missing for many areas")
    for field in ["irs_income_per_household_2022", "acs_mean_household_income"]:
        check(t[field].gt(0).sum() >= cfg.MIN_PUBLISHED, f"missing or nonpositive map values: {field}")
    check((t.acs_households.dropna() >= 0).all(), "household denominator must be nonnegative; zero values are withheld")
    check((t.irs_investment_share_2022.dropna().between(0, 1)).all(), "real investment shares outside 0–1")

    for c in SHARES:
        v = t[c].dropna()
        check(((v >= 0) & (v <= 1)).all(), f"{c} falls outside 0-1")

    for c in ["irs_share_of_city_capital_income", "irs_share_of_city_returns", "irs_share_of_city_investment_2022"]:
        check(abs(t[c].sum() - 1) < 0.001, f"{c} does not sum to 1")

    included = {z for zs in t.zips_included for z in zs.split(", ")}
    check(not included & cfg.EXCLUDE_ZCTAS, "a Nassau ZCTA is in the crosswalk")
    if cfg.REGION == "nyc":
        check({"11249", "11211"} <= included, "Williamsburg ZIPs are missing from the crosswalk")
    else:
        check({"08401", "07102", "08102", "08608", "07302"} <= included, "major NJ city ZIPs missing")
        check(t.county.nunique() == 21, "not all 21 counties are represented")
        check(t.nj_land_share.ge(0.5).all(), "area is mostly outside NJ")
    check(t.loc[t.irs_published, "irs_years_available"].eq(len(cfg.IRS_YEARS)).all(), "published ZIP lacks an IRS year")
    check(t.loc[t.acs_households.le(0), "acs_mean_household_income"].isna().all(), "zero-household Census income must be unavailable")

    top = t.irs_top_agi_per_return.dropna()
    check((top >= 200_000).all(), "a top-bracket average is under $200,000")

    if problems:
        raise SystemExit("Checks failed:\n  " + "\n  ".join(problems))
    print(f"  {len(t)} areas pass")

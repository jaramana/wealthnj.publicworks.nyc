# Wealth NJ

[Wealth NJ](https://wealthnj.publicworks.nyc/) is an independent
[publicworks.nyc](https://publicworks.nyc/) map comparing New Jersey income in IRS
tax records and Census Bureau data. Both views show annual averages per Census
household for 2018–2022, in 2022 dollars, on the same dollar scale as
[Wealth NYC](https://wealth.publicworks.nyc/).

## Data sources

| Source | Used for | Period |
| --- | --- | --- |
| [IRS Statistics of Income, ZIP Code Data](https://www.irs.gov/statistics/soi-tax-stats-individual-income-tax-statistics-zip-code-data-soi) | Adjusted gross income and investment income by NJ postal ZIP | Tax years 2018–2022 |
| [Census Bureau ACS summary files](https://www.census.gov/programs-surveys/acs/data/summary-file.html) | Household income, households and research fields | 2018–2022 five-year estimates |
| [BLS CPI-U annual averages](https://www.bls.gov/regions/mid-atlantic/data/consumerpriceindexannualandsemiannual_table.htm) | Inflation adjustment to 2022 dollars | Annual averages, 2018–2022 |
| [Census TIGERweb ACS 2022 ZCTAs](https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2022/MapServer/0) | 2020 ZCTA boundaries, January 2022 vintage | Boundaries |
| [Census 2020 relationship files](https://www.census.gov/geographies/reference-files/2020/geo/relationship-files.html) | NJ selection, county and municipality names | 2020 geography |

Source files were pulled and data built on 2 October 2026. Metadata records exact
URLs, individual pull dates, fields and CPI indexes. Keeping 2018–2022 matches
NYC and the latest ZIP release listed on the IRS source page when checked.

## Method and limits

- The 598 mapped areas cover all 21 counties. ZCTAs qualify when at least half
  their land lies in NJ, using Census county relationship files. Match IRS NJ
  returns to the same five-digit ZCTA code. Preserve leading zeros.
- IRS map field `irs_income_per_household_2022`: multiply each year's AGI
  (`A00100` × 1,000) by CPI-U 2022 ÷ CPI-U year, average the five annual totals,
  then divide by the ZCTA's ACS household count. Returns are not linked to
  households.
- Census map field `acs_mean_household_income`: divide `B19025` aggregate
  household income by `B19001` households. These are means in published 2022
  dollars; no second inflation adjustment or division by five.
- Investment income is taxable interest + ordinary dividends + net capital
  gains. Adjust each year and average, then divide by adjusted AGI for its
  income share or by all published mapped totals for its state share.
- IRS figures require at least 1,000 returns in 2022 and all five tax years.
  503 areas qualify. This site rule also withholds small residential ZIPs; it is
  not an IRS confidentiality rule. 11 areas have no estimated households.
  Census means are unavailable in 26 areas, including zero-household areas and
  suppressed/missing income estimates. Missing and withheld values stay blank.
- PO-box and unique ZIPs without ZCTA polygons are not mapped or redistributed.
  ACS covers whole ZCTAs; IRS covers NJ-filed returns. A future boundary refresh
  can create cross-state areas; `nj_land_share` records that mismatch. No current
  selected ZCTA has a measurable cross-state land overlap in the relationship file.
- Municipality and county labels use the largest land overlap. Search includes
  other intersecting NJ municipalities and counties. These are ZIP-area income
  estimates, not municipal or county estimates.
- Means are not typical household incomes. AGI and ACS use different income
  definitions, addresses and coverage; subtraction does not measure missing
  income or wealth. Unsold appreciation and complete net worth are not measured.
- Survey estimates have sampling error, amplified by small denominators.
  Downloads include 90% margins for household counts and aggregate income.
- Stack height is linear: $1.2m corresponds to 8,500 map meters. Shared colors
  stop at $0, $100k, $300k and $1.2m; the brightest shade also covers larger
  values. Height keeps rising. Legacy IRS research fields and the concentration
  chart use nominal dollars; new real-dollar fields end in `_2022`.

NYC property transactions have no equivalent in this build. NJ includes all
comparable IRS/ACS research fields; it does not copy NYC sales into NJ downloads.
The [Data page](https://wealthnj.publicworks.nyc/data.html) provides calculations,
limits, downloads, a sortable table and the field guide.

## Updates

The pipeline runs manually with no scheduled refresh. Use Python 3.11 or newer:

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python run.py
```

National IRS and ACS files stream into NJ-only caches; Census relationships are
national. Boundaries are fetched in bounded batches with complete-code checks.
Caches and build intermediates are ignored. To refresh, verify releases, update
`pipeline/00_config.py` and run `.venv/bin/python run.py --force-fetch`.
Rebuilds preserve source pull dates. Checks run before export, including with
`--stage 4`.

Preview the static website:

```sh
python3 -m http.server 8793 --directory docs --bind 127.0.0.1
```

GitHub Pages publishes `main` → `/docs`. `docs/CNAME` specifies
`wealthnj.publicworks.nyc`; add a DNS CNAME for `wealthnj` pointing to
`jaramana.github.io`. The site has no build step. `.nojekyll` serves files
unchanged.

## Tools

Python, pandas, requests and Shapely for data; static HTML/CSS/JavaScript and
bundled MapLibre GL JS 4.7.1 for the website. Limelight is self-hosted with its
OFL license. No accounts or analytics. Claude and Codex were used in development.
Python dependencies are pinned to the versions used for validation.

## Verification

Run `.venv/bin/python tests/check_data.py` after building. It independently
reproduces IRS and Census values from the cached source rows, inflation,
denominators, margins, withholding, concentration and statewide shares. It
checks all download fields, leading zeros, major cities and all 21 counties.

For Chrome tests, install `puppeteer-core` in a temporary tools folder, set
`PUPPETEER_MODULE` and `CHROME_PATH`, serve the site on port 8793, and run:

```sh
QA_URL=http://127.0.0.1:8793 node tests/check_ui.cjs
```

Set `QA_OUTPUT` for screenshots. The same suite runs on NYC: search, source
switching, selection, camera controls, fixed height scale, URL state, table,
downloads, phone layouts, reduced motion and the map-library fallback.

Run `python3 tests/check_parity.py ../wealth.publicworks.nyc` after shared edits.
See `REVIEW.md` for methodology, findings and validation limits.

## License and reuse

Code is [BSD 3-Clause licensed](LICENSE). Source data retain their publishers'
terms. Include measure, unit, years, geography, publisher and method with reused
figures. The Data page offers CSV, GeoJSON and metadata.

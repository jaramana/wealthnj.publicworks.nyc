# Wealth NYC and Wealth NJ review

Reviewed and built 2 October 2026. Scope: NYC content, calculations, downloads,
interface and code; a statewide NJ implementation with the same comparison.

## Changes made in both projects

- Missing ACS income is preserved when an area has households. A zero-household
  ZCTA contributes zero aggregate household income; unknown positive-household
  income is not treated as zero. Independent regression cases cover both.
- IRS publication requires all five tax years as well as 1,000 latest-year
  returns. This is a site comparison rule, not an IRS confidentiality threshold.
- Downloads include household-count and aggregate-income 90% margins. NYC
  combines ZCTA margins by root-sum-square, an approximation ignoring covariance.
  A map mean has uncertainty in numerator and denominator; these margins alone
  are not a confidence interval for the ratio.
- The concentration chart selects the leading group in a per-return income
  ranking. It is not the fewest possible areas needed to reach half of dollars.
  Its bottom-half metadata now counts half of published areas, excluding blanks.
- Missing values have a separate legend key. Colors saturate at $1.2m while
  heights continue linearly; the endpoint says $1.2m+.
- Decimal rounding created invalid polygons in two NYC and four NJ areas.
  Export repairs these small intersections and rejects repairs changing more
  than 0.1% of polygon area. Download checks validate every published geometry.
- Calculation, formatting, search, map, roof outlines, styling and browser/data
  tests are shared byte for byte. Region configuration contains names, geography,
  search fields, camera framing and source/coverage settings. A parity check
  compares 17 shared files between the repositories.
- Source dates survive rebuilds. Direct `--stage 4` export also runs checks.
  Dependencies are pinned to the versions used for the build. Canonical and
  basic sharing metadata, date formatting and mobile instructions were cleaned up.

All existing NYC field values match the preceding published dataset. The new
release adds margins/year-availability metadata and repairs two boundaries.
The approved full-screen phone card, rotation controls and two-source comparison
remain intact. No extra map layer or map comparison was introduced.

## New Jersey coverage

598 majority-NJ-land 2020 Census ZCTAs, using January 2022 TIGERweb boundaries
and official ZCTA/county/county-subdivision relationships. All 21 counties and
Atlantic City, Newark, Jersey City, Camden and Trenton are represented. Labels
use the NJ municipality/county with the largest land overlap. Search also
matches other intersecting municipalities and counties.

503 areas meet the IRS rule. 42 have fewer than 1,000 latest-year returns and
53 have no same-code IRS records. 11 areas have zero estimated households;
Census means are unavailable in 26 areas. Remaining missing Census means reflect
suppressed or absent income, rather than zero income. NJ has about 3.44 million
estimated households across the selected ZCTAs.

The published IRS areas cover 99.1% of official NJ 2022 returns and 98.9% of
reported AGI. These are latest-year coverage figures, not pooled investment
shares. The metadata reproduces them against the IRS state-total row.

Postal ZIPs and ZCTAs are approximate matches. PO-box and unique ZIPs without
polygons are excluded, with no redistribution. ACS covers whole ZCTAs; IRS is
filtered to NJ returns. Land-share metadata records cross-state differences;
none of the current selected ZCTAs has measurable non-NJ land in the 2020
relationship file. Labels are not municipal statistics. The rural/small-ZIP
publication rule hides some residential areas and is documented accordingly.

NYC uses modified ZIP areas with combined postal ZIPs; NJ uses individual
Census ZCTAs. Methods and dollar scales are comparable, but geography is not
identical. NYC's property-sales research fields remain NYC-only. No NJ sales
measure has been fabricated to fill that difference.

## Findings supported by the new build

All map figures below are annual averages per ACS household, in 2022 dollars.
They can be reproduced with `tests/check_data.py` from cached source rows.

| NJ ZIP | Principal municipality | IRS | Census Bureau |
| --- | --- | ---: | ---: |
| 08401 | Atlantic City | $38,358 | $56,233 |
| 07078 | Millburn (includes Short Hills) | $1,247,979 | $486,153 |
| 07931 | Bedminster | $1,042,418 | $324,203 |
| 07760 | Rumson | $722,525 | $356,022 |

The tax map's highest peaks exceed Census averages, while Atlantic City's tax
estimate is lower. Neither pattern identifies missing income. Capital gains,
income definitions, filing addresses, nonfilers and survey coverage all differ.
Income measures do not establish net worth, asset ownership or unrealized gains.

The original NYC findings and published numbers are preserved. The difference
between IRS and ACS should continue to be presented as a comparison of accounts,
without attributing the entire gap to investment income or wealth.

## Validation and remaining limits

Independent source checks passed for every IRS/Census value, inflation factor,
household denominator, missing/withheld value, margin, concentration share,
regional share, leading-zero ZIP and CSV/GeoJSON field. Regression cases passed
for missing income and household counts. Shared-code parity passed.

Chrome checks passed for both sites: map render, search, single selection,
stable cards across source switching, fixed heights, desktop rotation and North,
zoom, URL state, filters, sorting, downloads, 320/375/390/768px layouts, reduced
motion and map-library failure fallback. Final layouts also passed automated
axe WCAG 2 A/AA and 2.1 AA checks, 320×568 essential figures, focus containment
and Escape return. Browser checks use software WebGL; physical iPhone Safari and
hardware rendering still need human review. Automated checks are not an
accessibility certification.

The stylesheet retains historical overrides. Consolidating it was deferred
because it would risk the approved layouts while adding little to this release.
Averages remain sensitive to large incomes and uncertain small denominators.
The shared 2018–2022 window provides parity, not a current-year estimate. IRS's
ZIP source page still listed 2022 as its latest available year when checked.

Sources: [IRS ZIP releases](https://www.irs.gov/statistics/soi-tax-stats-individual-income-tax-statistics-zip-code-data-soi),
[Census ZCTA definition](https://www.census.gov/programs-surveys/geography/guidance/geo-areas/zctas.html),
[Census relationships](https://www.census.gov/geographies/reference-files/2020/geo/relationship-files.html).

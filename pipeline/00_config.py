"""Wealth NJ: statewide sources and publication settings."""
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / 'data-raw'
BUILD = ROOT / 'build'
DOCS = ROOT / 'docs'
SITE_DATA = DOCS / 'data'
for directory in (RAW, BUILD): directory.mkdir(parents=True, exist_ok=True)
REGION = 'nj'
STATE_FIPS = '34'
CACHE_SUFFIX = 'nj'
GROUP_FIELD = 'county'
DATA_STEM = 'wealth-nj-zip'
IRS_YEARS = [2018, 2019, 2020, 2021, 2022]
ACS_YEAR = 2022
IRS_TOP_STUB = 6
MIN_RETURNS = 1000
EXCLUDE_ZCTAS = set()
EXPECTED_AREAS = (580, 650)
MIN_PUBLISHED = 400
MIN_POPULATION = 8_500_000
CPI_U = {2018: 251.107, 2019: 255.657, 2020: 258.811, 2021: 270.97, 2022: 292.655}
CPI_SOURCE = 'https://www.bls.gov/regions/mid-atlantic/data/consumerpriceindexannualandsemiannual_table.htm'
CPI_VERIFIED = '2026-09-29'
IRS_FIELDS = {'N1': 'returns', 'A00100': 'agi', 'A00200': 'wages', 'A00300': 'interest', 'A00600': 'dividends', 'A01000': 'capital_gains', 'A26270': 'partnership', 'A18500': 'property_tax', 'N01000': 'n_capital_gains'}
ACS_SF = 'https://www2.census.gov/programs-surveys/acs/summary_file/2022/table-based-SF/data/5YRData'
SOURCES = {'irs': {'publisher': 'Internal Revenue Service, Statistics of Income', 'title': 'Individual Income Tax Statistics, ZIP Code Data', 'page': 'https://www.irs.gov/statistics/soi-tax-stats-individual-income-tax-statistics-zip-code-data-soi', 'urls': {2018: 'https://www.irs.gov/pub/irs-soi/18zpallagi.csv', 2019: 'https://www.irs.gov/pub/irs-soi/19zpallagi.csv', 2020: 'https://www.irs.gov/pub/irs-soi/20zpallagi.csv', 2021: 'https://www.irs.gov/pub/irs-soi/21zpallagi.csv', 2022: 'https://www.irs.gov/pub/irs-soi/22zpallagi.csv'}, 'covers': 'Tax years 2018-2022'}, 'acs': {'publisher': 'U.S. Census Bureau', 'title': 'American Community Survey 5-year estimates, 2018-2022', 'page': 'https://www.census.gov/programs-surveys/acs/data/summary-file.html', 'tables': {'b01003': 'Total population', 'b19001': 'Household income in the past 12 months', 'b19013': 'Median household income', 'b19025': 'Aggregate household income', 'b25002': 'Occupancy status', 'b25004': 'Vacancy status', 'b14002': 'School enrollment by level and type of school', 'b25003': 'Tenure', 'b25064': 'Median gross rent'}, 'covers': 'Survey years 2018-2022'}, 'zcta': {'publisher': 'U.S. Census Bureau', 'title': '2020 ZIP Code Tabulation Areas, ACS 2022 boundary service', 'page': 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2022/MapServer/0', 'covers': '2020 ZCTAs, January 2022 boundary vintage'}, 'relationships': {'publisher': 'U.S. Census Bureau', 'title': '2020 ZCTA to County and County Subdivision Relationships', 'page': 'https://www.census.gov/geographies/reference-files/2020/geo/relationship-files.html', 'covers': '2020 geography'}}

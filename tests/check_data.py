"""Independently reproduce regional downloads from raw CSV/DAT records."""
from shapely.geometry import shape
import csv
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'docs/data'
site = json.loads((ROOT / 'docs/js/site-config.js').read_text().removeprefix('export const site = ').strip().removesuffix(';'))
nj = site['shortName'] == 'NJ'
rows = list(csv.DictReader((DATA / (site['dataStem'] + '.csv')).open()))
meta = json.loads((DATA / 'meta.json').read_text())
features = json.loads((DATA / (site['dataStem'] + '.geojson')).read_text())['features']
assert len(rows) == len(features) == meta['region']['areas']
lookup = {}
for r in rows:
    assert len(r['zip']) == 5 and r['zip'].isdigit()
    for z in r['zips_included'].split(', '):
        assert len(z) == 5 and z.isdigit(), ('Leading zero lost', z)
        assert z not in lookup
        assert z not in meta['coverage']['excluded_zctas'] and z not in {'00000', '99999'}
        lookup[z] = r['zip']

cpi = {2018: 251.107, 2019: 255.657, 2020: 258.811, 2021: 270.970, 2022: 292.655}
assert meta['comparison']['inflation']['annual_indexes'] == {str(k): v for k, v in cpi.items()}
raw = defaultdict(lambda: {'agi': 0., 'investment': 0., 'nominal': 0., 'returns': 0., 'latest': 0., 'years': set()})
for year in meta['years']['irs']:
    for d in csv.DictReader((ROOT / 'data-raw' / f'irs_{year}_{"nj" if nj else "ny"}.csv').open()):
        d = {k.upper(): v for k, v in d.items()}
        z = lookup.get(d['ZIPCODE'].zfill(5))
        if not z: continue
        assert d['STATEFIPS'].zfill(2) == ('34' if nj else '36')
        v = raw[z]; investment = sum(float(d[k]) for k in ['A00300', 'A00600', 'A01000']) * 1000
        v['agi'] += float(d['A00100']) * 1000 * cpi[2022] / cpi[year] / 5
        v['investment'] += investment * cpi[2022] / cpi[year] / 5
        v['nominal'] += investment
        v['returns'] += float(d['N1'])
        if year == 2022: v['latest'] += float(d['N1'])
        v['years'].add(year)
acs = {}
for table in ['b19001', 'b19025']:
    acs[table] = {d['GEO_ID'][-5:]: d for d in csv.DictReader((ROOT / 'data-raw' / f'acs_2022_{table}_{"nj" if nj else "ny"}.dat').open(), delimiter='|')}

def estimate(table, z, measure='E'):
    d = acs[table].get(z, {})
    value = d.get(table.upper() + '_' + measure + '001')
    return float(value) if value and float(value) >= 0 else None

def close(actual, expected, tolerance=.51):
    if expected is None: assert actual == '', actual
    else: assert actual != '' and abs(float(actual) - expected) <= tolerance, (actual, expected)

for r, f in zip(rows, features):
    assert r['zip'] == f['properties']['zip']
    assert shape(f['geometry']).is_valid and not shape(f['geometry']).is_empty, ('Invalid boundary', r['zip'])
    for field in meta['fields']:
        value, actual = f['properties'][field['column']], r[field['column']]
        if value is None: assert actual == ''
        elif field['unit'] in ('dollars', 'count', 'share'): assert float(actual) == value
        else: assert actual == value
    z = r['zip']; v = raw[z]; codes = r['zips_included'].split(', ')
    hh = [estimate('b19001', c) for c in codes if c in acs['b19001']]
    households = sum(hh) if hh and all(h is not None for h in hh) else None
    income = [0. if estimate('b19001', c) == 0 and estimate('b19025', c) is None else estimate('b19025', c) for c in codes if c in acs['b19001']]
    total_income = sum(income) if income and all(i is not None for i in income) else None
    close(r['acs_households'], households)
    close(r['acs_mean_household_income'], total_income / households if total_income is not None and households else None)
    for table, field in [('b19001', 'acs_households_moe'), ('b19025', 'acs_aggregate_income_moe')]:
        margins = [estimate(table, c, 'M') for c in codes if c in acs[table]]
        close(r[field], sum(m*m for m in margins) ** .5 if margins and all(m is not None for m in margins) else None)
    published = v['latest'] >= 1000 and len(v['years']) == 5
    close(r['irs_years_available'], len(v['years']) if v['years'] else None)
    if published:
        close(r['irs_capital_income_per_return'], v['nominal'] / v['returns'])
        close(r['irs_income_per_household_2022'], v['agi'] / households if households else None)
        close(r['irs_agi_annual_2022'], v['agi'])
        close(r['irs_investment_annual_2022'], v['investment'])
        close(r['irs_returns_annual'], v['returns'] / 5)
        close(r['irs_investment_share_2022'], v['investment'] / v['agi'], .000051)
    else:
        for field in [f['column'] for f in meta['fields'] if f['column'].startswith('irs_') and f['column'] not in {'irs_returns','irs_years_available'}]: assert r[field] == '', (z, field)

published = [r for r in rows if r['irs_agi_annual_2022']]
real_total = sum(raw[r['zip']]['investment'] for r in published)
for r in published: close(r[site['shareField']], raw[r['zip']]['investment'] / real_total, .000051)
# Rounded published shares may accumulate half a rounding unit per area.
assert abs(sum(float(r[site['shareField']]) for r in published) - 1) <= len(published) * .00005
ranked = sorted(published, key=lambda r: raw[r['zip']]['nominal'] / raw[r['zip']]['returns'], reverse=True)
all_dollars = sum(raw[r['zip']]['nominal'] for r in ranked); all_returns = sum(raw[r['zip']]['returns'] for r in ranked)
dollars = returns = 0
for n, r in enumerate(ranked, 1):
    dollars += raw[r['zip']]['nominal']; returns += raw[r['zip']]['returns']
    if dollars / all_dollars >= .5: break
assert n == meta['region']['top_areas']
close(meta['region']['top_capital_share'], dollars / all_dollars, .000051)
close(meta['region']['top_returns_share'], returns / all_returns, .000051)
if nj:
    assert len({r['county'] for r in rows}) == 21
    assert {'08401','07102','08102','08608','07302'} <= {r['zip'] for r in rows}
    assert all(float(r['nj_land_share']) >= .5 for r in rows)
else: assert {'11211','11249'} <= lookup.keys()
print(f'PASS: {site["name"]}: {len(rows)} areas, {len(published)} published IRS areas; independent source totals, inflation, denominators, missing/withheld values, margins, leading zeros, download parity, regional and concentration shares.')

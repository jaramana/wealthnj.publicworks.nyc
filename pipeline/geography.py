"""Official 2020 Census ZCTA relationships and ACS 2022 boundary service."""
import json
import sys
import pandas as pd
import requests
from shapely.geometry import shape
cfg = sys.modules['00_config']
BASE = 'https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520'
SERVICE = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2022/MapServer/0/query'


def relationships(kind):
    return pd.read_csv(cfg.RAW / f'zcta_{kind}.txt', sep='|', dtype=str, encoding='utf-8-sig').dropna(subset=['GEOID_ZCTA5_20'])


def selected_codes():
    d = relationships('county')
    d['land'] = pd.to_numeric(d.AREALAND_PART)
    totals = d.groupby('GEOID_ZCTA5_20').land.sum()
    nj = d[d.GEOID_COUNTY_20.str.startswith('34')].groupby('GEOID_ZCTA5_20').land.sum()
    return set(nj[nj / totals >= 0.5].index)


def fetch(force, record_pull):
    for kind in ['county', 'cousub']:
        out = cfg.RAW / f'zcta_{kind}.txt'
        if out.exists() and not force: continue
        r = requests.get(f'{BASE}/tab20_zcta520_{kind}20_natl.txt', timeout=300)
        r.raise_for_status()
        temp = out.with_suffix('.part');temp.write_bytes(r.content);temp.replace(out)
        record_pull('relationships', out.name)
    out = cfg.RAW / 'zcta.geojson'
    if out.exists() and not force: return
    features = []
    codes = sorted(selected_codes())
    for i in range(0, len(codes), 80):
        quoted = ','.join("'" + code + "'" for code in codes[i:i+80])
        r = requests.get(SERVICE, params={'where': f'ZCTA5 IN ({quoted})', 'outFields': 'ZCTA5', 'outSR': 4326,
             'returnGeometry': 'true', 'geometryPrecision': 6, 'f': 'geojson'}, timeout=300)
        r.raise_for_status(); data = r.json()
        if data.get('error') or data.get('exceededTransferLimit'): raise ValueError(data)
        features.extend(data['features'])
        print(f'  zcta boundaries: {len(features)}/{len(codes)}', flush=True)
    if {f['properties']['ZCTA5'] for f in features} != set(codes): raise ValueError('Boundary coverage differs from relationship selection')
    temp = out.with_suffix('.part');temp.write_text(json.dumps({'type':'FeatureCollection','features':features}));temp.replace(out)
    record_pull('zcta', out.name)


def load_areas():
    features = json.loads((cfg.RAW / 'zcta.geojson').read_text())['features']
    areas = [{'zip': f['properties']['ZCTA5'], 'zips': f['properties']['ZCTA5'], 'geometry': shape(f['geometry'])}
             for f in sorted(features, key=lambda f: f['properties']['ZCTA5'])]
    return areas, {a['zip']: a['zip'] for a in areas}


def name_areas(areas):
    county, municipality = relationships('county'), relationships('cousub')
    for d in [county, municipality]: d['land'] = pd.to_numeric(d.AREALAND_PART)
    names = {}
    for a in areas:
        c = county[county.GEOID_ZCTA5_20.eq(a['zip'])]
        nj = c[c.GEOID_COUNTY_20.str.startswith('34') & c.land.gt(0)].sort_values('land', ascending=False)
        m = municipality[municipality.GEOID_ZCTA5_20.eq(a['zip']) & municipality.GEOID_COUSUB_20.str.startswith('34') & municipality.land.gt(0)].sort_values('land', ascending=False)
        def clean(s):
            for suffix in [' city', ' township', ' borough', ' town', ' village']: s = s.removesuffix(suffix)
            return s
        names[a['zip']] = {'name': clean(m.iloc[0].NAMELSAD_COUSUB_20), 'county': nj.iloc[0].NAMELSAD_COUNTY_20,
          'counties': ', '.join(nj.NAMELSAD_COUNTY_20.unique()),
          'municipalities': ', '.join(dict.fromkeys(clean(s) for s in m.NAMELSAD_COUSUB_20)),
          'nj_land_share': nj.land.sum() / c.land.sum()}
    return names

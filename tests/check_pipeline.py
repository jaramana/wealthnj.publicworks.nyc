"""Regression: missing income for households must not become a zero estimate."""
import importlib.util
import sys
from pathlib import Path
import pandas as pd
ROOT = Path(__file__).resolve().parents[1]

def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'pipeline' / (name + '.py'))
    module = importlib.util.module_from_spec(spec);sys.modules[name] = module;spec.loader.exec_module(module)
    return module

cfg = load('00_config'); build = load('02_build')
source_tables = {table: build.read_acs(table) for table in cfg.SOURCES['acs']['tables']}
codes = source_tables['b19001'].index[source_tables['b19001'].B19001_E001.gt(0)][:2]
assert len(codes) == 2

def scenario(second_households, second_income):
    tables = {k: v.copy() for k,v in source_tables.items()}
    tables['b19001']['B19001_E001'] = tables['b19001']['B19001_E001'].astype(float)
    tables['b19001'].loc[codes, 'B19001_E001'] = [1, second_households]
    tables['b19025'].loc[codes, 'B19025_E001'] = [100, second_income]
    build.read_acs = lambda table: tables[table]
    return build.build_acs({code: 'test' for code in codes}).loc['test']

assert scenario(1, 200).acs_mean_household_income == 150
assert pd.isna(scenario(1, float('nan')).acs_mean_household_income)
assert scenario(0, float('nan')).acs_mean_household_income == 100
assert pd.isna(scenario(float('nan'), 200).acs_mean_household_income)
print('PASS: complete income aggregation, positive-household missing income, zero-household areas, and missing household denominator.')

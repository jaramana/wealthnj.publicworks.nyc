"""Check the shared code contract across the sibling Wealth projects."""
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
OTHER = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT.parent / ('wealth.publicworks.nyc' if ROOT.name.startswith('wealthnj') else 'wealthnj.publicworks.nyc')
SHARED = ['docs/css/site.css', 'docs/js/common.js', 'docs/js/map.js', 'docs/js/data.js',
          'docs/js/roof-outlines.js', 'docs/vendor/maplibre-gl.js', 'docs/vendor/maplibre-gl.css',
          'pipeline/01_fetch.py', 'pipeline/02_build.py', 'pipeline/03_check.py', 'pipeline/04_export.py',
          'run.py', 'requirements.txt', 'tests/check_data.py', 'tests/check_pipeline.py', 'tests/check_ui.cjs', 'tests/check_parity.py']
for file in SHARED:
    assert (ROOT / file).read_bytes() == (OTHER / file).read_bytes(), f'Shared code diverged: {file}'
print(f'PASS: {len(SHARED)} shared files match between {ROOT.name} and {OTHER.name}.')

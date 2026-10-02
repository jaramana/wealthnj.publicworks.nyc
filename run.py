#!/usr/bin/env python3
"""Wealth NYC (wealth.publicworks.nyc): build everything.

    python run.py                 fetch what is missing, then build, check, export
    python run.py --force-fetch   download every source again
    python run.py --stage 2       run one stage on its own

The check stage runs before export. If a check fails, export does not run and
the published files stay as they are.
"""

import argparse
import importlib.util
import sys
import time
from pathlib import Path

PIPELINE = Path(__file__).resolve().parent / "pipeline"

STAGES = [
    (1, "01_fetch", "fetch sources"),
    (2, "02_build", "build the ZIP table"),
    (3, "03_check", "check the ZIP table"),
    (4, "04_export", "write the site data and downloads"),
]


def load(name):
    """Import a stage by path, because numbered file names are not importable."""
    spec = importlib.util.spec_from_file_location(name, PIPELINE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--force-fetch", action="store_true")
    parser.add_argument("--stage", type=int, choices=[s[0] for s in STAGES])
    args = parser.parse_args()

    cfg = load("00_config")
    if cfg.REGION == "nj":
        load("geography")
    if args.stage == 4:
        load("03_check").run()
    for number, name, label in STAGES:
        if args.stage and number != args.stage:
            continue
        start = time.time()
        print(f"[{number}] {label}")
        module = load(name)
        if number == 1:
            module.run(force=args.force_fetch)
        else:
            module.run()
        print(f"    done in {time.time() - start:.1f}s")


if __name__ == "__main__":
    main()

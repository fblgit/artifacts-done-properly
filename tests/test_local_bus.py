"""Discover the bus tests shipped alongside the skill script."""
from pathlib import Path
import runpy

tests = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'skill/scripts/tests/test_bus.py'))
FormatTests = tests['FormatTests']
BusTests = tests['BusTests']

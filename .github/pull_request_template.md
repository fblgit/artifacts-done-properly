## What and why

## Checks

- [ ] `ruff check .`
- [ ] `python3 -m unittest discover -s tests -v`
- [ ] `python3 tools/package.py --check` and `python3 tools/check_catalog.py`
- [ ] If a file under `skill/catalog/` changed: its `catalog.json` entry has the new `version`, `changed`, `sha256`, `bytes` and `hash`

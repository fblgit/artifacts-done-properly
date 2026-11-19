## What and why

## Checks

- [ ] `ruff check .`
- [ ] `python3 -m unittest discover -s tests -v`
- [ ] `python3 tools/package.py --check` and `python3 plugins/artifacts-done-properly/skills/adp/scripts/adp_catalog.py`
- [ ] If a file under `plugins/artifacts-done-properly/skills/adp/catalog/` changed: its `catalog.json` entry has the new `version`, `changed`, `sha256`, `bytes` and `hash`

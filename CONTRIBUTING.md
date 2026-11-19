# Contributing

Thanks for helping. Participation is covered by the
[Code of Conduct](CODE_OF_CONDUCT.md). Report vulnerabilities as described in
[SECURITY.md](SECURITY.md), not in a public issue.

## Set up

    pip install pre-commit && pre-commit install

This installs the commit and push hooks from `.pre-commit-config.yaml`: ruff,
SKILL.md frontmatter validation, the catalog sha256 check and the catalog
entry header check on commit, and gitleaks and the catalog roundtrip
(`python3 -I tools/roundtrip.py`, about 9 s, needs node for two checks) on push.

## Run the checks as CI does

CI (`.github/workflows/ci.yml`) runs these on Python 3.12:

    pip install ruff==0.9.9 && ruff check .
    python3 -m unittest discover -s tests -v
    python3 tools/package.py --check
    python3 plugins/artifacts-done-properly/skills/adp/scripts/adp_catalog.py
    python3 -I tools/roundtrip.py --require-node
    python3 tools/package.py

Ruff uses `ruff.toml` (pyflakes errors only). CI also runs gitleaks over the
full history (its config is inline in `ci.yml` and in the pre-push hook). The catalog entry headers are checked locally with
`python3 plugins/artifacts-done-properly/skills/adp/scripts/adp_catalog.py headers` (the pre-commit hook `catalog-headers`).

To try a page in a browser without claude.ai, run `python3 plugins/artifacts-done-properly/skills/adp/scripts/adp.py dev serve DIR` (docs/assist.md, "Local emulator").

## Editing the catalog

If you edit a file under `plugins/artifacts-done-properly/skills/adp/catalog/`, update its entry in
`plugins/artifacts-done-properly/skills/adp/catalog/catalog.json` in the same change: `version`, `changed`, and each
touched file's `sha256` and `bytes`, then the entry `hash` (first 12 hex of the
SHA-256 of the sorted `path=sha256` lines joined with newlines).
`python3 plugins/artifacts-done-properly/skills/adp/scripts/adp_catalog.py` fails until they match. The header comment in
the entry's main file follows `docs/catalog-header.md`.

## Pull requests

- Keep a change focused on one thing.
- Run the checks above before opening the PR.
- Releases are described in `docs/RELEASING.md`.

By contributing you agree your work is licensed under the Apache License 2.0
(see `LICENSE`).

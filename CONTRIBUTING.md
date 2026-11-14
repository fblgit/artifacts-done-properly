# Contributing

Thanks for helping. Participation is covered by the
[Code of Conduct](CODE_OF_CONDUCT.md). Report vulnerabilities as described in
[SECURITY.md](SECURITY.md), not in a public issue.

## Set up

    pip install pre-commit && pre-commit install

This installs the commit and push hooks from `.pre-commit-config.yaml`: ruff,
SKILL.md frontmatter validation, the catalog check and the catalog
entry header check on commit, and gitleaks on push.

## Run the checks as CI does

CI (`.github/workflows/ci.yml`) runs these on Python 3.12:

    pip install ruff==0.9.9 && ruff check .
    python3 -m unittest discover -s tests -v
    python3 tools/package.py --check
    python3 tools/check_catalog.py
    python3 -I skill/scripts/adp.py index --check
    python3 tools/package.py

Ruff uses `ruff.toml` (pyflakes errors only). CI also runs gitleaks over the
full history. The catalog entry headers are checked locally with
`python3 tools/check_headers.py` (the pre-commit hook `catalog-headers`).

To try a page in a browser without claude.ai, run `python3 skill/scripts/adp.py dev serve DIR` (docs/assist.md, "Local emulator").

## Editing the catalog

The header comment of an entry's main file is the only description of the
entry (`docs/catalog-header.md`). `skill/catalog/catalog.json` is an index
built from the headers: never edit it by hand. After a change under
`skill/catalog/kit/`, follow "Add or change an entry" there: update the header
(`@version`, `@changed`), run `python3 -I skill/scripts/adp.py index` and commit
the files with the new `catalog.json`. `python3 tools/check_catalog.py` and
`python3 tools/check_headers.py` fail on a stale index and on a header that
breaks a rule.

## Pull requests

- Keep a change focused on one thing.
- Run the checks above before opening the PR.
- Releases are described in `docs/RELEASING.md`.

By contributing you agree your work is licensed under the Apache License 2.0
(see `LICENSE`).

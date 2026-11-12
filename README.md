# Artifacts Done Properly (ADP) v2.0

## Development

`pip install pre-commit && pre-commit install` runs on every commit: gitleaks (secrets), ruff (pyflakes errors), SKILL.md frontmatter validation and the catalog sha256 check. CI runs the same checks, plus the unit tests and the bundle build. See `docs/RELEASING.md` for releases.

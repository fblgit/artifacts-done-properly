# Release checklist: first public release v2.0.0

Owner = needs the repository owner. Claude = can be done by Claude on request.
`skill/SKILL.md` already has `metadata.version: "2.0.0"`, so no version bump is needed.

1. [Claude] Resolve the audit findings marked blocker (see the audit report), then re-run `python3 tools/package.py --check`, `python3 tools/check_catalog.py` and the unit tests.
2. [Owner] Decide whether the catalog's published artifact URL (`skill/catalog/catalog.json`, `skill/catalog/index.html`) and the "YouTuner" / "eventhub plugin" / "this session" source labels may be public. The catalog files are byte-exact copies and cannot be edited.
3. [Owner] Choose a license (common options: MIT, Apache-2.0, BSD-3-Clause, MPL-2.0, GPL-3.0, AGPL-3.0). Also decide the licensing of the catalog content.
4. [Claude] Add `LICENSE` (and the license line in `README.md`) once the owner has chosen. Optionally add SECURITY.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, issue and PR templates, dependabot config.
5. [Owner] Review the two allowlisted fake values in `.gitleaks.toml` and confirm the author identities in the history are acceptable to publish.
6. [Owner] Merge PR #1 (`build-skill-ci`) into `main` after CI is green.
7. [Owner] Make the repository public (GitHub settings, Danger Zone). Public repos get free Actions minutes.
8. [Owner] Tag the merge commit and push the tag:
   `git checkout main && git pull && git tag v2.0.0 && git push origin v2.0.0`
9. [Owner] Watch the `release` workflow. It fails before publishing if the tag differs from `metadata.version`.
10. [Claude] Verify the release: assets are `adp.skill` and `adp.skill.sha256`; download both and run `sha256sum -c adp.skill.sha256`; compare with the SHA-256 in the release notes; unzip and run `python3 -I adp/scripts/adp.py templates` with a temporary HOME.
11. [Owner] Replace the auto-generated notes with `docs/RELEASE-NOTES-v2.0.0.md` if wanted (`gh release edit v2.0.0 --notes-file docs/RELEASE-NOTES-v2.0.0.md`).
12. [Claude] Give the artifact install block (download `adp.skill`, verify the hash, install it as a skill, run `adp.py setup --dry-run`, then `adp.py setup --scope <user|project|local>`).

Dry-run measurements (local build, before any further change): `dist/adp.skill` 1,162,163 bytes, 409 files, sha256 `e65251fd73176d81d49eb35be49c2b6fe4042a704a5e558e69eb52dbaf8e77b7`. The hash changes if the tree changes; the published one is what counts.

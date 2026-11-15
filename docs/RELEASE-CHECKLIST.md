# Release checklist: first public release v2.0.0

Owner = needs the repository owner. Claude = can be done by Claude on request.
`skill/SKILL.md` and the four `skill/refs/*/SKILL.md` already have `metadata.version: "2.0.0"`, so no version bump is needed.
PRs #1 to #6 are merged into `main`.

- [ ] 1. [Owner] Choose a license (common options: MIT, Apache-2.0, BSD-3-Clause, MPL-2.0, GPL-3.0, AGPL-3.0). Also decide the licensing of the catalog content. **Release blocker**: the repository has no `LICENSE` file.
- [ ] 2. [Claude] Add `LICENSE` and the license line in `README.md` once the owner has chosen. Optionally add SECURITY.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, issue and PR templates, dependabot config (none exist today).
- [ ] 3. [Claude] Resolve the audit findings marked blocker (the audit report is not in the repository; the status of its findings is not verified here), then re-run `python3 tools/package.py --check`, `python3 skill/scripts/adp_catalog.py` and `python3 -m unittest discover -s tests`. On current `main` all three pass.
- [ ] 4. [Owner] Decide whether the catalog's published artifact URL (`catalog.json` field `url`, and the URL comment in `skill/catalog/index.html`; `plan --url` puts it in the published copies, `tools/publish_catalog.py set-url|check` stamps and compares the repo's; procedure: `docs/RELEASING.md`, "Publish the catalog") and the "YouTuner" / "eventhub plugin" / "this session" source labels in `catalog.json` may be public. Whether that artifact is currently published and up to date is not verified.
- [ ] 5. [Owner] Catalog entry headers: All 141 entries carry a header in the format of `docs/catalog-header.md` (`python3 skill/scripts/adp_catalog.py headers --report`). The pre-commit hook `catalog-headers` rejects a commit that touches a catalog main file without a valid header. `catalog.json` (`kit-catalog/2`) is generated from the headers by `python3 skill/scripts/adp_catalog.py build`, and `python3 skill/scripts/adp_catalog.py` (pre-commit and CI) fails while it is out of date.
- [ ] 6. [Owner] Review the two allowlisted fake values in `.gitleaks.toml` (the `sandbox` and `timed-reveal` samples, in the bundle `skill/catalog/kit/samples/patterns.json`) and confirm the author identities in the history are acceptable to publish.
- [ ] 7. [Owner] Confirm CI is green on `main` (jobs `secrets`, `lint`, `tests`, `skill`).
- [ ] 8. [Owner] Make the repository public (GitHub settings, Danger Zone).
- [ ] 9. [Owner] Tag the merge commit and push the tag (see `docs/RELEASING.md`):
   `git checkout main && git pull && git tag v2.0.0 && git push origin v2.0.0`
- [ ] 10. [Owner] Watch the `release` workflow. It runs the tests, `package.py --check` and `adp_catalog.py`, and fails before publishing if the tag differs from `metadata.version`.
- [ ] 11. [Claude] Verify the release: assets are `adp.skill` and `adp.skill.sha256`; download both and run `sha256sum -c adp.skill.sha256`; compare with the SHA-256 in the release notes; unzip and run `python3 -I adp/scripts/adp.py templates` with a temporary HOME (expected: `assistant`, `default`, `starter`).
- [ ] 12. [Owner] Replace the auto-generated notes with `docs/RELEASE-NOTES-v2.0.0.md` if wanted (`gh release edit v2.0.0 --notes-file docs/RELEASE-NOTES-v2.0.0.md`).
- [ ] 13. [Claude] Give the artifact install block (download `adp.skill`, verify the hash, install it as a skill, run `adp.py setup --dry-run`, then `adp.py setup --scope <user|project|local>`).

Local build measurement on current `main` (`python3 tools/package.py`): `dist/adp.skill` 1,164,716 bytes, 410 files, sha256 `d4c8e25a5560504c4767fbf4620820d51503f9cfcf10e2be43ef6ba034924957`. The hash changes if the tree changes; the published one is what counts.

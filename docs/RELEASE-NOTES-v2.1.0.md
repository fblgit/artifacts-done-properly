# ADP v2.1.0

Minor release on v2.0.0 (106 commits). Install and verify as in v2.0.0; `adp.skill.sha256` on the release page is the authoritative hash.

## Added

- **Host adapter contract.** Pages reach records, viewer identity and comments through an explicit provider, `adp-host/1`: the Claude adapter, and an OpenAI Sites transport (experimental, see `docs/openai-sites-transport.md`). Hosts without a native feature get an agent or application workflow where one exists; remaining gaps are named in `docs/host-adapters.md`. The agent, publish and ask handles are host-neutral, and queued hosts can send and reply.
- **Shared records shell.** `bundle`, `import-plan` and `import-ack` move intent, decisions, feedback, provenance and history between hosts as `adp-seed/2`, with `import-plan --base` for a return trip and `--only` to import named collections.
- **Guarded agent work.** Claims are bound to their destination, a reply ends a claim on Claude, and `adp.py requests` shows the recorded lease and host.
- **Sites catalogs as a take source.** `adp.py take` accepts Sites catalog URLs, plans authenticated HTTPS reads for the entries and their dependencies, writes bytes only after the full SHA-256 verifies, and refuses mismatched or conflicting files. Take instructions are host-specific.
- **Sites builds.** `adp.py files ASSETS --host sites --out SITE_PROJECT` builds a Sites project from ADP files, and the base, new and edit skills route to one Sites guide.
- **Local agent bus.** `skill/scripts/adp_bus.py`: HTTP over `.adp/bus.sock`, an append-only `.adp/bus.jsonl` transcript, snapshots, broadcasts, file sends and search. `--subscribe NAME --thread ID` queues `[ADP-BUS]` / `[ADP-MSG]` events into an existing Codex chat. A subscriber does not see its own messages.
- **Source coverage.** `adp.py source-drift` reports which KnowledgeBase chapters a source change affects, from local Git and JSON only, with review pins and a full-inventory coverage payload. New CI/CD & Repository chapter.

## Changed

- README lists requirements: Python 3 (standard library only) runs ADP; Node.js is needed only to work on ADP itself.
- Docs and the `adp-edit` skill follow what the host adapter work built.
- `tests/test_setup.py` closes its files; the suite runs clean under `-W error::ResourceWarning`.

## Limits

- `adp.py new --tier full` (the published catalog) is not available, and there is no catalog entry-add command.

# ADP v2.1.0

Minor release on v2.0.0 (106 commits, PRs #79–#91). Install and verify as in v2.0.0; `adp.skill.sha256` on the release page is the authoritative hash.

## Added

- **Host adapter contract (#81).** Pages reach records, viewer identity and comments through an explicit provider, `adp-host/1`: the Claude adapter, and an OpenAI Sites transport (experimental, see `docs/openai-sites-transport.md`). Hosts without a native feature get an agent or application workflow where one exists; remaining gaps are named in `docs/host-adapters.md`. The agent, publish and ask handles are host-neutral, and queued hosts can send and reply.
- **Shared records shell (#81).** `bundle`, `import-plan` and `import-ack` move intent, decisions, feedback, provenance and history between hosts as `adp-seed/2`, with `import-plan --base` for a return trip and `--only` to import named collections.
- **Guarded agent work (#81).** Claims are bound to their destination, a reply ends a claim on Claude, and `adp.py requests` shows the recorded lease and host.
- **Sites catalogs as a take source (#83).** `adp.py take` accepts Sites catalog URLs, plans authenticated HTTPS reads for the entries and their dependencies, writes bytes only after the full SHA-256 verifies, and refuses mismatched or conflicting files. Take instructions are host-specific.
- **Sites builds (#88).** `adp.py files ASSETS --host sites --out SITE_PROJECT` builds a Sites project from ADP files, and the base, new and edit skills route to one Sites guide.
- **Local agent bus (#86).** `skill/scripts/adp_bus.py`: HTTP over `.adp/bus.sock`, an append-only `.adp/bus.jsonl` transcript, snapshots, broadcasts, file sends and search. `--subscribe NAME --thread ID` queues `[ADP-BUS]` / `[ADP-MSG]` events into an existing Codex chat. A subscriber does not see its own messages.
- **Source coverage (#90).** `adp.py source-drift` reports which KnowledgeBase chapters a source change affects, from local Git and JSON only, with review pins and a full-inventory coverage payload. New CI/CD & Repository chapter.

## Changed

- README lists requirements: Python 3 (standard library only) runs ADP; Node.js is needed only to work on ADP itself (#79).
- Docs and the `adp-edit` skill follow what #81 built and observed live (#82).
- `tests/test_setup.py` closes its files; the suite runs clean under `-W error::ResourceWarning`.
- A Claude PR assistant workflow was added to CI (#91).

## Known gaps

- Those of v2.0.0 still stand: `--tier full` is unavailable, and there is no catalog entry-add command.
- Sites support is exercised against a local stand-in and recorded live traces; the live evidence and its limits are in `docs/openai-sites-transport.md` and `docs/host-live-test-protocol.md`.

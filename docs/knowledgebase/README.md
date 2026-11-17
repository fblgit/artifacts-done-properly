# KnowledgeBase content inputs

`briefs.json` contains concise, source-grounded explanations and their chapter/file
mappings. `repository.json` defines the CI/CD & Repository chapter. Coverage is an
overview of file responsibilities, not a claim that every API is documented.

The Site checkout keeps matching copies in `content/`; its build compiles these
into stable ADP parts and regenerates the source map/coverage payload. Use
`ADP_KB_CONTENT_ROOT` to select these reviewed inputs when building the Site.
Its source/hosting identity stays in the Site repository. Follow the normal
export, hold, proposal, publish, record and readback workflow for publication.

`docs/source-maps/knowledgebase.json` is the exported review map used by the
repository's deterministic CI report. Its reviewed commit and evidence scope
are explicit; the detector never advances them or rewrites these explanations.

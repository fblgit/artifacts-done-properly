<!--
Component inventory
The inventory taken from the Journey Whiteboard and the ADR Drafting Table before the kit was cut. It names the five building blocks both boards share, which became the first kit components here.

@id        guide.component-inventory
@kind      guide
@group     Guides
@status    stable
@version   0.1.0
@updated   2026-10-24
@summary   What both boards build today, function by function, with its db reads and writes, its coupling and what it takes to share it.
@tags      inventory, audit, components, coupling, journey, adr
@requires  none
@files     none
@provides  none
@tokens    none
@globals   none
@db        none
@source    ADP | the component inventory | read from the sources of the two boards
@preview   {"render": "guide", "samples": ["kit/guides/component-inventory.md"]}
-->

# Component inventory: Journey Whiteboard (JW) and ADR Drafting Table (ADR)

Sources read: JW = the Journey Whiteboard's app.js (2237 lines, single file), app.css and index.html; ADR = the ADR Drafting Table's adp.js, parts/*.js and styles/*.css.
JW is one monolithic app.js; ADR is split into parts (and already loads adp.js). Function names are from the code; "reads/writes" come from the code I read (function heads and the ones I opened), the rest is marked (inference). I did not read every function body; rows marked (head only) are from names/signatures plus nearby code.
Coupling: low / medium / high. "To share" = what it takes to be an ADP part.

## Glance / summary
| Component | Board, file:function | What it does | db reads/writes | Coupling | To make it shared |
|---|---|---|---|---|---|
| Coverage matrix | JW app.js:Coverage | Problems x solutions table; click a cell to link; per-column "no solution" count | reads s/{sp}/items (kind, problems[], created); writes items.problems via updateItem | high: hardcoded kinds problem/solution/idea | Generalize to "rows x cols x link field" (props: rowQuery, colQuery, linkField); decouple from KINDS |
| Decision glance / tally | ADR records.js:DecisionGlance, Glance | Chosen option(s) line plus letter tally of options with verdict colour | reads a/{id}/sections (kind option, verdict) via recPages() | high: ADR verdicts | Props-driven "verdict tally" (items, key, state to colour); the colour tokens are already v-open/chosen/rejected |
| Dashboard counts and recent requests | ADR records.js:Dashboard (+RecCard, filters chips, search) | Record cards, status filter chips with counts, search, open-request counts, recent requests | reads adrs/{id} (status, title, number), loadDash() requests across records | high: wired to adrs + dash.reqs | Split a generic "RecordList" (cards + filter chips + search) from ADR fields; chips take status vocabulary as a prop |
| Status / kind chips | JW app.js:KindChip, StatusChip, EstChip; ADR uishared.js:StatusPill | Small coloured labels from an enum | item.kind/status/estimate; adr.status | low: pure presentation | Move to a shared chip with enum->token map; both already use class + colour tokens (st-*, k-*) |
| Timeline / lineage / impact preview | JW app.js:timeline, lineage, impactOf, PreviewBanner, ImpactList, MovePreview, AltImpact | Shows what a proposed change would do before applying | reads items/pages, alts (inference on alts fields) | high: journey domain | Leave in JW; only the "preview banner" pattern is generic |
| Progress / request steps | JW app.js:REQ_STEPS/ReqLine; ADR data.js:REQ_STEPS, chrome.js:Thread | Queue > ack > working/pending > done stepper | requests doc state/status | low-medium | See Claude lanes: one shared stepper |

## Record views
| Component | Board, file:function | What it does | db | Coupling | To share |
|---|---|---|---|---|---|
| Card list item | JW:ItemCard; ADR records.js:RecCard | Clickable card with chips and counters | JW items+msgs counts; ADR adrs | medium | Shared Card shell (meta row, title, counter chips) with slots |
| Tree / outline of records | JW:TreeView, TreeNode, buildTree; ADR chrome.js:PageTree, Nav | Hierarchical navigation with fold, select | JW items (problems/parents); ADR a/{id}/sections (parent, order) | medium-high: parent derivation differs (JW parentsOf by RANK; ADR section.parent) | Shared Tree taking [{id, parent, label, badge}]; each board maps its data |
| Table of cards (TocCards), Overview page | ADR records.js:TocCards, OverviewPage, KindPage, OptionsPage, OptionPage, FreePage | Pages of a record by section kind | a/{id}/sections (kind, body, pros, cons, verdict, order, parent) | high: ADR schema | Section-kind renderers could become ADP "parts" keyed by part id (inference) |
| Kanban / buckets | JW:MoscowView (BUCKETS, moveBucket) | Drag items between MoSCoW buckets | items.moscow, order | medium | Generic "bucket board" over a field + ordered values |
| Pages list and editor | JW:PagesView, newPageDialog, draftPage; ADR records.js:RecordPage | Markdown pages, typed (PAGE_TYPES) | JW s/{sp}/pages; ADR sections | medium | Both render Md; share Md, not page logic |
| Markdown renderer | JW:mdToHtml; ADR core.js:mdToHtml + uishared.js:Md, enhanceMd, loadMermaid, renderMermaid | Markdown to HTML; ADR adds mermaid fenced blocks, figure with expand | none (props) | low | Best candidate: ADR's Md (mermaid lazy-loaded from jsdelivr, theme vars via mmdVars) plus JW's simpler mdToHtml folded in |

## Editing / forms
| Component | Board, file:function | What | db | Coupling | To share |
|---|---|---|---|---|---|
| AutoText / AutoTitle / LineInput | JW:AutoText; ADR uishared.js:AutoTitle, LineInput | Commit-on-blur inline text fields (onCommit, disabled, placeholder) | none (caller writes) | low | Lift as is; unify names |
| MdField | ADR uishared.js:MdField | Markdown field with preview toggle, hint, canEdit, startEdit | none | low | Lift as is |
| ListField, People | ADR uishared.js:ListField, People | Editable list (pros/cons) and people chips with add/remove | caller writes sections.pros/cons, adrs people (inference: ids) | low | Lift as is |
| ArmedButton | JW:ArmedButton; ADR uishared.js:ArmedButton | Two-click confirm button for destructive actions | none | low | Near-identical in both: first to dedupe |
| AddInline | JW:AddInline | "+ New X" inline create form | writes items via createItem | medium | Make a generic "AddInline({onAdd})" |
| FormModal | ADR modals.js:FormModal; JW Modal (newSpaceDialog etc.) | Field-list dialog (title, fields[]) | none | low | Shared FormModal(fields, onSubmit) |
| Write helpers | JW app.js:put/upd/del/newId/localSet/localPatch/queue; ADR data.js: same names | Per-doc serialized write queue + optimistic local state + null-for-undefined | collection path s/{sp}/X (JW) vs a/{id}/X (ADR) | low: only the path function differs | Strongest shared-runtime candidate (see tokens/runtime) |
| Import / Export | JW:doExport/doImport, readSpace/writeSpace; ADR data.js:exportRecord/importRecord, modals.js:ExportModal/ImportModal | JSON dump and restore of a space/record with progress (step()) | all collections of the unit | medium | Shared "collection bundle export/import" taking a list of collection names |

## Canvas / diagram
| Component | Board, file:function | What | db | Coupling | To share |
|---|---|---|---|---|---|
| Whiteboard canvas | JW:CanvasView, Board (lines ~1827-2148), Editor; ADR canvas.js:CanvasView, Board, CanvasEditor | Pan/zoom drawing surface; shapes, arrows, text, sticky; undo/redo; hit-test | JW s/{sp}/canvases, els; ADR a/{id}/canvases, els (inference from col() paths; els used in createEls) | medium: ADR's looks like a later fork of JW's (same fn names bboxOf, edgePoint, hitTest, HIST/H, createEls, TOOLS); ADR adds ink (pen/marker), canvasPNG, uploadShot, viewOnly, layoutCache | The top "both boards" lift; ADR version is the newer. Needs the collection path as a prop and palette from tokens (COLORS/TINTS differ per board) |
| Canvas geometry and history | JW app.js:1706-1784; ADR canvas.js:1-155 | bboxOf, edgePoint, endsOf, distSeg, hitTest, undo/redo | els | low | Pure functions: lift into one file |
| Mermaid diagram figure | ADR uishared.js:figureFor, paintFigure; modals.js:DiagramModal | Renders ```mermaid in markdown, expandable | none | low | Lift with Md |
| Send to canvas | JW:sendToCanvas, ensureCanvas | Drops an item as a ref element onto a canvas | writes els, canvases | high | JW only |

## Claude lanes (requests, sendToClaude, presence)
| Component | Board, file:function | What | db | Coupling | To share |
|---|---|---|---|---|---|
| Send request to Claude Code | JW app.js:sendToCode; ADR data.js:sendRequest, postComment, sendFailed, sendReason | Writes a request doc, then C.comments.canSendToClaude() / anchorFor(el) / sendToClaude({anchor,text}); queued on the board if nobody listens; ADR adds lanes, byte-fit (MAX_TEXT_BYTES 4000) and rollback on failure | JW s/{sp}/requests {text,itemId,status,delivered,author,created,why,sentAt}; ADR a/{id}/requests {lane,text,status,sentAt,...} | medium: same protocol, different doc fields and trailer text | Top shared lane: one `sendRequest(lane, fields, body, anchorEl)` and one request-doc schema |
| Request state machine | JW:reqState (queue/ack/pending/done, "seen" read as ack); ADR data.js:reqState (queue/ack/working/done) | Maps requests.status/state to a step | requests.state, status | low | Unify vocabulary (pending vs working) |
| Listener check | JW:pollListen (30 s); ADR data.js:pollListen, SEND_REASON | Polls canSendToClaude and shows why sending is off | none (API) | low | Lift |
| Request list / card / thread / reply | JW:ReqLine, QueueStrip, ReqList, ListenHint; ADR chrome.js:ReqCard, Thread, ReplyBox, ClaudePane, focusReq; data.js:turnsOf, threadOf, sendReply, watchReq, canReply | Shows requests with steps, progress and Claude's answer; ADR adds multi-turn replies (turns[]) and live watch of one request | requests.progress[], response, changed[] (JW comment, line ~515); ADR requests.turns[{by,text,at}], status done | medium | Shared RequestCard with turns[]; JW can adopt turns |
| Presence | JW:ListenHint (reads S.presence['claude-code']); ADR data.js:presenceOf, sessionLine; Dashboard claude-card | Shows whether a Claude session is on the board | JW s/{sp}/presence/<who> {at,doing}; ADR (inference) presence in a/{id}/... or dash | medium | Shared Presence dot + line; settle one path (ADP agents collection per SKILL.md) |
| Ping | ADR chrome.js:PingButton, Nudge, PingPanel; data.js:ping, pingTarget, lastPong | Round-trip liveness check with a 90 s timeout | requests with lane ping | medium | Shareable; ADR only |
| Bottom command bar | ADR bars.js:PDBar (BAR: claude lane, design lane); recordState | Textarea with lane switch, draft kept in localStorage, Ctrl/Cmd+Enter sends | requests via sendRequest | medium | Good ADP part: BAR config as props (lanes, label, max, placeholders) |
| In-page Claude | JW:quickChat, weighIn, askJSON, estimate, runAlt, guideTurn, ChatPanel, GuidePanel, Actions/applyAction | Calls C.sample for structured JSON "actions", applies them to the board with armed buttons | writes msgs, chat, alts, items | high | JW only; the "Actions" apply/preview pattern is the reusable idea (inference) |
| Refresher | ADR modals.js:RefreshModal; data.js:refreshRate, scopeIds | Lane that asks Claude to update/refresh/rebuild/publish with scope and cost estimate | requests lane refresh | high | ADR only |

## Comments / anchors
| Component | Board, file:function | What | db | Coupling | To share |
|---|---|---|---|---|---|
| Part-id comment anchors | ADR adp.js:anchors, place, resolve, target, anchorOf, hl, swallow | Comment mode: click any [data-part] to anchor; places existing threads on parts; unknown anchors counted | comments API + data-part attrs | low: it is the ADP runtime | Already shared |
| Content as data | ADR adp.js:content, paint, watchContent | content.js baseline, db content/<part id> overrides live | content/{partId}.html | low | Already shared |
| What changed panel | ADR adp.js:changesPanel | Lists version changes | changes collection | low | Already shared |
| Self-check | ADR adp.js:check, pushErr | Collects script errors and anchor stats | checks (inference) | low | Already shared |
| Item message thread | JW app.js:Thread, addMsg | Per-item comment/challenge/support/input/answer posts | s/{sp}/msgs {itemId,kind,text,author,order} | medium | Own-db thread, separate from the platform comments; only in JW. Candidate to reconcile with ADP `threads` collection (inference) |
| Anchor use in JW | JW:sendToCode uses C.comments.anchorFor(anchorEl) | Anchors a request to the clicked element, no data-part ids | n/a | n/a | JW has no stable part ids (grep'd: no adp.js); adopting it means adding data-part to cards/panels |

## Chrome (header, tabs, nav, modals)
| Component | Board, file:function | What | db | Coupling | To share |
|---|---|---|---|---|---|
| Top bar | JW:TopBar; ADR chrome.js:TopBar | Brand, switcher, tabs, queue/conn state, panel toggles | JW spaces; ADR adrs | medium | Shared Header shell with slots; both show a live connection dot (JW `conn`, ADR `conn`) |
| Record/space switcher | JW:SpaceMenu, newSpaceDialog, newSpace/clearSpace; ADR chrome.js:Switcher | Dropdown to pick/create the unit of work | JW spaces/{id}; ADR adrs/{id} | medium | One "UnitSwitcher({collection,label})" |
| Tabs | JW:TABS in TopBar | Tablist (journey/canvas/moscow/pages) with ls-persisted tab | none | low | Tiny shared Tabs |
| Left nav / side pane | ADR chrome.js:Nav, PageTree; records.js:SidePane, Pager; data.js:toggleSide/toggleLeft, isNarrow/isOverlay | Records pane, page tree, glance/Claude pane, responsive drawers | sections | medium | Shared Shell layout with narrow/overlay behaviour; JW has Drawer (item/chat/guide) |
| Drawer | JW:Drawer, ItemPanel | Side drawer for selected item / chat / guide | items | medium | Shared Drawer |
| Modal host, Toasts, Busy overlay | JW:Modal, Toast, Busy; ADR modals.js:Modal, Toasts, Busy, useModalKeys; core.js:toast/openModal/closeModal | Dialogs, toasts with action, progress overlay; ADR restores focus | none | low | Near-identical (Busy line is the same): lift together |
| Store / hooks | JW:S, set, emit, useS, listeners; ADR core.js same names; useOutside, useTicker, useMQ, useDebounced | rAF-batched global state with subscribe hook | none | low | Lift as ADP runtime |
| Boot / mount | JW:App, boot; ADR mount.js:App, boot, Empty, TITLES; mock.js (makeMockDB, seedMock) | Initial load, snapshot subscriptions (applySnap per collection), offline mock db for ?mock | collections subscribed per unit | medium | Mock db is a good shared dev harness (ADR only) |
| Icons | JW:I; ADR uishared.js:I, sv, ico | Inline SVG icon set | none | low | Merge sets |

## Tokens / styles
| Component | Board, file | What | Coupling | To share |
|---|---|---|---|---|
| Colour tokens | JW app.css :root and :root[data-theme="dark"] (--bg --panel --ink --accent --k-* kind colours --c-ink/blue/red/green/amber/violet --st-yellow...); ADR styles/tokens.css (--ground --sheet --ink --accent --st-* --v-* --rq-* --c-ink/oxblood/pine/slate/brass/plum --t-canary...) | Both define light+dark, status colours, 6 pen colours, 4 sticky tints | medium: same roles, different names and palettes | Define a semantic set (surface, ink 1-3, rule, accent, status, request-step, pen, tint) and let each board remap values; names to be chosen once |
| Component CSS | ADR buttons.css, canvas.css, dashboard.css, frame.css, overlays.css, records.css, responsive.css; JW app.css (495 lines, one file) | Buttons, chips, cards, canvas, modals, layout, narrow rules | medium | Buttons/overlays/canvas/responsive split in ADR is the liftable shape |

## In BOTH boards in some form (first candidates for a shared kit)
1. Canvas (shapes, arrows, sticky, undo/redo, geometry): JW app.js:Board vs ADR parts/canvas.js:Board share function names and structure; ADR is the newer fork.
2. The db write layer and store: put/upd/del/newId/localSet/localPatch/queue/nul/merge plus S/set/useS/emit, identical in shape in both (only the collection path differs).
3. The Claude lane: sendRequest (canSendToClaude, anchorFor, sendToClaude, queued fallback), reqState/REQ_STEPS, pollListen, request cards with presence.
4. Chrome primitives: Modal, Toast, Busy, ArmedButton, AutoText/AutoTitle, useOutside, icon set, status/kind chips, tab/drawer layout.
5. Tokens and Markdown: light/dark token roles (ink, accent, status, 6 pen colours, 4 tints) and the Markdown renderer (JW mdToHtml, ADR Md with mermaid).

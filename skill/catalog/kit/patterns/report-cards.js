/* part:page.script.kit.report-cards */
/**
 * Structured report cards
 * Kit.reportCards.render(report) returns one card; mount(box, {reports}) draws a list. All nine share one head (a kind pill, the subject, who filed it, when) and one frame, and a field spec per kind decides what follows, so a reader learns the shapes once. The done card carries test runs as a pass, fail and skip strip drawn to scale with the three counts in words, a table of where the work differs from the ask (Asked for, What was done) and a list of what was not checked, so a report says what it did not verify. Blocked names what it waits on, decision lists alternatives and what follows, handoff names who gets it and what is left, question lists options, feedback is a table of kind, place and note, fault sets expected beside seen with evidence. Field names are neutral (subject, ref, ref2), with labels you can set. A kind it does not know shows a flagged mark and the raw body. Kind, severity, progress, block reason and feedback kind words come from the vocabulary table.
 *
 * What it is: nine fixed-shape status reports (done, blocked, decision, handoff, ask, question, feedback, fault, status). Every card has the same head, a kind pill with the subject, who
 * filed it and when, then only that kind's fields in a fixed order, so a reader learns the shapes once. One renderer holds a field spec per kind. The done card is the one to copy: it
 * carries test runs as a pass, fail and skip strip drawn to scale, an asked-versus-did table where the work diverged from the ask, and a list of what was not checked, so a report says
 * what it did not verify. A card reads only typed fields; nothing is parsed out of prose.
 *
 * Kind, severity, progress, block reason and feedback kind words come from the vocabulary table (kit/vocab.js). This file adds five small enums only when the page has not defined them:
 * "report-kind", "block-reason", "severity", "feedback-kind" and "progress".
 *
 * API:
 *   Kit.reportCards.render(report, opts) -> Element       one card;  Kit.reportCards.mount(box, {reports, labels, timeZone}) -> {update(reports), destroy()}  a list of cards
 *     report   {kind, subject, by, at (ISO), ref, ref2, body}      kind is one of Kit.reportCards.kinds; body is the kind's fields:
 *       done      {tests: [{command, passed, failed, skipped}], diverged: [{asked, did}], unverified: [text], summary}
 *       blocked   {reason, on: {kind, name}, detail}          decision  {decision, alternatives: [text], consequences: [text]}
 *       handoff   {to, nextStep}                              ask       {question}
 *       question  {to, question, options: [text]}             feedback  {items: [{kind, where, line, note}]}
 *       fault     {severity, component, expected, observed, evidence: [text]}      status  {progress, summary}
 *     labels   {ref, ref2} the words for the two reference fields, per kind or for all: {done: {ref: "Commit", ref2: "Branch"}} or {ref: "Reference"}
 *     timeZone for the clock text (default: the viewer's)
 *     A kind the renderer does not know draws a flagged unknown mark and the raw body, never nothing.
 *
 * @id        pattern.report-cards
 * @kind      component
 * @group     Patterns
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   Nine fixed-shape reports (done, blocked, decision, handoff, ask, question, feedback, fault, status): a kind pill, the subject, who and when, then only that kind's fields in a fixed order.
 * @tags      report, status report, done, blocked, decision, handoff, fault, feedback, tests, divergence, unverified
 * @requires  kit.tokens, kit.vocab
 * @files     kit/patterns/report-cards.css, kit/samples/patterns.json
 * @provides  Kit.reportCards.render, Kit.reportCards.mount, Kit.reportCards.kinds
 * @config    Kit.reportCards.render(report, {labels, timeZone}) | report {kind, subject, by, at, ref, ref2, body}; body fields by kind are listed in the file header
 * @config    Kit.reportCards.mount(box, {reports, labels, timeZone}) | returns {update, destroy}
 * @tokens    --panel --sunk --ink --ink-2 --rule --rule-2 --f-ui --f-mono --ok --danger --rim? --pool? --glz-r-l? --glz-sh-1?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | a component family's nine report cards | the done card's tests, divergence table and unverified list, and the blocked, decision, handoff, ask, question, feedback, fault and status shapes
 * @preview   {"render": "pattern.report-cards", "samples": ["kit/samples/patterns.json#report-cards"]}
 * @samples   report-cards
 * @changed   One renderer with a field spec per kind replaces nine components that each repeated the head and frame.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const V = () => Kit.vocab;
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const DEFAULTS = {
  'report-kind': {
    done: { word: 'Done', short: 'done', glyph: 'check', tone: 'success', motion: 'none' },
    blocked: { word: 'Blocked', short: 'blocked', glyph: 'stop', tone: 'danger', motion: 'none' },
    decision: { word: 'Decision', short: 'decision', glyph: 'diamond', tone: 'info', motion: 'none' },
    handoff: { word: 'Handoff', short: 'handoff', glyph: 'reply', tone: 'review', motion: 'none' },
    ask: { word: 'Ask', short: 'ask', glyph: 'hand', tone: 'attention', motion: 'none' },
    question: { word: 'Question', short: 'question', glyph: 'question', tone: 'attention', motion: 'none' },
    feedback: { word: 'Feedback', short: 'feedback', glyph: 'eye', tone: 'review', motion: 'none' },
    fault: { word: 'Fault', short: 'fault', glyph: 'cross', tone: 'danger', motion: 'none' },
    status: { word: 'Status', short: 'status', glyph: 'pulse', tone: 'active', motion: 'none' },
  },
  'block-reason': {
    'waiting-on-item': { word: 'Waiting on another item', short: 'item', glyph: 'hourglass', tone: 'attention', motion: 'none' },
    'waiting-on-person': { word: 'Waiting on a person', short: 'person', glyph: 'hand', tone: 'attention', motion: 'none' },
    'resource-held': { word: 'Resource held by someone else', short: 'held', glyph: 'stop', tone: 'danger', motion: 'none' },
    'tool-missing': { word: 'A tool is missing', short: 'tool', glyph: 'cross', tone: 'danger', motion: 'none' },
  },
  severity: {
    low: { word: 'Low', short: 'low', glyph: 'info', tone: 'neutral', motion: 'none' },
    medium: { word: 'Medium', short: 'medium', glyph: 'info', tone: 'attention', motion: 'none' },
    high: { word: 'High', short: 'high', glyph: 'cross', tone: 'danger', motion: 'none' },
  },
  'feedback-kind': {
    fix: { word: 'Fix', short: 'fix', glyph: 'cross', tone: 'danger', motion: 'none' },
    nit: { word: 'Nit', short: 'nit', glyph: 'dot', tone: 'neutral', motion: 'none' },
    question: { word: 'Question', short: 'question', glyph: 'question', tone: 'attention', motion: 'none' },
    praise: { word: 'Praise', short: 'praise', glyph: 'check', tone: 'success', motion: 'none' },
  },
  progress: {
    started: { word: 'Just started', short: 'started', glyph: 'play', tone: 'neutral', motion: 'none' },
    halfway: { word: 'About halfway', short: 'halfway', glyph: 'pulse', tone: 'active', motion: 'none' },
    nearly: { word: 'Nearly done', short: 'nearly', glyph: 'pulse', tone: 'info', motion: 'none' },
  },
};
function ensure() { const t = {}; for (const [en, rows] of Object.entries(DEFAULTS)) for (const [v, r] of Object.entries(rows)) if (V().get(en, v) === undefined) (t[en] = t[en] || {})[v] = r; if (Object.keys(t).length) V().define(t); }
const list = x => Array.isArray(x) ? x : [];
const has = x => x != null && x !== '';

function label(t) { return el('span', 'kit-rp-k', t); }
function prose(text, cls) {
  const d = el('div', 'kit-rp-prose' + (cls ? ' ' + cls : '')); String(text == null ? '' : text).split(/\n{2,}/).forEach(p => { if (p.trim()) d.append(el('p', null, p.trim())); }); return d;
}
function pair(k, v) { const f = el('div', 'kit-rp-f'); const dt = el('dt', null, k), dd = el('dd'); if (v instanceof Node) dd.append(v); else dd.textContent = v; f.append(dt, dd); return f; }
function ul(items, cls, ordered) { const u = el(ordered ? 'ol' : 'ul', 'kit-rp-list' + (cls ? ' ' + cls : '')); items.forEach(t => u.append(el('li', null, t))); return u; }
function block(k, node) { const b = el('div', 'kit-rp-b'); b.append(label(k), node); return b; }
function code(t) { return el('code', null, t); }
function who(name) { return el('span', 'kit-rp-who', name); }
function pillOf(en, v) { return V().pill(en, v, { unknown: 'flag' }); }

function tests(runs) {
  const wrap = el('div', 'kit-rp-runs');
  runs.forEach(r => {
    const p = +r.passed || 0, f = +r.failed || 0, s = +r.skipped || 0, tot = p + f + s;
    const run = el('div', 'kit-rp-run'); if (r.command) run.append(code(r.command));
    const bar = el('div', 'kit-rp-bar'); bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', p + ' passed, ' + f + ' failed, ' + s + ' skipped of ' + tot);
    [['pass', p], ['fail', f], ['skip', s]].forEach(([k, n]) => { if (n > 0) { const i = el('i'); i.dataset.k = k; i.style.flexGrow = n; bar.append(i); } });
    if (!tot) bar.dataset.empty = 'true';
    const nums = el('div', 'kit-rp-nums');
    [['pass', 'check', p, 'passed'], ['fail', 'cross', f, 'failed'], ['skip', 'ring', s, 'skipped']].forEach(([k, g, n, w]) => { const c = el('span'); c.dataset.k = k; c.append(V().glyph(g), el('b', null, String(n)), document.createTextNode(' ' + w)); nums.append(c); });
    run.append(bar, nums); wrap.append(run);
  });
  return wrap;
}
function diverged(rows) {
  const t = el('table', 'kit-rp-div'); const hd = el('thead'), tr = el('tr'); ['Asked for', 'What was done'].forEach(h => { const th = el('th', null, h); th.scope = 'col'; tr.append(th); }); hd.append(tr);
  const tb = el('tbody'); rows.forEach(r => { const x = el('tr'); x.append(el('td', null, r.asked), el('td', null, r.did)); tb.append(x); }); t.append(hd, tb); return t;
}
function feedback(items) {
  const t = el('table', 'kit-rp-fb'); const hd = el('thead'), tr = el('tr'); ['Kind', 'Where', 'Note'].forEach(h => { const th = el('th', null, h); th.scope = 'col'; tr.append(th); }); hd.append(tr);
  const tb = el('tbody'); items.forEach(it => {
    const x = el('tr'), a = el('td'), b = el('td'), c = el('td'); const p = it.kind ? pillOf('feedback-kind', it.kind) : null; if (p) a.append(p);
    if (it.where) { b.append(code(it.where)); if (it.line != null) b.append(code(':' + it.line)); } c.textContent = it.note || ''; x.append(a, b, c); tb.append(x);
  }); t.append(hd, tb); return t;
}

// the field spec of each kind: [label or null, builder(body, report) -> Node | null]
const SPEC = {
  done: [
    [null, (b, r, o) => { const l = o.labels(r.kind); return has(r.ref) || has(r.ref2) ? refs(r, l) : null; }],
    ['Test runs', b => list(b.tests).length ? tests(list(b.tests)) : null],
    ['Where the work differs from the ask', b => list(b.diverged).length ? diverged(list(b.diverged)) : null],
    ['Not checked', b => list(b.unverified).length ? ul(list(b.unverified), 'kit-rp-unv') : null],
    [null, b => has(b.summary) ? prose(b.summary) : null],
  ],
  blocked: [
    [null, b => { const d = el('p', 'kit-rp-on'); const p = b.reason ? pillOf('block-reason', b.reason) : null; if (p) d.append(p); if (b.on) { d.append(label('Blocked on')); if (b.on.kind) d.append(el('span', 'kit-rp-onk', b.on.kind)); d.append(code(b.on.name)); } return d.childNodes.length ? d : null; }],
    [null, b => has(b.detail) ? prose(b.detail) : null],
  ],
  decision: [
    [null, b => has(b.decision) ? prose(b.decision, 'kit-rp-lead') : null],
    ['Alternatives weighed', b => list(b.alternatives).length ? ul(list(b.alternatives)) : null],
    ['What follows', b => list(b.consequences).length ? ul(list(b.consequences)) : null],
  ],
  handoff: [
    [null, (b, r, o) => { const d = el('p', 'kit-rp-on'); d.append(label('Handed to'), who(b.to || '')); return d; }],
    [null, (b, r, o) => has(r.ref) || has(r.ref2) ? refs(r, o.labels(r.kind)) : null],
    ['Left to do', b => has(b.nextStep) ? prose(b.nextStep) : null],
  ],
  ask: [[null, b => has(b.question) ? prose(b.question, 'kit-rp-lead') : null]],
  question: [
    [null, b => { if (!b.to) return null; const d = el('p', 'kit-rp-on'); d.append(label('Asked of'), who(b.to)); return d; }],
    [null, b => has(b.question) ? prose(b.question, 'kit-rp-lead') : null],
    ['Options', b => list(b.options).length ? ul(list(b.options), 'kit-rp-opts', true) : null],
  ],
  feedback: [[null, b => list(b.items).length ? feedback(list(b.items)) : null]],
  fault: [
    [null, b => { const d = el('p', 'kit-rp-on'); const s = b.severity ? pillOf('severity', b.severity) : null; if (s) { d.append(label('Severity'), s); } if (b.component) d.append(label('In'), code(b.component)); return d.childNodes.length ? d : null; }],
    [null, b => { if (!has(b.expected) && !has(b.observed)) return null; const dl = el('dl', 'kit-rp-eo'); if (has(b.expected)) dl.append(pair('Expected', b.expected)); if (has(b.observed)) dl.append(pair('Seen', b.observed)); return dl; }],
    ['Evidence', b => { if (!list(b.evidence).length) return null; const u = el('ul', 'kit-rp-list kit-rp-ev'); list(b.evidence).forEach(x => { const li = el('li'); li.append(code(x)); u.append(li); }); return u; }],
  ],
  status: [
    [null, b => { if (!b.progress) return null; const p = pillOf('progress', b.progress); return p || null; }],
    [null, b => has(b.summary) ? prose(b.summary, 'kit-rp-lead') : null],
  ],
};
function refs(r, l) {
  const dl = el('dl', 'kit-rp-refs');
  if (has(r.ref)) dl.append(pair(l.ref, code(r.ref))); if (has(r.ref2)) dl.append(pair(l.ref2, code(r.ref2))); return dl;
}

function render(report, opts) {
  ensure();
  const o = Object.assign({ labels: {} }, opts), r = report || {};
  const lab = k => Object.assign({ ref: 'Reference', ref2: 'Second reference' }, o.labels, (o.labels && o.labels[k]) || {});
  const row = V().get('report-kind', r.kind);
  const card = el('article', 'kit-rp'); card.dataset.kind = String(r.kind); card.setAttribute('data-vo-tone', row ? row.tone : 'neutral');
  const head = el('header', 'kit-rp-head'); const p = pillOf('report-kind', r.kind); if (p) head.append(p);
  if (r.subject) head.append(el('span', 'kit-rp-subject', r.subject));
  const meta = el('span', 'kit-rp-meta'); if (r.by) meta.append(who(r.by));
  if (r.at) { const t = el('time', null, (() => { try { return new Date(r.at).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: o.timeZone }); } catch (_) { return r.at; } })()); t.dateTime = r.at; meta.append(t); }
  head.append(meta); card.append(head);
  const spec = SPEC[r.kind], body = r.body || {};
  if (!spec) { const raw = el('pre', 'kit-rp-raw'); raw.textContent = JSON.stringify(body, null, 2); card.append(raw); return card; }
  const ctx = { labels: lab };
  spec.forEach(([k, build]) => { const n = build(body, r, ctx); if (!n) return; card.append(k ? block(k, n) : n); });
  return card;
}
function mount(box, opts) {
  const o = Object.assign({ reports: [] }, opts); let reports = o.reports.slice();
  box.classList.add('kit-rps');
  const draw = () => { box.textContent = ''; if (!reports.length) { box.append(el('p', 'kit-rp-empty', 'No reports yet. Each report a member files appears here as a card of its kind.')); return; } reports.forEach(r => box.append(render(r, o))); };
  draw();
  return { update(list2) { reports = list2.slice(); draw(); }, destroy() { box.replaceChildren(); box.classList.remove('kit-rps'); } };
}
Kit.reportCards = Object.freeze({ render, mount, get kinds() { return Object.keys(SPEC); } });
})();
/* /part:page.script.kit.report-cards */

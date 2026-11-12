/* part:page.script.kit.work-card */
/* Kit pattern: work card with stamps (Kit.workCard)    kit version 0.1.0
   What it is: one work item as a card. Its id, title, state pill and verdict, who has it, what it expects from someone, how many questions are still open, and the resource it holds.
   Three stamps say more than the state alone: the outcome stamp (how it ended and what it ended onto: a commit, another item or a record), the answered stamp (what the answer was and
   whether the person it was for has read it), and the provenance badge at the foot (who wrote what the card shows, a person, an agent or an agent's polish of a person's words, and
   whether the record has moved since, in words: Stale, with the version shown and the version now). A polished title sits over the title as filed, which stays one line below it.
   Every state, verdict, expects, outcome, provenance, freshness and receipt word, glyph and tone comes from the vocabulary table (kit/vocab.js). This file adds six small enums only when
   the page has not defined them: "work-verdict", "work-expects", "work-outcome", "work-provenance", "work-freshness" and "work-receipt". The state uses the built-in "state" enum.
   API:
     Kit.workCard.render(item, opts) -> Element       one card;   Kit.workCard.mount(box, {items, ...opts}) -> {update(items), destroy()}   a responsive list of cards
       item   {id, title, rawTitle, state, verdict, owner, expects, openAsks, holds: {kind, name}, outcome: {kind, ref: {type: "commit"|"item"|"record", value, recordKind}},
               answered: {answer, state: "answered"|"read", by, at}, authored: {by, kind: "human"|"agent"|"polished", at, version}, version}
       opts   stateEnum (default "state")  onOpen (item) makes the title a button  timeZone  for the clock text (default: the viewer's)
              A value the table leaves null draws nothing; a value it does not know draws a flagged unknown mark.
   Needs from the board:
     css     kit/patterns/work-card.css, kit/vocab.css; custom properties --panel --sunk --ink --ink-2 --rule --rule-2 --accent --f-ui --f-mono, optional --rim --pool --glz-r-l --glz-sh-1 --seam
     globals Kit.vocab
   db collections: none; the board hands over its items.
   Lifted from: a component family's task card, outcome stamp, answered stamp and provenance badge (who wrote what is shown and whether the record moved since). */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const V = () => Kit.vocab;
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const DEFAULTS = {
  'work-verdict': {
    none: null,
    approved: { word: 'Approved', short: 'approved', glyph: 'check', tone: 'success', motion: 'none' },
    changes: { word: 'Changes asked', short: 'changes', glyph: 'reply', tone: 'attention', motion: 'none' },
    rejected: { word: 'Rejected', short: 'rejected', glyph: 'cross', tone: 'danger', motion: 'none' },
  },
  'work-expects': {
    none: null,
    reply: { word: 'Expects a reply', short: 'reply', glyph: 'hand', tone: 'attention', motion: 'none' },
    review: { word: 'Expects a review', short: 'review', glyph: 'eye', tone: 'review', motion: 'none' },
    nothing: { word: 'Expects nothing', short: 'nothing', glyph: 'ring', tone: 'neutral', motion: 'none' },
  },
  'work-outcome': {
    none: null,
    landed: { word: 'Landed onto', short: 'landed', glyph: 'check', tone: 'success', motion: 'none' },
    folded: { word: 'Folded into', short: 'folded', glyph: 'diamond', tone: 'info', motion: 'none' },
    dropped: { word: 'Dropped', short: 'dropped', glyph: 'moon', tone: 'ended', motion: 'none' },
  },
  'work-provenance': {
    human: { word: 'Written by a person', short: 'person', glyph: 'hand', tone: 'neutral', motion: 'none' },
    agent: { word: 'Written by an agent', short: 'agent', glyph: 'pulse', tone: 'info', motion: 'none' },
    polished: { word: 'Polished by an agent', short: 'polished', glyph: 'eye', tone: 'review', motion: 'none' },
  },
  'work-freshness': {
    current: null,
    stale: { word: 'Stale: the record moved since', short: 'stale', glyph: 'hourglass', tone: 'attention', motion: 'none' },
  },
  'work-receipt': {
    answered: { word: 'Answered', short: 'answered', glyph: 'reply', tone: 'review', motion: 'none' },
    read: { word: 'Answered and read', short: 'read', glyph: 'check', tone: 'success', motion: 'none' },
  },
};
function ensure() { const t = {}; for (const [en, rows] of Object.entries(DEFAULTS)) for (const [v, r] of Object.entries(rows)) if (V().get(en, v) === undefined) (t[en] = t[en] || {})[v] = r; if (Object.keys(t).length) V().define(t); }
const initials = n => String(n || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

function render(item, opts) {
  ensure();
  const o = Object.assign({ stateEnum: 'state' }, opts), it = item || {};
  const fmt = iso => { try { return new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: o.timeZone }); } catch (_) { return String(iso); } };
  const row = V().get(o.stateEnum, it.state);
  const card = el('article', 'kit-wk'); card.dataset.id = String(it.id); card.setAttribute('data-vo-tone', row ? row.tone : 'neutral');
  const head = el('header', 'kit-wk-head'); head.append(el('code', 'kit-wk-id', String(it.id)));
  if (it.version != null) head.append(el('span', 'kit-wk-ver', 'v' + it.version));
  card.append(head);
  const h = el('h3', 'kit-wk-title');
  if (o.onOpen) { const b = el('button', 'kit-wk-open', it.title); b.type = 'button'; b.addEventListener('click', () => o.onOpen(it)); h.append(b); } else h.textContent = it.title;
  card.append(h);
  if (it.rawTitle && it.rawTitle !== it.title) { const r = el('p', 'kit-wk-raw'); r.append(el('span', null, 'Filed as '), el('q', null, it.rawTitle)); card.append(r); }
  const states = el('div', 'kit-wk-states');
  [V().pill(o.stateEnum, it.state, { unknown: 'flag' }), it.verdict != null ? V().pill('work-verdict', it.verdict, { unknown: 'flag' }) : null].forEach(x => x && states.append(x));
  if (it.outcome && it.outcome.kind != null) {
    const p = V().pill('work-outcome', it.outcome.kind, { unknown: 'flag' });
    if (p) {
      const s = el('span', 'kit-wk-outcome'); s.append(p); const r = it.outcome.ref;
      if (r) { if (r.type === 'commit') s.append(el('code', null, r.value)); else if (r.type === 'item') s.append(el('code', null, '#' + r.value)); else { if (r.recordKind) s.append(el('span', 'kit-wk-rk', r.recordKind)); s.append(el('code', null, r.value)); } }
      states.append(s);
    }
  }
  card.append(states);
  const meta = el('div', 'kit-wk-meta');
  if (it.owner) { const w = el('span', 'kit-wk-own'); const av = el('i', null, initials(it.owner)); av.setAttribute('aria-hidden', 'true'); w.append(av, document.createTextNode(it.owner)); meta.append(w); }
  if (it.expects != null) { const c = V().chip('work-expects', it.expects, { unknown: 'flag' }); if (c) meta.append(c); }
  if (it.openAsks > 0) { const a = el('span', 'kit-wk-asks'); a.append(V().glyph('hand'), document.createTextNode(it.openAsks + (it.openAsks === 1 ? ' question open' : ' questions open'))); meta.append(a); }
  if (it.holds) { const hd = el('span', 'kit-wk-holds'); if (it.holds.kind) hd.append(el('i', null, it.holds.kind)); hd.append(el('code', null, it.holds.name)); hd.title = 'Holds this resource'; meta.append(hd); }
  if (meta.childNodes.length) card.append(meta);
  if (it.answered) {
    const a = it.answered, s = el('div', 'kit-wk-ans'); const p = V().pill('work-receipt', a.state || 'answered', { unknown: 'flag' }); if (p) s.append(p);
    if (a.answer) s.append(el('q', null, a.answer));
    if (a.state === 'read' && (a.by || a.at)) { const t = el('span', 'kit-wk-by'); t.append(document.createTextNode('read' + (a.by ? ' by ' + a.by : '') + (a.at ? ' ' : ''))); if (a.at) { const tm = el('time', null, fmt(a.at)); tm.dateTime = a.at; t.append(tm); } s.append(t); }
    card.append(s);
  }
  if (it.authored) {
    const a = it.authored, foot = el('footer', 'kit-wk-prov'); const p = V().pill('work-provenance', a.kind, { unknown: 'flag' }); if (p) foot.append(p);
    const stale = a.version != null && it.version != null && a.version < it.version;
    if (stale) { const f = V().pill('work-freshness', 'stale', { unknown: 'flag' }); if (f) { foot.append(f); foot.append(el('span', 'kit-wk-vs', 'shown v' + a.version + ', record v' + it.version)); } }
    if (a.by) foot.append(el('span', 'kit-wk-by', a.by)); if (a.at) { const tm = el('time', 'kit-wk-by', fmt(a.at)); tm.dateTime = a.at; foot.append(tm); }
    card.append(foot);
  }
  return card;
}
function mount(box, opts) {
  const o = Object.assign({ items: [] }, opts); let items = o.items.slice(); box.classList.add('kit-wks');
  const draw = () => { box.textContent = ''; if (!items.length) { box.append(el('p', 'kit-wk-empty', 'No work yet. Each item shows up here as a card with its state, owner and what it expects.')); return; } items.forEach(i => box.append(render(i, o))); };
  draw();
  return { update(l) { items = l.slice(); draw(); }, destroy() { box.replaceChildren(); box.classList.remove('kit-wks'); } };
}
Kit.workCard = Object.freeze({ render, mount });
})();
/* /part:page.script.kit.work-card */

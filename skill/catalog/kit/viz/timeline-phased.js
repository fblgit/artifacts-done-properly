/* part:page.script.kit.viz.timeline-phased */
/**
 * Phased time rail and event log
 * Kit.timelinePhased.mount(box, {phases}) draws phases in order (their numbers are the sequence), each with its state in words and how many of its events are closed. An event has a clock column (14:05Z, with the day under it; the zone is an option), a dot on the rail and a card with a code, a title, a state pill (Kit.vocab), a line of text and who did it. An event that needs a person pings: its dot has a ring that pulses (not under prefers-reduced-motion) and its card says "Needs you". Kit.timelinePhased.log draws a time-first table as a plain log: the time in mono, then the other cells joined with dots. viz.timeline is unchanged; this is a new file beside it.
 *
 * API:
 *   Kit.timelinePhased.mount(box, {phases, timeZone, label, words, stateEnum, onPick}) -> {update(patch), destroy()}
 *     phases   [{id, name, state, events}]    state: done | now | next | later (words below)
 *                events [{id, at, title, text, by, state, needsYou}]   at is an ISO time; state is a value of the Kit.vocab enum below (a pill, with its glyph) or leave it out;
 *                an event is closed when its state is done (the phase counts those)
 *     stateEnum  the Kit.vocab enum for an event's state (default "state"); without Kit.vocab the state is plain text
 *     timeZone   "UTC" (default; written 14:05Z) or an IANA name (written 14:05)
 *     words      {done, now, next, later, closed(n, m), ping: "Needs you"}      onPick(event)  makes each card a button
 *   Kit.timelinePhased.log(box, {columns, rows, label, timeZone}) -> {destroy()}   rows [[time, cell, cell, ...]]: the first cell is the time as text; the others are joined with dots; columns name them for assistive tech
 *   Kit.timelinePhased.clock(iso, timeZone) -> {clock, day, iso}   the pure part
 *
 * Kit.vocab is used when it is present. Root CSS class: .kit-tp.
 *
 * @id        viz.timeline-phased
 * @kind      component
 * @group     Visualizations
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   An upgrade of viz.timeline: events grouped by numbered phase with a UTC clock and day column, a ping on events that need a person, and a time-first table drawn as a log.
 * @tags      timeline, phases, clock, utc, zulu, ping, needs you, log, event log, rail, incident
 * @requires  kit.vocab
 * @files     kit/viz/timeline-phased.css, kit/samples/timeline-phased.json
 * @provides  Kit.timelinePhased.mount, Kit.timelinePhased.log, Kit.timelinePhased.clock
 * @extends   viz.timeline
 * @config    Kit.timelinePhased.mount(box, opts) | phases [{id, name, state done | now | next | later, events [{id, at, title, text, by, state, needsYou}]}], timeZone, label, words, stateEnum, onPick; returns {update, destroy}
 * @config    Kit.timelinePhased.log(box, opts) | rows [[time, cell, ...]], columns, label; returns {destroy}
 * @tokens    --panel --sunk --ink --ink-2 --ink-3 --rule --rule-2 --accent --accent-ink --f-ui --f-mono --f-display --warn --seam?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | an earlier board's war-room skin | a vertical rail of tasks by phase with a zulu clock and day column, a siren on what awaits you, a time-first reference table drawn as an event log
 * @preview   {"render": "viz.timeline-phased", "samples": ["kit/samples/timeline-phased.json"], "uses": ["kit.vocab"]}
 * @changed   Extends viz.timeline as new files; timeline.js and timeline.css are unchanged.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const WORDS = { done: 'Cleared', now: 'Active', next: 'Next', later: 'Later', closed: (n, m) => n + ' of ' + m + ' closed', ping: 'Needs you' };
const pad = n => String(n).padStart(2, '0');
function clock(iso, tz) {
  const d = new Date(iso); if (!isFinite(d)) return null; tz = tz || 'UTC';
  const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: tz }).format(d);
  const c = tz === 'UTC' ? pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + 'Z' : new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(d);
  return { clock: c, day, iso: d.toISOString() };
}
function mount(box, o) {
  o = Object.assign({ timeZone: 'UTC', stateEnum: 'state' }, o); let W = Object.assign({}, WORDS, o.words), phases = o.phases || [];
  const root = el('div', 'kit-tp'); if (o.label) root.setAttribute('aria-label', o.label), root.setAttribute('role', 'group'); box.replaceChildren(root);
  function event(e) {
    const li = el('li', 'kit-tp-ev'); li.dataset.id = e.id; if (e.needsYou) li.dataset.ping = '';
    const t = e.at ? clock(e.at, o.timeZone) : null; const time = el('div', 'kit-tp-time');
    if (t) { const tt = el('time', null, t.clock); tt.dateTime = t.iso; time.append(tt, el('span', null, t.day)); } else time.append(el('span', null, '—'));
    const dot = el('span', 'kit-tp-dot'); dot.setAttribute('aria-hidden', 'true');
    const card = el(o.onPick ? 'button' : 'article', 'kit-tp-card'); if (o.onPick) { card.type = 'button'; card.addEventListener('click', () => o.onPick(e)); }
    const head = el('div', 'kit-tp-h'); if (e.id != null) head.append(el('span', 'kit-tp-id', e.id)); head.append(el('span', 'kit-tp-t', e.title));
    card.append(head);
    const mid = el('div', 'kit-tp-chips');
    if (e.state && Kit.vocab) { const p = Kit.vocab.pill(o.stateEnum, e.state, { short: true }); if (p) mid.append(p); } else if (e.state) mid.append(el('span', 'kit-tp-state', e.state));
    if (e.needsYou) mid.append(el('span', 'kit-tp-ping', W.ping));
    if (mid.childNodes.length) card.append(mid);
    if (e.text) card.append(el('p', 'kit-tp-text', e.text));
    if (e.by) card.append(el('span', 'kit-tp-by', e.by));
    li.append(time, dot, card); return li;
  }
  function draw() {
    root.replaceChildren(); const ol = el('ol', 'kit-tp-rail'); root.append(ol);
    phases.forEach((p, i) => {
      const evs = p.events || [], closed = evs.filter(e => e.state === 'done').length, li = el('li', 'kit-tp-phase'); li.dataset.state = p.state || 'later';
      const h = el('div', 'kit-tp-ph'); h.append(el('span', 'kit-tp-n', pad(i + 1)), el('h3', null, p.name), el('span', 'kit-tp-pst', W[p.state] || p.state || ''), el('span', 'kit-tp-pc', W.closed(closed, evs.length)));
      li.append(h);
      if (evs.length) { const ul = el('ol', 'kit-tp-evs'); evs.forEach(e => ul.append(event(e))); li.append(ul); }
      ol.append(li);
    });
  }
  draw();
  return { update(patch) { Object.assign(o, patch || {}); if (patch && patch.words) W = Object.assign({}, WORDS, patch.words); if (patch && patch.phases) phases = patch.phases; draw(); }, destroy() { box.replaceChildren(); } };
}
function log(box, o) {
  o = o || {}; const root = el('ol', 'kit-tp-log'); if (o.label) root.setAttribute('aria-label', o.label);
  (o.rows || []).forEach(r => {
    r = Array.isArray(r) ? r : []; const li = el('li'); li.append(el('time', null, r[0] == null ? '' : String(r[0])));
    const cells = el('span'); cells.textContent = r.slice(1).filter(c => c != null && c !== '').join(' · '); li.append(cells); root.append(li);
  });
  box.replaceChildren(root);
  return { destroy() { box.replaceChildren(); } };
}
Kit.timelinePhased = Object.freeze({ mount, log, clock });
})();
/* /part:page.script.kit.viz.timeline-phased */

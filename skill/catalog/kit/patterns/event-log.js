/* part:page.script.kit.event-log */
/**
 * Event log and activity feed
 * Kit.eventLog.mount(box, {events, timeZone, remember}) sorts events newest first and groups them by day. A day is a button with its date, a count of moves and a strip of dots; the newest days start open until about 24 moves are in view, and Expand all and Collapse all show when there is more than one day. A run of the same actor doing the same thing to the same subject folds into one row with a count chip (fold: false keeps them apart). Pressing a row fills a panel (beside the list from 720px of the log's own width, under it below that) with the status, who, when, how many moves are on the subject, the times of a folded run and the other moves on the subject; Newer and Older step through the log. The panel sticks under --kit-topbar-h. Up and Down arrows move between rows. Which days are open is remembered under your key. A status is a glyph and a word from the vocabulary table; the file adds log-status only if the page has not defined it.
 *
 * Every move on a piece of work, newest first, that stays one short scroll however long it gets. Days fold behind a header with a count and a strip of dots; the newest
 * days open until about 24 moves are in view. A run of the same actor doing the same thing to the same subject folds into one row with a count chip and the span of times. Pressing a
 * row fills a panel beside the list (under it on a narrow screen) with who, when, the subject's other moves, and Newer and Older buttons that step through the log. The panel sticks
 * under a top bar whose height the page puts in --kit-topbar-h. Which days are open is remembered in this browser when you give a key.
 * Every status word, glyph and tone comes from the vocabulary table (kit/vocab.js). This file adds the enum "log-status" only when the page has not defined it; pass your own as
 * statusEnum. A status is always a glyph and a word, never colour alone.
 *
 * API:
 *   Kit.eventLog.mount(box, opts) -> {select(id), step(dir), expandAll(), collapseAll(), update(events), selected(), destroy()}
 *     events      [{id, at (ISO), by, what, subject, status}]      any order; the log sorts newest first
 *     statusEnum  vocabulary enum of the status (default "log-status")       timeZone  for days and clock times (default: the viewer's; the preview passes "UTC")
 *     openLimit   how many moves the newest open days may hold at the start (default 24)      fold  false keeps repeated moves as separate rows (default true)
 *     remember    a localStorage key for the open days (guarded; the page works without it)       onSelect  (event) after a selection
 *     label       the log's name for assistive tech (default "Activity log")
 * Methods of what Kit.eventLog.mount returns: select(id), step(dir), expandAll, collapseAll, update(events)
 *
 * @id        pattern.event-log
 * @kind      component
 * @group     Patterns
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   Every move newest first: days that fold with a count and a dot strip, repeats folded into one row with a count chip, and a sticky panel for the selected move with Newer and Older.
 * @tags      event log, activity, feed, history, timeline, days, fold, repeat, detail panel, sticky
 * @requires  kit.tokens, kit.vocab, kit.keep-state
 * @files     kit/patterns/event-log.css, kit/samples/patterns.json
 * @provides  Kit.eventLog.mount
 * @config    Kit.eventLog.mount(box, opts) | events [{id, at, by, what, subject, status}], statusEnum, timeZone, openLimit, fold, remember, onSelect, label; returns {select, step, expandAll, collapseAll, selected, update, destroy}
 * @config    --kit-topbar-h | optional custom property: the height of a sticky top bar, so the panel sticks beneath it
 * @tokens    --panel --sunk --ink --ink-2 --rule --rule-2 --accent --f-ui --f-mono --kit-topbar-h? --seam?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | an earlier board's timeline | days that fold, the sticky event panel with step buttons and the Expand all control
 * @source    Catalog harvest, 2026-10-25 | a component family's delivery feed and delivery stamp | repeats folded into one row with a count
 * @source    Catalog harvest, 2026-10-25 | a component family's task history | a move with what it carried, in order
 * @preview   {"render": "pattern.event-log", "samples": ["kit/samples/patterns.json#event-log"]}
 * @changed   Rebuilt over events {id, at, by, what, subject, status} instead of the source's task log; the status is a vocabulary row.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const V = () => Kit.vocab;
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const DEFAULTS = {
  'log-status': {
    created: { word: 'Created', short: 'created', glyph: 'dot', tone: 'neutral', motion: 'none' },
    started: { word: 'Started', short: 'started', glyph: 'play', tone: 'active', motion: 'none' },
    changed: { word: 'Changed', short: 'changed', glyph: 'diamond', tone: 'info', motion: 'none' },
    asked: { word: 'Asked a question', short: 'asked', glyph: 'question', tone: 'attention', motion: 'none' },
    answered: { word: 'Answered', short: 'answered', glyph: 'reply', tone: 'review', motion: 'none' },
    blocked: { word: 'Blocked', short: 'blocked', glyph: 'stop', tone: 'danger', motion: 'none' },
    finished: { word: 'Finished', short: 'finished', glyph: 'check', tone: 'success', motion: 'none' },
  },
};
function ensure() { const t = {}; for (const [en, rows] of Object.entries(DEFAULTS)) for (const [v, r] of Object.entries(rows)) if (V().get(en, v) === undefined) (t[en] = t[en] || {})[v] = r; if (Object.keys(t).length) V().define(t); }

function mount(box, opts) {
  ensure();
  const o = Object.assign({ events: [], statusEnum: 'log-status', openLimit: 24, fold: true, label: 'Activity log' }, opts);
  let events = [], days = [], flat = [], sel = null;
  const openDays = new Set(), seenDays = new Set();
  const sk = o.remember ? 'kit-ev:' + o.remember : null;
  let stored = null; if (sk) { try { stored = JSON.parse(localStorage.getItem(sk) || 'null'); } catch (_) { stored = null; } }
  if (stored && Array.isArray(stored.open)) stored.open.forEach(d => { openDays.add(d); seenDays.add(d); });
  const saveOpen = () => { if (sk) { try { localStorage.setItem(sk, JSON.stringify({ open: [...openDays] })); } catch (_) {} } };
  const fmt = (iso, opt) => { try { return new Date(iso).toLocaleString(undefined, Object.assign({ timeZone: o.timeZone }, opt)); } catch (_) { return String(iso); } };
  const dayKey = iso => { try { return new Date(iso).toLocaleDateString('en-CA', { timeZone: o.timeZone }); } catch (_) { return String(iso).slice(0, 10); } };
  const dayLabel = iso => fmt(iso, { weekday: 'short', day: 'numeric', month: 'short' });
  const hm = iso => fmt(iso, { hour: '2-digit', minute: '2-digit' });

  function build(list) {
    events = list.slice().sort((a, b) => (b.at < a.at ? -1 : b.at > a.at ? 1 : 0) || String(b.id).localeCompare(String(a.id)));
    flat = events;
    days = [];
    events.forEach(e => {
      const k = dayKey(e.at); let d = days[days.length - 1]; if (!d || d.key !== k) { d = { key: k, label: dayLabel(e.at), rows: [], n: 0, evs: [] }; days.push(d); }
      d.n++; d.evs.push(e);
      const last = d.rows[d.rows.length - 1];
      if (o.fold && last && last.by === e.by && last.what === e.what && last.subject === e.subject && last.status === e.status) last.evs.push(e);
      else d.rows.push({ by: e.by, what: e.what, subject: e.subject, status: e.status, evs: [e] });
    });
    let n = 0; const first = seenDays.size === 0;
    days.forEach(d => { if (!seenDays.has(d.key)) { seenDays.add(d.key); if (!first || n < o.openLimit) openDays.add(d.key); } n += d.n; });
    if (!sel || !flat.some(e => e.id === sel)) sel = flat.length ? flat[0].id : null;
  }

  box.classList.add('kit-ev'); box.replaceChildren();
  const head = el('div', 'kit-ev-bar'), listBox = el('ol', 'kit-ev-list'), panel = el('aside', 'kit-ev-panel');
  listBox.setAttribute('aria-label', o.label); panel.setAttribute('aria-label', 'Selected move'); panel.setAttribute('aria-live', 'polite');
  const cols = el('div', 'kit-ev-cols'), left = el('div', 'kit-ev-left'); left.append(listBox); cols.append(left, panel); box.append(head, cols);

  function chipOf(st) { return V().chip(o.statusEnum, st, { unknown: 'flag' }); }
  function rowEl(r) {
    const li = el('li', 'kit-ev-item'), newest = r.evs[0], on = r.evs.some(e => e.id === sel);
    const b = el('button', 'kit-ev-row'); b.type = 'button'; b.setAttribute('aria-pressed', String(on)); b.setAttribute('data-keep', 'ev-' + newest.id); b.dataset.id = newest.id;
    const t = el('time', 'kit-ev-time', hm(newest.at)); t.dateTime = newest.at;
    const what = el('span', 'kit-ev-what'), top = el('span', 'kit-ev-top'); const c = chipOf(r.status); if (c) top.append(c);
    if (r.subject) top.append(el('code', null, r.subject));
    if (r.evs.length > 1) { const n = el('b', 'kit-ev-n', r.evs.length + '×'); n.title = 'Repeated ' + r.evs.length + ' times'; n.setAttribute('aria-label', 'repeated ' + r.evs.length + ' times'); top.append(n); }
    what.append(top, el('span', 'kit-ev-line', r.by + ' ' + r.what));
    b.append(t, what); b.addEventListener('click', () => api.select(newest.id));
    b.addEventListener('keydown', ev => {
      if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return; const all = [...listBox.querySelectorAll('.kit-ev-row')]; const i = all.indexOf(b); const nx = all[i + (ev.key === 'ArrowDown' ? 1 : -1)]; if (nx) { ev.preventDefault(); nx.focus(); }
    });
    li.append(b); return li;
  }
  function drawList() {
    listBox.textContent = '';
    if (!days.length) { const e = el('li', 'kit-ev-empty', 'Nothing has moved yet. Every change, question and answer lands here, newest first.'); listBox.append(e); return; }
    days.forEach(d => {
      const open = openDays.has(d.key), li = el('li', 'kit-ev-day'), b = el('button', 'kit-ev-dayb'); b.type = 'button'; b.setAttribute('aria-expanded', String(open)); b.setAttribute('data-keep', 'evd-' + d.key);
      const dots = el('span', 'kit-ev-dots'); dots.setAttribute('aria-hidden', 'true');
      d.evs.slice(0, 24).forEach(e => { const r = V().get(o.statusEnum, e.status); const i = el('i'); i.setAttribute('data-vo-tone', r ? r.tone : 'neutral'); dots.append(i); });
      b.append(el('span', 'kit-ev-chev'), el('span', 'kit-ev-dd', d.label), el('span', 'kit-ev-dn', d.n + (d.n === 1 ? ' move' : ' moves')), dots);
      b.addEventListener('click', () => { if (openDays.has(d.key)) openDays.delete(d.key); else openDays.add(d.key); saveOpen(); redraw(); });
      li.append(b); listBox.append(li);
      if (open) d.rows.forEach(r => listBox.append(rowEl(r)));
    });
  }
  function drawBar() {
    head.textContent = ''; head.hidden = days.length < 2; if (days.length < 2) return;
    head.append(el('span', 'kit-ev-count', events.length + ' moves over ' + days.length + ' days'));
    const ctl = el('span', 'kit-ev-ctl'); [['Expand all', () => api.expandAll()], ['Collapse all', () => api.collapseAll()]].forEach(([l, f]) => { const b = el('button', 'kit-ev-btn', l); b.type = 'button'; b.setAttribute('data-keep', 'ev-' + l.replace(/\W+/g, '-').toLowerCase()); b.addEventListener('click', f); ctl.append(b); }); head.append(ctl);
  }
  function drawPanel() {
    panel.textContent = ''; const i = flat.findIndex(e => e.id === sel), e = flat[i]; panel.hidden = !flat.length;
    if (!e) { if (flat.length) panel.append(el('p', 'kit-ev-pempty', 'Select a move to see what happened.')); return; }
    const bar = el('div', 'kit-ev-pbar'); bar.append(el('span', 'kit-ev-pos', 'Move ' + (i + 1) + ' of ' + flat.length));
    const nav = el('span', 'kit-ev-nav');
    const mk = (lab, d, dis, key) => { const b = el('button', 'kit-ev-step', lab); b.type = 'button'; b.disabled = dis; b.dataset.dir = d < 0 ? 'newer' : 'older'; b.setAttribute('data-keep', key); b.addEventListener('click', () => api.step(d)); return b; };
    nav.append(mk('Newer', -1, i <= 0, 'ev-newer'), mk('Older', 1, i >= flat.length - 1, 'ev-older')); bar.append(nav); panel.append(bar);
    const top = el('div', 'kit-ev-ptop'); const p = V().pill(o.statusEnum, e.status, { unknown: 'flag' }); if (p) top.append(p); if (e.subject) top.append(el('h3', null, e.subject)); panel.append(top);
    const who = el('p', 'kit-ev-pwho'); who.append(el('b', null, e.by), document.createTextNode(' ' + e.what)); panel.append(who);
    const dl = el('dl', 'kit-ev-facts'); const f = (k, v) => { dl.append(el('dt', null, k), el('dd', null, v)); };
    f('When', fmt(e.at, { dateStyle: 'full', timeStyle: 'short' })); f('Who', e.by);
    const same = e.subject ? flat.filter(x => x.subject === e.subject) : [e]; f('On this subject', same.length + (same.length === 1 ? ' move' : ' moves'));
    const row = days.flatMap(d => d.rows).find(r => r.evs.some(x => x.id === e.id));
    if (row && row.evs.length > 1) f('Repeated', row.evs.length + ' times, ' + row.evs.slice().reverse().map(x => hm(x.at)).join(', '));
    panel.append(dl);
    if (same.length > 1) {
      const sec = el('div', 'kit-ev-same'); sec.append(el('h4', null, 'Other moves on ' + e.subject)); const ul = el('ul');
      same.slice(0, 8).forEach(x => { const li = el('li'), b = el('button', x.id === e.id ? 'on' : null); b.type = 'button'; b.setAttribute('data-keep', 'ev-same-' + x.id); const c = chipOf(x.status); if (c) b.append(c); b.append(el('span', null, x.what), el('time', null, fmt(x.at, { weekday: 'short', hour: '2-digit', minute: '2-digit' }))); b.addEventListener('click', () => api.select(x.id)); li.append(b); ul.append(li); });
      sec.append(ul); if (same.length > 8) sec.append(el('small', null, 'and ' + (same.length - 8) + ' earlier')); panel.append(sec);
    }
  }
  function draw() { drawBar(); drawList(); drawPanel(); }
  const redraw = Kit.keepState && Kit.keepState.wrap ? Kit.keepState.wrap(box, draw) : draw;
  const api = {
    select(id) {
      const e = flat.find(x => x.id === id); if (!e) return; sel = id; openDays.add(dayKey(e.at)); saveOpen(); redraw();
      const b = listBox.querySelector('.kit-ev-row[aria-pressed="true"]'); if (b && b.scrollIntoView) b.scrollIntoView({ block: 'nearest' });
      if (o.onSelect) o.onSelect(e);
    },
    step(dir) { const i = flat.findIndex(e => e.id === sel), n = flat[i + dir]; if (n) api.select(n.id); },
    expandAll() { days.forEach(d => openDays.add(d.key)); saveOpen(); redraw(); },
    collapseAll() { openDays.clear(); saveOpen(); redraw(); },
    selected: () => flat.find(e => e.id === sel) || null,
    update(list) { build(list || []); redraw(); },
    destroy() { box.replaceChildren(); box.classList.remove('kit-ev'); },
  };
  build(o.events); redraw(); return api;
}
Kit.eventLog = Object.freeze({ mount });
})();
/* /part:page.script.kit.event-log */

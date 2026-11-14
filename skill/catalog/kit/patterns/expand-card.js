/* part:page.script.kit.expand-card */
/**
 * Expandable work card
 * Kit.expandCard.mount(box, {cards, dims, states, remember, open, onToggle}) builds one details card per workstream: number, title, pills, the outcome line and a matrix with one cell per dimension (letter, symbol, word). The state vocabulary is yes, partly, no, not verified, not applicable and reverted, and each has a symbol, so the state never rides on colour. Sections hold lists, text, label-value rows and tag rows. highlight(ids) dims the others and outlines the listed cards; filter(fn) hides cards; legend(box) writes the vocabulary. Which cards are open is saved to localStorage under your key inside try/catch, and onToggle reports it for a board that keeps it elsewhere.
 *
 * A card per workstream with a title, its outcome line and a status matrix of small cells (one per dimension: committed, pushed, applied, verified), that opens to sections of
 * detail (status by dimension, bullet lists, caveats, tag rows). Every status cell carries a symbol and a word, so the state never rides on colour. The cards are details elements; which
 * ones are open is remembered in localStorage under your key (and reported through onToggle for a board that keeps it in its own store). Cards can be dimmed or highlighted from outside
 * (a timeline event picks the cards it touched) and filtered.
 * Plain DOM; text is set with textContent.
 *
 * API:
 *   Kit.expandCard.mount(box, {cards, dims, states, remember, open, onToggle, empty}) -> {highlight(ids), filter(fn), update(cards), openIds(), legend(box), destroy()}
 *     cards     [{id, no, title, outcome, cells: {dimKey: {state, note}}, pills: [{label, tone}], sections: [{heading, list | text | dl | tags, tone}]}]
 *                 sections: list is string[] (a bulleted list; tone "warn" marks each item with "!"), text is a string, dl is [[label, value]] , tags is [{label, items: string[]}]
 *     dims      [{key, label}]   the matrix columns, in order (default four: C Committed, P Pushed, A Applied, V Verified)
 *     states    {key: {mark, text, tone}}   the status vocabulary; default yes (Yes), part (Partly), no (No), nv (Not verified), na (Not applicable), rev (Reverted); tones ok warn danger accent muted
 *     remember  a localStorage key; omit to keep nothing
 *     open      {id: true} the cards open at the start (wins over what was remembered)
 *     onToggle  (id, open, openMap) after a card opens or closes
 *     empty     the line shown when filter() leaves no card
 *   highlight(ids) dims the other cards and outlines the listed ones; highlight() clears. filter(fn) hides cards where fn(card) is false; filter() clears.
 *   legend(box) writes the state vocabulary into box as a row of sample cells.
 *
 * @id        pattern.expand-card
 * @kind      component
 * @group     Patterns
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   A workstream card with a status matrix of symbol-and-word cells and an expanding body; remembers what is open.
 * @tags      card, status, matrix, workstream, expand, details, legend, highlight, remember
 * @requires  none
 * @files     kit/patterns/expand-card.css, kit/samples/expand-card.json
 * @provides  Kit.expandCard.mount, Kit.expandCard.states
 * @config    Kit.expandCard.mount(box, opts) | cards [{id, no, title, outcome, cells {dimKey: {state, note}}, pills, sections}], dims [{key, label}], states, remember (localStorage key), open {id: true}, onToggle(id, open, openMap), empty; returns {highlight, filter, update, openIds, legend, destroy}
 * @tokens    --panel --sunk --ink --ink-2 --rule --rule-2 --accent --ok --warn --danger --f-ui --f-mono --seam?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | 1 artifact's index.html | a work-status board's expandable workstream cards (renderCards, openCards) and its C/P/A/V status matrix cells
 * @preview   {"render": "pattern.expand-card", "samples": ["kit/samples/expand-card.json"]}
 * @changed   Every status cell has a symbol and a word; the source separated the states by colour and border style.
 * @changed   The dimensions are data (dims), not the fixed four of the source.
 * @changed   The open set is optional and survives a blocked localStorage.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const STATES = {
  yes: { mark: '✓', text: 'Yes', tone: 'ok' }, part: { mark: '◐', text: 'Partly', tone: 'warn' }, no: { mark: '✕', text: 'No', tone: 'danger' },
  nv: { mark: '?', text: 'Not verified', tone: 'accent' }, na: { mark: '–', text: 'Not applicable', tone: 'muted' }, rev: { mark: '↺', text: 'Reverted', tone: 'muted' },
};
const DIMS = [{ key: 'C', label: 'Committed' }, { key: 'P', label: 'Pushed' }, { key: 'A', label: 'Applied' }, { key: 'V', label: 'Verified' }];

function cellEl(d, s, c) {
  const st = s[c.state] || { mark: '', text: String(c.state || ''), tone: 'muted' };
  const x = el('div', 'kit-xc-cell'); x.dataset.tone = st.tone; x.dataset.state = c.state;
  x.title = d.label + ': ' + st.text + (c.note ? '. ' + c.note : '');
  x.append(el('b', null, d.key), el('span', null, st.mark + ' ' + st.text)); return x;
}
function section(sec) {
  const box = el('div', 'kit-xc-sec'); box.append(el('h4', null, sec.heading));
  if (sec.list) { const ul = el('ul', sec.tone === 'warn' ? 'kit-xc-warn' : null); sec.list.forEach(t => ul.append(el('li', null, t))); box.append(ul); }
  if (sec.text) box.append(el('p', null, sec.text));
  if (sec.dl) { const dl = el('dl', 'kit-xc-dl'); sec.dl.forEach(([k, v]) => { dl.append(el('dt', null, k)); const dd = el('dd'); if (v instanceof Node) dd.append(v); else dd.textContent = v; dl.append(dd); }); box.append(dl); }
  if (sec.tags) sec.tags.forEach(g => { const row = el('div', 'kit-xc-tags'); row.append(el('span', 'kit-xc-lbl', g.label)); (g.items.length ? g.items : ['none']).forEach(t => row.append(el('span', 'kit-xc-tag', t))); box.append(row); });
  return box;
}
function mount(box, opts) {
  const o = Object.assign({ cards: [], dims: DIMS, remember: null, open: null, onToggle: null, empty: 'No card matches these filters.' }, opts);
  const states = Object.assign({}, STATES, o.states);
  let cards = o.cards.slice(), hl = null, flt = null;
  let openMap = {};
  if (o.remember) { try { openMap = JSON.parse(localStorage.getItem(o.remember) || '{}') || {}; } catch (_) { openMap = {}; } }
  if (o.open) openMap = Object.assign({}, openMap, o.open);
  const save = () => { if (o.remember) { try { localStorage.setItem(o.remember, JSON.stringify(openMap)); } catch (_) {} } };
  box.classList.add('kit-xc'); box.replaceChildren();
  const status = el('p', 'kit-xc-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const list = el('div', 'kit-xc-list'); list.setAttribute('role', 'list'); box.append(status, list);

  function paint() {
    list.replaceChildren();
    const vis = cards.filter(c => !flt || flt(c));
    status.textContent = vis.length === cards.length ? '' : vis.length + ' of ' + cards.length + ' cards';
    if (!vis.length) { list.append(el('p', 'kit-xc-empty', o.empty)); return; }
    vis.forEach(c => {
      const wrap = el('div'); wrap.setAttribute('role', 'listitem');
      const d = el('details', 'kit-xc-card'); d.dataset.id = c.id; if (openMap[c.id]) d.open = true;
      if (hl) d.classList.add(hl.includes(String(c.id)) ? 'hl' : 'dim');
      const s = el('summary'); const ti = el('div', 'kit-xc-ti');
      if (c.no != null) ti.append(el('span', 'kit-xc-no', '#' + c.no));
      ti.append(el('span', 'kit-xc-name', c.title));
      (c.pills || []).forEach(p => { const x = el('span', 'kit-xc-pill', p.label); x.dataset.tone = p.tone || 'muted'; ti.append(x); });
      const mx = el('div', 'kit-xc-mx'); mx.setAttribute('role', 'group'); mx.setAttribute('aria-label', 'Status by dimension');
      o.dims.forEach(dm => { const cell = (c.cells || {})[dm.key]; if (cell) mx.append(cellEl(dm, states, cell)); });
      s.append(ti, mx); if (c.outcome) s.append(el('p', 'kit-xc-oc', c.outcome));
      const body = el('div', 'kit-xc-body');
      const dimsec = o.dims.filter(dm => (c.cells || {})[dm.key]).map(dm => { const x = c.cells[dm.key], st = states[x.state] || { mark: '', text: x.state }; return [dm.label, st.mark + ' ' + st.text + (x.note ? '. ' + x.note : '')]; });
      if (dimsec.length) body.append(section({ heading: 'Status by dimension', dl: dimsec }));
      (c.sections || []).forEach(sec => body.append(section(sec)));
      d.append(s, body);
      d.addEventListener('toggle', () => { if (d.open) openMap[c.id] = true; else delete openMap[c.id]; save(); if (o.onToggle) o.onToggle(c.id, d.open, Object.assign({}, openMap)); });
      wrap.append(d); list.append(wrap);
    });
  }
  paint();
  return {
    highlight(ids) { hl = ids && ids.length ? ids.map(String) : null; paint(); },
    filter(fn) { flt = fn || null; paint(); },
    update(next) { cards = next.slice(); paint(); },
    openIds: () => Object.keys(openMap),
    legend(target) {
      target.classList.add('kit-xc-legend'); target.replaceChildren();
      Object.entries(states).forEach(([k, st]) => { const x = el('span', 'kit-xc-cell inline'); x.dataset.tone = st.tone; x.append(el('span', null, st.mark + ' ' + st.text)); target.append(x); });
    },
    destroy() { box.replaceChildren(); box.classList.remove('kit-xc'); },
  };
}
Kit.expandCard = Object.freeze({ mount, states: STATES });
})();
/* /part:page.script.kit.expand-card */

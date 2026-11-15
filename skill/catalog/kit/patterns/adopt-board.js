/* part:page.script.kit.adopt-board */
/**
 * Adopt board
 * The candidates of an adoption as a dependency map with state chips, and the selected one beside it: its files, what it provides and needs, the moves a person may make, a box to send work to Claude, and the download of its .adp pack.
 *
 * The board holds no storage and talks to no one. The page gives it candidates and takes back what the person did through the callbacks, then writes the db and sends the request.
 *
 * API:
 *   Kit.adoptBoard.mount(root, {candidates, selected, packs, readOnly, onSelect, onMove, onWork, onNote}) -> {setCandidates(list), select(id), setPacks(packs), setStatus(text, tone), destroy()}
 *     setStatus   the line beside the legend, for the page's save status: tone ok, warn or danger
 *     candidates  [{id, name, state, files, provides, needs, needed_by, similar, summary, suggested_id, notes}]
 *     selected    the id shown in the work panel
 *     packs       {candidate id: the adp-pack/1 object, or {name, text}} that can be downloaded
 *     onSelect    (id) a node or a list row was pressed
 *     onMove      (id, state) a move button was pressed (the page checks Kit.adopt.can again and writes it)
 *     onWork      (id, text) Send to Claude; resolves or rejects, and the panel says which
 *     onNote      (id, text) the notes field lost focus with a change
 *
 * Arrow keys move between nodes in the map; every node is a button with its name, state and size in words.
 *
 * @id        pattern.adopt-board
 * @kind      component
 * @group     Patterns
 * @status    new
 * @version   0.2.0
 * @updated   2026-11-15
 * @summary   The adoption's candidates as a dependency map coloured by state, with state filters and a work panel: moves, a box to Claude and the .adp download.
 * @tags      adopt, candidates, graph, map, state, kit, extract, claude, work
 * @requires  kit.adopt
 * @files     kit/patterns/adopt-board.css
 * @provides  Kit.adoptBoard.mount
 * @config    Kit.adoptBoard.mount(root, opts) | candidates, selected, packs, readOnly, onSelect(id), onMove(id, state), onWork(id, text), onNote(id, text)
 * @tokens    --panel --sunk --ink --ink-2 --rule --accent --accent-ink --ok --warn --danger --f-ui --f-mono
 * @globals   none
 * @db        none
 * @source    Adopt workbench, 2026-11-15 | docs/adopt.md | the map and work views
 * @changed   paths of adopted candidates stay lit green, what they need shows amber (red when discarded), discarded nodes are struck through, working ones pulse; a legend and a status line for the page's save state.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const SVGNS = 'http://www.w3.org/2000/svg';
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const sv = (tag, attrs) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); return e; };
const kb = n => n >= 1024 ? Math.round(n / 1024) + ' KB' : n + ' B';
const A = () => Kit.adopt;

function mount(root, opts) {
  const o = Object.assign({ candidates: [], selected: null, packs: {}, readOnly: false }, opts);
  let cands = o.candidates.slice(), sel = o.selected, packs = o.packs || {}, filter = 'all', dead = false;
  root.classList.add('kit-ab'); root.replaceChildren();
  const bar = el('div', 'kit-ab-bar'); bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Filter candidates by state');
  const split = el('div', 'kit-ab-split'), mapBox = el('div', 'kit-ab-map'), side = el('div', 'kit-ab-side');
  const legend = el('p', 'kit-ab-legend'), status = el('span', 'kit-ab-status'); status.setAttribute('role', 'status');
  [['on', 'green: a path you are adopting'], ['need', 'amber: needed, not adopted yet'], ['bad', 'red: needed, but discarded'], ['off', 'grey: discarded']].forEach(x => { const s = el('span', 'kit-ab-key ' + x[0], x[1]); legend.append(s); });
  legend.append(status);
  split.append(mapBox, side); root.append(bar, legend, split);

  const byId = id => cands.find(c => c.id === id) || null;
  const shown = () => cands.filter(c => filter === 'all' || c.state === filter);

  function paintBar() {
    const n = A().counts(cands); bar.replaceChildren();
    ['all'].concat(A().STATES).forEach(s => {
      const b = el('button', 'kit-ab-chip', (s === 'all' ? 'All' : A().label(s)) + ' ' + n[s]); b.type = 'button'; b.dataset.tone = s === 'all' ? '' : A().tone(s);
      b.setAttribute('aria-pressed', String(filter === s)); b.addEventListener('click', () => { filter = s; paint(); }); bar.append(b);
    });
  }

  function paintMap() {
    mapBox.replaceChildren();
    const list = shown();
    if (!list.length) { mapBox.append(el('p', 'kit-ab-empty', cands.length ? 'No candidate is in this state.' : 'No candidates yet. Run adp.py extract on the artifact and load candidates.json.')); return; }
    const ids = new Set(list.map(c => c.id)), L = A().layout(list, { width: Math.max(0, mapBox.clientWidth - 14) }), pos = {}; L.nodes.forEach(n => { pos[n.id] = n; });
    const cl = A().closure(cands), by = {}; cands.forEach(c => { by[c.id] = c; });      // over every candidate, so a filter does not change what is lit
    const svg = sv('svg', { class: 'kit-ab-svg', viewBox: '0 0 ' + L.width + ' ' + L.height, width: L.width, height: L.height, role: 'group', 'aria-label': 'Dependency map: an arrow runs from what is needed to what needs it' });
    const defs = sv('defs');
    ['', 'on', 'conflict'].forEach(k => {
      const mk = sv('marker', { id: 'kit-ab-arrow' + (k ? '-' + k : ''), viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 7, markerHeight: 7, orient: 'auto' });
      mk.append(sv('path', { d: 'M0 0L8 4L0 8z', class: 'kit-ab-head' + (k ? ' ' + k : '') })); defs.append(mk);
    });
    svg.append(defs);
    const drawn = [];
    L.edges.forEach(e => {
      const a = pos[e.from], b = pos[e.to]; if (!a || !b || !ids.has(e.from) || !ids.has(e.to)) return;
      const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2, mx = (x1 + x2) / 2, kind = A().edgeKind(e, by, cl);
      const p = sv('path', { d: 'M' + x1 + ' ' + y1 + 'C' + mx + ' ' + y1 + ' ' + mx + ' ' + y2 + ' ' + x2 + ' ' + y2, class: 'kit-ab-edge' + (kind ? ' ' + kind : ''), 'marker-end': 'url(#kit-ab-arrow' + (kind === 'on' || kind === 'conflict' ? '-' + kind : '') + ')' });
      if (sel && (e.from === sel || e.to === sel)) p.classList.add('sel');
      (kind ? drawn.push(p) : svg.append(p));
    });
    drawn.forEach(p => svg.append(p));      // lit paths on top of the quiet ones
    mapBox.append(svg);
    const layer = el('div', 'kit-ab-nodes'); layer.style.width = L.width + 'px'; layer.style.height = L.height + 'px';
    L.nodes.forEach(n => {
      const c = byId(n.id), b = el('button', 'kit-ab-node'); b.type = 'button'; b.dataset.id = c.id; b.dataset.state = c.state; b.dataset.tone = A().tone(c.state);
      const need = cl.required[c.id], bad = cl.conflicts.indexOf(c.id) >= 0;
      if (need && !bad) b.dataset.need = 'yes'; if (bad) b.dataset.need = 'conflict';
      b.style.cssText = 'left:' + n.x + 'px;top:' + n.y + 'px;width:' + n.w + 'px;height:' + n.h + 'px';
      const word = A().label(c.state) + (need ? (bad ? ' · needed, but discarded' : ' · needed by ' + need.length) : '');
      b.setAttribute('aria-pressed', String(sel === c.id)); b.setAttribute('aria-label', c.name + ', ' + word + ', ' + kb(c.bytes || 0));
      const t = el('span', 'kit-ab-nm', (c.state === 'ready' ? '✓ ' : '') + c.name), m = el('span', 'kit-ab-meta', word + ' · ' + kb(c.bytes || 0)); b.append(t, m);
      if (c.state === 'working') b.append(el('span', 'kit-ab-work-dot'));
      if ((c.similar || []).length) { const s = el('span', 'kit-ab-sim', '≈'); s.title = 'Looks like ' + c.similar.map(x => x.id).join(', '); b.append(s); }
      b.addEventListener('click', () => choose(c.id)); layer.append(b);
    });
    layer.addEventListener('keydown', e => {
      if (e.key.indexOf('Arrow') !== 0) return;
      const all = Array.prototype.slice.call(layer.children), i = all.indexOf(document.activeElement); if (i < 0) return;
      const j = Math.max(0, Math.min(all.length - 1, i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1))); all[j].focus(); e.preventDefault();
    });
    mapBox.append(layer);
  }

  function row(label, items) {
    const d = el('div', 'kit-ab-row'); d.append(el('b', '', label));
    d.append(el('span', '', items && items.length ? items.join(', ') : 'none')); return d;
  }

  function paintSide() {
    side.replaceChildren();
    const c = byId(sel);
    if (!c) { side.append(el('p', 'kit-ab-empty', 'Pick a candidate in the map, or an element in the preview.')); return; }
    const h = el('div', 'kit-ab-h'), name = el('h3', '', c.name), st = el('span', 'kit-ab-state', A().label(c.state)); st.dataset.tone = A().tone(c.state); h.append(name, st); side.append(h);
    if (c.summary) side.append(el('p', 'kit-ab-sum', c.summary));
    side.append(row('Becomes', [c.suggested_id || ''].filter(Boolean)), row('Files', (c.files || []).map(f => f.path + ' (' + kb(f.bytes) + ')')), row('Provides', c.provides),
      row('Needs', c.needs), row('Needed by', c.needed_by), row('Catalog overlap', (c.similar || []).map(x => x.id)));
    if (c.coupling != null) side.append(row('Tied to the artifact', [c.standalone ? 'no, stands alone' : c.coupling + ' references']));
    const cl = A().closure(cands), need = cl.required[c.id];
    if (need) { const bad = cl.conflicts.indexOf(c.id) >= 0; const p = el('p', 'kit-ab-req' + (bad ? ' bad' : ''), bad ? 'Discarded, but ' + need.join(', ') + ' needs it: restore it or discard those too.' : 'Needed by ' + need.join(', ') + ' (adopted): adopt this one too.'); p.setAttribute('role', 'status'); side.append(p); }
    const moves = el('div', 'kit-ab-moves'); moves.setAttribute('role', 'group'); moves.setAttribute('aria-label', 'Move ' + c.name);
    (A().MOVES[c.state] || []).forEach(m => {
      const b = el('button', 'kit-ab-btn', m.label); b.type = 'button'; b.disabled = o.readOnly; if (m.to === 'ready') b.classList.add('primary');
      b.addEventListener('click', () => { if (o.onMove) o.onMove(c.id, m.to); }); moves.append(b);
    });
    side.append(moves);
    const form = el('form', 'kit-ab-work'), lab = el('label', '', 'Ask Claude about ' + c.name), ta = el('textarea'), go = el('button', 'kit-ab-btn primary', 'Send to Claude'), say = el('p', 'kit-ab-say'); say.setAttribute('role', 'status');
    ta.rows = 3; ta.maxLength = 1500; ta.disabled = o.readOnly; ta.placeholder = 'Make it generic: drop the artifact\'s names, write the header and a sample.'; lab.append(ta); go.type = 'submit'; go.disabled = o.readOnly;
    form.append(lab, go, say);
    form.addEventListener('submit', ev => {
      ev.preventDefault(); const t = ta.value.trim(); if (!t || !o.onWork) return; go.disabled = true; say.textContent = 'Sending.';
      Promise.resolve(o.onWork(c.id, t)).then(() => { ta.value = ''; say.textContent = 'Sent. Follow it on Requests.'; }, e => { say.textContent = (e && e.message) || 'It could not be sent.'; }).then(() => { go.disabled = o.readOnly; });
    });
    side.append(form);
    const nl = el('label', 'kit-ab-notes', 'Notes'), nt = el('textarea'); nt.rows = 2; nt.value = c.notes || ''; nt.disabled = o.readOnly; nl.append(nt);
    nt.addEventListener('change', () => { if (o.onNote) o.onNote(c.id, nt.value); }); side.append(nl);
    const pk = packs[c.id];
    if (pk && c.state === 'ready') {
      const b = el('button', 'kit-ab-btn primary', 'Download ' + (pk.id || c.suggested_id || c.name) + '.adp.json'); b.type = 'button';
      b.addEventListener('click', () => A().download((pk.id || c.suggested_id || c.name) + '.adp.json', pk.text || JSON.stringify(pk, null, 1))); side.append(b);
    } else if (c.state === 'ready') side.append(el('p', 'kit-ab-say', 'Ready, and no pack yet: ask Claude to run adp.py pack and write it to packs/' + c.id + '.'));
  }

  function choose(id) { sel = id; paint(); if (o.onSelect) o.onSelect(id); }
  function paint() { if (dead) return; paintBar(); paintMap(); paintSide(); }
  paint();
  let raf = 0, lastW = mapBox.clientWidth, ro = null;      // the map follows its box: a new width draws it again at that width
  if (window.ResizeObserver) { ro = new ResizeObserver(() => { const w = mapBox.clientWidth; if (w === lastW) return; lastW = w; cancelAnimationFrame(raf); raf = requestAnimationFrame(paintMap); }); ro.observe(mapBox); }
  return {
    setCandidates(l) { cands = (l || []).slice(); paint(); },
    select(id) { sel = id; paint(); },
    setPacks(p) { packs = p || {}; paintSide(); },
    setStatus(text, tone) { status.textContent = text || ''; status.dataset.tone = tone || ''; },
    destroy() { dead = true; if (ro) ro.disconnect(); cancelAnimationFrame(raf); root.replaceChildren(); root.classList.remove('kit-ab'); },
  };
}

Kit.adoptBoard = { mount };
})();
/* /part:page.script.kit.adopt-board */

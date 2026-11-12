/* part:page.script.kit.status-columns */
/* Kit pattern: status columns and lanes (Kit.statusColumns)    kit version 0.1.0
   What it is: cards in one column per state, or per another key the reader switches to (the owner, say). The column that waits for a person is the widest. A column with no cards folds
   to a narrow rail that still says its name and 0, and opens again when pressed. A column can have a limit: its count reads "5 / 4" and it says Over limit in words. Hovering or
   focusing a card shows a glimpse of its note and extras next to it. Moving a card, by dragging it or by the Move menu on the card, asks for a reason first, in a small form above
   the board, and only then changes the card and calls onMove. The state columns, their words, glyphs and tones come from the vocabulary table (kit/vocab.js); the built-in enum
   "state" works out of the box.
   API:
     Kit.statusColumns.mount(box, opts) -> {setGroup(key), filter(fn|null), update(cards), group(), destroy()}
       cards     [{id, title, state, owner, note, extras: [[label, value]], tags: [text]}]
       groups    [{key, label, field, enum, none}]    the ways to group; default [{key: "state", label: "State", field: "state", enum: "state"}, {key: "owner", label: "Owner", field: "owner", none: "Unassigned"}]
                 a group with an enum draws every worded value of it as a column, in the table's order; one without draws the distinct values, sorted, with the empty one last
       group     the key of the starting group (default the first)         limits  {value: n} the most cards a column should hold (state columns), or limit: n for all
       wide      the values whose column is wide (default: those whose tone in the table is "attention")
       reason    false skips the reason form (default true)                 onMove  (card, to, reason) => Promise|void; a rejected promise puts the card back
       remember  a localStorage key for the chosen group and the rails you opened (guarded)         label  the board's name for assistive tech
   Needs from the board:
     css     kit/patterns/status-columns.css, kit/vocab.css; custom properties --panel --sunk --ink --ink-2 --rule --rule-2 --accent --accent-ink --warn --danger --f-ui --f-mono, optional --seam
     globals Kit.vocab, Kit.keepState (their kit files load first)
   db collections: none; the board hands over its cards and writes the move in onMove.
   Lifted from: an earlier board's kanban skin (the waiting column widest, empty columns as rails, the hover glimpse of a card) and a component family's task lanes (a switchable grouping key,
   a limit per lane that shows over-limit, a drop that asks to move). */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const V = () => Kit.vocab;
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const GROUPS = [{ key: 'state', label: 'State', field: 'state', enum: 'state' }, { key: 'owner', label: 'Owner', field: 'owner', none: 'Unassigned' }];
let uid = 0;

function mount(box, opts) {
  const o = Object.assign({ cards: [], groups: GROUPS, reason: true, label: 'Board' }, opts);
  const id = 'kit-sl' + (++uid);
  let note = '', cards = o.cards.map(c => Object.assign({}, c)), gkey = o.group || o.groups[0].key, flt = null, pending = null;
  const opened = new Set();
  const sk = o.remember ? 'kit-sl:' + o.remember : null;
  if (sk) { try { const m = JSON.parse(localStorage.getItem(sk) || 'null'); if (m) { if (o.groups.some(g => g.key === m.group)) gkey = m.group; (m.open || []).forEach(k => opened.add(k)); } } catch (_) {} }
  const save = () => { if (sk) { try { localStorage.setItem(sk, JSON.stringify({ group: gkey, open: [...opened] })); } catch (_) {} } };
  box.classList.add('kit-sl'); box.replaceChildren();
  const bar = el('div', 'kit-sl-bar'), seg = el('div', 'kit-sl-seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Group by');
  const status = el('p', 'kit-sl-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const form = el('div', 'kit-sl-form'); form.hidden = true;
  const scroller = el('div', 'kit-sl-scroll'); scroller.tabIndex = 0; scroller.setAttribute('role', 'region'); scroller.setAttribute('aria-label', o.label);
  const glimpse = el('div', 'kit-sl-glimpse'); glimpse.id = id + '-g'; glimpse.setAttribute('role', 'tooltip'); glimpse.hidden = true;
  bar.append(el('span', 'kit-sl-lab', 'Group by'), seg); box.append(bar, status, form, scroller, glimpse);

  const G = () => o.groups.find(g => g.key === gkey) || o.groups[0];
  const keyOf = (g, c) => { const v = c[g.field]; return v == null ? '' : String(v); };
  const limitOf = (g, v) => g.enum ? ((o.limits && o.limits[v] != null) ? o.limits[v] : o.limit || 0) : (o.limit || 0);
  function columns(g, vis) {
    if (g.enum) { const vals = V().values(g.enum).filter(v => V().get(g.enum, v)); return vals.map(v => ({ v, cards: vis.filter(c => keyOf(g, c) === v) })).concat(unknownCols(g, vis, vals)); }
    const keys = [...new Set(cards.map(c => keyOf(g, c)))].sort((a, b) => a === '' ? 1 : b === '' ? -1 : a.localeCompare(b));
    return keys.map(v => ({ v, cards: vis.filter(c => keyOf(g, c) === v) }));
  }
  function unknownCols(g, vis, vals) { const extra = [...new Set(vis.map(c => keyOf(g, c)))].filter(v => !vals.includes(v) && V().get(g.enum, v) !== null); return extra.map(v => ({ v, cards: vis.filter(c => keyOf(g, c) === v) })); }
  function isWide(g, v) { if (o.wide) return o.wide.includes(v); const r = g.enum && V().get(g.enum, v); return !!(r && r.tone === 'attention'); }

  function initials(n) { return String(n || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase(); }
  function cardEl(c, g, cols) {
    const a = el('article', 'kit-sl-card'); a.tabIndex = 0; a.dataset.id = c.id; a.setAttribute('data-keep', 'sl-card-' + c.id); a.draggable = true;
    const row = V().get('state', c.state); if (g.enum && V().get(g.enum, c.state)) a.setAttribute('data-vo-tone', V().get(g.enum, c.state).tone); else if (row) a.setAttribute('data-vo-tone', row.tone);
    const top = el('div', 'kit-sl-ctop'); top.append(el('code', null, String(c.id)));
    if (g.key !== 'state' && c.state != null) { const ch = V().chip(o.stateEnum || 'state', c.state, { unknown: 'flag' }); if (ch) top.append(ch); }
    a.append(top, el('h4', 'kit-sl-title', c.title));
    const foot = el('div', 'kit-sl-cfoot');
    if (c.owner != null && g.key !== 'owner') { const w = el('span', 'kit-sl-own'); const av = el('i', null, initials(c.owner)); av.setAttribute('aria-hidden', 'true'); w.append(av, document.createTextNode(c.owner)); foot.append(w); }
    const sel = el('select', 'kit-sl-move'); sel.id = id + '-mv-' + String(c.id).replace(/\W+/g, '_'); sel.setAttribute('aria-label', 'Move ' + c.title + ' to'); sel.setAttribute('data-keep', 'sl-mv-' + c.id);
    const cur = keyOf(g, c); sel.append(new Option('Move…', ''));
    cols.forEach(col => { if (col.v === cur) return; sel.append(new Option(colName(g, col.v), col.v)); });
    sel.addEventListener('change', () => { const to = sel.value; sel.value = ''; if (to !== '') askMove(c, to); });
    foot.append(sel); a.append(foot);
    const show = () => showGlimpse(a, c), hide = () => { glimpse.hidden = true; a.removeAttribute('aria-describedby'); };
    if (c.note || (c.extras && c.extras.length)) { a.addEventListener('mouseenter', show); a.addEventListener('focusin', show); a.addEventListener('mouseleave', hide); a.addEventListener('focusout', e => { if (!a.contains(e.relatedTarget)) hide(); }); a.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); }); }
    a.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', String(c.id)); e.dataTransfer.effectAllowed = 'move'; hide(); });
    return a;
  }
  function showGlimpse(a, c) {
    glimpse.textContent = ''; glimpse.append(el('b', null, c.title)); if (c.note) glimpse.append(el('p', null, c.note));
    if (c.extras && c.extras.length) { const dl = el('dl'); c.extras.forEach(([k, v]) => { dl.append(el('dt', null, k), el('dd', null, v)); }); glimpse.append(dl); }
    glimpse.hidden = false; a.setAttribute('aria-describedby', glimpse.id);
    const r = a.getBoundingClientRect(), w = Math.min(300, innerWidth - 24); glimpse.style.width = w + 'px';
    let left = r.right + 10; if (left + w > innerWidth - 12) left = Math.max(12, r.left - w - 10); if (left < 12) left = 12;
    const h = glimpse.offsetHeight; let top = Math.min(Math.max(12, r.top), innerHeight - h - 12);
    if (r.right + 10 + w > innerWidth - 12 && r.left - w - 10 < 12) { left = 12; top = Math.min(r.bottom + 8, innerHeight - h - 12); }
    glimpse.style.left = left + 'px'; glimpse.style.top = Math.max(12, top) + 'px';
  }
  function colName(g, v) { if (g.enum) { const r = V().get(g.enum, v); return r ? r.word : String(v); } return v === '' ? (g.none || 'None') : v; }

  function draw() {
    const g = G();
    seg.textContent = '';
    o.groups.forEach(x => { const b = el('button', 'kit-sl-btn', x.label); b.type = 'button'; b.setAttribute('aria-pressed', String(x.key === g.key)); b.addEventListener('click', () => api.setGroup(x.key)); seg.append(b); });
    const vis = flt ? cards.filter(flt) : cards, cols = columns(g, vis);
    status.textContent = vis.length + (vis.length === 1 ? ' card' : ' cards') + (flt ? ' shown of ' + cards.length : '') + ' in ' + cols.filter(c => c.cards.length).length + ' of ' + cols.length + ' columns' + (note ? '. ' + note : '');
    scroller.textContent = '';
    const grid = el('div', 'kit-sl-grid'); const tpl = [];
    cols.forEach(col => {
      const rail = !col.cards.length && !opened.has(g.key + ':' + col.v), wide = isWide(g, col.v), lim = limitOf(g, col.v), over = lim > 0 && col.cards.length > lim;
      tpl.push(rail ? '48px' : wide ? 'minmax(250px, 1.5fr)' : 'minmax(200px, 1fr)');
      const sec = el('section', 'kit-sl-col'); sec.dataset.value = col.v; if (over) sec.dataset.over = 'true'; if (rail) sec.dataset.rail = 'true'; if (wide) sec.dataset.wide = 'true';
      const rr = g.enum && V().get(g.enum, col.v); if (rr) sec.setAttribute('data-vo-tone', rr.tone);
      const name = colName(g, col.v), count = lim > 0 ? col.cards.length + ' / ' + lim : String(col.cards.length);
      sec.setAttribute('aria-label', name + ', ' + count + (over ? ', over limit' : ''));
      const head = el('header', 'kit-sl-head');
      if (rail) {
        const b = el('button', 'kit-sl-rail'); b.type = 'button'; b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-label', name + ', empty. Open this column'); b.setAttribute('data-keep', 'sl-rail-' + col.v);
        b.append(el('span', 'kit-sl-rname', name), el('b', null, '0')); b.addEventListener('click', () => { opened.add(g.key + ':' + col.v); save(); redraw(); }); sec.append(b);
      } else {
        const h = g.enum ? V().head(g.enum, col.v, { count, unknown: 'flag' }) : null;
        if (h) head.append(h); else { head.append(el('span', 'kit-sl-name', name), el('b', 'kit-sl-n', count)); }
        if (over) head.append(el('span', 'kit-sl-over', 'Over limit'));
        sec.append(head);
        const body = el('div', 'kit-sl-cards');
        if (!col.cards.length) { const e = el('p', 'kit-sl-empty', 'Nothing here.'); const cb = el('button', 'kit-sl-close', 'Fold this column'); cb.type = 'button'; cb.setAttribute('data-keep', 'sl-fold-' + col.v); cb.addEventListener('click', () => { opened.delete(g.key + ':' + col.v); save(); redraw(); }); body.append(e, cb); }
        col.cards.forEach(c => body.append(cardEl(c, g, cols)));
        sec.append(body);
      }
      sec.addEventListener('dragover', e => { e.preventDefault(); sec.classList.add('kit-sl-drop'); });
      sec.addEventListener('dragleave', () => sec.classList.remove('kit-sl-drop'));
      sec.addEventListener('drop', e => { e.preventDefault(); sec.classList.remove('kit-sl-drop'); const cid = e.dataTransfer.getData('text/plain'); const c = cards.find(x => String(x.id) === cid); if (c && keyOf(g, c) !== col.v) askMove(c, col.v); });
      grid.append(sec);
    });
    grid.style.gridTemplateColumns = tpl.join(' '); scroller.append(grid);
    drawForm();
  }
  function drawForm() {
    form.textContent = ''; form.hidden = !pending; if (!pending) return;
    const g = G(), c = pending.card, fid = id + '-why';
    const lab = el('label', null, 'Why move ' + c.title + ' to ' + colName(g, pending.to) + '?'); lab.htmlFor = fid;
    const ta = el('textarea'); ta.id = fid; ta.rows = 2; ta.setAttribute('data-keep', fid);
    const err = el('p', 'kit-sl-err'); err.textContent = pending.err || ''; err.hidden = !pending.err;
    const row = el('div', 'kit-sl-frow');
    const ok = el('button', 'kit-sl-btn kit-sl-primary', 'Move card'); ok.type = 'button';
    ok.addEventListener('click', () => { const t = ta.value.trim(); if (!t) { pending.err = 'Write the reason first. It is kept with the move.'; redraw(); const n = box.querySelector('#' + fid); if (n) n.focus(); return; } commit(c, pending.to, t); });
    const no = el('button', 'kit-sl-btn', 'Cancel'); no.type = 'button'; no.addEventListener('click', () => { pending = null; redraw(); });
    row.append(ok, no); form.append(lab, ta, err, row);
  }
  function askMove(c, to) {
    if (o.reason === false) { commit(c, to, ''); return; }
    pending = { card: c, to }; redraw(); const n = box.querySelector('#' + id + '-why'); if (n) n.focus();
  }
  function commit(c, to, reason) {
    const g = G(), prev = c[g.field]; c[g.field] = to === '' ? null : to; pending = null; note = 'Moved ' + c.title + ' to ' + colName(g, to) + '.'; redraw();
    if (o.onMove) Promise.resolve().then(() => o.onMove(c, to, reason)).catch(() => { c[g.field] = prev; note = 'Not saved. ' + c.title + ' is back where it was.'; redraw(); });
  }
  const redraw = Kit.keepState && Kit.keepState.wrap ? Kit.keepState.wrap(box, draw) : draw;
  const api = {
    setGroup(k) { if (!o.groups.some(g => g.key === k)) return; note = ''; gkey = k; pending = null; save(); redraw(); },
    filter(fn) { flt = typeof fn === 'function' ? fn : null; redraw(); },
    update(list) { cards = list.map(c => Object.assign({}, c)); redraw(); },
    group: () => gkey,
    destroy() { box.replaceChildren(); box.classList.remove('kit-sl'); },
  };
  redraw(); return api;
}
Kit.statusColumns = Object.freeze({ mount });
})();
/* /part:page.script.kit.status-columns */

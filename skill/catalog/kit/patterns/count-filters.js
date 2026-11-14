/* part:page.script.kit.count-filters */
/**
 * Count tiles as filters
 * Kit.countFilters.mount(root, {tiles, value, groups, search, sticky, label, onChange}) renders the tiles as toggle buttons (the pressed one is outlined, filled and shows a check mark), chip groups that clear on a second press and an optional search box. It holds only the filter state and calls onChange({tile, groups, q}); the board filters its own cards. setCount and setTiles update the numbers when the data changes. With sticky it stays below --kit-topbar-h.
 *
 * A row of tiles, each a count with a name ("5 Pushed"), that filter the view when pressed, over a strip of chip groups ("Node", "Repo") and a search box. The tile is a toggle
 * button (aria-pressed); the pressed tile is outlined and carries a check mark, so state does not ride on colour. A chip group is a single choice that a second press clears.
 * The strip can stay under a sticky top bar. The pattern holds only the filter state: it calls onChange and the board filters its own cards, rows or ledger.
 *
 * API:
 *   Kit.countFilters.mount(root, {tiles, value, groups, search, sticky, label, onChange}) -> {state(), set({tile, groups, q}), setTiles(tiles), setCount(id, n), destroy()}
 *     tiles     [{id, label, count, note, tone}]   note is the small unit under the label ("workstreams"); tone: ok warn danger accent muted gives the tile a dot
 *     value     the pressed tile's id (default: the first tile)
 *     groups    [{id, label, options: [{value, label}]}]
 *     search    {placeholder, label}   omit for no search box
 *     sticky    true keeps the strip at the top of the scroll area, below --kit-topbar-h when a top bar sets it
 *     onChange  ({tile, groups: {id: value | ""}, q}) after a change; q is the trimmed search text
 *
 * @id        pattern.count-filters
 * @kind      component
 * @group     Patterns
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   Tiles that show a count per status and filter the view when pressed, with chip groups and a search box in a strip that can stay under a sticky bar.
 * @tags      filter, tiles, counts, status, chips, search, sticky, dashboard, work board
 * @requires  none
 * @files     kit/patterns/count-filters.css, kit/samples/count-filters.json
 * @provides  Kit.countFilters.mount
 * @config    Kit.countFilters.mount(root, opts) | tiles [{id, label, count, note, tone}], value, groups [{id, label, options [{value, label}]}], search {placeholder, label}, sticky, label, onChange
 * @config    --kit-topbar-h | optional, written by Kit.topbar: the strip sticks below it
 * @tokens    --bg? --panel --sunk --ink --ink-2 --rule --accent --accent-ink --ok --warn --danger --f-ui --f-mono --kit-topbar-h? --seam?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | 1 artifact's index.html | clickable count tiles and the sticky filter strip (node and repo chips, search) of a work-status board
 * @preview   {"render": "pattern.count-filters", "samples": ["kit/samples/count-filters.json"]}
 * @changed   The pressed tile carries a check mark as well as its outline, so state does not depend on colour.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
let uid = 0;
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

function mount(root, opts) {
  const o = Object.assign({ tiles: [], groups: [], search: null, sticky: false, label: 'Filter by status', onChange: null }, opts);
  const id = 'kit-cf-' + (++uid);
  let tiles = o.tiles.map(t => Object.assign({}, t));
  const st = { tile: o.value || (tiles[0] && tiles[0].id) || 'all', groups: {}, q: '' };
  o.groups.forEach(g => { st.groups[g.id] = ''; });
  root.classList.add('kit-cf'); if (o.sticky) root.classList.add('sticky'); root.replaceChildren();
  const tileBox = el('div', 'kit-cf-tiles'); tileBox.setAttribute('role', 'group'); tileBox.setAttribute('aria-label', o.label);
  const strip = el('div', 'kit-cf-strip');
  const groupEls = o.groups.map(g => {
    const wrap = el('div', 'kit-cf-grp'); wrap.setAttribute('role', 'group'); const lab = el('span', 'kit-cf-lbl', g.label); lab.id = id + '-' + g.id; wrap.setAttribute('aria-labelledby', lab.id); wrap.append(lab);
    g.options.forEach(op => {
      const b = el('button', 'kit-cf-chip', op.label); b.type = 'button'; b.dataset.v = op.value;
      b.addEventListener('click', () => set({ groups: { [g.id]: st.groups[g.id] === op.value ? '' : op.value } })); wrap.append(b);
    });
    strip.append(wrap); return wrap;
  });
  let input = null;
  if (o.search) {
    const s = Object.assign({ placeholder: 'Search', label: 'Search' }, o.search);
    input = el('input', 'kit-cf-q'); input.type = 'search'; input.id = id + '-q'; input.placeholder = s.placeholder; input.autocomplete = 'off'; input.setAttribute('aria-label', s.label);
    input.addEventListener('input', () => set({ q: input.value })); strip.append(input);
  }
  root.append(tileBox, strip);

  function paint() {
    tileBox.replaceChildren();
    tiles.forEach(t => {
      const b = el('button', 'kit-cf-tile'); b.type = 'button'; b.dataset.id = t.id; if (t.tone) b.dataset.tone = t.tone;
      b.setAttribute('aria-pressed', String(st.tile === t.id));
      const top = el('span', 'kit-cf-top'); top.append(el('span', 'kit-cf-count', String(t.count)), el('span', 'kit-cf-check')); top.lastChild.setAttribute('aria-hidden', 'true');
      const l = el('span', 'kit-cf-label', t.label); if (t.note) l.append(' ', el('small', null, '(' + t.note + ')'));
      b.append(top, l); b.addEventListener('click', () => set({ tile: t.id })); tileBox.append(b);
    });
    groupEls.forEach((w, i) => w.querySelectorAll('.kit-cf-chip').forEach(b => b.setAttribute('aria-pressed', String(st.groups[o.groups[i].id] === b.dataset.v))));
  }
  const snap = () => ({ tile: st.tile, groups: Object.assign({}, st.groups), q: st.q.trim() });
  function set(next) {
    if (next.tile !== undefined) st.tile = next.tile;
    if (next.groups) Object.assign(st.groups, next.groups);
    if (next.q !== undefined) { st.q = next.q; if (input && input.value !== next.q) input.value = next.q; }
    paint(); if (o.onChange) o.onChange(snap());
  }
  paint();
  return {
    state: snap, set,
    setTiles(next) { tiles = next.map(t => Object.assign({}, t)); paint(); },
    setCount(tid, n) { const t = tiles.find(x => x.id === tid); if (t) { t.count = n; paint(); } },
    destroy() { root.replaceChildren(); root.classList.remove('kit-cf', 'sticky'); },
  };
}
Kit.countFilters = Object.freeze({ mount });
})();
/* /part:page.script.kit.count-filters */

/* part:page.script.kit.filter-table */
/**
 * Filter, search and sort table
 * Kit.filterTable.mount(box, {columns, rows, filter, search, sort, group, total, empty, label, caption, tall, onChange}) builds the toolbar and the table with textContent only. The chips are toggle buttons whose counts follow the search; the heads are buttons with aria-sort and an arrow; a status line (role status) says "8 of 20 rows, 143 g" after each change. A status column shows the chip's word and tone, a bar column draws a thin linear bar from zero. It reuses the data table's frame and css, so the sticky head and the scroll frame behave the same.
 *
 * A table with a row of status chips that show their counts, a search box and sortable column heads. The chips are toggle buttons (aria-pressed), the heads are buttons
 * (aria-sort on the th), and a status line says "8 of 20 rows" after every change. Optional group rows keep a categorised table (a category, then its rows) and drop a group with no rows left.
 * Plain DOM; every cell is set with textContent unless a column's cell() returns a Node.
 *
 * API:
 *   Kit.filterTable.mount(box, {columns, rows, filter, search, sort, group, total, empty, label, caption, tall, onChange}) -> {update(rows), set({filter, q, sort}), state(), destroy()}
 *     columns   [{key, label, num, unit, decimals, fmt(v, row), cell(row) -> string | Node, sort: false | fn(row) -> value, status, bar, cls}]
 *               num right-aligns and formats; status shows the filter option's chip (dot, word, tone) for that row; bar adds a thin bar under the number, linear from 0 to the column's largest value
 *     filter    {key | by(row), label, all: "All", value: "all", options: [{value, label, tone}]}   tone: ok warn danger accent muted
 *               each chip's count follows the search, so a chip says how many rows it would show
 *     search    {keys: [column keys], placeholder, label}   all words must appear in the keys' text
 *     sort      {key, dir: "asc" | "desc"}   a click on a head sorts by it (numbers start descending, text ascending), another click reverses
 *     group     key | fn(row) => label   adds a label row above each group, in first-seen order after sorting
 *     total     {key, unit, decimals}   adds the sum of that column to the status line: "8 of 20 rows, 143.2 G"
 *     empty     the line shown when nothing matches (say how to widen the filter)
 *     tall      true caps the frame at 70vh so the head sticks while rows scroll
 *     onChange  ({filter, q, sort, rows}) after a change
 *
 * @id        pattern.filter-table
 * @kind      component
 * @group     Patterns
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   Status chips with counts, a search box and sortable column heads over a table; optional group rows and a total in the status line.
 * @tags      table, filter, search, sort, chips, counts, status, list, data, verdict
 * @requires  kit.table
 * @files     kit/patterns/filter-table.css, kit/samples/patterns.json
 * @provides  Kit.filterTable.mount
 * @config    Kit.filterTable.mount(box, opts) | columns [{key, label, num, unit, decimals, fmt, cell, sort, status, bar}], rows, filter {key | by, label, all, value, options [{value, label, tone}]}, search {keys, placeholder, label}, sort {key, dir}, group, total {key, unit, decimals}, empty, label, caption, tall, onChange
 * @config    requires | kit.table: its css (the frame and table styles) and Kit.table.fmt
 * @tokens    --panel --sunk --ink --ink-2 --rule --accent --accent-ink --ok --warn --danger --f-ui --f-mono --seam?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | 5 artifacts' index.html | a verdict filter with search and a sortable size column, a flow list with direction segments and a text filter, and three review tables with recommendation chips
 * @preview   {"render": "pattern.filter-table", "samples": ["kit/samples/patterns.json#filter-table"]}
 * @changed   The chip counts follow the search, so a chip says how many rows it would show.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
let uid = 0;
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const fold = s => String(s == null ? '' : s).toLowerCase();
const cmp = (a, b) => {
  const na = a == null || a === '', nb = b == null || b === '';
  if (na || nb) return na === nb ? 0 : na ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
};

function mount(box, opts) {
  const o = Object.assign({ columns: [], rows: [], filter: null, search: null, sort: null, group: null, total: null, empty: 'No row matches. Clear the search or pick All.', label: 'Table', caption: '', tall: false, onChange: null }, opts);
  const f = o.filter && Object.assign({ label: 'Show', all: 'All', value: 'all', options: [] }, o.filter);
  const id = 'kit-ft-' + (++uid);
  const st = { filter: f ? f.value : 'all', q: '', sort: o.sort ? { key: o.sort.key, dir: o.sort.dir || 'desc' } : null };
  let rows = o.rows.slice();
  const fVal = r => f ? (f.by ? f.by(r) : r[f.key]) : null;
  const colOf = k => o.columns.find(c => c.key === k);
  const valOf = (c, r) => typeof c.sort === 'function' ? c.sort(r) : r[c.key];
  const maxOf = {}; const bars = () => o.columns.forEach(c => { if (c.bar) maxOf[c.key] = Math.max(0, ...rows.map(r => +r[c.key] || 0)); });

  box.classList.add('kit-ft'); box.replaceChildren();
  const bar = el('div', 'kit-ft-bar');
  let chipsWrap = null, chipBtns = [];
  if (f) {
    chipsWrap = el('div', 'kit-ft-chips'); chipsWrap.setAttribute('role', 'group'); chipsWrap.setAttribute('aria-label', f.label);
    const optList = [{ value: 'all', label: f.all }].concat(f.options);
    chipBtns = optList.map(op => {
      const b = el('button', 'kit-ft-chip'); b.type = 'button'; b.dataset.v = op.value; if (op.tone) b.dataset.tone = op.tone;
      if (op.tone) b.append(el('i', 'kit-ft-dot')); b.append(el('span', 'kit-ft-chip-l', op.label), el('span', 'kit-ft-n', '0'));
      b.addEventListener('click', () => set({ filter: op.value })); chipsWrap.append(b); return b;
    });
    bar.append(chipsWrap);
  }
  let input = null;
  if (o.search) {
    const s = Object.assign({ keys: [], placeholder: 'Search', label: 'Search the table' }, o.search);
    const lab = el('label', 'kit-ft-search'); input = el('input'); input.type = 'search'; input.id = id + '-q'; input.placeholder = s.placeholder; input.autocomplete = 'off'; input.setAttribute('aria-label', s.label);
    input.addEventListener('input', () => set({ q: input.value })); lab.append(input); bar.append(lab); o.search = s;
  }
  const count = el('p', 'kit-ft-count'); count.setAttribute('role', 'status'); count.setAttribute('aria-live', 'polite');
  const frame = el('div'); const table = el('table', 'kit-table kit-ft-table');
  if (o.caption) table.append(el('caption', 'kit-ft-cap', o.caption));
  const thead = el('thead'), hr = el('tr'), tbody = el('tbody');
  const heads = o.columns.map(c => {
    const th = el('th', c.num ? 'num' : null); th.scope = 'col';
    if (c.sort === false) th.textContent = c.label == null ? c.key : c.label;
    else {
      const b = el('button', 'kit-ft-sort'); b.type = 'button'; b.append(el('span', null, c.label == null ? c.key : c.label), el('span', 'kit-ft-arrow')); b.lastChild.setAttribute('aria-hidden', 'true');
      b.addEventListener('click', () => { const same = st.sort && st.sort.key === c.key; set({ sort: { key: c.key, dir: same ? (st.sort.dir === 'asc' ? 'desc' : 'asc') : (c.num ? 'desc' : 'asc') } }); });
      th.append(b);
    }
    hr.append(th); return th;
  });
  thead.append(hr); table.append(thead, tbody);
  frame.className = 'kit-table-box' + (o.tall ? ' tall' : ''); frame.setAttribute('role', 'region'); frame.tabIndex = 0; frame.setAttribute('aria-label', o.label); frame.append(table);
  box.append(bar, count, frame);

  const matchQ = r => { if (!st.q.trim() || !input) return true; const hay = fold(o.search.keys.map(k => r[k]).join(' ')); return st.q.trim().toLowerCase().split(/\s+/).every(w => hay.includes(w)); };
  const matchF = r => !f || st.filter === 'all' || fVal(r) === st.filter;
  function cellOf(c, r) {
    const td = el('td', [c.num ? 'num' : '', c.cls || ''].filter(Boolean).join(' ') || null);
    if (c.cell) { const v = c.cell(r); if (v instanceof Node) td.append(v); else td.textContent = v == null ? '' : String(v); return td; }
    const v = r[c.key];
    if (c.status && f) {
      const op = f.options.find(x => x.value === fVal(r)); const chip = el('span', 'kit-ft-st', op ? op.label : String(fVal(r) == null ? '' : fVal(r))); if (op && op.tone) chip.dataset.tone = op.tone;
      td.append(chip); return td;
    }
    if (c.num) {
      td.append(el('span', 'kit-ft-fig', c.fmt ? c.fmt(v, r) : Kit.table.fmt(v, { decimals: c.decimals, unit: c.unit })));
      if (c.bar && maxOf[c.key] > 0) { const b = el('i', 'kit-ft-minibar'); b.style.width = Math.max(2, (+v || 0) / maxOf[c.key] * 100).toFixed(1) + '%'; b.setAttribute('aria-hidden', 'true'); td.append(b); }
    } else td.textContent = v == null ? '' : String(v);
    return td;
  }
  function paint(announce) {
    bars();
    const byQ = rows.filter(matchQ);
    chipBtns.forEach(b => {
      const n = b.dataset.v === 'all' ? byQ.length : byQ.filter(r => fVal(r) === b.dataset.v).length;
      b.lastChild.textContent = String(n); b.setAttribute('aria-pressed', String(st.filter === b.dataset.v));
    });
    const list = byQ.filter(matchF);
    const sc = st.sort && colOf(st.sort.key);
    if (sc) { const d = st.sort.dir === 'asc' ? 1 : -1; list.map((r, i) => [r, i]).sort((a, b) => d * cmp(valOf(sc, a[0]), valOf(sc, b[0])) || a[1] - b[1]).forEach((x, i) => { list[i] = x[0]; }); }
    heads.forEach((th, i) => { const c = o.columns[i]; if (c.sort === false) return; const on = sc && sc === c; th.setAttribute('aria-sort', on ? (st.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'); th.querySelector('.kit-ft-arrow').textContent = on ? (st.sort.dir === 'asc' ? '↑' : '↓') : ''; });
    tbody.replaceChildren();
    if (!list.length) { const tr = el('tr'), td = el('td', 'kit-ft-none', o.empty); td.colSpan = o.columns.length; tr.append(td); tbody.append(tr); }
    else {
      const keyOf = typeof o.group === 'function' ? o.group : o.group ? r => r[o.group] : null;
      const groups = new Map(); list.forEach(r => { const k = keyOf ? String(keyOf(r) == null ? '' : keyOf(r)) : ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
      for (const [g, gl] of groups) {
        if (keyOf) { const tr = el('tr', 'kit-group'), th = el('th', null, g); th.colSpan = o.columns.length; th.scope = 'colgroup'; th.append(el('span', 'kit-group-n', gl.length + (gl.length === 1 ? ' row' : ' rows'))); tr.append(th); tbody.append(tr); }
        gl.forEach(r => { const tr = el('tr'); o.columns.forEach(c => tr.append(cellOf(c, r))); tbody.append(tr); });
      }
    }
    let line = list.length + ' of ' + rows.length + (rows.length === 1 ? ' row' : ' rows');
    if (o.total) line += ', ' + Kit.table.fmt(list.reduce((a, r) => a + (+r[o.total.key] || 0), 0), { decimals: o.total.decimals == null ? 1 : o.total.decimals, unit: o.total.unit });
    count.textContent = line;
    if (announce && o.onChange) o.onChange({ filter: st.filter, q: st.q, sort: st.sort && Object.assign({}, st.sort), rows: list });
  }
  function set(next) {
    if (next.filter !== undefined) st.filter = next.filter;
    if (next.q !== undefined) { st.q = next.q; if (input && input.value !== next.q) input.value = next.q; }
    if (next.sort !== undefined) st.sort = next.sort;
    paint(true);
  }
  paint(false);
  return {
    update(next) { rows = (next || []).slice(); paint(false); }, set,
    state: () => ({ filter: st.filter, q: st.q, sort: st.sort && Object.assign({}, st.sort) }),
    destroy() { box.replaceChildren(); box.classList.remove('kit-ft'); },
  };
}
Kit.filterTable = Object.freeze({ mount });
})();
/* /part:page.script.kit.filter-table */

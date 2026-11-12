/* part:page.script.kit.table */
/**
 * Data table
 * Kit.table.render(box, {columns, rows, group, groupTotals, total, highlight, caption, note, label, tall}) builds the table with textContent only. Columns take num, signed, sum, decimals, unit, fmt or cell(row). Signed figures carry their sign in the text (+, −) and the colour only repeats it; a highlighted row can carry a word. Kit.table.fmt(n, opts) formats with a real minus sign. The css also works on hand-written tables.
 *
 * API (small and stable):
 *   Kit.table.render(box, {columns, rows, group, groupTotals, total, highlight, caption, note, label, tall}) -> {update(rows), table}
 *     box          an element; it becomes the scroll frame (.kit-table-box, role=region, tabindex=0, aria-label = label or caption)
 *     columns      [{key, label, num, fmt, signed, sum, cell(row) -> string | Node, cls}]   num right-aligns; signed adds + and −; sum totals it
 *     rows         [{...}]   plain objects
 *     group        a key or row => label; rows keep their order inside a group, groups keep first-seen order
 *     groupTotals  true: a subtotal row under each group for the sum columns
 *     total        true or a label ("Total"): a total row in tfoot for the sum columns
 *     highlight    row => false | true | "word"   true highlights; a word also tags the first cell with it
 *     tall         true caps the frame at 70vh so the head sticks while rows scroll
 *   Kit.table.fmt(n, {decimals, signed, unit, locale}) -> string   real minus sign (−), grouping by locale (default "en-GB"), unit after a thin space
 *
 * Plain DOM; every cell is set with textContent unless a column's cell() returns a Node.
 * Optional custom properties: --seam.
 *
 * @id        kit.table
 * @group     Board kit
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   A table in its own scroll frame with a sticky head, numeric columns, group rows with subtotals, a total row, highlighted rows and signed figures.
 * @tags      table, data, numbers, totals, subtotal, group, budget, scroll, sticky header, tabular
 * @requires  none
 * @provides  Kit.table.render, Kit.table.fmt
 * @config    Kit.table.render(box, opts) | columns [{key, label, num, signed, sum, decimals, unit, fmt, cell}], rows, group, groupTotals, total, highlight(row), caption, note, label, tall
 * @config    markup | div.kit-table-box[role=region][tabindex=0] > table.kit-table, for hand-written tables
 * @tokens    --panel --sunk --ink --ink-2 --rule --rule-2 --accent-soft --ok --danger --f-ui --f-mono
 * @globals   none
 * @db        none
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
function fmt(n, o) {
  const opt = o || {};
  if (n == null || n === '' || isNaN(n)) return '–';
  const d = opt.decimals == null ? (Number.isInteger(+n) ? 0 : 2) : opt.decimals;
  const abs = Math.abs(+n).toLocaleString(opt.locale || 'en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
  const zero = +(+n).toFixed(d) === 0;
  const sign = zero ? '' : +n < 0 ? '−' : opt.signed ? '+' : '';
  return sign + abs + (opt.unit ? ' ' + opt.unit : '');
}
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
function cellOf(col, row) {
  const td = el('td', [col.num ? 'num' : '', col.cls || ''].filter(Boolean).join(' ') || null);
  if (col.cell) { const v = col.cell(row); if (v instanceof Node) td.append(v); else td.textContent = v == null ? '' : String(v); return td; }
  const v = row[col.key];
  if (col.num) {
    td.textContent = col.fmt ? col.fmt(v, row) : fmt(v, { signed: col.signed, decimals: col.decimals, unit: col.unit });
    if (col.signed && v != null && !isNaN(v)) td.classList.add(+v > 0 ? 'kit-pos' : +v < 0 ? 'kit-neg' : 'kit-zero');
  } else td.textContent = v == null ? '' : String(v);
  return td;
}
function sumRow(cls, label, columns, rows, scope) {
  const tr = el('tr', cls);
  columns.forEach((c, i) => {
    if (i === 0) { const th = el('th', null, label); th.scope = scope || 'row'; tr.append(th); return; }
    if (!c.sum) { tr.append(el('td')); return; }
    const s = rows.reduce((a, r) => a + (+r[c.key] || 0), 0);
    tr.append(cellOf(c, { [c.key]: s }));
  });
  return tr;
}
function render(box, opts) {
  const o = Object.assign({ columns: [], rows: [] }, opts);
  box.classList.add('kit-table-box'); if (o.tall) box.classList.add('tall');
  box.setAttribute('role', 'region'); box.tabIndex = 0; box.setAttribute('aria-label', o.label || o.caption || 'Table');
  const table = el('table', 'kit-table');
  function paint(rows) {
    table.replaceChildren();
    if (o.caption) { const c = el('caption', null, o.caption); if (o.note) c.append(el('small', null, o.note)); table.append(c); }
    const thead = el('thead'), hr = el('tr');
    o.columns.forEach(c => { const th = el('th', c.num ? 'num' : null, c.label == null ? c.key : c.label); th.scope = 'col'; hr.append(th); });
    thead.append(hr); table.append(thead);
    const tbody = el('tbody');
    const keyOf = typeof o.group === 'function' ? o.group : o.group ? r => r[o.group] : null;
    const groups = new Map();
    rows.forEach(r => { const k = keyOf ? String(keyOf(r) ?? '') : ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
    for (const [g, list] of groups) {
      if (keyOf) {
        const tr = el('tr', 'kit-group'); const th = el('th', null, g); th.colSpan = o.columns.length; th.scope = 'colgroup';
        th.append(el('span', 'kit-group-n', list.length + (list.length === 1 ? ' row' : ' rows'))); tr.append(th); tbody.append(tr);
      }
      list.forEach(r => {
        const tr = el('tr'); const h = o.highlight ? o.highlight(r) : false;
        o.columns.forEach((c, i) => { const td = cellOf(c, r); if (i === 0 && h && typeof h === 'string') td.append(el('span', 'kit-tag', h)); tr.append(td); });
        if (h) tr.classList.add('kit-hl'); tbody.append(tr);
      });
      if (keyOf && o.groupTotals && o.columns.some(c => c.sum)) tbody.append(sumRow('kit-sub', 'Subtotal, ' + g, o.columns, list));
    }
    table.append(tbody);
    if (o.total && o.columns.some(c => c.sum)) { const tf = el('tfoot'); tf.append(sumRow('kit-total', typeof o.total === 'string' ? o.total : 'Total', o.columns, rows)); table.append(tf); }
  }
  paint(o.rows); box.replaceChildren(table);
  return { table, update(rows) { o.rows = rows; paint(rows); } };
}
Kit.table = Object.freeze({ render, fmt });
})();
/* /part:page.script.kit.table */

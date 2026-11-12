/* part:page.script.kit.viz.matrix */
/* Kit visualization: link matrix (Kit.viz.Matrix)    kit version 0.1.0
   What it is: rows against columns with one toggle per cell, for any "which X covers which Y" relation (moves against problems, options against
   drivers, tests against requirements). Rows that cover several columns can come first; a footer counts each column's links and names the
   columns nobody covers; hovering or focusing a cell lights its row and column; arrow keys move between cells; codes stay readable when the
   table scrolls sideways (sticky first column).
   Needs from the board:
     config  Matrix({rows, cols, links, onToggle, onPick, canEdit, title, rowHead, colHead, sort, words})
               rows  [{id, code, label, tone}]   cols [{id, code, label}]   links {rowId: [colId]}
               onToggle(rowId, colId, on)  called on a cell click when canEdit; the board writes the link and passes new links back
               onPick(id)  optional: a row or column header click opens that record
               sort  "coverage" (rows covering more columns first, stable) or "given"
               words {covers, none, uncovered, several} column and footer texts
     css     kit/viz/viz.css; custom properties --panel --ink --ink-2 --ink-3 --rule --rule-2 --sunk --accent --accent-soft --ok --danger --f-mono --f-display
     needs   kit/viz/core.js loaded first
   db collections: none. The board reads and writes the link field (the Journey Whiteboard keeps it as items/<id>.problems).
   Lifted from: Journey Whiteboard app.js (Coverage). Changed: the problem/solution kinds became rows and cols from config, the link field became links. */
(function () {
'use strict';
const Kit = window.Kit;
const { html, useState } = window.htmPreact;
const { clip, cx, tone } = Kit.viz.util;

function Matrix({ rows, cols, links, onToggle, onPick, canEdit, title, rowHead, colHead, sort = 'coverage', words = {} }) {
  const [hot, setHot] = useState(null);
  const L = links || {};
  const has = (r, c) => (L[r] || []).includes(c);
  const R = (rows || []).map((r, i) => ({ ...r, i, n: (L[r.id] || []).filter(c => (cols || []).some(x => x.id === c)).length }));
  if (sort === 'coverage') R.sort((a, b) => b.n - a.n || a.i - b.i);
  const C = cols || [];
  const colN = C.map(c => R.filter(r => has(r.id, c.id)).length);
  const open = colN.filter(n => !n).length;
  const w = Object.assign({ covers: 'covers', none: 'none', uncovered: 'Columns without a link', several: 'linked' }, words);
  const key = e => {
    const b = e.target.closest('[data-r]'); if (!b) return;
    const r = +b.dataset.r, c = +b.dataset.c;
    const d = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] }[e.key]; if (!d) return;
    const t = e.currentTarget.querySelector(`[data-r="${r + d[0]}"][data-c="${c + d[1]}"]`);
    if (t) { e.preventDefault(); t.focus(); }
  };
  if (!R.length || !C.length) return html`<div class="kv-empty">Nothing to cross yet: the matrix needs at least one row and one column.</div>`;
  return html`<section class="kv-matrix" aria-label=${title || 'Link matrix'}>
    ${title ? html`<header class="kv-matrix-h"><h3>${title}</h3><span>${R.length} × ${C.length}${open ? html` · <b class="kv-bad">${open} ${open === 1 ? 'column' : 'columns'} without a link</b>` : ' · every column has a link'}</span></header>` : ''}
    <div class="kv-scroll" onKeyDown=${key} onMouseLeave=${() => setHot(null)}>
      <table>
        <thead><tr>
          <th class="kv-rowh" scope="col">${rowHead || ''}${colHead ? html`<span class="kv-colhead">${colHead} →</span>` : ''}</th>
          ${C.map((c, j) => html`<th scope="col" key=${c.id} class=${cx(hot && hot.c === j && 'hot', !colN[j] && 'open')} title=${c.label}>
            ${onPick ? html`<button type="button" onClick=${() => onPick(c.id)}>${c.code || clip(c.label, 6)}</button>` : (c.code || clip(c.label, 6))}</th>`)}
          <th scope="col" class="kv-n">${w.covers}</th>
        </tr></thead>
        <tbody>${R.map((r, i) => html`<tr key=${r.id} class=${hot && hot.r === i ? 'hot' : ''}>
          <th scope="row" class=${cx('kv-rowh', tone(r.tone))}>
            ${onPick ? html`<button type="button" onClick=${() => onPick(r.id)}><span class="kv-code">${r.code}</span> ${clip(r.label, 80)}</button>`
              : html`<span><span class="kv-code">${r.code}</span> ${clip(r.label, 80)}</span>`}</th>
          ${C.map((c, j) => { const on = has(r.id, c.id); return html`<td key=${c.id} class=${hot && hot.c === j ? 'hot' : ''}>
            <button type="button" class="kv-cell" data-r=${i} data-c=${j} aria-pressed=${on}
              aria-disabled=${canEdit ? null : 'true'} tabindex=${i === 0 && j === 0 ? 0 : -1}
              aria-label=${`${r.code || r.label} ${on ? 'covers' : 'does not cover'} ${c.code || ''}: ${c.label}`}
              onFocus=${() => setHot({ r: i, c: j })} onMouseEnter=${() => setHot({ r: i, c: j })}
              onClick=${() => canEdit && onToggle && onToggle(r.id, c.id, !on)}></button></td>`; })}
          <td class="kv-n">${r.n > 1 ? html`<span class="kv-chip kv-t-ok">${r.n} ${w.several}</span>` : html`<span class="kv-num">${r.n}</span>`}</td>
        </tr>`)}</tbody>
        <tfoot><tr><th scope="row" class="kv-rowh">${w.uncovered}</th>
          ${C.map((c, j) => html`<td key=${c.id} class=${colN[j] ? 'kv-num' : 'kv-num kv-bad'}>${colN[j] || w.none}</td>`)}<td></td></tr></tfoot>
      </table>
    </div>
  </section>`;
}

Kit.viz.Matrix = Matrix;
})();
/* /part:page.script.kit.viz.matrix */

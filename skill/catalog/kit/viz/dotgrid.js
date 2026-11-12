/* part:page.script.kit.viz.dotgrid */
/* Kit visualization: one-mark-per-item grid (Kit.dotgrid)    kit version 0.1.0
   What it is: a dense grid with one mark per item (a file, a record, a request), so a count is something you can see. Items with no category are small neutral dots. An item in a category is
   a full-size mark in that category's pen colour AND its own shape (circle, diamond, square, triangle, ring), so the category survives without colour. Under the grid a list of the
   categories, each a button with its shape, its word and its count: hovering or focusing one lights its marks and dims the rest; pressing it holds the light.
   Two looks: "full" shows every category all the time; "lens" shows them only in a soft circle that follows the pointer (a way to scan a large grid), and the list and the counts still say
   everything, so the lens never hides information from a keyboard user. Marks in a category are focusable and have a tooltip; the neutral ones have a tooltip on hover only.
   API: Kit.dotgrid.mount(box, {items, categories, mode, size, gap, noun, label, onPick, host, lensRadius}) -> {highlight(id | null), setMode(m), update(patch), destroy()}
     items       [{id, label, cats: [category ids]}]   the first category sets the mark's colour and shape
     categories  [{id, label, tone, note}]   tone is a pen (blue amber violet green red) or a meaning (ok warn danger accent); default by position
     mode        "full" (default) | "lens"
     size, gap   px of a mark's cell (default 12) and the space between cells (default 4)
     noun        "file": used in the summary and the tooltips ("12 of 400 files are in a category")
     onPick      (itemId) when set, a press on a flagged mark calls it
   Needs from the board:
     requires kit.tooltip (Kit.tooltip.attach)
     css     kit/viz/dotgrid.css; custom properties --panel --sunk --ink --ink-2 --rule --rule-2 --accent --accent-ink --ok --warn --danger --f-ui --f-mono, the pens --c-blue --c-amber --c-violet --c-green --c-red, optional --seam
     globals Kit.tooltip
   db collections: none.
   Lifted from: a secret-scan report (one dot per file, a lens that follows the pointer, a detector table whose rows light their dots). Changed: shapes as well as colours, a category list that
   works from the keyboard, and "full" as the default so the page is complete without a pointer. */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const PENS = ['blue', 'amber', 'violet', 'red', 'green'], MEAN = ['ok', 'warn', 'danger', 'accent'];
const toneOf = (t, i) => PENS.includes(t) || MEAN.includes(t) ? t : PENS[i % PENS.length];

function mount(box, opts) {
  const o = Object.assign({ items: [], categories: [], mode: 'full', size: 12, gap: 4, noun: 'item', lensRadius: 80 }, opts);
  box.replaceChildren(); const root = el('div', 'kit-dg'), wrap = el('div', 'kit-dg-wrap'), list = el('ul', 'kit-dg-cats'), sum = el('p', 'kit-dg-sum'); root.append(sum, wrap, list); box.append(root);
  if (o.label) wrap.setAttribute('aria-label', o.label); wrap.setAttribute('role', 'group');
  let held = null, hover = null, catIdx = {}, byItem = {};
  const set = id => { if (id) wrap.dataset.hl = id; else delete wrap.dataset.hl; wrap.querySelectorAll('.kit-dg-d').forEach(d => d.classList.toggle('on', !!id && d.dataset.f.split(' ').includes(id))); root.querySelectorAll('.kit-dg-cat').forEach(b => b.classList.toggle('is-lit', b.dataset.id === id)); };
  const sync = () => set(hover || held);
  const tip = n => {
    const it = byItem[n.dataset.id], cats = (it.cats || []).map(c => o.categories[catIdx[c]] && o.categories[catIdx[c]].label).filter(Boolean);
    return { title: it.label, text: cats.length ? cats.join(', ') : 'Not in a category' };
  };
  function draw() {
    wrap.replaceChildren(); list.replaceChildren(); catIdx = {}; byItem = {}; o.categories.forEach((c, i) => { catIdx[c.id] = i; });
    wrap.style.setProperty('--kit-dg-s', o.size + 'px'); wrap.style.setProperty('--kit-dg-g', o.gap + 'px'); wrap.style.setProperty('--kit-dg-r', o.lensRadius + 'px'); wrap.className = 'kit-dg-wrap is-' + o.mode;
    const base = el('div', 'kit-dg-layer base'), scan = el('div', 'kit-dg-layer scan'); scan.setAttribute('aria-hidden', 'true');
    const counts = {}; let flagged = 0;
    o.items.forEach(it => {
      byItem[it.id] = it; const first = (it.cats || []).find(c => c in catIdx), ci = first == null ? -1 : catIdx[first];
      const b = el('span', 'kit-dg-d'); b.dataset.id = it.id; b.dataset.f = (it.cats || []).join(' '); b.dataset.tipI = '1';
      if (ci >= 0) { flagged++; b.classList.add('is-cat'); b.tabIndex = 0; b.setAttribute('role', o.onPick ? 'button' : 'img'); b.setAttribute('aria-label', it.label + ': ' + (it.cats || []).map(c => o.categories[catIdx[c]] && o.categories[catIdx[c]].label).filter(Boolean).join(', ')); }
      else b.setAttribute('aria-hidden', 'true');
      base.append(b);
      const s = el('span', 'kit-dg-d'); s.dataset.f = b.dataset.f; if (ci >= 0) { s.classList.add('is-cat', 'kit-dg-t-' + toneOf(o.categories[ci].tone, ci), 'kit-dg-s' + (ci % 5)); }
      scan.append(s); (it.cats || []).forEach(c => { counts[c] = (counts[c] || 0) + 1; });
    });
    wrap.append(base, scan);
    sum.textContent = flagged + ' of ' + o.items.length + ' ' + o.noun + 's are in a category. ' + (o.mode === 'lens' ? 'Move the pointer over the grid to see them; the list below counts every category.' : 'Each category has its own colour and shape.');
    o.categories.forEach((c, i) => {
      const li = el('li'), b = el('button', 'kit-dg-cat kit-dg-t-' + toneOf(c.tone, i)); b.type = 'button'; b.dataset.id = c.id; b.setAttribute('aria-pressed', String(held === c.id));
      const sw = el('span', 'kit-dg-sw kit-dg-s' + (i % 5)); sw.setAttribute('aria-hidden', 'true'); b.append(sw, el('span', 'kit-dg-lab', c.label), el('b', null, String(counts[c.id] || 0)));
      if (c.note) b.title = c.note; li.append(b); list.append(li);
    });
    sync();
  }
  list.addEventListener('pointerover', e => { const b = e.target.closest('.kit-dg-cat'); if (b) { hover = b.dataset.id; sync(); } });
  list.addEventListener('pointerout', e => { const b = e.target.closest('.kit-dg-cat'); if (b && !b.contains(e.relatedTarget)) { hover = null; sync(); } });
  list.addEventListener('focusin', e => { const b = e.target.closest('.kit-dg-cat'); if (b) { hover = b.dataset.id; sync(); } });
  list.addEventListener('focusout', e => { if (e.target.closest('.kit-dg-cat')) { hover = null; sync(); } });
  list.addEventListener('click', e => { const b = e.target.closest('.kit-dg-cat'); if (!b) return; held = held === b.dataset.id ? null : b.dataset.id; list.querySelectorAll('.kit-dg-cat').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.id === held))); sync(); });
  wrap.addEventListener('pointermove', e => { const r = wrap.getBoundingClientRect(); wrap.style.setProperty('--lx', (e.clientX - r.left) + 'px'); wrap.style.setProperty('--ly', (e.clientY - r.top) + 'px'); });
  wrap.addEventListener('pointerleave', () => { wrap.style.removeProperty('--lx'); wrap.style.removeProperty('--ly'); });
  wrap.addEventListener('click', e => { const d = e.target.closest('.kit-dg-d.is-cat'); if (d && o.onPick) o.onPick(d.dataset.id); });
  wrap.addEventListener('keydown', e => { const d = e.target.closest && e.target.closest('.kit-dg-d.is-cat'); if (d && o.onPick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); o.onPick(d.dataset.id); } });
  draw();
  const th = Kit.tooltip ? Kit.tooltip.attach(wrap, { host: o.host || document.body, selector: '.kit-dg-layer.base .kit-dg-d', content: tip, focusable: false }) : null;
  return {
    highlight(id) { held = id || null; draw(); }, setMode(m) { o.mode = m; draw(); },
    update(p) { Object.assign(o, p); draw(); }, destroy() { if (th) th.destroy(); root.remove(); },
  };
}
Kit.dotgrid = Object.freeze({ mount });
})();
/* /part:page.script.kit.viz.dotgrid */

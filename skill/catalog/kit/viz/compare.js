/* part:page.script.kit.viz.compare */
/**
 * Before/after compare
 * Kit.compare.stage puts two states of one thing on one stage with three views: Before, After, and Wipe, where a divider uncovers one over the other. You pass the two states as DOM nodes, so they keep their text, focus and theme. Each view names itself on the stage, so it does not rely on colour. The divider is a real range input, which works from the keyboard (arrow keys, Home, End) and with a screen reader. Kit.compare.cards draws mechanism cards, each with a dashed Before block and a solid After block joined by an arrow, with the words Before and After in each.
 *
 * API: Kit.compare.stage(box, {before, after, labels, mode, wipe, title, caption, label}) -> {setMode(m), setWipe(pct), update(patch), destroy()}
 *        before, after  a Node, or a function returning a Node (called again on update)
 *        labels         {before: "Before", after: "After"}
 *        mode           "after" (default) | "before" | "wipe";  wipe is the divider position in per cent (default 50)
 *      Kit.compare.cards(box, {items, beforeLabel, afterLabel, label}) -> {destroy()}
 *        items          [{title, before: {label, text}, after: {label, text}, note}]   label is a short heading inside the block (optional)
 *
 * @id        viz.compare
 * @kind      component
 * @group     Visualizations
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   A before, after and wipe stage over live DOM, and before/after mechanism cards.
 * @tags      compare, before, after, wipe, diff, cards, mechanism, stage
 * @requires  none
 * @files     kit/viz/compare.css, kit/samples/compare.json
 * @provides  Kit.compare.stage, Kit.compare.cards
 * @config    Kit.compare.stage(box, opts) | before and after (a Node or a function returning one), labels {before, after}, mode: before | after | wipe, wipe 0 to 100, title, caption, label
 * @config    Kit.compare.cards(box, opts) | items [{title, before {label, text}, after {label, text}, note}], beforeLabel, afterLabel, label
 * @tokens    --panel --sunk --ink --ink-2 --rule --f-ui --f-mono --accent --accent-ink --seam? --f-display?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | a design page, parts/views.js and parts/mount.js | stage(), bindStages(): the before/after/wipe stage
 * @source    Catalog harvest, 2026-10-25 | a review page, index.html | the before and after mechanism cards
 * @source    Catalog harvest, 2026-10-25 | a comparison drawing, index.html | the before/after drawing
 * @preview   {"render": "viz.compare", "samples": ["kit/samples/compare.json"]}
 * @changed   The stage holds live DOM instead of a screenshot and a rendering, and the divider is a range input.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
let uid = 0;
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const node = v => typeof v === 'function' ? v() : v;

function stage(box, opts) {
  const o = Object.assign({ labels: { before: 'Before', after: 'After' }, mode: 'after', wipe: 50 }, opts); o.labels = Object.assign({ before: 'Before', after: 'After' }, o.labels);
  const id = 'kcmp' + (++uid); box.replaceChildren();
  const fig = el('figure', 'kit-cmp'), bar = el('div', 'kit-cmp-bar'), seg = el('div', 'kit-cmp-seg'), st = el('div', 'kit-cmp-stage');
  seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'View'); if (o.label) fig.setAttribute('aria-label', o.label);
  const head = el('div', 'kit-cmp-head'); if (o.title) head.append(el('b', null, o.title)); bar.append(head, seg);
  const lb = el('div', 'kit-cmp-layer is-before'), la = el('div', 'kit-cmp-layer is-after'), tb = el('span', 'kit-cmp-tag tb', o.labels.before), ta = el('span', 'kit-cmp-tag ta', o.labels.after);
  const line = el('i', 'kit-cmp-line'); line.setAttribute('aria-hidden', 'true'); const knob = el('i', 'kit-cmp-knob', '↔'); line.append(knob);
  const rng = el('input', 'kit-cmp-range'); rng.type = 'range'; rng.min = 0; rng.max = 100; rng.step = 1; rng.id = id + 'r'; rng.setAttribute('aria-label', 'Wipe between ' + o.labels.before.toLowerCase() + ' and ' + o.labels.after.toLowerCase());
  st.append(la, lb, tb, ta, line, rng); fig.append(bar, st); if (o.caption) fig.append(el('figcaption', 'kit-cmp-cap', o.caption)); box.append(fig);
  const buttons = {};
  [['before', o.labels.before], ['after', o.labels.after], ['wipe', 'Wipe']].forEach(([m, t]) => { const b = el('button', null, t); b.type = 'button'; b.dataset.m = m; buttons[m] = b; b.addEventListener('click', () => setMode(m)); seg.append(b); });
  function fill() { lb.replaceChildren(); la.replaceChildren(); const b = node(o.before), a = node(o.after); if (b) lb.append(b); if (a) la.append(a); }
  function paint() {
    st.dataset.mode = o.mode; Object.keys(buttons).forEach(m => buttons[m].setAttribute('aria-pressed', String(m === o.mode)));
    st.style.setProperty('--wx', o.wipe + '%'); lb.style.clipPath = o.mode === 'wipe' ? 'inset(0 ' + (100 - o.wipe) + '% 0 0)' : 'none'; rng.value = o.wipe; rng.disabled = o.mode !== 'wipe'; rng.tabIndex = o.mode === 'wipe' ? 0 : -1;
    rng.setAttribute('aria-valuetext', o.wipe + ' per cent ' + o.labels.before.toLowerCase());
    lb.inert = o.mode === 'after'; la.inert = o.mode === 'before'; lb.setAttribute('aria-hidden', String(o.mode === 'after')); la.setAttribute('aria-hidden', String(o.mode === 'before'));
  }
  function setMode(m) { o.mode = m; paint(); if (m === 'wipe') rng.focus({ preventScroll: true }); }
  rng.addEventListener('input', () => { o.wipe = +rng.value; paint(); });
  fill(); paint();
  return { setMode, setWipe(p) { o.wipe = Math.max(0, Math.min(100, p)); paint(); }, update(p) { Object.assign(o, p); fill(); paint(); }, destroy() { fig.remove(); } };
}

function cards(box, opts) {
  const o = Object.assign({ items: [], beforeLabel: 'Before', afterLabel: 'After' }, opts); box.replaceChildren();
  const ul = el('ul', 'kit-cmp-cards'); if (o.label) ul.setAttribute('aria-label', o.label);
  o.items.forEach(it => {
    const li = el('li', 'kit-cmp-card'); li.append(el('h4', null, it.title));
    const row = el('div', 'kit-cmp-pair');
    const blk = (cls, word, d) => { const b = el('div', 'kit-cmp-blk ' + cls); b.append(el('span', 'kit-cmp-w', word)); if (d && d.label) b.append(el('b', null, d.label)); if (d && d.text) b.append(el('p', null, d.text)); return b; };
    const ar = el('span', 'kit-cmp-to', '→'); ar.setAttribute('aria-hidden', 'true');
    row.append(blk('is-before', o.beforeLabel, it.before), ar, blk('is-after', o.afterLabel, it.after)); li.append(row);
    if (it.note) li.append(el('p', 'kit-cmp-note', it.note)); ul.append(li);
  });
  box.append(ul); return { destroy() { ul.remove(); } };
}
Kit.compare = Object.freeze({ stage, cards });
})();
/* /part:page.script.kit.viz.compare */

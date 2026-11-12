/* part:page.script.kit.viz.compare */
/* Kit visualization: before and after (Kit.compare)    kit version 0.1.0
   What it is: two ways to show a change.
     stage   two states of one thing on one stage, with three views: Before, After, and Wipe, where a divider you drag (or move with the arrow keys) uncovers one over the other. The states are
             real DOM you pass in, so they keep their text, focus and theme. Each view says its own name on the stage, so it does not rely on colour or on remembering which side is which.
     cards   a set of mechanism cards: for each one a Before block (dashed) and an After block (solid), joined by an arrow, with the words "Before" and "After" in each.
   API: Kit.compare.stage(box, {before, after, labels, mode, wipe, title, caption, label}) -> {setMode(m), setWipe(pct), update(patch), destroy()}
          before, after  a Node, or a function returning a Node (called again on update)
          labels         {before: "Before", after: "After"}
          mode           "after" (default) | "before" | "wipe";  wipe is the divider position in per cent (default 50)
        Kit.compare.cards(box, {items, beforeLabel, afterLabel, label}) -> {destroy()}
          items          [{title, before: {label, text}, after: {label, text}, note}]   label is a short heading inside the block (optional)
   Needs from the board:
     css     kit/viz/compare.css; custom properties --panel --sunk --ink --ink-2 --rule --rule-2 --accent --accent-ink --accent-soft --ok --danger --f-ui --f-mono, optional --seam
     globals none
   db collections: none.
   Lifted from: a design page's before/after/wipe stage (two renderings, a segmented control and a range overlay), a review page's before and after mechanism cards, and a before/after
   comparison drawing. Changed: the stage holds live DOM instead of an image and a rendering; the divider is a real range input, so it works from the keyboard and with a screen reader. */
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

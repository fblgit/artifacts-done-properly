/* part:page.script.kit.patterns.figures */
/* Kit pattern: key figures and the report hero (Kit.figures)    kit version 0.1.0    extends viz.core (Figures); a new file, kit/viz/core.js is unchanged
   What it is: the numbers that open a report, in four layouts, and a hero that carries them. Figures can count up once when they first show (skipped for prefers-reduced-motion and when
   the page is hidden; the final number is the text the screen reader gets either way). Plain DOM; every string is set with textContent.
   API (small and stable):
     Kit.figures.render(box, {variant, items, label, countUp}) -> {update(items), destroy()}
       variant  "grid" (default) | "tiles" | "strip" | "facts"
       item     grid:  {value, label, unit, hot, count}            value a number or text; count true counts a number up; hot marks the key figure (one is plenty)
                tiles: {label, value: "Healthy", note, tone}       tone ok | warn | danger | info | muted: the state is the word, the dot repeats it
                strip: {label, value: "A short phrase", note}
                facts: {label, value, note}
     Kit.figures.hero(box, {stamp, title, lede, chips, items, variant, countUp}) -> same handle
       chips    [{label, value}]   a row of summary chips under the lede
   Needs from the board:
     css     kit/patterns/figures.css; custom properties --panel --sunk --ink --ink-2 --rule --rule-2 --accent --accent-soft --ok --warn --danger --f-ui --f-mono --f-display, optional --seam --gold-leaf --info --shadow
     globals none
   db collections: none.
   Lifted from: seven documents' figure rows (a hairline key-figure grid, a hero with count-up stats, a hero with summary chips, a status tile row, one-screen summary tiles, a three-up state strip, a facts strip). */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } };
const fmt = n => Number.isInteger(n) ? n.toLocaleString('en-GB') : String(n);
function countTo(node, n, ms) {
  if (reduced() || document.hidden || !isFinite(n) || !window.requestAnimationFrame) { node.textContent = fmt(n); return; }
  const t0 = performance.now(); node.textContent = fmt(0);
  (function f(t) { const k = Math.min(1, (t - t0) / ms); node.textContent = fmt(Math.round(n * (1 - Math.pow(1 - k, 3)))); if (k < 1) requestAnimationFrame(f); else node.textContent = fmt(n); })(t0);
}
function cell(it, variant, count) {
  const d = el('div'); const dt = el('dt', null, it.label); const dd = el('dd');
  if (variant === 'grid') {
    if (it.hot) d.dataset.hot = '';
    if (it.count && typeof it.value === 'number' && count) { dd.setAttribute('aria-label', fmt(it.value) + (it.unit ? ' ' + it.unit : '')); const s = el('span'); s.setAttribute('aria-hidden', 'true'); s.dataset.n = it.value; dd.append(s); }
    else dd.append(document.createTextNode(typeof it.value === 'number' ? fmt(it.value) : String(it.value)));
    if (it.unit) { const u = el('span', 'kit-fig-u', it.unit); dd.append(u); }
    d.append(dt, dd);
  } else {
    if (it.tone && variant === 'tiles') d.dataset.tone = it.tone;
    dd.textContent = it.value == null ? '' : String(it.value); d.append(dt, dd);
    if (it.note) d.append(el('dd', null, it.note));
  }
  return d;
}
function render(box, opts) {
  const o = Object.assign({ variant: 'grid', countUp: true }, opts);
  const dl = el('dl', 'kit-figs'); dl.dataset.variant = o.variant; if (o.label) dl.setAttribute('aria-label', o.label);
  let io = null;
  function paint(items) {
    dl.replaceChildren(...(items || []).map(it => cell(it, o.variant, o.countUp)));
    const nodes = [...dl.querySelectorAll('[data-n]')];
    if (!nodes.length) return;
    const run = () => nodes.forEach(s => countTo(s, +s.dataset.n, 800));
    nodes.forEach(s => { s.textContent = fmt(+s.dataset.n); });
    if (io) io.disconnect();
    if (window.IntersectionObserver && !reduced()) { io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); run(); } }, { threshold: .4 }); io.observe(dl); }
  }
  paint(o.items);
  box.replaceChildren(dl);
  return { update: paint, destroy() { if (io) io.disconnect(); } };
}
function hero(box, opts) {
  const o = Object.assign({ variant: 'grid', countUp: true }, opts);
  const h = el('header', 'kit-hero');
  if (o.stamp) h.append(el('p', 'kit-hero-stamp', o.stamp));
  h.append(el('h2', null, o.title));
  if (o.lede) h.append(el('p', 'kit-hero-lede', o.lede));
  if (o.chips && o.chips.length) { const ul = el('ul', 'kit-hero-chips'); o.chips.forEach(c => { const li = el('li'); li.append(el('b', null, c.value), document.createTextNode(c.label)); ul.append(li); }); h.append(ul); }
  const slot = el('div'); h.append(slot); box.replaceChildren(h);
  return render(slot, { variant: o.variant, items: o.items, countUp: o.countUp, label: o.label || 'Key figures' });
}
Kit.figures = Object.freeze({ render, hero });
})();
/* /part:page.script.kit.patterns.figures */

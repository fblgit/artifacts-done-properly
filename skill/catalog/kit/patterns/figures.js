/* part:page.script.kit.patterns.figures */
/**
 * Key figures and hero
 * The numbers that open a report. Kit.figures.render draws a dl in one of four layouts: grid (hairline cells, one marked as the key figure), tiles (a label, the state as a word with a dot, a line under it), strip (three statements split by rules) and facts (label and value pairs under rules). Kit.figures.hero wraps them with an optional stamp, a title, a lede, a row of summary chips and one gold hairline. Figures can count up once when they scroll into view; reduced motion and hidden pages get the final number. An upgrade of viz.core's Figures as a new file.
 *
 * The numbers that open a report, in four layouts, and a hero that carries them. Figures can count up once when they first show (skipped for prefers-reduced-motion and when
 * the page is hidden; the final number is the text the screen reader gets either way). Plain DOM; every string is set with textContent.
 *
 * API (small and stable):
 *   Kit.figures.render(box, {variant, items, label, countUp}) -> {update(items), destroy()}
 *     variant  "grid" (default) | "tiles" | "strip" | "facts"
 *     item     grid:  {value, label, unit, hot, count}            value a number or text; count true counts a number up; hot marks the key figure (one is plenty)
 *              tiles: {label, value: "Healthy", note, tone}       tone ok | warn | danger | info | muted: the state is the word, the dot repeats it
 *              strip: {label, value: "A short phrase", note}
 *              facts: {label, value, note}
 *   Kit.figures.hero(box, {stamp, title, lede, chips, items, variant, countUp}) -> same handle
 *     chips    [{label, value}]   a row of summary chips under the lede
 *
 * CSS classes: .kit-figs .kit-hero
 *
 * @id        pattern.figures
 * @kind      component
 * @group     Patterns
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   A report hero with stamp, summary chips and count-up figures, and four figure layouts: hairline grid, status tiles, three-up strip and facts.
 * @tags      figures, hero, stats, kpi, tiles, summary, count up, facts, report
 * @requires  none
 * @files     kit/patterns/figures.css, kit/samples/patterns.json
 * @provides  Kit.figures.render, Kit.figures.hero
 * @extends   viz.core
 * @config    Kit.figures.render(box, opts) | variant grid|tiles|strip|facts; items per variant (grid {value, label, unit, hot, count}; tiles {label, value, note, tone}; strip and facts {label, value, note}); countUp, label
 * @config    Kit.figures.hero(box, opts) | stamp, title, lede, chips [{label, value}], items, variant, countUp
 * @tokens    --panel --sunk --ink --ink-2 --rule --rule-2 --accent --f-ui --f-mono --f-display --accent-soft --ok --warn --danger --shadow --info? --seam? --gold-leaf?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | 7 artifacts' index.html | a hairline key-figure grid, a hero with count-up stats, a hero with summary chips, a status tile row, one-screen summary tiles, a three-up state strip and a facts strip
 * @preview   {"render": "pattern.figures", "samples": ["kit/samples/patterns.json#figures"]}
 * @samples   figures
 * @changed   New file beside kit/viz/core.js; core.js and viz.css are unchanged.
 */
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

/* part:page.script.kit.tooltip */
/**
 * Hover and focus tooltip
 * Kit.tooltip.attach(root, {selector, host, focusable, content}) delegates hover and focus from root to the descendants that carry a tip (data-tip, optional data-tip-title, or content(el) returning text, {title, text, rows} or a Node). It follows the pointer on hover, sits above the element on focus, flips below when there is no room, stays inside the viewport, links itself with aria-describedby and closes on Escape, scroll, resize or leave. Marks that cannot take focus get tabindex 0 and an aria-label. Kit.tooltip.show(el, content, {x, y, host}) and hide() work by hand. The API is small and stable: the visualizations of the next batch call it.
 *
 * What it is: one tooltip for the marks of a chart or grid. It follows the pointer on hover and sits above the element on keyboard focus, flips below when there is no room above,
 * stays inside the viewport, links itself to the element with aria-describedby while shown, and closes on Escape and when the pointer or focus leaves. A pointer tip also closes on scroll and
 * resize; a focus tip follows its element instead.
 * Plain DOM, no dependency. Batch 3 (the visualizations) reuses it: this API is small and stable, extend it only by adding options.
 * API:
 *   Kit.tooltip.attach(root, {selector, host, focusable, content}) -> {refresh(scope), hide(), destroy()}
 *     root        an element; hover and focus are delegated from it, so marks added later work without another call (call refresh() to make them focusable)
 *     selector    which descendants carry a tip (default "[data-tip]"); the text is the element's data-tip, and data-tip-title adds a bold first line
 *     content     optional function (el) => string | {title, text, rows: [[label, value], ...]} | Node, used instead of the data attributes
 *     host        the element the tooltip is appended to (default document.body). Pass the themed ancestor when the board sets its tokens on an element instead of :root
 *     focusable   true (default): matched elements that cannot take focus get tabindex="0", and an aria-label from the tip when they have no name, so a keyboard user reaches every mark
 *   Kit.tooltip.show(el, content, {x, y, host}) / Kit.tooltip.hide()   the same tooltip by hand; x and y are viewport coordinates (omit them to anchor to the element)
 *   Kit.tooltip.text(content) -> string   the plain text of a content value (for aria-label)
 *
 * @id        kit.tooltip
 * @kind      component
 * @group     Board kit
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   One tooltip that follows the pointer and keyboard focus for marks in charts and grids; the shared tooltip of the visualizations.
 * @tags      tooltip, hover, focus, chart, marks, keyboard, popover, label
 * @requires  none
 * @files     kit/tooltip.css, kit/samples/tooltip.json
 * @provides  Kit.tooltip.attach, Kit.tooltip.show, Kit.tooltip.hide, Kit.tooltip.text
 * @config    Kit.tooltip.attach(root, opts) | selector (default [data-tip]), host (the themed element it is appended to), focusable (default true), content(el) -> string | {title, text, rows} | Node; returns {refresh, hide, destroy}
 * @config    Kit.tooltip.show(el, content, opts) | x and y in viewport coordinates, host
 * @tokens    --ink --panel --shadow? --f-ui --f-mono
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | 1 artifact's index.html | a disk-usage report's showTip() and #tip that follow the pointer and focus
 * @preview   {"render": "kit.tooltip", "samples": ["kit/samples/tooltip.json"]}
 * @changed   Keyboard-safe: tipped marks become focusable and named, the tooltip is described-by, and Escape closes it.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
let tip = null, shownFor = null, last = null, uid = 0, off = [];
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

function text(c) {
  if (c == null) return '';
  if (c instanceof Node) return c.textContent || '';
  if (typeof c === 'object') return [c.title, c.text].concat((c.rows || []).map(r => r[0] + ' ' + r[1])).filter(Boolean).join('. ');
  return String(c);
}
function fill(box, c) {
  box.replaceChildren();
  if (c instanceof Node) { box.append(c); return; }
  if (typeof c !== 'object' || c === null) { box.textContent = String(c == null ? '' : c); return; }
  if (c.title) box.append(el('b', 'kit-tip-t', c.title));
  if (c.text) box.append(el('span', 'kit-tip-x', c.text));
  if (c.rows && c.rows.length) {
    const dl = el('dl', 'kit-tip-rows');
    c.rows.forEach(([k, v]) => { const r = el('div'); r.append(el('dt', null, k), el('dd', null, v)); dl.append(r); });
    box.append(dl);
  }
}
function ensure(host) {
  if (!tip) { tip = el('div', 'kit-tip'); tip.setAttribute('role', 'tooltip'); tip.id = 'kit-tip-' + (++uid); }
  if (tip.parentNode !== host) host.append(tip);
  return tip;
}
function unlisten() { off.forEach(f => f()); off = []; }
function hide() {
  if (shownFor) { shownFor.removeAttribute('aria-describedby'); shownFor = null; }
  if (tip) tip.classList.remove('on');
  unlisten();
}
function show(target, content, o) {
  const opt = o || {}; last = [target, content, opt];
  const t = ensure(opt.host || document.body);
  fill(t, content);
  if (shownFor && shownFor !== target) shownFor.removeAttribute('aria-describedby');
  shownFor = target; target.setAttribute('aria-describedby', t.id);
  t.style.left = '0px'; t.style.top = '0px'; t.classList.add('on');
  const r = t.getBoundingClientRect(), tr = target.getBoundingClientRect();
  const hasPt = typeof opt.x === 'number' && typeof opt.y === 'number';
  const x = hasPt ? opt.x : tr.left + tr.width / 2;
  const above = hasPt ? opt.y : tr.top, below = hasPt ? opt.y + 18 : tr.bottom + 8;
  const left = Math.min(innerWidth - r.width - 8, Math.max(8, x - r.width / 2));
  let top = above - r.height - 12; if (top < 8) top = Math.min(below, Math.max(8, innerHeight - r.height - 8));
  t.style.left = left + 'px'; t.style.top = top + 'px';
  // a transformed ancestor makes position: fixed relative to itself; measure and correct once
  const a = t.getBoundingClientRect();
  if (Math.abs(a.left - left) > 1 || Math.abs(a.top - top) > 1) { t.style.left = (left - (a.left - left)) + 'px'; t.style.top = (top - (a.top - top)) + 'px'; }
  if (!off.length) {
    const onKey = e => { if (e.key === 'Escape') hide(); };
    // a tip that came from focus follows its element as the page scrolls; one that came from the pointer closes
    const onMove = () => { if (shownFor && last && shownFor.matches(':focus-visible')) show(last[0], last[1], { host: last[2].host }); else hide(); };
    document.addEventListener('keydown', onKey, true); window.addEventListener('scroll', onMove, true); window.addEventListener('resize', onMove);
    off = [() => document.removeEventListener('keydown', onKey, true), () => window.removeEventListener('scroll', onMove, true), () => window.removeEventListener('resize', onMove)];
  }
}
const NATIVE = 'a[href],button,input,select,textarea,summary,[tabindex]';
function attach(root, opts) {
  const o = Object.assign({ selector: '[data-tip]', host: null, focusable: true, content: null }, opts);
  const contentOf = n => o.content ? o.content(n) : (n.dataset.tipTitle ? { title: n.dataset.tipTitle, text: n.dataset.tip } : n.dataset.tip);
  const find = t => { const n = t && t.closest ? t.closest(o.selector) : null; return n && root.contains(n) ? n : null; };
  function refresh(scope) {
    if (!o.focusable) return;
    (scope || root).querySelectorAll(o.selector).forEach(n => {
      if (!n.matches(NATIVE)) n.tabIndex = 0;
      if (!n.hasAttribute('aria-label') && !n.getAttribute('aria-labelledby') && !(n.textContent || '').trim()) n.setAttribute('aria-label', text(contentOf(n)));
    });
  }
  const move = e => { const n = find(e.target); if (n) show(n, contentOf(n), { x: e.clientX, y: e.clientY, host: o.host }); else if (shownFor && !shownFor.matches(':focus-visible')) hide(); };
  const focus = e => { const n = find(e.target); if (n) show(n, contentOf(n), { host: o.host }); };
  const blur = e => { if (find(e.target) === shownFor) hide(); };
  const leave = () => { if (shownFor && !shownFor.matches(':focus-visible')) hide(); };
  root.addEventListener('pointermove', move); root.addEventListener('pointerleave', leave);
  root.addEventListener('focusin', focus); root.addEventListener('focusout', blur);
  refresh();
  return {
    refresh, hide,
    destroy() {
      root.removeEventListener('pointermove', move); root.removeEventListener('pointerleave', leave);
      root.removeEventListener('focusin', focus); root.removeEventListener('focusout', blur);
      if (shownFor && root.contains(shownFor)) hide();
    },
  };
}
Kit.tooltip = Object.freeze({ attach, show, hide, text });
})();
/* /part:page.script.kit.tooltip */

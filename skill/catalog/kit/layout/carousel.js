/* part:page.script.kit.carousel */
/**
 * Carousel strip
 * Kit.carousel.mount(box, {items, render, label, cardWidth, gap}) draws a strip of cards. The strip is a labelled region you can Tab to and move with Left, Right, Home and End; mouse drag scrolls it (and swallows the click that ends a drag); touch and trackpads use native scroll. The arrow buttons disable at the ends and disappear when every card fits, and a fade shows only on the side where more cards wait (data-start, data-end, data-fit). onVisible reports the first and last visible card. bind() wires hand-written markup. Reduced motion jumps instead of gliding.
 *
 * API (small and stable):
 *   Kit.carousel.mount(box, {items, render, label, cardWidth, gap, arrows, onVisible}) -> {update(items), scrollTo(i), index(), destroy(), track}
 *     items       any array; render(item, i) -> Node | string builds one card (the card gets class kit-car-card; you style its inside)
 *     label       accessible name of the strip ("Phases"); default "Cards"
 *     cardWidth   css width of one card (default "min(280px, 78%)")     gap  css gap (default "14px")
 *     arrows      true (default) shows previous and next buttons
 *     onVisible   (firstIndex, lastIndex) after the visible range changes
 *   Kit.carousel.bind(root, opts) -> same handle, for hand-written markup: root = div.kit-car > div.kit-car-track > .kit-car-card…; the arrows and fades are added.
 * State attributes on .kit-car: data-start="more" when cards wait on the left, data-end="more" when they wait on the right, data-fit="true" when everything fits (no arrows, no fades).
 *
 * @id        layout.carousel
 * @kind      component
 * @group     Layouts
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   A sideways strip of cards: snap scrolling, arrow buttons that disable at the ends, edge fades only where more cards wait, mouse drag and arrow keys.
 * @tags      carousel, strip, scroll, snap, cards, drag, arrows
 * @requires  kit.tokens
 * @files     kit/layout/carousel.css, kit/samples/carousel.json
 * @provides  Kit.carousel.mount, Kit.carousel.bind
 * @config    Kit.carousel.mount(box, {items, render(item, i), label, cardWidth, gap, arrows, onVisible}) | render returns a Node or a string; the card gets class kit-car-card
 * @tokens    --bg --panel --ink --rule --accent --shadow? --seam? --kit-car-fade?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | an earlier board's phase and page carousels | the scroll-state classes for fades and arrows
 * @source    Catalog harvest, 2026-10-25 | a component family's carousel | ResizeObserver, drag and keys
 * @source    Catalog harvest, 2026-10-25 | a kanban strip | the horizontal scroll
 * @preview   {"render": "layout.carousel", "samples": ["kit/samples/carousel.json"], "uses": ["kit.vocab"]}
 * @changed   One strip for phases, pages and columns; fades and arrows follow measured scroll state, so neither appears when it would do nothing.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ARROW = { prev: '<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>', next: '<path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>' };

function wire(root, track, o) {
  const prev = el('button', 'kit-car-btn kit-car-prev'), next = el('button', 'kit-car-btn kit-car-next');
  [[prev, 'prev', 'Show earlier cards'], [next, 'next', 'Show later cards']].forEach(([b, k, l]) => { b.type = 'button'; b.setAttribute('aria-label', l); b.tabIndex = -1; b.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' + ARROW[k] + '</svg>'; });
  if (o.arrows !== false) root.append(prev, next);
  const cards = () => [...track.children];
  const step = dir => {
    const c = cards(); if (!c.length) return;
    const w = c[0].getBoundingClientRect().width, g = parseFloat(getComputedStyle(track).columnGap) || 0;
    track.scrollBy({ left: dir * Math.max(w + g, track.clientWidth * .8), behavior: reduced() ? 'auto' : 'smooth' });
  };
  let lastRange = '';
  const state = () => {
    const max = track.scrollWidth - track.clientWidth, x = Math.round(track.scrollLeft), fit = max <= 1;
    root.dataset.fit = String(fit); root.dataset.start = !fit && x > 1 ? 'more' : 'none'; root.dataset.end = !fit && x < max - 1 ? 'more' : 'none';
    prev.disabled = fit || x <= 1; next.disabled = fit || x >= max - 1; prev.hidden = next.hidden = fit;
    const tr = track.getBoundingClientRect(); let a = -1, z = -1;
    cards().forEach((c, i) => { const r = c.getBoundingClientRect(); if (r.right > tr.left + 2 && r.left < tr.right - 2) { if (a < 0) a = i; z = i; } });
    const rg = a + ':' + z; if (rg !== lastRange) { lastRange = rg; if (o.onVisible) o.onVisible(a, z); }
  };
  let raf = 0; const soon = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(state); };
  track.addEventListener('scroll', soon, { passive: true });
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(soon) : null; if (ro) { ro.observe(track); cards().forEach(c => ro.observe(c)); }
  prev.addEventListener('click', () => step(-1)); next.addEventListener('click', () => step(1));
  track.addEventListener('keydown', e => {
    if (e.target !== track || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === 'Home') { e.preventDefault(); track.scrollTo({ left: 0, behavior: reduced() ? 'auto' : 'smooth' }); }
    else if (e.key === 'End') { e.preventDefault(); track.scrollTo({ left: track.scrollWidth, behavior: reduced() ? 'auto' : 'smooth' }); }
  });
  // mouse drag; a drag past 5px swallows the click that follows it
  let drag = null, moved = false;
  track.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('input,textarea,select')) return;
    drag = { x: e.clientX, left: track.scrollLeft, id: e.pointerId }; moved = false;
  });
  track.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (!moved && Math.abs(dx) > 5) { moved = true; track.classList.add('kit-car-drag'); try { track.setPointerCapture(e.pointerId); } catch (_) {} }
    if (moved) track.scrollLeft = drag.left - dx;
  });
  const end = () => { if (!drag) return; drag = null; track.classList.remove('kit-car-drag'); };
  track.addEventListener('pointerup', end); track.addEventListener('pointercancel', end);
  track.addEventListener('click', e => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
  state();
  return {
    track, index() { const [a] = lastRange.split(':').map(Number); return a < 0 ? 0 : a; },
    scrollTo(i) { const c = cards()[i]; if (c) track.scrollTo({ left: c.offsetLeft - track.offsetLeft, behavior: reduced() ? 'auto' : 'smooth' }); },
    refresh() { if (ro) cards().forEach(c => ro.observe(c)); soon(); },
    destroy() { if (ro) ro.disconnect(); cancelAnimationFrame(raf); },
  };
}
function mount(box, o) {
  o = o || {}; box.textContent = ''; box.classList.add('kit-car');
  box.style.setProperty('--kit-car-w', o.cardWidth || 'min(280px, 78%)'); box.style.setProperty('--kit-car-gap', o.gap || '14px');
  const track = el('div', 'kit-car-track'); track.tabIndex = 0; track.setAttribute('role', 'region'); track.setAttribute('aria-label', o.label || 'Cards');
  box.append(track);
  const draw = items => { track.textContent = ''; (items || []).forEach((it, i) => { const c = el('div', 'kit-car-card'); const n = o.render ? o.render(it, i) : String(it); c.append(n instanceof Node ? n : document.createTextNode(String(n))); track.append(c); }); };
  draw(o.items);
  const h = wire(box, track, o);
  const stop = h.destroy;
  return Object.assign(h, { update(items) { draw(items); h.refresh(); }, destroy() { stop(); box.classList.remove('kit-car'); box.textContent = ''; } });
}
function bind(root, o) {
  o = o || {}; root.classList.add('kit-car'); const track = root.querySelector('.kit-car-track'); if (!track) throw new Error('kit.carousel.bind: no .kit-car-track inside');
  if (!track.hasAttribute('tabindex')) track.tabIndex = 0; track.setAttribute('role', 'region'); if (!track.hasAttribute('aria-label')) track.setAttribute('aria-label', o.label || 'Cards');
  return wire(root, track, o);
}
Kit.carousel = Object.freeze({ mount, bind });
})();
/* /part:page.script.kit.carousel */

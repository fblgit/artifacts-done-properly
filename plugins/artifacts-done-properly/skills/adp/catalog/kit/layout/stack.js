/* part:page.script.kit.stack */
/**
 * Stacked sections
 * Kit.stack.mount(root, {items}) (or bind(root) over hand-written sections) makes a page of full-height sections that stick and are covered by the next as you scroll. A section taller than the screen sticks when its bottom meets the bottom of the screen, so all of it can be read. A bar at the top shows the progress and 'Step 3 of 4' with the section's name, and is a progressbar for assistive tech; each section ends with previous and next buttons that scroll to it and move focus to its heading. On a narrow screen (700px) and with reduced motion the sections stay in normal flow and everything else still works. Pass scroller to run it inside a framed area, and top to leave room for a fixed header. The mouse-wheel detents of the source are not carried: scrolling stays the browser's own.
 *
 * API (small and stable):
 *   Kit.stack.mount(root, {items, label, scroller, top, barLabel, footers}) -> {current(), count(), go(indexOrId), update(), destroy()}
 *     items     [{id, title, eyebrow, render(body, i) | node}]   id is a bare token (letters, digits, . _ ~ -); render fills the section body, or pass a node/string
 *     label     accessible name of the whole stack (default "Sections")
 *     scroller  the scrolling element when the stack lives in a framed area instead of the page (default: the page)
 *     top       css length the stack sticks below, for a fixed header above it (default "0px"); the bar sits at this offset
 *     barLabel  the text before the step count (default "Step")
 *     footers   false leaves out the previous and next footers
 *   Kit.stack.bind(root, opts) -> same handle, for hand-written markup: root > section (each with an id and a heading); the bar and the footers are added
 *   The step count is also read by assistive tech through a progressbar (valuenow is the step, valuetext "Step 3 of 4: Title"); go() moves focus to the section's heading.
 * State: data-flow="true" on the root while it is a plain page; [data-current] on the section in view; --kit-stack-h (the screen height the sections fill) is set on the root.
 *
 * ResizeObserver keeps the sticking points right when a section height changes.
 *
 * @id        layout.stack
 * @kind      component
 * @group     Layouts
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   Full-height sections that rise over each other, with the tall-section fix, a progress bar, step N of M and previous and next footers.
 * @tags      sticky, stacked, sections, scroll, progress, step, footer, previous, next, story
 * @requires  kit.tokens
 * @files     kit/layout/stack.css, kit/samples/layout.json
 * @provides  Kit.stack.mount, Kit.stack.bind
 * @config    Kit.stack.mount(root, {items, label, scroller, top, barLabel, footers}) | items [{id, title, eyebrow, render(body, i) | node}]; returns {current(), count(), go(indexOrId), update(), destroy()}
 * @config    Kit.stack.bind(root, opts) | for hand-written markup: root > section, each with an id and a heading
 * @tokens    --bg --panel --sunk --ink --ink-2 --rule --accent --f-ui --f-display? --f-mono --seam? --accent-soft? --rule-2?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | an earlier board's journey page | sticky stacked sections, the tall-section fix, the progress bar, step count and previous and next section footers
 * @preview   {"render": "layout.stack", "samples": ["kit/samples/layout.json#stack"]}
 * @samples   stack
 * @changed   The wheel hijack that held a section at its detent is dropped: it fights the viewer's own scrolling. The fall back to normal flow on phones and with reduced motion is added.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const OK = /^[A-Za-z0-9._~-]+$/;
const mqNarrow = () => matchMedia('(max-width: 700px)'), mqReduce = () => matchMedia('(prefers-reduced-motion: reduce)');
let uid = 0;

function wire(root, o) {
  const n = ++uid;
  const secs = [...root.querySelectorAll(':scope > .kit-stack-sec')];
  const sc = o.scroller || null;
  const bar = el('div', 'kit-stack-bar'), fill = el('span', 'kit-stack-fill'), label = el('span', 'kit-stack-step'), name = el('span', 'kit-stack-name');
  bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-label', o.label); bar.setAttribute('aria-valuemin', '1'); bar.setAttribute('aria-valuemax', String(secs.length));
  const track = el('span', 'kit-stack-track'); track.append(fill); bar.append(label, name, track);
  root.prepend(bar);
  root.style.setProperty('--kit-stack-top', o.top);
  const view = () => sc ? sc.clientHeight : window.innerHeight;
  const flow = () => mqNarrow().matches || mqReduce().matches;
  let cur = 0, raf = 0, ro = null;

  function titleOf(s) { const h = s.querySelector('.kit-stack-title, h1, h2, h3'); return h ? h.textContent : s.id; }
  function layout() {
    const f = flow(); root.dataset.flow = String(f); root.style.setProperty('--kit-stack-h', view() + 'px');
    secs.forEach((s, i) => {
      if (f || i === secs.length - 1) { s.style.top = ''; return; }
      s.style.top = 'calc(var(--kit-stack-top, 0px) + ' + Math.min(0, view() - s.offsetHeight - (bar.offsetHeight || 0)) + 'px)';
    });
    paint();
  }
  function paint() {
    raf = 0; const ref = sc ? sc.getBoundingClientRect().top : 0, vh = view();
    let c = 0; secs.forEach((s, i) => { if (s.getBoundingClientRect().top - ref <= vh * .5) c = i; });
    const R = root.getBoundingClientRect(), total = Math.max(1, R.height - vh), p = Math.min(1, Math.max(0, (ref - R.top) / total));
    fill.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    if (c !== cur || !bar.dataset.set) {
      cur = c; bar.dataset.set = '1';
      secs.forEach((s, i) => { if (i === cur) s.setAttribute('data-current', ''); else s.removeAttribute('data-current'); });
      label.textContent = o.barLabel + ' ' + (cur + 1) + ' of ' + secs.length; name.textContent = secs[cur] ? titleOf(secs[cur]) : '';
      bar.setAttribute('aria-valuenow', String(cur + 1)); bar.setAttribute('aria-valuetext', o.barLabel + ' ' + (cur + 1) + ' of ' + secs.length + ': ' + name.textContent);
    }
  }
  const sched = () => { if (!raf) raf = requestAnimationFrame(paint); };
  function offsetOf(i) {
    const ref = sc ? sc.getBoundingClientRect().top : 0, scrolled = sc ? sc.scrollTop : (window.scrollY || 0);
    const rootTop = root.getBoundingClientRect().top - ref + scrolled;
    if (flow()) return secs[i].getBoundingClientRect().top - ref + scrolled - (bar.offsetHeight || 0);
    let y = 0; for (let j = 0; j < i; j++) y += secs[j].offsetHeight;
    return rootTop + y;
  }
  function go(x) {
    const i = typeof x === 'number' ? x : secs.findIndex(s => s.id === x); if (i < 0 || i >= secs.length) return;
    const top = Math.max(0, offsetOf(i)), behavior = mqReduce().matches ? 'auto' : 'smooth';
    if (sc) sc.scrollTo({ top, behavior }); else window.scrollTo({ top, behavior });
    const h = secs[i].querySelector('.kit-stack-title, h1, h2, h3'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
  }
  if (o.footers !== false) secs.forEach((s, i) => {
    const f = el('nav', 'kit-stack-foot'); f.setAttribute('aria-label', 'Previous and next section');
    const mk = (j, dir) => {
      if (j < 0 || j >= secs.length) return el('span');
      const b = el('button', 'kit-stack-nav kit-stack-' + dir); b.type = 'button';
      const t = el('span'); t.append(el('small', null, dir === 'prev' ? 'Previous' : 'Next'), document.createTextNode(titleOf(secs[j])));
      b.append(dir === 'prev' ? el('span', 'kit-stack-arr', '←') : t, dir === 'prev' ? t : el('span', 'kit-stack-arr', '→'));
      b.querySelectorAll('.kit-stack-arr').forEach(a => a.setAttribute('aria-hidden', 'true'));
      b.addEventListener('click', () => go(j)); return b;
    };
    f.append(mk(i - 1, 'prev'), mk(i + 1, 'next')); s.append(f);
  });
  const target = sc || window;
  target.addEventListener('scroll', sched, { passive: true }); window.addEventListener('resize', layout);
  const mqs = [mqNarrow(), mqReduce()]; mqs.forEach(m => m.addEventListener && m.addEventListener('change', layout));
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(layout); secs.forEach(s => ro.observe(s)); if (sc) ro.observe(sc); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout).catch(() => {});
  layout();
  return {
    current: () => cur, count: () => secs.length, go, update: layout,
    destroy() { target.removeEventListener('scroll', sched); window.removeEventListener('resize', layout); mqs.forEach(m => m.removeEventListener && m.removeEventListener('change', layout)); if (ro) ro.disconnect(); bar.remove(); root.querySelectorAll('.kit-stack-foot').forEach(f => f.remove()); secs.forEach(s => { s.style.top = ''; s.removeAttribute('data-current'); }); delete root.dataset.flow; root.classList.remove('kit-stack'); },
  };
}
function opts(o) { return Object.assign({ label: 'Sections', top: '0px', barLabel: 'Step', footers: true }, o); }
function bind(root, o) {
  root.classList.add('kit-stack'); root.setAttribute('role', 'region'); root.setAttribute('aria-label', (o && o.label) || 'Sections');
  [...root.children].forEach(c => { if (c.tagName === 'SECTION') c.classList.add('kit-stack-sec'); });
  return wire(root, opts(o));
}
function mount(root, o) {
  o = opts(o); root.textContent = '';
  (o.items || []).forEach((it, i) => {
    if (!OK.test(String(it.id))) throw new Error('Kit.stack: item id "' + it.id + '" must be a bare token (letters, digits, . _ ~ -)');
    const s = el('section', 'kit-stack-sec'); s.id = it.id;
    const head = el('header', 'kit-stack-head'); if (it.eyebrow) head.append(el('p', 'kit-stack-eyebrow', it.eyebrow)); head.append(el('h2', 'kit-stack-title', it.title || it.id));
    const body = el('div', 'kit-stack-body');
    if (typeof it.render === 'function') it.render(body, i); else if (it.node instanceof Node) body.append(it.node); else if (it.node != null) body.textContent = String(it.node);
    s.append(head, body); root.append(s);
  });
  return bind(root, o);
}
Kit.stack = Object.freeze({ mount, bind });
})();
/* /part:page.script.kit.stack */

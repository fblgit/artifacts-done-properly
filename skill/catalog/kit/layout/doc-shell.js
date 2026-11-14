/* part:page.script.kit.doc-shell */
/**
 * Document shell with sticky contents
 * Kit.docShell.mount(root, {sections, heading, hash, scroller, offset, onChange}) fills the rail from the sections (data-group opens a group, data-toc renames a link), marks the current link with aria-current, counts the last section once the column is at its end, and moves focus to a section on click. The rail turns into a menu by the shell's own width, so it also holds inside a pane. With hash on, a click writes #id without a scroll jump or a history entry. It reads --kit-topbar-h, so it sits under the sticky top bar.
 *
 * Markup:
 *   <div class="kit-doc">
 *     <nav class="kit-doc-toc" aria-label="Contents"></nav>        (filled from the sections when empty)
 *     <div class="kit-doc-main">
 *       <section class="kit-doc-sec" id="install" data-group="Start">  data-group opens a group in the contents; data-toc overrides the link text
 *         <aside class="kit-doc-note">marginalia (optional)</aside>  a narrow mono column beside the body; above it when narrow
 *         <div class="kit-doc-body"><h2>Install</h2>…</div>
 *       </section> …
 *     </div>
 *   </div>
 * API (small and stable):
 *   Kit.docShell.mount(root, {sections, heading, label, hash, scroller, offset, onChange}) -> {current(), go(id), refresh(), destroy()}
 *     sections  selector for the sections inside root (default "section[id]")
 *     heading   selector for a section's title (default "h2, h3")
 *     hash      true (default): a contents click writes #id with history.replaceState, and #id on load opens there; false leaves location alone
 *     scroller  the scrolling element when it is not the page (a pane, a framed preview)
 *     offset    px under the top (after --kit-topbar-h) where a section counts as reached (default 24)
 *     onChange  (id) when the section in view changes
 * The current link has aria-current="location". The last section counts as current once the column is scrolled to its end. Clicks move focus to the section.
 *
 * ResizeObserver is used when present. When a sticky bar sits above, --kit-topbar-h (written by Kit.topbar) is read.
 *
 * @id        layout.doc-shell
 * @kind      component
 * @group     Layouts
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   A sticky contents rail that marks the section in view, beside a 65ch reading column with optional marginalia; a Contents menu under 760px.
 * @tags      layout, document, toc, contents, scroll spy, rail, sidebar, reading column, marginalia, sticky, phone
 * @requires  none
 * @files     kit/layout/doc-shell.css, kit/samples/layout.json
 * @provides  Kit.docShell.mount
 * @config    Kit.docShell.mount(root, opts) | sections (selector), heading, label, hash (default true), scroller, offset (px), onChange(id)
 * @config    markup | .kit-doc > nav.kit-doc-toc + .kit-doc-main > section.kit-doc-sec[id] (> aside.kit-doc-note + .kit-doc-body)
 * @config    --kit-topbar-h | written by Kit.topbar when a sticky bar sits above
 * @tokens    --bg --panel --sunk --ink --ink-2 --rule --accent --f-ui --f-mono --f-display --kit-topbar-h? --seam?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | 5 artifacts' index.html | the scroll-spy sidebar, a sticky rail beside a reading column, a left contents list, a runbook's section rail with a scroll-position spy, and a section grid with a mono marginalia rail
 * @preview   {"render": "layout.doc-shell", "samples": ["kit/samples/layout.json#doc-shell"]}
 * @samples   doc-shell
 * @changed   The spy reads scroll position, not an observer, so a short last section still lights up.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const TOKEN = /^[A-Za-z0-9._~-]+$/;
function mount(root, opts) {
  const o = Object.assign({ sections: 'section[id]', heading: 'h2, h3', label: 'Contents', hash: true, scroller: null, offset: 24, onChange: null }, opts);
  root.classList.add('kit-doc');
  let nav = root.querySelector('.kit-doc-toc');
  if (!nav) { nav = document.createElement('nav'); nav.className = 'kit-doc-toc'; root.prepend(nav); }
  if (!nav.hasAttribute('aria-label')) nav.setAttribute('aria-label', o.label);
  let secs = [], links = [], cur = null, raf = 0;
  const menu = document.createElement('details'); menu.className = 'kit-doc-menu';
  const sum = document.createElement('summary');
  const sumL = document.createElement('span'); sumL.className = 'kit-doc-menu-l'; sumL.textContent = o.label;
  const sumNow = document.createElement('span'); sumNow.className = 'kit-doc-now';
  sum.append(sumL, sumNow); menu.append(sum);
  const titleOf = s => s.dataset.toc || ((s.querySelector(o.heading) || {}).textContent || s.id).trim();
  function build() {
    secs = [...root.querySelectorAll(o.sections)].filter(s => s.id);
    root.classList.toggle('has-notes', !!root.querySelector('.kit-doc-note'));
    const hand = nav.querySelector('a[href^="#"]') && !nav.querySelector('.kit-doc-menu');
    let list;
    if (hand) { list = nav.querySelector('ol, ul') || nav; }
    else {
      list = document.createElement('ol'); list.className = 'kit-doc-list';
      secs.forEach(s => {
        if (s.dataset.group) { const g = document.createElement('li'); g.className = 'kit-doc-group'; g.setAttribute('aria-hidden', 'true'); g.textContent = s.dataset.group; list.append(g); }
        const li = document.createElement('li'); const a = document.createElement('a'); a.href = '#' + s.id; a.textContent = titleOf(s); li.append(a); list.append(li);
      });
      menu.querySelectorAll('ol').forEach(x => x.remove()); menu.append(list); nav.replaceChildren(menu);
    }
    links = [...nav.querySelectorAll('a[href^="#"]')];
  }
  const secOf = a => secs.find(s => '#' + s.id === a.getAttribute('href'));
  function topLine() { const bar = parseFloat(getComputedStyle(root).getPropertyValue('--kit-topbar-h')) || 0; return (o.scroller ? o.scroller.getBoundingClientRect().top : 0) + bar + o.offset; }
  function spy() {
    raf = 0; if (!secs.length) return;
    const line = topLine(); let now = secs[0];
    for (const s of secs) if (s.getBoundingClientRect().top <= line + 1) now = s;
    const sc = o.scroller, atEnd = sc ? sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2 : innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
    if (atEnd && (sc ? sc.scrollTop > 0 : scrollY > 0)) now = secs[secs.length - 1];
    if (now.id === cur) return;
    cur = now.id;
    links.forEach(a => { if (a.getAttribute('href') === '#' + cur) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); });
    sumNow.textContent = titleOf(now);
    if (o.onChange) o.onChange(cur);
  }
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(spy); };
  function go(id, how) {
    const s = secs.find(x => x.id === id); if (!s) return false;
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    s.scrollIntoView({ block: 'start', behavior: reduce || (how && how.instant) ? 'auto' : 'smooth' });
    const h = s.querySelector(o.heading) || s; if (!h.hasAttribute('tabindex')) h.tabIndex = -1; h.focus({ preventScroll: true });
    if (o.hash && TOKEN.test(id)) { try { history.replaceState(history.state, '', '#' + id); } catch (_) {} }
    return true;
  }
  const onClick = e => {
    const a = e.target.closest('a[href^="#"]'); if (!a || !links.includes(a)) return;
    const s = secOf(a); if (!s) return;
    e.preventDefault(); if (!wide) menu.open = false; go(s.id);
  };
  let wide = true;
  function fit() {
    const w = root.getBoundingClientRect().width; const was = wide; wide = w >= 640;
    root.toggleAttribute('data-narrow', !wide); root.toggleAttribute('data-tight', w < 920);
    if (wide) menu.open = true; else if (was !== wide) menu.open = false;
  }
  const evT = o.scroller || window;
  build(); fit(); spy();
  const ro = window.ResizeObserver ? new ResizeObserver(() => { fit(); onScroll(); }) : null;
  if (ro) ro.observe(root); else addEventListener('resize', fit);
  evT.addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', onScroll);
  nav.addEventListener('click', onClick);
  const onToggle = () => { if (wide && !menu.open) menu.open = true; };
  menu.addEventListener('toggle', onToggle);
  if (o.hash) { const h = decodeURIComponent((location.hash || '').slice(1)); if (h && secs.some(s => s.id === h)) requestAnimationFrame(() => go(h, { instant: true })); }
  return {
    current: () => cur, go,
    refresh() { build(); cur = null; spy(); },
    destroy() { if (ro) ro.disconnect(); else removeEventListener('resize', fit); evT.removeEventListener('scroll', onScroll); removeEventListener('resize', onScroll); nav.removeEventListener('click', onClick); menu.removeEventListener('toggle', onToggle); },
  };
}
Kit.docShell = Object.freeze({ mount });
})();
/* /part:page.script.kit.doc-shell */

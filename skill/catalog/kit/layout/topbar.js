/* part:page.script.kit.topbar */
/**
 * Sticky top bar with theme toggle
 * Kit.topbar.mount(header, {brand, links, theme, spy, scroller, heightOn}) builds or wires the bar and writes its height to --kit-topbar-h. Kit.theme.create({target, storageKey, modes, onChange}) is the theme control on its own: system (no data-theme), light, dark, with every storage access guarded; bind(button) makes any button the toggle. The cycle goes to the opposite of the OS setting first, so the first two clicks always change what shows. Add class kit-band to body to paint the band above the bar.
 *
 * API (small and stable):
 *   Kit.theme.create({target, storageKey, modes, onChange}) -> {get(), set(mode), cycle(), resolved(), bind(button), destroy()}
 *     target      the element that carries data-theme (default document.documentElement)
 *     storageKey  localStorage key for the viewer's choice (default null: nothing stored); every read and write is guarded
 *     modes       ["system", "light", "dark"] (default) or ["light", "dark"]; cycle() goes system, the opposite of the OS setting, the OS setting, system (two clicks of visible change, a third back to following the OS)
 *     onChange    (mode, resolved) after every change, including the viewer's OS switching while on system
 *     bind(btn)   makes btn the toggle: label "System", "Light" or "Dark" (or an icon-only button keeps its markup), aria-label says what a click does
 *   Kit.topbar.mount(header, {brand, links, theme, spy, scroller, heightOn}) -> {theme, destroy()}
 *     header      a <header class="kit-topbar">; its children are kept, so the bar can be hand-written; brand and links fill it when it is empty
 *     brand       {name, sub, href}     links  [{href: "#id", label}]
 *     theme       options for Kit.theme.create, or false for no button (a .kit-theme button inside the header is used when present)
 *     spy         true (default): the link whose section is in view gets aria-current="location"
 *     scroller    the scrolling element when it is not the page (a framed preview)
 *     heightOn    the element that receives --kit-topbar-h, the bar's height (default document.documentElement); the doc shell's rail and scroll margins read it
 * The band above a sticky bar: add class kit-band to <body> and its ::before paints env(safe-area-inset-top) in the bar's colour.
 *
 * Theme state is data-theme on the target (absent, "light" or "dark"); the board token blocks follow the kit pattern (tokens.js).
 * Also provides (not a global): the custom property --kit-topbar-h, the bar's height, set on heightOn.
 *
 * @id        layout.topbar
 * @kind      component
 * @group     Layouts
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   A sticky header with brand, section links that mark the one in view, and a three-state theme button; clears the phone's safe-area band.
 * @tags      layout, header, top bar, navigation, theme, toggle, dark mode, light mode, sticky, safe area
 * @requires  none
 * @files     kit/layout/topbar.css, kit/samples/topbar.json
 * @provides  Kit.theme.create, Kit.topbar.mount
 * @config    Kit.topbar.mount(header, opts) | brand {name, sub, href}, links [{href, label}], theme (Kit.theme options or false), spy, scroller, heightOn
 * @config    Kit.theme.create(opts) | target (default the root element), storageKey (default none), modes, onChange(mode, resolved)
 * @config    state | data-theme on the target; the board's token blocks in the kit pattern
 * @tokens    --bg --panel --ink --ink-2 --rule --accent --f-ui --f-display --seam? --gold-leaf? --kit-topbar-max?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | 4 artifacts' index.html | sticky headers with a brand, a mono section nav and a theme button, and two theme-toggle scripts
 * @preview   {"render": "layout.topbar", "samples": ["kit/samples/topbar.json"]}
 * @changed   Three states instead of two, so a viewer can go back to following the OS.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const mq = () => (window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null);
const ls = {
  get(k) { if (!k) return null; try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { if (!k) return; try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (_) {} },
};
const WORD = { system: 'System', light: 'Light', dark: 'Dark' };
const ICON = {
  system: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 2.4a5.6 5.6 0 010 11.2z" fill="currentColor"/></svg>',
  light: '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/></svg>',
  dark: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.2 10.3A5.6 5.6 0 015.7 2.8a5.6 5.6 0 107.5 7.5z" fill="currentColor"/></svg>',
};
function createTheme(opts) {
  const o = Object.assign({ target: document.documentElement, storageKey: null, modes: ['system', 'light', 'dark'], onChange: null }, opts);
  const t = o.target; const m = mq(); const buttons = new Set();
  const get = () => { const v = t.getAttribute('data-theme'); return v === 'light' || v === 'dark' ? v : (o.modes.includes('system') ? 'system' : (m && m.matches ? 'dark' : 'light')); };
  const resolved = () => { const v = get(); return v === 'system' ? (m && m.matches ? 'dark' : 'light') : v; };
  function paint() {
    const v = get(), nx = next();
    buttons.forEach(b => {
      b.dataset.mode = v; b.setAttribute('aria-label', 'Theme: ' + WORD[v] + '. Switch to ' + WORD[nx] + '.'); b.title = 'Theme: ' + WORD[v];
      if (!b.dataset.keep) b.innerHTML = ICON[v] + '<span class="kit-theme-t">' + WORD[v] + '</span>';
    });
  }
  function set(v, quiet) {
    if (!o.modes.includes(v)) return;
    if (v === 'system') t.removeAttribute('data-theme'); else t.setAttribute('data-theme', v);
    ls.set(o.storageKey, v === 'system' ? null : v); paint();
    if (!quiet && o.onChange) o.onChange(v, resolved());
  }
  function next() {
    const v = get(), os = m && m.matches ? 'dark' : 'light', away = os === 'dark' ? 'light' : 'dark';
    if (!o.modes.includes('system')) return resolved() === 'dark' ? 'light' : 'dark';
    return v === 'system' ? away : v === away ? os : 'system';
  }
  const cycle = () => set(next());
  const onOs = () => { paint(); if (get() === 'system' && o.onChange) o.onChange('system', resolved()); };
  if (m && m.addEventListener) m.addEventListener('change', onOs);
  const saved = ls.get(o.storageKey); if (saved === 'light' || saved === 'dark') set(saved, true);
  return {
    get, set: v => set(v), cycle, resolved,
    bind(b) { if (!b) return; if (b.tagName === 'BUTTON') b.type = 'button'; b.classList.add('kit-theme'); if (b.children.length && !b.querySelector('.kit-theme-t')) b.dataset.keep = '1'; b.addEventListener('click', cycle); buttons.add(b); paint(); },
    destroy() { if (m && m.removeEventListener) m.removeEventListener('change', onOs); buttons.forEach(b => b.removeEventListener('click', cycle)); buttons.clear(); },
  };
}
function mount(header, opts) {
  const o = Object.assign({ brand: null, links: [], theme: {}, spy: true, scroller: null, heightOn: document.documentElement }, opts);
  header.classList.add('kit-topbar');
  let inner = header.querySelector('.kit-topbar-in');
  if (!inner) { inner = document.createElement('div'); inner.className = 'kit-topbar-in'; while (header.firstChild) inner.append(header.firstChild); header.append(inner); }
  if (o.brand && !inner.querySelector('.kit-topbar-brand')) {
    const a = document.createElement(o.brand.href ? 'a' : 'div'); a.className = 'kit-topbar-brand'; if (o.brand.href) a.href = o.brand.href;
    const b = document.createElement('b'); b.textContent = o.brand.name || ''; a.append(b);
    if (o.brand.sub) { const s = document.createElement('span'); s.textContent = o.brand.sub; a.append(s); }
    inner.prepend(a);
  }
  let nav = inner.querySelector('.kit-topbar-nav');
  if (!nav && o.links && o.links.length) {
    nav = document.createElement('nav'); nav.className = 'kit-topbar-nav'; nav.setAttribute('aria-label', 'Sections');
    o.links.forEach(l => { const a = document.createElement('a'); a.href = l.href; a.textContent = l.label; nav.append(a); });
    inner.append(nav);
  }
  let theme = null;
  if (o.theme !== false) {
    theme = createTheme(o.theme || {});
    let btn = inner.querySelector('.kit-theme');
    if (!btn) { btn = document.createElement('button'); inner.append(btn); }
    theme.bind(btn);
  }
  const ro = window.ResizeObserver ? new ResizeObserver(() => { if (o.heightOn) o.heightOn.style.setProperty('--kit-topbar-h', header.offsetHeight + 'px'); }) : null;
  if (ro) ro.observe(header); else if (o.heightOn) o.heightOn.style.setProperty('--kit-topbar-h', header.offsetHeight + 'px');
  const links = nav ? [...nav.querySelectorAll('a[href^="#"]')] : [];
  const sc = o.scroller; const evTarget = sc || window;
  const secOf = a => { const id = decodeURIComponent(a.getAttribute('href').slice(1)); return id ? (sc || document).querySelector('#' + CSS.escape(id)) : null; };
  let raf = 0;
  function spy() {
    raf = 0; if (!links.length) return;
    const top = (sc ? sc.getBoundingClientRect().top : 0) + header.offsetHeight + 24;
    const atEnd = sc ? sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2 : innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
    let cur = null;
    links.forEach(a => { const s = secOf(a); if (s && s.getBoundingClientRect().top <= top) cur = a; });
    if (atEnd) cur = links.filter(secOf).pop() || cur;
    links.forEach(a => { if (a === cur) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); });
    if (cur && nav.scrollWidth > nav.clientWidth) { const l = cur.offsetLeft - nav.offsetLeft; if (l < nav.scrollLeft || l + cur.offsetWidth > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = l - 12; }
  }
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(spy); };
  const onClick = e => {
    const a = e.target.closest('a[href^="#"]'); if (!a || !links.includes(a)) return;
    const s = secOf(a); if (!s) return; e.preventDefault();
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    s.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    if (!s.hasAttribute('tabindex')) s.tabIndex = -1; s.focus({ preventScroll: true });
  };
  if (o.spy && links.length) { evTarget.addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', onScroll); spy(); }
  if (nav) nav.addEventListener('click', onClick);
  return {
    theme,
    destroy() { if (ro) ro.disconnect(); if (theme) theme.destroy(); evTarget.removeEventListener('scroll', onScroll); removeEventListener('resize', onScroll); if (nav) nav.removeEventListener('click', onClick); },
  };
}
Kit.theme = Object.freeze({ create: createTheme });
Kit.topbar = Object.freeze({ mount });
})();
/* /part:page.script.kit.topbar */

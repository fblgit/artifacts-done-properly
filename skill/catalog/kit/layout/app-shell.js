/* part:page.script.kit.app-shell */
/* Kit layout: app shell with a page registry (Kit.shell)    kit version 0.1.0
   What it is: the frame of a multi-page app. A floating pill holds the app's name and one icon tab per page; the current page's tab (and any tab you hover or focus) opens to show its name. Pages register
   themselves with show and hide hooks, so a page starts its timers and loads its data when it opens and stops them when it closes. Pages show one at a time. The page is chosen by the address
   (a bare #token) or by a click; the last page is remembered per viewer; a link to an element inside a page opens that page and scrolls there. Plain DOM; every text is set with textContent.
   API (small and stable):
     Kit.shell.mount(root, {brand, label, storageKey, defaultPage, hash, height, actions}) -> shell
       brand       text beside the first icon (a short app name)
       label       accessible name of the pill (default "Pages")
       storageKey  localStorage key that remembers the last page (default none; every read and write is guarded)
       defaultPage the page to open when nothing else names one (default the first added)
       hash        true (default): the page is the address's #token, read on load and on hashchange; false: no address is read or written (a framed preview, or a host that owns the hash);
                   with false, a click on any <a href="#x"> inside the shell still opens page x, or the page that holds the element with id x
       height      css length: the shell becomes a framed area of that height with its own scroll, the pill inside it (default none: the pill is fixed to the screen and the page scrolls)
       actions     [{id, label, icon, onClick}]   icon buttons at the pill's end (for example a look or settings button)
     shell.add({id, title, icon, el, onShow, onHide})   registers a page: id is a bare token (letters, digits, . _ ~ -), icon a name from Kit.shell.icons or an svg string, el the page's root element
     shell.show(id, anchorId?) -> boolean               opens a page, and scrolls to the element with anchorId inside it when given; false for an unknown page
     shell.current() -> id | null     shell.pages() -> [{id, title}]     shell.popover(button, panel) -> {open(yes), toggle(), destroy()}     shell.destroy()
     onShow runs when a page opens (not when it is already open), onHide when another page takes its place or the shell is destroyed.
     Kit.shell.icons -> {home, list, layers, grid, gear, look}: svg strings you can pass as icon.
   In an artifact the address bar does not follow the hash (the viewer only reads a plain #anchor when the page loads), so a shell inside an artifact keeps its own page in memory and gives each page a
   link of the artifact's address plus #token; pass hash:false when the artifact's address belongs to something else.
   Needs from the board:
     css     kit/layout/app-shell.css; custom properties --bg --panel --sunk --ink --ink-2 --rule --rule-2 --accent --accent-ink --accent-soft --shadow --f-ui --f-display, optional --seam
     globals none
   db collections: none.
   Lifted from: a network-ops console's app shell (the floating nav pill with icon tabs whose label opens on the current page, the page registry with show and hide hooks, hash routing, the look popover). */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const OK = /^[A-Za-z0-9._~-]+$/;
const S = (d) => '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + d + '</svg>';
const icons = Object.freeze({
  home: S('<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/>'),
  list: S('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>'),
  layers: S('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'),
  grid: S('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
  gear: S('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>'),
  look: S('<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 010 16z" fill="currentColor"/>'),
});
const ls = {
  get(k) { if (!k) return null; try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { if (!k) return; try { localStorage.setItem(k, v); } catch (_) {} },
};
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function iconOf(x) { const s = typeof x === 'string' && icons[x] ? icons[x] : (x || icons.layers); const t = el('span', 'kit-sh-ico'); t.setAttribute('aria-hidden', 'true'); t.innerHTML = s; return t; }

function mount(root, o) {
  o = Object.assign({ brand: '', label: 'Pages', hash: true }, o);
  root.textContent = ''; root.classList.add('kit-sh'); if (o.height) { root.dataset.framed = 'true'; root.style.setProperty('--kit-sh-h', o.height); }
  const pill = el('nav', 'kit-sh-pill'); pill.setAttribute('aria-label', o.label);
  if (o.brand) { const b = el('span', 'kit-sh-brand'); b.append(el('i', 'kit-sh-orb'), el('span', null, o.brand)); pill.append(b); }
  const tabs = el('div', 'kit-sh-tabs'), acts = el('div', 'kit-sh-acts'); pill.append(tabs, acts);
  const page = el('main', 'kit-sh-page'), holder = el('div', 'kit-sh-pages'); page.append(holder); root.append(pill, page);
  const pages = new Map(); let current = null, userMove = false;

  (o.actions || []).forEach(a => {
    const b = el('button', 'kit-sh-act'); b.type = 'button'; b.id = 'kit-sh-act-' + a.id; b.title = a.label; b.setAttribute('aria-label', a.label); b.append(iconOf(a.icon));
    if (a.onClick) b.addEventListener('click', e => a.onClick(e, b)); acts.append(b);
  });
  function scrollTop() { if (o.height) page.scrollTop = 0; else window.scrollTo(0, 0); }
  function show(id, anchor) {
    const t = pages.get(id); if (!t) return false;
    const changed = current !== id;
    if (changed && current) { const p = pages.get(current); if (p.onHide) p.onHide(); }
    pages.forEach((p, k) => { p.el.hidden = k !== id; if (k === id) p.tab.setAttribute('aria-current', 'page'); else p.tab.removeAttribute('aria-current'); });
    current = id; ls.set(o.storageKey, id);
    if (changed && t.onShow) t.onShow();
    const a = anchor && t.el.querySelector('#' + CSS.escape(anchor));
    if (a) a.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' }); else if (changed) scrollTop();
    if (userMove) { t.el.tabIndex = -1; t.el.focus({ preventScroll: true }); }
    return true;
  }
  function route() {
    let h = ''; try { h = decodeURIComponent(location.hash.replace(/^#/, '')); } catch (_) {}
    if (pages.has(h)) return show(h);
    const host = h && OK.test(h) && root.querySelector('#' + CSS.escape(h));
    const view = host && host.closest('.kit-sh-view');
    if (view) return show(view.dataset.page, h);
    const last = ls.get(o.storageKey);
    return show(pages.has(last) ? last : (pages.has(o.defaultPage) ? o.defaultPage : [...pages.keys()][0]));
  }
  function add(p) {
    if (!OK.test(String(p.id))) throw new Error('Kit.shell: page id "' + p.id + '" must be a bare token (letters, digits, . _ ~ -)');
    if (pages.has(p.id)) throw new Error('Kit.shell: page "' + p.id + '" is already added');
    const view = el('div', 'kit-sh-view'); view.id = 'kit-sh-page-' + p.id; view.dataset.page = p.id; view.hidden = true; if (p.el) view.append(p.el);
    holder.append(view);
    const a = el('a', 'kit-sh-tab'); a.href = '#' + p.id; a.title = p.title; a.append(iconOf(p.icon), el('span', 'kit-sh-lbl', p.title));
    a.addEventListener('click', e => { userMove = true; if (!o.hash) { e.preventDefault(); show(p.id); } setTimeout(() => { userMove = false; }, 0); });
    tabs.append(a); pages.set(p.id, { el: view, tab: a, title: p.title, onShow: p.onShow, onHide: p.onHide });
    if (api.ready) route();
  }
  const api = {
    ready: false, add, show,
    current: () => current,
    pages: () => [...pages].map(([id, p]) => ({ id, title: p.title })),
    popover(button, panel) {
      panel.classList.add('kit-sh-pop'); panel.hidden = true; if (!panel.id) panel.id = 'kit-sh-pop-' + Math.random().toString(36).slice(2, 7);
      button.setAttribute('aria-haspopup', 'true'); button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', panel.id); root.append(panel);
      const open = yes => { panel.hidden = !yes; button.setAttribute('aria-expanded', String(!!yes)); };
      const toggle = () => open(panel.hidden);
      const onBtn = () => toggle();
      const onDoc = e => { if (!panel.hidden && !panel.contains(e.target) && !button.contains(e.target)) open(false); };
      const onKey = e => { if (e.key === 'Escape' && !panel.hidden) { open(false); button.focus(); } };
      button.addEventListener('click', onBtn); document.addEventListener('click', onDoc); document.addEventListener('keydown', onKey);
      return { open, toggle, destroy() { button.removeEventListener('click', onBtn); document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey); panel.remove(); } };
    },
    destroy() {
      if (current && pages.get(current).onHide) pages.get(current).onHide();
      window.removeEventListener('hashchange', onHash); root.removeEventListener('click', onLink);
      root.textContent = ''; root.classList.remove('kit-sh'); root.removeAttribute('data-framed'); root.style.removeProperty('--kit-sh-h');
    },
  };
  const onHash = () => { userMove = true; route(); userMove = false; };
  const onLink = e => {
    if (o.hash) return;
    const a = e.target.closest && e.target.closest('a[href^="#"]'); if (!a || a.classList.contains('kit-sh-tab')) return;
    let h = a.getAttribute('href').slice(1); try { h = decodeURIComponent(h); } catch (_) {}
    if (!OK.test(h)) return;
    if (pages.has(h)) { e.preventDefault(); userMove = true; show(h); userMove = false; return; }
    const host = root.querySelector('#' + CSS.escape(h)), view = host && host.closest('.kit-sh-view');
    if (view) { e.preventDefault(); userMove = true; show(view.dataset.page, h); userMove = false; }
  };
  if (o.hash) window.addEventListener('hashchange', onHash);
  root.addEventListener('click', onLink);
  api.ready = true;
  return api;
}
Kit.shell = Object.freeze({ mount, icons });
})();
/* /part:page.script.kit.app-shell */

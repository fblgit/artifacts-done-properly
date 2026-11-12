/* part:page.script.kit.tabs */
/* Kit component: accessible tabs (Kit.tabs)    kit version 0.1.0
   What it is: an ARIA tab set over markup the page already has. Arrow keys, Home and End move and select (roving tabindex), digits 1 to 9 optionally jump,
   and each tab can be a plain #anchor deep link (a bare token, the only kind the artifact viewer passes through). Plain DOM, no framework.
   Markup:
     <div class="kit-tabs">
       <div class="kit-tabs-list" role="tablist" aria-label="Record">     (built from opts.tabs when absent)
         <button role="tab" data-tab="overview">Overview <span class="kit-tab-n">3</span></button> …
       </div>
       <section data-tab-panel="overview">…</section> …
     </div>
   API (small and stable):
     Kit.tabs.mount(el, {tabs, label, hash, keys, initial, onChange}) -> {select(id, {focus}), current(), destroy()}
       tabs     [{id, label, count}]   only when the markup has no tab buttons
       label    the tablist's aria-label (default "Sections")
       hash     true (default): the selected id is the page's #anchor, read on load and on hashchange, written with history.replaceState
                (no scroll jump, no history entry); false leaves location alone (several sets on one page, or a host that owns the hash)
       keys     true: digits 1 to 9 select a tab while focus is not in a field
       initial  the id to open when the hash names none (default the first tab)
       onChange (id, panel) after every selection; el also dispatches "kit-tab" with detail {id}
   Ids must be bare tokens: letters, digits, . _ ~ - (never settings, sidebar, customize, upgrade, downloads or comment-…, which the viewer keeps).
   Needs from the board:
     css     kit/tabs.css; custom properties --panel --sunk --ink --ink-2 --rule --shadow --f-ui --f-mono, optional --seam
     globals none
   db collections: none.
   Lifted from: an accessible tab set for records, a tabbed app shell with hash routing and digit keys, and page tabs over a parts registry. */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const TOKEN = /^[A-Za-z0-9._~-]+$/;
const RESERVED = new Set(['settings', 'sidebar', 'customize', 'upgrade', 'downloads']);
const okId = id => TOKEN.test(id) && !RESERVED.has(id) && !id.startsWith('comment-');
let seq = 0;
function mount(el, opts) {
  const o = Object.assign({ label: 'Sections', hash: true, keys: false }, opts);
  const n = ++seq;
  let list = el.querySelector('[role="tablist"]');
  if (!list) { list = document.createElement('div'); list.className = 'kit-tabs-list'; list.setAttribute('role', 'tablist'); el.prepend(list); }
  if (!list.hasAttribute('aria-label') && !list.hasAttribute('aria-labelledby')) list.setAttribute('aria-label', o.label);
  if (!list.querySelector('[data-tab]') && o.tabs) for (const t of o.tabs) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.tab = t.id; b.textContent = t.label;
    if (t.count != null) { const c = document.createElement('span'); c.className = 'kit-tab-n'; c.textContent = t.count; b.append(' ', c); }
    list.append(b);
  }
  const tabs = [...list.querySelectorAll('[data-tab]')];
  const panelOf = id => el.querySelector('[data-tab-panel="' + CSS.escape(id) + '"]');
  tabs.forEach(b => {
    const id = b.dataset.tab;
    if (!okId(id)) console.warn('Kit.tabs: "' + id + '" is not a bare token; its #anchor will not reach the page.');
    b.setAttribute('role', 'tab'); if (b.tagName === 'BUTTON') b.type = 'button';
    b.id = b.id || 'kt' + n + '-' + id;
    let p = panelOf(id);
    if (!p) { p = document.createElement('section'); p.dataset.tabPanel = id; el.append(p); }
    p.setAttribute('role', 'tabpanel'); p.id = p.id || 'ktp' + n + '-' + id; p.tabIndex = 0;
    p.setAttribute('aria-labelledby', b.id); b.setAttribute('aria-controls', p.id);
  });
  let cur = null;
  function select(id, how) {
    const b = tabs.find(x => x.dataset.tab === id); if (!b) return false;
    const changed = cur !== id; cur = id;
    tabs.forEach(x => { const on = x === b; x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1; const p = panelOf(x.dataset.tab); if (p) p.hidden = !on; });
    if (how && how.focus) b.focus();
    if (b.scrollIntoView && how && how.focus) { try { b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (_) {} }
    if (o.hash && how && how.write && okId(id) && location.hash !== '#' + id) { try { history.replaceState(history.state, '', '#' + id); } catch (_) { location.hash = id; } }
    if (changed) { if (o.onChange) o.onChange(id, panelOf(id)); el.dispatchEvent(new CustomEvent('kit-tab', { detail: { id } })); }
    return true;
  }
  const fromHash = () => { const h = decodeURIComponent((location.hash || '').slice(1)); return tabs.some(t => t.dataset.tab === h) ? h : null; };
  const onClick = e => { const b = e.target.closest('[data-tab]'); if (b && tabs.includes(b)) select(b.dataset.tab, { write: true }); };
  const onKey = e => {
    const i = tabs.indexOf(e.target.closest('[data-tab]')); if (i < 0) return;
    const go = { ArrowRight: i + 1, ArrowDown: null, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (go == null) return; e.preventDefault();
    select(tabs[(go + tabs.length) % tabs.length].dataset.tab, { focus: true, write: true });
  };
  const onDigit = e => {
    if (!o.keys || e.metaKey || e.ctrlKey || e.altKey || !/^[1-9]$/.test(e.key)) return;
    const t = e.target; if (t && t.closest && t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;
    const b = tabs[+e.key - 1]; if (b) { e.preventDefault(); select(b.dataset.tab, { write: true }); }
  };
  const onHash = () => { if (!o.hash) return; const h = fromHash(); if (h) select(h); };
  list.addEventListener('click', onClick); list.addEventListener('keydown', onKey);
  document.addEventListener('keydown', onDigit); addEventListener('hashchange', onHash);
  select((o.hash && fromHash()) || (o.initial && tabs.some(t => t.dataset.tab === o.initial) ? o.initial : tabs[0] && tabs[0].dataset.tab));
  return {
    select: (id, how) => select(id, Object.assign({ write: true }, how)),
    current: () => cur,
    destroy() { list.removeEventListener('click', onClick); list.removeEventListener('keydown', onKey); document.removeEventListener('keydown', onDigit); removeEventListener('hashchange', onHash); },
  };
}
Kit.tabs = Object.freeze({ mount });
})();
/* /part:page.script.kit.tabs */

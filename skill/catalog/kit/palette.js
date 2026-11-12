/* part:page.script.kit.palette */
/**
 * Command palette
 * Kit.palette.create({items, host, label, placeholder, hotkey, limit, emptyText, onPick}) returns {open, close, isOpen, update, destroy}. It is a modal combobox: the input owns a listbox, the active option is announced through aria-activedescendant and a live line gives the result count. Results rank by tiers (label starts with the query, label contains it, every word in the label, a match only in group or keys) and then by the order given. Focus is trapped in the input and goes back to where it was on close. Pass host when the board sets its tokens on an element instead of :root.
 *
 * API:
 *   Kit.palette.create({items, host, label, placeholder, hotkey, limit, emptyText, onPick, onOpen, onClose}) -> {open(), close(), isOpen(), update(items), destroy()}
 *     items       [{id, group, label, hint, keys, target}]   group is the small label before each result ("section", "record"); keys is extra search text;
 *                 target is an element id: the default onPick scrolls to it and moves focus there
 *     host        the element the palette is appended to (default document.body); pass the themed ancestor when the board sets its tokens on an element instead of :root
 *     hotkey      true (default): Ctrl/Cmd+K toggles it; false leaves opening to open()
 *     limit       results shown (default 12); with an empty query the first ones in the order given
 *     onPick      (item) => void   runs after the palette has closed; default scrolls to item.target
 *   Ranking is a sort by tiers, then the order given: label starts with the query, label contains it, every word is in the label, a match only in group or keys.
 *
 * Optional custom properties: --seam.
 *
 * @id        kit.palette
 * @group     Board kit
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   A keyboard-opened search over a page's sections and records: Ctrl+K, arrow keys, Enter, Escape.
 * @tags      search, command palette, keyboard, navigation, combobox, ctrl k, modal, jump
 * @requires  none
 * @provides  Kit.palette.create
 * @config    Kit.palette.create(opts) | items [{id, group, label, hint, keys, target}], host, label, placeholder, hotkey, limit, emptyText, onPick(item), onOpen, onClose
 * @tokens    --panel --sunk --ink --ink-2 --rule --rule-2 --accent --shadow --f-ui --f-mono
 * @globals   none
 * @db        none
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
let uid = 0;
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const fold = s => String(s == null ? '' : s).toLowerCase();

function rank(items, q, limit) {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return items.slice(0, limit);
  const whole = words.join(' ');
  const out = [];
  items.forEach((it, i) => {
    const label = fold(it.label), rest = fold((it.group || '') + ' ' + (it.keys || '') + ' ' + (it.hint || ''));
    if (!words.every(w => label.includes(w) || rest.includes(w))) return;
    const tier = label.startsWith(whole) ? 0 : label.includes(whole) ? 1 : words.every(w => label.includes(w)) ? 2 : 3;
    out.push([tier, i, it]);
  });
  out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return out.slice(0, limit).map(x => x[2]);
}
function mark(node, label, q) {
  const w = fold(q).trim(), i = w ? fold(label).indexOf(w) : -1;
  if (i < 0) { node.textContent = label; return; }
  node.append(label.slice(0, i)); node.append(el('mark', null, label.slice(i, i + w.length))); node.append(label.slice(i + w.length));
}
function create(opts) {
  const o = Object.assign({ items: [], host: null, label: 'Search this page', placeholder: 'Search sections and records', hotkey: true, limit: 12, emptyText: 'Nothing matches. Try fewer or shorter words.', onPick: null, onOpen: null, onClose: null }, opts);
  const id = 'kit-pal-' + (++uid);
  const host = () => o.host || document.body;
  let items = o.items.slice(), results = [], sel = 0, openNow = false, back = null;
  const root = el('div', 'kit-pal'); root.hidden = true;
  const box = el('div', 'kit-pal-box'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', o.label);
  const input = el('input', 'kit-pal-in'); input.type = 'text'; input.id = id + '-in'; input.placeholder = o.placeholder; input.autocomplete = 'off'; input.spellcheck = false;
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-expanded', 'true'); input.setAttribute('aria-controls', id + '-list'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-label', o.label);
  const list = el('div', 'kit-pal-res'); list.id = id + '-list'; list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', 'Results');
  const foot = el('div', 'kit-pal-foot'); foot.append(el('span', null, 'Up and down to move'), el('span', null, 'Enter to open'), el('span', null, 'Esc to close'));
  const live = el('div', 'kit-pal-live'); live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite');
  box.append(input, list, foot, live); root.append(box);

  function paint() {
    results = rank(items, input.value, o.limit); if (sel >= results.length) sel = Math.max(0, results.length - 1);
    list.replaceChildren();
    if (!results.length) { list.append(el('div', 'kit-pal-empty', o.emptyText)); input.removeAttribute('aria-activedescendant'); live.textContent = 'No results'; return; }
    results.forEach((it, i) => {
      const b = el('div', 'kit-pal-r'); b.id = id + '-o' + i; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', String(i === sel)); b.dataset.i = i;
      if (it.group) b.append(el('span', 'kit-pal-where', it.group));
      const w = el('span', 'kit-pal-what'); mark(w, it.label, input.value); b.append(w);
      if (it.hint) b.append(el('span', 'kit-pal-hint', it.hint));
      list.append(b);
    });
    input.setAttribute('aria-activedescendant', id + '-o' + sel);
    live.textContent = results.length + (results.length === 1 ? ' result' : ' results');
  }
  function mark_sel(next) {
    sel = (next + results.length) % results.length;
    [...list.children].forEach((c, i) => { c.setAttribute('aria-selected', String(i === sel)); if (i === sel) { c.scrollIntoView({ block: 'nearest' }); } });
    input.setAttribute('aria-activedescendant', id + '-o' + sel);
  }
  function pick(i) {
    const it = results[i]; if (!it) return;
    close();
    if (o.onPick) { o.onPick(it); return; }
    const t = it.target && document.getElementById(it.target);
    if (t) { t.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); if (!t.hasAttribute('tabindex')) t.tabIndex = -1; t.focus({ preventScroll: true }); }
  }
  function open() {
    if (openNow) return;
    back = document.activeElement; openNow = true; if (root.parentNode !== host()) host().append(root);
    root.hidden = false; input.value = ''; sel = 0; paint(); input.focus(); if (o.onOpen) o.onOpen();
  }
  function close() {
    if (!openNow) return;
    openNow = false; root.hidden = true;
    if (back && back.isConnected && back.focus) back.focus(); back = null; if (o.onClose) o.onClose();
  }
  input.addEventListener('input', () => { sel = 0; paint(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (results.length) mark_sel(sel + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (results.length) mark_sel(sel - 1); }
    else if (e.key === 'Home') { e.preventDefault(); if (results.length) mark_sel(0); }
    else if (e.key === 'End') { e.preventDefault(); if (results.length) mark_sel(results.length - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(sel); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') e.preventDefault();
  });
  list.addEventListener('click', e => { const r = e.target.closest('.kit-pal-r'); if (r) pick(+r.dataset.i); });
  list.addEventListener('pointermove', e => { const r = e.target.closest('.kit-pal-r'); if (r && +r.dataset.i !== sel) mark_sel(+r.dataset.i); });
  root.addEventListener('pointerdown', e => { if (e.target === root) close(); });
  const onKey = e => { if (o.hotkey && (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); openNow ? close() : open(); } };
  document.addEventListener('keydown', onKey);
  return {
    open, close, isOpen: () => openNow,
    update(next) { items = (next || []).slice(); if (openNow) paint(); },
    destroy() { document.removeEventListener('keydown', onKey); close(); root.remove(); },
  };
}
Kit.palette = Object.freeze({ create });
})();
/* /part:page.script.kit.palette */

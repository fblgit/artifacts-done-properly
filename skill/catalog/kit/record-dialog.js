/* part:page.script.kit.record-dialog */
/**
 * Record dialog with tabs and a state crown
 * Kit.recordDialog.open({title, id, crumbs, tags, tone, tabs}) opens a plain-DOM dialog over a record. A crown runs along the top edge in the record's tone (a Kit.vocab tone), the header is tinted from it and fades into the panel, and the tags say the state in words as well as colour. The sections are Kit.tabs (underline tabs, roving tabindex, no change to the page's #anchor); each tab's body scrolls on its own, and .kit-rd-cols gives a two-column layout from 900px for the answer tab. Escape and a press on the scrim close it, Tab stays inside and focus returns to what opened it. kit.chrome's openModal stays the small form dialog; this is a new file beside it.
 *
 * What it is: the dialog that opens one record. A crown along the top edge in the record's state colour, a tinted one-row header (crumbs on the left, the record's id and the close button on the
 * right, then the title and a row of tags), underline tabs for its sections, and a body that scrolls on its own. A section can use .kit-rd-cols for a two-column layout from 900px (the answer tab:
 * the question on one side, the form on the other). Escape and a press on the scrim close it, Tab stays inside, and focus goes back to what opened it.
 * kit.chrome's openModal stays the small form dialog (Preact, a store); this one is plain DOM for a record with sections, and shares nothing with it but the look of the scrim.
 * API:
 *   Kit.recordDialog.open({title, id, crumbs, tags, tone, tabs, selected, actions, label, host, opener, onClose, onTab}) -> {close(), select(tabId), el, panel(tabId), setTone(tone), isOpen()}
 *     title    the record's name (an h2)        id    the record's code, in mono, top right
 *     crumbs   [{label, onClick}]               the last one is the current page; one with onClick is a button
 *     tags     [{label, tone}]                  tone is a Kit.vocab tone (neutral active review attention info danger success ended); the label is the state in words
 *     tone     the crown's tone (a Kit.vocab tone); default the first tag's tone, else the accent
 *     tabs     [{id, label, count, render(panelEl) | node}]   ids are bare tokens (letters, digits, . _ ~ -); the page's #anchor is left alone
 *     selected the tab to open (default the first)      actions  Node[] shown at the right of the tag row
 *     host     element to open in (default document.body); a positioned element makes the dialog fill it instead of the viewport
 *   Escape closes; the handle's close() restores focus to opener (default: the element focused at open).
 * Also provides (not globals): the classes .kit-rd and .kit-rd-cols.
 *
 * @id        kit.record-dialog
 * @kind      component
 * @group     Board kit
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   An upgrade of kit.chrome: a dialog for one record with a crown in its state colour, a tinted header (crumbs, id, close, title, tags), underline tabs and a two-column answer tab from 900px.
 * @tags      dialog, modal, tabs, record, crown, header, crumbs, detail, answer
 * @requires  kit.tokens, kit.tabs, kit.vocab
 * @files     kit/record-dialog.css, kit/samples/kit.json
 * @provides  Kit.recordDialog.open
 * @extends   kit.chrome
 * @config    Kit.recordDialog.open(opts) | title, id, crumbs [{label, onClick}], tags [{label, tone}], tone, tabs [{id, label, count, render(panel) | node}], selected, actions, label, host, opener, onClose, onTab; returns {close, select, panel, setTone, isOpen, el}
 * @config    Kit.tabs and Kit.vocab | load kit/tabs.js, kit/tabs.css, kit/vocab.css first; without the vocabulary css the crown is the accent
 * @tokens    --panel --sunk --ink --ink-2 --ink-3 --rule --accent --f-ui --f-mono --f-display --shadow --scrim? --seam?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | a component family's modal and tabs | an accent crown, a tinted header with crumbs, id and close, underline tabs, a body that scrolls
 * @preview   {"render": "kit.record-dialog", "samples": ["kit/samples/kit.json#record-dialog"], "uses": ["kit.vocab"]}
 * @samples   record-dialog
 * @changed   Extends kit.chrome as new files; chrome.js and chrome.css are unchanged.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
let uid = 0;

function open(o) {
  o = o || {};
  const host = o.host || document.body, opener = o.opener || document.activeElement, id = ++uid;
  const tabs = (o.tabs || []).filter(t => t && t.id);
  const root = el('div', 'kit-rd' + (o.host ? ' kit-rd-in' : '')); const panel = el('div', 'kit-rd-panel'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.tabIndex = -1;
  const titleId = 'kit-rd-t' + id; panel.setAttribute('aria-labelledby', titleId); if (o.label) panel.setAttribute('aria-label', o.label);
  const tone = o.tone || (o.tags && o.tags[0] && o.tags[0].tone) || null; if (tone) panel.dataset.voTone = tone;
  const head = el('header', 'kit-rd-head'); head.append(el('span', 'kit-rd-crown'));
  const nav = el('nav', 'kit-rd-crumbs'); nav.setAttribute('aria-label', 'Where this record sits');
  const ol = el('ol'); (o.crumbs || []).forEach((c, i, a) => {
    const li = el('li'); if (i === a.length - 1) { li.setAttribute('aria-current', 'page'); li.textContent = c.label; }
    else if (c.onClick) { const b = el('button', 'kit-rd-crumb', c.label); b.type = 'button'; b.addEventListener('click', c.onClick); li.append(b); } else li.append(el('span', 'kit-rd-crumb', c.label));
    ol.append(li);
  }); nav.append(ol);
  const top = el('div', 'kit-rd-top'); if (o.id) top.append(el('span', 'kit-rd-id', o.id));
  const x = el('button', 'kit-rd-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); top.append(x);
  const h2 = el('h2', 'kit-rd-title', o.title || ''); h2.id = titleId;
  head.append(nav, top, h2);
  if ((o.tags && o.tags.length) || (o.actions && o.actions.length)) {
    const meta = el('div', 'kit-rd-meta');
    (o.tags || []).forEach(t => { const c = el('span', 'kit-rd-tag', t.label); if (t.tone) c.dataset.voTone = t.tone; meta.append(c); });
    if (o.actions && o.actions.length) { const a = el('div', 'kit-rd-actions'); o.actions.forEach(n => a.append(n)); meta.append(a); }
    head.append(meta);
  }
  const main = el('div', 'kit-tabs line kit-rd-main'); main.setAttribute('aria-label', 'Sections');
  tabs.forEach(t => {
    const p = el('section', 'kit-rd-body'); p.dataset.tabPanel = t.id;
    if (typeof t.render === 'function') t.render(p); else if (t.node) p.append(t.node); main.append(p);
  });
  panel.append(head, main); root.append(panel);
  let tabsH = null, closed = false;
  if (tabs.length) tabsH = Kit.tabs.mount(main, { tabs: tabs.map(t => ({ id: t.id, label: t.label, count: t.count })), label: 'Sections of ' + (o.title || 'the record'), hash: false, initial: o.selected, onChange: (tid, p) => { if (o.onTab) o.onTab(tid, p); } });
  function close() {
    if (closed) return; closed = true; document.removeEventListener('keydown', onKey, true); if (tabsH) tabsH.destroy(); root.remove();
    if (opener && opener.focus && opener.isConnected !== false) { try { opener.focus(); } catch (_) {} }
    if (o.onClose) o.onClose();
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const items = [...panel.querySelectorAll(FOCUSABLE)].filter(n => n.offsetParent !== null || n === document.activeElement); if (!items.length) return;
    const first = items[0], last = items[items.length - 1], a = document.activeElement;
    if (e.shiftKey && (a === first || a === panel)) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
  }
  x.addEventListener('click', close); root.addEventListener('pointerdown', e => { if (e.target === root) close(); });
  document.addEventListener('keydown', onKey, true);
  host.append(root); panel.focus();
  return {
    close, el: root, isOpen: () => !closed, select: tid => tabsH && tabsH.select(tid), panel: tid => main.querySelector('[data-tab-panel="' + CSS.escape(tid) + '"]'),
    setTone(t) { if (t) panel.dataset.voTone = t; else delete panel.dataset.voTone; },
  };
}
Kit.recordDialog = Object.freeze({ open });
})();
/* /part:page.script.kit.record-dialog */

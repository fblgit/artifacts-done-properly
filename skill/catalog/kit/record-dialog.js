/* part:page.script.kit.record-dialog */
/* Kit component: record dialog with tabs (Kit.recordDialog)    kit version 0.1.0    EXTENDS kit.chrome (a new file; chrome.js and chrome.css stay as they are)
   What it is: the dialog that opens one record. A crown along the top edge in the record's state colour, a tinted one-row header (crumbs on the left, the record's id and the close button on the
   right, then the title and a row of tags), underline tabs for its sections, and a body that scrolls on its own. A section can use .kit-rd-cols for a two-column layout from 900px (the answer tab:
   the question on one side, the form on the other). Escape and a press on the scrim close it, Tab stays inside, and focus goes back to what opened it.
   kit.chrome's openModal stays the small form dialog (Preact, a store); this one is plain DOM for a record with sections, and shares nothing with it but the look of the scrim.
   API:
     Kit.recordDialog.open({title, id, crumbs, tags, tone, tabs, selected, actions, label, host, opener, onClose, onTab}) -> {close(), select(tabId), el, panel(tabId), setTone(tone), isOpen()}
       title    the record's name (an h2)        id    the record's code, in mono, top right
       crumbs   [{label, onClick}]               the last one is the current page; one with onClick is a button
       tags     [{label, tone}]                  tone is a Kit.vocab tone (neutral active review attention info danger success ended); the label is the state in words
       tone     the crown's tone (a Kit.vocab tone); default the first tag's tone, else the accent
       tabs     [{id, label, count, render(panelEl) | node}]   ids are bare tokens (letters, digits, . _ ~ -); the page's #anchor is left alone
       selected the tab to open (default the first)      actions  Node[] shown at the right of the tag row
       host     element to open in (default document.body); a positioned element makes the dialog fill it instead of the viewport
     Escape closes; the handle's close() restores focus to opener (default: the element focused at open).
   Needs from the board:
     requires kit.tabs (kit/tabs.js, tabs.css), kit.vocab (kit/vocab.css, for the tone colours; without it the crown is the accent)
     css     kit/record-dialog.css; custom properties --bg --panel --sunk --ink --ink-2 --ink-3 --rule --accent --accent-ink --shadow --f-ui --f-display --f-mono, optional --scrim --seam
     globals Kit.tabs
   db collections: none.
   Lifted from: a component family's modal (accent crown, tinted header with crumbs, id and close, a 30px title, tags) and its underline tabs; the focus trap and the restore are its own.
   Changed: the crown takes the record's state colour, the tabs are Kit.tabs with the roving tabindex and panels, and the colour never carries the state alone (the tags say it in words). */
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

/* part:page.script.kit.region-frame */
/* Kit pattern: region frame (Kit.region)    kit version 0.1.0
   What it is: the anatomy that opens any region of a page, in four small pieces that share one look. header: an accent lead-in, an icon chip, an optional number, an eyebrow, a title and
   a lede. label: a section label with a count. panel: a block led by an accent label. empty: a designed empty state (an icon, what is missing, what to do, an action).
   Plain DOM; every text is set with textContent. A region is a section element named by its title, so assistive tech lists it.
   API (small and stable):
     Kit.region.header({title, lede, eyebrow, num, icon, level, id}) -> Element           level 1..4 (default 2) is the heading level; num is shown only when you pass it (it must be a real order)
     Kit.region.label(text, {count, level}) -> Element                                    a small section label; count renders as a figure beside it (0 is shown, null is not)
     Kit.region.panel({label, count, body, icon}) -> Element                              body: Node | string | Node[]; the label leads the panel in the accent colour
     Kit.region.empty({icon, title, text, action}) -> Element                             action {label, onClick}; omit it for a plain empty state
     Kit.region.section({header, body, id}) -> Element                                    a <section aria-labelledby> holding header(...) and the body, for the common case
     icon: a Node, an svg string, or an icon name (looked up in Kit.iconset when it is loaded, otherwise ignored)
   Needs from the board:
     css     kit/patterns/region-frame.css; custom properties --bg --panel --sunk --ink --ink-2 --rule --rule-2 --accent --accent-soft --accent-ink --f-ui --f-display --f-mono, optional --seam --gold-leaf
     globals none required; Kit.iconset (kit/icons.js) only when you pass an icon by name
   db collections: none.
   Lifted from: a component family's pane header, section label, info panel and empty state. */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
let uid = 0;
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
function iconNode(icon, size) {
  if (icon == null || icon === '') return null;
  if (icon instanceof Node) return icon;
  if (typeof icon === 'string' && icon.trim().charAt(0) === '<') { const t = el('span'); t.innerHTML = icon; return t.firstElementChild; }
  if (typeof icon === 'string' && Kit.iconset && Kit.iconset.el) { try { return Kit.iconset.el(icon, { size: size || 18 }); } catch (_) { return null; } }
  return null;
}
const fill = (box, x) => { (Array.isArray(x) ? x : [x]).forEach(n => { if (n == null) return; box.append(n instanceof Node ? n : document.createTextNode(String(n))); }); };
function header(o) {
  o = o || {}; const lv = Math.min(4, Math.max(1, o.level || 2));
  const h = el('header', 'kit-rg-head'); const id = o.id || 'kit-rg-' + (++uid);
  h.append(el('span', 'kit-rg-lead'));
  const ic = iconNode(o.icon, 20); if (ic) { const c = el('span', 'kit-rg-chip'); c.setAttribute('aria-hidden', 'true'); c.append(ic); h.append(c); }
  const col = el('div', 'kit-rg-col');
  if (o.num != null || o.eyebrow) {
    const e = el('p', 'kit-rg-eyebrow'); if (o.num != null) e.append(el('b', 'kit-rg-num', String(o.num))); if (o.eyebrow) e.append(el('span', null, o.eyebrow)); col.append(e);
  }
  const t = el('h' + lv, 'kit-rg-title', o.title || ''); t.id = id; col.append(t);
  if (o.lede) col.append(el('p', 'kit-rg-lede', o.lede));
  h.append(col); h.dataset.titleId = id; return h;
}
function label(text, o) {
  o = o || {}; const e = el('h' + Math.min(6, Math.max(2, o.level || 3)), 'kit-rg-label'); e.append(el('span', null, text));
  if (o.count != null) e.append(el('b', 'kit-rg-count', String(o.count))); return e;
}
function panel(o) {
  o = o || {}; const p = el('section', 'kit-rg-panel'); const hid = 'kit-rg-' + (++uid);
  const lab = label(o.label || '', { count: o.count, level: 3 }); lab.id = hid; lab.classList.add('kit-rg-pl');
  const ic = iconNode(o.icon, 16); if (ic) { const w = el('span', 'kit-rg-pico'); w.setAttribute('aria-hidden', 'true'); w.append(ic); lab.prepend(w); }
  p.setAttribute('aria-labelledby', hid); const b = el('div', 'kit-rg-pbody'); fill(b, o.body); p.append(lab, b); return p;
}
function empty(o) {
  o = o || {}; const e = el('div', 'kit-rg-empty');
  const ic = iconNode(o.icon, 26); if (ic) { const c = el('span', 'kit-rg-eico'); c.setAttribute('aria-hidden', 'true'); c.append(ic); e.append(c); }
  e.append(el('p', 'kit-rg-etitle', o.title || ''));
  if (o.text) e.append(el('p', 'kit-rg-etext', o.text));
  if (o.action && o.action.label) { const b = el('button', 'kit-rg-ebtn', o.action.label); b.type = 'button'; if (o.action.onClick) b.addEventListener('click', o.action.onClick); e.append(b); }
  return e;
}
function section(o) {
  o = o || {}; const h = header(o.header); const s = el('section', 'kit-rg'); s.setAttribute('aria-labelledby', h.dataset.titleId);
  if (o.id) s.id = o.id; const b = el('div', 'kit-rg-body'); fill(b, o.body); s.append(h, b); return s;
}
Kit.region = Object.freeze({ header, label, panel, empty, section });
})();
/* /part:page.script.kit.region-frame */

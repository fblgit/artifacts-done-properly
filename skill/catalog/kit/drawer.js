/* part:page.script.kit.drawer */
/* Kit component: side drawer (Kit.drawer)    kit version 0.1.0
   What it is: a floating panel at the right with a head, a scrolling body and a pinned foot. Escape closes it and focus goes back to the button that opened it. Two modes:
   non-modal (default; the page behind stays usable, no scrim) and modal (a scrim, focus held inside, aria-modal). Opening it again for another record replaces the content
   without closing. At phone width it becomes a bottom sheet. kit.chrome's openModal stays the form dialog; this is for the detail of a record.
   API (small and stable):
     Kit.drawer.open({title, head, body, foot, modal, host, opener, focus, label, onClose}) -> {close(), el, setTitle(s), setHead(x), setBody(x), setFoot(x), isOpen()}
       title    string, the drawer's name for assistive tech and its default head text
       head     Node | string, replaces the default head (an avatar and a title, say); a close button is always added
       body     Node | string | Node[]    the scrolling part          foot  Node | string | Node[]   pinned at the bottom (none = no foot)
       modal    true holds focus and dims the page; false (default) leaves the page alone
       host     an element to open inside (it must be positioned: position relative); default document.body, fixed to the viewport
       opener   the element to focus after closing (default: the element focused when the drawer first opened)
       focus    false leaves focus where it is (a drawer opened on load); default true moves it into the body
       onClose  called once after it has closed
     Kit.drawer.current() -> the open handle or null;  Kit.drawer.close() closes whatever is open.
   One drawer per host: open() on a host that already has one reuses it (new content, same element, no close event).
   Needs from the board:
     css     kit/drawer.css; custom properties --panel --ink --ink-2 --rule --rule-2 --shadow --f-ui --f-display --accent, optional --scrim --rim --pool --glz-r-xl
     globals none
   db collections: none.
   Lifted from: a network-ops console's right-hand detail drawer (open, close, replace) and a deposit drawer with a scrim and Escape. */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const open_ = new Map();   // host -> state
let uid = 0, openCount = 0, last = null;
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const fill = (box, x) => { box.textContent = ''; (Array.isArray(x) ? x : [x]).forEach(n => { if (n == null) return; box.append(n instanceof Node ? n : document.createTextNode(String(n))); }); };
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function open(o) {
  o = o || {}; const host = o.host || document.body;
  let st = open_.get(host);
  if (st) { st.o = o; st.apply(); if (o.focus !== false) st.focusFirst(); return st.handle; }
  const id = 'kit-dr-' + (++uid);
  const root = el('div', 'kit-dr-root' + (o.host ? ' kit-dr-in' : '')); root.dataset.modal = o.modal ? 'true' : 'false';
  const scrim = el('div', 'kit-dr-scrim'); scrim.hidden = !o.modal;
  const dr = el('section', 'kit-dr'); dr.id = id; dr.setAttribute('role', 'dialog'); dr.setAttribute('aria-modal', o.modal ? 'true' : 'false'); dr.tabIndex = -1;
  const headBox = el('div', 'kit-dr-head'), closeBtn = el('button', 'kit-dr-x'); closeBtn.type = 'button'; closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  const bodyBox = el('div', 'kit-dr-body'), footBox = el('div', 'kit-dr-foot');
  const head = el('div', 'kit-dr-headin'); headBox.append(head, closeBtn);
  dr.append(headBox, bodyBox, footBox); root.append(scrim, dr); host.appendChild(root);
  const opener = o.opener || document.activeElement;
  let closed = false;
  const handle = {
    el: dr, isOpen: () => !closed,
    setTitle(s) { st.o.title = s; st.apply(); }, setHead(x) { st.o.head = x; st.applyHead(); }, setBody(x) { st.o.body = x; fill(bodyBox, x); }, setFoot(x) { st.o.foot = x; st.applyFoot(); },
    close() {
      if (closed) return; closed = true; open_.delete(host); openCount--; document.removeEventListener('keydown', onKey, true);
      root.classList.remove('kit-dr-on');
      const done = () => { root.remove(); const f = st.o.opener || opener; if (f && f.isConnected && f.focus) f.focus(); if (last === handle) last = null; if (st.o.onClose) st.o.onClose(); };
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) done(); else setTimeout(done, 180);
    },
  };
  st = {
    o, handle,
    applyHead() { if (st.o.head != null) fill(head, st.o.head); else { head.textContent = ''; head.append(el('h2', 'kit-dr-title', st.o.title || '')); } },
    applyFoot() { footBox.hidden = st.o.foot == null; if (st.o.foot != null) fill(footBox, st.o.foot); },
    apply() {
      dr.setAttribute('aria-label', st.o.title || st.o.label || 'Details'); root.dataset.modal = st.o.modal ? 'true' : 'false'; dr.setAttribute('aria-modal', st.o.modal ? 'true' : 'false'); scrim.hidden = !st.o.modal;
      st.applyHead(); fill(bodyBox, st.o.body); st.applyFoot(); bodyBox.scrollTop = 0;
    },
    focusFirst() { const f = dr.querySelector('.kit-dr-body ' + FOCUSABLE) || closeBtn; try { f.focus({ preventScroll: true }); } catch (_) { dr.focus(); } },
  };
  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); handle.close(); return; }
    if (e.key === 'Tab' && st.o.modal) {
      const l = [...dr.querySelectorAll(FOCUSABLE)].filter(x => x.offsetParent !== null); if (!l.length) return;
      const a = l[0], z = l[l.length - 1];
      if (e.shiftKey && (document.activeElement === a || !dr.contains(document.activeElement))) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && (document.activeElement === z || !dr.contains(document.activeElement))) { e.preventDefault(); a.focus(); }
    }
  }
  closeBtn.addEventListener('click', () => handle.close());
  scrim.addEventListener('click', () => handle.close());
  document.addEventListener('keydown', onKey, true);
  open_.set(host, st); openCount++; last = handle; st.apply();
  requestAnimationFrame(() => { root.classList.add('kit-dr-on'); if (o.focus !== false) st.focusFirst(); });
  return handle;
}
Kit.drawer = Object.freeze({ open, current: () => last, close() { if (last) last.close(); } });
})();
/* /part:page.script.kit.drawer */

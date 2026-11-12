/* part:page.script.kit.keep-state */
/**
 * Keep typing across a re-render
 * Kit.keepState.wrap(root, render) returns a redraw function that captures, renders and restores. It keeps the text of fields the person has edited (a field they did not touch takes the fresh value), which field has focus with its caret or selection, the scroll of marked panes, which details are open and which marked blocks are shown. Elements are matched by data-keep, id or name. An edited field gets data-kept; a draft whose field has gone from the new content stays in the snapshot. storageKey optionally keeps drafts in sessionStorage across a reload, guarded for when storage is blocked.
 *
 * What it is: a live page redraws when its data changes, and a redraw throws away what a person was in the middle of. This saves, before the redraw, the drafts in fields the person has
 * edited, which field has focus with its caret or selection, the scroll position of marked panes, which <details> are open and which marked blocks are shown; and puts them back after.
 * Elements are matched by a key you give them: data-keep="reply-12" (or, failing that, id, then name). An element with no key is left alone and a redraw resets it. Plain DOM.
 * Rules it keeps: a field the person has not edited takes the new value from the redraw (fresh data wins); an edited one keeps the draft (the draft wins) and gets data-kept="true".
 * API (small and stable):
 *   Kit.keepState.capture(root) -> snap          read the state of everything under root (root must still hold the old content)
 *   Kit.keepState.restore(root, snap) -> {restored, dropped}   put it back on the new content; dropped lists keys the new content no longer has (their drafts stay in snap)
 *   Kit.keepState.wrap(root, render, {storageKey}) -> redraw(...args)   redraw(...) is capture, then render(...args), then restore; returns what render returns.
 *                        Also redraw.snap() -> the last snapshot, and redraw.clear(key?) to forget a draft (after a send). storageKey keeps drafts in sessionStorage so a reload keeps them too
 *                        (every read and write is guarded; without storage it still works).
 * Marks in the markup:
 *   data-keep="key"               on an input, textarea, select, details, or a scrolling pane (add data-keep-scroll to restore its scrollTop)
 *   data-keep-scroll              the element's scrollTop and scrollLeft are kept
 *   data-keep-shown="key"         a block whose hidden attribute is kept (an open reply box); use the key you toggle with
 *
 * @id        kit.keep-state
 * @group     Board kit
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   Save drafts, focus, selection and open sections before a live page redraws, and put them back after.
 * @tags      redraw, re-render, draft, focus, caret, state, live
 * @requires  none
 * @provides  Kit.keepState.capture, Kit.keepState.restore, Kit.keepState.wrap
 * @config    Kit.keepState.wrap(root, render, {storageKey}) | redraw(...args) calls render(...args) between a capture and a restore; redraw.snap() and redraw.clear(key) manage the drafts
 * @config    markup | data-keep='key' on fields, details and scroll panes (with data-keep-scroll); data-keep-shown='key' on blocks whose hidden state is kept
 * @globals   none
 * @db        none
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const keyOf = e => e.getAttribute('data-keep') || e.id || e.getAttribute('name') || null;
const esc = s => (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&');
const FIELD = 'input:not([type=hidden]):not([type=password]):not([type=file]), textarea, select';
function find(root, key) {
  return root.querySelector('[data-keep="' + esc(key) + '"]') || root.querySelector('#' + esc(key)) || root.querySelector('[name="' + esc(key) + '"]');
}
function capture(root) {
  const snap = { fields: {}, open: {}, shown: {}, scroll: {}, focus: null };
  root.querySelectorAll(FIELD).forEach(e => {
    const k = keyOf(e); if (!k) return;
    const t = (e.type || '').toLowerCase();
    if (t === 'checkbox' || t === 'radio') { if (e.checked !== e.defaultChecked) snap.fields[k + (t === 'radio' ? '=' + e.value : '')] = { checked: e.checked, radio: t === 'radio', key: k, value: e.value }; return; }
    if (e.tagName === 'SELECT') { const sel = [...e.options].filter(o => o.selected).map(o => o.value); const def = [...e.options].filter(o => o.defaultSelected).map(o => o.value); if (sel.join('\u0001') !== def.join('\u0001')) snap.fields[k] = { select: sel }; return; }
    if (e.value !== e.defaultValue) snap.fields[k] = { value: e.value };
  });
  root.querySelectorAll('details').forEach(d => { const k = keyOf(d); if (k) snap.open[k] = d.open; });
  root.querySelectorAll('[data-keep-shown]').forEach(b => { snap.shown[b.getAttribute('data-keep-shown')] = !b.hidden; });
  root.querySelectorAll('[data-keep-scroll]').forEach(p => { const k = keyOf(p); if (k) snap.scroll[k] = [p.scrollLeft, p.scrollTop]; });
  const a = document.activeElement;
  if (a && root.contains(a) && a !== root) {
    const k = keyOf(a);
    if (k) { snap.focus = { key: k }; try { if (a.selectionStart != null) Object.assign(snap.focus, { s: a.selectionStart, e: a.selectionEnd, d: a.selectionDirection }); } catch (_) {} if (a.scrollTop) snap.focus.top = a.scrollTop; }
  }
  return snap;
}
function restore(root, snap) {
  const out = { restored: [], dropped: [] };
  if (!snap) return out;
  for (const [id, f] of Object.entries(snap.fields)) {
    const k = f.key || id;
    const e = f.radio ? [...root.querySelectorAll('input[type=radio]')].find(x => keyOf(x) === k && x.value === f.value) : find(root, k);
    if (!e) { out.dropped.push(k); continue; }
    if ('checked' in f) e.checked = f.checked;
    else if (f.select) [...e.options].forEach(o => { o.selected = f.select.includes(o.value); });
    else e.value = f.value;
    e.setAttribute('data-kept', 'true'); out.restored.push(k);
  }
  for (const [k, o] of Object.entries(snap.open)) { const d = find(root, k); if (d && 'open' in d) { d.open = o; out.restored.push(k); } }
  for (const [k, s] of Object.entries(snap.shown)) { const b = root.querySelector('[data-keep-shown="' + esc(k) + '"]'); if (b) { b.hidden = !s; out.restored.push(k); } else out.dropped.push(k); }
  for (const [k, p] of Object.entries(snap.scroll)) { const e = find(root, k); if (e) { e.scrollLeft = p[0]; e.scrollTop = p[1]; } }
  if (snap.focus) {
    const e = find(root, snap.focus.key);
    if (e) { try { e.focus({ preventScroll: true }); if (snap.focus.s != null && e.setSelectionRange) e.setSelectionRange(snap.focus.s, snap.focus.e, snap.focus.d || 'none'); if (snap.focus.top) e.scrollTop = snap.focus.top; } catch (_) {} }
    else out.dropped.push(snap.focus.key);
  }
  return out;
}
function wrap(root, render, o) {
  o = o || {}; let last = null;
  const sk = o.storageKey ? 'kit-keep:' + o.storageKey : null;
  const load = () => { try { return sk ? JSON.parse(sessionStorage.getItem(sk) || 'null') : null; } catch (_) { return null; } };
  const save = s => { try { if (sk) sessionStorage.setItem(sk, JSON.stringify(s)); } catch (_) {} };
  let first = true;
  const redraw = function () {
    let snap = capture(root);
    if (first) { first = false; const old = load(); if (old) snap = { ...old, ...snap, fields: { ...old.fields, ...snap.fields } }; }
    const res = render.apply(this, arguments);
    restore(root, snap);
    last = snap; save(snap); return res;
  };
  redraw.snap = () => last;
  redraw.clear = key => {
    if (!last) return; if (key == null) last = null; else { delete last.fields[key]; Object.keys(last.fields).forEach(k => { if (last.fields[k].key === key) delete last.fields[k]; }); }
    save(last || { fields: {}, open: {}, shown: {}, scroll: {}, focus: null });
  };
  return redraw;
}
Kit.keepState = Object.freeze({ capture, restore, wrap });
})();
/* /part:page.script.kit.keep-state */

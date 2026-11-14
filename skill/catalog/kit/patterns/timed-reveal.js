/* part:page.script.kit.timed-reveal */
/**
 * Timed reveal
 * Kit.timedReveal.mount(root, {items, fetch}) draws a sealed card. Open starts a draining ring (Kit.dialMeter.drain) and lists the rows. Each row has a Show button where its value will be; pressing it calls fetch(id, slot), puts the value in the button’s place with the seconds left, an optional Copy button (Kit.copy) and a Hide button, and brings the button back when the time is up. The value is not in the page until it is pressed, it sits in one text node, it is never logged or put in an event, and it is emptied on timeout, on close, when the page is hidden and when the theme changes. The time left is told in words as well as the ring: a button reads it out. This hides a value from a glance at the screen. It is not a security boundary, and the docs of a board that uses it should say so.
 *
 * What it is: a sealed card. Opening it starts a draining ring (Kit.dialMeter.drain) and lists the rows. Each row has a button where its value will be; pressing it fetches that one value and puts
 * it in the button's place for a short time, then the button comes back. Closing the card, the ring running out, the page being hidden and a change of theme all hide every shown value at once.
 *
 * The rules it keeps: a value is not in the page until it is pressed, it is held in one text node only, it is never logged or put in an event, and it is emptied on timeout, on close, on page hide
 * and on theme change. The time left is told in words as well as the ring: a button reads it out on request.
 *
 * This is a courtesy to the reader, not a security boundary: whoever can see the page while a value shows can read it, and a script on the page can read the text node. Say so in your own docs.
 *
 * API (small and stable):
 *   Kit.timedReveal.mount(root, {title, items, fetch, authorize, duration, valueSeconds, copy, label, sealedText, openText, onOpen, onClose}) -> {open(), close(), isOpen(), hideAll(), destroy()}
 *     items         [{id, label, sub, slots: [{key, label}]}]   a row with no slots has one, "Value"; a slot with `none: true` says "none" instead of a button
 *     fetch         (id, slotKey) -> string | Promise<string>   called on press, once per reveal; the board supplies it
 *     authorize     () -> Promise<boolean>   called by Open; resolve false (or reject) to stay sealed. Default: allow
 *     duration      seconds the card stays open (default 120)       valueSeconds   seconds one value shows (default 30)
 *     copy          true adds a Copy button next to a shown value (uses Kit.copy.wire)
 *     sealedText, openText   the sentences under the state title      onOpen, onClose   called after the card changes state
 *
 * CSS classes: .kit-tr .kit-tr-card .kit-tr-shown
 *
 * @id        pattern.timed-reveal
 * @kind      component
 * @group     Patterns
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   A sealed card with a draining ring; open it and each value shows in place of its button for a short time, then hides itself; closing hides all of them at once.
 * @tags      reveal, secret, timer, sealed, password, countdown, vault
 * @requires  viz.dial-meter, kit.vocab, kit.copy, kit.glaze-surfaces
 * @files     kit/patterns/timed-reveal.css, kit/samples/timed-reveal.json
 * @provides  Kit.timedReveal.mount
 * @config    Kit.timedReveal.mount(root, {title, items, fetch, authorize, duration, valueSeconds, copy, label, onOpen, onClose}) | items [{id, label, sub, slots: [{key, label, none}]}]; fetch(id, slotKey) -> string | Promise<string>; authorize() -> Promise<boolean>
 * @config    Kit.dialMeter, Kit.vocab | the ring needs kit/viz/dial-meter.js and .css; Kit.copy only when copy is true
 * @tokens    --panel --sunk --ink --ink-2 --rule --accent --f-ui --rule-2 --ok --f-mono --f-display? --rim? --pool? --seam? --glz-r-l? --glz-r-m?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | a network-ops console’s sealed-vault page | the ring that drains while the vault is open, the sealed and open card, a password shown in place of its button for a short time, hiding everything on close
 * @preview   {"render": "pattern.timed-reveal", "samples": ["kit/samples/timed-reveal.json"]}
 * @changed   The fetch is a callback and the values are held in one text node only.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
let uid = 0;
const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="4"/><path d="M8 10V8a4 4 0 018 0v2"/></svg>';
const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/></svg>';
const words = s => { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60), r = s % 60; return (m ? m + (m === 1 ? ' minute ' : ' minutes ') : '') + (r || !m ? r + (r === 1 ? ' second' : ' seconds') : '') + ' left'; };

function mount(root, opts) {
  const o = Object.assign({ title: 'Sealed', items: [], fetch: null, authorize: null, duration: 120, valueSeconds: 30, copy: false, label: 'Sealed values', onOpen: null, onClose: null,
    sealedText: 'Opens for a short time. Values show one at a time and hide again by themselves.', openText: 'It closes by itself when the ring runs out.' }, opts);
  const id = 'kit-tr-' + (++uid), reveals = new Set(); let isOpen = false, drain = null, busy = false, destroyed = false;
  root.classList.add('kit-tr'); root.setAttribute('role', 'group'); root.setAttribute('aria-label', o.label);
  const live = el('div', 'kit-tr-sr'); live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite');

  function hideAll() { [...reveals].forEach(r => r.hide()); reveals.clear(); }
  function slotEl(it, s) {
    const slot = el('span', 'kit-tr-slot'); slot.append(el('span', 'kit-tr-lbl', s.label));
    if (s.none) { slot.append(el('span', 'kit-tr-none', 'none')); return slot; }
    const show = el('button', 'kit-btn kit-sm', 'Show'); show.type = 'button'; show.setAttribute('aria-label', 'Show ' + s.label.toLowerCase() + ' of ' + it.label);
    show.insertAdjacentHTML('afterbegin', EYE);
    show.addEventListener('click', async () => {
      show.disabled = true; let v;
      try { v = await o.fetch(it.id, s.key); } catch (e) { show.disabled = false; live.textContent = 'Could not show that value.'; return; }
      if (!isOpen || destroyed) { v = null; show.disabled = false; return; }
      const box = el('span', 'kit-tr-shown'), val = el('span', 'kit-tr-val'), left = el('span', 'kit-tr-left'), hide = el('button', 'kit-btn kit-ghost kit-sm', 'Hide');
      hide.type = 'button'; val.textContent = v; v = null;
      box.append(val, left); let cp = null;
      if (o.copy && Kit.copy) { cp = el('button', 'kit-btn kit-sm', 'Copy'); cp.type = 'button'; box.append(cp); Kit.copy.wire(cp, () => val.textContent); }
      box.append(hide); let n = o.valueSeconds, timer = null;
      const rec = { hide() { clearInterval(timer); val.textContent = ''; reveals.delete(rec); if (box.isConnected) { box.replaceWith(show); show.disabled = false; } } };
      const tick = () => { left.textContent = 'hides in ' + n + ' s'; if (n-- <= 0) rec.hide(); };
      hide.addEventListener('click', () => { rec.hide(); show.focus(); });
      show.replaceWith(box); reveals.add(rec); tick(); timer = setInterval(tick, 1000); hide.focus({ preventScroll: true });
    });
    slot.append(show); return slot;
  }
  function rows() {
    const ul = el('ul', 'kit-tr-rows'); ul.setAttribute('aria-label', 'Sealed values');
    o.items.forEach(it => {
      const li = el('li', 'kit-tr-row'); const tx = el('span', 'kit-tr-tx'); tx.append(el('span', 'kit-tr-t', it.label)); if (it.sub) tx.append(el('span', 'kit-tr-s', it.sub));
      const sl = el('span', 'kit-tr-slots'); (it.slots || [{ key: 'value', label: 'Value' }]).forEach(s => sl.append(slotEl(it, s))); li.append(tx, sl); ul.append(li);
    });
    return ul;
  }
  function paint() {
    hideAll(); if (drain) { drain.destroy(); drain = null; }
    const card = el('div', 'kit-tr-card'); card.dataset.open = String(isOpen); card.setAttribute('data-vo-tone', isOpen ? 'success' : 'neutral');
    const mark = el('div', 'kit-tr-mark');
    const side = el('div', 'kit-tr-state'); side.append(el('h3', 'kit-tr-title', isOpen ? 'Open' : o.title), el('p', 'kit-tr-text', isOpen ? o.openText : o.sealedText));
    const acts = el('div', 'kit-tr-acts');
    if (isOpen) {
      drain = Kit.dialMeter.drain({ title: 'Time left', total: o.duration, remaining: o.duration, caption: 'then it seals again', onEnd: () => api.close() });
      mark.append(drain.el);
      const tl = el('button', 'kit-btn kit-ghost kit-sm', 'How long is left?'); tl.type = 'button'; tl.addEventListener('click', () => { live.textContent = ''; setTimeout(() => { live.textContent = words(drain ? drain.remaining() : 0); }, 30); });
      const cl = el('button', 'kit-btn kit-primary', 'Close now'); cl.type = 'button'; cl.addEventListener('click', () => api.close());
      acts.append(cl, tl);
    } else {
      const lock = el('span', 'kit-tr-lock'); lock.innerHTML = LOCK; lock.setAttribute('role', 'img'); lock.setAttribute('aria-label', 'Sealed'); mark.append(lock);
      const op = el('button', 'kit-btn kit-primary', 'Open'); op.type = 'button'; op.disabled = busy; op.addEventListener('click', () => api.open()); acts.append(op);
    }
    side.append(acts); const top = el('div', 'kit-tr-top'); top.append(mark, side); card.append(top);
    if (isOpen) { const l = el('div', 'kit-tr-list'); l.append(el('h4', 'kit-tr-lh', 'Values'), el('p', 'kit-tr-lp', 'Show puts one value in place of its button for ' + o.valueSeconds + ' seconds. Nothing is logged or kept.'), rows()); card.append(l); }
    card.append(live); root.replaceChildren(card);
  }
  const api = {
    isOpen: () => isOpen, hideAll,
    async open() {
      if (isOpen || busy || destroyed) return; busy = true; paint();
      let ok = true; try { if (o.authorize) ok = (await o.authorize()) !== false; } catch (e) { ok = false; }
      busy = false; if (!ok || destroyed) { paint(); return; }
      isOpen = true; paint(); live.textContent = 'Open. ' + words(o.duration) + '.'; if (o.onOpen) o.onOpen();
    },
    close() { if (!isOpen) return; hideAll(); isOpen = false; paint(); live.textContent = 'Sealed again.'; if (o.onClose) o.onClose(); },
    destroy() { destroyed = true; hideAll(); if (drain) drain.destroy(); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', hideAll); mo.disconnect(); mq && mq.removeEventListener && mq.removeEventListener('change', hideAll); root.replaceChildren(); root.classList.remove('kit-tr'); },
  };
  const onVis = () => { if (document.hidden) hideAll(); };
  document.addEventListener('visibilitychange', onVis); window.addEventListener('pagehide', hideAll);
  const mo = new MutationObserver(hideAll); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null; if (mq && mq.addEventListener) mq.addEventListener('change', hideAll);
  paint(); return api;
}
Kit.timedReveal = Object.freeze({ mount });
})();
/* /part:page.script.kit.timed-reveal */

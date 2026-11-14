/* part:page.script.kit.code-gate */
/**
 * Rotating code card
 * Kit.codeGate.mount(el, {period, code, label, note}) shows a code that changes every period (aligned to the clock), with a ring that drains and the seconds left written out. Use it where a person reads a one-time code aloud or types it in elsewhere. The code comes from code(step), once per period, and may return a promise, so a real board asks its own service. The default generator is a hash of the period number that anyone reading the file can compute: it shows the card and is never an authenticator, and the preview says so. The ring jumps without a transition when the viewer prefers reduced motion, and the seconds are always in words.
 *
 * API (small and stable):
 *   Kit.codeGate.mount(el, opts) -> {refresh(), destroy()}
 *     period   seconds a code lives, aligned to the clock (default 30);  digits  length of the stand-in code (default 6);  group  digits per group when shown (default 3)
 *     code(step) -> string | Promise<string>    the code for that period number (floor(unix seconds / period)); default Kit.codeGate.demoCode
 *     label    the line above the code;  note  the line below it;  now()  clock in ms (default Date.now), for tests
 *     onRotate(code, step)   called when a new code is shown
 *     words    texts that replace the defaults (keys: label, note, left, loading, failed)
 *   Kit.codeGate.demoCode(step, digits) -> string   the stand-in (FNV hash of a fixed phrase and the step)
 *
 * Optional custom properties: --seam.
 *
 * @id        kit.code-gate
 * @kind      component
 * @group     Board kit
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   A short-lived code in large type with a draining ring and the seconds left in words. The default code is a demonstration, not a secret.
 * @tags      code, one-time, countdown, ring, timer, activation, gate, rotating
 * @requires  none
 * @files     kit/code-gate.css, kit/samples/code-gate.json
 * @provides  Kit.codeGate.mount, Kit.codeGate.demoCode
 * @config    Kit.codeGate.mount(el, {period, digits, group, code, label, note, onRotate}) | code(step) -> string | Promise<string>; step is floor(unix seconds / period); default is the stand-in Kit.codeGate.demoCode
 * @config    words | label, note, left(n), loading, failed
 * @tokens    --ink --panel --f-ui --f-mono
 * @globals   none
 * @db        note None. A real code function calls the board's own service; that call and any capability it needs belong to the board.
 * @source    Catalog harvest, 2026-10-25 | a security proposal's index.html | the activation-code card: six digits, a 30 second ring, seconds left
 * @preview   {"render": "kit.code-gate", "samples": ["kit/samples/code-gate.json"]}
 * @changed   Kept after review: it is a general countdown card for any time-boxed code. The source's code was a hash of a fixed phrase, so the generator is now a named stand-in and the real code is a function the board supplies.
 * @changed   The card is built from tokens (an inverted --ink card), not the source's amber palette.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const WORDS = {
  label: 'Activation code', note: 'The code changes every period. Read it out or type it where it is asked for; it stops working when the ring empties.',
  left: n => n + ' s left', loading: 'Getting the code…', failed: 'The code could not be fetched. It will try again in the next period.',
};
const R = 9, C = 2 * Math.PI * R;
function fnv(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
function demoCode(step, digits) {
  const d = digits || 6, n = fnv('catalog-demo-phrase-' + step) % Math.pow(10, d);
  return ('0'.repeat(d) + n).slice(-d);
}
const show = (c, g) => { c = String(c); if (!(g > 0)) return c; const out = []; for (let i = 0; i < c.length; i += g) out.push(c.slice(i, i + g)); return out.join(' '); };

Kit.codeGate = Object.freeze({
  demoCode,
  mount(el, o) {
    const W = Object.assign({}, WORDS, o.words), period = Math.max(2, o.period || 30), group = o.group == null ? 3 : o.group, clock = o.now || Date.now;
    const getCode = o.code || (s => demoCode(s, o.digits));
    el.classList.add('kit-gate'); el.setAttribute('role', 'group'); el.setAttribute('aria-label', o.label || W.label);
    const NS = 'http://www.w3.org/2000/svg';
    const mk = (tag, at) => { const n = document.createElementNS(NS, tag); for (const k in at) n.setAttribute(k, at[k]); return n; };
    const svg = mk('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
    const track = mk('circle', { class: 'kit-gate-track', cx: 12, cy: 12, r: R, fill: 'none', 'stroke-width': 3 });
    const arc = mk('circle', { class: 'kit-gate-arc', cx: 12, cy: 12, r: R, fill: 'none', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-dasharray': C.toFixed(2), 'stroke-dashoffset': 0 });
    svg.append(track, arc);
    const lab = Object.assign(document.createElement('p'), { className: 'kit-gate-who', textContent: o.label || W.label });
    const codeEl = Object.assign(document.createElement('p'), { className: 'kit-gate-code', textContent: '••• •••' });
    const left = document.createElement('span'); left.className = 'kit-gate-left'; left.setAttribute('role', 'timer');
    const ring = document.createElement('div'); ring.className = 'kit-gate-ring'; ring.append(svg, left);
    const note = Object.assign(document.createElement('p'), { className: 'kit-gate-note', textContent: o.note != null ? o.note : W.note });
    el.replaceChildren(lab, codeEl, ring, note);
    let step = -1, sec = -1, timer = 0, dead = false, token = 0;
    function load(s) {
      const t = ++token; codeEl.dataset.state = 'loading';
      Promise.resolve().then(() => getCode(s)).then(c => {
        if (dead || t !== token) return;
        codeEl.textContent = show(c, group); codeEl.dataset.state = 'ready';
        if (o.onRotate) o.onRotate(String(c), s);
      }, () => { if (dead || t !== token) return; codeEl.textContent = '–'; codeEl.dataset.state = 'failed'; note.textContent = W.failed; });
    }
    function tick() {
      const now = Math.floor(clock() / 1000), s = Math.floor(now / period), rem = period - (now % period);
      if (s !== step) { step = s; if (codeEl.dataset.state === 'failed') note.textContent = o.note != null ? o.note : W.note; load(s); }
      if (rem !== sec) { sec = rem; arc.setAttribute('stroke-dashoffset', (C * (1 - rem / period)).toFixed(2)); left.textContent = W.left(rem); }
    }
    function refresh() { step = -1; sec = -1; tick(); }
    document.addEventListener('visibilitychange', tick);
    tick(); timer = setInterval(tick, 250);
    return { refresh, destroy() { dead = true; clearInterval(timer); document.removeEventListener('visibilitychange', tick); el.replaceChildren(); el.classList.remove('kit-gate'); } };
  },
});
})();
/* /part:page.script.kit.code-gate */

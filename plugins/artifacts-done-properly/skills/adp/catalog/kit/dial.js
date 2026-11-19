/* part:page.script.kit.dial */
/**
 * Segmented dial
 * Kit.dial.mount(el, {label, options, value, onChange}) is a radio group drawn as a pill with a thumb that slides to the chosen segment. Arrow keys, Home and End move and choose, Tab enters and leaves once, the digits 1 to 9 pick a segment when keys is set, and the thumb stays still when the viewer prefers reduced motion. At phone width the pill fills the row and the segments share it. Kit.dial.marks(root, {verdict}) repaints inline identifiers for the chosen reader: each span[data-kit-id] is shown clear, as already held (dotted underline), redacted (its characters replaced by blocks, so copying leaks nothing) or held back (boxed). It is a preview for the viewer's eyes; the page source still holds the real values.
 *
 * API (small and stable):
 *   Kit.dial.mount(el, {label, options, value, onChange, keys, name}) -> {get(), set(id, {silent}), destroy()}
 *     options  [{id, label, hint}]    label is the control's visible name (default "Preview as");  hint is a title on the segment
 *     value    the first chosen id (default the first option);  onChange(id, option) runs on every change by the viewer and by set() unless silent
 *     keys     true wires the digits 1 to 9 on the document (ignored while typing in a field)
 *   Kit.dial.marks(root, {verdict, labels}) -> {paint(dialValue), destroy()}
 *     verdict(key, dialValue) -> "clear" | "fine" | "redact" | "held"    key is the span's data-kit-id
 *     labels   {clear, fine, redact, held} titles and screen-reader texts (neutral defaults)
 *   The marks are a preview for the viewer's eyes, not a security control: the page's source still holds the real values.
 *
 * Optional custom properties: --seam.
 *
 * @id        kit.dial
 * @kind      component
 * @group     Board kit
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   Segmented control with a sliding thumb (preview as, audience); arrow keys, digit keys, reduced motion; inline redaction marks.
 * @tags      dial, segmented, control, audience, preview as, redaction, radio, toggle
 * @requires  none
 * @files     kit/dial.css, kit/samples/kit.json
 * @provides  Kit.dial.mount, Kit.dial.marks
 * @config    Kit.dial.mount(el, {label, options, value, onChange, keys}) | options [{id, label, hint}]; onChange(id, option) on every change; keys wires the digits 1 to 9
 * @config    Kit.dial.marks(root, {verdict, labels}) | verdict(key, dialValue) -> clear | fine | redact | held, for each span[data-kit-id]; paint(dialValue) repaints
 * @tokens    --sunk --ink --ink-2 --rule --accent --accent-ink --ok --f-ui --f-mono --seam?
 * @globals   none
 * @db        note None. What the dial chooses is the board's to keep or forget.
 * @source    Catalog harvest, 2026-10-25 | a share-readiness sheet's index.html | the audience dial with its thumb, digit keys, per-reader verdict text, and the inline identifier redaction
 * @preview   {"render": "kit.dial", "samples": ["kit/samples/kit.json#dial"]}
 * @samples   dial
 * @changed   Arrow-key radio behaviour added; the source was buttons with aria-pressed.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
let seq = 0;
const isTyping = t => t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]');
const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

Kit.dial = Object.freeze({
  mount(el, o) {
    const opts = o.options || [], id0 = 'kdial' + (++seq);
    let cur = opts.some(x => x.id === o.value) ? o.value : (opts[0] || {}).id, dead = false;
    el.classList.add('kit-dial');
    const lab = document.createElement('span'); lab.className = 'kit-dial-l'; lab.id = id0 + '-l'; lab.textContent = o.label || 'Preview as';
    const seg = document.createElement('div'); seg.className = 'kit-dial-seg'; seg.setAttribute('role', 'radiogroup'); seg.setAttribute('aria-labelledby', lab.id);
    const thumb = document.createElement('span'); thumb.className = 'kit-dial-thumb'; thumb.setAttribute('aria-hidden', 'true');
    seg.append(thumb);
    const btns = opts.map((x, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'kit-dial-b'; b.setAttribute('role', 'radio'); b.dataset.id = x.id;
      if (x.hint) b.title = x.hint;
      if (o.keys && i < 9) { const k = document.createElement('kbd'); k.textContent = String(i + 1); k.setAttribute('aria-hidden', 'true'); b.append(k); }
      b.append(document.createTextNode(x.label));
      b.addEventListener('click', () => set(x.id));
      seg.append(b); return b;
    });
    el.replaceChildren(lab, seg);
    function place() {
      const b = btns.find(x => x.dataset.id === cur); if (!b || !b.offsetWidth) return;
      thumb.style.width = b.offsetWidth + 'px'; thumb.style.height = b.offsetHeight + 'px'; thumb.style.transform = 'translate(' + b.offsetLeft + 'px,' + b.offsetTop + 'px)';
    }
    function set(id, opt) {
      if (!opts.some(x => x.id === id)) return;
      cur = id;
      btns.forEach(b => { const on = b.dataset.id === cur; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
      place();
      if (!(opt && opt.silent) && o.onChange) o.onChange(cur, opts.find(x => x.id === cur));
    }
    seg.addEventListener('keydown', e => {
      const i = opts.findIndex(x => x.id === cur); let j = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % opts.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + opts.length) % opts.length;
      else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = opts.length - 1;
      if (j < 0) return; e.preventDefault(); set(opts[j].id); btns[j].focus();
    });
    const onKey = e => { if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return; const n = parseInt(e.key, 10); if (n >= 1 && n <= Math.min(9, opts.length)) set(opts[n - 1].id); };
    if (o.keys) document.addEventListener('keydown', onKey);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => place()) : null; if (ro) ro.observe(seg);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!dead) place(); });
    el.dataset.motion = reduced() ? 'off' : 'on';
    set(cur, { silent: true });
    return { get: () => cur, set, destroy() { dead = true; document.removeEventListener('keydown', onKey); if (ro) ro.disconnect(); el.replaceChildren(); el.classList.remove('kit-dial'); } };
  },
  marks(root, o) {
    const L = Object.assign({ clear: 'nothing to hide', fine: 'this reader already holds it', redact: 'redacted for this reader', held: 'held back from this reader' }, o.labels);
    const BLOCK = '█';
    function paint(value) {
      root.querySelectorAll('[data-kit-id]').forEach(n => {
        if (n.dataset.orig === undefined) n.dataset.orig = n.textContent;
        const v = o.verdict(n.dataset.kitId, value) || 'clear';
        n.dataset.v = v; n.classList.add('kit-id');
        n.textContent = v === 'redact' ? BLOCK.repeat(Math.max(4, Math.min(24, n.dataset.orig.length))) : n.dataset.orig;
        n.title = L[v] || ''; if (v === 'redact') n.setAttribute('aria-label', L.redact); else n.removeAttribute('aria-label');
      });
    }
    return { paint, destroy() { root.querySelectorAll('[data-kit-id]').forEach(n => { if (n.dataset.orig !== undefined) { n.textContent = n.dataset.orig; delete n.dataset.orig; } delete n.dataset.v; n.removeAttribute('aria-label'); n.removeAttribute('title'); n.classList.remove('kit-id'); }); } };
  },
});
})();
/* /part:page.script.kit.dial */

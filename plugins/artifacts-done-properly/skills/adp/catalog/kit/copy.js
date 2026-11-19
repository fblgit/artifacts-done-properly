/* part:page.script.kit.copy */
/**
 * Code block with copy
 * Kit.copy.text(text, {select}) copies inside a click and resolves copied, selected or failed; on refusal it selects the text and the button says to press Ctrl+C or Cmd+C. Kit.copy.mount(root) wires .kit-code blocks, [data-copy] buttons (the command grid) and [data-copy-from] buttons once each; Kit.copy.block({code, label, ink}) makes a block. Results are also announced in one polite live region.
 *
 * API (small and stable):
 *   Kit.copy.text(text, {select}) -> Promise<"copied" | "selected" | "failed">   call it inside the click handler; select is the element whose text to select on refusal
 *   Kit.copy.wire(button, getText, {select, label})   one button; getText() returns the string; the button shows Copied / Press Ctrl+C for 1.6 s
 *   Kit.copy.mount(root = document) -> {refresh(), destroy()}   enhances, once each:
 *     .kit-code > pre               adds the bar (data-label on .kit-code names it) and a Copy button for the pre's text
 *     [data-copy]                   a button that copies its data-copy value (e.g. button.kit-cmd in ul.kit-cmds)
 *     [data-copy-from="#id"]        a button that copies the text of another element
 *   Kit.copy.block({code, label, ink}) -> HTMLElement   a ready .kit-code element (mount wires it once it is in the page)
 * Every result is also announced in one polite live region. No storage, no network.
 *
 * Optional custom properties: --seam.
 *
 * @id        kit.copy
 * @kind      component
 * @group     Board kit
 * @status    new
 * @version   0.1.0
 * @updated   2026-10-24
 * @summary   Labelled code blocks with a copy button, a click-to-copy command grid, and the fallback that selects the text where the clipboard is refused.
 * @tags      copy, clipboard, code, snippet, command, shell, button, fallback
 * @requires  none
 * @files     kit/copy.css, kit/samples/kit.json
 * @provides  Kit.copy.text, Kit.copy.wire, Kit.copy.mount, Kit.copy.block
 * @config    Kit.copy.mount(root) | enhances .kit-code > pre, [data-copy] and [data-copy-from] buttons
 * @config    Kit.copy.text(text, {select}) | -> copied | selected | failed
 * @tokens    --panel --sunk --ink --ink-2 --rule --ok --accent --f-ui --f-mono --seam?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | 5 artifacts' index.html | a code block's copy button, a copy-on-hover dark block, a copy with a selection fallback, a click-to-copy command grid, and an answers copy fallback
 * @preview   {"render": "kit.copy", "samples": ["kit/samples/kit.json#copy"]}
 * @samples   copy
 * @changed   The copy button is always shown, not only on hover, so touch and keyboard reach it.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
const ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.8"/><path d="M10.5 3.5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v6.5a1 1 0 001 1h.5"/></svg>';
let live = null;
function say(msg) {
  if (!live || !live.isConnected) { live = document.createElement('div'); live.className = 'kit-copy-live'; live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); document.body.append(live); }
  live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 30);
}
function selectText(el) {
  if (!el) return false;
  try {
    if (el.select) { el.focus(); el.select(); return true; }
    const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return true;
  } catch (_) { return false; }
}
function text(t, opts) {
  const o = opts || {};
  const fall = () => selectText(o.select) ? 'selected' : 'failed';
  try {
    if (!navigator.clipboard || !navigator.clipboard.writeText) return Promise.resolve(fall());
    return navigator.clipboard.writeText(String(t)).then(() => 'copied', fall);
  } catch (_) { return Promise.resolve(fall()); }
}
const WORD = { copied: 'Copied', selected: 'Press ' + (isMac ? 'Cmd' : 'Ctrl') + '+C', failed: 'Copy did not work' };
function wire(btn, getText, opts) {
  if (!btn || btn.__kitCopy) return;
  const o = opts || {};
  const lab = btn.querySelector('.kit-copy-t, .kit-cmd-s') || (btn.classList.contains('kit-copy') ? btn : null);
  const rest = lab ? lab.textContent : '';
  let timer = 0;
  const on = e => {
    if (e) e.preventDefault();
    const what = getText();
    text(what, { select: typeof o.select === 'function' ? o.select() : o.select }).then(st => {
      btn.dataset.state = st; if (lab) lab.textContent = WORD[st];
      say(st === 'copied' ? 'Copied ' + (o.label || 'to the clipboard') : st === 'selected' ? 'The text is selected. ' + WORD.selected + ' to copy it.' : 'Copy did not work. Select the text and copy it yourself.');
      clearTimeout(timer); timer = setTimeout(() => { delete btn.dataset.state; if (lab) lab.textContent = rest; }, st === 'copied' ? 1600 : 4000);
    });
  };
  btn.addEventListener('click', on); btn.__kitCopy = on;
}
function makeButton(label) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'kit-copy';
  b.innerHTML = ICON + '<span class="kit-copy-t">Copy</span>'; b.setAttribute('aria-label', 'Copy ' + (label || 'the code'));
  return b;
}
function enhanceBlock(box) {
  if (box.__kitCopy) return; const pre = box.querySelector('pre'); if (!pre) return; box.__kitCopy = true;
  if (!pre.hasAttribute('tabindex')) pre.tabIndex = 0;
  let bar = box.querySelector('.kit-code-bar');
  const label = box.dataset.label || '';
  if (!bar) { bar = document.createElement('div'); bar.className = 'kit-code-bar'; const l = document.createElement('span'); l.className = 'kit-code-l'; l.textContent = label; bar.append(l); box.prepend(bar); }
  if (!bar.querySelector('.kit-copy')) bar.append(makeButton(label));
  if (label && !pre.hasAttribute('aria-label')) pre.setAttribute('aria-label', label);
  wire(bar.querySelector('.kit-copy'), () => pre.textContent.replace(/\n$/, ''), { select: pre, label: label || 'the code' });
}
function mount(root) {
  const r = root || document;
  const refresh = () => {
    r.querySelectorAll('.kit-code').forEach(enhanceBlock);
    r.querySelectorAll('[data-copy]').forEach(b => wire(b, () => b.dataset.copy, { select: b.querySelector('code') || b, label: b.dataset.copy }));
    r.querySelectorAll('[data-copy-from]').forEach(b => { const t = () => r.querySelector(b.dataset.copyFrom) || document.querySelector(b.dataset.copyFrom); wire(b, () => (t() || {}).textContent || '', { select: t }); });
  };
  refresh();
  return { refresh, destroy() { r.querySelectorAll('.kit-copy, [data-copy], [data-copy-from]').forEach(b => { if (b.__kitCopy) { b.removeEventListener('click', b.__kitCopy); delete b.__kitCopy; } }); r.querySelectorAll('.kit-code').forEach(b => { delete b.__kitCopy; }); } };
}
function block({ code = '', label = '', ink = false } = {}) {
  const box = document.createElement('div'); box.className = 'kit-code' + (ink ? ' ink' : ''); if (label) box.dataset.label = label;
  const pre = document.createElement('pre'); const c = document.createElement('code'); c.textContent = code; pre.append(c); box.append(pre);
  return box;
}
Kit.copy = Object.freeze({ text, wire, mount, block });
})();
/* /part:page.script.kit.copy */

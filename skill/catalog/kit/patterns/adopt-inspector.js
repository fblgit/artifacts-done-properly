/* part:page.script.kit.adopt-inspector */
/**
 * Adopt inspector
 * The artifact being adopted, running live in a frame, with a picker like a browser's dev tools: hover outlines the element under the pointer and names the candidate that owns it, a click selects that candidate, and the selected candidate's own elements are outlined everywhere at once.
 *
 * The frame must be same-origin with the page, so the adopter serves a copy of the artifact's files (docs/adopt.md). Scripts in the frame run with the page's own origin: adopt only an artifact you wrote or trust.
 *
 * API:
 *   Kit.adoptInspector.mount(root, {src, candidates, selected, onPick, label}) -> {setCandidates(list), select(id), inspect(on), reload(), destroy()}
 *     src         the frame's address, relative to the page (for example subject/index.html)
 *     candidates  the records Kit.adopt.index reads: {id, classes, ids}
 *     selected    the candidate whose elements are outlined
 *     onPick      ({id, via, value, tag}) a click while inspecting; id is null when nothing in the candidates owns the element
 *
 * The bar says what the frame cannot be read for (a different origin, or not loaded yet) instead of failing silently. Escape leaves the picker.
 *
 * @id        pattern.adopt-inspector
 * @kind      component
 * @group     Patterns
 * @status    new
 * @version   0.1.0
 * @updated   2026-11-15
 * @summary   The artifact running live in a same-origin frame with a dev-tools picker: hover names the owning candidate, a click selects it, and the selected candidate's elements are outlined.
 * @tags      adopt, inspector, picker, iframe, devtools, preview, select, highlight
 * @requires  kit.adopt
 * @files     kit/patterns/adopt-inspector.css
 * @provides  Kit.adoptInspector.mount
 * @config    Kit.adoptInspector.mount(root, opts) | src, candidates, selected, onPick({id, via, value, tag}), label
 * @tokens    --panel --sunk --ink --ink-2 --rule --accent --accent-ink --warn --f-ui --f-mono
 * @globals   none
 * @db        none
 * @source    Adopt workbench, 2026-11-15 | docs/adopt.md | the inspector view
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const STYLE = '.kit-ai-hover{outline:2px solid #ff3b7a!important;outline-offset:-2px!important;cursor:crosshair!important}.kit-ai-own{outline:2px dashed #2f7cf6!important;outline-offset:-2px!important}';

function mount(root, opts) {
  const o = Object.assign({ src: '', candidates: [], selected: null, label: 'Live preview of the artifact' }, opts);
  let cands = o.candidates, sel = o.selected, idx = Kit.adopt.index(cands), on = false, hot = null, owned = [], dead = false, doc = null;
  root.classList.add('kit-ai'); root.replaceChildren();
  const bar = el('div', 'kit-ai-bar'), tog = el('button', 'kit-ai-btn', 'Pick an element'), rl = el('button', 'kit-ai-btn', 'Reload'), say = el('span', 'kit-ai-say', 'Loading the artifact.');
  tog.type = 'button'; rl.type = 'button'; tog.setAttribute('aria-pressed', 'false'); say.setAttribute('role', 'status'); bar.append(tog, rl, say);
  const frame = document.createElement('iframe'); frame.className = 'kit-ai-frame'; frame.title = o.label; frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
  root.append(bar, frame);

  const clear = () => { if (hot) hot.classList.remove('kit-ai-hover'); hot = null; };
  const unown = () => { owned.forEach(e => e.classList.remove('kit-ai-own')); owned = []; };
  function paintOwn() {
    unown(); if (!doc || !sel) return;
    const c = cands.find(x => x.id === sel); if (!c) return;
    const q = (c.classes || []).slice(0, 120).map(k => '.' + (window.CSS && CSS.escape ? CSS.escape(k) : k)).concat((c.ids || []).map(i => '#' + i));
    if (!q.length) { say.textContent = c.name + ' draws nothing of its own in this view.'; return; }
    try { doc.querySelectorAll(q.join(',')).forEach(e => { if (owned.length < 400) { e.classList.add('kit-ai-own'); owned.push(e); } }); } catch (e) { /* a class that is not a valid selector is skipped */ }
    say.textContent = c.name + ': ' + owned.length + ' element' + (owned.length === 1 ? '' : 's') + ' outlined in this view.';
  }
  const over = e => {
    if (!on) return; clear(); hot = e.target; hot.classList.add('kit-ai-hover');
    const w = Kit.adopt.ownerOf(hot, idx); say.textContent = '<' + hot.tagName.toLowerCase() + '> ' + (w.id ? '→ ' + w.id + ' (' + w.via + ' ' + w.value + ')' : '→ no candidate owns this');
  };
  const click = e => {
    if (!on) return; e.preventDefault(); e.stopPropagation();
    const w = Kit.adopt.ownerOf(e.target, idx); if (o.onPick) o.onPick(Object.assign({ tag: e.target.tagName.toLowerCase() }, w)); toggle(false);
  };
  const key = e => { if (e.key === 'Escape' && on) toggle(false); };
  function toggle(v) { on = v; tog.setAttribute('aria-pressed', String(on)); root.toggleAttribute('data-picking', on); if (!on) clear(); if (on) say.textContent = 'Hover the artifact, click to select.'; else paintOwn(); }
  function attach() {
    try { doc = frame.contentDocument; } catch (e) { doc = null; }
    if (!doc || !doc.body) { say.textContent = 'The artifact cannot be read here: it must be served from this page\'s own files.'; tog.disabled = true; return; }
    tog.disabled = false;
    const st = doc.createElement('style'); st.textContent = STYLE; doc.head.append(st);
    doc.addEventListener('mouseover', over, true); doc.addEventListener('click', click, true); doc.addEventListener('keydown', key, true);
    say.textContent = 'Ready. Press Pick an element.'; paintOwn();
  }
  tog.addEventListener('click', () => toggle(!on)); rl.addEventListener('click', () => { owned = []; frame.src = o.src; });
  frame.addEventListener('load', attach); document.addEventListener('keydown', key);
  frame.src = o.src;
  return {
    setCandidates(l) { cands = l || []; idx = Kit.adopt.index(cands); paintOwn(); },
    select(id) { sel = id; paintOwn(); },
    inspect(v) { if (!tog.disabled) toggle(!!v); },
    reload() { rl.click(); },
    destroy() { dead = true; document.removeEventListener('keydown', key); root.replaceChildren(); root.classList.remove('kit-ai'); },
  };
}

Kit.adoptInspector = { mount };
})();
/* /part:page.script.kit.adopt-inspector */

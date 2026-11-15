/* part:page.script.kit.adopt-inspector */
/**
 * Adopt inspector
 * The artifact being adopted, running live in a frame, with a picker like a browser's dev tools: hover outlines the element under the pointer and names the candidate that owns it, and a click selects that candidate. Every candidate's own elements are painted by its state (green adopted, amber working, dimmed discarded), and the selected candidate also shows as a still picture of itself above the frame.
 *
 * The frame must be same-origin with the page, so the adopter serves a copy of the artifact's files (docs/adopt.md). Scripts in the frame run with the page's own origin: adopt only an artifact you wrote or trust.
 *
 * API:
 *   Kit.adoptInspector.mount(root, {src, candidates, selected, onPick, onBuild, label}) -> {setCandidates(list), select(id), setPreview(id, html), inspect(on), refresh(), reload(), destroy()}
 *     setPreview  a preview page for one candidate: a complete HTML document that renders just that component from the artifact's own files with sample data, shown in its own
 *                 frame (scripts run; relative addresses resolve against this page, so it loads subject/...). It wins over the on-screen picture. setPreview(id, null) removes it.
 *     onBuild     (id) the person pressed "Ask Claude to build a preview"; the page sends the request. Without it the button is not offered.
 *     onAssign    ({id, classes, ids}) the person clicked a block nobody owns and gave it to a candidate; the page keeps it and passes the candidates back with those classes added,
 *                 so the next click selects it. Without it a click on an unowned block only says nobody owns it.
 *     onPreviewState  ({id, status, errors, children, text, html}) once a preview page has loaded: status ok, blank (it drew nothing), error (it reported script errors in
 *                 window.__pvErrors) or unreadable (the frame could not be read). The page can keep it, so what a person sees is known without asking them.
 *     src         the frame's address, relative to the page (for example subject/index.html)
 *     candidates  the records Kit.adopt.index reads: {id, name, state, classes, ids, provides, summary}
 *     selected    the candidate shown as a picture and ringed in the frame
 *     onPick      ({id, via, value, tag, classes, ids, label}) a click while inspecting; id is null when nothing in the candidates owns the element (classes and ids are those of the
 *                 nearest block with any, label is how it reads: div#x.card.room)
 *
 * The picture is the component's element copied out of the frame with the frame's stylesheets, as it is on screen now: it does not run. A candidate with no classes or ids (logic only) says it draws nothing; one that is not on screen in the frame's current view says so, and the picture and the paint follow the frame when it changes (a tab opened inside the artifact).
 * The bar says what the frame cannot be read for (a different origin, or not loaded yet) instead of failing silently. Escape leaves the picker.
 *
 * @id        pattern.adopt-inspector
 * @kind      component
 * @group     Patterns
 * @status    new
 * @version   0.4.0
 * @updated   2026-11-15
 * @summary   The artifact running live in a same-origin frame with a dev-tools picker: hover names the owning candidate, a click selects it, elements are painted by candidate state, and the selected one shows as a still picture.
 * @tags      adopt, inspector, picker, iframe, devtools, preview, select, highlight, snapshot
 * @requires  kit.adopt
 * @files     kit/patterns/adopt-inspector.css
 * @provides  Kit.adoptInspector.mount
 * @config    Kit.adoptInspector.mount(root, opts) | src, candidates, selected, onPick({id, via, value, tag, classes, ids, label}), onBuild(id), onAssign({id, classes, ids}), onPreviewState({id, status, errors}), label
 * @tokens   --panel --sunk --ink --ink-2 --rule --accent --accent-ink --warn --f-ui --f-mono
 * @globals   none
 * @db        none
 * @source    Adopt workbench, 2026-11-15 | docs/adopt.md | the inspector view
 * @changed   a click on a block nobody owns offers to assign it to a candidate (onAssign); the click no longer depends on the redraw succeeding; works on SVG elements; reports how a preview loaded.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const STYLE = '.kit-ai-hover{outline:2px solid #ff3b7a!important;outline-offset:-2px!important;cursor:crosshair!important}'
  + '.kit-ai-st-selected,.kit-ai-st-preview,.kit-ai-st-ready{outline:3px solid #1faa59!important;outline-offset:-3px!important}'
  + '.kit-ai-st-working{outline:3px dashed #e0a100!important;outline-offset:-3px!important;animation:kit-ai-pulse 1.1s ease-in-out infinite}'
  + '.kit-ai-st-discarded{opacity:.28!important;filter:grayscale(1)!important}'
  + '.kit-ai-focus{box-shadow:0 0 0 4px rgba(47,124,246,.75)!important}'
  + '@keyframes kit-ai-pulse{50%{outline-color:transparent}}'
  + '@media (prefers-reduced-motion:reduce){.kit-ai-st-working{animation:none}}';
const MARKS = /\bkit-ai-(?:st-\w+|focus|hover)\b/g, MARK1 = /^kit-ai-(?:st-\w+|focus|hover)$/;
/* classList, never className: on an SVG element className is a read-only SVGAnimatedString and assigning to it throws. */
const strip = n => { Array.prototype.slice.call(n.classList || []).filter(k => MARK1.test(k)).forEach(k => n.classList.remove(k)); };

function mount(root, opts) {
  const o = Object.assign({ src: '', candidates: [], selected: null, label: 'Live preview of the artifact' }, opts);
  let cands = o.candidates, sel = o.selected, idx = Kit.adopt.index(cands), on = false, hot = null, marked = [], dead = false, doc = null, mo = null, timer = 0, lastSnap = '', previews = {}, holdUnowned = null;
  root.classList.add('kit-ai'); root.replaceChildren();
  const bar = el('div', 'kit-ai-bar'), tog = el('button', 'kit-ai-btn', 'Pick an element'), rl = el('button', 'kit-ai-btn', 'Reload'), say = el('span', 'kit-ai-say', 'Loading the artifact.');
  tog.type = 'button'; rl.type = 'button'; tog.setAttribute('aria-pressed', 'false'); say.setAttribute('role', 'status'); bar.append(tog, rl, say);
  const snapBox = el('div', 'kit-ai-snap'), snapHead = el('p', 'kit-ai-snap-h'), snapBody = el('div', 'kit-ai-snap-b'); snapBox.append(snapHead, snapBody); snapBox.hidden = true;
  const frame = document.createElement('iframe'); frame.className = 'kit-ai-frame'; frame.title = o.label; frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
  root.append(bar, snapBox, frame);

  const by = id => cands.find(c => c.id === id) || null;
  const clear = () => { if (hot) hot.classList.remove('kit-ai-hover'); hot = null; };
  const unmark = () => { marked.forEach(strip); marked = []; };
  const esc = k => (window.CSS && CSS.escape ? CSS.escape(k) : k);
  const selectorOf = c => (c.classes || []).slice(0, 150).map(k => '.' + esc(k)).concat((c.ids || []).map(i => '#' + esc(i))).join(',');
  const find = c => { const q = selectorOf(c); if (!q || !doc) return []; try { return Array.prototype.slice.call(doc.querySelectorAll(q), 0, 400); } catch (e) { return []; } };      // a class that is not a valid selector gives none
  const add = (e, cls) => { e.classList.add(cls); if (marked.indexOf(e) < 0) marked.push(e); };

  function paint() {
    unmark(); if (!doc) return;
    cands.forEach(c => { if (c.state === 'detected' && c.id !== sel) return; find(c).forEach(e => { if (c.state !== 'detected') add(e, 'kit-ai-st-' + c.state); if (c.id === sel) add(e, 'kit-ai-focus'); }); });
    const c = by(sel);
    if (c) { const n = find(c).length; say.textContent = c.name + ': ' + (n ? n + ' element' + (n === 1 ? '' : 's') + ' outlined in this view.' : (c.classes || c.ids || []).length ? 'not on screen in this view.' : 'draws nothing of its own.'); }
  }

  /* The button under a message: asks the page to have a preview page built for this candidate. */
  const askBuild = c => {
    if (!o.onBuild) return null;
    const b = el('button', 'kit-ai-btn primary', 'Ask Claude to build a preview'); b.type = 'button';
    b.addEventListener('click', () => { b.disabled = true; Promise.resolve(o.onBuild(c.id)).then(() => { b.textContent = 'Asked. The preview appears here when Claude has written it.'; }, e => { b.disabled = false; b.textContent = 'Could not send (' + ((e && e.message) || 'try again') + '). Ask again'; }); });
    return b;
  };
  function snapshot() {
    if (holdUnowned) return;      // the "nobody owns this" panel stays until a candidate is selected
    const c = by(sel); snapBox.hidden = !c; if (!c) return;
    snapHead.textContent = 'Component: ' + c.name + (c.suggested_id ? ' (would become ' + c.suggested_id + ')' : '');
    const pv = previews[c.id];
    if (pv) {      // a preview page built for this candidate: it runs the artifact's own files with sample data, whatever the frame below shows
      if (lastSnap === 'pv:' + pv) return; lastSnap = 'pv:' + pv;
      const f = document.createElement('iframe'); f.className = 'kit-ai-pv-frame'; f.title = 'Preview of ' + c.name; f.setAttribute('sandbox', 'allow-scripts allow-same-origin'); f.srcdoc = pv;
      const again = askBuild(c); if (again) again.textContent = 'Ask Claude to change this preview';
      const said = 'A preview page built for this component. It runs the artifact\'s own files, so it shows the real code.', cap = el('p', 'kit-ai-snap-c', 'Loading the preview.'); cap.setAttribute('role', 'status');
      /* A blank preview must not look like a working one: once the page has loaded, say what it reported (it keeps script errors in window.__pvErrors) or that it drew nothing. */
      f.addEventListener('load', () => setTimeout(() => {
        if (dead || previews[c.id] !== pv) return;
        let report;
        try {
          const d = f.contentDocument, errs = (f.contentWindow && f.contentWindow.__pvErrors) || [], blank = !d || !d.body || !d.body.children.length;
          cap.textContent = errs.length ? 'The preview reported a problem: ' + errs.slice(0, 3).join(' · ') : blank ? 'The preview page loaded but drew nothing.' : said; cap.dataset.tone = errs.length || blank ? 'warn' : '';
          report = { id: c.id, status: errs.length ? 'error' : blank ? 'blank' : 'ok', errors: errs.slice(0, 3).map(x => String(x).slice(0, 200)), children: d && d.body ? d.body.children.length : -1, text: d && d.body ? d.body.textContent.trim().length : -1, html: pv.length };
        } catch (e) { cap.textContent = 'The preview frame cannot be read here (' + ((e && e.message) || 'blocked') + ').'; cap.dataset.tone = 'warn'; report = { id: c.id, status: 'unreadable', errors: [String((e && e.message) || 'blocked').slice(0, 200)], html: pv.length }; }
        if (o.onPreviewState) { try { o.onPreviewState(report); } catch (e) { /* the page's reporting must never break the preview */ } }
      }, 1500));
      snapBody.replaceChildren(f, cap, ...(again ? [again] : [])); return;
    }
    const draws = (c.classes || []).length || (c.ids || []).length, els = doc && draws ? find(c) : [];
    const top = els.filter(e => { for (let p = e.parentElement; p; p = p.parentElement) if (els.indexOf(p) >= 0) return false; return true; })
      .map(e => ({ e, r: e.getBoundingClientRect() })).filter(x => x.r.width > 8 && x.r.height > 8).sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height);
    if (!top.length) {
      const m = !draws ? 'No visual: ' + c.name + ' draws nothing of its own' + ((c.provides || []).length ? '; it provides ' + c.provides.join(', ') + '.' : '.')
        : 'Not on screen in the preview right now. Open the part of the artifact that shows it; this picture follows.';
      if (lastSnap !== m) { lastSnap = m; const b = askBuild(c); snapBody.replaceChildren(el('p', 'kit-ai-none', m), ...(b ? [b] : [])); } return;
    }
    const pick = top[0], r = pick.r, w = Math.ceil(r.width), h = Math.ceil(r.height), clone = pick.e.cloneNode(true);
    [clone].concat(Array.prototype.slice.call(clone.querySelectorAll('[class*="kit-ai-"]'))).forEach(strip);
    const heads = Array.prototype.map.call(doc.querySelectorAll('link[rel="stylesheet"],style:not([data-kit-ai])'), n => (n.tagName === 'LINK' ? '<link rel="stylesheet" href="' + n.href.replace(/"/g, '&quot;') + '">' : n.outerHTML)).join('');
    const theme = doc.documentElement.getAttribute('data-theme');
    const src = '<!doctype html><html' + (theme ? ' data-theme="' + theme.replace(/"/g, '') + '"' : '') + '><head><meta charset="utf-8">' + heads + '<style>html,body{margin:0;background:transparent}body{padding:12px;overflow:hidden}.kit-ai-snap-in{width:' + w + 'px}</style></head><body class="' + String(doc.body.className).replace(MARKS, '').replace(/"/g, '') + '"><div class="kit-ai-snap-in">' + clone.outerHTML + '</div></body></html>';
    if (src === lastSnap) return; lastSnap = src;
    const room = Math.max(200, snapBody.clientWidth || root.clientWidth || 600), s = Math.min(1, room / (w + 24)), boxH = Math.min(360, Math.ceil((h + 24) * s));
    const wrap = el('div', 'kit-ai-snap-wrap'); wrap.style.height = boxH + 'px';
    const f = document.createElement('iframe'); f.className = 'kit-ai-snap-frame'; f.title = 'Picture of ' + c.name; f.setAttribute('sandbox', 'allow-same-origin');      // no scripts: a still picture
    f.style.cssText = 'width:' + (w + 24) + 'px;height:' + (h + 24) + 'px;transform:scale(' + s + ');transform-origin:0 0'; f.srcdoc = src;
    wrap.append(f);
    const cap = el('p', 'kit-ai-snap-c', (top.length > 1 || els.length > 1 ? els.length + ' elements; showing the largest. ' : '') + 'A still picture of it as it is on screen now (' + w + ' × ' + h + ' px' + (s < 1 ? ', scaled to ' + Math.round(s * 100) + '%' : '') + ').');
    const build = askBuild(c); snapBody.replaceChildren(wrap, cap, ...(build ? [build] : []));      // a picture of what is on screen is not a preview page: the button is always there
  }

  /* The outline and the picture are separate jobs: one failing must not stop the other, and neither may throw into the page that called select(). */
  function refresh() {
    if (dead) return;
    try { paint(); } catch (e) { say.textContent = 'Could not outline the elements: ' + ((e && e.message) || e); }
    try { snapshot(); } catch (e) { snapBody.replaceChildren(el('p', 'kit-ai-none', 'Could not draw the picture: ' + ((e && e.message) || e))); }
  }
  const later = () => { clearTimeout(timer); timer = setTimeout(refresh, 350); };
  const over = e => {
    if (!on) return; clear(); hot = e.target; hot.classList.add('kit-ai-hover');
    const w = Kit.adopt.ownerOf(hot, idx); say.textContent = '<' + hot.tagName.toLowerCase() + '> ' + (w.id ? '→ ' + w.id + ' (' + w.via + ' ' + w.value + ')' : '→ no candidate owns this');
  };
  /* The nearest element at or above el that has a class (other than our marks) or an id: what a person means by "this block", and what can be assigned to a candidate. */
  const anchorOf = el => {
    for (let e = el; e && e.nodeType === 1 && e.tagName !== 'BODY' && e.tagName !== 'HTML'; e = e.parentElement) {
      const cl = Array.prototype.slice.call(e.classList || []).filter(k => !MARK1.test(k));
      if (cl.length || e.id) return { el: e, classes: cl, ids: e.id ? [e.id] : [], label: e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + cl.slice(0, 3).map(k => '.' + k).join('') };
    }
    return { el, classes: [], ids: [], label: el && el.tagName ? el.tagName.toLowerCase() : 'element' };
  };
  /* Nobody owns the block that was clicked (its classes come from a stylesheet the whole artifact shares, or the analysis missed it): say so, and let the person give it to a candidate. */
  function showUnowned(a) {
    snapBox.hidden = false; lastSnap = 'unowned:' + a.label; holdUnowned = a.label; snapHead.textContent = 'Nobody owns ' + a.label;
    const none = !a.classes.length && !a.ids.length, p = el('p', 'kit-ai-none', none ? 'This element has no class or id to match on, so it cannot be assigned. Click a block inside or around it.' : 'No candidate claims ' + a.classes.concat(a.ids.map(i => '#' + i)).slice(0, 6).join(' ') + '. Give it to one, and clicking it will select that candidate from now on.');
    if (none || !o.onAssign) { snapBody.replaceChildren(p); return; }
    const row = el('div', 'kit-ai-assign'), sel1 = document.createElement('select'), go = el('button', 'kit-ai-btn primary', 'Assign'), said = el('p', 'kit-ai-snap-c'); said.setAttribute('role', 'status');
    sel1.setAttribute('aria-label', 'Candidate to give it to'); cands.forEach(c => { const op = document.createElement('option'); op.value = c.id; op.textContent = c.name; sel1.append(op); }); if (sel) sel1.value = sel;
    go.type = 'button'; go.addEventListener('click', () => { go.disabled = true; Promise.resolve(o.onAssign({ id: sel1.value, classes: a.classes, ids: a.ids })).then(() => { said.textContent = 'Assigned to ' + sel1.value + '. Clicking it now selects that candidate.'; }, e => { go.disabled = false; said.textContent = 'Could not assign (' + ((e && e.message) || 'try again') + ').'; }); });
    row.append(sel1, go); snapBody.replaceChildren(p, row, said);
  }
  const click = e => {
    if (!on) return; e.preventDefault(); e.stopPropagation();
    const t = e.target, w = Kit.adopt.ownerOf(t, idx), a = anchorOf(t);
    toggle(false);      // first, so a failure below can never leave the picker stuck on
    if (!w.id) showUnowned(a);
    try { if (o.onPick) o.onPick(Object.assign({ tag: t.tagName ? t.tagName.toLowerCase() : '', classes: a.classes, ids: a.ids, label: a.label }, w)); } catch (err) { say.textContent = 'Could not select it: ' + ((err && err.message) || err); }
  };
  const key = e => { if (e.key === 'Escape' && on) toggle(false); };
  function toggle(v) { on = v; tog.setAttribute('aria-pressed', String(on)); root.toggleAttribute('data-picking', on); if (!on) { clear(); refresh(); } else say.textContent = 'Hover the artifact, click to select.'; }
  function attach() {
    if (mo) { mo.disconnect(); mo = null; } marked = []; lastSnap = '';
    try { doc = frame.contentDocument; } catch (e) { doc = null; }
    if (!doc || !doc.body) { say.textContent = 'The artifact cannot be read here: it must be served from this page\'s own files.'; tog.disabled = true; return; }
    tog.disabled = false;
    if (!doc.querySelector('style[data-kit-ai]')) { const st = doc.createElement('style'); st.setAttribute('data-kit-ai', ''); st.textContent = STYLE; doc.head.append(st); }
    doc.addEventListener('mouseover', over, true); doc.addEventListener('click', click, true); doc.addEventListener('keydown', key, true);
    if (window.MutationObserver) { mo = new MutationObserver(later); mo.observe(doc.body, { childList: true, subtree: true }); }      // the artifact drew another view
    say.textContent = 'Ready. Press Pick an element.'; later();
  }
  tog.addEventListener('click', () => toggle(!on)); rl.addEventListener('click', () => { marked = []; frame.src = o.src; });
  frame.addEventListener('load', attach); document.addEventListener('keydown', key);
  frame.src = o.src;
  return {
    setCandidates(l) { cands = l || []; idx = Kit.adopt.index(cands); lastSnap = ''; later(); },
    select(id) { sel = id; lastSnap = ''; holdUnowned = null; refresh(); },
    setPreview(id, html) { if (html) previews[id] = String(html); else delete previews[id]; if (id === sel) { lastSnap = ''; try { snapshot(); } catch (e) { say.textContent = 'Could not show the preview: ' + ((e && e.message) || e); } } },
    inspect(v) { if (!tog.disabled) toggle(!!v); },
    refresh,
    reload() { rl.click(); },
    destroy() { dead = true; clearTimeout(timer); if (mo) mo.disconnect(); document.removeEventListener('keydown', key); root.replaceChildren(); root.classList.remove('kit-ai'); },
  };
}

Kit.adoptInspector = { mount };
})();
/* /part:page.script.kit.adopt-inspector */

/* part:page.script.kit.mermaid */
/* Kit component: themed Mermaid (Kit.mermaid)    kit version 0.1.0
   What it is: Mermaid diagrams drawn in the page's own tokens, redrawn when the theme changes, in a frame with a caption, a legend and a sideways scroll.
   Why its own class: the artifact platform draws every pre.mermaid itself, in its own two palettes. This file leaves those alone and draws .kit-mmd blocks,
   passing the theme as a per-diagram init directive, so it never changes the platform's Mermaid settings and the two can share a page.
   It uses the page's window.mermaid when one is loaded (the platform's), and otherwise loads mermaid 11.4.1 from cdn.jsdelivr.net, once, on first use.
   Markup:
     <figure class="kit-mmd-frame">
       <figcaption class="kit-mmd-cap"><b>Release flow</b><span>left to right</span></figcaption>
       <div class="kit-mmd-scroll"><pre class="kit-mmd" data-label="Release flow" style="--kit-mmd-min: 640px">flowchart LR …</pre></div>
       <p class="kit-legend"><span style="--c: var(--ok)">shipped</span> …</p>
     </figure>
     The source is the block's text, or data-src="#id" naming a <script type="text/plain" id="id">.
     In the source, %name% is the colour of token --name and %name/18% that colour at 18% over --panel, e.g.  classDef done fill:%ok/18%,stroke:%ok%
   API (small and stable):
     Kit.mermaid.mount(root = document, {selector, watch, src}) -> {render(), destroy()}
       selector  default ".kit-mmd"
       watch     extra elements whose data-theme, class or style changes mean a redraw (the root element and the OS setting are always watched)
       src       the mermaid script URL to load when the page has none (default the pinned jsDelivr build)
     Kit.mermaid.palette(el) -> {name: "#rrggbb"}   the themeVariables it passes, resolved in el's context (tokens can differ per pane)
   A diagram that fails to draw shows its source and the reason, never a blank.
   Needs from the board:
     css     kit/mermaid.css; custom properties --panel --sunk --bg --ink --ink-2 --rule --accent --accent-ink --accent-soft --f-ui --f-mono, optional --seam
     globals window.mermaid (optional; loaded from the CDN when absent)
   db collections: none.
   Lifted from: diagrams themed from page tokens (the hex resolver and %token% placeholders), the platform's theme-aware Mermaid runtime (redraw on theme change),
   and three documents' diagram frames (caption, legend swatches, a scroll frame with a minimum width). */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const SRC = 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js';
let loading = null, seq = 0;
function load(src) {
  if (window.mermaid) return Promise.resolve(window.mermaid);
  return loading || (loading = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src || SRC; s.async = true;
    s.onload = () => { if (!window.mermaid) return rej(new Error('mermaid did not load')); try { window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' }); } catch (_) {} res(window.mermaid); };
    s.onerror = () => { loading = null; rej(new Error('mermaid could not be loaded from ' + (src || SRC))); };
    document.head.append(s);
  }));
}
let cv = null;
function hexIn(ctx, css) {
  const p = document.createElement('i'); p.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden;color:' + css;
  ctx.append(p); const c = getComputedStyle(p).color; p.remove();
  cv = cv || document.createElement('canvas'); cv.width = cv.height = 1;
  const x = cv.getContext('2d', { willReadFrequently: true }); x.clearRect(0, 0, 1, 1); x.fillStyle = '#000'; x.fillStyle = c; x.fillRect(0, 0, 1, 1);
  const d = x.getImageData(0, 0, 1, 1).data; return '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('');
}
const has = (el, name) => !!getComputedStyle(el).getPropertyValue(name).trim();
const mix = (a, p, b) => 'color-mix(in srgb, ' + a + ' ' + p + '%, ' + b + ')';
function palette(el) {
  const seam = has(el, '--seam') ? 'var(--seam)' : 'var(--accent)';
  const T = {
    background: 'var(--panel)', mainBkg: 'var(--sunk)', primaryColor: 'var(--sunk)', primaryTextColor: 'var(--ink)', primaryBorderColor: mix('var(--ink-2)', 55, 'var(--panel)'),
    nodeBorder: mix('var(--ink-2)', 55, 'var(--panel)'), secondaryColor: 'var(--accent-soft)', tertiaryColor: 'var(--bg)', lineColor: 'var(--ink-2)', textColor: 'var(--ink)',
    titleColor: 'var(--ink)', clusterBkg: mix('var(--bg)', 55, 'var(--panel)'), clusterBorder: 'var(--rule)', edgeLabelBackground: 'var(--panel)',
    noteBkgColor: mix(seam, 16, 'var(--panel)'), noteBorderColor: seam, noteTextColor: 'var(--ink)',
    actorBkg: 'var(--accent)', actorTextColor: 'var(--accent-ink)', actorBorder: 'var(--accent)', actorLineColor: mix('var(--ink-2)', 60, 'var(--panel)'),
    signalColor: 'var(--ink)', signalTextColor: 'var(--ink)', labelBoxBkgColor: 'var(--sunk)', labelBoxBorderColor: 'var(--rule)', labelTextColor: 'var(--ink)',
    loopTextColor: 'var(--ink)', sequenceNumberColor: 'var(--accent-ink)', activationBkgColor: 'var(--accent-soft)', activationBorderColor: 'var(--accent)',
  };
  const out = {}; for (const k in T) out[k] = hexIn(el, T[k]);
  return out;
}
function lum(hex) { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4)); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; }
const SAFE = /^[\d "#%(),.;A-Za-z]+$/;
function fontOf(el) {
  const fam = (getComputedStyle(el).getPropertyValue('--f-ui').trim() || getComputedStyle(el).fontFamily || '').split(',').map(s => s.trim()).filter(f => f && SAFE.test(f));
  return fam.length ? fam.join(', ') : 'Arial';
}
function fill(el, src) {
  return src.replace(/%([a-z][a-z0-9-]*)(?:\/(\d{1,3}))?%/g, (m, name, pct) => {
    if (!has(el, '--' + name)) return m;
    return hexIn(el, pct ? mix('var(--' + name + ')', Math.min(100, +pct), 'var(--panel)') : 'var(--' + name + ')');
  });
}
function mount(root, opts) {
  const r = root || document;
  const o = Object.assign({ selector: '.kit-mmd', watch: [], src: SRC }, opts);
  const SOURCE = new WeakMap(); let gen = 0, timer = 0, lastKey = new WeakMap();
  const blocks = () => [...r.querySelectorAll(o.selector)];
  function sourceOf(el) {
    if (el.dataset.src) { const s = document.querySelector(el.dataset.src); return s ? s.textContent : ''; }
    if (!SOURCE.has(el)) SOURCE.set(el, el.textContent);
    return SOURCE.get(el);
  }
  function fail(el, src, err) {
    el.dataset.state = 'error'; el.removeAttribute('aria-busy');
    const box = document.createElement('div'); box.className = 'kit-mmd-fallback';
    const p = document.createElement('p'); p.textContent = 'This diagram could not be drawn (' + String((err && (err.message || err.str)) || err || 'unknown error').split('\n')[0].slice(0, 160) + '). Its source:';
    const pre = document.createElement('pre'); pre.tabIndex = 0; pre.textContent = src.trim();
    box.append(p, pre); el.replaceChildren(box);
  }
  async function render(force) {
    const my = ++gen; const list = blocks(); if (!list.length) return;
    list.forEach(el => { sourceOf(el); if (!el.dataset.state) { el.dataset.state = 'loading'; el.setAttribute('aria-busy', 'true'); el.replaceChildren(); } });
    let m; try { m = await load(o.src); } catch (e) { list.forEach(el => fail(el, sourceOf(el), e)); return; }
    for (const el of list) {
      if (my !== gen) return;
      const P = palette(el); const key = JSON.stringify(P);
      if (!force && lastKey.get(el) === key && el.dataset.state === 'done') continue;
      const dark = lum(P.background) < .3;
      const init = { theme: 'base', themeVariables: Object.assign({ darkMode: dark, fontFamily: fontOf(el), fontSize: '15px' }, P),
        flowchart: { curve: 'basis', padding: 12, nodeSpacing: 36, rankSpacing: 46, htmlLabels: true }, sequence: { mirrorActors: false, actorMargin: 56, messageMargin: 32 } };
      const raw = sourceOf(el); const text = '%%{init: ' + JSON.stringify(init) + '}%%\n' + fill(el, raw).trim();
      const id = 'kit-mmd-' + (++seq);
      try {
        const out = await m.render(id, text);
        if (my !== gen) return;
        el.innerHTML = out.svg; el.dataset.state = 'done'; el.removeAttribute('aria-busy'); lastKey.set(el, key);
        const svg = el.querySelector('svg'); const cap = el.closest('.kit-mmd-frame'); const capB = cap && cap.querySelector('.kit-mmd-cap b');
        const lab = el.dataset.label || (capB ? capB.textContent : '');
        if (svg) { svg.setAttribute('role', 'img'); if (lab) svg.setAttribute('aria-label', lab); }
      } catch (e) {
        ['d' + id, id].forEach(x => { const s = document.getElementById(x); if (s && !el.contains(s)) s.remove(); });
        if (my === gen) fail(el, raw, e);
      }
    }
  }
  const later = () => { clearTimeout(timer); timer = setTimeout(() => render(false), 60); };
  const mo = new MutationObserver(later);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  (o.watch || []).forEach(w => w && mo.observe(w, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] }));
  const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  if (mq && mq.addEventListener) mq.addEventListener('change', later);
  render(true);
  return { render: () => render(true), destroy() { gen++; clearTimeout(timer); mo.disconnect(); if (mq && mq.removeEventListener) mq.removeEventListener('change', later); } };
}
Kit.mermaid = Object.freeze({ mount, palette, load });
})();
/* /part:page.script.kit.mermaid */

/* part:page.script.kit.skins */
/**
 * Skin switch
 * Kit.skins.init({skins, skin, mode}) sets data-skin and data-theme on the page the moment it runs (put it in the head before the stylesheets and nothing flashes), keeps the choice in localStorage (every access guarded), follows the storage event so a second tab changes with the first, and dispatches a kit:skin event on the document with {skin, mode, resolved, source}. A skin is a stylesheet (a link that is switched off unless chosen) or a set of tokens, light and dark. System is a mode of its own, so the viewer's setting decides until they choose. handle.render(el) draws a skin row (hidden while only one skin is registered) and a light, dark or system row. handle.pairViews(board, map) ties a skin to the view registry: when the skin changes, each listed block is switched to its view. Kit.theme in layout.topbar still switches one look; this is a new file beside it.
 *
 * What it is: several whole-page looks (skins) in one page, and a light, dark or system choice that is separate from the skin. The choice is applied the moment the script runs, so put it in the head
 * before the stylesheets and nothing flashes; it is kept for this viewer (localStorage, every access guarded), followed by the page's other tabs (the storage event), and announced to the page with a
 * "kit:skin" event. A skin is a stylesheet (a link that is switched off unless chosen) or a set of tokens (light and dark maps, written into one scoped style element); either works with the kit's
 * own theme files, which scope their tokens on :root and [data-theme]. The selector it draws hides the skin row while only one skin is registered.
 * Attributes: data-skin="<name>" on the target, and data-theme="light" | "dark" (absent for system, so prefers-color-scheme decides, as the kit's themes expect).
 * API:
 *   Kit.skins.init({skins, skin, mode, modes, key, target, persist}) -> handle      call once, as early as you can
 *     skins    [{name, label, href, tokens: {light, dark}, json, fonts}]   href: a stylesheet file; tokens: {"--name": "value"} maps (the shape Kit.tokens.themeCss takes); json: a theme json file
 *              (kit/themes/<name>.json) fetched once, its light and dark maps used as tokens (the skin applies when it arrives; give href or tokens instead where a flash matters).
 *              A skin with none of the three sets data-skin and nothing else: the page's own look.
 *              fonts: the web-font stylesheet url the skin's --f-* families need (a theme json's "fonts"), linked once when the skin is chosen; a json skin uses its json's fonts
 *     skin     the default skin name (default the first)       mode  the default mode: "system" (default) | "light" | "dark"       modes  the offered modes (default all three);
 *              modes: [] when the page keeps light and dark itself: the kit then never writes data-theme, and resolved() reads it
 *     key      storage prefix (default "kit-skins"; the keys are <key>:skin and <key>:mode)       persist  false keeps the choice in memory only
 *     target   the element that carries the attributes (default the document element). A target that is not the document element gets its own scoped tokens and a link-free skin, for a framed preview.
 *   handle   {skin(), mode(), resolved(), set(name), setMode(mode), list(), render(el), on(fn) -> off, pairViews(board, map) -> off, destroy()}
 *     render(el)    draws the skin row and the mode row as two groups of buttons (aria-pressed) into el; they follow the choice from anywhere
 *     on(fn)        fn({skin, mode, resolved, source}) after every change; source is "set", "storage" or "init". The same detail goes with the "kit:skin" event on the document.
 *     pairViews     board is what Kit.views.mount returns (kit/view-registry.js); map is {skinName: {blockId: viewName}}. When the skin changes each listed block is switched to its view
 *                   (board.choose), so a skin can bring its own view of the data. Blocks that do not offer the view are left alone.
 * requires layout.topbar (Kit.theme is the sibling for one look; not called), kit.tokens, kit.view-registry (only for pairViews)
 * Also provides (not globals): the kit:skin event, a CustomEvent on the document; and render and pairViews, methods of the handle init returns.
 *
 * @id        kit.skins
 * @kind      component
 * @group     Board kit
 * @status    new
 * @version   0.1.2
 * @updated   2026-11-14
 * @summary   An upgrade of layout.topbar: several whole-page skins in one page, applied before first paint, kept per viewer, followed across tabs and announced by an event; light and dark are separate from the skin.
 * @tags      skin, theme switch, dark mode, no flash, storage event, persist, light dark system, selector, view registry
 * @requires  layout.topbar, kit.tokens, kit.view-registry
 * @files     kit/skins.css, kit/samples/kit.json
 * @provides  Kit.skins.init, Kit.skins.modes
 * @extends   layout.topbar
 * @config    Kit.skins.init(opts) | skins [{name, label, href | tokens {light, dark} | json, fonts}], skin, mode system | light | dark, modes, key, target, persist; returns {skin, mode, resolved, set, setMode, list, render, on, pairViews, destroy}
 * @config    kit:skin | a CustomEvent on the document, detail {skin, mode, resolved, source}
 * @config    theme css | skin stylesheets that scope their tokens on :root and [data-theme] work as they are (one link is enabled); token maps are scoped by the file
 * @tokens    --sunk --ink --ink-2 --rule --accent --accent-ink --f-ui --seam?
 * @globals   none
 * @db        none
 * @source    Catalog harvest, 2026-10-25 | a network-ops console's skin engine | attributes set at once, one skin link left enabled, light and dark apart from the skin, the storage event, the change event, the selector
 * @preview   {"render": "kit.skins", "samples": ["kit/samples/kit.json#skins"], "uses": ["kit.view-registry"]}
 * @samples   skins
 * @changed   A skin links its web fonts when chosen: fonts on the skin, or the fonts url of its theme json.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const MODES = ['system', 'light', 'dark'];
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
let scopeSeq = 0;

function init(opts) {
  const o = Object.assign({ mode: 'system', modes: MODES, key: 'kit-skins', persist: true, target: document.documentElement }, opts);
  const skins = (o.skins || []).filter(s => s && s.name); const root = o.target, isRoot = root === document.documentElement;
  const modes = o.modes.filter(m => MODES.includes(m));
  const K_SKIN = o.key + ':skin', K_MODE = o.key + ':mode';
  const read = k => { if (!o.persist) return null; try { return localStorage.getItem(k); } catch (_) { return null; } };
  const write = (k, v) => { if (!o.persist) return; try { localStorage.setItem(k, v); } catch (_) {} };
  const known = n => skins.some(s => s.name === n);
  let skin = known(read(K_SKIN)) ? read(K_SKIN) : (known(o.skin) ? o.skin : (skins[0] && skins[0].name) || null);
  let mode = modes.includes(read(K_MODE)) ? read(K_MODE) : (modes.includes(o.mode) ? o.mode : modes[0] || 'system');
  const subs = new Set(), links = new Map(); let styleEl = null, mq = null;
  const scope = isRoot ? ':root' : '[data-skin-scope="' + (root.dataset.skinScope = root.dataset.skinScope || 'ks' + (++scopeSeq)) + '"]';
  const map = (m) => Object.entries(m || {}).map(([k, v]) => k + ': ' + v + ';').join(' ');
  function css() {
    const out = [];
    skins.forEach(s => {
      const t = s.tokens || (s._json && { light: s._json.light, dark: s._json.dark }); if (!t) return; const sel = scope + '[data-skin="' + s.name + '"]';
      out.push(sel + ' { color-scheme: light; ' + map(t.light) + ' }');
      out.push('@media (prefers-color-scheme: dark) { ' + sel + ':not([data-theme="light"]) { color-scheme: dark; ' + map(t.dark) + ' } }');
      out.push(sel + '[data-theme="dark"] { color-scheme: dark; ' + map(t.dark) + ' }');
    });
    return out.join('\n');
  }
  function sheet() { if (!styleEl) { styleEl = el('style'); styleEl.dataset.kitSkins = o.key; (document.head || document.documentElement).append(styleEl); } styleEl.textContent = css(); }
  function linkFor(s) {
    if (!isRoot || !s.href) return;
    let l = links.get(s.name) || document.querySelector('link[data-skin="' + s.name + '"]');
    if (!l) { l = document.createElement('link'); l.rel = 'stylesheet'; l.href = s.href; l.dataset.skin = s.name; l.dataset.kitSkinsMade = ''; (document.head || document.documentElement).append(l); }
    links.set(s.name, l);
  }
  function fonts(s) {       // the chosen skin's web fonts, linked once: without them its --f-* families fall back to system fonts
    const u = s && (s.fonts || (s._json && s._json.fonts)); if (!u) return;
    if ([...document.querySelectorAll('link[rel="stylesheet"]')].some(l => l.getAttribute('href') === u)) return;
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = u; l.dataset.kitSkinsFonts = ''; (document.head || document.documentElement).append(l);
  }
  const resolved = () => { const m = modes.length ? mode : root.getAttribute('data-theme') || 'system'; return m === 'system' ? (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : m; };
  function apply() {
    if (skin) root.setAttribute('data-skin', skin);
    if (modes.length) { if (mode === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', mode); }      // modes: [] leaves data-theme to the page
    links.forEach((l, n) => { l.disabled = n !== skin; });
    fonts(skins.find(s => s.name === skin));
  }
  const detail = source => ({ skin, mode, resolved: resolved(), source });
  function announce(source) { const d = detail(source); subs.forEach(f => { try { f(d); } catch (_) {} }); document.dispatchEvent(new CustomEvent('kit:skin', { detail: d })); }
  skins.forEach(linkFor); sheet(); apply();
  skins.filter(s => s.json && !s.tokens).forEach(s => { fetch(s.json).then(r => r.ok ? r.json() : null).then(j => { if (j && j.light) { s._json = j; sheet(); if (s.name === skin) fonts(s); } }).catch(() => {}); });
  const onScheme = () => { if (mode === 'system') announce('system'); };
  if (window.matchMedia) { try { mq = matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener('change', onScheme); } catch (_) {} }
  const onStorage = e => {
    if (e.key === K_SKIN && known(e.newValue) && e.newValue !== skin) { skin = e.newValue; apply(); announce('storage'); }
    if (e.key === K_MODE && modes.includes(e.newValue) && e.newValue !== mode) { mode = e.newValue; apply(); announce('storage'); }
  };
  window.addEventListener('storage', onStorage);
  const h = {
    skin: () => skin, mode: () => mode, resolved, list: () => skins.map(s => ({ name: s.name, label: s.label || s.name })),
    set(n) { if (!known(n) || n === skin) return skin; skin = n; write(K_SKIN, n); apply(); announce('set'); return skin; },
    setMode(m) { if (!modes.includes(m) || m === mode) return mode; mode = m; write(K_MODE, m); apply(); announce('set'); return mode; },
    on(fn) { subs.add(fn); return () => subs.delete(fn); },
    render(box) {
      if (!box) return; box.replaceChildren(); const wrap = el('div', 'kit-sk'); box.append(wrap);
      const group = (label, items, cur, pick) => {
        const g = el('div', 'kit-sk-seg'); g.setAttribute('role', 'group'); g.setAttribute('aria-label', label);
        items.forEach(it => { const b = el('button', null, it.label); b.type = 'button'; b.dataset.value = it.name; b.setAttribute('aria-pressed', String(it.name === cur())); b.addEventListener('click', () => pick(it.name)); g.append(b); });
        const sync = () => g.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === cur())));
        return { g, sync };
      };
      const sk = group('Skin', h.list().map(s => ({ name: s.name, label: s.label })), () => skin, h.set); sk.g.hidden = skins.length < 2;
      const names = { system: 'System', light: 'Light', dark: 'Dark' };
      const md = group('Light or dark', modes.map(m => ({ name: m, label: names[m] })), () => mode, h.setMode); md.g.hidden = modes.length < 2;
      wrap.append(sk.g, md.g);
      const off = h.on(() => { if (!wrap.isConnected) return off(); sk.sync(); md.sync(); });
    },
    pairViews(board, byskin) {
      const go = s => { const m = byskin && byskin[s]; if (!m || !board || typeof board.choose !== 'function') return; Object.keys(m).forEach(id => { try { board.choose(id, m[id]); } catch (_) {} }); };
      go(skin); return h.on(d => go(d.skin));
    },
    destroy() { window.removeEventListener('storage', onStorage); if (mq) { try { mq.removeEventListener('change', onScheme); } catch (_) {} } subs.clear(); if (styleEl) styleEl.remove(); links.forEach(l => { if (l.dataset.skin && l.dataset.kitSkinsMade) l.remove(); }); root.removeAttribute('data-skin'); },
  };
  return h;
}
Kit.skins = Object.freeze({ init, modes: MODES.slice() });
})();
/* /part:page.script.kit.skins */

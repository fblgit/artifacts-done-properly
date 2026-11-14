/* part:page.script.kit.playground */
/**
 * Playground
 * Kit.playground.mount(root, {catalog, base, themes, entry}) opens with a head: a filter box and a select of every entry grouped by kind, then the chosen entry's name in the display face with its summary and what it loads first. It loads the entry's requires first (no entry twice), then its styles, then its scripts, fetches the first sample and calls the Kit.<name>.mount named in provides on an isolated stage. An entry with no mount says so. A stage bar holds the theme select (the first theme is chosen at the start; Page tokens uses the page's own tokens and mode, and turns the mode segments off) and mode (light, dark, auto) and width (390 px, 768 px, full) as segments of native radios. The stage sits on a dotted bench with its width, theme and mode written above it. Theme, mode and width change the stage only, never the page: the kit's theme css only applies on :root, so the stage copies the custom properties from the theme's json instead, light then dark. The sample has its own panel with its path: Apply re-reads it (a JSON error is shown with its line and column, never thrown) and uses update(data) on the mounted instance when it has one, else mounts again; Reset sample puts the published one back. An error thrown by a mount is shown in a line, not thrown. When the page's playground.enabled switch is off, or enabled is false, it renders one line that says how to turn it on and nothing else. It writes nothing. The layout follows its container: the sample panel sits beside the bench from about 62rem and under it below that; at 390 px the controls stack and the stage scrolls inside its own frame. Every control is a labelled select, input, radio, textarea or button, reached by Tab in reading order.
 *
 * What it is: try any catalog entry live on a page. A picker (a select grouped by kind, with a filter box) chooses the entry; the component loads its requires first (depth-first, no entry twice),
 * then styles, then scripts, fetches the entry's first sample and mounts it on an isolated stage by calling the Kit.<name>.mount found in the entry's provides. The sample is an editable textarea:
 * Apply re-reads it (a JSON error is shown with its position, never thrown) and calls update(data) on the mounted instance when it has one, else (or when update throws) destroys and mounts again; Reset sample puts the
 * published one back. Theme, mode (light, dark, auto) and width (390, 768, full) change the stage only, never the page. An entry with no mount says so. An error thrown by a mount is shown, not thrown.
 *
 * The theme is applied on the stage, not on :root: the kit's theme css only applies on :root, so the stage copies the custom properties from the theme's json (the css path with .json, light map then dark map
 * for dark mode), the way the catalog's previews do, and links the json's "fonts" url once so the theme's families load. The stage has its own data-theme and contain: content.
 *
 * Layout: a head (filter and entry picker, then the entry's name in the display face with its summary and what loads first), a stage bar (theme select, mode and width as segments of
 * native radios, so arrow keys move), the bench (the stage on a dotted ground, its width written above it) and the sample panel (beside the bench when there is room, under it when not:
 * the sample's path, the editor, Apply and Reset sample).
 *
 * API:
 *   Kit.playground.mount(root, opts) -> {open(id), update(next), destroy()}
 *     catalog   the entries list, or an object with entries [{id, name, kind, group, tags, files [{path, role}], requires, provides, preview {samples, uses}}]
 *     base      url prefix the files are fetched from (default '')       themes  [{id, name, css}] css relative to base; the first is selected at the start; "Page tokens" in the
 *               select is the page's own tokens, which keep the page's mode (the mode segments are off then)
 *     entry     the entry to open first                                  load    (url, kind) => Promise, kind "style" | "script" | "json"; default injects link/script once, cached by url
 *     enabled   false renders one line and nothing else; ADP.config.get('playground.enabled') === false does too (re-checked on change)       label  accessible name of the region
 *     mount     (entry, stage, data) -> {update, destroy} | null, tried first for every entry (a page's own preview of it); null falls back to the entry's Kit.<name>.mount
 * Methods of what Kit.playground.mount returns: open(id), update(next), destroy()
 *
 * @id        pattern.playground
 * @kind      component
 * @group     Patterns
 * @status    new
 * @version   0.1.1
 * @updated   2026-11-13
 * @summary   Try any catalog entry live on a page: pick it, edit its sample, switch the stage's theme, mode and width.
 * @tags      playground, try, preview, sample, theme, width, workbench, catalog, tools
 * @requires  kit.tokens, kit.dom
 * @files     kit/patterns/playground.css, kit/samples/playground.json
 * @provides  Kit.playground.mount
 * @config    Kit.playground.mount(root, opts) | catalog [entries] or {entries}, base url prefix (default ''), themes [{id, name, css}] with css relative to base, entry opened first, load(url, kind) optional loader, enabled, label; returns {open, update, destroy}
 * @config    catalog | the entries list the picker shows; each needs id, name, kind, files, requires, provides, preview.samples
 * @config    base | where the entries' files are fetched from
 * @config    themes | the stage themes; each needs kit/themes/<id>.json beside its css; the first is chosen at the start
 * @tokens    --bg --panel --sunk --ink --ink-2 --rule --accent --accent-ink --danger --f-ui --f-mono --ink-3? --seam? --f-display? --radius? --shadow?
 * @globals   none
 * @db        reads config/current, through ADP.config.get('playground.enabled'), only when the runtime exists
 * @source    Catalog batch 14, 2026-10-26 | the kit workbench template (parts/bench.js) | theme, mode and width on a stage, the sample fetch
 * @source    Catalog batch 14, 2026-10-26 | the catalog page's entry loader | requires first, styles then scripts, cached by path
 * @preview   {"render": "pattern.playground", "samples": ["kit/samples/playground.json"]}
 * @changed   The stage links the theme json's fonts url, and the sample names the real drafting-table and whiteboard theme files.
 * @changed   One component for the whole catalog; the workbench template is built for one entry.
 * @changed   The stage takes its theme from the theme json, so the page's own theme is untouched.
 */
(function () {
'use strict';
const Kit = window.Kit = window.Kit || { version: '0.1.0' };
const el = Kit.dom.el;
const cfg = () => window.ADP && window.ADP.config;
const cache = {};
function defaultLoad(url, kind) {
  if (cache[url]) return cache[url];
  const p = kind === 'json' ? fetch(url, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(url + ': HTTP ' + r.status); return r.json(); })
    : new Promise((res, rej) => {
      const n = kind === 'style' ? el('link') : el('script');
      if (kind === 'style') { n.rel = 'stylesheet'; n.href = url; } else { n.src = url; n.async = false; }
      n.onload = () => res(); n.onerror = () => rej(new Error('could not load ' + url)); document.head.append(n);
    });
  cache[url] = p; p.catch(() => { delete cache[url]; });
  return p;
}
const WIDTHS = [['390', '390 px'], ['768', '768 px'], ['0', 'Full']];
let pgSeq = 0;
const MODES = [['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto']];

function mount(root, opts) {
  let o = Object.assign({ catalog: [], base: '', themes: [], enabled: true, label: 'Playground' }, opts);
  let entries = [], inst = null, seq = 0, cur = null, orig = '', off = null, unsub = null;
  const st = { theme: null, mode: 'light', width: '390', filter: '' };
  const samples = {}, samplePath = {}, themeCache = {};
  const dark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const url = p => (o.base || '') + p;
  const get = (u, k) => (o.load || defaultLoad)(u, k);
  const byId = id => entries.find(e => e.id === id);
  const isOff = () => o.enabled === false || (cfg() && typeof cfg().get === 'function' && cfg().get('playground.enabled') === false);

  root.replaceChildren(); root.classList.add('kit-pg');
  const uidp = 'kit-pg-' + (++pgSeq);
  const box = el('section', 'kit-pg-box'); box.setAttribute('aria-label', o.label);
  const offLine = el('p', 'kit-pg-off', 'The playground is off for this page. An editor can turn it on in the settings (playground.enabled).');
  const field = (label, ctl, cls) => { const l = el('label', 'kit-pg-f' + (cls ? ' ' + cls : '')); l.append(el('span', 'kit-pg-fl', label), ctl); return l; };
  const segs = (name, label, items) => {
    const g = el('div', 'kit-pg-seg'); g.setAttribute('role', 'radiogroup'); const lid = uidp + '-' + name; g.setAttribute('aria-labelledby', lid);
    const radios = items.map(([v, t]) => { const l = el('label', 'kit-pg-opt'), r = el('input'); r.type = 'radio'; r.name = uidp + '-' + name; r.value = v; l.append(r, el('span', null, t)); g.append(l); return r; });
    const w = el('div', 'kit-pg-f'); const lab = el('span', 'kit-pg-fl', label); lab.id = lid; w.append(lab, g);
    return { wrap: w, get value() { const r = radios.find(x => x.checked); return r ? r.value : ''; }, set value(v) { radios.forEach(r => { r.checked = r.value === v; }); }, radios };
  };
  const head = el('div', 'kit-pg-head'), pickRow = el('div', 'kit-pg-pick');
  const filter = el('input'); filter.type = 'search'; filter.placeholder = 'Name, id or tag'; filter.id = uidp + '-filter';
  const pick = el('select'); pick.id = uidp + '-entry';
  pickRow.append(field('Filter', filter, 'kit-pg-ff'), field('Entry', pick, 'kit-pg-fe'));
  const title = el('h3', 'kit-pg-title'), info = el('p', 'kit-pg-info'), meta = el('div', 'kit-pg-meta'); meta.append(title, info);
  head.append(pickRow, meta);
  const bar = el('div', 'kit-pg-bar');
  const theme = el('select'); theme.id = uidp + '-theme';
  const mode = segs('mode', 'Mode', MODES), width = segs('width', 'Width', WIDTHS);
  bar.append(field('Theme', theme, 'kit-pg-ft'), mode.wrap, width.wrap);
  const live = el('p', 'kit-pg-live'); live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite');
  const err = el('p', 'kit-pg-err'); err.setAttribute('role', 'alert');
  const main = el('div', 'kit-pg-main');
  const frame = el('div', 'kit-pg-frame'), ruler = el('p', 'kit-pg-ruler'), wrap = el('div', 'kit-pg-wrap'), stage = el('div', 'kit-pg-stage'); ruler.setAttribute('aria-hidden', 'true'); wrap.append(stage); frame.append(ruler, wrap);
  const ed = el('div', 'kit-pg-ed'), edHead = el('div', 'kit-pg-edh'), tl = el('label', 'kit-pg-fl', 'Sample'), src = el('code', 'kit-pg-src');
  const ta = el('textarea', 'kit-pg-ta'); ta.rows = 16; ta.spellcheck = false; ta.autocapitalize = 'off'; ta.id = uidp + '-sample'; tl.htmlFor = ta.id;
  edHead.append(tl, src);
  const acts = el('div', 'kit-pg-acts');
  const apply = el('button', 'kit-pg-btn kit-pg-go', 'Apply'); apply.type = 'button';
  const reset = el('button', 'kit-pg-btn', 'Reset sample'); reset.type = 'button';
  acts.append(apply, reset); ed.append(edHead, ta, acts);
  main.append(frame, ed); box.append(head, bar, err, main, live); root.append(offLine, box);

  const say = t => { live.textContent = ''; setTimeout(() => { live.textContent = t; }, 30); };
  const fail = t => { err.textContent = t || ''; };
  function render() { const x = isOff(); offLine.hidden = !x; box.hidden = x; if (x) destroyInst(); return x; }

  function options() {
    const q = st.filter.trim().toLowerCase(), keep = cur && cur.id;
    const list = entries.filter(e => !q || [e.id, e.name, e.summary || '', (e.tags || []).join(' ')].join(' ').toLowerCase().includes(q));
    pick.replaceChildren();
    const kinds = [...new Set(list.map(e => e.kind || 'other'))].sort();
    kinds.forEach(k => { const g = el('optgroup'); g.label = k; list.filter(e => (e.kind || 'other') === k).forEach(e => g.append(new Option(e.name + ' (' + e.id + ')', e.id))); pick.append(g); });
    if (!list.length) pick.append(new Option('No entry matches', ''));
    if (keep && list.some(e => e.id === keep)) pick.value = keep;
  }
  function themeSelect() {
    theme.replaceChildren(new Option('Page tokens', ''));
    (o.themes || []).forEach(t => theme.append(new Option(t.name || t.id, t.id)));
    const ts = o.themes || [];
    theme.value = st.theme === null ? (ts[0] ? ts[0].id : '') : ts.some(t => t.id === st.theme) ? st.theme : '';
    st.theme = theme.value;
  }
  async function paint() {
    const isDark = st.mode === 'dark' || (st.mode === 'auto' && dark && dark.matches);
    wrap.dataset.theme = st.mode === 'auto' ? (isDark ? 'dark' : 'light') : st.mode;
    const t = (o.themes || []).find(x => x.id === st.theme);
    let vars = '';
    if (t) {
      const j = t.css.replace(/\.css$/, '.json');
      try { themeCache[j] = themeCache[j] || await get(url(j), 'json'); const d = themeCache[j]; if (d.fonts) get(d.fonts, 'style').catch(() => {}); vars = Object.entries(Object.assign({}, d.light, isDark ? d.dark : {})).map(([k, v]) => k + ':' + v).join(';'); }
      catch (e) { fail('The theme could not be loaded (' + e.message + '); the page tokens are used.'); }
    }
    wrap.style.cssText = vars + ';color-scheme:' + (isDark ? 'dark' : 'light') + ';width:' + (st.width === '0' ? '100%' : st.width + 'px');
    ruler.textContent = (st.width === '0' ? 'Full width' : st.width + ' px') + ', ' + (t ? (t.name || t.id) + ', ' + (st.mode === 'auto' ? 'auto (' + (isDark ? 'dark' : 'light') + ')' : st.mode) : 'page tokens in the page\'s own mode');
    mode.radios.forEach(r => { r.disabled = !t; });
  }
  function closure(e, seen, out) {
    if (!e || seen.has(e.id)) return out; seen.add(e.id);
    (e.requires || []).forEach(r => closure(byId(r), seen, out));
    (e.preview && e.preview.uses || []).forEach(r => closure(byId(r), seen, out));
    out.push(e); return out;
  }
  function destroyInst() { if (inst && typeof inst.destroy === 'function') { try { inst.destroy(); } catch (_) {} } inst = null; stage.replaceChildren(); }
  function kitMount(e) {
    const p = (e.provides || []).find(s => /^Kit(\.\w+)+\.mount$/.test(s)); if (!p) return null;
    const parts = p.split('.'); let own = window, f = null;
    for (const k of parts) { if (own == null) return null; f = own[k]; if (k !== parts[parts.length - 1]) own = f; }
    return typeof f === 'function' ? { name: p, call: d => f.call(own, stage, d) } : { name: p, missing: true };
  }
  // opts.mount goes first; when it returns nothing, the entry's own Kit.<name>.mount takes the data
  function mountFn(e) {
    const k = kitMount(e); if (typeof o.mount !== 'function') return k;
    return { name: 'opts.mount', call: d => {
      const r = o.mount(e, stage, d); if (r) return r;
      if (!k) { stage.append(el('p', 'kit-pg-none', 'This entry has no mount; see its preview in the catalog')); return null; }
      if (k.missing) throw new Error(k.name + ' is not defined after loading the entry.');
      return k.call(d);
    } };
  }
  function run(data) {
    destroyInst(); const m = mountFn(cur);
    if (!m) { stage.append(el('p', 'kit-pg-none', 'This entry has no mount; see its preview in the catalog')); return; }
    if (m.missing) { fail(m.name + ' is not defined after loading the entry.'); return; }
    try { inst = m.call(data) || null; } catch (x) { destroyInst(); fail('The mount threw: ' + (x && x.message || x)); }
  }
  async function open(id) {
    const e = byId(id); if (!e) return; const my = ++seq; cur = e; fail('');
    pick.value = id; title.textContent = e.name; info.textContent = (e.summary || '') + (e.requires && e.requires.length ? ' Loads first: ' + e.requires.join(', ') + '.' : '');
    destroyInst(); stage.append(el('p', 'kit-pg-none', 'Loading ' + e.name));
    try {
      const chain = closure(e, new Set(), []).filter(x => x.kind !== 'theme' && x.id !== 'runtime.adp');
      for (const x of chain) for (const f of x.files || []) if (f.role === 'style' && /\.css$/.test(f.path)) await get(url(f.path), 'style');
      for (const x of chain) for (const f of x.files || []) if (f.role === 'script' && /\.js$/.test(f.path)) await get(url(f.path), 'script');
      if (!(id in samples)) {
        const sp = e.preview && e.preview.samples && e.preview.samples[0] || (e.files || []).filter(f => f.role === 'sample').map(f => f.path)[0];
        try { samples[id] = sp ? await get(url(sp), 'json') : null; } catch (_) { samples[id] = null; }
        samplePath[id] = sp || '';
      }
      src.textContent = samplePath[id] || 'no sample';
      if (my !== seq) return;
      orig = JSON.stringify(samples[id] == null ? {} : samples[id], null, 2); ta.value = orig;
      await paint(); if (my !== seq) return;
      run(samples[id] == null ? {} : samples[id]);
      say(e.name + ' on the stage, ' + (st.theme || 'page tokens') + ', ' + st.mode + ', ' + (st.width === '0' ? 'full width' : st.width + ' px'));
    } catch (x) { if (my === seq) { destroyInst(); fail('Could not load ' + e.name + ': ' + (x && x.message || x)); } }
  }
  function applySample() {
    let d; fail('');
    try { d = JSON.parse(ta.value); } catch (x) {
      let p = -1; const m = /position (\d+)/.exec(x.message);
      if (m) p = +m[1]; else if (ta.value.length < 20000) for (let i = 1; i <= ta.value.length && p < 0; i++) { try { JSON.parse(ta.value.slice(0, i)); } catch (y) { const q = /position (\d+)/.exec(y.message); if (!/end of JSON|Unterminated/.test(y.message) && !(q && +q[1] >= i)) p = i - 1; } }
      const s = p >= 0 ? ta.value.slice(0, p).split('\n') : null;
      const msg = x.message.replace(/\s+/g, ' ').replace(/ \(line \d+ column \d+\)/, '').slice(0, 90);
      fail('The sample is not valid JSON: ' + msg + (s ? ' (line ' + s.length + ', column ' + (s[s.length - 1].length + 1) + ')' : '')); return;
    }
    if (inst && typeof inst.update === 'function') { try { inst.update(d); say('Sample applied'); return; } catch (x) { /* update takes another shape: mount again */ } }
    run(d); say('Sample applied');
  }
  const again = () => cur && open(cur.id);
  const on = (n, ev, f) => { n.addEventListener(ev, f); return () => n.removeEventListener(ev, f); };
  const offs = [
    on(filter, 'input', () => { st.filter = filter.value; options(); }),
    on(pick, 'change', () => pick.value && open(pick.value)),
    on(theme, 'change', () => { st.theme = theme.value; again(); }),
    on(mode.wrap, 'change', () => { st.mode = mode.value; again(); }),
    on(width.wrap, 'change', () => { st.width = width.value; again(); }),
    on(reset, 'click', () => { ta.value = orig; fail(''); applySample(); }),
    on(apply, 'click', applySample),
  ];
  function setEntries() { const c = o.catalog; entries = (Array.isArray(c) ? c : c && c.entries || []).filter(e => e && e.id); }
  function boot(pref) {
    setEntries(); options(); themeSelect(); mode.value = st.mode; width.value = st.width;
    if (render()) return;
    const first = pref && byId(pref) ? pref : o.entry && byId(o.entry) ? o.entry : (pick.value || (entries[0] && entries[0].id));
    if (first) open(first);
  }
  const c = cfg();
  if (c && typeof c.on === 'function') { try { unsub = c.on('playground.enabled', () => { const was = box.hidden; if (!render() && was) again(); }); } catch (_) {} }
  boot();
  return {
    open: id => { if (!render()) return open(id); },
    update(next) { o = Object.assign(o, next || {}); boot(!(next && next.entry) && cur ? cur.id : null); },
    destroy() { seq++; destroyInst(); offs.forEach(f => f()); if (typeof unsub === 'function') try { unsub(); } catch (_) {} root.replaceChildren(); root.classList.remove('kit-pg'); },
  };
}
Kit.playground = { mount };
})();
/* /part:page.script.kit.playground */

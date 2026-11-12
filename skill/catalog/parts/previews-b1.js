/* part:page.script.previews.b1 */
/* Live previews of batch 1 (the shared foundations): Glaze, the document shell, the top bar, themed Mermaid, tabs, copy, callouts and the data table.
   Each mounts the entry's own published file on its own published sample (invented content); nothing is stored and nothing leaves the page.
   The tabs and the shell run with hash off: the catalog's #anchor is the entry id. The theme toggles here set data-theme on their own frame, not the page. */
(function () {
'use strict';
const { html, useState, useEffect, useRef } = window.htmPreact;
const P = window.CatalogPreviews = window.CatalogPreviews || {};
const K = () => window.Kit;
const first = (samples, part) => samples[Object.keys(samples).find(k => k.endsWith('/' + part + '.json'))];
function useFonts(theme) {
  useEffect(() => {
    const u = theme && theme.fonts; if (!u || document.querySelector('link[data-pv-fonts="' + u + '"]')) return;
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = u; l.dataset.pvFonts = u; document.head.append(l);
  }, [theme && theme.fonts]);
}
const STYLE = `
.pv1-scroll { height: 460px; overflow: auto; border: 1px solid var(--rule); border-radius: 12px; background: var(--bg); padding: 18px 16px; min-width: 0; }
.pv1-scroll.flush { padding: 0; color: var(--ink); font-family: var(--f-ui); }
.pv1-scroll:focus-visible, .pv1-frame:focus-visible { outline: 2px solid var(--seam, var(--accent)); outline-offset: 2px; }
.pv1-page { display: grid; gap: 28px; max-width: 65ch; padding: 22px 16px 0; font: 15.5px/1.6 var(--f-ui); }
.pv1-page h2 { font: 600 24px/1.2 var(--f-display); margin: 0 0 8px; scroll-margin-top: calc(var(--kit-topbar-h, 0px) + 12px); }
.pv1-page p { margin: 0 0 10px; }
.pv1-cap { margin: 0; font-size: 13px; color: var(--ink-2); }
.pv1-cap b { color: var(--ink); }
.pv1-frame { border-radius: 12px; padding: 12px; background: var(--bg); color: var(--ink); font-family: var(--f-ui); }
.pv1-panel { padding: 4px 2px; font: 15px/1.55 var(--f-ui); color: var(--ink); }
.pv1-panel p { margin: 0 0 10px; }
.pv1-ratios { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr)); gap: 6px 14px; }
.pv1-ratios li { display: flex; gap: 8px; align-items: baseline; font-size: 12.5px; color: var(--ink-2); white-space: nowrap; }
.pv1-ratios code { font: 12px var(--f-mono); color: var(--ink); }
.pv1-ol { margin: 0; padding-left: 1.3em; display: grid; gap: 6px; }
`;
if (!document.querySelector('style[data-pv="b1"]')) { const st = document.createElement('style'); st.dataset.pv = 'b1'; st.textContent = STYLE; document.head.append(st); }
const css = m => Object.entries(m || {}).map(([k, v]) => k + ':' + v).join(';');
function useMount(fn, deps) {
  const ref = useRef(null);
  useEffect(() => { if (!ref.current) return; const h = fn(ref.current); return () => { if (h && h.destroy) h.destroy(); }; }, deps || []);
  return ref;
}
// a frame with its own theme toggle: data-theme on the frame, tokens from the stage theme's light and dark maps
function useFrameTheme(theme, stageDark) {
  const [mode, setMode] = useState('system');
  const dark = mode === 'dark' || (mode === 'system' && stageDark);
  const style = theme ? css(Object.assign({}, theme.light, dark ? theme.dark : {})) + ';color-scheme:' + (dark ? 'dark' : 'light') : '';
  return { mode, setMode, dark, style };
}
const Width = ({ v, set }) => html`<span class="c-seg" role="group" aria-label="Frame width">${[['full', 'Full width'], ['phone', '390 px']].map(([k, l]) =>
  html`<button type="button" key=${k} aria-pressed=${v === k} onClick=${() => set(k)}>${l}</button>`)}</span>`;
const Note = ({ children }) => html`<p class="pv-sim"><b>Preview</b> ${children}</p>`;

// ---------------------------------------------------------------- theme.glaze
function lum(rgb) { const c = rgb.map(v => v / 255).map(v => v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4)); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; }
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const ratio = (a, b) => { const x = lum(hex(a)), y = lum(hex(b)); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
const EXTRA = ['--seam', '--gold-leaf', '--info', '--wait', '--ok-soft', '--warn-soft', '--danger-soft', '--info-soft', '--wait-soft'];
function Contrast({ theme, dark }) {
  const m = Object.assign({}, theme.light, dark ? theme.dark : {});
  const pairs = [['--ink', '--panel'], ['--ink-2', '--panel'], ['--ink-2', '--sunk'], ['--ink-2', '--bg'], ['--accent-ink', '--accent'], ['--ok', '--panel'], ['--warn', '--panel'], ['--danger', '--panel'], ['--info', '--panel'], ['--seam', '--panel']]
    .filter(([a, b]) => /^#[0-9a-f]{6}$/i.test(m[a] || '') && /^#[0-9a-f]{6}$/i.test(m[b] || ''));
  return html`<ul class="pv1-ratios">${pairs.map(([a, b]) => { const r = ratio(m[a], m[b]); const need = a === '--seam' ? 3 : 4.5;
    return html`<li key=${a + b}><span class="pv-fit ${r >= need ? 'ok' : 'miss'}">${r.toFixed(1)}:1</span><code>${a}</code> on <code>${b}</code></li>`; })}</ul>`;
}
P['theme.glaze'] = props => {
  useFonts(props.theme);
  const t = props.theme;
  return html`<div class="pv-stack">
    ${P.theme ? html`<${P.theme} ...${props}/>` : ''}
    ${t ? html`<section class="sw-group"><h4>Glaze extras</h4><div class="sw-grid">${EXTRA.filter(k => t.light[k]).map(k => html`<div class="c-sw" key=${k}><i style=${'background:var(' + k + ')'}></i><b>${k}</b><span>${(props.dark && t.dark[k]) || t.light[k]}</span></div>`)}</div></section>` : ''}
    ${t ? html`<section class="sw-group"><h4>Text contrast, ${props.dark ? 'tenmoku (dark)' : 'porcelain (light)'}</h4><${Contrast} theme=${t} dark=${props.dark}/>
      <p class="pv1-cap">4.5:1 is the bar for text; --seam is a mark, not text, so 3:1.</p></section>` : ''}
    <section class="sw-group"><h4>The kit in Glaze</h4>
      <div class="pv-stack">
        <div class="pv-rec"><button type="button" class="btn primary">Start the firing</button><button type="button" class="btn">Open the log</button>
          <span class="chip">cone 6</span><span class="chip">porcelain</span><span>Hold at 1222 °C <span class="kit-mark" data-mark="verified">verified</span></span></div>
        <aside class="kit-callout" data-tone="note"><p class="kit-callout-k">Note</p><p>The seam is the one gold line on a page: the current link, the selected tab, the total row.</p></aside>
        <aside class="kit-callout" data-tone="warn"><p class="kit-callout-k">Check first</p><p>Night is tenmoku, not black: keep text on --ink and --ink-2 and the glaze colours for meaning.</p></aside>
      </div></section>
  </div>`;
};

// ---------------------------------------------------------------- layout.doc-shell
P['layout.doc-shell'] = ({ samples, theme }) => {
  useFonts(theme);
  const d = first(samples, 'doc-shell'); const [w, setW] = useState('full'); const [now, setNow] = useState('');
  const box = useRef(null);
  const ref = useMount(el => K().docShell.mount(el, { hash: false, scroller: box.current, onChange: id => setNow((d.sections.find(x => 'pv-' + x.id === id) || {}).title || id) }), [w]);
  return html`<div class="pv-stack">
    <div class="pv-row"><${Width} v=${w} set=${setW}/><span class="pv1-cap" aria-live="polite">In view: <b>${now}</b></span></div>
    <div class="pv1-scroll" ref=${box} style=${w === 'phone' ? 'max-width:390px' : ''} tabindex="0" aria-label="Document shell preview">
      <div class="kit-doc" ref=${ref} key=${w}>
        <nav class="kit-doc-toc" aria-label="Contents"></nav>
        <div class="kit-doc-main">${d.sections.map(s => html`<section class="kit-doc-sec" id=${'pv-' + s.id} data-group=${s.group || null} data-toc=${s.title} key=${s.id}>
          <aside class="kit-doc-note">${s.note.map(([b, t]) => html`<div><b>${b}</b> ${t}</div>`)}</aside>
          <div class="kit-doc-body"><h2>${s.title}</h2>${s.body.map(p => html`<p>${p}</p>`)}</div></section>`)}
          <p class="pv1-cap" style="min-height:220px">End of the handbook.</p></div>
      </div>
    </div>
    <${Note}>The rail lights the section in view; at 390 px it becomes a Contents menu. Links move focus to the section and leave the catalog's address alone (hash: false).<//>
  </div>`;
};

// ---------------------------------------------------------------- layout.topbar
P['layout.topbar'] = ({ samples, theme, dark }) => {
  useFonts(theme);
  const d = first(samples, 'topbar'); const ft = useFrameTheme(theme, dark); const [w, setW] = useState('full');
  const box = useRef(null);
  const ref = useMount(el => K().topbar.mount(el, { brand: d.brand, links: d.links, scroller: box.current, heightOn: box.current, theme: { target: box.current, onChange: m => ft.setMode(m) } }), [w]);
  return html`<div class="pv-stack">
    <div class="pv-row"><${Width} v=${w} set=${setW}/><span class="pv1-cap">Theme on this frame: <b>${ft.mode}</b>${ft.mode === 'system' ? ' (follows the stage here)' : ''}</span></div>
    <div class="pv1-scroll flush" ref=${box} key=${w} style=${ft.style + (w === 'phone' ? ';max-width:390px' : '')} tabindex="0" aria-label="Top bar preview">
      <header ref=${ref}></header>
      <div class="pv1-page">${d.sections.map(s => html`<section id=${s.id} key=${s.id}><h2>${s.title}</h2>${s.body.map(p => html`<p>${p}</p>`)}</section>`)}<p class="pv1-cap" style="min-height:200px">End of the page.</p></div>
    </div>
    <${Note}>The toggle cycles system, the opposite of the OS setting, the OS setting. Here it sets data-theme on this frame; on a page it sets it on the root element.<//>
  </div>`;
};

// ---------------------------------------------------------------- kit.mermaid
const Fig = ({ f, min, legend }) => html`<figure class="kit-mmd-frame"><figcaption class="kit-mmd-cap"><b>${f.title}</b><span>${f.meta}</span></figcaption>
    <div class="kit-mmd-scroll" tabindex="0" aria-label=${f.title + ', scrollable'}><pre class="kit-mmd" data-label=${f.label} style=${min ? '--kit-mmd-min:' + min : ''}>${f.src}</pre></div>
    ${legend ? html`<p class="kit-legend">${legend.map(([c, l]) => html`<span style=${'--c:var(--' + c + ')'}>${l}</span>`)}</p>` : ''}</figure>`;
P['kit.mermaid'] = ({ samples, theme, dark }) => {
  useFonts(theme);
  const d = first(samples, 'mermaid'); const ft = useFrameTheme(theme, dark);
  const wrap = useRef(null); const btn = useRef(null);
  const ref = useMount(el => K().mermaid.mount(el, { watch: [wrap.current] }), []);
  useEffect(() => { const t = K().theme && K().theme.create({ target: wrap.current, onChange: m => ft.setMode(m) }); if (t) t.bind(btn.current); return () => t && t.destroy(); }, []);
  return html`<div class="pv-stack">
    <div class="pv-row"><span class="pv1-cap">Redraws when the theme changes:</span><button ref=${btn}></button></div>
    <div ref=${wrap} class="pv1-frame" style=${ft.style}><div ref=${ref} class="pv-stack"><${Fig} f=${d.flow} min="640px" legend=${d.legend}/><${Fig} f=${d.seq}/></div></div>
    <${Note}>Drawn by mermaid 11.4.1 from jsDelivr here (on a page with the platform's own Mermaid, that copy is used). %ok/18% in the source is the --ok token at 18%.<//>
  </div>`;
};

// ---------------------------------------------------------------- kit.tabs
const tabBody = t => t.rows ? html`<p>${t.lead}</p><div class="kit-table-box" style="max-width:420px" tabindex="0" role="region" aria-label="Recipe"><table class="kit-table"><thead><tr><th scope="col">Material</th><th class="num" scope="col">Parts</th></tr></thead>
    <tbody>${t.rows.map(([a, b]) => html`<tr><td>${a}</td><td class="num">${b}</td></tr>`)}</tbody></table></div>`
  : t.items ? html`<ol class="pv1-ol">${t.items.map(x => html`<li>${x}</li>`)}</ol>` : html`<p>${t.text}</p>`;
const TabSet = ({ d, cls, onPick }) => {
  const ref = useMount(el => K().tabs.mount(el, { hash: false, label: d.label, onChange: id => { if (onPick) onPick(id); } }), []);
  return html`<div class=${'kit-tabs ' + (cls || '')} ref=${ref}>
    <div class="kit-tabs-list" role="tablist">${d.tabs.map(t => html`<button role="tab" data-tab=${t.id} key=${t.id}>${t.label}${t.count != null ? html` <span class="kit-tab-n">${t.count}</span>` : ''}</button>`)}</div>
    ${d.tabs.map(t => html`<section data-tab-panel=${t.id} key=${t.id} class="pv1-panel">${tabBody(t)}</section>`)}</div>`;
};
P['kit.tabs'] = ({ samples, theme }) => {
  useFonts(theme);
  const d = first(samples, 'tabs'); const [log, setLog] = useState('recipe');
  return html`<div class="pv-stack">
    <${TabSet} d=${d} onPick=${setLog}/>
    <p class="pv1-cap" aria-live="polite">onChange: <code>${log}</code>. Focus a tab, then use the arrow keys, Home or End.</p>
    <p class="pv-label">The .line variant</p>
    <${TabSet} d=${d} cls="line"/>
  </div>`;
};

// ---------------------------------------------------------------- kit.copy
P['kit.copy'] = ({ samples, theme }) => {
  useFonts(theme);
  const d = first(samples, 'copy');
  const ref = useMount(el => {
    el.querySelector('[data-slot="a"]').replaceChildren(K().copy.block(d.snippet));
    el.querySelector('[data-slot="b"]').replaceChildren(K().copy.block(Object.assign({ ink: true }, d.ink)));
    return K().copy.mount(el);
  }, []);
  return html`<div class="pv-stack" ref=${ref}>
    <div data-slot="a"></div>
    <p class="pv-label">Command grid</p>
    <ul class="kit-cmds">${d.commands.map(c => html`<li key=${c.cmd}><button type="button" class="kit-cmd" data-copy=${c.cmd}><code>${c.cmd}</code><span>${c.what}</span><span class="kit-cmd-s">Click to copy</span></button></li>`)}</ul>
    <p class="pv-label">The .ink variant</p>
    <div data-slot="b"></div>
    <${Note}>Where the frame refuses the clipboard, the text is selected and the button says to press Ctrl+C or Cmd+C.<//>
  </div>`;
};

// ---------------------------------------------------------------- kit.callout
P['kit.callout'] = ({ samples, theme }) => {
  useFonts(theme);
  const d = first(samples, 'callout');
  return html`<div class="pv-stack" style="max-width:68ch">
    ${d.callouts.map(c => html`<aside class="kit-callout" data-tone=${c.tone} key=${c.tone}><p class="kit-callout-k">${c.k}</p><p>${c.body}</p>${c.list ? html`<ul>${c.list.map(x => html`<li>${x}</li>`)}</ul>` : ''}</aside>`)}
    <p class="pv-label">Inline marks</p>
    <p style="margin:0;line-height:1.7">The kiln reached cone 6 <span class="kit-mark" data-mark="verified">verified</span>, the shelves cost about 150 euros <span class="kit-mark" data-mark="estimate">estimate</span>,
      and the crazing comes from a thick dip <span class="kit-mark" data-mark="inference">my inference, unconfirmed</span>. The supplier's cone chart <span class="kit-mark" data-mark="unverified">unverified</span>.</p>
  </div>`;
};

// ---------------------------------------------------------------- kit.table
P['kit.table'] = ({ samples, theme }) => {
  useFonts(theme);
  const d = first(samples, 'table'); const [w, setW] = useState('full');
  const ref = useMount(el => K().table.render(el, {
    caption: d.caption, note: d.sub, group: 'group', groupTotals: true, total: 'Total, quarter',
    highlight: r => r.flag ? 'over budget' : false,
    columns: [{ key: 'item', label: 'Item' }, { key: 'planned', label: 'Planned', num: true, sum: true, decimals: 2 }, { key: 'spent', label: 'Spent', num: true, sum: true, decimals: 2 },
      { key: 'diff', label: 'Difference', num: true, sum: true, signed: true, decimals: 2 }],
    rows: d.rows.map(r => Object.assign({ diff: +(r.planned - r.spent).toFixed(2) }, r)),
  }), []);
  return html`<div class="pv-stack">
    <div class="pv-row"><${Width} v=${w} set=${setW}/></div>
    <div style=${'min-width:0' + (w === 'phone' ? ';max-width:390px' : '')}><div ref=${ref}></div></div>
    <${Note}>The table scrolls sideways inside its frame at phone width; the page never does. The sign is in the figure (+, −); colour only repeats it.<//>
  </div>`;
};
})();
/* /part:page.script.previews.b1 */

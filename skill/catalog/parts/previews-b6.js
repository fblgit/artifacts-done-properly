/* part:page.script.previews.b6 */
/* Live previews of batch 6 (templates and prototypes): the document and record templates, the prototype stage, the states specimen sheet, the key wheel, the 3D viewer and the icon set.
   Each mounts the entry's own published file on its own published sample (invented content); nothing is stored and nothing leaves the page, except the 3D viewer's
   three.js module, which loads from cdnjs like any page that takes the entry. */
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
.pv6-scroll { height: 480px; overflow: auto; border: 1px solid var(--rule); border-radius: 12px; background: var(--bg); min-width: 0; color: var(--ink); font-family: var(--f-ui); }
.pv6-scroll:focus-visible { outline: 2px solid var(--seam, var(--accent)); outline-offset: 2px; }
.pv6-cap { margin: 0; font-size: 13px; color: var(--ink-2); }
.pv6-cap b { color: var(--ink); }
.pv6-b { min-height: 34px; padding: 4px 12px; border: 1px solid var(--rule); border-radius: 8px; background: var(--panel); color: var(--ink); font: 600 13px/1.2 var(--f-ui); cursor: pointer; }
.pv6-b:hover { border-color: var(--ink-2); }
.pv6-b[aria-pressed="true"] { background: var(--sunk); box-shadow: inset 0 0 0 1px var(--seam, var(--accent)); }
.pv6-b:focus-visible { outline: 2px solid var(--seam, var(--accent)); outline-offset: 2px; }
.pv6-flow { display: grid; gap: 14px; min-width: 0; }
.pv6-split { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 18px 24px; align-items: start; }
.pv6-split > * { min-width: 0; }
.pv6-h { margin: 0 0 6px; font: 600 12.5px/1.3 var(--f-mono); color: var(--ink-2); }
/* prototype app (laid out at 1280 x 800, then scaled) */
.pv6-pa { display: grid; grid-template-columns: 200px minmax(0, 1fr) 340px; height: 800px; font: 17px/1.4 var(--f-ui); color: var(--ink); background: var(--panel); }
.pv6-pa-rail { background: var(--sunk); border-right: 1px solid var(--rule); padding: 22px 16px; display: grid; gap: 6px; align-content: start; }
.pv6-pa-brand { font: 600 25px/1.1 var(--f-display); margin-bottom: 18px; }
.pv6-pa-nav { padding: 9px 12px; border-radius: 10px; color: var(--ink-2); font-weight: 600; }
.pv6-pa-nav.on { background: var(--panel); color: var(--ink); box-shadow: inset 0 0 0 1px var(--rule); }
.pv6-pa-main { padding: 22px 24px; display: grid; gap: 14px; align-content: start; min-width: 0; }
.pv6-pa-bar { display: flex; align-items: baseline; gap: 14px; position: relative; }
.pv6-pa-bar h2 { margin: 0; font: 600 30px/1.1 var(--f-display); }
.pv6-pa-bar > span { color: var(--ink-2); }
.pv6-pa-view { margin-left: auto; padding: 6px 14px; border-radius: 999px; border: 1px solid var(--rule); font-weight: 600; position: relative; }
.pv6-pa-rows { display: grid; border: 1px solid var(--rule); border-radius: 14px; overflow: hidden; }
.pv6-pa-row { position: relative; display: grid; grid-template-columns: 36px minmax(0, 1fr) 70px 90px 100px auto; gap: 12px; align-items: center; padding: 0 16px; height: 44px; border-bottom: 1px solid var(--rule-2); }
.pv6-pa-roomy .pv6-pa-row { height: 60px; }
.pv6-pa-row:last-child { border-bottom: 0; }
.pv6-pa-row.is-focus { background: var(--accent-soft); box-shadow: inset 4px 0 0 var(--seam, var(--accent)); }
.pv6-pa-star { color: var(--ink-2); font-size: 20px; position: relative; }
.pv6-pa-star.on { color: var(--ink); }
.pv6-pa-n { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pv6-pa-m { color: var(--ink-2); font-variant-numeric: tabular-nums; }
.pv6-pa-chip { display: inline-block; padding: 1px 10px; border-radius: 999px; border: 1px solid var(--rule); font-size: 14px; font-weight: 600; margin-left: 4px; background: var(--panel); }
.pv6-pa-side { border-left: 1px solid var(--rule); background: var(--sunk); padding: 24px 22px; display: grid; gap: 14px; align-content: start; position: relative; }
.pv6-pa-side h3 { margin: 0; font: 600 25px/1.15 var(--f-display); position: relative; }
.pv6-pa-side dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 6px 16px; }
.pv6-pa-side dt { color: var(--ink-2); }
.pv6-pa-side dd { margin: 0; font-weight: 600; }
.pv6-pa-pads { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; position: relative; }
.pv6-pa-pad { padding: 12px 8px; border-radius: 12px; border: 1px solid var(--rule); background: var(--panel); text-align: center; font-weight: 600; }
.pv6-pa-pad b { display: block; font: 600 13px var(--f-mono); color: var(--ink-2); }
.pv6-pa-pad.lit { background: var(--ink); color: var(--panel); border-color: var(--ink); }
.pv6-pa-pad.lit b { color: var(--panel); }
.pv6-pa-toast { position: absolute; left: 24px; bottom: 24px; padding: 10px 16px; border-radius: 12px; background: var(--ink); color: var(--panel); font-weight: 600; box-shadow: var(--shadow); }
.pv6-pa-empty { color: var(--ink-2); padding: 8px 0; }
/* specimen sheet components, in the sheet's own skin */
.pv6-btn { display: inline-flex; align-items: center; gap: 8px; min-height: 38px; padding: 6px 18px; border: 1px solid transparent; border-radius: var(--s-radius, 10px); background: var(--s-accent); color: var(--s-accent-ink); font: 700 14px/1.2 var(--f-ui); cursor: pointer; }
.pv6-btn:hover:not(:disabled), .pv6-btn[data-state="hover"] { background: color-mix(in srgb, var(--s-accent) 84%, var(--s-ink)); }
.pv6-btn:focus-visible, .pv6-btn[data-state="focus"] { outline: 3px solid var(--s-ink); outline-offset: 2px; }
.pv6-btn[data-state="busy"] { cursor: progress; }
.pv6-btn:disabled { background: var(--s-line); color: var(--s-ink-2); cursor: not-allowed; }
.pv6-btn[data-state="done"] { background: var(--s-ok); color: var(--s-bg); }
.pv6-spin { width: 14px; height: 14px; border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent; animation: pv6-spin .8s linear infinite; }
.pv6-toast { display: inline-flex; align-items: center; gap: 10px; padding: 9px 14px; border-radius: var(--s-radius, 10px); border: 1px solid var(--s-line); background: var(--s-panel); color: var(--s-ink); font: 600 13.5px/1.3 var(--f-ui); }
.pv6-toast b { font: 700 12px var(--f-mono); }
.pv6-toast[data-tone="ok"] b { color: var(--s-ok); } .pv6-toast[data-tone="bad"] b { color: var(--s-bad); } .pv6-toast[data-tone="warn"] b { color: var(--s-ink-2); }
.pv6-toast.fx { animation: pv6-pop .5s ease-out; }
@keyframes pv6-spin { to { transform: rotate(360deg); } }
@keyframes pv6-pop { from { transform: translateY(10px); opacity: 0; } }
/* icons */
.pv6-icons { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 8px; }
.pv6-icons li { margin: 0; }
.pv6-icons button { width: 100%; display: grid; justify-items: center; gap: 8px; padding: 14px 6px 10px; border: 1px solid var(--rule); border-radius: 12px; background: var(--panel); color: var(--ink); font: 12.5px/1.2 var(--f-mono); cursor: pointer; }
.pv6-icons button:hover { border-color: var(--ink-2); }
.pv6-icons button:focus-visible { outline: 2px solid var(--seam, var(--accent)); outline-offset: 2px; }
.pv6-icons span { color: var(--ink-2); }
.pv6-wheel { display: grid; justify-items: center; gap: 10px; }
.pv6-chips { display: flex; flex-wrap: wrap; gap: 8px 14px; }
.pv6-trk { display: inline-flex; align-items: center; gap: 6px; }
@media (prefers-reduced-motion: reduce) { .pv6-spin, .pv6-toast.fx { animation: none; } }
`;
if (!document.querySelector('style[data-pv="b6"]')) { const st = document.createElement('style'); st.dataset.pv = 'b6'; st.textContent = STYLE; document.head.append(st); }
const Width = ({ v, set }) => html`<span class="c-seg" role="group" aria-label="Frame width">${[['full', 'Full width'], ['phone', '390 px']].map(([k, l]) =>
  html`<button type="button" key=${k} aria-pressed=${v === k} onClick=${() => set(k)}>${l}</button>`)}</span>`;
const Note = ({ children }) => html`<p class="pv-sim"><b>Preview</b> ${children}</p>`;
const frameStyle = (theme, dark) => theme ? Object.entries(Object.assign({}, theme.light, dark ? theme.dark : {})).map(([k, v]) => k + ':' + v).join(';') + ';color-scheme:' + (dark ? 'dark' : 'light') : '';
const fragment = (text, sel) => { const d = new DOMParser().parseFromString(String(text || ''), 'text/html'); const n = d.querySelector(sel); return n ? n.outerHTML : ''; };

// ---------------------------------------------------------------- template.doc
P['template.doc'] = ({ samples, theme, dark }) => {
  useFonts(theme);
  const text = samples['kit/templates/doc.html.txt'];
  const [w, setW] = useState('full'); const box = useRef(null); const host = useRef(null);
  useEffect(() => {
    if (!host.current) return; host.current.innerHTML = fragment(text, '#doc');
    const shell = host.current.querySelector('#doc-shell'); const h = shell && K().docShell.mount(shell, { hash: false, scroller: box.current });
    return () => { if (h) h.destroy(); };
  }, [text, w]);
  return html`<div class="pv-stack">
    <div class="pv-row"><${Width} v=${w} set=${setW}/></div>
    <div class="pv6-scroll" ref=${box} key=${w} tabindex="0" aria-label="Document template preview" style=${frameStyle(theme, dark) + (w === 'phone' ? ';max-width:390px' : '')}><div ref=${host}></div></div>
    <${Note}>The proposal is invented. The sections number themselves; the contents rail follows the one in view and becomes a menu at 390 px.<//>
  </div>`;
};

// ---------------------------------------------------------------- template.record
P['template.record'] = ({ samples, theme, dark }) => {
  useFonts(theme);
  const text = samples['kit/templates/record.html.txt'];
  const [w, setW] = useState('full'); const host = useRef(null);
  useEffect(() => {
    if (!host.current) return; host.current.innerHTML = fragment(text, '#record');
    const t = host.current.querySelector('#rec-tabs'); const h = t && K().tabs.mount(t, { hash: false, label: 'Record sections', keys: false });
    return () => { if (h) h.destroy(); };
  }, [text, w]);
  return html`<div class="pv-stack">
    <div class="pv-row"><${Width} v=${w} set=${setW}/></div>
    <div class="pv6-scroll" key=${w} tabindex="0" aria-label="Record page preview" style=${frameStyle(theme, dark) + (w === 'phone' ? ';max-width:390px' : '')}><div ref=${host}></div></div>
    <${Note}>An invented kiln record. The Health tab shows the status column: each mark carries its word, so the state is not colour alone.<//>
  </div>`;
};

// ---------------------------------------------------------------- pattern.prototype
function protoApp(d) {
  const S = { focus: 1, open: true, tags: { 1: [0] }, stars: {}, roomy: true, toast: '' };
  const render = (frame, api) => {
    const rows = d.rows.map((r, i) => {
      const tg = (S.tags[i] || []).map(t => '<span class="pv6-pa-chip">' + d.tags[t] + '</span>').join('');
      return '<div class="pv6-pa-row' + (i === S.focus ? ' is-focus' : '') + '"><span class="pv6-pa-star' + (S.stars[i] ? ' on' : '') + '" data-p="star">' + (S.stars[i] ? '★' : '☆') + '</span><span class="pv6-pa-n">' + r.name + '</span><span class="pv6-pa-m">cone ' + r.cone + '</span><span class="pv6-pa-m">' + r.hours + '</span><span class="pv6-pa-m">' + r.state + '</span><span>' + tg + '</span></div>';
    }).join('');
    const f = d.rows[S.focus];
    const side = S.open ? '<aside class="pv6-pa-side"><h3 data-p="head">' + f.name + '</h3><dl><dt>Cone</dt><dd>' + f.cone + '</dd><dt>Duration</dt><dd>' + f.hours + '</dd><dt>State</dt><dd>' + f.state + '</dd></dl>'
      + '<div class="pv6-pa-pads" data-p="pads">' + d.tags.map((t, i) => '<div class="pv6-pa-pad' + ((S.tags[S.focus] || []).includes(i) ? ' lit' : '') + '"><b>' + (i + 1) + '</b>' + t + '</div>').join('') + '</div></aside>'
      : '<aside class="pv6-pa-side"><p class="pv6-pa-empty">Press Enter to open the detail.</p></aside>';
    frame.innerHTML = '<div class="pv6-pa ' + (S.roomy ? 'pv6-pa-roomy' : '') + '"><nav class="pv6-pa-rail"><div class="pv6-pa-brand">Kiln log</div><div class="pv6-pa-nav on">Firings</div><div class="pv6-pa-nav">Glazes</div><div class="pv6-pa-nav">Shelves</div></nav>'
      + '<main class="pv6-pa-main"><div class="pv6-pa-bar"><h2>Firings this week</h2><span>' + d.rows.length + ' of ' + d.rows.length + '</span><span class="pv6-pa-view" data-p="view">' + (S.roomy ? 'Roomy' : 'Compact') + '</span></div><div class="pv6-pa-rows">' + rows + '</div></main>' + side
      + (S.toast ? '<div class="pv6-pa-toast">' + S.toast + '</div>' : '') + '</div>';
    const K_ = K().proto, at = (sel, n, x, y) => { const t = frame.querySelector(sel); if (t) { t.style.position = 'relative'; t.append(K_.pin(n, { x, y })); } };
    at('.pv6-pa-row.is-focus', '1', 8, 22); at('[data-p="head"]', '2', -12, 14); at('[data-p="pads"]', '3', -12, 30); at('.pv6-pa-row.is-focus .pv6-pa-star', '4', 10, -2); at('[data-p="view"]', '5', -6, 6);
  };
  const flash = (api, msg) => { S.toast = msg; api.say(msg); api.render(); clearTimeout(S.t); S.t = setTimeout(() => { S.toast = ''; api.render(); }, 2200); };
  const bindings = [
    { keys: ['j', 'ArrowDown'], run: () => { S.focus = Math.min(d.rows.length - 1, S.focus + 1); } },
    { keys: ['k', 'ArrowUp'], run: () => { S.focus = Math.max(0, S.focus - 1); } },
    { keys: ['Enter'], run: () => { S.open = !S.open; } },
    { keys: ['1-9'], run: (_, e, k) => { const t = +k - 1; if (t >= d.tags.length) { S.toast = 'No tag on key ' + k; return; } const a = S.tags[S.focus] = S.tags[S.focus] || []; if (a.includes(t)) S.toast = 'Already filed under ' + d.tags[t]; else { a.push(t); S.toast = 'Filed under ' + d.tags[t]; } } },
    { keys: ['Shift+S'], run: () => { S.stars[S.focus] = !S.stars[S.focus]; S.toast = S.stars[S.focus] ? 'Starred' : 'Star removed'; } },
    { keys: ['v'], run: () => { S.roomy = !S.roomy; } },
  ];
  const km = K().proto.keymap(bindings);
  const onKey = (e, api) => { const used = km(e); if (used) { api.say(S.toast || ''); api.render(); clearTimeout(S.t); if (S.toast) S.t = setTimeout(() => { S.toast = ''; api.render(); }, 2200); } return used; };
  return { render, onKey, reset(api) { Object.assign(S, { focus: 1, open: true, tags: { 1: [0] }, stars: {}, roomy: true, toast: '' }); api.render(); } };
}
P['pattern.prototype'] = ({ samples, theme }) => {
  useFonts(theme);
  const d = first(samples, 'prototype'); const [pins, setPins] = useState(true);
  const host = useRef(null), tbl = useRef(null), api = useRef(null), app = useRef(null);
  useEffect(() => {
    const A = protoApp(d); app.current = A;
    const a = K().proto.stage(host.current, { width: d.width, height: d.height, caption: 'Firing log', sub: 'Click the stage, then press the keys', label: 'Firing log prototype', render: A.render, onKey: A.onKey, legend: d.legend, pins: true });
    api.current = a;
    const t = K().proto.keysTable(tbl.current, { groups: d.keys.groups, caption: 'Every key on this stage', label: 'Keys on this stage' });
    return () => { a.destroy(); t.box.remove(); };
  }, [d]);
  useEffect(() => { if (api.current) api.current.setPins(pins); }, [pins]);
  return html`<div class="pv6-flow">
    <div class="pv-row">
      <span class="c-seg" role="group" aria-label="Markers"><button type="button" aria-pressed=${pins} onClick=${() => setPins(true)}>Markers on</button><button type="button" aria-pressed=${!pins} onClick=${() => setPins(false)}>Markers off</button></span>
      <button type="button" class="pv6-b" onClick=${() => app.current && app.current.reset(api.current)}>Reset the log</button>
    </div>
    <div ref=${host}></div>
    <div ref=${tbl}></div>
    <${Note}>The app is drawn at 1280 by 800 and scaled to the width here. Press j, k, Enter, 1, 2, 3, Shift+S or v; nothing leaves the page.<//>
  </div>`;
};

// ---------------------------------------------------------------- pattern.specimens
P['pattern.specimens'] = ({ samples, theme }) => {
  useFonts(theme);
  const d = first(samples, 'specimens'); const host = useRef(null);
  useEffect(() => {
    const sheet = K().specimens.mount(host.current, {
      title: d.title, skins: d.skins, replay: true, label: 'Skin',
      groups: [
        { title: 'Button', layout: 'rows', items: d.states.map(s => ({ label: s.label, state: s.state, render: h => {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'pv6-btn'; b.dataset.state = s.state;
          if (s.state === 'busy') { const sp = document.createElement('span'); sp.className = 'pv6-spin'; sp.setAttribute('aria-hidden', 'true'); b.append(sp); }
          b.append(document.createTextNode(s.text)); if (s.state === 'disabled') b.disabled = true; if (s.state === 'busy') b.setAttribute('aria-busy', 'true'); h.append(b); } })) },
        { title: 'After a key', layout: 'grid', cols: 3, items: d.toasts.map((t, i) => ({ label: t.caption, html: '<span class="pv6-toast' + (i === 0 ? ' fx' : '') + '" data-tone="' + t.tone + '"' + (i === 0 ? ' data-fx' : '') + '><b>' + (t.tone === 'ok' ? 'Done' : t.tone === 'warn' ? 'Note' : 'Stop') + '</b>' + t.text + '</span>' })) },
        { title: 'Loading, empty, missing', layout: 'grid', cols: 3, items: [
          { label: 'List loading', html: '<div style="display:grid;gap:10px;width:100%"><span class="kit-spec-skel" style="width:78%"></span><span class="kit-spec-skel" style="width:52%"></span><span class="kit-spec-skel" style="width:66%"></span></div>' },
          { label: 'No firings yet', html: '<div class="kit-spec-empty" style="width:100%"><b>' + d.cells.empty.title + '</b><span>' + d.cells.empty.text + '</span></div>' },
          { label: 'Log missing', html: '<div class="kit-spec-empty" style="width:100%"><b>' + d.cells.missing.title + '</b><span>' + d.cells.missing.text + '</span></div>' }] },
      ],
    });
    return () => sheet.destroy();
  }, [d]);
  return html`<div class="pv6-flow"><div ref=${host}></div>
    <${Note}>The skins are two sets of custom properties on the sheet; the page theme is untouched. Hover and focus are drawn with data-state so they can be shown without a pointer. Replay restarts the first toast.<//></div>`;
};

// ---------------------------------------------------------------- viz.wheel
P['viz.wheel'] = ({ samples, theme }) => {
  useFonts(theme);
  const d = first(samples, 'wheel'); const V = K().viz;
  const [mode, setMode] = useState('lit'); const [active, setActive] = useState(d.active); const [track, setTrack] = useState('t1');
  const cur = d.tracks.find(t => t.id === track);
  const pickKey = c => { setActive(c); const t = d.tracks.find(x => x.key === c); if (t) setTrack(t.id); };
  const pickTrack = id => { setTrack(id); setActive(d.tracks.find(x => x.id === id).key); };
  return html`<div class="pv6-flow">
    <div class="pv-row"><span class="c-seg" role="group" aria-label="Wheel mode">${[['lit', 'Key and neighbours'], ['counts', 'Tracks per key']].map(([k, l]) => html`<button type="button" key=${k} aria-pressed=${mode === k} onClick=${() => setMode(k)}>${l}</button>`)}</span></div>
    <div class="pv6-split">
      <div class="pv6-wheel"><${V.KeyWheel} size=${280} active=${active} counts=${mode === 'counts' ? d.counts : null} center=${mode === 'lit' ? active : null} onPick=${pickKey} label="Key wheel"/>
        <p class="pv6-cap">${mode === 'lit' ? html`Mix into <b>${active}</b>: ${K().viz.wheelUtil.neighbours(active).join(', ')}` : 'Tint and number show how many tracks sit in each key.'}</p></div>
      <div class="pv6-wheel"><${V.MoodPlot} size=${280} points=${d.tracks.map(t => ({ id: t.id, label: t.label, x: t.x, y: t.y }))} active=${track} onPick=${pickTrack} label="Mood plot"/>
        <p class="pv6-cap"><b>${cur.label}</b> is valence ${cur.x}, arousal ${cur.y}.</p></div>
    </div>
    <div class="pv6-chips" aria-label="Tracks">${d.tracks.map(t => html`<span class="pv6-trk" key=${t.id}><${V.KeyChip} code=${t.key} name=${t.name}/><button type="button" class="pv6-b" aria-pressed=${t.id === track} onClick=${() => pickTrack(t.id)}>${t.label}</button></span>`)}</div>
    <${Note}>Tab to the wheel and use the arrow keys; Enter picks. Five invented tracks.<//>
  </div>`;
};

// ---------------------------------------------------------------- layout.viewer3d
function enclosure(ctx) {
  const { THREE, p, view, mat } = ctx; const g = new THREE.Group(); const parts = {};
  const W = p.width, D = p.depth, H = p.height, t = Math.max(.2, p.wall);
  const shell = mat('--accent'), lidM = mat('--ink-2'), boardM = mat('--ok'), chipM = mat('--ink', { roughness: .5 });
  const box = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(Math.max(.1, w), Math.max(.1, h), Math.max(.1, d)), m); b.position.set(x, y, z); return b; };
  const base = new THREE.Group();
  base.add(box(W, t, D, 0, t / 2, 0, shell));
  base.add(box(W, H - t, t, 0, t + (H - t) / 2, D / 2 - t / 2, shell)); base.add(box(W, H - t, t, 0, t + (H - t) / 2, -D / 2 + t / 2, shell));
  base.add(box(t, H - t, D - 2 * t, W / 2 - t / 2, t + (H - t) / 2, 0, shell)); base.add(box(t, H - t, D - 2 * t, -W / 2 + t / 2, t + (H - t) / 2, 0, shell));
  const lid = new THREE.Group(); lid.add(box(W, t, D, 0, 0, 0, lidM)); lid.add(box(W - 2 * t - 2, 2, D - 2 * t - 2, 0, -t / 2 - 1, 0, lidM));
  const board = new THREE.Group(); board.add(box(70, 1.6, 50, 0, 0, 0, boardM)); board.add(box(22, 12, 14, -12, 6.8, 6, chipM)); board.add(box(10, 8, 24, 22, 4.8, -6, chipM));
  g.add(base, lid, board); parts.base = base; parts.lid = lid; parts.board = board;
  const innerW = W - 2 * t, innerD = D - 2 * t, innerH = H - 2 * t, vol = innerW * innerD * innerH / 1000;
  const readouts = [
    { k: 'Wall thickness', v: t.toFixed(1) + ' mm (min 2.0)', ok: t >= 2 },
    { k: 'Inside width', v: innerW.toFixed(1) + ' mm (need 72)', ok: innerW >= 72 },
    { k: 'Inside depth', v: innerD.toFixed(1) + ' mm (need 52)', ok: innerD >= 52 },
    { k: 'Height over board', v: (innerH - 1.6 - 4).toFixed(1) + ' mm (need 12)', ok: innerH - 1.6 - 4 >= 12 },
    { k: 'Inside volume', v: vol.toFixed(0) + ' cm³' },
  ];
  return { group: g, parts, readouts, dims: { W, D, H, t } };
}
function enclosureView(ctx, b) {
  const { view } = ctx, { H, t } = b.dims, e = view.explode || 0;
  b.parts.board.position.set(0, t + 4 + 0.8 + e * 16, 0);
  b.parts.lid.position.set(0, H + t / 2 + e * 44, 0);
  b.parts.lid.visible = !!view.lid; b.parts.board.visible = !!view.board;
}
P['layout.viewer3d'] = ({ samples, theme }) => {
  useFonts(theme);
  const d = first(samples, 'viewer3d'); const host = useRef(null); const [st, setSt] = useState('Loading three.js from cdnjs…');
  useEffect(() => {
    let off = false, h = null;
    K().viewer3d.mount(host.current, { title: d.title, note: d.text, params: d.params, view: d.view, fixed: d.fixed, legend: d.legend, model: enclosure, applyView: enclosureView, home: { pos: [150, 110, 170], tgt: [0, 14, 0] } })
      .then(x => { if (off) { x.destroy(); return; } h = x; setSt(x.webgl ? 'Drag the model. Change a size or the wall: the readouts re-check. Try a wall of 1.4.' : 'This browser has no WebGL, so the model is not drawn.'); }, e => setSt('Could not start the viewer: ' + e.message));
    return () => { off = true; if (h) h.destroy(); };
  }, [d]);
  return html`<div class="pv6-flow"><div ref=${host} style="--kit-v3-h:640px"></div><${Note}>${st}<//></div>`;
};

// ---------------------------------------------------------------- kit.icons
P['kit.icons'] = ({ theme }) => {
  useFonts(theme);
  const I = K().iconset; const Ic = ({ name, ...o }) => I.html(name, o); const [variant, setVariant] = useState('line'); const [size, setSize] = useState(24); const [said, setSaid] = useState('');
  const copy = name => {
    const code = "Kit.iconset.svg('" + name + "', { variant: '" + variant + "', size: " + size + " })";
    const done = () => setSaid('Copied ' + code);
    try { navigator.clipboard.writeText(code).then(done, () => setSaid(code)); } catch (_) { setSaid(code); }
  };
  const seg = (label, opts, v, set) => html`<span class="c-seg" role="group" aria-label=${label}>${opts.map(([k, l]) => html`<button type="button" key=${k} aria-pressed=${v === k} onClick=${() => set(k)}>${l}</button>`)}</span>`;
  return html`<div class="pv6-flow">
    <div class="pv-row">${seg('Variant', [['line', 'Line'], ['fill', 'Fill'], ['duo', 'Two-tone']], variant, setVariant)}${seg('Size', [[16, '16'], [24, '24'], [32, '32']], size, setSize)}</div>
    <ul class="pv6-icons">${I.names.map(n => html`<li key=${n}><button type="button" onClick=${() => copy(n)} aria-label=${'Copy the call for ' + n}>
      <${Ic} name=${n} variant=${variant} size=${size}/><span>${n}</span></button></li>`)}</ul>
    <p class="pv6-cap" role="status" aria-live="polite">${said || html`${I.names.length} icons. Choose one to copy its call.`}</p>
    <${Note}>Icons take the colour of the text around them. Kit.icons from the chrome entry is unchanged; Kit.iconset.get() falls back to it.<//>
  </div>`;
};
})();
/* /part:page.script.previews.b6 */

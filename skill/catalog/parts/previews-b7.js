/* part:page.script.previews.b7 */
/* Live previews of batch 7 (foundations): the state vocabulary, the Glaze depth tokens, the Glaze surfaces, the type roles, the side drawer, the carousel strip, the region frame and keep-state.
   Each mounts the entry's own published file on its own published sample (invented content). Nothing leaves the page. */
(function () {
'use strict';
const { html, useState, useEffect, useRef, useMemo } = window.htmPreact;
const P = window.CatalogPreviews = window.CatalogPreviews || {};
const K = () => window.Kit;
const first = (samples, part) => samples[Object.keys(samples).find(k => k.endsWith('/' + part + '.json'))];
const STYLE = `
.pv7-frame { border-radius: 12px; padding: 16px; background: var(--bg); color: var(--ink); font-family: var(--f-ui); min-width: 0; position: relative; isolation: isolate; }
.pv7-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 16px; align-items: start; min-width: 0; }
.pv7-stack { display: grid; gap: 14px; min-width: 0; }
.pv7-h { margin: 0; font: 600 12px/1.2 var(--f-mono); letter-spacing: .06em; text-transform: uppercase; color: var(--ink-2); }
.pv7-wrap { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: center; min-width: 0; }
.pv7-tbl { display: grid; gap: 6px; min-width: 0; }
.pv7-line { display: grid; grid-template-columns: minmax(0, 1.2fr) auto auto auto auto; gap: 10px 14px; align-items: center; padding: 8px 12px; background: var(--panel); border: 1px solid var(--rule); border-radius: 10px; min-width: 0; }
.pv7-line > span:first-child { font: 600 14px/1.3 var(--f-ui); overflow-wrap: anywhere; min-width: 0; }
.pv7-line .pv7-raw { grid-column: 1 / -1; font: 12px/1.3 var(--f-mono); color: var(--ink-2); }
@media (max-width: 640px) { .pv7-line { grid-template-columns: minmax(0, 1fr) auto; } .pv7-line > span:first-child { grid-column: 1 / -1; } }
.pv7-sw { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.pv7-sw div { display: grid; gap: 6px; padding: 10px; border: 1px solid var(--rule); border-radius: 12px; background: var(--panel); font: 12px/1.3 var(--f-mono); color: var(--ink-2); min-width: 0; overflow-wrap: anywhere; }
.pv7-sw i { display: block; height: 28px; border-radius: 8px; border: 1px solid var(--rule-2); }
.pv7-lit { padding: 20px; border-radius: 26px; background: var(--panel); box-shadow: inset 0 1.5px 0 var(--rim, transparent), inset 0 -22px 26px -24px var(--pool, transparent), var(--glz-sh-1, var(--shadow)); display: grid; gap: 10px; }
.pv7-bead { width: 26px; height: 26px; border-radius: 50%; display: inline-block; vertical-align: middle; }
.pv7-seam { height: 6px; border-radius: 6px; background: linear-gradient(90deg, var(--seam-0, var(--seam)), var(--seam-1, var(--seam)), var(--seam-2, var(--seam)), var(--seam-3, var(--seam)), var(--seam-4, var(--seam))); }
.pv7-log { margin: 0; padding: 12px 14px; border-radius: 12px; background: var(--log-bg, var(--sunk)); color: var(--log-ink, var(--ink)); font: 13px/1.6 var(--f-mono); overflow: auto; }
.pv7-log .ok { color: var(--log-ok, var(--ok)); } .pv7-log .warn { color: var(--log-warn, var(--warn)); } .pv7-log .bad { color: var(--log-bad, var(--danger)); } .pv7-log .dim { color: var(--log-dim, var(--ink-2)); }
.pv7-kinds { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; font: 13px var(--f-ui); }
.pv7-kinds span { display: inline-flex; align-items: center; gap: 6px; }
.pv7-kinds i { width: 14px; height: 14px; border-radius: 50%; border: 1px solid var(--rule); }
.pv7-sheet { position: relative; min-height: 360px; border-radius: 12px; background: var(--bg); overflow: hidden; border: 1px solid var(--rule); isolation: isolate; }
.pv7-sheet .pv7-list { padding: 14px; display: grid; gap: 8px; max-width: 520px; }
.pv7-rec { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 12px; border: 1px solid var(--rule); border-radius: 12px; background: var(--panel); color: var(--ink); font: 14px/1.3 var(--f-ui); text-align: left; cursor: pointer; }
.pv7-rec:hover { background: var(--sunk); } .pv7-rec[aria-expanded="true"] { border-color: var(--accent); }
.pv7-rec:focus-visible { outline: 3px solid var(--seam, var(--accent)); outline-offset: 2px; }
.pv7-rec b { display: block; font-weight: 700; } .pv7-rec small { color: var(--ink-2); font-size: 13px; }
.pv7-dot { width: 12px; height: 12px; flex: none; border-radius: 50%; background: var(--ink-3); } .pv7-info { background: var(--accent); } .pv7-bad { background: var(--danger); } .pv7-ok { background: var(--ok); }
.pv7-chain { margin: 0; padding-left: 1.3em; display: grid; gap: 6px; color: var(--ink-2); font-size: 14px; }
.pv7-card { box-sizing: border-box; height: 100%; padding: 16px; border: 1px solid var(--rule); border-radius: 14px; background: var(--panel); display: grid; gap: 6px; align-content: start; min-width: 0; }
.pv7-card b { font: 600 17px/1.25 var(--f-display, var(--f-ui)); } .pv7-card p { margin: 0; font: 14px/1.5 var(--f-ui); color: var(--ink-2); }
.pv7-card .pv7-n { font: 600 12px var(--f-mono); color: var(--ink-2); }
.pv7-role { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 4px 16px; align-items: baseline; padding: 10px 0; border-top: 1px solid var(--rule-2); min-width: 0; }
.pv7-role code { font: 12px var(--f-mono); color: var(--ink-2); overflow-wrap: anywhere; } .pv7-role small { grid-column: 2; color: var(--ink-2); font: 12px var(--f-ui); }
.pv7-role > :nth-child(2) { margin: 0; min-width: 0; overflow-wrap: anywhere; }
@media (max-width: 520px) { .pv7-role { grid-template-columns: minmax(0, 1fr); } .pv7-role small { grid-column: 1; } }
.pv7-ta { width: 100%; min-height: 84px; box-sizing: border-box; font: 14px/1.5 var(--f-ui); color: var(--ink); background: var(--panel); border: 1px solid var(--rule); border-radius: 10px; padding: 10px 12px; resize: vertical; }
.pv7-ta:focus-visible { outline: 2px solid var(--seam, var(--accent)); outline-offset: 2px; }
.pv7-ro { font: 13px/1.4 var(--f-mono); color: var(--ink-2); }
.pv7-thread { padding: 10px 12px; border: 1px solid var(--rule); border-radius: 12px; background: var(--panel); display: grid; gap: 8px; }
.pv7-thread summary { cursor: pointer; font: 600 14px/1.3 var(--f-ui); } .pv7-thread summary:focus-visible { outline: 2px solid var(--seam, var(--accent)); outline-offset: 2px; }
.pv7-thread p { margin: 0; font: 14px/1.5 var(--f-ui); }
.pv7-mini { min-height: 34px; padding: 0 14px; border: 1px solid var(--rule); border-radius: 999px; background: var(--panel); color: var(--ink); font: 600 13px var(--f-ui); cursor: pointer; }
.pv7-mini:focus-visible { outline: 2px solid var(--seam, var(--accent)); outline-offset: 2px; }
`;
if (!document.querySelector('style[data-pv="b7"]')) { const st = document.createElement('style'); st.dataset.pv = 'b7'; st.textContent = STYLE; document.head.append(st); }
const Seg = ({ label, value, set, items }) => html`<span class="c-seg" role="group" aria-label=${label}>${items.map(([k, l]) => html`<button type="button" key=${k} aria-pressed=${value === k} onClick=${() => set(k)}>${l}</button>`)}</span>`;
function useMount(fn, deps) {
  const ref = useRef(null);
  useEffect(() => { if (!ref.current) return; const h = fn(ref.current); return () => { if (h && h.destroy) h.destroy(); }; }, deps);
  return ref;
}
// the depth-only tokens of the Glaze depth theme (those Glaze itself lacks), for a stage theme that has none
function useDepth(on) {
  const [st, setSt] = useState('');
  useEffect(() => {
    if (!on) { setSt(''); return; } let off = false;
    Promise.all([window.CatalogFiles.json('kit/themes/glaze.json'), window.CatalogFiles.json('kit/themes/glaze-depth.json')]).then(([g, d]) => {
      if (off) return; const dark = document.documentElement.dataset.theme === 'dark' || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
      void dark; const m = {}; [d.light].forEach(x => Object.keys(x).forEach(k => { if (!(k in g.light)) m[k] = x[k]; })); setSt({ light: m, dark: Object.fromEntries(Object.keys(d.dark).filter(k => !(k in g.dark) || !(k in g.light)).map(k => [k, d.dark[k]])) });
    }).catch(() => {});
    return () => { off = true; };
  }, [on]);
  return st;
}
const styleOf = (m, dark) => m ? Object.entries(Object.assign({}, m.light, dark ? m.dark : {})).map(([k, v]) => k + ':' + v).join(';') : '';

// ---------------------------------------------------------------- kit.vocab
P['kit.vocab'] = ({ samples }) => {
  const d = first(samples, 'vocab');
  const [style, setStyle] = useState('box');
  const ready = useMemo(() => { K().vocab.define(d.enums); return true; }, [d]);
  const lanes = useMount(el => {
    el.textContent = '';
    const row = document.createElement('div'); row.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px 18px';
    d.lanes.counts && Object.entries(d.lanes.counts).forEach(([v, n]) => { const h = K().vocab.head(d.lanes.enum, v, { count: n }); if (h) row.append(h); });
    el.append(row);
  }, [ready]);
  const key = useMount(el => K().vocab.key(el, { enum: 'batch', mark: 'tile' }), [ready]);
  const key2 = useMount(el => K().vocab.key(el, { enum: 'order', mark: 'pill' }), [ready]);
  const Cell = ({ fn, en, v, o }) => { const r = useMount(el => { const n = K().vocab[fn](en, v, o); if (n) el.append(n); else el.dataset.silent = 'true'; }, [ready, style]); return html`<span ref=${r} style="display:inline-flex"></span>`; };
  const get = (en, v) => K().vocab.get(en, v);
  return html`<div class="pv7-frame pv7-stack">
    <div class="pv7-wrap"><span class="pv7-h">Tile style</span><${Seg} label="Tile style" value=${style} set=${setStyle} items=${[['box', 'Hand-drawn box'], ['text', 'Terminal character']]}/></div>
    <div class="pv7-tbl" role="list" aria-label="Rows drawn from the table">
      ${d.rows.map(r => {
        const row = get(r.enum, r.value);
        return html`<div class="pv7-line" role="listitem" key=${r.name} data-vo-tone=${row ? row.tone : 'neutral'}>
          <span>${r.name}</span>
          <${Cell} fn="pill" en=${r.enum} v=${r.value}/><${Cell} fn="chip" en=${r.enum} v=${r.value} o=${{ unknown: 'skip' }}/><${Cell} fn="orb" en=${r.enum} v=${r.value} o=${{ size: 'md', label: true, unknown: 'skip' }}/><${Cell} fn="tile" en=${r.enum} v=${r.value} o=${{ style, unknown: 'skip' }}/>
          <span class="pv7-raw">${r.enum} / ${r.value}${row === null ? ' : silent in the table, nothing is drawn' : row === undefined ? ' : not in the table, flagged instead of hidden' : ''}</span>
        </div>`;
      })}
    </div>
    <div class="pv7-grid">
      <div class="pv7-stack"><p class="pv7-h">Lane heads (counts from the sample)</p><div ref=${lanes}></div></div>
      <div class="pv7-stack"><p class="pv7-h">Key of the batch enum, tiles (the silent value is left out)</p><div ref=${key}></div><p class="pv7-h">Key of the order enum, pills</p><div ref=${key2}></div></div>
    </div>
  </div>`;
};

// ---------------------------------------------------------------- theme.glaze-depth
P['theme.glaze-depth'] = ({ theme }) => {
  const names = ['--rim', '--pool', '--well', '--edge', '--edge-gold', '--lac-rim', '--hi', '--lo', '--sunk-2', '--gold'];
  const beads = [['ok', 'Fired'], ['warn', 'Too fast'], ['danger', 'Cracked'], ['info', 'Firing'], ['wait', 'Waiting']];
  return html`<div class="pv7-frame pv7-stack">
    <div class="pv7-grid">
      <div class="pv7-lit"><p class="pv7-h">A lit rim and a pooled foot</p><b style="font:600 20px var(--f-display)">Tenmoku tea bowl</b><span style="color:var(--ink-2);font:14px var(--f-ui)">The glaze gathers darker where it pools at the foot.</span></div>
      <div class="pv7-stack"><p class="pv7-h">The gold seam, five stops</p><div class="pv7-seam"></div>
        <p class="pv7-h">Neutral kind greys</p><div class="pv7-kinds">${[1, 2, 3, 4].map(n => html`<span key=${n}><i style=${'background:var(--kind-' + n + ')'}></i>kind ${n}</span>`)}</div></div>
    </div>
    <div class="pv7-stack"><p class="pv7-h">A bead, its soft tint and its ink, for each meaning</p>
      <div class="pv7-wrap">${beads.map(([k, l]) => html`<span key=${k} style=${'display:inline-flex;align-items:center;gap:8px;padding:6px 12px 6px 8px;border-radius:999px;background:var(--' + k + '-soft);color:var(--' + k + '-ink);font:600 13px var(--f-ui)'}><i class="pv7-bead" style=${'background:var(--' + k + '-bead);width:16px;height:16px'}></i>${l}</span>`)}</div>
      <p style="margin:0;color:var(--ink-2);font:13px/1.5 var(--f-ui);max-width:64ch">Beads are for fills with a glyph or a word beside them. The plain --ok, --warn, --danger, --info and --wait stay the text-safe values.</p></div>
    <div class="pv7-stack"><p class="pv7-h">A log block that stays dark</p><div class="pv7-log" role="log" tabindex="0" aria-label="Sample log"><div><span class="dim">10:02</span> <span class="ok">kiln two reached 1,280</span></div><div><span class="dim">10:41</span> <span class="warn">cooling faster than the program</span></div><div><span class="dim">11:03</span> <span class="bad">element 3 fault, firing stopped</span></div></div></div>
    <div class="pv7-stack"><p class="pv7-h">Depth tokens as swatches</p><div class="pv7-sw">${names.map(n => html`<div key=${n}><i style=${'background:var(' + n + ')'}></i>${n}</div>`)}</div></div>
  </div>`;
};

// ---------------------------------------------------------------- kit.glaze-surfaces
P['kit.glaze-surfaces'] = ({ samples, dark }) => {
  const d = first(samples, 'glaze-surfaces');
  const [depth, setDepth] = useState('on');
  const [fleck, setFleck] = useState('on');
  const dp = useDepth(depth === 'on');
  const sw = useRef(null), seg = useRef(null), busyB = useRef(null);
  const [sv, setSv] = useState(true), [sg, setSg] = useState('day'), [busy, setBusy] = useState(false);
  useEffect(() => { K().glaze.defs(); }, []);
  useEffect(() => { const h = K().glaze.switchOf(sw.current, { checked: true, onChange: setSv }); return () => h.destroy(); }, []);
  useEffect(() => { const h = K().glaze.segOf(seg.current, { value: 'day', onChange: setSg }); return () => h.destroy(); }, []);
  useEffect(() => { if (busyB.current) K().glaze.busy(busyB.current, busy, { label: 'Saving' }); }, [busy]);
  const tone = { ok: 'kit-is-ok', warn: 'kit-is-warn', bad: 'kit-is-bad', info: 'kit-is-info', wait: 'kit-is-wait', idle: 'kit-is-idle' };
  const fr = useRef(null);
  useEffect(() => { if (fleck !== 'on' || !fr.current) return; const s = K().glaze.speck(fr.current); return () => s.remove(); }, [fleck]);
  const toggleBusy = () => { setBusy(true); setTimeout(() => setBusy(false), 1600); };
  return html`<div class="pv7-stack">
    <div class="pv7-wrap"><span class="pv7-h">Depth tokens</span><${Seg} label="Depth tokens" value=${depth} set=${setDepth} items=${[['on', 'Glaze depth'], ['off', 'None (flat)']]}/>
      <span class="pv7-h">Fleck layer</span><${Seg} label="Fleck layer" value=${fleck} set=${setFleck} items=${[['on', 'On'], ['off', 'Off']]}/></div>
    <div class="pv7-frame pv7-stack" style=${styleOf(dp, dark)}>
      <div ref=${fr} style="position:absolute;inset:0;overflow:hidden;border-radius:12px;pointer-events:none"></div>
      <div class="pv7-wrap" style="position:relative;z-index:1">${d.orbs.map(o => html`<span key=${o.word} class=${'kit-chip ' + tone[o.tone]}><i class=${'kit-orb' + (o.run ? ' kit-run' : '') + (o.ring ? ' kit-ring' : '')}></i>${o.word}</span>`)}</div>
      <div class="kit-btn-row" style="position:relative;z-index:1"><button type="button" class="kit-btn kit-primary">Start firing</button><button type="button" class="kit-btn">Save a draft</button><button type="button" class="kit-btn kit-ghost">Cancel</button><button type="button" class="kit-btn kit-danger">Empty the kiln</button><button type="button" class="kit-btn kit-sm" ref=${busyB} onClick=${toggleBusy}>Try busy</button></div>
      <div class="pv7-grid" style="position:relative;z-index:1">
        <div class="kit-card kit-stack" style="display:grid;gap:14px"><label class="kit-field" for="pv7-peak"><span>Peak temperature</span><input id="pv7-peak" class="kit-input" value="1,280" autocomplete="off"/><small>Use the cone pack reading, not the controller.</small></label>
          <div class="pv7-wrap"><button type="button" ref=${sw} aria-label="Hold at peak"></button><span style="font:600 14px var(--f-ui)">Hold at peak: ${sv ? 'on' : 'off'}</span></div>
          <div class="pv7-wrap"><div ref=${seg} aria-label="Firing time"><button type="button" data-id="day">Day</button><button type="button" data-id="night">Night</button><button type="button" data-id="weekend">Weekend</button></div><span class="pv7-ro">${sg}</span></div></div>
        <div class="kit-card" style="display:grid;gap:12px"><b style="font:600 18px var(--f-display)">Kiln two</b>
          <dl class="kit-facts">${d.facts.map(f => html`<div key=${f.k}><dt>${f.k}</dt><dd>${f.v}</dd></div>`)}</dl></div>
      </div>
      <div class="pv7-stack" style="position:relative;z-index:1">${d.rows.map(r => html`<button type="button" key=${r.title} class=${'kit-row ' + tone[r.tone]}><span class="kit-ava"><i class="kit-orb kit-md"></i></span><span><b class="t">${r.title}</b><span class="s">${r.sub}</span></span></button>`)}</div>
      <div class="kit-empty" style="position:relative;z-index:1"><b>Nothing on the shelf yet.</b>Pieces appear here when they come out of the glaze firing.</div>
    </div>
  </div>`;
};

// ---------------------------------------------------------------- kit.type-roles
P['kit.type-roles'] = ({ samples }) => {
  const d = first(samples, 'type-roles');
  return html`<div class="pv7-frame kit-tr" role="table" aria-label="The twenty type roles">
    ${d.roles.map(([role, use, text]) => html`<div class="pv7-role" role="row" key=${role}>
      <code role="cell">.kit-t-${role}</code><p class=${'kit-t-' + role} role="cell">${text}</p><small>${use}</small></div>`)}
  </div>`;
};

// ---------------------------------------------------------------- kit.drawer
P['kit.drawer'] = ({ samples }) => {
  const d = first(samples, 'drawer');
  const [modal, setModal] = useState('no');
  const [openId, setOpenId] = useState(null);
  const sheet = useRef(null), hd = useRef(null);
  const handle = useRef(null);
  const tone = { info: 'kit-is-info', bad: 'kit-is-bad', ok: 'kit-is-ok' };
  useEffect(() => () => { if (handle.current) handle.current.close(); }, []);
  const show = (r, ev) => {
    const kd = K().drawer;
    const head = document.createElement('div'); head.style.cssText = 'display:flex;align-items:center;gap:12px;min-width:0';
    head.innerHTML = '<span class="pv7-ava" style="width:44px;height:44px;border-radius:50%;display:grid;place-items:center;flex:none;background:var(--sunk);border:1px solid var(--rule);font:700 17px var(--f-display)"></span><div style="min-width:0"><h2 class="kit-dr-title" style="font-size:1.25rem"></h2><div class="pv7-sub" style="color:var(--ink-2);font:14px var(--f-ui)"></div></div>';
    head.querySelector('span').textContent = r.name.slice(0, 1); head.querySelector('h2').textContent = r.name; head.querySelector('.pv7-sub').textContent = r.sub;
    const body = document.createElement('div'); body.style.cssText = 'display:grid;gap:16px';
    const dl = document.createElement('dl'); dl.className = 'pv7-facts'; dl.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin:0';
    r.facts.forEach(([k, v]) => { const w = document.createElement('div'); w.innerHTML = '<dt style="font:600 13px var(--f-ui);color:var(--ink-2)"></dt><dd style="margin:2px 0 0;font:600 15px var(--f-ui)"></dd>'; w.firstChild.textContent = k; w.lastChild.textContent = v; dl.append(w); });
    const ol = document.createElement('ol'); ol.className = 'pv7-chain'; r.chain.forEach(c => { const li = document.createElement('li'); li.textContent = c; ol.append(li); });
    body.append(dl, ol);
    const foot = [Object.assign(document.createElement('button'), { type: 'button', className: 'pv7-mini', textContent: 'Renew' }), Object.assign(document.createElement('button'), { type: 'button', className: 'pv7-mini', textContent: 'Close', onclick: () => handle.current && handle.current.close() })];
    const h = kd.open({ title: r.name, head, body, foot, modal: modal === 'yes', host: sheet.current, opener: ev && ev.currentTarget, focus: !!ev, onClose: () => { if (handle.current === h) { handle.current = null; setOpenId(null); } } });
    handle.current = h;
    setOpenId(r.id);
  };
  useEffect(() => { if (handle.current) { handle.current.close(); } }, [modal]);
  useEffect(() => { const t = setTimeout(() => { if (!handle.current) show(d.records[0], null); }, 0); return () => clearTimeout(t); }, [modal]);
  return html`<div class="pv7-stack">
    <div class="pv7-wrap"><span class="pv7-h">Mode</span><${Seg} label="Mode" value=${modal} set=${setModal} items=${[['no', 'Beside the page'], ['yes', 'Modal with a scrim']]}/><span class="pv7-ro">Press a record. Escape closes it and focus goes back to the record.</span></div>
    <div class="pv7-sheet" ref=${sheet}><div class="pv7-list" role="list" aria-label="Tool loans">
      ${d.records.map(r => html`<button type="button" role="listitem" class="pv7-rec" key=${r.id} aria-expanded=${openId === r.id} onClick=${e => show(r, e)}><i class=${'pv7-dot pv7-' + r.tone}></i><span style="min-width:0"><b>${r.name}</b><small>${r.sub}</small></span></button>`)}
    </div></div>
  </div>`;
};

// ---------------------------------------------------------------- layout.carousel
P['layout.carousel'] = ({ samples }) => {
  const d = first(samples, 'carousel');
  const [range, setRange] = useState('');
  const card = (p) => { const w = document.createElement('div'); w.className = 'pv7-card'; w.innerHTML = '<span class="pv7-n"></span><b></b><p></p><span class="pv7-st"></span>'; w.children[0].textContent = 'Phase ' + p.n; w.children[1].textContent = p.title; w.children[2].textContent = p.text; K().vocab && w.lastChild.append(K().vocab.chip('state', p.state) || ''); return w; };
  const a = useMount(el => K().carousel.mount(el, { items: d.phases, render: card, label: 'Project phases', onVisible: (x, y) => setRange(x < 0 ? '' : 'Showing phases ' + (x + 1) + ' to ' + (y + 1) + ' of ' + d.phases.length) }), []);
  const b = useMount(el => K().carousel.mount(el, { items: d.few, render: card, label: 'Two phases' }), []);
  return html`<div class="pv7-frame pv7-stack">
    <p class="pv7-h">Seven cards: drag with the mouse, use the arrows, or focus the strip and press Left and Right</p>
    <div ref=${a}></div><p class="pv7-ro" aria-live="polite">${range}</p>
    <p class="pv7-h">Two cards: everything fits, so there are no arrows and no fades</p>
    <div ref=${b}></div>
  </div>`;
};

// ---------------------------------------------------------------- pattern.region-frame
P['pattern.region-frame'] = ({ samples }) => {
  const d = first(samples, 'region-frame');
  const [n, setN] = useState(0);
  const ref = useMount(el => {
    el.textContent = '';
    d.regions.forEach(r => {
      const body = [];
      if (r.panel) body.push(K().region.panel({ label: r.panel.label, count: r.panel.count, body: r.panel.items.length ? r.panel.items.map(([a, b]) => { const p = document.createElement('p'); p.style.cssText = 'margin:0;font:14.5px/1.4 var(--f-ui)'; const s = document.createElement('b'); s.textContent = a + ' '; p.append(s, b); return p; }) : K().region.empty({ icon: 'search', title: 'Nobody has asked for seeds yet.', text: 'Wanted seeds show up here as people add them.' }) }));
      if (r.empty) body.push(K().region.empty({ icon: r.empty.icon, title: r.empty.title, text: r.empty.text, action: { label: r.empty.action, onClick: () => setN(x => x + 1) } }));
      el.append(K().region.section({ header: { title: r.title, lede: r.lede, eyebrow: r.eyebrow, num: r.num, icon: r.icon }, body }));
    });
  }, []);
  return html`<div class="pv7-frame pv7-stack"><div ref=${ref} style="display:grid;gap:28px"></div><p class="pv7-ro" aria-live="polite">${n ? 'The empty state action was pressed ' + n + ' time' + (n > 1 ? 's' : '') + '.' : 'Press the action in the empty state.'}</p></div>`;
};

// ---------------------------------------------------------------- kit.keep-state
P['kit.keep-state'] = ({ samples }) => {
  const d = first(samples, 'keep-state');
  const [on, setOn] = useState('on');
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState(false);
  const root = useRef(null), redraw = useRef(null);
  const onRef = useRef(on); onRef.current = on;
  const draw = (t) => {
    const r = root.current; r.textContent = '';
    const msg = d.pokes[t % d.pokes.length];
    const live = document.createElement('p'); live.className = 'pv7-ro'; live.textContent = 'Redraw ' + t + ': ' + msg; r.append(live);
    d.threads.forEach(th => {
      const det = document.createElement('details'); det.className = 'pv7-thread'; det.setAttribute('data-keep', 'open-' + th.id);
      const s = document.createElement('summary'); s.textContent = th.title + ' (' + (th.replies.length + (t % 3 === 0 ? 0 : 0)) + ' replies)'; det.append(s);
      th.replies.forEach(x => { const p = document.createElement('p'); p.textContent = x; det.append(p); });
      const ta = document.createElement('textarea'); ta.className = 'pv7-ta'; ta.id = 'pv7-reply-' + th.id; ta.setAttribute('data-keep', 'reply-' + th.id); ta.setAttribute('aria-label', 'Reply to ' + th.title); ta.placeholder = 'Write a reply'; det.append(ta);
      r.append(det);
    });
  };
  useEffect(() => {
    redraw.current = K().keepState.wrap(root.current, draw);
    return () => {};
  }, []);
  useEffect(() => {
    const plain = (t) => draw(t);
    if (paused) return; let t = 0;
    const id = setInterval(() => { t++; setTick(t); (onRef.current === 'on' ? redraw.current : plain)(t); }, 2000);
    return () => clearInterval(id);
  }, [paused]);
  useEffect(() => { draw(0); }, []);
  return html`<div class="pv7-frame pv7-stack">
    <div class="pv7-wrap"><span class="pv7-h">Keep state</span><${Seg} label="Keep state" value=${on} set=${setOn} items=${[['on', 'On'], ['off', 'Off']]}/><button type="button" class="pv7-mini" onClick=${() => setPaused(p => !p)}>${paused ? 'Resume redraws' : 'Pause redraws'}</button></div>
    <p class="pv7-ro">The list below redraws every two seconds with a new line at the top. Open a thread and type a reply: with keep state on, your words, caret and open thread stay; off, they vanish.</p>
    <div ref=${root} style="display:grid;gap:10px"></div>
    <p class="pv7-ro">Redraws so far: ${tick}</p>
  </div>`;
};
})();
/* /part:page.script.previews.b7 */

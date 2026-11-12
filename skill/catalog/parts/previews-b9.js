/* part:page.script.previews.b9 */
/* Live previews of batch 9 (the porcelain visualizations): the trust tree, the lifetime seal, the capability wheel, the dial meter, the expiry runway, the bubble pictures and the pebble map.
   Each mounts the entry's own published file on its own published sample (an invented company, Brindle and Oak); nothing is stored and nothing leaves the page. Tooltips and the drawer are
   appended to the preview's own frame, so they take the stage theme's tokens. Under the Glaze depth theme the parts are lit and pooled; under the others they draw flat. */
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
function useMount(fn, deps) {
  const ref = useRef(null);
  useEffect(() => { if (!ref.current) return; const h = fn(ref.current); return () => { if (h && h.destroy) h.destroy(); }; }, deps || []);
  return ref;
}
const STYLE = `
.pv9-frame { position: relative; min-width: 0; color: var(--ink); font-family: var(--f-ui); display: grid; gap: 16px; }
.pv9-frame { grid-template-columns: minmax(0, 1fr); }
.pv9-frame > * { min-width: 0; }
.pv9-frame.phone { max-width: 390px; }
.pv9-h { margin: 0 0 8px; font: 600 12.5px/1.3 var(--f-mono); color: var(--ink-2); }
.pv9-sec { min-width: 0; }
.pv9-wrap { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; min-width: 0; }
.pv9-seals { display: flex; flex-wrap: wrap; gap: 18px 22px; justify-content: center; }
.pv9-rows { display: grid; gap: 8px; }
.pv9-row { display: flex; align-items: center; gap: 12px; padding: 8px 12px; border-radius: 14px; background: var(--sunk); min-width: 0; }
.pv9-row b { display: block; font: 700 14.5px/1.3 var(--f-ui); overflow-wrap: anywhere; } .pv9-row small { display: block; font: 13px/1.4 var(--f-ui); color: var(--ink-2); overflow-wrap: anywhere; }
.pv9-row > span:nth-child(2) { min-width: 0; flex: 1 1 auto; }
.pv9-tiles { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 170px), 1fr)); }
.pv9-log { margin: 0; padding: 7px 10px; border-radius: 8px; background: var(--sunk); font: 13px/1.4 var(--f-ui); color: var(--ink-2); overflow-wrap: anywhere; }
.pv9-log b { color: var(--ink); }
.pv9-list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.pv9-list li { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; padding: 6px 12px; border-radius: 10px; background: var(--sunk); font: 14px/1.4 var(--f-ui); }
.pv9-list li b { font-weight: 700; } .pv9-list li span { color: var(--ink-2); font-size: 13px; }
.pv9-btn { min-height: 34px; padding: 0 14px; border: 1px solid var(--rule); border-radius: 999px; background: var(--panel); color: var(--ink); font: 600 13px var(--f-ui); cursor: pointer; }
.pv9-btn:hover { border-color: var(--ink-2); } .pv9-btn:focus-visible { outline: 3px solid var(--seam, var(--accent)); outline-offset: 2px; }
.pv9-drawer-p { margin: 0; color: var(--ink-2); font: 14px/1.5 var(--f-ui); }
.pv9-stage { min-height: 120px; }
`;
if (!document.querySelector('style[data-pv="b9"]')) { const st = document.createElement('style'); st.dataset.pv = 'b9'; st.textContent = STYLE; document.head.append(st); }
const Seg = ({ label, value, set, items }) => html`<span class="c-seg" role="group" aria-label=${label}>${items.map(([k, l]) => html`<button type="button" key=${k} aria-pressed=${value === k} onClick=${() => set(k)}>${l}</button>`)}</span>`;
const Width = ({ v, set }) => html`<${Seg} label="Frame width" value=${v} set=${set} items=${[['full', 'Full width'], ['phone', '390 px']]}/>`;
const Note = ({ children }) => html`<p class="pv-sim"><b>Preview</b> ${children}</p>`;
const Sec = ({ title, children }) => html`<section class="pv9-sec"><p class="pv9-h">${title}</p>${children}</section>`;

// ---------------------------------------------------------------- viz.seal
P['viz.seal'] = ({ samples, theme }) => {
  useFonts(theme); const d = first(samples, 'seal'); const [w, setW] = useState('full'); const [say, setSay] = useState(null);
  const seals = useMount(el => {
    el.textContent = '';
    d.items.forEach(it => el.append(K().seal.make(it, { actions: d.actions, onAction: (key, item) => setSay('<b>' + (d.actions.find(a => a.key === key) || {}).label + '</b> on ' + item.label), onOpen: item => setSay('<b>Open</b> ' + item.label + ': ' + K().seal.text(item)) })));
  }, [w]);
  const rows = useMount(el => {
    el.textContent = ''; d.rows.forEach(r => {
      const it = d.items.find(i => i.id === r.id), row = document.createElement('div'); row.className = 'pv9-row'; const t = document.createElement('span'); t.innerHTML = '<b></b><small></small>';
      t.firstChild.textContent = r.label; t.lastChild.textContent = r.sub + ', ' + K().seal.text(it); row.append(K().seal.mini(it), t); el.append(row);
    });
  }, [w]);
  const key = useMount(el => { K().seal.parts({ left: 1 }); return K().vocab.key(el, { enum: 'life', mark: 'pill' }); }, [w]);
  return html`<div class="pv9-stack pv-stack">
    <div class="pv-row"><${Width} v=${w} set=${setW}/></div>
    <div class=${'pv9-frame' + (w === 'phone' ? ' phone' : '')} key=${w}>
      <${Sec} title="Nine seals: the ring is the life left, the crackle spreads with age"><div class="pv9-seals" ref=${seals}></div><//>
      <p class="pv9-log" aria-live="polite" dangerouslySetInnerHTML=${{ __html: say || 'Hover or focus a seal to fan out its actions; press it to open it.' }}></p>
      <${Sec} title="The mini seal in a row"><div class="pv9-rows" ref=${rows}></div><//>
      <${Sec} title="The life states, from Kit.vocab"><div ref=${key}></div><//>
    </div>
    <${Note}>Compare the seal for 361 days with the one for 9 days: the ring is shorter and more cracks have spread over the glaze. The ended ones say it in words (revoked, replaced, end unknown). Items are invented.<//>
  </div>`;
};

// ---------------------------------------------------------------- viz.dial-meter
P['viz.dial-meter'] = ({ samples, theme }) => {
  useFonts(theme); const d = first(samples, 'dial-meter'); const [w, setW] = useState('full'); const [say, setSay] = useState(null); const dr = useRef(null);
  const tiles = useMount(el => {
    el.textContent = ''; const hs = d.tiles.map(t => { const h = K().dialMeter.make(Object.assign({}, t, { onAction: key => setSay('<b>' + key + '</b> on ' + t.title) })); el.append(h.el); return h; });
    return { destroy() { hs.forEach(h => h.destroy()); } };
  }, [w]);
  const drain = useMount(el => {
    el.textContent = ''; const h = K().dialMeter.drain(Object.assign({}, d.drain, { onAction: key => setSay('<b>' + key + '</b> on ' + d.drain.title), onEnd: () => setSay('The ring ran out: <b>sealed</b>') }));
    dr.current = h; el.append(h.el); return h;
  }, [w]);
  return html`<div class="pv9-stack pv-stack">
    <div class="pv-row"><${Width} v=${w} set=${setW}/></div>
    <div class=${'pv9-frame' + (w === 'phone' ? ' phone' : '')} key=${w}>
      <${Sec} title="Value, segments and actions (hover or focus a tile with actions)"><div class="pv9-tiles" ref=${tiles}></div><//>
      <${Sec} title="Drain: the ring empties as time runs out, and warns in the last 20 seconds">
        <div class="pv9-wrap"><div ref=${drain} style="width: min(100%, 190px)"></div>
          <div class="pv9-wrap"><button type="button" class="pv9-btn" onClick=${() => dr.current && dr.current.reset(120)}>Start at 2 minutes</button><button type="button" class="pv9-btn" onClick=${() => dr.current && dr.current.reset(24)}>Start at 24 seconds</button></div></div><//>
      <p class="pv9-log" aria-live="polite" dangerouslySetInnerHTML=${{ __html: say || 'The number is real text, and every tile says its value, unit and caption in its accessible name.' }}></p>
    </div>
    <${Note}>The bead sits at the end of each arc. The segmented tile splits by kind with 6 degree gaps and names the counts underneath. Figures are invented.<//>
  </div>`;
};

// ---------------------------------------------------------------- viz.capability-wheel
P['viz.capability-wheel'] = ({ samples, theme }) => {
  useFonts(theme); const d = first(samples, 'capability-wheel'); const [w, setW] = useState('full');
  const ref = useMount(el => K().capabilityWheel.mount(el, { caps: d.caps, wheels: d.wheels, barLabel: 'Light up the roles that can' }), [w]);
  return html`<div class="pv9-stack pv-stack">
    <div class="pv-row"><${Width} v=${w} set=${setW}/></div>
    <div class=${'pv9-frame' + (w === 'phone' ? ' phone' : '')} key=${w}><div ref=${ref}></div></div>
    <${Note}>Eight abilities on each wheel. A ticked bead on a gold seam is allowed; a dashed bead is not. Press an ability to dim the roles that lack it; the card then says so in words. Roles are invented.<//>
  </div>`;
};

// ---------------------------------------------------------------- viz.runway
P['viz.runway'] = ({ samples, theme }) => {
  useFonts(theme); const d = first(samples, 'runway'); const [w, setW] = useState('full'); const [picked, setPicked] = useState(null); const frame = useRef(null); const h = useRef(null);
  const ref = useMount(el => { const x = K().runway.mount(el, { items: d.items, lanes: d.lanes, label: 'When certificates end over the next twelve months', host: frame.current, onPick: (ids, info) => { setPicked({ ids, info }); x.select(ids); } }); h.current = x; return x; }, [w]);
  const key = useMount(el => { K().vocab.key(el, { enum: 'life', values: ['ok', 'soon', 'urgent'], mark: 'pill' }); }, [w]);
  const lanes = d.lanes, items = picked ? d.items.filter(i => picked.ids.includes(i.id)) : [];
  return html`<div class="pv9-stack pv-stack">
    <div class="pv-row"><${Width} v=${w} set=${setW}/></div>
    <div class=${'pv9-frame' + (w === 'phone' ? ' phone' : '')} ref=${frame} key=${w}>
      <div ref=${ref}></div>
      <div class="pv9-wrap"><span class="pv9-h" style="margin:0">Bubble ring and mark: the worst state in the bubble</span><div ref=${key}></div></div>
      <${Sec} title=${picked ? 'Picked: ' + picked.info.count + ' in ' + (lanes.find(l => l.key === picked.info.lane) || {}).label : 'Pick a bubble to filter the list'}>
        <ul class="pv9-list" aria-live="polite">${items.length ? items.map(i => html`<li key=${i.id}><b>${i.label}</b><span>${i.daysLeft} days left</span></li>`) : html`<li><span>Nothing picked. Click or press Enter on a bubble.</span></li>`}</ul><//>
    </div>
    <${Note}>Bubble area follows the count; the cluster in month three holds eight clients ending within 20 days of each other. The tip lists the first six names. Months follow your locale. Items are invented.<//>
  </div>`;
};

// ---------------------------------------------------------------- viz.bubbles
P['viz.bubbles'] = ({ samples, theme }) => {
  useFonts(theme); const d = first(samples, 'bubbles'); const [w, setW] = useState('full'); const [lay, setLay] = useState('clusters'); const [flt, setFlt] = useState('all'); const frame = useRef(null); const h = useRef(null); const [picked, setPicked] = useState(null);
  const ref = useMount(el => { const x = K().bubbles.mount(el, { records: d.records, groups: d.groups, scale: d.scale, layout: lay, host: frame.current, label: 'Shop certificates as bubbles',
    lens: r => ({ title: r.label, sub: r.sub + ', ' + (r.value > 0 ? r.value + ' days left' : 'no days left'), actions: [{ key: 'open', label: 'Open' }, { key: 'renew', label: 'Renew' }] }),
    onPick: r => setPicked(r.label), onAction: (k, r) => setPicked(r.label + ': ' + k) }); h.current = x; return x; }, [w]);
  useEffect(() => { if (h.current) h.current.setLayout(lay); }, [lay]);
  useEffect(() => { if (h.current) h.current.setFilter(flt === 'all' ? null : flt === 'soon' ? r => r.value > 0 && r.value <= 90 : r => r.group === 'server'); }, [flt]);
  return html`<div class="pv9-stack pv-stack">
    <div class="pv-row"><${Width} v=${w} set=${setW}/><${Seg} label="Picture" value=${lay} set=${setLay} items=${[['clusters', 'Clusters'], ['lanes', 'Lanes']]}/>
      <${Seg} label="Filter" value=${flt} set=${setFlt} items=${[['all', 'All'], ['soon', 'Ending within 90 days'], ['server', 'Servers only']]}/></div>
    <div class=${'pv9-frame' + (w === 'phone' ? ' phone' : '')} ref=${frame} key=${w}><div ref=${ref}></div>
      <p class="pv9-log" aria-live="polite"><b>Picked:</b> ${picked || 'none'}</p></div>
    <${Note}>Thirty records in four groups. Lanes put each record at its value on a square-root axis (the ticks use the same function, and the axis says so); bubbles that would overlap step up and down. Hover or Tab to a bubble to fill the lens line. Records the filter leaves out dim. Items are invented.<//>
  </div>`;
};

// ---------------------------------------------------------------- viz.pebble-map
P['viz.pebble-map'] = ({ samples, theme }) => {
  useFonts(theme); const d = first(samples, 'pebble-map'); const [w, setW] = useState('full'); const [lay, setLay] = useState('estate'); const h = useRef(null); const [picked, setPicked] = useState(null);
  const cfg = l => l === 'estate' ? { layout: 'estate', hub: d.estate.hub, holders: d.estate.holders, nodes: d.estate.nodes } : l === 'fan' ? { layout: 'fan', source: d.fan.source, nodes: d.fan.nodes } : { layout: 'ring', nodes: d.ring.nodes };
  const ref = useMount(el => { const x = K().pebbleMap.mount(el, Object.assign({ label: 'Machines and the links between them', onPick: n => setPicked(n.label) }, cfg(lay))); h.current = x; return x; }, [w]);
  useEffect(() => { if (h.current) h.current.update(cfg(lay)); }, [lay]);
  return html`<div class="pv9-stack pv-stack">
    <div class="pv-row"><${Width} v=${w} set=${setW}/><${Seg} label="Layout" value=${lay} set=${setLay} items=${[['estate', 'Estate'], ['fan', 'Primary and standbys'], ['ring', 'Ring of peers']]}/></div>
    <div class=${'pv9-frame' + (w === 'phone' ? ' phone' : '')} key=${w}><div ref=${ref}></div><p class="pv9-log" aria-live="polite"><b>Opened:</b> ${picked || 'none'}</p></div>
    <${Note}>Beads of light flow along a seam whose link is up; a cut seam is dashed with a cross, a connecting one has a turning ring. Hover or Tab to a seam for its words. At 390 px, or in any narrow frame, the tall drawing replaces the wide one. Machines are invented.<//>
  </div>`;
};

// ---------------------------------------------------------------- viz.trust-tree
P['viz.trust-tree'] = ({ samples, theme }) => {
  useFonts(theme); const d = first(samples, 'trust-tree'); const [w, setW] = useState('full'); const frame = useRef(null); const h = useRef(null); const [opened, setOpened] = useState(null);
  const withFacts = d.leaves.map(l => Object.assign({}, l, { caps: (d.kinds[l.kind] || {}).caps, facts: [['Issued', l.issued, 'read'], [l.state === 'expired' ? 'Expired' : 'Expires', l.until, l.inferred ? 'inferred' : 'read'], ['Name', l.label, 'read', true]] }));
  const ref = useMount(el => {
    const x = K().trustTree.mount(el, { authorities: d.authorities, leaves: withFacts, kinds: d.kinds, groups: d.groups, holders: d.holders, holdersNote: d.holdersNote, host: frame.current,
      titles: { tree: { title: 'The family tree', lede: 'Every certificate in the company, drawn as who signed whom. One root, two authorities under it, and a separate shell authority that answers to nobody.' },
        limits: { title: 'Who may sign what', lede: 'Each authority is boxed in. These are the limits written into it, or into the tool that uses it.' }, lanes: { title: 'Who and what holds them', lede: 'The same items, grouped by the thing they belong to.' } },
      onOpen: (id, opener) => {
        setOpened(id);
        const a = d.authorities.find(z => z.id === id), kc = a ? a.caps : (withFacts.find(z => z.id === id) || {}).caps || [];
        const body = document.createElement('div'); body.style.cssText = 'display:grid;gap:14px'; body.append(x.detailEl(id));
        if (K().capabilityWheel) { const wh = K().capabilityWheel.make(d.capsList, kc, { name: a ? a.name : id, glyph: a ? a.glyph : 'ring', small: true }); const wrap = document.createElement('div'); const hd = document.createElement('h4'); hd.textContent = 'What it may do'; hd.style.cssText = 'margin:0 0 6px;font:700 .95rem var(--f-ui)'; wrap.append(hd, wh); body.append(wrap); }
        K().drawer.open({ title: a ? a.name : id, body, host: frame.current, opener, focus: !!opener, onClose: () => { x.pin(null); setOpened(null); } });
      } });
    h.current = x; return { destroy() { if (K().drawer) K().drawer.close(); x.destroy(); } };
  }, [w]);
  return html`<div class="pv9-stack pv-stack">
    <div class="pv-row"><${Width} v=${w} set=${setW}/><button type="button" class="pv9-btn" onClick=${() => h.current && h.current.focus('web')}>Focus the web authority</button><span class="pv9-log" style="margin:0">Opened: <b>${opened || 'none'}</b></span></div>
    <div class=${'pv9-frame' + (w === 'phone' ? ' phone' : '')} ref=${frame} key=${w} style="min-height: 520px"><div ref=${ref}></div></div>
    <${Note}>Hover or Tab onto any medallion: its chain up to the root thickens and glows and a sentence narrates it. Arrow keys walk the tree (Up to the parent, Down to the first child), Enter opens the detail in a drawer. The buttons above the tree light everything of one kind; the subject pills light what one thing holds. At 390 px the drawing becomes a nested list. All names are invented.<//>
  </div>`;
};
})();
/* /part:page.script.previews.b9 */

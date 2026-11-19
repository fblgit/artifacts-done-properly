/* part:page.script.previews.b10 */
/* Live previews of batch 10 (interaction patterns): the confirm sheet, the jobs tray, the needs-you list, the timed reveal, the write-only secret field, the capability picker, the row with a main
   action and a menu, and facets with a batch bar. Each mounts the entry's own published file on its own published sample (invented content). Nothing leaves the page: the jobs are scripted in memory,
   the secret field sends nowhere and keeps nothing, the revealed values are made-up strings in the sample.
   Every preview has a "Depth tokens" switch: Glaze depth gives the porcelain parts their lit rims and beads on any stage theme; None shows the flat fallback. */
(function () {
'use strict';
const { html, useState, useEffect, useRef } = window.htmPreact;
const P = window.CatalogPreviews = window.CatalogPreviews || {};
const K = () => window.Kit;
const first = (samples, part) => samples[Object.keys(samples).find(k => k.endsWith('/' + part + '.json'))];
const clone = x => JSON.parse(JSON.stringify(x));
const STYLE = `
.pv10-frame { border-radius: 12px; padding: 16px; background: var(--bg); color: var(--ink); font-family: var(--f-ui); min-width: 0; position: relative; isolation: isolate; display: grid; gap: 14px; align-content: start; }
.pv10-tall { min-height: 700px; }
.pv10-h { margin: 0; font: 600 12px/1.2 var(--f-mono); letter-spacing: .06em; text-transform: uppercase; color: var(--ink-2); }
.pv10-bar { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; min-width: 0; }
.pv10-ro { margin: 0; font: 13px/1.5 var(--f-mono); color: var(--ink-2); max-width: 70ch; overflow-wrap: anywhere; }
.pv10-note { margin: 0; font: 14px/1.5 var(--f-ui); color: var(--ink-2); max-width: 66ch; }
.pv10-btns { display: flex; flex-wrap: wrap; gap: 8px; }
.pv10-tray { position: absolute; right: 16px; bottom: 16px; z-index: 1; padding: 8px 14px; border-radius: 999px; background: var(--panel); border: 1px dashed var(--rule); color: var(--ink-2); font: 600 13px var(--f-ui); }
.pv10-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 16px; align-items: start; min-width: 0; }
.pv10-card { display: grid; gap: 4px; padding: 16px; border: 1px solid var(--rule); border-radius: var(--glz-r-l, 16px); background: var(--panel); min-width: 0; min-height: 120px; align-content: start; box-shadow: inset 0 1.5px 0 var(--rim, transparent); }
.pv10-card h3 { margin: 0; font: 700 1.05rem/1.25 var(--f-display, var(--f-ui)); } .pv10-card p { margin: 0; color: var(--ink-2); font-size: 14px; }
.pv10-sw { display: inline-flex; align-items: center; gap: 8px; font: 600 13.5px var(--f-ui); }
`;
if (!document.querySelector('style[data-pv="b10"]')) { const st = document.createElement('style'); st.dataset.pv = 'b10'; st.textContent = STYLE; document.head.append(st); }
const Seg = ({ label, value, set, items }) => html`<span class="c-seg" role="group" aria-label=${label}>${items.map(([k, l]) => html`<button type="button" key=${k} aria-pressed=${value === k} onClick=${() => set(k)}>${l}</button>`)}</span>`;
function useMount(fn, deps) {
  const ref = useRef(null);
  useEffect(() => { if (!ref.current) return; const h = fn(ref.current); return () => { if (h && h.destroy) h.destroy(); }; }, deps);
  return ref;
}
function useDepth(on) {
  const [st, setSt] = useState('');
  useEffect(() => {
    if (!on) { setSt(''); return; } let off = false;
    Promise.all([fetch('kit/themes/glaze.json').then(r => r.json()), fetch('kit/themes/glaze-depth.json').then(r => r.json())]).then(([g, d]) => {
      if (off) return; const m = {}; Object.keys(d.light).forEach(k => { if (!(k in g.light)) m[k] = d.light[k]; });
      setSt({ light: m, dark: Object.fromEntries(Object.keys(d.dark).filter(k => !(k in g.dark) || !(k in g.light)).map(k => [k, d.dark[k]])) });
    }).catch(() => {});
    return () => { off = true; };
  }, [on]);
  return st;
}
const styleOf = (m, dark) => m ? Object.entries(Object.assign({}, m.light, dark ? m.dark : {})).map(([k, v]) => k + ':' + v).join(';') : '';
// the depth switch and the style it yields for the frame
function useDepthBar(dark) {
  const [depth, setDepth] = useState('on'); const dp = useDepth(depth === 'on');
  const bar = html`<span class="pv10-sw"><span class="pv10-h" id="pv10-dl">Depth tokens</span><${Seg} label="Depth tokens" value=${depth} set=${setDepth} items=${[['on', 'Glaze depth'], ['off', 'None (flat)']]}/></span>`;
  return [bar, styleOf(dp, dark)];
}
const Btn = ({ children, onClick, primary, danger, id }) => html`<button type="button" id=${id} class=${'kit-btn kit-sm' + (primary ? ' kit-primary' : '') + (danger ? ' kit-danger' : '')} onClick=${onClick}>${children}</button>`;

// ---------------------------------------------------------------- pattern.confirm-sheet
P['pattern.confirm-sheet'] = ({ samples, dark }) => {
  const d = first(samples, 'confirm-sheet');
  const [bar, sty] = useDepthBar(dark);
  const frame = useRef(null); const [said, setSaid] = useState('Nothing chosen yet. Open a sheet and decide.');
  const open = async key => {
    const spec = Object.assign(clone(d.specs[key]), { host: frame.current, tray: '[data-pv10-tray]' });
    if (spec.view) { const r = await K().confirm.result(spec); setSaid('The ' + (spec.view === 'failed' ? 'failure' : 'result') + ' sheet closed with the action: ' + r.action + '.'); return; }
    const r = await K().confirm.open(spec);
    if (!r.confirmed) { setSaid('Not confirmed. Nothing happened.'); return; }
    setSaid('Confirmed' + (r.typed ? ' with the typed word' : '') + (r.pin ? ' and a PIN (not kept)' : '') + '. In a real board the work would start now.');
    if (key === 'consequential') { const t = frame.current.querySelector('[data-pv10-tray]'); if (t) t.textContent = 'Tray: ' + d.trayTitle + ' running'; }
  };
  return html`<div class="pv10-frame pv10-tall" ref=${frame} style=${sty}>
    <div class="pv10-bar">${bar}</div>
    <div class="pv10-btns" role="group" aria-label="Open a sheet">
      <${Btn} onClick=${() => open('routine')}>Routine<//><${Btn} onClick=${() => open('consequential')}>Consequential, with a key<//><${Btn} danger onClick=${() => open('destructive')}>Destructive, type the word<//>
      <${Btn} onClick=${() => open('bulk')}>Many at once<//><${Btn} onClick=${() => open('failed')}>A failed result<//><${Btn} onClick=${() => open('success')}>A finished result<//>
    </div>
    <p class="pv10-note">Each button opens the sheet inside this frame. The consequential one reads its plan first (the confirm button stays off until the plan is ready), then asks for a code and a key touch. The code step is a demonstration: it accepts any six digits and sends nothing. The destructive one stays shut until the word is typed.</p>
    <p class="pv10-ro" role="status">${said}</p>
    <span class="pv10-tray" data-pv10-tray>Tray: empty</span>
  </div>`;
};

// ---------------------------------------------------------------- pattern.job-tray
function scriptedAdapter(d) {
  const runs = new Map(); let n = 0;
  const view = (id) => {
    const r = runs.get(id), el = (Date.now() - r.t0) / 1000, ev = r.script.events || [], passed = ev.filter(e => e.t <= el), end = r.script.end, over = el >= end.t;
    const log = []; passed.forEach((e, i) => { if (i >= r.sent) (e.log || []).forEach(l => log.push(l)); }); r.sent = passed.length;
    const banner = over ? undefined : ([...passed].reverse().find(e => e.banner) || {}).banner;
    const status = over ? end.status : 'running';
    return { id, title: r.script.title || r.title, kind: r.kind, status, banner, log, next: r.sent, startedAt: r.t0, endedAt: over ? r.t0 + end.t * 1000 : undefined, now: Date.now(), leases: r.script.leases || r.leases,
      result: status === 'paused' ? { waiting: end.waiting, params: { resumed: true } } : undefined };
  };
  return {
    start(kind, params) { const base = d.jobs[kind], script = params && params.resumed && base.resume ? Object.assign({}, base, base.resume) : base; const id = 'job' + (++n); runs.set(id, { script, kind, t0: Date.now(), sent: 0, title: base.title, leases: base.leases }); return Promise.resolve(view(id)); },
    poll(id) { return Promise.resolve(view(id)); },
  };
}
P['pattern.job-tray'] = ({ samples, dark }) => {
  const d = first(samples, 'job-tray');
  const [bar, sty] = useDepthBar(dark); const [single, setSingle] = useState('many'); const frame = useRef(null); const tray = useRef(null);
  const box = useMount(el => { tray.current = K().jobTray.mount(el, { adapter: scriptedAdapter(d), single: single === 'one', open: true, label: 'Studio jobs', pollMs: 600 }); return tray.current; }, [single]);
  const fire = async () => {
    const r = await K().confirm.open({ kind: 'consequential', title: 'Fire kiln 2 to cone 6', lede: 'It holds the kiln and the gas line until it ends.', confirmLabel: 'Start the firing', steps: [{ label: 'Check the vent' }, { label: 'Heat to the peak', from: 'Cold', to: '1,222 °C', mono: true }], holds: ['kiln 2', 'the gas line'], undo: 'Stop it from the tray.', host: frame.current, tray: '[data-tray]', trayTitle: 'Cone 6 firing' });
    if (r.confirmed) tray.current.start('fire', {}, { title: 'Fire kiln 2 to cone 6' });
  };
  return html`<div class="pv10-frame pv10-tall" ref=${frame} style=${sty}>
    <div class="pv10-bar">${bar}<span class="pv10-sw"><span class="pv10-h">Jobs</span><${Seg} label="Jobs at once" value=${single} set=${setSingle} items=${[['many', 'Several at once'], ['one', 'One at a time']]}/></span></div>
    <div class="pv10-btns" role="group" aria-label="Start a job">
      <${Btn} primary onClick=${fire}>Fire the kiln (asks first)<//><${Btn} onClick=${() => tray.current.start('rinse', {}, { title: 'Rinse the glaze tank' })}>Rinse the tank<//><${Btn} onClick=${() => tray.current.start('dry', {}, { title: 'Dry the test tile shelf' })}>Dry the shelf<//>
      <${Btn} onClick=${() => { ['fire', 'rinse', 'dry'].forEach(k => tray.current.start(k, {}, { title: d.jobs[k].title })); }}>Start all three<//>
    </div>
    <div class="pv10-grid"><div ref=${box} style="min-width:0;justify-self:start;width:min(100%,440px)"></div>
      <p class="pv10-note">The rinse stops and asks you to open the lid: it jumps to the top of the tray in its own colour with a turning ring, and the tab title says Waiting for you. Press Continue to run it again. The shelf fails and opens its log. The jobs are played from memory every second and a half; with the page hidden the polling stops.</p></div>
  </div>`;
};

// ---------------------------------------------------------------- pattern.attention-list
P['pattern.attention-list'] = ({ samples, dark }) => {
  const d = first(samples, 'attention-list');
  const [bar, sty] = useDepthBar(dark); const [mode, setMode] = useState('three'); const [said, setSaid] = useState('Press a button to deal with an item; the list redraws and the focus stays on its own button.'); const h = useRef(null);
  const items = useRef(clone(d.items));
  const box = useMount(el => { h.current = K().attentionList.mount(el, { items: mode === 'three' ? items.current : [], onAction: (it) => { items.current = items.current.filter(x => x.id !== it.id); h.current.update(items.current); setSaid('Dealt with: ' + it.title); } }); return h.current; }, [mode]);
  return html`<div class="pv10-frame" style=${sty}>
    <div class="pv10-bar">${bar}<span class="pv10-sw"><span class="pv10-h">List</span><${Seg} label="List" value=${mode} set=${m => { if (m === 'three') items.current = clone(d.items); setMode(m); }} items=${[['three', 'Three things'], ['none', 'Nothing']]}/></span></div>
    <div ref=${box}></div>
    <p class="pv10-ro" role="status">${said}</p>
  </div>`;
};

// ---------------------------------------------------------------- pattern.timed-reveal
P['pattern.timed-reveal'] = ({ samples, dark }) => {
  const d = first(samples, 'timed-reveal');
  const [bar, sty] = useDepthBar(dark);
  const box = useMount(el => K().timedReveal.mount(el, { title: d.title, items: d.items, duration: d.duration, valueSeconds: d.valueSeconds, copy: true, label: 'Studio logins',
    fetch: (id, key) => new Promise(r => setTimeout(() => r(d.values[id + '/' + key]), 150)) }), []);
  return html`<div class="pv10-frame" style=${sty}>
    <div class="pv10-bar">${bar}</div>
    <div ref=${box}></div>
    <p class="pv10-note">In this preview the card stays open for ${d.duration} seconds and a value shows for ${d.valueSeconds}; the real defaults are 120 and 30. The values are made-up strings in the sample and the fetch returns them from memory. This hides a value from a glance at the screen. It is not a security boundary.</p>
  </div>`;
};

// ---------------------------------------------------------------- pattern.secret-input
P['pattern.secret-input'] = ({ samples, dark }) => {
  const d = first(samples, 'secret-input');
  const [bar, sty] = useDepthBar(dark); const frame = useRef(null); const [said, setSaid] = useState('Nothing sent yet. This form sends nowhere.'); const h = useRef(null);
  const cfg = () => ({ host: frame.current, title: 'Store a secret', lede: 'The value goes in once and is never shown again. This preview keeps nothing.',
    names: d.names, shapes: d.shapes, exists: n => d.existing[n] ? { exists: true, detail: d.existing[n] } : null, generateOnly: n => d.generateOnly.includes(n),
    onSubmit: async x => {
      if (x.replace) { const r = await K().confirm.open({ kind: 'destructive', title: 'Replace ' + x.name, lede: 'The value other things read changes.', word: d.confirmWord, confirmLabel: 'Replace', host: frame.current,
        steps: [{ label: x.name, mono: true, from: 'current value', to: x.generate ? 'a new generated value' : 'the value you entered' }], undo: 'The old value stays in history for a while.' });
        if (!r.confirmed) throw new Error('Not replaced'); }
      await new Promise(r => setTimeout(r, 450)); setSaid((x.replace ? 'Replaced ' : 'Stored ') + x.name + (x.generate ? ' with a generated value' : '') + '. The preview kept nothing, not even the length.'); } });
  const openIt = (focus) => { if (h.current) h.current.drawer.close(); h.current = K().secretInput.openDrawer(Object.assign(cfg(), { focus })); };
  useEffect(() => { const t = setTimeout(() => { if (frame.current) openIt(false); }, 0); return () => { clearTimeout(t); if (h.current) h.current.drawer.close(); }; }, []);
  return html`<div class="pv10-frame pv10-tall" ref=${frame} style=${sty}>
    <div class="pv10-bar">${bar}<${Btn} primary onClick=${() => openIt(true)}>Open the form<//></div>
    <p class="pv10-note">Try a name ending in -token: it wants 48 hex characters and counts as you type. Pick the kiln controller key to see Store turn into Replace, which asks for a typed word first. The session salt is generated only. A multi-line key name masks the text area in CSS. When you press Store the field is empty before anything else happens.</p>
    <p class="pv10-ro" role="status">${said}</p>
  </div>`;
};

// ---------------------------------------------------------------- pattern.capability-picker
P['pattern.capability-picker'] = ({ samples, dark }) => {
  const d = first(samples, 'capability-picker');
  const [bar, sty] = useDepthBar(dark); const [st, setSt] = useState(null);
  const box = useMount(el => K().capabilityPicker.mount(el, { capabilities: d.capabilities, groups: d.groups, presets: d.presets, exclusive: true, value: ['publish'], onChange: setSt }), []);
  const steps = useMount(el => { el.textContent = ''; d.targets.forEach(t => { const row = document.createElement('div'); row.className = 'pv10-card'; const h3 = document.createElement('h3'); h3.textContent = t.name; row.append(h3, K().capabilityPicker.steps({ capabilities: d.capabilities, keys: t.keys, done: t.done, na: t.na, label: t.name + ' steps' })); el.append(row); }); }, []);
  return html`<div class="pv10-frame" style=${sty}>
    <div class="pv10-bar">${bar}</div>
    <div ref=${box}></div>
    <p class="pv10-ro" role="status">${st ? 'Chosen: ' + (st.chosen.join(', ') || 'none') + '. Pulled in: ' + (st.included.join(', ') || 'none') + '. Valid: ' + (st.valid ? 'yes' : 'no') + '.' : 'Publish the site is chosen; its two prerequisites are pulled in.'}</p>
    <h3 class="pv10-h">Progress per kiln, with the same capabilities</h3>
    <div class="pv10-grid" ref=${steps}></div>
  </div>`;
};

// ---------------------------------------------------------------- pattern.row-actions
P['pattern.row-actions'] = ({ samples, dark }) => {
  const d = first(samples, 'row-actions');
  const [bar, sty] = useDepthBar(dark); const [said, setSaid] = useState('Press a button, open a menu, or hover the card.');
  const rows = useMount(el => K().rowActions.mount(el, { rows: d.rows, label: 'Studio passes', main: r => d.mains[r.state], menu: () => d.menu, onAction: (key, r) => setSaid(key + ' on ' + r.title) }), []);
  const card = useMount(el => K().rowActions.pills(el, d.card.pills, { label: 'Quick actions for ' + d.card.title, onPick: k => setSaid('Pill: ' + k + ' on ' + d.card.title) }), []);
  return html`<div class="pv10-frame" style=${'min-height:560px;' + sty}>
    <div class="pv10-bar">${bar}</div>
    <div ref=${rows}></div>
    <div class="pv10-card" ref=${card} style="padding-top:22px;max-width:360px"><h3>${d.card.title}</h3><p>${d.card.sub}</p></div>
    <p class="pv10-ro" role="status">${said}</p>
  </div>`;
};

// ---------------------------------------------------------------- pattern.facet-batch
P['pattern.facet-batch'] = ({ samples, dark, entries }) => {
  const d = first(samples, 'facet-batch');
  const [bar, sty] = useDepthBar(dark); const [said, setSaid] = useState('Select two rows with Shift held to see the batch bar. Press 1 to 4 to switch the tiles.'); const fb = useRef(null);
  const box = useMount(el => {
    const h = K().facetBatch.mount(el, { records: d.records, facets: clone(d.facets), groups: d.groups, group: 'kind', sorts: d.sorts, sort: 'left', search: { placeholder: 'Search by name, site or owner', label: 'Search records', fields: ['title', 'sub'] }, stateEnum: d.stateEnum, actions: d.actions, label: 'Studio records' });
    fb.current = h;
    const on = ev => { ev.preventDefault(); setSaid('Cancelled in the preview: ' + ev.detail.action + ' would run for ' + ev.detail.ids.length + ' records (' + ev.detail.ids.join(', ') + '). The board does the work and then calls update().'); h.clearSelection(); };
    el.addEventListener('kit-fb-action', on);
    return { destroy() { el.removeEventListener('kit-fb-action', on); h.destroy(); } };
  }, []);
  const ids = d.runway[0].ids;
  return html`<div class="pv10-frame" style=${sty}>
    <div class="pv10-bar">${bar}<${Btn} onClick=${() => fb.current && fb.current.focus(ids, 'Showing the ' + ids.length + ' records that end within 30 days, sent from the runway.')}>${'Show the ' + ids.length + ' that end within 30 days'}<//></div>
    <div ref=${box}></div>
    <p class="pv10-ro" role="status">${said}</p>
  </div>`;
};
})();
/* /part:page.script.previews.b10 */

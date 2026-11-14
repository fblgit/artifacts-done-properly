/* part:page.script.previews.b12 */
/* Live previews of batch 12 (layouts and page frames): the dependency wires, the phase strip, stacked sections, clauses with margin notes, the explorer shell, the app shell with a page registry,
   the answer queue and the view registry. Each mounts the entry's own published file on its own published sample (invented content). Nothing leaves the page.
   The margin notes and the explorer shell are shown twice: once on the stage's theme and once under the theme they came from (Manuscript, Kanban). */
(function () {
'use strict';
const { html, useState, useEffect, useRef } = window.htmPreact;
const P = window.CatalogPreviews = window.CatalogPreviews || {};
const K = () => window.Kit;
const first = (samples, part) => samples[Object.keys(samples).find(k => k.endsWith('/' + part + '.json'))];
const STYLE = `
.pv12-frame { border-radius: 12px; padding: 16px; background: var(--bg); color: var(--ink); font-family: var(--f-ui); min-width: 0; position: relative; isolation: isolate; display: grid; gap: 14px; }
.pv12-h { margin: 0; font: 600 12px/1.2 var(--f-mono); letter-spacing: .06em; text-transform: uppercase; color: var(--ink-2); }
.pv12-bar { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; min-width: 0; }
.pv12-ro { margin: 0; font: 13px/1.4 var(--f-mono); color: var(--ink-2); }
.pv12-scroll { height: 460px; overflow-y: auto; border: 1px solid var(--rule); border-radius: 10px; background: var(--bg); position: relative; }
.pv12-ul { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 16rem), 1fr)); gap: 8px; }
.pv12-ul li { display: grid; gap: 2px; padding: 8px 10px; border: 1px solid var(--rule); border-radius: 8px; background: var(--panel); font: 13.5px/1.4 var(--f-ui); }
.pv12-ul b { font-weight: 700; } .pv12-ul span { color: var(--ink-2); }
.pv12-twin { display: grid; gap: 18px; min-width: 0; }
.pv12-under { padding: 14px; border-radius: 12px; border: 1px dashed var(--rule); background: var(--bg); color: var(--ink); display: grid; gap: 10px; min-width: 0; }
.pv12-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; min-width: 0; }
.pv12-list li { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; padding: 8px 12px; border: 1px solid var(--rule); border-radius: 10px; background: var(--panel); font: 14px/1.35 var(--f-ui); min-width: 0; }
.pv12-list li b { font: 600 12px/1.2 var(--f-mono); color: var(--ink-2); }
.pv12-list li span.t { flex: 1 1 12rem; min-width: 0; overflow-wrap: anywhere; }
.pv12-btn { min-height: 38px; padding: 0 16px; border: 1px solid var(--rule); border-radius: 999px; background: var(--panel); color: var(--ink); font: 600 13.5px/1 var(--f-ui); cursor: pointer; }
.pv12-btn.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
.pv12-btn:focus-visible { outline: 3px solid var(--seam, var(--accent)); outline-offset: 2px; }
.pv12-card { display: grid; gap: 4px; padding: 14px 16px; border: 1px solid var(--rule); border-radius: 12px; background: var(--panel); font: 14.5px/1.5 var(--f-ui); min-width: 0; }
.pv12-card h3 { margin: 0; font: 700 1.05rem/1.25 var(--f-display, var(--f-ui)); }
.pv12-card p { margin: 0; color: var(--ink-2); }
.pv12-clock { font: 700 1.6rem/1 var(--f-mono); font-variant-numeric: tabular-nums; }
.pv12-link { color: var(--accent); font-weight: 600; }
.pv12-mt { width: 100%; border-collapse: collapse; font: 13.5px/1.4 var(--f-ui); }
.pv12-mt th, .pv12-mt td { padding: 6px 10px; text-align: left; border-bottom: 1px solid var(--rule-2); white-space: nowrap; }
.pv12-mt th { font: 600 11.5px/1.3 var(--f-mono); letter-spacing: .05em; color: var(--ink-2); background: var(--sunk); }
.pv12-lanes { display: grid; grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr)); gap: 8px; }
.pv12-lane { display: grid; gap: 6px; align-content: start; padding: 8px; border-radius: 8px; background: var(--sunk); min-width: 0; }
.pv12-lane h4 { margin: 0; font: 700 12px/1.2 var(--f-mono); letter-spacing: .04em; color: var(--ink-2); }
.pv12-lane div { padding: 6px 8px; border: 1px solid var(--rule); border-radius: 6px; background: var(--panel); font: 13px/1.35 var(--f-ui); overflow-wrap: anywhere; }
.pv12-roster { display: grid; grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr)); gap: 8px; }
.pv12-roster div { display: grid; gap: 2px; padding: 8px 10px; border: 1px solid var(--rule); border-radius: 8px; background: var(--panel); font: 13.5px/1.35 var(--f-ui); }
.pv12-roster small { color: var(--ink-2); font: 12px var(--f-mono); }
.pv12-feed { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; font: 13.5px/1.4 var(--f-ui); }
.pv12-feed li { display: flex; gap: 8px; align-items: baseline; }
.pv12-feed code { font: 600 11.5px var(--f-mono); padding: 1px 6px; border-radius: 4px; border: 1px solid var(--rule); color: var(--ink); }
.pv12-large { font-size: 1.15em; }
.pv12-large .kit-sh-page { font-size: 1.1em; }
.pv12-p { margin: 0; max-width: 62ch; }
`;
if (!document.querySelector('style[data-pv="b12"]')) { const st = document.createElement('style'); st.dataset.pv = 'b12'; st.textContent = STYLE; document.head.append(st); }
const Seg = ({ label, value, set, items }) => html`<span class="c-seg" role="group" aria-label=${label}>${items.map(([k, l]) => html`<button type="button" key=${k} aria-pressed=${value === k} onClick=${() => set(k)}>${l}</button>`)}</span>`;
function useMount(fn, deps) {
  const ref = useRef(null);
  useEffect(() => { if (!ref.current) return; const h = fn(ref.current); return () => { if (h && h.destroy) h.destroy(); }; }, deps);
  return ref;
}
const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
// the tokens of a kit theme, applied to a wrapper so a part can be seen under the theme it was taken from
function useThemeVars(file, dark) {
  const [st, setSt] = useState('');
  useEffect(() => {
    let off = false;
    window.CatalogFiles.json(file).then(j => { if (off || !j) return; setSt(Object.entries(Object.assign({}, j.light, dark ? j.dark : {})).map(([k, v]) => k + ':' + v).join(';')); }).catch(() => {});
    return () => { off = true; };
  }, [file, dark]);
  return st;
}

// ---------------------------------------------------------------- viz.wires
P['viz.wires'] = ({ samples }) => {
  const d = first(samples, 'viz-wires');
  const [f, setF] = useState('all'); const h = useRef(null);
  const ref = useMount(el => { h.current = K().wires.mount(el, { lanes: d.lanes, phases: d.phases, nodes: d.nodes, label: 'Workshop fit-out, lanes by phases' }); return h.current; }, []);
  useEffect(() => { const fl = d.filters.find(x => x.id === f); if (h.current) h.current.setFilter(fl && fl.states ? fl.states : null); }, [f]);
  return html`<div class="pv12-frame">
    <div class="pv12-bar"><span class="pv12-h" id="pv12-wf">Show</span><${Seg} label="Filter by state" value=${f} set=${setF} items=${d.filters.map(x => [x.id, x.label])}/></div>
    <div ref=${ref}></div>
    <p class="pv12-ro">A filter dims what it does not match and keeps the shape. A wire into a finished item is green. Hover or focus a node to light its wires.</p>
  </div>`;
};

// ---------------------------------------------------------------- viz.phase-strip
P['viz.phase-strip'] = ({ samples }) => {
  const d = first(samples, 'viz-phase-strip');
  const [form, setForm] = useState('gauge'); const [sel, setSel] = useState('all'); const h = useRef(null);
  const ref = useMount(el => { h.current = K().phaseStrip.mount(el, { phases: d.phases, form: 'gauge', allLabel: 'All phases', label: 'Season phases', onSelect: setSel }); return h.current; }, []);
  useEffect(() => { if (h.current) h.current.setForm(form); }, [form]);
  const tasks = d.tasks.filter(t => sel === 'all' || t.phase === sel);
  return html`<div class="pv12-frame">
    <div class="pv12-bar"><span class="pv12-h">Form</span><${Seg} label="Phase strip form" value=${form} set=${setForm} items=${[['gauge', 'Gauge'], ['flow', 'Flow'], ['itinerary', 'Itinerary'], ['contents', 'Contents'], ['tabs', 'Tabs']]}/></div>
    <div ref=${ref}></div>
    ${form === 'tabs' ? html`<ul class="pv12-list" aria-label="Tasks in the selected phase">${tasks.map(t => html`<li key=${t.id}><b>${t.id}</b><span class="t">${t.title}</span>${K().vocab ? html`<span ref=${el => { if (el && !el.firstChild) { const p = K().vocab.pill('state', t.state); if (p) el.append(p); } }}></span>` : t.state}</li>`)}</ul>`
      : html`<p class="pv12-ro">Same phases, five forms. Choose Tabs to filter a list by phase.</p>`}
  </div>`;
};

// ---------------------------------------------------------------- layout.stack
P['layout.stack'] = ({ samples }) => {
  const d = first(samples, 'stack');
  const ref = useMount(el => K().stack.mount(el, {
    scroller: el.parentElement, label: 'Repair cafe plan', barLabel: 'Step',
    items: d.sections.map(s => ({ id: s.id, title: s.title, eyebrow: s.eyebrow, render(body) {
      s.text.forEach(t => body.append(mk('p', null, t)));
      if (s.list) { const ul = mk('ul', 'pv12-ul'); s.list.forEach(x => { const li = mk('li'); li.append(mk('b', null, x.name), mk('span', null, x.text)); ul.append(li); }); body.append(ul); }
    } })),
  }), []);
  return html`<div class="pv12-frame">
    <p class="pv12-ro">Scroll the frame: each section rises over the one before. The third is taller than the frame and sticks at its bottom edge. Under 700px, or with reduced motion, the sections stay in normal flow.</p>
    <div class="pv12-scroll" tabindex="-1"><div ref=${ref}></div></div>
  </div>`;
};

// ---------------------------------------------------------------- layout.margin-notes
function MarginFrame({ d }) {
  const ref = useMount(el => K().marginNotes.mount(el, { sections: d.sections, words: d.words, label: 'House rules of a repair cafe' }), []);
  return html`<div ref=${ref}></div>`;
}
P['layout.margin-notes'] = ({ samples, dark }) => {
  const d = first(samples, 'margin-notes');
  const vars = useThemeVars('kit/themes/manuscript.json', dark);
  return html`<div class="pv12-frame pv12-twin">
    <div><p class="pv12-h">On this stage's theme</p><${MarginFrame} d=${d}/></div>
    <div class="pv12-under" style=${vars + ';background:var(--bg)'}><p class="pv12-h">Under Manuscript, the theme it was taken from</p><${MarginFrame} d=${d} key=${vars}/></div>
  </div>`;
};

// ---------------------------------------------------------------- layout.explorer-shell
function ExplorerFrame({ d, h }) {
  const [cur, setCur] = useState('overview');
  const ref = useMount(el => {
    const x = K().explorer.mount(el, { groups: d.groups, pipeline: d.pipeline, status: d.status, height: h || '21rem', label: 'Season files', sections: d.sections.map(s => ({ id: s.id, title: s.title, render(body) { s.lines.forEach(l => body.append(mk('p', null, l))); body.append(mk('p', null, 'This line only gives the section some height, so that scrolling has something to mark.')); } })) });
    const t = setInterval(() => setCur(x.current()), 400); const o = { destroy() { clearInterval(t); x.destroy(); } }; return o;
  }, []);
  return html`<div><div ref=${ref}></div><p class="pv12-ro" aria-live="off">In view: ${cur}</p></div>`;
}
P['layout.explorer-shell'] = ({ samples, dark }) => {
  const d = first(samples, 'explorer-shell');
  const vars = useThemeVars('kit/themes/kanban.json', dark);
  return html`<div class="pv12-frame pv12-twin">
    <div><p class="pv12-h">On this stage's theme</p><${ExplorerFrame} d=${d}/></div>
    <div class="pv12-under" style=${vars + ';background:var(--bg)'}><p class="pv12-h">Under Kanban, the theme it was taken from</p><${ExplorerFrame} d=${d} key=${vars}/></div>
  </div>`;
};

// ---------------------------------------------------------------- layout.app-shell
P['layout.app-shell'] = ({ samples }) => {
  const d = first(samples, 'app-shell');
  const [log, setLog] = useState('Overview timer: not started');
  const ref = useMount(el => {
    const sh = K().shell.mount(el, { brand: d.brand, hash: false, height: '480px', label: 'Tool library pages', actions: [{ id: 'look', label: 'Look', icon: 'look' }] });
    let n = 0, t = 0;
    const over = mk('div', 'pv12-card'); over.append(mk('h3', null, 'Due back this week'), mk('p', null, d.pages[0].lead));
    const clock = mk('p', 'pv12-clock', '0 s'); const note = mk('p', null, 'This clock runs only while Overview is open.');
    const lnk = mk('a', 'pv12-link', 'Change the loan rules'); lnk.href = '#loans';
    over.append(clock, note, lnk);
    sh.add({ id: 'overview', title: 'Overview', icon: 'home', el: (() => { const w = mk('div'); w.append(over); return w; })(), onShow() { n = 0; clock.textContent = '0 s'; t = setInterval(() => { n++; clock.textContent = n + ' s'; }, 1000); setLog('Overview timer: running'); }, onHide() { clearInterval(t); setLog('Overview timer: stopped'); } });
    const items = mk('div', 'pv12-card'); items.append(mk('h3', null, d.pages[1].lead));
    const tb = mk('table', 'pv12-mt'); tb.innerHTML = '<thead><tr><th scope="col">Tool</th><th scope="col">Status</th><th scope="col">Note</th></tr></thead>'; const bd = mk('tbody');
    d.items.forEach(i => { const tr = mk('tr'); [i.name, i.status, i.note].forEach(x => tr.append(mk('td', null, x))); bd.append(tr); }); tb.append(bd);
    const wrap = mk('div'); wrap.style.overflowX = 'auto'; wrap.append(tb); items.append(wrap);
    sh.add({ id: 'items', title: 'Items', icon: 'list', el: items });
    const set = mk('div', 'pv12-card'); set.append(mk('h3', null, d.pages[2].lead));
    d.sections.forEach(s => { const sec = mk('section'); sec.id = s.id; sec.style.paddingBlock = '40px'; sec.append(mk('h3', null, s.title), mk('p', null, s.text)); set.append(sec); });
    sh.add({ id: 'settings', title: 'Settings', icon: 'gear', el: set });
    const panel = mk('div'); panel.append(mk('p', 'pv12-h', 'Text size'));
    const row = mk('div', 'pv12-bar'); ['Normal', 'Large'].forEach((w, i) => { const b = mk('button', 'pv12-btn', w); b.type = 'button'; b.addEventListener('click', () => el.classList.toggle('pv12-large', i === 1)); row.append(b); }); panel.append(row);
    const pop = sh.popover(el.querySelector('#kit-sh-act-look'), panel);
    sh.show('overview');
    return { destroy() { pop.destroy(); sh.destroy(); } };
  }, []);
  return html`<div class="pv12-frame">
    <p class="pv12-ro">The tabs show icons; the open page and any tab you hover or focus also show a name. A link on Overview opens Settings at a section. Leave Overview and its timer stops.</p>
    <div ref=${ref}></div>
    <p class="pv12-ro" role="status">${log}</p>
  </div>`;
};

// ---------------------------------------------------------------- pattern.answer-queue
P['pattern.answer-queue'] = ({ samples }) => {
  const d = first(samples, 'answer-queue');
  const [items, setItems] = useState(() => JSON.parse(JSON.stringify(d.items)));
  const q = useRef(null); const host = useRef(null);
  useEffect(() => {
    const api = K().answerQueue.mount({ items: JSON.parse(JSON.stringify(d.items)), host: host.current, label: 'Questions for the lead repairer', onChange: l => setItems(l.map(x => Object.assign({}, x))) });
    q.current = api; return () => api.destroy();
  }, []);
  const waiting = items.filter(i => i.state === 'waiting').length;
  return html`<div class="pv12-frame" ref=${host}>
    <div class="pv12-bar"><button type="button" class="pv12-btn primary" disabled=${!waiting} onClick=${() => q.current && q.current.next()}>${waiting ? 'Answer them one by one (' + waiting + ')' : 'All caught up'}</button>
      <button type="button" class="pv12-btn" onClick=${() => { const fresh = JSON.parse(JSON.stringify(d.items)); setItems(fresh); q.current && q.current.update(fresh); }}>Start again</button></div>
    <ul class="pv12-list" aria-label="Items">${items.map(i => html`<li key=${i.id}><b>${i.id}</b><span class="t">${i.title}</span>
      <span ref=${el => { if (el) { el.textContent = ''; const p = K().vocab.pill('state', i.state); if (p) el.append(p); } }}></span>
      <button type="button" class="pv12-btn" onClick=${() => q.current && q.current.open(i.id)}>Open</button></li>`)}</ul>
    <p class="pv12-ro">Answer one and the dialog moves to the next that is waiting. After the last, it closes and says so.</p>
  </div>`;
};

// ---------------------------------------------------------------- kit.view-registry
let registered = false;
function registerDemo() {
  if (registered || !K().views) return; registered = true; const V = K().views;
  if (K().vocab) K().vocab.define({ task: { todo: { word: 'To do', short: 'todo', glyph: 'ring', tone: 'neutral' }, doing: { word: 'Doing', short: 'doing', glyph: 'pulse', tone: 'active' }, blocked: { word: 'Blocked', short: 'blocked', glyph: 'stop', tone: 'danger' }, done: { word: 'Done', short: 'done', glyph: 'check', tone: 'success' } } });
  V.register({ kind: 'tasks', name: 'lanes', label: 'Lanes', form: 'lanes', options: 'lanes', render(box, c) {
    const draw = ctx => { box.textContent = ''; const w = mk('div', 'pv12-lanes'); ['todo', 'doing', 'blocked', 'done'].forEach(s => { const col = mk('div', 'pv12-lane'); col.append(mk('h4', null, s.toUpperCase())); ctx.rows.filter(r => r.status === s).forEach(r => col.append(mk('div', null, r.title))); w.append(col); }); box.append(w); };
    draw(c); return { update: draw, destroy() { box.textContent = ''; } };
  } });
  V.register({ kind: 'tasks', name: 'table', label: 'Table', form: 'table', options: 'table', columns: ['title', 'status', 'points', 'urgent', 'owner.team'], render(box, c) {
    const draw = ctx => { box.textContent = ''; const cols = (ctx.options.columns && ctx.options.columns.length) ? ctx.options.columns : ['title', 'status', 'points']; const t = mk('table', 'pv12-mt'); const hd = mk('tr'); cols.forEach(x => { const th = mk('th', null, x); th.scope = 'col'; hd.append(th); }); const th = mk('thead'); th.append(hd); t.append(th);
      const tb = mk('tbody'); ctx.rows.forEach(r => { const tr = mk('tr'); cols.forEach(x => { const v = x.split('.').reduce((a, k) => a == null ? a : a[k], r); tr.append(mk('td', null, String(v))); }); tb.append(tr); }); t.append(tb); box.append(t); };
    draw(c); return { update: draw, destroy() { box.textContent = ''; } };
  } });
  V.register({ kind: 'crew', name: 'roster', label: 'Roster', form: 'cards', options: 'cards', render(box, c) {
    const draw = ctx => { box.textContent = ''; const w = mk('div', 'pv12-roster'); ctx.rows.forEach(r => { const x = mk('div'); x.append(mk('b', null, r.name), mk('small', null, r.role + (r.active ? '' : ' (away)'))); w.append(x); }); box.append(w); };
    draw(c); return { update: draw, destroy() { box.textContent = ''; } };
  } });
  V.register({ kind: 'events', name: 'feed', label: 'Feed', form: 'feed', options: 'feed', render(box, c) {
    const draw = ctx => { box.textContent = ''; const ul = mk('ul', 'pv12-feed'); ctx.rows.forEach(r => { const li = mk('li'); li.append(mk('code', null, r.level), mk('span', null, r.text)); ul.append(li); }); box.append(ul); };
    draw(c); return { update: draw, destroy() { box.textContent = ''; } };
  } });
}
P['kit.view-registry'] = ({ samples }) => {
  const d = first(samples, 'view-registry');
  const [which, setWhich] = useState('layout'); const [seen, setSeen] = useState('');
  useMemoKinds(d);
  const ref = useMount(el => {
    registerDemo();
    const b = K().views.mount(el, { layout: d[which], rows: d.rows, storageKey: 'catalog.b12.views', label: 'Repair cafe board' });
    const off = b.on((id, name) => setSeen('Block "' + id + '" now shows its ' + name + ' view.'));
    return { destroy() { off(); b.destroy(); } };
  }, [which]);
  return html`<div class="pv12-frame">
    <div class="pv12-bar"><span class="pv12-h">Layout</span><${Seg} label="Layout" value=${which} set=${v => { setWhich(v); setSeen(''); }} items=${[['layout', 'A sound layout'], ['refused', 'A layout the registry refuses']]}/></div>
    <div ref=${ref} key=${which}></div>
    <p class="pv12-ro" role="status">${seen || (which === 'layout' ? 'Switch a block between its views; the choice is remembered in this browser.' : 'Five blocks, five typed refusals. Nothing was drawn.')}</p>
  </div>`;
};
function useMemoKinds(d) { const done = useRef(false); if (!done.current && K().views) { Object.entries(d.kinds).forEach(([id, spec]) => K().views.kind(id, spec)); done.current = true; } }
})();
/* /part:page.script.previews.b12 */

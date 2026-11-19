/* part:page.script.previews.b2 */
/* Live previews of batch 2 (lists and filtering): the filter table, count tiles, ledger, master-detail, command palette, tooltip, disclosure cards and the expandable work card.
   Each mounts the entry's own published file on its own published sample (invented content); nothing is stored except the work card's open state under one localStorage key, and nothing leaves the page.
   The palette and the tooltip are appended inside the preview's own frame, so they take the stage theme's tokens. */
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
.pv2-frame { min-width: 0; color: var(--ink); font-family: var(--f-ui); }
.pv2-frame.phone { max-width: 390px; }
.pv2-cap { margin: 0; font-size: 13px; color: var(--ink-2); }
.pv2-cap b { color: var(--ink); }
.pv2-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 200px), 1fr)); gap: 8px; margin: 10px 0 0; padding: 0; list-style: none; }
.pv2-card { background: var(--panel); border: 1px solid var(--rule); border-radius: 10px; padding: 9px 11px; display: grid; gap: 3px; font-size: 13.5px; min-width: 0; }
.pv2-card b { font-size: 14px; }
.pv2-card span { color: var(--ink-2); font-size: 12.5px; }
.pv2-card i { font: 600 11.5px var(--f-mono); font-style: normal; color: var(--ink-2); }
.pv2-card[data-stage="blocked"] { border-color: color-mix(in srgb, var(--danger) 55%, var(--panel)); }
.pv2-none { margin: 10px 0 0; padding: 16px; text-align: center; color: var(--ink-2); border: 1px dashed var(--rule); border-radius: 10px; }
.pv2-dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 14px; margin: 10px 0 0; font-size: 14px; }
.pv2-dl dt { font: 500 12.5px var(--f-mono); color: var(--ink-2); }
.pv2-dl dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.pv2-h { margin: 0; font: 600 22px/1.2 var(--f-display); }
.pv2-sub { margin: 4px 0 0; color: var(--ink-2); font-size: 14px; }
.pv2-ul { margin: 10px 0 0; padding-left: 1.2em; display: grid; gap: 4px; font-size: 14px; }
.pv2-sec { background: var(--panel); border: 1px solid var(--rule); border-radius: 10px; padding: 12px 14px; scroll-margin-top: 12px; }
.pv2-sec h4 { margin: 0 0 4px; font: 600 15px var(--f-display); }
.pv2-sec p { margin: 0; font-size: 14px; color: var(--ink-2); }
.pv2-sec:focus-visible { outline: 2px solid var(--seam, var(--accent)); outline-offset: 2px; }
.pv2-secs { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); }
.pv2-chart { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; align-items: end; height: 190px; padding: 14px 14px 0; border: 1px solid var(--rule); border-radius: 12px; background: var(--panel); }
.pv2-col { display: grid; grid-template-rows: 1fr auto; gap: 6px; height: 100%; min-width: 0; text-align: center; font: 500 12.5px var(--f-mono); color: var(--ink-2); padding-bottom: 8px; }
.pv2-mark { align-self: end; width: 100%; max-width: 56px; justify-self: center; border-radius: 6px 6px 0 0; background: var(--accent); border: 0; padding: 0; cursor: pointer; }
.pv2-mark:hover { background: color-mix(in srgb, var(--accent) 80%, var(--ink)); }
.pv2-mark:focus-visible { outline: 2px solid var(--seam, var(--accent)); outline-offset: 2px; }
.pv2-axis { margin: 0; font: 12px var(--f-mono); color: var(--ink-2); }
.pv2-open { display: inline-flex; gap: 8px; align-items: center; min-height: 40px; padding: 6px 14px; border: 1px solid var(--rule); border-radius: 999px; background: var(--panel); color: var(--ink); font: 600 14px var(--f-ui); cursor: pointer; }
.pv2-open kbd { font: 500 12px var(--f-mono); padding: 0 6px; border: 1px solid var(--rule); border-radius: 4px; background: var(--sunk); color: var(--ink-2); }
.pv2-open:focus-visible { outline: 2px solid var(--seam, var(--accent)); outline-offset: 2px; }
.pv2-picked { margin: 0; font-size: 13px; color: var(--ink-2); }
`;
if (!document.querySelector('style[data-pv="b2"]')) { const st = document.createElement('style'); st.dataset.pv = 'b2'; st.textContent = STYLE; document.head.append(st); }
function useMount(fn, deps) {
  const ref = useRef(null);
  useEffect(() => { if (!ref.current) return; const h = fn(ref.current); return () => { if (h && h.destroy) h.destroy(); }; }, deps || []);
  return ref;
}
const Width = ({ v, set }) => html`<span class="c-seg" role="group" aria-label="Frame width">${[['full', 'Full width'], ['phone', '390 px']].map(([k, l]) =>
  html`<button type="button" key=${k} aria-pressed=${v === k} onClick=${() => set(k)}>${l}</button>`)}</span>`;
const Note = ({ children }) => html`<p class="pv-sim"><b>Preview</b> ${children}</p>`;

// ---------------------------------------------------------------- pattern.filter-table
P['pattern.filter-table'] = ({ samples, theme }) => {
  useFonts(theme);
  const d = first(samples, 'filter-table'); const [w, setW] = useState('full'); const [last, setLast] = useState('');
  const ref = useMount(el => K().filterTable.mount(el, {
    caption: d.caption, label: 'Glaze test tiles', tall: true,
    filter: { key: 'result', label: 'Filter by result', options: d.options },
    search: { keys: ['name', 'cone', 'note'], placeholder: 'Search a tile or a note', label: 'Search glaze test tiles' },
    sort: { key: 'grams', dir: 'desc' }, total: { key: 'grams', unit: 'g', decimals: 0 },
    columns: [{ key: 'name', label: 'Tile' }, { key: 'result', label: 'Result', status: true }, { key: 'cone', label: 'Cone' },
      { key: 'absorption', label: 'Absorption', num: true, unit: '%', decimals: 1 }, { key: 'grams', label: 'Fired weight', num: true, unit: 'g', decimals: 0, bar: true }, { key: 'note', label: 'Note', sort: false }],
    rows: d.rows, onChange: s => setLast((s.filter === 'all' ? 'All results' : s.filter) + (s.q ? ', "' + s.q + '"' : '') + ', ' + (s.sort ? s.sort.key + ' ' + s.sort.dir : 'unsorted')),
  }), [w]);
  return html`<div class="pv-stack">
    <div class="pv-row"><${Width} v=${w} set=${setW}/><span class="pv2-cap" aria-live="polite">${last ? html`onChange: <b>${last}</b>` : 'Try a chip, the search box or a column head.'}</span></div>
    <div class=${'pv2-frame' + (w === 'phone' ? ' phone' : '')}><div ref=${ref} key=${w}></div></div>
    <${Note}>Chip counts follow the search. The bar under a weight is drawn linearly from zero to the heaviest tile. Heads sort by keyboard; the arrow and aria-sort say which way.<//>
  </div>`;
};

// ---------------------------------------------------------------- pattern.count-filters
P['pattern.count-filters'] = ({ samples, theme }) => {
  useFonts(theme);
  const d = first(samples, 'count-filters'); const [w, setW] = useState('full');
  const [f, setF] = useState({ tile: 'all', groups: { kiln: '', clay: '' }, q: '' });
  const ref = useMount(el => {
    const tiles = d.tiles.map(t => Object.assign({ count: t.id === 'all' ? d.cards.length : d.cards.filter(c => c.stage === t.id).length }, t));
    return K().countFilters.mount(el, { tiles, groups: d.groups, search: { placeholder: 'Search a card', label: 'Search cards' }, onChange: setF, label: 'Filter cards by stage' });
  }, [w]);
  const list = d.cards.filter(c => (f.tile === 'all' || c.stage === f.tile) && (!f.groups.kiln || c.kiln === f.groups.kiln) && (!f.groups.clay || c.clay === f.groups.clay)
    && (!f.q || (c.title + ' ' + c.note).toLowerCase().includes(f.q.toLowerCase())));
  return html`<div class="pv-stack">
    <div class="pv-row"><${Width} v=${w} set=${setW}/><span class="pv2-cap" aria-live="polite">Showing <b>${list.length}</b> of ${d.cards.length} cards</span></div>
    <div class=${'pv2-frame' + (w === 'phone' ? ' phone' : '')}>
      <div ref=${ref} key=${w}></div>
      ${list.length ? html`<ul class="pv2-cards">${list.map(c => html`<li class="pv2-card" data-stage=${c.stage} key=${c.id}><b>${c.title}</b><span>${c.note}</span><i>${c.stage}, Kiln ${c.kiln}, ${c.clay}</i></li>`)}</ul>`
        : html`<p class="pv2-none">No card matches. Press All and clear the chips.</p>`}
    </div>
    <${Note}>The pattern holds the filter state and reports it; the cards below are this preview's own markup, filtered from what onChange says. Tiles are toggle buttons, chip groups clear on a second press.<//>
  </div>`;
};

// ---------------------------------------------------------------- pattern.ledger
P['pattern.ledger'] = ({ samples, theme }) => {
  useFonts(theme);
  const d = first(samples, 'ledger'); const [w, setW] = useState('full'); const [log, setLog] = useState('');
  const ref = useMount(el => K().ledger.mount(el, {
    groups: d.groups, label: 'Settled decisions',
    filters: [{ id: 'agreed', label: 'Agreed', test: r => r.tag.label === 'Agreed' }, { id: 'you', label: 'Needs you', test: r => r.tag.label === 'Open' }],
    onToggle: (r, open) => setLog((open ? 'opened' : 'closed') + ' row ' + r.n),
  }), [w]);
  return html`<div class="pv-stack">
    <div class="pv-row"><${Width} v=${w} set=${setW}/><span class="pv2-cap" aria-live="polite">${log ? html`onToggle: <b>${log}</b>` : 'Open a row for its detail.'}</span></div>
    <div class=${'pv2-frame' + (w === 'phone' ? ' phone' : '')}><div ref=${ref} key=${w}></div></div>
    <${Note}>Rows are details elements. A block with tone "warn" is the question that waits for the reader. The same markup serves a dated progress list: put the date in when and the checker in a detail block.<//>
  </div>`;
};

// ---------------------------------------------------------------- pattern.master-detail
P['pattern.master-detail'] = ({ samples, theme }) => {
  useFonts(theme);
  const d = first(samples, 'master-detail'); const [w, setW] = useState('full');
  const ref = useMount(el => K().masterDetail.mount(el, {
    items: d.items, groups: d.groups, label: 'Services',
    search: { placeholder: 'Search a service', label: 'Search services' },
    filters: [{ id: 'crit', label: 'Critical', test: it => it.tier === 'critical' }, { id: 'attn', label: 'Needs a look', test: it => it.flags.includes('degraded') || it.flags.includes('failing') }],
    renderDetail: it => {
      const box = document.createElement('div');
      const h = document.createElement('h3'); h.className = 'pv2-h'; h.textContent = it.name; const s = document.createElement('p'); s.className = 'pv2-sub'; s.textContent = it.sub;
      const dl = document.createElement('dl'); dl.className = 'pv2-dl';
      [['Owner', it.owner], ['Tier', it.tier], ['Uptime', it.uptime], ['Last deploy', it.deploy]].forEach(([k, v]) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; dl.append(dt, dd); });
      const ul = document.createElement('ul'); ul.className = 'pv2-ul'; it.notes.forEach(n => { const li = document.createElement('li'); li.textContent = n; ul.append(li); });
      box.append(h, s, dl, ul); return box;
    },
  }), [w]);
  return html`<div class="pv-stack">
    <div class="pv-row"><${Width} v=${w} set=${setW}/></div>
    <div class=${'pv2-frame' + (w === 'phone' ? ' phone' : '')}><div ref=${ref} key=${w}></div></div>
    <${Note}>Click or use the arrow keys, Home and End in the list. Under 760 px of the component's own width, the list becomes a select above the detail, so the layout also holds inside a narrow pane.<//>
  </div>`;
};

// ---------------------------------------------------------------- kit.palette
P['kit.palette'] = ({ samples, theme }) => {
  useFonts(theme);
  const d = first(samples, 'palette'); const [picked, setPicked] = useState(''); const frame = useRef(null); const api = useRef(null);
  useEffect(() => {
    api.current = K().palette.create({ items: d.items, host: frame.current, label: 'Search the studio notes', placeholder: 'Search sections and records',
      onPick: it => { setPicked(it.label); const t = document.getElementById(it.target); if (t) { t.tabIndex = -1; t.focus({ preventScroll: false }); } } });
    return () => api.current && api.current.destroy();
  }, []);
  return html`<div class="pv-stack pv2-frame" ref=${frame}>
    <div class="pv-row"><button type="button" class="pv2-open" onClick=${() => api.current.open()}>Search the notes <kbd>Ctrl K</kbd></button><span class="pv2-picked" aria-live="polite">${picked ? html`Picked: <b>${picked}</b>` : 'Open it with the button or Ctrl+K (Cmd+K on a Mac), then type "tenmoku" or "wedding".'}</span></div>
    <div class="pv2-secs">${d.sections.map(s => html`<section class="pv2-sec" id=${s.id} key=${s.id} aria-label=${s.title}><h4>${s.title}</h4><p>${s.text}</p></section>`)}</div>
    <${Note}>Results rank by tier: a label that starts with your words first, then a label that contains them, then matches only in the group or keys. Enter closes the palette and moves focus to the section.<//>
  </div>`;
};

// ---------------------------------------------------------------- kit.tooltip
P['kit.tooltip'] = ({ samples, theme }) => {
  useFonts(theme);
  const d = first(samples, 'tooltip'); const frame = useRef(null); const max = Math.max(...d.bars.map(b => b.value));
  useEffect(() => { const h = K().tooltip.attach(frame.current, { host: frame.current, content: n => { const b = d.bars[+n.dataset.i]; return { title: b.title, rows: b.rows }; } }); return () => h.destroy(); }, []);
  return html`<div class="pv-stack pv2-frame" ref=${frame}>
    <p class="pv-label">Firings per weekday</p>
    <div class="pv2-chart" role="group" aria-label="Firings per weekday, Monday to Friday">
      ${d.bars.map((b, i) => html`<div class="pv2-col" key=${b.label}><button type="button" class="pv2-mark" data-tip="x" data-i=${i} aria-label=${b.title + ': ' + b.value + ' firings'} style=${'height:' + (b.value / max * 100) + '%'}></button><span>${b.label}</span></div>`)}
    </div>
    <p class="pv2-axis">Bar height is linear from zero; the tallest day is ${max} firings.</p>
    <${Note}>Hover a bar, or press Tab to reach each one. Escape closes the tooltip. Tooltips are appended to the host you pass, here this frame, so they take the stage theme.<//>
  </div>`;
};

// ---------------------------------------------------------------- pattern.disclosure
P['pattern.disclosure'] = ({ samples, theme }) => {
  useFonts(theme);
  const d = first(samples, 'disclosure'); const [v, setV] = useState('card'); const [w, setW] = useState('full');
  const ref = useMount(el => K().disclosure.render(el, {
    variant: v, label: v === 'card' ? 'Studio tasks' : v === 'letter' ? 'Letters' : 'Studio rules',
    items: v === 'card' ? d.items : v === 'letter' ? d.letters : d.clauses,
  }), [v, w]);
  return html`<div class="pv-stack">
    <div class="pv-row"><span class="c-seg" role="group" aria-label="Look">${[['card', 'Task cards'], ['letter', 'Letters'], ['clause', 'Clauses']].map(([k, l]) => html`<button type="button" key=${k} aria-pressed=${v === k} onClick=${() => setV(k)}>${l}</button>`)}</span><${Width} v=${w} set=${setW}/></div>
    <div class=${'pv2-frame' + (w === 'phone' ? ' phone' : '')}><div ref=${ref} key=${v + w}></div></div>
    <${Note}>Native details elements: Enter or Space opens a card, and every card opens before the browser prints. The reader bar counts what is open.<//>
  </div>`;
};

// ---------------------------------------------------------------- pattern.expand-card
P['pattern.expand-card'] = ({ samples, theme }) => {
  useFonts(theme);
  const d = first(samples, 'expand-card'); const [w, setW] = useState('full'); const [hl, setHl] = useState(false); const api = useRef(null); const leg = useRef(null);
  const ref = useMount(el => {
    const h = K().expandCard.mount(el, { cards: d.cards, dims: d.dims, remember: 'catalog-preview-expand-card', open: { 1: true } });
    api.current = h; if (leg.current) h.legend(leg.current); return h;
  }, [w]);
  useEffect(() => { if (api.current) api.current.highlight(hl ? [2] : null); }, [hl, w]);
  return html`<div class="pv-stack">
    <div class="pv-row"><${Width} v=${w} set=${setW}/><button type="button" class="pv-btn" aria-pressed=${hl} onClick=${() => setHl(!hl)}>${hl ? 'Clear highlight' : 'Highlight card 2'}</button></div>
    <div class=${'pv2-frame' + (w === 'phone' ? ' phone' : '')}>
      <p class="pv-label">Status words</p><div ref=${leg} key=${'l' + w}></div>
      <div ref=${ref} key=${w} style="margin-top:10px"></div>
    </div>
    <${Note}>Each status cell is a letter, a symbol and a word. Which cards are open is kept in this browser under one localStorage key (it works without it); a board can keep it in its own store through onToggle.<//>
  </div>`;
};
})();
/* /part:page.script.previews.b2 */

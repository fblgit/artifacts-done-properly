/* part:page.script.previews.b4 */
/* Live previews of batch 4 (report patterns): numbered steps, playbook tabs, finding cards, key figures and the hero, options and the pick, verdict and status, scenario matrix, service blueprint.
   Each mounts the entry's own published file on its own published sample (invented content). The step ticks are kept in this browser only, under the key catalog-preview-steps. */
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
.pv4-cap { margin: 0; font-size: 13px; color: var(--ink-2); }
.pv4-box { min-width: 0; }
.pv4-narrow { max-width: 390px; }
.pv4-line { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; }
.pv4-btn { font: 600 13px var(--f-ui); color: var(--ink); background: var(--panel); border: 1px solid var(--rule); border-radius: 999px; padding: 6px 14px; min-height: 32px; cursor: pointer; }
.pv4-btn:hover { border-color: var(--ink-2); }
.pv4-btn:focus-visible { outline: 2px solid var(--seam, var(--accent)); outline-offset: 2px; }
.pv4-prose { display: grid; gap: 12px; }
.pv4-sample { padding: 14px; border-radius: 12px; background: var(--panel); border: 1px solid var(--rule); }
`;
if (!document.querySelector('style[data-pv="b4"]')) { const st = document.createElement('style'); st.dataset.pv = 'b4'; st.textContent = STYLE; document.head.append(st); }
function useMount(fn, deps) {
  const ref = useRef(null);
  useEffect(() => { if (!ref.current) return; const h = fn(ref.current); return () => { if (h && h.destroy) h.destroy(); }; }, deps || []);
  return ref;
}
const Width = ({ v, set }) => html`<span class="c-seg" role="group" aria-label="Frame width">${[['full', 'Full width'], ['phone', '390 px']].map(([k, l]) =>
  html`<button type="button" key=${k} aria-pressed=${v === k} onClick=${() => set(k)}>${l}</button>`)}</span>`;
const Note = ({ children }) => html`<p class="pv-sim"><b>Preview</b> ${children}</p>`;
const Box = ({ w, children }) => html`<div class=${'pv4-box' + (w === 'phone' ? ' pv4-narrow' : '')}>${children}</div>`;

// ---------------------------------------------------------------- pattern.steps
P['pattern.steps'] = ({ samples, theme }) => {
  useFonts(theme);
  const d = first(samples, 'steps'); const [w, setW] = useState('full'); const [last, setLast] = useState('');
  const ref = useMount(el => K().steps.render(el, { phases: d.phases, key: d.key, reset: true, onChange: p => setLast(p.done + ' of ' + p.total + ' done in this phase') }), [w]);
  return html`<div class="pv-stack">
    <div class="pv-row"><${Width} v=${w} set=${setW}/><span class="pv4-cap" aria-live="polite">${last}</span></div>
    <${Box} w=${w}><div ref=${ref} key=${w}></div><//>
    <${Note}>Tick a step: the count and bar follow, and the tick is kept in this browser under <code>${d.key}</code>. The gate step has its number underlined in the seam and the word Gate.<//>
  </div>`;
};

// ---------------------------------------------------------------- pattern.playbook
P['pattern.playbook'] = ({ samples, theme }) => {
  useFonts(theme);
  const d = first(samples, 'playbook'); const [w, setW] = useState('full');
  const a = useMount(el => K().playbook.render(el, { playbooks: d.playbooks, label: d.label }), [w]);
  const b = useMount(el => K().playbook.pipeline(el, d.pipeline), [w]);
  return html`<div class="pv-stack">
    <div class="pv-row"><${Width} v=${w} set=${setW}/></div>
    <${Box} w=${w}><div class="pv-stack">
      <p class="pv-label">Playbook tabs</p><div ref=${a} key=${'a' + w}></div>
      <p class="pv-label">Pipeline stepper</p><div ref=${b} key=${'b' + w}></div>
    </div><//>
    <${Note}>The arrow keys move between tabs and between stages; Home and End jump. Each command copies from its button, and where the frame refuses the clipboard the text is selected instead.<//>
  </div>`;
};

// ---------------------------------------------------------------- pattern.findings
P['pattern.findings'] = ({ samples, theme }) => {
  useFonts(theme);
  const d = first(samples, 'findings'); const [w, setW] = useState('full'); const [cols, setCols] = useState(1);
  const ref = useMount(el => K().findings.render(el, { items: d.items, cols: cols === 2 ? 2 : 0, label: 'Findings' }), [w, cols]);
  return html`<div class="pv-stack">
    <div class="pv-row"><${Width} v=${w} set=${setW}/>
      <span class="c-seg" role="group" aria-label="Columns">${[[1, 'One column'], [2, 'Two columns']].map(([n, l]) => html`<button type="button" key=${n} aria-pressed=${cols === n} onClick=${() => setCols(n)}>${l}</button>`)}</span></div>
    <${Box} w=${w}><div ref=${ref} key=${w + cols}></div><//>
    <${Note}>The cards sort worst first. The severity is a glyph and a word in the chip, so it reads without colour; there is no coloured edge on the card.<//>
  </div>`;
};

// ---------------------------------------------------------------- pattern.figures
P['pattern.figures'] = ({ samples, theme }) => {
  useFonts(theme);
  const d = first(samples, 'figures'); const [w, setW] = useState('full');
  const h = useMount(el => K().figures.hero(el, d.hero), [w]);
  const g = useMount(el => K().figures.render(el, { variant: 'grid', items: d.grid, label: 'Key figures' }), [w]);
  const t = useMount(el => K().figures.render(el, { variant: 'tiles', items: d.tiles, label: 'Status' }), [w]);
  const s = useMount(el => K().figures.render(el, { variant: 'strip', items: d.strip, label: 'State of the report' }), [w]);
  const f = useMount(el => K().figures.render(el, { variant: 'facts', items: d.facts, label: 'Facts' }), [w]);
  return html`<div class="pv-stack">
    <div class="pv-row"><${Width} v=${w} set=${setW}/></div>
    <${Box} w=${w}><div class="pv-stack" key=${w}>
      <p class="pv-label">Hero with summary chips and count-up figures</p><div ref=${h}></div>
      <p class="pv-label">Grid, one figure marked</p><div ref=${g}></div>
      <p class="pv-label">Status tiles</p><div ref=${t}></div>
      <p class="pv-label">Three-up strip</p><div ref=${s}></div>
      <p class="pv-label">Facts</p><div ref=${f}></div>
    </div><//>
    <${Note}>The figures count up once when they scroll into view; with reduced motion on, or when the page is hidden, they show the final number at once.<//>
  </div>`;
};

// ---------------------------------------------------------------- pattern.options
P['pattern.options'] = ({ samples, theme }) => {
  useFonts(theme);
  const d = first(samples, 'options'); const [w, setW] = useState('full');
  const tb = useMount(el => K().table.render(el, {
    caption: d.table.caption, note: d.table.note, highlight: r => r.picked ? 'picked' : false,
    columns: [{ key: 'o', label: 'Option' }, { key: 'setup', label: 'Setup', num: true, decimals: 0 }, { key: 'year', label: 'Per year', num: true, decimals: 0 }, { key: 'time', label: 'Firing time', num: true, fmt: v => v },
      { key: 'v', label: 'Verdict', cell: r => { const s = document.createElement('span'); s.className = 'kit-pill'; s.dataset.tone = r.tone; s.textContent = r.v; return s; } }],
    rows: d.table.rows,
  }), [w]);
  return html`<div class="pv-stack">
    <div class="pv-row"><${Width} v=${w} set=${setW}/></div>
    <${Box} w=${w}><div class="pv-stack" key=${w}>
      <p class="pv-label">Option cards, one picked</p>
      <div class="kit-options">${d.cards.map(c => html`<article class="kit-option" data-pick=${c.pick ? '' : null} key=${c.k}><p class="kit-option-k">${c.k}</p><h4>${c.name}</h4><p>${c.body}</p>
        <ul class="kit-option-pc">${c.pc.map(([t, x]) => html`<li data-pc=${t} key=${x}><span class="pv-sr" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">${t === 'pro' ? 'Pro: ' : 'Con: '}</span>${x}</li>`)}</ul></article>`)}</div>
      <p class="pv-label">Tier cards</p>
      <div class="kit-tiers">${d.tiers.map(t => html`<article class="kit-tier" data-tier=${t.tier} key=${t.name}><p class="kit-tier-l">${t.label}</p><h4>${t.name}</h4><p>${t.body}</p></article>`)}</div>
      <p class="pv-label">Option table, the pick highlighted</p><div ref=${tb}></div>
    </div><//>
  </div>`;
};

// ---------------------------------------------------------------- pattern.verdict
P['pattern.verdict'] = ({ samples, theme }) => {
  useFonts(theme);
  const d = first(samples, 'verdict'); const [i, setI] = useState(0); const [swap, setSwap] = useState(false); const [w, setW] = useState('full');
  const pick = n => { if (n === i) return; setSwap(true); setTimeout(() => { setI(n); setSwap(false); }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 200); };
  const m = d.mast;
  return html`<div class="pv-stack">
    <div class="pv-row"><${Width} v=${w} set=${setW}/></div>
    <${Box} w=${w}><div class="pv-stack">
      <p class="pv-label">Verdict boxes</p>
      <div class="pv-stack">${d.verdicts.map(v => html`<aside class="kit-verdict" data-tone=${v.tone} key=${v.word}><p class="kit-verdict-k">${v.k}</p><p class="kit-verdict-w">${v.word}</p><ul>${v.list.map(x => html`<li key=${x}>${x}</li>`)}</ul></aside>`)}</div>
      <p class="pv-label">Status banners</p>
      <div class="pv-stack">${d.statuses.map(s => html`<div class="kit-status" data-tone=${s.tone} role="status" key=${s.badge}><span class="kit-status-badge">${s.badge}</span><p>${s.text}</p><p class="kit-status-meta">${s.meta.map(x => html`<span key=${x}>${x}</span>`)}</p></div>`)}</div>
      <p class="pv-label">Masthead with a stamp</p>
      <header class="kit-mast"><p class="kit-mast-stamp">${m.stamp}</p><h1>${m.title}</h1><p class="kit-mast-dek">${m.dek}</p>
        <p class=${'kit-mast-verdict' + (swap ? ' swap' : '')} aria-live="polite">${m.verdicts[i]}</p>
        <div class="pv4-line" role="group" aria-label="Try another claim">${m.verdicts.map((v, n) => html`<button type="button" class="pv4-btn" aria-pressed=${n === i} onClick=${() => pick(n)} key=${n}>Claim ${n + 1}</button>`)}</div>
        <p class="kit-mast-meta">${m.meta.map(x => html`<span key=${x}>${x}</span>`)}</p></header>
    </div><//>
    <${Note}>Claim buttons only demonstrate the swap class; a page toggles <code>.swap</code> around its own text change.<//>
  </div>`;
};

// ---------------------------------------------------------------- pattern.scenarios
P['pattern.scenarios'] = ({ samples, theme }) => {
  useFonts(theme);
  const d = first(samples, 'scenarios'); const [w, setW] = useState('full');
  const a = useMount(el => K().scenarios.render(el, d.matrix), [w]);
  const b = useMount(el => K().scenarios.render(el, Object.assign({ scenarioLabel: 'Control' }, d.ledger)), [w]);
  return html`<div class="pv-stack">
    <div class="pv-row"><${Width} v=${w} set=${setW}/></div>
    <${Box} w=${w}><div class="pv-stack" key=${w}>
      <p class="pv-label">Scenario by configuration</p><div ref=${a}></div>
      <p class="pv-label">Happy path and error path ledger</p><div ref=${b}></div>
    </div><//>
    <${Note}>Both tables scroll sideways inside their own frame at phone width, with the scenario column held in place. Every cell opens with its verdict as a word.<//>
  </div>`;
};

// ---------------------------------------------------------------- pattern.blueprint
P['pattern.blueprint'] = ({ samples, theme }) => {
  useFonts(theme);
  const d = first(samples, 'blueprint'); const [w, setW] = useState('full');
  const n = d.steps.length;
  const cell = (c, i) => html`<td key=${i}>${c.mot ? html`<span class="kit-bp-mot">${c.mot}</span><br/>` : ''}${c.feel ? html`<span class="kit-bp-feel" data-feel=${c.feel}>${c.text}</span>` : c.has ? html`<span class="kit-bp-has">${c.has}</span>` : c.text}${c.pain ? html`<span class="kit-bp-pain">${c.pain}</span>` : ''}${c.opp ? html`<span class="kit-bp-opp">${c.opp}</span>` : ''}</td>`;
  return html`<div class="pv-stack">
    <div class="pv-row"><${Width} v=${w} set=${setW}/></div>
    <${Box} w=${w}>
      <div class="kit-table-box kit-bp" role="region" tabindex="0" aria-label=${d.caption}>
        <table class="kit-table"><caption>${d.caption}</caption>
          <thead><tr><th scope="col">Lane</th>${d.steps.map((s, i) => html`<th scope="col" key=${s}>${i + 1}. ${s}</th>`)}</tr></thead>
          <tbody>${d.lanes.map((l, i) => l.line ? html`<tr class="kit-bp-line" key=${i}><td colspan=${n + 1}><div><span>${l.line}</span></div></td></tr>` : html`<tr key=${i}><th scope="row">${l.name}</th>${l.cells.map(cell)}</tr>`)}</tbody></table></div>
    <//>
    <${Note}>CSS only on top of the table: the lane names stay in view while the steps scroll sideways, the dashed lines divide what the person sees from what they do not, and the feelings are words first.<//>
  </div>`;
};
})();
/* /part:page.script.previews.b4 */

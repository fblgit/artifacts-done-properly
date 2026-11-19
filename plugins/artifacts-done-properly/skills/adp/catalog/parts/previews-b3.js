/* part:page.script.previews.b3 */
/* Live previews of batch 3 (visualizations): bars to scale, the capacity shelf, the clickable topology, the flow diagram, the timeline and roadmap, the one-mark-per-item grid, the sparklines and
   waveform, the before/after compare and the what-if slider chart. Each mounts the entry's own published file on its own published sample (invented figures); nothing is stored and nothing
   leaves the page. Tooltips are appended to the preview's own frame, so they take the stage theme's tokens. */
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
.pv3-frame { min-width: 0; color: var(--ink); font-family: var(--f-ui); display: grid; gap: 18px; }
.pv3-frame.phone { max-width: 390px; }
.pv3-h { margin: 0 0 8px; font: 600 12.5px/1.3 var(--f-mono); color: var(--ink-2); }
.pv3-sec { min-width: 0; }
.pv3-two { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 18px 28px; align-items: start; }
.pv3-two > * { min-width: 0; }
.pv3-cards { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.pv3-card { background: var(--panel); border: 1px solid var(--rule); border-radius: 10px; padding: 8px 12px; display: grid; gap: 2px; font-size: 13.5px; min-width: 0; }
.pv3-card b { font-size: 14px; } .pv3-card span { color: var(--ink-2); font-size: 12.5px; }
.pv3-row { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; }
.pv3-b { min-height: 34px; padding: 4px 12px; border: 1px solid var(--rule); border-radius: 8px; background: var(--panel); color: var(--ink); font: 600 13px/1.2 var(--f-ui); cursor: pointer; }
.pv3-b:hover { border-color: var(--ink-2); } .pv3-b[aria-pressed="true"] { background: var(--sunk); box-shadow: inset 0 0 0 1px var(--seam, var(--accent)); }
.pv3-b:focus-visible { outline: 2px solid var(--seam, var(--accent)); outline-offset: 2px; }
.pv3-cap { margin: 0; font-size: 13px; color: var(--ink-2); } .pv3-cap b { color: var(--ink); }
.pv3-ui { background: var(--panel); border: 1px solid var(--rule); border-radius: 10px; padding: 10px 12px; display: grid; gap: 6px; font-size: 13.5px; }
.pv3-ui h5 { margin: 0; font: 600 14px var(--f-display, var(--f-ui)); }
.pv3-ui ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.pv3-ui li { display: flex; justify-content: space-between; gap: 10px; border-bottom: 1px solid var(--rule-2); padding: 3px 0; }
.pv3-ui li span:last-child { color: var(--ink-2); font-family: var(--f-mono); font-size: 12.5px; }
.pv3-ui p { margin: 0; font-size: 12.5px; color: var(--ink-2); }
.pv3-scroll { max-height: 230px; overflow: auto; }
`;
if (!document.querySelector('style[data-pv="b3"]')) { const st = document.createElement('style'); st.dataset.pv = 'b3'; st.textContent = STYLE; document.head.append(st); }
function useMount(fn, deps) {
  const ref = useRef(null);
  useEffect(() => { if (!ref.current) return; const h = fn(ref.current); return () => { if (h && h.destroy) h.destroy(); }; }, deps || []);
  return ref;
}
const Width = ({ v, set }) => html`<span class="c-seg" role="group" aria-label="Frame width">${[['full', 'Full width'], ['phone', '390 px']].map(([k, l]) =>
  html`<button type="button" key=${k} aria-pressed=${v === k} onClick=${() => set(k)}>${l}</button>`)}</span>`;
const Note = ({ children }) => html`<p class="pv-sim"><b>Preview</b> ${children}</p>`;
const Sec = ({ title, children }) => html`<section class="pv3-sec"><p class="pv3-h">${title}</p>${children}</section>`;

// ---------------------------------------------------------------- viz.bars
P['viz.bars'] = ({ samples, theme }) => {
  useFonts(theme); const d = first(samples, 'bars'); const [w, setW] = useState('full'); const frame = useRef(null);
  const host = () => frame.current;
  const rSplit = useMount(el => K().bars.split(el, { items: d.split.items, unit: d.split.unit, label: 'Glaze batch by outcome', host: host() }), [w]);
  const rScore = useMount(el => K().bars.score(el, { items: d.score.items.map((l, i) => ({ id: 't' + (i + 1), label: 'Tile ' + (i + 1), level: l })), levels: d.score.levels, label: 'Test tiles by result', host: host() }), [w]);
  const rH = useMount(el => K().bars.hbars(el, { rows: d.hbars.rows, unit: d.hbars.unit, valueWord: 'Left', totalWord: 'Bought', label: 'Clay left against clay bought', host: host() }), [w]);
  const rL = useMount(el => K().bars.ladder(el, { items: d.ladder.items, max: d.ladder.max, unit: d.ladder.unit, label: 'Options by strength', host: host() }), [w]);
  const rC = useMount(el => K().bars.columns(el, { categories: d.columns.categories.map(c => ({ id: c, label: c })), series: d.columns.series, unit: d.columns.unit, yLabel: 'Firings', height: 210, table: true, highlight: 'Fri', label: 'Firings per weekday', host: host() }), [w]);
  return html`<div class="pv-stack">
    <div class="pv-row"><${Width} v=${w} set=${setW}/></div>
    <div class=${'pv3-frame' + (w === 'phone' ? ' phone' : '')} ref=${frame} key=${w}>
      <${Sec} title="Split: parts of one whole, in proportion"><div ref=${rSplit}></div><//>
      <${Sec} title="Score bar: one cell per tile, painted by result"><div ref=${rScore}></div><//>
      <${Sec} title="Carried against total, on one scale"><div ref=${rH}></div><//>
      <${Sec} title="Ladder of options"><div ref=${rL}></div><//>
      <${Sec} title="Columns from zero, two series"><div ref=${rC}></div><//>
    </div>
    <${Note}>Every length is linear from zero, and the ticks name values the bars reach. Each series has a colour, a fill pattern and a word in the key. Hover or Tab to a bar for its tooltip. Figures are invented.<//>
  </div>`;
};

// ---------------------------------------------------------------- viz.shelf
P['viz.shelf'] = ({ samples, theme }) => {
  useFonts(theme); const d = first(samples, 'shelf'); const [w, setW] = useState('full'); const frame = useRef(null);
  const ref = useMount(el => K().shelf.mount(el, { units: d.units, unit: d.unit, label: 'Disks on one scale', host: frame.current }), [w]);
  return html`<div class="pv-stack">
    <div class="pv-row"><${Width} v=${w} set=${setW}/></div>
    <div class=${'pv3-frame' + (w === 'phone' ? ' phone' : '')} ref=${frame} key=${w}><div ref=${ref}></div></div>
    <${Note}>The 2,000 GiB disk has a track four times as long as the 500 GiB one. Solid is used, hatched is allocated but unused, a dashed outline is unallocated, a ring is flagged. Tab through the segments.<//>
  </div>`;
};

// ---------------------------------------------------------------- viz.topology
P['viz.topology'] = ({ samples, theme }) => {
  useFonts(theme); const d = first(samples, 'topology'); const [w, setW] = useState('full'); const [picked, setPicked] = useState('w2'); const frame = useRef(null);
  const ref = useMount(el => K().topology.mount(el, {
    width: d.width, height: d.height, minWidth: 540, zones: d.zones, nodes: d.nodes, links: d.links, notes: d.notes, selected: picked, label: 'Service topology', host: frame.current,
    detail: n => Object.assign({ title: n.title }, d.details[n.id]), onSelect: setPicked, caption: 'Zones, nodes and links are config. Dashed links are weaker paths.',
  }), [w]);
  return html`<div class="pv-stack">
    <div class="pv-row"><${Width} v=${w} set=${setW}/><span class="pv3-cap" aria-live="polite">Picked: <b>${picked || 'none'}</b></span></div>
    <div class=${'pv3-frame' + (w === 'phone' ? ' phone' : '')} ref=${frame} key=${w}><div ref=${ref}></div></div>
    <${Note}>Tab to a node, press Enter or Space to open its details; press again to clear. On a narrow screen the drawing scrolls inside its frame so its text stays readable. Five invented nodes.<//>
  </div>`;
};

// ---------------------------------------------------------------- viz.flow
P['viz.flow'] = ({ samples, theme }) => {
  useFonts(theme); const d = first(samples, 'flow'); const [w, setW] = useState('full'); const [num, setNum] = useState(true);
  const ref = useMount(el => K().flow.mount(el, { stages: d.stages, numbered: num, label: 'Upload pipeline', caption: 'The person step, the two sinks and the blocked path each have their own outline and word.' }), [w, num]);
  return html`<div class="pv-stack">
    <div class="pv-row"><${Width} v=${w} set=${setW}/><button type="button" class="pv-btn" aria-pressed=${num} onClick=${() => setNum(!num)}>${num ? 'Numbered steps' : 'Unnumbered'}</button></div>
    <div class=${'pv3-frame' + (w === 'phone' ? ' phone' : '')} key=${w + num}><div ref=${ref}></div></div>
    <${Note}>The row folds into one column when its box is narrower than 560 px, so the 390 px frame shows the folded form. Arrows are drawn in css.<//>
  </div>`;
};

// ---------------------------------------------------------------- viz.timeline
P['viz.timeline'] = ({ samples, theme }) => {
  useFonts(theme); const d = first(samples, 'timeline'); const [w, setW] = useState('full'); const [lit, setLit] = useState([]); const cards = useRef(null);
  const ref = useMount(el => K().timeline.mount(el, { events: d.events, statuses: d.statuses, targets: cards.current, onHighlight: setLit, label: 'Kiln trial events' }), [w]);
  const ph = useMount(el => K().timeline.phases(el, { phases: d.phases, label: 'Roadmap' }), [w]);
  return html`<div class="pv-stack">
    <div class="pv-row"><${Width} v=${w} set=${setW}/></div>
    <div class=${'pv3-frame' + (w === 'phone' ? ' phone' : '')} key=${w}>
      <div class="pv3-two">
        <${Sec} title="Events: hover, focus or press one to light its cards"><div ref=${ref}></div><//>
        <${Sec} title="Cards the events point at"><ul class="pv3-cards" ref=${cards}>${d.cards.map(c => html`<li class="pv3-card" data-id=${c.id} key=${c.id}><b>${c.title}</b><span>${c.text}</span></li>`)}</ul>
          <p class="pv3-cap" aria-live="polite" style="margin-top:10px">${lit.length ? 'Lit: ' + lit.map(i => d.cards.find(c => c.id === i).title).join(', ') : 'Nothing lit.'}</p><//>
      </div>
      <${Sec} title="Roadmap: numbered phases"><div ref=${ph}></div><//>
    </div>
    <${Note}>Each status is a glyph and a word as well as a colour. Events with links are buttons, so the light follows keyboard focus; pressing one holds it. Invented events.<//>
  </div>`;
};

// ---------------------------------------------------------------- viz.dotgrid
P['viz.dotgrid'] = ({ samples, theme }) => {
  useFonts(theme); const d = first(samples, 'dotgrid'); const [w, setW] = useState('full'); const [mode, setMode] = useState('full'); const frame = useRef(null);
  const items = (() => { const cat = {}; d.categories.forEach(c => c.at.forEach(i => { (cat[i] = cat[i] || []).push(c.id); })); return Array.from({ length: d.total }, (_, i) => ({ id: 'f' + i, label: 'File ' + (i + 1) + ' of ' + d.total, cats: cat[i] || [] })); })();
  const ref = useMount(el => K().dotgrid.mount(el, { items, categories: d.categories.map(c => ({ id: c.id, label: c.label, tone: c.tone })), mode, noun: d.noun, label: 'One mark per file', host: frame.current }), [w, mode]);
  return html`<div class="pv-stack">
    <div class="pv-row"><${Width} v=${w} set=${setW}/>
      <span class="c-seg" role="group" aria-label="Look">${[['full', 'All marks'], ['lens', 'Lens']].map(([k, l]) => html`<button type="button" key=${k} aria-pressed=${mode === k} onClick=${() => setMode(k)}>${l}</button>`)}</span></div>
    <div class=${'pv3-frame' + (w === 'phone' ? ' phone' : '')} ref=${frame} key=${w + mode}><div ref=${ref}></div></div>
    <${Note}>400 invented files. A file in a category has a shape as well as a colour. Hover or focus a category to light its marks; press it to hold. In Lens, move the pointer over the grid.<//>
  </div>`;
};

// ---------------------------------------------------------------- viz.sparkline
P['viz.sparkline'] = ({ samples, theme }) => {
  useFonts(theme); const d = first(samples, 'sparkline'); const [w, setW] = useState('full'); const [prog, setProg] = useState(.4); const frame = useRef(null);
  const l = useMount(el => K().sparkline.line(el, { values: d.line.values, labels: d.line.labels, unit: d.line.unit, label: 'Glaze used per day', height: 56, host: frame.current }), [w]);
  const b = useMount(el => K().sparkline.bars(el, { values: d.bars.values, labels: d.bars.labels, unit: d.bars.unit, label: 'Firings per weekday', height: 56, highlight: 6, tone: 'violet', host: frame.current }), [w]);
  const wv = useMount(el => K().sparkline.wave(el, { values: d.wave.values, marks: d.wave.marks, progress: prog, onSeek: setProg, label: 'Waveform, seek with the arrow keys', height: 72, host: frame.current }), [w]);
  return html`<div class="pv-stack">
    <div class="pv-row"><${Width} v=${w} set=${setW}/><span class="pv3-cap" aria-live="polite">Position <b>${Math.round(prog * 100)}%</b></span></div>
    <div class=${'pv3-frame' + (w === 'phone' ? ' phone' : '')} ref=${frame} key=${w}>
      <${Sec} title="Line: 30 days, with low, high and last"><div ref=${l}></div><//>
      <${Sec} title="Bars: from zero"><div ref=${b}></div><//>
      <${Sec} title="Waveform: click, drag or use the arrow keys; two marked windows"><div ref=${wv}></div><//>
    </div>
    <${Note}>The line uses the data's own range and says so under itself. Hover or press the arrow keys on the line to read each value. Marked windows are hatched and Tab-reachable. Invented series.<//>
  </div>`;
};

// ---------------------------------------------------------------- viz.compare
P['viz.compare'] = ({ samples, theme }) => {
  useFonts(theme); const d = first(samples, 'compare'); const [w, setW] = useState('full');
  const logNode = (s, dense) => () => { const n = document.createElement('div'); n.className = 'pv3-ui'; const h = document.createElement('h5'); h.textContent = s.title; const ul = document.createElement('ul');
    s.rows.forEach(r => { const li = document.createElement('li'), a = document.createElement('span'), c = document.createElement('span'); a.textContent = r[0]; c.textContent = r[1]; li.append(a, c); ul.append(li); });
    const p = document.createElement('p'); p.textContent = s.note; n.append(h, ul, p); return n; };
  const st = useMount(el => K().compare.stage(el, { before: logNode(d.before), after: logNode(d.after), labels: d.labels, mode: 'wipe', wipe: 50, title: 'The firing log', label: 'Firing log before and after' }), [w]);
  const cs = useMount(el => K().compare.cards(el, { items: d.cards, label: 'Mechanisms' }), [w]);
  return html`<div class="pv-stack">
    <div class="pv-row"><${Width} v=${w} set=${setW}/></div>
    <div class=${'pv3-frame' + (w === 'phone' ? ' phone' : '')} key=${w}>
      <${Sec} title="Stage: Before, After or Wipe"><div ref=${st}></div><//>
      <${Sec} title="Mechanism cards"><div ref=${cs}></div><//>
    </div>
    <${Note}>In Wipe, drag the divider or press the arrow keys, Home and End. The stage holds live DOM, so the text stays selectable. Cards pair a dashed Before with a solid After.<//>
  </div>`;
};

// ---------------------------------------------------------------- viz.slider-chart
P['viz.slider-chart'] = ({ samples, theme }) => {
  useFonts(theme); const d = first(samples, 'slider-chart'); const [w, setW] = useState('full'); const frame = useRef(null);
  const q = useMount(el => K().sliderChart.mount(el, {
    title: 'Reviewers on a panel', host: frame.current,
    inputs: [{ id: 'n', label: 'Reviewers', min: d.quorum.min, max: d.quorum.max, step: 1, value: d.quorum.value, unit: d.quorum.unit }],
    chart: { unit: 'absences', yLabel: 'Absences the panel can take', max: 5, ticks: 5, height: 190, label: 'Absences tolerated by panel size' },
    model: v => {
      const cats = []; for (let n = d.quorum.min; n <= d.quorum.max; n++) cats.push({ id: n, label: String(n) });
      const maj = n => Math.floor(n / 2) + 1, tol = n => n - maj(n);
      return { categories: cats, series: [{ id: 't', label: 'Absences tolerated', values: cats.map(c => tol(c.id)) }], highlight: v.n,
        readouts: [{ label: 'Majority needed', value: maj(v.n) }, { label: 'Absences tolerated', value: tol(v.n) }, { label: 'With one on leave', value: Math.max(0, tol(v.n) - 1), note: 'more absences' }],
        note: v.n % 2 === 0 ? v.n + ' reviewers tolerate no more absences than ' + (v.n - 1) + ': the extra seat adds a vote, not safety.' : 'A majority of ' + maj(v.n) + ' of ' + v.n + ' can decide.' };
    },
  }), [w]);
  const e = useMount(el => K().sliderChart.mount(el, {
    title: 'Element life, two scenarios (an estimate)', host: frame.current,
    inputs: [{ id: 'f', label: 'Firings a week', min: d.wear.perWeek.min, max: d.wear.perWeek.max, step: 1, value: d.wear.perWeek.value, unit: 'a week' }],
    chart: { unit: 'months', yLabel: 'Months to replacement', max: 60, ticks: 4, height: 210, valueLabels: false, table: true, label: 'Months until the elements need replacing, by firings a week' },
    model: v => {
      const months = (f, s) => d.wear.capacityHours / (f * d.wear.weeks * d.wear.hoursPerFiring * s.wearPerHour);
      const cats = []; for (let f = d.wear.perWeek.min; f <= d.wear.perWeek.max; f++) cats.push({ id: f, label: String(f) });
      return { categories: cats, series: d.wear.scenarios.map(s => ({ id: s.id, label: s.label, values: cats.map(c => Math.round(months(c.id, s) * 10) / 10) })), highlight: v.f,
        readouts: d.wear.scenarios.map(s => ({ label: s.label, value: (Math.round(months(v.f, s) * 10) / 10) + ' months' })),
        note: 'An illustration: ' + d.wear.capacityHours + ' wear hours, ' + d.wear.hoursPerFiring + ' hours a firing, ' + d.wear.weeks + ' weeks a month. Not a measurement.' };
    },
  }), [w]);
  return html`<div class="pv-stack">
    <div class="pv-row"><${Width} v=${w} set=${setW}/></div>
    <div class=${'pv3-frame' + (w === 'phone' ? ' phone' : '')} ref=${frame} key=${w}><div ref=${q}></div><div ref=${e}></div></div>
    <${Note}>Move a slider with the pointer or the arrow keys: the readouts, the chart and the sentence change together. The scale is pinned, so the bars do not rescale under your hand. The model is a function you write.<//>
  </div>`;
};
})();
/* /part:page.script.previews.b3 */

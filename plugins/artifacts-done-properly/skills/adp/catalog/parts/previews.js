/* part:page.script.previews */
/* Live previews: one renderer per preview.render name. Each runs the entry's own published files on its own published samples. */
(function () {
'use strict';
const { html, useState, useEffect } = window.htmPreact;
const P = window.CatalogPreviews = window.CatalogPreviews || {};
const V = () => window.Kit && window.Kit.viz;
const ago = t => { const d = new Date(t); return isNaN(d) ? '' : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
const first = (samples, part) => samples[Object.keys(samples).find(k => k.includes(part))];

// ---------------------------------------------------------------- viz
P['viz.core'] = ({ samples }) => {
  const { Figures, Tally, KindChip, StatusChip } = V(); const d = first(samples, 'viz-chips');
  return html`<div class="pv-stack">
    <p class="pv-label">Figures</p><${Figures} items=${d.figures.map(f => Object.assign({}, f, { tone: f.tone || undefined }))}/>
    <p class="pv-label">Tally of requests to Claude Code</p><div><${Tally} items=${d.tally} label="Requests by step"/></div>
    <p class="pv-label">Kind and status chips</p>
    <ul class="pv-list">${d.records.map(r => html`<li class="pv-rec"><${KindChip} kind=${r.kind} code=${r.code} kinds=${d.kinds}/><${StatusChip} status=${r.status} statuses=${d.statuses}/><span>${r.label}</span></li>`)}</ul>
  </div>`;
};

P['viz.stepper'] = ({ samples }) => {
  const { StepTrack, Stages } = V(); const d = first(samples, 'viz-stepper');
  const [cur, setCur] = useState(d.stages.current);
  return html`<div class="pv-stack">
    <p class="pv-label">The guide’s stages (click one)</p>
    <${Stages} steps=${d.stages.steps} current=${cur} onPick=${setCur}/>
    <p class="pv-label">Requests to Claude Code</p>
    <ul class="pv-list">${d.track.requests.map((r, i) => html`<li class="pv-req" key=${i}>
      <${StepTrack} steps=${d.track.steps} at=${r.at} hints=${d.track.hints} label="Request" meta=${ago(r.created)}/>
      <p>${r.text}</p>${r.response ? html`<p><b>Claude Code:</b> ${r.response}</p>` : ''}</li>`)}</ul>
    <p class="pv-label">A request being worked on (the same rail, busy)</p>
    <div class="pv-req"><${StepTrack} steps=${d.track.steps} at="pending" hints=${d.track.hints} busy=${true} label="Request"/></div>
  </div>`;
};

P['viz.matrix'] = ({ samples }) => {
  const { Matrix } = V(); const d = first(samples, 'viz-matrix');
  const [links, setLinks] = useState(d.links);
  const toggle = (r, c, on) => setLinks(Object.assign({}, links, { [r]: on ? [...(links[r] || []), c] : (links[r] || []).filter(x => x !== c) }));
  return html`<${Matrix} rows=${d.rows} cols=${d.cols} links=${links} canEdit=${true} onToggle=${toggle} title=${d.title} rowHead=${d.rowHead} colHead=${d.colHead} sort=${d.sort} words=${d.words}/>`;
};

function cutNodes(nodes, keep) {
  if (!keep) return nodes;
  return nodes.filter(n => n.shape === 'pill' ? keep.has((n.parents || [])[0]) : keep.has(n.id));
}
P['viz.tree'] = ({ samples }) => {
  const { Tree, Replay, Focus, cutAt } = V(); const d = first(samples, 'viz-tree'), ev = first(samples, 'viz-replay');
  const [sel, setSel] = useState('s-tree'); const [step, setStep] = useState(null); const [playing, setPlaying] = useState(false);
  const nodes = cutNodes(d.nodes, step == null ? null : cutAt(ev.events, step));
  const rank = Object.assign({ page: 9 }, d.rank);
  return html`<div class="pv-grid">
    <${Tree} nodes=${nodes} kinds=${d.kinds} statuses=${d.statuses} rank=${rank} rootKinds=${d.rootKinds} selected=${sel} onPick=${id => setSel(sel === id ? null : id)}
      words=${d.words} legend=${d.legend} height="520px"
      bar=${html`<${Replay} events=${ev.events} kinds=${ev.kinds} step=${step} onStep=${setStep} playing=${playing} onPlaying=${setPlaying} words=${ev.words}/>`}/>
    <aside class="pv-side" aria-label="Selected node"><${Focus} id=${sel} nodes=${nodes} kinds=${d.kinds} statuses=${d.statuses} onPick=${setSel}/></aside>
  </div>`;
};

P['viz.replay'] = ({ samples }) => {
  const { Replay, Figures, KindChip, cutAt, timeline } = V(); const ev = first(samples, 'viz-replay');
  const [step, setStep] = useState(null); const [playing, setPlaying] = useState(false);
  const keep = cutAt(ev.events, step); const l = timeline(ev.events).filter(e => keep.has(e.id));
  const present = [...new Set(ev.events.map(e => e.kind))];
  const figs = present.map(k => ({ label: ((ev.kinds[k] || {}).label || k).toLowerCase() + 's', value: l.filter(e => e.kind === k).length, tone: (ev.kinds[k] || {}).tone }));
  return html`<div class="pv-stack">
    <${Replay} events=${ev.events} kinds=${ev.kinds} step=${step} onStep=${setStep} playing=${playing} onPlaying=${setPlaying} words=${ev.words}/>
    <p class="pv-label">On the board at this step</p>
    <${Figures} items=${figs}/>
    <p class="pv-label">The last five added</p>
    <ul class="pv-list">${l.slice(-5).reverse().map(e => html`<li class="pv-rec" key=${e.id}><${KindChip} kind=${e.kind} kinds=${ev.kinds}/><span>${e.label}</span></li>`)}</ul>
  </div>`;
};

P['viz.impact'] = ({ samples }) => {
  const { impactOf, ImpactList, PreviewBanner, Tree } = V(); const d = first(samples, 'viz-impact'), t = first(samples, 'viz-tree');
  const [on, setOn] = useState(true); const [kept, setKept] = useState(false);
  const imp = impactOf(d.before, d.after, d.options);
  const marks = {};
  if (on) { imp.added.forEach(id => { marks[id] = 'new'; }); imp.changed.forEach(c => { marks[c.id] = c.loss ? 'loss' : 'change'; }); imp.covered.forEach(id => { marks[id] = 'good'; }); imp.uncovered.forEach(id => { marks[id] = 'loss'; }); }
  const banner = on ? html`<${PreviewBanner} impact=${imp} label=${d.label} after=${d.after} onKeep=${() => { setKept(true); setOn(false); }} onStop=${() => setOn(false)}/>` : '';
  return html`<div class="pv-stack">
    ${!on ? html`<div class="pv-rec"><button type="button" class="kv-btn" onClick=${() => { setOn(true); setKept(false); }}>Preview it again</button>${kept ? html`<span style="color:var(--ink-2)">Kept. On a board, Keep applies the change; here it only closes the preview.</span>` : ''}</div>` : ''}
    <${Tree} nodes=${t.nodes} kinds=${t.kinds} statuses=${t.statuses} rank=${Object.assign({ page: 9 }, t.rank)} rootKinds=${t.rootKinds} marks=${marks} banner=${banner} legend=${t.legend} words=${t.words} height="420px" zoom=${0.8}/>
    <p class="pv-label">What it changes</p>
    <${ImpactList} impact=${imp} after=${d.after} kinds=${d.kinds} words=${{ cover: 'move' }}/>
  </div>`;
};

P['viz.focus'] = ({ samples }) => {
  const { Focus } = V(); const d = first(samples, 'viz-tree');
  const [id, setId] = useState('s-tree');
  const cards = d.nodes.filter(n => n.shape !== 'pill');
  return html`<div class="pv-stack" style="max-width:560px">
    <label class="pv-label" for="pvFocus">Focus on</label>
    <select id="pvFocus" class="pv-pick" value=${id} onChange=${e => setId(e.target.value)}>${cards.map(n => html`<option value=${n.id}>${(n.code ? n.code + ' ' : '') + n.label}</option>`)}</select>
    <div class="pv-side" style="max-height:none"><${Focus} id=${id} nodes=${d.nodes} kinds=${d.kinds} statuses=${d.statuses} onPick=${setId}/></div>
  </div>`;
};

P['viz.buckets'] = ({ samples }) => {
  const { Buckets } = V(); const d = first(samples, 'viz-buckets');
  const [cards, setCards] = useState(d.cards);
  const move = (id, bucket, order) => setCards(cards.map(c => c.id === id ? Object.assign({}, c, { bucket, order }) : c));
  return html`<${Buckets} buckets=${d.buckets} cards=${cards} onMove=${move} canEdit=${true} kinds=${d.kinds} statuses=${d.statuses} title=${d.title}/>`;
};

// ---------------------------------------------------------------- themes
const ROLES = [
  ['Surfaces', ['--bg', '--ground', '--panel', '--sheet', '--sunk', '--canvas', '--mat']],
  ['Ink and rules', ['--ink', '--ink-2', '--ink-3', '--rule', '--rule-2']],
  ['Accent', ['--accent', '--accent-soft', '--accent-ink', '--focus']],
  ['Meaning', ['--ok', '--warn', '--danger', '--st-proposed', '--st-accepted', '--st-rejected', '--st-superseded', '--v-open', '--v-chosen', '--v-rejected', '--rq-queue', '--rq-ack', '--rq-working', '--rq-done']],
  ['Kinds', ['--k-problem', '--k-solution', '--k-idea', '--k-question', '--k-decision', '--k-task']],
  ['Pens', ['--c-ink', '--c-red', '--c-oxblood', '--c-green', '--c-pine', '--c-blue', '--c-slate', '--c-amber', '--c-brass', '--c-violet', '--c-plum']],
  ['Sticky tints', ['--st-yellow', '--st-blue', '--st-pink', '--st-green', '--t-canary', '--t-sky', '--t-rose', '--t-mint']],
];
function Composite({ samples }) {
  const { Figures, StepTrack, Matrix } = V(); const c = first(samples, 'viz-chips'), st = first(samples, 'viz-stepper'), m = first(samples, 'viz-matrix');
  if (!c || !st || !m) return '';
  return html`<div class="pv-stack">
    <${Figures} items=${c.figures.slice(0, 4).map(f => Object.assign({}, f, { tone: f.tone || undefined }))}/>
    <div class="pv-req">${st.track.requests.map((r, i) => html`<${StepTrack} key=${i} steps=${st.track.steps} at=${r.at} hints=${st.track.hints} label="Request"/>`)}</div>
    <${Matrix} rows=${m.rows.slice(0, 4)} cols=${m.cols.slice(0, 8)} links=${m.links} title=${m.title} rowHead=${m.rowHead} words=${m.words}/>
  </div>`;
}
P.theme = ({ e, theme, dark, samples }) => {
  const t = theme || first(samples, 'themes/');
  if (!t) return html`<div class="stage-load">The theme’s data file did not load.</div>`;
  const m = Object.assign({}, t.light, dark ? t.dark : {});
  const alias = t.aliases || {};
  const own = k => !(k in alias);
  const fonts = [['display', '--f-display', 'Decisions recorded, problems covered'], ['ui', alias['--f-ui'] ? '--f-body' : '--f-ui', 'The quick lane answers in seconds; the deep lane reads the repo first.'],
    ['mono', alias['--f-mono'] ? '--f-code' : '--f-mono', 'sha 4012a99260dc · 12.5px · 0123456789'], ['hand', '--f-hand', 'sticky: check it at phone width']].filter(([, k]) => m[k]);
  return html`<div class="pv-stack">
    <div class="sw-groups">${ROLES.map(([g, keys]) => { const ks = keys.filter(k => m[k] && own(k)); return ks.length ? html`<section class="sw-group" key=${g}><h4>${g}</h4>
      <div class="sw-grid">${ks.map(k => html`<div class="c-sw" key=${k}><i style=${'background:var(' + k + ')'}></i><b>${k}</b><span>${m[k]}</span></div>`)}</div></section>` : ''; })}</div>
    <section class="sw-group"><h4>Type</h4><div class="type-spec">${fonts.map(([r, k, line]) => html`<div key=${r}><span>${r} · ${k}</span><p style=${'font-family:var(' + k + ');font-size:' + (r === 'display' ? '24px;font-weight:700' : '15px')}>${line}</p></div>`)}</div></section>
    ${window.Kit && window.Kit.viz && window.Kit.viz.Matrix ? html`<section class="sw-group"><h4>The kit in this palette</h4><${Composite} samples=${samples}/></section>` : ''}
    ${Object.keys(alias).length ? html`<section class="sw-group"><h4>Kit contract names</h4><p style="margin:0;color:var(--ink-2);font-size:13px">${Object.entries(alias).map(([k, v], i) => html`${i ? ' · ' : ''}<code>${k}</code> = <code>${v}</code>`)}</p></section>` : ''}
  </div>`;
};

// ---------------------------------------------------------------- guides, templates, the runtime
function toc(md) { return String(md).split('\n').filter(l => l.startsWith('## ')).map(l => l.slice(3).trim()); }
const slug = s => 'g-' + s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
P.guide = ({ samples }) => {
  const md = (samples[Object.keys(samples)[0]] || '').replace(/^---\n[\s\S]*?\n---\n/, '');   // the guide's front matter is for skills, not readers
  let body = '';
  try { body = window.DOMPurify.sanitize(window.marked.parse(md)).replace(/<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g, '<figure class="kit-mmd-frame"><div class="kit-mmd-scroll"><pre class="kit-mmd">$1</pre></div></figure>'); } catch (_) { const d = document.createElement('div'); d.textContent = md; body = '<pre>' + d.innerHTML + '</pre>'; }
  const heads = toc(md);
  useEffect(() => { document.querySelectorAll('.cat-md h2').forEach(h => { h.id = slug(h.textContent); }); }, [body]);
  useEffect(() => { const a = body.includes('kit-mmd') && window.Kit && window.Kit.mermaid && document.querySelector('.cat-md'), m = a && window.Kit.mermaid.mount(a); return () => m && m.destroy(); }, [body]);      // the guide's ```mermaid blocks, drawn by kit.mermaid (its preview "uses")
  return html`<div class="reader">
    <article class="cat-md" dangerouslySetInnerHTML=${{ __html: body }}></article>
    ${heads.length ? html`<nav class="toc" aria-label="Sections">${heads.map(h => html`<a href=${'#' + slug(h)} onClick=${ev => { ev.preventDefault(); const el = document.getElementById(slug(h)); el && el.scrollIntoView({ block: 'start' }); }}>${h}</a>`)}</nav>` : ''}
  </div>`;
};
P.template = ({ samples }) => {
  const src = samples[Object.keys(samples)[0]] || '';
  const lines = String(src).split('\n');
  const parts = []; const stack = [];
  const MARK = /(?:<!--|\/\*)\s*(\/?)part:([a-z0-9.-]+)\s*(?:-->|\*\/)/g;
  for (const l of lines) { let m; MARK.lastIndex = 0; while ((m = MARK.exec(l))) { if (m[1]) stack.pop(); else { parts.push([m[2], stack.length]); stack.push(m[2]); } } }
  const scripts = lines.filter(l => l.includes('<script src=')).map(l => (l.match(/src="([^"]+)"/) || [])[1]).filter(Boolean);
  return html`<div class="pv-stack">
    <h3 style="font-size:15px">Parts the shell marks</h3>
    <ul class="outline">${parts.map(([id, d]) => html`<li class=${'d' + d}>${id}</li>`)}</ul>
    <h3 style="font-size:15px">Script order</h3>
    <ol class="outline">${scripts.map(s => html`<li>${s}</li>`)}</ol>
    <h3 style="font-size:15px">Source</h3>
    <div class="code src-view"><pre tabindex="0">${lines.map(l => l.includes('part:') ? html`<span class="mk">${l}</span>\n` : l + '\n')}</pre></div>
  </div>`;
};
P['runtime.adp'] = () => {
  const [c, setC] = useState(window.ADP_CHECK || null);
  useEffect(() => { const t = setInterval(() => setC(window.ADP_CHECK || null), 1500); return () => clearInterval(t); }, []);
  const yes = (b, y, n) => html`<span class=${b ? 'ok' : 'no'}>${b ? y : n}</span>`;
  return html`<div class="pv-stack">
    <p class="about" style="margin:0">This page runs the runtime. What it reports about this page right now:</p>
    ${!c ? html`<p class="c-faint">The runtime has not reported yet. It reports about a second and a half after the page settles.</p>` : html`<div class="live">
      <span>build <b>${c.build}</b> · view <b>${c.view}</b></span>
      <span>self-check: ${yes(c.ok, 'ok', 'not ok')}</span>
      <span>parts missing: ${c.missing.length ? html`<span class="no">${c.missing.join(', ')}</span>` : yes(true, 'none', '')}</span>
      <span>parts nobody marked: ${c.unmarked.length ? html`<span class="no">${c.unmarked.join(', ')}</span>` : yes(true, 'none', '')}</span>
      <span>horizontal overflow: ${yes(!c.overflow_x, '0 px', c.overflow_x + ' px')}</span>
      <span>script errors: ${c.errors.length ? html`<span class="no">${c.errors.join(' | ')}</span>` : yes(true, 'none', '')}</span>
      <span>comment anchors: ${c.anchors && c.anchors.anchors}</span>
    </div>`}
  </div>`;
};
})();
/* /part:page.script.previews */

/* part:page.script.app */
/* The views. Each view is a part; each section inside it is a part with markers here and a data-part root.
   Copy-only sections render ADP.content(<id>); adp.js repaints them live when content/<id> changes in the db.
   Add a view: one VIEWS entry, its parts marked, its ids in TITLES. */
(function(){
'use strict';
const $ = s => document.querySelector(s);
const copy = id => window.ADP ? window.ADP.content(id) : '';

const VIEWS = {
  /* part:overview */
  "overview": {
    label: "Overview",
    parts: ["overview", "overview.purpose", "overview.principles", "overview.squads"],
    html: () => `<section class="view" data-part="overview" data-comment-target aria-label="Overview">
      <!-- part:overview.purpose --><div class="card" data-part="overview.purpose" data-comment-target></div><!-- /part:overview.purpose -->
      <!-- part:overview.principles --><div class="card" data-part="overview.principles" data-comment-target></div><!-- /part:overview.principles -->
      <!-- part:overview.squads --><div class="card" data-part="overview.squads" data-comment-target></div><!-- /part:overview.squads -->
    </section>`,
  },
  /* /part:overview */
  /* part:how */
  "how": {
    label: "How it works",
    parts: ["how", "how.layers", "how.flow", "how.local", "how.lifecycle"],
    html: () => `<section class="view" data-part="how" data-comment-target aria-label="How it works">
      <!-- part:how.layers --><div class="card" data-part="how.layers" data-comment-target></div><!-- /part:how.layers -->
      <!-- part:how.flow --><div class="card" data-part="how.flow" data-comment-target></div><!-- /part:how.flow -->
      <!-- part:how.local --><div class="card" data-part="how.local" data-comment-target></div><!-- /part:how.local -->
      <!-- part:how.lifecycle --><div class="card" data-part="how.lifecycle" data-comment-target></div><!-- /part:how.lifecycle -->
    </section>`,
  },
  /* /part:how */
  /* part:pieces */
  "pieces": {
    label: "Pieces",
    parts: ["pieces", "pieces.map", "pieces.shelf", "pieces.stage", "pieces.jobs"],
    html: () => `<section class="view" data-part="pieces" data-comment-target aria-label="Pieces">
      <!-- part:pieces.map --><div class="card" data-part="pieces.map" data-comment-target></div><!-- /part:pieces.map -->
      <!-- part:pieces.shelf --><div class="card" data-part="pieces.shelf" data-comment-target></div><!-- /part:pieces.shelf -->
      <!-- part:pieces.stage --><div class="card" data-part="pieces.stage" data-comment-target></div><!-- /part:pieces.stage -->
      <!-- part:pieces.jobs --><div class="card" data-part="pieces.jobs" data-comment-target></div><!-- /part:pieces.jobs -->
    </section>`,
  },
  /* /part:pieces */
  /* part:scenes */
  "scenes": {
    label: "Scene spec",
    parts: ["scenes", "scenes.format", "scenes.types", "scenes.outputs"],
    html: () => `<section class="view" data-part="scenes" data-comment-target aria-label="Scene spec">
      <!-- part:scenes.format --><div class="card" data-part="scenes.format" data-comment-target></div><!-- /part:scenes.format -->
      <!-- part:scenes.types --><div class="card" data-part="scenes.types" data-comment-target></div><!-- /part:scenes.types -->
      <!-- part:scenes.outputs --><div class="card" data-part="scenes.outputs" data-comment-target></div><!-- /part:scenes.outputs -->
    </section>`,
  },
  /* /part:scenes */
  /* part:data */
  "data": {
    label: "Data and actions",
    parts: ["data", "data.model", "data.actions", "data.caps"],
    html: () => `<section class="view" data-part="data" data-comment-target aria-label="Data and actions">
      <!-- part:data.model --><div class="card" data-part="data.model" data-comment-target></div><!-- /part:data.model -->
      <!-- part:data.actions --><div class="card" data-part="data.actions" data-comment-target></div><!-- /part:data.actions -->
      <!-- part:data.caps --><div class="card" data-part="data.caps" data-comment-target></div><!-- /part:data.caps -->
    </section>`,
  },
  /* /part:data */
  /* part:journeys */
  "journeys": {
    label: "Journeys",
    parts: ["journeys", "journeys.j1", "journeys.j5"],
    html: () => `<section class="view" data-part="journeys" data-comment-target aria-label="Journeys">
      <!-- part:journeys.j1 --><div class="card" data-part="journeys.j1" data-comment-target></div><!-- /part:journeys.j1 -->
      <!-- part:journeys.j5 --><div class="card" data-part="journeys.j5" data-comment-target></div><!-- /part:journeys.j5 -->
    </section>`,
  },
  /* /part:journeys */
  /* part:kits */
  "kits": {
    label: "Kits to contribute",
    parts: ["kits", "kits.rules", "kits.new", "kits.reuse", "kits.missing"],
    html: () => `<section class="view" data-part="kits" data-comment-target aria-label="Kits to contribute">
      <!-- part:kits.rules --><div class="card" data-part="kits.rules" data-comment-target></div><!-- /part:kits.rules -->
      <!-- part:kits.new --><div class="card" data-part="kits.new" data-comment-target></div><!-- /part:kits.new -->
      <!-- part:kits.reuse --><div class="card" data-part="kits.reuse" data-comment-target></div><!-- /part:kits.reuse -->
      <!-- part:kits.missing --><div class="card" data-part="kits.missing" data-comment-target></div><!-- /part:kits.missing -->
    </section>`,
  },
  /* /part:kits */
  /* part:engines */
  "engines": {
    label: "Engines and environment",
    parts: ["engines", "engines.table", "engines.contract", "engines.env"],
    html: () => `<section class="view" data-part="engines" data-comment-target aria-label="Engines and environment">
      <!-- part:engines.table --><div class="card" data-part="engines.table" data-comment-target></div><!-- /part:engines.table -->
      <!-- part:engines.contract --><div class="card" data-part="engines.contract" data-comment-target></div><!-- /part:engines.contract -->
      <!-- part:engines.env --><div class="card" data-part="engines.env" data-comment-target></div><!-- /part:engines.env -->
    </section>`,
  },
  /* /part:engines */
  /* part:quality */
  "quality": {
    label: "Quality bar",
    parts: ["quality", "quality.gates", "quality.risks"],
    html: () => `<section class="view" data-part="quality" data-comment-target aria-label="Quality bar">
      <!-- part:quality.gates --><div class="card" data-part="quality.gates" data-comment-target></div><!-- /part:quality.gates -->
      <!-- part:quality.risks --><div class="card" data-part="quality.risks" data-comment-target></div><!-- /part:quality.risks -->
    </section>`,
  },
  /* /part:quality */
  /* part:plan */
  "plan": {
    label: "Plan and decisions",
    parts: ["plan", "plan.slices", "plan.decisions"],
    html: () => `<section class="view" data-part="plan" data-comment-target aria-label="Plan and decisions">
      <!-- part:plan.slices --><div class="card" data-part="plan.slices" data-comment-target></div><!-- /part:plan.slices -->
      <!-- part:plan.decisions --><div class="card" data-part="plan.decisions" data-comment-target></div><!-- /part:plan.decisions -->
    </section>`,
  },
  /* /part:plan */
  /* part:requests */
  requests: {
    label: 'Requests',
    parts: ['requests', 'requests.intro', 'requests.list'],
    html: () => `<section class="view requests-view" data-part="requests" data-comment-target aria-label="Requests">
      <!-- part:requests.intro --><div class="card" data-part="requests.intro" data-comment-target></div><!-- /part:requests.intro -->
      <!-- part:requests.list --><div class="req-list" data-part="requests.list" data-comment-target aria-label="Every request, newest first"></div><!-- /part:requests.list -->
    </section>`,
  },
  /* /part:requests */
  /* part:canvas */
  canvas: {
    label: 'Canvas',
    parts: ['canvas', 'canvas.intro', 'canvas.board'],
    html: () => `<section class="view canvas-view" data-part="canvas" data-comment-target aria-label="Canvas">
      <!-- part:canvas.intro --><div class="card" data-part="canvas.intro" data-comment-target></div><!-- /part:canvas.intro -->
      <!-- part:canvas.board --><div class="canvas-host" data-part="canvas.board" data-comment-target aria-label="Canvas board"></div><!-- /part:canvas.board -->
    </section>`,
  },
  /* /part:canvas */
  /* part:mycatalog */
  mycatalog: {
    label: 'My catalog',
    parts: ['mycatalog', 'mycatalog.intro', 'mycatalog.list'],
    html: () => `<section class="view mycatalog-view" data-part="mycatalog" data-comment-target aria-label="My catalog">
      <!-- part:mycatalog.intro --><div class="card" data-part="mycatalog.intro" data-comment-target></div><!-- /part:mycatalog.intro -->
      <!-- part:mycatalog.list --><div class="card" data-part="mycatalog.list" data-comment-target aria-label="The owner's catalog"></div><!-- /part:mycatalog.list -->
    </section>`,
  },
  /* /part:mycatalog */
  /* part:settings */
  settings: {
    label: 'Settings', hidden: true,      // reached from the gear and by #settings, not from the tabs
    parts: ['settings', 'settings.intro', 'settings.switches', 'settings.inbox', 'settings.namespaces'],
    html: () => `<section class="view settings-view" data-part="settings" data-comment-target aria-label="Settings">
      <!-- part:settings.intro --><div class="card" data-part="settings.intro" data-comment-target></div><!-- /part:settings.intro -->
      <!-- part:settings.switches --><div class="card" data-part="settings.switches" data-comment-target></div><!-- /part:settings.switches -->
      <!-- part:settings.inbox --><div class="card" data-part="settings.inbox" data-comment-target></div><!-- /part:settings.inbox -->
      <!-- part:settings.namespaces --><div class="card" data-part="settings.namespaces" data-comment-target></div><!-- /part:settings.namespaces -->
    </section>`,
  },
  /* /part:settings */
};
const TITLES = {'page.header': 'Header', 'page.lead': 'Lead', 'page.tabs': 'Views', 'page.changes': 'What changed', 'page.assist': 'Work with Claude',
  requests: 'Requests', 'requests.intro': 'Requests intro', 'requests.list': 'Request list',
  canvas: 'Canvas', 'canvas.intro': 'Canvas intro', 'canvas.board': 'Canvas board',
  mycatalog: 'My catalog', 'mycatalog.intro': 'My catalog intro', 'mycatalog.list': 'My catalog list',
  "overview": "Overview", "overview.purpose": "What it is and why", "overview.principles": "Principles", "overview.squads": "Who works on it", "how": "How it works", "how.layers": "Three layers", "how.flow": "One clip, end to end", "how.local": "Local development and publishing", "how.lifecycle": "Job lifecycle", "pieces": "Pieces", "pieces.map": "The pieces", "pieces.shelf": "Shelf, board and inspector", "pieces.stage": "Stage, timeline and narration", "pieces.jobs": "Settings, queue, review, assets", "scenes": "Scene spec", "scenes.format": "The spec", "scenes.types": "Scene types", "scenes.outputs": "Outputs and files", "data": "Data and actions", "data.model": "Data model", "data.actions": "Actions", "data.caps": "Capabilities and rules", "journeys": "Journeys", "journeys.j1": "J1 to J4", "journeys.j5": "J5 to J8", "kits": "Kits to contribute", "kits.rules": "What a contributed kit must be", "kits.new": "The four new kits", "kits.reuse": "What the catalog already gives", "kits.missing": "What is genuinely missing", "engines": "Engines and environment", "engines.table": "Engines and their state", "engines.contract": "The engine adapter contract", "engines.env": "Environment notes", "quality": "Quality bar", "quality.gates": "Gates", "quality.risks": "Risks", "plan": "Plan and decisions", "plan.slices": "Slices", "plan.decisions": "Decisions to make",
  settings: 'Settings', 'settings.intro': 'Settings intro', 'settings.switches': 'Switches', 'settings.inbox': 'Incoming', 'settings.namespaces': 'Namespaces'};
const COPY = new Set(Object.keys(window.ADP_CONTENT || {}));   // parts whose inner HTML is copy

let view = '', mounted = [], engine = null, panel = null;
/* Assist: the engine starts once the config is read; the panel lives in page.assist (a side pane on a wide screen, a sheet on a phone). */
const Kit0 = window.Kit || {}, A = $('#assist'), B = $('#assistBtn'), L = $('#layout'), S = $('#assistScrim');
const hasAssist = !!(window.ADP && Kit0.assist && Kit0.assistPanel);
function setOpen(on, focus){
  if (!A) return;
  A.hidden = !on; S.hidden = !on; B.setAttribute('aria-expanded', String(on));
  if (on) L.setAttribute('data-assist-open', ''); else L.removeAttribute('data-assist-open');
  try { sessionStorage.setItem('assist-open', on ? '1' : ''); } catch (e) {}
  if (on && focus && panel) panel.focus(); else if (!on && focus) B.focus();
}
const claudeUse = n => (window.claude && claude.use ? Promise.resolve(claude.use(n)).catch(() => null) : Promise.resolve(null));
const ready = hasAssist ? ADP.config.ready.then(() => {
  engine = Kit0.assist.start({
    page: window.ADP, config: ADP.config, titles: TITLES,
    comments: claudeUse('comments'), sample: claudeUse('sample'),
    onPick: p => { setOpen(true); if (panel) panel.setScope(p, true); },
  });
  return engine.ready;
}).then(() => {
  const body = $('#assistBody');
  panel = Kit0.assistPanel.mount(body, {engine, titles: TITLES, me: engine.me(), onReveal: reveal});
  Kit0.presence.mount($('#presence'), {engine, compact: true, canPing: false, ask: engine.can().ask});
  B.hidden = false;
  try { if (sessionStorage.getItem('assist-open')) setOpen(true); } catch (e) {}
}).catch(() => { B.hidden = true; }) : Promise.resolve();
if (B) {
  B.addEventListener('click', () => setOpen(A.hidden, true));
  $('#assistClose').addEventListener('click', () => setOpen(false, true));
  S.addEventListener('click', () => setOpen(false, true));
  A.addEventListener('keydown', e => { if (e.key === 'Escape' && !document.documentElement.classList.contains('kit-bp-on')) { e.stopPropagation(); setOpen(false, true); } });
}
function unmount(){ mounted.forEach(m => { try { m.destroy(); } catch (e) {} }); mounted = []; }
function mountSettings(){
  const Kit = window.Kit || {}, sw = $('[data-part="settings.switches"]'), ns = $('[data-part="settings.namespaces"]'), ib = $('[data-part="settings.inbox"]');
  if (!window.ADP || !Kit.settings || !Kit.namespaces) {
    sw.innerHTML = '<p class="muted">The settings kit is not installed.</p>'; ns.hidden = true; ib.hidden = true; return;
  }
  const done = () => { if (view !== 'settings') return;
    mounted.push(Kit.settings.mount(sw, {}));
    if (Kit.inbox && ADP.db) mounted.push(Kit.inbox.mount(ib, {})); else ib.hidden = true;     // an agent's proposal is applied or declined here
    mounted.push(Kit.namespaces.mount(ns, {parts: Object.keys(TITLES), titles: TITLES})); };
  Promise.all([ADP.config.ready, themesReady]).then(done);      // the Theme switch lists the installed themes, so they are read first
}
function mountRequests(){
  const box = $('[data-part="requests.list"]'), Kit = window.Kit || {};
  if (!box) return;
  if (!engine || !Kit.requestCard) { box.innerHTML = '<p class="muted card">' + (engine ? 'The request card kit is not installed.' : 'Requests need the assist kit, and it is not available on this page.') + '</p>'; return; }
  const cards = new Map(), empty = document.createElement('p');
  empty.className = 'muted card'; empty.textContent = 'Nothing has been sent yet. Open Work with Claude, pick a block and say what you want.';
  const list = engine.requests({});
  const paint = rows => {
    const ids = new Set(rows.map(r => r.id));
    cards.forEach((c, id) => { if (!ids.has(id)) { c.m.destroy(); c.el.remove(); cards.delete(id); } });
    rows.forEach((r, i) => {
      let c = cards.get(r.id);
      if (!c) { const el = document.createElement('div'); el.className = 'req-item';
        c = {el, m: Kit.requestCard.mount(el, {engine, rid: r.id, me: engine.me(), titles: TITLES, onReveal: reveal, fold: true, open: i === 0})}; cards.set(r.id, c); }      // a done request folds to one line; the newest stays open
      if (box.children[i] !== c.el) box.insertBefore(c.el, box.children[i] || null);
    });
    empty.hidden = rows.length > 0; if (!empty.parentNode) box.append(empty);
  };
  const off = list.on(paint); paint(list.get());
  mounted.push({destroy(){ off(); cards.forEach(c => c.m.destroy()); }});
}
/* The My catalog view lists what this page has installed: installed.json, written beside the page by adp.py new from the page's take list and
   what those entries require (the files it loads), with their words from the owner's catalog. A component that has a place on this page says where
   (INSTALLED_AT: entry id -> part ids) and offers two buttons on that part: Show it (the page goes to it and rings it) and Work on it (Work with Claude
   opens with that part picked, so the request is about that block). The page is the render; nothing is previewed twice. */
const INSTALLED_AT = {'pattern.settings': ['settings.switches'], 'pattern.inbox': ['settings.inbox'], 'pattern.namespaces': ['settings.namespaces'],
  'pattern.assist-panel': ['page.assist'], 'pattern.presence': ['page.header'], 'kit.skins': ['page.header'], 'pattern.request-card': ['requests.list'],
  'kit.canvas': ['canvas.board'], 'pattern.mindmap': ['canvas.board']};
function mountMyCatalog(){
  const box = $('[data-part="mycatalog.list"]');
  if (!box) return;
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  let dead = false;
  mounted.push({destroy(){ dead = true; }});
  const none = why => { box.innerHTML = '<p class="muted">' + why + '</p>'; };
  fetch('installed.json').then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.json(); }).then(j => {
    if (dead) return;
    if (!j || !Array.isArray(j.entries) || !j.entries.length) return none('Nothing is listed as installed.');
    const here = j.entries.filter(e => INSTALLED_AT[e.id]), rest = j.entries.filter(e => !INSTALLED_AT[e.id]);
    const item = e => `<li class="mc-item"><div><b>${esc(e.name || e.id)}</b> <code>${esc(e.id)}</code> <span class="muted">${esc(e.group || '')}${e.version ? ' · ' + esc(e.version) : ''}</span>${e.summary ? `<p class="muted">${esc(e.summary)}</p>` : ''}`
      + (INSTALLED_AT[e.id] || []).map(pid => `<p class="mc-where">On this page: <b>${esc(TITLES[pid] || pid)}</b> <code>${esc(pid)}</code> <button type="button" class="btn" data-show="${esc(pid)}">Show it</button> <button type="button" class="btn primary" data-work="${esc(pid)}" data-name="${esc(e.name || e.id)}">Work on it</button></p>`).join('')
      + `</div></li>`;
    box.innerHTML = `<p class="muted mc-src">${j.entries.length} installed on this page${j.url ? `, from <a href="${esc(j.url)}" target="_blank" rel="noopener">your catalog</a>` : ''}. ${here.length} of them have a place you can see on this page.</p>`
      + (here.length ? `<h3>On this page</h3><ul class="mc-list">${here.map(item).join('')}</ul>` : '')
      + (rest.length ? `<h3>Libraries and helpers</h3><p class="muted">No block of their own: other components use them.</p><ul class="mc-list">${rest.map(item).join('')}</ul>` : '')
      + '<p class="muted mc-note" role="status" aria-live="polite"></p>';
  }).catch(() => { if (!dead) none('This page has no list of what it installed. Create it again with <code>adp.py new</code>, or ask Claude to write <code>installed.json</code> beside the page.'); });
  box.addEventListener('click', e => {
    const sh = e.target.closest('button[data-show]'), wk = e.target.closest('button[data-work]');
    if (sh) { reveal(sh.dataset.show); return; }
    if (!wk) return;
    const note = box.querySelector('.mc-note'), id = wk.dataset.work, el = document.querySelector('[data-part="' + id + '"]');
    if (!panel) { if (note) note.textContent = 'Work with Claude is not available on this page.'; return; }
    setOpen(true);
    panel.setScope({id, label: TITLES[id] || id, hash: '', quote: el ? String(el.innerText || '').trim().slice(0, 600) : ''}, true);
  });
}
/* The Home examples: each is a ready request. The button sends it to Claude through the assist engine (engine.send), so the person sees how a request is made, followed and answered.
   A prompt names what is wanted and tells Claude to check the catalog first; keep each under about 600 characters, the comment that wakes the session has a 4000 byte limit.
   A prompt that needs the person's choice says to ask it in the response and stop: a request ends at its response, and the person's answer reopens it as a reply. */
const CATALOG_RULE = ' Check the catalog first and take what already exists; build only what is missing, and tell me if it deserves a catalog entry.';
const EXAMPLES = [
  {id: 'kanban', cat: 'work', title: 'A drag and drop board', blurb: 'Cards that move between columns', icon: 'kanban', rec: true, text: 'Add a Board view: columns To do, Doing and Done with cards I can drag between them and add, edit and delete, saved in the page database so everyone sees the same board. Take viz.buckets for the dragging.' + CATALOG_RULE},
  {id: 'calendar', cat: 'work', title: 'A calendar', blurb: 'Events you can move around', icon: 'calendar', text: 'Add a Calendar view: a month grid where I can add, move and delete events by dragging, saved in the page database, readable on a phone.' + CATALOG_RULE},
  {id: 'drafting', cat: 'work', title: 'A drafting board', blurb: 'Write in sections, keep every version', icon: 'drafting', text: 'Add a Drafting view: a page to write a draft in sections, reorder the sections by dragging, and keep every saved version so I can go back.' + CATALOG_RULE},
  {id: 'canvas', cat: 'work', title: 'A canvas for my topic', blurb: 'Start with something to move', icon: 'canvas', text: 'In the Canvas tab, add a ready-made canvas for planning a trip: a board with sticky notes for days, places and bookings, so it opens with something to move around instead of empty.' + CATALOG_RULE},
  {id: 'mindmap', cat: 'work', title: 'A mind map to start from', blurb: 'Think in branches', icon: 'mindmap', rec: true, text: 'In the Canvas tab, make the Mind map open with a map of my project in place of the sample. Ask me for its name and three main branches in your response and stop there; I will answer on this request and then you build it.' + CATALOG_RULE},
  {id: 'roadmap', cat: 'work', title: 'A now, next, later roadmap', blurb: 'Plan in three buckets', icon: 'kanban', text: 'Add a Roadmap view: items sorted into Now, Next and Later that I can drag between buckets, with a timeline underneath. Take viz.buckets and viz.timeline.' + CATALOG_RULE},
  {id: 'decisions', cat: 'records', title: 'A decision log', blurb: 'Questions, options, the answer', icon: 'decisions', rec: true, text: 'Add a Decisions view: each decision a card with the question, the options with pros and cons, and my answer recorded with who and when. Take pattern.decisions and pattern.options, and wear theme.adr-drafting-table.' + CATALOG_RULE},
  {id: 'findings', cat: 'records', title: 'A findings register', blurb: 'Issues by severity, filterable', icon: 'findings', text: 'Add a Findings view: issues as cards by severity with the evidence and an owner, filterable by status. Take pattern.findings and pattern.filter-table.' + CATALOG_RULE},
  {id: 'ledger', cat: 'records', title: 'A ledger of what was settled', blurb: 'Dated, grouped, searchable', icon: 'ledger', text: 'Add a Ledger view: settled items grouped by month with filter chips and a count on each, and a log of every change underneath. Take pattern.ledger and pattern.event-log.' + CATALOG_RULE},
  {id: 'expiry', cat: 'records', title: 'Things that expire', blurb: 'Certificates, licences, renewals', icon: 'expiry', text: 'Add an Expiry view for things that expire (certificates, licences, domains): dials, a runway of the next twelve months and the nearest ones first. Start from template.expiry-board.' + CATALOG_RULE},
  {id: 'kpi', cat: 'data', title: 'A metrics dashboard', blurb: 'Figures, trends and a split', icon: 'kpi', rec: true, text: 'Add a Dashboard view: the numbers I care about as big figures with a trend line each, and a bar showing how the total splits. Take pattern.figures, viz.sparkline and viz.bars, and keep the numbers in the page database so I can edit them.' + CATALOG_RULE},
  {id: 'timeline', cat: 'data', title: 'A project timeline', blurb: 'Phases, dates, dependencies', icon: 'timeline', text: 'Add a Timeline view: my project in numbered phases on a dated scale with each dependency drawn. Take viz.timeline-phased and viz.wires.' + CATALOG_RULE},
  {id: 'compare', cat: 'data', title: 'Compare two options', blurb: 'Pros, cons and a matrix', icon: 'compare', text: 'Add a Compare view for two options I name: pros and cons side by side, and a matrix of the criteria with a toggle per cell. Take pattern.options and viz.matrix.' + CATALOG_RULE},
  {id: 'whatif', cat: 'data', title: 'A what-if model', blurb: 'Sliders that redraw a chart', icon: 'whatif', text: 'Add a What-if view: sliders for the inputs of a simple model I describe, redrawing a chart and a one-line conclusion. Take viz.slider-chart. Ask me for the model in your response and stop there.' + CATALOG_RULE},
  {id: 'standup', cat: 'team', title: 'A team board', blurb: 'Who is doing what', icon: 'roster', text: 'Add a Team view: one card per person or agent with what they hold and what is queued, and a board of the work by status. Take pattern.roster and pattern.status-columns.' + CATALOG_RULE},
  {id: 'launch', cat: 'team', title: 'A launch checklist', blurb: 'Steps with owners and sign-off', icon: 'launch', rec: true, text: 'Add a Launch view: the steps to ship, each with an owner and a done-when line, and a sign-off gate before the last one. Take pattern.steps-owners and pattern.gate.' + CATALOG_RULE},
  {id: 'incident', cat: 'team', title: 'An incident room', blurb: 'Timeline and what to do next', icon: 'incident', text: 'Add an Incident view: a live timeline of what happened, the next steps as a checklist, and a status banner. Take pattern.event-log, pattern.next-steps and pattern.verdict, and wear theme.warroom.' + CATALOG_RULE},
  {id: 'approvals', cat: 'team', title: 'An approvals queue', blurb: 'Answer one, the next opens', icon: 'approvals', text: 'Add an Approvals view: requests waiting for my answer, each with its risk and what it changes, answered one after another. Take pattern.gate and pattern.answer-queue.' + CATALOG_RULE},
  {id: 'doc', cat: 'docs', title: 'A long document', blurb: 'A contents rail and sections', icon: 'doc', text: 'Add a Document view for a long piece of writing: a contents rail that follows the section in view and numbered sections. Start from template.doc and layout.doc-shell.' + CATALOG_RULE},
  {id: 'runbook', cat: 'docs', title: 'A runbook with commands', blurb: 'Copy each step in one click', icon: 'runbook', text: 'Add a Runbook view: playbooks in tabs, each a numbered list of commands I can copy. Take pattern.playbook and kit.copy.' + CATALOG_RULE},
  {id: 'report', cat: 'docs', title: 'A report page', blurb: 'Verdict, figures and findings', icon: 'report', text: 'Add a Report view: a verdict at the top, the key figures, and the findings by severity. Take pattern.verdict, pattern.figures and pattern.findings.' + CATALOG_RULE},
  {id: 'diagram', cat: 'docs', title: 'A diagram of how it fits', blurb: 'Architecture or a flow', icon: 'diagram', text: 'Add a Diagram view that draws how the parts of my project fit together, in this page colours. Take kit.mermaid, or viz.topology for nodes I can pick. Ask me what it should show in your response and stop there.' + CATALOG_RULE},
  {id: 'rearrange', cat: 'page', title: 'Rearrange something', blurb: 'Put things in a better order', icon: 'rearrange', text: 'Reorder the tabs and the cards on Home into the order a first-time visitor needs them, and tell me what you moved and why. Change nothing else.'},
  {id: 'change', cat: 'page', title: 'Change the look', blurb: 'A calmer look, same parts', icon: 'change', text: 'Change the look of this page to a calmer one, with larger text and more space, and keep every part and its id. Tell me which parts changed.' + CATALOG_RULE},
  {id: 'theme', cat: 'page', title: 'Wear a catalog theme', blurb: 'Journal, war room, blueprint', icon: 'theme', text: 'Show me this page in two catalog themes that would suit it (for example theme.journal or theme.blueprint), pick the one that fits best and keep every part and its id. Tell me which you chose and why.' + CATALOG_RULE},
  {id: 'search', cat: 'page', title: 'Search everything', blurb: 'Ctrl+K over sections and records', icon: 'search', text: 'Add a search to this page: Ctrl+K opens a box that finds sections and records and jumps to them. Take kit.palette.' + CATALOG_RULE},
  {id: 'adopt', cat: 'page', title: 'Adopt something', blurb: 'Let Claude suggest what fits', icon: 'adopt', text: 'Suggest three catalog components that would suit this page and say what each does, in your response, and stop there. I will reply with my choice and then you add it by taking it from the catalog.'},
  {id: 'bring', cat: 'catalog', title: 'Adopt an existing artifact', blurb: 'Analyse it, then rebuild it from the catalog', icon: 'bring', rec: true, text: 'Adopt an existing artifact into ADP. Ask me for its link in your response and stop there. When I reply: open it, take screenshots of it if you have a browser, and list what you can identify: its views, components, styles and data. If I mark a region (a fenced area on a screenshot, or a part named in words) analyse only that region. For each thing, say which catalog entry would replace it and what would be kept as it is. Reply with that plan and wait for my go, then rebuild it from the catalog, keeping its content and data.' + CATALOG_RULE},
  {id: 'newkit', cat: 'catalog', title: 'Turn a view into a kit', blurb: 'Keep the best part for next time', icon: 'newkit', text: 'Pick the best view or component on this page and prepare it as a catalog entry: its files, what it requires, a sample and a header, ready to add. Tell me what you would name it and what it replaces.'},
  {id: 'newtheme', cat: 'catalog', title: 'A theme from my colours', blurb: 'Make it once, reuse it', icon: 'theme', text: 'Make a catalog theme from my brand: ask me for two or three colours and a typeface in your response and stop there; I will answer on this request and then you write the theme as a theme.* entry and wear it on this page.'},
];
const CATS = [['rec', 'Recommended'], ['work', 'Workspaces'], ['records', 'Records'], ['data', 'Dashboards'], ['team', 'Team rooms'], ['docs', 'Docs'], ['page', 'This page'], ['catalog', 'Catalog']];
const ICONS = {
  kanban: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="9.5" y="4" width="5" height="10" rx="1"/><rect x="16" y="4" width="5" height="13" rx="1"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  drafting: '<path d="M5 3h10l4 4v14H5z"/><path d="M9 12h6M9 16h6"/>',
  canvas: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 15c2-4 4 0 6-3s2-3 4-4"/>',
  mindmap: '<circle cx="12" cy="12" r="2.5"/><circle cx="4.5" cy="5.5" r="1.8"/><circle cx="19.5" cy="6" r="1.8"/><circle cx="5" cy="19" r="1.8"/><circle cx="19" cy="18.5" r="1.8"/><path d="M10 10.2 6 7M14 10.3 18 7.4M10 13.8 6.5 17.5M14.2 13.8 17.5 17.2"/>',
  rearrange: '<path d="M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3"/>',
  change: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8z"/>',
  adopt: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>',
  roster: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M15 14.3c3 0 6 1.5 6 5"/>',
  decisions: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
  findings: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
  ledger: '<path d="M5 4h14v16H5z"/><path d="M9 4v16M12 9h4M12 13h4"/>',
  expiry: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 3h6"/>',
  kpi: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  timeline: '<path d="M3 12h18"/><circle cx="7" cy="12" r="2"/><circle cx="13" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><path d="M7 6v4M13 14v4M19 6v4"/>',
  compare: '<rect x="3" y="4" width="8" height="16" rx="1.5"/><rect x="13" y="4" width="8" height="16" rx="1.5"/><path d="M6 9h2M16 9h2M6 13h2M16 13h2"/>',
  whatif: '<path d="M4 8h16M4 16h16"/><circle cx="9" cy="8" r="2.2"/><circle cx="15" cy="16" r="2.2"/>',
  launch: '<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>',
  incident: '<path d="M8 20h8M6 20v-6a6 6 0 0112 0v6M12 3v2M4.5 6.5L6 8M19.5 6.5L18 8"/>',
  approvals: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 3h6l1-3h5"/>',
  doc: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 11h7M9 15h7M9 7h3"/>',
  runbook: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M13 15h4"/>',
  report: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  diagram: '<rect x="3" y="3" width="7" height="6" rx="1"/><rect x="14" y="15" width="7" height="6" rx="1"/><rect x="14" y="3" width="7" height="6" rx="1"/><path d="M10 6h4M6.5 9v6a3 3 0 003 3H14"/>',
  theme: '<path d="M12 3a9 9 0 100 18c1.5 0 2-1 1.5-2.2-.6-1.4.3-2.8 1.8-2.8H17a4 4 0 004-4c0-5-4-9-9-9z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7" r="1"/><circle cx="15.5" cy="7.5" r="1"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/>',
  newkit: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12v9M12 12L4 7.5M12 12l8-4.5"/>',
  bring: '<path d="M12 3v11M8 10l4 4 4-4"/><path d="M4 15v4a2 2 0 002 2h12a2 2 0 002-2v-4"/>',
  translate: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>'
};
const icon = id => '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[id] || '') + '</svg>';
const LANGUAGES = [['🇪🇸', 'Spanish', 'ES'], ['🇫🇷', 'French', 'FR'], ['🇩🇪', 'German', 'DE'], ['🇧🇷', 'Portuguese', 'PT'], ['🇮🇹', 'Italian', 'IT'], ['🇨🇳', 'Chinese', 'ZH'], ['🇯🇵', 'Japanese', 'JA'], ['🇰🇷', 'Korean', 'KO'], ['🇸🇦', 'Arabic', 'AR'], ['🇮🇳', 'Hindi', 'HI']];
/* The browser language: its two-letter code, and its English name when the table above has none for it. */
const BROWSER = (() => { try { const c = String(navigator.language || 'en').slice(0, 2).toLowerCase(); let n = ''; try { n = new Intl.DisplayNames(['en'], {type: 'language'}).of(c) || ''; } catch (e) {} return {code: c, name: n}; } catch (e) { return {code: 'en', name: ''}; } })();
const translateText = lang => 'Translate this whole page into ' + lang + ': the copy of every part (it lives in the content/<part id> docs), the tabs, the settings and the buttons. Keep every part id and every class and change no behaviour. Then set the Language setting (page.language) to ' + lang + ', and reply with what you translated and anything you left in the original language.';
function mountExamples(){
  const box = $('[data-part="home.examples"]');
  if (!box) return;
  const esc = t => String(t).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const TR = {id: 'translate', cat: 'page', title: 'Translate this page', blurb: 'Into your language', icon: 'translate', rec: true};
  const NEW = {id: 'new', title: 'New request', icon: 'adopt', text: ''};      // + New: a blank composer for a request of your own
  const foreign = BROWSER.code !== 'en';
  const IDEAS = foreign ? [TR].concat(EXAMPLES) : EXAMPLES.concat([TR]);
  const LANGS = LANGUAGES.some(l => l[2].toLowerCase() === BROWSER.code) || !BROWSER.name || !foreign ? LANGUAGES : [['\u{1F310}', BROWSER.name, BROWSER.code.toUpperCase()]].concat(LANGUAGES);
  let lang = (LANGS.find(l => l[2].toLowerCase() === BROWSER.code) || LANGS[0])[1];
  let cat = 'rec';
  const inCat = x => cat === 'rec' ? !!x.rec : x.cat === cat;
  box.innerHTML = '<header class="ex-head"><h3>Try it: ask Claude</h3><p class="muted">Pick an idea. Its request opens in the box, ready to change: add your own details, then send.</p></header>'
    + '<div class="ex-cats" role="group" aria-label="Kinds of idea">' + CATS.map(c => `<button type="button" class="ex-cat" data-cat="${c[0]}" aria-pressed="${c[0] === cat}">${esc(c[1])}</button>`).join('') + '<button type="button" class="ex-new" data-new aria-pressed="false"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>New</span></button></div>'
    + '<div class="ex-split"><ul class="ex-ideas">'
    + '</ul><form class="ex-composer"><div class="ex-ch"><span class="ex-ico"></span><b class="ex-ct"></b>'
    + '</div><div class="ex-langs" role="group" aria-label="Language" hidden>' + LANGS.map(l => `<button type="button" class="ex-lang" data-lang="${esc(l[1])}" title="${esc(l[1])}" aria-pressed="${l[1] === lang}"><span class="ex-flag" aria-hidden="true">${l[0]}</span><b>${esc(l[2])}</b></button>`).join('') + '</div>'
    + '<label class="ex-sr" for="exText">Your request to Claude</label><textarea id="exText" maxlength="1500" rows="6"></textarea>'
    + '<div class="ex-foot"><span class="muted ex-count"></span><span class="ex-acts"><button type="button" class="btn ex-ghost" data-reset>Start again</button><button type="submit" class="btn primary">Send to Claude</button></span></div></form></div>'
    + '<p class="ex-note muted" role="status" aria-live="polite"></p>';
  const note = box.querySelector('.ex-note'), form = box.querySelector('.ex-composer'), ta = form.querySelector('textarea'), cnt = form.querySelector('.ex-count'), submit = form.querySelector('button[type="submit"]');
  const ico = form.querySelector('.ex-ico'), ttl = form.querySelector('.ex-ct'), sel = form.querySelector('.ex-langs');
  let cur = null, original = '', ok = false;
  const list = box.querySelector('.ex-ideas');
  const draw = () => { list.innerHTML = IDEAS.filter(inCat).map(x => `<li><button type="button" class="ex-idea" data-ex="${x.id}" aria-pressed="${!!cur && cur.id === x.id}"><span class="ex-ico">${icon(x.icon)}</span><span class="ex-t"><b>${esc(x.title)}</b><small>${esc(x.blurb)}</small></span></button></li>`).join('');
    box.querySelectorAll('.ex-cat').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cat === cat))); };
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, 420) + 'px'; };
  const count = () => { cnt.textContent = ta.value.length + ' / 1500'; submit.disabled = !ok || !ta.value.trim(); };
  const textFor = () => cur.id === 'translate' ? translateText(lang) : cur.text;
  const choose = id => {
    cur = id === 'new' ? NEW : IDEAS.find(x => x.id === id); if (!cur) return;
    box.querySelectorAll('.ex-idea').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ex === id)));
    box.querySelector('[data-new]').setAttribute('aria-pressed', String(id === 'new'));
    ta.placeholder = id === 'new' ? 'Say what you want Claude to do: a new view, a change to a block, a fix or a question.' : '';
    ico.innerHTML = icon(cur.icon); ttl.textContent = cur.title; sel.hidden = id !== 'translate';
    original = textFor(); ta.value = original; grow(); count();
    ta.style.animation = 'none'; void ta.offsetWidth; ta.style.animation = '';
  };
  const gate = () => { const c = engine ? engine.can() : null; ok = !!c && c.send === 'available'; count();
    note.textContent = ok ? '' : !engine ? 'Sending needs the assist kit, and it is not available on this page.' : c.send === 'writers_only' ? 'Only people who can edit this page can send a request.' : c.send === 'no_session' ? 'Nobody is watching yet. Open Claude Code and say: watch the artifact, then this page\'s link.' : 'Sending to Claude is not possible here right now.'; };
  ready.then(gate);
  const t = setInterval(() => { if (!box.isConnected) clearInterval(t); else gate(); }, 30000);
  box.addEventListener('click', e => {
    const c = e.target.closest('.ex-cat');
    if (c) { cat = c.dataset.cat; const first = IDEAS.find(inCat); cur = IDEAS.find(x => inCat(x) && cur && x.id === cur.id) || first; draw(); choose(cur.id); return; }
    if (e.target.closest('[data-new]')) { choose('new'); ta.focus(); if (window.matchMedia('(max-width: 719px)').matches) form.scrollIntoView({block: 'nearest', behavior: 'smooth'}); return; }
    const b = e.target.closest('.ex-idea');
    if (b) { choose(b.dataset.ex); if (window.matchMedia('(max-width: 719px)').matches) form.scrollIntoView({block: 'nearest', behavior: 'smooth'}); }
    else if (e.target.closest('[data-lang]')) { lang = e.target.closest('[data-lang]').dataset.lang; sel.querySelectorAll('.ex-lang').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.lang === lang))); original = textFor(); ta.value = original; grow(); count(); }
    else if (e.target.closest('[data-reset]')) { ta.value = original; grow(); count(); ta.focus(); }
  });
  ta.addEventListener('input', () => { grow(); count(); });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const text = ta.value.trim();
    if (!text || !engine) return;
    submit.disabled = true;
    engine.send({lane: 'task', scope: null, text}).then(() => { note.textContent = 'Sent. Follow it on Requests.'; show('requests'); },
      err => { note.textContent = (err && err.message) || 'It could not be sent.'; }).finally(count);
  });
  cur = IDEAS.find(inCat); draw(); choose(cur.id);
  mounted.push({destroy(){ clearInterval(t); }});
}
/* The Mind map mode: Kit.mindmap (catalog) with its data in one doc, ns/shared/mindmaps/main. The component keeps no data of its own: it
   hands the whole next map to onChange, and this writes it; a change made elsewhere arrives through the snapshot and is drawn with update(). */
function mountMind(host){
  const Kit = window.Kit || {};
  if (!Kit.mindmap) { host.innerHTML = '<p class="muted canvas-note">The mind map kit is not installed.</p>'; return {destroy(){}}; }
  if (!window.ADP || !ADP.db) { host.innerHTML = '<p class="muted canvas-note">A database is needed to keep the mind map, and there is none here.</p>'; return {destroy(){}}; }
  const ref = ADP.ns('shared').doc('mindmaps/main'), seed = () => ({nodes: [{id: 'n1', text: document.title || 'My map', parent: null, order: 0}]});
  let dead = false, off = null, mm = null, writing = Promise.resolve(), can = true;
  Promise.resolve(claudeUse('user')).then(u => { try { return u && u.can ? u.can('data.write') : null; } catch (e) { return null; } }).then(w => {
    if (dead) return;
    can = w !== false;
    mm = Kit.mindmap.mount(host, {data: seed(), readOnly: !can, label: 'Mind map', layout: 'free',
      onChange: next => { writing = writing.then(() => ref.set(next)).catch(() => { const n = document.createElement('p'); n.className = 'muted canvas-note'; n.setAttribute('role', 'alert'); n.textContent = 'The change could not be saved.'; host.prepend(n); setTimeout(() => n.remove(), 4000); }); }});
    off = ref.onSnapshot(snap => { if (dead || !mm) return; if (snap.exists) mm.update(snap.data()); });
  });
  return {destroy(){ dead = true; if (off) off(); if (mm) mm.destroy(); }};
}
/* The Canvas view. Its modes are CANVAS_MODES: one entry each, {id, label, mount(host) -> {destroy()}}; a second entry adds a mode switch above the board.
   Nothing here talks to the db until the view is first opened. The paint mode is kit.canvas (catalog) wired as the catalog's preview wires it, on ns/shared/{name}. */
let paintKit = null;
function paintStack(){
  if (paintKit) return paintKit;
  const Kit = window.Kit, colors = ['ink', 'blue', 'red', 'green', 'amber', 'violet'], tints = ['yellow', 'blue', 'pink', 'green'];
  const cfg = {colors, tints, scopeSlot: 'scopeId'};
  const store = Kit.store.create({lsPrefix: 'adp-canvas', state: Object.assign({conn: '', canWrite: false, me: null, scopeId: 'shared', modal: null, toast: null, busy: null}, Kit.canvas.slots(cfg))});
  const chrome = Kit.chrome.create({store});
  const db = Kit.db.create({store, toast: chrome.toast, pathTemplate: 'ns/shared/{name}', scopeSlot: 'scopeId'});
  const applySnap = (name, snap) => { for (const ch of snap.docChanges()) { if (ch.type === 'removed') delete store.S[name][ch.doc.id]; else store.S[name][ch.doc.id] = ch.doc.data(); } store.emit(); };
  const cv = Kit.canvas.create(Object.assign({store, db, chrome, applySnap}, cfg));
  return (paintKit = {store, chrome, db, cv, applySnap, connected: null});
}
function mountPaint(host){
  const Kit = window.Kit || {};
  if (!window.htmPreact || !Kit.store || !Kit.db || !Kit.chrome || !Kit.canvas) { host.innerHTML = '<p class="muted canvas-note">The canvas kit is not installed.</p>'; return {destroy(){}}; }
  const k = paintStack(), S = k.store.S;
  let dead = false, off = null;
  if (!k.connected) k.connected = k.db.connect();
  k.connected.then(ok => {
    if (dead) return;
    if (!ok) { host.innerHTML = '<p class="muted canvas-note">A database is needed to keep canvases, and there is none here.</p>'; return; }
    const {html, render} = window.htmPreact;
    render(html`<div class="cv-root"><${k.cv.CanvasView}/><${k.chrome.Modal}/><${k.chrome.Toast}/><${k.chrome.Busy}/></div>`, host);
    off = k.db.col('canvases').onSnapshot(snap => {
      const first = !Object.keys(S.canvases).length;
      k.applySnap('canvases', snap);
      const last = k.store.ls.get('canvas:' + S.scopeId);
      if (first && last && S.canvases[last] && !S.canvasId) k.cv.openCanvas(last);
    }, k.db.subErr);
  }).catch(() => { if (!dead) host.innerHTML = '<p class="muted canvas-note">The canvas could not start.</p>'; });
  return {destroy(){
    dead = true;
    if (off) off();
    k.cv.closeCanvas(); S.canvasId = null; S.els = {}; S.canvases = {};
    if (window.htmPreact) window.htmPreact.render(null, host);
  }};
}
const CANVAS_MODES = [{id: 'paint', label: 'Paint', mount: mountPaint}, {id: 'mindmap', label: 'Mind map', mount: mountMind}];
function mountCanvas(){
  const host = $('[data-part="canvas.board"]');
  if (!host) return;
  let cur = null, box = null;
  const pick = id => {
    if (cur) cur.destroy();
    const m = CANVAS_MODES.find(x => x.id === id) || CANVAS_MODES[0];
    host.querySelectorAll('[data-canvas-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.canvasMode === m.id)));
    box.replaceChildren(); cur = m.mount(box);
  };
  if (CANVAS_MODES.length > 1) {
    const bar = document.createElement('div'); bar.className = 'canvas-modes'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Canvas mode');
    bar.innerHTML = CANVAS_MODES.map(m => `<button type="button" class="tab" data-canvas-mode="${m.id}">${m.label}</button>`).join('');
    bar.addEventListener('click', e => { const b = e.target.closest('[data-canvas-mode]'); if (b) pick(b.dataset.canvasMode); });
    host.append(bar);
  }
  box = document.createElement('div'); box.className = 'canvas-mode-box'; host.append(box);
  pick(CANVAS_MODES[0].id);
  mounted.push({destroy(){ if (cur) cur.destroy(); }});
}
function reveal(id){
  const v = owner(id); if (v && v !== view) show(v);
  setTimeout(() => { const t = document.querySelector('[data-part="' + String(id).split(':')[0] + '"]'); if (t) { t.scrollIntoView({block: 'center'}); t.setAttribute('data-assist-ring', ''); setTimeout(() => t.removeAttribute('data-assist-ring'), 1800); } }, 80);
}
function show(v){
  if (!VIEWS[v]) v = Object.keys(VIEWS)[0];
  unmount();
  view = v;
  $('#views').innerHTML = VIEWS[v].html();
  document.querySelectorAll('[data-part]').forEach(el => { if (COPY.has(el.dataset.part)) el.innerHTML = copy(el.dataset.part); });
  document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
  const gear = $('#gear'); if (gear) gear.setAttribute('aria-pressed', String(v === 'settings'));
  if (v === 'settings') mountSettings();
  else if (v === 'requests') { ready.then(mountRequests); }
  else if (v === 'canvas') mountCanvas();
  else if (v === 'mycatalog') mountMyCatalog();
  else { mountExamples(); if (window.ADP && ADP.config) { const c = $('[data-part="home.about"]'); if (c) c.hidden = !ADP.config.get('page.show-about'); } }
  if (location.hash.slice(1) !== v) history.replaceState(null, '', '#' + v);
}
$('#tabs').innerHTML = Object.entries(VIEWS).filter(([k, x]) => !x.hidden).map(([k, x]) => `<button type="button" class="tab" data-view="${k}">${x.label}</button>`).join('');
$('#tabs').addEventListener('click', e => { const b = e.target.closest('button[data-view]'); if (b) show(b.dataset.view); });
const gear = $('#gear');
if (gear) {
  gear.addEventListener('click', () => show(view === 'settings' ? Object.keys(VIEWS)[0] : 'settings'));
  if (window.ADP && ADP.config) ADP.config.ready.then(() => { gear.hidden = !(ADP.user && ADP.user.canEdit); });
}
/* The colour theme, a choice for this viewer only: system, light or dark, kept in this browser. Until it is chosen, the page follows the Colour mode setting. */
const THEME_KEY = 'adp-theme', themeBtn = $('#themeBtn');
const THEME_ICO = {
  system: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  light: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8"/>',
  dark: '<path d="M20 14.5A8.5 8.5 0 119.5 4a7 7 0 0010.5 10.5z"/>'
};
/* Colour: two inputs, one rule. The page's own default is the Settings value look.mode (auto, light, dark), which the runtime writes to data-theme.
   The viewer's own pick from this button (system, light, dark) is kept in this browser and wins over it. Changing look.mode in Settings drops that pick,
   so the newest explicit choice is the one shown. The last look.mode seen is kept in the browser too, so the first paint already has the right colour. */
const MODE_KEY = 'adp-look-mode';
const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} return null; };
const personal = () => { const v = ls(THEME_KEY); return v === 'light' || v === 'dark' || v === 'system' ? v : null; };
const themeMode = () => personal() || (ls(MODE_KEY) === 'light' ? 'light' : ls(MODE_KEY) === 'dark' ? 'dark' : 'system');
const applyTheme = () => { const m = themeMode(), h = document.documentElement, cur = h.getAttribute('data-theme');
  if (m === 'system') { if (cur !== null) h.removeAttribute('data-theme'); } else if (cur !== m) h.setAttribute('data-theme', m); };
const paintTheme = () => { if (!themeBtn) return; const m = themeMode(); themeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + THEME_ICO[m] + '</svg>';
  themeBtn.setAttribute('aria-label', 'Colour theme: ' + m + '. Press to change.'); themeBtn.title = 'Colour theme: ' + m; };
applyTheme();
if (themeBtn) {
  themeBtn.addEventListener('click', () => { ls(THEME_KEY, {system: 'light', light: 'dark', dark: 'system'}[themeMode()]); applyTheme(); paintTheme(); });
  paintTheme();
}
/* The runtime rewrites data-theme from look.mode each time the settings arrive or change; put the rule back at once, with no flash between. */
new MutationObserver(applyTheme).observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});
if (window.ADP && ADP.config) ADP.config.on('look.mode', v => { const seen = ls(MODE_KEY); if (seen !== null && seen !== v) ls(THEME_KEY, null); ls(MODE_KEY, v); applyTheme(); paintTheme(); });
/* The theme, by the colour's rule. The page's choice is the Settings value look.theme: its default is the theme index.html links (what adp.py new wrote; the runtime reads it as BUILT)
   and its options are the themes this page has installed (installed.json), Default first. The viewer's own pick from the header is kept in this browser and wins; changing look.theme
   in Settings drops that pick. Kit.skins (catalog) wears the choice. The built-in theme is the linked stylesheet, switched off under any other theme; every other theme is its json,
   fetched when first chosen, and the kit is started again with that one theme's tokens. So a theme replaces the one before: no token of the last one is left, whichever sets more.
   The theme last worn is kept in the browser with its tokens, so the next visit wears it before the settings or any file arrive. Light, dark or system stays with the button above
   (modes: []: the kit leaves data-theme alone). */
const SKIN_KEY = 'adp-skin', LOOK_KEY = 'adp-look-theme', WORN_KEY = 'adp-skin-worn', skinPick = $('#skinPick'), skinSel = $('#skinSel');
const lookDef = window.ADP && ADP.config ? ADP.config.all().look.theme : null, BUILT = lookDef ? lookDef.default : 'default';
const builtCss = [...document.querySelectorAll('link[rel="stylesheet"][href^="kit/themes/"]')];
const kept = (() => { try { return JSON.parse(ls(WORN_KEY)) || {}; } catch (e) { return {}; } })();
const tok = kept.name && kept.name !== BUILT ? {[kept.name]: kept} : {}, asked = {};      // theme name -> its json {light, dark, fonts}, and the fetch that brings it
let themes = [{name: BUILT, label: BUILT}].concat(Object.keys(tok).map(n => ({name: n, label: kept.label || n}))), skins = null;
const wanted = () => { const v = ls(SKIN_KEY) || ls(LOOK_KEY); return themes.some(t => t.name === v) ? v : BUILT; };
function wear(){
  if (!Kit0.skins) return;
  const n = wanted(), t = tok[n], me = themes.find(x => x.name === n);
  if (n !== BUILT && !t) {      // its tokens first; until they arrive the page keeps what it wears
    (asked[n] = asked[n] || fetch('kit/themes/' + n + '.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }))
      .then(j => { tok[n] = j; if (wanted() === n) wear(); }, () => { delete asked[n]; if (skinSel && skins) skinSel.value = skins.skin(); });
    return;
  }
  if (skins) skins.destroy();
  skins = Kit0.skins.init({skins: themes.map(x => (x === me && t ? Object.assign({tokens: t, fonts: t.fonts}, x) : x)), skin: n, modes: [], persist: false});      // only the worn theme's tokens are written
  builtCss.forEach(l => { l.disabled = n !== BUILT; });
  ls(WORN_KEY, t ? JSON.stringify({name: n, label: me.label, light: t.light, dark: t.dark, fonts: t.fonts}) : null);
  if (skinSel) { skinSel.value = n; skinPick.title = 'Theme: ' + me.label; }
}
function paintSkins(){
  if (!skinSel) return;
  skinSel.replaceChildren(...themes.map(t => new Option(t.label, t.name)));
  skinPick.hidden = !Kit0.skins || themes.length < 2;
}
const themesReady = fetch('installed.json').then(r => (r.ok ? r.json() : null)).then(j => {
  const list = ((j && j.entries) || []).filter(e => /^theme\.[a-z0-9-]+$/.test(e.id)).map(e => ({name: e.id.slice(6), label: e.name || e.id.slice(6)}));
  if (!list.some(t => t.name === BUILT)) list.unshift({name: BUILT, label: BUILT});
  themes = list.sort((a, b) => (b.name === 'default') - (a.name === 'default'));
  if (lookDef) ADP.config.define('look', {theme: {type: lookDef.type, default: BUILT, label: lookDef.label, help: lookDef.help, options: themes.map(t => t.name)}});
}).catch(() => { themes = [{name: BUILT, label: BUILT}]; }).then(() => { paintSkins(); wear(); });
if (skinSel) skinSel.addEventListener('change', () => { ls(SKIN_KEY, skinSel.value); wear(); });
if (window.ADP && ADP.config) ADP.config.on('look.theme', v => { const seen = ls(LOOK_KEY); if (seen !== null && seen !== v) ls(SKIN_KEY, null); ls(LOOK_KEY, v); wear(); });
paintSkins(); wear();
/* The header's pop-overs fold back: a press outside What changed or the how-to-start note closes it, and so does Escape. */
const foldPopovers = e => {
  const wc = $('#wc'), pr = $('#presence');
  if (wc && wc.open && !(e.target && wc.contains(e.target))) wc.open = false;
  const t = pr && pr.querySelector('.kit-pr-btn[aria-expanded="true"]');
  if (t && !(e.target && pr.contains(e.target))) t.click();
};
document.addEventListener('pointerdown', foldPopovers);
document.addEventListener('keydown', e => { if (e.key === 'Escape') foldPopovers({target: null}); });
addEventListener('hashchange', () => show(location.hash.slice(1)));
show(location.hash.slice(1));

const owner = id => Object.keys(VIEWS).find(k => VIEWS[k].parts.includes(id));
if (window.ADP) window.ADP.page({
  view: () => view,
  expected: v => ['page.lead'].concat(VIEWS[v] ? VIEWS[v].parts : []),
  titles: TITLES, legacy: {},
  all: Object.keys(TITLES),
  reveal: id => { const v = owner(id); if (v && v !== view) show(v); return new Promise(r => setTimeout(r, 60)); },
});
})();
/* /part:page.script.app */

/* part:page.script.kit.templates.tester */
/* Kit template script: step-by-step test harness (Kit.tester)    kit version 0.1.0    belongs to kit/templates/tester.html.txt (the page) and tester.css
   What it is: a flow of steps the page runs one at a time. A person presses Run step; Claude presses the same step from outside by writing the db doc <ns>/cmd; the page reports where it is in <ns>/state.
   Every step toasts what it did and writes a line to the log. State, toast, busy bar and the rail are the kit's (kit.store, kit.chrome, viz.stepper); the pack is expanded by ADP's own loader
   (seed.json and seed/, adp.js seedFromFile) into the db: nothing here unpacks anything.
   Extend it in ONE place: STEPS (id, label, hint) and ACTIONS (id -> async function(ctx)) below, or pass mount(root, {steps, actions}) to add to them. A step throws to fail; ctx has
   {S, set, log, toast, busy, bump, sleep, why, claude, cfg}. Needs on the page: [data-tester="steps"] and [data-tester="log"] inside root, htm-preact, adp.js, kit/store.js, kit/chrome.js, kit/viz/core.js, kit/viz/stepper.js. */
(function () {
'use strict';
const Kit = window.Kit, { html, render } = window.htmPreact, { useEffect, useRef } = window.htmPreact;

// ---------------------------------------------------------------- the extension point: the steps and what each one does
const STEPS = [
  ['loader', 'Loader', 'seed.json and its pack, expanded into the db by adp.js'],
  ['read', 'Read docs', 'the collection of files, from the db'],
  ['rights', 'Check rights', 'may this viewer publish?'],
  ['write', 'Write files', 'claude.use("artifact").publish(files)'],
  ['reload', 'Reload', 'the next version serves the new files'],
  ['verify', 'Verify', 'fetch each file back, compare with the docs'],
  ['clean', 'Clean up', 'delete the files again'],
];
const ACTIONS = {
  async loader(c) {
    if (!c.S.db) throw new Error('no db: the loader needs the db capability and a signed-in viewer');
    const s = c.S.seed;
    c.log(s ? `status/seed: ${JSON.stringify(s)}` : 'status/seed: no document (the loader has not run, or the db was seeded another way)');
    if (!s || s.state !== 'done') throw new Error(s ? 'the loader is still ' + s.state : 'the loader has not written status/seed: open the page as an editor once');
    c.toast(`Loader done: ${s.docs} docs from ${s.packs} pack${s.packs === 1 ? '' : 's'}`, 'ok');
  },
  async read(c) {
    if (!c.S.db) throw new Error('no db');
    c.log(`reading the ${c.cfg.collection} collection`);
    const docs = c.S.docs || [];
    if (!docs.length) throw new Error(`${c.cfg.collection} is empty: the loader has not written the pack yet`);
    let bytes = 0;
    for (const d of docs) { bytes += d.text.length; c.log(`  ${d.path}  ${d.text.length} chars  (doc ${d.id})`); c.toast(`Read ${d.path}`); await c.sleep(250); }
    c.bump({ docs: docs.length });
    c.log(`${docs.length} docs, ${(bytes / 1024).toFixed(1)} KB of text`, 'ok'); c.toast(`${docs.length} docs read`, 'ok');
  },
  async rights(c) {
    c.log('claude.use("artifact")');
    if (!c.claude()) throw new Error('window.claude.use is not there: the page is not running in the viewer');
    const a = await c.claude().use('artifact');
    c.log(a ? 'artifact capability: granted' : 'artifact capability: null (not served, not granted, or no viewer answered)', a ? 'ok' : 'bad');
    c.log('ADP.user.canEdit = ' + !!(window.ADP && ADP.user && ADP.user.canEdit));
    if (!a) throw new Error('the artifact capability is not available here');
    c.set({ api: a }); c.toast('This viewer can publish', 'ok');
  },
  async write(c) {
    const docs = c.S.docs || []; if (!docs.length) throw new Error('read the docs first');
    if (!window.ADP || typeof ADP.unpack !== 'function') throw new Error('ADP.unpack is not there: load adp.js (runtime.adp)');
    const n = docs.length;
    c.log(`ADP.unpack: ${n} files under ${c.cfg.prefix}, in chunks`);
    await c.busy('Publishing', n, async tick => {
      tick(0); const t = performance.now();
      const r = await ADP.unpack(docs.map(d => ({ path: d.path, text: d.text })), { prefix: c.cfg.prefix, progress: (done, total) => { tick(done); c.bump({ planned: total, written: done }); } });
      c.log(`${r.files} files in ${r.chunks} call${r.chunks === 1 ? '' : 's'}, ${Math.round(performance.now() - t)} ms`, 'ok');
    });
    c.toast(`Wrote ${n} files`, 'ok');
  },
  async reload(c) {
    c.log('reloading: the next load serves the version that was just published');
    c.toast('Reloading…'); c.set({ done: Object.assign({}, c.S.done, { reload: true }), at: 'verify' }); c.persist();
    await c.sleep(600); location.reload(); await new Promise(() => {});
  },
  async verify(c) {
    const docs = c.S.docs || []; if (!docs.length) throw new Error('no docs to compare with: read them again after the reload');
    let ok = 0, bad = 0;
    for (const d of docs) {
      const url = c.cfg.prefix + d.path; c.log('fetch ' + url);
      try {
        const f = await fetch(url, { cache: 'no-store' });
        if (!f.ok) { bad++; c.log(`  ${url}: HTTP ${f.status}`, 'bad'); c.toast(`${url}: HTTP ${f.status}`, 'warn'); }
        else {
          const got = await f.text(), same = got === d.text; same ? ok++ : bad++;
          c.log(`  ${url}: ${same ? 'identical' : 'DIFFERENT'}  ${got.length} chars  sha256 ${(await c.sha(got)).slice(0, 12)}`, same ? 'ok' : 'bad');
          c.toast(same ? 'Verified ' + url : url + ' differs', same ? 'ok' : 'warn');
        }
      } catch (e) { bad++; c.log(`  ${url}: ${c.why(e)}`, 'bad'); }
      c.bump({ verified: ok }); await c.sleep(250);
    }
    c.log(`verify: ${ok} identical, ${bad} not`, bad ? 'bad' : 'ok');
    if (bad) throw new Error(`${bad} file(s) wrong or missing`);
    c.toast(`All ${ok} files identical`, 'ok');
  },
  async clean(c) {
    const docs = c.S.docs || []; const a = c.S.api || (c.claude() && await c.claude().use('artifact')); if (!a) throw new Error('no artifact capability');
    const map = {}; docs.forEach(d => { map[c.cfg.prefix + d.path] = null; });
    c.log(`delete ${docs.length} files`); const res = await a.publish(map);
    c.log('resolved: version ' + res.version, 'ok'); c.bump({ written: 0, verified: 0, planned: 0 }); c.toast('Files deleted', 'ok');
  },
};

// ---------------------------------------------------------------- the harness: state, remote, views (no need to change these to add a step)
function mount(root, opts) {
  opts = opts || {};
  const cfg = Object.assign({ prefix: 'unpacked/', collection: 'kitfiles', ns: 'test', lsPrefix: 'tester', label: 'Test steps' }, opts.config);
  const steps = (opts.steps || STEPS), actions = Object.assign({}, ACTIONS, opts.actions);
  const IDS = steps.map(s => s[0]);
  const KEY = cfg.lsPrefix + ':flow';
  const keep = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null') || {}; } catch (_) { return {}; } };
  const r0 = keep();
  const zero = () => ({ docs: 0, planned: 0, written: 0, verified: 0 });
  const store = Kit.store.create({ lsPrefix: cfg.lsPrefix, state: {
    at: IDS.includes(r0.at) ? r0.at : IDS[0], done: r0.done || {}, log: r0.log || [], counts: r0.counts || zero(),
    running: null, docs: null, api: null, db: null, seed: null, lastCmd: r0.last || '', remote: 'not connected' } });
  const { S, set, useS } = store;
  const chrome = Kit.chrome.create({ store });
  const { toast, step: busy, Toast, Busy } = chrome;

  const persist = () => { try { sessionStorage.setItem(KEY, JSON.stringify({ at: S.at, done: S.done, log: S.log.slice(-150), counts: S.counts, last: S.lastCmd })); } catch (_) {} };
  function log(text, kind) { set({ log: S.log.concat({ t: new Date().toISOString().slice(11, 23), text, kind: kind || 'info' }).slice(-300) }); persist(); }
  const ctx = {
    S, set, log, toast, busy, cfg, persist,
    sleep: ms => new Promise(r => setTimeout(r, ms)),
    why: e => (e && e.code ? e.code + ': ' : '') + ((e && e.message) || e),
    sha: async t => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))).map(b => b.toString(16).padStart(2, '0')).join(''),
    bump: o => set({ counts: Object.assign({}, S.counts, o) }),
    claude: () => window.claude && typeof window.claude.use === 'function' ? window.claude : null,
  };

  let running = false;
  const next = () => { const i = IDS.indexOf(S.at); if (i < IDS.length - 1) set({ at: IDS[i + 1] }); };
  async function runStep(id, by) {
    if (running) { log('a step is running already', 'bad'); return; }
    if (!actions[id]) { log('no step ' + id, 'bad'); return; }
    running = true; set({ running: id }); log(`step ${id} ${by === 'claude' ? '(pressed by Claude)' : '(pressed here)'}`, 'step');
    try { await actions[id](ctx); set({ done: Object.assign({}, S.done, { [id]: true }) }); if (S.at === id) next(); }
    catch (e) { log(`${id} failed: ${ctx.why(e)}`, 'bad'); toast(`${id} failed: ${e && e.code || e && e.message || e}`, 'warn'); }
    finally { running = false; set({ running: null }); persist(); report(); }
  }
  const back = () => { const i = IDS.indexOf(S.at); if (i > 0) { set({ at: IDS[i - 1] }); log('back to ' + S.at, 'step'); persist(); report(); } };
  const skip = () => { log('skipped ' + S.at, 'step'); next(); persist(); report(); };
  const reset = () => { set({ at: IDS[0], done: {}, counts: zero(), api: null }); log('flow reset', 'step'); persist(); report(); };
  const perform = (action, step, by) => action === 'run' ? runStep(step || S.at, by) : action === 'back' ? back() : action === 'skip' ? skip() : action === 'reset' ? reset() : log('unknown command ' + action, 'bad');

  // the db: the loader's status, the pack's docs, Claude's remote (<ns>/cmd in, <ns>/state out)
  const canEdit = () => !!(window.ADP && ADP.user && ADP.user.canEdit);
  let reporting = false, pending = 0;
  async function report() {
    if (!S.db || reporting) return;
    if (!canEdit()) { if (pending++ < 8) setTimeout(report, 1000); return; }   // ADP.user is filled a moment after the db connects: ask again
    pending = 0; reporting = true;
    try { await S.db.doc(cfg.ns + '/state').set({ at: S.at, done: S.done, running: S.running, counts: S.counts, remote: S.remote, tail: S.log.slice(-8).map(l => l.t + ' ' + l.text), t: Date.now() }); }
    catch (e) { log(`could not write ${cfg.ns}/state: ` + ctx.why(e), 'bad'); }
    reporting = false;
  }
  (async () => {
    log(`page loaded${r0.at ? ', flow restored at step ' + r0.at : ''}`);
    if (!ctx.claude()) { log('no window.claude: not in the viewer (preview or plain browser)', 'bad'); return; }
    const db = await ctx.claude().use('db').catch(() => null);
    if (!db) { log('db: not available (signed out, or not served)', 'bad'); set({ remote: 'no db' }); return; }
    set({ db, remote: 'listening' }); log('db: connected');
    db.doc('status/seed').onSnapshot(d => { const v = d.exists ? d.data() : null; set({ seed: v }); if (v) log(`status/seed: ${v.state}${v.total ? ` ${v.done || 0}/${v.total}` : ''}${v.docs ? ` ${v.docs} docs` : ''}`, v.state === 'done' ? 'ok' : 'info'); }, () => {});
    db.collection(cfg.collection).onSnapshot(snap => {
      const docs = snap.docs.filter(d => d.exists).map(d => Object.assign({ id: d.id }, d.data())).filter(d => d.path && typeof d.text === 'string').sort((a, b) => a.path < b.path ? -1 : 1);
      const was = (S.docs || []).length; set({ docs });
      if (docs.length !== was) { log(`${cfg.collection}: ${docs.length} doc${docs.length === 1 ? '' : 's'}`); if (docs.length) toast(`${cfg.collection}: ${docs.length} docs in the db`, 'ok'); }
    }, () => {});
    db.doc(cfg.ns + '/cmd').onSnapshot(d => {
      const c = d.exists ? d.data() : null; if (!c || !c.id || c.id === S.lastCmd) return;
      set({ lastCmd: c.id }); persist();
      if (!c.ts || Math.abs(Date.now() - c.ts) > 90000) { log(`ignored command ${c.id}: older than 90 s`, 'info'); return; }
      log(`remote command ${c.id}: ${c.action}${c.step ? ' ' + c.step : ''}`, 'step'); toast(`Claude pressed ${c.action}${c.step ? ' ' + c.step : ''}`);
      perform(c.action, c.step, 'claude');
    }, () => {});
    report();
  })();

  // views
  const Viz = Kit.viz;
  function Steps() {
    const s = useS(), at = s.at, busyNow = !!s.running;
    const labels = {}, hints = {}; steps.forEach(x => { labels[x[0]] = x[1]; hints[x[0]] = x[2]; });
    return html`<div class="tester">
      <h3>Steps</h3>
      <${Viz.StepTrack} steps=${IDS} at=${at} labels=${labels} hints=${hints} busy=${busyNow} label=${cfg.label}/>
      <div class="ctl">
        <button class="btn" type="button" onClick=${back} disabled=${busyNow || at === IDS[0]}>◀ Back</button>
        <button class="btn primary" type="button" onClick=${() => runStep(at, 'page')} disabled=${busyNow}>Run step: ${labels[at]} ▶</button>
        <button class="btn" type="button" onClick=${skip} disabled=${busyNow || at === IDS[IDS.length - 1]}>Skip ▶|</button>
        <button class="btn ghost" type="button" onClick=${reset} disabled=${busyNow}>Reset flow</button>
      </div>
      <dl class="ledger" aria-live="polite">
        <div><dt>docs read</dt><dd>${s.counts.docs}</dd></div><div><dt>files planned</dt><dd>${s.counts.planned}</dd></div>
        <div><dt>files written</dt><dd>${s.counts.written}</dd></div><div><dt>files verified</dt><dd>${s.counts.verified}</dd></div>
        <div><dt>loader</dt><dd>${s.seed ? s.seed.state : s.db ? 'no status/seed' : 'no db'}</dd></div>
        <div><dt>docs in db</dt><dd>${(s.docs || []).length}</dd></div>
        <div><dt>publish</dt><dd>${s.api ? 'granted' : 'not checked'}</dd></div><div><dt>Claude remote</dt><dd>${s.remote}</dd></div>
      </dl>
    </div>`;
  }
  function Log() {
    const s = useS(), box = useRef(null);
    useEffect(() => { const b = box.current; if (b) b.scrollTop = b.scrollHeight; }, [s.log.length]);
    const copyLog = () => { try { navigator.clipboard.writeText(s.log.map(l => l.t + ' ' + l.text).join('\n')).then(() => toast('Log copied', 'ok'), () => toast('Copy refused here', 'warn')); } catch (_) { toast('Copy refused here', 'warn'); } };
    return html`<div class="tester">
      <h3>Log <span class="muted">${s.log.length} lines</span></h3>
      <div class="ctl"><button class="btn sm" type="button" onClick=${copyLog}>Copy log</button>
        <button class="btn sm ghost" type="button" onClick=${() => { set({ log: [] }); persist(); }}>Clear</button></div>
      <ol class="logl" ref=${box} aria-live="polite">${s.log.map((l, i) => html`<li key=${i} class=${'l-' + l.kind}><time>${l.t}</time> ${l.text}</li>`)}</ol>
    </div>`;
  }
  let overlay = document.getElementById('tester-overlay');
  if (!overlay) { overlay = document.createElement('div'); overlay.id = 'tester-overlay'; document.body.appendChild(overlay); }
  render(html`<${Toast}/><${Busy}/>`, overlay);
  render(html`<${Steps}/>`, root.querySelector('[data-tester="steps"]'));
  render(html`<${Log}/>`, root.querySelector('[data-tester="log"]'));
  return { store, run: runStep, perform, log, toast, steps: IDS };
}
Kit.tester = Object.freeze({ mount, STEPS, ACTIONS });
})();
/* /part:page.script.kit.templates.tester */

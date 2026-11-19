/* part:page.script.previews.b5 */
/* Live previews of batch 5 (owner input): question cards, decision cards, next steps, the save status line, the segmented dial, the rotating code card and the check sandbox.
   Each mounts the entry's own published file on its own published sample (invented content). There is no db here: a stand-in with the db capability's shape
   (put, doc, onSnapshot) keeps the writes in memory and shows them beside the component, and the page forgets them on reload. Nothing reaches Claude.
   Each entry's header says which db collection and capability a real artifact declares. */
(function () {
'use strict';
const { html, useState, useEffect, useRef, useMemo } = window.htmPreact;
const P = window.CatalogPreviews = window.CatalogPreviews || {};
const K = () => window.Kit;
const first = (samples, part) => samples[Object.keys(samples).find(k => k.endsWith('/' + part + '.json'))];
const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
const iso = ago => new Date(Date.now() - ago * 60000).toISOString();
const STYLE = `
.pv5-frame { border-radius: 12px; padding: 14px; background: var(--bg); color: var(--ink); font-family: var(--f-ui); min-width: 0; }
.pv5-scroll { max-height: 560px; overflow: auto; border: 1px solid var(--rule); border-radius: 12px; padding: 0 14px 14px; background: var(--bg); min-width: 0; }
.pv5-scroll:focus-visible { outline: 2px solid var(--seam, var(--accent)); outline-offset: 2px; }
.pv5-grid { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 16px; align-items: start; min-width: 0; }
@media (max-width: 860px) { .pv5-grid { grid-template-columns: minmax(0, 1fr); } }
.pv5-dbbox { display: grid; gap: 6px; min-width: 0; }
.pv5-dbbox pre { margin: 0; max-height: 360px; overflow: auto; }
.pv5-readout { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--rule); border-radius: 12px; background: var(--panel); font: 14px/1.5 var(--f-ui); min-width: 0; }
.pv5-readout p { margin: 0; max-width: 62ch; }
.pv5-readout .pv5-v { font: 600 15px/1.45 var(--f-display, var(--f-ui)); }
.pv5-count { font: 500 13px/1.3 var(--f-mono); color: var(--ink-2); }
.pv5-note { margin: 0; padding: 12px 14px; border: 1px solid var(--rule); border-radius: 12px; background: var(--panel); font: 15px/1.7 var(--f-ui); max-width: 68ch; }
.pv5-stage { display: grid; gap: 14px; justify-items: start; min-width: 0; }
.pv5-log { margin: 0; padding-left: 1.2em; font: 12.5px/1.5 var(--f-mono); color: var(--ink-2); }
.pv5-ta { width: 100%; max-width: 560px; min-height: 90px; font: 14px/1.5 var(--f-ui); color: var(--ink); background: var(--panel); border: 1px solid var(--rule); border-radius: 10px; padding: 10px 12px; resize: vertical; }
.pv5-ta:focus-visible { outline: 2px solid var(--seam, var(--accent)); outline-offset: 2px; }
`;
if (!document.querySelector('style[data-pv="b5"]')) { const st = document.createElement('style'); st.dataset.pv = 'b5'; st.textContent = STYLE; document.head.append(st); }
const Sim = ({ children }) => html`<p class="pv-sim"><b>Stand-in</b> ${children}</p>`;
const Seg = ({ label, value, set, items }) => html`<span class="c-seg" role="group" aria-label=${label}>${items.map(([k, l]) => html`<button type="button" key=${k} aria-pressed=${value === k} onClick=${() => set(k)}>${l}</button>`)}</span>`;

// a db with the capability's shape, in memory: put/upd/del for the components, doc() for the save line, subscribe() for the board's live read
function memdb(seed, o) {
  const docs = clone(seed || {}); const subs = new Set(); const docSubs = {}; const cfg = Object.assign({ refuse: false, delay: 220, fail: false }, o);
  const emit = () => { subs.forEach(f => f()); };
  const guard = () => { if (cfg.refuse) { const e = new Error('refused'); e.code = 'invalid_argument'; throw e; } if (cfg.fail) { const e = new Error('unavailable'); e.code = 'unavailable'; throw e; } };
  const later = fn => new Promise((res, rej) => setTimeout(() => { try { res(fn()); } catch (e) { rej(e); } }, cfg.delay));
  const api = {
    cfg, docs,
    put: (c, id, d) => later(() => { guard(); (docs[c] = docs[c] || {})[id] = clone(d); emit(); }),
    upd: (c, id, d) => later(() => { guard(); docs[c] = docs[c] || {}; docs[c][id] = Object.assign({}, docs[c][id], clone(d)); emit(); }),
    del: (c, id) => later(() => { guard(); if (docs[c]) delete docs[c][id]; emit(); }),
    doc: path => ({
      path,
      set: d => later(() => { guard(); docs['@' + path] = clone(d); (docSubs[path] || []).forEach(f => f()); emit(); }),
      onSnapshot(cb) { const f = () => cb({ exists: ('@' + path) in docs, data: () => clone(docs['@' + path]) }); (docSubs[path] = docSubs[path] || []).push(f); setTimeout(f, 60); return () => { docSubs[path] = docSubs[path].filter(x => x !== f); }; },
    }),
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
  };
  return api;
}
function useDocs(db) { const [, f] = useState(0); useEffect(() => db.subscribe(() => f(x => x + 1)), [db]); return db.docs; }
const Json = ({ value, label }) => html`<pre class="pv-json" tabindex="0" aria-label=${label}>${JSON.stringify(value, null, 1)}</pre>`;
function useMount(fn, deps) {
  const ref = useRef(null);
  useEffect(() => { if (!ref.current) return; const h = fn(ref.current); return () => { if (h && h.destroy) h.destroy(); }; }, deps);
  return ref;
}

// ---------------------------------------------------------------- pattern.questions
P['pattern.questions'] = ({ samples }) => {
  const d = first(samples, 'questions');
  const [mode, setMode] = useState('write');
  const seed = useMemo(() => { const a = {}; for (const [k, v] of Object.entries(d.answers)) { a[k] = Object.assign({}, v, { at: iso(v.agoMin) }); if (v.claudeAgoMin != null) a[k].claudeAt = iso(v.claudeAgoMin); if (v.log) a[k].log = v.log.map(e => ({ at: iso(e.agoMin), by: e.by, what: e.what })); delete a[k].agoMin; delete a[k].claudeAgoMin; } return a; }, [d]);
  const db = useMemo(() => memdb({ [d.collection]: seed }), [d, seed, mode]);
  useEffect(() => { db.cfg.refuse = false; }, [db]);
  const docs = useDocs(db);
  const ref = useMount(el => {
    const api = K().questions.mount(el, { questions: d.questions, answers: clone(docs[d.collection] || {}), collection: d.collection, db: mode === 'none' ? null : db, canWrite: mode !== 'read' });
    return api;
  }, [db, mode]);
  return html`<div class="pv-stack">
    <${Sim}>answers go to an in-memory <code>${d.collection}</code> collection with the db capability's shape. A real artifact declares the <code>db</code> capability and subscribes to the same collection, calling <code>setAnswers</code> on each snapshot.<//>
    <div class="pv-row"><span class="pv-label" id="pv5-qm">The viewer</span><${Seg} label="The viewer" value=${mode} set=${setMode} items=${[['write', 'Can save'], ['read', 'Read only'], ['none', 'No db']]}/></div>
    <div class="pv5-grid">
      <div class="pv5-scroll" tabindex="0" role="region" aria-label="Question cards"><div ref=${ref}></div></div>
      <div class="pv5-dbbox"><p class="pv-label">${d.collection} (what was written)</p><${Json} value=${docs[d.collection] || {}} label="Stand-in db"/></div>
    </div>
  </div>`;
};

// ---------------------------------------------------------------- pattern.decisions
P['pattern.decisions'] = ({ samples }) => {
  const d = first(samples, 'decisions');
  const [mode, setMode] = useState('write');
  const seed = useMemo(() => { const r = {}; for (const [k, v] of Object.entries(d.records)) { const q = d.decisions.find(x => x.id === k); r[k] = { question: q.question, order: q.order, answer: v.answer, label: v.label, answeredBy: 'owner', answeredAt: iso(v.agoMin), claude: { step: v.claudeStep, text: v.claudeText } }; } return r; }, [d]);
  const db = useMemo(() => memdb({ [d.collection]: seed }), [d, seed, mode]);
  const docs = useDocs(db);
  const timers = useRef([]);
  const ref = useMount(el => {
    // the board's side of the lane: a recorded answer is "sent", and the session moves it along; here a timer plays the session
    const api = K().decisions.mount(el, {
      decisions: d.decisions, records: clone(docs[d.collection] || {}), collection: d.collection, db, who: 'owner', canWrite: mode !== 'read',
      afterRecord(dec, doc) {
        const play = (step, text, ms) => timers.current.push(setTimeout(() => { const cur = clone((db.docs[d.collection] || {})[dec.id]); if (!cur) return; cur.claude = { step, text }; db.docs[d.collection][dec.id] = cur; api.setRecords(clone(db.docs[d.collection])); }, ms));
        const first0 = clone(doc); first0.claude = { step: 'queue' }; db.docs[d.collection][dec.id] = first0; api.setRecords(clone(db.docs[d.collection]));
        play('ack', '', 1400); play('pending', 'Applying "' + doc.label + '" to the page.', 3200); play('done', 'Applied. The change is on the page now.', 5600);
      },
    });
    return { destroy() { timers.current.forEach(clearTimeout); timers.current = []; api.destroy(); } };
  }, [db, mode]);
  return html`<div class="pv-stack">
    <${Sim}>a recorded answer is written to the in-memory <code>${d.collection}</code> collection, then a timer plays the Claude session moving it from waiting to answered. A real artifact declares the <code>db</code> and <code>comments</code> (ask Claude) capabilities and forwards the answer from <code>afterRecord</code>, for example with <code>kit.claude-lane</code>.<//>
    <div class="pv-row"><span class="pv-label">The viewer</span><${Seg} label="The viewer" value=${mode} set=${setMode} items=${[['write', 'Can record'], ['read', 'Read only']]}/></div>
    <div class="pv5-grid">
      <div class="pv5-frame" ref=${ref}></div>
      <div class="pv5-dbbox"><p class="pv-label">${d.collection} (what was written)</p><${Json} value=${docs[d.collection] || {}} label="Stand-in db"/></div>
    </div>
  </div>`;
};

// ---------------------------------------------------------------- pattern.next-steps
P['pattern.next-steps'] = ({ samples }) => {
  const d = first(samples, 'next-steps');
  const [kind, setKind] = useState('prompt');
  const [out, setOut] = useState(null);
  const cmd = useMemo(() => (picked, ctx) => {
    const keep = new Set(picked.map(p => p.id)), skip = ctx.items.filter(i => !keep.has(i.id)).map(i => i.title + '/');
    return '# from the parent folder; writes a clean copy next to it\nrsync -a \\\n' + skip.map(s => "  --exclude '" + s + "' \\\n").join('') + '  shop/ shop-share/';
  }, []);
  const ref = useMount(el => K().nextSteps.mount(el, kind === 'prompt'
    ? { items: d.items, state: clone(d.state), onChange: setOut, lead: 'proceed with: ', collapsible: false, title: 'Next steps' }
    : { items: d.folders, state: clone(d.foldersState), onChange: setOut, build: cmd, title: 'Folders to share', words: { done: 'Hold back', pick: 'Include', copy: 'Copy the command', empty: 'Include at least one folder to build the command.', own: 'Added by you' }, allowAdd: false }),
    [kind]);
  useEffect(() => { setOut(null); }, [kind]);
  return html`<div class="pv-stack">
    <${Sim}>ticks, notes and order are kept in one state object that <code>onChange</code> hands to the page; here it is only shown. A real artifact passes it to <code>Kit.saveStatus.persist</code> or writes it to one db doc.<//>
    <div class="pv-row"><span class="pv-label">What the picks build</span><${Seg} label="What the picks build" value=${kind} set=${setKind} items=${[['prompt', 'A prompt for Claude'], ['cmd', 'A copy command']]}/></div>
    <div class="pv5-grid">
      <div ref=${ref}></div>
      <div class="pv5-dbbox"><p class="pv-label">The state onChange gives the page</p><${Json} value=${out || (kind === 'prompt' ? d.state : d.foldersState)} label="State"/></div>
    </div>
  </div>`;
};

// ---------------------------------------------------------------- kit.save-status
P['kit.save-status'] = ({ samples }) => {
  const d = first(samples, 'save-status');
  const [scn, setScn] = useState('shared');
  const [text, setText] = useState(d.doc.text);
  const db = useMemo(() => memdb({ ['@' + d.path]: d.doc }, { delay: 900, refuse: scn === 'refused' }), [scn]);
  const docs = useDocs(db);
  const st = useRef(null); const lineRef = useRef(null); const [phase, setPhase] = useState('loading');
  useEffect(() => {
    try { localStorage.removeItem(d.lsKey); } catch (_) {}
    const line = lineRef.current; line.replaceChildren();
    const s = K().saveStatus.create({ el: line, lsKey: d.lsKey, doc: clone(d.doc), debounce: 500 });
    st.current = s;
    if (scn !== 'none') s.connect(db, d.path);
    const t = setInterval(() => setPhase(s.state()), 120);
    if (scn === 'offline') { setTimeout(() => window.dispatchEvent(new Event('offline')), 400); }
    return () => { clearInterval(t); if (scn === 'offline') window.dispatchEvent(new Event('online')); s.destroy(); };
  }, [scn]);
  const type = v => { setText(v); if (st.current) st.current.persist({ text: v }); };
  return html`<div class="pv-stack">
    <${Sim}>the stand-in doc <code>${d.path}</code> answers in about a second. Type in the box and watch the line; change what the db does with the buttons. In a real artifact the db capability and one doc hold the board's small state.<//>
    <div class="pv-row"><span class="pv-label">The db</span><${Seg} label="What the db does" value=${scn} set=${setScn} items=${d.scenarios.map(s => [s.id, s.label])}/></div>
    <div class="pv5-frame pv5-stage">
      <label class="pv-field" style="width:100%;max-width:560px"><span>Your notes</span><textarea class="pv5-ta" value=${text} onInput=${ev => type(ev.target.value)}></textarea></label>
      <span ref=${lineRef}></span>
      <p class="pv5-count">Line state: <code>${phase}</code>. Browser copy: <code>${d.lsKey}</code>.</p>
    </div>
    <div class="pv5-dbbox"><p class="pv-label">The stand-in doc</p><${Json} value=${docs['@' + d.path]} label="Stand-in doc"/></div>
  </div>`;
};

// ---------------------------------------------------------------- kit.dial
P['kit.dial'] = ({ samples }) => {
  const d = first(samples, 'dial');
  const [val, setVal] = useState(d.options[1].id);
  const dialRef = useRef(null), textRef = useRef(null), marks = useRef(null), api = useRef(null);
  const counts = useMemo(() => Object.fromEntries(d.options.map(o => [o.id, Object.values(d.verdicts).filter(v => v[o.id] === 'redact' || v[o.id] === 'held').length])), [d]);
  useEffect(() => {
    const t = textRef.current; t.replaceChildren();
    d.text.forEach(([s, key]) => { const n = key ? Object.assign(document.createElement('span'), { textContent: s }) : document.createTextNode(s); if (key) n.dataset.kitId = key; t.append(n); });
    marks.current = K().dial.marks(t, { verdict: (key, v) => (d.verdicts[key] || {})[v] || 'clear', labels: { fine: 'this reader already holds it', redact: 'redacted for this reader', held: 'held back from this reader' } });
    api.current = K().dial.mount(dialRef.current, { label: d.label, options: d.options, value: val, keys: true, onChange: id => { setVal(id); marks.current.paint(id); } });
    marks.current.paint(val);
    return () => { api.current.destroy(); marks.current.destroy(); };
  }, [d]);
  return html`<div class="pv-stack">
    <${Sim}>pick a reader with the buttons, the arrow keys or the digits 1 to 3. The marks are a preview only: the real values stay in the page's source.<//>
    <div class="pv5-frame pv5-stage">
      <div ref=${dialRef} style="width:100%"></div>
      <p class="pv5-note" ref=${textRef}></p>
      <div class="pv5-readout"><p class="pv5-v">For ${d.options.find(o => o.id === val).label.toLowerCase()}: ${counts[val]} of ${Object.keys(d.verdicts).length} identifiers are hidden or held back.</p><p>${d.readers[val]}</p></div>
      <p class="pv5-count">Marks: dotted underline = the reader already holds it, solid bar = redacted, boxed = held back.</p>
    </div>
  </div>`;
};

// ---------------------------------------------------------------- kit.code-gate
P['kit.code-gate'] = ({ samples }) => {
  const d = first(samples, 'code-gate');
  const [per, setPer] = useState(d.periods[0].s);
  const [log, setLog] = useState([]);
  useEffect(() => setLog([]), [per]);
  const ref = useMount(el => K().codeGate.mount(el, { period: per, label: d.label, note: d.note, onRotate: (c, s) => setLog(l => [{ c, s, at: new Date().toLocaleTimeString() }, ...l].slice(0, 4)) }), [per]);
  return html`<div class="pv-stack">
    <${Sim}>this code comes from the card's stand-in generator, a hash of the period number that anyone can compute. It shows the card; it is not a secret. A real board passes <code>code(step)</code> that asks its own service.<//>
    <div class="pv-row"><span class="pv-label">Period</span><${Seg} label="Period" value=${per} set=${setPer} items=${d.periods.map(p => [p.s, p.label])}/></div>
    <div class="pv5-frame pv5-stage"><div ref=${ref} style="width:100%;max-width:380px"></div>
      <p class="pv-label">Codes shown since you opened it</p>
      <ol class="pv5-log">${log.map(l => html`<li key=${l.s}>${l.at}: ${l.c} (period ${l.s})</li>`)}</ol></div>
  </div>`;
};

// ---------------------------------------------------------------- pattern.sandbox
P['pattern.sandbox'] = ({ samples }) => {
  const d = first(samples, 'sandbox');
  const [tab, setTab] = useState('detect');
  const [res, setRes] = useState(null);
  const detectors = useMemo(() => d.detectors.map(x => K().sandbox.regexDetector(x)), [d]);
  const ref = useMount(el => {
    if (tab === 'detect') return K().sandbox.detect(el, { detectors, examples: d.examples, text: d.text, label: d.label, note: d.note });
    const probes = d.probes.map(p => ({ id: p.id, what: p.what, target: p.target, run: () => new Promise((ok, no) => {
      if (p.outcome === 'hang') return;   // never answers: the timeout reports it
      setTimeout(() => p.outcome === 'pass' ? ok(p.detail) : no(new Error(p.detail)), p.ms);
    }) }));
    return K().sandbox.probe(el, { probes, timeout: 2500, onDone: setRes });
  }, [tab]);
  useEffect(() => { setRes(null); }, [tab]);
  return html`<div class="pv-stack">
    <${Sim}>${tab === 'detect' ? 'the detectors are invented patterns run in this page; nothing is sent anywhere.' : 'the six probes are simulated with timers (one never answers, to show the timeout, set to 2.5 s here). A real board puts its own requests in run().'}<//>
    <div class="pv-row"><span class="pv-label">Bench</span><${Seg} label="Bench" value=${tab} set=${setTab} items=${[['detect', 'Detectors on text'], ['probe', 'Probes with timings']]}/></div>
    <div class="pv5-frame"><div ref=${ref}></div></div>
    ${tab === 'probe' && res ? html`<div class="pv5-dbbox"><p class="pv-label">onDone(results), what a board would write to its db</p><${Json} value=${res} label="Results"/></div>` : null}
  </div>`;
};
})();
/* /part:page.script.previews.b5 */

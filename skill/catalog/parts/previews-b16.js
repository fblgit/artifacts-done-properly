/* part:page.script.previews.b16 */
/* Live previews of batch 16 (the lane to Claude): the assist engine, the block picker, the request card, the presence line and the assist panel. Each mounts the entry's own published file on its own published sample (invented content) over an in-memory engine with a scripted session. Nothing leaves the page. */
(function () {
'use strict';
const { html, useState, useEffect, useRef } = window.htmPreact;
const P = window.CatalogPreviews = window.CatalogPreviews || {};
const K = () => window.Kit;
const first = (samples, part) => samples[Object.keys(samples).find(k => k.endsWith('/' + part + '.json'))];

// ================================================================ pattern.assist
{
function useMount(fn, deps) {
  const ref = useRef(null);
  useEffect(() => { if (!ref.current) return; const h = fn(ref.current); return () => { if (h && h.destroy) h.destroy(); }; }, deps);
  return ref;
}
const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const STYLE = `
.pv16assist-frame { border-radius: 12px; padding: 16px; background: var(--bg); color: var(--ink); font-family: var(--f-ui); min-width: 0; display: grid; gap: 14px; }
.pv16assist-h { margin: 0; font: 600 12px/1.2 var(--f-mono); letter-spacing: .06em; text-transform: uppercase; color: var(--ink-2); }
.pv16assist-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; }
.pv16assist-list li { display: grid; grid-template-columns: 6.5rem minmax(0, 1fr); gap: 4px 12px; padding: 10px 12px; border: 1px solid var(--rule); border-radius: 10px; background: var(--panel); min-width: 0; }
.pv16assist-st { font: 600 12.5px/1.6 var(--f-mono); color: var(--ink); }
.pv16assist-tx { font: 14.5px/1.45 var(--f-ui); overflow-wrap: anywhere; min-width: 0; }
.pv16assist-sub { grid-column: 2; font: 12.5px/1.4 var(--f-mono); color: var(--ink-2); overflow-wrap: anywhere; }
.pv16assist-pre { margin: 0; padding: 10px 12px; border-radius: 10px; background: var(--sunk); color: var(--ink); font: 12.5px/1.5 var(--f-mono); white-space: pre-wrap; overflow-wrap: anywhere; }
@media (max-width: 40rem) { .pv16assist-list li { grid-template-columns: minmax(0, 1fr); } .pv16assist-sub { grid-column: 1; } }
`;
if (!document.getElementById('pv16-assist')) { const s = document.createElement('style'); s.id = 'pv16-assist'; s.textContent = STYLE; document.head.append(s); }
const GLYPH = { queue: '○ queue', ack: '◐ ack', working: '◑ working', done: '● done' };
function seedOf(d) {
  const seed = {};
  (d.requests || []).forEach(r => { const doc = Object.assign({}, r); delete doc.id; delete doc.turns; seed['requests/' + r.id] = doc; (r.turns || []).forEach(t => { seed['requests/' + r.id + '/turns/' + t.id] = { by: t.by, at: t.at, text: t.text }; }); });
  (d.conversations || []).forEach(c => { const doc = Object.assign({}, c); delete doc.id; delete doc.messages; seed['conversations/' + c.id] = doc; (c.messages || []).forEach(m => { const x = Object.assign({}, m); delete x.id; seed['conversations/' + c.id + '/messages/' + m.id] = x; }); });
  (d.presence || []).forEach(p => { const doc = Object.assign({}, p); delete doc.id; seed['presence/' + p.id] = doc; });
  return seed;
}

// ---------------------------------------------------------------- pattern.assist
P['pattern.assist'] = ({ samples }) => {
  const d = first(samples, 'assist');
  const ref = useMount(el => {
    const A = K().assist, engine = A.start({ db: A.memory(seedOf(d)), now: d.now, project: d.project, shortcut: false });
    const h1 = mk('h3', 'pv16assist-h', 'engine.requests().get()'), list = mk('ul', 'pv16assist-list');
    const h2 = mk('h3', 'pv16assist-h', 'engine.presence().get()'), pre = mk('pre', 'pv16assist-pre');
    const status = mk('p', 'pv16assist-sub'); status.setAttribute('role', 'status');
    el.append(h1, list, h2, pre, status);
    const offs = [
      engine.requests().on(rs => {
        list.replaceChildren(...rs.map(r => {
          const li = mk('li');
          li.append(mk('span', 'pv16assist-st', GLYPH[r.state] + (r.stuck ? ', stuck' : '')), mk('span', 'pv16assist-tx', engine.word(r.lane) + ': ' + r.text),
            mk('span', 'pv16assist-sub', r.id + ' · ' + (r.scope && r.scope.id ? 'part ' + r.scope.id : 'page') + (r.progress && r.progress.length ? ' · ' + r.progress[r.progress.length - 1].text : '') + (r.changed && r.changed.length ? ' · changed ' + r.changed.join(', ') : '')));
          return li;
        }));
        status.textContent = rs.length + ' requests, ' + rs.filter(r => r.status !== 'done').length + ' open.';
      }),
      engine.presence().on(p => { pre.textContent = JSON.stringify(p, null, 1); })
    ];
    return { destroy() { offs.forEach(f => f()); engine.destroy(); } };
  }, []);
  return html`<div class="pv-stack">
    <div class="pv16assist-frame" ref=${ref}></div>
    <p class="pv-sim"><b>Preview</b> The engine over an in-memory copy of the sample, read at the sample's clock (${d.now}). The states are derived from status and state; the queued request is past three minutes, so it reads stuck. The panel, the request card and the presence line are the assist views.</p>
  </div>`;
};
}

// ================================================================ pattern.block-picker
{
const first = (samples, part) => samples[Object.keys(samples).find(k => k.endsWith("/" + part + ".json"))];
function useMount(fn, deps) {
  const ref = useRef(null), h = useRef(null);
  useEffect(() => { if (!ref.current) return; h.current = fn(ref.current); return () => { if (h.current && h.current.destroy) h.current.destroy(); h.current = null; }; }, deps);
  return [ref, h];
}
const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const STYLE = `
.pv16block-picker-frame { border-radius: 12px; padding: 16px; background: var(--bg); color: var(--ink); font-family: var(--f-ui); min-width: 0; display: grid; gap: 12px; }
.pv16block-picker-page { display: grid; gap: 8px; min-width: 0; }
.pv16block-picker-page section { background: var(--panel); border: 1px solid var(--rule); border-radius: 10px; padding: 10px 12px; min-width: 0; }
.pv16block-picker-page h4 { margin: 0 0 4px; font: 600 15px var(--f-display, var(--f-ui)); }
.pv16block-picker-page p { margin: 0; font-size: 14px; line-height: 1.5; overflow-wrap: anywhere; }
.pv16block-picker-bar { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
.pv16block-picker-go { min-height: 38px; padding: 0 16px; border-radius: 999px; border: 1px dashed var(--seam, var(--accent)); background: var(--panel); color: var(--ink); font: 700 14px var(--f-ui); cursor: pointer; }
.pv16block-picker-go:focus-visible { outline: 3px solid var(--seam, var(--accent)); outline-offset: 2px; }
.pv16block-picker-out { margin: 0; font-size: 13.5px; line-height: 1.5; color: var(--ink-2); overflow-wrap: anywhere; }
.pv16block-picker-out code { font: 12.5px var(--f-mono); color: var(--ink); }
`;
if (!document.getElementById('pv16-block-picker')) { const st = document.createElement('style'); st.id = 'pv16-block-picker'; st.textContent = STYLE; document.head.append(st); }

P['pattern.block-picker'] = ({ samples }) => {
  const d = first(samples, 'block-picker'); const page = useRef(null); const [got, setGot] = useState(undefined);
  const go = () => K().blockPicker.open({ root: page.current, titles: d.titles }).then(p => setGot(p ? { id: p.id, label: p.label, hash: p.hash, quote: p.quote } : null));
  return html`<div class="pv16block-picker-frame">
    <div class="pv16block-picker-bar"><button type="button" class="pv16block-picker-go" onClick=${go}>Pick a block</button>
      <span class="pv16block-picker-out">Then arrows to move, Enter to pick, Esc to leave; or click a block.</span></div>
    <div class="pv16block-picker-page" ref=${page}>${d.blocks.map(b => html`<section key=${b.part + (b.key || '')} data-part=${b.part} data-part-key=${b.key || undefined} data-hash=${b.hash || undefined}><h4>${b.heading}</h4><p>${b.text}</p></section>`)}</div>
    <p class="pv16block-picker-out" role="status">${got === undefined ? 'Nothing picked yet.' : got === null ? 'Left without a pick: the promise resolved null.' : html`Picked <code>${got.id}</code>, “${got.label}”, hash <code>${got.hash || 'none'}</code>. Quote: ${got.quote}`}</p>
  </div>`;
};
}

// ================================================================ pattern.request-card
{
const first = (samples, part) => samples[Object.keys(samples).find(k => k.endsWith("/" + part + ".json"))];
function useMount(fn, deps) {
  const ref = useRef(null), h = useRef(null);
  useEffect(() => { if (!ref.current) return; h.current = fn(ref.current); return () => { if (h.current && h.current.destroy) h.current.destroy(); h.current = null; }; }, deps);
  return [ref, h];
}
const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const STYLE = `
.pv16request-card-frame { border-radius: 12px; padding: 16px; background: var(--bg); color: var(--ink); font-family: var(--f-ui); min-width: 0; display: grid; gap: 12px; }
.pv16request-card-out { margin: 0; font-size: 13.5px; color: var(--ink-2); overflow-wrap: anywhere; }
`;
if (!document.getElementById('pv16-request-card')) { const st = document.createElement('style'); st.id = 'pv16-request-card'; st.textContent = STYLE; document.head.append(st); }
const WORD = { done: 'Answered, with a reply', working: 'Working', queue: 'Still queued' };

P['pattern.request-card'] = ({ samples }) => {
  const d = first(samples, 'request-card'); const [i, setI] = useState(0); const [said, setSaid] = useState('');
  const reqs = useRef(null); if (!reqs.current) reqs.current = JSON.parse(JSON.stringify(d.requests));
  const [ref, h] = useMount(el => K().requestCard.mount(el, { request: reqs.current[i], me: d.me, names: d.names, titles: d.titles, now: d.now,
    onReveal: id => setSaid('onReveal asked to show ' + id + '. The page decides how.'),
    onReply: (rid, text) => { const r = reqs.current.find(x => x.id === rid); r.turns = (r.turns || []).concat([{ by: d.me, at: d.now, text }]); r.status = 'open'; r.state = null;
      setTimeout(() => { r.turns = r.turns.concat([{ by: 'claude', at: d.now, text: 'Noted. In this preview the answer is canned; a session would do it and publish.' }]); r.status = 'done'; if (h.current) h.current.update({ request: r, thread: null }); }, 1500);
      setTimeout(() => { if (h.current) h.current.update({ request: r, thread: null }); }, 0); return Promise.resolve(); } }), [i]);
  const kind = r => r.status === 'done' ? 'done' : r.state === 'working' ? 'working' : 'queue';
  return html`<div class="pv16request-card-frame">
    <span class="c-seg" role="group" aria-label="Which request">${reqs.current.map((r, k) => html`<button type="button" key=${r.id} aria-pressed=${i === k} onClick=${() => setI(k)}>${WORD[kind(d.requests[k])]}</button>`)}</span>
    <div ref=${ref}></div>
    <p class="pv16request-card-out" role="status">${said || 'Press a block button, or reply on the answered request.'}</p>
  </div>`;
};
}

// ================================================================ pattern.presence
{
const first = (samples, part) => samples[Object.keys(samples).find(k => k.endsWith("/" + part + ".json"))];
function useMount(fn, deps) {
  const ref = useRef(null), h = useRef(null);
  useEffect(() => { if (!ref.current) return; h.current = fn(ref.current); return () => { if (h.current && h.current.destroy) h.current.destroy(); h.current = null; }; }, deps);
  return [ref, h];
}
const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const STYLE = `
.pv16presence-frame { border-radius: 12px; padding: 16px; background: var(--bg); color: var(--ink); font-family: var(--f-ui); min-width: 0; display: grid; gap: 14px; }
.pv16presence-box { padding: 12px 14px; border-radius: 12px; background: var(--panel); border: 1px solid var(--rule); min-width: 0; }
.pv16presence-bar { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
.pv16presence-lbl { font-size: 13px; color: var(--ink-2); }
`;
if (!document.getElementById('pv16-presence')) { const st = document.createElement('style'); st.id = 'pv16-presence'; st.textContent = STYLE; document.head.append(st); }
const NAMES = { watching: 'Watching', busy: 'Busy', away: 'Nobody' };

P['pattern.presence'] = ({ samples }) => {
  const d = first(samples, 'presence'); const [s, setS] = useState('watching'); const [compact, setCompact] = useState(false);
  const [ref] = useMount(el => K().presence.mount(el, { presence: d.states[s], artifactUrl: d.artifactUrl, now: d.now, compact, ask: true,
    onPing: () => new Promise(r => setTimeout(() => r(s === 'away' ? 'timeout' : 'pong'), s === 'away' ? 4000 : 900)) }), [s, compact]);
  return html`<div class="pv16presence-frame">
    <div class="pv16presence-bar"><span class="pv16presence-lbl" id="pv16-pr-s">Session</span>
      <span class="c-seg" role="group" aria-labelledby="pv16-pr-s">${Object.keys(NAMES).map(k => html`<button type="button" key=${k} aria-pressed=${s === k} onClick=${() => setS(k)}>${NAMES[k]}</button>`)}</span>
      <span class="c-seg" role="group" aria-label="Form">${[[false, 'Full'], [true, 'Compact']].map(([v, l]) => html`<button type="button" key=${l} aria-pressed=${compact === v} onClick=${() => setCompact(v)}>${l}</button>`)}</span></div>
    <div class="pv16presence-box" ref=${ref}></div>
  </div>`;
};
}

// ================================================================ pattern.assist-panel
{
const first = (samples, part) => samples[Object.keys(samples).find(k => k.endsWith("/" + part + ".json"))];
function useMount(fn, deps) {
  const ref = useRef(null), h = useRef(null);
  useEffect(() => { if (!ref.current) return; h.current = fn(ref.current); return () => { if (h.current && h.current.destroy) h.current.destroy(); h.current = null; }; }, deps);
  return [ref, h];
}
const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const STYLE = `
.pv16assist-panel-frame { border-radius: 12px; padding: 16px; background: var(--bg); color: var(--ink); font-family: var(--f-ui); min-width: 0; display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr); }
@media (min-width: 60rem) { .pv16assist-panel-frame { grid-template-columns: minmax(0, 1fr) minmax(0, 25rem); align-items: start; } }
.pv16assist-panel-page { display: grid; gap: 8px; min-width: 0; }
.pv16assist-panel-page section { background: var(--panel); border: 1px solid var(--rule); border-radius: 10px; padding: 10px 12px; min-width: 0; }
.pv16assist-panel-page h4 { margin: 0 0 4px; font: 600 15px var(--f-display, var(--f-ui)); }
.pv16assist-panel-page p { margin: 0; font-size: 14px; line-height: 1.5; overflow-wrap: anywhere; }
.pv16assist-panel-note { margin: 0; font-size: 13px; color: var(--ink-2); line-height: 1.5; }
`;
if (!document.getElementById('pv16-assist-panel')) { const st = document.createElement('style'); st.id = 'pv16-assist-panel'; st.textContent = STYLE; document.head.append(st); }
const PAGE = [['home.welcome', 'Plot 14 planting plan', 'Two rows of raised beds, a compost bay and a water butt.'], ['beds.north', 'North beds', 'Bed 1 onions, bed 2 garlic, bed 3 leeks (2.4 m).'],
  ['calendar.sowing', 'Sowing calendar', 'Garlic: October to November. Onion sets: March. Peas: March to June.']];
function rebase(seed, from) {
  const shift = Date.now() - Date.parse(from);
  const walk = v => typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(Date.parse(v) + shift).toISOString() : Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : v;
  return walk(seed);
}
function session(mem, timers) {
  const at = () => new Date().toISOString(), later = (ms, f) => timers.push(setTimeout(f, ms));
  const beat = () => mem.doc('presence/preview-session').set({ at: at(), doing: '', session: 'preview-session' });
  beat(); timers.push(setInterval(beat, 60000));
  return {
    canSendToClaude: () => Promise.resolve('available'), anchorFor: () => Promise.resolve('page'),
    sendToClaude: ({ text }) => {
      const m = /adp request \{([^}]+)\} · lane (\w+)/.exec(text || ''); if (!m) return Promise.resolve({ threadId: 't-preview' });
      const ref = mem.doc('requests/' + m[1]), lane = m[2];
      if (lane === 'ping') { later(900, () => { ref.update({ state: 'ack', ackBy: 'preview-session' }).then(() => ref.update({ status: 'done', response: 'pong', doneAt: at() })); beat(); }); return Promise.resolve({ threadId: 't-preview' }); }
      later(1200, () => ref.update({ state: 'ack', ackBy: 'preview-session', ackAt: at() }));
      later(2800, () => ref.get().then(s => ref.update({ state: 'working', progress: (s.data().progress || []).concat([{ at: at(), text: 'Reading the block.' }]) })));
      later(4600, () => ref.get().then(s => ref.update({ progress: (s.data().progress || []).concat([{ at: at(), text: 'Drafting the change.' }]) })));
      later(7000, () => ref.get().then(s => { const r = s.data(); const sid = r.scope && r.scope.id;
        if (r.response) { mem.collection('requests/' + m[1] + '/turns').get().then(q => mem.doc('requests/' + m[1] + '/turns/' + String(q.size + 1).padStart(4, '0')).set({ by: 'claude', at: at(), text: 'Done. In this preview the answer is canned.' })); return ref.update({ status: 'done', state: 'done' }); }
        return ref.update({ status: 'done', state: 'done', doneAt: at(), response: 'In this preview the session is scripted: a real one would do this, publish and list the blocks it changed.', changed: sid ? [sid] : [] }); }));
      return Promise.resolve({ threadId: 't-preview' });
    },
  };
}

P['pattern.assist-panel'] = ({ samples }) => {
  const d = first(samples, 'assist-panel'); const [said, setSaid] = useState('');
  const [ref] = useMount(el => {
    const timers = [], mem = K().assist.memory(rebase(d.seed, d.now));
    const sample = (msgs, opt) => new Promise(res => { const t = d.answer; let n = 0;
      const step = () => { n = Math.min(t.length, n + 18); if (opt && opt.onText) opt.onText(t.slice(0, n)); if (n < t.length) timers.push(setTimeout(step, 40)); else res({ text: t }); }; timers.push(setTimeout(step, 400)); });
    let panel = null;
    const engine = K().assist.start({ db: mem, user: { id: d.me }, comments: session(mem, timers), sample, titles: d.titles, shortcut: false, onPick: p => panel && panel.setScope(p, true) });
    panel = K().assistPanel.mount(el, { engine, titles: d.titles, me: d.me, artifactUrl: d.artifactUrl, onReveal: id => setSaid('onReveal asked to show ' + id + '.') });
    return { destroy() { timers.forEach(t => { clearTimeout(t); clearInterval(t); }); panel.destroy(); engine.destroy(); } };
  }, [d]);
  return html`<div class="pv16assist-panel-frame">
    <div class="pv16assist-panel-page">${PAGE.map(([id, h, t]) => html`<section key=${id} data-part=${id}><h4>${h}</h4><p>${t}</p></section>`)}
      <p class="pv16assist-panel-note" role="status">${said || 'Pick a block, choose a kind, write and send. The session here is scripted: it acknowledges in about a second and answers in seven.'}</p></div>
    <div ref=${ref}></div>
  </div>`;
};
}
})();
/* /part:page.script.previews.b16 */

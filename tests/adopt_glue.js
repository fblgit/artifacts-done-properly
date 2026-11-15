/* Runs the adopter template's parts/adopt.js against an in-memory stand-in for the page's database, in jsdom, and prints what the page did as one JSON object;
   tests/test_adopt_js.py asserts it. Usage: node adopt_glue.js JSDOM_DIR KIT_DIR GLUE_FILE */
const path = require('path'), fs = require('fs');
const { JSDOM } = require(path.join(process.argv[2], 'node_modules', 'jsdom'));
const kit = process.argv[3], glue = fs.readFileSync(process.argv[4], 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CANDS = { schema: 'adopt-candidates/1', subject: { name: 'toy' }, namespace: 'Toy', candidates: ['c.a', 'c.b', 'c.c'].map((id, i) => ({ id, name: id.slice(2), state: 'detected', needs: i ? ['c.a'] : [], classes: ['k' + i], files: [{ path: id + '.js', bytes: 10 }], provides: [], bytes: 10 })) };

/* the database: documents by path, listeners per path, and switches to make a write fail or to be a viewer */
function makeDb() {
  const docs = {}, subs = {}, db = { docs, writes: [], fail: false };
  const snap = p => ({ exists: p in docs, data: () => JSON.parse(JSON.stringify(docs[p])) });
  db.doc = p => {
    /* the real handle refuses at once a path that addresses a collection (this is the error that broke the first release) */
    if (p.split('/').length % 2) throw new TypeError('db doc(): document paths have an even number of segments (collection/id pairs); "' + p + '" has ' + p.split('/').length + ', which addresses a collection');
    return docAt(p);
  };
  const docAt = p => ({
    get: () => Promise.resolve(snap(p)),
    set: d => { db.writes.push([p, JSON.parse(JSON.stringify(d))]); if (db.fail) return Promise.reject({ code: 'permission-denied' }); docs[p] = JSON.parse(JSON.stringify(d)); (subs[p] || []).forEach(f => setTimeout(() => f(snap(p)), 0)); return Promise.resolve(); },
    update: () => Promise.reject({ code: 'update-not-used' }),
    onSnapshot: (f) => { (subs[p] = subs[p] || []).push(f); setTimeout(() => f(snap(p)), 0); return () => { subs[p] = subs[p].filter(x => x !== f); }; },
  });
  return db;
}

async function session(db, o) {
  o = o || {};
  const dom = new JSDOM('<!doctype html><body><div id="views"></div></body>', { runScripts: 'outside-only', pretendToBeVisual: true }), w = dom.window;
  ['adopt.js', 'patterns/adopt-board.js', 'patterns/adopt-inspector.js'].forEach(f => w.eval(fs.readFileSync(path.join(kit, f), 'utf8')));
  w.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(CANDS) });
  w.ADP = { db: true, ns: () => ({ doc: p => db.doc('ns/shared/' + p) }) };
  w.claude = { use: () => Promise.resolve({ can: () => Promise.resolve(o.canWrite !== false) }) };
  const sent = []; w.eval(glue);
  const view = w.ADP_VIEWS.adopt, root = w.document.getElementById('views'); root.innerHTML = view.html();
  const m = view.mount({ root, engine: () => ({ send: a => { sent.push(a); return Promise.resolve('r-1'); } }), titles: {} });
  await sleep(150);
  const q = s => root.querySelector(s), all = s => Array.prototype.slice.call(root.querySelectorAll(s));
  const node = id => q('.kit-ab-node[data-id="' + id + '"]'), btn = t => all('.kit-ab-btn').find(b => b.textContent === t);
  const snapshot = () => ({ states: Object.fromEntries(all('.kit-ab-node').map(n => [n.dataset.id, n.dataset.state])), pressed: (all('.kit-ab-node').find(n => n.getAttribute('aria-pressed') === 'true') || { dataset: {} }).dataset.id || null, status: q('.kit-ab-status').textContent, tone: q('.kit-ab-status').dataset.tone, note: q('.ad-note').textContent });
  return { w, m, q, all, node, btn, snapshot, sent, root };
}

(async () => {
  const out = {}, db = makeDb();
  /* 1. a first visit: nothing saved yet */
  let s = await session(db); out.first = s.snapshot();
  /* 2. select a candidate and adopt it: both reach the server */
  s.node('c.b').click(); await sleep(50);
  s.btn('Select').click(); await sleep(80);
  out.afterSelect = s.snapshot(); out.dbState = db.docs['ns/shared/adopt/state']; out.dbView = (db.docs['ns/shared/adopt/view'] || {}).selected;
  s.btn('Work on it').click(); await sleep(60);
  s.m.destroy();
  /* 3. a refresh: a new page against the same server data */
  s = await session(db); out.refreshed = s.snapshot();
  /* 4. working: sending a request to Claude records it and moves the candidate */
  s.node('c.c').click(); await sleep(50); s.btn('Select').click(); await sleep(60); s.btn('Work on it').click(); await sleep(60);
  const ta = s.q('.kit-ab-work textarea'); ta.value = 'make it generic'; s.q('.kit-ab-work').dispatchEvent(new s.w.Event('submit', { cancelable: true })); await sleep(100);
  out.sent = s.sent.map(x => ({ lane: x.lane, scope: x.scope, quote: x.quote, text: x.text }));
  out.afterWork = s.snapshot(); out.items = db.docs['ns/shared/adopt/state'].items.map(x => [x.id, x.state]);
  s.m.destroy();
  /* 5. a failing write says so instead of pretending */
  db.fail = true; s = await session(db); s.node('c.a').click(); await sleep(30); s.btn('Select').click(); await sleep(80);
  out.failed = s.snapshot(); s.m.destroy(); db.fail = false;
  /* 6. someone who can only view */
  s = await session(db, { canWrite: false }); out.viewer = { status: s.snapshot().status, disabled: s.all('.kit-ab-btn').filter(b => b.textContent !== 'Download').every(b => b.disabled) };
  s.m.destroy();
  /* 6b. previews: one Claude has written shows at once; without one the button asks for it, naming the files in dependency order */
  db.docs['ns/shared/previews/c.c'] = { html: '<!doctype html><p id="made">built for c.c</p>' };
  s = await session(db); s.node('c.c').click(); await sleep(120);
  const pf = s.q('.kit-ai-pv-frame'); out.previewShown = { frame: !!pf, srcdoc: pf ? pf.srcdoc : '', sandbox: pf ? pf.getAttribute('sandbox') : '', head: s.q('.kit-ai-snap-h').textContent };
  s.node('c.b').click(); await sleep(120);
  out.noPreview = { frame: !!s.q('.kit-ai-pv-frame'), button: (s.q('.kit-ai-snap .kit-ai-btn') || {}).textContent || '' };
  s.q('.kit-ai-snap .kit-ai-btn').click(); await sleep(80);
  out.buildRequest = s.sent.map(x => ({ id: x.scope.id, label: x.scope.label, text: x.text }));
  out.buttonAfter = s.q('.kit-ai-snap .kit-ai-btn').textContent;
  db.docs['ns/shared/previews/c.b'] = { html: '<p>now there is one</p>' }; db.doc('ns/shared/previews/c.b').set({ html: '<p>now there is one</p>' }); await sleep(60);
  out.arrives = (s.q('.kit-ai-pv-frame') || {}).srcdoc || ''; out.selectDidNotThrow = !s.q('.kit-ab-node[data-id="c.b"]') ? false : true;
  s.m.destroy();
  /* 7. a dotted id is a list entry, never a path */
  out.noDotKeys = Object.keys(db.docs['ns/shared/adopt/state']).every(k => k.indexOf('.') < 0) && db.writes.every(w => Object.keys(w[1]).every(k => k.indexOf('.') < 0));
  console.log(JSON.stringify(out)); process.exit(0);
})().catch(e => { console.log(JSON.stringify({ crash: String(e && e.stack || e) })); process.exit(1); });

/* Mounts the real kit/adopt.js, adopt-board.js and adopt-inspector.js in jsdom and prints what they draw, as one JSON object; tests/test_adopt_js.py asserts it.
   Usage: node adopt_dom.js JSDOM_DIR KIT_DIR   (JSDOM_DIR holds node_modules/jsdom; jsdom is not a dependency of the repo, so the test is skipped without it) */
const path = require('path'), fs = require('fs');
const { JSDOM } = require(path.join(process.argv[2], 'node_modules', 'jsdom'));
const kit = process.argv[3];
const dom = new JSDOM('<!doctype html><body><div id="board"></div><div id="insp"></div></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;
['adopt.js', 'patterns/adopt-board.js', 'patterns/adopt-inspector.js'].forEach(f => w.eval(fs.readFileSync(path.join(kit, f), 'utf8')));
const K = w.Kit, out = {}, sleep = ms => new Promise(r => setTimeout(r, ms));
const c = (id, state, o) => Object.assign({ id, name: id, state, needs: [], classes: [], files: [{ path: id + '.js', bytes: 2048 }], provides: ['X.' + id], bytes: 2048 }, o);
const cands = [
  c('P', 'selected', { classes: ['pk-wheel', 'pk-in'], needs: ['B'], suggested_id: 'pattern.p' }),
  c('B', 'detected', { needs: ['C'] }),
  c('C', 'discarded'),
  c('W', 'working', { classes: ['w-box'] }),
  c('R', 'ready', { classes: ['r-box'] }),
  c('D', 'discarded', { classes: ['d-box'] }),
  c('N', 'detected', { classes: ['n-box'] }),
];
const moves = [], picks = [], selects = [];
const board = K.adoptBoard.mount(w.document.getElementById('board'), { candidates: cands, selected: 'P', onMove: (id, to) => moves.push([id, to]), onSelect: id => selects.push(id), packs: { R: { id: 'pattern.r', text: '{}' } } });
board.setStatus('Saved to the server at 14:02.', 'ok');
const q = (root, s) => Array.prototype.slice.call(root.querySelectorAll(s));
const bd = w.document.getElementById('board');

/* the map */
out.nodes = {}; q(bd, '.kit-ab-node').forEach(n => { out.nodes[n.dataset.id] = { state: n.dataset.state, need: n.dataset.need || '', name: n.querySelector('.kit-ab-nm').textContent, meta: n.querySelector('.kit-ab-meta').textContent, dot: !!n.querySelector('.kit-ab-work-dot'), pressed: n.getAttribute('aria-pressed') }; });
out.edges = q(bd, '.kit-ab-edge').map(e => e.getAttribute('class').replace('kit-ab-edge', '').trim() || 'quiet').sort();
out.markers = q(bd, 'marker').map(m => m.id).sort();
out.legend = q(bd, '.kit-ab-key').map(k => k.className.replace('kit-ab-key ', ''));
out.status = { text: bd.querySelector('.kit-ab-status').textContent, tone: bd.querySelector('.kit-ab-status').dataset.tone };
out.chips = q(bd, '.kit-ab-chip').map(x => x.textContent);

/* the work panel: moves, the required note, the download */
const side = () => bd.querySelector('.kit-ab-side');
out.sideP = { buttons: q(side(), '.kit-ab-moves button').map(b => b.textContent), heading: side().querySelector('h3').textContent };
q(side(), '.kit-ab-moves button').find(b => b.textContent === 'Discard').click();
out.moves = moves.slice();
board.select('B'); out.needNoteB = (side().querySelector('.kit-ab-req') || {}).textContent;
board.select('C'); out.needNoteC = (side().querySelector('.kit-ab-req') || {}).textContent; out.conflictBad = !!side().querySelector('.kit-ab-req.bad');
board.select('R'); out.download = (q(side(), 'button').find(b => /Download/.test(b.textContent)) || {}).textContent;
bd.querySelector('.kit-ab-node[data-id="W"]').click(); out.clickSelected = selects.slice();

/* a filter changes the nodes shown but not what is lit */
q(bd, '.kit-ab-chip').find(x => /^Working/.test(x.textContent)).click(); out.filtered = q(bd, '.kit-ab-node').map(n => n.dataset.id);
q(bd, '.kit-ab-chip')[0].click();

/* the inspector over a stand-in for the artifact */
(async () => {
  const insp = K.adoptInspector.mount(w.document.getElementById('insp'), { src: 'about:blank', candidates: cands, selected: 'P', onPick: p => picks.push(p) });
  const frame = w.document.querySelector('.kit-ai-frame'), fd = frame.contentDocument, fw = frame.contentWindow;
  fd.body.innerHTML = '<div class="pk-wheel" style="width:40px"><span class="pk-in">x</span></div><div class="w-box">w</div><div class="r-box">r</div><div class="d-box">d</div><div class="z">z</div>';
  fd.head.innerHTML = '<link rel="stylesheet" href="styles/picker.css"><style>.pk-wheel{color:red}</style>';
  fw.Element.prototype.getBoundingClientRect = function () { return { width: 200, height: 80, left: 0, top: 0, right: 200, bottom: 80 }; };
  frame.dispatchEvent(new w.Event('load')); await sleep(700);
  const cls = s => (fd.querySelector(s).className || '').split(/\s+/).filter(x => x.indexOf('kit-ai-') === 0).sort();
  out.paint = { wheel: cls('.pk-wheel'), inner: cls('.pk-in'), working: cls('.w-box'), ready: cls('.r-box'), discarded: cls('.d-box'), other: cls('.z') };
  const snapFrame = () => w.document.querySelector('.kit-ai-snap-frame');
  const snapText = () => w.document.querySelector('.kit-ai-snap').textContent;
  out.snapP = { hidden: w.document.querySelector('.kit-ai-snap').hidden, head: w.document.querySelector('.kit-ai-snap-h').textContent, srcdoc: (snapFrame() || {}).srcdoc || '' };
  insp.select('B'); await sleep(20); out.snapLogic = snapText();
  insp.select('N'); await sleep(20); out.snapAbsent = snapText();
  insp.select('P'); await sleep(20); out.snapAgain = !!snapFrame();
  /* the picker: hover names the owner, a click selects it */
  w.document.querySelector('.kit-ai-btn').click();
  const inner = fd.querySelector('.pk-in'); inner.dispatchEvent(new fw.MouseEvent('mouseover', { bubbles: true }));
  out.hover = w.document.querySelector('.kit-ai-say').textContent;
  inner.dispatchEvent(new fw.MouseEvent('click', { bubbles: true, cancelable: true })); out.picks = picks.slice();
  out.pickerOff = w.document.querySelector('.kit-ai-btn').getAttribute('aria-pressed');
  /* a new state paints on its own: P is discarded, the frame draws something new */
  insp.setCandidates(cands.map(x => (x.id === 'P' ? Object.assign({}, x, { state: 'discarded' }) : x))); await sleep(500);
  out.afterDiscard = cls('.pk-wheel');
  fd.body.insertAdjacentHTML('beforeend', '<div class="n-box">now on screen</div>'); insp.select('N'); await sleep(500);
  out.nowOnScreen = { focus: cls('.n-box'), srcdoc: ((snapFrame() || {}).srcdoc || '').indexOf('now on screen') >= 0 };
  insp.destroy(); board.destroy();
  console.log(JSON.stringify(out)); process.exit(0);
})().catch(e => { console.log(JSON.stringify({ crash: String(e && e.stack || e) })); process.exit(1); });

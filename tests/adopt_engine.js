/* Runs kit/adopt.js (no DOM) in a bare context and prints one JSON object of results; tests/test_adopt_js.py asserts them. Usage: node adopt_engine.js PATH_TO_adopt.js */
const fs = require('fs'), vm = require('vm');
const wc = require('crypto').webcrypto, win = { crypto: wc };
vm.runInNewContext(fs.readFileSync(process.argv[2], 'utf8'), { window: win, TextEncoder, crypto: wc });
const K = win.Kit.adopt, out = {};
const c = (id, state, needs, classes) => ({ id, name: id, state, needs: needs || [], classes: classes || [], bytes: 100 });

/* A (selected) needs B (detected) needs C (discarded); D is detected and alone; E is discarded and unrelated */
const list = [c('A', 'selected', ['B']), c('B', 'detected', ['C']), c('C', 'discarded'), c('D', 'detected'), c('E', 'discarded')];
const by = {}; list.forEach(x => { by[x.id] = x; });
const cl = K.closure(list);
out.closure = { on: Object.keys(cl.on).sort(), required: cl.required, conflicts: cl.conflicts };
out.edges = {
  BA: K.edgeKind({ from: 'B', to: 'A' }, by, cl),       // part of an adopted path
  CB: K.edgeKind({ from: 'C', to: 'B' }, by, cl),       // needed but discarded
  DE: K.edgeKind({ from: 'E', to: 'D' }, by, cl),       // a discarded end, not on a path
  none: K.edgeKind({ from: 'D', to: 'D' }, by, cl),
  missing: K.edgeKind({ from: 'X', to: 'A' }, by, cl),
};
out.adopted = K.ADOPTED.every(s => K.adopted(s)) && !K.adopted('detected') && !K.adopted('discarded');
out.counts = K.counts(list);
out.merge = K.merge([c('A', 'detected')], { A: { state: 'ready', notes: 'n' }, B: { state: 'x' } })[0].state + '|' + K.merge([c('A', 'detected')], { A: { state: 'bogus' } })[0].state;

/* layout: columns by dependency depth; with a width the columns spread across it */
const chain = [c('a', 'detected'), c('b', 'detected', ['a']), c('c', 'detected', ['b']), c('d', 'detected', ['b'])];
const narrow = K.layout(chain), wide = K.layout(chain, { width: 1600 });
const right = L => Math.max.apply(null, L.nodes.map(n => n.x + n.w));
out.layout = { layers: chain.map(x => narrow.nodes.find(n => n.id === x.id).layer), narrowRight: right(narrow), wideRight: right(wide), wideFits: right(wide) <= 1600, edges: wide.edges.length, widerNodes: wide.nodes[0].w > narrow.nodes[0].w };
const cyc = K.layout([c('p', 'detected', ['q']), c('q', 'detected', ['p'])]);
out.cycleEnds = cyc.nodes.length === 2;

/* owner lookup: the nearest ancestor with a class or id a candidate owns */
const idx = K.index([c('pk', 'detected', [], ['pk-wheel', 'pk-in']), Object.assign(c('dl', 'detected', [], ['dl-knob']), { ids: ['mark'] })]);
const el = (cls, id, parent) => ({ nodeType: 1, id: id || '', classList: cls, parentElement: parent || null });
const wheel = el(['pk-wheel']), inner = el(['x'], '', el(['y'], '', wheel)), byId = el([], 'mark'), none = el(['z']);
out.owner = [K.ownerOf(inner, idx), K.ownerOf(byId, idx), K.ownerOf(none, idx), K.ownerOf(null, idx)];

K.verifyPack({ schema: 'adp-pack/1', files: [{ path: 'a', text: 'hi', sha256: require('crypto').createHash('sha256').update('hi').digest('hex'), bytes: 2 }, { path: 'b', text: 'x', sha256: '00', bytes: 5 }] })
  .then(p => { out.verify = p; console.log(JSON.stringify(out)); });

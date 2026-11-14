"""adp.js unpacks packed files: the seed's `unpack` collection becomes real published files (ADP.unpack), on the first open before the
db is written, and again when a later seed carries a new stamp (reunpack), which What changed lists. Run with the real functions cut out of
adp.js, a fake db and a fake claude.use('artifact').publish."""
import json
import os
import shutil
import subprocess
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ADPJS = os.path.join(ROOT, 'skill', 'catalog', 'adp.js')
NODE = shutil.which('node')

SCRIPT = r"""
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8'), a = src.indexOf('/* ---------- unpack:'), b = src.indexOf('/* ---------- page self-check');
if (a < 0 || b < a) { console.error('unpack not found in adp.js'); process.exit(1); }
const AF = Object.getPrototypeOf(async function () {}).constructor;
const run = new AF('d', 'fetch', 'pushErr', 'tour', 'user', 'window', 'location', 'let seeded = null;\n' + src.slice(a, b) + '\nawait seedFromFile(d); return seeded;');
const files = {}; for (let i = 0; i < 7; i++) files['kit/f' + i + '.js'] = 'x'.repeat(10 + i) + 'é';
function pages(at) {
  const docs = Object.entries(files).map(([p, t]) => ({collection: 'kitfiles', id: p.replace('/', '~'), data: {path: p, text: t}}))
    .concat([{collection: 'parts', id: 'p', data: {title: 'P'}}, {collection: 'manifest', id: 'current', data: {version: '1'}}]);
  return {'seed.json': {schema: 'adp-seed/2', version: '3', by: 'catalog', at, packs: ['seed/pack-001.json'], unpack: 'kitfiles'}, 'seed/pack-001.json': {docs}};
}
function world(at, opts) {
  opts = opts || {};
  const store = new Map(opts.store || []), order = [], errs = [], pubs = [], reloads = [];
  const served = pages(at);
  const fetch = async p => ({ok: p in served, status: p in served ? 200 : 404, json: async () => JSON.parse(JSON.stringify(served[p]))});
  const d = {doc: p => ({get: async () => ({exists: store.has(p), data: () => store.get(p)}), set: async x => { order.push(p); store.set(p, JSON.parse(JSON.stringify(x))); }})};
  const window = {claude: {use: async n => n === 'artifact' ? {publish: async map => {
    const n2 = Object.keys(map).length;
    if (opts.limit && n2 > opts.limit) { const e = new Error('too big'); e.code = 'too_large'; throw e; }
    pubs.push(map); order.push('publish:' + n2);
  }} : null}};
  const tour = () => ({step() {}, progress() {}, done() {}, fail(w) { errs.push('tour fail: ' + w); }});
  const location = {reload() { reloads.push(1); }};
  return {store, order, errs, pubs, reloads, go: () => run(d, fetch, e => errs.push(String(e)), tour, {id: 'u1'}, window, location)};
}
(async () => {
  const out = {};
  // 1. first open: the files are published before the db is written, none of them is a db doc
  const w1 = world('2026-01-01T00:00:00Z'); await w1.go(); await new Promise(r => setTimeout(r, 1000));
  out.first = {errs: w1.errs, published: Object.assign({}, ...w1.pubs), calls: w1.pubs.length, publishBeforeWrites: w1.order.findIndex(x => x.startsWith('publish')) < w1.order.indexOf('parts/p'),
    kitDocs: [...w1.store.keys()].filter(k => k.startsWith('kitfiles')), manifestLast: w1.order.filter(x => !x.startsWith('publish') && x !== 'status/seed' && x !== 'status/unpack').slice(-1)[0],
    status: w1.store.get('status/unpack'), reloads: w1.reloads.length};
  // 2. the next open of the same seed: nothing to unpack
  const w2 = world('2026-01-01T00:00:00Z', {store: w1.store}); await w2.go();
  out.same = {published: w2.pubs.length, errs: w2.errs};
  // 3. a new seed stamp: unpacked again, one What changed record, the db is not re-seeded
  const w3 = world('2026-02-02T00:00:00Z', {store: w1.store}); await w3.go(); await new Promise(r => setTimeout(r, 1000));
  out.newer = {published: Object.keys(Object.assign({}, ...w3.pubs)).length, errs: w3.errs, changes: [...w3.store.keys()].filter(k => k.startsWith('changes/u-')), status: w3.store.get('status/unpack'), partsWritten: w3.order.includes('parts/p'), reloads: w3.reloads.length};
  // 4. a service that calls a big chunk too_large: the chunk is halved until it goes through
  const w4 = world('2026-03-03T00:00:00Z', {limit: 2}); await w4.go(); await new Promise(r => setTimeout(r, 1000));
  out.small = {errs: w4.errs, published: Object.keys(Object.assign({}, ...w4.pubs)).length, biggest: Math.max(...w4.pubs.map(m => Object.keys(m).length))};
  console.log(JSON.stringify(out));
})().catch(e => { console.error(e); process.exit(1); });
"""


@unittest.skipUnless(NODE, 'node is not installed')
class Unpack(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        d = tempfile.mkdtemp()
        cls.addClassCleanup(shutil.rmtree, d, True)
        p = os.path.join(d, 'unpack.js')
        with open(p, 'w', encoding='utf-8') as f:
            f.write(SCRIPT)
        r = subprocess.run([NODE, p, ADPJS], capture_output=True, text=True, timeout=60)
        if r.returncode:
            raise AssertionError(r.stderr[-1500:])
        cls.out = json.loads(r.stdout)

    def test_the_first_open_publishes_the_files_before_it_writes_the_db(self):
        o = self.out['first']
        self.assertEqual(o['errs'], [])
        self.assertEqual(sorted(o['published']), ['kit/f%d.js' % i for i in range(7)])
        self.assertTrue(o['publishBeforeWrites'])
        self.assertEqual(o['kitDocs'], [])           # the files are not db docs
        self.assertEqual(o['manifestLast'], 'manifest/current')
        self.assertEqual((o['status']['state'], o['status']['at'], o['status']['files']), ('done', '2026-01-01T00:00:00Z', 7))
        self.assertEqual(o['reloads'], 1)

    def test_the_same_seed_is_not_unpacked_twice(self):
        self.assertEqual(self.out['same'], {'published': 0, 'errs': []})

    def test_a_new_seed_stamp_unpacks_again_and_is_listed_in_what_changed(self):
        o = self.out['newer']
        self.assertEqual((o['published'], o['errs']), (7, []))
        self.assertEqual(len(o['changes']), 1)
        self.assertEqual(o['status']['at'], '2026-02-02T00:00:00Z')
        self.assertFalse(o['partsWritten'])          # the db is not seeded again
        self.assertEqual(o['reloads'], 1)

    def test_a_chunk_the_service_calls_too_large_is_halved(self):
        o = self.out['small']
        self.assertEqual((o['errs'], o['published']), ([], 7))
        self.assertLessEqual(o['biggest'], 2)


if __name__ == '__main__':
    unittest.main()

"""`bundle`, `import-plan`, `import-ack` with the Claude adapter, on the seed docs of a real `new` project (no hand-made records). No network."""
import glob, json, os, signal, subprocess, sys

from test_commands import Cmd, URL


class BundleTests(Cmd):
    def run_adp(self, *args, cwd=None, stdin=None):      # every process in its own group, killed after 8 s
        env = {k: v for k, v in os.environ.items() if k != 'ADP_HOST'} | {'HOME': self.home}
        p = subprocess.Popen([sys.executable, '-I', self.adp, *args], cwd=cwd or self.cwd, env=env, text=True, start_new_session=True,
                             stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try: out, err = p.communicate('' if stdin is None else stdin, timeout=8)
        except subprocess.TimeoutExpired:
            os.killpg(p.pid, signal.SIGKILL); p.communicate(); raise
        return subprocess.CompletedProcess(p.args, p.returncode, out, err)

    def bundle(self, docs, name):
        return self.ok('bundle', self.write_json(name + '.json', docs), self.p(name), '--host', 'claude', '--artifact', 'src', '--version', 'v1')

    def src(self):      # the seed docs of a real `new` project, as a source's reads returned them
        return [{**x, 'revision': 1} for f in sorted(glob.glob(os.path.join(self.new_project(), 'seed', 'pack-*.json'))) for x in json.load(open(f))['docs']]

    def plan(self, bundle, target, host='claude', art=URL):
        r = self.run_adp('import-plan', self.p(bundle), self.write_json('t.json', target), '--host', host, '--artifact', art)
        return r.returncode, json.loads(r.stdout or '{}')

    def ack(self, plan, text=None):      # the envelope the agent saves after running the plan's calls
        got = [{'call': c, 'result': text or ''.join(f'- set "{k.rsplit("/", 1)[0]}"/"{k.rsplit("/", 1)[1]}" (version 1)\n' for k in c['keys'])} for c in plan['calls']]
        r = self.run_adp('import-ack', self.write_json('p.json', plan), self.write_json('r.json', got), '--host', 'claude', '--raw')
        return r.returncode, json.loads(r.stdout)

    def test_create_repeat_edit_conflict_and_rejected_write(self):
        src = self.src(); n = self.bundle(src, 'b1')['docs']
        idx = json.load(open(self.p('b1', 'seed.json')))
        self.assertEqual((idx['schema'], idx['source']['host'], len(idx['revisions'])), ('adp-seed/2', 'claude', n))
        rc, plan = self.plan('b1', [])      # empty target: everything is created, no pin on a create
        self.assertEqual((rc, plan['counts']['create']), (0, n))
        self.assertTrue(all('if_version' not in w for c in plan['calls'] for w in c['args']['writes']))
        rc, ack = self.ack(plan)
        rec = ack['record'][0]['args']['writes'][0]
        self.assertEqual((rc, ack['failed'], rec['collection'], len(rec['data']['records'])), (0, [], 'imports', n))
        tgt = [dict(x) for x in src] + [{'collection': 'imports', 'id': rec['doc_id'], 'data': rec['data'], 'revision': 1}]
        rc, plan = self.plan('b1', tgt)      # repeat: nothing to write
        self.assertEqual((rc, plan['counts']['skip'], plan['calls']), (0, n, []))
        edit = lambda docs, v: [{**x, 'data': {**x['data'], 'edited': v}} if i == 0 else x for i, x in enumerate(docs)]
        self.bundle(edit(src, 'src'), 'b2'); key = f"{src[0]['collection']}/{src[0]['id']}"
        rc, plan = self.plan('b2', tgt)      # the source changed, the target did not: one pinned replace
        w = plan['calls'][0]['args']['writes']
        self.assertEqual((rc, plan['counts']['replace'], w[0]['if_version']), (0, 1, 1))
        rc, ack = self.ack(plan, 'db write failed (version_mismatch): nothing was written')      # a rejected write is not recorded
        self.assertEqual((rc, ack['failed'][0]['outcome']), (2, 'rejected'))
        self.assertEqual(ack['record'][0]['args']['writes'][0]['data']['records'][key], rec['data']['records'][key])
        rc, plan = self.plan('b1', edit(tgt, 'target'))      # the target changed, the source did not: kept
        self.assertEqual((rc, plan['counts']['skip'], next(o['class'] for o in plan['ops'] if o['key'] == key)), (0, n, 'theirs'))
        rc, plan = self.plan('b2', edit(tgt, 'target'))      # both changed: held, nothing to write
        self.assertEqual((rc, plan['held'], 'calls' in plan), (2, [key], False))

    def test_reads_must_cover_the_plan_and_an_absent_snapshot_guards_the_create(self):
        src = self.src(); n = self.bundle(src, 'b1')['docs']
        raw = self.write_json('raw.json', [{'call': {'collection': 'parts'}, 'result': 'No documents matched in collection "parts"'}])      # one collection of many
        r = self.run_adp('import-plan', self.p('b1'), raw, '--host', 'claude', '--artifact', URL, '--raw')
        self.assertEqual(r.returncode, 1); self.assertIn('does not cover', r.stderr)
        r = self.run_adp('import-plan', self.p('b1'), '--host', 'sites', '--artifact', 'roundtrip')      # named records: one read per bundle doc plus imports/<source>
        self.assertEqual((r.returncode, len(json.loads(r.stdout)['reads'])), (2, n + 1))
        gone = [{'collection': x['collection'], 'id': x['id'], 'exists': False, 'revision': 7} for x in src] + [{'collection': 'imports', 'id': 'claude-src', 'exists': False, 'revision': 3}]
        rc, plan = self.plan('b1', gone, 'sites', 'roundtrip')      # each create carries its own absent snapshot's native revision, never zero
        self.assertEqual((rc, {o['guard'] for o in plan['ops']}, {c['args']['expectedRevision'] for c in plan['calls']}), (0, {7}, {7}))
        self.assertEqual(self.plan('b1', gone[1:], 'sites', 'roundtrip')[0], 1)      # one read missing: refused, not planned

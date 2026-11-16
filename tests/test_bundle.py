"""`bundle`, `import-plan`, `import-ack` with the Claude adapter, on the seed docs of a real `new` project (no hand-made records). No network."""
import glob, hashlib, json, os, signal, subprocess, sys

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
        r = self.run_adp('import-ack', self.write_json('p.json', plan), self.write_json('r.json', got), '--host', 'claude', '--raw', '--by', 'tester')      # --raw takes no value: what follows it is still read
        return r.returncode, json.loads(r.stdout or '{}')

    def test_create_repeat_edit_conflict_and_rejected_write(self):
        src = self.src(); n = self.bundle(src, 'b1')['docs']
        idx = json.load(open(self.p('b1', 'seed.json')))
        self.assertEqual((idx['schema'], idx['source']['host'], len(idx['revisions'])), ('adp-seed/2', 'claude', n))
        rc, plan = self.plan('b1', [])      # empty target: everything is created, no pin on a create
        self.assertEqual((rc, plan['counts']['create']), (0, n))
        self.assertTrue(all('if_version' not in w for c in plan['calls'] for w in c['args']['writes']))
        last = [w['collection'] + '/' + w['doc_id'] for c in plan['calls'] for w in c['args']['writes']][-1]      # the truth marker is written last, and the agent is told to stop before it
        self.assertEqual((last, plan['order']['last']), ('manifest/current', 'manifest/current'))
        self.assertTrue(self.ack(plan, '- set "manifest"/"current" (version 1)\ndb write failed: nothing was written')[1]['warnings'])      # applied next to a failed record: flagged
        rc, ack = self.ack(plan)
        rec = ack['record'][0]['args']['writes'][0]
        self.assertEqual((rc, ack['failed'], rec['collection'], len(rec['data']['records']), ack['applied']), (0, [], 'imports', n, n))
        hist = ack['record'][0]['args']['writes'][1]      # the confirmed import also leaves one changes/ entry naming its records
        self.assertEqual((hist['collection'], hist['doc_id'][:2], len(hist['data']['data']) - 1, hist['data']['by']), ('changes', 'd-', n, 'tester'))
        tgt = [dict(x) for x in src] + [{'collection': 'imports', 'id': rec['doc_id'], 'data': rec['data'], 'revision': 1}]
        rc, plan = self.plan('b1', tgt)      # repeat: nothing to write
        self.assertEqual((rc, plan['counts']['skip'], plan['calls']), (0, n, []))
        edit = lambda docs, v: [{**x, 'data': {**x['data'], 'edited': v}} if i == 0 else x for i, x in enumerate(docs)]
        self.bundle(edit(src, 'src'), 'b2'); key = f"{src[0]['collection']}/{src[0]['id']}"
        rc, plan = self.plan('b2', tgt)      # the source changed, the target did not: one pinned replace
        w = plan['calls'][0]['args']['writes']
        self.assertEqual((rc, plan['counts']['replace'], w[0]['if_version']), (0, 1, 1))
        rc, ack = self.ack(plan, 'db write failed (version_mismatch): nothing was written')      # a rejected write is not recorded
        self.assertEqual((rc, ack['failed'][0]['outcome'], ack['applied']), (2, 'rejected', 0))      # a failed replace of an already-recorded key is not counted applied
        self.assertEqual(['changes' in w['collection'] for w in ack['record'][0]['args']['writes']], [False])      # and leaves no history entry
        self.assertEqual(ack['record'][0]['args']['writes'][0]['data']['records'][key], rec['data']['records'][key])
        self.assertEqual(self.ack(plan, 'db batch write failed (version_mismatch)')[1]['failed'][0]['outcome'], 'rejected')      # the batch tool's own wording, as seen live
        rc, plan = self.plan('b1', edit(tgt, 'target'))      # the target changed, the source did not: kept
        self.assertEqual((rc, plan['counts']['skip'], next(o['class'] for o in plan['ops'] if o['key'] == key)), (0, n, 'theirs'))
        rc, plan = self.plan('b2', edit(tgt, 'target'))      # both changed: held, nothing to write
        self.assertEqual((rc, plan['held'], 'calls' in plan), (2, [key], False))

    def test_a_return_trip_uses_the_bundle_it_came_from_as_its_base(self):
        src = self.src(); self.bundle(src, 'b1'); key = f"{src[0]['collection']}/{src[0]['id']}"
        edit = [{**x, 'data': {**x['data'], 'edited': 'on sites'}} if i == 0 else x for i, x in enumerate(src)]
        self.ok('bundle', self.write_json('e.json', edit), self.p('b2'), '--host', 'sites', '--artifact', 'shell', '--version', '4')      # the other host's export of the same records
        rc, plan = self.plan('b2', src)      # this target never imported from that host: no base, so the changed record is held, not guessed
        self.assertEqual((rc, plan['held']), (2, [key]))
        r = self.run_adp('import-plan', self.p('b2'), self.p('t.json'), '--host', 'claude', '--artifact', URL, '--base', self.p('b1'))
        plan = json.loads(r.stdout)      # with the bundle it came from as the base the edit is ours to apply: one pinned replace, the rest skipped
        self.assertEqual((r.returncode, plan['counts']['replace'], plan['counts']['skip'], plan['calls'][0]['args']['writes'][0]['if_version']), (0, 1, plan['bundle']['docs'] - 1, 1))
        r = self.run_adp('import-plan', self.p('b1'), self.write_json('e.json', []), '--host', 'claude', '--artifact', URL, '--only', 'parts')      # a selective import: the rest is the other host's own, planned and held on nothing
        self.assertEqual(({o['key'].split('/')[0] for o in json.loads(r.stdout)['ops']}, json.loads(r.stdout)['only']), ({'parts'}, ['parts']))

    def test_reads_must_cover_the_plan_and_an_absent_snapshot_guards_the_create(self):
        src = self.src(); n = self.bundle(src, 'b1')['docs']
        raw = self.write_json('raw.json', [{'call': {'collection': 'parts'}, 'result': 'No documents matched in collection "parts"'}])      # one collection of many
        r = self.run_adp('import-plan', self.p('b1'), raw, '--host', 'claude', '--artifact', URL, '--raw')
        self.assertEqual(r.returncode, 1); self.assertIn('does not cover', r.stderr)
        r = self.run_adp('bundle', raw, self.p('b3'), '--host', 'claude', '--artifact', 'src', '--raw')      # an export that read one collection must not look complete
        self.assertEqual(r.returncode, 1); self.assertIn('does not cover', r.stderr)
        full = [{'call': {'collection': c}, 'result': '{"id":"r-1","data":{},"version":1}' if c == 'requests' else 'No documents matched'} for c in ('manifest', 'parts', 'content', 'changes', 'decisions', 'config', 'agents', 'incoming', 'requests')]
        r = self.run_adp('bundle', self.write_json('full.json', full), self.p('b4'), '--host', 'claude', '--artifact', 'src', '--raw')      # replies live in requests/<rid>/turns: asked for, not dropped
        self.assertEqual((r.returncode, json.loads(r.stdout)['reads'][0]['collection']), (2, 'requests/r-1/turns'))
        r = self.run_adp('import-plan', self.p('b1'), '--host', 'sites', '--artifact', 'roundtrip')      # named records: one read per bundle doc plus imports/<source>
        self.assertEqual((r.returncode, len(json.loads(r.stdout)['reads'])), (2, n + 1))
        gone = [{'collection': x['collection'], 'id': x['id'], 'exists': False, 'revision': 7} for x in src] + [{'collection': 'imports', 'id': 'claude-src', 'exists': False, 'revision': 3}]
        rc, plan = self.plan('b1', gone, 'sites', 'roundtrip')      # each create carries its own absent snapshot's native revision, never zero
        self.assertEqual((rc, {o['guard'] for o in plan['ops']}, {c['args']['expectedRevision'] for c in plan['calls']}), (0, {7}, {7}))
        self.assertEqual(self.plan('b1', gone[1:], 'sites', 'roundtrip')[0], 1)      # one read missing: refused, not planned

    def test_work_claim_progress_and_evidence_gate(self):
        row = {'collection':'requests','id':'r-work','revision':1,'data':{'text':'Review intro','scope':{'kind':'part','id':'intro'},'status':'open','opaque':{'keep':True}}}
        def work(action, record, *extra):
            r = self.run_adp('work', self.write_json('work-read.json', [record]), '--host','sites','--artifact','work-fixture','--path','requests/r-work','--action',action,'--by','codex',*extra)
            return r, json.loads(r.stdout or '{}')
        r, claimed = work('claim',row)
        self.assertEqual(r.returncode,0,r.stderr)
        call = claimed['calls'][0]['args']; token = claimed['leaseToken']
        self.assertEqual((call['expectedRevision'],call['data']['state'],call['data']['opaque']),(1,'working',{'keep':True}))
        active = {**row,'revision':2,'data':call['data']}
        self.assertNotEqual(work('claim',active)[0].returncode,0)
        r, progress = work('progress',active,'--token',token,'--text','Checking deployed source')
        self.assertEqual(progress['calls'][0]['args']['data']['progress'][-1]['text'],'Checking deployed source')
        self.assertNotEqual(work('complete',active,'--token',token,'--text','Done')[0].returncode,0)
        receipt = self.write_json('work-evidence.json',{'checks':[{'name':'Readback','passed':True,'evidence':'Native content revision2 matches requested text'}]})
        r, done = work('complete',active,'--token',token,'--text','Verified intro','--receipt',receipt)
        self.assertEqual((r.returncode,done['calls'][0]['args']['data']['status']),(0,'done'))
        checkpoint = self.write_json('checkpoint.json',{'deploymentId':'dep-pending','stage':'deploying'})
        _, saved = work('checkpoint',active,'--token',token,'--text','Deployment submitted','--checkpoint',checkpoint)
        self.assertEqual(saved['calls'][0]['args']['data']['execution']['checkpoint']['deploymentId'],'dep-pending')
        reopened = {**active,'data':{**active['data'],'response':'Earlier answer'}}
        reply = {'checks':[{'name':'Reply readback','passed':True,'evidence':'Native turn1'}],'reply':{'path':'requests/r-work/turns/0001','exists':True,'revision':1,'data':{'by':'codex','text':'Follow-up answer','at':active['data']['execution']['claimedAt']}}}
        r, done = work('complete',reopened,'--token',token,'--text','Follow-up answer','--receipt',self.write_json('reply.json',reply))
        self.assertEqual((r.returncode,done['calls'][0]['args']['data']['response']),(0,'Earlier answer'))
        expired = {**active,'data':{**active['data'],'execution':{**active['data']['execution'],'leaseUntil':'2000-01-01T00:00:00Z'}}}
        self.assertEqual(work('claim',expired)[0].returncode,0)
        foreign = {**active,'data':{**active['data'],'execution':{**active['data']['execution'],'origin':{'host':'claude','artifact':'other'}}}}
        self.assertNotEqual(work('progress',foreign,'--token',token,'--text','Wrong host')[0].returncode,0)
        r, reclaimed = work('claim',foreign)
        self.assertEqual(r.returncode,0,r.stderr)
        self.assertEqual(reclaimed['calls'][0]['args']['data']['executionProvenance'][-1],foreign['data']['execution'])
        _, blocked = work('block',active,'--token',token,'--text','Needs input')
        self.assertEqual(blocked['calls'][0]['args']['data']['state'],'ack')
        claude = {**active,'data':{**active['data'],'execution':{**active['data']['execution'],'origin':{'host':'claude','artifact':'https://claude.ai/artifact/fixture'}}}}
        for url in ('https://claude.ai/artifact/fixture/', 'https://claude.ai/artifact/fixture#part', 'https://claude.ai/artifact/fixture?view=1'):
            r = self.run_adp('work',self.write_json('alias.json',[claude]),'--host','claude','--artifact',url,'--path','requests/r-work','--action','claim','--by','other')
            self.assertNotEqual(r.returncode,0,url)
        legacy = {**active,'data':{**active['data'],'execution':{k:v for k,v in active['data']['execution'].items() if k != 'origin'}}}
        self.assertNotEqual(work('claim',legacy)[0].returncode,0)
        self.assertTrue(work('inspect',foreign)[1]['foreign'])

    def test_publication_work_requires_approval_and_matching_receipts(self):
        data = {'status':'merged','files':[{'path':'index.html','content':'Published'}],'parts':[],'base':{'version':'old'}}
        row = {'collection':'incoming','id':'p-work','revision':1,'data':data}
        def run(action, record, *extra):
            return self.run_adp('work',self.write_json('publish-read.json',[record]),'--host','sites','--artifact','work-fixture','--path','incoming/p-work','--by','codex','--action',action,*extra)
        self.assertNotEqual(run('claim',row).returncode,0)
        data['publishRequest'] = {'by':'owner','inputHash':'sha256:'+hashlib.sha256(json.dumps({k:data[k] for k in ('files','parts','base')},sort_keys=True,separators=(',',':')).encode()).hexdigest()}
        claimed = json.loads(run('claim',row).stdout); active = {**row,'revision':2,'data':claimed['calls'][0]['args']['data']}; token=claimed['leaseToken']
        sha = hashlib.sha256(b'Published').hexdigest()
        receipt = {'checks':[{'name':'Deployed bytes','passed':True,'evidence':'Native readback'}], 'deployment':{'id':'dep-1','status':'succeeded','version_id':'v1','project_id':'site'},'source':{'commit_sha':'a'*40,'project_id':'site','version_id':'v1','shas':{'index.html':sha}},'readback':{'shas':{'index.html':sha}},'manifest':{'exists':True,'revision':2,'data':{'version':'dep-1','files':{'index.html':sha[:12]}}},'change':{'exists':True,'revision':1,'data':{'version':'dep-1'}}}
        bad = {**receipt,'deployment':{**receipt['deployment'],'status':'pending'}}
        self.assertNotEqual(run('complete',active,'--token',token,'--text','Published','--receipt',self.write_json('bad.json',bad)).returncode,0)
        result = run('complete',active,'--token',token,'--text','Published and verified','--receipt',self.write_json('verified.json',receipt))
        self.assertEqual((result.returncode,json.loads(result.stdout)['calls'][0]['args']['data']['status']),(0,'applied'))

"""Black-box tests of `gate`, `requests`, `record`, `ack`, `seed` and `propose`: what the usage text promises and what the commands
were observed to do in a throwaway project. No network: the remote side (Artifact listing, ArtifactData dump) is a fixture built from
the seed packs that `new` writes."""
from pathlib import Path
import glob, hashlib, json, os, shutil, subprocess, sys, unittest

from test_setup import Base
from unittest.mock import patch as patch_env

URL = 'https://claude.ai/artifact/test-artifact'
EDIT_FROM = 'data-part="home.welcome" data-comment-target>'
EDIT_TO = EDIT_FROM + 'EDITED'


ADP = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'plugins', 'artifacts-done-properly', 'skills', 'adp', 'scripts', 'adp.py')


class Cmd(Base):
    def setUp(self):
        super().setUp()
        self.adp = ADP                  # the real script: `new` needs the templates next to it
    def p(self, *parts):
        return os.path.join(self.cwd, *parts)

    def write_json(self, name, obj):
        path = self.p(name)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w') as f: json.dump(obj, f)
        return path

    def ok(self, *args, stdin=None):
        r = self.run_adp(*args, stdin=stdin)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        return json.loads(r.stdout)

    def run_adp(self, *args, cwd=None, stdin=None):
        env = {k: v for k, v in os.environ.items() if k != 'ADP_HOME'}
        env['HOME'] = self.home
        return subprocess.run([sys.executable, '-I', self.adp, *args], cwd=cwd or self.cwd, env=env, capture_output=True, text=True,
                              input='' if stdin is None else stdin)

    def new_project(self, name='proj'):
        self.ok('new', 'starter', name)
        return self.p(name)

    def edit(self, d, to=EDIT_TO):
        f = os.path.join(d, 'parts', 'app.js')
        s = Path(f).read_text()
        self.assertIn(EDIT_FROM, s)
        Path(f).write_text(s.replace(EDIT_FROM, to, 1))

    def docs_of(self, out):
        """every doc file a batch output names: {collection/doc_id: data}"""
        res = {}
        for batch in out['batches']:
            for w in batch:
                if 'file_path' in w:
                    res[f"{w['collection']}/{w['doc_id']}"] = json.loads(Path(w['file_path']).read_text())
        return res

    def writes_of(self, out):
        return [w for b in out['batches'] for w in b]

    def exported(self, name='proj'):
        """a project whose export came from a fake remote: the files and the seed docs of the project itself"""
        d = self.new_project(name)
        ad = d + '.adp'
        os.makedirs(os.path.join(ad, 'incoming'))
        shutil.copytree(d, os.path.join(ad, 'incoming', 'files'), ignore=shutil.ignore_patterns('seed', 'seed.json'))
        files = [{'path': os.path.relpath(os.path.join(b, n), os.path.join(ad, 'incoming', 'files')).replace(os.sep, '/'),
                  'sha256': hashlib.sha256(Path(os.path.join(b, n)).read_bytes()).hexdigest(), 'bytes': 1}
                 for b, _, ns in os.walk(os.path.join(ad, 'incoming', 'files')) for n in ns]
        Path(os.path.join(ad, 'listing.json')).write_text(json.dumps(files))
        docs = {}
        for pk in sorted(glob.glob(os.path.join(d, 'seed', 'pack-*.json'))):
            for x in json.loads(Path(pk).read_text())['docs']:
                docs.setdefault(x['collection'], []).append({'id': x['id'], 'data': x['data'], 'version': 1})
        self.docs = docs
        Path(os.path.join(ad, 'docs.json')).write_text(json.dumps(docs))
        out = self.ok('export', d, '--url', URL)
        self.assertEqual(out['next'], 'clean: nothing to send')
        return d

    def state(self, d):
        return json.loads(Path(d + '.adp/state.json').read_text())

    def save_state(self, d, st):
        Path(d + '.adp/state.json').write_text(json.dumps(st))


class SourceDriftTests(Cmd):
    def history(self):
        def git(*args):
            return subprocess.check_output(['git', '-C', self.cwd, *args], text=True, stderr=subprocess.PIPE, timeout=3).strip()
        git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.test')
        git('config', 'commit.gpgsign', 'false')
        for name in ('source.txt', 'dir/old.txt', 'unchanged.txt'):
            os.makedirs(os.path.dirname(self.p(name)), exist_ok=True)
            with open(self.p(name), 'w') as stream: stream.write('before')
        git('add', '.'); git('commit', '-qm', 'base'); base = git('rev-parse', 'HEAD')
        mapping = {'schema':'adp-source-map/1', 'sourceCommit':base, 'sections':[
            {'id':'intro','title':'Introduction','sources':[{'path':'source.txt'}]},
            {'id':'files','title':'Files','sources':['dir/']},
            {'id':'stable','sources':['unchanged.txt']}]}
        return git, base, mapping

    def test_source_drift_cli_reports_sections_and_unmapped_files(self):
        git, base, mapping = self.history()
        path = self.write_json('map.json', mapping)
        self.assertEqual(self.ok('source-drift',path,'--repo',self.cwd)['status'],'current')
        with open(self.p('source.txt'),'w') as stream: stream.write('after')
        git('mv','dir/old.txt','dir/new name.txt')
        with open(self.p('uncovered.txt'),'w') as stream: stream.write('new')
        git('add','source.txt','dir','uncovered.txt'); git('commit','-qm','changed')
        args = ('source-drift',path,'--repo',self.cwd)
        result = self.ok(*args)
        sections = {s['id']:s for s in result['sections']}
        self.assertEqual(sections['intro']['changes'],[{'status':'M','path':'source.txt'}])
        self.assertEqual(sections['files']['changes'],[{'status':'A','path':'dir/new name.txt'},{'status':'D','path':'dir/old.txt'}])
        self.assertEqual(sections['stable']['status'],'current')
        self.assertEqual(result['unmappedChanges'],[{'status':'A','path':'uncovered.txt'}])
        self.assertEqual(self.run_adp(*args,'--strict').returncode,2)
        output = self.p('report.md')
        rendered = self.run_adp(*args,'--format','markdown','--out',output)
        self.assertEqual(rendered.returncode,0,rendered.stderr)
        with open(output) as stream: self.assertEqual(stream.read(),rendered.stdout)
        self.assertIn('Introduction',rendered.stdout); self.assertIn('dir/new name.txt',rendered.stdout)
        with open(path) as stream: self.assertEqual(json.load(stream)['sourceCommit'],base)
        mapping['sections'][0]['sourceCommit'] = git('rev-parse','HEAD')
        per_section = self.ok('source-drift','-','--repo',self.cwd,stdin=json.dumps(mapping))
        self.assertEqual(per_section['sections'][0]['status'],'current')
        self.assertEqual(per_section['sections'][1]['status'],'needs_review')

    def test_source_drift_refuses_false_clean_evidence(self):
        git, base, mapping = self.history()
        for patch in [{'sourceCommit':'0'*40}, {'sourceCommit':'HEAD'}, {'sections':[]},
                      {'sections':[{'id':'x','sources':['../outside']}]},
                      {'sections':[{'id':'x','sources':['absent.txt']}]},
                      {'sections':[mapping['sections'][0],mapping['sections'][0]]}]:
            result = self.run_adp('source-drift','-','--repo',self.cwd,stdin=json.dumps({**mapping,**patch}))
            self.assertEqual(result.returncode,1,result.stderr)
            self.assertEqual(json.loads(result.stdout)['status'],'error')
        path = self.write_json('map.json',mapping)
        self.assertEqual(self.run_adp('source-drift',path,'--repo',self.cwd,'--out',path).returncode,1)
        with open(path) as stream: self.assertEqual(json.load(stream),mapping)
        alias=self.p('map-alias.json'); os.link(path,alias)
        self.assertEqual(self.run_adp('source-drift',path,'--repo',self.cwd,'--out',alias).returncode,1)
        with open(path) as stream: self.assertEqual(json.load(stream),mapping)
        git('checkout','--orphan','other'); git('rm','-rf','.'); git('commit','--allow-empty','-qm','unrelated')
        result = self.run_adp('source-drift','-','--repo',self.cwd,stdin=json.dumps(mapping))
        self.assertEqual(result.returncode,1)
        self.assertIn('ancestor',json.loads(result.stdout)['error'])

    def test_source_coverage_payload_distinguishes_healthy_stale_missing(self):
        git, base, mapping = self.history()
        mapping['sections']=mapping['sections'][:2]
        initial=self.ok('source-drift','-','--repo',self.cwd,'--format','coverage',stdin=json.dumps(mapping))
        self.assertEqual(initial['missingFiles'],['unchanged.txt'])
        self.assertEqual(initial['summary'],{'healthy':2,'stale':0,'missing':1,'total':3})
        with open(self.p('source.txt'),'w') as stream: stream.write('after')
        git('rm','dir/old.txt'); git('add','source.txt'); git('commit','-qm','changes')
        args=('source-drift','-','--repo',self.cwd,'--format','coverage')
        payload=self.ok(*args,stdin=json.dumps(mapping))
        self.assertEqual(payload['schema'],'adp-source-coverage/1')
        self.assertEqual([s['status'] for s in payload['sections']],['stale','stale'])
        self.assertEqual(payload['summary'],{'healthy':0,'stale':1,'missing':1,'total':2})
        self.assertEqual(payload['missingFiles'],['unchanged.txt'])
        self.assertEqual(payload['files'][0]['chapters'],['intro'])
        self.assertEqual(payload['sections'][0]['sources'][0]['changes'],[{'status':'M','path':'source.txt'}])
        mapping['sections'][0]['sourceCommit']='0'*40
        unavailable=self.run_adp(*args,stdin=json.dumps(mapping))
        self.assertEqual(unavailable.returncode,1); self.assertEqual(json.loads(unavailable.stdout)['status'],'error')
        mapping['sections'][0]['sourceCommit']=base
        mapping['sourceCommit']='0'*40
        failed=self.run_adp(*args,stdin=json.dumps(mapping))
        self.assertEqual(failed.returncode,1); self.assertEqual(json.loads(failed.stdout)['status'],'error')

    def test_source_drift_does_not_fetch_missing_partial_clone_objects(self):
        git, base, mapping = self.history()
        git('config','uploadpack.allowFilter','true')
        filtered=self.p('filtered');trace=self.p('git-trace')
        from pathlib import Path
        subprocess.run(['git','clone','-q','--filter=tree:0','--no-checkout',Path(self.cwd).as_uri(),filtered],check=True,capture_output=True,timeout=3)
        path=self.write_json('map.json',mapping)
        with patch_env.dict(os.environ,{'GIT_TRACE':trace}):
            result=self.run_adp('source-drift',path,'--repo',filtered)
        self.assertEqual(result.returncode,1,result.stderr)
        self.assertEqual(json.loads(result.stdout)['status'],'error')
        with open(trace) as stream:self.assertFalse(any(' fetch ' in line for line in stream))


class SeedTests(Cmd):
    def test_usage_without_dir(self):
        r = self.run_adp('seed')
        self.assertEqual(r.returncode, 1)
        self.assertIn('usage: adp.py seed DIR', r.stderr)

    def test_writes_index_and_packs(self):
        d = self.new_project()
        shutil.rmtree(os.path.join(d, 'seed'))
        os.remove(os.path.join(d, 'seed.json'))
        out = self.ok('seed', d, '--by', 'tester', '--version', '7', '--summary', 'first', '--role', 'writer')
        self.assertTrue(out['written'])
        self.assertEqual(out['packs'], ['seed/pack-001.json'])
        self.assertEqual(set(out['collections']), {'parts', 'content', 'changes', 'agents', 'manifest'})
        idx = json.loads(Path(os.path.join(d, 'seed.json')).read_text())
        self.assertEqual((idx['schema'], idx['by'], idx['version'], idx['summary'], idx['role']), ('adp-seed/2', 'tester', '7', 'first', 'writer'))
        self.assertEqual(idx['docs'], out['docs'])
        pack = json.loads(Path(os.path.join(d, 'seed', 'pack-001.json')).read_text())
        self.assertEqual((pack['schema'], pack['pack'], pack['of']), ('adp-seed/2', 1, 1))
        self.assertEqual(len(pack['docs']), out['docs'])
        last = pack['docs'][-1]
        self.assertEqual((last['collection'], last['id']), ('manifest', 'current'))
        self.assertEqual(pack['docs'][0]['collection'], 'parts')
        agents = [x for x in pack['docs'] if x['collection'] == 'agents']
        self.assertEqual([x['id'] for x in agents], ['tester'])
        self.assertEqual(agents[0]['data']['role'], 'writer')
        self.assertEqual([x['data']['summary'] for x in pack['docs'] if x['collection'] == 'changes'], ['first'])

    def test_rerun_unchanged_does_not_rewrite(self):
        d = self.new_project()
        before = Path(os.path.join(d, 'seed.json')).read_text()
        out = self.ok('seed', d)
        self.assertFalse(out['written'])
        self.assertEqual(Path(os.path.join(d, 'seed.json')).read_text(), before)

    def test_dry_run_writes_nothing(self):
        d = self.new_project()
        shutil.rmtree(os.path.join(d, 'seed'))
        os.remove(os.path.join(d, 'seed.json'))
        out = self.ok('seed', d, '--dry-run')
        self.assertEqual(set(out), {'collections', 'docs', 'batches', 'skipped_empty', 'bytes'})
        self.assertEqual(out['batches'], 1)
        self.assertFalse(os.path.exists(os.path.join(d, 'seed.json')))
        self.assertFalse(os.path.exists(os.path.join(d, 'seed')))
        self.assertFalse(os.path.exists(d + '.adp'))

    def test_batches_are_set_writes_manifest_last(self):
        d = self.new_project()
        out = self.ok('seed', d, '--batches', '--out', self.p('b'))
        writes = self.writes_of(out)
        self.assertTrue(all(w['op'] == 'set' and os.path.isfile(w['file_path']) for w in writes))
        self.assertEqual((writes[-1]['collection'], writes[-1]['doc_id']), ('manifest', 'current'))
        self.assertTrue(all(len(b) <= 50 for b in out['batches']))
        self.assertEqual(out['docs_dir'], self.p('b'))
        self.assertEqual(len(writes), json.loads(Path(os.path.join(d, 'seed.json')).read_text())['docs'])

    def test_batches_dry_run_counts_only(self):
        d = self.new_project()
        out = self.ok('seed', d, '--batches', '--dry-run', '--out', self.p('b'))
        self.assertEqual(set(out), {'collections', 'batches', 'skipped_empty', 'bytes'})
        self.assertFalse(os.path.exists(self.p('b')))

    def test_data_file_adds_docs_and_merges_into_generated(self):
        d = self.new_project()
        data = self.write_json('data.json', [{'collection': 'notes', 'id': 'n1', 'data': {'a': 1}},
                                             {'collection': 'changes', 'id': '000001', 'data': {'summary': 'custom'}}])
        out = self.ok('seed', d, '--data', data)
        self.assertTrue(out['written'])
        self.assertEqual(out['collections']['notes'], 1)
        docs = [x for pk in glob.glob(os.path.join(d, 'seed', 'pack-*.json')) for x in json.loads(Path(pk).read_text())['docs']]
        self.assertIn({'a': 1}, [x['data'] for x in docs if (x['collection'], x['id']) == ('notes', 'n1')])
        self.assertEqual([x['data']['summary'] for x in docs if x['collection'] == 'changes'], ['custom'])
        again = self.ok('seed', d)                       # --data docs given before are kept
        self.assertFalse(again['written'])
        self.assertEqual(again['collections']['notes'], 1)

    def test_data_directory(self):
        d = self.new_project()
        self.write_json('dd/notes/n2.json', {'b': 2})
        out = self.ok('seed', d, '--data', self.p('dd'))
        self.assertEqual(out['collections']['notes'], 1)

    def test_bad_data_refused(self):
        d = self.new_project()
        r = self.run_adp('seed', d, '--data', self.p('missing.json'))
        self.assertEqual(r.returncode, 1)
        self.assertIn('no file or directory', r.stderr)
        bad = self.write_json('bad.json', {'x': 1})
        r = self.run_adp('seed', d, '--data', bad)
        self.assertEqual(r.returncode, 1)
        self.assertIn('a list of docs', r.stderr)


class RecordTests(Cmd):
    USAGE = 'usage: adp.py record OLD.json DIR --seq N --by NAME --summary S'

    def setUp(self):
        super().setUp()
        self.d = self.new_project()
        self.old = self.p('old.json')
        Path(self.old).write_text(self.run_adp('manifest', self.d).stdout)

    def record(self, *extra):
        return self.run_adp('record', self.old, self.d, '--seq', '2', '--by', 'bob', '--summary', 'changed', '--out', self.p('rec'), *extra)

    def test_usage_errors(self):
        for args in ((), ('x.json', 'd'), ('x.json', 'd', '--seq', '2'), ('x.json', 'd', '--summary', 's'), ('x.json',)):
            r = self.run_adp('record', *args)
            self.assertEqual(r.returncode, 1, args)
            self.assertIn(self.USAGE, r.stderr)

    def test_nothing_changed_records_change_agent_and_manifest(self):
        out = self.ok('record', self.old, self.d, '--seq', '2', '--by', 'bob', '--summary', 'nothing', '--out', self.p('rec'))
        self.assertEqual([(w['op'], w['collection'], w['doc_id']) for w in self.writes_of(out)],
                         [('set', 'changes', '000002'), ('set', 'agents', 'bob'), ('set', 'manifest', 'current')])
        docs = self.docs_of(out)
        self.assertEqual(docs['changes/000002']['parts'], [])
        self.assertEqual(docs['agents/bob']['holds'], [])
        self.assertEqual(out['needs_pin'], ['manifest/current'])
        self.assertEqual(docs['manifest/current']['parts'], json.loads(self.run_adp('manifest', self.d).stdout)['parts'])

    def test_changed_part_and_its_parent_are_updated(self):
        self.edit(self.d)
        out = self.ok('record', self.old, self.d, '--seq', '2', '--by', 'bob', '--summary', 'changed', '--version', 'v2',
                      '--threads', 't1,t2', '--out', self.p('rec'))
        old = json.loads(Path(self.old).read_text())['parts']
        new = json.loads(self.run_adp('manifest', self.d).stdout)['parts']
        changed = sorted(k for k in new if old.get(k) != new[k] and not k.startswith('_rest:'))
        self.assertIn('home.welcome', changed)
        docs = self.docs_of(out)
        ops = {(w['op'], w['collection'], w['doc_id']) for w in self.writes_of(out)}
        for k in changed:
            self.assertIn(('update', 'parts', k), ops)
            self.assertEqual((docs['parts/' + k]['hash'], docs['parts/' + k]['version'], docs['parts/' + k]['by']), (new[k], 'v2', 'bob'))
        ch = docs['changes/000002']
        self.assertEqual((ch['version'], ch['by'], ch['summary'], ch['threads']), ('v2', 'bob', 'changed', ['t1', 't2']))
        self.assertEqual({m['id']: (m['from'], m['to']) for m in ch['parts']}, {k: (old[k], new[k]) for k in changed})
        for t in ('t1', 't2'):
            self.assertIn(('update', 'threads', t), ops)
            self.assertEqual(docs['threads/' + t], {'status': 'done', 'holder': '', 'done_in': 'v2'})
        writes = self.writes_of(out)
        self.assertEqual((writes[-1]['collection'], writes[-1]['doc_id']), ('manifest', 'current'))
        self.assertEqual(set(out['needs_pin']), {f'parts/{k}' for k in changed} | {'threads/t1', 'threads/t2', 'manifest/current'})

    def test_clears_only_the_agents_own_holds(self):
        self.edit(self.d)
        out = self.ok('record', self.old, self.d, '--seq', '2', '--by', 'bob', '--summary', 's', '--out', self.p('rec'))
        docs = self.docs_of(out)
        self.assertEqual(docs['parts/home.welcome']['holder'], '')          # edited by bob: its hold is cleared
        self.assertNotIn('holder', docs['parts/home'])                     # changed only through its child: the holder stays
        holds = self.write_json('holds.json', {'home.welcome': 'carol', 'home': 'bob'})
        out = self.ok('record', self.old, self.d, '--seq', '2', '--by', 'bob', '--summary', 's', '--holds', holds, '--out', self.p('rec2'))
        docs = self.docs_of(out)
        self.assertNotIn('holder', docs['parts/home.welcome'])             # held by carol
        self.assertEqual(docs['parts/home']['holder'], '')                 # held by bob

    def test_pins_become_if_version(self):
        self.edit(self.d)
        pins = self.write_json('pins.json', {'manifest/current': 4, 'parts/home.welcome': 2})
        out = self.ok('record', self.old, self.d, '--seq', '2', '--by', 'bob', '--summary', 's', '--pins', pins, '--out', self.p('rec'))
        by_id = {f"{w['collection']}/{w['doc_id']}": w for w in self.writes_of(out)}
        self.assertEqual(by_id['manifest/current']['if_version'], 4)
        self.assertEqual(by_id['parts/home.welcome']['if_version'], 2)
        self.assertNotIn('manifest/current', out['needs_pin'])
        self.assertNotIn('parts/home.welcome', out['needs_pin'])

    def test_seq_is_zero_padded(self):
        out = self.ok('record', self.old, self.d, '--seq', '12', '--by', 'bob', '--summary', 's', '--out', self.p('rec'))
        self.assertIn('changes/000012', self.docs_of(out))

    def test_old_manifest_wrapped_in_data_is_accepted(self):
        self.edit(self.d)
        wrapped = self.write_json('wrapped.json', {'data': json.loads(Path(self.old).read_text()), 'version': 3})
        out = self.ok('record', wrapped, self.d, '--seq', '2', '--by', 'bob', '--summary', 's', '--out', self.p('rec'))
        self.assertIn('parts/home.welcome', self.docs_of(out))

    def test_added_and_removed_parts(self):
        f = os.path.join(self.d, 'parts', 'app.js')
        s = Path(f).read_text()
        added = '<!-- part:home.extra --><div data-part="home.extra"></div><!-- /part:home.extra -->'
        gone = '<!-- part:home.next -->'
        self.assertIn(gone, s)
        a, b = s.index(gone), s.index('<!-- /part:home.next -->') + len('<!-- /part:home.next -->')
        Path(f).write_text(s[:a] + added + s[b:])
        out = self.ok('record', self.old, self.d, '--seq', '2', '--by', 'bob', '--summary', 'swap', '--out', self.p('rec'))
        ops = {(w['op'], w['collection'], w['doc_id']) for w in self.writes_of(out)}
        self.assertIn(('set', 'parts', 'home.extra'), ops)
        self.assertIn(('delete', 'parts', 'home.next'), ops)
        docs = self.docs_of(out)
        self.assertEqual(docs['parts/home.extra']['summary'], 'added: swap')
        moved = {m['id']: m for m in docs['changes/000002']['parts']}
        self.assertEqual(moved['home.extra']['from'], '')
        self.assertEqual(moved['home.next']['to'], '')
        self.assertIn('parts/home.next', out['needs_pin'])

    def test_edit_locked_refused_with_exit_2(self):
        cfg = self.write_json('cfg.json', {'values': {'edit.locked': True, 'edit.reason': 'freeze'}})
        r = self.record('--config', cfg)
        self.assertEqual(r.returncode, 2)
        self.assertEqual(json.loads(r.stdout), {'error': 'locked', 'by': '', 'at': '', 'reason': 'freeze'})
        self.assertFalse(os.path.exists(self.p('rec')))

    def test_locked_parts_refused_unless_unlocked(self):
        self.edit(self.d)
        cfg = self.write_json('cfg.json', {'values': {'parts.locked': ['home']}})
        r = self.record('--config', cfg)
        self.assertEqual(r.returncode, 2)
        out = json.loads(r.stdout)
        self.assertEqual(out['error'], 'locked parts')
        self.assertEqual(out['parts'], ['home', 'home.welcome'])
        r = self.record('--config', cfg, '--unlock', 'home')
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_locked_prefix_matches_whole_segments(self):
        self.edit(self.d)
        cfg = self.write_json('cfg.json', {'values': {'parts.locked': ['hom']}})
        self.assertEqual(self.record('--config', cfg).returncode, 0)

    def test_require_hold(self):
        self.edit(self.d)
        cfg = self.write_json('cfg.json', {'values': {'edit.require-hold': True}})
        r = self.record('--config', cfg)
        self.assertEqual(r.returncode, 2)
        self.assertEqual(json.loads(r.stdout)['error'], 'unheld')
        self.assertIn('home.welcome', json.loads(r.stdout)['parts'])
        no = self.write_json('holds0.json', {})
        r = self.record('--config', cfg, '--holds', no)
        self.assertEqual((r.returncode, json.loads(r.stdout)), (2, {'error': 'unheld', 'parts': ['home.welcome']}))
        yes = self.write_json('holds.json', {'home.welcome': {'holder': 'bob'}})
        self.assertEqual(self.record('--config', cfg, '--holds', yes).returncode, 0)


class RequestsTests(Cmd):
    def setUp(self):
        super().setUp()
        self.dump = self.write_json('dump.json', [
            {'id': 'r1', 'version': 3, 'data': {'lane': 'edit', 'text': 'fix', 'by': 'u', 'at': '2026-01-02T00:00:00Z', 'scope': {'part': 'home'}, 'resolved': True}},
            {'id': 'r2', 'version': 1, 'data': {'lane': 'ask', 'text': 'q', 'at': '2026-01-01T00:00:00Z', 'state': 'working',
                                                'progress': [{'at': 'x', 'text': 'half'}], 'execution': {'actor': 'codex', 'state': 'working', 'leaseUntil': '2099-01-01T00:00:00Z', 'attempt': 2, 'token': 'secret', 'origin': {'host': 'sites', 'artifact': 's'}}}},
            {'id': 'r3', 'version': 2, 'data': {'status': 'done', 'lane': 'edit'}}])
        self.out = self.p('req')
        Path(self.p('resp.md')).write_text('the answer\n')

    def test_lists_open_requests_oldest_first(self):
        out = self.ok('requests', self.dump)
        self.assertEqual(out['count'], 2)
        self.assertEqual([r['id'] for r in out['open']], ['r2', 'r1'])
        r2, r1 = out['open']
        self.assertEqual((r2['state'], r2['last_progress'], r2['lane']), ('working', 'half', 'ask'))
        self.assertEqual((r1['state'], r1['scope'], r1['by'], r1['text'], r1['resolved'], r2['resolved']), ('queue', {'part': 'home'}, 'u', 'fix', True, False))      # a resolved thread is shown, and is not completion
        self.assertEqual((r2['lease'], r1['lease']), ({'actor': 'codex', 'state': 'working', 'until': '2099-01-01T00:00:00Z', 'attempt': 2, 'host': 'sites'}, None))      # the claim as recorded, with the host it was made on; its token is not shown
        self.assertIn('trailer', out)
        self.assertFalse(os.path.exists(os.path.join(self.home, '.adp', 'requests')))      # listing writes nothing

    def test_dump_shapes(self):
        as_map = self.write_json('map.json', {'r1': {'lane': 'edit', 'at': 'a'}, 'r2': {'lane': 'ask', 'at': 'b', 'status': 'done'}})
        self.assertEqual([r['id'] for r in self.ok('requests', as_map)['open']], ['r1'])
        wrapped = self.write_json('wrapped.json', {'documents': [{'doc_id': 'requests/r9', 'data': {'lane': 'edit'}}]})
        self.assertEqual([r['id'] for r in self.ok('requests', wrapped)['open']], ['r9'])

    def test_ack(self):
        out = self.ok('requests', self.dump, '--ack', 'r1', '--by', 'bob', '--out', self.out)
        self.assertEqual((out['request'], out['state']), ('r1', 'ack'))
        self.assertEqual([(w['op'], w['collection'], w['doc_id']) for w in self.writes_of(out)],
                         [('update', 'requests', 'r1'), ('set', 'presence', 'bob')])
        self.assertEqual(self.writes_of(out)[0]['if_version'], 3)       # the version in the dump is the pin
        docs = self.docs_of(out)
        self.assertEqual((docs['requests/r1']['state'], docs['requests/r1']['ackBy']), ('ack', 'bob'))
        self.assertEqual((docs['presence/bob']['doing'], docs['presence/bob']['session']), ('r1 (edit)', 'bob'))
        w = self.writes_of(self.ok('requests', self.dump, '--ack', 'r1'))[0]      # no --out: the .adp/ the log uses, never the folder it runs in
        self.assertEqual(os.path.dirname(w['file_path']), os.path.join(self.home, '.adp', 'requests'))
        self.assertEqual(sorted(os.listdir(self.cwd)), sorted(['dump.json', 'resp.md', 'req']))

    def test_progress_appends(self):
        out = self.ok('requests', self.dump, '--progress', 'r2', '--text', 'going', '--out', self.out)
        self.assertEqual(out['state'], 'working')
        prog = self.docs_of(out)['requests/r2']['progress']
        self.assertEqual([x['text'] for x in prog], ['half', 'going'])
        self.assertEqual(self.docs_of(out)['presence/agent']['doing'], 'r2 (ask)')      # --by defaults to agent

    def test_done_writes_response(self):
        out = self.ok('requests', self.dump, '--done', 'r1', '--response', self.p('resp.md'), '--changed', 'a,b', '--version', 'v3',
                      '--by', 'bob', '--out', self.out)
        self.assertEqual(out['state'], 'done')
        doc = self.docs_of(out)['requests/r1']
        self.assertEqual((doc['status'], doc['changed'], doc['version'], doc['response']), ('done', ['a', 'b'], 'v3', 'the answer'))
        self.assertEqual(self.docs_of(out)['presence/bob']['doing'], '')

    def test_done_with_turns_answers_in_the_next_turn(self):
        turns = self.write_json('turns.json', [{'id': '0002', 'data': {'text': 'earlier'}}])
        out = self.ok('requests', self.dump, '--done', 'r1', '--response', self.p('resp.md'), '--turns', turns, '--out', self.out)
        writes = self.writes_of(out)
        self.assertEqual((writes[0]['op'], writes[0]['collection'], writes[0]['doc_id']), ('set', 'requests/r1/turns', '0003'))
        docs = self.docs_of(out)
        self.assertEqual((docs['requests/r1/turns/0003']['by'], docs['requests/r1/turns/0003']['text']), ('claude', 'the answer'))
        self.assertNotIn('response', docs['requests/r1'])

    def test_pins_file_wins_over_dump_version(self):
        pins = self.write_json('pins.json', {'requests/r1': 9})
        out = self.ok('requests', self.dump, '--ack', 'r1', '--pins', pins, '--out', self.out)
        self.assertEqual(self.writes_of(out)[0]['if_version'], 9)

    def test_refusals(self):
        cases = [
            ((), 'usage: adp.py requests DUMP.json'),
            ((self.dump, '--ack'), 'usage: adp.py requests DUMP.json'),
            ((self.dump, '--ack', 'nope'), 'nope: not in'),
            ((self.dump, '--progress', 'r1'), '--progress needs --text T'),
            ((self.dump, '--done', 'r1'), '--done needs --response FILE'),
            ((self.dump, '--ack', 'r1', '--done', 'r1', '--response', self.p('resp.md')), 'one of --ack, --progress, --done'),
        ]
        for args, msg in cases:
            r = self.run_adp('requests', *args, '--out', self.out)
            self.assertEqual(r.returncode, 1, args)
            self.assertIn(msg, r.stderr)


class ProposeAckTests(Cmd):
    def test_usage_errors(self):
        for args in ((), ('d',), ('d', '--by', 'me'), ('d', '--summary', 's')):
            r = self.run_adp('propose', *args)
            self.assertEqual(r.returncode, 1, args)
            self.assertIn('usage: adp.py propose DIR --by NAME --summary S', r.stderr)

    def test_without_export_exit_2(self):
        d = self.new_project()
        r = self.run_adp('propose', d, '--by', 'me', '--summary', 's')
        self.assertEqual(r.returncode, 2)
        self.assertEqual(json.loads(r.stdout)['error'], 'no export yet')

    def test_work_equals_live(self):
        d = self.exported()
        out = self.ok('propose', d, '--by', 'me', '--summary', 's')
        self.assertEqual(out['nothing'], 'work equals live')
        self.assertEqual(glob.glob(d + '.adp/propose-*'), [])

    def test_a_stale_fallback_copy_does_not_revert_live_content(self):
        d = self.exported()
        ik = sorted(glob.glob(d + '.adp/incoming/content/*.html'))
        self.assertTrue(ik)
        Path(ik[0]).write_text('<p>edited natively after content.js was written</p>')      # the live content/ doc moved; DIR's fallback copy did not
        self.edit(d)
        kinds = lambda out: [x['id'] for x in json.loads(Path(out['doc']).read_text())['parts'] if x.get('kind') == 'content']
        self.assertEqual(kinds(self.ok('propose', d, '--by', 'me', '--summary', 's')), [])
        st = self.state(d); del st['src_copy']; self.save_state(d, st)      # an export made before the snapshot existed keeps the old behaviour
        self.assertEqual(len(kinds(self.ok('propose', d, '--by', 'me', '--summary', 's2'))), 1)

    def test_a_pending_copy_edit_survives_a_re_export(self):
        d = self.exported(); cj = os.path.join(d, 'content.js'); txt = Path(cj).read_text()
        Path(cj).write_text(txt.replace('Replace this line', 'Replace this line NOW', 1))
        self.ok('export', d, '--url', URL)      # a re-export before the propose must not make the edit the baseline
        parts = json.loads(Path(self.ok('propose', d, '--by', 'me', '--summary', 's')['doc']).read_text())['parts']
        self.assertIn('page.lead', [x['id'] for x in parts if x.get('kind') == 'content'])

    def test_proposal_doc_and_batch(self):
        d = self.exported()
        self.edit(d)
        out = self.ok('propose', d, '--by', 'me', '--summary', 'welcome edit')
        pid = out['proposal']
        self.assertRegex(pid, r'^p-\d+-[a-z0-9]{4}$')
        self.assertEqual((out['files'], out['chunks']), (1, 0))
        doc = json.loads(Path(out['doc']).read_text())
        self.assertEqual((doc['by'], doc['summary'], doc['status']), ('me', 'welcome edit', 'new'))
        self.assertEqual(doc['base']['version'], '1')
        ids = [x['id'] for x in doc['parts']]
        self.assertIn('home.welcome', ids)
        self.assertEqual(len(ids), out['parts'])
        self.assertTrue(all(x['to'] and not x['retired'] for x in doc['parts']))
        self.assertEqual([f['path'] for f in doc['files']], ['parts/app.js'])
        self.assertIn(EDIT_TO, doc['files'][0]['content'])
        self.assertEqual(doc['files'][0]['contentType'], 'text/javascript')
        self.assertEqual(doc['files'][0]['ifMatch'], doc['live_files']['parts/app.js'])
        writes = self.writes_of(out)
        self.assertEqual([(w['op'], w['collection']) for w in writes], [('set', 'incoming'), ('set', 'changes')])
        self.assertEqual(writes[0]['doc_id'], pid)
        self.assertEqual(self.docs_of(out)[f'changes/{writes[1]["doc_id"]}']['data'], [{'doc': f'incoming/{pid}'}])
        st = self.state(d)
        self.assertIn(pid, st['incoming']['proposed'])

    def test_deleted_file_refused_until_retired_with_a_reason(self):
        d = self.exported()
        os.remove(os.path.join(d, 'styles', 'page.css'))
        r = self.run_adp('propose', d, '--by', 'me', '--summary', 'del')
        self.assertEqual(r.returncode, 2)
        errs = {e['error']: e for e in json.loads(r.stdout)['refused']}
        self.assertIn('held', errs)
        self.assertIn('styles/page.css', errs['deleted without --retire ID --reason R']['ids'])
        self.assertEqual(glob.glob(d + '.adp/propose-*'), [])
        r = self.run_adp('propose', d, '--by', 'me', '--summary', 'del', '--retire', 'styles/page.css')
        self.assertEqual(r.returncode, 2)
        self.assertEqual([e['error'] for e in json.loads(r.stdout)['refused']][-1], '--retire needs --reason')

    def test_retire_every_deleted_id(self):
        d = self.exported()
        os.remove(os.path.join(d, 'styles', 'page.css'))
        r = self.run_adp('propose', d, '--by', 'me', '--summary', 'del')
        ids = json.loads(r.stdout)['refused'][1]['ids']
        args = [x for i in ids for x in ('--retire', i, '--reason', 'obsolete')]
        out = self.ok('propose', d, '--by', 'me', '--summary', 'del', *args)
        doc = json.loads(Path(out['doc']).read_text())
        retired = {x['id']: x['reason'] for x in doc['parts'] if x['retired']}
        self.assertEqual(set(retired), {i for i in ids if i in json.loads(Path(d + '.adp/incoming/live-manifest.json').read_text())['parts']})
        self.assertEqual(set(retired.values()), {'obsolete'})
        gone = [f for f in doc['files'] if f['path'] == 'styles/page.css'][0]
        self.assertIsNone(gone['content'])
        self.assertEqual(gone['reason'], 'obsolete')

    def test_ack_batch_result_records_doc_versions(self):
        d = self.exported()
        self.edit(d)
        pid = self.ok('propose', d, '--by', 'me', '--summary', 's')['proposal']
        res = self.write_json('res.json', {'results': [{'collection': 'incoming', 'doc_id': pid, 'version': 1},
                                                       {'collection': 'changes', 'doc_id': 'd-1', 'version': 1}]})
        out = self.ok('ack', d, '--result', res)
        self.assertEqual(out['ack'], [f'incoming/{pid}', 'changes/d-1'])
        self.assertEqual(self.state(d)['docs'][f'incoming/{pid}'], 1)
        self.assertEqual(set(out['incoming']), {'held', 'unacked', 'pending_replies'})

    def test_ack_from_stdin_and_publish_result(self):
        d = self.exported()
        out = self.ok('ack', d, stdin=json.dumps({'shas': {'index.html': 'abc'}, 'version': 'v9'}))
        self.assertEqual(out['ack'], ['files'])
        self.assertEqual(out['live']['version'], 'v9')
        self.assertEqual(self.state(d)['files']['index.html'], 'abc')

    def test_ack_proposal_needs_a_status_in_the_last_export(self):
        d = self.exported()
        self.edit(d)
        pid = self.ok('propose', d, '--by', 'me', '--summary', 's')['proposal']
        r = self.run_adp('ack', d, '--proposal', pid)
        self.assertEqual(r.returncode, 1)
        self.assertIn(f'{pid}: status unknown in the last export', r.stderr)
        self.assertEqual(self.state(d)['incoming']['acked'], [])

    def test_ack_proposal_applied_moves_base(self):
        d = self.exported()
        self.edit(d)
        out = self.ok('propose', d, '--by', 'me', '--summary', 's')
        pid, doc = out['proposal'], json.loads(Path(out['doc']).read_text())
        doc.update(status='applied', applied={'version': 'v5', 'at': 'x'})
        self.docs['incoming'] = [{'id': pid, 'data': doc, 'version': 2}]
        Path(d + '.adp/docs.json').write_text(json.dumps(self.docs))
        shutil.copyfile(os.path.join(d, 'parts', 'app.js'), os.path.join(d + '.adp', 'incoming', 'files', 'parts', 'app.js'))
        listing = json.loads(Path(d + '.adp/listing.json').read_text())
        for f in listing:
            if f['path'] == 'parts/app.js':
                f['sha256'] = hashlib.sha256(Path(os.path.join(d, 'parts', 'app.js')).read_bytes()).hexdigest()
        Path(d + '.adp/listing.json').write_text(json.dumps(listing))
        self.ok('export', d, '--url', URL)
        self.assertEqual(self.state(d)['incoming']['unacked'], [pid])
        ack = self.ok('ack', d, '--proposal', pid)
        self.assertEqual(ack['ack'], [f'incoming/{pid} applied'])
        st = self.state(d)
        self.assertEqual((st['base']['version'], st['live']['version']), ('v5', 'v5'))
        self.assertEqual(st['incoming']['acked'], [pid])
        self.assertEqual(st['incoming']['unacked'], [])
        self.assertEqual(st['base']['manifest']['parts']['home.welcome'], st['incoming']['proposed'][pid]['manifest']['parts']['home.welcome'])

    def test_ack_usage_and_no_export(self):
        r = self.run_adp('ack')
        self.assertEqual(r.returncode, 1)
        self.assertIn('usage: adp.py ack DIR', r.stderr)
        r = self.run_adp('ack', 'nodir', stdin='{}')
        self.assertEqual(r.returncode, 2)
        self.assertEqual(json.loads(r.stdout)['error'], 'no export yet')

    def test_ack_hook_form_for_an_unmanaged_url(self):
        out = self.ok('ack', stdin=json.dumps({'tool_input': {'url': 'https://claude.ai/artifact/other'}, 'tool_response': {}}))
        self.assertEqual(out, {'ack': None, 'note': 'not an artifact ADP manages'})

    def test_ack_hook_form_for_a_managed_url(self):
        d = self.exported()
        out = self.ok('ack', stdin=json.dumps({'tool_input': {'url': URL}, 'tool_response': {'shas': {'index.html': 'zz'}, 'version': 'v2'}}))
        self.assertEqual(out['ack'], ['files'])
        self.assertEqual(self.state(d)['files']['index.html'], 'zz')


class GateTests(Cmd):
    def gate(self, obj):
        r = self.run_adp('gate', stdin=json.dumps(obj))
        self.assertEqual(r.returncode, 0, r.stderr)
        return json.loads(r.stdout)['hookSpecificOutput']

    def write_call(self, collection='parts', doc='home', **kw):
        return {'tool_name': 'mcp__x__ArtifactData', 'tool_input': {'action': 'set', 'url': URL, 'collection': collection, 'doc_id': doc, **kw}}

    def inbox(self, d, **kw):
        st = self.state(d)
        st['incoming'].update(kw)
        self.save_state(d, st)

    def test_not_a_write_is_allowed_with_a_note(self):
        for call in ({'tool_name': 'Read', 'tool_input': {}},
                     {'tool_name': 'mcp__x__ArtifactData', 'tool_input': {'action': 'get', 'url': URL}},
                     {'tool_name': 'mcp__x__Artifact', 'tool_input': {'action': 'read', 'url': URL}},
                     {'tool_name': 'mcp__x__Artifact', 'tool_input': {'action': 'list', 'url': URL}}):
            out = self.gate(call)
            self.assertEqual(out['hookEventName'], 'PreToolUse')
            self.assertNotIn('permissionDecision', out)
            self.assertIn('not a write onto an existing artifact', out['additionalContext'])

    def test_unmanaged_url_is_allowed(self):
        out = self.gate(self.write_call())
        self.assertNotIn('permissionDecision', out)
        self.assertIn('no state for this url', out['additionalContext'])

    def test_clear_inbox_allows(self):
        self.exported()
        out = self.gate(self.write_call(if_version=1))
        self.assertNotIn('permissionDecision', out)
        self.assertEqual(out['additionalContext'], 'adp: inbox clear')

    def test_stale_pin_denied(self):
        self.exported()
        out = self.gate(self.write_call(if_version=99))
        self.assertEqual(out['permissionDecision'], 'deny')
        self.assertIn('parts/home pinned at 99, read at 1', out['permissionDecisionReason'])

    def test_stale_pin_in_a_batch_denied(self):
        self.exported()
        out = self.gate({'tool_name': 'mcp__x__ArtifactData', 'tool_input': {'action': 'batch', 'url': URL, 'writes': [
            {'op': 'update', 'collection': 'parts', 'doc_id': 'home', 'if_version': 1},
            {'op': 'update', 'collection': 'parts', 'doc_id': 'settings', 'if_version': 7}]}})
        self.assertEqual(out['permissionDecision'], 'deny')
        self.assertIn('parts/settings pinned at 7', out['permissionDecisionReason'])
        self.assertNotIn('parts/home pinned', out['permissionDecisionReason'])

    def test_held_unacked_and_pending_replies_deny(self):
        d = self.exported()
        for key in ('held', 'unacked', 'pending_replies'):
            self.inbox(d, held=[], unacked=[], pending_replies=[])
            self.inbox(d, **{key: ['x1']})
            out = self.gate(self.write_call())
            self.assertEqual(out['permissionDecision'], 'deny', key)
            self.assertIn(f'{key}: x1', out['permissionDecisionReason'])
            self.assertIn(f'adp.py export {d} --url {URL}', out['permissionDecisionReason'])

    def test_publish_is_gated_too(self):
        d = self.exported()
        self.inbox(d, held=['home'])
        out = self.gate({'tool_name': 'mcp__x__Artifact', 'tool_input': {'url': URL, 'file_path': 'index.html'}})
        self.assertEqual(out['permissionDecision'], 'deny')

    def test_answering_requests_is_allowed_while_replies_are_pending(self):
        d = self.exported()
        self.inbox(d, pending_replies=['r1'])
        batch = {'tool_name': 'mcp__x__ArtifactData', 'tool_input': {'action': 'batch', 'url': URL, 'writes': [
            {'op': 'update', 'collection': 'requests', 'doc_id': 'r1'}, {'op': 'set', 'collection': 'presence', 'doc_id': 'bob'}]}}
        self.assertNotIn('permissionDecision', self.gate(batch))
        self.assertEqual(self.gate(self.write_call())['permissionDecision'], 'deny')
        self.inbox(d, held=['home'])
        self.assertEqual(self.gate(batch)['permissionDecision'], 'deny')      # held still blocks an answer

    def test_input_file(self):
        self.write_json('in.json', {'tool_name': 'Read'})
        r = self.run_adp('gate', '--input', self.p('in.json'))
        self.assertEqual(r.returncode, 0)
        self.assertIn('not a write', json.loads(r.stdout)['hookSpecificOutput']['additionalContext'])


if __name__ == '__main__':
    unittest.main()

"""Sites call/receipt translation, not a hosted transport certification."""
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import unittest
import tempfile
import sys
import os
import base64

spec = importlib.util.spec_from_file_location('sites_adapter', Path(__file__).resolve().parents[1] / 'skill/scripts/adp_sites_adapter.py')
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)


class SitesAdapter(unittest.TestCase):
    def test_files_builds_generic_sites_worker_and_preserves_default_payload(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); assets = root / 'public'; assets.mkdir()
            (assets / 'index.html').write_text('<h1>Any artifact</h1>')
            (assets / 'icon.png').write_bytes(bytes(range(256)))
            (assets / '.private.json').write_text('{"not":"served"}')
            project = root / 'site'; (project / '.openai').mkdir(parents=True)
            manifest = project / '.openai/hosting.json'; manifest.write_text('{"project_id":"keep-me"}')
            migration = project / 'migrations/001.sql'; migration.parent.mkdir(); migration.write_text('-- keep')
            cli = Path(__file__).resolve().parents[1] / 'skill/scripts/adp.py'
            def run(*args):
                return subprocess.run([sys.executable, '-I', str(cli), 'files', str(assets), *args],
                                      env={**os.environ, 'ADP_HOME': str(root / 'state')}, capture_output=True, text=True, timeout=3)
            built = run('--host', 'sites', '--out', str(project))
            self.assertEqual(built.returncode, 0, built.stderr)
            result = json.loads(built.stdout)
            self.assertEqual(result['host'], 'sites'); self.assertEqual(result['assets'], 2)
            self.assertEqual(manifest.read_text(), '{"project_id":"keep-me"}')
            self.assertEqual(migration.read_text(), '-- keep')
            legacy = json.loads(run().stdout); self.assertEqual(legacy['files']['icon.png'], 'icon.png')
            script = """import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';
const{default:w}=await import(pathToFileURL(process.argv[1]));
const req=(p,method='GET')=>w.fetch(new Request('https://test.example'+p,{method}),{});
assert.match(await(await req('/')).text(),/Any artifact/);
assert.deepEqual([...new Uint8Array(await(await req('/icon.png')).arrayBuffer())],Array.from({length:256},(_,i)=>i));
assert.equal(await(await req('/icon.png','HEAD')).text(),'');
assert.equal((await req('/.private.json')).status,404);
assert.equal((await req('/api/adp/demo/read','POST')).status,401);"""
            subprocess.run(['node', '--input-type=module', '-e', script, result['worker']], check=True, capture_output=True, timeout=3)
            for args in [('--host','sites','--out',str(assets)),('--host','sites','--out',str(project),'--since','old.json')]:
                self.assertNotEqual(run(*args).returncode,0)
            (assets / 'escape.txt').symlink_to(manifest)
            self.assertNotEqual(run('--host','sites','--out',str(project)).returncode,0)
            builder_spec = importlib.util.spec_from_file_location('sites_build', cli.with_name('adp_sites_build.py'))
            builder = importlib.util.module_from_spec(builder_spec); builder_spec.loader.exec_module(builder)
            for files in [{'kit/x.js': {'url':'catalog','path':'x.js'}}, {'../secret.txt':'../secret.txt'}]:
                with self.assertRaises(ValueError): builder.build(assets, project, {'files':files})
            self.assertEqual(builder.build(assets, project, {'files':{'icon.png':'icon.png'},'kit_refs':1})['assets'],2)

    def test_assistant_fixture_uses_shared_kit_and_native_sites_routes(self):
        with tempfile.TemporaryDirectory() as output:
            root = Path(__file__).resolve().parents[1]
            subprocess.run([sys.executable, str(root / 'tools/build_sites_fixture.py'), output, '--assistant', '--namespace', 'assistant-test'], check=True, capture_output=True, timeout=8)
            worker = (Path(output) / 'dist/server/index.js').read_text()
            assets = json.loads(worker.split('const assets = ', 1)[1].split(';\n', 1)[0])
            assets = {url: [mime, base64.b64decode(data).decode()] for url, (mime, data) in assets.items()}
            self.assertEqual(assets['/assistant/'], assets['/assistant/index.html'])
            self.assertIn('/api/adp/assistant-test', assets['/assistant/'][1])
            self.assertEqual(assets['/assistant/kit/patterns/request-card.js'][1], (root / 'skill/catalog/kit/patterns/request-card.js').read_text())
            self.assertIn('host.comments.requestPublication(pid)', assets['/assistant/parts/app.js'][1])

    @unittest.skipUnless(shutil.which('node'), 'Node SQLite required')
    def test_calls_through_real_localhost_worker(self):
        call = adapter.write_calls('fixture', [{'op': 'create', 'collection': 'content', 'id': 'intro', 'data': {'html': 'portable', 'opaque': [1, 2]}, 'guard': None}])[0]
        script = """
import {start} from './skill/scripts/adp_sites_dev.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
let input='';for await(const chunk of process.stdin)input+=chunk;
const call=JSON.parse(input),state=await mkdtemp(join(tmpdir(),'adp-adapter-'));
const host=await start({port:0,state,user:'dev-user',readOnly:false});
async function invoke(c){return (await fetch(host.url+'/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:c.tool,arguments:c.args}})})).json();}
try{const result=await invoke(call),readback=await invoke(call.readback),stale=await invoke(call);const query={tool:'adp_query',args:{artifact:call.args.artifact,path:'content'}},group={call:query,result:await invoke(query)};console.log(JSON.stringify([{call,result,readback},{call,result:stale,readback},{call,result,readback:group}]));}
finally{await host.close();await rm(state,{recursive:true});}
"""
        run = subprocess.run(['node', '--input-type=module', '-e', script], input=json.dumps(call), text=True, capture_output=True, timeout=5, cwd=Path(__file__).resolve().parents[1])
        self.assertEqual(run.returncode, 0, run.stderr)
        receipts = adapter.parse_receipt(json.loads(run.stdout))
        self.assertEqual([r['outcome'] for r in receipts], ['applied', 'rejected', 'applied'])

    def test_target_guard_and_readback(self):
        target = {'exists': True, 'data': {'old': 1}, 'revision': 7}
        call = adapter.write_call('fixture', 'content/intro', {'html': 'new'}, target)
        self.assertEqual(call['arguments']['expectedRevision'], 7)
        self.assertEqual(adapter.read_call('fixture', 'content/intro')['name'], 'adp_read')
        reply = {'content': [{'type': 'text', 'text': json.dumps({'revision': 8})}]}
        self.assertEqual(adapter.verify(call, reply, {'exists': True, 'data': {'html': 'new'}, 'revision': 8})['status'], 'verified')
        self.assertEqual(adapter.verify(call, reply, {'exists': True, 'data': {'html': 'other'}, 'revision': 9})['status'], 'conflict')

    def test_failure_and_unknown_are_not_success(self):
        call = adapter.write_call('fixture', 'content/intro', {}, {'exists': False, 'data': None, 'revision': 4})
        self.assertEqual(call['arguments']['expectedRevision'], 4)
        for reply in [None, {}, {'revision': True}]:
            self.assertEqual(adapter.verify(call, reply, None)['status'], 'unknown')
        error = {'isError': True, 'content': [{'type': 'text', 'text': '{"status":409,"error":"Revision conflict"}'}]}
        self.assertEqual(adapter.verify(call, error, None)['status'], 'conflict')
        with self.assertRaises(ValueError):
            adapter.write_call('fixture', 'content/intro', {}, {'exists': False, 'revision': True})

    def test_shared_shell_hooks_and_partial_receipts(self):
        reads = adapter.read_calls('fixture', ['content'])
        result = adapter.parse_reads([{'call': reads[0], 'result': {'docs': [{'id': 'intro', 'data': {'html': 'old'}, 'revision': 7}]}}])
        self.assertTrue(result['complete'])
        self.assertEqual(result['covered'], ['content'])
        self.assertEqual(result['docs'][0]['collection'], 'content')
        call = adapter.write_calls('fixture', [{'op': 'replace', 'collection': 'content', 'id': 'intro', 'data': {'html': 'new'}, 'guard': 7}])[0]
        self.assertFalse(call['atomic'])
        envelope = {'call': call, 'result': {'revision': 8}, 'readback': {'exists': True, 'revision': 8, 'data': {'html': 'new'}}}
        self.assertEqual(adapter.parse_receipt([envelope])[0]['outcome'], 'applied')
        wrong = {'call': {'tool': 'adp_query', 'args': {'artifact': 'other', 'path': 'content'}}, 'result': {'docs': [{'id': 'intro', 'data': {'html': 'new'}, 'revision': 8}]}}
        self.assertEqual(adapter.parse_receipt([{**envelope, 'readback': wrong}])[0]['outcome'], 'unknown')
        self.assertEqual(adapter.parse_receipt([{'call': call, 'result': {'revision': 8}}])[0]['outcome'], 'unknown')
        self.assertFalse(adapter.parse_reads([{'call': reads[0], 'result': {'error': 'Unavailable'}}])['complete'])

    def test_absent_record_read_preserves_tombstone_guard(self):
        call = adapter.read_doc_calls('fixture', ['content/intro'])[0]
        parsed = adapter.parse_reads([{'call': call, 'result': {'exists': False, 'data': None, 'revision': 4}}])
        self.assertEqual(parsed['docs'][0]['revision'], 4)
        self.assertFalse(parsed['docs'][0]['exists'])
        recreate = adapter.write_calls('fixture', [{'op': 'create', 'collection': 'content', 'id': 'intro', 'data': {}, 'guard': 4}])[0]
        self.assertEqual(recreate['args']['expectedRevision'], 4)

"""Runtime boundary tests in Node; no network or native host is assumed."""
import json
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HARNESS = r'''
const fs = require('fs'), vm = require('vm');
const calls = [], noop = () => {};
const el = new Proxy(function(){}, {get:(t,k)=>k===Symbol.toPrimitive?()=>'':el,apply:()=>el,set:()=>true});
const snap = {exists:false,data:()=>({}),docs:[],docChanges:()=>[]};
const ref = {get:async()=>snap,set:async()=>calls.push('write'),update:async()=>calls.push('write'),onSnapshot:fn=>{fn(snap);return noop;}};
const query = {onSnapshot:fn=>{fn(snap);return noop;},where:()=>query,orderBy:()=>query,limit:()=>query};
const db = {doc:()=>ref,collection:()=>query};
const user = {canEdit:async()=>false,id:async()=>'viewer'};
const win = {addEventListener:noop, document:{querySelector:()=>null,getElementById:()=>null,querySelectorAll:()=>[],addEventListener:noop,readyState:'loading',documentElement:el,head:el,body:el,createElement:()=>el},
 crypto:require('crypto').webcrypto,TextEncoder,MutationObserver:class{observe(){}},location:{href:'https://x/',search:'',hash:''},navigator:{},console,setTimeout:()=>0,clearTimeout:noop};
win.window=win; win.self=win;
const mode = process.argv[1];
const connection = {id:'test',db,user};
if(mode==='bad-ref') connection.db={doc:()=>({}),collection:()=>({})};
if(mode==='no-db') delete connection.db;
if(mode==='reject-user') connection.user={canEdit:async()=>{throw Error('no');},id:async()=>{throw Error('no');}};
if(mode==='truthy-user') connection.user={canEdit:()=> 'true',id:()=> 'viewer'};
if(mode==='comments-error') connection.comments={customAnchors:async()=>{throw Error('no');}};
if(mode!=='legacy' && mode!=='legacy-slow-comments' && mode!=='static') win.ADP_HOST={protocol:mode==='bad-protocol'?'wrong':'adp-host/1',connect:async()=>{calls.push('explicit');if(mode==='reject')throw Error('no');return connection;}};
if(mode==='legacy'||mode==='legacy-slow-comments'||mode==='both'||mode==='reject')win.claude={use:async name=>{calls.push('claude:'+name);if(mode==='legacy-slow-comments'&&name==='comments')return new Promise(()=>{});return name==='db'?db:name==='user'?user:null;}};
vm.createContext(win);
if(mode==='openai'){
 vm.runInContext(fs.readFileSync(process.argv[2].replace(/adp\.js$/, 'adapters/openai.js'),'utf8'),win);
 win.ADP_HOST=win.ADPOpenAIHost.create({profile:'sites',bridge:{connect:async()=>connection}});
}
vm.runInContext(fs.readFileSync(process.argv[2],'utf8'),win);
(async()=>{await Promise.race([win.ADP.config.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('ready hung')),100))]);
await new Promise(resolve=>setImmediate(resolve));
let ns=false;try{ns=!!win.ADP.ns('app').doc('x');}catch(e){}
console.log(JSON.stringify({host:win.ADP.host,user:win.ADP.user,db:!!win.ADP.db,ns,calls}));})().catch(e=>{console.error(e);process.exitCode=1;});
'''


@unittest.skipUnless(shutil.which('node'), 'node required')
class HostConnection(unittest.TestCase):
    def run_case(self, mode):
        run = subprocess.run(['node', '-e', HARNESS, mode, str(ROOT / 'skill/assets/adp.js')], capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stderr)
        return json.loads(run.stdout)

    def test_explicit_and_precedence(self):
        for mode in ('explicit', 'both', 'comments-error', 'openai'):
            result = self.run_case(mode)
            self.assertEqual(result['host']['status'], 'connected')
            self.assertTrue(result['db'] and result['ns'])
            self.assertFalse(any(x.startswith('claude:') for x in result['calls']))
            self.assertNotIn('write', result['calls'])

    def test_failed_provider_is_closed_and_ready(self):
        for mode in ('reject', 'bad-protocol', 'bad-ref'):
            result = self.run_case(mode)
            self.assertEqual(result['host']['status'], 'failed')
            self.assertFalse(result['db'] or result['user']['canEdit'])
            self.assertFalse(any(x.startswith('claude:') for x in result['calls']))

    def test_legacy_and_static(self):
        result = self.run_case('legacy')
        self.assertEqual(result['host']['id'], 'claude')
        self.assertEqual(sorted(result['calls']), ['claude:comments', 'claude:db', 'claude:user'])
        self.assertEqual(self.run_case('legacy-slow-comments')['host']['status'], 'connected')
        result = self.run_case('static')
        self.assertEqual(result['host']['id'], 'static')
        self.assertFalse(result['db'] or result['ns'])

    def test_absent_store_and_denied_user(self):
        self.assertFalse(self.run_case('no-db')['db'])
        for mode in ('reject-user', 'truthy-user'):
            result = self.run_case(mode)
            self.assertFalse(result['user']['canEdit'])
            self.assertNotIn('write', result['calls'])

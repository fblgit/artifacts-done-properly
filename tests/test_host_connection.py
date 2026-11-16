"""Runtime boundary tests in Node; no network or native host is assumed."""
import json
import os
import shutil
import signal
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def run_node(args, cwd=None, timeout=8):
    """node in a process group of its own: after the deadline the whole group is killed and reaped, children included"""
    p = subprocess.Popen(['node', *args], cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
    try: out, err = p.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        os.killpg(p.pid, signal.SIGKILL); p.communicate(); raise
    return subprocess.CompletedProcess(p.args, p.returncode, out, err)

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
if(mode==='handles'){connection.agent=Promise.resolve({label:'X',canSend:async()=>'queued',send:async()=>({})});connection.publish={};connection.user.can=async n=>n==='data.write';}
const adapter=mode.startsWith('adapter');
if(mode!=='legacy' && mode!=='legacy-slow-comments' && mode!=='static' && !adapter) win.ADP_HOST={protocol:mode==='bad-protocol'?'wrong':'adp-host/1',connect:async()=>{calls.push('explicit');if(mode==='reject')throw Error('no');return connection;}};
if(mode==='legacy'||mode==='legacy-slow-comments'||mode==='both'||mode==='reject'||(adapter&&mode!=='adapter-no-claude'))win.claude={use:async name=>{calls.push('claude:'+name);if(/slow-comments/.test(mode)&&name==='comments')return new Promise(()=>{});return name==='db'?db:name==='user'?user:null;}};
vm.createContext(win);
if(adapter){vm.runInContext(fs.readFileSync(process.argv[2].replace(/adp\.js$/, 'adapters/claude.js'),'utf8'),win);win.ADP_HOST=win.ADPClaudeHost.create();}
if(mode==='openai'){
 vm.runInContext(fs.readFileSync(process.argv[2].replace(/adp\.js$/, 'adapters/openai.js'),'utf8'),win);
 win.ADP_HOST=win.ADPOpenAIHost.create({profile:'sites',bridge:{connect:async()=>connection}});
}
vm.runInContext(fs.readFileSync(process.argv[2],'utf8'),win);
(async()=>{await Promise.race([win.ADP.config.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('ready hung')),100))]);
await new Promise(resolve=>setImmediate(resolve));
let ns=false;try{ns=!!win.ADP.ns('app').doc('x');}catch(e){}
const acc=typeof win.ADP.claude; if(acc==='function') await win.ADP.claude('artifact');
const h=(await Promise.all([win.ADP.agent(),win.ADP.publish(),win.ADP.ask()].map(p=>Promise.race([p,new Promise(r=>setTimeout(()=>r('slow'),60))])))).map(x=>x&&typeof x);
const can=await win.ADP.user.can('data.write');
console.log(JSON.stringify({can,host:win.ADP.host,user:win.ADP.user,db:!!win.ADP.db,ns,acc,calls,h}));})().catch(e=>{console.error(e);process.exitCode=1;});
'''


ASSIST_ENV = r'''
const fs = require('fs'), vm = require('vm'), K = process.argv[1] + '/skill/catalog/kit/';
const w = { navigator: {}, console, setTimeout, clearTimeout, setInterval, clearInterval, Date, Promise, JSON, TextEncoder, crypto: require('crypto').webcrypto,
  document: { createElement: () => ({}), getElementById: () => null, head: { append() {} }, addEventListener() {}, removeEventListener() {} }, addEventListener() {} };
w.window = w; vm.createContext(w);
for (const f of ['dom.js', 'patterns/assist.js']) vm.runInContext(fs.readFileSync(K + f, 'utf8'), w);
const sleep = () => new Promise(r => setTimeout(r, 30));
'''


@unittest.skipUnless(shutil.which('node'), 'node required')
class HostConnection(unittest.TestCase):
    def run_case(self, mode):
        run = run_node(['-e', HARNESS, mode, str(ROOT / 'skill/assets/adp.js')])
        self.assertEqual(run.returncode, 0, run.stderr)
        return json.loads(run.stdout)

    def test_explicit_and_precedence(self):
        for mode in ('explicit', 'both', 'comments-error', 'openai'):
            result = self.run_case(mode)
            self.assertEqual(result['host']['status'], 'connected')
            self.assertTrue(result['db'] and result['ns'])
            self.assertFalse(any(x.startswith('claude:') for x in result['calls']))      # ADP.claude('artifact') on a non-Claude host never reaches window.claude
            self.assertEqual(result['acc'], 'function'); self.assertNotIn('write', result['calls'])

    def test_agent_publish_ask_are_the_hosts_handle_or_null(self):
        r = self.run_case('handles')      # a promise of a handle is accepted; a handle of the wrong shape reads as none
        self.assertEqual((r['h'], [r['host'][k] for k in ('agent', 'publish', 'ask')]), (['object', None, None], [True, False, False]))
        self.assertEqual(self.run_case('explicit')['h'], [None, None, None])
        self.assertEqual((r['can'], self.run_case('explicit')['can']), (True, None))      # ADP.user.can passes the host's answer for a right, or null when it gives none

    def test_failed_provider_is_closed_and_ready(self):
        for mode in ('reject', 'bad-protocol', 'bad-ref'):
            result = self.run_case(mode)
            self.assertEqual(result['host']['status'], 'failed')
            self.assertFalse(result['db'] or result['user']['canEdit'])
            self.assertFalse(any(x.startswith('claude:') for x in result['calls']))

    def test_legacy_and_static(self):
        result = self.run_case('legacy')
        self.assertEqual(result['host']['id'], 'claude')
        self.assertEqual(sorted(set(result['calls'])), ['claude:artifact', 'claude:comments', 'claude:db', 'claude:sample', 'claude:user'])      # on a Claude host the handles do ask; the built-in default builds agent, publish and ask from them
        self.assertEqual(self.run_case('legacy-slow-comments')['host']['status'], 'connected')
        result = self.run_case('static')
        self.assertEqual(result['host']['id'], 'static')
        self.assertFalse(result['db'] or result['ns'])

    def test_claude_adapter_matches_builtin_default(self):
        strip = lambda r: {**r, 'h': 0, 'calls': sorted(r['calls']), 'host': {k: v for k, v in r['host'].items() if k != 'comments'}}
        raw = self.run_case('legacy'); legacy = strip(raw)
        self.assertEqual(self.run_case('adapter')['h'], raw['h'])      # slow comments leave the agent pending, so only the plain run compares handles
        for mode in ('adapter', 'adapter-slow-comments'):  # slow comments must not hold connect()
            self.assertEqual(strip(self.run_case(mode)), legacy)
        failed = self.run_case('adapter-no-claude')        # explicit adapter fails closed, not 'static'
        self.assertEqual((failed['host']['status'], failed['db']), ('failed', False))

    def test_claude_adapter_contract(self):
        script = r'''
const assert = require('node:assert/strict'); require('./skill/assets/adapters/claude.js');
const host = ADPClaudeHost.create(), db = {doc(){}, collection(){}}, user = {id: async () => 'u', canEdit: async () => 'yes'};
(async () => {
  await assert.rejects(host.connect(), /window\.claude/);
  let release; const slow = new Promise(r => { release = r; }), ctl = {}, cb = {};
  claude = {use: async n => n === 'db' ? db : n === 'user' ? user : slow};
  const c = await host.connect();                        // slow comments do not hold connect()
  assert.deepEqual([c.id, c.db, c.user, c.seedFiles], ['claude', db, user, true]);
  assert.equal(await c.user.canEdit(), 'yes');           // never coerced into a permission
  const got = c.comments.customAnchors(cb); release({customAnchors: async x => (assert.equal(x, cb), ctl)});
  assert.equal(await got, ctl);
  claude = {use: async () => null};
  await assert.rejects((await host.connect()).comments.customAnchors({}), e => e.code === 'unavailable');
  const log = [], caps = {comments: {canSendToClaude: async () => 'available', sendToClaude: async m => (log.push(m), {threadId: 't1'}), anchorFor: async e => 'a:' + e}, artifact: {publish: async (f, o) => [f, o]}, sample: async m => ({text: m}), db, user};
  claude = {use: async n => caps[n] || null};
  const g = await host.connect(), ag = await g.agent;      // Claude's own methods, behind the host-neutral names
  assert.deepEqual([ag.label, ag.where, await ag.canSend(), await ag.send({anchor: 'x', text: 'hi', requestId: 'r-1', turnId: '0001'}), await ag.anchorFor('e'), log], ['Claude', 'Claude Code', 'available', {threadId: 't1', delivery: 'accepted'}, 'a:e', [{anchor: 'x', text: 'hi'}]]);
  assert.deepEqual([await (await g.publish).files(1, 2), await (await g.ask)('m')], [[1, 2], {text: 'm'}]);
  claude = {use: async n => n === 'db' ? db : n === 'user' ? user : null};      // not granted: none, not a handle that fails later
  const n = await host.connect(); assert.deepEqual([await n.agent, await n.publish, await n.ask], [null, null, null]);
})().catch(e => { console.error(e); process.exitCode = 1; });
'''
        run = run_node(['-e', script], cwd=ROOT)
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)

    def test_absent_store_and_denied_user(self):
        self.assertFalse(self.run_case('no-db')['db'])
        for mode in ('reject-user', 'truthy-user'):
            result = self.run_case(mode)
            self.assertFalse(result['user']['canEdit'])
            self.assertNotIn('write', result['calls'])

    def test_assist_sends_through_the_hosts_agent_handle(self):
        script = ASSIST_ENV + r'''
const sent = [], mk = (state, label) => ({ label, canSend: async () => state, send: async m => (sent.push(m), { threadId: 't', delivery: 'queued' }), anchorFor: async () => 'page' });
const run = async opts => { const e = w.Kit.assist.start({ seed: {}, ...opts }); await e.ready; await sleep(); const r = await e.send({ text: 'hi' }).then(() => 'ok', x => x.code + ': ' + x.message); e.destroy(); return r; };
(async () => {
  console.log(JSON.stringify([await run({ agent: mk('queued', 'Codex') }), await run({ agent: mk('no_session', 'Codex') }), await run({ page: { agent: async () => mk('available', 'X') } }),
    await run({ comments: { canSendToClaude: async () => 'available', sendToClaude: async () => ({}), anchorFor: async () => 'p' } }), await run({}), sent.map(m => /^r-/.test(m.requestId))]));
  const e = w.Kit.assist.start({ seed: {}, agent: mk('queued', 'Codex') }); await e.ready; await sleep(); const rid = await e.send({ text: 'hi' }); await e.reply(rid, 'again'); const m = sent[sent.length - 1];
  console.log(JSON.stringify([m.requestId === rid, m.threadId, m.turnId]));
  const u = w.Kit.assist.start({ seed: {}, agent: { ...mk('queued', 'Codex'), send: async () => ({ threadId: 't', delivery: 'unknown' }) } }); await u.ready; await sleep(); const ur = await u.send({ text: 'hi' }); await sleep(); console.log(JSON.stringify([u.delivery(ur), u.requests({}).get().length]));
  process.exit(0);
})();'''
        run = run_node(['-e', script, str(ROOT)])
        out = [json.loads(x) for x in run.stdout.splitlines()]
        self.assertEqual(out[0], ['ok', 'no_session: Sending to Codex is not possible right now: no_session.', 'ok', 'none: This page cannot send to Agent here.', 'none: This page cannot send to Agent here.', [True, True]], run.stderr)      # queued is sendable; words from the label; default from the page's host; a Claude-shaped comments handle is no longer taken for an agent; the stored request id goes with the send
        self.assertEqual(out[2], ['unknown', 1])      # an unconfirmed handoff is shown and the saved request stays
        self.assertEqual(out[1], [True, 't', '0001'])      # a reply names its stored turn, so a host with its own record does not add a second

    def test_the_panel_lets_a_queued_host_send(self):
        script = r"""
const fs = require('fs'), vm = require('vm'), K = process.argv[1] + '/skill/catalog/kit/', made = [], noop = () => {};
const mk = tag => { const a = {}, h = {}, t = { tag, h, attrs: a, addEventListener: (k, f) => { h[k] = f; }, dataset: {}, style: {}, classList: { add: noop, remove: noop, toggle: noop }, textContent: '', setAttribute: (k, v) => { a[k] = String(v); }, getAttribute: k => a[k] ?? null };
  return new Proxy(t, { get: (o, k) => k in o ? o[k] : k === 'className' ? '' : k === 'querySelectorAll' ? () => [] : noop, set: (o, k, v) => (o[k] = v, true) }); };
const doc = { createElement: tag => { const e = mk(tag); made.push(e); return e; }, createTextNode: mk, getElementById: () => null, head: mk(), body: mk(), addEventListener: noop, removeEventListener: noop };
const w = { navigator: {}, console, setTimeout, clearTimeout, setInterval, clearInterval, Date, Promise, JSON, document: doc, addEventListener: noop, TextEncoder }; w.window = w; vm.createContext(w);
for (const f of ['dom.js', 'patterns/assist-panel.js']) vm.runInContext(fs.readFileSync(K + f, 'utf8'), w);
const view = () => ({ get: () => [], on: () => noop }), eng = s => ({ can: () => ({ ask: false, send: s }), requests: view, conversations: view, watch: () => noop, lanes: () => ['task'], word: l => l, presence: () => ({}), me: () => 'u', agentLabel: () => 'Codex' });
console.log(JSON.stringify(['available', 'queued', 'no_session', 'off'].map(s => { made.length = 0; w.Kit.assistPanel.mount(mk(), { engine: eng(s) }); return made.find(e => e.attrs['aria-disabled'] !== undefined).attrs['aria-disabled'] + made.some(e => e.textContent === 'Work with Codex'); })));
doc.createElementNS = (_, tag) => doc.createElement(tag);
vm.runInContext(fs.readFileSync(K + 'vocab.js', 'utf8'), w); vm.runInContext(fs.readFileSync(K + 'patterns/request-card.js', 'utf8'), w);
console.log(JSON.stringify(['queued','available','off','no_session'].map(state => {
  made.length=0; const card=w.Kit.requestCard.mount(mk(),{engine:eng(state),request:{id:'r',status:'done',text:'Hi',response:'Answer'}});
  const result=[made.some(e=>e.tag==='textarea'),made.some(e=>e.textContent==='Codex')];card.destroy();return result;
})));
const sendWith = async d => { made.length = 0; w.Kit.assistPanel.mount(mk(), { engine: { ...eng('queued'), send: async () => 'r1', delivery: () => d } }); made.find(e => e.tag === 'textarea').value = 'hi';
  made.find(e => e.h.submit).h.submit({ preventDefault: noop }); await new Promise(r => setTimeout(r, 20)); return made.find(e => e.className === 'kit-ap-live').textContent; };
(async () => { console.log(JSON.stringify([await sendWith('unknown'), await sendWith('queued')])); process.exit(0); })();"""
        run = run_node(['-e', script, str(ROOT)])
        self.assertEqual(run.returncode, 0, run.stderr)
        gate, cards, said = [json.loads(x) for x in run.stdout.splitlines()]
        self.assertEqual(cards, [[True, True], [True, True], [False, True], [False, True]], run.stderr)
        self.assertEqual(gate, ['falsetrue', 'falsetrue', 'truetrue', 'truetrue'], run.stderr)      # queued enables Send, as available does; no_session and off still block; the title names the host's agent
        self.assertEqual([x.startswith(p) for x, p in zip(said, ['Task saved. Delivery to Codex is not confirmed', 'Task sent. It waits'])], [True, True], said)      # unknown delivery is said as saved, not sent

    def test_a_reply_ends_an_agents_claim_only_where_there_is_one(self):
        script = ASSIST_ENV + r'''
const claim = { actor: 'a', token: 'T', state: 'working' }, base = { lane: 'task', scope: { kind: 'page', id: '', label: 'P' }, text: 'x', at: '2026-11-16T00:00:00Z', status: 'open', state: 'working', progress: [] };
(async () => {
  for (const [seed, fail] of [[{ ...base, execution: claim, workGeneration: 2 }, 0], [{ ...base }, 0], [{ ...base, execution: claim, workGeneration: 2 }, 1]]) {
    const agent = { canSend: async () => 'available', anchorFor: async () => 'page', send: async () => { if (fail) throw new Error('x'); return { threadId: 't', delivery: 'queued' }; } };
    const e = w.Kit.assist.start({ seed: { 'requests/r': seed }, agent }); await e.ready; await sleep();
    await e.reply('r', 'hi').catch(() => 0); await sleep();
    const r = e.requests({}).get()[0]; console.log(JSON.stringify([r.execution === undefined ? 'absent' : r.execution && r.execution.token, r.workGeneration === undefined ? 'absent' : r.workGeneration])); e.destroy();
  }
  process.exit(0);
})();'''
        run = run_node(['-e', script, str(ROOT)])
        self.assertEqual(run.stdout.split(), ['[null,3]', '["absent","absent"]', '["T",2]'], run.stderr)      # claim cleared and generation bumped; an ordinary request untouched; a failed send restores the claim

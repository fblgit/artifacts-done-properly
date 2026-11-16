"""HTTP facade tests, not certification of a deployed Sites host."""
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


@unittest.skipUnless(shutil.which("node"), "node required for Sites transport")
class OpenAISitesBridge(unittest.TestCase):
    def test_transport(self):
        script = r'''
const assert = require('node:assert/strict');
require('./skill/assets/adapters/openai-sites.js');
require('./skill/assets/adapters/openai.js');
const create = ADPOpenAISites.create;
const tick = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  for (const endpoint of ['https://evil.test/api/adp/x','//evil.test','/api/adp/../x','/api/adp/x?y']) assert.throws(() => create({endpoint}));
  assert.throws(() => create({endpoint:'/api/adp/test',pollIntervalMs:1}));
  const calls = []; let result = {id:'u1',canEdit:true,isOwner:false}, status = 200;
  globalThis.fetch = async (url, options) => {calls.push({url,options}); return {ok:status===200,status,json:async()=>result};};
  const bridge = create({endpoint:'/api/adp/test'});
  const session = await bridge.connect();
  assert.equal(await bridge.connect(),session);
  assert.equal(await session.user.id(),'u1');
  assert.equal(await session.user.canEdit(),true);
  assert.equal(session.comments,null);
  const host = await ADPOpenAIHost.create({profile:'sites',bridge}).connect();
  assert.equal(host.db,session.db);
  assert.equal(await host.user.isOwner(),false);
  assert.equal(await host.user.can('data.write'),true);
  assert.equal(await host.user.can('unknown.permission'),false);
  assert.deepEqual(await host.user.me(),{id:'u1',name:'',avatarUrl:'',color:'',email:null,isOwner:false,canEdit:true});
  const ref = session.db.doc('config/current');
  result = {exists:true,data:{values:{a:1}},revision:2};
  let snap = await ref.get();
  assert.equal(snap.exists,true); assert.equal(snap.revision,2);
  snap.data().values.a=9; assert.equal(snap.data().values.a,1);
  assert.equal(calls.at(-1).options.headers['x-adp-user'],'u1');
  assert.equal(calls.at(-1).options.credentials,'same-origin');
  assert.equal(calls.at(-1).options.redirect,'error');
  assert.equal(calls.at(-1).options.cache,'no-store');
  result={revision:3}; await ref.set({a:2},{expectedRevision:2});
  assert.deepEqual(JSON.parse(calls.at(-1).options.body),{path:'config/current',mode:'set',data:{a:2},expectedRevision:2});
  await ref.update({b:3}); assert.equal(JSON.parse(calls.at(-1).options.body).mode,'update');
  await ref.delete({expectedRevision:3}); assert.deepEqual(JSON.parse(calls.at(-1).options.body),{path:'config/current',mode:'delete',expectedRevision:3});
  await assert.rejects(ref.set(null),TypeError);
  await assert.rejects(ref.set({},{expectedRevision:-1}),TypeError);
  assert.throws(()=>session.db.doc('../outside'));
  assert.throws(()=>session.db.doc('odd'),TypeError);
  assert.throws(()=>session.db.doc('ns/name/odd'),TypeError);
  assert.throws(()=>session.db.collection('even/path'),TypeError);
  assert.equal(session.db.doc('kitfiles/samples~hello.txt').id,'samples~hello.txt');
  const collection = session.db.collection('decisions');
  assert.throws(()=>collection.where('x','>',1)); assert.throws(()=>collection.limit(0));
  result={docs:[{id:'a',data:{status:'active'},revision:1}]};
  snap=await collection.where('status','==','active').orderBy('at','desc').limit(10).get();
  assert.deepEqual(JSON.parse(calls.at(-1).options.body),{path:'decisions',where:[['status','==','active']],orderBy:[['at','desc']],limit:10});
  assert.equal(snap.docs[0].exists,true); assert.equal(snap.docChanges()[0].type,'added');
  const timers=[]; globalThis.setTimeout=fn=>{timers.push(fn);return fn;};globalThis.clearTimeout=fn=>{const i=timers.indexOf(fn);if(i>=0)timers.splice(i,1);};
  const updates=[], errors=[];
  const stop=collection.onSnapshot(s=>updates.push(s),e=>errors.push(e)); await tick();
  assert.equal(updates[0].docChanges()[0].type,'added');
  result={docs:[{id:'a',data:{status:'changed'},revision:2},{id:'b',data:{},revision:1}]};
  timers.shift()();await tick(); assert.deepEqual(updates[1].docChanges().map(c=>c.type),['modified','added']);
  result={docs:[{id:'b',data:{},revision:1}]};timers.shift()();await tick();
  assert.equal(updates[2].docChanges()[0].type,'removed');
  status=403;timers.shift()();await tick();assert.equal(errors[0].code,'sites-403');
  status=200;timers.shift()();await tick();assert.equal(updates[3].docChanges().length,0);
  stop();assert.equal(timers.length,0);
  // Unsubscription during an outstanding response suppresses both callbacks and rescheduling.
  let resolve;globalThis.fetch=()=>new Promise(r=>{resolve=r;});
  const count=updates.length;const stopPending=collection.onSnapshot(s=>updates.push(s));stopPending();
  resolve({ok:true,json:async()=>result});await tick();assert.equal(updates.length,count);assert.equal(timers.length,0);
  // Malformed wire responses fail closed, not an empty successful collection.
  globalThis.fetch=async()=>({ok:true,json:async()=>({docs:[{id:'a',data:{},revision:1},{id:'a',data:{},revision:1}]})});
  await assert.rejects(collection.get(),TypeError);
  globalThis.fetch=async()=>({ok:true,json:async()=>({id:'',canEdit:true})});
  await assert.rejects(create({endpoint:'/api/adp/guest'}).connect(),TypeError);
})().catch(e=>{console.error(e);process.exitCode=1;});
'''
        result = subprocess.run(["node", "-e", script], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../skill/assets/hosts/openai-sites/worker.mjs';
const sql=new DatabaseSync(':memory:');
sql.exec(readFileSync('skill/assets/hosts/openai-sites/schema.sql','utf8'));
const env = {
  ADP_EDITORS: 'editor', ADP_READERS: 'reader',
  DB: { prepare(query) { return { bind(...args) {
    const statement = sql.prepare(query);
    return {
      async first() { return statement.get(...args); },
      async all() { return {results: statement.all(...args)}; },
      async run() { return {meta: {changes: statement.run(...args).changes}}; }
    };
  }}; }}
};
async function request(op,args,user='editor',extra={}) {
 const headers={'content-type':'application/json','origin':'https://test.example',...extra};
 if(user)headers['oai-authenticated-user-id']=user;
 const result=await worker.fetch(new Request('https://test.example/api/adp/demo/'+op,{method:op==='session'?'GET':'POST',headers,...(op==='session'?{}:{body:JSON.stringify(args)})}),env);
 return {status:result.status,...await result.json()};
}
assert.equal((await request('session',null,null)).status,401);
assert.equal((await request('session',null,'stranger')).canEdit,false);
assert.equal((await request('read',{path:'config/current'},'stranger')).status,403);
assert.equal((await request('session',null,'reader')).canEdit,false);
assert.equal((await request('session',null,'editor')).canEdit,true);
assert.equal((await request('session',null,'editor')).isOwner,false);
env.ADP_OWNERS='editor';
assert.equal((await request('session',null,'editor')).isOwner,true);
delete env.ADP_OWNERS;
assert.equal((await request('read',{path:'config/current'},'editor',{'x-adp-user':'other'})).status,409);
assert.equal((await request('write',{path:'config/current',mode:'set',data:{}},'reader')).status,403);
assert.equal((await request('write',{path:'config/current',mode:'set',data:{}},'editor',{origin:'https://evil.example'})).status,403);
for(const p of ['../x','a/../x','a//x','/a/b','a/b/','a\\b','a/\u0000x'])assert.equal((await request('read',{path:p})).status,400,p);
assert.deepEqual(await request('read',{path:'config/current'}),{status:200,exists:false,data:null,revision:0});
assert.equal((await request('write',{path:'config/current',mode:'set',data:{a:1,b:2},expectedRevision:0})).revision,1);
assert.equal((await request('write',{path:'config/current',mode:'update',data:{a:null},expectedRevision:1})).revision,2);
assert.deepEqual((await request('read',{path:'config/current'},'reader')).data,{a:null,b:2});
assert.equal((await request('write',{path:'config/current',mode:'set',data:{bad:true},expectedRevision:1})).status,409);
const race=await Promise.all([1,2].map(n=>request('write',{path:'config/current',mode:'set',data:{n},expectedRevision:2})));
assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
assert.equal((await request('write',{path:'config/current',mode:'delete',expectedRevision:3})).revision,4);
assert.deepEqual(await request('read',{path:'config/current'}),{status:200,exists:false,data:null,revision:4});
assert.equal((await request('write',{path:'config/current',mode:'set',data:{},expectedRevision:0})).status,409);
assert.equal((await request('write',{path:'config/current',mode:'set',data:{},expectedRevision:4})).revision,5);
assert.equal((await request('write',{path:'missing/current',mode:'update',data:{}})).status,404);
for(const [id,rank,status] of [['a',1,'active'],['b',3,'inactive'],['c',2,'active']])await request('write',{path:'ns/test/decisions/'+id,mode:'set',data:{rank,status}});
const q=await request('query',{path:'ns/test/decisions',where:[['status','==','active']],orderBy:[['rank','desc']],limit:1});
assert.deepEqual(q.docs.map(d=>d.id),['c']);
assert.equal((await request('query',{path:'ns/test/decisions',where:[['rank','>',0]]})).status,400);
assert.equal((await request('query',{path:'ns/test/decisions',limit:1001})).status,400);
for(const [id,data] of [['one',{n:1}],['two',{n:2}],['null',{n:null}],['missing',{}]]) await request('write',{path:'ordering/'+id,mode:'set',data});
for(const [direction,expected] of [['asc',['null','one','two','missing']],['desc',['two','one','null','missing']]]) {
 const ordered=await request('query',{path:'ordering',orderBy:[['n',direction]]});
 assert.deepEqual(ordered.docs.map(d=>d.id),expected);
}
assert.equal((await request('write',{path:'config/current',mode:'set',data:{x:'x'.repeat(262144)}})).status,413);
const wrongArtifact=await worker.fetch(new Request('https://test.example/api/adp/other/read',{method:'POST',headers:{'content-type':'application/json','oai-authenticated-user-id':'editor'},body:JSON.stringify({path:'config/current'})}),env);
assert.equal((await wrongArtifact.json()).exists,false);
async function mcp(method,params,user='editor') {
 const res=await worker.fetch(new Request('https://test.example/mcp',{method:'POST',headers:{'content-type':'application/json','oai-authenticated-user-id':user},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}),env);
 return res.json();
}
assert.deepEqual((await mcp('server/discover')).result.supportedVersions,['2026-07-28']);
assert.equal((await mcp('tools/list')).result.tools.length,4);
assert.equal((await mcp('tools/list',undefined,'stranger')).result.tools.length,4);
const ownSession=await mcp('tools/call',{name:'adp_session',arguments:{}},'stranger');
assert.deepEqual(JSON.parse(ownSession.result.content[0].text),{id:'stranger',canEdit:false,isOwner:false});
assert.equal((await mcp('tools/call',{name:'adp_read',arguments:{artifact:'demo',path:'config/current'}},'stranger')).result.isError,true);
assert.equal((await mcp('tools/call',{name:'adp_write',arguments:{artifact:'demo',path:'config/current',mode:'set',data:{},expectedRevision:5}},'reader')).result.isError,true);
assert.equal((await mcp('tools/call',{name:'adp_write',arguments:{artifact:'demo',path:'config/current',mode:'set',data:{},expectedRevision:5}})).result.isError,false);
assert.equal((await mcp('tools/call',{name:'adp_read',arguments:{artifact:'demo',path:'config/current'}})).result.isError,false);
assert.equal((await mcp('tools/call',{name:'adp_write',arguments:{artifact:'demo',path:'config/current',mode:'set',data:{}}})).result.isError,true);
console.log('Sites Worker: actual SQLite, auth, CAS, queries, tombstones and MCP passed');
// Browser adapter -> actual Worker request handler -> actual SQL (not hosted Dispatch).
const savedFetch=globalThis.fetch;
globalThis.fetch=async(url,init)=>{
 const headers=new Headers(init.headers);headers.set('oai-authenticated-user-id','editor');
 return worker.fetch(new Request('https://test.example'+url,{...init,headers}),env);
};
await import('../skill/assets/adapters/openai-sites.js');
await import('../skill/assets/adapters/openai.js');
const connect=()=>ADPOpenAIHost.create({profile:'sites',bridge:ADPOpenAISites.create({endpoint:'/api/adp/integration'})}).connect();
const first=await connect(), ref=first.db.doc('decisions/keep');
await ref.set({intent:'Portable understanding',status:'active'},{expectedRevision:0});
const second=await connect();
const turns=second.db.doc('requests/r1').collection('turns');
const added=await turns.add({text:'Portable reply'});
assert.equal((await added.get()).data().text,'Portable reply');
assert.equal((await turns.get()).docs[0].id,added.id);
await import('../skill/assets/adapters/openai-sites-comments.js');
const withComments=await ADPOpenAIHost.create({profile:'sites',bridge:ADPOpenAISites.create({endpoint:'/api/adp/integration',comments:true})}).connect();
assert.equal(typeof withComments.comments.customAnchors,'function');
const feedback=ADPOpenAISitesComments.create({db:second.db,user:second.user});
const thread=await feedback.create('intro','Keep the portable intent');
const requestRecord=await second.db.doc('requests/'+thread).get();
assert.equal(requestRecord.data().scope.id,'intro');
assert.equal(requestRecord.data().status,'open');
assert.equal(requestRecord.data().delivery,'queued');
await feedback.reply(thread,'Preserve the decision too');
assert.equal((await second.db.doc('requests/'+thread).collection('turns').get()).docs[0].data().text,'Preserve the decision too');
await feedback.resolve(thread,true);
assert.equal((await second.db.doc('requests/'+thread).get()).data().resolved,true);
const deniedFeedback=ADPOpenAISitesComments.create({db:second.db,user:{id:async()=>'reader',canEdit:async()=>false}});
await assert.rejects(deniedFeedback.create('intro','forbidden'),/Read-only/);
const transport=globalThis.fetch;let drop=true;
globalThis.fetch=async(...args)=>{const response=await transport(...args);if(drop && args[0].endsWith('/write')){drop=false;throw Error('injected lost reply');}return response;};
let unknown;try{await feedback.create('intro','Lost reply probe');}catch(error){unknown=error;}
assert.match(unknown.message,/unknown/);assert.equal(await unknown.inspect(),true);
globalThis.fetch=transport;
let wrote=false;
globalThis.fetch=async(...args)=>{if(wrote && args[0].endsWith('/read')){wrote=false;throw Error('readback offline');}const response=await transport(...args);if(args[0].endsWith('/write'))wrote=true;return response;};
try{await feedback.create('intro','Readback recovery probe');}catch(error){unknown=error;}
assert.equal(typeof unknown.inspect,'function');assert.equal(await unknown.inspect(),true);
globalThis.fetch=transport;
assert.equal((await second.db.doc('decisions/keep').get()).data().intent,'Portable understanding');
assert.equal((await second.db.collection('decisions').where('status','==','active').get()).docs.length,1);
const revision=(await ref.get()).revision;
await ref.update({feedback:'Agent should see this'},{expectedRevision:revision});
await assert.rejects(ref.set({bad:true},{expectedRevision:revision}),e=>e.status===409);
const agentRead=await mcp('tools/call',{name:'adp_read',arguments:{artifact:'integration',path:'decisions/keep'}});
assert.equal(JSON.parse(agentRead.result.content[0].text).data.feedback,'Agent should see this');
globalThis.fetch=savedFetch;
console.log('Node-executed browser bridge -> Worker handler -> SQLite -> new connection -> MCP read passed');

// Claude live receipt claude-r1: preserve nested fields, replace arrays/scalars,
// store null and literal dotted keys, delete only explicit marker fields.
await request('write',{path:'parity/current',mode:'set',data:{a:{x:1,y:2},arr:[1,2],gone:{x:1},unchanged:{keep:true}}});
await request('write',{path:'parity/current',mode:'update',data:{a:{y:9,z:3},arr:[3],nil:null,gone:{__delete__:true},'a.x':7}});
assert.deepEqual((await request('read',{path:'parity/current'})).data,{a:{x:1,y:9,z:3},arr:[3],nil:null,'a.x':7,unchanged:{keep:true}});
const beforeInvalid=await request('read',{path:'parity/current'});
assert.equal((await request('write',{path:'parity/current',mode:'update',data:{a:{__delete__:true,extra:1}}})).status,400);
assert.deepEqual(await request('read',{path:'parity/current'}),beforeInvalid);
const pollution=JSON.parse('{"__proto__":{"polluted":true}}');
await request('write',{path:'parity/current',mode:'update',data:pollution});
assert.equal({}.polluted,undefined);
assert.deepEqual((await request('read',{path:'parity/current'})).data.__proto__,{polluted:true});

assert.equal((await request('read',{path:'odd'})).status,400);
assert.equal((await request('read',{path:'ns/name/odd'})).status,400);
assert.equal((await request('query',{path:'even/path'})).status,400);

assert.equal((await request('write',{path:'kitfiles/samples~hello.txt',mode:'set',data:{text:'seed-pack id'}})).status,200);
assert.equal((await request('read',{path:'kitfiles/samples~hello.txt'})).data.text,'seed-pack id');

assert.equal((await mcp('tools/call',{name:'adp_read',arguments:{artifact:'bad@name',path:'config/current'}})).result.isError,true);

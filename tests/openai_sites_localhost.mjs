import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {request as httpRequest} from 'node:http';
import {start} from '../plugins/artifacts-done-properly/skills/adp/scripts/adp_sites_dev.mjs';
const dir=await mkdtemp(join(tmpdir(),'adp-sites-http-'));
const state=join(dir,'state'), publicDir=join(dir,'public');
await mkdir(publicDir);await writeFile(join(publicDir,'index.html'),'<h1>Custom artifact</h1>');
const config={port:0,state,user:'dev-user',readOnly:false};let host;
async function call(op,body,headers={}) {
 return fetch(host.url+'/api/adp/host-check/'+op,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
try {
 host=await start(config);
 assert.match(await(await fetch(host.url)).text(),/Sites host check/);
 assert.match(await(await fetch(host.url+'/openai-sites.js')).text(),/ADPOpenAISites/);
 assert.equal((await(await call('session',undefined,{'oai-authenticated-user-id':'attacker'})).json()).id,'dev-user');
 assert.equal((await call('write',{path:'intent/current',mode:'set',data:{intent:'Move knowledge'},expectedRevision:0})).status,200);
 assert.equal((await call('write',{path:'intent/current',mode:'set',data:{bad:true},expectedRevision:0})).status,409);
 assert.equal((await call('write',{path:'intent/current',mode:'set',data:{}},{Origin:'https://evil.example'})).status,403);
 assert.equal((await call('read',{path:'intent/current'},{'x-adp-user':'attacker'})).status,409);
 assert.equal(await new Promise((ok,no)=>{const r=httpRequest(host.url,{headers:{Host:'evil.example'}},res=>{res.resume();ok(res.statusCode)});r.on('error',no);r.end();}),403);
 await host.close();host=await start({...config,readOnly:true,dir:publicDir});
 assert.match(await(await fetch(host.url)).text(),/Custom artifact/);
 assert.equal((await(await call('read',{path:'intent/current'})).json()).data.intent,'Move knowledge');
 assert.equal((await call('write',{path:'intent/current',mode:'set',data:{bad:true}})).status,403);
 await symlink(join(state,'records.sqlite'),join(publicDir,'leak.sqlite'));
 assert.equal((await fetch(host.url+'/leak.sqlite')).status,404);
 await writeFile(join(dir,'secret.txt'),'secret');await symlink(join(dir,'secret.txt'),join(publicDir,'escape.txt'));
 assert.equal((await fetch(host.url+'/escape.txt')).status,404);
 await writeFile(join(publicDir,'.env'),'secret');await symlink(join(publicDir,'.env'),join(publicDir,'alias.txt'));
 assert.equal((await fetch(host.url+'/.env')).status,404);
 assert.equal((await fetch(host.url+'/alias.txt')).status,404);
 const mcp=await fetch(host.url+'/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'adp_read',arguments:{artifact:'host-check',path:'intent/current'}}})});
 assert.equal(JSON.parse((await mcp.json()).result.content[0].text).data.intent,'Move knowledge');
 console.log('Real localhost HTTP + disk SQLite reopen + same Worker API + MCP passed (identity simulated)');
} finally {if(host)await host.close();await rm(dir,{recursive:true,force:true});}

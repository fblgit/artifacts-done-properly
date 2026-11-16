#!/usr/bin/env node
/** Local Codex/Sites development host. Apache-2.0. Node 22+ with node:sqlite.
 * Executes the production Worker handler; identity and D1 binding are local adapters.
 * NEVER deploy this Node server or its simulated identity to Sites/public hosting.
 */
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFile, realpath, stat, mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve, dirname, sep, extname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import worker from '../assets/hosts/openai-sites/worker.mjs';

const base = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const usage = 'node skill/scripts/adp_sites_dev.mjs [--port 8788] [--state DIR] [--dir ARTIFACT_DIR] [--user dev-user] [--read-only]';
function options(argv) {
  const result = {port:8788,state:resolve('.adp-sites'),user:'dev-user',readOnly:false};
  for(let i=0;i<argv.length;i++) {
    const key=argv[i];
    if(key==='--help'){console.log(usage);return null;}
    if(key==='--read-only'){result.readOnly=true;continue;}
    if(!['--port','--state','--dir','--user'].includes(key) || i+1===argv.length)throw new Error(usage);
    result[key.slice(2)]=argv[++i];
  }
  result.port=Number(result.port);
  if(!Number.isInteger(result.port)||result.port<0||result.port>65535)throw new Error('Port must be 0..65535');
  if(!result.user || /[\r\n,]/.test(result.user))throw new Error('One nonempty local user ID required');
  result.state=resolve(result.state);
  if(result.dir)result.dir=resolve(result.dir);
  return result;
}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'};
export async function start(config) {
  await mkdir(config.state,{recursive:true});
  const stateRoot=await realpath(config.state);
  const databaseFile=resolve(stateRoot,'records.sqlite');
  const fresh=!existsSync(databaseFile);
  const sql=new DatabaseSync(databaseFile);
  sql.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  if(fresh) {
    sql.exec('BEGIN IMMEDIATE;');
    try {sql.exec(await readFile(resolve(base,'assets/hosts/openai-sites/schema.sql'),'utf8'));sql.exec('PRAGMA user_version=1; COMMIT;');}
    catch(error){sql.exec('ROLLBACK;');sql.close();throw error;}
  }
  if(sql.prepare('PRAGMA user_version').get().user_version!==1){sql.close();throw new Error('Unknown local schema version; refusing to modify it');}
  const env={ADP_EDITORS:config.readOnly?'':config.user,ADP_READERS:config.readOnly?config.user:'',DB:{
    prepare(query){return {bind(...args){const statement=sql.prepare(query);return {
      async first(){return statement.get(...args)||null;},
      async all(){return {results:statement.all(...args)};},
      async run(){return {meta:{changes:statement.run(...args).changes}};}
    };}};}
  }};
  const publicRoot=config.dir?await realpath(config.dir):null;
  const assets={
    '/':resolve(base,'assets/hosts/openai-sites/fixture.html'),
    '/adp.js':resolve(base,'assets/adp.js'),
    '/openai.js':resolve(base,'assets/adapters/openai.js'),
    '/openai-sites.js':resolve(base,'assets/adapters/openai-sites.js'),
    '/openai-sites-comments.js':resolve(base,'assets/adapters/openai-sites-comments.js')
  };
  async function staticFile(pathname) {
    if(publicRoot) {
      let decoded;
      try {decoded=decodeURIComponent(pathname);}catch{return null;}
      if(decoded.includes('\\') || decoded.includes('\0') || decoded.split('/').some(p=>p.startsWith('.')))return null;
      const candidate=resolve(publicRoot,'.'+(decoded==='/'?'/index.html':decoded));
      try {
        const actual=await realpath(candidate);
        if(actual!==publicRoot && !actual.startsWith(publicRoot+sep))return null;
        if(actual.slice(publicRoot.length+1).split(sep).some(p=>p.startsWith('.')))return null;
        // State is never served, even if it lives under the artifact directory.
        if(actual===stateRoot || actual.startsWith(stateRoot+sep))return null;
        if((await stat(actual)).isFile())return actual;
      }catch{}
    }
    return Object.hasOwn(assets,pathname)?assets[pathname]:null;
  }
  const server=createServer(async(incoming,outgoing)=>{
    try {
      const port=server.address().port, host=incoming.headers.host;
      if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(host)){outgoing.writeHead(403);outgoing.end('Invalid Host');return;}
      const url=new URL(incoming.url,'http://'+host);
      if(url.origin!=='http://'+host){outgoing.writeHead(403);outgoing.end('Invalid origin');return;}
      let response;
      if(url.pathname.startsWith('/api/adp/') || url.pathname==='/mcp') {
        const chunks=[];let bytes=0;
        for await(const chunk of incoming){bytes+=chunk.length;if(bytes>262144){outgoing.writeHead(413);outgoing.end('Request too large');return;}chunks.push(chunk);}
        const headers=new Headers();
        for(const [key,value] of Object.entries(incoming.headers)){
          if(key.startsWith('oai-') || ['host','connection','content-length','transfer-encoding'].includes(key))continue;
          if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);
        }
        // Fixed process identity only. Request headers cannot impersonate another local user.
        headers.set('oai-authenticated-user-id',config.user);
        const method=incoming.method||'GET';
        response=await worker.fetch(new Request(url,{method,headers,...(!['GET','HEAD'].includes(method)?{body:Buffer.concat(chunks)}:{})}),env);
      } else {
        if(!['GET','HEAD'].includes(incoming.method)){outgoing.writeHead(405);outgoing.end();return;}
        const file=await staticFile(url.pathname);
        response=file?new Response(await readFile(file),{headers:{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}}):new Response('Not found',{status:404});
      }
      outgoing.writeHead(response.status,Object.fromEntries(response.headers));
      outgoing.end(incoming.method==='HEAD'?undefined:Buffer.from(await response.arrayBuffer()));
    } catch(error) {
      if(!outgoing.headersSent)outgoing.writeHead(500,{'Content-Type':'application/json'});
      outgoing.end(JSON.stringify({error:'Local host failure'}));
      console.error(error.message);
    }
  });
  await new Promise((ok,no)=>{server.once('error',no);server.listen(config.port,'127.0.0.1',ok);});
  let closed=false;
  const close=()=>new Promise((ok,no)=>{if(closed){ok();return;}closed=true;server.close(error=>{sql.close();error?no(error):ok();});server.closeIdleConnections();});
  return {url:`http://127.0.0.1:${server.address().port}`,close};
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try {
    const config=options(process.argv.slice(2));
    if(config){
      const host=await start(config);
      console.log(JSON.stringify({url:host.url,state:config.state,identity:config.user,readOnly:config.readOnly,environment:'LOCAL-SIMULATED-IDENTITY',storage:'SQLite; production Worker handler'}));
      for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{host.close().then(()=>process.exit(0));});
    }
  }catch(error){console.error(error.message);process.exitCode=1;}
}

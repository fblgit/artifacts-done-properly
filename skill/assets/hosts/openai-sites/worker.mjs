/** ADP Sites transport. Apache-2.0. Deploy only behind Sites authenticated Dispatch. */
const MAX_BODY = 262144, MAX_DOCS = 1000;
const fail = (status, message) => { throw Object.assign(new Error(message), {status}); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const json = (body, status = 200) => Response.json(body, {status, headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function path(value, document = false) {
  if (typeof value !== 'string' || value.length > 512 || !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(value) || value.split('/').some(p => p === '.' || p === '..') || (document && !value.includes('/'))) fail(400, 'Invalid path');
  return value;
}
function access(request, env, sessionOnly = false) {
  // Headers are authenticated by Sites Dispatch, NOT safe on an exposed Worker URL.
  const id = request.headers.get('oai-authenticated-user-id');
  if (!id) fail(401, 'Sign in with ChatGPT');
  const members = name => String(env[name] || '').split(',').map(x => x.trim()).filter(Boolean);
  const canEdit = members('ADP_EDITORS').includes(id);
  if (!sessionOnly && !canEdit && !members('ADP_READERS').includes(id)) fail(403, 'Not an ADP member');
  if (request.headers.has('x-adp-user') && request.headers.get('x-adp-user') !== id) fail(409, 'Identity changed; reload');
  return {id, canEdit};
}
async function body(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) fail(415, 'JSON required');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'JSON required');
  const chunks = []; let size = 0;
  for (;;) { const {done,value} = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_BODY) { await reader.cancel(); fail(413,'Request too large'); } chunks.push(value); }
  const buffer = new Uint8Array(size); let offset=0; for (const chunk of chunks) {buffer.set(chunk,offset); offset+=chunk.byteLength;}
  try {const result=JSON.parse(new TextDecoder().decode(buffer)); if (!object(result)) fail(400,'JSON object required'); return result;} catch {fail(400,'Invalid JSON object');}
}
async function read(db, artifact, p) {
  const row = await db.prepare('SELECT data, revision FROM adp_records WHERE artifact = ? AND path = ?').bind(artifact,p).first();
  return {exists:!!row && row.data !== null, data:row?.data == null ? null : JSON.parse(row.data), revision:row?.revision || 0};
}
const field = (value, key) => key.split('.').reduce((v,k) => object(v) && Object.hasOwn(v,k) ? v[k] : undefined, value);
function scalar(value) {return value === null || ['string','number','boolean'].includes(typeof value);}
async function query(db, artifact, args) {
  const p = path(args.path), where = args.where || [], order = args.orderBy || [];
  if (!Array.isArray(where) || where.length > 10 || !Array.isArray(order) || order.length > 5) fail(400,'Invalid query');
  for (const clause of [...where,...order]) if (!Array.isArray(clause) || typeof clause[0] !== 'string' || !/^[\w.-]+$/.test(clause[0])) fail(400,'Invalid field');
  if (where.some(x => x.length !== 3 || x[1] !== '==' || !scalar(x[2])) || order.some(x => x.length !== 2 || !['asc','desc'].includes(x[1]))) fail(400,'Unsupported query');
  if (args.limit != null && (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > MAX_DOCS)) fail(400,'Invalid limit');
  const budget=await db.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(length(CAST(data AS BLOB))), 0) AS bytes FROM adp_records WHERE artifact = ? AND collection = ? AND data IS NOT NULL').bind(artifact,p).first();
  if(budget.count>MAX_DOCS || budget.bytes>1048576) fail(413,'Collection too large; partition it');
  const result=await db.prepare('SELECT path, data, revision FROM adp_records WHERE artifact = ? AND collection = ? AND data IS NOT NULL LIMIT ?').bind(artifact,p,MAX_DOCS+1).all();
  if (result.results.length > MAX_DOCS) fail(413,'Collection too large; partition it');
  let docs=result.results.map(r=>({id:r.path.slice(p.length+1),data:JSON.parse(r.data),revision:r.revision}));
  docs=docs.filter(d=>where.every(([k,,v])=>field(d.data,k)===v) && order.every(([k])=>field(d.data,k)!==undefined));
  docs.sort((a,b)=>{for(const [k,dir] of order){const x=field(a.data,k), y=field(b.data,k); if(x!==y)return (x<y?-1:1)*(dir==='desc'?-1:1);}return a.id<b.id?-1:a.id>b.id?1:0;});
  return {docs:docs.slice(0,args.limit || MAX_DOCS)};
}
async function write(db, artifact, args) {
  const p=path(args.path,true), collection=p.slice(0,p.lastIndexOf('/'));
  if (!['set','update','delete'].includes(args.mode)) fail(400,'Invalid write mode');
  if (args.mode !== 'delete' && !object(args.data)) fail(400,'Document must be an object');
  if (args.expectedRevision != null && (!Number.isSafeInteger(args.expectedRevision) || args.expectedRevision<0)) fail(400,'Invalid expected revision');
  // Tombstones preserve monotonic versions through deletion/recreation (avoid ABA).
  for(let attempt=0;attempt<5;attempt++) {
    const before=await read(db,artifact,p);
    if(args.expectedRevision != null && args.expectedRevision !== before.revision) fail(409,'Revision conflict');
    if(args.mode==='update' && !before.exists) fail(404,'Document does not exist');
    const data=args.mode==='delete'?null:JSON.stringify(args.mode==='update'?{...before.data,...args.data}:args.data);
    if(data !== null && new TextEncoder().encode(data).byteLength>MAX_BODY)fail(413,'Document too large');
    const revision=before.revision+1;
    let result;
    if(before.revision===0) result=await db.prepare('INSERT OR IGNORE INTO adp_records (artifact,path,collection,data,revision) VALUES (?,?,?,?,?)').bind(artifact,p,collection,data,revision).run();
    else result=await db.prepare('UPDATE adp_records SET data = ?, revision = ? WHERE artifact = ? AND path = ? AND revision = ?').bind(data,revision,artifact,p,before.revision).run();
    if(result.meta.changes===1)return {revision};
  }
  fail(409,'Concurrent write; reread before retry');
}
const tools = [
  {name:'adp_session',description:'Return this authenticated caller’s Site-scoped ID and editor status for membership setup. This grants no record access.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'adp_read',description:'Read one ADP record and its revision.',inputSchema:{type:'object',properties:{artifact:{type:'string'},path:{type:'string'}},required:['artifact','path'],additionalProperties:false}},
  {name:'adp_query',description:'Read a bounded collection of ADP records.',inputSchema:{type:'object',properties:{artifact:{type:'string'},path:{type:'string'}},required:['artifact','path'],additionalProperties:false}},
  {name:'adp_write',description:'Write one ADP record using an expected revision from adp_read. This does not publish Site source or wake another agent.',inputSchema:{type:'object',properties:{artifact:{type:'string'},path:{type:'string'},mode:{type:'string',enum:['set','update','delete']},data:{type:'object'},expectedRevision:{type:'integer',minimum:0}},required:['artifact','path','mode','expectedRevision'],additionalProperties:false}}
];
async function mcp(request,env,user) {
  const rpc=await body(request); const response=result=>json({jsonrpc:'2.0',id:rpc.id ?? null,result});
  if(rpc.jsonrpc!=='2.0')return json({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid request'}},400);
  if(rpc.method==='server/discover')return response({supportedVersions:['2026-07-28'],capabilities:{tools:{}}});
  if(rpc.method==='tools/list')return response({tools});
  if(rpc.method!=='tools/call')return json({jsonrpc:'2.0',id:rpc.id ?? null,error:{code:-32601,message:'Method not found'}});
  try {
    const args=rpc.params?.arguments, name=rpc.params?.name;
    if(!object(args))fail(400,'Arguments required');
    if(name==='adp_session')return response({content:[{type:'text',text:JSON.stringify(user)}],isError:false});
    access(request,env); // Discovering tool schemas/own identity never grants record access.
    const artifact=path(args.artifact); if(artifact.includes('/'))fail(400,'Invalid artifact');
    let result;
    if(name==='adp_read')result=await read(env.DB,artifact,path(args.path,true));
    else if(name==='adp_query')result=await query(env.DB,artifact,args);
    else if(name==='adp_write'){if(!user.canEdit)fail(403,'Read-only member');if(args.expectedRevision==null)fail(400,'Expected revision required'); result=await write(env.DB,artifact,args);}
    else fail(400,'Unknown tool');
    return response({content:[{type:'text',text:JSON.stringify(result)}],isError:false});
  } catch(error) {return response({content:[{type:'text',text:JSON.stringify({error:error.status?error.message:'Storage failure',status:error.status||500})}],isError:true});}
}
export default {
  async fetch(request,env) {
    try {
      const url=new URL(request.url), match=url.pathname.match(/^\/api\/adp\/([A-Za-z0-9_-]+)\/(session|read|query|write)$/);
      if(!match && url.pathname!=='/mcp')return new Response('Not found',{status:404});
      const user=access(request,env,match?.[2]==='session' || url.pathname==='/mcp');
      const origin=request.headers.get('origin');
      if(origin && origin!==url.origin)fail(403,'Cross-origin request denied');
      if(url.pathname==='/mcp'){if(request.method!=='POST')fail(405,'POST required');return await mcp(request,env,user);}
      const [,artifact,op]=match; path(artifact);
      if(op==='session'){if(request.method!=='GET')fail(405,'GET required');return json(user);}
      if(request.method!=='POST')fail(405,'POST required');
      const args=await body(request);
      if(op==='read')return json(await read(env.DB,artifact,path(args.path,true)));
      if(op==='query')return json(await query(env.DB,artifact,args));
      if(!user.canEdit)fail(403,'Read-only member');
      return json(await write(env.DB,artifact,args));
    } catch(error) {return json({error:error.status?error.message:'Storage unavailable'},error.status||503);}
  }
};

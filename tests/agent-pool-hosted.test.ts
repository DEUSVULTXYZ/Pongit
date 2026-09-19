import {test} from 'node:test';import assert from 'node:assert/strict';
import {provisionPoolArena,observePoolArenaReady} from '../relayer/src/agents/pool-hosted';
const app='0x0000000000000000000000000000000000000011';
function fixture(){const row:any={provision_epoch:null,provisioning:null},history:any[]=[];let locked=false;
 const db:any={connect:async()=>({release(){},query:async(sql:string,a:any[]=[])=>{
  if(sql.includes('pg_try_advisory_lock')){const ok=!locked;if(ok)locked=true;return{rows:[{ok}]};}
  if(sql.includes('pg_advisory_unlock')){locked=false;return{rows:[]};}
  if(sql.startsWith('SELECT'))return{rows:[row]};
  if(sql.startsWith('UPDATE')){row.provision_epoch=a[1];row.provisioning=structuredClone(a[2]);}
  if(sql.startsWith('INSERT INTO agent_pool.lifecycle_events'))history.push(structuredClone(a));return{rows:[]};
 }})};return{db,row,history};}
test('hosted creation writes its intent first and looks up a lost response without a second POST',async()=>{
 const f=fixture();let sends=0;
 await assert.rejects(provisionPoolArena(f.db,app,1n,undefined,(async(_url,init)=>{
  assert.equal(f.row.provisioning.state,'sending');assert.equal(init?.method,'POST');sends++;throw Error('lost response');
 }) as typeof fetch));
 assert.equal(f.row.provisioning.state,'uncertain');f.row.provisioning.retryAt=0;
 const url=await provisionPoolArena(f.db,app,1n,undefined,(async(_url,init)=>{
  assert.equal(init?.method,'GET');return Response.json({app,url:'https://test-arena.example'});
 }) as typeof fetch);
 assert.equal(url,'https://test-arena.example');assert.equal(sends,1);
});
test('a generic HTTP error cannot prove creation absent; only an explicit non-creating refusal permits retry',async()=>{
 for(const explicit of [false,true]){
  const f=fixture();await assert.rejects(provisionPoolArena(f.db,app,1n,undefined,(async()=>Response.json(explicit?{created:false}:{error:'busy'},{status:429,headers:{'retry-after':'10'}})) as typeof fetch));
  assert.equal(f.row.provisioning.state,explicit?'rejected':'uncertain');f.row.provisioning.retryAt=0;
  await provisionPoolArena(f.db,app,1n,undefined,(async(_url,init)=>{
   assert.equal(init?.method,explicit?'POST':'GET');return Response.json({app,url:'https://test-arena.example'});
  }) as typeof fetch);
 }
});
test('wrong application or changed node origin requires inspection and is never followed by another POST',async()=>{
 for(const response of [{app:'0x0000000000000000000000000000000000000012',url:'https://test-arena.example'},
 {app,url:'https://different.example'},{app,url:'https://user:secret@test-arena.example'}]){
  const f=fixture();await assert.rejects(provisionPoolArena(f.db,app,1n,'https://test-arena.example',(async()=>Response.json(response)) as typeof fetch),/identity or URL/);
  assert.equal(f.row.provisioning.state,'intervention');let calls=0;
  await assert.rejects(provisionPoolArena(f.db,app,1n,undefined,(async()=>{calls++;throw Error();}) as typeof fetch),/inspection/);assert.equal(calls,0);
 }
});

test('concurrent provisioning cannot create two hosted engines',async()=>{
 const f=fixture();let release!:()=>void,entered!:()=>void;
 const gate=new Promise<void>(r=>{release=r;}),begun=new Promise<void>(r=>{entered=r;});let sends=0;
 const first=provisionPoolArena(f.db,app,1n,undefined,(async()=>{sends++;entered();await gate;return Response.json({app,url:'https://test-arena.example'});}) as typeof fetch);
 await begun;
 await assert.rejects(provisionPoolArena(f.db,app,1n,undefined,(async()=>{sends++;throw Error('duplicate');}) as typeof fetch),/already reconciling/);
 release();await first;assert.equal(sends,1);
});

test('a persistently missing response or stale engine becomes an explicit intervention without another creation',async()=>{
 for(const kind of ['network','no-url','stale-node']){
  const f=fixture();await provisionPoolArena(f.db,app,1n,undefined,(async()=>Response.json({app,url:'https://test-arena.example'})) as typeof fetch);
  f.row.provisioning.at=Date.now()-301000;f.row.provisioning.retryAt=0;
  if(kind==='stale-node')await assert.rejects(observePoolArenaReady(f.db,app,1n,false),/never became ready/);
  else await assert.rejects(provisionPoolArena(f.db,app,1n,undefined,(async(_url,init)=>{
   assert.equal(init?.method,'GET');if(kind==='network')throw Error('offline');return Response.json({});
  }) as typeof fetch));
  assert.equal(f.row.provisioning.state,'intervention');
  assert(f.history.some(e=>e[2]==='sending'));assert(f.history.some(e=>e[2]==='intervention'));
 }
});

test('readiness requires the same persisted epoch and preserves previous creation evidence',async()=>{
 const f=fixture(),transport=(async()=>Response.json({app,url:'https://test-arena.example'})) as typeof fetch;
 await provisionPoolArena(f.db,app,1n,undefined,transport);await observePoolArenaReady(f.db,app,1n,true);
 assert.equal(f.row.provisioning.state,'ready');
 await provisionPoolArena(f.db,app,2n,undefined,transport);
 await assert.rejects(observePoolArenaReady(f.db,app,1n,true),/epoch changed/);
 assert.equal(f.row.provision_epoch,'2');assert(f.history.some(e=>e[1]==='1'&&e[2]==='ready'));
});

test('a previously returned URL stays pinned across process restarts',async()=>{
 const f=fixture();await provisionPoolArena(f.db,app,1n,undefined,(async()=>Response.json({app,url:'https://first.example'})) as typeof fetch);
 f.row.provisioning.retryAt=0;
 await assert.rejects(provisionPoolArena(f.db,app,1n,undefined,(async()=>Response.json({app,url:'https://second.example'})) as typeof fetch),/identity or URL/);
});

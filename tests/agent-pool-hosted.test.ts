import {configuredControl} from './fixtures/hosted-control';
import {test} from 'node:test';import assert from 'node:assert/strict';
import {provisionPoolArena as actualprovisionPoolArena,observePoolArenaReady} from '../relayer/src/agents/pool-hosted';
import {verifyHostedArenaEvidence,type HostedArenaEvidence} from '../shared/hosted-arena-identity';
const app='0x0000000000000000000000000000000000000011';
test('owner consent is created only for a new POST, never an uncertain lookup',async()=>{
 const f=fixture();let signs=0,sent=0;
 const transport=configuredControl((async(_url,init)=>{sent++;assert.equal(init?.method,sent===1?'POST':'GET');if(sent===1)throw Error('lost');return Response.json({app,url:'https://test-arena.example'});}) as typeof fetch);
 const consent=async(_control:string,t:typeof fetch)=>{signs++;return t;};
 await assert.rejects(actualprovisionPoolArena(f.db,app,1n,undefined,transport,undefined,undefined,consent),/lost/);
 f.row.provisioning.retryAt=0;
 await actualprovisionPoolArena(f.db,app,1n,undefined,transport,undefined,undefined,consent);
 assert.equal(signs,1);assert.equal(sent,2);
});
test('failed local consent does not journal or send a creation',async()=>{
 const f=fixture();let sent=0;
 const transport=configuredControl((async()=>{sent++;throw Error('must not send');}) as typeof fetch);
 await assert.rejects(actualprovisionPoolArena(f.db,app,1n,undefined,transport,undefined,undefined,async()=>{throw Error('owner changed');}),/owner changed/);
 assert.equal(sent,0);assert.equal(f.row.provisioning,null);
});
test('wrong control configuration cannot journal or send a new session',async()=>{
 const f=fixture(),urls:string[]=[];
 await assert.rejects(actualprovisionPoolArena(f.db,app,1n,undefined,(async input=>{
  urls.push(String(input));return Response.json({hub:'0x98922c6E5e4Bea62761C71D2401c7ec2c26eC43e',chainId:10143,
   validator:'0xa375CF27eD39491dB8302Ffc3dF4210Ad263eF43'});
 }) as typeof fetch),/configuration/);
 assert.deepEqual(urls,['https://interlude-control.fly.dev/config']);assert.equal(f.row.provisioning,null);
});
test('routing correction preserves an old uncertain POST and only looks up on its matching hub',async()=>{
 const f=fixture();f.row.provision_epoch='1';f.row.provisioning={state:'uncertain',at:1000,attempts:1,retryAt:0};
 const calls:{url:string;method:unknown}[]=[];
 const transport=configuredControl((async(input,init)=>{calls.push({url:String(input),method:init?.method});return Response.json({app,url:'https://test-arena.example'});}) as typeof fetch);
 await actualprovisionPoolArena(f.db,app,1n,undefined,transport);
 assert.deepEqual(calls,[{url:'https://interlude-control.fly.dev/sessions/'+app,method:'GET'}]);
 assert.equal(f.row.provisioning.control,'https://control.interludelayer.xyz');
 assert.equal(f.row.provisioning.lookupControl,'https://interlude-control.fly.dev');assert.equal(f.row.provisioning.attempts,1);
 assert.equal(f.history.filter(e=>e[2]==='sending').length,0);
});
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

test('a persistently missing response or slow engine keeps being looked up, alerts once and never creates again',async()=>{
 const warned:string[]=[],original=console.warn;console.warn=(line:unknown)=>{warned.push(String(line));};
 try{
  for(const kind of ['network','no-url','stale-node']){
   warned.length=0;
   const f=fixture();await provisionPoolArena(f.db,app,1n,undefined,(async()=>Response.json({app,url:'https://test-arena.example'})) as typeof fetch);
   f.row.provisioning.at=Date.now()-301000;f.row.provisioning.retryAt=0;
   const methods:string[]=[];
   const outage=(async(_url:unknown,init?:RequestInit)=>{methods.push(String(init?.method));if(kind==='network')throw Error('offline');return Response.json({});}) as typeof fetch;
   if(kind==='stale-node')await observePoolArenaReady(f.db,app,1n,false);
   else await assert.rejects(provisionPoolArena(f.db,app,1n,undefined,outage));
   // Past five minutes the arena is flagged for operators, not frozen.
   assert.notEqual(f.row.provisioning.state,'intervention',kind);assert(f.row.provisioning.stalledAt,kind);
   assert.equal(warned.filter(w=>w.includes('hosted-provisioning-stalled')).length,1,kind);
   if(kind!=='stale-node'){
    // A second failed lookup inside the alert window neither alerts again nor creates.
    f.row.provisioning.retryAt=0;await assert.rejects(provisionPoolArena(f.db,app,1n,undefined,outage));
    assert.equal(warned.filter(w=>w.includes('hosted-provisioning-stalled')).length,1,kind);
   }
   assert(methods.every(m=>m==='GET'),kind);
   assert.equal(f.history.filter(e=>e[2]==='sending').length,1,kind+': only the original creation');
   // As soon as control answers with the known node, the arena is adopted.
   f.row.provisioning.retryAt=0;
   assert.equal(await provisionPoolArena(f.db,app,1n,undefined,(async()=>Response.json({app,url:'https://test-arena.example'})) as typeof fetch),'https://test-arena.example');
   await observePoolArenaReady(f.db,app,1n,true);assert.equal(f.row.provisioning.state,'ready',kind);
  }
 }finally{console.warn=original;}
});

test('an ambiguity-only intervention from an older release resumes lookups; an identity change stays terminal',async()=>{
 for(const reason of ['response-lost','control-plane-http','missing-url','node-identity-not-ready']){
  const f=fixture();f.row.provision_epoch='1';f.row.provisioning={state:'intervention',reason,at:Date.now()-3600000,attempts:1,retryAt:0};
  const methods:string[]=[];
  assert.equal(await provisionPoolArena(f.db,app,1n,undefined,(async(_url:unknown,init?:RequestInit)=>{methods.push(String(init?.method));
   return Response.json({app,url:'https://test-arena.example'});}) as typeof fetch),'https://test-arena.example',reason);
  assert.deepEqual(methods,['GET'],reason+': resumed by lookup, never by a new creation');
 }
 const f=fixture();f.row.provision_epoch='1';f.row.provisioning={state:'intervention',reason:'identity-or-url',at:Date.now(),attempts:1,retryAt:0};
 let calls=0;await assert.rejects(provisionPoolArena(f.db,app,1n,undefined,(async()=>{calls++;return Response.json({});}) as typeof fetch),/inspection/);
 assert.equal(calls,0);
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

const expectation={app,epoch:10n,chainId:4242,baseBlock:66021799n,rulesVersion:15n,runtimeHash:'0x'+'12'.repeat(32)};
const evidence=():HostedArenaEvidence=>({session:{app,epoch:'10',chainId:4242,baseBlock:'66021799'},
 rulesVersion:15n,runtimeHash:expectation.runtimeHash,health:{app,epoch:'10',ok:true,committedBatches:0}});
test('a verified pinned node recovers the directory-404 incident during directory cooldown without a creation',async()=>{
 const f=fixture();f.row.provision_epoch='10';
 const prior={state:'uncertain',reason:'control-plane-http',http:404,at:Date.now()-3600000,attempts:1,retryAt:Date.now()+60000};
 f.row.provisioning={...prior};let discovery=0,probes=0;
 const url=await provisionPoolArena(f.db,app,10n,'https://pinned.example',(async()=>{discovery++;return Response.json({error:'no node for this app'},{status:404});}) as typeof fetch,
  {expected:expectation,inspect:async u=>{assert.equal(u,'https://pinned.example');probes++;return evidence();}});
 assert.equal(url,'https://pinned.example');assert.equal(discovery,0);assert.equal(probes,1);
 assert.equal(f.row.provisioning.state,'ready');assert.equal(f.row.provisioning.at,prior.at);assert.equal(f.row.provisioning.attempts,1);
 assert.equal(f.row.provisioning.http,404);assert.equal(f.row.provisioning.adopted.baseBlock,'66021799');
 assert.equal(f.history.filter(e=>e[2]==='sending').length,0);
});
test('a correctly identified pre-existing pinned node can be adopted before any local creation intent',async()=>{
 const f=fixture();let network=0;
 await provisionPoolArena(f.db,app,10n,'https://pinned.example',(async()=>{network++;throw Error('must not create');}) as typeof fetch,
  {expected:expectation,inspect:async()=>evidence()});
 assert.equal(network,0);assert.equal(f.row.provisioning.attempts,0);assert.equal(f.row.provisioning.state,'ready');
});
test('wrong identity, code, rules or publication cannot be adopted from a successful HTTP response',async()=>{
 const variants:HostedArenaEvidence[]=[
  {...evidence(),session:{...(evidence().session as any),app:'0x0000000000000000000000000000000000000012'}},
  {...evidence(),session:{...(evidence().session as any),epoch:9}},
  {...evidence(),session:{...(evidence().session as any),chainId:10143}},
  {...evidence(),session:{...(evidence().session as any),baseBlock:66021000}},
  {...evidence(),session:{...(evidence().session as any),baseBlock:null}},
  {...evidence(),rulesVersion:14n}, {...evidence(),runtimeHash:'0x'+'34'.repeat(32)},
  {...evidence(),health:{...(evidence().health as any),epoch:9}},
  {...evidence(),health:{...(evidence().health as any),ok:false}},
  {...evidence(),health:{...(evidence().health as any),halted:'publication failed'}},
 ];
 for(const bad of variants){
  assert.throws(()=>verifyHostedArenaEvidence(expectation,bad));
  const f=fixture();f.row.provision_epoch='10';f.row.provisioning={state:'uncertain',at:Date.now(),attempts:1,retryAt:Date.now()+60000};let network=0;
  await assert.rejects(provisionPoolArena(f.db,app,10n,'https://pinned.example',(async()=>{network++;throw Error('must not create');}) as typeof fetch,
   {expected:expectation,inspect:async()=>bad}),e=>(e as any).code==='AGENT_HOSTED_COOLDOWN');
  assert.equal(network,0);assert.equal(f.row.provisioning.state,'uncertain');assert.equal(f.row.provisioning.attempts,1);
 }
});
test('failed pinned checks are throttled independently and preserve uncertain creation journals',async()=>{
 const f=fixture();f.row.provision_epoch='10';f.row.provisioning={state:'uncertain',at:Date.now(),attempts:1,retryAt:Date.now()+60000};
 let probes=0,discovery=0;
 const check={expected:expectation,inspect:async()=>{probes++;throw Error('lost response');}};
 const transport=(async()=>{discovery++;throw Error('unexpected directory request');}) as typeof fetch;
 for(let n=0;n<3;n++)await assert.rejects(provisionPoolArena(f.db,app,10n,'https://pinned.example',transport,check),e=>(e as any).retryAt> Date.now());
 assert.equal(probes,1);assert.equal(discovery,0);assert.equal(f.history.filter(e=>e[2]==='sending').length,0);
});

test('restart can observe its verified paused node without claiming write readiness or depending on discovery',async()=>{
 const f=fixture();const paused={...evidence(),health:{...(evidence().health as any),ok:false,halted:'commit relay failed: 503'}};
 assert.throws(()=>verifyHostedArenaEvidence(expectation,paused),/publication/);
 let discovery=0;
 const url=await provisionPoolArena(f.db,app,10n,'https://pinned.example',(async()=>{discovery++;throw Error('404');}) as typeof fetch,
  {expected:expectation,inspect:async()=>paused,observePausedPublication:true});
 assert.equal(url,'https://pinned.example');assert.equal(discovery,0);
 assert.equal(f.row.provisioning.adopted.publicationReady,false);assert.equal(f.row.provisioning.attempts,0);
 for(const bad of [{...paused,session:{...(paused.session as any),epoch:9}},{...paused,rulesVersion:14n},
  {...paused,health:{...(paused.health as any),app:'0x0000000000000000000000000000000000000012'}}])
  assert.throws(()=>verifyHostedArenaEvidence(expectation,bad,{observePausedPublication:true}));
});

const provisionPoolArena=(...args:Parameters<typeof actualprovisionPoolArena>)=>{if(args[4])args[4]=configuredControl(args[4]);return actualprovisionPoolArena(...args);};

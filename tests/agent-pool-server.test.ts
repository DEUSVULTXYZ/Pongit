import test from 'node:test';
import assert from 'node:assert/strict';
import {startPoolReadService} from '../relayer/src/agents/pool-server';
import {poolNotFound,type AgentPoolReader} from '../relayer/src/agents/pool-read';

test('SSE and HTTP share one pending foreground entry read and retain canonical revisions',async()=>{
 const counts={config:0,challenge:0,backgroundEntry:0};
 let release!:()=>void;const ready=new Promise<void>(resolve=>{release=resolve;});
 const account='0x1111111111111111111111111111111111111111',hash=`0x${'22'.repeat(32)}`;
 const view=(value:any)=>({value,revision:'canonical-123',observedBlock:'123',observedHash:hash,observedTimestamp:'456'});
 const background=async()=>{counts.backgroundEntry++;return view({enabled:true});};
 const reader={client:{},config:background,challenge:background,
  live:async()=>view({items:[]}),tournaments:async()=>view({items:[]}),catalog:async()=>view({items:[]})} as unknown as AgentPoolReader;
 const foreground={client:{},config:async()=>{counts.config++;await ready;return view({enabled:true});},
  challenge:async()=>{counts.challenge++;await ready;return view({request:{stage:'admitted'}});}} as unknown as AgentPoolReader;
 const service=await startPoolReadService(reader,{host:'127.0.0.1',port:0,public:true,foregroundReader:foreground});
 const abort=new AbortController();
 try{
  const address=service.server.address();assert(address&&typeof address==='object');const base=`http://127.0.0.1:${address.port}/agents/`;
  const stream=await fetch(base+'events?account='+account,{signal:abort.signal});
  const body=stream.body!.getReader();await body.read();
  const config=fetch(base+'config'),challenge=fetch(base+'challenges/'+account);
  // Both transports are deliberately held at the same outstanding read.
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.deepEqual(counts,{config:1,challenge:1,backgroundEntry:0});release();
  for(const pending of [config,challenge]){
   const response=await pending;assert.equal(response.status,200);
   assert.equal(response.headers.get('etag'),'"canonical-123"');assert.equal((await response.json()).observation.hash,hash);
  }
  const event=new TextDecoder().decode((await body.read()).value);assert.match(event,/event: change/);assert.match(event,/canonical-123/);
  assert.deepEqual(counts,{config:1,challenge:1,backgroundEntry:0});
 }finally{release();abort.abort();await service.close();}
});

test('closed admissions retain HTTP configuration and canonical match reads without opening writes',async()=>{
 const app='0x1111111111111111111111111111111111111111';
 const view=(value:any)=>({value,revision:'one',observedBlock:'1',observedHash:'0x1',observedTimestamp:'1'});
 const reader={config:async()=>view({enabled:false}),match:async(ref:any)=>{
  if(ref.app!==app||ref.epoch!=='1'||ref.id!=='7')throw poolNotFound();
  return view({ref,result:{scoreA:7,scoreB:5}});
 }} as unknown as AgentPoolReader;
 const service=await startPoolReadService(reader,{host:'127.0.0.1',port:0,public:true});
 try{
  const address=service.server.address();assert(address&&typeof address==='object');const url=`http://127.0.0.1:${address.port}`;
  const config=await fetch(url+'/agents/config');assert.equal(config.status,200);assert.equal((await config.json() as any).enabled,false);
  const match=await fetch(url+`/agents/matches/${app}/1/7`);assert.equal(match.status,200);assert.equal((await match.json() as any).result.scoreA,7);
  const absent=await fetch(url+`/agents/matches/${app}/2/7`);assert.equal(absent.status,404);
  const mutation=await fetch(url+'/agents/transactions',{method:'POST',body:'{}'});assert.equal(mutation.status,405);
 }finally{await service.close();}
});

test('process health does not claim available sponsorship while its nonce is waiting for gas',async()=>{
 let funded=false;
 const service=await startPoolReadService({} as AgentPoolReader,{host:'127.0.0.1',port:0,public:false,
  sponsor:async()=>null,sponsorHealth:()=>({available:funded,...(funded?{}:{code:'OPERATOR_GAS_UNAVAILABLE'})})});
 try{
  const address=service.server.address();assert(address&&typeof address==='object');const url=`http://127.0.0.1:${address.port}/healthz`;
  const paused=await(await fetch(url)).json() as any;
  assert.equal(paused.process,'alive');assert.equal(paused.writes,true);
  assert.deepEqual(paused.sponsorship,{available:false,code:'OPERATOR_GAS_UNAVAILABLE'});
  funded=true;assert.deepEqual((await(await fetch(url)).json() as any).sponsorship,{available:true});
 }finally{await service.close();}
});

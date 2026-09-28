import test from 'node:test';
import assert from 'node:assert/strict';
import {startPoolReadService} from '../relayer/src/agents/pool-server';
import {poolNotFound,type AgentPoolReader} from '../relayer/src/agents/pool-read';

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

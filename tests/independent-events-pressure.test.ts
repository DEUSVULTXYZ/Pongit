import test from 'node:test';
import assert from 'node:assert/strict';
import {toHex,verifyTypedData,type Address} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {independentEventsPressure} from '../relayer/src/independent-events-pressure';
import {eventsPressureDomain,eventsPressureTypes,livePressureCheckpoint} from '../shared/rooms-live-pressure';

const app='0x0000000000000000000000000000000000000012',market='0x0000000000000000000000000000000000000013',hash=toHex(98,{size:32}),seed=toHex(5,{size:32});
async function fixture(){
 const key=generatePrivateKey(),signer=privateKeyToAccount(key),calls:any[]=[],journal:any[]=[],sends:any[]=[];
 const state:any={id:10n,phase:2,state:{mode:1,seed,scoreA:2,scoreB:1,awaitingServe:false},chaos:{physics:{score:{rally:37}}}};
 let changed=false,reorg=false,book=1n,marketEpoch=2n,queued:readonly bigint[]=[0n,0n,0n],paid:readonly bigint[]=[5n,7n];
 const manifest:any={rulesVersion:12,lobby:app,market,settlement:app,pressureSigner:signer.address,arenas:[{app}]};
 const db:any={query:async(sql:string,args:any[]=[])=>{
  if(sql.startsWith('INSERT INTO'))journal.push(args);
  return {rows:sql.startsWith('SELECT')?[{checkpoint:journal.at(-1)?.[8]}]:[]};
 }};
 let blockReads=0;
 const base:any={getBlockNumber:async()=>100n,getBlock:async()=>({hash:reorg&&++blockReads>1?toHex(99,{size:32}):hash}),readContract:async(o:any)=>{
  assert.equal(o.blockNumber,98n);calls.push(o.functionName);
  switch(o.functionName){
   case 'boundMatch':return {id:10n,epoch:2n};case 'books':return [0n,0n,book];
   case 'markets':return [app,marketEpoch];case 'pressure':return paid;
   case 'getSnapshot':return [10n,1n,2n,null,null,null,null,null,null,null,null,null,state.state];
   default:throw Error('Unexpected read '+o.functionName);
  }
 }};
 let refReads=0;
 const engine:any={app,busy:()=>false,reference:()=>({id:changed&&++refReads>1?11n:10n,epoch:2n}),read:async()=>state,
  node:{readContract:async(o:any)=>{assert.equal(o.functionName,'queuedPressure');return queued;},getBlock:async()=>({timestamp:1800000000n})},
  send:async(name:string,args:any[])=>sends.push({name,args})};
 const queuedOperations:string[]=[];
 const worker=await independentEventsPressure(db,base,manifest,key,async(_at,_abi,name)=>{queuedOperations.push(name);});
 return {worker,engine,state,signer,calls,journal,sends,queuedOperations,mutate:(options:{changed?:boolean;reorg?:boolean;book?:bigint;marketEpoch?:bigint;queued?:readonly bigint[];paid?:readonly bigint[]})=>{
  changed=options.changed??changed;reorg=options.reorg??reorg;book=options.book??book;marketEpoch=options.marketEpoch??marketEpoch;queued=options.queued??queued;paid=options.paid??paid;
 }};
}
test('live pressure uses confirmed payments and the real rally without awaitingServe',async()=>{
 const f=await fixture();await f.worker.checkpoint(f.engine);assert.equal(f.sends.length,1);assert.equal(f.sends[0].name,'submitLivePressure');
 const [message,signature]=f.sends[0].args;assert.equal(message.rally,37);assert.equal(message.sourceBlock,98n);assert.equal(message.expires,1800000025n);
 assert.equal(message.checkpoint,livePressureCheckpoint(app,market,10n,2n,seed,98n,hash,5n,7n));
 assert(await verifyTypedData({address:f.signer.address,domain:eventsPressureDomain(app),types:eventsPressureTypes,primaryType:'LivePressure',message,signature}));
 assert.equal(f.journal.length,1);assert.deepEqual(f.queuedOperations,[]);
});
test('new realtime market is opened once its current game is published',async()=>{
 const f=await fixture();f.mutate({book:0n});await f.worker.checkpoint(f.engine);assert.deepEqual(f.queuedOperations,['open']);assert.equal(f.sends.length,0);
 const other=await fixture();other.mutate({marketEpoch:0n});await other.worker.checkpoint(other.engine);assert.deepEqual(other.queuedOperations,['openRound']);
});
test('a changed match or reorganized source cannot produce a pressure signature',async()=>{
 const f=await fixture();f.mutate({changed:true});await f.worker.checkpoint(f.engine);assert.equal(f.sends.length,0);
 const reorg=await fixture();reorg.mutate({reorg:true});await assert.rejects(reorg.worker.checkpoint(reorg.engine),/reorganized/);assert.equal(reorg.sends.length,0);assert.equal(reorg.journal.length,0);
});
test('unchanged totals need no submission and decreasing confirmed totals fail safely',async()=>{
 const f=await fixture();f.mutate({queued:[5n,7n,97n]});await f.worker.checkpoint(f.engine);assert.equal(f.sends.length,0);
 const conflict=await fixture();conflict.mutate({queued:[6n,7n,97n]});await assert.rejects(conflict.worker.checkpoint(conflict.engine),/source changed/);assert.equal(conflict.sends.length,0);
});
test('an earlier epoch financial binding is not signed for the new engine',async()=>{
 const f=await fixture();f.mutate({marketEpoch:1n});await assert.rejects(f.worker.checkpoint(f.engine),/another arena epoch/);assert.equal(f.sends.length,0);assert.equal(f.journal.length,0);
});

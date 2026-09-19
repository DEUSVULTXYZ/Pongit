import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {isChaosEventsRules,chaosResolvesEveryContact,chaosContactResolution} from '../shared/chaos-rules';
import {loadRoomsFinance,financeAdapterAbi,type RoomsFinanceManifest} from '../relayer/src/rooms-finance-config';
import {chaosEventsSettlementAbi} from '../shared/abi-ChaosEventsSettlement';
import {initialChaosEvents,advanceChaosEvents,CHAOS_P as P,type ChaosPhysicsState} from '../shared/physics-chaos-events';
import {announceEffect} from '../shared/chaos-effects';

const address=(n:string)=>('0x'+n.padStart(40,'0')) as `0x${string}`;

test('human rules retain 6 and 8 history and add 9; agent rules are separate',()=>{
 assert.deepEqual([5,6,7,8,9,10,'8'].map(isChaosEventsRules),[false,true,false,true,true,false,false]);
 assert.deepEqual([6,7,8].map(chaosResolvesEveryContact),[false,false,true]);
 assert.deepEqual([6,7,8,9,10].map(chaosContactResolution),[false,false,true,'complete','complete']);
});

test('finance bindings accept historical and current human kernels but never agent kernels',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pongit-chaos-rules-')),old=process.env.ROOMS_FINANCE_MANIFEST;
 const events=(rulesVersion:number):RoomsFinanceManifest=>({app:address('a'),adapter:address('b'),market:address('c'),vault:address('d'),pressureSigner:address('e'),
  startBlock:'1',chainId:10143,financeId:'events-v2',settlement:'early-published-testnet',betting:'realtime',rulesVersion:rulesVersion as 8});
 try{
  process.env.ROOMS_FINANCE_MANIFEST=join(dir,'finance.json');
  for(const rules of [6,8,9]){
   await writeFile(process.env.ROOMS_FINANCE_MANIFEST,JSON.stringify([events(rules)]));await loadRoomsFinance();
   assert.equal(financeAdapterAbi(events(rules)),chaosEventsSettlementAbi);
  }
  for(const rules of [5,7,10]){
   await writeFile(process.env.ROOMS_FINANCE_MANIFEST,JSON.stringify([events(rules)]));
   await assert.rejects(loadRoomsFinance(),/Invalid rooms finance manifest/);
  }
 }finally{if(old===undefined)delete process.env.ROOMS_FINANCE_MANIFEST;else process.env.ROOMS_FINANCE_MANIFEST=old;await rm(dir,{recursive:true,force:true});}
});

test('the mirror plays either kernel: rules 6 lets the second Multiball ball through, rules 8 returns it',()=>{
 let s=initialChaosEvents(`0x${'00'.repeat(32)}`);[s.effects]=announceEffect(s.effects,21,0,0,1,10000);
 s.t=11_000_000n;s.nextForce=s.t;s=advanceChaosEvents(s,s.t,1)[0];
 const replay:ChaosPhysicsState={...s,score:{...s.score,a:1,rally:2},left:262n*P,t:13_470_000n,nextForce:13_470_000n};
 replay.balls=[{...s.balls[0],x:91n*P,y:261n*P,vx:-232_320_000n,vy:-116_160_000n,lastHitter:1},{...s.balls[1],x:91n*P,y:305n*P,vx:-232_320_000n,vy:-116_160_000n,lastHitter:1}];
 const [corrected]=advanceChaosEvents(replay,14_100_000n,128);
 const [legacy]=advanceChaosEvents(replay,14_100_000n,128,false,false);
 assert.equal(corrected.score.b,0);assert.equal(legacy.score.b,1,'rules 6: 1-0 became 1-1, as in production on 2026-09-18');
});

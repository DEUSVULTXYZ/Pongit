import test from 'node:test';
import assert from 'node:assert/strict';
import {applyIndependentArchive, type IndependentArchiveDeployment} from '../indexer/src/independent-archive';
import {applySeriesArchive} from '../indexer/src/chaos-archive';

const app='0x1111111111111111111111111111111111111111',ledger='0x2222222222222222222222222222222222222222';
const a='0x3333333333333333333333333333333333333333',b='0x4444444444444444444444444444444444444444';
function context(){
 const c:any={};
 for(const name of ['Match','Frame','Handicap','RecentReplays','Alert','Payout']){
  const rows=new Map<string,any>();c[name]={rows,get:async(id:string)=>rows.get(id),set:(v:any)=>rows.set(v.id,structuredClone(v)),
   deleteUnsafe:(id:string)=>rows.delete(id),getWhere:async(q:any)=>[...rows.values()].filter(row=>Object.entries(q).every(([key,v])=>row[key]===(v as any)._eq))};
 }
 return c;
}
function record(id:number){
 const first={arena:app,epoch:'2',id:String(id),a,b,winner:a,mode:1,ranked:true,status:3,scoreA:7,scoreB:5,hash:'0x'+'ab'.repeat(32)};
 return {first,latest:{...first},at:'100',finality:false};
}
const event=(id:number)=>({srcAddress:ledger,params:{id:BigInt(id)},block:{number:100+id,hash:'block'+id},logIndex:1});
const ref=(id:number)=>`10143:${app}:2:${id}`;
const bindings=(rulesVersion:IndependentArchiveDeployment['rulesVersion'])=>({[ledger]:{apps:[app],rulesVersion}});

for(const rules of [4,12,13,14] as const)test(`independent rules ${rules} retain their pinned version and original match reference`,async()=>{
 const c=context(),r=record(1);await applyIndependentArchive(c,event(1),r,bindings(rules));
 const indexed=c.Match.rows.get(ref(1));assert.equal(indexed.rulesVersion,rules);assert.equal(indexed.deployment,`10143:${ledger}`);
 assert.deepEqual(c.RecentReplays.rows.get(a).matches,[ref(1)]);
 r.finality=true;await applyIndependentArchive(c,event(1),r,bindings(rules));
 assert.equal(c.Alert.rows.size,0);assert.equal(c.Match.rows.get(ref(1)).endedAt,indexed.endedAt);
});

test('foreign ledger, arena and changed identity cannot write a published result',async()=>{
 for(const change of ['ledger','arena','epoch','id','a','b','mode','ranked','event-id']){
  const c=context(),r=record(1),e=event(1);
  if(change==='ledger')e.srcAddress=app;
  else if(change==='arena'){r.first.arena=ledger;r.latest.arena=ledger;}
  else if(change==='event-id')e.params.id=2n;
  else (r.latest as any)[change]=change==='ranked'?false:change==='mode'?0:'3';
  await assert.rejects(applyIndependentArchive(c,e,r,bindings(14)));
  assert.equal(c.Match.rows.size,0);assert.equal(c.RecentReplays.rows.size,0);
 }
});

test('human result corrections share retention with agents and never erase payment records',async()=>{
 const c=context();c.Payout.set({id:'prior-payment',amount:'7'});
 for(let id=1;id<=3;id++)await applyIndependentArchive(c,event(id),record(id),bindings(14));
 const pool='0x5555555555555555555555555555555555555555',botArena='0x6666666666666666666666666666666666666666';
 await applySeriesArchive(c,{...event(4),srcAddress:pool,params:{...record(4).latest,app:botArena,epoch:3,tournament:1n,elapsedUs:300000000n}},
  {[pool]:{apps:[botArena],rulesVersion:15}});
 assert.equal(c.Match.rows.get(ref(1)).replayAvailability,'pruned');
 assert.equal(c.Match.rows.get(ref(1)).rulesVersion,14);
 const changed=record(3);changed.latest.status=2;changed.latest.scoreA=6;
 await applyIndependentArchive(c,event(3),changed,bindings(14));
 assert(!c.RecentReplays.rows.get(a).matches.includes(ref(3)));
 assert.equal(c.Match.rows.get(ref(1)).replayAvailability,'pruned','a correction cannot recreate deleted frames');
 changed.latest.status=3;await applyIndependentArchive(c,event(3),changed,bindings(14));
 await applyIndependentArchive(c,event(3),changed,bindings(14));
 assert.equal(c.RecentReplays.rows.get(a).matches.length,3);assert.equal(c.Alert.rows.size,1,'same block diagnostic is deduplicated');
 assert.equal(c.Payout.rows.get('prior-payment').amount,'7');
});

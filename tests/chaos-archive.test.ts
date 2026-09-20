import test from 'node:test';
import assert from 'node:assert/strict';
import {applyChaosArchive,applySeriesArchive,chaosArchiveRules} from '../indexer/src/chaos-archive';
import {retainFinished} from '../indexer/src/retention';
import {initialChaosEvents} from '../shared/physics-chaos-events';
import {chaosLegacy} from '../shared/chaos-codec';
import {engineState} from '../shared/engine-stream';
import {restoreEngineFrame} from '../shared/engine-frame-json';
import {announceEffect} from '../shared/chaos-effects';
const app='0x1111111111111111111111111111111111111111',a='alice',b='bob';
function fixture(){const c:any={};for(const name of ['Match','Frame','Handicap','RecentReplays','Alert','Payout']){
 const rows=new Map<string,any>();c[name]={rows,get:async(id:string)=>rows.get(id),set:(v:any)=>rows.set(v.id,structuredClone(v)),deleteUnsafe:(id:string)=>rows.delete(id),getWhere:async(q:any)=>[...rows.values()].filter(row=>Object.entries(q).every(([key,v])=>row[key]===(v as any)._eq))};}return c;}
const event=(id:number,status=3,winner=a)=>({params:{app,id,epoch:1,a,b,winner,status,mode:id%2,ranked:true,scoreA:7,scoreB:5,played:true},block:{number:100+id,hash:`block-${id}-${status}-${winner}`},logIndex:1});

for(const version of [11,15] as const)test(`rules ${version} captures index distinct arenas, epochs and tournament references without an archive writer`,async()=>{
 const pool='0x2222222222222222222222222222222222222222',other='0x3333333333333333333333333333333333333333';
 const bindings={[pool]:{apps:[app,other],rulesVersion:version}},c=fixture();
 const capture=(id:number,arena=app,epoch=1,status=3)=>({...event(id,status),srcAddress:pool,
  params:{...event(id,status).params,app:arena,epoch,tournament:7n,elapsedUs:0n,finality:false}});
 for(const e of [capture(1),capture(2),capture(1,other),capture(3,app,2)])await applySeriesArchive(c,e,bindings);
 assert.equal(c.Match.rows.size,4);assert.equal(c.Match.rows.get(`10143:${app}:1:1`).replayAvailability,'pruned');
 const latest=`10143:${app}:2:3`,record=c.Match.rows.get(latest);
 assert.equal(record.rulesVersion,version);assert.equal(record.tournamentId,'7');assert.equal(record.played,true,'a concession after start is a played match');
 const finalized=capture(3,app,2);finalized.params.finality=true;await applySeriesArchive(c,finalized,bindings);
 assert.equal(c.RecentReplays.rows.get(a).matches.length,3);assert.equal(c.Alert.rows.size,0);assert.equal(c.Match.rows.get(latest).endedAt,record.endedAt);
 const cancelled=capture(4,app,2,4);await applySeriesArchive(c,cancelled,bindings);
 assert.equal(c.Match.rows.get(`10143:${app}:2:4`).replayAvailability,'not-played');assert.equal(c.RecentReplays.rows.get(a).matches.length,3);
 await assert.rejects(applySeriesArchive(c,capture(5,pool),bindings),/Unknown/);
 await assert.rejects(applySeriesArchive(c,{...capture(5),srcAddress:other},bindings),/Unknown/);
 const changed=capture(3,app,2);changed.params.scoreB=4;changed.block.hash='series-correction';
 await applySeriesArchive(c,changed,bindings);assert.equal(c.Alert.rows.size,1);
});
test('reusable capture shares retention with earlier series without relabelling their rules',async()=>{
 const oldPool='0x2222222222222222222222222222222222222222',newPool='0x3333333333333333333333333333333333333333',other='0x4444444444444444444444444444444444444444';
 const bindings={[oldPool]:{apps:[app],rulesVersion:11 as const},[newPool]:{apps:[other],rulesVersion:15 as const}},c=fixture();
 for(let i=1;i<=4;i++)await applySeriesArchive(c,{...event(i),srcAddress:i<4?oldPool:newPool,
  params:{...event(i).params,app:i<4?app:other,elapsedUs:300000000n,tournament:1n,finality:false}},bindings);
 assert.equal(c.Match.rows.get(`10143:${app}:1:1`).replayAvailability,'pruned');
 assert.equal(c.Match.rows.get(`10143:${app}:1:1`).rulesVersion,11);
 assert.equal(c.Match.rows.get(`10143:${other}:1:4`).rulesVersion,15);
 assert.equal(c.RecentReplays.rows.get(a).matches.length,3);
 await assert.rejects(applySeriesArchive(c,{...event(5),srcAddress:newPool},bindings),/Unknown/);
});

test('immutable archive bindings preserve historical rules 6 and index corrected rules 8 separately',async()=>{
 const old='0x2222222222222222222222222222222222222222',next='0x3333333333333333333333333333333333333333';
 const bindings={[old]:{app,rulesVersion:6 as const},[next]:{app,rulesVersion:8 as const}};
 for(const [address,version] of [[old,6],[next,8]] as const){
  const e={...event(version),srcAddress:address};const c=fixture();
  await applyChaosArchive(c,e,chaosArchiveRules(bindings,e));
  assert.equal(c.Match.rows.get(`10143:${app}:1:${version}`).rulesVersion,version);
 }
 assert.throws(()=>chaosArchiveRules(bindings,{srcAddress:app,params:{app}}),/Unknown/);
 assert.throws(()=>chaosArchiveRules(bindings,{srcAddress:next,params:{app:old}}),/Unknown/);
});
test('rules 6 shares three replay places with all four generations and keeps financial entities',async()=>{
 const c=fixture();for(let i=1;i<=4;i++)await retainFinished(c,{id:`v${i}:1`,playerA:a,playerB:b,played:true,status:3},String(i).padStart(20,'0'));
 c.Payout.set({id:'wallet-payment',amount:'7'});await applyChaosArchive(c,event(1));
 assert.equal(c.RecentReplays.rows.get(a).matches.length,3);assert.equal(c.RecentReplays.rows.get(b).matches.length,3);
 assert(c.RecentReplays.rows.get(a).matches.includes(`10143:${app}:1:1`));
 assert.equal(c.Match.rows.get('v2:1').replayAvailability,'pruned');assert.equal(c.Payout.rows.get('wallet-payment').amount,'7');
});
test('agents and human games share the same three replay places across modes and epochs',async()=>{
 const c=fixture();await retainFinished(c,{id:'v4:19',playerA:a,playerB:b,played:true,status:3},'00000000000000000090');
 await applyChaosArchive(c,event(1));await applyChaosArchive(c,event(2));
 const agentEvent=event(3);agentEvent.params.app='0x2222222222222222222222222222222222222222';agentEvent.params.epoch=2;
 await applyChaosArchive(c,agentEvent,7);
 assert.equal(c.Match.rows.get('v4:19').replayAvailability,'pruned');
 const ref=`10143:${agentEvent.params.app}:2:3`;
 assert.equal(c.Match.rows.get(ref).rulesVersion,7);assert(c.RecentReplays.rows.get(a).matches.includes(ref));
 assert.equal(c.RecentReplays.rows.get(a).matches.length,3);
});
test('correction, replayed archive notification and reorganization never double a retained place or restore deleted frames',async()=>{
 const c=fixture();for(let i=1;i<=5;i++)await applyChaosArchive(c,event(i));
 const old=`10143:${app}:1:1`;assert.equal(c.Match.rows.get(old).replayAvailability,'pruned');
 await applyChaosArchive(c,event(1,3,b));assert.equal(c.Match.rows.get(old).replayAvailability,'pruned');
 await applyChaosArchive(c,event(5,2));assert(!c.RecentReplays.rows.get(a).matches.includes(`10143:${app}:1:5`));
 await applyChaosArchive(c,event(5,3));await applyChaosArchive(c,event(5,3));
 assert.equal(new Set(c.RecentReplays.rows.get(a).matches).size,3);assert.equal(c.Alert.rows.size,3);
 const rebuilt=fixture();for(let i=1;i<=5;i++)await applyChaosArchive(rebuilt,event(i));assert.deepEqual(c.RecentReplays.rows.get(a).matches,rebuilt.RecentReplays.rows.get(a).matches);
});
test('serialized replay restores both balls, effects, actual rally and collision timestamps',()=>{
 const physics=initialChaosEvents(`0x${'01'.repeat(32)}`);physics.score.rally=14;physics.score.a=6;physics.score.b=5;
 [physics.effects]=announceEffect(physics.effects,21,0,0,99,0);physics.balls[1]={...physics.balls[0],alive:true,vy:-physics.balls[0].vy};
 const s=engineState([1n,24n,2n,app,app,app,app,32n,120000n,7n,9n,0n,chaosLegacy(physics),{physics,request:5n,pending:0n,collisions:[{sequence:3,rally:14,ball:1,kind:2,obstacle:0,at:50000n,x:42n,y:67n}]}]);
 const restored=restoreEngineFrame(JSON.parse(JSON.stringify(s,(_,v)=>typeof v==='bigint'?String(v):v)));
 assert.deepEqual(restored,s);restored.chaos!.physics.balls[1].x=7n;assert.notEqual(restored.chaos!.physics.balls[0].x,7n);
});
test('a corrected result evicts frames only after both players lose their retained reference',async()=>{
 const c=fixture();for(let i=1;i<=3;i++)await applyChaosArchive(c,event(i));
 const old=`10143:${app}:1:1`;c.Frame.set({id:'frame',matchId:old});c.Handicap.set({id:'pressure',matchId:old});
 await applyChaosArchive(c,event(4,2));assert.equal(c.Frame.rows.size,1);
 await applyChaosArchive(c,event(4,3));
 assert.equal(c.Match.rows.get(old).replayAvailability,'pruned');assert.equal(c.Frame.rows.size,0);assert.equal(c.Handicap.rows.size,0);
 const scoreCorrection=event(4);scoreCorrection.params.scoreB=4;scoreCorrection.block.hash='score-correction';
 await applyChaosArchive(c,scoreCorrection);assert.equal(c.Alert.rows.size,2);
 assert.equal(c.Match.rows.get(`10143:${app}:1:4`).scoreB,4);
});

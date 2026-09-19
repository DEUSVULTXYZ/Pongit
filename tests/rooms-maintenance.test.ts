import test from 'node:test';
import assert from 'node:assert/strict';
import {
 CHAOS_CANCEL_AFTER_US,FROZEN_REANCHOR_GAP_US,FROZEN_TICK_SPACING_MS,MatchProgress,chaosMatchFrozen,maintenanceTickDue,type MaintenanceMatch,
} from '../relayer/src/chaos-tick-guard';
import {
 ENGINE_COMMAND_GAS,ENGINE_COMMAND_GAS_FALLBACK,engineCommandGas,engineCommandGasFromEnv,engineCommandTransaction,parseEngineCommandGas,setEngineCommandGas,
} from '../shared/engine-gas';

test('the command gas limit: 30,000,000 by default, the operator may lower it without a rebuild, never raise it',()=>{
 assert.equal(engineCommandGasFromEnv({}),30_000_000n);
 assert.equal(engineCommandGasFromEnv({ROOMS_ENGINE_COMMAND_GAS:''}),30_000_000n);
 assert.equal(engineCommandGasFromEnv({ROOMS_ENGINE_COMMAND_GAS:'15000000'}),ENGINE_COMMAND_GAS_FALLBACK);
 assert.equal(engineCommandGasFromEnv({ROOMS_ENGINE_COMMAND_GAS:' 30000000 '}),30_000_000n);
 for(const bad of ['30000001','60000000','999999','15e6','15,000,000','-1','abc'])
  assert.throws(()=>engineCommandGasFromEnv({ROOMS_ENGINE_COMMAND_GAS:bad}),/ROOMS_ENGINE_COMMAND_GAS/,`${bad} stops startup`);
 for(const bad of [undefined,null,'',{},30_000_001,1.5,'0x1c9c380'])assert.equal(parseEngineCommandGas(bad),undefined,String(bad));
 assert.equal(parseEngineCommandGas(15_000_000),15_000_000n);assert.equal(parseEngineCommandGas('15000000'),15_000_000n);
});

test('the browser signs with the limit the relayer\'s config serves, and keeps its own on anything invalid',()=>{
 const app='0x0000000000000000000000000000000000000011';
 assert.equal(engineCommandGas(),ENGINE_COMMAND_GAS);
 try{
  assert.equal(setEngineCommandGas('15000000'),true);assert.equal(engineCommandGas(),15_000_000n);
  assert.equal(engineCommandTransaction(app,1,'0x').gas,15_000_000n,'the next control is signed at the served limit');
  assert.equal(engineCommandTransaction(app,1,'0x',30_000_000n).gas,30_000_000n,'the relayer passes its own');
  assert.equal(setEngineCommandGas(undefined),false,'an older relayer serves none');assert.equal(engineCommandGas(),15_000_000n);
  assert.equal(setEngineCommandGas('60000000'),false);assert.equal(engineCommandGas(),15_000_000n);
 }finally{setEngineCommandGas(ENGINE_COMMAND_GAS);}
 assert.equal(engineCommandGas(),30_000_000n);
});

// The maintenance loop and a frozen match (a relayer tick reverted, nothing moved it since).
const match=(over:Partial<MaintenanceMatch>={}):MaintenanceMatch=>({phase:2,awaitingServe:false,stale:true,clockUs:90_000_000n,tUs:81_540_000n,progressAgeMs:8_460,lastRevertAt:0,lastFrozenTickAt:0,...over});

test('maintenance: a live match that is not frozen is ticked after 1.5 s without progress, as before',()=>{
 assert.equal(maintenanceTickDue(100_000,match()),'tick');
 assert.equal(maintenanceTickDue(100_000,match({stale:false})),undefined);
 assert.equal(maintenanceTickDue(100_000,match({awaitingServe:true})),undefined);
 for(const phase of [0,1,3,4])assert.equal(maintenanceTickDue(100_000,match({phase})),undefined,`phase ${phase}`);
});

test('maintenance: a frozen match gets no 29 M-gas tick every 2 s, only one when its 30-minute cancel is due',()=>{
 // Frozen at t = 81.54 s; progress last seen at 10 s; its tick reverted 1 s ago.
 const frozen=(now:number,clockUs:bigint,over:Partial<MaintenanceMatch>={})=>match({clockUs,progressAgeMs:now-10_000,lastRevertAt:now-1_000,...over});
 let sent=0;
 for(let now=12_000;now<1_700_000;now+=2_000){
  const clockUs=81_540_000n+BigInt(now-10_000)*1000n;
  if(maintenanceTickDue(now,frozen(now,clockUs)))sent++;
 }
 assert.equal(sent,0,'about 845 reverts of 29 M gas each in the release, none now');
 // The contract's target (the snapshot clock) passes 30 minutes: one tick, which
 // cancels before simulating anything.
 const due=1_800_000;
 assert.equal(maintenanceTickDue(due,frozen(due,CHAOS_CANCEL_AFTER_US)),undefined,'exactly 30 minutes is not yet past');
 assert.equal(maintenanceTickDue(due,frozen(due,CHAOS_CANCEL_AFTER_US+10_000n)),'cancel');
 // Sent once; if the send itself failed, repeated only after the spacing.
 assert.equal(maintenanceTickDue(due+2_000,frozen(due+2_000,CHAOS_CANCEL_AFTER_US+2_010_000n,{lastFrozenTickAt:due})),undefined);
 assert.equal(maintenanceTickDue(due+FROZEN_TICK_SPACING_MS,frozen(due+FROZEN_TICK_SPACING_MS,CHAOS_CANCEL_AFTER_US+10_010_000n,{lastFrozenTickAt:due})),'cancel');
 assert.equal(CHAOS_CANCEL_AFTER_US,30n*60n*1_000_000n,'PongInterludeRoomsChaos: target > 30 minutes * 1_000_000');
});

test('maintenance: a frozen match whose node restarted and can re-anchor its clock is ticked once',()=>{
 // A reset block counter puts the snapshot clock back on the processed time; the
 // next command re-anchors and simulates nothing, at either gas limit.
 const now=50_000;
 const restarted=match({clockUs:81_540_000n,tUs:81_540_000n,stale:false,progressAgeMs:40_000,lastRevertAt:now-1_000});
 assert.equal(maintenanceTickDue(now,restarted),'reanchor');
 assert.equal(maintenanceTickDue(now,{...restarted,clockUs:81_540_000n+FROZEN_REANCHOR_GAP_US}),'reanchor');
 assert.equal(maintenanceTickDue(now,{...restarted,clockUs:81_540_000n+FROZEN_REANCHOR_GAP_US+10_000n}),undefined,'a growing gap stays frozen');
 assert(FROZEN_REANCHOR_GAP_US<540_000n,'within the worst-state tolerance at 15,000,000 too');
 // Progress after the revert unfreezes it: back to the usual rule.
 assert.equal(maintenanceTickDue(now,match({progressAgeMs:1_600,lastRevertAt:now-2_000})),'tick');
});

test('maintenance: progress ages without the applied-event stream',()=>{
 const p=new MatchProgress();
 assert.equal(p.age('1',100n,2,1_000),0);assert.equal(p.age('1',100n,2,3_000),2_000,'no progress');
 assert.equal(p.age('1',120n,2,4_000),0,'processed time moved');assert.equal(p.age('1',120n,4,5_000),0,'phase changed');
 assert.equal(p.age('1',120n,4,6_000),1_000);
 p.retain(id=>id!=='1');assert.equal(p.age('1',120n,4,7_000),0,'forgotten once unobserved');
 assert.equal(chaosMatchFrozen(10_000,{progressAgeMs:p.age('2',5n,2,10_000),lastRevertAt:9_000}),false,'a revert before the first observation');
});

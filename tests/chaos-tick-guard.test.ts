import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeFunctionData,parseAbi,parseTransaction} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {
 CHAOS_GUARD_INTERVAL_MS,CHAOS_GUARD_RETRY_BACKOFF_MS,CHAOS_GUARD_STALE_MS,
 ChaosTickOutcomes,chaosGuardBackoffMs,chaosGuardDue,chaosMatchFrozen,matchCommandInFlight,publicCommandKey,type ChaosGuardEngine,type ChaosGuardMatch,
} from '../relayer/src/chaos-tick-guard';
import {publicCommandResult} from '../relayer/src/rooms-engine-recovery';
import {CHAOS_GAP_TOLERANCE_MS,CHAOS_WORST_GAP_TOLERANCE_MS,ENGINE_COMMAND_GAS,engineCommandTransaction} from '../shared/engine-gas';

const id=`0x${'ab'.repeat(32)}`,other=`0x${'cd'.repeat(32)}`;
const engine=(over:Partial<ChaosGuardEngine>={}):ChaosGuardEngine=>({now:10_000,enabled:true,streamConnected:true,writable:true,cooldownMs:0,...over});
const live=(over:Partial<ChaosGuardMatch>={}):ChaosGuardMatch=>({phase:2,mode:1,awaitingServe:false,progressAgeMs:CHAOS_GUARD_STALE_MS,inFlight:false,blockedUntil:0,lastRevertAt:0,...over});

test('every game-node command is signed with 30,000,000 gas by default, the node maximum, at no fee',async()=>{
 assert.equal(ENGINE_COMMAND_GAS,30_000_000n);
 const app='0x0000000000000000000000000000000000000011',tx=engineCommandTransaction(app,7,'0x12345678');
 assert.deepEqual(tx,{type:'eip1559',chainId:4242,to:app,nonce:7,data:'0x12345678',value:0n,gas:30_000_000n,maxFeePerGas:0n,maxPriorityFeePerGas:0n});
 const signed=parseTransaction(await privateKeyToAccount(generatePrivateKey()).signTransaction(tx));
 assert.equal(signed.gas,30_000_000n);assert.equal(signed.maxFeePerGas??0n,0n);assert.equal(signed.maxPriorityFeePerGas??0n,0n);assert.equal(signed.chainId,4242);
});

test('a live Chaos match is ticked only after the stale threshold without observed progress',()=>{
 assert.equal(chaosGuardDue(engine(),live()),true);
 assert.equal(chaosGuardDue(engine(),live({progressAgeMs:CHAOS_GUARD_STALE_MS-1})),false);
 assert.equal(chaosGuardDue(engine(),live({progressAgeMs:120})),false,'players are advancing it');
 assert.equal(chaosGuardDue(engine(),live({progressAgeMs:5_000})),true);
});

test('never a Classic match, an offer, a finished or cancelled match, or a rally awaiting its serve',()=>{
 assert.equal(chaosGuardDue(engine(),live({mode:0})),false);
 for(const phase of [0,1,3,4])assert.equal(chaosGuardDue(engine(),live({phase})),false,`phase ${phase}`);
 assert.equal(chaosGuardDue(engine(),live({awaitingServe:true})),false);
});

test('never a second command for a match while one is queued or in flight, nor during its backoff',()=>{
 assert.equal(chaosGuardDue(engine(),live({inFlight:true})),false);
 assert.equal(chaosGuardDue(engine(),live({blockedUntil:10_001})),false);
 assert.equal(chaosGuardDue(engine(),live({blockedUntil:10_000})),true);
 const keys=[publicCommandKey(other,false),publicCommandKey(id,false,'feedface')];
 assert.equal(matchCommandInFlight(keys,id),true,'a pressure or beacon submission for the match');
 assert.equal(matchCommandInFlight([publicCommandKey(id,false)],id),true,'its own tick, which publicTick coalesces');
 assert.equal(matchCommandInFlight([publicCommandKey(other,false),publicCommandKey(other,true)],id),false,'another match only queues behind the writer');
 assert.equal(matchCommandInFlight([publicCommandKey('0',false)],id),true,'journal recovery may belong to any match');
 assert.equal(matchCommandInFlight([],id),false);
 assert.equal(publicCommandKey(id,false),`${id}:false:tick`);assert.equal(publicCommandKey(id,true),`${id}:true:tick`);
});

test('the guard follows the engine verdict: disabled, disconnected, not writable (halted included) or cooling down means no send',()=>{
 assert.equal(chaosGuardDue(engine({enabled:false}),live()),false);
 assert.equal(chaosGuardDue(engine({streamConnected:false}),live()),false);
 assert.equal(chaosGuardDue(engine({writable:false}),live()),false);
 assert.equal(chaosGuardDue(engine({cooldownMs:1}),live()),false);
});

test('a frozen match: after any relayer tick of it reverted, the guard stays silent until progress, however long',()=>{
 // Progress last observed at 9,000 (age 1,000 ms at now 10,000); the maintenance
 // loop's tick reverted at 9,600. The old fixed 5 s backoff expired and the guard
 // then followed every maintenance revert with a 29 M revert of its own.
 const frozen=live({progressAgeMs:1_000,lastRevertAt:9_600});
 assert.equal(chaosMatchFrozen(10_000,frozen),true);
 assert.equal(chaosGuardDue(engine(),frozen),false);
 for(const later of [15_000,60_000,1_800_000])
  assert.equal(chaosGuardDue(engine({now:later}),{...frozen,progressAgeMs:later-9_000,lastRevertAt:later-1_000}),false,`still frozen at ${later} ms`);
 // Progress after the revert (a node restart re-anchored the clock, or the
 // maintenance loop's tick got through): the guard resumes at once.
 const moved=live({progressAgeMs:CHAOS_GUARD_STALE_MS,lastRevertAt:9_000});
 assert.equal(chaosMatchFrozen(10_000,moved),false);
 assert.equal(chaosGuardDue(engine(),moved),true);
 assert.equal(chaosMatchFrozen(10_000,live({lastRevertAt:0})),false,'no revert');
});

test('tick outcomes are keyed by the executed command\'s match, cleared by a later success',()=>{
 const o=new ChaosTickOutcomes();
 o.record(other,'tick','failed',9_000);
 assert.equal(o.lastRevertAt(other),9_000);assert.equal(o.lastRevertAt(id),0,'another match\'s revert never freezes this one');
 o.record(id,'submitLivePressure','failed',9_100);assert.equal(o.lastRevertAt(id),0,'only ticks: a pressure proof can revert for its own reasons');
 o.record(other,'tick','observed',9_500);assert.equal(o.lastRevertAt(other),0,'a successful tick (a re-anchor after a node restart) unfreezes');
 o.record(id,'tick','failed',9_700);o.retain(x=>x!==id);assert.equal(o.lastRevertAt(id),0,'unwatched matches are forgotten');
 o.record(id,'tick','failed',9_800);o.clear();assert.equal(o.lastRevertAt(id),0,'a new epoch starts clean');
});

test('backoff scoping: a recovered entry of another match resolved inside a guard tick is never this match\'s revert',()=>{
 const abi=parseAbi(['function tick(uint256)']);
 const mine=encodeFunctionData({abi,functionName:'tick',args:[1n]}),theirs=encodeFunctionData({abi,functionName:'tick',args:[2n]});
 // The journal held match 2's pending tick; the guard asked to tick match 1.
 assert.equal(publicCommandResult('failed',mine,theirs),'reconciled');
 assert.equal(publicCommandResult('observed',mine,theirs),'reconciled');
 assert.equal(publicCommandResult('failed',mine,mine),'reverted');
 assert.equal(publicCommandResult('observed',mine,mine),'ok');
 assert.equal(publicCommandResult('failed',null,theirs),'reverted','journal recovery reports the entry it resolved');
 assert.equal(publicCommandResult('failed',mine.toUpperCase().replace('0X','0x') as `0x${string}`,mine),'reverted','hex case is not identity');
 // What the guard does with each: a reconciled entry (reverted or not) costs this
 // match nothing; its own revert is handled by the frozen rule, not a timer.
 assert.equal(chaosGuardBackoffMs(new Error('Previous engine command reconciled. The current action will be checked again.')),0);
 assert.equal(chaosGuardBackoffMs(new Error('Engine command reverted. The current game state will be checked before retrying.')),0);
 assert.equal(chaosGuardBackoffMs(new Error('fetch failed')),CHAOS_GUARD_RETRY_BACKOFF_MS);
 assert.equal(chaosGuardBackoffMs('opaque'),CHAOS_GUARD_RETRY_BACKOFF_MS);
});

// Relayer path from the node's last advance: one-way stream delivery, the stale
// threshold, at most one check interval, the nonce read and the one-way send.
const guardWorst=(rtt:number)=>rtt/2+CHAOS_GUARD_STALE_MS+CHAOS_GUARD_INTERVAL_MS+rtt+rtt/2;

test('tolerances: the worst measured state is two balls inside the gravity well',()=>{
 assert.deepEqual(CHAOS_GAP_TOLERANCE_MS,{oneBallWind:1410,curveShot:1350,twoBallWind:1140,twoBallWell:1030});
 assert.equal(CHAOS_WORST_GAP_TOLERANCE_MS,Math.min(...Object.values(CHAOS_GAP_TOLERANCE_MS)));
 assert.equal(CHAOS_WORST_GAP_TOLERANCE_MS,1030);
});

test('timing budget against the worst state: the guard fits up to a 215 ms round trip, the backup does not',()=>{
 assert.equal(guardWorst(120),840);
 assert(guardWorst(120)<CHAOS_WORST_GAP_TOLERANCE_MS,'two balls in the well at the VPS p50 round trip');
 assert(guardWorst(215)<=CHAOS_WORST_GAP_TOLERANCE_MS,'up to a 215 ms round trip');
 assert(guardWorst(220)>CHAOS_WORST_GAP_TOLERANCE_MS,'documented limit: beyond it the worst state can freeze');
 assert(guardWorst(250)<CHAOS_GAP_TOLERANCE_MS.twoBallWind,'two balls in the wind, up to a 250 ms round trip');
 assert(guardWorst(300)<CHAOS_GAP_TOLERANCE_MS.oneBallWind,'one ball in the wind at the VPS p99 round trip');
 assert(guardWorst(300)>CHAOS_GAP_TOLERANCE_MS.twoBallWind,'documented limit: two balls at p99 can still freeze');
 // The browser backup takes over 900 ms after the progress it observed.
 assert(900+2*120<CHAOS_GAP_TOLERANCE_MS.oneBallWind);
 assert(900+2*120>CHAOS_WORST_GAP_TOLERANCE_MS,'documented limit: the backup alone cannot rescue two balls in the well');
 // Above the primary's own cadence of 300 ms plus a quick round trip, so a healthy primary is not doubled.
 assert(CHAOS_GUARD_STALE_MS>=300+150);
});

test('the release limit could not absorb the backup takeover; the interim can, except in the worst state',()=>{
 const release={oneBallWind:730,twoBallWind:610,twoBallWell:540};
 assert(900>release.oneBallWind&&900<CHAOS_GAP_TOLERANCE_MS.oneBallWind);
 assert(guardWorst(120)>release.oneBallWind,'at 15M the guard alone could not have rescued the wind');
 assert(guardWorst(120)>release.twoBallWell);
 assert(CHAOS_GAP_TOLERANCE_MS.twoBallWell>=2*release.twoBallWell-100,'30 M roughly doubles the worst tolerance');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTransaction} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {
 CHAOS_GUARD_INTERVAL_MS,CHAOS_GUARD_RETRY_BACKOFF_MS,CHAOS_GUARD_REVERT_BACKOFF_MS,CHAOS_GUARD_STALE_MS,
 chaosGuardBackoffMs,chaosGuardDue,matchCommandInFlight,publicCommandKey,type ChaosGuardEngine,type ChaosGuardMatch,
} from '../relayer/src/chaos-tick-guard';
import {CHAOS_WIND_GAP_TOLERANCE_MS,ENGINE_COMMAND_GAS,engineCommandTransaction} from '../shared/engine-gas';

const id=`0x${'ab'.repeat(32)}`,other=`0x${'cd'.repeat(32)}`;
const engine=(over:Partial<ChaosGuardEngine>={}):ChaosGuardEngine=>({now:10_000,enabled:true,streamConnected:true,writable:true,cooldownMs:0,...over});
const live=(over:Partial<ChaosGuardMatch>={}):ChaosGuardMatch=>({phase:2,mode:1,awaitingServe:false,progressAgeMs:CHAOS_GUARD_STALE_MS,inFlight:false,blockedUntil:0,...over});

test('every game-node command is signed with exactly 30,000,000 gas, the node maximum, at no fee',async()=>{
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

test('the guard follows the engine verdict: disabled, disconnected, not writable or cooling down means no send',()=>{
 assert.equal(chaosGuardDue(engine({enabled:false}),live()),false);
 assert.equal(chaosGuardDue(engine({streamConnected:false}),live()),false);
 assert.equal(chaosGuardDue(engine({writable:false}),live()),false);
 assert.equal(chaosGuardDue(engine({cooldownMs:1}),live()),false);
});

test('a confirmed revert backs off for longer than a transport failure; a reconciled older entry does not',()=>{
 assert.equal(chaosGuardBackoffMs(new Error('Engine command reverted. The current game state will be checked before retrying.')),CHAOS_GUARD_REVERT_BACKOFF_MS);
 assert.equal(chaosGuardBackoffMs(new Error('Previous engine command reconciled. The current action will be checked again.')),0);
 assert.equal(chaosGuardBackoffMs(new Error('fetch failed')),CHAOS_GUARD_RETRY_BACKOFF_MS);
 assert.equal(chaosGuardBackoffMs('opaque'),CHAOS_GUARD_RETRY_BACKOFF_MS);
 assert(CHAOS_GUARD_REVERT_BACKOFF_MS>2000,'the 2 s maintenance loop keeps retrying a frozen match regardless');
});

// Relayer path from the node's last advance: one-way stream delivery, the stale
// threshold, at most one check interval, the nonce read and the one-way send.
const guardWorst=(rtt:number)=>rtt/2+CHAOS_GUARD_STALE_MS+CHAOS_GUARD_INTERVAL_MS+rtt+rtt/2;

test('timing budget: the guard and the backup takeover fit the measured 30M tolerances',()=>{
 assert.equal(guardWorst(120),840);
 assert(guardWorst(250)<CHAOS_WIND_GAP_TOLERANCE_MS.twoBalls,'two balls in the wind, up to a 250 ms round trip');
 assert(guardWorst(300)<CHAOS_WIND_GAP_TOLERANCE_MS.oneBall,'one ball in the wind at the VPS p99 round trip');
 assert(guardWorst(300)>CHAOS_WIND_GAP_TOLERANCE_MS.twoBalls,'documented limit: two balls at p99 can still freeze');
 // The browser backup takes over 900 ms after the progress it observed.
 assert(900+2*120<CHAOS_WIND_GAP_TOLERANCE_MS.oneBall);
 // Above the primary's own cadence of 300 ms plus a quick round trip, so a healthy primary is not doubled.
 assert(CHAOS_GUARD_STALE_MS>=300+150);
});

test('the release limit could not absorb the backup takeover; the interim can',()=>{
 const release={oneBall:730,twoBalls:610};
 assert(900>release.oneBall&&900<CHAOS_WIND_GAP_TOLERANCE_MS.oneBall);
 assert(CHAOS_WIND_GAP_TOLERANCE_MS.oneBall>=1400&&CHAOS_WIND_GAP_TOLERANCE_MS.twoBalls>=1100);
 assert(guardWorst(120)>release.oneBall,'at 15M the guard alone could not have rescued the wind');
});

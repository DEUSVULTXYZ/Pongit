import test from 'node:test';
import assert from 'node:assert/strict';
import {
 ENGINE_HALTED_CODE,ENGINE_HEALTH_TIMEOUT_MS,EngineHalted,engineHealth,haltRefusal,isEngineHalted,readEngineHealth,refusalReason,refusedBeforeExecution,
} from '../shared/engine-halt';
import {EngineHaltMonitor,roomsWriteVerdict,type EngineHaltState} from '../relayer/src/rooms-engine-halt';
// A getter read, so an assertion on one read does not narrow the next.
const state=(m:EngineHaltMonitor)=>m.state as EngineHaltState;
import {EnginePublicationUnavailable,publicationUnavailable,serviceError} from '../shared/service-error';

// The node's words on 2026-09-18 (batch 191) and on earlier incidents.
const haltedReason='batch 191 could not be settled (commit relay failed: 502 Bad Gateway: {"error":"commit failed: Missing or invalid parameters."}); refusing further transactions so they are not promised a commit this node cannot make';
const sendRefusal={name:'RpcRequestError',message:'RPC Request failed.',details:`this session is over and the node is no longer accepting transactions: ${haltedReason}`,code:-32000};
const capRefusal={name:'RpcRequestError',message:'RPC Request failed.',details:'transaction rejected before execution: transaction gas limit is greater than the cap',code:-32000};
const response=(body:unknown,status=200)=>new Response(typeof body==='string'?body:JSON.stringify(body),{status});

test('health: a halted report is a halt, an explicit healthy report is not, anything else is unknown',()=>{
 assert.deepEqual(engineHealth({halted:haltedReason,pendingDiffs:12}),{halted:haltedReason});
 assert.deepEqual(engineHealth({halted:true}),{halted:'halted'});
 for(const halted of [null,false,''])assert.deepEqual(engineHealth({halted,pendingDiffs:0}),{halted:null},String(halted));
 for(const body of [undefined,null,'ok',{},{pendingDiffs:3},{status:'ok'}])assert.equal(engineHealth(body),undefined,JSON.stringify(body));
 const long=engineHealth({halted:`failed at https://relay.example/commit with 0x${'ab'.repeat(40)} ${'x'.repeat(400)}`})!;
 assert(long.halted!.length<=240&&!long.halted!.includes('https://')&&!long.halted!.includes('abab'),'bounded, without URL or long hex');
});

test('health read: short timeout, and a failed, slow or unreadable read is unknown, never a halt',async()=>{
 assert(ENGINE_HEALTH_TIMEOUT_MS<=3000,'fits the 2 s maintenance loop beside interlude_session');
 let url='';let signal:AbortSignal|undefined;
 assert.deepEqual(await readEngineHealth('https://node.example/',{fetch:async(u,init)=>{url=String(u);signal=init?.signal??undefined;return response({halted:haltedReason});}}),{halted:haltedReason});
 assert.equal(url,'https://node.example/health');assert(signal,'aborts on timeout');
 assert.deepEqual(await readEngineHealth('https://node.example',{fetch:async()=>response({halted:null})}),{halted:null});
 assert.equal(await readEngineHealth('https://node.example',{fetch:async()=>{throw new TypeError('fetch failed');}}),undefined);
 assert.equal(await readEngineHealth('https://node.example',{fetch:async()=>response('<html>502</html>',502)}),undefined);
 assert.equal(await readEngineHealth('https://node.example',{fetch:async()=>response('Too many requests',429)}),undefined);
 // AbortSignal.timeout does not hold the event loop open; the relayer's server does.
 const alive=setTimeout(()=>{},5_000);
 const slow=await readEngineHealth('https://node.example',{timeoutMs:20,fetch:(_u,init)=>new Promise((_,reject)=>init!.signal!.addEventListener('abort',()=>reject(init!.signal!.reason)))});
 clearTimeout(alive);
 assert.equal(slow,undefined);
});

test('refusal patterns: the node\'s refusals before execution, nested in SDK and transport wrappers',()=>{
 assert.equal(refusedBeforeExecution(capRefusal),true);
 assert.equal(refusedBeforeExecution({message:'transaction gas limit is greater than the cap'}),true);
 assert.equal(refusedBeforeExecution(sendRefusal),true);
 assert.equal(haltRefusal(sendRefusal),true);assert.equal(haltRefusal(capRefusal),false);
 // engineTransport wraps a halted refusal as a publication failure; the node's words stay in the cause.
 const wrapped=new EnginePublicationUnavailable(sendRefusal);
 assert.equal(refusedBeforeExecution(wrapped),true);assert.equal(haltRefusal(wrapped),true);
 assert.equal(publicationUnavailable(wrapped),true,'players still get the publication-unavailable path');
 assert.equal(refusedBeforeExecution({shortMessage:'x',cause:{cause:{details:'transaction rejected before execution'}}}),true);
 assert.match(refusalReason(sendRefusal),/this session is over/);
});

test('refusal patterns: nothing else counts, least of all a lost response or a local gate',()=>{
 for(const error of [
  new TypeError('fetch failed'),{name:'TimeoutError',message:'The operation was aborted due to timeout'},
  {message:'nonce too low'},{message:'execution reverted'},{details:'commit relay failed: 413 Payload Too Large'},
  new EnginePublicationUnavailable(),// the transport's local 30 s write gate: the bytes never left the tab
  new EngineHalted(),// the local verdict never carries a node refusal of its own
  Object.assign(new Error('The game node is limiting requests. Waiting to synchronize.'),{status:429,code:'ENGINE_COOLDOWN'}),
  undefined,null,'opaque',
 ])assert.equal(refusedBeforeExecution(error),false,String((error as any)?.message??error));
});

test('EngineHalted is a 503 with a 30 s retry, never a player session problem',()=>{
 const e=new EngineHalted();
 assert.equal(e.code,ENGINE_HALTED_CODE);assert.equal(e.status,503);assert.equal(e.retryMs,30000);
 assert(!/passkey|session expired|reconnect your/i.test(e.message));
 assert.equal(isEngineHalted(e),true);assert.equal(isEngineHalted({code:ENGINE_HALTED_CODE}),true,'by code, across module copies');
 assert.equal(isEngineHalted(new EnginePublicationUnavailable()),false);assert.equal(isEngineHalted(undefined),false);
 assert.equal(serviceError(new EnginePublicationUnavailable(sendRefusal),'r').status,503);
});

test('halt monitor: health decides both ways, a failed health read changes nothing',()=>{
 let now=1_000;const m=new EngineHaltMonitor(()=>now);
 assert.equal(m.observe(undefined,6),undefined);assert.equal(state(m),null,'a fetch failure alone never marks the node halted');
 assert.equal(m.observe({halted:null},6),undefined);assert.equal(state(m),null);
 assert.equal(m.observe({halted:haltedReason},6),'halted');
 assert.deepEqual(state(m),{reason:haltedReason,source:'health',epoch:6,since:1_000});
 now=5_000;
 assert.equal(m.observe({halted:haltedReason},6),undefined,'reported once');assert.equal(state(m)?.since,1_000);
 assert.equal(m.observe(undefined,6),undefined);assert(state(m),'a fetch failure never clears a halt either');
 assert.equal(m.observe({halted:null},6),'recovered');assert.equal(state(m),null);
});

test('halt monitor: a send refused as "session over" halts at once; other send errors do not',()=>{
 const m=new EngineHaltMonitor(()=>7);
 assert.equal(m.refused(capRefusal,6),undefined,'a gas-cap refusal is not a halt');
 assert.equal(m.refused(new TypeError('fetch failed'),6),undefined);assert.equal(state(m),null);
 assert.equal(m.refused(new EnginePublicationUnavailable(sendRefusal),6),'halted');
 assert.equal(state(m)?.source,'send');assert.match(state(m)!.reason,/no longer accepting transactions/);
 assert.equal(m.refused(sendRefusal,6),undefined,'already halted');
 assert.equal(m.observe(undefined,6),undefined);assert(state(m),'unknown health keeps the halt');
});

test('halt monitor: a new epoch is a new node session',()=>{
 const m=new EngineHaltMonitor(()=>1);
 m.observe({halted:haltedReason},6);
 assert.equal(m.observe(undefined,7),'recovered','the renewed node decides again');assert.equal(state(m),null);
 assert.equal(m.observe({halted:'batch 3 could not be settled'},7),'halted');assert.equal(state(m)?.epoch,7);
});

test('the maintenance verdict: a halted node is not writable (online and admission false) and says ENGINE_HALTED',()=>{
 // 2026-09-18 20:11 to 2026-09-19 03:53: delegation active, no publication
 // failure recorded (no send was refused), lifecycle playing. Only /health knew.
 assert.deepEqual(roomsWriteVerdict({publicationBlocked:false,halted:false,lifecycleStage:'playing'}),{writable:true,code:'',message:''});
 const halted=roomsWriteVerdict({publicationBlocked:false,halted:true,lifecycleStage:'playing'});
 assert.equal(halted.writable,false);assert.equal(halted.code,ENGINE_HALTED_CODE);assert.match(halted.message,/stopped accepting moves/);
 // After 03:53 the delegation expired as well; the halt is the precise cause.
 assert.equal(roomsWriteVerdict({unavailable:{code:'ENGINE_DELEGATION_EXPIRED',message:'expired'},publicationBlocked:true,halted:true,lifecycleStage:'draining'}).code,ENGINE_HALTED_CODE);
 assert.equal(roomsWriteVerdict({publicationBlocked:true,halted:false,lifecycleStage:'playing'}).code,'ENGINE_PUBLICATION_UNAVAILABLE');
 assert.equal(roomsWriteVerdict({unavailable:{code:'ENGINE_DELEGATION_EXPIRED',message:'expired'},publicationBlocked:false,halted:false,lifecycleStage:'draining'}).code,'ENGINE_DELEGATION_EXPIRED');
 // Once the operator's forceClose moves the lifecycle on, its recovery stage is shown.
 for(const stage of ['challenge','finalizing','renewing','starting'])
  assert.equal(roomsWriteVerdict({publicationBlocked:false,halted:true,lifecycleStage:stage}).code,'ENGINE_RENEWING',stage);
 assert.equal(roomsWriteVerdict({publicationBlocked:false,halted:false}).writable,true,'no lifecycle configured');
});

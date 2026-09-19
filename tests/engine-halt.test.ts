import test from 'node:test';
import assert from 'node:assert/strict';
import {
 ENGINE_GAS_CAP_CODE,ENGINE_GAS_CAP_MESSAGE,ENGINE_HALTED_CODE,ENGINE_HALTED_MESSAGE,ENGINE_HEALTH_INTERVAL_MS,ENGINE_HEALTH_TIMEOUT_MS,EngineGasCapped,EngineHalted,
 engineHealth,gasCapRefusal,haltRefusal,healthApplies,isEngineGasCapped,isEngineHalted,readEngineHealth,refusalReason,retirableRefusal,
} from '../shared/engine-halt';
import {EngineGasCapMonitor,EngineHaltMonitor,roomsWriteVerdict,type EngineGasCapState,type EngineHaltState} from '../relayer/src/rooms-engine-halt';
import {engineCooldownMs,engineGate,engineTransport} from '../shared/engine-transport';
import {measuredFetch,rpcSamples} from '../shared/rpc-metrics';
// A getter read, so an assertion on one read does not narrow the next.
const state=(m:EngineHaltMonitor)=>m.state as EngineHaltState;
const capState=(m:EngineGasCapMonitor)=>m.state as EngineGasCapState;
import {EnginePublicationUnavailable,publicationUnavailable,serviceError} from '../shared/service-error';

// The node's words on 2026-09-18 (batch 191) and on earlier incidents.
const haltedReason='batch 191 could not be settled (commit relay failed: 502 Bad Gateway: {"error":"commit failed: Missing or invalid parameters."}); refusing further transactions so they are not promised a commit this node cannot make';
const sendRefusal={name:'RpcRequestError',message:'RPC Request failed.',details:`this session is over and the node is no longer accepting transactions: ${haltedReason}`,code:-32000};
const capRefusal={name:'RpcRequestError',message:'RPC Request failed.',details:'transaction rejected before execution: transaction gas limit is greater than the cap',code:-32000};
const response=(body:unknown,status=200,headers?:Record<string,string>)=>new Response(typeof body==='string'?body:JSON.stringify(body),{status,headers});
const app='0x78d3341e3452d7ec1add9371de3008639eed8eb0';

test('health: a halted report is a halt, an explicit healthy report is not, anything else is unknown',()=>{
 assert.deepEqual(engineHealth({halted:haltedReason,pendingDiffs:12}),{halted:haltedReason});
 assert.deepEqual(engineHealth({halted:true}),{halted:'halted'});
 for(const halted of [null,false,''])assert.deepEqual(engineHealth({halted,pendingDiffs:0}),{halted:null},String(halted));
 for(const body of [undefined,null,'ok',{},{pendingDiffs:3},{status:'ok'}])assert.equal(engineHealth(body),undefined,JSON.stringify(body));
 const long=engineHealth({halted:`failed at https://relay.example/commit with 0x${'ab'.repeat(40)} ${'x'.repeat(400)}`})!;
 assert(long.halted!.length<=240&&!long.halted!.includes('https://')&&!long.halted!.includes('abab'),'bounded, without URL or long hex');
});

test('health: the report names its session (app, epoch) as the node\'s /health does, and only a matching one applies',()=>{
 // The shape a hosted node served on 2026-09-08 (docs/validation/chaos-recovery-2026-09-09.json).
 const report=engineHealth({app:'0x78D3341E3452d7ec1add9371de3008639eed8eb0',chainId:4242,epoch:6,halted:haltedReason,ok:false,pendingDiffs:12})!;
 assert.deepEqual(report,{halted:haltedReason,app,epoch:6});
 assert.equal(healthApplies(report,{app,epoch:6}),true);
 assert.equal(healthApplies(report,{app,epoch:7}),false,'a report of the halted epoch 6 never halts the renewed epoch 7');
 assert.equal(healthApplies({halted:null,app,epoch:7},{app,epoch:6}),false,'nor does a renewed node\'s report clear epoch 6 early');
 assert.equal(healthApplies({...report,app:'0x0000000000000000000000000000000000000011'},{app,epoch:6}),false,'another application');
 assert.equal(healthApplies({halted:haltedReason},{app,epoch:6}),true,'a report that names neither is the session\'s own');
 assert.deepEqual(engineHealth({halted:null,epoch:'7',app:'not an address'}),{halted:null,epoch:7},'unusable fields are left out, never guessed');
});

test('health read: short timeout, and a failed, slow or unreadable read is unknown, never a halt',async()=>{
 assert(ENGINE_HEALTH_TIMEOUT_MS<ENGINE_HEALTH_INTERVAL_MS,'one read at a time on its own schedule, apart from the 2 s maintenance loop');
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

test('health read: through the node\'s shared cooldown and RPC metrics',async()=>{
 const node='https://health-gate.invalid';engineTransport(node);// registers the node's gate, as the relayer's client does
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return response('Busy',429,{'retry-after':'2'});};
 try{
  const read=()=>readEngineHealth(node,{gate:engineGate(node),fetch:measuredFetch('interlude','health')});
  assert.equal(await read(),undefined,'a 429 is unknown, never a halt');
  assert.equal(calls,1);
  const cooldown=engineCooldownMs(node);
  assert(cooldown>1000&&cooldown<=2000,'the /health Retry-After holds every request to this node');
  assert.equal(await read(),undefined);
  assert.equal(calls,1,'refused locally while the cooldown runs');
  assert(rpcSamples().some(x=>x.target==='interlude'&&x.method==='health'&&x.status===429),'measured as "health"');
 }finally{globalThis.fetch=original;}
});

test('refusal patterns: only the gas cap and a halted node retire, nested in SDK and transport wrappers',()=>{
 assert.equal(retirableRefusal(capRefusal),true);
 assert.equal(retirableRefusal({message:'transaction gas limit is greater than the cap'}),true);
 assert.equal(retirableRefusal(sendRefusal),true);
 assert.equal(haltRefusal(sendRefusal),true);assert.equal(haltRefusal(capRefusal),false);
 assert.equal(gasCapRefusal(capRefusal),true);assert.equal(gasCapRefusal(sendRefusal),false);
 // engineTransport wraps a halted refusal as a publication failure; the node's words stay in the cause.
 const wrapped=new EnginePublicationUnavailable(sendRefusal);
 assert.equal(retirableRefusal(wrapped),true);assert.equal(haltRefusal(wrapped),true);
 assert.equal(publicationUnavailable(wrapped),true,'players still get the publication-unavailable path');
 assert.equal(retirableRefusal({shortMessage:'x',cause:{cause:{details:'transaction gas limit is greater than the cap'}}}),true);
 assert.match(refusalReason(sendRefusal),/this session is over/);
 assert.match(refusalReason(capRefusal),/rejected before execution: transaction gas limit is greater than the cap/);
});

test('refusal patterns: the generic "rejected before execution" alone never retires',()=>{
 // A duplicate resend answered this way while the original is still in flight
 // also sees its nonce unused; retiring those bytes could free a nonce they take later.
 for(const error of [
  {details:'transaction rejected before execution'},
  {details:'transaction rejected before execution: already known'},
  {shortMessage:'x',cause:{cause:{details:'transaction rejected before execution: nonce is being processed'}}},
 ]){
  assert.equal(retirableRefusal(error),false,JSON.stringify(error));
  assert.equal(gasCapRefusal(error),false);assert.equal(haltRefusal(error),false);
  assert.match(refusalReason(error),/rejected before execution/,'still logged as a refusal');
 }
});

test('refusal patterns: nothing else counts, least of all a lost response or a local gate',()=>{
 for(const error of [
  new TypeError('fetch failed'),{name:'TimeoutError',message:'The operation was aborted due to timeout'},
  {message:'nonce too low'},{message:'execution reverted'},{details:'commit relay failed: 413 Payload Too Large'},
  new EnginePublicationUnavailable(),// the transport's local 30 s write gate: the bytes never left the tab
  new EngineHalted(),// the local verdict never carries a node refusal of its own
  new EngineGasCapped(),// nor does the local gas-cap verdict
  Object.assign(new Error('The game node is limiting requests. Waiting to synchronize.'),{status:429,code:'ENGINE_COOLDOWN'}),
  undefined,null,'opaque',
 ])assert.equal(retirableRefusal(error),false,String((error as any)?.message??error));
});

test('EngineHalted and EngineGasCapped are 503s with a 30 s retry, never a player session problem',()=>{
 const e=new EngineHalted();
 assert.equal(e.code,ENGINE_HALTED_CODE);assert.equal(e.status,503);assert.equal(e.retryMs,30000);
 assert(!/passkey|session expired|reconnect your/i.test(e.message));
 assert.equal(isEngineHalted(e),true);assert.equal(isEngineHalted({code:ENGINE_HALTED_CODE}),true,'by code, across module copies');
 assert.equal(isEngineHalted(new EnginePublicationUnavailable()),false);assert.equal(isEngineHalted(undefined),false);
 assert.equal(serviceError(new EnginePublicationUnavailable(sendRefusal),'r').status,503);
 const cap=new EngineGasCapped();
 assert.equal(cap.code,ENGINE_GAS_CAP_CODE);assert.equal(cap.status,503);assert.equal(cap.retryMs,30000);
 assert.equal(isEngineGasCapped(cap),true);assert.equal(isEngineGasCapped(e),false);assert.equal(isEngineHalted(cap),false);
});

test('the halt message never claims that finished results are saved',()=>{
 // A batch the node could not settle is lost with its epoch: the match of
 // 2026-09-18 ended (cancelled) on the node and resumes from Monad's state.
 assert(!/results? (are|is) saved|finished results/i.test(ENGINE_HALTED_MESSAGE),ENGINE_HALTED_MESSAGE);
 assert.match(ENGINE_HALTED_MESSAGE,/session is saved/);
 assert.match(ENGINE_HALTED_MESSAGE,/not yet published resume from their last published state/);
 assert(!/results? (are|is) saved/i.test(ENGINE_GAS_CAP_MESSAGE));
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

test('gas-cap monitor: a gas-cap refusal makes the node unavailable for that epoch and limit, nothing else does',()=>{
 const m=new EngineGasCapMonitor(()=>9);
 for(const error of [sendRefusal,{details:'transaction rejected before execution'},new TypeError('fetch failed'),new EngineGasCapped()])
  assert.equal(m.refused(error,7,30_000_000n),false,String((error as any)?.details??(error as any)?.message));
 assert.equal(capState(m),null);
 assert.equal(m.refused(new EnginePublicationUnavailable(capRefusal),7,30_000_000n),true);
 assert.deepEqual({...capState(m),reason:undefined},{gas:'30000000',epoch:7,since:9,reason:undefined});
 assert.match(capState(m)!.reason,/transaction gas limit is greater than the cap/);
 assert.equal(m.refused(capRefusal,7,30_000_000n),false,'reported once');
 assert.equal(m.observe(7),false);assert(capState(m),'the same epoch keeps it: every command at this limit would be refused');
 assert.equal(m.observe(8),true,'a new epoch\'s node decides again');assert.equal(capState(m),null);
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

test('the maintenance verdict: a gas-cap refusal closes the arena (online and admission false) with ENGINE_GAS_CAP',()=>{
 const capped=roomsWriteVerdict({publicationBlocked:false,gasCapped:true,halted:false,lifecycleStage:'playing'});
 assert.deepEqual(capped,{writable:false,code:ENGINE_GAS_CAP_CODE,message:ENGINE_GAS_CAP_MESSAGE});
 assert.match(capped.message,/operator/);
 assert.equal(roomsWriteVerdict({publicationBlocked:true,gasCapped:true,halted:false,lifecycleStage:'playing'}).code,ENGINE_GAS_CAP_CODE,'more precise than a publication failure');
 assert.equal(roomsWriteVerdict({publicationBlocked:false,gasCapped:true,halted:true,lifecycleStage:'playing'}).code,ENGINE_HALTED_CODE,'a halted node refuses every command, whatever its gas');
 assert.equal(roomsWriteVerdict({publicationBlocked:false,gasCapped:true,halted:false,lifecycleStage:'renewing'}).code,'ENGINE_RENEWING');
});

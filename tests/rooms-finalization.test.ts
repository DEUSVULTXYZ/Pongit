import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicClient,custom,decodeFunctionData,encodeFunctionResult,parseAbi,zeroHash,type Hex} from 'viem';
import {FINALIZATION_READ_ATTEMPTS,FinalizationMemory,finalizationVerdict,nextFinalization,publishedResultReader,financeGameAbi,type PublishedResult} from '../relayer/src/rooms-finalization';
import {roomsEventsAbi} from '../shared/abi-PongChaosEvents';

const hash=`0x${'12'.repeat(32)}` as Hex;
// The match of 2026-09-18: the halted node cancelled it (phase 4, in il_results),
// but Monad's published state is phase 2 at 81.54 s, 4-6, with no result hash.
const stuck='15508105729549036396166434651117196823296587055133484651289937508406096101523';
const published=(over:Partial<PublishedResult>={}):PublishedResult=>({phase:3,resultHash:hash,finishedAt:1_789_000_000n,matchEpoch:6n,now:1_789_000_100n,...over});

test('finalizeResult\'s own requirements decide: published terminal result, result hash, match epoch, finish time',()=>{
 assert.equal(finalizationVerdict(published()),'ready');
 assert.equal(finalizationVerdict(published({phase:4})),'ready','a published cancel is final too (refunds)');
 for(const phase of [0,1,2])assert.equal(finalizationVerdict(published({phase,resultHash:zeroHash})),'unpublished',`published phase ${phase}`);
 assert.equal(finalizationVerdict(published({phase:3,resultHash:zeroHash})),'unpublished','no published result hash');
 assert.equal(finalizationVerdict(published({finishedAt:0n})),'unpublished');
 assert.equal(finalizationVerdict(published({matchEpoch:0n})),'unmarketed','no round was ever opened: the adapter can never accept it');
 assert.equal(finalizationVerdict(published({finishedAt:1_789_000_130n})),'wait','seconds of clock skew wait; they never defer to another epoch');
 assert.equal(finalizationVerdict(published({finishedAt:undefined,matchEpoch:undefined})),'ready','older rules and the base adapter');
});

test('the finalizing pass defers an unpublished result instead of deadlocking the renewal it needs',async()=>{
 const results:Record<string,{final:number;published:PublishedResult}>={
  '11':{final:3,published:published()},
  [stuck]:{final:0,published:published({phase:2,resultHash:zeroHash,finishedAt:0n})},
  '12':{final:0,published:published()},
 };
 const reads:string[]=[];
 const o={finalStatus:async(id:string)=>{reads.push(`final:${id}`);return results[id].final;},published:async(id:string)=>{reads.push(`published:${id}`);return results[id].published;}};
 const pass=await nextFinalization(['11',stuck,'12'],o);
 assert.deepEqual(pass.next,{id:'12',verdict:'ready'},'the next publishable result is finalized');
 assert.deepEqual(pass.deferred,[{id:stuck,verdict:'unpublished'}]);
 assert(!reads.includes('published:11'),'a finalized result costs one read');
 // Once 12 is final, nothing is left to submit: the lifecycle proceeds to renewEngine.
 results['12'].final=3;
 const after=await nextFinalization(['11',stuck,'12'],o);
 assert.equal(after.next,undefined);assert.deepEqual(after.deferred,[{id:stuck,verdict:'unpublished'}]);
 // A later pass, once the next epoch has published its end, finalizes it.
 results[stuck].published=published({phase:3,matchEpoch:6n});
 assert.deepEqual((await nextFinalization(['11',stuck,'12'],o)).next,{id:stuck,verdict:'ready'});
});

test('a result waiting on seconds of clock skew holds the pass',async()=>{
 const wait=await nextFinalization(['1','2'],{finalStatus:async()=>0,published:async id=>id==='1'?published({finishedAt:1_789_000_200n}):published()});
 assert.deepEqual(wait.next,{id:'1',verdict:'wait'});
});

test('one failed read skips only its own result: the pass goes on, and the failure is reported, not deferred',async()=>{
 const o={finalStatus:async(id:string)=>{if(id==='1')throw new Error('timeout at https://testnet-rpc.monad.xyz/');return 0;},
  published:async(id:string)=>{if(id==='2')throw new Error('HTTP request failed');return published();}};
 const pass=await nextFinalization(['1','2','3'],o);
 assert.deepEqual(pass.next,{id:'3',verdict:'ready'},'a later result is still finalized');
 assert.deepEqual(pass.failed.map(f=>f.id),['1','2']);assert.deepEqual(pass.deferred,[]);
 assert(!pass.failed[0].error.includes('https://'),'no RPC URL in the lifecycle diagnostic');
 const none=await nextFinalization(['1','2'],o);
 assert.equal(none.next,undefined);assert.equal(none.failed.length,2,'the caller retries before renewing');
});

test('a result Monad cannot answer for, while it answers the others, stops holding the renewal after FINALIZATION_READ_ATTEMPTS passes',async()=>{
 const memory=new FinalizationMemory();let reads=0;
 // Result 1's reads fail; result 2 is read fine (already final), so Monad answers.
 // From the second pass on, 2 is remembered as final and not read again: the
 // reader's probe (a block number) is then what shows that Monad answers.
 let probes=0;
 const o={finalStatus:async(id:string)=>{if(id==='1'){reads++;throw new Error('timeout');}return 3;},published:async()=>published(),probe:async()=>{probes++;return 1n;}};
 for(let i=1;i<FINALIZATION_READ_ATTEMPTS;i++){
  const pass=await nextFinalization(['1','2'],o,memory,'6');
  assert.deepEqual(pass.failed.map(f=>f.id),['1'],`pass ${i} retries`);
 }
 const last=await nextFinalization(['1','2'],o,memory,'6');
 assert.deepEqual(last.failed,[]);assert.deepEqual(last.deferred,[{id:'1',verdict:'unreadable'}],'deferred: renewal proceeds');
 assert.equal(probes,FINALIZATION_READ_ATTEMPTS-1,'the first pass read 2 successfully and needed no probe');
 const before=reads;
 assert.deepEqual((await nextFinalization(['1','2'],o,memory,'6')).deferred,[{id:'1',verdict:'unreadable'}]);
 assert.equal(reads,before,'not read again in this epoch');
 await nextFinalization(['1','2'],o,memory,'7');assert.equal(reads,before+1,'a later epoch\'s pass tries it again');
 // A read that succeeds clears the count.
 const healed=new FinalizationMemory();let fail=true;
 const flaky={finalStatus:async()=>{if(fail)throw new Error('timeout');return 0;},published:async()=>published(),probe:async()=>1n};
 await nextFinalization(['1'],flaky,healed,'6');fail=false;
 assert.deepEqual((await nextFinalization(['1'],flaky,healed,'6')).next,{id:'1',verdict:'ready'});
});

test('while Monad answers nothing, no result is deferred: the renewal waits and ready results are still finalized in this epoch',async()=>{
 const memory=new FinalizationMemory();let down=true,probes=0;
 const results:Record<string,PublishedResult>={a:published(),b:published()};
 const o={finalStatus:async()=>{if(down)throw new Error('HTTP request failed. Status: 429');return 0;},
  published:async(id:string)=>results[id],probe:async()=>{probes++;if(down)throw new Error('HTTP request failed. Status: 429');return 1n;}};
 // Ten minutes of a total outage (or a run of 429s): every pass only retries.
 for(let i=0;i<60;i++){
  const pass=await nextFinalization(['a','b'],o,memory,'6');
  assert.equal(pass.next,undefined);assert.deepEqual(pass.deferred,[],`pass ${i}: nothing is deferred`);
  assert.deepEqual(pass.failed.map(f=>f.id),['a','b'],'both are retried before renewing');
 }
 assert.equal(probes,60,'one reachability probe per pass that read nothing');
 // Monad answers again: both are finalized in this epoch, none waits for the next.
 down=false;
 assert.deepEqual((await nextFinalization(['a','b'],o,memory,'6')).next,{id:'a',verdict:'ready'});
 // A pass whose probe answers while every result read fails counts towards deferral.
 const partial=new FinalizationMemory();
 const broken={finalStatus:async()=>{throw new Error('execution reverted');},published:async()=>published(),probe:async()=>1n};
 for(let i=1;i<FINALIZATION_READ_ATTEMPTS;i++)assert.deepEqual((await nextFinalization(['x'],broken,partial,'6')).failed.map(f=>f.id),['x']);
 assert.deepEqual((await nextFinalization(['x'],broken,partial,'6')).deferred,[{id:'x',verdict:'unreadable'}]);
 // Without a probe, a pass that read nothing successfully never counts.
 const blind=new FinalizationMemory();
 for(let i=0;i<FINALIZATION_READ_ATTEMPTS*2;i++)assert.deepEqual((await nextFinalization(['x'],{finalStatus:broken.finalStatus,published:broken.published},blind,'6')).deferred,[]);
});

test('outage passes neither count nor reset: only passes in which Monad answered count, in a row',async()=>{
 const memory=new FinalizationMemory();let down=false;
 const o={finalStatus:async(id:string)=>{if(down||id==='1')throw new Error('timeout');return 3;},published:async()=>published(),probe:async()=>{if(down)throw new Error('down');return 1n;}};
 for(let i=1;i<FINALIZATION_READ_ATTEMPTS;i++)await nextFinalization(['1','2'],o,memory,'6');
 down=true;
 for(let i=0;i<10;i++)assert.deepEqual((await nextFinalization(['1','2'],o,memory,'6')).deferred,[]);
 down=false;
 assert.deepEqual((await nextFinalization(['1','2'],o,memory,'6')).deferred,[{id:'1',verdict:'unreadable'}],'the sixth answered pass defers it');
});

test('finalized and unmarketed results are never read again; unpublished ones not again in the same epoch',async()=>{
 const memory=new FinalizationMemory();const reads:string[]=[];
 const results:Record<string,{final:number;published:PublishedResult}>={
  final:{final:3,published:published()},
  offer:{final:0,published:published({phase:4,matchEpoch:0n})},// an expired offer: no round was ever opened
  [stuck]:{final:0,published:published({phase:2,resultHash:zeroHash,finishedAt:0n})},
 };
 const o={finalStatus:async(id:string)=>{reads.push(`final:${id}`);return results[id].final;},published:async(id:string)=>{reads.push(`published:${id}`);return results[id].published;}};
 const ids=['final','offer',stuck];
 const first=await nextFinalization(ids,o,memory,'6');
 assert.equal(first.next,undefined);
 assert.deepEqual(first.deferred,[{id:'offer',verdict:'unmarketed'},{id:stuck,verdict:'unpublished'}]);
 assert.equal(reads.length,5);
 reads.length=0;
 const second=await nextFinalization(ids,o,memory,'6');
 assert.deepEqual(reads,[],'the lifecycle\'s 10 s cycle reads nothing more for them');
 assert.deepEqual(second.deferred,[{id:stuck,verdict:'unpublished'}],'the unpublished one is still reported');
 // The next epoch's finalizing pass reads the unpublished one again, and only it.
 results[stuck].published=published({phase:3,matchEpoch:6n});
 const later=await nextFinalization(ids,o,memory,'7');
 assert.deepEqual(reads,[`final:${stuck}`,`published:${stuck}`]);
 assert.deepEqual(later.next,{id:stuck,verdict:'ready'});
});

test('the reader asks Monad exactly what the rules-6 adapter checks, at the latest block',async()=>{
 const m={app:'0x78d3341e3452d7ec1add9371de3008639eed8eb0' as const,adapter:'0x00000000000000000000000000000000000000ad' as const,rulesVersion:6 as const,betting:'realtime' as const,settlement:'early-published-testnet' as const};
 const reads=parseAbi(['function finalResults(uint256) view returns(address a,address b,address winner,uint8 status,bytes32 hash)','function matchEpoch(uint256) view returns(uint256)','function resultHashes(uint256) view returns(bytes32)','function finishedAt(uint256) view returns(uint64)']);
 const snapshot=roomsEventsAbi.find((x:any)=>x.type==='function'&&x.name==='getSnapshot') as any;
 const zeroOf=(p:any):any=>p.type==='tuple'?Object.fromEntries(p.components.map((c:any)=>[c.name,zeroOf(c)])):p.type.endsWith(']')?[]:p.type==='bool'?false:p.type==='address'?'0x0000000000000000000000000000000000000000':p.type.startsWith('bytes')?`0x${'00'.repeat(Number(p.type.slice(5))||0)}`:0n;
 const values=snapshot.outputs.map(zeroOf);values[2]=2n;
 const calls:string[]=[];
 const base=createPublicClient({transport:custom({request:async({method,params}:any)=>{
  if(method==='eth_chainId')return '0x279f';
  if(method==='eth_getBlockByNumber')return {number:'0x10',timestamp:'0x6a9f0000',hash:`0x${'01'.repeat(32)}`,transactions:[],parentHash:zeroHash,logsBloom:`0x${'00'.repeat(256)}`,difficulty:'0x0',gasLimit:'0x0',gasUsed:'0x0',miner:m.adapter,extraData:'0x',size:'0x0',uncles:[]};
  if(method!=='eth_call')throw new Error(method);
  const {to,data}=params[0];
  if(to.toLowerCase()===m.app){
   let decoded;try{decoded=decodeFunctionData({abi:reads,data});}catch{decoded=decodeFunctionData({abi:[snapshot],data});}
   calls.push(`game.${decoded.functionName}`);
   if(decoded.functionName==='getSnapshot')return encodeFunctionResult({abi:[snapshot],functionName:'getSnapshot',result:values});
   if(decoded.functionName==='resultHashes')return encodeFunctionResult({abi:reads,functionName:'resultHashes',result:zeroHash});
   return encodeFunctionResult({abi:reads,functionName:'finishedAt',result:0n});
  }
  const decoded=decodeFunctionData({abi:reads,data});calls.push(`adapter.${decoded.functionName}`);
  if(decoded.functionName==='finalResults')return encodeFunctionResult({abi:reads,functionName:'finalResults',result:['0x0000000000000000000000000000000000000000','0x0000000000000000000000000000000000000000','0x0000000000000000000000000000000000000000',0,zeroHash]});
  return encodeFunctionResult({abi:reads,functionName:'matchEpoch',result:6n});
 }})});
 assert.equal(financeGameAbi(m),roomsEventsAbi);
 assert.equal(financeGameAbi({...m,rulesVersion:8}),roomsEventsAbi,'corrected rules 8 uses the same events ABI');
 const r=publishedResultReader(base as any,m);
 assert.equal(await r.finalStatus(stuck),0);
 const view=await r.published(stuck);
 assert.deepEqual({phase:view.phase,resultHash:view.resultHash,finishedAt:view.finishedAt,matchEpoch:view.matchEpoch},{phase:2,resultHash:zeroHash,finishedAt:0n,matchEpoch:6n});
 assert.equal(finalizationVerdict(view),'unpublished');
 assert.deepEqual(calls.sort(),['adapter.finalResults','adapter.matchEpoch','game.finishedAt','game.getSnapshot','game.resultHashes']);
});

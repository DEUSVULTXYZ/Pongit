// Real private testnet challenge. Synthetic owner, never a physical Mera test.
// Uses the single existing operator journal for Monad sponsorship. The arcade
// key has its own compact engine journal, persisted before every network call.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,renameSync,existsSync} from 'node:fs';
import {createPublicClient,http,zeroHash,type Hex} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {WebSocket} from 'ws';
import {chainTools} from './independent-chain-tools';
import {preparePoolFamily,loadPoolFamily} from '../shared/agent-pool-family';
import {preparePoolChallenge} from '../shared/agent-pool-client';
import {createPoolPlayer} from '../shared/agent-pool-player';
import {AgentPoolReader,poolJson} from '../relayer/src/agents/pool-read';
import type {AgentPoolManifest} from '../shared/agent-pool';
import {agentMetrics} from '../relayer/src/agents/metrics';
import {measuredFetch} from '../shared/rpc-metrics';
import {AgentController} from '../shared/agent-controller';

assert.equal(process.env.PONG_POOL_HUMAN_CHECK,'authorized-private-testnet');
assert.equal(process.getuid?.(),1000,'Run the private harness as uid 1000 to preserve journal and metric ownership');
const prefix=process.env.PONG_AGENT_POOL_PREFIX!;assert(/^agent-(pool|series)-candidate-\d{8}(-[2-9])?$/.test(prefix));
const series=prefix.startsWith('agent-series-'),mode=Number(process.env.PONG_POOL_HUMAN_MODE??0);assert(mode===0||mode===1);
const run=Number(process.env.PONG_POOL_HUMAN_RUN??1),target=Number(process.env.PONG_POOL_HUMAN_TARGET??100);
assert(Number.isInteger(run)&&run>=1&&run<=9);assert(Number.isInteger(target)&&target>=1&&target<=1000);
const suffix=run===1?'':`-${run}`;
const deployment=JSON.parse(readFileSync(`/secrets/${prefix}.json`,'utf8'));
const file=`/secrets/${prefix}-human-check${suffix}.json`,reportFile=`/diagnostics/pool-human-check${suffix}.json`;
const m:AgentPoolManifest={version:series?3:2,chainId:10143,engineChainId:4242,rulesVersion:series?11:10,...deployment.common,
 arenas:deployment.arenas.map((a:any)=>({app:a.app,runtimeHash:a.runtimeHash,node:`https://il-${a.app.slice(2,18).toLowerCase()}.fly.dev`})),
 enabled:false,tournamentsEnabled:false,verifiedCapacity:0,qualificationEvidence:null,durationSeconds:300,overtimeSeconds:60,intervalSeconds:60,maxMatches:2};
const protectedApps=(process.env.PONG_HUMAN_APPS??'').split(',').filter(Boolean);assert(protectedApps.length);
const base=createPublicClient({chain:monadTestnet,batch:{multicall:{wait:15,batchSize:8192}},transport:http(process.env.RPC_URL,{retryCount:0,timeout:10000,fetchFn:measuredFetch('monad')})});
const reader=new AgentPoolReader(base,m,protectedApps),metric=await agentMetrics('/diagnostics/pool','human-check');
const prior=run>1?JSON.parse(readFileSync(`/secrets/${prefix}-human-check.json`,'utf8')):null;
let state:any=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{owner:prior?.owner??generatePrivateKey(),storage:prior?.storage??{},checks:[],moves:0,startedAt:new Date().toISOString()};
const save=()=>{writeFileSync(file+'.next',JSON.stringify(state),{mode:0o600});renameSync(file+'.next',file);};save();
const storage={getItem:(k:string)=>state.storage[k]??null,setItem:(k:string,v:string)=>{state.storage[k]=v;save();},removeItem:(k:string)=>{delete state.storage[k];save();}};
const owner=privateKeyToAccount(state.owner as Hex),wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const check=(name:string,extra:Record<string,unknown>={})=>{state.checks.push({at:new Date().toISOString(),name,...extra});save();};
const report=()=>writeFileSync(reportFile,poolJson({at:new Date().toISOString(),scope:'Private real Interlude; synthetic owner, not a Mera authenticator',
 source:process.env.PONG_SOURCE_COMMIT,run,target,player:owner.address,pool:m.pool,ref:state.ref??null,startedAt:state.startedAt,completedAt:state.completedAt??null,moves:state.moves,checks:state.checks})+'\n');
let player:ReturnType<typeof createPoolPlayer>|undefined,writer:Awaited<ReturnType<typeof chainTools>>|undefined;
const originalFetch=globalThis.fetch;
try{
 if(process.env.PONG_POOL_HUMAN_PHASE==='prepare'){
  writer=await chainTools(prefix+'-human-check'+suffix,measuredFetch('monad'));
  if(!state.familyDone){
   if(!state.familyCall){const p=await preparePoolFamily(base,m,owner,storage);state.familyCall=p.call;save();}
   if(state.familyCall)await writer.submit('family',state.familyCall.data,state.familyCall.to);
   state.familyDone=true;save();check('family-registered');
  }
  if(!state.challengeDone){
   if(!state.challengeCall){
    const catalogue=(await reader.catalog(0n,32)).value,agent=catalogue.items.find(a=>a.official&&a.name==='NOVA');assert(agent);
    const session=loadPoolFamily(m,owner.address,storage)!;const p=await preparePoolChallenge(base,m,privateKeyToAccount(session.key),owner.address,{agent:agent.agent,mode});
    state.challengeCall={to:p.to,data:p.data};save();
   }
   const tx=await writer.submit('challenge',state.challengeCall.data,state.challengeCall.to);
   state.challengeDone=true;save();check('challenge-queued',{hash:tx.transactionHash});
  }
 }else{
  assert.equal(process.env.PONG_POOL_HUMAN_PHASE,'play');assert(state.challengeDone);assert(!state.completedAt,'This exact test already completed');
  const end=Date.now()+45*60_000;let view;
  while(Date.now()<end){const request=(await reader.challenge(owner.address)).value.request;
   if(request?.ref){view=(await reader.match(request.ref)).value;break;}await wait(3000);}
  assert(view&&!view.result,'No playable assigned challenge');state.ref=view.ref;save();
  const session=loadPoolFamily(m,owner.address,storage)!;
  const create=()=>createPoolPlayer(m,view!,session,{base,storage,socket:u=>new WebSocket(u)});
  player=create();player.watch(()=>{});
  while(Date.now()<end){try{if((await player.recover()).phase===2)break;}catch{}await wait(1500);}
  assert.equal((await player.read(true)).phase,2);check('admitted-on-dedicated-arena');
  if(run===1&&!state.lossDone){
   let dropped=false;globalThis.fetch=async(input,init)=>{
    const reply=await originalFetch(input,init);let method='';try{method=JSON.parse(String(init?.body)).method;}catch{}
    if(!dropped&&String(input).startsWith(view!.node!)&&method==='interlude_sendTransaction'){
     const body=await reply.clone().json() as any;
     if(body.result?.status==='0x1'||body.result?.status==='success'){dropped=true;await reply.body?.cancel();throw Error('Injected response loss after execution');}
    }return reply;
   };
   const s=await player.read(),dir=s.state.leftDir===1?-1:1;
   await assert.rejects(player.move(dir));assert(dropped);assert(player.journal.pending(session.grant.key));
   globalThis.fetch=originalFetch;player.close();player=create();player.watch(()=>{});await player.recover();
   assert(!player.journal.pending(session.grant.key));state.lossDone=true;save();check('response-loss-and-F5-exact-receipt');
  }
  if(run===1&&!state.rateDone){
   let rejected=false;globalThis.fetch=async(input,init)=>{
    let method='';try{method=JSON.parse(String(init?.body)).method;}catch{}
    if(!rejected&&String(input).startsWith(view!.node!)&&method==='interlude_sendTransaction'){
     rejected=true;return new Response('Injected private test rate limit',{status:429,headers:{'Retry-After':'1'}});
    }return originalFetch(input,init);
   };
   const s=await player.read();await assert.rejects(player.move(s.state.leftDir===1?-1:1));assert(rejected);
   const pending=player.journal.pending(session.grant.key);assert(pending);
   globalThis.fetch=originalFetch;await wait(1500);await player.recover();assert(!player.journal.pending(session.grant.key));
   state.rateDone=true;save();check('injected-429-recovery-exact-command',{hash:pending.hash,nonce:pending.nonce});
  }
  if(run>=3&&!state.permissionDone){
   const previous=JSON.parse(readFileSync('/diagnostics/pool-human-check-2.json','utf8'));
   assert.equal(previous.player.toLowerCase(),owner.address.toLowerCase());
   assert(previous.checks.some((c:any)=>c.name==='owner-renewal-restores-same-limited-key'));
   check('permission-tested-in-separate-preserved-run',{run:2});state.permissionDone=true;save();
  }
  if(!state.permissionDone){
   await player.revoke(owner);await assert.rejects(player.move(1),/revoked/);check('owner-revocation-enforced');
   await player.renew(owner);await player.recover();await player.move(-1);await player.move(0);
   state.permissionDone=true;save();check('owner-renewal-restores-same-limited-key');
  }
  const latencies:number[]=[],tracker=new AgentController(2);
  while(state.moves<target){
   const before=await player.read();assert.equal(before.phase,2,'Match ended before the direction test completed');
   // Track public ball movement rather than blindly missing seven serves. This
   // synthetic human seat is a test driver, not a community controller feature.
   const wanted=tracker.decide(before,0,performance.now());
   const dir=before.state.leftDir===0?(wanted===0?(state.moves%2===0?1:-1):wanted):0;
   const at=performance.now();await player.move(dir);
   let after=await player.read();
   if(after.nonceA<=before.nonceA)after=await player.read(true);
   if(after.nonceA<=before.nonceA){
    const detail={before:{nonce:String(before.nonceA),phase:before.phase,dir:before.state.leftDir,score:[before.state.scoreA,before.state.scoreB]},
     after:{nonce:String(after.nonceA),phase:after.phase,dir:after.state.leftDir,score:[after.state.scoreA,after.state.scoreB]},wanted:dir};
    if(after.phase!==2){check('match-ended-during-direction-test',detail);throw Error('Published gameplay ended before 100 direction changes; this run is partial');}
    // A serve resets directions. Recovery can therefore make a pending stop a
    // no-op; count neither this stop nor a coalesced intent as a sent command.
    if(after.state.leftDir===dir&&(after.state.scoreA!==before.state.scoreA||after.state.scoreB!==before.state.scoreB)){
     check('point-reset-made-intent-redundant',detail);continue;
    }
    check('unconfirmed-direction',detail);throw Error('The new direction was not accepted');
   }
   latencies.push(performance.now()-at);state.moves++;save();
  }
  await player.move(0);latencies.sort((a,b)=>a-b);check('confirmed-direction-changes',{count:state.moves,p50:latencies[Math.floor(latencies.length*.5)]??null,p95:latencies[Math.floor(latencies.length*.95)]??null});
  await player.concede();check('concession-confirmed-on-engine');player.close();player=undefined;
  while(Date.now()<end){const published=(await reader.match(view.ref)).value;if(published.result){
   assert.equal(published.result.status,3);assert.equal(published.result.winner.toLowerCase(),view.b.toLowerCase());assert.notEqual(published.result.hash,zeroHash);
   check('result-published',{hash:published.result.hash,score:[published.result.scoreA,published.result.scoreB],finality:published.result.finality});state.completedAt=new Date().toISOString();save();break;
  }await wait(3000);}
  assert(state.completedAt,'Result publication deadline reached');
 }
 report();console.log(poolJson({at:new Date().toISOString(),player:owner.address,phase:process.env.PONG_POOL_HUMAN_PHASE,checks:state.checks,moves:state.moves,complete:!!state.completedAt}));
}catch(error){
 report();const e=error as Error;console.error(JSON.stringify({at:new Date().toISOString(),stage:'human-check-failed',error:e.message.split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,220)}));process.exitCode=1;
}finally{globalThis.fetch=originalFetch;player?.close();await writer?.close();await metric();}

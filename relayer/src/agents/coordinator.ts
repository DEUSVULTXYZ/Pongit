import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {createPublicClient,http,toHex,keccak256,zeroAddress,type Abi,type Address,type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {createInterludeClient,memoryStore} from '@interludelayer-sdk/sdk';
import {engineTransport} from '../../../shared/engine-transport';
import {EngineStream,engineState,type EngineState} from '../../../shared/engine-stream';
import {EngineFeed} from '../../../shared/engine-feed';
import {ChaosBeaconPump} from '../../../shared/chaos-beacon-pump';
import type {AgentManifest,AgentMode} from '../../../shared/agents';
import {AgentEngineWriter} from './writer';
import {measuredFetch} from '../../../shared/rpc-metrics';
import {readHubDelegation} from '../../../shared/rooms-hub';
import {AgentReplays} from './replays';

const json=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x);
// With the house policy in the contract the house clients send no input, so this
// fallback becomes the only thing advancing a house-versus-house match: it now sets
// the transaction rate, and the transaction rate is what becomes hub batches.
// Any gap is safe for the contract: it steers a catch-up slice by slice and stops on
// a gas reserve, and the next tick resumes where it stopped. The cadence therefore
// trades only spectator smoothness against hub batches, and is set here. The cycle
// below runs every 500 ms, so the observed gap is the threshold plus up to a cycle.
//
// Measured on the hosted node on 2026-09-18: it seals a batch every 0.3 to 1 s
// whenever anything is pending, so 156 batches carried only 320 transactions. Past
// one transaction per sealing window the batch count follows active time, not the
// transaction count. Ticks therefore go out in bursts on one shared clock: every
// live match is caught up back to back, so a burst lands in one or two windows
// however many matches and ticks it holds.
export const TICK_CYCLE_MS=500;
export const TICK_AFTER_MS=Number(process.env.PONG_AGENT_TICK_MS??10000);
if(!Number.isInteger(TICK_AFTER_MS)||TICK_AFTER_MS<200||TICK_AFTER_MS>60000)throw Error('Keep the agent tick between 200 ms and 60 s');
// A tick stops on the contract's gas reserve, so a heavy Chaos stretch takes several.
export const TICK_BURST_MAX=12;
// Left behind by a read that follows the tick, not by the tick itself.
export const CAUGHT_UP_US=1_000_000n;
// The game time a snapshot has processed. Chaos keeps its own clock.
export const processedTime=(s:EngineState)=>s.chaos?.physics.t??s.state.t;
export function createAgentCoordinator(db:Pool,m:AgentManifest,abi:Abi,key:Hex,rpcUrl:string,graphql?:(query:string,variables:unknown)=>Promise<any>){
 const app=m.app.toLowerCase(),signer=privateKeyToAccount(key);
 if(signer.address.toLowerCase()!==m.coordinator.toLowerCase())throw Error('Wrong Agent Arcade coordinator');
 const base=createPublicClient({chain:monadTestnet,transport:http(rpcUrl,{retryCount:0,timeout:8000,fetchFn:measuredFetch('monad')})});
 const client=createInterludeClient({app:m.app,abi,node:m.node,base,store:memoryStore(),transport:engineTransport(m.node),fastPath:true});
 const stream=new EngineStream(m.node,m.app),feed=new EngineFeed(client,stream);
 const writer=new AgentEngineWriter(db,client.node,base,m,abi,signer),beacon=new ChaosBeaconPump();
 const replays=new AgentReplays(db,graphql);
 const watches=new Map<string,()=>void>(),proofs=new Map<string,Promise<void>>();
 const terminalRatings=new Set<string>();let replayAt=0,burstAt=0;
 let running=false,stopped=false,activeCycle:Promise<void>|undefined,stage='starting',lastError:string|undefined,lastProgress=Date.now(),admissionAt=0,healthAt=0;
 let delegation:Awaited<ReturnType<typeof readHubDelegation>>|undefined,delegationAt=0;
 let engineStatus:Awaited<ReturnType<typeof client.status>>|undefined,engineStatusAt=0;
 async function status(fresh=false){if(!engineStatus||fresh||Date.now()-engineStatusAt>=5000){engineStatus=await client.status();engineStatusAt=Date.now();}return engineStatus;}
 const publicHealth=()=>({stage,lastError,lastProgress,app:m.app,epoch:m.epoch});
 async function health(value:string,error?:unknown){
  const previous=stage;stage=value;lastError=error?String((error as any).shortMessage||(error as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,220):undefined;
  if(previous!==stage)console.log(json({at:new Date().toISOString(),service:'agent-arcade',app,stage,error:lastError}));
  if(previous!==stage||Date.now()-healthAt>10000){healthAt=Date.now();await db.query(`INSERT INTO agent_arcade.health(app,stage,detail) VALUES($1,$2,$3) ON CONFLICT(app) DO UPDATE SET stage=$2,detail=$3,updated_at=now()`,[app,stage,{error:lastError,lastProgress,epoch:m.epoch}]);}
 }
 const state=(id:string,force=false)=>feed.read(BigInt(id),force);
 async function qualification(match:any,s:EngineState){
  if(match.kind!=='qualification'||s.phase!==3)return;
  // Compatibility requires real valid inputs, a completed friendly game and a
  // second authenticated connection. An engine outage never marks it dishonest.
  for(const [address,nonce] of [[match.a,s.nonceA],[match.b,s.nonceB]] as const){
   const agent=(await db.query('SELECT * FROM agent_arcade.identities WHERE app=$1 AND agent=$2',[app,address])).rows[0];
   if(!agent||agent.qualification[match.mode]==='qualified')continue;
   const check=(await db.query('SELECT * FROM agent_arcade.qualification_checks WHERE match_id=$1 AND player=$2',[match.id,address])).rows[0];
   const passed=nonce>=5n&&check?.resumed_token&&check.resumed_token!==check.initial_token&&nonce>=BigInt(check.resumed_nonce)+2n;
   if(passed){
    const evidence=keccak256(toHex(json({app,id:match.id,epoch:match.epoch,result:await client.read('resultHashes',[BigInt(match.id)]),inputs:String(nonce),beforeReconnect:check.initial_nonce,afterReconnect:check.resumed_nonce})));
    await writer.send(`qualify:${match.id}:${address}:${match.mode}`,'qualifyAgent',[address,match.mode,true,evidence]);
   }
   await db.query('UPDATE agent_arcade.identities SET qualification=jsonb_set(qualification,ARRAY[$3],to_jsonb($4::text)) WHERE app=$1 AND agent=$2',[app,address,String(match.mode),passed?'qualified':'retry']);
  }
 }
 async function observe(match:any,burst:boolean){
  if(!watches.has(match.id))watches.set(match.id,feed.watch(BigInt(match.id),s=>{lastProgress=Date.now();replays.capture(s);}));
  const s=await state(match.id);
  if(s.phase===1&&s.deadline<BigInt(Math.floor(Date.now()/1000))){await writer.send(`cancel:${match.id}`,'cancelMatch',[BigInt(match.id)]);return;}
  if(s.phase===0){
   if(match.offer&&Number(match.offer.expires)<Math.floor(Date.now()/1000))await finish(match,{status:'cancelled'});
   return;
  }
  if(s.phase===2){
   await db.query("UPDATE agent_arcade.matches SET status='active',updated_at=now() WHERE id=$1 AND status<>'active'",[match.id]);
   // Only this process advances a match nobody else has touched lately: a house
   // match, or any match whose players went quiet.
   const ours=feed.progressAge(BigInt(match.id))>Math.min(TICK_AFTER_MS,3000);
   const beaconState=(v:EngineState)=>({playing:v.phase===2,request:v.chaos?.request??0n,pending:v.chaos?.pending??0n});
   const supply=(v:EngineState)=>{
    if(!v.chaos||proofs.has(match.id))return proofs.get(match.id)??Promise.resolve();
    const proof=beacon.offer(match.id,beaconState(v),async()=>beaconState(await state(match.id,true)),async(q,signature)=>{
     await writer.send(`beacon:${match.id}:${q}`,'submitRandomness',[BigInt(match.id),q,signature]);feed.invalidate();
    }).catch(e=>health('synchronizing',e)).then(()=>{}).finally(()=>proofs.delete(match.id));proofs.set(match.id,proof);return proof;
   };
   // A match someone else drives needs its beacon at once, or it stalls under them.
   // One only this process drives gets it inside the burst: a proof sent on its own
   // spends a sealing window of its own, about fifteen of them per Chaos match.
   if(!ours){supply(s);return;}
   if(!burst)return;
   let current=s;
   for(let n=0;n<TICK_BURST_MAX&&current.phase===2;n++){
    await supply(current);
    const before=processedTime(current);
    await writer.send(`tick:${match.id}:${current.revision}`,'tick',[BigInt(match.id)]);feed.invalidate();
    current=await state(match.id,true);
    const after=processedTime(current);
    if(current.clock-after<=CAUGHT_UP_US)break;
    // Stalled. Pass again only if the draw it waits on can be supplied right now;
    // a round drand has not published yet, or anything a tick cannot give, would
    // only spend another sealing window. The next burst picks it up.
    if(after<=before&&!(current.chaos&&beacon.due(beaconState(current))))break;
   }
   return;
  }
  if(s.phase>=3){
   if(!terminalRatings.has(match.id)){
    for(const agent of [match.a,match.b]){const rating=await client.read('ratingOf',[agent,match.mode]);
     await db.query('INSERT INTO agent_arcade.ratings(app,agent,mode,live) VALUES($1,$2,$3,$4) ON CONFLICT(app,agent,mode) DO UPDATE SET live=$4,observed_at=now()',[app,agent,match.mode,json(rating)]);}
    terminalRatings.add(match.id);
   }
   const result={phase:s.phase,winner:s.winner,scoreA:s.state.scoreA,scoreB:s.state.scoreB,draw:s.phase===3&&s.winner===zeroAddress,
    durationUs:String(s.state.t),nonceA:String(s.nonceA),nonceB:String(s.nonceB),hash:await client.read('resultHashes',[s.id])};
   await db.query("UPDATE agent_arcade.matches SET result=$2,status='publishing',updated_at=now() WHERE id=$1",[match.id,json(result)]);
   // One app has a bounded publication buffer. Retire its live match only once
   // that result is actually visible on Monad, without calling it irreversible.
   const published=engineState(await client.readSettled('getSnapshot',[s.id]) as readonly unknown[]);
   if(published.phase===s.phase&&published.winner===s.winner&&published.state.scoreA===s.state.scoreA&&published.state.scoreB===s.state.scoreB){
    await qualification(match,s);
    for(const agent of [match.a,match.b]){
     const [live,rating]=await Promise.all([client.read('ratingOf',[agent,match.mode]),client.readSettled('ratingOf',[agent,match.mode])]);
     await db.query('INSERT INTO agent_arcade.ratings(app,agent,mode,live,published) VALUES($1,$2,$3,$4,$5) ON CONFLICT(app,agent,mode) DO UPDATE SET live=$4,published=$5,observed_at=now()',
      [app,agent,match.mode,json(live),json(rating)]);
    }
    await finish(match,{status:s.phase===3?'complete':'cancelled',publication:{state:'published',block:String(await base.getBlockNumber()),at:new Date().toISOString()}});
   }
  }
 }
 async function finish(match:any,data:{status:string;publication?:unknown}){
  const c=await db.connect();try{await c.query('BEGIN');
   await c.query('UPDATE agent_arcade.matches SET status=$2,publication=COALESCE($3,publication),updated_at=now() WHERE id=$1',[match.id,data.status,data.publication??null]);
   await c.query('DELETE FROM agent_arcade.occupancy WHERE app=$1 AND match_id=$2',[app,match.id]);
   await c.query('UPDATE agent_arcade.challenges SET status=$3 WHERE app=$1 AND match_id=$2',[app,match.id,data.status]);await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  watches.get(match.id)?.();watches.delete(match.id);lastProgress=Date.now();
  terminalRatings.delete(match.id);await replays.finish(match.id);
 }
 async function admit(){
  if(Date.now()-admissionAt<3000)return;admissionAt=Date.now();
  const control=(await db.query('SELECT admissions FROM agent_arcade.control WHERE app=$1',[app])).rows[0];
  if(control?.admissions===false){await health('draining-for-renewal');return;}
  if(!delegation||Date.now()-delegationAt>=10000){delegation=await readHubDelegation(base,m.hub,m.app);delegationAt=Date.now();}
  // Never admit a five-minute duel immediately before a service renewal.
  if(delegation.status!==1||String(delegation.epoch)!==m.epoch||delegation.expiresAt<=BigInt(Math.floor(Date.now()/1000)+m.durationSeconds+60)){
   await health('draining-for-renewal');return;
  }
  const status=await client.status();engineStatus=status;engineStatusAt=Date.now();
  // Registration and a result can share a publication. Reserve enough for both
  // acceptances, compact controls, two full state words sets and terminal ELO.
  if(status.pendingDiffs.length+32>status.maxDiffsPerCommit){await health('waiting-publication');return;}
  await health('online');
  const c=await db.connect();let candidate:any;
  try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`agent-admit:${app}`]);
   const count=Number((await c.query("SELECT count(*) FROM agent_arcade.matches WHERE app=$1 AND status IN ('preparing','offered','active','publishing')",[app])).rows[0].count);
   if(count>=2){await c.query('COMMIT');return;}
   await c.query("UPDATE agent_arcade.challenges SET status='expired' WHERE app=$1 AND status='waiting' AND expires_at<=now()",[app]);
   const available=(await c.query(`SELECT i.*,p.connections FROM agent_arcade.identities i JOIN agent_arcade.presence p ON p.app=i.app AND p.player=i.agent
     WHERE i.app=$1 AND p.available AND p.seen>now()-interval '30 seconds' AND NOT EXISTS(SELECT 1 FROM agent_arcade.occupancy o WHERE o.app=i.app AND o.player=i.agent)
     ORDER BY i.created_at,i.agent`,[app])).rows;
   const requests=(await c.query("SELECT * FROM agent_arcade.challenges WHERE app=$1 AND status='waiting' ORDER BY created_at LIMIT 50 FOR UPDATE",[app])).rows;
   for(const request of requests){const agent=available.find(a=>a.agent===request.agent&&a.qualification[request.mode]==='qualified');
    if(agent&&!(await c.query('SELECT 1 FROM agent_arcade.occupancy WHERE app=$1 AND player=$2',[app,request.player])).rowCount){candidate={a:request.player,b:agent.agent,mode:request.mode,ranked:false,kind:'challenge',request:request.id};break;}}
   if(!candidate){
    const last=(await c.query('SELECT mode FROM agent_arcade.matches WHERE app=$1 ORDER BY id DESC LIMIT 1',[app])).rows[0];const modes:AgentMode[]=last?.mode===0?[1,0]:[0,1];
    for(const mode of modes){
     const qualified=available.filter(a=>(a.modes&(1<<mode))&&a.qualification[mode]==='qualified');
     const learner=available.find(a=>(a.modes&(1<<mode))&&['queued','testing'].includes(a.qualification[mode]));
     if(learner){const opponent=qualified.find(a=>a.agent!==learner.agent)||available.find(a=>a.agent!==learner.agent&&(a.modes&(1<<mode)));
      if(opponent){candidate={a:learner.agent,b:opponent.agent,mode,ranked:false,kind:'qualification'};break;}}
     // Keep a second slot available for human challenges/qualification. A house
     // bot can share its creator with another, but that match remains friendly.
     if(count===0&&qualified.length>=2){
      const recent=(await c.query('SELECT a,b FROM agent_arcade.matches WHERE app=$1 AND mode=$2 ORDER BY id DESC LIMIT 1',[app,mode])).rows[0];
      const a=qualified.find(x=>x.agent!==recent?.a&&x.agent!==recent?.b)||qualified[0],b=qualified.find(x=>x.agent!==a.agent&&x.creator!==a.creator)||qualified.find(x=>x.agent!==a.agent)!;
      candidate={a:a.agent,b:b.agent,mode,ranked:a.creator!==b.creator,kind:'league'};break;
     }
    }
   }
   if(candidate){
    const row=(await c.query('INSERT INTO agent_arcade.matches(app,epoch,kind,mode,a,b,ranked) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[app,m.epoch,candidate.kind,candidate.mode,candidate.a,candidate.b,candidate.ranked])).rows[0];candidate.id=row.id;
    await c.query('INSERT INTO agent_arcade.occupancy VALUES($1,$2,$4),($1,$3,$4)',[app,candidate.a,candidate.b,row.id]);
    if(candidate.request)await c.query("UPDATE agent_arcade.challenges SET status='offered',match_id=$2 WHERE id=$1",[candidate.request,row.id]);
   }
   await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  if(candidate)await offer(candidate);
 }
 async function offer(match:any){
  // Prepared identity is durable before signing. A restart resumes the same id.
  const ticket={id:BigInt(match.id),room:toHex(BigInt(match.id),{size:32}),a:match.a as Address,b:match.b as Address,mode:match.mode,ranked:match.ranked,
   expires:BigInt(Math.floor(Date.now()/1000)+25),rules:7n,entropy:keccak256(toHex(`${app}:${m.epoch}:${match.id}`))};
  const signature=await signer.sign({hash:await client.read('ticketDigest',[ticket]) as Hex});
  await db.query("UPDATE agent_arcade.matches SET offer=$2,status='offered',updated_at=now() WHERE id=$1 AND status='preparing'",[match.id,json({...ticket,signature})]);
 }
 async function runCycle(){
  if(running)return;running=true;
  try{
   const session=await status();
   if(String(session.epoch)!==m.epoch)throw Error('Agent engine epoch changed; reconciliation required');
   const matches=(await db.query("SELECT * FROM agent_arcade.matches WHERE app=$1 AND status IN ('preparing','offered','active','publishing') ORDER BY id",[app])).rows;
   // One shared clock for every live match, so their ticks share sealing windows.
   const burst=Date.now()-burstAt>=TICK_AFTER_MS;if(burst)burstAt=Date.now();
   for(const match of matches){if(match.status==='preparing')await offer(match);else await observe(match,burst);}
   if(Date.now()-replayAt>60000){replayAt=Date.now();await replays.reconcile();}
   await admit();
  }catch(e){
   const control=(await db.query('SELECT admissions,reason FROM agent_arcade.control WHERE app=$1',[app])).rows[0];
   await health(control?.admissions===false&&control.reason==='Delegation renewal'?'renewing':'synchronizing',e);
  }finally{running=false;}
 }
 function cycle(){if(stopped)return Promise.resolve();return activeCycle??=(runCycle().finally(()=>{activeCycle=undefined;}));}
 return {client,base,writer,feed,replays,health:publicHealth,cycle,async stop(){stopped=true;await activeCycle;await Promise.allSettled(proofs.values());await writer.drain();for(const fn of watches.values())fn();watches.clear();stream.stop();await replays.flush();},registrationOperation:()=>`register:${randomUUID()}`};
}

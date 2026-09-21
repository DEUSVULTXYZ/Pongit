import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {createPublicClient,encodeFunctionData,keccak256,type Address,type Hex,type PublicClient} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import WebSocket from 'ws';
import {pooledAgentArenaAbi as abi} from '../../../shared/abi-PooledAgentArena';
import {seriesAgentArenaAbi} from '../../../shared/abi-SeriesAgentArena';
import {reusableAgentArenaAbi} from '../../../shared/abi-ReusableAgentArena';
import {engineTransport,engineCooldownMs} from '../../../shared/engine-transport';
import {EngineFeed} from '../../../shared/engine-feed';
import {EngineStream,receiptFrame,type EngineState} from '../../../shared/engine-stream';
import {reusableResults,type ReusableResultCandidate} from '../../../shared/reusable-results';
import {readHubDelegation} from '../../../shared/rooms-hub';
import {engineJobIdentity,engineReceiptOutcome} from '../rooms-engine-recovery';
import {retirableRefusal,refusalReason} from '../../../shared/engine-halt';

export const POOL_COMMAND_GAS=14_800_000n;

export async function initializePoolOperations(db:Pool){await db.query(`
 CREATE SCHEMA IF NOT EXISTS agent_pool;
 CREATE TABLE IF NOT EXISTS agent_pool.engine_jobs (
  app text NOT NULL,id text NOT NULL,operation text NOT NULL,epoch numeric(78,0) NOT NULL,signer text NOT NULL,
  nonce bigint NOT NULL,raw text NOT NULL,hash text NOT NULL,status text NOT NULL DEFAULT 'pending',resolution jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(app,id),UNIQUE(app,epoch,operation));
 CREATE UNIQUE INDEX IF NOT EXISTS pool_pending_signer ON agent_pool.engine_jobs(app,signer) WHERE status='pending';
 CREATE UNIQUE INDEX IF NOT EXISTS pool_used_nonce ON agent_pool.engine_jobs(app,epoch,signer,nonce) WHERE status NOT IN ('refused','obsolete');
 CREATE TABLE IF NOT EXISTS agent_pool.lifecycle(app text PRIMARY KEY,provision_epoch numeric(78,0),provisioning jsonb);
 CREATE TABLE IF NOT EXISTS agent_pool.lifecycle_events(id bigserial PRIMARY KEY,app text NOT NULL,epoch numeric(78,0) NOT NULL,
  stage text NOT NULL,detail jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS agent_pool.health(app text PRIMARY KEY,stage text NOT NULL,detail jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
 `);}

/** One transport, feed and serialized nonce owner per arena. The key transports
 * permissionless maintenance only; it cannot impersonate a human or spend funds.
 * No pending entry is deleted, including a refusal proven safe to retire. */
export function createPoolEngine(db:Pool,base:PublicClient,hub:Address,app:Address,url:string,key:Hex,
 ref:{epoch:bigint;id:bigint},onSnapshot?:(state:EngineState)=>void,runtime?:{node?:PublicClient;feed?:EngineFeed;series?:boolean;reusable?:boolean;archive?:(results:ReusableResultCandidate[])=>Promise<void>;now?:()=>number}){
 if(runtime?.series&&runtime?.reusable)throw Error('Choose one arena generation');
 if(runtime?.reusable&&!runtime.archive)throw Error('Reusable results require a durable archive');
 const arenaAbi=runtime?.reusable?reusableAgentArenaAbi:runtime?.series?seriesAgentArenaAbi:abi;
 const signer=privateKeyToAccount(key),node=runtime?.node??createPublicClient({transport:engineTransport(url),pollingInterval:1000});
 const stream=new EngineStream(url,app,u=>new WebSocket(u,{origin:'https://pongit.xyz'}) as any,()=>engineCooldownMs(url));
 const feed=runtime?.feed??new EngineFeed({app,abi:arenaAbi,node},stream),unwatch=feed.watch(ref.id,s=>onSnapshot?.(s));
 const lower=app.toLowerCase(),now=runtime?.now??Date.now;let busy=false,fenceUntil=0,closed=false;
 let fenceTask:Promise<void>|undefined;
 async function verifyFence(){
  const block=await base.getBlock(),d=await readHubDelegation(base,hub,app,block.number);
  if((await base.getBlock({blockNumber:block.number})).hash!==block.hash)
   throw Error('Arena publication changed during lifecycle verification');
  // This is proof of epoch closure, not an inference from an unavailable node.
  if(!closed&&(d.status===0||d.epoch>ref.epoch)){
   await db.query("UPDATE agent_pool.engine_jobs SET status='obsolete',resolution=$3,updated_at=now() WHERE app=$1 AND epoch<=$2 AND status='pending'",
    [lower,String(d.status===0?ref.epoch:d.epoch-1n),{kind:'hub-epoch-closed',block:String(block.number),hash:block.hash,observedEpoch:String(d.epoch)}]);
  }
  if(d.status!==1||d.epoch!==ref.epoch||d.expiresAt<=block.timestamp)throw Error('This arena is awaiting its own lifecycle recovery');
  const engine:any=await node.request({method:'interlude_session',params:[]} as any);
  if(String(engine.app).toLowerCase()!==lower||BigInt(engine.epoch)!==ref.epoch||engine.chainId!==4242)throw Error('Hosted arena epoch is not ready');
  if(runtime?.reusable&&BigInt(engine.baseBlock??-1)!==d.baseBlock)throw Error('Hosted arena base block is not ready');
  fenceUntil=now()+Math.min(3000,Number(d.expiresAt-block.timestamp)*1000);
 }
 function refreshFence(){
  return fenceTask??=verifyFence().catch(error=>{fenceUntil=0;throw error;}).finally(()=>{fenceTask=undefined;});
 }
 async function fence(){
  if(closed)throw Error('Arena transport is closed');
  if(now()<fenceUntil)return;
  // An expired check must wait, even when its refresh was started earlier.
  await refreshFence();
 }
 async function resolution(job:any,unsent=false){
  const identity=await engineJobIdentity({...job,nonce:String(job.nonce)},arenaAbi,signer.address);
  const allowed=runtime?.reusable?['admit','cancelAdmission','start','tick','submitRandomness','cancelUnready']:runtime?.series?['start','tick','submitRandomness','advanceSeries','drainSeries']:['start','tick','submitRandomness'];
  if(!allowed.includes(identity.action))throw Error('Unexpected permissionless pool operation');
  if(!runtime?.series&&!runtime?.reusable&&identity.action!=='start'&&identity.matchId!==String(ref.id))throw Error('Command belongs to another match');
  // Only an entry created in this invocation is known never to have been sent.
  // Persisted entries, including after restart, always reconcile their receipt.
  let receipt:any=unsent?null:await node.getTransactionReceipt({hash:job.hash}).catch(()=>null);
  if(!receipt){
   try{receipt=await node.request({method:'interlude_sendTransaction',params:[job.raw]} as any);}
   catch(error){
    // The generic pre-execution prefix, a timeout or a 429 is NOT proof.
    if(retirableRefusal(error)){
     const nonce=await node.getTransactionCount({address:signer.address,blockTag:'latest'}).catch(()=>null);
     if(nonce!==null&&BigInt(nonce)===BigInt(job.nonce))await db.query(
      "UPDATE agent_pool.engine_jobs SET status='refused',resolution=$3,updated_at=now() WHERE app=$1 AND id=$2 AND status='pending'",
      [lower,job.id,{kind:'permanent-pre-execution-refusal',reason:refusalReason(error),latestNonce:String(nonce)}]);
    }
    throw error;
   }
  }
  const outcome=engineReceiptOutcome(receipt,job.hash);if(!outcome)throw Error('Arena command is awaiting its exact receipt');
  if(outcome==='observed'&&runtime?.reusable){
   const frame=receiptFrame(receipt,app);if(!frame)throw Error('Reusable receipt logs are incomplete');
   const results=reusableResults(arenaAbi,app,15,frame);
   // Store complete public result bytes before acknowledging the operation.
   // On archive failure the exact command remains pending and is read again;
   // another admission must never erase the only result body we observed.
   if(results.length)await runtime.archive!(results);
  }
  await db.query('UPDATE agent_pool.engine_jobs SET status=$3,resolution=$4,updated_at=now() WHERE app=$1 AND id=$2',
   [lower,job.id,outcome,{kind:'receipt',hash:job.hash,blockHash:receipt.blockHash,block:String(receipt.blockNumber),status:receipt.status}]);
  if(outcome==='failed'){feed.invalidate();throw Object.assign(Error('Arena action reverted; state must be refreshed'),{code:'POOL_ACTION_REVERTED'});}
  return {identity,receipt};
 }
 async function send(operation:string,name:'admit'|'cancelAdmission'|'cancelUnready'|'start'|'tick'|'submitRandomness'|'advanceSeries'|'drainSeries',args:readonly unknown[]=[]){
  if(!/^[a-z0-9:._-]{1,160}$/i.test(operation))throw Error('Invalid operation identity');
  if((name==='advanceSeries'||name==='drainSeries')&&!runtime?.series)throw Error('Series transport is not enabled');
  if((name==='admit'||name==='cancelAdmission'||name==='cancelUnready')&&!runtime?.reusable)throw Error('Reusable transport is not enabled');
  if(runtime?.reusable){
   const first=args[0] as {epoch?:bigint;matchId?:bigint};
   const intendedEpoch=(name==='admit'||name==='cancelAdmission')?first?.epoch:args[0],intendedMatch=(name==='admit'||name==='cancelAdmission')?first?.matchId:args[1];
   if(intendedEpoch!==ref.epoch||intendedMatch!==ref.id)throw Error('Command belongs to another match or epoch');
   operation=`match:${ref.id}:${operation}`;
  }
  if(runtime?.series){
   if(name!=='start'&&args[0]!==ref.id)throw Error('Command belongs to another match');
   operation=`match:${ref.id}:${operation}`;
  }
  if(busy)throw Error('This arena is reconciling a command');busy=true;
  let c:PoolClient|undefined,locked=false;
  try{
   c=await db.connect();
   locked=(await c.query('SELECT pg_try_advisory_lock(hashtextextended($1,701349)) AS ok',[lower])).rows[0].ok;
   if(!locked)throw Error('This arena already has a writer');await fence();
   const data=encodeFunctionData({abi:arenaAbi,functionName:name,args:args as any});
   let unsent=false;
   let job=(await db.query('SELECT * FROM agent_pool.engine_jobs WHERE app=$1 AND epoch=$2 AND operation=$3',[lower,String(ref.epoch),operation])).rows[0];
   if(job){
    const prior=await engineJobIdentity({...job,nonce:String(job.nonce)},arenaAbi,signer.address);
    if(prior.data!==data)throw Error('An operation cannot change its signed command');
    if(job.status==='observed')return feed.read(ref.id);
    if(job.status!=='pending')throw Error(`Arena operation is ${job.status}; refresh its state`);
   }else{
    const pending=(await db.query("SELECT * FROM agent_pool.engine_jobs WHERE app=$1 AND status='pending' ORDER BY created_at LIMIT 1",[lower])).rows[0];
    if(pending){
     if(BigInt(pending.epoch)!==ref.epoch)throw Error('Previous epoch command requires verified closure');
     const resolved=await resolution(pending);feed.invalidate();
     // A prior match's receipt resolves its own nonce only. Never project its
     // state onto the next match, even when both share the same engine epoch.
     if((resolved.identity.action==='start'&&!runtime?.reusable&&(!runtime?.series||pending.operation.startsWith(`match:${ref.id}:`)))||resolved.identity.matchId===String(ref.id))
      await feed.receipt(ref.id,{receipt:resolved.receipt},resolved.identity.action,resolved.identity.args??[],signer.address);
     else await feed.read(ref.id,true);
     throw Object.assign(Error('Previous command reconciled; refresh before another action'),{code:'POOL_RECONCILED'});
    }
    const [nonce,latest]=await Promise.all(['pending','latest'].map(blockTag=>node.getTransactionCount({address:signer.address,blockTag:blockTag as 'pending'|'latest'})));
    if(nonce!==latest)throw Error('Arena nonce is still in flight');
    const raw=await signer.signTransaction({chainId:4242,type:'eip1559',nonce,to:app,data,value:0n,gas:POOL_COMMAND_GAS,maxFeePerGas:0n,maxPriorityFeePerGas:0n});
    job={app:lower,id:randomUUID(),operation,epoch:String(ref.epoch),nonce:String(nonce),raw,hash:keccak256(raw),status:'pending'};
    await db.query('INSERT INTO agent_pool.engine_jobs(app,id,operation,epoch,signer,nonce,raw,hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
     [lower,job.id,operation,job.epoch,signer.address.toLowerCase(),job.nonce,raw,job.hash]);
    unsent=true;
   }
   const resolved=await resolution(job,unsent);return feed.receipt(ref.id,{receipt:resolved.receipt},name,args,signer.address);
  }finally{try{if(locked)await c?.query('SELECT pg_advisory_unlock(hashtextextended($1,701349))',[lower]);}finally{c?.release();busy=false;}}
 }
 return{node,feed,send,read:(force=false)=>{
  // Warm the same three-second fence before it expires. This changes neither
  // its validity window nor the checks required before sending a command.
  if(!closed&&!busy&&fenceUntil>0&&now()>=fenceUntil-1500)void refreshFence().catch(()=>{});
  return feed.read(ref.id,force);
 },close:()=>{closed=true;unwatch();},ref,app,busy:()=>busy};
}

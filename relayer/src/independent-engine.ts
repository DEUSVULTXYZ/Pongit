import {createPublicClient,encodeFunctionData,keccak256,type Abi,type Address,type Hex,type PublicClient} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import type {Pool,PoolClient} from 'pg';
import WebSocket from 'ws';
import {randomUUID} from 'node:crypto';
import {publicationUnavailable} from '../../shared/service-error';
import {independentRules} from '../../shared/independent-rules';
import {engineTransport,engineCooldownMs} from '../../shared/engine-transport';
import {EngineStream,type EngineState} from '../../shared/engine-stream';
import {EngineFeed} from '../../shared/engine-feed';
import {engineJobIdentity,engineReceiptOutcome,reconcileEngineJobs} from './rooms-engine-recovery';
import {assertCommandEpoch} from './rooms-command-epoch';

/** Each application/epoch has its own journal and writer. Nothing queues behind another arena. */
export function independentEngine(db:Pool,base:PublicClient,app:Address,url:string,key:Hex,onSnapshot?:(app:Address,epoch:bigint,s:EngineState)=>void,runtime?:{rulesVersion?:4|12|13|14;node?:PublicClient;feed?:EngineFeed}){
 if(runtime?.rulesVersion===14)throw Error('Reusable human commands require their dedicated archive and admission worker');
 const rules=independentRules({rulesVersion:runtime?.rulesVersion}),abi=rules.arena;
 const signer=privateKeyToAccount(key),node=runtime?.node??createPublicClient({transport:engineTransport(url),pollingInterval:1000});
 const client={app,abi:abi as Abi,node};
 const stream=new EngineStream(url,app,u=>new WebSocket(u,{origin:'https://pongit.xyz'}) as any,()=>engineCooldownMs(url));
 const feed=runtime?.feed??new EngineFeed(client,stream);let busy=false,match=0n,epoch=0n,publicationFailedAt=0,stop:undefined|(()=>void);
 function bind(id:bigint,nextEpoch:bigint){
  if(match===id&&epoch===nextEpoch)return false;
  stop?.();match=id;epoch=nextEpoch;publicationFailedAt=0;feed.invalidate();
  if(id&&epoch)stop=feed.watch(id,s=>onSnapshot?.(app,epoch,s));else stop=undefined;
  return true;
 }
 async function send(name:'tick'|'submitPressure'|'revokeActive'|'renewActive'|'start'|'submitRandomness'|'submitLivePressure'|'cancelUnready',args:readonly unknown[]=[]){
  const allowed=rules.events?['start','tick','submitRandomness','submitLivePressure','revokeActive','renewActive']:['tick','submitPressure','revokeActive','renewActive'];
  if(rules.version===13)allowed.push('cancelUnready');
  if(!allowed.includes(name))throw Error('Operation is not supported by this arena version');
  if(busy)throw Error('This arena is reconciling a command');busy=true;
  const commandMatch=match,commandEpoch=epoch;
  let c:PoolClient|undefined,locked=false;
  try{
   c=await db.connect();
   // A second service process cannot sign another raw at this node's nonce.
   locked=(await c.query('SELECT pg_try_advisory_lock(hashtextextended($1,701345)) AS ok',[app.toLowerCase()])).rows[0].ok;
   if(!locked)throw Error('Arena writer is busy');
   const data=encodeFunctionData({abi:abi as Abi,functionName:name,args});
   if(!commandMatch||!commandEpoch)throw Error('No current arena binding');
   assertCommandEpoch(abi,data,commandEpoch);
   if(['tick','submitRandomness','cancelUnready'].includes(name)&&args[0]!==commandMatch)throw Error('Command belongs to another match');
   if(['submitPressure','submitLivePressure','renewActive'].includes(name)&&(args[0] as {matchId:bigint})?.matchId!==commandMatch)throw Error('Command belongs to another match');
   const requestKey=name==='revokeActive'||name==='renewActive'?keccak256(data):null;
   if(requestKey){
    const previous=(await db.query("SELECT * FROM il_engine_jobs WHERE app=$1 AND epoch=$2 AND request_key=$3 AND status IN ('observed','confirmed')",[app.toLowerCase(),String(commandEpoch),requestKey])).rows[0];
    if(previous){feed.invalidate();return feed.read(commandMatch,true);}
   }
   let job=(await db.query("SELECT * FROM il_engine_jobs WHERE app=$1 AND status='pending' ORDER BY epoch,nonce LIMIT 1",[app.toLowerCase()])).rows[0];
   if(job&&BigInt(job.epoch)!==commandEpoch)throw Error('Previous epoch command requires final closure');
   if(!job){
    // Root signatures and current authority are verified before journaling. A lost
    // response retries the existing journal entry without re-simulating its spent nonce.
    await node.call({account:signer.address,to:app,data});
    const nonce=await node.getTransactionCount({address:signer.address,blockTag:'pending'});
    if(nonce!==await node.getTransactionCount({address:signer.address,blockTag:'latest'}))throw Error('Arena nonce is still in flight');
    if(match!==commandMatch||epoch!==commandEpoch)throw Error('Arena binding changed before signing');
    const raw=await signer.signTransaction({chainId:4242,type:'eip1559',nonce,to:app,data,value:0n,gas:15000000n,maxFeePerGas:0n,maxPriorityFeePerGas:0n});
    job={id:randomUUID(),app:app.toLowerCase(),epoch:String(commandEpoch),nonce:String(nonce),raw,hash:keccak256(raw),match_id:String(commandMatch)};
    await db.query("INSERT INTO il_engine_jobs(app,id,nonce,raw,hash,status,epoch,signer,action,match_id,request_key) VALUES($1,$2,$3,$4,$5,'pending',$6,$7,$8,$9,$10)",[job.app,job.id,job.nonce,raw,job.hash,String(commandEpoch),signer.address.toLowerCase(),name,String(commandMatch),requestKey]);
   }
   const identity=await engineJobIdentity(job,abi,signer.address);
   if(!allowed.includes(identity.action))throw Error('Unexpected arena operation');
   assertCommandEpoch(abi,identity.data,commandEpoch);
   if(job.match_id&&job.match_id!==String(commandMatch))throw Error('Pending command belongs to another match');
   if(match!==commandMatch||epoch!==commandEpoch)throw Error('Arena binding changed; command remains journalled');
   let receipt:any=await node.getTransactionReceipt({hash:job.hash}).catch(()=>null);
   if(!receipt)receipt=await node.request({method:'interlude_sendTransaction',params:[job.raw]} as any);
   const outcome=engineReceiptOutcome(receipt,job.hash);
   if(!outcome)throw Error('Command receipt is not yet available');
   await db.query('UPDATE il_engine_jobs SET status=$3,resolution=$4,updated_at=now() WHERE app=$1 AND id=$2',[job.app,job.id,outcome,{kind:'receipt',hash:job.hash,blockHash:receipt.blockHash,at:new Date().toISOString()}]);
   if(outcome==='failed'){feed.invalidate();throw Error('Command reverted. Reading current arena state.');}
   if(identity.data!==data||match!==commandMatch||epoch!==commandEpoch){feed.invalidate();throw Error('Previous command reconciled. Refresh before the next action.');}
   publicationFailedAt=0;await db.query('DELETE FROM independent_engine_health WHERE app=$1 AND epoch=$2',[app.toLowerCase(),String(commandEpoch)]);
   return feed.receipt(commandMatch,{receipt},name,args,signer.address);
  }catch(e){if(publicationUnavailable(e)){
    const failedAt=Date.now();if(epoch===commandEpoch&&match===commandMatch)publicationFailedAt=failedAt;
    await db.query('INSERT INTO independent_engine_health(app,epoch,failed_at) VALUES($1,$2,$3) ON CONFLICT(app,epoch) DO UPDATE SET failed_at=$3',[app.toLowerCase(),String(commandEpoch),String(failedAt)]);
   }throw e;
  }finally{try{if(locked)await c?.query('SELECT pg_advisory_unlock(hashtextextended($1,701345))',[app.toLowerCase()]);}finally{c?.release();busy=false;}}
 }
 return {app,node,feed,bind,send,signer,busy:()=>busy,reference:()=>({id:match,epoch}),publicationFailure:()=>publicationFailedAt,
  restoreHealth:async()=>{const row=(await db.query('SELECT failed_at FROM independent_engine_health WHERE app=$1 AND epoch=$2',[app.toLowerCase(),String(epoch)])).rows[0];publicationFailedAt=row?Number(row.failed_at):0;},
  read:()=>feed.read(match),
  status:()=>node.request({method:'interlude_session',params:[]} as any) as Promise<any>,
  reconcile:()=>reconcileEngineJobs({db,app:app.toLowerCase() as Address,receipt:hash=>node.getTransactionReceipt({hash})}),
  retire:async(closedEpoch:bigint)=>{
   // Caller must establish status None on Monad first. Never retire on a timeout.
   await db.query("UPDATE il_engine_jobs SET status='obsolete',resolution=COALESCE(resolution,'{}'::jsonb)||$3::jsonb,updated_at=now() WHERE app=$1 AND epoch=$2 AND status IN ('pending','quarantined')",[app.toLowerCase(),String(closedEpoch),JSON.stringify({kind:'epoch-closed',epoch:String(closedEpoch),at:new Date().toISOString()})]);
  },stop:()=>stop?.(),
 };
}

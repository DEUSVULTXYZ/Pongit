import type {Pool} from 'pg';
import {encodeFunctionData,keccak256,parseTransaction,type Abi,type Address,type Hex,type PublicClient} from 'viem';
import type {PrivateKeyAccount} from 'viem/accounts';
import {readHubDelegation} from '../../../shared/rooms-hub';
import type {AgentManifest} from '../../../shared/agents';

/** One durable owner of this app's operator nonce. Lost replies never authorize
 * a different transaction at that nonce. The lock does not hold a SQL transaction. */
// Gas for a coordinator command on the execution chain, where gas costs nothing but a
// transaction is what becomes a hub batch: the node seals whatever is pending every
// half second or so, and one send here takes longer than that, so every transaction
// of a burst lands in a window of its own. A tick therefore catches a match up in one
// transaction when it can. The hosted node caps a transaction at 30 M gas, measured by
// the refusal it returns above that (estimates are not capped, sends are); a Chaos
// catch-up of more than 30 s fit in one 24.2 M tick. The contract still stops each
// advance on its own gas reserve, so this only sets how far one tick may go. A beacon
// also advances the match it lands on.
export const DELEGATION_CACHE_MS=5000;
export const ENGINE_GAS={catchUp:30_000_000n,other:15_000_000n} as const;
export function engineGas(name:string){return name==='tick'||name==='submitRandomness'?ENGINE_GAS.catchUp:ENGINE_GAS.other;}

export class AgentEngineWriter {
 private queue:Promise<unknown>=Promise.resolve();
 constructor(private db:Pool,private node:PublicClient,private base:PublicClient,private manifest:AgentManifest,private abi:Abi,private signer:PrivateKeyAccount){}
 // The delegation changes only at an epoch boundary, which the lifecycle reaches after every
 // game has drained, and closes on pressure long before expiry. Re-reading it from Monad for
 // each command cost two public-RPC round trips per transaction, longer than the node's
 // sealing interval, so every command of a burst sealed in a window of its own.
 private hub?:{at:number;value:Awaited<ReturnType<typeof readHubDelegation>>};
 private async delegation(){
  if(!this.hub||Date.now()-this.hub.at>DELEGATION_CACHE_MS)this.hub={at:Date.now(),value:await readHubDelegation(this.base,this.manifest.hub,this.manifest.app)};
  return this.hub.value;
 }
 async drain(){await this.queue;}
 send(operation:string,name:string,args:readonly unknown[]=[]){
  const result=this.queue.then(()=>this.write(operation,name,args));this.queue=result.catch(()=>{});return result;
 }
 private async resolve(job:any){
  const m=this.manifest;
  if(keccak256(job.raw)!==job.hash)throw Error('Agent operation journal checksum mismatch');
  const tx=parseTransaction(job.raw);if(tx.chainId!==4242||tx.to?.toLowerCase()!==m.app.toLowerCase()||(tx.value??0n)!==0n)throw Error('Invalid agent operation journal');
  const hub=await this.delegation();
  if(String(hub.epoch)!==String(job.epoch)||hub.status!==1)throw Error('Agent operation awaits its original engine epoch');
  let receipt:any=await this.node.getTransactionReceipt({hash:job.hash as Hex}).catch(()=>null);
  if(!receipt){
   await this.db.query("UPDATE agent_arcade.engine_jobs SET state='uncertain' WHERE app=$1 AND operation=$2",[m.app.toLowerCase(),job.operation]);
   try{receipt=await this.node.request({method:'interlude_sendTransaction',params:[job.raw]} as any);}
   catch(e){
    // A transaction the node refuses before executing it never ran, and its nonce is still
    // free. Replaying the same bytes can never succeed, and every later command of this
    // signer would wait behind it for good. Only that exact case is retired, and only when
    // the chain confirms the nonce unused; a lost response, or anything else, stays uncertain.
    const text=[e,(e as any)?.cause].map(x=>`${(x as any)?.details??''} ${(x as any)?.message??''}`).join(' ');
    if(/rejected before execution/.test(text)){
     const next=await this.node.getTransactionCount({address:this.signer.address,blockTag:'latest'});
     if(next===Number(job.nonce)){
      await this.db.query("DELETE FROM agent_arcade.engine_jobs WHERE app=$1 AND operation=$2 AND hash=$3 AND state='uncertain'",[m.app.toLowerCase(),job.operation,job.hash]);
      console.log(JSON.stringify({at:new Date().toISOString(),service:'agent-writer',event:'rejected-before-execution',operation:job.operation,nonce:String(job.nonce),reason:text.replace(/0x[0-9a-f]{64,}/gi,'[omitted]').trim().slice(0,200)}));
     }
    }
    throw e;
   }
  }
  if(receipt?.transactionHash?.toLowerCase()!==job.hash.toLowerCase()||!['0x1','0x0','success','reverted'].includes(String(receipt.status)))throw Error('Agent operation receipt is missing');
  const success=['0x1','success'].includes(String(receipt.status));
  await this.db.query('UPDATE agent_arcade.engine_jobs SET state=$3,evidence=$4 WHERE app=$1 AND operation=$2',
   [m.app.toLowerCase(),job.operation,success?'confirmed':'reverted',{hash:receipt.transactionHash,block:String(receipt.blockNumber),status:receipt.status}]);
  if(!success)throw Object.assign(new Error('Agent engine confirmed a rejected action'),{code:'AGENT_ACTION_REVERTED'});
  return receipt;
 }
 private async write(operation:string,name:string,args:readonly unknown[]){
  if(!/^[a-zA-Z0-9:._-]{1,180}$/.test(operation))throw Error('Invalid operation identity');
  const m=this.manifest,app=m.app.toLowerCase(),signer=this.signer.address.toLowerCase(),connection=await this.db.connect();let locked=false;
  try{
   locked=(await connection.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS ok',[`agent-writer:${app}:${signer}`])).rows[0].ok;
   if(!locked)throw Error('Agent writer is already active');
   const data=encodeFunctionData({abi:this.abi,functionName:name,args});
   let job=(await this.db.query('SELECT * FROM agent_arcade.engine_jobs WHERE app=$1 AND operation=$2',[app,operation])).rows[0];
   if(job){
    if(parseTransaction(job.raw).data!==data||job.signer!==signer)throw Error('An operation cannot change its command');
    if(job.state==='reverted')throw Object.assign(new Error('Agent engine confirmed a rejected action'),{code:'AGENT_ACTION_REVERTED'});
    if(job.state==='confirmed')return {transactionHash:job.hash,blockNumber:BigInt(job.evidence.block),status:job.evidence.status};
   }else{
    const pending=(await this.db.query("SELECT * FROM agent_arcade.engine_jobs WHERE app=$1 AND signer=$2 AND state IN ('prepared','uncertain') ORDER BY nonce LIMIT 1",[app,signer])).rows[0];
    if(pending)await this.resolve(pending);
    const status=await this.delegation();
    if(status.status!==1||String(status.epoch)!==m.epoch||status.expiresAt<=BigInt(Math.floor(Date.now()/1000)))throw Error('Agent engine is recovering');
    const nonce=await this.node.getTransactionCount({address:this.signer.address,blockTag:'pending'});
    if(nonce!==await this.node.getTransactionCount({address:this.signer.address,blockTag:'latest'}))throw Error('Agent writer has an unresolved nonce');
    const raw=await this.signer.signTransaction({chainId:4242,type:'eip1559',to:m.app,data,nonce,value:0n,gas:engineGas(name),maxFeePerGas:0n,maxPriorityFeePerGas:0n});
    job={app,operation,signer,epoch:m.epoch,nonce,raw,hash:keccak256(raw)};
    await this.db.query('INSERT INTO agent_arcade.engine_jobs(app,operation,signer,epoch,nonce,raw,hash) VALUES($1,$2,$3,$4,$5,$6,$7)',[app,operation,signer,m.epoch,nonce,raw,job.hash]);
   }
   return await this.resolve(job);
  }finally{if(locked)await connection.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[`agent-writer:${app}:${signer}`]);connection.release();}
 }
}

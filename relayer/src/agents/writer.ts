import type {Pool} from 'pg';
import {encodeFunctionData,keccak256,parseTransaction,type Abi,type Address,type Hex,type PublicClient} from 'viem';
import type {PrivateKeyAccount} from 'viem/accounts';
import {readHubDelegation} from '../../../shared/rooms-hub';
import type {AgentManifest} from '../../../shared/agents';

/** One durable owner of this app's operator nonce. Lost replies never authorize
 * a different transaction at that nonce. The lock does not hold a SQL transaction. */
export class AgentEngineWriter {
 private queue:Promise<unknown>=Promise.resolve();
 constructor(private db:Pool,private node:PublicClient,private base:PublicClient,private manifest:AgentManifest,private abi:Abi,private signer:PrivateKeyAccount){}
 async drain(){await this.queue;}
 send(operation:string,name:string,args:readonly unknown[]=[]){
  const result=this.queue.then(()=>this.write(operation,name,args));this.queue=result.catch(()=>{});return result;
 }
 private async resolve(job:any){
  const m=this.manifest;
  if(keccak256(job.raw)!==job.hash)throw Error('Agent operation journal checksum mismatch');
  const tx=parseTransaction(job.raw);if(tx.chainId!==4242||tx.to?.toLowerCase()!==m.app.toLowerCase()||(tx.value??0n)!==0n)throw Error('Invalid agent operation journal');
  const hub=await readHubDelegation(this.base,m.hub,m.app);
  if(String(hub.epoch)!==String(job.epoch)||hub.status!==1)throw Error('Agent operation awaits its original engine epoch');
  let receipt:any=await this.node.getTransactionReceipt({hash:job.hash as Hex}).catch(()=>null);
  if(!receipt){
   await this.db.query("UPDATE agent_arcade.engine_jobs SET state='uncertain' WHERE app=$1 AND operation=$2",[m.app.toLowerCase(),job.operation]);
   receipt=await this.node.request({method:'interlude_sendTransaction',params:[job.raw]} as any);
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
    const status=await readHubDelegation(this.base,m.hub,m.app);
    if(status.status!==1||String(status.epoch)!==m.epoch||status.expiresAt<=BigInt(Math.floor(Date.now()/1000)))throw Error('Agent engine is recovering');
    const nonce=await this.node.getTransactionCount({address:this.signer.address,blockTag:'pending'});
    if(nonce!==await this.node.getTransactionCount({address:this.signer.address,blockTag:'latest'}))throw Error('Agent writer has an unresolved nonce');
    const raw=await this.signer.signTransaction({chainId:4242,type:'eip1559',to:m.app,data,nonce,value:0n,gas:15000000n,maxFeePerGas:0n,maxPriorityFeePerGas:0n});
    job={app,operation,signer,epoch:m.epoch,nonce,raw,hash:keccak256(raw)};
    await this.db.query('INSERT INTO agent_arcade.engine_jobs(app,operation,signer,epoch,nonce,raw,hash) VALUES($1,$2,$3,$4,$5,$6,$7)',[app,operation,signer,m.epoch,nonce,raw,job.hash]);
   }
   return await this.resolve(job);
  }finally{if(locked)await connection.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[`agent-writer:${app}:${signer}`]);connection.release();}
 }
}

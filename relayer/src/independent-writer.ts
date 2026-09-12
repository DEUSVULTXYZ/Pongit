import {createWalletClient,http,keccak256,encodeAbiParameters,parseTransaction,type Address,type Hex,type PublicClient} from 'viem';
import {monadTestnet} from 'viem/chains';
import {privateKeyToAccount} from 'viem/accounts';
import {readFile} from 'node:fs/promises';
import type {Pool,PoolClient} from 'pg';
import type {ChainOperation} from '../../shared/independent';
import {measuredFetch} from '../../shared/rpc-metrics';
export function confirmedContractRevert(error:unknown){
 let cause:any=error;for(let i=0;cause&&i<10;i++,cause=cause.cause)if(['ExecutionRevertedError','ContractFunctionRevertedError'].includes(cause.name))return true;return false;
}

/** A sponsor queue, not a business-state database. Shares the existing operator nonce owner.
 * Network observation never holds a PostgreSQL transaction or a lobby lock. The advisory
 * lock protects only signing/submission; receipts are observed by a separate pump.
 */
export async function independentWriter(db:Pool,base:PublicClient){
 const secret=JSON.parse(await readFile(process.env.ROOMS_LIFECYCLE_KEY_FILE!,'utf8'));
 const account=privateKeyToAccount(secret.privateKey as Hex);
 if(await base.getChainId()!==10143)throw Error('Independent sponsoring is testnet only');
 const wallet=createWalletClient({account,chain:monadTestnet,transport:http(process.env.RPC_URL,{timeout:8000,retryCount:0,fetchFn:measuredFetch('monad')})});
 await db.query(`CREATE TABLE IF NOT EXISTS independent_operations(
 id text PRIMARY KEY,target text NOT NULL,data text NOT NULL,value text NOT NULL,priority integer NOT NULL,
 status text NOT NULL DEFAULT 'queued',hash text,error text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
 CREATE INDEX IF NOT EXISTS independent_operations_pending ON independent_operations(priority,created_at) WHERE status='queued';
 CREATE TABLE IF NOT EXISTS il_lifecycle_jobs(id text PRIMARY KEY,app text NOT NULL,owner text NOT NULL,nonce bigint NOT NULL,raw text NOT NULL,hash text NOT NULL,status text NOT NULL,UNIQUE(owner,nonce));`);
 const view=(r:any):ChainOperation=>({id:r.id,status:r.status,hash:r.hash??undefined,error:r.error??undefined});
 async function get(id:string){const r=(await db.query('SELECT id,status,hash,error FROM independent_operations WHERE id=$1',[id])).rows[0];return r?view(r):null;}
 async function enqueue(to:Address,data:Hex,value=0n,priority=1,context=''):Promise<ChainOperation>{
  const id=keccak256(encodeAbiParameters([{type:'address'},{type:'bytes'},{type:'uint256'},{type:'string'}],[to,data,value,context]));
  const old=await get(id);if(old)return old;
  const inFlight=(await db.query("SELECT * FROM independent_operations WHERE target=$1 AND data=$2 AND value=$3 AND status IN ('queued','pending') ORDER BY created_at LIMIT 1",[to.toLowerCase(),data,String(value)])).rows[0];
  if(inFlight)return view(inFlight);
  if(Number((await db.query("SELECT count(*) FROM independent_operations WHERE status='queued'")).rows[0].count)>=200)throw Error('Sponsoring is busy. Your wallet has not been charged.');
  // All external callers additionally validate the target and selector. Invalid signatures
  // never enter storage. Onchain checks run again at actual inclusion.
  try{await base.call({account:account.address,to,data,value});}
  catch(e){if(confirmedContractRevert(e))throw Object.assign(Error('The contract rejected this action. Reload before retrying.'),{code:'CONTRACT_REJECTED',accepted:false});throw e;}
  // The simulation is outside this short transaction. Serialize only intake so
  // two contexts cannot enqueue identical calldata between their first checks.
  const c=await db.connect();
  try{
   await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(701341)');
   const existing=(await c.query("SELECT * FROM independent_operations WHERE id=$1 OR (target=$2 AND data=$3 AND value=$4 AND status IN ('queued','pending')) ORDER BY created_at LIMIT 1",[id,to.toLowerCase(),data,String(value)])).rows[0];
   if(existing){await c.query('COMMIT');return view(existing);}
   if(Number((await c.query("SELECT count(*) FROM independent_operations WHERE status='queued'")).rows[0].count)>=200)throw Error('Sponsoring is busy. Your wallet has not been charged.');
   const row=(await c.query('INSERT INTO independent_operations(id,target,data,value,priority) VALUES($1,$2,$3,$4,$5) RETURNING *',[id,to.toLowerCase(),data,String(value),priority])).rows[0];
   await c.query('COMMIT');return view(row);
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 let sending=false,observing=false,lastError='';
 async function observe(){
  if(observing)return;observing=true;
  try{
   // Includes jobs created by the legacy recovery service. Never recycle their nonces.
   const jobs=(await db.query("SELECT id,hash FROM il_lifecycle_jobs WHERE owner=$1 AND status='pending' ORDER BY nonce LIMIT 8",[account.address.toLowerCase()])).rows;
   await Promise.allSettled(jobs.map(async job=>{
    const receipt=await base.getTransactionReceipt({hash:job.hash});
    if(receipt.transactionHash.toLowerCase()!==job.hash.toLowerCase())throw Error('Receipt identity mismatch');
    const status=receipt.status==='success'?'confirmed':'failed';
    await db.query('UPDATE il_lifecycle_jobs SET status=$2 WHERE id=$1 AND status=\'pending\'',[job.id,status]);
    await db.query("UPDATE independent_operations SET status=$2,error=$3,updated_at=now() WHERE hash=$1 AND status IN ('queued','pending')",[job.hash,status,status==='failed'?'Transaction reverted. Reload the contract state before retrying.':null]);
   }));
   // Crash between journal creation and updating the queue row is recoverable by id.
   await db.query(`UPDATE independent_operations o SET status=j.status,hash=j.hash,updated_at=now()
    FROM il_lifecycle_jobs j WHERE j.id='independent:'||o.id AND o.status IN ('queued','pending') AND (o.status<>j.status OR o.hash IS DISTINCT FROM j.hash)`);
   if(!jobs.length)lastError='';
  }finally{observing=false;}
 }
 async function dispatch(){
  if(sending)return;sending=true;let c:PoolClient|undefined,locked=false;
  try{
   c=await db.connect();
   locked=(await c.query('SELECT pg_try_advisory_lock(701340) AS ok')).rows[0].ok;if(!locked)return;
   const pending=(await db.query("SELECT * FROM il_lifecycle_jobs WHERE owner=$1 AND status='pending' ORDER BY nonce LIMIT 1",[account.address.toLowerCase()])).rows[0];
   if(pending){
    // Only resend an operation owned by this queue. Other writers retain their journal.
    if(pending.id.startsWith('independent:')){
     if(keccak256(pending.raw)!==pending.hash)throw Error('Operator journal hash mismatch');
     const raw=parseTransaction(pending.raw);if(raw.chainId!==10143||raw.nonce!==Number(pending.nonce))throw Error('Operator journal identity mismatch');
     await base.sendRawTransaction({serializedTransaction:pending.raw});
    }
    return;
   }
   const row=(await db.query("SELECT * FROM independent_operations WHERE status='queued' ORDER BY priority,created_at LIMIT 1")).rows[0];if(!row)return;
   const nonce=await base.getTransactionCount({address:account.address,blockTag:'pending'});
   if(nonce!==await base.getTransactionCount({address:account.address,blockTag:'latest'}))throw Error('Existing operator transaction needs reconciliation');
   const tx={to:row.target as Address,data:row.data as Hex,value:BigInt(row.value),nonce};
   try{await base.call({account:account.address,...tx});}catch(e){
    // RPC availability does not prove invalid execution. Only a decoded contract revert
    // may retire an unsigned operation. Signed operations never take this branch.
    const reverted=confirmedContractRevert(e);
    if(reverted)await db.query("UPDATE independent_operations SET status='failed',error=$2,updated_at=now() WHERE id=$1 AND status='queued'",[row.id,'The action is no longer valid. Refresh its contract state.']);
    throw e;
   }
   const request=await wallet.prepareTransactionRequest(tx);request.gas=request.gas*12n/10n;
   const raw=await wallet.signTransaction(request),hash=keccak256(raw);
   await db.query("INSERT INTO il_lifecycle_jobs(id,app,owner,nonce,raw,hash,status) VALUES($1,$2,$3,$4,$5,$6,'pending')",['independent:'+row.id,row.target,account.address.toLowerCase(),nonce,raw,hash]);
   await db.query("UPDATE independent_operations SET status='pending',hash=$2,updated_at=now() WHERE id=$1",[row.id,hash]);
   await base.sendRawTransaction({serializedTransaction:raw});lastError='';
  }catch{lastError='Sponsor is reconciling a pending operation. Gameplay observations continue.';}
  finally{try{if(locked)await c?.query('SELECT pg_advisory_unlock(701340)');}finally{c?.release();sending=false;}}
 }
 const timers=[setInterval(()=>void observe().catch(()=>{}),750),setInterval(()=>void dispatch().catch(()=>{}),1000)];
 for(const t of timers)t.unref();
 return {enqueue,get,account:account.address,observe,dispatch,status:()=>({available:!lastError,error:lastError||undefined}),stop:()=>timers.forEach(clearInterval)};
}

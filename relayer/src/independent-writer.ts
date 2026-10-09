import {keccak256,encodeAbiParameters,parseTransaction,recoverTransactionAddress,type Address,type Hex,type PublicClient} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {readFile} from 'node:fs/promises';
import type {Pool,PoolClient} from 'pg';
import type {ChainOperation} from '../../shared/independent';
import {prepareSponsoredTransaction} from './sponsor-prepare';
import {writerIdentity,type ScopedWriter} from '../../shared/scoped-writer';
import {operatorNeedsFunding,operatorFundingMessage} from '../../shared/operator-funding';
import {continuousSubmissionGuard} from '../../shared/continuous-delegation';
import {sponsorBundles,type SponsorDispatch} from './sponsor-bundle';
export function confirmedContractRevert(error:unknown){
 let cause:any=error;for(let i=0;cause&&i<10;i++,cause=cause.cause)if(['ExecutionRevertedError','ContractFunctionRevertedError'].includes(cause.name))return true;return false;
}

/** Independent read-only admission checks overlap, but neither persistence nor
 * signing may begin until both succeed. A transport error proves no rejection. */
export async function validateSponsoredIntake(simulate:()=>Promise<unknown>,admission?:()=>Promise<void>){
 await Promise.all([
  Promise.resolve().then(simulate).catch(e=>{
   if(confirmedContractRevert(e))throw Object.assign(Error('The contract rejected this action. Reload before retrying.'),{code:'CONTRACT_REJECTED',accepted:false});
   throw e;
  }),
  Promise.resolve().then(admission),
 ]);
}

/** A sponsor queue, not a business-state database. Shares the existing operator nonce owner.
 * Network observation never holds a PostgreSQL transaction or a lobby lock. The advisory
 * lock protects only signing/submission; receipts are observed by a separate pump.
 */
export async function independentWriter(db:Pool,base:PublicClient,journal:Pool=db,scope?:ScopedWriter,options:{eager?:boolean}={}){
 if(scope&&!scope.keyFile)throw Error('Dedicated sponsor key path required');
 const secret=JSON.parse(await readFile(scope?.keyFile??process.env.ROOMS_LIFECYCLE_KEY_FILE!,'utf8'));
 const account=privateKeyToAccount(secret.privateKey as Hex);
 const identity=writerIdentity(account.address,scope),jobId=(id:string)=>identity.prefix+id;
 const continuousCheck=continuousSubmissionGuard(base);
 const check=async(to:Address,data:Hex,value:bigint)=>{scope?.allowCall(to,data,value);await continuousCheck(to,data);};
 if(await base.getChainId()!==10143)throw Error('Independent sponsoring is testnet only');
 await db.query(`CREATE TABLE IF NOT EXISTS independent_operations(
 id text PRIMARY KEY,target text NOT NULL,data text NOT NULL,value text NOT NULL,priority integer NOT NULL,
 status text NOT NULL DEFAULT 'queued',hash text,error text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
 CREATE INDEX IF NOT EXISTS independent_operations_pending ON independent_operations(priority,created_at) WHERE status='queued';`);
 await journal.query(`CREATE TABLE IF NOT EXISTS il_lifecycle_jobs(id text PRIMARY KEY,app text NOT NULL,owner text NOT NULL,nonce bigint NOT NULL,raw text NOT NULL,hash text NOT NULL,status text NOT NULL,UNIQUE(owner,nonce));`);
 await db.query('CREATE TABLE IF NOT EXISTS independent_writer_binding(id integer PRIMARY KEY CHECK(id=1),owner text NOT NULL)');
 if(scope&&!(await db.query('SELECT owner FROM independent_writer_binding WHERE id=1')).rowCount&&Number((await db.query("SELECT count(*) FROM independent_operations WHERE status IN ('queued','pending')")).rows[0].count)>0)throw Error('Unbound pending sponsor queue');
 const binding=await db.query('INSERT INTO independent_writer_binding(id,owner) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET owner=independent_writer_binding.owner RETURNING owner',[identity.owner]);
 if(binding.rows[0].owner!==identity.owner)throw Error('Sponsor queue belongs to another signer; drain and migrate it explicitly');
 const bundles=scope?.bundle?await sponsorBundles(db,scope,check):undefined;
 const view=(r:any):ChainOperation=>({id:r.id,status:r.status,hash:r.hash??undefined,error:r.error??undefined});
 let closing=false,running=true;
 const tasks=new Set<Promise<unknown>>();
 const track=<T>(run:()=>Promise<T>):Promise<T>=>{
  if(closing)return Promise.reject(Error('Sponsor is stopping; no operation accepted'));
  const task=run();tasks.add(task);void task.finally(()=>tasks.delete(task)).catch(()=>{});return task;
 };
 async function get(id:string){const r=(await db.query('SELECT id,status,hash,error FROM independent_operations WHERE id=$1',[id])).rows[0];return r?view(r):null;}
 async function enqueue(to:Address,data:Hex,value=0n,priority=1,context='',admission?:()=>Promise<void>):Promise<ChainOperation>{
  await check(to,data,value);
  const id=keccak256(encodeAbiParameters([{type:'address'},{type:'bytes'},{type:'uint256'},{type:'string'}],[to,data,value,context]));
  const old=await get(id);if(old)return old;
  const inFlight=(await db.query("SELECT * FROM independent_operations WHERE target=$1 AND data=$2 AND value=$3 AND status IN ('queued','pending') ORDER BY created_at LIMIT 1",[to.toLowerCase(),data,String(value)])).rows[0];
  if(inFlight)return view(inFlight);
  if(Number((await db.query("SELECT count(*) FROM independent_operations WHERE status='queued'")).rows[0].count)>=200)throw Error('Sponsoring is busy. Your wallet has not been charged.');
  // All external callers additionally validate the target and selector. Invalid signatures
  // never enter storage. Onchain checks run again at actual inclusion.
  await validateSponsoredIntake(()=>base.call({account:account.address,to,data,value}),admission);
  // The simulation is outside this short transaction. Serialize only intake so
  // two contexts cannot enqueue identical calldata between their first checks.
  const c=await db.connect();
  try{
   await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(701341)');
   const existing=(await c.query("SELECT * FROM independent_operations WHERE id=$1 OR (target=$2 AND data=$3 AND value=$4 AND status IN ('queued','pending')) ORDER BY created_at LIMIT 1",[id,to.toLowerCase(),data,String(value)])).rows[0];
   if(existing){await c.query('COMMIT');return view(existing);}
   if(Number((await c.query("SELECT count(*) FROM independent_operations WHERE status='queued'")).rows[0].count)>=200)throw Error('Sponsoring is busy. Your wallet has not been charged.');
   const row=(await c.query('INSERT INTO independent_operations(id,target,data,value,priority) VALUES($1,$2,$3,$4,$5) RETURNING *',[id,to.toLowerCase(),data,String(value),priority])).rows[0];
   await c.query('COMMIT');
   // Wake this same nonce owner after durable intake. Keep the normal timer as
   // recovery, and retain dispatch's signer lock and single-flight guard.
   if(options.eager&&running&&!closing)void track(dispatch).catch(()=>{});
   return view(row);
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 let sending=false,observing=false,lastError='',lastCode:string|undefined;
 async function observe(){
  if(observing)return;observing=true;let resolved=false;
  try{
   // Includes jobs created by the legacy recovery service. Never recycle their nonces.
   const jobs=(await journal.query("SELECT id,hash FROM il_lifecycle_jobs WHERE owner=$1 AND status='pending' ORDER BY nonce LIMIT 8",[account.address.toLowerCase()])).rows;
   await Promise.allSettled(jobs.map(async job=>{
    const receipt=await base.getTransactionReceipt({hash:job.hash});
    if(receipt.transactionHash.toLowerCase()!==job.hash.toLowerCase())throw Error('Receipt identity mismatch');
    const status=receipt.status==='success'?'confirmed':'failed';
    const changed=await journal.query('UPDATE il_lifecycle_jobs SET status=$2 WHERE id=$1 AND status=\'pending\'',[job.id,status]);
    resolved||=Boolean(changed.rowCount);
    await db.query("UPDATE independent_operations SET status=$2,error=$3,updated_at=now() WHERE hash=$1 AND status IN ('queued','pending')",[job.hash,status,status==='failed'?'Transaction reverted. Reload the contract state before retrying.':null]);
   }));
   // Crash between journal creation and updating the queue row is recoverable by id.
   // The business database may be isolated. The authoritative nonce journal
   // must still be the operator's existing database and advisory-lock domain.
   const unresolved=(await db.query("SELECT id FROM independent_operations WHERE status IN ('queued','pending') ORDER BY created_at LIMIT 200")).rows;
   if(unresolved.length){
    const groups=bundles?await bundles.unresolved(unresolved.map(x=>x.id)):[];
    const records=(await journal.query('SELECT id,status,hash FROM il_lifecycle_jobs WHERE owner=$1 AND id=ANY($2::text[])',[account.address.toLowerCase(),[...unresolved.map(x=>x.id),...groups].map(jobId)])).rows;
    for(const j of records){const id=j.id.slice(identity.prefix.length);
     if(id.startsWith('bundle:')){const row=await bundles?.resolve(id);if(!row)throw Error('Sponsor bundle policy missing');await bundles!.update(row,j.status,j.hash);}
     else await db.query("UPDATE independent_operations SET status=$2,hash=$3,updated_at=now() WHERE id=$1 AND status IN ('queued','pending') AND (status<>$2 OR hash IS DISTINCT FROM $3)",[id,j.status,j.hash]);
    }
   }
   if(!jobs.length){lastError='';lastCode=undefined;}
  }finally{
   observing=false;
   // A verified receipt releases the existing nonce owner immediately. Missing
   // receipts never wake signing; the same journal/lock still gates dispatch.
   if(resolved&&options.eager&&running&&!closing)void track(dispatch).catch(()=>{});
  }
 }
 async function dispatch(){
  if(sending)return;sending=true;let c:PoolClient|undefined,locked=false;
  try{
   c=await journal.connect();
   locked=(await c.query('SELECT pg_try_advisory_lock($1::bigint) AS ok',[identity.lock])).rows[0].ok;if(!locked)return;
   const pending=(await journal.query("SELECT * FROM il_lifecycle_jobs WHERE owner=$1 AND status='pending' ORDER BY nonce LIMIT 1",[account.address.toLowerCase()])).rows[0];
   if(pending){
    // Only resend an operation owned by this queue. Other writers retain their journal.
    const ownedId=pending.id.startsWith(identity.prefix)?pending.id.slice(identity.prefix.length):null;
    const owned: SponsorDispatch|null=ownedId?.startsWith('bundle:')?await bundles?.resolve(ownedId)??null:
     ownedId?(await db.query('SELECT * FROM independent_operations WHERE id=$1',[ownedId])).rows[0]:null;
    if(owned){
     if(keccak256(pending.raw)!==pending.hash)throw Error('Operator journal hash mismatch');
     if((await recoverTransactionAddress({serializedTransaction:pending.raw})).toLowerCase()!==identity.owner)throw Error('Operator journal signer mismatch');
     const raw=parseTransaction(pending.raw);if(raw.chainId!==10143||raw.nonce!==Number(pending.nonce))throw Error('Operator journal identity mismatch');
     if(raw.to?.toLowerCase()!==owned.target||raw.data!==owned.data||(raw.value??0n)!==BigInt(owned.value))throw Error('Operator queue identity mismatch');
     if(!owned.members)await check(owned.target,owned.data,BigInt(owned.value));
     await base.sendRawTransaction({serializedTransaction:pending.raw});
     lastError='';lastCode=undefined;
    }
    return;
   }
   let row: SponsorDispatch|undefined=await bundles?.next()??undefined;
   if(!row){
    const rows=(await db.query(`SELECT * FROM independent_operations WHERE status='queued' ORDER BY priority,created_at LIMIT ${bundles?4:1}`)).rows;
    if(!rows.length)return;
    row=rows.length>1&&bundles?await bundles.create(rows)??rows[0]:rows[0];
   }
   if(!row)return;
   // A crash can leave an immutable group queued after its journal committed.
   // Reconcile that exact job instead of preparing any second transaction.
   if(row.members){
    const previous=(await journal.query('SELECT id,status,hash FROM il_lifecycle_jobs WHERE id=$1 AND owner=$2',[jobId(row.id),identity.owner])).rows[0];
    if(previous){await bundles!.update(row,previous.status,previous.hash);return;}
   }else await check(row.target,row.data,BigInt(row.value));
   let request:Awaited<ReturnType<typeof prepareSponsoredTransaction>>;
   const prepare=(r:SponsorDispatch)=>prepareSponsoredTransaction(base,account.address,{to:r.target,data:r.data,value:BigInt(r.value)},
    r.estimates??scope?.strictEstimate?.(r.target,r.data,BigInt(r.value)));
   try{
    try{request=await prepare(row);}catch(error){
     if(!row.members||!confirmedContractRevert(error))throw error;
     // No signature/journal exists for this group. A revoked/expired member
     // must not starve the queue: dissolve it and retry the oldest intent alone.
     const first=row.members[0];await bundles!.discardUnsigned(row);
     row=(await db.query('SELECT * FROM independent_operations WHERE id=$1',[first])).rows[0];
     if(!row)throw Error('Sponsor operation disappeared');await check(row.target,row.data,BigInt(row.value));
     request=await prepare(row);
    }
   }catch(e){
    // RPC availability does not prove invalid execution. Only a decoded contract revert
    // may retire an unsigned operation. Signed operations never take this branch.
    const reverted=confirmedContractRevert(e);
    if(reverted&&row&&!row.members)await db.query("UPDATE independent_operations SET status='failed',error=$2,updated_at=now() WHERE id=$1 AND status='queued'",[row.id,'The action is no longer valid. Refresh its contract state.']);
    throw e;
   }
   const nonce=request.nonce;
   if(row.members)await bundles!.resolve(row.id);else await check(row.target,row.data,BigInt(row.value));
   // The client chain was verified at startup and preparation pins EIP-1559
   // chainId 10143. Local signing needs no second, hidden eth_chainId roundtrip.
   if(request.chainId!==10143||request.type!=='eip1559')throw Error('Unexpected sponsor transaction chain or type');
   const raw=await account.signTransaction(request),hash=keccak256(raw);
   await journal.query("INSERT INTO il_lifecycle_jobs(id,app,owner,nonce,raw,hash,status) VALUES($1,$2,$3,$4,$5,$6,'pending')",[jobId(row.id),row.target,account.address.toLowerCase(),nonce,raw,hash]);
   if(row.members)await bundles!.update(row,'pending',hash);
   else await db.query("UPDATE independent_operations SET status='pending',hash=$2,updated_at=now() WHERE id=$1",[row.id,hash]);
   await base.sendRawTransaction({serializedTransaction:raw});lastError='';lastCode=undefined;
   // A fast inclusion need not wait for the next receipt interval. A missing
   // receipt remains pending and is observed by the existing bounded pump.
   if(options.eager&&running&&!closing)void track(observe).catch(()=>{});
  }catch(error){lastCode=operatorNeedsFunding(error)?'OPERATOR_GAS_UNAVAILABLE':'OPERATOR_RECONCILING';lastError=lastCode==='OPERATOR_GAS_UNAVAILABLE'?operatorFundingMessage:'Sponsor is reconciling a pending operation. Gameplay observations continue.';}
  finally{try{if(locked)await c?.query('SELECT pg_advisory_unlock($1::bigint)',[identity.lock]);}finally{c?.release();sending=false;}}
 }
 const timers=[setInterval(()=>void track(observe).catch(()=>{}),750),setInterval(()=>void track(dispatch).catch(()=>{}),1000)];
 for(const t of timers)t.unref();
 const stop=()=>{running=false;timers.forEach(clearInterval);};
 return {enqueue:(...args:Parameters<typeof enqueue>)=>track(()=>enqueue(...args)),get,account:account.address,
  observe:()=>track(observe),dispatch:()=>track(dispatch),status:()=>({available:!closing&&!lastError,error:lastError||undefined,code:lastCode}),stop,
  close:async()=>{closing=true;stop();await Promise.allSettled([...tasks]);}};
}

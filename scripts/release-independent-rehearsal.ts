// Bounded cleanup of this run's three non-financial fixtures, never production.
// Retain operator nonce ownership and reconcile the same bytes after a lost reply.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient,createWalletClient,http,parseAbi,encodeFunctionData,keccak256,zeroHash} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {readHubDelegation} from '../shared/rooms-hub';
assert.equal(process.env.PONG_ARENA_RELEASE,'completed-nonfinancial-rehearsal');
const record=JSON.parse(await readFile(process.env.PONG_ARENA_PROVISION_JOURNAL!,'utf8'));
const qualification=JSON.parse(await readFile('artifacts/independent-arenas/report.json','utf8'));
const live=JSON.parse(await readFile('deployments/interlude-rooms.json','utf8'));
assert.equal(record.purpose,'independent-hosted-rehearsal');assert.equal(qualification.passed,true);
assert.equal(record.arenas.length,3);
assert(record.arenas.every((a:any)=>a.app.toLowerCase()!==live.app.toLowerCase()&&qualification.arenas.some((b:any)=>b.app===a.app)));
const base=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL,{retryCount:0,timeout:8000})});
assert.equal(await base.getChainId(),10143);
const operator=privateKeyToAccount(JSON.parse(await readFile(process.env.ROOMS_LIFECYCLE_KEY_FILE!,'utf8')).privateKey);
const wallet=createWalletClient({account:operator,chain:monadTestnet,transport:http(process.env.RPC_URL)});
const db=new Pool({connectionString:process.env.DATABASE_URL});
const abi=parseAbi(['function releaseStake(address,bytes32)','function activeCount() view returns(uint256)']);
const report:any={startedAt:new Date().toISOString(),purpose:'bounded fixture cleanup',arenas:[]};
const until=Date.now()+90*60000;
let prior='';
await mkdir('artifacts/independent-arenas',{recursive:true});
async function save(){await writeFile('artifacts/independent-arenas/cleanup.json',JSON.stringify(report,null,2));}
async function release(app:any){
 const c=await db.connect();let locked=false;
 try{
  locked=(await c.query('SELECT pg_try_advisory_lock(701340) AS ok')).rows[0].ok;
  if(!locked)return {app,state:'operator-busy'};
  const d=await readHubDelegation(base,record.hub,app);
  if(d.status===0)return {app,state:'released'};
  assert.equal(d.status,2,'Fixture challenged or still active; manual inspection required');
  if(d.stakeUnlockAt>BigInt(Math.floor(Date.now()/1000)))return {app,state:'waiting',releaseAt:String(d.stakeUnlockAt)};
  assert.equal(await base.readContract({address:app,abi,functionName:'activeCount'}),0n);
  const id=`independent-rehearsal:${app}:${d.epoch}:releaseStake`;
  let job=(await db.query('SELECT * FROM il_lifecycle_jobs WHERE id=$1',[id])).rows[0];
  if(!job){
   if((await db.query("SELECT 1 FROM il_lifecycle_jobs WHERE owner=$1 AND status='pending'",[operator.address.toLowerCase()])).rowCount)return {app,state:'operator-pending'};
   const nonce=await base.getTransactionCount({address:operator.address,blockTag:'pending'});
   assert.equal(nonce,await base.getTransactionCount({address:operator.address,blockTag:'latest'}));
   const data=encodeFunctionData({abi,functionName:'releaseStake',args:[app,zeroHash]});
   await base.call({account:operator.address,to:record.hub,data});
   const request=await wallet.prepareTransactionRequest({to:record.hub,data,nonce});request.gas=request.gas*12n/10n;
   const raw=await wallet.signTransaction(request);job={raw,hash:keccak256(raw),status:'pending'};
   await db.query("INSERT INTO il_lifecycle_jobs(id,app,owner,nonce,raw,hash,status) VALUES($1,$2,$3,$4,$5,$6,'pending')",[id,app,operator.address.toLowerCase(),nonce,raw,job.hash]);
  }
  assert.notEqual(job.status,'failed','Retirement reverted; inspect before retry');
  let receipt=await base.getTransactionReceipt({hash:job.hash}).catch(()=>null);
  if(!receipt){try{await base.sendRawTransaction({serializedTransaction:job.raw});}catch{/* same hash only */}
   receipt=await base.waitForTransactionReceipt({hash:job.hash,timeout:45000});}
  await db.query('UPDATE il_lifecycle_jobs SET status=$2 WHERE id=$1',[id,receipt.status==='success'?'confirmed':'failed']);
  assert.equal(receipt.status,'success');return {app,state:'released',hash:job.hash,block:String(receipt.blockNumber)};
 }finally{if(locked)await c.query('SELECT pg_advisory_unlock(701340)');c.release();}
}
try{
 while(Date.now()<until){
  for(let i=0;i<3;i++)if(report.arenas[i]?.state!=='released')report.arenas[i]=await release(record.arenas[i].app);
  await save();const state=JSON.stringify(report.arenas);if(state!==prior){console.log(state);prior=state;}
  if(report.arenas.every((a:any)=>a.state==='released')){report.complete=true;break;}
  await new Promise(r=>setTimeout(r,30000));
 }
 if(!report.complete)throw Error('Fixture cleanup deadline reached; retain journals and inspect');
}catch(e){report.error=(e as any).shortMessage||(e as Error).message;process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await save();await db.end();console.log(JSON.stringify({complete:report.complete,error:report.error}));}

// Preserve an exact retired qualification journal before handing the key to
// the reusable runtime. No engine submission or operator transaction occurs.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {Pool,type PoolClient} from 'pg';
import {createPublicClient,http,keccak256,type Address} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {reusableAgentArenaAbi as abi} from '../shared/abi-ReusableAgentArena';
import {abi as verifierAbi} from '../shared/abi-independent-PublishedResultVerifier';
import {readHubDelegation} from '../shared/rooms-hub';
import {PublishedResultIndex} from '../shared/published-result-tree';
import {engineJobIdentity} from '../relayer/src/rooms-engine-recovery';
import {initializePoolOperations} from '../relayer/src/agents/pool-engine';
import {createReusableResultArchive} from '../relayer/src/reusable-result-archive';

assert.equal(process.env.PONG_REUSABLE_JOURNAL_IMPORT,'isolated-vps');
assert.equal(process.getuid?.(),1000);
const url=new URL(process.env.AGENT_DATABASE_URL!);
assert.equal(url.hostname,'pongit-reusable-agents2-db');assert.equal(url.pathname,'/reusable_agents_candidate');
const source=await readFile('/input/qualification.json','utf8'),s=JSON.parse(source);
const m=JSON.parse(await readFile('/input/deployment.json','utf8'));
assert.equal(m.rulesVersion,15);assert.equal(m.phase,'deployed-closed');assert.equal(s.pool,m.common.pool);
assert(m.arenas.some((a:any)=>a.app===s.app));assert(s.results.length>0&&s.jobs.length>0);
assert(s.matches.every((v:any)=>v.captured)&&(!s.expiryTest||s.expiryTest.captured),'Capture every result before handoff');
assert(s.jobs.every((v:any)=>v.state==='confirmed'),'An uncertain/reverted source needs explicit reconciliation');
const protectedApps=(process.env.PONG_HUMAN_APPS??'').toLowerCase().split(',').filter(Boolean);
assert(protectedApps.length&&!protectedApps.includes(s.app.toLowerCase()),'Protected human arena');
const base=createPublicClient({transport:http(process.env.RPC_URL,{retryCount:0,timeout:15000})});
assert.equal(await base.getChainId(),10143);
const block=await base.getBlock(),epoch=BigInt(s.epoch),app=s.app as Address;
const hub=await readHubDelegation(base,m.common.hub,app,block.number);
assert(hub.epoch>=epoch&&(hub.epoch>epoch||hub.status===0),'Wait for verified epoch release, never just close/expiry');
const sealed=await base.readContract({address:m.common.verifier,abi:verifierAbi,functionName:'finalizedRoots',args:[app,epoch],blockNumber:block.number});
const tree=new PublishedResultIndex();for(const r of s.results)tree.append(r.index,r.leaf,r.root);
assert.deepEqual(sealed,[tree.root,tree.count],'Finalized root differs from the frozen journal');
const signer=privateKeyToAccount(m.engineKey).address,sourceDigest=keccak256(new TextEncoder().encode(source));
const matchIds=new Set(s.results.map((r:any)=>String(r.id)));
const nonceSet=new Set<string>(),hashes=new Set<string>(),operations=new Set<string>();
const jobs=[];
for(const j of s.jobs){
 assert.equal(String(j.epoch),String(epoch));
 const identity=await engineJobIdentity({id:j.operation,app,epoch:String(epoch),nonce:String(j.nonce),raw:j.raw,hash:j.hash,status:'confirmed'},abi,signer);
 assert(['admit','cancelAdmission','start','tick','submitRandomness'].includes(identity.action),'Unexpected source action');
 assert(matchIds.has(identity.matchId),'Command has no archived result in this epoch');
 assert(!nonceSet.has(String(j.nonce))&&!hashes.has(j.hash)&&!operations.has(j.operation),'Duplicate source nonce/hash/operation');
 nonceSet.add(String(j.nonce));hashes.add(j.hash);operations.add(j.operation);
 // Obsolete records cannot be resent or mistaken for runtime receipts. The
 // original confirmed verdict remains attached as source evidence, not as an
 // invented receipt obtained during this import.
 jobs.push({id:j.hash,app:app.toLowerCase(),epoch:String(epoch),operation:'fixture:'+j.operation,
  signer:signer.toLowerCase(),nonce:String(j.nonce),raw:j.raw,hash:j.hash,
  resolution:{kind:'imported-closed-epoch',sourceDigest,sourceStatus:j.state,sourceOperation:j.operation,
   sourceBlock:j.block??null,closedThrough:String(epoch),block:String(block.number),blockHash:block.hash}});
}
const nonces=[...nonceSet].map(BigInt).sort((a,b)=>a<b?-1:a>b?1:0);
assert(nonces.every((n,i)=>i===0||n===nonces[i-1]+1n),'Source nonce gap requires review');
const db=new Pool({connectionString:url.toString(),max:3});let client:PoolClient|undefined,committed=false;
try{
 await initializePoolOperations(db);
 // Complete result bodies must already be durable and provable before the
 // old writer's journal is handed off. A hash-only archive is insufficient.
 const archive=createReusableResultArchive(db);
 for(const r of s.results){const proof=await archive.proof({chainId:10143n,arena:app,epoch},{count:tree.count,root:tree.root},BigInt(r.id));assert(proof.canonical===r.canonical,'Archived result differs');}
 client=await db.connect();await client.query('BEGIN');
 assert((await client.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,701349)) AS ok',[app.toLowerCase()])).rows[0].ok,'Runtime writer owns the arena');
 assert.equal((await client.query("SELECT count(*) FROM agent_pool.engine_jobs WHERE app=$1 AND status='pending'",[app.toLowerCase()])).rows[0].count,'0','Pending runtime operation');
 for(let offset=0;offset<jobs.length;offset+=100){
  const chunk=jobs.slice(offset,offset+100);
  await client.query(`INSERT INTO agent_pool.engine_jobs(app,id,operation,epoch,signer,nonce,raw,hash,status,resolution)
   SELECT app,id,operation,epoch::numeric,signer,nonce::bigint,raw,hash,'obsolete',resolution
   FROM jsonb_to_recordset($1::jsonb) AS j(app text,id text,operation text,epoch text,signer text,nonce text,raw text,hash text,resolution jsonb)
   ON CONFLICT(app,id) DO NOTHING`,[JSON.stringify(chunk)]);
  const rows:Array<{id:string;raw:string;hash:string;signer:string;nonce:string;epoch:string;operation:string;status:string;resolution:{sourceDigest:string}}>=(await client.query('SELECT * FROM agent_pool.engine_jobs WHERE app=$1 AND id=ANY($2::text[])',[app.toLowerCase(),chunk.map(j=>j.id)])).rows;
  assert.equal(rows.length,chunk.length,'Incomplete journal import');
  for(const j of chunk){const row=rows.find(r=>r.id===j.id);assert(row&&row.raw===j.raw&&row.hash===j.hash&&row.signer===j.signer&&String(row.nonce)===j.nonce
   &&String(row.epoch)===j.epoch&&row.operation===j.operation&&row.status==='obsolete'&&row.resolution.sourceDigest===sourceDigest,'Conflicting journal record');}
 }
 assert.equal((await base.getBlock({blockNumber:block.number})).hash,block.hash,'Release evidence reorganized');
 await client.query('COMMIT');committed=true;
 const report={at:new Date().toISOString(),passed:true,app,epoch:String(epoch),sourceDigest,sourceBlock:String(block.number),sourceHash:block.hash,
  jobs:jobs.length,firstNonce:String(nonces[0]),lastNonce:String(nonces.at(-1)),results:tree.count,finalizedRoot:tree.root,
  scope:'Exact raw commands archived as obsolete only after verified epoch release; no new receipt, signature, engine call or qualification verdict'};
 await mkdir('artifacts/reusable-candidate',{recursive:true});await writeFile(`artifacts/reusable-candidate/journal-import-${Date.now()}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch{
 if(client&&!committed)await client.query('ROLLBACK').catch(()=>{});
 // SQL errors can contain private parameters. Keep the original source and
 // rolled-back transaction for review without rendering those parameters.
 console.error(committed?'Journal committed atomically but report writing failed; rerun idempotently to verify':'Reusable journal import failed before commit; no partial command batch committed');process.exitCode=1;
}finally{client?.release();await db.end();}

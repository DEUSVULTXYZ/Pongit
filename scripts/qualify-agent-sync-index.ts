// Canonical, read-only proof of the isolated rules-16 history and retention.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient,http,type Address} from 'viem';
import {monadTestnet} from 'viem/chains';
import {privateSyncHistory,privateSyncIndexDatabase} from './private-sync-history';
import {privateSyncQualification} from './private-sync-continuation';
import {canonicalContractReads} from '../shared/canonical-contract-reads';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {agentPublishedRatingsAbi as ratingsAbi} from '../shared/abi-AgentPublishedRatings';
assert.equal(process.env.PONG_SYNC_INDEX_VERIFY,'private-read-only');
const deployment=JSON.parse(await readFile('/metadata/reusable.json','utf8'));
const scope=process.env.PONG_PRIVATE_SYNC_CONTINUATION??'private-sync-20261002';
const versions=privateSyncHistory(deployment,scope);
const uri=new URL(process.env.INDEX_DATABASE_URL!);assert.equal(uri.pathname,'/'+privateSyncIndexDatabase(scope));
const db=new Pool({connectionString:uri.href,max:1,options:'-c default_transaction_read_only=on'});
const base=createPublicClient({chain:monadTestnet,batch:{multicall:{wait:10,batchSize:8192}},transport:http(process.env.RPC_URL,{retryCount:0,timeout:10000})});
const attempt=process.env.PONG_SYNC_INDEX_ATTEMPT??'1';assert(/^[1-3]$/.test(attempt));
const path=`/evidence/sync-index-${attempt}.json`;
const report:any={startedAt:new Date().toISOString(),passed:false,matches:[],scope:'Private index snapshot compared with its exact processed canonical block. No chain writes, public migration or browser replay claim.'};
await writeFile(path,JSON.stringify(report),{flag:'wx'});
try{
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const metadata=(await db.query('SELECT * FROM indexer.chain_metadata')).rows;assert.equal(metadata.length,1);
 const rows=(await db.query('SELECT * FROM indexer."Match" ORDER BY id')).rows;
 const recent=(await db.query('SELECT * FROM indexer."RecentReplays"')).rows;
 await db.query('COMMIT');
 assert(BigInt(rows.length)>=privateSyncQualification(scope).results);assert.equal(Number(metadata[0].chain_id),10143);
 const block=await base.getBlock({blockNumber:BigInt(metadata[0].latest_processed_block)});assert(block.hash);
 const read=canonicalContractReads(base,block.hash).read;
 const count=await read<bigint>(deployment.common.ratings,ratingsAbi,'count');assert.equal(BigInt(rows.length),count,'Indexer omitted a published result at its processed block');
 const retained=new Set(recent.flatMap(p=>p.matches));
 const players=new Set(rows.flatMap(r=>[r.playerA,r.playerB]));
 for(const player of players){
  const expected=rows.filter(r=>r.played&&[r.playerA,r.playerB].includes(player))
   .sort((a,b)=>b.endedAt.localeCompare(a.endedAt)||b.id.localeCompare(a.id)).slice(0,3).map(r=>r.id);
  assert.deepEqual(recent.find(r=>r.id===player)?.matches??[],expected,'Three-replay retention differs from recorded history');
 }
 for(const row of rows){
  const [chain,arena,epoch,id]=row.id.split(':');assert.equal(chain,'10143');assert(BigInt(row.block)<=block.number);
  const source=versions.find(v=>v.arenas.includes(arena));assert(source,'Unknown historical arena');
  const ref={chainId:10143n,arena:arena as Address,epoch:BigInt(epoch),id:BigInt(id)};
  const [record,result]=await Promise.all([read<any>(source.pool,poolAbi,'record',[ref]),read<any>(source.pool,poolAbi,'result',[ref])]);
  assert(record.captured);assert([3,4].includes(result.status));assert.equal(row.rulesVersion,source.rulesVersion);
  assert.equal(row.playerA,record.a.toLowerCase());assert.equal(row.playerB,record.b.toLowerCase());
  assert.equal(row.mode,result.mode);assert.equal(row.ranked,record.ranked);assert.equal(row.status,result.status);
  assert.equal(row.scoreA,result.scoreA);assert.equal(row.scoreB,result.scoreB);assert.equal(row.winner,result.winner.toLowerCase());
  assert.equal(row.tournamentId,String(record.tournament));assert.equal(row.played,result.status===3||result.elapsedUs>0n);
  assert.equal(row.replayAvailability,!row.played?'not-played':retained.has(row.id)?'available':'pruned');
  report.matches.push({id:row.id,rules:row.rulesVersion,hash:result.hash,retention:row.replayAvailability});
 }
 assert.equal((await base.getBlock({blockNumber:block.number})).hash,block.hash,'Index anchor reorged');
 report.block={number:String(block.number),hash:block.hash};report.metadata=metadata[0];report.players=players.size;report.retained=retained.size;report.passed=true;
}catch(error){report.error=String((error as any)?.shortMessage??(error as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,240);process.exitCode=1;}
finally{await db.end();report.finishedAt=new Date().toISOString();await writeFile(path,JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,matches:report.matches.length,retained:report.retained,error:report.error}));}

// Read-only replay proof for the exact isolated continuation lineage. No chain writes.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {Pool} from 'pg';
import {createPublicClient,http,type Address} from 'viem';
import {monadTestnet} from 'viem/chains';
import {privateSyncHistory,privateSyncIndexDatabase} from './private-sync-history';
import {poolReplayRetention} from '../relayer/src/agents/pool-replays';
import {restoreEngineFrame} from '../shared/engine-frame-json';
import {canonicalContractReads} from '../shared/canonical-contract-reads';
import {reusableAgentPoolAbi as abi} from '../shared/abi-ReusableAgentPool';
assert.equal(process.env.PONG_SYNC_REPLAY_VERIFY,'private-read-only');
const deployment=JSON.parse(await readFile('/metadata/reusable.json','utf8'));
const scope=process.env.PONG_PRIVATE_SYNC_CONTINUATION??'private-sync-20261002';
const versions=privateSyncHistory(deployment,scope);
const targetUrl=new URL(process.env.AGENT_DATABASE_URL!);assert.equal(targetUrl.pathname,'/'+versions[0].database);
const indexUrl=new URL(process.env.INDEX_DATABASE_URL!);assert.equal(indexUrl.pathname,'/'+privateSyncIndexDatabase(scope));
const options={max:1,options:'-c default_transaction_read_only=on'};
const databases=versions.map(v=>{const uri=new URL(targetUrl);uri.pathname='/'+v.database;return new Pool({...options,connectionString:uri.href});});
const index=new Pool({...options,connectionString:indexUrl.href});
const base=createPublicClient({chain:monadTestnet,batch:{multicall:{wait:10,batchSize:8192}},transport:http(process.env.RPC_URL,{retryCount:0,timeout:10000})});
const retention=poolReplayRetention(process.env.GRAPHQL_URL!,{'x-hasura-admin-secret':process.env.HASURA_ADMIN_SECRET!});
const report:any={startedAt:new Date().toISOString(),passed:false,replays:[],databases:versions.map(v=>v.database),scope:'Canonical results, actual Hasura retention and recorded frame decoder across the exact private lineage. Not browser playback or public migration.'};
const path='/evidence/sync-replays-1.json';await writeFile(path,JSON.stringify(report),{flag:'wx'});
try{
 const rows=(await index.query('SELECT id FROM indexer."Match" ORDER BY id')).rows;
 const retained=[];
 for(let offset=0;offset<rows.length;offset+=64)retained.push(...(await retention(rows.slice(offset,offset+64).map(r=>r.id))).filter(r=>r.replayAvailability==='available'));
 assert(retained.length>0);
 const block=await base.getBlock();assert(block.hash);const read=canonicalContractReads(base,block.hash).read;
 for(const item of retained){
  const [chain,app,epoch,id]=item.id.split(':');assert.equal(chain,'10143');
  const version=versions.findIndex(v=>v.arenas.includes(app));assert(version>=0,'Unknown historical arena');
  const old=version>0,db=databases[version],source=versions[version];
  const row=(await db.query('SELECT * FROM agent_pool.replays WHERE ref=$1',[item.id])).rows[0];
  assert(row&&['available','partial'].includes(row.availability),'Retained replay recording missing');assert.equal(row.rules,source.rulesVersion);assert(row.packed);
  const result=await read<any>(source.pool,abi,'result',
   [{chainId:10143n,arena:app as Address,epoch:BigInt(epoch),id:BigInt(id)}]);
  assert.equal(row.result_hash,result.hash);assert.equal(item.scoreA,result.scoreA);assert.equal(item.scoreB,result.scoreB);
  const raw=JSON.parse(gunzipSync(row.packed,{maxOutputLength:16_000_000}).toString());
  assert(raw.length>0);assert.equal(raw.length,row.frame_count);
  const frames=raw.map(restoreEngineFrame);
  for(let i=0;i<frames.length;i++){
   const f=frames[i];assert.equal(f.id,BigInt(id));assert.equal(f.a.toLowerCase(),item.playerA);assert.equal(f.b.toLowerCase(),item.playerB);
   if(i&&!f.reset){assert(f.revision>frames[i-1].revision);assert(f.state.t>=frames[i-1].state.t);}
  }
  const last=frames.at(-1)!;assert.equal(last.phase,result.status);assert.equal(last.state.scoreA,result.scoreA);assert.equal(last.state.scoreB,result.scoreB);
  assert.equal(last.winner.toLowerCase(),result.winner.toLowerCase());assert.equal(last.state.t,result.elapsedUs);
  report.replays.push({ref:item.id,source:old?'historical':'current',pool:source.pool,database:source.database,availability:row.availability,frames:frames.length,bytes:row.packed.length,sha256:createHash('sha256').update(row.packed).digest('hex')});
 }
 assert(report.replays.some((r:any)=>r.source==='historical'));assert(report.replays.some((r:any)=>r.source==='current'));
 assert.equal((await base.getBlock({blockNumber:block.number})).hash,block.hash);
 report.block={number:String(block.number),hash:block.hash};report.passed=true;
}catch(error){report.error=String((error as any)?.shortMessage??(error as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,240);process.exitCode=1;}
finally{await Promise.all([...databases.map(db=>db.end()),index.end()]);report.finishedAt=new Date().toISOString();await writeFile(path,JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,replays:report.replays.length,error:report.error}));}

// Read-only chain reconciliation of a frozen private qualification archive.
// Imports compact results only, never keys, signed commands or invented receipts.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient,http,decodeAbiParameters,getAbiItem,keccak256,type Address} from 'viem';
import {reusableAgentArenaAbi as arenaAbi} from '../shared/abi-ReusableAgentArena';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {reusableAdmissionDigest} from '../shared/reusable-admission';
import {PublishedResultIndex} from '../shared/published-result-tree';
import {reusableSlotResult} from '../shared/reusable-results';
import {initializeReusableResultArchive,createReusableResultArchive} from '../relayer/src/reusable-result-archive';

assert.equal(process.env.PONG_REUSABLE_ARCHIVE_IMPORT,'isolated-vps');
assert.equal(process.getuid?.(),1000);
const dbUrl=new URL(process.env.AGENT_DATABASE_URL!);
assert.equal(dbUrl.hostname,'pongit-reusable-agents2-db');
assert.equal(dbUrl.pathname,'/reusable_agents_candidate');
const source=await readFile('/input/qualification.json','utf8'),state=JSON.parse(source);
const humans=(process.env.PONG_HUMAN_APPS??'').toLowerCase().split(',').filter(Boolean);
assert(humans.length&&!humans.includes(state.app.toLowerCase()));
assert(!state.jobs.some((j:any)=>j.state!=='confirmed'),'Unresolved source journal');
const blockNumber=BigInt(process.env.PONG_ARCHIVE_SOURCE_BLOCK??'0');assert(blockNumber>0n);
const base=createPublicClient({transport:http(process.env.RPC_URL,{retryCount:0,timeout:15000})});
assert.equal(await base.getChainId(),10143);
const block=await base.getBlock({blockNumber});
const ref={chainId:10143n,arena:state.app as Address,epoch:BigInt(state.epoch)};
const [epoch,count,root]=await base.readContract({address:ref.arena,abi:arenaAbi,functionName:'resultCommitment',blockNumber});
assert.equal(epoch,ref.epoch);assert.equal(state.results.length,count,'Frozen archive must cover the exact source prefix');
assert.equal(await base.readContract({address:state.pool,abi:poolAbi,functionName:'publicAdmissions',blockNumber}),false);
const tree=new PublishedResultIndex(),rows=[];
for(const entry of state.results){
 const id=BigInt(entry.id),[ticket]=await base.readContract({address:state.pool,abi:poolAbi,functionName:'ticketOf',args:[{...ref,id}],blockNumber});
 const result=decodeAbiParameters(getAbiItem({abi:arenaAbi,name:'publishedResult'}).outputs,entry.canonical)[0];
 const row=reusableSlotResult(arenaAbi,ref,15,id,reusableAdmissionDigest(ticket),ticket.sequence,result,[epoch,entry.index+1,entry.root]);
 assert.equal(row.index,entry.index);assert.equal(row.leaf,entry.leaf);assert.equal(row.canonical,entry.canonical);
 tree.append(row.index,row.leaf,row.root);rows.push(row);
}
assert.equal(tree.root,root);assert.equal(tree.count,count);
assert.equal((await base.getBlock({blockNumber})).hash,block.hash,'Source reorganized before import');
const db=new Pool({connectionString:dbUrl.toString(),max:3});
try{
 await initializeReusableResultArchive(db);
 const archive=createReusableResultArchive(db);
 for(const row of rows)await archive.storeSlot(row);
 // Repeating this script is safe; every body must still prove against the same
 // published prefix, including after the physical slot has been reused.
 for(const row of rows){
  const proof=await archive.proof(ref,{count,root},row.matchId);
  assert.equal(proof.canonical,row.canonical);assert.equal(proof.index,row.index);
 }
 const receiptRows=(await db.query('SELECT count(*) FROM il_reusable_results WHERE app=$1 AND epoch=$2',[ref.arena.toLowerCase(),String(epoch)])).rows[0].count;
 const report={at:new Date().toISOString(),passed:true,app:ref.arena,epoch:String(epoch),count,root,
  sourceBlock:String(blockNumber),sourceHash:block.hash,sourceDigest:keccak256(new TextEncoder().encode(source)),
  provedMatches:rows.map(r=>String(r.matchId)),receiptRows,
  scope:'Canonical result archive import only; no command journal handoff, engine write or qualification verdict change'};
 await mkdir('artifacts/reusable-candidate',{recursive:true});
 await writeFile(`artifacts/reusable-candidate/archive-import-${Date.now()}.json`,JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
}finally{await db.end();}

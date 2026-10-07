// Bounded source finality after approved retirement. No gameplay or admission.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {decodeAbiParameters,encodeAbiParameters,getAbiItem,keccak256,type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {keeperRolePolicy} from '../shared/agent-keeper-role';
import {agentContinuationAbi} from '../shared/agent-continuation';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {reusableAgentArenaAbi as arenaAbi} from '../shared/abi-ReusableAgentArena';
import {agentPublishedRatingsAbi as ratingsAbi} from '../shared/abi-AgentPublishedRatings';
import {agentTournamentsAbi as bookAbi} from '../shared/abi-AgentTournaments';
import {abi as verifierAbi} from '../shared/abi-independent-PublishedResultVerifier';
import {createReusableResultArchive} from '../relayer/src/reusable-result-archive';
import {readHubDelegation} from '../shared/rooms-hub';

assert.equal(process.env.PONG_PUBLIC_FINALITY,'reship-source-20261007');
const m=JSON.parse(await readFile('/source/agents.json','utf8'));
assert.equal(m.pool.toLowerCase(),'0x1f7d8a7b470a724df48d1b72723d7782d8e6014a');
const retirement=JSON.parse(await readFile('/evidence/retirement.json','utf8'));
assert(retirement.passed&&retirement.arenas.length===11);
const t=await chainTools('public-reship-source-finality-20261007',undefined,{keyFile:process.env.PONG_AGENT_ROLE_KEY_FILE!,address:process.env.PONG_AGENT_ROLE_ADDRESS! as Address,
 allowCall:keeperRolePolicy('archive',{pool:{address:m.pool,abi:poolAbi},tournaments:{address:m.tournaments,abi:bookAbi}},0n,m.hub)});
const db=new Pool({connectionString:process.env.AGENT_DATABASE_URL,max:2}),archive=createReusableResultArchive(db);
const report:any={startedAt:new Date().toISOString(),passed:false,captures:[],fixtures:[]};
const attempt=Number(process.env.PONG_FINALITY_ATTEMPT??'1');assert([1,2,3].includes(attempt));
const output='/evidence/source-finality-targeted-'+attempt+'.json';
await writeFile(output,JSON.stringify(report),{flag:'wx'});
const save=()=>writeFile(output,JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2));
const read=(address:Address,abi:any,functionName:string,args:any[]=[])=>t.base.readContract({address,abi,functionName,args}) as Promise<any>;
try{
 m.verifier=await read(m.pool,poolAbi,'verifier');
 assert.equal(await read(m.pool,poolAbi,'nonce'),837n);
 assert.equal(await read(m.ratings,ratingsAbi,'count'),837n);
 assert.equal(await read(m.pool,poolAbi,'admissions'),false);
 assert.equal(await read(m.pool,poolAbi,'publicAdmissions'),false);
 assert.equal(await read(m.tournaments,bookAbi,'admissions'),false);
 for(let i=0;i<5;i++)assert.equal((await read(m.pool,poolAbi,'laneRecord',[i])).ref.id,0n);
 for(const a of retirement.arenas.filter((a:any)=>a.kind==='agent')){
  const d=await readHubDelegation(t.base,m.hub,a.app);assert.equal(d.status,0);assert.equal(String(d.epoch),a.epoch);
  assert.deepEqual(await read(a.verifier,verifierAbi,'finalizedRoots',[a.app,BigInt(a.epoch)]),[a.root[2],a.root[1]]);
 }
 const entries:any[]=[];for(let o=0n;o<837n;o+=32n)entries.push(...(await read(m.ratings,ratingsAbi,'resultPage',[o,32n]))[0]);
 // The rating ID is the hash of the complete reference, not the arena match ID.
 const rows=(await db.query('SELECT DISTINCT app,epoch,match_id FROM il_reusable_results WHERE chain_id=10143 UNION SELECT DISTINCT app,epoch,match_id FROM il_reusable_slot_results WHERE chain_id=10143')).rows;
 const references=new Map(rows.map(row=>{
  const ref={chainId:10143n,arena:row.app as Address,epoch:BigInt(row.epoch),id:BigInt(row.match_id)};
  const key=keccak256(encodeAbiParameters([{type:'uint256'},{type:'address'},{type:'uint256'},{type:'uint256'}],[ref.chainId,ref.arena,ref.epoch,ref.id]));
  return [String(BigInt(key)),ref];
 }));
 for(const e of entries.filter(e=>!e.finality)){
  const ref=references.get(String(e.latest.id));assert(ref,'Original complete match reference required');
  assert.equal(ref.arena.toLowerCase(),e.latest.arena.toLowerCase());assert.equal(ref.epoch,e.latest.epoch);
  assert(retirement.arenas.some((a:any)=>a.kind==='agent'&&a.app.toLowerCase()===ref.arena.toLowerCase()&&BigInt(a.epoch)===ref.epoch));
  const [root,finality]=await read(m.verifier,verifierAbi,'currentRoot',[ref.arena,ref.epoch]);assert(finality);
  const proof=await archive.proof({chainId:10143n,arena:ref.arena,epoch:ref.epoch},{root:root.hash,count:root.count},ref.id);
  const complete=decodeAbiParameters(getAbiItem({abi:arenaAbi,name:'publishedResult'}).outputs,proof.canonical)[0];
  assert.equal(complete.match_.hash,e.latest.hash,'Finalization cannot change a score');
  const receipt=await t.write('capture-'+ref.id,m.pool,poolAbi,'captureProof',[ref,complete,proof.siblings]);
  const after=await read(m.ratings,ratingsAbi,'entry',[e.latest.id]);assert.deepEqual(after,{...e,finality:true});
  report.captures.push({id:ref.id,hash:receipt.transactionHash});await save();
 }
 const inherited=await read(m.tournaments,agentContinuationAbi,'inheritedCount');
 assert.equal(await read(m.tournaments,bookAbi,'count'),39n);
 for(let id=inherited+1n;id<=39n;id++){
  const book=await read(m.tournaments,bookAbi,'tournament',[id]);
  for(let index=0;index<(book.league?28:7);index++){
   const f=await read(m.tournaments,bookAbi,'fixture',[id,index]);if(!f.bound||f.published.finality)continue;
   const result=await read(m.pool,poolAbi,'result',[f.ref]);assert(result.finality);
   assert.deepEqual(result,{...f.published,finality:true},'Only finality may change');
   const receipt=await t.write('fixture-'+id+'-'+index,m.tournaments,bookAbi,'synchronize',[id,index]);
   assert((await read(m.tournaments,bookAbi,'fixture',[id,index])).published.finality);
   report.fixtures.push({id,index,hash:receipt.transactionHash});await save();
  }
 }
 for(let o=0n;o<837n;o+=32n)assert((await read(m.ratings,ratingsAbi,'resultPage',[o,32n]))[0].every((e:any)=>e.finality));
 report.passed=true;
}catch(e){report.error=String((e as any).shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,250);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await save();await db.end();await t.close();console.log(JSON.stringify({passed:report.passed,captures:report.captures.length,fixtures:report.fixtures.length,error:report.error}));}

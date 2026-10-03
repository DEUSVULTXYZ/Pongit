// Only promote already-published identical scores to their canonical finality.
// Historical fixtures must be synchronized on their ORIGINAL book and pool.
import assert from 'node:assert/strict';
import {readFile,writeFile}from'node:fs/promises';
import {chainTools}from'./independent-chain-tools';
import {agentTournamentsAbi as bookAbi}from'../shared/abi-AgentTournaments';
import {reusableAgentPoolAbi as poolAbi}from'../shared/abi-ReusableAgentPool';
import {retryOperatorContention}from'../shared/operator-contention';
assert.equal(process.env.PONG_PUBLIC_RETIREMENT,'user-authorized-interrupted-tournament-23');
const output=process.env.PONG_FINALITY_OUTPUT!;assert(/^\/evidence\/public-finality-[12]\.json$/.test(output));
const m=JSON.parse(await readFile('/metadata/source-manifest.json','utf8'));
assert.equal(m.pool.toLowerCase(),'0x205d5739136d6cb73d732e1146e1ce034798a613');
const origins=[m,...(m.history??[])],t=await chainTools('public-retirement-finality-20261003');
const read=(address:any,abi:any,functionName:string,args:any[]=[])=>t.base.readContract({address,abi,functionName,args})as Promise<any>;
const report:any={startedAt:new Date().toISOString(),pool:m.pool,changed:[],pending:[],passed:false};
try{
 assert.equal(await read(m.pool,poolAbi,'admissions'),false);assert.equal(await read(m.tournaments,bookAbi,'admissions'),false);
 assert.equal(await read(m.tournaments,bookAbi,'count'),23n);
 for(let id=1n;id<=23n;id++){
  const book=await read(m.tournaments,bookAbi,'tournament',[id]);
  for(let index=0;index<(book.league?28:7);index++){
   const f=await read(m.tournaments,bookAbi,'fixture',[id,index]);if(!f.bound||f.published.finality)continue;
   const owner=origins.filter(p=>p.arenas.some((a:any)=>a.app.toLowerCase()===f.ref.arena.toLowerCase()));assert.equal(owner.length,1);
   const prior=owner[0],canonical=await read(prior.pool,poolAbi,'result',[f.ref]);
   for(const key of ['hash','status','winner','scoreA','scoreB','elapsedUs'])assert.equal(canonical[key],f.published[key],'Scores must never change in a finality-only operation');
   if(!canonical.finality){report.pending.push({id,index,app:f.ref.arena,epoch:f.ref.epoch});continue;}
   const original=await read(prior.tournaments,bookAbi,'fixture',[id,index]);
   assert.equal(original.ref.arena.toLowerCase(),f.ref.arena.toLowerCase());assert.equal(original.ref.epoch,f.ref.epoch);assert.equal(original.ref.id,f.ref.id);
   assert.equal(original.published.hash,f.published.hash);
   const receipt=await retryOperatorContention(()=>t.write('finality-'+prior.tournaments+'-'+id+'-'+index,prior.tournaments,bookAbi,'synchronize',[id,index]));
   assert.equal((await read(prior.tournaments,bookAbi,'fixture',[id,index])).published.finality,true);
   report.changed.push({id,index,book:prior.tournaments,hash:receipt.transactionHash});
  }
 }
 report.passed=report.pending.length===0;
}catch(e){report.error=String((e as any)?.shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,240);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await writeFile(output,JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2),{flag:'wx'});await t.close();console.log(JSON.stringify({passed:report.passed,changed:report.changed.length,pending:report.pending.length,error:report.error}));}

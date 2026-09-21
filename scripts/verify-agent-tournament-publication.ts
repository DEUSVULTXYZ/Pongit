// Read-only canonical result audit. Completion is not a continuity or finality verdict.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createPublicClient,http,type Address} from 'viem';
import {agentTournamentsAbi as bookAbi} from '../shared/abi-AgentTournaments';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
const [book,pool,idText,out]=process.argv.slice(2);
assert(/^0x[\da-f]{40}$/i.test(book)&&/^0x[\da-f]{40}$/i.test(pool)&&/^\d+$/.test(idText)&&out);
const base=createPublicClient({transport:http(process.env.RPC_URL,{retryCount:0,timeout:15000})});
assert.equal(await base.getChainId(),10143);
const block=await base.getBlock(),id=BigInt(idText);
const read=(address:Address,abi:any,functionName:string,args:readonly unknown[]=[])=>
 base.readContract({address,abi,functionName,args,blockNumber:block.number}) as Promise<any>;
const report:any={at:new Date().toISOString(),book,pool,id:idText,block:String(block.number),blockHash:block.hash,
 passed:false,fixtures:[],scope:'Published results at a canonical block, not continuous service or challenge-final results.'};
try{
 assert.equal((await read(book as Address,bookAbi,'authority')).toLowerCase(),pool.toLowerCase());
 const t=await read(book as Address,bookAbi,'tournament',[id]);report.tournament=t;
 assert.equal(t.status,3,'Tournament is not complete');assert.equal(t.selected,8);
 const refs=new Set<string>();
 for(let index=0;index<(t.league?28:7);index++){
  const fixture=await read(book as Address,bookAbi,'fixture',[id,index]);
  assert(fixture.bound&&fixture.resolved,'Every fixture must be resolved');
  const key=[fixture.ref.chainId,fixture.ref.arena.toLowerCase(),fixture.ref.epoch,fixture.ref.id].join(':');
  assert(!refs.has(key),'A match cannot resolve two fixtures');refs.add(key);
  const record=await read(pool as Address,poolAbi,'record',[fixture.ref]);
  const result=await read(pool as Address,poolAbi,'result',[fixture.ref]);
  assert(record.captured&&record.tournament===id&&record.fixture===index);
  for(const field of ['a','b','hash','mode','status','scoreA','scoreB','elapsedUs','winner'])
   assert.equal(result[field],fixture.published[field],`Pool/tournament mismatch: ${field}`);
  assert(result.status===3&&result.mode===t.mode&&result.scoreA<=7&&result.scoreB<=7);
  assert(result.finality||!fixture.published.finality,'Finality cannot decrease');
  report.fixtures.push({index,ref:fixture.ref,result,administrative:fixture.administrative,attempt:fixture.attempt});
 }
 assert.equal((await base.getBlock({blockNumber:block.number})).hash,block.hash,'Reorganized observation');
 report.passed=true;
}catch(e){report.error=String((e as Error).message).split('\n')[0].slice(0,240);process.exitCode=1;}
await writeFile(out,JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2));
console.log(JSON.stringify({passed:report.passed,fixtures:report.fixtures.length,block:report.block,error:report.error}));

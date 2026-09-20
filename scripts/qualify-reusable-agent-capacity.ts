// Private opening/readiness experiment only. No match admission, budget file,
// public switch or claim of continuous capacity is created by this script.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {Pool} from 'pg';
import {keccak256,type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
import {reusableAgentPoolAbi as abi} from '../shared/abi-ReusableAgentPool';
import {abi as hubAbi} from '../shared/abi-independent-IInterludeHub';
import {validateReusableRecord} from '../relayer/src/agents/reusable-runtime';

assert.equal(process.getuid?.(),1000);
assert.equal(process.env.PONG_REUSABLE_AGENT_CAPACITY,'private-empty-arena-qualification');
const r=JSON.parse(await readFile('/secrets/deployment.json','utf8'));
validateReusableRecord(r,(process.env.PONG_HUMAN_APPS??'').split(',').filter(Boolean));
assert.equal(r.arenas.length,3,'Only the three reviewed candidate arenas');
const t=await chainTools(r.prefix+':capacity-1'),db=new Pool({connectionString:process.env.AGENT_DATABASE_URL,max:2});
const out='artifacts/reusable-candidate/capacity-1.json';await mkdir('artifacts/reusable-candidate',{recursive:true});
let report:any={startedAt:new Date().toISOString(),pool:r.common.pool,arenas:[],passed:false,
 scope:'Three empty private hosted arenas, epoch identity and readiness only; no game/publication/rotation or continuous capacity verdict'};
try{report=JSON.parse(await readFile(out,'utf8'));assert.equal(report.pool,r.common.pool);assert(!report.finishedAt,'Preserve completed verdict');}
catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
const save=async()=>{await writeFile(out+'.next',JSON.stringify(report,null,2));await rename(out+'.next',out);};
try{
 assert.equal((await t.base.readContract({address:r.common.pool,abi,functionName:'owner'})).toLowerCase(),t.account.address.toLowerCase());
 assert.equal(await t.base.readContract({address:r.common.pool,abi,functionName:'publicAdmissions'}),false);
 for(const lane of [0,1])assert.equal((await t.base.readContract({address:r.common.pool,abi,functionName:'laneRecord',args:[lane]})).ref.id,0n,'Do not interfere with a game');
 for(const a of r.arenas){
  const app=a.app as Address;
  assert.equal(keccak256((await t.base.getCode({address:app}))!).toLowerCase(),a.runtimeHash.toLowerCase());
  let d=await readHubDelegation(t.base,r.common.hub,app);
  let row=report.arenas.find((x:any)=>x.app===app);
  if(!row){assert.equal(d.status,0,'Start only with a released arena');
   const prior=await t.base.readContract({address:r.common.pool,abi,functionName:'arenaEpoch',args:[app]});
   row={app,epoch:String(prior+1n),stage:'planned'};report.arenas.push(row);await save();}
  const name='open-'+app.toLowerCase()+'-epoch-'+row.epoch;
  if(d.status===0){
   const validator=await t.base.readContract({address:r.common.hub,abi:hubAbi,functionName:'defaultValidator'});
   const terms=await t.base.readContract({address:r.common.hub,abi:hubAbi,functionName:'termsOf',args:[validator]});
   assert.equal(terms.delegationFee,0n,'Review changed provider fees');
   const receipt=await t.write(name,r.common.pool,abi,'openReusableArena',[app],terms.delegationFee);
   row.hash=receipt.transactionHash;row.gasUsed=String(receipt.gasUsed);
   row.stage='opened';await save();d=await readHubDelegation(t.base,r.common.hub,app);
  }else if(!row.hash){
   // A lost response must resolve the same operation; never invent a new ID.
   const job=(await t.db.query('SELECT hash,status FROM il_lifecycle_jobs WHERE id=$1',[r.prefix+':capacity-1:'+name])).rows[0];
   assert(job,'Unjournaled opening needs inspection');
   const receipt=await t.write(name,r.common.pool,abi,'openReusableArena',[app],0n);
   row.hash=receipt.transactionHash;row.gasUsed=String(receipt.gasUsed);row.stage='opened';
  }
  assert.equal(d.status,1);assert.equal(String(d.epoch),row.epoch);
  row.baseBlock=String(d.baseBlock);row.expiresAt=String(d.expiresAt);await save();
 }
 const deadline=Date.now()+12*60_000;
 while(Date.now()<deadline){
  const rows=(await db.query("SELECT app,stage,detail,updated_at FROM agent_pool.health WHERE updated_at>now()-interval '20 seconds'")).rows;
  for(const a of report.arenas){const health=rows.find(h=>h.app===a.app.toLowerCase());a.hosted=health?{stage:health.stage,epoch:health.detail.epoch,observedAt:health.updated_at}:null;}
  report.observedAt=new Date().toISOString();await save();
  if(report.arenas.every((a:any)=>a.hosted?.stage==='available'&&String(a.hosted.epoch)===a.epoch)){report.passed=true;break;}
  await new Promise(resolve=>setTimeout(resolve,5000));
 }
 assert(report.passed,'All three hosted epochs were not ready before the qualification deadline');
}catch(e){report.error=String((e as any).shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{90,}/gi,'[omitted]').slice(0,300);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await save();await db.end();await t.close();console.log(JSON.stringify(report));}

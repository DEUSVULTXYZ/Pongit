// The decisive measurement: how many hub batches an hour of real agent play costs.
// Read-only. It samples the hub, the dedicated node and the agent database, and
// refuses to state a rate for a window it did not observe as healthy throughout —
// the 24-hour trial declared itself complete while its last three hours were dead.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient,http,type Address} from 'viem';
import {monadTestnet} from 'viem/chains';
import {readHubDelegation} from '../shared/rooms-hub';

assert.equal(process.env.PONG_AGENT_BATCH_RATE,'isolated-vps');
const m=JSON.parse(await readFile(process.env.PONG_AGENT_MANIFEST!,'utf8'));
assert.notEqual(String(m.app).toLowerCase(),'0x78d3341e3452d7ec1add9371de3008639eed8eb0','Measure a dedicated arcade, never the human application');
const app=String(m.app).toLowerCase() as Address;
const seconds=Number(process.env.PONG_AGENT_BATCH_SECONDS??3600),every=Number(process.env.PONG_AGENT_BATCH_INTERVAL??60);
assert(Number.isInteger(seconds)&&seconds>=300&&seconds<=86400,'Measure between five minutes and a day');
assert(Number.isInteger(every)&&every>=10&&every<=300);

const base=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL,{retryCount:1,timeout:10000})});
const db=new Pool({connectionString:process.env.DATABASE_URL,max:2});
const label=process.env.PONG_AGENT_BATCH_LABEL??'baseline';
assert(/^[a-z0-9-]{1,40}$/.test(label),'Name the run so two measurements never overwrite each other');

type Sample={at:string;batchIndex:number;epoch:string;status:number;committed:number|null;ephemeral:number|null;
 matches:Record<string,number>;operations:Record<string,number>;stage:string|null;healthy:boolean;note?:string};

const kinds=async()=>{
 const rows=(await db.query("SELECT split_part(operation,':',1) AS kind,count(*)::int AS n FROM agent_arcade.engine_jobs WHERE app=$1 GROUP BY 1",[app])).rows;
 return Object.fromEntries(rows.map(r=>[r.kind,r.n]));
};
// Completed matches by kind and mode as well as by status: a qualification match
// keeps real controls by design, so a window that mixes them with league play
// would blend the old cost into the new one.
// Player inputs never reach engine_jobs: that journal is the coordinator's own, and
// each player signs its inputs with its own session. The chain counts them anyway,
// as each seat's nonce, which the coordinator copies into the published result.
// That is the only honest place to read whether house clients really went quiet.
const byStatus=async()=>{
 const rows=(await db.query(`SELECT status,kind,mode,count(*)::int AS n,
   coalesce(sum(coalesce((result->>'nonceA')::numeric,0)+coalesce((result->>'nonceB')::numeric,0)),0)::bigint AS inputs
   FROM agent_arcade.matches WHERE app=$1 GROUP BY 1,2,3`,[app])).rows;
 const out:Record<string,number>={};
 for(const r of rows){out[r.status]=(out[r.status]??0)+r.n;out[`${r.status}:${r.kind}:${r.mode}`]=r.n;out[`inputs:${r.status}:${r.kind}:${r.mode}`]=Number(r.inputs);}
 return out;
};
async function sample():Promise<Sample>{
 const at=new Date().toISOString();
 const delegation=await readHubDelegation(base,m.hub as Address,app);
 let committed:number|null=null,ephemeral:number|null=null,note:string|undefined;
 try{
  const session:any=await fetch(m.node+'/health',{signal:AbortSignal.timeout(10000)}).then(r=>r.json());
  if(session.halted)note='The dedicated node reports itself halted';
  committed=Number(session.committedBatches);ephemeral=Number(session.ephemeralBlock);
 }catch(e){note=String((e as Error).message).split('\n')[0].slice(0,120);}
 const health=(await db.query('SELECT stage FROM agent_arcade.health WHERE app=$1',[app])).rows[0];
 const stage=health?.stage??null;
 return {at,batchIndex:Number(delegation.batchIndex),epoch:String(delegation.epoch),status:Number(delegation.status),
  committed,ephemeral,matches:await byStatus(),operations:await kinds(),stage,healthy:stage==='online'&&Number(delegation.status)===1&&!note,note};
}

const samples:Sample[]=[];let stopping=false;
process.on('SIGTERM',()=>{stopping=true;});
const ends=Date.now()+seconds*1000;
samples.push(await sample());
console.log(JSON.stringify({at:samples[0].at,scope:'batch-rate',label,seconds,first:samples[0]}));
while(!stopping&&Date.now()<ends){
 await new Promise<void>(resolve=>{const done=()=>{clearTimeout(timer);process.off('SIGTERM',done);resolve();};const timer=setTimeout(done,Math.min(every*1000,Math.max(0,ends-Date.now())));process.once('SIGTERM',done);});
 if(stopping)break;
 try{samples.push(await sample());}catch(e){samples.push({at:new Date().toISOString(),batchIndex:NaN,epoch:'',status:-1,committed:null,ephemeral:null,matches:{},operations:{},stage:null,healthy:false,note:String((e as Error).message).split('\n')[0].slice(0,120)});}
 const last=samples[samples.length-1];
 console.log(JSON.stringify({at:last.at,batchIndex:last.batchIndex,complete:last.matches.complete??0,stage:last.stage,healthy:last.healthy}));
}
const first=samples[0],last=samples[samples.length-1];
const spanMs=Date.parse(last.at)-Date.parse(first.at);
const delta=(pick:(s:Sample)=>number)=>pick(last)-pick(first);
const completed=delta(s=>s.matches.complete??0);
const completedByKind=Object.fromEntries([...new Set(samples.flatMap(s=>Object.keys(s.matches)))].filter(k=>k.startsWith('complete:'))
 .map(k=>[k.slice('complete:'.length),(last.matches[k]??0)-(first.matches[k]??0)]).filter(([,n])=>n!==0));
const qualificationInWindow=Object.entries(completedByKind).filter(([k])=>k.startsWith('qualification:')).reduce((a,[,n])=>a+Number(n),0);
const batches=delta(s=>s.batchIndex);
const operations=Object.fromEntries([...new Set(samples.flatMap(s=>Object.keys(s.operations)))]
 .map(kind=>[kind,(last.operations[kind]??0)-(first.operations[kind]??0)]));
// Named for what it is: engine_jobs holds coordinator transactions only.
const coordinatorTransactions=Object.values(operations).reduce((a:number,b)=>a+Number(b),0);
const inputsByKind=Object.fromEntries([...new Set(samples.flatMap(s=>Object.keys(s.matches)))].filter(k=>k.startsWith('inputs:complete:'))
 .map(k=>[k.slice('inputs:complete:'.length),(last.matches[k]??0)-(first.matches[k]??0)]).filter(([,n])=>n!==0));
const playerInputs=Object.values(inputsByKind).reduce((a:number,b)=>a+Number(b),0);
const leagueInputs=Object.entries(inputsByKind).filter(([k])=>k.startsWith('league:')).reduce((a,[,n])=>a+Number(n),0);
// Each completed match also carries two acceptances signed by its players.
const transactions=coordinatorTransactions+playerInputs+2*completed;
// A rate computed across an epoch roll is meaningless: batchIndex restarts at zero.
const sameEpoch=samples.every(s=>s.epoch===first.epoch);
const unhealthy=samples.filter(s=>!s.healthy).length;
const report={
 at:new Date().toISOString(),label,app,epoch:first.epoch,scope:'Hub batch growth against real completed matches on the dedicated arcade',
 windowSeconds:Math.round(spanMs/1000),samples:samples.length,unhealthySamples:unhealthy,sameEpoch,
 batches,completedMatches:completed,completedByKind,qualificationInWindow,
 coordinatorTransactions,coordinatorOperations:operations,playerInputs,inputsByKind,transactions,
 // Read from on-chain nonces. With both league seats steered by the contract, zero.
 leagueInputs,
 batchesPerMatch:completed>0?Number((batches/completed).toFixed(3)):null,
 batchesPerHour:spanMs>0?Number((batches/(spanMs/3600000)).toFixed(2)):null,
 transactionsPerMatch:completed>0?Number((transactions/completed).toFixed(1)):null,
 transactionsPerBatch:batches>0?Number((transactions/batches).toFixed(1)):null,
 // Epoch 2 of the previous arcade: 8564 batches for 522 completed matches in 24 h.
 previous:{batches:8564,completedMatches:522,batchesPerMatch:16.406,batchesPerHour:356.8},
 trustworthy:unhealthy===0&&sameEpoch&&completed>=5&&samples.length>=5&&qualificationInWindow===0,
 // Estimated from counts, not observed per transaction: kept apart from the measured fields.
 estimated:['transactions'],
 first,last,
};
await mkdir('artifacts/agents',{recursive:true});
await writeFile(`artifacts/agents/batch-rate-${label}.json`,JSON.stringify({...report,samples},null,2));
console.log(JSON.stringify(report));
await db.end();

// Read-only follow-up to a preserved hosted fixture. Never upgrades its failed
// verdict and never resubmits a command. Private fixture keys are used only to
// derive the existing beneficiary address; they/signatures are never exported.
import {readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,http,decodeFunctionData,parseTransaction,type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {publicIndependentManifest} from '../shared/independent';
import {independentRules} from '../shared/independent-rules';
import {independentReader} from '../shared/independent-read';

if(process.env.PONG_INDEPENDENT_EVENTS_QUALIFICATION!=='isolated-vps')throw Error('Isolated fixture only');
const run=process.env.PONG_EVENTS_RUN??'7';if(!/^[1-9][0-9]?$/.test(run))throw Error('Run reference');
const raw=JSON.parse(await readFile(process.env.PONG_INDEPENDENT_MANIFEST!,'utf8'));
if(raw.production!==false)throw Error('Private manifest required');
const m=publicIndependentManifest(raw),rules=independentRules(m);
const base=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL,{retryCount:0,timeout:15000})});
const reader=independentReader(base,m);
const record=JSON.parse(await readFile(`/secrets/events-live-${run}.json`,'utf8'));
const prior=JSON.parse(await readFile(`artifacts/independent-candidate/events-live-${run}.json`,'utf8'));
const report:any={at:new Date().toISOString(),scope:'Read-only aftermath, original fixture verdict unchanged',sourcePassed:prior.passed,matches:[]};
for(const match of record.matches){
 const id=BigInt(match.id),app=match.app;
 const published=await reader.arena(app,'publishedResult');
 if(published.id!==id||String(published.epoch)!==match.epoch)throw Error('Arena already changed, read preserved epoch proof instead');
 const ledger=await reader.ratings('entry',[id]);
 const jobs=record.jobs.filter((j:any)=>j.app===app&&j.id===match.id);
 const last=jobs.filter((j:any)=>j.state==='reverted').map((j:any)=>{
  const transaction=parseTransaction(j.raw as Hex);
  return{hash:j.hash,nonce:j.nonce,state:j.state,action:decodeFunctionData({abi:rules.arena,data:transaction.data!}).functionName};
 });
 const row:any={app,epoch:match.epoch,id:match.id,published,ledger,unresolved:jobs.filter((j:any)=>j.state==='uncertain').length,reverts:last};
 const inputs=prior.matches.find((x:any)=>x.app.toLowerCase()===app.toLowerCase())?.inputs??[];
 row.commandTiming=[0,1].map(side=>{const times=inputs.filter((x:any)=>x.side===side).map((x:any)=>x.ms).sort((a:number,b:number)=>a-b);return{side,count:times.length,p50:times[Math.ceil(times.length*.5)-1],p95:times[Math.ceil(times.length*.95)-1],p99:times[Math.ceil(times.length*.99)-1]};});
 if(match.mode===1){
  const beneficiary=privateKeyToAccount(record.players[4].owner).address;
  const payoutId=await base.readContract({address:m.market,abi:rules.market,functionName:'payoutId',args:[0,id,beneficiary]});
  row.payment={beneficiary,id:payoutId,payout:await base.readContract({address:m.market,abi:rules.market,functionName:'payouts',args:[payoutId]}),balance:await base.getBalance({address:beneficiary})};
 }
 report.matches.push(row);
}
const text=JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2);
await writeFile(`artifacts/independent-candidate/events-live-${run}-aftermath.json`,text);
console.log(text);

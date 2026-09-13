import {readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,http,type Address} from 'viem';
import {monadTestnet} from 'viem/chains';
import {readHubDelegation} from '../shared/rooms-hub';
const r=JSON.parse(await readFile('/secrets/chaos-events-qualification-20260913.json','utf8'));
const a=JSON.parse(await readFile('contracts/out/PongChaosEvents.sol/PongChaosEvents.json','utf8'));
const base=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL,{retryCount:0,timeout:10000})});
const node=createPublicClient({transport:http(r.node,{retryCount:0,timeout:10000})});
const out:any={at:new Date().toISOString(),app:r.app,node:r.node};
for(const [name,client] of [['Monad',base],['Interlude',node]] as const){
 out[name]=[];
 for(const id of [1n,2n])try{
  const s:any=await client.readContract({address:r.app,abi:a.abi,functionName:'getSnapshot',args:[id]});
  out[name].push({id:String(id),phase:s[2],score:[s[12].scoreA,s[12].scoreB],winner:s[6],revision:s[1],clock:s[12].t});
 }catch(e:any){out[name].push({id:String(id),error:e.shortMessage,details:e.details,causes:[e.cause?.shortMessage,e.cause?.details,e.cause?.cause?.details]});}
}
try{const res=await fetch(`${r.node}/health`);const h:any=await res.json();out.health={http:res.status,...h};}catch(e){out.health=String(e);}
const hub=await base.readContract({address:r.app,abi:a.abi,functionName:'hub'}) as Address;
out.delegation=await readHubDelegation(base,hub,r.app);
await writeFile('artifacts/drand/chaos-hosted-diagnostic.json',JSON.stringify(out,(_,v)=>typeof v==='bigint'?v.toString():v,2));
console.log(JSON.stringify(out,(_,v)=>typeof v==='bigint'?v.toString():v));

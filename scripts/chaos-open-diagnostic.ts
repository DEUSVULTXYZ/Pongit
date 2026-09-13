// Read-only; preserve failed/uncertain operations and do not create another app.
import {readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,http,encodeFunctionData,type Address} from 'viem';
import {readHubDelegation} from '../shared/rooms-hub';
const r=JSON.parse(await readFile('/secrets/chaos-events-integration-20260913.json','utf8'));
const a=JSON.parse(await readFile('contracts/out/PongChaosEvents.sol/PongChaosEvents.json','utf8'));
const client=createPublicClient({transport:http(process.env.RPC_URL,{retryCount:0,timeout:10000})});
const out:any={at:new Date().toISOString(),app:r.app,chain:await client.getChainId(),codeBytes:((await client.getCode({address:r.app}))!.length-2)/2};
for(const name of ['operator','owner','hub','RULES_VERSION','activeCount'])out[name]=await client.readContract({address:r.app,abi:a.abi,functionName:name});
out.session=await readHubDelegation(client,out.hub,r.app);
const call={from:out.operator,to:r.app,data:encodeFunctionData({abi:a.abi,functionName:'renewEngine'})};
for(const [label,url] of [['configured',process.env.RPC_URL],['public','https://testnet-rpc.monad.xyz']] as const){
 const response=await fetch(url!,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_call',params:[call,'latest']})});out[label]={http:response.status,body:await response.json()};
}
try{out.trace=await client.request({method:'debug_traceCall',params:[call,'latest',{tracer:'callTracer'}]} as any);}catch(e:any){out.traceError=e.shortMessage;}
await writeFile('artifacts/drand/open-diagnostic.json',JSON.stringify(out,(_,v)=>typeof v==='bigint'?String(v):v,2));
console.log(JSON.stringify(out,(_,v)=>typeof v==='bigint'?String(v):v));

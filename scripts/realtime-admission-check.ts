import {readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,http,parseAbi} from 'viem';
import {monadTestnet} from 'viem/chains';
const app='0xd2fe1c8df2bdbe2666409fc20f25bcd2f2a40fb5';
const base=createPublicClient({chain:monadTestnet,transport:http('https://testnet-rpc.monad.xyz',{retryCount:0,timeout:15000})});
const a=JSON.parse(await readFile('contracts/out/PongRoomsRealtime.sol/PongRoomsRealtime.json','utf8'));
const h=JSON.parse(await readFile(process.env.PONG_HUB_ARTIFACT||'node_modules/@interludelayer-sdk/cli/artifacts/InterludeHub.sol/InterludeHub.json','utf8'));
const owner=await base.readContract({address:app,abi:a.abi,functionName:'owner'}) as `0x${string}`;
const hub=await base.readContract({address:app,abi:a.abi,functionName:'hub'}) as `0x${string}`;
const validator=await base.readContract({address:hub,abi:h.abi,functionName:'defaultValidator'}) as `0x${string}`;
const terms:any=await base.readContract({address:hub,abi:h.abi,functionName:'termsOf',args:[validator]});
const session=await base.readContract({address:hub,abi:h.abi,functionName:'sessionOf',args:[app,'0x'+'00'.repeat(32)]});
const report:any={at:new Date().toISOString(),app,owner,hub,validator,terms,session,ownerBalance:await base.getBalance({address:owner}),runtimeBytes:((await base.getCode({address:app}))!.length-2)/2};
try{await base.simulateContract({address:app,abi:[...a.abi,...h.abi.filter((x:any)=>x.type==='error')],functionName:'delegateAll',account:owner,value:terms.delegationFee});report.simulation='passed';}
catch(e){let c:any=e;report.simulation=String((e as any).shortMessage).slice(0,250);for(let i=0;c&&i<10;i++,c=c.cause)if(c.data)report.revert=c.data;}
const r=await fetch('https://control.interludelayer.xyz/sessions/'+app);report.lookup={status:r.status,body:await r.json().catch(()=>null)};
const text=JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2);await writeFile('artifacts/realtime/admission.json',text);console.log(text);

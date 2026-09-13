import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createPublicClient,http,encodeFunctionData,type Address} from 'viem';
import {monadTestnet} from 'viem/chains';
import {readHubDelegation} from '../shared/rooms-hub';
import {agentArcadeAbi as abi} from '../shared/abi-PongAgentArcade';
const base=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL,{retryCount:0,timeout:10000})});
const candidate=JSON.parse(await readFile('/secrets/agent-arcade-candidate-20260913.json','utf8'));
const hub='0x3Ef8327F69e09cf721772F345e2A887eA22cD595' as Address;
const hubAbi=JSON.parse(await readFile('node_modules/@interludelayer-sdk/cli/artifacts/InterludeHub.sol/InterludeHub.json','utf8')).abi;
const validator=await base.readContract({address:hub,abi:hubAbi,functionName:'defaultValidator'}) as Address;
const report:any={at:new Date().toISOString(),app:candidate.app,hub,validator,terms:await base.readContract({address:hub,abi:hubAbi,functionName:'termsOf',args:[validator]}),probes:[]};
report.delegation=await readHubDelegation(base,hub,candidate.app);
try{await base.call({account:'0x369158Ac444278541322643E46e0D5b45ac21C4C',to:candidate.app,data:encodeFunctionData({abi,functionName:'renewEngine'})});report.admission='simulation passed';}
catch(e){let selector;for(let c:any=e;c;c=c.cause)if(typeof c.data==='string')selector=c.data;report.admission={selector,error:selector==='0xe90bcd65'?'ValidatorAtCapacity':'unknown'};}
for(const name of ['drand-probe-20260913','drand-probe-recoverable-20260913','drand-probe-scalars-20260913','chaos-events-qualification-20260913','chaos-events-integration-20260913','realtime-20260913','compact-rooms-20260913']){
 try{const r=JSON.parse(await readFile(`/previous/${name}.json`,'utf8'));
  if(r.app)report.probes.push({name,app:r.app,journalState:r.state,delegation:await readHubDelegation(base,hub,r.app)});
 }catch(e){report.probes.push({name,error:String((e as any).shortMessage||(e as Error).message).split('\n')[0].slice(0,100)});}
}
report.human=await fetch('https://pongit.xyz/api/interlude/config').then(r=>r.json()).then(r=>({app:r.app,node:r.node,online:r.online,admission:r.admission}));
await mkdir('artifacts/agents',{recursive:true});await writeFile('artifacts/agents/capacity.json',JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2));
console.log(JSON.stringify({at:report.at,admission:report.admission,probes:report.probes.map((x:any)=>({name:x.name,app:x.app,state:x.journalState,status:x.delegation?.status,epoch:String(x.delegation?.epoch),releaseAt:String(x.delegation?.stakeUnlockAt)})),human:report.human}));

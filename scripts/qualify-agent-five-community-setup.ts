// Deploy and register the shipped contract strategy in the isolated five-lane
// pool. Its dedicated creator retains the SDK's own durable transaction journal.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {parseEther} from 'viem';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {agentCatalogAbi} from '../shared/abi-AgentCatalog';
import {agentMetrics} from '../relayer/src/agents/metrics';
import {measuredFetch} from '../shared/rpc-metrics';
assert.equal(process.env.PONG_FIVE_COMMUNITY,'bounded-private-contract');
const r=JSON.parse(await readFile('/secrets/deployment.json','utf8'));assert(r.maxMatches===5&&!r.continuation);
const file='/secrets/five-community.json';let privateState:any;
try{privateState=JSON.parse(await readFile(file,'utf8'));}catch(e){if((e as any).code!=='ENOENT')throw e;privateState={key:generatePrivateKey(),pool:r.common.pool};await writeFile(file,JSON.stringify(privateState),{flag:'wx',mode:0o600});}
assert.equal(privateState.pool,r.common.pool);const creator=privateKeyToAccount(privateState.key);
const report:any={startedAt:new Date().toISOString(),pool:r.common.pool,creator:creator.address,registered:false,qualified:false};
const attempt=Number(process.env.PONG_FIVE_COMMUNITY_ATTEMPT??1);assert(attempt>=1&&attempt<=3&&Number.isInteger(attempt));
const out=`artifacts/reusable-candidate/five-community-setup${attempt>1?'-attempt'+attempt:''}.json`;await writeFile(out,JSON.stringify(report),{flag:'wx'});
const metrics=await agentMetrics('/diagnostics/reusable','community-qualification');
const t=await chainTools(r.prefix+':five-community',measuredFetch('monad'));
try{
 await t.preflight(['TrackerStrategy']);
 privateState.strategy=await retryOperatorContention(()=>t.deploy('TrackerStrategy',[creator.address,12n]));await writeFile(file,JSON.stringify(privateState),{mode:0o600});
 await retryOperatorContention(()=>t.submit('creator-gas','0x',creator.address,parseEther('1')));
 process.env.AGENT_PRIVATE_QUALIFICATION='isolated-vps';process.env.AGENT_API='http://pongit-five-20260928-1-sponsor-1:4102/agents';
 process.env.PONG_AGENT_POOL=r.common.pool;process.env.CREATOR_KEY=privateState.key;process.env.STRATEGY=privateState.strategy;
 process.env.AGENT_NAME='Community Tracker';process.env.AGENT_AVATAR='4';process.env.MODES='3';process.env.AGENT_AVAILABILITY='on';
 process.env.STRATEGY_STATE='/secrets/five-community-sdk.json';
 // The SDK records payload-free transport metrics in this process's sink.
 await import('../agent-sdk/pool-strategy');
  const until=Date.now()+600000;
  while(Date.now()<until){
   const identity=await t.base.readContract({address:r.common.catalog,abi:agentCatalogAbi,functionName:'identity',args:[privateState.strategy]});
   if(identity.creator.toLowerCase()===creator.address.toLowerCase()&&identity.available){report.registered=true;report.identity=identity;break;}
   if(process.exitCode)throw Error('SDK registration failed; preserve its journal');await new Promise(resolve=>setTimeout(resolve,1500));
  }
  assert(report.registered,'Bounded SDK registration deadline');report.strategy=privateState.strategy;
  report.registeredBlock=await t.base.readContract({address:r.common.catalog,abi:agentCatalogAbi,functionName:'registeredBlock',args:[privateState.strategy]});
}catch(e){report.error=String((e as any)?.shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,200);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await writeFile(out,JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2));await t.close();await metrics();console.log(JSON.stringify({registered:report.registered,qualified:false,error:report.error}));}

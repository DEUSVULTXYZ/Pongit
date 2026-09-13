// Dedicated candidate only. This never writes the human manifest or opens a
// market/vault, and uses the existing operator nonce journal for Monad writes.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {createPublicClient,http,keccak256,type Address} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
import {agentArcadeAbi as abi} from '../shared/abi-PongAgentArcade';
import {houseBots,type AgentManifest} from '../shared/agents';
assert.equal(process.env.PONG_AGENT_DEPLOY,'authorized-dedicated-testnet');
if(!process.env.DATABASE_URL)process.env.DATABASE_URL=`postgresql://pong:${encodeURIComponent(process.env.POSTGRES_PASSWORD!)}@postgres:5432/pong_relayer`;
const prefix='agent-arcade-candidate-20260913',file=`/secrets/${prefix}.json`;
let r:any;try{r=JSON.parse(await readFile(file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
const save=async()=>{await writeFile(file+'.next',JSON.stringify(r,null,2),{mode:0o600});await rename(file+'.next',file);};
if(!r){r={coordinator:generatePrivateKey(),creator:generatePrivateKey(),bots:houseBots.map(p=>{const key=generatePrivateKey();return {...p,key,address:privateKeyToAccount(key).address};}),createdAt:new Date().toISOString(),phase:'deploying'};await save();}
const qualified=JSON.parse(await readFile('/qualified-modules.json','utf8'));
assert.equal(qualified.app,'0x78d3341e3452d7ec1add9371de3008639eed8eb0');
const t=await chainTools(prefix),hub='0x3Ef8327F69e09cf721772F345e2A887eA22cD595' as Address;
try{
 const engine=qualified.modules.ChaosEngine as Address;
 for(const address of [engine,qualified.flow as Address])assert((await t.base.getCode({address}))!.length>2);
 t.deployed.ChaosGameFlow=qualified.flow;
 const coordinator=privateKeyToAccount(r.coordinator).address;
 r.app=await t.deploy('PongAgentArcade',[hub,coordinator,t.account.address,engine]);await save();
 assert.notEqual(r.app.toLowerCase(),qualified.app.toLowerCase());
 assert.equal(await t.base.readContract({address:r.app,abi,functionName:'RULES_VERSION'}),7n);
 assert.equal(await t.base.readContract({address:r.app,abi,functionName:'MATCH_DURATION_US'}),300000000n);
 const before=await readHubDelegation(t.base,hub,r.app);
 if(before.status===0){r.openHash=(await t.write('open-candidate',r.app,abi,'renewEngine')).transactionHash;await save();}
 const opened=await readHubDelegation(t.base,hub,r.app);assert.equal(opened.status,1);r.epoch=String(opened.epoch);await save();
 const lookup=await fetch(`https://control.interludelayer.xyz/sessions/${r.app}`,{signal:AbortSignal.timeout(15000)});let session:any=await lookup.json();
 if(lookup.status===404){
  assert(!r.requestAt,'Hosted creation is uncertain: reconcile the existing request');r.requestAt=new Date().toISOString();await save();
  const response=await fetch('https://control.interludelayer.xyz/sessions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({app:r.app}),signal:AbortSignal.timeout(60000)});
  r.http=response.status;session=await response.json();await save();assert(response.ok,`Hosted creation returned HTTP ${response.status}`);
 }else assert(lookup.ok,`Hosted lookup returned HTTP ${lookup.status}`);
 r.node=session.url||session.node;assert(r.node&&new URL(r.node).protocol==='https:');await save();
 const node=createPublicClient({transport:http(r.node,{retryCount:0,timeout:10000})});assert.equal(await node.getChainId(),4242);
 assert.equal(await node.readContract({address:r.app,abi,functionName:'RULES_VERSION'}),7n);
 const health=await fetch(`${r.node}/health`,{signal:AbortSignal.timeout(10000)}).then(x=>x.json());assert(!health.halted);
 const manifest:AgentManifest={version:1,chainId:10143,engineChainId:4242,rulesVersion:7,app:r.app,hub,node:r.node,coordinator,epoch:r.epoch,enabled:false,qualified:false,maxMatches:2,durationSeconds:300};
 await mkdir('artifacts/agents',{recursive:true});await writeFile('artifacts/agents/candidate.json',JSON.stringify(manifest,null,2));
 await writeFile('/secrets/manifest.json',JSON.stringify(manifest,null,2),{mode:0o600});
 r.phase='hosted-candidate';await save();
 console.log(JSON.stringify({app:r.app,node:r.node,epoch:r.epoch,opened:r.openHash,engine,flow:qualified.flow,bytecodeHash:keccak256((await t.base.getCode({address:r.app}))!),publiclyEnabled:false}));
}finally{await t.close();}

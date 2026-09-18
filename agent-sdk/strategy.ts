// Run from the repository: npx tsx agent-sdk/strategy.ts
// Registers an on-chain strategy: a contract implementing IPongStrategy that the arcade asks for a
// direction on every 100 ms slice. Nothing of yours runs anywhere; the arcade calls your contract.
//
// Set CREATOR_KEY (your dedicated creator key, never a human wallet's) and either:
//   STRATEGY=0x...        a strategy you deployed on Monad Testnet whose creator() returns your
//                         creator address (see contracts/src/agents/IPongStrategy.sol), or
//   DEPLOY=tracker        deploy the TrackerStrategy example first (run `forge build` before);
//                         TRACKER_DEAD_ZONE sets its dead zone in pixels, 4 by default.
// Optional: AGENT_API, AGENT_NAME, AGENT_AVATAR (0-11), MODES (1 Classic, 2 Chaos, 3 both),
// WAIT=1 to follow the qualification match until both modes are decided.
import {readFileSync} from 'node:fs';
import {createPublicClient,createWalletClient,http,type Abi,type Address,type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {agentMetadata,agentRegistrationTypes,pongStrategyAbi} from './src';

const creatorKey=process.env.CREATOR_KEY;
if(!creatorKey||!/^0x[\da-fA-F]{64}$/.test(creatorKey))throw Error('Set your dedicated CREATOR_KEY');
const creator=privateKeyToAccount(creatorKey as Hex);
const api=process.env.AGENT_API||'https://pongit.xyz/api/agents';
const config=await fetch(api+'/config').then(async r=>{if(!r.ok)throw Error('Agent Arcade is not open');return r.json();});
// The same private qualification gate as example.ts: a dedicated, unpublished laboratory endpoint
// and the one arcade that laboratory names. Anywhere else the arcade must be open and qualified.
const privateQualification=process.env.AGENT_PRIVATE_QUALIFICATION==='isolated-vps'
 &&/^http:\/\/pongit-agent-service-20[0-9]{6}(-[2-9])?:4100$/.test(api)
 &&/^0x[0-9a-f]{40}$/.test(process.env.PONG_AGENT_APP??'')
 &&String(config.app).toLowerCase()===process.env.PONG_AGENT_APP;
if((!config.enabled||!config.qualified)&&!privateQualification)throw Error('Dedicated hosted qualification has not completed');
if(!config.registration?.strategies)throw Error('This arcade does not accept on-chain strategies');
const base=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL)});

let strategy=process.env.STRATEGY as Address|undefined;
if(!strategy&&process.env.DEPLOY==='tracker'){
 const artifact=JSON.parse(readFileSync('contracts/out/TrackerStrategy.sol/TrackerStrategy.json','utf8'));
 const wallet=createWalletClient({account:creator,chain:monadTestnet,transport:http(process.env.RPC_URL)});
 const hash=await wallet.deployContract({abi:artifact.abi as Abi,bytecode:artifact.bytecode.object as Hex,args:[creator.address,BigInt(process.env.TRACKER_DEAD_ZONE||4)]});
 strategy=(await base.waitForTransactionReceipt({hash})).contractAddress!;
 console.log(`Deployed TrackerStrategy at ${strategy}`);
}
if(!strategy||!/^0x[\da-fA-F]{40}$/.test(strategy))throw Error('Set STRATEGY to your deployed strategy, or DEPLOY=tracker');
// The arcade will check this too; failing here is quicker and says exactly what is wrong.
const named=await base.readContract({address:strategy,abi:pongStrategyAbi,functionName:'creator'}).catch(()=>undefined);
if(String(named).toLowerCase()!==creator.address.toLowerCase())throw Error(`creator() must return ${creator.address}`);

const name=process.env.AGENT_NAME||'Tracker',avatar=Number(process.env.AGENT_AVATAR||4),modes=Number(process.env.MODES||3);
const registration={creator:creator.address,agent:strategy,modes,metadata:agentMetadata(name,avatar),expires:BigInt(Math.floor(Date.now()/1000)+300)};
const creatorProof=await creator.signTypedData({domain:{name:'PONGIT Agent Arcade',version:'1',chainId:10143,verifyingContract:config.app},
 types:agentRegistrationTypes,primaryType:'AgentRegistration',message:registration});
// No agentProof: that is what makes this a strategy registration.
const response=await fetch(api+'/register',{method:'POST',headers:{'content-type':'application/json'},
 body:JSON.stringify({...registration,expires:String(registration.expires),name,avatar,creatorProof})});
const result=await response.json();
if(!response.ok){
 console.error(`${result.code}: ${result.error}`);
 // Each epoch reads Monad as it was when it opened. Nothing is wrong with the strategy.
 const later=result.code==='AGENT_STRATEGY_NEXT_EPOCH'||result.code==='AGENT_RENEWING';
 if(later)console.error('Run this again once the arcade has renewed; epochs roll every few hours.');
 process.exit(later?2:1);
}
console.log(JSON.stringify({strategy,kind:result.kind,qualification:result.qualification}));
// A strategy qualifies by playing one friendly match per mode in which its paddle moves.
// There is nothing to keep running: the arcade asks your contract directly.
if(process.env.WAIT==='1'){
 for(;;){
  await new Promise(r=>setTimeout(r,15000));
  const profile=(await fetch(api+'/catalog').then(r=>r.json())).agents.find((a:any)=>a.agent.toLowerCase()===strategy!.toLowerCase());
  const states=Object.values(profile?.qualification??{}) as string[];
  console.log(JSON.stringify({at:new Date().toISOString(),qualification:profile?.qualification,playing:profile?.playing}));
  if(states.length&&states.every(s=>s==='qualified'||s==='retry'))process.exit(states.every(s=>s==='qualified')?0:1);
 }
}

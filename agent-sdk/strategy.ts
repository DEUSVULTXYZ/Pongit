// Run from the repository root: npx tsx agent-sdk/strategy.ts
// Registers an on-chain strategy: a contract implementing IPongStrategy that the arcade asks for a
// direction on every 100 ms slice. Nothing of yours runs anywhere; the arcade calls your contract.
//
// Set CREATOR_KEY (your dedicated creator key, never a human wallet's) and either:
//   STRATEGY=0x...        a strategy you deployed on Monad Testnet whose creator() returns your
//                         creator address (see contracts/src/agents/IPongStrategy.sol), or
//   DEPLOY=tracker        the TrackerStrategy example, built first with `forge build --root contracts`
//                         (a bare `forge build` at the root does not write contracts/out). It is
//                         deployed once: its address is kept in STRATEGY_STATE, by default
//                         .agent-state/strategies.json, and every later run registers that same
//                         contract. TRACKER_DEAD_ZONE sets its dead zone in pixels, 4 by default.
// Optional: AGENT_API, RPC_URL, AGENT_NAME, AGENT_AVATAR (0-11), MODES (1 Classic, 2 Chaos, 3 both),
// WAIT=1 to follow qualification until every mode is decided, for at most WAIT_HOURS (6).
// Exit codes: 0 registered (with WAIT=1, qualified in every mode); 1 something to fix, printed;
// 2 not yet: run the same command again after the arcade's next renewal; 3 a mode failed its
// qualification match, and the same command queues it again; 4 WAIT stopped following it.
import {readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {createPublicClient,createWalletClient,getContractAddress,http,type Abi,type Address,type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {agentMetadata,agentRegistrationTypes,pongStrategyAbi} from './src';

const creatorKey=process.env.CREATOR_KEY;
if(!creatorKey||!/^0x[\da-fA-F]{64}$/.test(creatorKey))throw Error('Set your dedicated CREATOR_KEY');
const creator=privateKeyToAccount(creatorKey as Hex);
const api=process.env.AGENT_API||'https://pongit.xyz/api/agents';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const short=(e:unknown)=>String((e as Error)?.message??e).split('\n')[0].replace(/0x[\da-fA-F]{64,}/g,'[omitted]').slice(0,180);

// One request to the arcade's service. While the service restarts for a renewal, the proxy in
// front of it answers without JSON: that stays the gateway failure it is, not a parse error.
async function call(path:string,body?:unknown):Promise<any>{
 const response=await fetch(api+path,body===undefined?undefined:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const value=await response.json().catch(()=>undefined);
 if(response.ok&&value!==undefined)return value;
 throw Object.assign(Error(value?.error??`The arcade answered HTTP ${response.status}`),{status:response.ok?502:response.status,code:value?.code,retryAt:value?.retryAt});
}
// A renewal (503 AGENT_RENEWING, then the service's own restart), a rate limit (429) or a network
// blip passes within minutes. Anything else is the arcade's answer about this registration.
const passing=(e:unknown)=>{const {status,code}=e as {status?:number;code?:string};
 return e instanceof TypeError||status===429||status===502||status===503||status===504||code==='AGENT_RENEWING'||code==='AGENT_API_LIMIT';};
// Wait those out and try again, as example.ts does. An hour of them means the arcade is not coming
// back soon: exit 2, which tells a caller to come back later rather than to fix something.
async function patiently<T>(step:()=>Promise<T>):Promise<T>{
 const until=Date.now()+3600_000;
 for(let attempt=0;;attempt++){
  try{return await step();}
  catch(e){
   if(!passing(e))throw e;
   if(Date.now()>until){console.error(`The arcade has not answered for an hour (${short(e)}). Run this again later.`);process.exit(2);}
   console.error(`Waiting for the arcade: ${short(e)}`);
   await sleep(Math.max(5000*2**Math.min(attempt,3),Math.min(60000,Number((e as {retryAt?:number}).retryAt||0)-Date.now())));
  }
 }
}

const config=await patiently(()=>call('/config')).catch(e=>{throw Error(`Agent Arcade is not open: ${short(e)}`);});
// The same private qualification gate as example.ts: a dedicated, unpublished laboratory endpoint
// and the one arcade that laboratory names. Anywhere else the arcade must be open and qualified.
const privateQualification=process.env.AGENT_PRIVATE_QUALIFICATION==='isolated-vps'
 &&/^http:\/\/pongit-agent-service-20[0-9]{6}(-[2-9])?:4100$/.test(api)
 &&/^0x[0-9a-f]{40}$/.test(process.env.PONG_AGENT_APP??'')
 &&String(config.app).toLowerCase()===process.env.PONG_AGENT_APP;
if((!config.enabled||!config.qualified)&&!privateQualification)throw Error('Dedicated hosted qualification has not completed');
if(!config.registration?.strategies)throw Error('This arcade does not accept on-chain strategies');
const base=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL)});

// The trackers this creator deployed, per arcade and creator, in a private file like example.ts's
// session (.agent-state is outside Git). Without it every run would deploy a new tracker, which the
// current epoch cannot see either, and the same command run after a renewal would never register.
const stateFile=resolve(process.env.STRATEGY_STATE||'.agent-state/strategies.json');
type Deployment={strategy:Address;nonce:number;deadZone:string;deployed?:string};
let deployments:Record<string,Deployment>={};
try{deployments=JSON.parse(readFileSync(stateFile,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
const remember=()=>{mkdirSync(dirname(stateFile),{recursive:true,mode:0o700});writeFileSync(stateFile+'.next',JSON.stringify(deployments,null,1),{mode:0o600});renameSync(stateFile+'.next',stateFile);};
const owner=creator.address.toLowerCase(),slot=`${String(config.app).toLowerCase()}:${owner}`;

let strategy=process.env.STRATEGY as Address|undefined,recorded=false;
if(!strategy&&process.env.DEPLOY==='tracker'){
 const exists=async(address:Address)=>((await base.getCode({address}))??'0x')!=='0x';
 // This arcade's own record first; else a tracker this creator already deployed for another
 // arcade, which has existed for longer, so the current epoch is more likely to see it.
 let entry:Deployment|undefined=deployments[slot]??Object.entries(deployments).find(([key,d])=>key.endsWith(':'+owner)&&d.deployed)?.[1];
 const present=!!entry&&await exists(entry.strategy);
 // A recorded deployment whose contract is missing although its nonce is spent never landed (it
 // reverted, or this key sent something else at that nonce): only then is another one made.
 if(entry&&!present&&await base.getTransactionCount({address:creator.address})>entry.nonce){
  console.error(`The deployment recorded for ${entry.strategy} never landed; deploying a new tracker`);entry=undefined;
 }
 if(entry&&present){
  if(process.env.TRACKER_DEAD_ZONE&&process.env.TRACKER_DEAD_ZONE!==entry.deadZone)console.error(`TRACKER_DEAD_ZONE is not applied: this tracker was deployed with ${entry.deadZone} px`);
  console.log(`Using the TrackerStrategy already deployed at ${entry.strategy}, recorded in ${stateFile}`);
 }else{
  let artifact:any;
  try{artifact=JSON.parse(readFileSync('contracts/out/TrackerStrategy.sol/TrackerStrategy.json','utf8'));}
  catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')throw Error('Build the example first, from the repository root: forge build --root contracts');throw e;}
  const deadZone=entry?.deadZone??String(BigInt(process.env.TRACKER_DEAD_ZONE||4));
  const nonce=entry?.nonce??await base.getTransactionCount({address:creator.address,blockTag:'pending'});
  // Recorded before it is sent. A run that stops before its receipt sends the same deployment
  // again at the same nonce, and one nonce can only ever create one contract.
  entry=deployments[slot]={strategy:getContractAddress({from:creator.address,nonce:BigInt(nonce)}),nonce,deadZone};remember();
  const wallet=createWalletClient({account:creator,chain:monadTestnet,transport:http(process.env.RPC_URL)});
  const hash=await wallet.deployContract({abi:artifact.abi as Abi,bytecode:artifact.bytecode.object as Hex,args:[creator.address,BigInt(deadZone)],nonce})
   .catch(e=>{throw Error(`The tracker was not deployed (${short(e)}). Running this again sends it at the same nonce, so it cannot leave two trackers`);});
  const receipt=await base.waitForTransactionReceipt({hash});
  if(receipt.status!=='success'||!await exists(entry.strategy))throw Error(`Deployment ${hash} did not create ${entry.strategy}; running this again deploys a new tracker`);
  console.log(`Deployed TrackerStrategy at ${entry.strategy}, recorded in ${stateFile}: every later run registers this same contract`);
 }
 if(!entry.deployed||deployments[slot]!==entry){entry.deployed??=new Date().toISOString();deployments[slot]=entry;remember();}
 strategy=entry.strategy;recorded=true;
}
if(!strategy||!/^0x[\da-fA-F]{40}$/.test(strategy))throw Error('Set STRATEGY to your deployed strategy, or DEPLOY=tracker');
const agent=strategy;
// The arcade will check this too; failing here is quicker and says exactly what is wrong.
const named=await base.readContract({address:agent,abi:pongStrategyAbi,functionName:'creator'}).catch(()=>undefined);
if(String(named).toLowerCase()!==owner)throw Error(`creator() must return ${creator.address}`);

const name=process.env.AGENT_NAME||'Tracker',avatar=Number(process.env.AGENT_AVATAR||4),modes=Number(process.env.MODES||3);
const again=recorded?`the same command (it registers ${agent}, recorded in ${stateFile}, and deploys nothing new)`:`the same command with STRATEGY=${agent}`;
const result=await patiently(async()=>{
 // Signed afresh on every attempt: a registration is only valid for five minutes.
 const registration={creator:creator.address,agent,modes,metadata:agentMetadata(name,avatar),expires:BigInt(Math.floor(Date.now()/1000)+300)};
 const creatorProof=await creator.signTypedData({domain:{name:'PONGIT Agent Arcade',version:'1',chainId:10143,verifyingContract:config.app},
  types:agentRegistrationTypes,primaryType:'AgentRegistration',message:registration});
 // No agentProof: that is what makes this a strategy registration.
 return call('/register',{...registration,expires:String(registration.expires),name,avatar,creatorProof});
}).catch(e=>{
 const code=(e as {code?:string}).code;
 console.error(`${code??'ERROR'}: ${short(e)}`);
 // Each epoch reads Monad as it was when it opened. Nothing is wrong with the strategy, but
 // nothing was registered either: it only plays once it is sent again after the renewal.
 if(code==='AGENT_STRATEGY_NEXT_EPOCH'){console.error(`Nothing was registered. Run ${again} once the arcade has renewed; epochs roll every few hours.`);process.exit(2);}
 if(code==='AGENT_ALREADY_REGISTERED')console.error('It is registered here with another AGENT_NAME, AGENT_AVATAR or MODES: use the ones it was first registered with.');
 process.exit(1);
});
console.log(JSON.stringify({strategy:agent,kind:result.kind,qualification:result.qualification}));
// A strategy qualifies by playing one friendly match per mode in which its paddle moves. There is
// nothing to keep running: the arcade asks your contract directly, whether or not this follows it.
// 'retry' may be queued again by signing again; 'failed' has used its retries (the coordinator
// allows a few per mode) and waits for a later registration. Both mean this run is decided.
const verdict=(q:unknown)=>{const states=Object.values(q??{}) as string[];
 if(!states.length||!states.every(s=>s==='qualified'||s==='retry'||s==='failed'))return undefined;return states.every(s=>s==='qualified')?0:3;};
if(process.env.WAIT==='1'){
 const hours=Number(process.env.WAIT_HOURS)||6,until=Date.now()+hours*3600_000;
 let decided=verdict(result.qualification),missing=0;
 while(decided===undefined){
  if(Date.now()>until){console.error(`Not decided after ${hours} h. Qualification goes on without this script: see ${api}/catalog`);process.exit(4);}
  await sleep(15000);
  let now:any,catalog:any;
  try{[now,catalog]=await Promise.all([call('/config'),call('/catalog')]);}
  catch(e){if(!passing(e))throw e;console.error(`Waiting for the arcade: ${short(e)}`);continue;}
  // A retired arcade's service moves to a new one, where this registration does not exist.
  if(String(now.app).toLowerCase()!==String(config.app).toLowerCase()){console.error(`The service now runs a new arcade, ${now.app}. Run ${again} to register there.`);process.exit(4);}
  // Listed from the moment it registered, so missing twice running means gone, not a blip.
  const profile=(catalog.agents??[]).find((a:any)=>a.agent.toLowerCase()===agent.toLowerCase());
  if(!profile){if(++missing>=2){console.error(`${agent} is no longer in this arcade's catalog. Run ${again} to register it again.`);process.exit(4);}continue;}
  missing=0;
  console.log(JSON.stringify({at:new Date().toISOString(),qualification:profile.qualification,playing:profile.playing}));
  decided=verdict(profile.qualification);
 }
 if(decided===3)console.error(`A mode failed its qualification match. Run ${again} to queue it for another.`);
 process.exit(decided);
}

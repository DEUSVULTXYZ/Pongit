// Private rules15 candidate. No delegations or public gates are opened here.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {getAddress,keccak256,toHex,type Address} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {agentMetadata} from '../shared/agents';
import {pooledHouseBots} from '../shared/agent-pool';

assert.equal(process.env.PONG_REUSABLE_AGENT_DEPLOY,'authorized-private-testnet');
assert.equal(process.getuid?.(),1000);
const prefix=process.env.PONG_REUSABLE_AGENT_PREFIX!;assert(/^reusable-agents-\d{8}(?:-[1-9]\d?)?$/.test(prefix));
const file='/secrets/deployment.json',hub='0x3Ef8327F69e09cf721772F345e2A887eA22cD595' as Address,arenaCount=3;
const humans=(process.env.PONG_HUMAN_APPS??'').toLowerCase().split(',').filter(Boolean);assert(humans.length>0);
let r:any;try{r=JSON.parse(await readFile(file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
const save=async()=>{await writeFile(file+'.next',JSON.stringify(r,null,2),{mode:0o600});await rename(file+'.next',file);};
const t=await chainTools(prefix);
try{
 await t.preflight(['ChaosCodec','ChaosEffects','ChaosModifiers','ChaosDynamics','ChaosContacts','ChaosRally','ChaosPhysics','DrandEvmnet','ChaosDrawRules','ChaosEngine',
  'HousePolicies','AgentCatalog','ReusableAgentPool','PublishedResultVerifier','AgentTournaments','AgentPublishedRatings','AgentQualifications','ArcadeFamily','AgentChallenges','ReusableAgentArena']);
 if(!r){r={prefix,rulesVersion:15,arenaCount,genesis:String((await t.base.getBlock()).timestamp),admissionKey:generatePrivateKey(),engineKey:generatePrivateKey(),phase:'deploying',createdAt:new Date().toISOString()};await save();}
 assert.equal(r.prefix,prefix);assert.equal(r.rulesVersion,15);assert.equal(r.arenaCount,arenaCount);
 const bridge=privateKeyToAccount(r.admissionKey).address;
 const deploy=async(name:string,args:readonly unknown[]=[],instance=name)=>{const a=await retryOperatorContention(()=>t.deploy(name,args,instance));r.modules??={};r.modules[instance]=a;await save();return a;};
 const write=async(op:string,contract:string,at:Address,fn:string,args:readonly unknown[]=[])=>retryOperatorContention(async()=>t.write(op,at,(await t.artifact(contract)).abi,fn,args));
 const codec=await deploy('ChaosCodec'),effects=await deploy('ChaosEffects'),modifiers=await deploy('ChaosModifiers');
 const dynamics=await deploy('ChaosDynamics',[effects,modifiers]),contacts=await deploy('ChaosContacts',[dynamics]),rally=await deploy('ChaosRally');
 const physics=await deploy('ChaosPhysics',[effects,rally,dynamics,contacts]),beacon=await deploy('DrandEvmnet'),draws=await deploy('ChaosDrawRules');
 const kernel=await deploy('ChaosEngine',[codec,physics,beacon,draws]),policies=await deploy('HousePolicies');
 const catalog=await deploy('AgentCatalog',[t.account.address,t.account.address,policies]);
 const pool=await deploy('ReusableAgentPool',[catalog,hub,t.account.address,bridge]);
 const verifier=await deploy('PublishedResultVerifier',[pool,hub]);
 const tournaments=await deploy('AgentTournaments',[catalog,pool,t.account.address]);
 const ratings=await deploy('AgentPublishedRatings',[pool,t.account.address,BigInt(r.genesis)]);
 const qualifications=await deploy('AgentQualifications',[catalog,pool]),family=await deploy('ArcadeFamily');
 const challenges=await deploy('AgentChallenges',[family,catalog,pool,t.account.address]);
 await write('configure-catalog','AgentCatalog',catalog,'configure',[tournaments,pool]);
 await write('bind-qualifications','ReusableAgentPool',pool,'bindQualifications',[qualifications]);
 await write('bind-challenges','ReusableAgentPool',pool,'bindChallenges',[challenges]);
 await write('bind-verifier','ReusableAgentPool',pool,'bindVerifier',[verifier]);
 await write('configure-pool','ReusableAgentPool',pool,'configure',[tournaments,ratings]);
 await write('empty-agent-season','AgentPublishedRatings',ratings,'sealMigration',[keccak256(toHex(`${prefix}:new-agent-season:1000`))]);
 r.bots=[];
 for(let i=0;i<8;i++){
  const agent=getAddress(`0x${keccak256(toHex(`${pool.toLowerCase()}:official:${i}`)).slice(-40)}`),bot=pooledHouseBots[i];assert(!humans.includes(agent.toLowerCase()));
  await write(`official-${i}`,'AgentCatalog',catalog,'addHouse',[agent,agentMetadata(bot.name,bot.avatar),i]);r.bots.push({agent,...bot});await save();
 }
 await write('seal-catalog','AgentCatalog',catalog,'seal');r.arenas??=[];
 for(let i=0;i<arenaCount;i++){
  const app=await deploy('ReusableAgentArena',[hub,pool,bridge,policies,kernel,verifier],`ReusableAgentArena-${i}`);assert(!humans.includes(app.toLowerCase()));
  assert.equal(await t.base.readContract({address:app,abi:(await t.artifact('ReusableAgentArena')).abi,functionName:'RULES_VERSION'}),15n);
  await write(`register-arena-${i}`,'ReusableAgentPool',pool,'addArena',[app]);
  if(r.arenas[i])assert.equal(r.arenas[i].app,app);r.arenas[i]={app,runtimeHash:keccak256((await t.base.getCode({address:app}))!)};await save();
 }
 await write('seal-pool','ReusableAgentPool',pool,'seal');const poolAbi=(await t.artifact('ReusableAgentPool')).abi;
 assert.equal(await t.base.readContract({address:pool,abi:poolAbi,functionName:'admissions'}),false);
 assert.equal(await t.base.readContract({address:pool,abi:poolAbi,functionName:'publicAdmissions'}),false);
 r.common={hub,pool,catalog,tournaments,ratings,qualifications,family,challenges,verifier};r.phase='deployed-closed';await save();
 const job=(await t.db.query('SELECT hash,status FROM il_lifecycle_jobs WHERE id=$1',[prefix+':deploy-reusableagentpool'])).rows[0];assert.equal(job.status,'confirmed');
 const receipt=await t.base.getTransactionReceipt({hash:job.hash});assert.equal(receipt.status,'success');
 const evidence={at:new Date().toISOString(),prefix,rulesVersion:15,common:r.common,admissionSigner:bridge,arenas:r.arenas,bots:r.bots,modules:{...t.deployed,...r.modules},
  indexBinding:{chainId:10143,rulesVersion:15,pool,startBlock:String(receipt.blockNumber),arenas:r.arenas.map((a:any)=>a.app)},
  delegationOpened:false,publiclyEnabled:false,qualified:false,
  transactions:(await t.db.query('SELECT id,hash,status FROM il_lifecycle_jobs WHERE id LIKE $1 ORDER BY nonce',[prefix+':%'])).rows};
 await mkdir('artifacts/reusable-candidate',{recursive:true});await writeFile('artifacts/reusable-candidate/agents-deployment.json',JSON.stringify(evidence,null,2));
 console.log(JSON.stringify({phase:r.phase,pool,arenas:r.arenas,publiclyEnabled:false}));
}finally{await t.close();}

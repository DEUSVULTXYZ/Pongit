// Immutable private candidate only. Does not open a delegation, touch an old
// arena, enable public routes or mark any capacity/strategy qualified.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {getAddress,keccak256,toHex,type Address} from 'viem';
import {generatePrivateKey} from 'viem/accounts';
import {chainTools} from './independent-chain-tools';
import {agentMetadata} from '../shared/agents';
import {pooledHouseBots} from '../shared/agent-pool';

assert.equal(process.env.PONG_AGENT_POOL_DEPLOY,'authorized-private-testnet');
const prefix=process.env.PONG_AGENT_POOL_PREFIX!;
assert(/^agent-pool-candidate-\d{8}(-[2-9])?$/.test(prefix),'Use a unique dated candidate identity');
const arenaCount=Number(process.env.PONG_AGENT_POOL_ARENAS??3);
assert(Number.isInteger(arenaCount)&&arenaCount>=3&&arenaCount<=32);
const file=`/secrets/${prefix}.json`,hub='0x3Ef8327F69e09cf721772F345e2A887eA22cD595' as Address;
const humans=(process.env.PONG_HUMAN_APPS??'').toLowerCase().split(',').filter(Boolean);assert(humans.length>0);
let r:any;try{r=JSON.parse(await readFile(file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
const save=async()=>{await writeFile(file+'.next',JSON.stringify(r,null,2),{mode:0o600});await rename(file+'.next',file);};
const t=await chainTools(prefix);
try{
 if(!r){r={prefix,arenaCount,genesis:String((await t.base.getBlock()).timestamp),engineKey:generatePrivateKey(),phase:'deploying',createdAt:new Date().toISOString()};await save();}
 assert.equal(r.arenaCount,arenaCount,'A deployed pool cannot change its arena count');
 const deploy=async(name:string,args:readonly unknown[]=[],instance=name)=>{const a=await t.deploy(name,args,instance);r.modules??={};r.modules[instance]=a;await save();return a;};
 const codec=await deploy('ChaosCodec'),effects=await deploy('ChaosEffects'),modifiers=await deploy('ChaosModifiers');
 const dynamics=await deploy('ChaosDynamics',[effects,modifiers]),contacts=await deploy('ChaosContacts',[dynamics]),rally=await deploy('ChaosRally');
 const physics=await deploy('ChaosPhysics',[effects,rally,dynamics,contacts]),beacon=await deploy('DrandEvmnet'),draws=await deploy('ChaosDrawRules');
 const kernel=await deploy('ChaosEngine',[codec,physics,beacon,draws]),policies=await deploy('HousePolicies'),family=await deploy('ArcadeFamily');
 const catalog=await deploy('AgentCatalog',[t.account.address,t.account.address,policies]);
 const pool=await deploy('AgentArenaPool',[catalog,hub,t.account.address]);
 const tournaments=await deploy('AgentTournaments',[catalog,pool,t.account.address]);
 const ratings=await deploy('AgentPublishedRatings',[pool,t.account.address,BigInt(r.genesis)]);
 const challenges=await deploy('AgentChallenges',[family,catalog,pool,t.account.address]);
 const qualifications=await deploy('AgentQualifications',[catalog,pool]);
 const write=async(op:string,contract:string,at:Address,fn:string,args:readonly unknown[]=[])=>t.write(op,at,(await t.artifact(contract)).abi,fn,args);
 await write('configure-catalog','AgentCatalog',catalog,'configure',[tournaments,pool]);
 await write('bind-qualifications','AgentArenaPool',pool,'bindQualifications',[qualifications]);
 await write('configure-pool','AgentArenaPool',pool,'configure',[tournaments,ratings]);
 await write('bind-challenges','AgentArenaPool',pool,'bindChallenges',[challenges]);
 await write('empty-agent-season','AgentPublishedRatings',ratings,'sealMigration',[keccak256(toHex(`${prefix}:new-agent-season:1000`))]);
 r.bots=[];
 for(let i=0;i<8;i++){
  const agent=getAddress(`0x${keccak256(toHex(`${pool.toLowerCase()}:official:${i}`)).slice(-40)}`),bot=pooledHouseBots[i];
  assert(!humans.includes(agent.toLowerCase()));
  await write(`official-${i}`,'AgentCatalog',catalog,'addHouse',[agent,agentMetadata(bot.name,bot.avatar),i]);r.bots.push({agent,...bot});await save();
 }
 await write('seal-catalog','AgentCatalog',catalog,'seal');
 r.arenas??=[];
 for(let i=0;i<arenaCount;i++){
  const app=await deploy('PooledAgentArena',[hub,pool,policies,kernel],`PooledAgentArena-${i}`);assert(!humans.includes(app.toLowerCase()));
  assert.equal(await t.base.readContract({address:app,abi:(await t.artifact('PooledAgentArena')).abi,functionName:'RULES_VERSION'}),10n);
  await write(`register-arena-${i}`,'AgentArenaPool',pool,'addArena',[app]);
  const old=r.arenas[i];if(old)assert.equal(old.app,app);
  r.arenas[i]={...old,app,runtimeHash:keccak256((await t.base.getCode({address:app}))!)};await save();
 }
 await write('seal-pool','AgentArenaPool',pool,'seal');
 const poolAbi=(await t.artifact('AgentArenaPool')).abi;
 assert.equal(await t.base.readContract({address:pool,abi:poolAbi,functionName:'admissions'}),false);
 assert.equal(await t.base.readContract({address:pool,abi:poolAbi,functionName:'publicAdmissions'}),false);
 r.common={hub,pool,catalog,tournaments,ratings,challenges,qualifications,family};r.phase='deployed-closed';await save();
 const evidence={at:new Date().toISOString(),prefix,rulesVersion:10,common:r.common,arenas:r.arenas,bots:r.bots,modules:{...t.deployed,...r.modules},
  delegationOpened:false,publiclyEnabled:false,qualified:false,transactions:(await t.db.query('SELECT id,hash,status FROM il_lifecycle_jobs WHERE id LIKE $1 ORDER BY nonce',[prefix+':%'])).rows};
 await mkdir('artifacts/agents',{recursive:true});await writeFile(`artifacts/agents/${prefix}.json`,JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{await t.close();}

// Private bounded-series candidate. This deploys no delegation, no financial
// contracts and no public admission or qualification flags.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {getAddress,keccak256,toHex,type Address} from 'viem';
import {generatePrivateKey} from 'viem/accounts';
import {chainTools} from './independent-chain-tools';
import {agentMetadata} from '../shared/agents';
import {pooledHouseBots} from '../shared/agent-pool';

assert.equal(process.env.PONG_AGENT_SERIES_DEPLOY,'authorized-private-testnet');
assert.equal(process.getuid?.(),1000,'Preserve journal ownership');
const prefix=process.env.PONG_AGENT_SERIES_PREFIX!;
assert(/^agent-series-candidate-\d{8}(-[2-9])?$/.test(prefix));
const arenaCount=2,maximumEngineBlocks=120_000n;
const file=`/secrets/${prefix}.json`,hub='0x3Ef8327F69e09cf721772F345e2A887eA22cD595' as Address;
const humans=(process.env.PONG_HUMAN_APPS??'').toLowerCase().split(',').filter(Boolean);assert(humans.length>0);
let r:any;try{r=JSON.parse(await readFile(file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
const save=async()=>{await writeFile(file+'.next',JSON.stringify(r,null,2),{mode:0o600});await rename(file+'.next',file);};
const t=await chainTools(prefix);
try{
 if(!r){r={prefix,arenaCount,maximumEngineBlocks:String(maximumEngineBlocks),genesis:String((await t.base.getBlock()).timestamp),engineKey:generatePrivateKey(),phase:'deploying',createdAt:new Date().toISOString()};await save();}
 assert.equal(r.arenaCount,arenaCount);assert.equal(r.maximumEngineBlocks,String(maximumEngineBlocks));
 const deploy=async(name:string,args:readonly unknown[]=[],instance=name)=>{const a=await t.deploy(name,args,instance);r.modules??={};r.modules[instance]=a;await save();return a;};
 const codec=await deploy('ChaosCodec'),effects=await deploy('ChaosEffects'),modifiers=await deploy('ChaosModifiers');
 const dynamics=await deploy('ChaosDynamics',[effects,modifiers]),contacts=await deploy('ChaosContacts',[dynamics]),rally=await deploy('ChaosRally');
 const physics=await deploy('ChaosPhysics',[effects,rally,dynamics,contacts]),beacon=await deploy('DrandEvmnet'),draws=await deploy('ChaosDrawRules');
 const kernel=await deploy('ChaosEngine',[codec,physics,beacon,draws]),policies=await deploy('HousePolicies');
 const catalog=await deploy('AgentCatalog',[t.account.address,t.account.address,policies]);
 const pool=await deploy('AgentSeriesPool',[catalog,hub,t.account.address]);
 const tournaments=await deploy('AgentTournaments',[catalog,pool,t.account.address]);
 const ratings=await deploy('AgentPublishedRatings',[pool,t.account.address,BigInt(r.genesis)]);
 const qualifications=await deploy('AgentQualifications',[catalog,pool]);
 const family=await deploy('ArcadeFamily');
 const challenges=await deploy('AgentChallenges',[family,catalog,pool,t.account.address]);
 const write=async(op:string,contract:string,at:Address,fn:string,args:readonly unknown[]=[])=>t.write(op,at,(await t.artifact(contract)).abi,fn,args);
 await write('configure-catalog','AgentCatalog',catalog,'configure',[tournaments,pool]);
 await write('bind-qualifications','AgentSeriesPool',pool,'bindQualifications',[qualifications]);
 await write('bind-challenges','AgentSeriesPool',pool,'bindChallenges',[challenges]);
 await write('configure-pool','AgentSeriesPool',pool,'configure',[tournaments,ratings]);
 await write('empty-agent-season','AgentPublishedRatings',ratings,'sealMigration',[keccak256(toHex(`${prefix}:new-agent-season:1000`))]);
 r.bots=[];
 for(let i=0;i<8;i++){
  const agent=getAddress(`0x${keccak256(toHex(`${pool.toLowerCase()}:official:${i}`)).slice(-40)}`),bot=pooledHouseBots[i];
  assert(!humans.includes(agent.toLowerCase()));
  await write(`official-${i}`,'AgentCatalog',catalog,'addHouse',[agent,agentMetadata(bot.name,bot.avatar),i]);r.bots.push({agent,...bot});await save();
 }
 await write('seal-catalog','AgentCatalog',catalog,'seal');r.arenas??=[];
 for(let i=0;i<arenaCount;i++){
  const app=await deploy('SeriesAgentArena',[hub,pool,policies,kernel,maximumEngineBlocks],`SeriesAgentArena-${i}`);assert(!humans.includes(app.toLowerCase()));
  assert.equal(await t.base.readContract({address:app,abi:(await t.artifact('SeriesAgentArena')).abi,functionName:'RULES_VERSION'}),11n);
  await write(`register-arena-${i}`,'AgentSeriesPool',pool,'addArena',[app]);
  const old=r.arenas[i];if(old)assert.equal(old.app,app);
  r.arenas[i]={...old,app,runtimeHash:keccak256((await t.base.getCode({address:app}))!)};await save();
 }
 await write('seal-pool','AgentSeriesPool',pool,'seal');
 const poolAbi=(await t.artifact('AgentSeriesPool')).abi;
 assert.equal(await t.base.readContract({address:pool,abi:poolAbi,functionName:'admissions'}),false);
 assert.equal(await t.base.readContract({address:pool,abi:poolAbi,functionName:'publicAdmissions'}),false);
 r.common={hub,pool,catalog,tournaments,ratings,qualifications,family,challenges};r.phase='deployed-closed';await save();
 const deployment=(await t.db.query('SELECT hash,status FROM il_lifecycle_jobs WHERE id=$1',[prefix+':deploy-agentseriespool'])).rows[0];
 assert.equal(deployment.status,'confirmed');const receipt=await t.base.getTransactionReceipt({hash:deployment.hash});assert.equal(receipt.status,'success');
 const indexBinding={chainId:10143,rulesVersion:11,pool,startBlock:String(receipt.blockNumber),arenas:r.arenas.map((a:any)=>a.app)};
 const evidence={at:new Date().toISOString(),prefix,rulesVersion:11,common:r.common,arenas:r.arenas,bots:r.bots,modules:{...t.deployed,...r.modules},indexBinding,
  delegationOpened:false,publiclyEnabled:false,qualified:false,maximumEngineBlocks:String(maximumEngineBlocks),
  transactions:(await t.db.query('SELECT id,hash,status FROM il_lifecycle_jobs WHERE id LIKE $1 ORDER BY nonce',[prefix+':%'])).rows};
 await mkdir('artifacts/agents',{recursive:true});await writeFile(`artifacts/agents/${prefix}.json`,JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{await t.close();}

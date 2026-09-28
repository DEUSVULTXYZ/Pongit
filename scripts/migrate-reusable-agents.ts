// Closed-source migration only. This never drains production, starts a game,
// transfers old funds, or claims hosted qualification. Every write is journaled.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {keccak256,type Address,type Hex} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {validateAgentPoolManifest,pooledHouseBots} from '../shared/agent-pool';

assert.equal(process.env.PONG_CONTINUING_AGENT_MIGRATION,'authorized-closed-source-testnet');
assert.equal(process.getuid?.(),1000);
const prefix=process.env.PONG_REUSABLE_AGENT_PREFIX!;
assert(/^reusable-agents-\d{8}(?:-[1-9]\d?)?$/.test(prefix));
const humans=(process.env.PONG_HUMAN_APPS??'').split(',').filter(Boolean);assert(humans.length);
const source=validateAgentPoolManifest(JSON.parse(await readFile('/metadata/source-manifest.json','utf8')),humans);
assert.equal(source.version,4,'Reviewed predecessor is the two-lane rules15 pool');
const auditBytes=await readFile('/metadata/ratings-empty-seed-audit.json');
const audit=JSON.parse(auditBytes.toString());
assert(audit.complete===true&&audit.noSeeds===true&&audit.chainId===10143
 &&String(audit.ratings).toLowerCase()===source.ratings.toLowerCase(),'Complete source empty-seed audit required');
const auditHash=keccak256(auditBytes),arenaCount=Number(process.env.PONG_REUSABLE_ARENA_COUNT);
assert(Number.isInteger(arenaCount)&&arenaCount>=5&&arenaCount<=16,'Explicit reviewed arena dimensions required');
const file='/secrets/deployment.json',t=await chainTools(prefix);
let r:any;
try{r=JSON.parse(await readFile(file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
const save=async()=>{await writeFile(file+'.next',JSON.stringify(r,null,2),{mode:0o600});await rename(file+'.next',file);};
try{
 const names=['ChaosCodec','ChaosEffects','ChaosModifiers','ChaosDynamics','ChaosContacts','ChaosRally','ChaosPhysics','DrandEvmnet','ChaosDrawRules','ChaosEngine',
  'HouseInstances','MigratingAgentCatalog','ContinuingFiveLaneAgentPool','PublishedResultVerifier','ContinuingAgentTournaments','ContinuingAgentRatings',
  'ContinuingAgentQualifications','ContinuingAgentChallenges','ReusableAgentArena'];
 await t.preflight(names);
 const read=async(name:string,address:Address,method:string,args:readonly unknown[]=[])=>t.base.readContract({address,abi:(await t.artifact(name)).abi,functionName:method,args}) as Promise<any>;
 const codeHash=async(address:Address)=>{const code=await t.base.getCode({address});assert(code&&code!=='0x');return keccak256(code);};
 const frozen=async()=>{
  const [poolOpen,publicOpen,bookOpen,queueOpen,lane0,lane1,owner]=await Promise.all([
   read('ReusableAgentPool',source.pool,'admissions'),read('ReusableAgentPool',source.pool,'publicAdmissions'),
   read('AgentTournaments',source.tournaments,'admissions'),read('AgentChallenges',source.challenges,'admissions'),
   read('ReusableAgentPool',source.pool,'laneMatch',[0n]),read('ReusableAgentPool',source.pool,'laneMatch',[1n]),read('ReusableAgentPool',source.pool,'owner'),
  ]);
  assert(!poolOpen&&!publicOpen&&!bookOpen&&!queueOpen&&BigInt(lane0)===0n&&BigInt(lane1)===0n,'Source must already be drained and closed');
  assert.equal(owner.toLowerCase(),t.account.address.toLowerCase());
 };
 await frozen();
 const anchor=await t.base.getBlock();assert(anchor.hash);
 assert.equal((await t.base.getBlock({blockNumber:BigInt(audit.block)})).hash,audit.blockHash,'Seed audit block reorganized');
 // The audit must include every transaction before the irreversible seed seal.
 const seal=await read('AgentPublishedRatings',source.ratings,'migrationEvidence');
 assert.equal(seal.toLowerCase(),String(audit.migrationEvidence).toLowerCase(),'Seed audit does not bind the source seal');
 assert.equal(await read('AgentPublishedRatings',source.ratings,'migrationSealed'),true);
 const hashes:Record<string,Hex>={};
 for(const name of ['pool','catalog','tournaments','ratings','qualifications','challenges','family'] as const)hashes[name]=await codeHash(source[name]);
 if(!r){r={prefix,rulesVersion:15,countdownClock:'engine-ticks-v1',houseInstances:'official-v1',maxMatches:5,arenaCount,
  arenaAdmissions:'verified-epoch-v1',genesis:String(await read('AgentPublishedRatings',source.ratings,'genesisTime')),
  source:{manifest:source,hashes,block:String(anchor.number),blockHash:anchor.hash,emptySeedAudit:auditHash,seal},
  admissionKey:generatePrivateKey(),engineKey:generatePrivateKey(),phase:'importing-closed',createdAt:new Date().toISOString()};await save();}
 assert.equal(r.prefix,prefix);assert.equal(r.source.emptySeedAudit,auditHash);assert.equal(r.arenaCount,arenaCount);
 assert.deepEqual(r.source.hashes,hashes,'Source code changed');assert.deepEqual(r.source.manifest,source,'Source manifest changed');
 const bridge=privateKeyToAccount(r.admissionKey).address;
 const deploy=async(name:string,args:readonly unknown[]=[],instance=name)=>{
  const address=await retryOperatorContention(()=>t.deploy(name,args,instance));r.modules??={};r.modules[instance]=address;await save();return address;
 };
 const write=async(id:string,name:string,address:Address,method:string,args:readonly unknown[]=[])=>retryOperatorContention(async()=>t.write(id,address,(await t.artifact(name)).abi,method,args));
 const codec=await deploy('ChaosCodec'),effects=await deploy('ChaosEffects'),modifiers=await deploy('ChaosModifiers');
 const dynamics=await deploy('ChaosDynamics',[effects,modifiers]),contacts=await deploy('ChaosContacts',[dynamics]),rally=await deploy('ChaosRally');
 const physics=await deploy('ChaosPhysics',[effects,rally,dynamics,contacts]),beacon=await deploy('DrandEvmnet'),draws=await deploy('ChaosDrawRules');
 const kernel=await deploy('ChaosEngine',[codec,physics,beacon,draws]);await deploy('HouseInstances');
 const policies=await read('AgentCatalog',source.catalog,'houseController') as Address;
 assert.equal(await codeHash(policies),await read('AgentCatalog',source.catalog,'houseCodeHash'));r.modules.HousePolicies=policies;
 const catalog=await deploy('MigratingAgentCatalog',[source.catalog,hashes.catalog,t.account.address,t.account.address]);
 await write('catalog-start','MigratingAgentCatalog',catalog,'startImport');
 const pool=await deploy('ContinuingFiveLaneAgentPool',[catalog,source.hub,t.account.address,bridge,hashes.pool]);
 const verifier=await deploy('PublishedResultVerifier',[pool,source.hub]);
 const tournaments=await deploy('ContinuingAgentTournaments',[catalog,pool,t.account.address]);
 const ratings=await deploy('ContinuingAgentRatings',[source.ratings,hashes.ratings,seal,auditHash,pool,t.account.address]);
 const qualifications=await deploy('ContinuingAgentQualifications',[source.qualifications,hashes.qualifications,catalog,pool]);
 const challenges=await deploy('ContinuingAgentChallenges',[source.challenges,hashes.challenges,catalog,pool,t.account.address]);
 await write('catalog-configure','AgentCatalog',catalog,'configure',[tournaments,pool]);
 await write('pool-qualifications','ReusableAgentPool',pool,'bindQualifications',[qualifications]);
 await write('pool-challenges','ReusableAgentPool',pool,'bindChallenges',[challenges]);
 await write('pool-verifier','ReusableAgentPool',pool,'bindVerifier',[verifier]);
 await write('pool-configure','ReusableAgentPool',pool,'configure',[tournaments,ratings]);
 const pages=async(label:string,name:string,address:Address,total:bigint)=>{
  for(let n=await read(name,address,'imported') as bigint;n<total;n=await read(name,address,'imported')){
   await write(`${label}-${n}`,name,address,'importPage',[16]);
   assert((await read(name,address,'imported'))>n,'Import made no progress');
  }
 };
 const identities=await read('MigratingAgentCatalog',catalog,'sourceCount') as bigint;
 await pages('catalog-page','MigratingAgentCatalog',catalog,identities);
 await write('catalog-seal','MigratingAgentCatalog',catalog,'seal');
 await write('book-seal','ContinuingAgentTournaments',tournaments,'sealContinuation');
 await write('ratings-start','ContinuingAgentRatings',ratings,'startImport');
 await pages('ratings-page','ContinuingAgentRatings',ratings,await read('ContinuingAgentRatings',ratings,'sourceCount'));
 for(let mode=0;mode<2;mode++){
  const [,total]=await read('AgentPublishedRatings',source.ratings,'playerPage',[mode,0n,0n]);
  for(let n=await read('ContinuingAgentRatings',ratings,'checkedPlayers',[mode]) as bigint;n<total;n=await read('ContinuingAgentRatings',ratings,'checkedPlayers',[mode]))
   await write(`ratings-verify-${mode}-${n}`,'ContinuingAgentRatings',ratings,'verifyPlayers',[mode,16]);
 }
 await write('ratings-seal','ContinuingAgentRatings',ratings,'finishImport');
 for(const [label,name,address] of [['qualifications','ContinuingAgentQualifications',qualifications],['challenges','ContinuingAgentChallenges',challenges]] as const){
  await write(`${label}-start`,name,address,'startImport');
  await pages(`${label}-page`,name,address,label==='qualifications'?identities:await read(name,address,'inheritedCount'));
  await write(`${label}-seal`,name,address,'sealContinuation');
 }
 r.arenas??=[];
 for(let i=0;i<arenaCount;i++){
  const app=await deploy('ReusableAgentArena',[source.hub,pool,bridge,policies,kernel,verifier],`ReusableAgentArena-${i}`);
  assert(!humans.some(h=>h.toLowerCase()===app.toLowerCase()));
  await write(`register-${i}`,'ReusableAgentPool',pool,'addArena',[app]);r.arenas[i]={app,runtimeHash:await codeHash(app)};await save();
 }
 r.serviceOperators??={};
 for(const role of ['admission','maintenance','archive','sponsor']){
  const path=`/secrets/${role}.json`;let key:Hex;
  try{key=JSON.parse(await readFile(path,'utf8')).privateKey;}
  catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;key=generatePrivateKey();await writeFile(path,JSON.stringify({privateKey:key}),{flag:'wx',mode:0o600});}
  const address=privateKeyToAccount(key).address;if(r.serviceOperators[role])assert.equal(r.serviceOperators[role],address);
  r.serviceOperators[role]=address;await save();
 }
 assert.equal(new Set([...Object.values(r.serviceOperators),bridge,t.account.address]).size,6,'Separate role keys required');
 await write('pool-operators','ContinuingFiveLaneAgentPool',pool,'configureOperators',[r.serviceOperators.admission,r.serviceOperators.maintenance]);
 await write('pool-seal','ReusableAgentPool',pool,'seal');await frozen();
 assert.equal(await read('ReusableAgentPool',pool,'admissions'),false);assert.equal(await read('ReusableAgentPool',pool,'publicAdmissions'),false);
 assert.equal((await read('AgentChallenges',challenges,'family')).toLowerCase(),source.family.toLowerCase(),'Existing grants must keep their family');
 r.common={hub:source.hub,pool,catalog,tournaments,ratings,qualifications,family:source.family,challenges,verifier};
 r.continuation={pool:source.pool,catalog:source.catalog,tournaments:source.tournaments,ratings:source.ratings,qualifications:source.qualifications,challenges:source.challenges};
 r.bots=await Promise.all(pooledHouseBots.map(async(bot,i)=>({agent:await read('AgentCatalog',catalog,'house',[i]),...bot})));
 r.phase='imported-closed';await save();
 await mkdir('artifacts/reusable-candidate',{recursive:true});
 await writeFile('artifacts/reusable-candidate/migration.json',JSON.stringify({at:new Date().toISOString(),prefix,common:r.common,continuation:r.continuation,
  source:r.source,arenas:r.arenas,bots:r.bots,modules:r.modules,serviceOperators:r.serviceOperators,qualified:false,publiclyEnabled:false,
  transactions:(await t.db.query('SELECT id,hash,status FROM il_lifecycle_jobs WHERE id LIKE $1 ORDER BY nonce',[prefix+':%'])).rows},null,2));
 console.log(JSON.stringify({phase:r.phase,pool,identities:String(identities),family:source.family,publiclyEnabled:false}));
}finally{await t.close();}

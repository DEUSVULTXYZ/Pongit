// Preparation may deploy immutable modules while the predecessor stays live.
// Import still requires a drained, closed source. Neither stage drains production,
// starts a game, transfers old funds or claims hosted qualification.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {keccak256,type Address,type Hex} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {validateAgentPoolManifest,pooledHouseBots} from '../shared/agent-pool';
import {agentIndexDeployments} from '../shared/agent-index-manifest';
import {NO_LEASE_HUB} from '../shared/hub-lease';
import {agentCatalogMigration,migratedHousePolicyModules} from '../shared/agent-catalog-migration';

assert.equal(process.env.PONG_CONTINUING_AGENT_MIGRATION,'authorized-closed-source-testnet');
assert.equal(process.getuid?.(),1000);
const stage=process.env.PONG_CONTINUING_STAGE??'import';
assert(stage==='prepare'||stage==='import','Explicit preparation or closed-source import only');
const prefix=process.env.PONG_REUSABLE_AGENT_PREFIX!;
assert(/^reusable-agents-\d{8}(?:-[1-9]\d?)?$/.test(prefix));
const humans=(process.env.PONG_HUMAN_APPS??'').split(',').filter(Boolean);assert(humans.length);
const source=validateAgentPoolManifest(JSON.parse(await readFile('/metadata/source-manifest.json','utf8')),humans);
assert([4,5].includes(source.version),'Reviewed predecessor must be a reusable pool');
const v3=process.env.PONG_REUSABLE_HUB_V3==='isolated-testnet';
assert(process.env.PONG_REUSABLE_HUB_V3===undefined||v3,'Unreviewed target hub');
const rulesVersion=Number(process.env.PONG_REUSABLE_RULES??15);
assert([15,16,17].includes(rulesVersion),'Unknown immutable rules');
const friendlyPause=rulesVersion>=16?'heartbeat-v1':undefined;
const modifierName=rulesVersion===17?'ResponsiveChaosModifiers':'ChaosModifiers';
const hub=v3?NO_LEASE_HUB:source.hub,arenaArtifact=rulesVersion===17?'ProvisionedResponsiveAgentArena':rulesVersion===16?'ProvisionedSynchronizedAgentArena':v3?'ProvisionedReusableAgentArena':'ReusableAgentArena';
const rebalanced=process.env.PONG_HOUSE_POLICY==='progressive-v1';
const reship=process.env.PONG_RETIRED_TOURNAMENT==='public-39-reship-20261007';
const recovery=reship||process.env.PONG_RETIRED_TOURNAMENT==='public-23-authorized';
assert(process.env.PONG_RETIRED_TOURNAMENT===undefined||recovery,'Unreviewed tournament retirement');
const retiredId=reship?39:23;
if(recovery)assert.equal(source.pool.toLowerCase(),reship?'0x1f7d8a7b470a724df48d1b72723d7782d8e6014a':'0x205d5739136d6cb73d732e1146e1ce034798a613','Retirement is bound to the public source');
if(reship)assert.equal(prefix,'reusable-agents-20261007-1');
const retirementReason=keccak256(new TextEncoder().encode(reship
 ?'PONGIT public tournament 39 interrupted for user-authorized complete public reship, 2026-10-07; published scores preserved; no champion'
 :'PONGIT public tournament 23 interrupted for user-authorized v1 hosting recovery, 2026-10-03; published scores preserved; no champion'));
assert(process.env.PONG_HOUSE_POLICY===undefined||rebalanced,'Unreviewed house policy');
assert(rulesVersion<16||v3&&rebalanced,'Rules 16/17 require v3 and progressive policies');
const sourceIndexBytes=await readFile('/metadata/source-agent-index.json');
const sourceIndex=agentIndexDeployments(JSON.parse(sourceIndexBytes.toString()),10143,15);
const indexedSources=[source,...(source.history??[])].filter(s=>s.rulesVersion>=15);
assert.equal(sourceIndex.length,indexedSources.length,'Every historical reusable emitter must remain indexed');
for(const prior of indexedSources){
 const entry=sourceIndex.find(s=>s.pool===prior.pool.toLowerCase());assert(entry,'Missing historical index binding');assert.equal(entry.rulesVersion,prior.rulesVersion,'Historical rules differ');
 assert.deepEqual([...entry.arenas].sort(),prior.arenas.map(a=>a.app.toLowerCase()).sort(),'Historical arena index differs');
}
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
 const names=['ChaosCodec','ChaosEffects',modifierName,'ChaosDynamics','ChaosContacts','ChaosRally','ChaosPhysics','DrandEvmnet','ChaosDrawRules','ChaosEngine',
  'HouseInstances','RebalancedAgentCatalog',...(recovery?['RecoveringAgentCatalog']:[]),...(rebalanced?['ProgressiveHousePolicies']:[]),'ContinuingFiveLaneAgentPool','PublishedResultVerifier','ContinuingAgentTournaments','ContinuingAgentRatings',
  'ContinuingAgentQualifications','ContinuingAgentChallenges',arenaArtifact,
  // These inherited/source ABIs are read even when their bytecode is not deployed.
  'ReusableAgentPool','ReusableAgentArena','MigratingAgentCatalog','AgentCatalog','AgentTournaments','AgentPublishedRatings','AgentChallenges'];
 await t.preflight(names);
 const read=async(name:string,address:Address,method:string,args:readonly unknown[]=[])=>t.base.readContract({address,abi:(await t.artifact(name)).abi,functionName:method,args}) as Promise<any>;
 const codeHash=async(address:Address)=>{const code=await t.base.getCode({address});assert(code&&code!=='0x');return keccak256(code);};
 const oldPolicies=await read('AgentCatalog',source.catalog,'houseController') as Address;
 const oldPolicyHash=await codeHash(oldPolicies);
 assert.equal(oldPolicyHash,await read('AgentCatalog',source.catalog,'houseCodeHash'));
 const desiredPolicy=rebalanced?(await t.artifact('ProgressiveHousePolicies')).deployedBytecode.object as Hex:undefined;
 if(desiredPolicy)assert(/^0x[\da-f]+$/i.test(desiredPolicy),'House policy must not require unresolved libraries');
 const catalogMigration=agentCatalogMigration(oldPolicyHash,desiredPolicy?keccak256(desiredPolicy):oldPolicyHash);
 const catalogArtifact=recovery?'RecoveringAgentCatalog':catalogMigration.artifact;
 const frozen=async()=>{
  const [poolOpen,publicOpen,bookOpen,queueOpen,owner]=await Promise.all([
   read('ReusableAgentPool',source.pool,'admissions'),read('ReusableAgentPool',source.pool,'publicAdmissions'),
   read('AgentTournaments',source.tournaments,'admissions'),read('AgentChallenges',source.challenges,'admissions'),
   read('ReusableAgentPool',source.pool,'owner'),
  ]);
  const lanes=await Promise.all(Array.from({length:source.maxMatches},(_,i)=>read('ReusableAgentPool',source.pool,'laneMatch',[BigInt(i)])));
  assert(!poolOpen&&!publicOpen&&!bookOpen&&!queueOpen&&lanes.every(l=>BigInt(l)===0n),'Source must already be drained and closed');
  assert.equal(owner.toLowerCase(),t.account.address.toLowerCase());
 };
 if(stage==='import')await frozen();
 else assert.equal((await read('ReusableAgentPool',source.pool,'owner')).toLowerCase(),t.account.address.toLowerCase());
 const anchor=await t.base.getBlock();assert(anchor.hash);
 assert.equal((await t.base.getBlock({blockNumber:BigInt(audit.block)})).hash,audit.blockHash,'Seed audit block reorganized');
 // The audit must include every transaction before the irreversible seed seal.
 const seal=await read('AgentPublishedRatings',source.ratings,'migrationEvidence');
 assert.equal(seal.toLowerCase(),String(audit.migrationEvidence).toLowerCase(),'Seed audit does not bind the source seal');
 assert.equal(await read('AgentPublishedRatings',source.ratings,'migrationSealed'),true);
 const hashes:Record<string,Hex>={};
 for(const name of ['pool','catalog','tournaments','ratings','qualifications','challenges','family'] as const)hashes[name]=await codeHash(source[name]);
 if(!r){r={prefix,hub,rulesVersion,friendlyPause,countdownClock:'engine-ticks-v1',publicationProbe:'epoch-marker-v1',houseInstances:'official-v1',maxMatches:5,arenaCount,
  arenaAdmissions:'verified-epoch-v1',housePolicy:rebalanced?'progressive-v1':'inherited',genesis:String(await read('AgentPublishedRatings',source.ratings,'genesisTime')),
  source:{manifest:source,indexHash:keccak256(sourceIndexBytes),hashes,block:String(anchor.number),blockHash:anchor.hash,emptySeedAudit:auditHash,seal},
  admissionKey:generatePrivateKey(),engineKey:generatePrivateKey(),phase:stage==='prepare'?'preparing':'importing-closed',createdAt:new Date().toISOString()};await save();}
 assert.equal(r.rulesVersion,rulesVersion);assert.equal(r.friendlyPause,friendlyPause);assert.equal(r.prefix,prefix);assert.equal(r.source.emptySeedAudit,auditHash);assert.equal(r.arenaCount,arenaCount);
 assert.equal((r.common?.hub??r.hub??source.hub).toLowerCase(),hub.toLowerCase(),'Target hub changes require a new migration namespace');
 if(v3){
  assert(r.hostedProvisioning==='owner-consent-v1'||!r.modules,'Existing arena deployments cannot acquire provisioning consent');
  r.provisioningKey??=generatePrivateKey();r.provisioningOwner=privateKeyToAccount(r.provisioningKey).address;
  r.hostedProvisioning='owner-consent-v1';await save();
 }
 assert.equal(r.publicationProbe,'epoch-marker-v1','An older migration must resume with its original source and artifacts');
 assert.equal(r.housePolicy??'inherited',rebalanced?'progressive-v1':'inherited','Cannot change a journaled controller migration');
 assert.equal(r.source.indexHash,keccak256(sourceIndexBytes),'Source index metadata changed');
 assert.deepEqual(r.source.hashes,hashes,'Source code changed');assert.deepEqual(r.source.manifest,source,'Source manifest changed');
 if(r.catalogMigration)assert.deepEqual(r.catalogMigration,catalogMigration,'Journaled controller migration changed');
 if(r.modules?.MigratingAgentCatalog)assert.equal(catalogArtifact,'MigratingAgentCatalog','Existing catalogue cannot change migration type');
 if(r.modules?.RebalancedAgentCatalog&&!recovery)assert.equal(catalogArtifact,'RebalancedAgentCatalog','Existing catalogue cannot change migration type');
 if(recovery){
  assert(!r.common,'Cannot replace an imported public authority');
  const retired={id:retiredId,reason:retirementReason,sourceBook:source.tournaments};
  if(r.retiredTournament)assert.deepEqual(r.retiredTournament,retired);
  r.retiredTournament=retired;
  if(r.modules?.RebalancedAgentCatalog)assert.equal(await read('MigratingAgentCatalog',r.modules.RebalancedAgentCatalog,'importStarted'),false,'Original prepared catalogue must remain unused');
 }
 r.catalogMigration=catalogMigration;await save();
 const bridge=privateKeyToAccount(r.admissionKey).address;
 const deploy=async(name:string,args:readonly unknown[]=[],instance=name)=>{
  const address=await retryOperatorContention(()=>t.deploy(name,args,instance));r.modules??={};r.modules[instance]=address;await save();return address;
 };
 const write=async(id:string,name:string,address:Address,method:string,args:readonly unknown[]=[])=>retryOperatorContention(async()=>t.write(id,address,(await t.artifact(name)).abi,method,args));
 const codec=await deploy('ChaosCodec'),effects=await deploy('ChaosEffects'),modifiers=await deploy(modifierName);
 const dynamics=await deploy('ChaosDynamics',[effects,modifiers]),contacts=await deploy('ChaosContacts',[dynamics]),rally=await deploy('ChaosRally');
 const physics=await deploy('ChaosPhysics',[effects,rally,dynamics,contacts]),beacon=await deploy('DrandEvmnet'),draws=await deploy('ChaosDrawRules');
 const kernel=await deploy('ChaosEngine',[codec,physics,beacon,draws]);await deploy('HouseInstances');
 const policies=catalogMigration.changed||reship?await deploy('ProgressiveHousePolicies'):oldPolicies;
 assert.equal(await codeHash(policies),catalogMigration.targetPolicyHash,'Target controller differs from the journaled migration');
 Object.assign(r.modules,migratedHousePolicyModules(policies,rebalanced));
 const catalog=await deploy(catalogArtifact,[source.catalog,hashes.catalog,t.account.address,t.account.address,...(catalogMigration.changed||recovery?[policies]:[])]);
 if(stage==='prepare'){
  assert(!await read('MigratingAgentCatalog',catalog,'importStarted'),'Preparation cannot resume an active import');
  assert(!await read('AgentCatalog',catalog,'setupSealed'));
  r.phase='prepared-unimported';r.preparedAt=new Date().toISOString();await save();
  await mkdir('artifacts/reusable-candidate',{recursive:true});
  await writeFile('artifacts/reusable-candidate/migration-prepared.json',JSON.stringify({at:r.preparedAt,prefix,
   phase:r.phase,sourcePool:source.pool,sourceCodeHashes:hashes,modules:r.modules,importStarted:false,
   qualified:false,publiclyEnabled:false},null,2));
  console.log(JSON.stringify({phase:r.phase,catalog,importStarted:false,publiclyEnabled:false}));
 }else{
 // Recheck after provisioning. The final snapshot is captured by startImport,
 // never from the potentially older preparation block or a local identity list.
 await frozen();
 const importAnchor=await t.base.getBlock();
 r.importAnchor??={block:String(importAnchor.number),hash:importAnchor.hash};await save();
 if(recovery)await write('catalog-retirement-'+retiredId,'RecoveringAgentCatalog',catalog,'authorizeRetirement',[BigInt(retiredId),retirementReason]);
 await write('catalog-start','MigratingAgentCatalog',catalog,'startImport');
 const pool=await deploy('ContinuingFiveLaneAgentPool',[catalog,hub,t.account.address,bridge,hashes.pool]);
 const verifier=await deploy('PublishedResultVerifier',[pool,hub]);
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
  const app=await deploy(arenaArtifact,[hub,pool,bridge,policies,kernel,verifier,...(v3?[r.provisioningOwner]:[])],`ReusableAgentArena-${i}`);
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
 r.common={hub,pool,catalog,tournaments,ratings,qualifications,family:source.family,challenges,verifier};
 r.continuation={pool:source.pool,catalog:source.catalog,tournaments:source.tournaments,ratings:source.ratings,qualifications:source.qualifications,challenges:source.challenges};
 r.bots=await Promise.all(pooledHouseBots.map(async(bot,i)=>({agent:await read('AgentCatalog',catalog,'house',[i]),...bot})));
 const deploymentJob=(await t.db.query('SELECT hash,status FROM il_lifecycle_jobs WHERE id=$1',
  [prefix+':deploy-continuingfivelaneagentpool'])).rows[0];
 assert.equal(deploymentJob?.status,'confirmed');
 const poolReceipt=await t.base.getTransactionReceipt({hash:deploymentJob.hash});
 assert.equal(poolReceipt.status,'success');assert.equal(poolReceipt.contractAddress?.toLowerCase(),pool.toLowerCase());
 const indexManifest={version:2,chainId:10143,deployments:[...sourceIndex,
  {chainId:10143,rulesVersion,pool,startBlock:String(poolReceipt.blockNumber),arenas:r.arenas.map((a:any)=>a.app)}]};
 agentIndexDeployments(indexManifest,10143,15);
 r.phase='deployed-closed';r.migrationPhase='imported-closed';await save();
 await mkdir('artifacts/reusable-candidate',{recursive:true});
 await writeFile('artifacts/reusable-candidate/agent-reusable-index.json',JSON.stringify(indexManifest,null,2));
 await writeFile('artifacts/reusable-candidate/migration.json',JSON.stringify({at:new Date().toISOString(),prefix,common:r.common,continuation:r.continuation,
  source:r.source,arenas:r.arenas,bots:r.bots,modules:r.modules,serviceOperators:r.serviceOperators,qualified:false,publiclyEnabled:false,
  transactions:(await t.db.query('SELECT id,hash,status FROM il_lifecycle_jobs WHERE id LIKE $1 ORDER BY nonce',[prefix+':%'])).rows},null,2));
 console.log(JSON.stringify({phase:r.phase,pool,identities:String(identities),family:source.family,publiclyEnabled:false}));
 }
}catch(error){
 // Deployment simulations contain creation calldata. Keep only the concise
 // reason in operator logs; signed commands stay in the original nonce journal.
 console.error(JSON.stringify({stage,error:String((error as any)?.shortMessage??(error as Error).message)
  .split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,240)}));process.exitCode=1;
}finally{await t.close();}

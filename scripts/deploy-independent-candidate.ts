// Deploy a testnet qualification candidate. Does not change production configuration.
import assert from 'node:assert/strict';
import {mkdir,writeFile,rename,readFile} from 'node:fs/promises';
import {isAddress,keccak256,toHex,type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
import {independentQualificationHub} from '../shared/independent-qualification-hub';
import {NO_LEASE_HUB} from '../shared/hub-lease';
import {retryOperatorContention} from '../shared/operator-contention';
const prefix=process.env.PONG_INDEPENDENT_PREFIX!;
assert(prefix?.startsWith('independent-qualification-'));
const out=process.env.PONG_INDEPENDENT_MANIFEST!;assert(out?.startsWith('/secrets/'));
const rulesVersion=Number(process.env.PONG_INDEPENDENT_RULES??4);assert([4,12,13,14].includes(rulesVersion),'Explicit supported rules');
const events=rulesVersion>=12;
const reusable=rulesVersion===14;
const admissionSigner=process.env.PONG_ADMISSION_BRIDGE as Address|undefined;
if(reusable)assert(admissionSigner&&isAddress(admissionSigner)&&!/^0x0{40}$/i.test(admissionSigner),'Explicit limited testnet admission bridge address');
const arenaCount=Number(process.env.PONG_INDEPENDENT_ARENAS??3);assert(Number.isInteger(arenaCount)&&arenaCount>=3&&arenaCount<=16);
const operator=await chainTools(prefix);
// Maintenance and isolated qualification share one nonce journal. Yield on its
// lock without creating a replacement operation or losing a deployment step.
const t={...operator,
 deploy:(...args:Parameters<typeof operator.deploy>)=>retryOperatorContention(()=>operator.deploy(...args)),
 write:(...args:Parameters<typeof operator.write>)=>retryOperatorContention(()=>operator.write(...args)),
};
const hub=independentQualificationHub(rulesVersion,process.env.PONG_INDEPENDENT_HUB_V3,!!process.env.PONG_INDEPENDENT_SNAPSHOT);
const provisioned=hub.toLowerCase()===NO_LEASE_HUB.toLowerCase();
const provisioningOwner=process.env.PONG_HOSTED_PROVISIONER as Address|undefined;
if(provisioned)assert(provisioningOwner&&isAddress(provisioningOwner)&&BigInt(provisioningOwner)>0n,'Explicit nonfinancial hosting owner required');
const pressureSigner:Address='0x15E6B4C9fecAC754cE2D9052b6060DD5920e7659';
const snapshotText=process.env.PONG_INDEPENDENT_SNAPSHOT?await readFile(process.env.PONG_INDEPENDENT_SNAPSHOT,'utf8'):null;
const snapshot=snapshotText?JSON.parse(snapshotText):null;
const migrationHash=snapshotText?keccak256(new TextEncoder().encode(snapshotText)):keccak256(toHex(prefix));
if(snapshot){
 assert.equal(snapshot.ready,true,'A live-source draft cannot authorize migration');assert.equal(snapshot.chainId,10143);
 assert.equal((await t.base.getBlock({blockNumber:BigInt(snapshot.sourceBlock)})).hash,snapshot.sourceHash,'Source reorganized');
 assert.equal(keccak256((await t.base.getBytecode({address:snapshot.source}))!),snapshot.sourceCodeHash,'Source code changed');
 const d=await readHubDelegation(t.base,snapshot.hub,snapshot.source);assert.equal(d.status,0,'Source must remain released');assert.equal(String(d.epoch),snapshot.epoch,'Source epoch changed');
}
let manifest:any;
try{manifest=JSON.parse(await readFile(out,'utf8'));assert.equal(manifest.prefix,prefix);assert.equal(manifest.rulesVersion??4,rulesVersion,'Never replace a journalled deployment with different rules');assert.equal(manifest.arenaCount??3,arenaCount,'Arena count changed during deployment');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
manifest??={prefix,purpose:snapshot?'independent migration candidate':'independent contract qualification',production:false,chainId:10143,rulesVersion,...(reusable?{countdownClock:'engine-ticks-v1'}:{}),arenaCount,hub,pressureSigner,...(reusable?{admissionSigner}:{}),...(provisioned?{hostedProvisioning:'owner-consent-v1',provisioningOwner}:{}),createdAt:new Date().toISOString(),genesis:Number(snapshot?.genesis??Math.floor(Date.now()/1000)),startBlock:String(await t.base.getBlockNumber()),migrationHash,arenas:[]};
if(provisioned)assert(manifest.hostedProvisioning==='owner-consent-v1'&&manifest.provisioningOwner?.toLowerCase()===provisioningOwner!.toLowerCase(),'Never replace a journalled provisioning authority');
if(reusable)assert.equal(manifest.admissionSigner.toLowerCase(),admissionSigner!.toLowerCase(),'Admission signer changed during deployment');
assert.equal(manifest.hub.toLowerCase(),hub.toLowerCase(),'Never change the hub of a journalled deployment');
if(reusable)assert.equal(manifest.countdownClock,'engine-ticks-v1','Preserve old candidate journals; new clock requires a new deployment prefix');
assert(!manifest.migrationHash||manifest.migrationHash===migrationHash,'Migration source changed during deployment');
const save=async()=>{await writeFile(out+'.next',JSON.stringify(manifest,null,2),{mode:0o600});await rename(out+'.next',out);};
try{
 const lobbyName=reusable?'ReusableEventsLobby':rulesVersion===13?'ReadyIndependentEventsLobby':events?'IndependentEventsLobby':'IndependentLobby';
 const arenaName=provisioned?'ProvisionedReusableEventsArena':reusable?'ReusableEventsArena':rulesVersion===13?'ReadyIndependentEventsArena':events?'IndependentEventsArena':'IndependentArena';
 await t.preflight(['ArcadeFamily',lobbyName,'PublishedRatings',arenaName,
  ...(reusable?['PublishedResultVerifier']:[]),
  ...(events?['ChaosEffects','ChaosModifiers','ChaosRally','ChaosDynamics','ChaosContacts','ChaosPhysics','ChaosCodec','DrandEvmnet','ChaosDrawRules','ChaosEngine']:[]),
  reusable?'ReusableEventsSettlement':events?'IndependentEventsSettlement':'IndependentSettlement',
  'RoomsVault','LMSRV2',events?'RealtimeMarket':'MarketV4','ProfileRegistry','PrivateDataStore']);
 await save();
 manifest.family=await t.deploy('ArcadeFamily');await save();
 manifest.lobby=await t.deploy(lobbyName,[manifest.family,hub,t.account.address,...(reusable?[admissionSigner]:[]),pressureSigner]);await save();
 manifest.ratings=await t.deploy('PublishedRatings',[manifest.lobby,t.account.address,BigInt(manifest.genesis)]);await save();
 const l=await t.artifact(lobbyName),r=await t.artifact('PublishedRatings');
 if(reusable){
  manifest.resultVerifier=await t.deploy('PublishedResultVerifier',[manifest.lobby,hub]);await save();
  await t.write('bind-result-verifier',manifest.lobby,l.abi,'bindVerifier',[manifest.resultVerifier]);
 }
 await t.write('bind-ratings',manifest.lobby,l.abi,'bindRatings',[manifest.ratings]);
 if(snapshot){
  for(let mode=0;mode<2;mode++){const rows=snapshot.ratings.filter((v:any)=>v.mode===mode);for(let i=0;i<rows.length;i+=100){const chunk=rows.slice(i,i+100);await t.write(`seed-mode-${mode}-${i}`,manifest.ratings,r.abi,'seed',[chunk.map((v:any)=>v.player),mode,chunk.map((v:any)=>({elo:Number(v.elo),played:Number(v.played),wins:Number(v.wins),season:Number(v.season)}))]);}}
  for(let i=0;i<snapshot.pairSeeds.length;i+=100){const chunk=snapshot.pairSeeds.slice(i,i+100);await t.write(`seed-repeat-${i}`,manifest.ratings,r.abi,'seedPairCounts',[chunk.map((v:any)=>v.pair),chunk.map((v:any)=>v.count)]);}
 }
 await t.write('seal-verified-migration',manifest.ratings,r.abi,'sealMigration',[migrationHash]);
 if(events){
  const moduleArgs=[['ChaosEffects',[]],['ChaosModifiers',[]],['ChaosRally',[]],['ChaosDynamics',['ChaosEffects','ChaosModifiers']],
   ['ChaosContacts',['ChaosDynamics']],['ChaosPhysics',['ChaosEffects','ChaosRally','ChaosDynamics','ChaosContacts']],
   ['ChaosCodec',[]],['DrandEvmnet',[]],['ChaosDrawRules',[]],['ChaosEngine',['ChaosCodec','ChaosPhysics','DrandEvmnet','ChaosDrawRules']]] as const;
  manifest.modules??={};
  for(const [name,deps] of moduleArgs){const deployed=await t.deploy(name,deps.map(d=>manifest.modules[d]));
   assert(!manifest.modules[name]||manifest.modules[name]===deployed,'Pinned module changed');manifest.modules[name]=deployed;await save();}
 }
 for(let i=0;i<arenaCount;i++){
  const app=await t.deploy(arenaName,[hub,manifest.lobby,...(reusable?[admissionSigner]:[]),pressureSigner,...(events?[manifest.modules.ChaosEngine]:[]),...(reusable?[manifest.resultVerifier]:[]),...(provisioned?[provisioningOwner]:[])],`arena-${i}`);
  manifest.arenas[i]??={app,index:i};assert.equal(manifest.arenas[i].app,app);await save();
  if(provisioned){const runtimeHash=keccak256((await t.base.getCode({address:app}))!);assert(!manifest.arenas[i].runtimeHash||manifest.arenas[i].runtimeHash===runtimeHash,'Pinned human code changed');manifest.arenas[i].runtimeHash=runtimeHash;await save();}
  await t.write(`register-arena-${i}`,manifest.lobby,l.abi,'addArena',[app]);
 }
 // Realtime settlement requires a sealed immutable list for its exact rules.
 if(events)await t.write('seal-lobby',manifest.lobby,l.abi,'seal');
 manifest.settlement=await t.deploy(reusable?'ReusableEventsSettlement':events?'IndependentEventsSettlement':'IndependentSettlement',[manifest.lobby]);await save();
 manifest.vault=await t.deploy('RoomsVault',[t.account.address]);await save();
 manifest.lmsr=await t.deploy('LMSRV2');await save();
 manifest.market=await t.deploy(events?'RealtimeMarket':'MarketV4',[t.account.address,t.account.address,manifest.settlement,manifest.lmsr,manifest.vault]);await save();
 const vault=await t.artifact('RoomsVault');
 await t.write('register-market',manifest.vault,vault.abi,'registerModule',[manifest.market]);
 await t.write('seal-vault',manifest.vault,vault.abi,'seal');
 manifest.profiles=await t.deploy('ProfileRegistry',[t.account.address]);await save();
 const profilesAbi=(await t.artifact('ProfileRegistry')).abi;
 if(snapshot)for(let i=0;i<snapshot.profiles.length;i+=32){const chunk=snapshot.profiles.slice(i,i+32);await t.write(`reserve-profiles-${i}`,manifest.profiles,profilesAbi,'reserve',[chunk.map((v:any)=>v.handle),chunk.map((v:any)=>v.player)]);}
 await t.write('seal-profile-migration',manifest.profiles,profilesAbi,'seal');
 manifest.privateData=await t.deploy('PrivateDataStore');await save();
 await t.write('seal-lobby',manifest.lobby,l.abi,'seal');
 manifest.status='sealed';manifest.libraries=t.deployed;await save();
 await mkdir('artifacts/independent-candidate',{recursive:true});
 await writeFile('artifacts/independent-candidate/deployment.json',JSON.stringify(manifest,null,2));
}finally{await t.close();}

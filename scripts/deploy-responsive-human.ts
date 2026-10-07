// Explicit new rules with ordered history. No close, undelegate or source mutation.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {isAddress,keccak256,type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {publicIndependentManifest} from '../shared/independent';
import {independentReader} from '../shared/independent-read';
import {previousIndependentManifests} from '../shared/independent-history-scope';
import {humanSeedState,type HumanSeedCall} from '../shared/human-seed-audit';
import {NO_LEASE_HUB} from '../shared/hub-lease';

const prefix='public-responsive-human-20261007';
assert.equal(process.env.PONG_PUBLIC_HUMAN_MIGRATION,prefix);
const bytes=await readFile(process.env.PONG_INDEPENDENT_SNAPSHOT!,'utf8'),snapshot=JSON.parse(bytes),migrationHash=keccak256(new TextEncoder().encode(bytes));
assert.equal(snapshot.schema,'responsive-human-ordered-v1');assert.equal(snapshot.ready,true);assert.equal(snapshot.chainId,10143);
const source=publicIndependentManifest(snapshot.source),previous=previousIndependentManifests(snapshot.previous,source);
const social=JSON.parse(await readFile(process.env.PONG_HUMAN_SOCIAL_PROOF!,'utf8'));
assert(social.schema==='responsive-human-social-v1'&&social.complete&&social.snapshotHash===migrationHash
 &&social.sourceHash===snapshot.sourceHash&&social.sourceLobby.toLowerCase()===source.lobby.toLowerCase(),
 'Complete canonical social nonce audit required for this exact snapshot');
assert(social.blockCommands===0&&social.activeQueues===0&&social.pendingInvitations===0,
 'Outstanding social state needs compatible preservation before deployment');
assert.equal(source.lobby.toLowerCase(),'0x71a49c00ba733724cb33d7590134d4ae96426156');assert.equal(source.hub.toLowerCase(),NO_LEASE_HUB.toLowerCase());
assert(previous.length<8&&snapshot.pending.length===0&&snapshot.slots.every((x:string)=>x==='0'));
assert(snapshot.social&&snapshot.social.blockCommands===0&&snapshot.social.activeQueues===0&&snapshot.social.pendingInvitations===0,
 'Outstanding social state needs compatible preservation before deployment');
const seedCalls=snapshot.seedCalls as HumanSeedCall[];assert.equal(humanSeedState(seedCalls).digest,snapshot.seedDigest);
assert.equal(snapshot.results.length,Number(snapshot.count));assert(BigInt(snapshot.nextGeneration)>1n);
for(const e of snapshot.results)assert(BigInt(e.first.id)>>128n<BigInt(snapshot.nextGeneration));
const proof=JSON.parse(await readFile(process.env.PONG_HUMAN_SOURCE_DRAIN_PROOF!,'utf8'));
assert(proof.passed&&proof.sourceLobby.toLowerCase()===source.lobby.toLowerCase()&&proof.admissionsStopped&&proof.slotsEmpty&&proof.pendingCommands===0);
assert(proof.offVpsVerified&&/^\w{64}$/.test(proof.backupSha256),'Fresh verified backup required');
assert(Date.now()-Date.parse(proof.at)<30*60_000,'Refresh the drained-source and backup proof');
const provisioner=process.env.PONG_HOSTED_PROVISIONER as Address;assert(isAddress(provisioner)&&BigInt(provisioner)>0n);
const out=process.env.PONG_INDEPENDENT_MANIFEST!;assert(out.startsWith('/secrets/'));
const operator=await chainTools(prefix),t={...operator,deploy:(...a:Parameters<typeof operator.deploy>)=>retryOperatorContention(()=>operator.deploy(...a)),write:(...a:Parameters<typeof operator.write>)=>retryOperatorContention(()=>operator.write(...a))};
const stringify=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x,2);
async function unchanged(){
 assert.equal((await t.base.getBlock({blockNumber:BigInt(snapshot.sourceBlock)})).hash,snapshot.sourceHash);
 for(const [a,h] of Object.entries(snapshot.codeHashes))assert.equal(keccak256((await t.base.getCode({address:a as Address}))!),h);
 const r=independentReader(t.base,source);
 assert.equal(String(await r.ratings('count')),snapshot.count);assert.equal(String(await r.ratings('revision')),snapshot.revision);assert.equal(await r.ratings('buildGeneration'),0n);
 for(const i of [0n,1n])assert.equal(await r.lobby('slot',[i]),0n);
 for(const a of source.arenas)assert.equal(await r.lobby('reservedMatch',[a.app]),0n);
}
let m:any;try{m=JSON.parse(await readFile(out,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
m??={prefix,purpose:'Public responsive human continuation',production:false,chainId:10143,rulesVersion:18,countdownClock:'engine-ticks-v1',arenaCount:3,
 hub:NO_LEASE_HUB,pressureSigner:source.pressureSigner,admissionSigner:source.admissionSigner,hostedProvisioning:'owner-consent-v1',provisioningOwner:provisioner,
 family:source.family,profiles:source.profiles,privateData:source.privateData,genesis:source.genesis,createdAt:new Date().toISOString(),startBlock:String(await t.base.getBlockNumber()),
 migrationHash,ratingsContinuity:'ordered-human-v1',ratingPredecessor:source.ratings,previous:[source,...previous],arenas:[],modules:{}};
assert.equal(m.prefix,prefix);assert.equal(m.migrationHash,migrationHash);assert.equal(m.provisioningOwner,provisioner);assert.deepEqual(m.previous,[source,...previous]);
const save=async()=>{await writeFile(out+'.next',stringify(m)+'\n',{mode:0o600});await rename(out+'.next',out);};
try{
 await unchanged();
 await t.preflight(['ResponsiveEventsLobby','ContinuingHumanRatings','PublishedResultVerifier','ProvisionedResponsiveEventsArena','ReusableEventsSettlement','RoomsVault','LMSRV2','RealtimeMarket',
  'ChaosEffects','ResponsiveChaosModifiers','ChaosRally','ChaosDynamics','ChaosContacts','ChaosPhysics','ChaosCodec','DrandEvmnet','ChaosDrawRules','ChaosEngine']);
 await save();
 m.lobby=await t.deploy('ResponsiveEventsLobby',[m.family,m.hub,t.account.address,m.admissionSigner,m.pressureSigner,BigInt(snapshot.nextGeneration)]);await save();
 m.ratings=await t.deploy('ContinuingHumanRatings',[source.ratings,snapshot.codeHashes[source.ratings],snapshot.sourceSeal,migrationHash,snapshot.seedDigest,m.lobby,t.account.address]);await save();
 m.resultVerifier=await t.deploy('PublishedResultVerifier',[m.lobby,m.hub]);await save();
 const l=(await t.artifact('ResponsiveEventsLobby')).abi,r=(await t.artifact('ContinuingHumanRatings')).abi;
 await t.write('bind-verifier',m.lobby,l,'bindVerifier',[m.resultVerifier]);await t.write('bind-ratings',m.lobby,l,'bindRatings',[m.ratings]);
 for(let i=0;i<seedCalls.length;i++){const c=seedCalls[i];
  await t.write(`original-seed-${i}`,m.ratings,r,c.kind==='players'?'seed':'seedPairCounts',c.kind==='players'?[c.accounts,c.mode,c.values]:[c.pairs,c.values]);
 }
 await unchanged();await t.write('start-import',m.ratings,r,'startImport');
 for(let i=0;i<Number(snapshot.count);i+=32)await t.write(`history-${i}`,m.ratings,r,'importPage',[32]);
 for(let mode=0;mode<2;mode++){
  const rows=snapshot.ratings.filter((v:any)=>v.mode===mode);
  for(let i=0;i<rows.length;i+=32)await t.write(`verify-players-${mode}-${i}`,m.ratings,r,'verifyPlayers',[mode,32]);
 }
 await unchanged();await t.write('finish-import',m.ratings,r,'finishImport');
 const modules=[['ChaosEffects',[]],['ResponsiveChaosModifiers',[]],['ChaosRally',[]],['ChaosDynamics',['ChaosEffects','ResponsiveChaosModifiers']],['ChaosContacts',['ChaosDynamics']],['ChaosPhysics',['ChaosEffects','ChaosRally','ChaosDynamics','ChaosContacts']],['ChaosCodec',[]],['DrandEvmnet',[]],['ChaosDrawRules',[]],['ChaosEngine',['ChaosCodec','ChaosPhysics','DrandEvmnet','ChaosDrawRules']]] as const;
 for(const [name,deps]of modules){m.modules[name]=await t.deploy(name,deps.map(d=>m.modules[d]));await save();}
 for(let i=0;i<3;i++){
  const app=await t.deploy('ProvisionedResponsiveEventsArena',[m.hub,m.lobby,m.admissionSigner,m.pressureSigner,m.modules.ChaosEngine,m.resultVerifier,provisioner],`arena-${i}`);
  const runtimeHash=keccak256((await t.base.getCode({address:app}))!);
  if(m.arenas[i])assert.equal(m.arenas[i].app,app);m.arenas[i]={app,index:i,runtimeHash};await save();
  await t.write(`register-arena-${i}`,m.lobby,l,'addArena',[app]);
 }
 await t.write('seal-lobby',m.lobby,l,'seal');
 m.settlement=await t.deploy('ReusableEventsSettlement',[m.lobby]);await save();
 m.vault=await t.deploy('RoomsVault',[t.account.address]);await save();m.lmsr=await t.deploy('LMSRV2');await save();
 m.market=await t.deploy('RealtimeMarket',[t.account.address,t.account.address,m.settlement,m.lmsr,m.vault]);await save();
 const v=(await t.artifact('RoomsVault')).abi;await t.write('register-market',m.vault,v,'registerModule',[m.market]);await t.write('seal-vault',m.vault,v,'seal');
 await unchanged();
 const current=independentReader(t.base,publicIndependentManifest(m)),old=independentReader(t.base,source);
 assert.equal(await current.ratings('count'),BigInt(snapshot.count));
 for(const e of snapshot.results)assert.deepEqual(await current.ratings('entry',[BigInt(e.first.id)]),await old.ratings('entry',[BigInt(e.first.id)]));
 for(const p of snapshot.ratings)assert.deepEqual(await current.ratings('ratingOf',[p.player,p.mode]),await old.ratings('ratingOf',[p.player,p.mode]));
 m.status='sealed';m.libraries=t.deployed;await save();
 console.log(stringify({status:m.status,lobby:m.lobby,ratings:m.ratings,arenas:m.arenas,sourceResults:snapshot.count,sourceClosed:false,openings:0}));
}finally{await t.close();}

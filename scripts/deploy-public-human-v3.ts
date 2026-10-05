// Explicit continuation of the public human season, not a private qualification import.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {isAddress,keccak256,type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {independentReader} from '../shared/independent-read';
import {publicIndependentManifest} from '../shared/independent';
import {NO_LEASE_HUB} from '../shared/hub-lease';
import {retryOperatorContention} from '../shared/operator-contention';

assert.equal(process.env.PONG_PUBLIC_HUMAN_MIGRATION,'public-human-v3-20261005');
const prefix='public-human-v3-20261005',out=process.env.PONG_INDEPENDENT_MANIFEST!;
assert(out.startsWith('/secrets/'));
const text=await readFile(process.env.PONG_INDEPENDENT_SNAPSHOT!,'utf8'),snapshot=JSON.parse(text),migrationHash=keccak256(new TextEncoder().encode(text));
assert.equal(snapshot.schema,'public-human-continuation-v1');assert.equal(snapshot.ready,true);
const source=publicIndependentManifest(snapshot.source);
assert.equal(source.lobby.toLowerCase(),'0x5dbea9692d443e04e1bd0b74fb307b079a5cb212');
assert.equal(snapshot.chainId,10143);assert.equal(snapshot.buildGeneration,'0');
assert(snapshot.results.length===Number(snapshot.count)&&snapshot.results.every((e:any)=>e.finality));
assert(snapshot.slots.every((x:string)=>x==='0')&&snapshot.pending.length===0);
const provisioner=process.env.PONG_HOSTED_PROVISIONER as Address;
assert(isAddress(provisioner)&&BigInt(provisioner)>0n);
const operator=await chainTools(prefix);
const t={...operator,deploy:(...a:Parameters<typeof operator.deploy>)=>retryOperatorContention(()=>operator.deploy(...a)),write:(...a:Parameters<typeof operator.write>)=>retryOperatorContention(()=>operator.write(...a))};
async function sourceUnchanged(){
 assert.equal((await t.base.getBlock({blockNumber:BigInt(snapshot.sourceBlock)})).hash,snapshot.sourceHash);
 for(const [address,hash]of Object.entries(snapshot.codeHashes))assert.equal(keccak256((await t.base.getCode({address:address as Address}))!),hash);
 const r=independentReader(t.base,source);
 assert.equal(String(await r.ratings('count')),snapshot.count,'Source acquired another result');
 assert.equal(String(await r.ratings('revision')),snapshot.revision,'Source was corrected');
 assert.equal(await r.ratings('buildGeneration'),0n);
 assert.equal(await r.lobby('slot',[0n]),0n);assert.equal(await r.lobby('slot',[1n]),0n);
 for(const a of source.arenas)assert.equal(await r.lobby('reservedMatch',[a.app]),0n);
 for(const e of snapshot.results)assert.equal((await r.ratings('entry',[BigInt(e.latest.id)])).finality,true);
 for(const v of snapshot.ratings)assert.deepEqual(JSON.parse(JSON.stringify(await r.ratings('ratingOf',[v.player,v.mode]))),{elo:v.elo,played:v.played,wins:v.wins,season:v.season},'Rating changed; take a new reviewed snapshot');
}
let m:any;
try{m=JSON.parse(await readFile(out,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
m??={prefix,purpose:'Public human hub v3 continuation',production:false,chainId:10143,rulesVersion:14,countdownClock:'engine-ticks-v1',arenaCount:3,
 hub:NO_LEASE_HUB,pressureSigner:source.pressureSigner,admissionSigner:source.admissionSigner,hostedProvisioning:'owner-consent-v1',provisioningOwner:provisioner,
 family:source.family,profiles:source.profiles,privateData:source.privateData,genesis:source.genesis,createdAt:new Date().toISOString(),startBlock:String(await t.base.getBlockNumber()),
 migrationHash,previous:[source],arenas:[],modules:{}};
assert.equal(m.prefix,prefix);assert.equal(m.migrationHash,migrationHash);assert.equal(m.hub,NO_LEASE_HUB);assert.equal(m.provisioningOwner,provisioner);
for(const key of ['family','profiles','privateData','pressureSigner','admissionSigner'] as const)assert.equal(m[key].toLowerCase(),source[key]!.toLowerCase());
const save=async()=>{await writeFile(out+'.next',JSON.stringify(m,null,2)+'\n',{mode:0o600});await rename(out+'.next',out);};
try{
 await sourceUnchanged();
 await t.preflight(['ReusableEventsLobby','PublishedRatings','PublishedResultVerifier','ProvisionedReusableEventsArena','ReusableEventsSettlement','RoomsVault','LMSRV2','RealtimeMarket',
  'ChaosEffects','ChaosModifiers','ChaosRally','ChaosDynamics','ChaosContacts','ChaosPhysics','ChaosCodec','DrandEvmnet','ChaosDrawRules','ChaosEngine']);
 await save();
 m.lobby=await t.deploy('ReusableEventsLobby',[m.family,m.hub,t.account.address,m.admissionSigner,m.pressureSigner]);await save();
 m.ratings=await t.deploy('PublishedRatings',[m.lobby,t.account.address,BigInt(m.genesis)]);await save();
 m.resultVerifier=await t.deploy('PublishedResultVerifier',[m.lobby,m.hub]);await save();
 const l=(await t.artifact('ReusableEventsLobby')).abi,r=(await t.artifact('PublishedRatings')).abi;
 await t.write('bind-verifier',m.lobby,l,'bindVerifier',[m.resultVerifier]);
 await t.write('bind-ratings',m.lobby,l,'bindRatings',[m.ratings]);
 for(let mode=0;mode<2;mode++){
  const rows=snapshot.ratings.filter((v:any)=>v.mode===mode);
  for(let i=0;i<rows.length;i+=100){const c=rows.slice(i,i+100);await t.write(`ratings-${mode}-${i}`,m.ratings,r,'seed',[c.map((v:any)=>v.player),mode,c.map(({elo,played,wins,season}:any)=>({elo,played,wins,season}))]);}
 }
 for(let i=0;i<snapshot.pairSeeds.length;i+=100){const c=snapshot.pairSeeds.slice(i,i+100);await t.write(`pairs-${i}`,m.ratings,r,'seedPairCounts',[c.map((v:any)=>v.pair),c.map((v:any)=>v.count)]);}
 await sourceUnchanged();await t.write('seal-migration',m.ratings,r,'sealMigration',[migrationHash]);
 const modules=[['ChaosEffects',[]],['ChaosModifiers',[]],['ChaosRally',[]],['ChaosDynamics',['ChaosEffects','ChaosModifiers']],['ChaosContacts',['ChaosDynamics']],['ChaosPhysics',['ChaosEffects','ChaosRally','ChaosDynamics','ChaosContacts']],['ChaosCodec',[]],['DrandEvmnet',[]],['ChaosDrawRules',[]],['ChaosEngine',['ChaosCodec','ChaosPhysics','DrandEvmnet','ChaosDrawRules']]] as const;
 for(const [name,deps]of modules){m.modules[name]=await t.deploy(name,deps.map(d=>m.modules[d]));await save();}
 for(let i=0;i<3;i++){
  const app=await t.deploy('ProvisionedReusableEventsArena',[m.hub,m.lobby,m.admissionSigner,m.pressureSigner,m.modules.ChaosEngine,m.resultVerifier,provisioner],`arena-${i}`);
  const runtimeHash=keccak256((await t.base.getCode({address:app}))!);
  if(m.arenas[i])assert.equal(m.arenas[i].app,app);m.arenas[i]={app,index:i,runtimeHash};await save();
  await t.write(`register-arena-${i}`,m.lobby,l,'addArena',[app]);
 }
 await t.write('seal-lobby',m.lobby,l,'seal');
 m.settlement=await t.deploy('ReusableEventsSettlement',[m.lobby]);await save();
 m.vault=await t.deploy('RoomsVault',[t.account.address]);await save();
 m.lmsr=await t.deploy('LMSRV2');await save();
 m.market=await t.deploy('RealtimeMarket',[t.account.address,t.account.address,m.settlement,m.lmsr,m.vault]);await save();
 const v=(await t.artifact('RoomsVault')).abi;
 await t.write('register-market',m.vault,v,'registerModule',[m.market]);await t.write('seal-vault',m.vault,v,'seal');
 await sourceUnchanged();m.status='sealed';m.libraries=t.deployed;await save();
 console.log(JSON.stringify({status:m.status,lobby:m.lobby,ratings:m.ratings,arenas:m.arenas.map((a:any)=>a.app),openings:0,sourceResults:snapshot.count,preserved:['family','profiles','privateData','ratings','repeat counts','historical manifest']}));
}finally{await t.close();}

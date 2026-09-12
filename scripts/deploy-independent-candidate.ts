// Deploy a testnet qualification candidate. Does not change production configuration.
import assert from 'node:assert/strict';
import {mkdir,writeFile,rename,readFile} from 'node:fs/promises';
import {keccak256,toHex,type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
const prefix=process.env.PONG_INDEPENDENT_PREFIX!;
assert(prefix?.startsWith('independent-qualification-'));
const out=process.env.PONG_INDEPENDENT_MANIFEST!;assert(out?.startsWith('/secrets/'));
const t=await chainTools(prefix);
const hub:Address='0x3Ef8327F69e09cf721772F345e2A887eA22cD595';
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
try{manifest=JSON.parse(await readFile(out,'utf8'));assert.equal(manifest.prefix,prefix);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
manifest??={prefix,purpose:snapshot?'independent migration candidate':'independent contract qualification',production:false,chainId:10143,hub,pressureSigner,createdAt:new Date().toISOString(),genesis:Number(snapshot?.genesis??Math.floor(Date.now()/1000)),startBlock:String(await t.base.getBlockNumber()),migrationHash,arenas:[]};
assert(!manifest.migrationHash||manifest.migrationHash===migrationHash,'Migration source changed during deployment');
const save=async()=>{await writeFile(out+'.next',JSON.stringify(manifest,null,2),{mode:0o600});await rename(out+'.next',out);};
try{
 await save();
 manifest.family=await t.deploy('ArcadeFamily');await save();
 manifest.lobby=await t.deploy('IndependentLobby',[manifest.family,hub,t.account.address,pressureSigner]);await save();
 manifest.ratings=await t.deploy('PublishedRatings',[manifest.lobby,t.account.address,BigInt(manifest.genesis)]);await save();
 const l=await t.artifact('IndependentLobby'),r=await t.artifact('PublishedRatings');
 await t.write('bind-ratings',manifest.lobby,l.abi,'bindRatings',[manifest.ratings]);
 if(snapshot){
  for(let mode=0;mode<2;mode++){const rows=snapshot.ratings.filter((v:any)=>v.mode===mode);for(let i=0;i<rows.length;i+=100){const chunk=rows.slice(i,i+100);await t.write(`seed-mode-${mode}-${i}`,manifest.ratings,r.abi,'seed',[chunk.map((v:any)=>v.player),mode,chunk.map((v:any)=>({elo:Number(v.elo),played:Number(v.played),wins:Number(v.wins),season:Number(v.season)}))]);}}
  for(let i=0;i<snapshot.pairSeeds.length;i+=100){const chunk=snapshot.pairSeeds.slice(i,i+100);await t.write(`seed-repeat-${i}`,manifest.ratings,r.abi,'seedPairCounts',[chunk.map((v:any)=>v.pair),chunk.map((v:any)=>v.count)]);}
 }
 await t.write('seal-verified-migration',manifest.ratings,r.abi,'sealMigration',[migrationHash]);
 for(let i=0;i<3;i++){
  const app=await t.deploy('IndependentArena',[hub,manifest.lobby,pressureSigner],`arena-${i}`);
  manifest.arenas[i]??={app,index:i};assert.equal(manifest.arenas[i].app,app);await save();
  await t.write(`register-arena-${i}`,manifest.lobby,l.abi,'addArena',[app]);
 }
 manifest.settlement=await t.deploy('IndependentSettlement',[manifest.lobby]);await save();
 manifest.vault=await t.deploy('RoomsVault',[t.account.address]);await save();
 manifest.lmsr=await t.deploy('LMSRV2');await save();
 manifest.market=await t.deploy('MarketV4',[t.account.address,t.account.address,manifest.settlement,manifest.lmsr,manifest.vault]);await save();
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

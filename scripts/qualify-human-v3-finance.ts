// Replace only the financial boundary of the specifically identified private
// qualification. Old contracts, balances, reports and manifests remain intact.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {keccak256,type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {abi as lobbyAbi} from '../shared/abi-independent-ReusableEventsLobby';
import {abi as arenaAbi} from '../shared/abi-independent-ReusableEventsArena';
import {abi as ratingsAbi} from '../shared/abi-independent-PublishedRatings';
import {readHubDelegation} from '../shared/rooms-hub';
import {NO_LEASE_HUB} from '../shared/hub-lease';

assert.equal(process.env.PONG_PRIVATE_HUMAN_FINANCE,'reviewed-v3-20261003');
const deadline=Date.parse(process.env.PONG_PRIVATE_HUMAN_FINANCE_DEADLINE??'');
assert(deadline>Date.now()&&deadline<=Date.now()+15*60_000);
const source=JSON.parse(await readFile('/secrets/manifest.json','utf8'));
assert.equal(source.production,false);assert.equal(source.status,'sealed');
assert.equal(source.rulesVersion,14);assert.equal(source.hostedProvisioning,'owner-consent-v1');
assert.equal(source.lobby.toLowerCase(),'0xe4cdf97e582282879219d7a888f8cd0ae629bd31');
assert.equal(source.hub.toLowerCase(),NO_LEASE_HUB.toLowerCase());
const stopped=JSON.parse(await readFile('/evidence/finance-source-drained.json','utf8'));
assert(stopped.workers.length===2&&stopped.workers.every((s:any)=>s.status==='exited'));
assert(stopped.lobby===source.lobby&&Date.now()-Date.parse(stopped.at)<30*60_000);
const output='/secrets/finance-v3-manifest.json',evidence='/evidence/finance-v3-deployment.json';
let report:any;
try{report=JSON.parse(await readFile(evidence,'utf8'));assert(!report.finishedAt,'Keep completed deployment unchanged');}
catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
report??={startedAt:new Date().toISOString(),deadline,source:process.env.PONG_SOURCE_COMMIT,passed:false,
 scope:'Fresh private finance only; no old balance transfer, public route, arena opening or game command.',lobby:source.lobby,
 previous:{settlement:source.settlement,market:source.market,vault:source.vault},addresses:{}};
const save=async()=>{await writeFile(evidence+'.next',JSON.stringify(report,null,2));await rename(evidence+'.next',evidence);};
const t=await chainTools(source.prefix+':finance-v3-20261003');
const bounded=<T>(fn:()=>Promise<T>)=>retryOperatorContention(()=>{assert(Date.now()<deadline,'Original finance deployment deadline');return fn();});
const read=(address:Address,abi:any,functionName:string,args:any[]=[])=>t.base.readContract({address,abi,functionName,args}) as Promise<any>;
try{
 for(let lane=0;lane<2;lane++)assert.equal(await read(source.lobby,lobbyAbi,'slot',[BigInt(lane)]),0n,'Human slot must be drained');
 for(const a of source.arenas){
  assert.equal(await read(source.lobby,lobbyAbi,'reservedMatch',[a.app]),0n,'No active reservation');
  const current=await read(a.app,arenaAbi,'currentMatch');
  if(current[1]!==0n){
   const snapshot=await read(a.app,arenaAbi,'getSnapshot',[current[1]]);
   assert(snapshot.phase>=3,'Published physical game must have ended');
   assert((await read(source.ratings,ratingsAbi,'indexOf',[current[1]]))>0n,'The exact old result must be captured');
  }
  const session=await readHubDelegation(t.base,source.hub,a.app);assert(session.status===0||session.status===1);
 }
 report.artifacts=await t.preflight(['ReusableEventsSettlement','RoomsVault','LMSRV2','RealtimeMarket']);await save();
 for(const [name,args] of [
  ['ReusableEventsSettlement',[source.lobby]],['RoomsVault',[t.account.address]],['LMSRV2',[]],
 ] as const){report.addresses[name]=await bounded(()=>t.deploy(name,args));await save();}
 const a=report.addresses;
 a.RealtimeMarket=await bounded(()=>t.deploy('RealtimeMarket',[t.account.address,t.account.address,a.ReusableEventsSettlement,a.LMSRV2,a.RoomsVault]));await save();
 const vault=await t.artifact('RoomsVault'),market=await t.artifact('RealtimeMarket'),settlement=await t.artifact('ReusableEventsSettlement');
 await bounded(()=>t.write('register-market',a.RoomsVault,vault.abi,'registerModule',[a.RealtimeMarket]));
 await bounded(()=>t.write('seal-vault',a.RoomsVault,vault.abi,'seal'));
 assert.equal(await read(a.RoomsVault,vault.abi,'modulesSealed'),true);
 assert.equal(await read(a.RoomsVault,vault.abi,'modules',[a.RealtimeMarket]),true);
 assert.equal((await read(a.RealtimeMarket,market.abi,'results')).toLowerCase(),a.ReusableEventsSettlement.toLowerCase());
 assert.equal((await read(a.ReusableEventsSettlement,settlement.abi,'lobby')).toLowerCase(),source.lobby.toLowerCase());
 const manifest={...source,settlement:a.ReusableEventsSettlement,vault:a.RoomsVault,lmsr:a.LMSRV2,market:a.RealtimeMarket,
  financeRevision:'verified-v3-no-lease',historicalFinances:[...(source.historicalFinances??[]),report.previous]};
 report.runtimeHashes={};for(const [name,address]of Object.entries(a))report.runtimeHashes[name]=keccak256((await t.base.getCode({address:address as Address}))!);
 await writeFile(output,JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600});
 report.passed=true;
}catch(e){report.error=String((e as any).shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{90,}/gi,'[omitted]').slice(0,220);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await save();await t.close();console.log(JSON.stringify({passed:report.passed,error:report.error}));}

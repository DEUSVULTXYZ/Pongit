// Deploy production-bound candidates without changing the public manifests.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {type Address,keccak256} from 'viem';
import {chainTools} from './independent-chain-tools';
import {roomsEventsAbi as abi} from '../shared/abi-PongChaosEvents';
import {roomsVaultAbi as vaultAbi} from '../shared/abi-RoomsVault';
import {marketV4Abi} from '../shared/abis-v4';
assert.equal(process.env.PONG_CHAOS_DEPLOY,'authorized-testnet-candidate');
const prefix='chaos-events-production-20260913',file=`/secrets/${prefix}.json`;
const qualified=JSON.parse(await readFile('/secrets/chaos-events-integration-20260913.json','utf8'));
assert.equal(qualified.app,'0x4ace43735d1e5b0aa9b2d54a76ea4ac99089bb91');assert(['closing-qualified','released-qualified'].includes(qualified.state));
const before=JSON.parse(await readFile('deployments/interlude-rooms.json','utf8'));
assert.equal(before.app,'0x695307022ac7add03117e8f3b59369d7ee7a4724');
const old=JSON.parse(await readFile('deployments/rooms-finance.json','utf8')).find((m:any)=>m.app===before.app);assert(old);
const t=await chainTools(prefix),flow='0x254e3a940cf772b579115d35337f561b7844e221' as Address;
try{
 const flowCode=await t.base.getCode({address:flow});assert(flowCode&&flowCode.length>2);t.deployed.ChaosGameFlow=flow;
 const engine=qualified.modules.ChaosEngine as Address;assert((await t.base.getCode({address:engine}))!.length>2);
 const app=await t.deploy('PongChaosEvents',[before.hub,before.coordinator,old.pressureSigner,t.account.address,before.app,engine]);
 assert.equal(await t.base.readContract({address:app,abi,functionName:'RULES_VERSION'}),6n);
 const [maker,treasury]=await Promise.all(['maker','treasury'].map(functionName=>t.base.readContract({address:old.market,abi:marketV4Abi,functionName} as any))) as Address[];
 const adapter=await t.deploy('ChaosEventsSettlement',[app]),vault=await t.deploy('RoomsVault',[t.account.address]),market=await t.deploy('RealtimeMarket',[t.account.address,treasury,adapter,maker,vault]);
 await t.write('register-market',vault,vaultAbi,'registerModule',[market]);await t.write('seal-vault',vault,vaultAbi,'seal');
 assert(await t.base.readContract({address:vault,abi:vaultAbi,functionName:'modulesSealed'}));assert.equal(await t.base.readContract({address:vault,abi:vaultAbi,functionName:'moduleCount'}),1n);
 assert.equal((await t.base.readContract({address:market,abi:marketV4Abi,functionName:'results'})).toLowerCase(),adapter.toLowerCase());
 const jobs=(await t.db.query('SELECT id,hash FROM il_lifecycle_jobs WHERE id LIKE $1',[prefix+':%'])).rows;
 const deployed=jobs.find(j=>j.id===prefix+':deploy-chaoseventssettlement');assert(deployed);
 const startBlock=String((await t.base.getTransactionReceipt({hash:deployed.hash})).blockNumber);
 let record:any={};try{record=JSON.parse(await readFile(file,'utf8'));assert.equal(record.app,app);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 record={...record,app,modules:qualified.modules,flow,flowCodeHash:keccak256(flowCode),previous:before.app,state:record.state||'deployed',at:new Date().toISOString()};
 await writeFile(file+'.next',JSON.stringify(record,null,2),{mode:0o600});await rename(file+'.next',file);
 const game={...before,app,node:record.node||null,rulesVersion:6,releaseReady:false,releaseStatus:'qualifying-chaos-events',previousRooms:before.app,previousRoomsHistory:[...new Set([before.previousRooms,...(before.previousRoomsHistory||[])])],compactControls:true};
 const finance={financeId:'events-v1',rulesVersion:6,settlement:'early-published-testnet',betting:'realtime',app,adapter,market,vault,pressureSigner:old.pressureSigner,startBlock,chainId:10143};
 const report={game,finance,modules:record.modules,flow,transactions:jobs};await writeFile('artifacts/drand/production-manifests.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await t.close();}

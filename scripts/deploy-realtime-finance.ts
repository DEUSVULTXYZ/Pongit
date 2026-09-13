import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {roomsRealtimeAbi} from '../shared/abi-PongRoomsRealtime';
import {roomsVaultAbi} from '../shared/abi-RoomsVault';
import {marketV4Abi} from '../shared/abis-v4';
const compact=process.env.PONG_COMPACT_FINANCE==='authorized-testnet',prefix=compact?'compact-rooms-20260913':'realtime-20260913';
const record=JSON.parse(await readFile(`/secrets/${prefix}.json`,'utf8'));assert.equal(record.state,'answered');
const t=await chainTools(prefix);
try{
 const old=JSON.parse(await readFile('deployments/rooms-finance.json','utf8')).find((m:any)=>m.financeId==='early-v1');assert(old);
 const app=record.app as Address;assert.equal(await t.base.readContract({address:app,abi:roomsRealtimeAbi,functionName:'RULES_VERSION'}),5n);
 const [maker,treasury]=await Promise.all(['maker','treasury'].map(functionName=>t.base.readContract({address:old.market,abi:marketV4Abi,functionName} as any))) as Address[];
 const adapter=await t.deploy('RoomsRealtimeSettlement',[app]),vault=await t.deploy('RoomsVault',[t.account.address]),market=await t.deploy('RealtimeMarket',[t.account.address,treasury,adapter,maker,vault]);
 await t.write('register-market',vault,roomsVaultAbi,'registerModule',[market]);await t.write('seal-vault',vault,roomsVaultAbi,'seal');
 assert(await t.base.readContract({address:vault,abi:roomsVaultAbi,functionName:'modulesSealed'}));
 assert.equal(await t.base.readContract({address:vault,abi:roomsVaultAbi,functionName:'moduleCount'}),1n);
 assert.equal((await t.base.readContract({address:market,abi:marketV4Abi,functionName:'results'})).toLowerCase(),adapter.toLowerCase());
 const job=(await t.db.query('SELECT hash FROM il_lifecycle_jobs WHERE id=$1',[prefix+':deploy-roomsrealtimesettlement'])).rows[0];
 const block=(await t.base.getTransactionReceipt({hash:job.hash})).blockNumber;
 const finance={financeId:compact?'compact-v1':'realtime-v1',settlement:'early-published-testnet',betting:'realtime',app,adapter,market,vault,pressureSigner:old.pressureSigner,startBlock:String(block),chainId:10143};
 const oldGame=JSON.parse(await readFile('deployments/interlude-rooms.json','utf8'));
 const game={...oldGame,app,node:record.node,rulesVersion:5,releaseReady:false,releaseStatus:compact?'qualifying-compact-controls':'qualifying-realtime-betting',previousRooms:oldGame.app,...(compact?{compactControls:true}:{})};
 await writeFile('artifacts/realtime/manifests.json',JSON.stringify({game,finance},null,2));console.log(JSON.stringify({game,finance}));
}finally{await t.close();}

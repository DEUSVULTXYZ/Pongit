// Disposable finance binding for the rules-8 integration gate. No production switch.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {privateKeyToAccount} from 'viem/accounts';
import {zeroAddress,type Hex} from 'viem';
import {chainTools} from './independent-chain-tools';
import {roomsEventsAbi} from '../shared/abi-PongChaosEvents';
import {roomsVaultAbi} from '../shared/abi-RoomsVault';
import {realtimeMarketAbi} from '../shared/abi-RealtimeMarket';
import {qualificationRules} from './chaos-qualification-record';
assert.equal(process.env.PONG_CHAOS_QUALIFY,'isolated-hosted-testnet');
const prefix=process.env.PONG_CHAOS_QUALIFY_ID!;assert(/^chaos-events-[a-z0-9-]{1,60}$/.test(prefix));
const rulesVersion=qualificationRules(prefix);
const record=JSON.parse(await readFile(`/secrets/${prefix}.json`,'utf8')),t=await chainTools(prefix+'-finance');
try{
 assert.equal(await t.base.readContract({address:record.app,abi:roomsEventsAbi,functionName:'RULES_VERSION'}),BigInt(rulesVersion));
 const adapter=await t.deploy('ChaosEventsSettlement',[record.app]),vault=await t.deploy('RoomsVault',[t.account.address]);
 const maker=await t.deploy('LMSRV2'),market=await t.deploy('RealtimeMarket',[t.account.address,t.account.address,adapter,maker,vault]);
 await t.write('register-market',vault,roomsVaultAbi,'registerModule',[market]);await t.write('seal-vault',vault,roomsVaultAbi,'seal');
 assert.equal(await t.base.readContract({address:vault,abi:roomsVaultAbi,functionName:'modulesSealed'}),true);
 assert.equal((await t.base.readContract({address:market,abi:realtimeMarketAbi,functionName:'results'})).toLowerCase(),adapter.toLowerCase());
 const pressure=privateKeyToAccount(record.keys[5] as Hex),coordinator=privateKeyToAccount(record.keys[4] as Hex);
 await writeFile(`/secrets/${prefix}-pressure.json`,JSON.stringify({privateKey:record.keys[5]}),{mode:0o600});
 const job=(await t.db.query('SELECT hash FROM il_lifecycle_jobs WHERE id=$1',[prefix+'-finance:deploy-chaoseventssettlement'])).rows[0];
 const block=(await t.base.getTransactionReceipt({hash:job.hash})).blockNumber;
 const game={app:record.app,node:record.node,hub:'0x3Ef8327F69e09cf721772F345e2A887eA22cD595',coordinator:coordinator.address,pressureSigner:pressure.address,rulesVersion,compactControls:true,capacity:2,chainId:10143,baseChainId:10143,engineChainId:4242,tickUs:10000,previousRooms:zeroAddress,releaseReady:false};
 const finance={financeId:`events-rules${rulesVersion}`,rulesVersion,settlement:'early-published-testnet',betting:'realtime',app:record.app,adapter,market,vault,pressureSigner:pressure.address,startBlock:String(block),chainId:10143};
 await writeFile('artifacts/drand/integration-manifests.json',JSON.stringify({game,finance},null,2));
 console.log(JSON.stringify({game,finance}));
}finally{await t.close();}

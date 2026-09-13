import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeEventTopics,encodeAbiParameters,type Address,type TransactionReceipt} from 'viem';
import {marketV4Abi} from '../shared/abis-v4';
import {recordRoomsFinanceReceipt} from '../relayer/src/rooms-finance-receipts';
import type {RoomsFinanceManifest} from '../relayer/src/rooms-finance-config';
const address=(n:string)=>('0x'+n.padStart(40,'0')) as Address;
const m:RoomsFinanceManifest={app:address('a'),adapter:address('b'),market:address('c'),vault:address('d'),pressureSigner:address('e'),startBlock:'1',chainId:10143,financeId:'events-v1',rulesVersion:6};
const log={address:m.market,topics:encodeEventTopics({abi:marketV4Abi,eventName:'BetPlaced',args:{matchId:7n,player:address('f')}}),data:encodeAbiParameters([{type:'uint8'},{type:'uint256'},{type:'uint256'}],[0,6n,3n])};
const receipt=(status:string,logs:any[])=>({status,logs}) as TransactionReceipt;
test('confirmed receipt discovers its exact bettor before historical indexing; replay is idempotent',async()=>{
 const rows=new Map<string,any>();const db={query:async(sql:string,args:any[])=>{assert(sql.includes('ON CONFLICT DO NOTHING'));rows.set(args.join(':'),args);}};
 await recordRoomsFinanceReceipt(db,[m],receipt('success',[log]));await recordRoomsFinanceReceipt(db,[m],receipt('success',[log]));
 assert.deepEqual([...rows.values()],[[m.app+':events-v1','7',address('f')]]);
});
test('reverted, unknown-emitter and malformed receipt logs never nominate a bettor',async()=>{
 let writes=0;const db={query:async()=>{writes++;}};
 await recordRoomsFinanceReceipt(db,[m],receipt('reverted',[log]));await recordRoomsFinanceReceipt(db,[m],receipt('success',[{...log,address:address('99')},{...log,data:'0x1234'}]));assert.equal(writes,0);
});
test('a verified payout receipt makes the transaction link available before historical catch-up',async()=>{
 const payoutId=('0x'+'11'.repeat(32)) as `0x${string}`,hash=('0x'+'22'.repeat(32)) as `0x${string}`,writes:any[]=[];
 const paid={address:m.market,topics:encodeEventTopics({abi:marketV4Abi,eventName:'PayoutPaid',args:{payoutId,recipient:address('f')}}),data:encodeAbiParameters([{type:'uint256'}],[6n])};
 await recordRoomsFinanceReceipt({query:async(sql,args)=>{writes.push({sql,args});}},[m],{...receipt('success',[paid]),transactionHash:hash});
 assert.equal(writes.length,1);assert(writes[0].sql.includes('il_payment_receipts'));assert.deepEqual(writes[0].args,[m.app+':events-v1',payoutId,'PayoutPaid',hash]);
});

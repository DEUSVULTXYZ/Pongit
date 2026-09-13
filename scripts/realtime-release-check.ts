// Read real deployments and archived balances. No engine or financial writes.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient,http,type Address} from 'viem';
import {roomsRealtimeAbi as abi} from '../shared/abi-PongRoomsRealtime';
import {readHubDelegation} from '../shared/rooms-hub';
import {loadRoomsFinance} from '../relayer/src/rooms-finance-config';
import {createRoomsFinanceDirectory} from '../relayer/src/rooms-finance-directory';
assert.equal(process.env.PONG_REALTIME_CHECK,'authorized-testnet');
const m=JSON.parse(await readFile('deployments/interlude-rooms.json','utf8'));
const old=JSON.parse(await readFile('deployments/interlude-rooms-rules4.json','utf8'));
const base=createPublicClient({transport:http(process.env.RPC_URL,{retryCount:0,timeout:12000})});
const node=createPublicClient({transport:http(m.node,{retryCount:0,timeout:12000})});
const previous=createPublicClient({transport:http(old.node,{retryCount:0,timeout:12000})});
const db=new Pool({connectionString:process.env.DATABASE_URL});
const json=(v:any)=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x,2);
try{
 const d=await readHubDelegation(base,m.hub,m.app),before=await readHubDelegation(base,old.hub,old.app);
 const pinned=await base.getBlock({blockNumber:d.baseBlock});
 assert.equal(d.status,1);assert.equal(before.status,1);
 for(const [client,app] of [[node,m.app],[previous,old.app],[base,old.app]] as const)assert.equal(await client.readContract({address:app,abi,functionName:'activeCount'}),0n,'Drain matches before switching');
 assert(before.lastCommitAt<=pinned.timestamp,'Previous game changed after the new engine pinned its inherited ratings');
 assert.equal(await node.readContract({address:m.app,abi,functionName:'RULES_VERSION'}),5n);
 const players=(await db.query('SELECT player FROM profiles ORDER BY player LIMIT 250')).rows;
 const ratings=[];
 for(const {player} of players)for(const mode of [0,1]){
  const prior=await base.readContract({address:old.app,abi,functionName:'ratingOf',args:[player as Address,mode]});
  const next=await node.readContract({address:m.app,abi,functionName:'ratingOf',args:[player as Address,mode]});
  assert.deepEqual({...next,season:prior.season},prior,'Inherited rating mismatch');ratings.push({player,mode,elo:next.elo,played:next.played});
 }
 const finance=await loadRoomsFinance();
 const directory=await createRoomsFinanceDirectory({db,base,entries:finance.entries,app:m.app,enqueue:async()=>{throw Error('Read-only release check');}});
 const account='0xa6128739a09C75932510543002c635F20f42Aee8';
 const view=await directory.route('/interlude/finance','GET',account,{},new URLSearchParams());
 assert(view);assert.equal(view.manifest.app.toLowerCase(),m.app);assert.equal(view.archives.length,finance.entries.length-1);
 const balanceViews=[view,...view.archives].map((v:any)=>({app:v.manifest.app,market:v.manifest.market,vault:v.manifest.vault,balance:v.balance}));
 assert.equal(new Set(balanceViews.map(v=>v.market)).size,finance.entries.length);
 for(const v of balanceViews){const selected=await directory.route('/interlude/finance','GET',account,{},new URLSearchParams({app:v.app,financeId:finance.entries.find(x=>x.market.toLowerCase()===v.market.toLowerCase())!.financeId||''}));assert.equal(selected!.manifest.market.toLowerCase(),v.market.toLowerCase());}
 const receipts=(await db.query('SELECT payout_id,status,tx_hash FROM il_payment_receipts WHERE app LIKE $1',[m.app+'%'])).rows;
 const paymentJobs=(await db.query("SELECT hash FROM il_lifecycle_jobs WHERE id LIKE 'realtime-live-20260913-1:finance-%' AND status='confirmed' ORDER BY nonce DESC LIMIT 10")).rows;
 const payoutId='0xfff5083c380e27746c846a12d82e488b534a8d6f72f5388dfa745c6a1e0d8c58';
 for(const {hash} of paymentJobs){const receipt=await base.getTransactionReceipt({hash});if(receipt.logs.some(log=>log.topics.some(topic=>topic===payoutId)))receipts.push({payout_id:payoutId,status:'confirmed receipt',tx_hash:hash,block:String(receipt.blockNumber)});}
 const report={at:new Date().toISOString(),app:m.app,baseBlock:d.baseBlock,previousLastCommitAt:before.lastCommitAt,pinnedTimestamp:pinned.timestamp,ratings,balances:balanceViews,receipts,passed:true};
 await writeFile('artifacts/realtime/release-check.json',json(report));console.log(json(report));
}finally{await db.end();}

// Read-only publication and payment proof; never export private fixture records.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient,http,decodeEventLog} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {readHubDelegation} from '../shared/rooms-hub';
import {abi as arenaAbi} from '../shared/abi-independent-IndependentArena';
import {abi as ledgerAbi} from '../shared/abi-independent-PublishedRatings';
import {abi as marketAbi} from '../shared/abi-independent-MarketV4';
const m=JSON.parse(await readFile(process.env.PONG_INDEPENDENT_MANIFEST!,'utf8'));assert.equal(m.production,false);
const fixture=JSON.parse(await readFile(process.env.PONG_INDEPENDENT_TEST_KEYS!,'utf8'));
const base=createPublicClient({transport:http(process.env.RPC_URL,{retryCount:0,timeout:10000})}),db=new Pool({connectionString:process.env.DATABASE_URL});
const read=(address:any,abi:any,functionName:string,args:any[]=[],blockNumber?:bigint)=>base.readContract({address,abi,functionName,args,blockNumber}) as Promise<any>;
const report:any={at:new Date().toISOString(),productionMigrated:false,matches:[],payments:[]};
try{
 for(const match of fixture.matches){
  const id=BigInt(match.id),d=await readHubDelegation(base,m.hub,match.app),s=await read(match.app,arenaAbi,'getSnapshot',[id]);
  const entry=await read(m.ratings,ledgerAbi,'entry',[id]);
  assert.equal(s[2],3n);assert.equal(entry.first.hash,await read(match.app,arenaAbi,'resultHashes',[id]));assert.equal(entry.first.winner.toLowerCase(),s[6].toLowerCase());
  report.matches.push({app:match.app,id:match.id,epoch:match.epoch,mode:match.mode,winner:s[6],score:[s[12].scoreA,s[12].scoreB],hash:entry.first.hash,batches:String(d.batchIndex),hubStatus:d.status,lastPublicationUTC:new Date(Number(d.lastCommitAt)*1000).toISOString(),releaseUTC:new Date(Number(d.stakeUnlockAt)*1000).toISOString()});
 }
 const match=fixture.matches[1],id=BigInt(match.id),bettor=privateKeyToAccount(fixture.players[0].root).address;
 const payoutId=await read(m.market,marketAbi,'payoutId',[0,id,bettor]),payout=await read(m.market,marketAbi,'payouts',[payoutId]);
 const position=await read(m.market,marketAbi,'positions',[id,bettor]);
 report.payments.push({id:match.id,bettor,payoutId,payout,position});
 const rows=(await db.query('SELECT id,hash,status FROM il_lifecycle_jobs WHERE id LIKE $1 ORDER BY nonce',[m.prefix+':compact%'])).rows;
 report.operations=rows;
 for(const row of rows.filter(r=>r.id.includes('finance-claim-'))){
  const receipt=await base.getTransactionReceipt({hash:row.hash});assert.equal(receipt.status,'success');
  const paid=receipt.logs.flatMap(log=>{try{const e=decodeEventLog({abi:marketAbi,data:log.data,topics:log.topics});return e.eventName==='PayoutPaid'&&e.args.payoutId===payoutId?[e.args]:[];}catch{return [];}});
  if(paid.length){
   assert.equal(paid.length,1);const [before,after]=await Promise.all([base.getBalance({address:bettor,blockNumber:receipt.blockNumber-1n}),base.getBalance({address:bettor,blockNumber:receipt.blockNumber})]);
   assert.equal(after-before,payout[1]);assert.equal(payout[2],2);assert.equal(payout[3],1);
   report.paymentProof={hash:row.hash,block:receipt.blockNumber,before,after,amount:payout[1]};
  }
 }
 report.financeCursor=(await db.query('SELECT block_number FROM independent_finance_cursor WHERE lobby=$1',[m.lobby.toLowerCase()])).rows[0]?.block_number;
 report.head=String(await base.getBlockNumber());
 await writeFile('artifacts/independent-candidate/compact-verification.json',JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2));
 console.log(JSON.stringify({matches:report.matches,paymentProof:report.paymentProof,financeCursor:report.financeCursor,head:report.head},(_,v)=>typeof v==='bigint'?String(v):v));
}finally{await db.end();}

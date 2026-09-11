// Read-only recovery evidence. Never exports transaction bytes, grants or keys.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient,http,decodeEventLog,type Address} from 'viem';
import {monadTestnet} from 'viem/chains';
import {roomsChaosAbi} from '../shared/abi-PongRoomsTestnet';
import {roomsMarketAdapterAbi} from '../shared/abi-RoomsMarketAdapter';
import {marketV4Abi} from '../shared/abis-v4';
import {readHubDelegation} from '../shared/rooms-hub';
assert.equal(process.env.PONG_RECOVERY_EVIDENCE,'read-only');
const m=JSON.parse(await readFile('deployments/interlude-rooms.json','utf8'));
const finance=JSON.parse(await readFile('deployments/rooms-finance.json','utf8')).find((f:any)=>f.app===m.app&&!f.financeId);
const base=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL,{retryCount:0,timeout:8000})});
const db=new Pool({connectionString:process.env.DATABASE_URL});
const report:any={at:new Date().toISOString(),app:m.app,readOnly:true};
try{
 assert.equal(await base.getChainId(),10143);
 report.delegation=await readHubDelegation(base,m.hub,m.app);
 report.engineJob=(await db.query("SELECT id,app,epoch,signer,nonce,hash,action,match_id,status,resolution,updated_at FROM il_engine_jobs WHERE app=$1 AND nonce=276",[m.app])).rows;
 report.lifecycle=(await db.query('SELECT stage,epoch,provisioning FROM il_lifecycle WHERE app=$1',[m.app])).rows;
 report.lifecycleTransactions=(await db.query("SELECT id,hash,status,nonce FROM il_lifecycle_jobs WHERE app=$1 ORDER BY nonce DESC LIMIT 8",[m.app])).rows;
 report.results=[];
 const rows=(await db.query('SELECT id,phase,mode FROM il_results WHERE app=$1 ORDER BY ended_at DESC LIMIT 6',[m.app])).rows;
 for(const row of rows){const id=BigInt(row.id);const s=await base.readContract({address:m.app,abi:roomsChaosAbi,functionName:'getSnapshot',args:[id]});
  const hash=await base.readContract({address:m.app,abi:roomsChaosAbi,functionName:'resultHashes',args:[id]});
  report.results.push({id:row.id,storedPhase:row.phase,mode:row.mode,publishedPhase:s[2],score:[s[12].scoreA,s[12].scoreB],winner:s[6],hash});
 }
 const legacyId=49202557674759932004881244328558772013970213742625233691874681881482800284539n;
 const bettor:Address='0xfafabe81a76118f01a391d401c6b0b49311a7a19';
 const result=await base.readContract({address:finance.adapter,abi:roomsMarketAdapterAbi,functionName:'finalResults',args:[legacyId]});
 const payoutId=await base.readContract({address:finance.market,abi:marketV4Abi,functionName:'payoutId',args:[0,legacyId,bettor]});
 const payout=await base.readContract({address:finance.market,abi:marketV4Abi,functionName:'payouts',args:[payoutId]});
 const payment=(await db.query('SELECT status,tx_hash FROM il_payment_receipts WHERE app=$1 AND payout_id=$2',[m.app,payoutId])).rows[0];
 report.legacyPayment={match:legacyId,result,payoutId,payout,payment};
 if(payment){const receipt=await base.getTransactionReceipt({hash:payment.tx_hash});
  report.legacyPayment.receipt={status:receipt.status,block:receipt.blockNumber};
  report.legacyPayment.transferConfirmed=receipt.status==='success'&&receipt.logs.some(l=>{try{if(l.address.toLowerCase()!==finance.market.toLowerCase())return false;const e=decodeEventLog({abi:marketV4Abi,data:l.data,topics:l.topics});return e.eventName==='PayoutPaid'&&e.args.payoutId===payoutId&&e.args.recipient.toLowerCase()===bettor&&e.args.amount===payout[1];}catch{return false;}});
 }
 report.activeChallenges=(await db.query("SELECT count(*)::int AS count FROM il_settlement_challenge_report WHERE scope=$1 AND canonical",[m.app+':early-v1'])).rows[0].count;
}catch(e){report.error=(e as any).shortMessage||(e as Error).message;process.exitCode=1;}
finally{await db.end();await mkdir('artifacts/recovery',{recursive:true});await writeFile('artifacts/recovery/onchain.json',JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2));console.log(JSON.stringify({at:report.at,stage:report.lifecycle?.[0]?.stage,epoch:String(report.delegation?.epoch),legacyTransfer:report.legacyPayment?.transferConfirmed,error:report.error}));}

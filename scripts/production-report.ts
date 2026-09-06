import "dotenv/config";
import pg from "pg";
import {parseTransaction} from "viem";
import {readFile} from "node:fs/promises";
import {json} from "../shared/protocol";
const d=JSON.parse(await readFile(process.env.DEPLOYMENT_FILE || "deployments/testnet.json","utf8"));if(d.chainId!==10143 || d.version!==2)throw new Error("V2 Monad Testnet report only");
const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
const quantiles=(values:number[])=>{if(!values.length)return null;const s=[...values].sort((a,b)=>a-b);return {n:s.length,p50:s[Math.ceil(.5*s.length)-1],p95:s[Math.ceil(.95*s.length)-1],p99:s[Math.ceil(.99*s.length)-1]};};
try{
 const jobs=(await db.query("SELECT id,payload,status,raw_tx,receipt,tx_hash,nonce,created_at,signed_at,submitted_at,confirmed_at FROM relay_jobs WHERE payload->>'deployment'='v2' AND receipt IS NOT NULL ORDER BY nonce")).rows;
 if(!jobs.length)throw new Error("No V2 receipts recorded yet");
 const rooms=(await db.query("SELECT match_id,job_id FROM rooms WHERE deployment='v2' AND match_id IS NOT NULL")).rows;
 const map=new Map(rooms.map(r=>[r.job_id,r.match_id]));
 const rows=jobs.map(j=>{const transaction=parseTransaction(j.raw_tx),r=j.receipt;const payload=j.payload,args=payload.args;const matchId=map.get(j.id) || (payload.contract==="game"? (typeof args[0]==="object"?args[0].matchId:payload.functionName==="playerAction"?args[1]:args[0]):payload.contract==="market"?(typeof args[0]==="object"?args[0].matchId:args[0]):undefined);
  return {hash:j.tx_hash,nonce:j.nonce,contract:payload.contract,transition:payload.functionName,matchId,status:j.status,gasUsed:r.gasUsed,gasLimit:transaction.gas,effectiveGasPrice:r.effectiveGasPrice,feeWei:BigInt(r.gasUsed)*BigInt(r.effectiveGasPrice),valueWei:r.status==="success"?BigInt(payload.value || 0):0n,createdAt:j.created_at.toISOString(),confirmedAt:j.confirmed_at.toISOString(),queueMs:+j.signed_at-+j.created_at,broadcastMs:+j.submitted_at-+j.signed_at,confirmationMs:+j.confirmed_at-+j.submitted_at,totalMs:+j.confirmed_at-+j.created_at};});
 const gameIds=[...new Set(rows.filter(r=>r.contract==="game" && r.matchId).map(r=>String(r.matchId)))];
 const matchCosts=gameIds.map(id=>{const game=rows.filter(r=>r.contract==="game"&&String(r.matchId)===id);return {matchRef:`v2:${id}`,gameTransitions:game.length,gameGasWei:game.reduce((a,b)=>a+b.feeWei,0n),definition:"Game creation, reveals, inputs, resolutions, rating and result actions recorded by this sponsor; includes reverted game calls. Excludes direct callers, bets, withdrawals, faucet credits and market liquidity."};});
 const elapsed=(+jobs.at(-1)?.confirmed_at-+jobs[0]?.submitted_at)/1000;
 const inputs=rows.filter(r=>r.transition==="submitInput" && r.status==="succeeded");
 console.log(json({network:"Monad Testnet 10143",deployment:d.game,measuredAt:new Date().toISOString(),sample:"Observed production transactions during mixed functional tests and concurrent play; not a maximum-capacity load test.",transactions:rows.length,observedWindowSeconds:elapsed,observedTransactionsPerSecond:rows.length/elapsed,latencyMs:{allTransactions:quantiles(rows.map(r=>r.totalMs)),inputs:quantiles(inputs.map(r=>r.totalMs)),inputQueue:quantiles(inputs.map(r=>r.queueMs)),inputBroadcast:quantiles(inputs.map(r=>r.broadcastMs)),inputConfirmation:quantiles(inputs.map(r=>r.confirmationMs))},sponsoredGasWei:rows.reduce((a,b)=>a+b.feeWei,0n),matchCosts,rows}));
}finally{await db.end();}

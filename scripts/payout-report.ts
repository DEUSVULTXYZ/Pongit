import 'dotenv/config';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {decodeEventLog} from 'viem';
import {contractsFor,json} from '../shared/protocol';
const d=JSON.parse(await readFile(process.env.DEPLOYMENT_FILE||'deployments/testnet.json','utf8'));if(d.version!==4||d.chainId!==10143)throw Error('V4 Monad Testnet only');
const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
try{
 const jobs=(await db.query("SELECT id,payload,tx_hash,receipt,confirmed_at FROM relay_jobs WHERE payload->>'deployment'='v4' AND status='succeeded' AND receipt IS NOT NULL ORDER BY nonce")).rows;
 const ends=new Map<string,any>(),byHash=new Map(jobs.map(j=>[j.tx_hash,j]));
 for(const j of jobs)for(const log of j.receipt.logs||[]){const module=log.address.toLowerCase()===d.game.toLowerCase()?'game':log.address.toLowerCase()===d.tournaments.toLowerCase()?'tournaments':null;if(!module)continue;try{const e:any=decodeEventLog({abi:contractsFor(d)[module],data:log.data,topics:log.topics});if(e.eventName==='MatchEnded'||e.eventName==='TournamentEnded')ends.set(`${module}:${e.args.matchId??e.args.tournamentId}`,{hash:j.tx_hash,confirmedAt:j.confirmed_at});}catch{}}
 const tasks=(await db.query("SELECT id,module,kind,source_id,recipient,state,amount,attempts,tx_hash,created_at,updated_at FROM payout_tasks WHERE deployment='v4' ORDER BY created_at,id")).rows;
 const rows=tasks.map(p=>{const result=ends.get(`${p.module==='market'?'game':'tournaments'}:${p.source_id}`),paid=byHash.get(p.tx_hash);return {id:p.id,source:`v4:${p.source_id}`,kind:p.kind,recipient:p.recipient,amountWei:p.amount,state:p.state,attempts:p.attempts,paymentHash:p.tx_hash,resultHash:result?.hash,resultObservedAt:result?.confirmedAt,paidObservedAt:paid?.confirmed_at,resultToPaymentMs:result&&paid?+paid.confirmed_at-+result.confirmedAt:null};});
 const quantiles=(values:number[])=>{if(!values.length)return null;const a=[...values].sort((a,b)=>a-b);return {n:a.length,p50:a[Math.ceil(a.length*.5)-1],p95:a[Math.ceil(a.length*.95)-1],p99:a[Math.ceil(a.length*.99)-1]};};
 console.log(json({network:10143,game:d.game,measuredAt:new Date().toISOString(),definition:'Relayer-observed result receipt to relayer-observed successful native payment receipt. Tournament prizes settle in the same transaction as the tournament result. Direct operator result transactions are shown in separate test evidence and excluded from this quantile sample.',betResultToPaymentMs:quantiles(rows.filter(p=>p.kind===0&&p.state==='paid'&&p.resultToPaymentMs!==null).map(p=>p.resultToPaymentMs!)),rows}));
}finally{await db.end();}

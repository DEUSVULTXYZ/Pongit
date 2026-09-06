import type { Pool } from "pg";
import { encodeAbiParameters, keccak256, parseAbiParameters, type Address, type Hex } from "viem";
import { contractsFor, deploymentId, type Deployment, type RelayRequest } from "../../shared/protocol";

type Context={db:Pool;deployment:Deployment;client:any;graphql:(query:string,variables?:unknown)=>Promise<any>;enqueue:(payload:RelayRequest,internal?:boolean)=>Promise<any>};
const retryDelays=[5,30,120,600,3600];
export function payoutKey(kind:number,sourceId:string,recipient:Address) {
  return keccak256(encodeAbiParameters(parseAbiParameters("uint8, uint256, address"),[kind,BigInt(sourceId),recipient]));
}
export async function initializePayouts(db:Pool) {
 await db.query(`CREATE TABLE IF NOT EXISTS payout_tasks (
  id text PRIMARY KEY,deployment text NOT NULL,module text NOT NULL,kind integer NOT NULL,source_id text NOT NULL,
  recipient text NOT NULL,payout_id text NOT NULL,state text NOT NULL DEFAULT 'pending',amount numeric NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0,job_id text,tx_hash text,error text,next_check timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
  ALTER TABLE payout_tasks ADD COLUMN IF NOT EXISTS retry_requested_at timestamptz;
  CREATE INDEX IF NOT EXISTS payouts_due ON payout_tasks(deployment,state,next_check);
  CREATE INDEX IF NOT EXISTS payouts_recipient ON payout_tasks(recipient,created_at);
  CREATE TABLE IF NOT EXISTS payout_cursors(deployment text PRIMARY KEY,cursor text NOT NULL);
  CREATE TABLE IF NOT EXISTS payout_tournaments(id text PRIMARY KEY,source_id text NOT NULL,deployment text NOT NULL,active boolean NOT NULL DEFAULT true,next_check timestamptz NOT NULL DEFAULT now());`);
}
export function createPayoutWorker(c:Context) {
 const {db,deployment:d,client,graphql,enqueue}=c,version=deploymentId(d),abis=contractsFor(d);
 let discoveryAt=0,lastDiscoveryError="",lastWorkerError="";
 const read=async(module:"market"|"tournaments"|"game",fn:string,args:unknown[])=>client.readContract({address:d[module],abi:abis[module],functionName:fn,args});
 async function discover(){
  const cursor=(await db.query("SELECT cursor FROM payout_cursors WHERE deployment=$1",[version])).rows[0]?.cursor||"";
  const result=await graphql(`query($version:String!,$cursor:String!){PayoutCandidate(where:{deployment:{_eq:$version},cursor:{_gt:$cursor}},order_by:{cursor:asc},limit:100){id module kind sourceId recipient cursor} Tournament(where:{id:{_like:$pattern},status:{_eq:2}},limit:100){id}}`.replace('$cursor:String!', '$cursor:String!,$pattern:String!'),{version,cursor,pattern:version+":%"});
  const connection=await db.connect();
  try{await connection.query("BEGIN");
   for(const item of result.PayoutCandidate){
    if(!["market","tournaments"].includes(item.module)||!/^\d+$/.test(item.sourceId)||!/^0x[\da-f]{40}$/i.test(item.recipient)||![0,1,2,3].includes(item.kind))throw new Error("Invalid indexed payment");
    await connection.query("INSERT INTO payout_tasks(id,deployment,module,kind,source_id,recipient,payout_id) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING",[item.id,version,item.module,item.kind,item.sourceId,item.recipient.toLowerCase(),payoutKey(item.kind,item.sourceId,item.recipient)]);
   }
   for(const t of result.Tournament)await connection.query("INSERT INTO payout_tournaments(id,source_id,deployment) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[t.id,t.id.split(":")[1],version]);
   if(result.PayoutCandidate.length)await connection.query("INSERT INTO payout_cursors(deployment,cursor) VALUES($1,$2) ON CONFLICT(deployment) DO UPDATE SET cursor=excluded.cursor",[version,result.PayoutCandidate.at(-1).cursor]);
   await connection.query("COMMIT");
  }catch(e){await connection.query("ROLLBACK");throw e;}finally{connection.release();}
 }
 async function indexedPayment(row:any){
  try {const x=await graphql(`query($id:String!){Payout(where:{id:{_eq:$id}},limit:1){status txHash}}`,{id:`${version}:${row.module}:${row.payout_id}`});return x.Payout[0];}catch{return null;}
 }
 async function save(row:any,state:string,amount:bigint,seconds:number,extra:{attempts?:number;job?:string;hash?:string;error?:string}={}){
  await db.query("UPDATE payout_tasks SET state=$2,amount=$3,next_check=now()+($4::int*interval '1 second'),attempts=coalesce($5,attempts),job_id=coalesce($6,job_id),tx_hash=coalesce($7,tx_hash),error=$8,updated_at=now() WHERE id=$1",[row.id,state,String(amount),seconds,extra.attempts??null,extra.job??null,extra.hash??null,extra.error??null]);
 }
 async function process(row:any){
  const p=await read(row.module,"payouts",[row.payout_id]);
  if(Number(p[2])===2){
   const indexed=await indexedPayment(row);await save(row,BigInt(p[1])===0n?"no_payout":"paid",BigInt(p[1]),30,{attempts:Number(p[3]),hash:indexed?.status==="paid"?indexed.txHash:undefined});return;
  }
  const pending=row.job_id?(await db.query("SELECT status,tx_hash FROM relay_jobs WHERE id=$1",[row.job_id])).rows[0]:null;
  if(pending && ["queued","signed","sent"].includes(pending.status)){await save(row,"processing",BigInt(row.amount),2);return;}
  let amount=BigInt(row.amount),fn="",args:unknown[]=[];
  if(Number(p[2])===1){
   amount=BigInt(p[1]);
   if(Number(p[3])>row.attempts){await save(row,"delayed",amount,retryDelays[Math.min(Number(p[3])-1,4)],{attempts:Number(p[3]),error:"The recipient did not accept MON. Funds remain reserved and an automatic retry is scheduled."});return;}
   fn="retryPayout";args=[row.payout_id];
  }else if(row.module==="market"){
   const [m,position]=await Promise.all([read("game","result",[BigInt(row.source_id)]),read("market","positions",[BigInt(row.source_id),row.recipient])]);
   if(Number(m[3])<3){await save(row,"pending",0n,5);return;}
   amount=Number(m[3])===4?BigInt(position[2]):String(m[2]).toLowerCase()===String(m[0]).toLowerCase()?BigInt(position[0]):BigInt(position[1]);
   if(amount===0n){await save(row,"no_payout",0n,3600);return;}
   if(position[3]){await save(row,"pending",amount,5);return;}
   fn="claim";args=[row.source_id,row.recipient];
  }else if(row.kind===2){
   const t=await read("tournaments","getTournament",[BigInt(row.source_id)]);
   if(Number(t.status)!==4){await save(row,"pending",0n,5);return;}
   const entered=await read("tournaments","entered",[BigInt(row.source_id),row.recipient]);
   if(!entered||BigInt(t.fee)===0n){await save(row,"no_payout",0n,3600);return;}
   amount=BigInt(t.fee);fn="refund";args=[row.source_id,row.recipient];
  }else{await save(row,"pending",amount,5);return;}
  const job=await enqueue({deployment:version,contract:row.module,functionName:fn,args},true);
  await save(row,job.status==="failed"?"delayed":"processing",amount,job.status==="failed"?30:2,{job:job.id,error:job.status==="failed"?"Payment delayed. Automatic retry is scheduled.":undefined});
 }
 async function advanceTournament(row:any){
  try {
   const t=await read("tournaments","getTournament",[BigInt(row.source_id)]);
   if(Number(t.status)!==2){await db.query("UPDATE payout_tournaments SET active=false WHERE id=$1",[row.id]);return;}
   // Simulation inside enqueue checks every attached result and prevents early advancement.
   await enqueue({deployment:version,contract:"tournaments",functionName:"advance",args:[row.source_id]},true);
  }catch{/* Incomplete rounds remain live; retry when their onchain results are ready. */}
  await db.query("UPDATE payout_tournaments SET next_check=now()+interval '5 seconds' WHERE id=$1",[row.id]);
 }
 async function tick(){
  if(d.version!==4)return;
  if(Date.now()-discoveryAt>=3000){discoveryAt=Date.now();try{await discover();lastDiscoveryError="";}catch{lastDiscoveryError="Payment event discovery is waiting for Envio. Existing payments continue to retry.";}}
  // Keep at most two background financial jobs in the shared nonce pipeline.
  const pending=Number((await db.query("SELECT count(*) FROM relay_jobs WHERE payload->>'deployment'=$1 AND payload->>'functionName' IN ('claim','refund','retryPayout','advance') AND status IN ('queued','signed','sent')",[version])).rows[0].count);
  if(pending>=2)return;
  const tournament=(await db.query("SELECT * FROM payout_tournaments WHERE deployment=$1 AND active AND next_check<=now() ORDER BY next_check LIMIT 1",[version])).rows[0];if(tournament)await advanceTournament(tournament);
  const slots=2-Number((await db.query("SELECT count(*) FROM relay_jobs WHERE payload->>'deployment'=$1 AND payload->>'functionName' IN ('claim','refund','retryPayout','advance') AND status IN ('queued','signed','sent')",[version])).rows[0].count);if(slots<=0)return;
  const rows=(await db.query("SELECT * FROM payout_tasks WHERE deployment=$1 AND next_check<=now() AND (state NOT IN ('paid','no_payout') OR (state='paid' AND tx_hash IS NULL)) ORDER BY next_check,created_at LIMIT $2",[version,slots])).rows;
  for(const row of rows)try{await process(row);lastWorkerError="";}catch{lastWorkerError="A payment check failed; funds remain governed by the contract.";await save(row,"delayed",BigInt(row.amount),30,{error:"Payment verification temporarily unavailable. Automatic retry is scheduled."});}
 }
 async function list(player:string,offset=0){
  const rows=(await db.query("SELECT id,deployment,module,kind,source_id,recipient,payout_id,state,amount,attempts,tx_hash,error,created_at,updated_at FROM payout_tasks WHERE recipient=$1 ORDER BY created_at DESC,id LIMIT 51 OFFSET $2",[player.toLowerCase(),offset])).rows;
  return {payments:rows.slice(0,50).map(x=>({id:x.id,deployment:x.deployment,module:x.module,kind:x.kind,sourceId:x.source_id,recipient:x.recipient,payoutId:x.payout_id,state:x.state,amount:x.amount,attempts:x.attempts,txHash:x.tx_hash,error:x.error,createdAt:x.created_at,updatedAt:x.updated_at})),nextOffset:rows.length>50?offset+50:null};
 }
 async function retry(id:string){
  const row=(await db.query("SELECT * FROM payout_tasks WHERE id=$1 AND deployment=$2",[id,version])).rows[0];if(!row)throw new Error("Payment not found");
  if(row.state!=="delayed")return {state:row.state};
  // A request can only re-send the same fixed-recipient debt; the onchain retry is permissionless.
  const p=await read(row.module,"payouts",[row.payout_id]);if(Number(p[2])!==1)throw new Error("No deferred wallet transfer to retry");
  const reservation=await db.query("UPDATE payout_tasks SET retry_requested_at=now() WHERE id=$1 AND (retry_requested_at IS NULL OR retry_requested_at<now()-interval '1 minute') RETURNING id",[row.id]);if(!reservation.rowCount)throw new Error("A retry was already requested. Wait one minute; automatic recovery remains active.");
  const job=await enqueue({deployment:version,contract:row.module,functionName:"retryPayout",args:[row.payout_id]},true);await save(row,"processing",BigInt(p[1]),2,{job:job.id,attempts:Number(p[3])});return {id:job.id,state:"processing"};
 }
 return {tick,list,retry,status:()=>({enabled:d.version===4,discoveryError:lastDiscoveryError,workerError:lastWorkerError})};
}

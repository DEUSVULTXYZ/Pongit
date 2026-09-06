import type { Pool } from "pg";
import { z } from "zod";
import { keccak256, toHex, recoverTypedDataAddress, type Hex } from "viem";
import { domain, inputTypes, json, type Deployment, type RelayRequest } from "../../shared/protocol";
import { intentMessage, intentTypes, inputState, type GameInput } from "../../shared/input-transport";
const uint = z.coerce.bigint().min(0n).max((1n<<64n)-1n);
const inputSchema = z.object({matchId:z.coerce.bigint().positive(),player:z.string().regex(/^0x[\da-fA-F]{40}$/),direction:z.number().int().min(-1).max(1),nonce:uint,observedBlock:uint,validUntilBlock:uint});
const signatureSchema=z.string().regex(/^0x[\da-fA-F]{130}$/);
// Collision catch-up precedes direction assignment in GameV3. An already
// verified replacement with the same match/player/nonce changes only that
// assignment and signature calldata; its storage/calldata cost is budgeted
// separately. Never reuse this rule for another function or a value transfer.
export function sharesInputEstimate(before:any,after:any,head:bigint) {
  if([before,after].some(p=>p.contract!=="game"||p.functionName!=="submitInput"||BigInt(p.value||0)!==0n))return false;
  const a=before.args[0],b=after.args[0];
  return before.deployment===after.deployment && String(a.matchId)===String(b.matchId) && a.player.toLowerCase()===b.player.toLowerCase() && BigInt(a.nonce)===BigInt(b.nonce) && BigInt(b.observedBlock)<=head && BigInt(b.validUntilBlock)>=head;
}
export async function initializeInputs(db:Pool) {
  await db.query(`ALTER TABLE relay_jobs ADD COLUMN IF NOT EXISTS input_lane text;
    ALTER TABLE relay_jobs ADD COLUMN IF NOT EXISTS input_sequence bigint;
    CREATE INDEX IF NOT EXISTS input_pending ON relay_jobs(input_lane,status);
    CREATE TABLE IF NOT EXISTS input_streams (id text PRIMARY KEY,sequence bigint NOT NULL DEFAULT 0,job_id text);`);
  // Preserve and serialize unfinished commands from an older release too.
  await db.query(`UPDATE relay_jobs SET input_lane=concat(payload->>'deployment',':',payload->'args'->0->>'matchId',':',lower(payload->'args'->0->>'player'))
    WHERE input_lane IS NULL AND payload->>'functionName'='submitInput'`);
}
export function createInputs(d:{db:Pool;deployment:Deployment;version:string;read:(id:bigint)=>Promise<any>;head:()=>bigint;valid:(player:any,key:any)=>Promise<boolean>;notify:(value:any)=>void}) {
  const tails=new Map<string,Promise<unknown>>();
  async function lock<T>(lane:string,fn:()=>Promise<T>):Promise<T> {
    const previous=tails.get(lane)||Promise.resolve(),task=previous.then(fn,fn);tails.set(lane,task);
    try{return await task;}finally{if(tails.get(lane)===task)tails.delete(lane);}
  }
  const laneOf=(id:string,player:string)=>`${d.version}:${id}:${player.toLowerCase()}`;
  function slotOf(m:any,player:string){const p=player.toLowerCase();if(m.playerA.toLowerCase()===p)return m.a;if(m.playerB.toLowerCase()===p)return m.b;throw new Error("Only a participant can move this paddle");}
  async function cursor(lane:string,slot:any) {
    const rows=(await d.db.query(`SELECT * FROM relay_jobs WHERE input_lane=$1 AND status IN ('queued','signed','sent') ORDER BY created_at`,[lane])).rows;
    const confirmed=(await d.db.query(`SELECT max((payload->'args'->0->>'nonce')::numeric) AS nonce FROM relay_jobs WHERE input_lane=$1 AND status='succeeded'`,[lane])).rows[0].nonce;
    const nonce=confirmed!==null && BigInt(confirmed)>BigInt(slot.nonce)?BigInt(confirmed):BigInt(slot.nonce);
    const inflight=rows.filter(r=>r.raw_tx),reserved=inflight.reduce((n,r)=>BigInt(r.payload.args[0].nonce)>n?BigInt(r.payload.args[0].nonce):n,nonce);
    const stream=lane+":"+slot.key.toLowerCase();
    const seq=(await d.db.query("SELECT sequence FROM input_streams WHERE id=$1",[stream])).rows[0]?.sequence||"0";
    return {nextNonce:reserved+1n,confirmedNonce:nonce,nextSequence:BigInt(seq)+1n,stream,rows};
  }
  const view=(row:any)=>({id:row.id,status:inputState(row.status),tx_hash:row.tx_hash,nonce:row.payload.args[0].nonce,direction:row.payload.args[0].direction,sequence:row.input_sequence,error:row.status==="failed"?row.error:undefined,reason:row.status==="superseded"?row.error:undefined});
  async function state(id:string,player:string) {
    const m=await d.read(BigInt(id)),slot=slotOf(m,player),lane=laneOf(id,player);
    return lock(lane,async()=>{const c=await cursor(lane,slot);return {nextNonce:c.nextNonce,nextSequence:c.nextSequence,confirmedNonce:c.confirmedNonce,key:slot.key,head:d.head(),pending:c.rows.map(view)};});
  }
  async function accept(payload:RelayRequest,envelope?:{sequence:unknown;signature:unknown}) {
    if(payload.contract!=="game" || payload.functionName!=="submitInput")throw new Error("Gameplay input only");
    if(payload.deployment && payload.deployment!==d.version)throw new Error("Only the active deployment accepts input");
    const input=inputSchema.parse(payload.args[0]) as GameInput,signature=signatureSchema.parse(payload.args[1]) as Hex;
    const m=await d.read(input.matchId),slot=slotOf(m,input.player),now=BigInt(Math.floor(Date.now()/1000)),head=d.head();
    if(m.status!==2 || BigInt(slot.expiry)<=now || Number(slot.remaining)<=0)throw new Error("Game session ended or expired. Restore it explicitly.");
    if(input.observedBlock>head || head>input.validUntilBlock || head-input.observedBlock>16n || input.validUntilBlock<input.observedBlock || input.validUntilBlock>input.observedBlock+16n)throw new Error("Input expired. Refresh and sign the current direction.");
    const signer=await recoverTypedDataAddress({domain:domain("PONG",d.deployment.chainId,d.deployment.game),types:inputTypes,primaryType:"Input",message:input,signature});
    if(signer.toLowerCase()!==slot.key.toLowerCase() || !await d.valid(input.player,signer))throw new Error("Invalid or revoked game session");
    let sequence=envelope?uint.parse(envelope.sequence):undefined;
    if(envelope){const signed=await recoverTypedDataAddress({domain:domain("PONGIT Input Transport",d.deployment.chainId,d.deployment.game),types:intentTypes,primaryType:"InputIntent",message:intentMessage(input,sequence!,d.deployment.chainId,d.deployment.game),signature:signatureSchema.parse(envelope.signature) as Hex});if(signed.toLowerCase()!==signer.toLowerCase())throw new Error("Invalid input sequence signature");}
    const lane=laneOf(String(input.matchId),input.player),normalized={...payload,deployment:d.version,args:[input,signature],value:"0"};
    const id=keccak256(toHex(json(normalized)));
    return lock(lane,async()=>{
      const c=await cursor(lane,slot),existing=(await d.db.query("SELECT * FROM relay_jobs WHERE id=$1",[id])).rows[0];
      if(existing)return {accepted:true,...view(existing),nextNonce:c.nextNonce,nextSequence:c.nextSequence};
      if((sequence!==undefined && sequence<c.nextSequence)||input.nonce!==c.nextNonce)return {accepted:false,status:"resync",nextNonce:c.nextNonce,nextSequence:c.nextSequence};
      sequence??=c.nextSequence;
      const db=await d.db.connect();let superseded:any[]=[];
      try {
        await db.query("BEGIN");
        superseded=(await db.query("UPDATE relay_jobs SET status='superseded',updated_at=now(),error='Replaced by a newer direction before signing' WHERE input_lane=$1 AND status='queued' AND raw_tx IS NULL RETURNING *",[lane])).rows;
        await db.query("INSERT INTO relay_jobs(id,payload,input_lane,input_sequence) VALUES($1,$2,$3,$4)",[id,json(normalized),lane,String(sequence)]);
        await db.query("INSERT INTO input_streams(id,sequence,job_id) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET sequence=excluded.sequence,job_id=excluded.job_id",[c.stream,String(sequence),id]);
        await db.query("COMMIT");
      }catch(e){await db.query("ROLLBACK");throw e;}finally{db.release();}
      for(const old of superseded)d.notify({type:"job",id:old.id,status:"superseded"});
      return {accepted:true,id,status:"accepted",nextNonce:c.nextNonce,nextSequence:sequence+1n};
    });
  }
  return {accept,state,lock};
}
